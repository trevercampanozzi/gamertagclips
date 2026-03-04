import { getStore } from "@netlify/blobs";
import crypto from "crypto";

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ipFromReq(req) {
  return req.headers.get("x-nf-client-connection-ip") || "0.0.0.0";
}

function stableHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const clipId = String(body.clipId || "").trim();
    const week = String(body.week || getWeekKey(new Date())).trim();

    if (!clipId) {
      return new Response(JSON.stringify({ error: "Missing clipId" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const store = getStore("gtc");

    // 1 vote per IP per clip per 12 hours
    const ip = ipFromReq(req);
    const voteLockKey = `v:${week}:${clipId}:${stableHash(ip)}`;

    const already = await store.get(voteLockKey);
    if (already) {
      return new Response(JSON.stringify({ ok: false, error: "Vote already counted recently. Try later." }), {
        status: 429,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // lock first
    await store.set(voteLockKey, "1", { ttl: 60 * 60 * 12 });

    // store votes per clip (prevents overwriting other clips’ votes)
    const votesKey = `votes:${week}:${clipId}`;
    const raw = await store.get(votesKey);
    const current = Number(raw || "0") || 0;
    const next = current + 1;

    await store.set(votesKey, String(next));

    return new Response(JSON.stringify({ ok: true, week, clipId, votes: next }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "vote-post failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
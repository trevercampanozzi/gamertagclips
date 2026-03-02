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
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0"
  );
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

    // Basic anti-bot: 1 vote per IP per clip per 12 hours
    const ip = ipFromReq(req);
    const voteKey = `v:${week}:${clipId}:${stableHash(ip)}`;

    const existing = await store.get(voteKey, { type: "json" });
    if (existing && existing.ts) {
      return new Response(JSON.stringify({ ok: false, error: "Vote already counted recently. Try later." }), {
        status: 429,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const clipsKey = `clips:${week}`;
    const clips = (await store.get(clipsKey, { type: "json" })) || [];

    const idx = clips.findIndex((c) => String(c.id) === clipId);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: "Clip not found for this week" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    clips[idx].votes = (clips[idx].votes || 0) + 1;
    clips[idx].lastVoteAt = new Date().toISOString();

    await store.set(clipsKey, clips, { type: "json" });

    await store.set(voteKey, { ts: Date.now() }, { type: "json", ttl: 60 * 60 * 12 });

    return new Response(JSON.stringify({ ok: true, week, clipId, votes: clips[idx].votes }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "vote-post failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

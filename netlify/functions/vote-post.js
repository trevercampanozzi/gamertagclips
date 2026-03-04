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

async function getJson(store, key, fallback) {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const clipId = String(body.clipId || "").trim();
    const week = String(body.week || "").trim(); // IMPORTANT: must be provided by client

    if (!clipId) {
      return new Response(JSON.stringify({ error: "Missing clipId" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    if (!week) {
      return new Response(JSON.stringify({ error: "Missing week" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const store = getStore("gtc");

    const ip = ipFromReq(req);
    const voteKey = `v:${week}:${clipId}:${stableHash(ip)}`;

    const already = await store.get(voteKey);
    if (already) {
      return new Response(JSON.stringify({ ok: false, error: "Vote already counted recently. Try later." }), {
        status: 429,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // lock first
    await store.set(voteKey, "1", { ttl: 60 * 60 * 12 });

    const clipsKey = `clips:${week}`;
    const clips = await getJson(store, clipsKey, []);

    const idx = clips.findIndex((c) => String(c.id) === clipId);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: "Clip not found for this week" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    clips[idx].votes = (clips[idx].votes || 0) + 1;
    clips[idx].lastVoteAt = new Date().toISOString();

    await store.set(clipsKey, JSON.stringify(clips));

    return new Response(JSON.stringify({ ok: true, week, clipId, votes: clips[idx].votes }), {
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
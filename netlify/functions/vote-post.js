// /netlify/functions/vote-post.js
import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  // hard lock voting outside open window
  if (!w.isOpen) {
    return json(403, { ok: false, error: "Voting is closed" });
  }

  const stateKey = `state:${w.week}`;
  const state = await store.get(stateKey, { type: "json" }).catch(() => null);
  if (state?.locked === true) {
    return json(403, { ok: false, error: "Voting is closed" });
  }

  let body = {};
  try { body = await req.json(); } catch {}

  const clipId = String(body.clipId || "").trim();
  if (!clipId) return json(400, { ok: false, error: "clipId required" });

  const key = `clips:${w.week}`;
  const clipsDoc = await store.get(key, { type: "json" }).catch(() => null);
  const clips = Array.isArray(clipsDoc?.clips) ? clipsDoc.clips : (Array.isArray(clipsDoc) ? clipsDoc : []);

  const idx = clips.findIndex((c) => String(c.id) === clipId);
  if (idx === -1) return json(404, { ok: false, error: "Clip not found" });

  // Simple per-IP limiter (same behavior as before, but reliable)
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const limitKey = `vote:${w.week}:${clipId}:${ip}`;
  const already = await store.get(limitKey, { type: "json" }).catch(() => null);
  if (already?.voted) {
    return json(429, { ok: false, error: "Vote already counted" });
  }

  // record vote limiter for 24h
  await store.set(limitKey, { voted: true, at: new Date().toISOString() }, { ttl: 60 * 60 * 24 });

  clips[idx].votes = Number(clips[idx].votes || 0) + 1;
  clips[idx].lastVoteAt = new Date().toISOString();

  await store.set(key, { clips }, { metadata: { updatedAt: new Date().toISOString() } });

  return json(200, { ok: true, votes: clips[idx].votes });
};
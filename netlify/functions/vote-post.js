import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readClips(store, key) {
  const raw = await store.get(key);
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.clips)) return parsed.clips;
    return [];
  } catch {
    return [];
  }
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  if (!w.isOpen) return json(403, { ok: false, error: "Voting is closed" });

  const stateKey = `state:${w.week}`;
  const stateRaw = await store.get(stateKey).catch(() => null);
  let state = null;
  try { state = stateRaw ? (typeof stateRaw === "string" ? JSON.parse(stateRaw) : stateRaw) : null; } catch {}
  if (state?.locked === true) return json(403, { ok: false, error: "Voting is closed" });

  let body = {};
  try { body = await req.json(); } catch {}

  const clipId = String(body.clipId || "").trim();
  if (!clipId) return json(400, { ok: false, error: "clipId required" });

  const key = `clips:${w.week}`;
  const clips = await readClips(store, key);

  const idx = clips.findIndex((c) => String(c.id) === clipId);
  if (idx === -1) return json(404, { ok: false, error: "Clip not found" });

  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const limitKey = `vote:${w.week}:${clipId}:${ip}`;
  const alreadyRaw = await store.get(limitKey).catch(() => null);
  let already = null;
  try { already = alreadyRaw ? (typeof alreadyRaw === "string" ? JSON.parse(alreadyRaw) : alreadyRaw) : null; } catch {}
  if (already?.voted) return json(429, { ok: false, error: "Vote already counted" });

  await store.set(limitKey, { voted: true, at: new Date().toISOString() }, { ttl: 60 * 60 * 24 });

  clips[idx].votes = Number(clips[idx].votes || 0) + 1;
  clips[idx].lastVoteAt = new Date().toISOString();

  await store.set(key, { clips }, { metadata: { updatedAt: new Date().toISOString() } });

  return json(200, { ok: true, votes: clips[idx].votes });
};
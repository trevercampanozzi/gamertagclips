import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

function getWeekStartISO(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const auth = requireAdmin(req);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });

  const store = getStore("gtc");

  let body = {};
  try { body = await req.json(); } catch {}

  const clipId = String(body.clipId || "").trim();
  if (!clipId) return json(400, { ok: false, error: "clipId required" });

  const week = String(body.week || getWeekStartISO());
  const key = `clips:${week}`;

  const existing = await store.get(key, { type: "json" }).catch(() => null);
  const clips = Array.isArray(existing?.clips) ? existing.clips : (Array.isArray(existing) ? existing : []);

  const before = clips.length;
  const afterClips = clips.filter(c => String(c.id) !== clipId);
  const removed = before - afterClips.length;

  // Save back (keep same shape your app expects: either {clips:[...]} or just [...])
  // We’ll store as {clips:[...]} to be explicit.
  await store.set(key, { clips: afterClips }, { metadata: { updatedAt: new Date().toISOString() } });

  return json(200, { ok: true, week, removed, before, after: afterClips.length, key });
};
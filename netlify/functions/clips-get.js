import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readClips(store, key) {
  // ✅ Always ask blobs for JSON when possible
  const val = await store.get(key, { type: "json" }).catch(() => null);
  if (!val) return [];

  // val could be: {clips:[...]} OR [...] depending on old/new writes
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.clips)) return val.clips;

  // fallback if something weird got stored
  try {
    if (typeof val === "string") {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.clips)) return parsed.clips;
    }
  } catch {}

  return [];
}

export default async () => {
  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  const clipsKey = `clips:${w.week}`;
  const stateKey = `state:${w.week}`;

  const clips = await readClips(store, clipsKey);

  const state = await store.get(stateKey, { type: "json" }).catch(() => null);
  const locked = state?.locked === true;

  return json(200, {
    ok: true,
    week: w.week,
    count: clips.length,
    clips,
    isOpen: w.isOpen,
    isClosed: w.isClosed,
    weekStartUtcMs: w.weekStartUtcMs,
    closeUtcMs: w.closeUtcMs,
    nextWeekStartUtcMs: w.nextWeekStartUtcMs,
    locked,
    winner: locked ? (state?.winner || null) : null,
    top3Final: locked ? (state?.top3 || []) : null,
    tieBreaker: "earliest submission",
  });
};
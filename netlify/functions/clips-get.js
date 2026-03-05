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

export default async () => {
  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  const clipsKey = `clips:${w.week}`;
  const stateKey = `state:${w.week}`;

  const clips = await readClips(store, clipsKey);

  const stateRaw = await store.get(stateKey).catch(() => null);
  let state = null;
  try { state = stateRaw ? (typeof stateRaw === "string" ? JSON.parse(stateRaw) : stateRaw) : null; } catch {}

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
    winner: locked ? (state.winner || null) : null,
    top3Final: locked ? (state.top3 || []) : null,
    tieBreaker: "earliest submission",
  });
};
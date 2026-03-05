// /netlify/functions/clips-get.js
import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async () => {
  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  const clipsKey = `clips:${w.week}`;
  const stateKey = `state:${w.week}`;

  const clipsDoc = await store.get(clipsKey, { type: "json" }).catch(() => null);
  const clips = Array.isArray(clipsDoc?.clips) ? clipsDoc.clips : (Array.isArray(clipsDoc) ? clipsDoc : []);

  const state = await store.get(stateKey, { type: "json" }).catch(() => null);
  const locked = state?.locked === true;

  return json(200, {
    ok: true,
    week: w.week,
    count: clips.length,
    clips,
    // competition state
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
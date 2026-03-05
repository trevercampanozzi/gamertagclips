// /netlify/functions/weekly-lock-scheduled.js
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

  // Only lock during the closed window (Sun 5pm -> Mon 3am)
  if (!w.isClosed) {
    return json(200, { ok: true, skipped: "not-in-closed-window", week: w.week });
  }

  const stateKey = `state:${w.week}`;
  const existingState = await store.get(stateKey, { type: "json" }).catch(() => null);
  if (existingState?.locked === true) {
    return json(200, { ok: true, skipped: "already-locked", week: w.week, winnerId: existingState.winnerId });
  }

  const clipsKey = `clips:${w.week}`;
  const clipsDoc = await store.get(clipsKey, { type: "json" }).catch(() => null);
  const clips = Array.isArray(clipsDoc?.clips) ? clipsDoc.clips : (Array.isArray(clipsDoc) ? clipsDoc : []);

  if (!clips.length) {
    await store.set(stateKey, {
      locked: true,
      lockedAt: new Date().toISOString(),
      week: w.week,
      winnerId: null,
      top3: [],
      reason: "no-clips",
    });
    return json(200, { ok: true, locked: true, week: w.week, reason: "no-clips" });
  }

  // Rank: votes DESC, tie-break submittedAt ASC (earliest submission wins tie)
  const ranked = [...clips].sort((a, b) => {
    const dv = Number(b.votes || 0) - Number(a.votes || 0);
    if (dv !== 0) return dv;
    return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
  });

  const top3 = ranked.slice(0, 3).map((c) => ({
    id: c.id,
    title: c.title || "",
    gamerTag: c.gamerTag || "",
    game: c.game || "",
    clipUrl: c.clipUrl || "",
    thumbUrl: c.thumbUrl || "",
    votes: Number(c.votes || 0),
    submittedAt: c.submittedAt || "",
  }));

  const winner = top3[0] || null;

  await store.set(stateKey, {
    locked: true,
    lockedAt: new Date().toISOString(),
    week: w.week,
    winnerId: winner ? winner.id : null,
    winner,
    top3,
    closeUtcMs: w.closeUtcMs,
    nextWeekStartUtcMs: w.nextWeekStartUtcMs,
    tieBreaker: "earliest-submission",
  });

  return json(200, { ok: true, locked: true, week: w.week, winnerId: winner?.id || null, top3Count: top3.length });
};
import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

function normalizeClips(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.clips)) return doc.clips;
  return [];
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getPreviousWeekKey(weekKey) {
  const d = new Date(weekKey);
  d.setUTCDate(d.getUTCDate() - 7);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async () => {

  try {

    const store = getStore("gtc");
    const w = getCompetitionWindow(new Date());

    if (!w.isClosed) {
      return json(200, {
        ok: true,
        skipped: "not-in-closed-window",
        week: w.week
      });
    }

    // lock the PREVIOUS competition week
    const targetWeek = getPreviousWeekKey(w.week);

    const stateKey = `state:${targetWeek}`;
    const clipsKey = `clips:${targetWeek}`;

    const existingState = await store
      .get(stateKey, { type: "json" })
      .catch(() => null);

    if (existingState?.locked === true) {
      return json(200, {
        ok: true,
        skipped: "already-locked",
        week: targetWeek,
        winnerId: existingState?.winnerId || null
      });
    }

    const clipsDoc = await store
      .get(clipsKey, { type: "json" })
      .catch(() => null);

    const clips = normalizeClips(clipsDoc);

    if (!clips.length) {

      const state = {
        locked: true,
        lockedAt: new Date().toISOString(),
        week: targetWeek,
        winnerId: null,
        winner: null,
        top3: [],
        reason: "no-clips"
      };

      await store.set(stateKey, state);

      return json(200, {
        ok: true,
        locked: true,
        week: targetWeek,
        reason: "no-clips"
      });

    }

    const normalized = clips.map((c) => ({
      ...c,
      votes: safeNumber(c.votes),
      submittedAt: c.submittedAt || ""
    }));

    const ranked = normalized.sort((a, b) => {

      const voteDiff = b.votes - a.votes;
      if (voteDiff !== 0) return voteDiff;

      return String(a.submittedAt).localeCompare(String(b.submittedAt));

    });

    const top3 = ranked.slice(0, 3).map((c) => ({
      id: c.id,
      title: c.title || "",
      gamerTag: c.gamerTag || "",
      game: c.game || "",
      clipUrl: c.clipUrl || "",
      thumbUrl: c.thumbUrl || "",
      votes: safeNumber(c.votes),
      submittedAt: c.submittedAt || ""
    }));

    const winner = top3.length ? top3[0] : null;

    const newState = {
      locked: true,
      lockedAt: new Date().toISOString(),
      week: targetWeek,
      winnerId: winner ? winner.id : null,
      winner: winner,
      top3: top3,
      tieBreaker: "earliest-submission"
    };

    await store.set(stateKey, newState);

    return json(200, {
      ok: true,
      locked: true,
      week: targetWeek,
      winnerId: winner?.id || null,
      totalClips: clips.length,
      top3Count: top3.length
    });

  } catch (err) {

    return json(500, {
      ok: false,
      error: "weekly-lock-failed",
      message: err?.message || "unknown-error"
    });

  }

};
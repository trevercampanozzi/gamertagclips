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

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeClips(val) {
  if (!val) return [];

  if (Array.isArray(val)) return val;

  if (val && Array.isArray(val.clips)) return val.clips;

  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.clips)) return parsed.clips;
    } catch {}
  }

  return [];
}

export default async () => {
  try {

    const store = getStore("gtc");
    const w = getCompetitionWindow(new Date());

    const clipsKey = `clips:${w.week}`;
    const stateKey = `state:${w.week}`;

    const raw = await store.get(clipsKey, { type: "json" }).catch(() => null);
    const clips = normalizeClips(raw);

    const state = await store.get(stateKey, { type: "json" }).catch(() => null);

    const locked = state?.locked === true;

    const normalized = clips.map((c) => ({
      ...c,
      votes: safeNumber(c.votes),
      submittedAt: c.submittedAt || ""
    }));

    // Ranking rule
    // votes DESC
    // submittedAt ASC
    const ranked = normalized.sort((a, b) => {

      const voteDiff = b.votes - a.votes;
      if (voteDiff !== 0) return voteDiff;

      return String(a.submittedAt).localeCompare(String(b.submittedAt));

    });

    return json(200, {
      ok: true,
      week: w.week,
      count: ranked.length,
      clips: ranked,
      isOpen: w.isOpen,
      isClosed: w.isClosed,
      weekStartUtcMs: w.weekStartUtcMs,
      closeUtcMs: w.closeUtcMs,
      nextWeekStartUtcMs: w.nextWeekStartUtcMs,
      locked,
      winner: locked ? (state?.winner || null) : null,
      top3Final: locked ? (state?.top3 || []) : null,
      tieBreaker: "votes desc, earliest submission wins tie"
    });

  } catch (err) {

    return json(500, {
      ok: false,
      error: "clips-get-failed",
      message: err?.message || "unknown-error"
    });

  }
};
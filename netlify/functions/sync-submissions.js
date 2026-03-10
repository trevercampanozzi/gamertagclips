import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function weekStartISO(weekKey) {
  return new Date(`${weekKey}T00:00:00.000Z`).toISOString();
}

function escTrim(v) {
  return String(v ?? "").trim();
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

async function getClipsDoc(store, key) {
  // robust read for legacy formats
  const val = await store.get(key, { type: "json" }).catch(() => null);
  if (!val) return { clips: [] };
  if (Array.isArray(val)) return { clips: val };
  if (val && Array.isArray(val.clips)) return { clips: val.clips };
  return { clips: [] };
}

function youtubeThumbFromUrl(clipUrl) {
  try {
    const u = new URL(clipUrl);
    let videoId = "";

    videoId = u.searchParams.get("v") || "";

    if (!videoId && u.hostname.includes("youtu.be")) {
      videoId = u.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (!videoId && u.pathname.includes("/shorts/")) {
      videoId = u.pathname.split("/shorts/")[1]?.split("/")[0]?.split("?")[0] || "";
    }

    if (!videoId) return "";
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return "";
  }
}

async function apiGet(path) {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) throw new Error("Missing NETLIFY_AUTH_TOKEN");

  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Netlify API ${res.status}: ${txt}`);
  }
  return res.json();
}

export default async (req) => {
  try {
    // auth (manual URL + auto-sync both use this)
    const adminKey = process.env.GTC_ADMIN_KEY;
    if (adminKey) {
      const url = new URL(req.url);
      const key = url.searchParams.get("key") || "";
      if (key !== adminKey) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
    }

    const siteId = process.env.NETLIFY_SITE_ID;
    if (!siteId) throw new Error("Missing NETLIFY_SITE_ID");

    // ✅ Competition window guard (CST/CDT)
    const w = getCompetitionWindow(new Date());
    if (!w.isOpen) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "competition-closed",
        week: w.week,
        closeUtcMs: w.closeUtcMs,
        nextWeekStartUtcMs: w.nextWeekStartUtcMs
      }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    const url = new URL(req.url);
    const requestedWeek = url.searchParams.get("week") || "";
    const week = requestedWeek || w.week;

    const store = getStore("gtc");
    const clipsKey = `clips:${week}`;

    // since aligned to competition start for current week
    const weekSinceISO = requestedWeek
      ? weekStartISO(week)
      : new Date(w.weekStartUtcMs).toISOString();

    const weekCutoffISO =
  (await store.get(`cutoff:${week}`, { type: "text" }).catch(() => "")) || "";

const globalCutoffISO =
  (await store.get(`global-cutoff`, { type: "text" }).catch(() => "")) || "";

let sinceISO = weekSinceISO;

if (globalCutoffISO && globalCutoffISO > sinceISO) {
  sinceISO = globalCutoffISO;
}
if (weekCutoffISO && weekCutoffISO > sinceISO) {
  sinceISO = weekCutoffISO;
}

    // Find the form by name
    const forms = await apiGet(`/sites/${siteId}/forms`);
    const form = forms.find(f => f.name === "clip-submissions");
    if (!form) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Form not found",
        detail: "No form named 'clip-submissions' found on this Netlify site.",
        foundForms: forms.map(f => f.name).slice(0, 50)
      }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    // ✅ Fetch verified + spam
    const verified = await apiGet(`/forms/${form.id}/submissions?per_page=100`);
    const spam = await apiGet(`/forms/${form.id}/submissions?per_page=100&state=spam`);
    const all = [...verified, ...spam];

    // Filter by sinceISO
    const weeklySubs = all.filter(s => {
      const created = new Date(s.created_at).toISOString();
      return created >= sinceISO;
    });

    // Existing clips (preserve votes + prevent re-adding same submission ID)
    const existingDoc = await getClipsDoc(store, clipsKey);
    const existingClips = existingDoc.clips || [];
    const byId = new Map(existingClips.map(c => [String(c.id), c]));

    let added = 0, updated = 0, skippedEmpty = 0, skippedAlreadySynced = 0;

    for (const s of weeklySubs) {
      const data = s.data || {};
      const clipUrl = escTrim(pick(data, ["clipUrl", "clip_url", "url", "link"]));
      if (!clipUrl) { skippedEmpty++; continue; }

      const id = String(s.id);
      if (byId.has(id)) { skippedAlreadySynced++; continue; }

      let thumbUrl = escTrim(pick(data, ["thumbUrl", "thumb_url", "thumbnail", "thumbnailUrl"]));
      const title = escTrim(pick(data, ["title", "clipTitle", "clip_title"]));
      const gamerTag = escTrim(pick(data, ["gamerTag", "gamertag", "gamer_tag"]));
      const game = escTrim(pick(data, ["game", "gameTitle", "game_title"]));

      if (!thumbUrl && (clipUrl.includes("youtube") || clipUrl.includes("youtu.be"))) {
        thumbUrl = youtubeThumbFromUrl(clipUrl);
      }

      const newClip = {
        id,
        title: title || "Submitted Clip",
        gamerTag,
        game,
        clipUrl,
        thumbUrl,
        votes: 0,
        submittedAt: s.created_at
      };

      byId.set(id, newClip);
      added++;
    }

    // Sort newest first
    const merged = Array.from(byId.values());
    merged.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    // ✅ IMPORTANT: persist correctly
    await store.setJSON(clipsKey, { clips: merged }, { metadata: { updatedAt: new Date().toISOString() } });

    return new Response(JSON.stringify({
      ok: true,
      week,
      form: { id: form.id, name: form.name },
      since: sinceISO,
      verifiedFetched: verified.length,
      spamFetched: spam.length,
      submissionsThisWeek: weeklySubs.length,
      clipsBefore: existingClips.length,
      clipsAfter: merged.length,
      added,
      updated,
      skippedEmpty,
      skippedAlreadySynced
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "sync failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

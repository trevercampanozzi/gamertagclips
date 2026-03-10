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

function validateClipUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("tiktok.com") ||
      host.includes("twitch.tv") ||
      host.includes("clips.twitch.tv")
    );
  } catch {
    return false;
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

    const w = getCompetitionWindow(new Date());

    if (!w.isOpen) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "competition-closed",
        week: w.week
      }), { status: 200 });
    }

    const url = new URL(req.url);
    const requestedWeek = url.searchParams.get("week") || "";
    const week = requestedWeek || w.week;

    const store = getStore("gtc");
    const clipsKey = `clips:${week}`;

    const weekSinceISO = requestedWeek
      ? weekStartISO(week)
      : new Date(w.weekStartUtcMs).toISOString();

    const existingDoc = await getClipsDoc(store, clipsKey);
    const existingClips = existingDoc.clips || [];

    const byId = new Map(existingClips.map(c => [String(c.id), c]));
    const existingUrls = new Set(existingClips.map(c => (c.clipUrl || "").trim()));

    // IP submission counter
    const ipCounts = {};

    for (const clip of existingClips) {
      if (!clip.ip) continue;
      ipCounts[clip.ip] = (ipCounts[clip.ip] || 0) + 1;
    }

    const forms = await apiGet(`/sites/${siteId}/forms`);
    const form = forms.find(f => f.name === "clip-submissions");

    const verified = await apiGet(`/forms/${form.id}/submissions?per_page=100`);
    const spam = await apiGet(`/forms/${form.id}/submissions?per_page=100&state=spam`);
    const all = [...verified, ...spam];

    const weeklySubs = all.filter(s => {
      const created = new Date(s.created_at).toISOString();
      return created >= weekSinceISO;
    });

    let added = 0;

    for (const s of weeklySubs) {

      const data = s.data || {};
      const clipUrl = escTrim(pick(data, ["clipUrl", "clip_url", "url", "link"]));

      if (!clipUrl) continue;
      if (!validateClipUrl(clipUrl)) continue;
      if (existingUrls.has(clipUrl)) continue;

      const id = String(s.id);
      if (byId.has(id)) continue;

      const ip =
        s.ip ||
        s.ip_address ||
        "unknown";

      ipCounts[ip] = (ipCounts[ip] || 0);

      if (ipCounts[ip] >= 3) {
        continue;
      }

      ipCounts[ip]++;

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
        ip,
        submittedAt: s.created_at
      };

      byId.set(id, newClip);
      existingUrls.add(clipUrl);
      added++;

    }

    const merged = Array.from(byId.values());

    merged.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    await store.setJSON(clipsKey, { clips: merged });

    return new Response(JSON.stringify({
      ok: true,
      week,
      clipsAfter: merged.length,
      added
    }));

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: "sync failed",
      detail: String(err)
    }), { status: 500 });
  }
};

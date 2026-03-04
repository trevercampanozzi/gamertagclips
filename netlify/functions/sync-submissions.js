import { getStore } from "@netlify/blobs";

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

async function getJson(store, key, fallback) {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeClipUrl(raw) {
  const clipUrl = escTrim(raw);
  if (!clipUrl) return "";

  try {
    const u = new URL(clipUrl);

    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);

    // normalize youtube tracking params that cause "duplicates"
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      u.searchParams.delete("si");
      u.searchParams.delete("feature");
    }

    u.hostname = host;

    const s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch {
    return clipUrl;
  }
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

    const url = new URL(req.url);
    const week = url.searchParams.get("week") || getWeekKey(new Date());

    const store = getStore("gtc");
    const clipsKey = `clips:${week}`;

    const weekSinceISO = weekStartISO(week);
    const cutoffISO = (await store.get(`cutoff:${week}`)) || "";
    const sinceISO = cutoffISO && cutoffISO > weekSinceISO ? cutoffISO : weekSinceISO;

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

    // Fetch verified + spam submissions
    const verified = await apiGet(`/forms/${form.id}/submissions?per_page=100`);
    const spam = await apiGet(`/forms/${form.id}/submissions?per_page=100&state=spam`);
    const all = [...verified, ...spam];

    // Filter by effective sinceISO
    const weeklySubs = all.filter(s => {
      const created = new Date(s.created_at).toISOString();
      return created >= sinceISO;
    });

    // Existing clips (used for dedupe + vote preservation)
    const existing = await getJson(store, clipsKey, []);
    const existingUrlSet = new Set(
      existing.map(c => normalizeClipUrl(c.clipUrl || "")).filter(Boolean)
    );

    // ✅ Dedupe within this fetch batch too
    const batchUrlSet = new Set();

    const mapped = weeklySubs.map((s) => {
      const data = s.data || {};

      const clipUrlRaw = pick(data, ["clipUrl", "clip_url", "url", "link"]);
      const clipUrl = normalizeClipUrl(clipUrlRaw);

      // skip empty links
      if (!clipUrl) return null;

      // skip duplicates already in the store
      if (existingUrlSet.has(clipUrl)) return null;

      // skip duplicates inside this fetch batch
      if (batchUrlSet.has(clipUrl)) return null;
      batchUrlSet.add(clipUrl);

      let thumbUrl = escTrim(pick(data, ["thumbUrl", "thumb_url", "thumbnail", "thumbnailUrl"]));
      const title = escTrim(pick(data, ["title", "clipTitle", "clip_title"]));
      const gamerTag = escTrim(pick(data, ["gamerTag", "gamertag", "gamer_tag"]));
      const game = escTrim(pick(data, ["game", "gameTitle", "game_title"]));

      if (!thumbUrl && (clipUrl.includes("youtube.com") || clipUrl.includes("youtu.be"))) {
        thumbUrl = youtubeThumbFromUrl(clipUrl);
      }

      return {
        id: s.id,
        title: title || "Submitted Clip",
        gamerTag,
        game,
        clipUrl,
        thumbUrl,
        votes: 0,
        submittedAt: s.created_at
      };
    }).filter(Boolean);

    // Merge into existing (preserve votes)
    const byId = new Map(existing.map(c => [String(c.id), c]));

    let added = 0, updated = 0;
    let skippedEmpty = 0, skippedDuplicates = 0;

    for (const s of weeklySubs) {
      const data = s.data || {};
      const clipUrlRaw = pick(data, ["clipUrl", "clip_url", "url", "link"]);
      const clipUrl = normalizeClipUrl(clipUrlRaw);

      if (!clipUrl) skippedEmpty++;
      else if (existingUrlSet.has(clipUrl)) skippedDuplicates++;
    }

    for (const c of mapped) {
      const id = String(c.id);
      if (byId.has(id)) {
        const prev = byId.get(id);
        byId.set(id, { ...prev, ...c, votes: prev.votes ?? 0, lastVoteAt: prev.lastVoteAt });
        updated++;
      } else {
        byId.set(id, c);
        added++;
      }
    }

    const merged = Array.from(byId.values());
    merged.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    await store.set(clipsKey, JSON.stringify(merged));

    return new Response(JSON.stringify({
      ok: true,
      week,
      form: { id: form.id, name: form.name },
      since: sinceISO,
      verifiedFetched: verified.length,
      spamFetched: spam.length,
      submissionsThisWeek: weeklySubs.length,
      clipsBefore: existing.length,
      clipsAfter: merged.length,
      added,
      updated,
      skippedEmpty,
      skippedDuplicates
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

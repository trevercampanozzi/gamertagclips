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
    const sinceISO = weekStartISO(week);

    const forms = await apiGet(`/sites/${siteId}/forms`);
    const form = forms.find(f => f.name === "clip-submissions");

    if (!form) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Form not found",
        foundForms: forms.map(f => f.name)
      }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    const submissions = await apiGet(`/forms/${form.id}/submissions?per_page=100`);

    const weeklySubs = submissions.filter(s => {
      const created = new Date(s.created_at).toISOString();
      return created >= sinceISO;
    });

    const mapped = weeklySubs.map((s) => {
      const data = s.data || {};

      const clipUrl = escTrim(pick(data, ["clipUrl", "clip_url", "url", "link"]));
      let thumbUrl = escTrim(pick(data, ["thumbUrl", "thumb_url", "thumbnail", "thumbnailUrl"]));
      const title = escTrim(pick(data, ["title", "clipTitle", "clip_title"]));
      const gamerTag = escTrim(pick(data, ["gamerTag", "gamertag", "gamer_tag"]));
      const game = escTrim(pick(data, ["game", "gameTitle", "game_title"]));

      // Auto-generate YouTube thumbnail if none provided
      if (!thumbUrl && clipUrl.includes("youtube")) {
        try {
          const urlObj = new URL(clipUrl);
          const videoId = urlObj.searchParams.get("v");
          if (videoId) {
            thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }
        } catch {}
      }

      return {
  id: s.id,
  title: title || "Submitted Clip",
  gamerTag,
  game,
  clipUrl,
  thumbUrl,
  debugData: data,
  votes: 0,
  submittedAt: s.created_at
};
    });

    const store = getStore("gtc");
    const clipsKey = `clips:${week}`;
    const existing = await getJson(store, clipsKey, []);

    const byId = new Map(existing.map(c => [String(c.id), c]));

    let added = 0;
    let updated = 0;

    for (const c of mapped) {
      const id = String(c.id);
      if (byId.has(id)) {
        const prev = byId.get(id);
        byId.set(id, {
          ...prev,
          ...c,
          votes: prev.votes ?? 0,
          lastVoteAt: prev.lastVoteAt
        });
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
      submissionsFetched: submissions.length,
      submissionsThisWeek: weeklySubs.length,
      clipsBefore: existing.length,
      clipsAfter: merged.length,
      added,
      updated
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: "sync failed",
      detail: String(err)
    }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

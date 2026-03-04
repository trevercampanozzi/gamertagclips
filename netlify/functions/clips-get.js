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

async function getJson(store, key, fallback) {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    await store.set(key, JSON.stringify(fallback));
    return fallback;
  }
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const week = url.searchParams.get("week") || getWeekKey(new Date());

    const store = getStore("gtc");
    const clips = await getJson(store, `clips:${week}`, []);

    // attach per-clip votes (fallback to embedded votes if present)
    const withVotes = await Promise.all(
      clips.map(async (c) => {
        const clipId = String(c.id);
        const raw = await store.get(`votes:${week}:${clipId}`);
        const votes = raw !== null && raw !== undefined && raw !== ""
          ? (Number(raw) || 0)
          : (Number(c.votes) || 0);
        return { ...c, votes };
      })
    );

    withVotes.sort((a, b) => (b.votes || 0) - (a.votes || 0));

    return new Response(JSON.stringify({ week, count: withVotes.length, clips: withVotes }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "clips-get failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
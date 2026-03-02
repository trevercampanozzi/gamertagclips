import { getStore } from "@netlify/blobs";

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday => 7
  d.setUTCDate(d.getUTCDate() - (day - 1)); // back to Monday
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const week = url.searchParams.get("week") || getWeekKey(new Date());

    const store = getStore("gtc");
    const clips = (await store.get(`clips:${week}`, { type: "json" })) || [];

    clips.sort((a, b) => (b.votes || 0) - (a.votes || 0));

    return new Response(JSON.stringify({ week, count: clips.length, clips }), {
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

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

export default async () => {
  const store = getStore("gtc");
  const week = getWeekKey();
  await store.set(`clips:${week}`, JSON.stringify([]));
  return new Response(JSON.stringify({ ok: true, week, reset: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

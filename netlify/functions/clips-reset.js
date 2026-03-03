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

export default async (req) => {
  try {
    // Require admin key (same pattern as sync-submissions)
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

    const store = getStore("gtc");
    const week = getWeekKey();

    // Wipe the week's clips completely
    await store.set(`clips:${week}`, JSON.stringify([]));

    // Set cutoff so sync only imports submissions AFTER this reset moment
    const cutoffISO = new Date().toISOString();
    await store.set(`cutoff:${week}`, cutoffISO);

    return new Response(JSON.stringify({ ok: true, week, reset: true, cutoffISO }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "reset failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

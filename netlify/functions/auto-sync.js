export const config = { schedule: "@every 1m" };

export default async (req) => {
  try {
    const baseUrl =
      process.env.DEPLOY_PRIME_URL ||
      process.env.URL ||
      process.env.SITE_URL;

    const key = process.env.GTC_ADMIN_KEY;

    if (!baseUrl) {
      return new Response(JSON.stringify({ ok: false, error: "Missing DEPLOY_PRIME_URL/URL/SITE_URL" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "Missing GTC_ADMIN_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const target = `${baseUrl}/.netlify/functions/sync-submissions?key=${encodeURIComponent(key)}`;

    const res = await fetch(target, { headers: { "cache-control": "no-store" } });
    const text = await res.text();

    return new Response(JSON.stringify({
      ok: res.ok,
      status: res.status,
      called: target,
      detail: text.slice(0, 2000)
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "auto-sync failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

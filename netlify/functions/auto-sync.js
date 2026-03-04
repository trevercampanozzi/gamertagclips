export const config = { schedule: "@every 1m" };

export default async () => {
  const baseUrl = process.env.URL;
  const key = process.env.GTC_ADMIN_KEY;

  if (!baseUrl) {
    return new Response(JSON.stringify({ ok: false, error: "Missing process.env.URL" }), {
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

  const url = `${baseUrl}/.netlify/functions/sync-submissions?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, { headers: { "cache-control": "no-store" } });
  const text = await res.text();

  return new Response(JSON.stringify({
    ok: res.ok,
    status: res.status,
    detail: text.slice(0, 2000)
  }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
};

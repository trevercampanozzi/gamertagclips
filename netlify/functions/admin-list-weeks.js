import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

export default async (req) => {
  if (req.method !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const auth = requireAdmin(req);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });

  const store = getStore("gtc");
  const listed = await store.list().catch(() => ({ blobs: [] }));
  const keys = (listed?.blobs || []).map(b => b.key).filter(k => String(k).startsWith("clips:"));

  // sort newest week first (keys are clips:YYYY-MM-DD)
  keys.sort((a,b) => String(b).localeCompare(String(a)));

  return json(200, { ok: true, count: keys.length, keys });
};
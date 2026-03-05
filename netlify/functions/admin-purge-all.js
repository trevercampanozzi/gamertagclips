import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const auth = requireAdmin(req);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });

  const store = getStore("gtc");
  const listed = await store.list().catch(() => ({ blobs: [] }));
  const blobs = listed?.blobs || [];

  let deleted = 0;
  for (const b of blobs) {
    if (String(b.key).startsWith("clips:")) {
      await store.delete(b.key);
      deleted++;
    }
  }

  return json(200, { ok: true, deleted });
};
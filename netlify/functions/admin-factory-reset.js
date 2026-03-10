import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

async function deleteKeysWithPrefix(store, prefix) {
  let deleted = [];
  let cursor;

  do {
    const page = await store.list({ prefix, cursor }).catch(() => ({ blobs: [] }));
    const blobs = page?.blobs || [];

    for (const b of blobs) {
      if (b?.key) {
        await store.delete(b.key).catch(() => {});
        deleted.push(b.key);
      }
    }

    cursor = page?.cursor || page?.next_cursor || null;
  } while (cursor);

  return deleted;
}

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return json(401, { ok: false, error: auth.error });
  }

  let body = {};
  try { body = await req.json(); } catch {}

  const confirmText = String(body.confirmText || "").trim();
  if (confirmText !== "RESET ALL DATA") {
    return json(400, { ok: false, error: 'Type "RESET ALL DATA" exactly to continue' });
  }

  const store = getStore("gtc");
  const nowIso = new Date().toISOString();
  let deletedKeys = [];

  const prefixes = [
    "clips:",
    "state:",
    "winner:",
    "top3:",
    "vote:",
    "vote-ip:",
    "vote-token:",
    "vote-attempt:"
  ];

  for (const prefix of prefixes) {
    const keys = await deleteKeysWithPrefix(store, prefix);
    deletedKeys.push(...keys);
  }

  // IMPORTANT: do NOT delete cutoffs — move them forward instead
  await store.set("global-cutoff", nowIso);

  return json(200, {
    ok: true,
    deleted: deletedKeys.length,
    globalCutoffSetTo: nowIso,
    deletedKeys
  });
};

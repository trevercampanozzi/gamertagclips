import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

function getWeekStartISO(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

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

  const store = getStore("gtc");
  const week = getWeekStartISO();
  const nowIso = new Date().toISOString();

  const deletedKeys = [];

  const directKeys = [
    `clips:${week}`,
    `state:${week}`,
    `winner:${week}`,
    `top3:${week}`
  ];

  for (const key of directKeys) {
    await store.delete(key).catch(() => {});
    deletedKeys.push(key);
  }

  // delete all vote locks / attempt locks for this week
  const prefixDeletes = [
    `vote:${week}:`,
    `vote-ip:${week}:`,
    `vote-token:${week}:`,
    `vote-attempt:${week}:`
  ];

  for (const prefix of prefixDeletes) {
    const keys = await deleteKeysWithPrefix(store, prefix);
    deletedKeys.push(...keys);
  }

  // IMPORTANT: move sync baseline forward so old submissions do not come back
  await store.set(`cutoff:${week}`, nowIso);

  return json(200, {
    ok: true,
    week,
    cutoffSetTo: nowIso,
    deletedCount: deletedKeys.length,
    deletedKeys
  });
};

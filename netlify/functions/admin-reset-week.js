import { getStore } from "@netlify/blobs";
import { json, requireAdmin } from "./_admin-auth.js";

function getWeekStartISO(d = new Date()) {
  // Monday-based week start
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const auth = requireAdmin(req);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });

  const store = getStore("gtc");

  let body = {};
  try { body = await req.json(); } catch {}

  const week = String(body.week || getWeekStartISO());
  const key = `clips:${week}`;

  await store.delete(key);

  return json(200, { ok: true, deletedKey: key });
};
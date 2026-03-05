import { json, getAdminPassword, getTokenSecret, signToken } from "./_admin-auth.js";

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const ADMIN_PASSWORD = getAdminPassword();
  const SECRET = getTokenSecret();
  if (!ADMIN_PASSWORD) return json(500, { ok: false, error: "Missing ADMIN_PASSWORD env var" });
  if (!SECRET) return json(500, { ok: false, error: "Missing ADMIN_TOKEN_SECRET env var" });

  let body = {};
  try { body = await req.json(); } catch {}

  const pw = String(body.password || "");
  if (pw !== ADMIN_PASSWORD) return json(401, { ok: false, error: "Invalid password" });

  // 12-hour token
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const token = signToken({ exp }, SECRET);

  return json(200, { ok: true, token, exp });
};
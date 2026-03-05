import crypto from "crypto";

export function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function getEnv(name) {
  const v = process.env[name];
  return (v == null || String(v).trim() === "") ? null : String(v);
}

export function getBearerToken(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

export function signToken(payloadObj, secret) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return obj;
  } catch {
    return null;
  }
}

export function requireAdmin(req) {
  const secret = getEnv("ADMIN_TOKEN_SECRET");
  if (!secret) return { ok: false, error: "Missing ADMIN_TOKEN_SECRET env var" };

  const token = getBearerToken(req);
  const payload = verifyToken(token, secret);
  if (!payload) return { ok: false, error: "Unauthorized" };

  const now = Date.now();
  const expMs = Number(payload.exp || 0);
  if (!expMs || now > expMs) return { ok: false, error: "Session expired" };

  return { ok: true, payload };
}

export function getAdminPassword() {
  return getEnv("ADMIN_PASSWORD");
}

export function getTokenSecret() {
  return getEnv("ADMIN_TOKEN_SECRET");
}
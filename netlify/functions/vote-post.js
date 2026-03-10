import { getStore } from "@netlify/blobs";
import { getCompetitionWindow } from "./_week.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

async function readClipsDoc(store, key) {
  const val = await store.get(key, { type: "json" }).catch(() => null);
  if (!val) return { clips: [] };
  if (Array.isArray(val)) return { clips: val };
  if (val && Array.isArray(val.clips)) return { clips: val.clips };
  return { clips: [] };
}

function getIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function getToken(req) {
  return req.headers.get("x-gtc-voter") || null;
}

function generateToken() {
  return crypto.randomUUID();
}

export default async (req) => {

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const store = getStore("gtc");
  const w = getCompetitionWindow(new Date());

  if (!w.isOpen) {
    return json(403, { ok: false, error: "Voting is closed" });
  }

  const stateKey = `state:${w.week}`;
  const state = await store.get(stateKey, { type: "json" }).catch(() => null);

  if (state?.locked === true) {
    return json(403, { ok: false, error: "Voting is closed" });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid request body" });
  }

  const clipId = String(body.clipId || "").trim();
  if (!clipId) {
    return json(400, { ok: false, error: "clipId required" });
  }

  const key = `clips:${w.week}`;
  const doc = await readClipsDoc(store, key);
  const clips = doc.clips || [];

  const idx = clips.findIndex(c => String(c.id) === clipId);
  if (idx === -1) {
    return json(404, { ok: false, error: "Clip not found" });
  }

  const ip = getIp(req);
  const token = getToken(req);

  const ipKey = `vote-ip:${w.week}:${ip}`;
  const tokenKey = token ? `vote-token:${w.week}:${token}` : null;

  const existingIpVote = await store.get(ipKey, { type: "json" }).catch(() => null);
  if (existingIpVote?.voted) {
    return json(429, { ok: false, error: "You already voted this week" });
  }

  if (tokenKey) {
    const existingTokenVote = await store.get(tokenKey, { type: "json" }).catch(() => null);
    if (existingTokenVote?.voted) {
      return json(429, { ok: false, error: "You already voted this week" });
    }
  }

  const voteTime = new Date().toISOString();

  await store.setJSON(ipKey, { voted: true, at: voteTime });

  const newToken = token || generateToken();

  await store.setJSON(`vote-token:${w.week}:${newToken}`, {
    voted: true,
    at: voteTime
  });

  clips[idx].votes = Number(clips[idx].votes || 0) + 1;
  clips[idx].lastVoteAt = voteTime;

  await store.setJSON(key, { clips });

  return json(200, {
    ok: true,
    votes: clips[idx].votes,
    token: newToken
  });

};

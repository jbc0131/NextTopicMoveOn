// api/warcraftlogs.js
// Vercel serverless function — proxies WarcraftLogs GraphQL API
// Keeps client_secret off the browser entirely.
//
// Usage: POST /api/warcraftlogs
// Body:  { "players": [{ "name": "Bloodfang", "role": "DPS" }, ...] }
// Returns: { "Bloodfang": { kara: 87.3, gruulMags: 72.1 }, ... }

const WCL_TOKEN_URL = "https://fresh.warcraftlogs.com/oauth/token";
const WCL_API_URL   = "https://fresh.warcraftlogs.com/api/v2/client";
const SERVER_SLUG   = "dreamscythe";
const SERVER_REGION = "us";

// Zone IDs on fresh.warcraftlogs.com (TBC Anniversary)
const ZONE_KARA      = 1047; // Karazhan
const ZONE_GRUULMAGS = 1048; // Gruul's Lair + Magtheridon

// Server-side cache: shared across all requests within the same serverless instance.
// Key = sorted player names, Value = { result, fetchedAt }
const SERVER_CACHE     = new Map();
const SERVER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Token is cached for the lifetime of this serverless instance
let cachedToken     = null;
let tokenExpiresAt  = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId     = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("WCL_CLIENT_ID and WCL_CLIENT_SECRET env vars are required");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(WCL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// GraphQL field names can't start with numbers or have special chars
function sanitizeName(name) {
  return "char_" + name.replace(/[^a-zA-Z0-9]/g, "_");
}

// Build a single GraphQL query for one character with their correct role
function buildQuery({ name, role }) {
  const wclRole = role === "Healer" ? "Healer" : role === "Tank" ? "Tank" : "DPS";
  return `
    ${sanitizeName(name)}: characterData {
      character(name: "${name}", serverSlug: "${SERVER_SLUG}", serverRegion: "${SERVER_REGION}") {
        name
        kara: zoneRankings(zoneID: ${ZONE_KARA}, role: ${wclRole})
        gruulMags: zoneRankings(zoneID: ${ZONE_GRUULMAGS}, role: ${wclRole})
      }
    }
  `;
}

async function queryWCL(players, token) {
  const query = `{ ${players.map(buildQuery).join("\n")} }`;

  const res = await fetch(WCL_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL API error: ${res.status} ${text}`);
  }

  return res.json();
}

function extractScore(zoneData) {
  if (!zoneData) return null;
  const val = zoneData.medianPerformanceAverage;
  if (val == null) return null;
  return Math.round(val * 10) / 10;
}

// Build a cache key from sorted player names + roles
function buildCacheKey(players) {
  return players
    .map(p => `${p.name}:${p.role || "DPS"}`)
    .sort()
    .join("|");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { names, players: playersInput } = req.body;

  // Support both old { names: [] } and new { players: [{name, role}] } formats
  const players = playersInput
    ? playersInput
    : (Array.isArray(names) ? names.map(n => ({ name: n, role: "DPS" })) : null);

  if (!players || players.length === 0) {
    return res.status(400).json({ error: "players array required" });
  }

  // Cap at 100 per request
  const batch = players.slice(0, 100);

  // Check server-side cache first
  const cacheKey = buildCacheKey(batch);
  const cached = SERVER_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.fetchedAt) < SERVER_CACHE_TTL) {
    return res.status(200).json(cached.result);
  }

  try {
    const token = await getAccessToken();
    const data  = await queryWCL(batch, token);

    if (data.errors) {
      console.error("WCL GraphQL errors:", JSON.stringify(data.errors));
    }

    const result = {};
    for (const player of batch) {
      const alias    = sanitizeName(player.name);
      const charData = data?.data?.[alias]?.character;

      result[player.name] = {
        kara:      extractScore(charData?.kara),
        gruulMags: extractScore(charData?.gruulMags),
        found:     !!charData,
      };
    }

    // Store in server-side cache
    SERVER_CACHE.set(cacheKey, { result, fetchedAt: Date.now() });

    // Evict old entries to prevent unbounded growth
    if (SERVER_CACHE.size > 50) {
      const now = Date.now();
      for (const [key, val] of SERVER_CACHE) {
        if (now - val.fetchedAt > SERVER_CACHE_TTL) SERVER_CACHE.delete(key);
      }
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error("WCL proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

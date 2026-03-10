// api/warcraftlogs.js
// Vercel serverless function — proxies WarcraftLogs GraphQL API
// Keeps client_secret off the browser entirely.
//
// Usage: POST /api/warcraftlogs
// Body:  { "names": ["Bloodfang", "Jipal", ...] }
// Returns: { "Bloodfang": { kara: 87.3, gruulMags: 72.1 }, ... }

const WCL_TOKEN_URL = "https://fresh.warcraftlogs.com/oauth/token";
const WCL_API_URL   = "https://fresh.warcraftlogs.com/api/v2/client";
const SERVER_SLUG   = "dreamscythe";
const SERVER_REGION = "us";

// Zone IDs on fresh.warcraftlogs.com (TBC Anniversary)
const ZONE_KARA      = 1047; // Karazhan
const ZONE_GRUULMAGS = 1048; // Gruul's Lair + Magtheridon

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
  // Expire 5 min early to be safe
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// Build a single GraphQL query that fetches all zones for one character, filtered by role
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

// GraphQL field names can't start with numbers or have special chars
function sanitizeName(name) {
  return "char_" + name.replace(/[^a-zA-Z0-9]/g, "_");
}

async function queryWCL(names, token) {
  // Batch all characters into a single GraphQL query
  const query = `{ ${names.map(buildQuery).join("\n")} }`;

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
  // zoneRankings returns a JSON blob — medianPerformanceAverage is what
  // the fresh.warcraftlogs.com character pages display
  if (!zoneData) return null;
  const val = zoneData.medianPerformanceAverage;
  if (val == null) return null;
  return Math.round(val * 10) / 10; // round to 1 decimal place
}

export default async function handler(req, res) {
  // CORS — allow your Vercel app to call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { names, players: playersInput } = req.body;

  // Support both old { names: [] } and new { players: [{name, role}] } formats
  const players = playersInput
    ? playersInput.slice(0, 100)
    : (Array.isArray(names) ? names.map(n => ({ name: n, role: "DPS" })) : null);

  if (!players || players.length === 0) {
    return res.status(400).json({ error: "players array required" });
  }

  // Cap at 100 names per request to avoid huge queries
  const batch = players.slice(0, 100);

  try {
    const token  = await getAccessToken();
    const data   = await queryWCL(batch, token);

    if (data.errors) {
      console.error("WCL GraphQL errors:", data.errors);
    }

    // Transform the aliased response back into { characterName: { kara, gruulMags } }
    const result = {};
    for (const player of batch) {
      const name      = player.name;
      const alias     = sanitizeName(name);
      const charData  = data?.data?.[alias]?.character;

      result[name] = {
        kara:      extractScore(charData?.kara),
        gruulMags: extractScore(charData?.gruulMags),
        found:     !!charData,
      };
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error("WCL proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

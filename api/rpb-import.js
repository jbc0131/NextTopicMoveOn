const BASE_URL = "https://classic.warcraftlogs.com/v1";

const PLAYER_TYPES = new Set([
  "Warrior", "Paladin", "Hunter", "Rogue", "Priest",
  "Shaman", "Mage", "Warlock", "Druid",
]);

function parseReportId(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  const match = trimmed.match(/warcraftlogs\.com\/reports\/([^?#/]+)/i);
  return match ? match[1] : trimmed;
}

async function wclFetch(path, params = {}) {
  const apiKey = process.env.WCL_API_KEY;
  if (!apiKey) throw new Error("WCL_API_KEY env var is required");

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("translate", "true");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`WCL v1 ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function getTrackedCastCount(entry) {
  if (!entry) return 0;
  if (typeof entry.total === "number") return entry.total;
  if (Array.isArray(entry.abilities)) {
    return entry.abilities.reduce((sum, ability) => sum + (ability.total || ability.totalUses || 0), 0);
  }
  return 0;
}

function getDeathCount(entry) {
  if (!entry) return 0;
  if (typeof entry.deaths === "number") return entry.deaths;
  if (typeof entry.total === "number") return entry.total;
  if (Array.isArray(entry.events)) return entry.events.length;
  return 0;
}

function getHostileDamage(entry) {
  if (!entry) return 0;
  if (typeof entry.total === "number") return entry.total;
  return 0;
}

function getDurationMs(startTime, endTime) {
  if (typeof startTime !== "number" || typeof endTime !== "number") return 0;
  return Math.max(0, endTime - startTime);
}

function makeRaidId(reportId, start, end) {
  return `${reportId}-${start || 0}-${end || 0}`;
}

function buildLookup(items = []) {
  const byId = new Map();
  const byName = new Map();

  for (const item of items) {
    if (item?.id != null) byId.set(String(item.id), item);
    if (item?.name) byName.set(item.name, item);
  }

  return { byId, byName };
}

function normalizeFight(fight) {
  const startTime = fight.start_time ?? 0;
  const endTime = fight.end_time ?? 0;

  return {
    id: String(fight.id),
    encounterId: fight.boss || 0,
    name: fight.name || "Unknown Fight",
    zoneName: fight.zoneName || "",
    startTime,
    endTime,
    durationMs: getDurationMs(startTime, endTime),
    kill: !!fight.kill,
    difficulty: fight.difficulty ?? null,
    wipe: fight.kill === false,
  };
}

function normalizePlayer(friendly, lookups) {
  const summary = lookups.summary.byId.get(String(friendly.id)) || lookups.summary.byName.get(friendly.name) || null;
  const deaths = lookups.deaths.byId.get(String(friendly.id)) || lookups.deaths.byName.get(friendly.name) || null;
  const tracked = lookups.tracked.byId.get(String(friendly.id)) || lookups.tracked.byName.get(friendly.name) || null;
  const hostile = lookups.hostile.byId.get(String(friendly.id)) || lookups.hostile.byName.get(friendly.name) || null;

  const activeTimeMs = summary?.activeTime ?? summary?.activeTimeReduced ?? 0;
  const total = summary?.total ?? 0;

  return {
    id: String(friendly.id),
    name: friendly.name,
    type: friendly.type || "",
    server: friendly.server || "",
    icon: friendly.icon || "",
    fightsPresent: friendly.fights?.length || 0,
    summaryTotal: total,
    activeTimeMs,
    deaths: getDeathCount(deaths),
    trackedCastCount: getTrackedCastCount(tracked),
    hostilePlayerDamage: getHostileDamage(hostile),
    summary,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const reportId = parseReportId(req.body?.reportUrl || req.body?.reportId || "");
  if (!reportId) return res.status(400).json({ error: "reportUrl or reportId required" });

  try {
    const [fightsData, summaryData, deathsData, trackedData, hostileData] = await Promise.all([
      wclFetch(`/report/fights/${reportId}`),
      wclFetch(`/report/tables/summary/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
      }),
      wclFetch(`/report/tables/deaths/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
      }),
      wclFetch(`/report/tables/casts/${reportId}`, {
        start: 0,
        end: 999999999999,
        by: "source",
        filter: "ability.id IN (34429,34430,34427,34428,34432,33507,37445,37579,35083,35084,35085,37665,37666,35065,35066,37064,26470,6346,32654,33496,33497,24604,14108,32666,33523,20554,20572,20549,7744,25584,33750,2825,32182,29166,10060,16190,19752,33206,871,12975,31821,27154,20484,20707)",
      }),
      wclFetch(`/report/tables/damage-done/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
        targetclass: "player",
        by: "source",
      }),
    ]);

    const fights = (fightsData.fights || [])
      .filter(fight => getDurationMs(fight.start_time, fight.end_time) > 0)
      .map(normalizeFight);

    const players = (fightsData.friendlies || [])
      .filter(friendly => PLAYER_TYPES.has(friendly.type) && friendly.name)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

    const lookups = {
      summary: buildLookup(summaryData.entries || []),
      deaths: buildLookup(deathsData.entries || []),
      tracked: buildLookup(trackedData.entries || []),
      hostile: buildLookup(hostileData.entries || []),
    };

    const normalizedPlayers = players.map(player => normalizePlayer(player, lookups));

    const raid = {
      id: makeRaidId(reportId, fightsData.start, fightsData.end),
      reportId,
      title: fightsData.title || reportId,
      zone: fights.find(fight => fight.zoneName)?.zoneName || "",
      zoneId: fightsData.zone ?? null,
      start: fightsData.start ?? null,
      end: fightsData.end ?? null,
      importedAt: new Date().toISOString(),
      fights,
      players: normalizedPlayers,
    };

    return res.status(200).json(raid);
  } catch (error) {
    console.error("RPB import failed:", error);
    return res.status(500).json({ error: error.message || "Import failed" });
  }
}

import { deriveRpbAnalytics } from "./rpbAnalytics.js";
import { buildCacheKey, getJsonCache, setJsonCache } from "./upstashRedis.js";

const BASE_URL = "https://classic.warcraftlogs.com/v1";

const PLAYER_TYPES = new Set([
  "Warrior", "Paladin", "Hunter", "Rogue", "Priest",
  "Shaman", "Mage", "Warlock", "Druid",
]);

const TRACKED_CAST_FILTER =
  "ability.id IN (34429,34430,34427,34428,34432,33507,37445,37579,35083,35084,35085,37665,37666,35065,35066,37064,26470,6346,32654,33496,33497,24604,14108,32666,33523,20554,20572,20549,7744,25584,33750,2825,32182,29166,10060,16190,19752,33206,871,12975,31821,27154,20484,20707)";
const ENGINEERING_DAMAGE_FILTER =
  "ability.id IN (23063,13241,17291,30486,4062,19821,15239,19784,12543,30461,30217,39965,4068,19769,4100,30216,22792,30526,4072,19805,27661,23000,11350) AND encounterid != 724";
const DRUMS_CAST_FILTER =
  "ability.id IN (35478,35476,35475,351355,351358,351360)";
const WCL_CACHE_TTL_SECONDS = 60 * 15;

async function fetchBossSummarySnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const bossFights = (fightsData.fights || []).filter(fight =>
    (fight.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const summaries = [];
  for (const fight of bossFights) {
    const summary = await wclFetch(`/report/tables/summary/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
    }, apiKeyOverride);

    summaries.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      summary,
    });
  }

  return {
    fights: bossFights.map(fight => ({
      id: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
    })),
    summaries,
  };
}

async function fetchBossDamageSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const bossFights = (fightsData.fights || []).filter(fight =>
    (fight.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const snapshots = [];
  for (const fight of bossFights) {
    const damageDone = await wclFetch(`/report/tables/damage-done/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      by: "source",
    }, apiKeyOverride);

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      damageDone,
    });
  }

  return { snapshots };
}

async function fetchBossHealingSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const bossFights = (fightsData.fights || []).filter(fight =>
    (fight.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const snapshots = [];
  for (const fight of bossFights) {
    const healing = await wclFetch(`/report/tables/healing/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      by: "source",
    }, apiKeyOverride);

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      healing,
    });
  }

  return { snapshots };
}

async function fetchBossDeathsSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const bossFights = (fightsData.fights || []).filter(fight =>
    (fight.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const snapshots = [];
  for (const fight of bossFights) {
    const deaths = await wclFetch(`/report/tables/deaths/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      by: "target",
    }, apiKeyOverride);

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      deaths,
    });
  }

  return { snapshots };
}

export function parseReportId(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  const match = trimmed.match(/warcraftlogs\.com\/reports\/([^?#/]+)/i);
  return match ? match[1] : trimmed;
}

async function wclFetch(path, params = {}, apiKeyOverride = "") {
  const apiKey = apiKeyOverride || process.env.WCL_API_KEY;
  if (!apiKey) throw new Error("A Warcraft Logs API key is required. Set WCL_API_KEY or provide one in the import form.");

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("translate", "true");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const cacheParts = [path];
  const sortedParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [key, value] of sortedParams) {
    cacheParts.push(`${key}=${value}`);
  }

  const cacheKey = buildCacheKey("wcl:v1", cacheParts);
  const cached = await getJsonCache(cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`WCL v1 ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  await setJsonCache(cacheKey, data, WCL_CACHE_TTL_SECONDS);
  return data;
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

function buildRoleLookup(summaryData = {}) {
  const roleById = new Map();
  const roleByName = new Map();

  const register = (entries, role) => {
    for (const entry of entries || []) {
      if (entry?.id != null) roleById.set(String(entry.id), role);
      if (entry?.name) roleByName.set(entry.name, role);
    }
  };

  register(summaryData?.playerDetails?.tanks, "Tank");
  register(summaryData?.playerDetails?.healers, "Healer");
  register(summaryData?.playerDetails?.dps, "DPS");

  return { roleById, roleByName };
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

function normalizeAbilityEntry(ability) {
  if (!ability) return null;

  return {
    guid: ability.guid ?? ability.gameID ?? ability.abilityGameID ?? null,
    name: ability.name || ability.abilityName || ability.ability?.name || "Unknown Ability",
    total: ability.total ?? ability.amount ?? ability.effectiveHealing ?? 0,
    activeTime: ability.activeTime ?? 0,
    hits: ability.hits ?? ability.totalHits ?? ability.count ?? 0,
    casts: ability.casts ?? ability.totalUses ?? ability.uses ?? 0,
    crits: ability.crits ?? ability.criticalHits ?? 0,
    overheal: ability.overheal ?? 0,
    absorbed: ability.absorbed ?? 0,
  };
}

function normalizeDeathEvent(event) {
  if (!event) return null;

  return {
    timestamp: event.timestamp ?? event.time ?? event.offset ?? 0,
    type: event.type || "",
    abilityGuid: event.abilityGameID ?? event.guid ?? event.ability?.guid ?? null,
    abilityName: event.ability?.name || event.abilityName || event.spellName || event.name || "",
    sourceId: event.sourceID ?? event.sourceId ?? null,
    sourceName: event.sourceName || event.source || event.source?.name || "",
    amount: event.amount ?? event.hitPoints ?? event.value ?? 0,
    overkill: event.overkill ?? 0,
    overheal: event.overheal ?? 0,
    absorbed: event.absorbed ?? 0,
    hitType: event.hitType ?? null,
    damage: event.damage ?? event.damageTaken ?? 0,
    healing: event.healing ?? event.healingReceived ?? 0,
    events: (event.events || []).map(normalizeDeathEvent).filter(Boolean),
  };
}

function extractPlayerSnapshots(summaryData = {}) {
  const snapshots = [];
  const roles = [
    ...(summaryData?.playerDetails?.tanks || []),
    ...(summaryData?.playerDetails?.healers || []),
    ...(summaryData?.playerDetails?.dps || []),
  ];

  for (const player of roles) {
    if (!PLAYER_TYPES.has(player?.type)) continue;
    if (!player?.name) continue;

    snapshots.push({
      id: String(player.id),
      name: player.name,
      type: player.type || "",
      gear: player?.combatantInfo?.gear || [],
    });
  }

  return snapshots;
}

function normalizePlayer(friendly, lookups) {
  const summary = lookups.summary.byId.get(String(friendly.id)) || lookups.summary.byName.get(friendly.name) || null;
  const deaths = lookups.deaths.byId.get(String(friendly.id)) || lookups.deaths.byName.get(friendly.name) || null;
  const tracked = lookups.tracked.byId.get(String(friendly.id)) || lookups.tracked.byName.get(friendly.name) || null;
  const hostile = lookups.hostile.byId.get(String(friendly.id)) || lookups.hostile.byName.get(friendly.name) || null;
  const role = lookups.roles.roleById.get(String(friendly.id)) || lookups.roles.roleByName.get(friendly.name) || "DPS";

  return {
    id: String(friendly.id),
    name: friendly.name,
    type: friendly.type || "",
    role,
    server: friendly.server || "",
    icon: friendly.icon || "",
    fightsPresent: friendly.fights?.length || 0,
    summaryTotal: summary?.total ?? 0,
    activeTimeMs: summary?.activeTime ?? summary?.activeTimeReduced ?? 0,
    deaths: getDeathCount(deaths),
    trackedCastCount: getTrackedCastCount(tracked),
    hostilePlayerDamage: getHostileDamage(hostile),
    summary,
  };
}

function getResolvedReportId({ reportUrl, reportId: rawReportId }) {
  const reportId = parseReportId(reportUrl || rawReportId || "");
  if (!reportId) throw new Error("reportUrl or reportId required");
  return reportId;
}

export async function fetchRpbImportStep(action, { reportUrl, reportId: rawReportId, apiKey = "" }) {
  const reportId = getResolvedReportId({ reportUrl, reportId: rawReportId });

  switch (action) {
    case "fights":
      return wclFetch(`/report/fights/${reportId}`, {}, apiKey);
    case "summary":
      return wclFetch(`/report/tables/summary/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
      }, apiKey);
    case "deaths":
      return wclFetch(`/report/tables/deaths/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
      }, apiKey);
    case "tracked":
      return wclFetch(`/report/tables/casts/${reportId}`, {
        start: 0,
        end: 999999999999,
        by: "source",
        filter: TRACKED_CAST_FILTER,
      }, apiKey);
    case "hostile":
      return wclFetch(`/report/tables/damage-done/${reportId}`, {
        start: 0,
        end: 999999999999,
        filter: "encounterid != 724",
        targetclass: "player",
        by: "source",
      }, apiKey);
    case "fullCasts":
      return wclFetch(`/report/tables/casts/${reportId}`, {
        start: 0,
        end: 999999999999,
      }, apiKey);
    case "engineering":
      return wclFetch(`/report/tables/damage-taken/${reportId}`, {
        start: 0,
        end: 999999999999,
        hostility: 1,
        by: "target",
        filter: ENGINEERING_DAMAGE_FILTER,
      }, apiKey);
    case "oil":
      return wclFetch(`/report/tables/damage-taken/${reportId}`, {
        start: 0,
        end: 999999999999,
        hostility: 1,
        abilityid: 11351,
        by: "target",
        filter: "encounterid != 724",
      }, apiKey);
    case "buffs":
      return wclFetch(`/report/tables/buffs/${reportId}`, {
        start: 0,
        end: 999999999999,
        by: "target",
        options: 2,
        filter: "encounterid != 724",
      }, apiKey);
    case "drums":
      return wclFetch(`/report/tables/casts/${reportId}`, {
        start: 0,
        end: 999999999999,
        by: "source",
        filter: DRUMS_CAST_FILTER,
      }, apiKey);
    case "raiderData":
      return fetchBossSummarySnapshots(reportId, apiKey);
    case "damageByFight":
      return fetchBossDamageSnapshots(reportId, apiKey);
    case "healingByFight":
      return fetchBossHealingSnapshots(reportId, apiKey);
    case "deathsByFight":
      return fetchBossDeathsSnapshots(reportId, apiKey);
    default:
      throw new Error(`Unknown RPB import step: ${action}`);
  }
}

export function assembleRpbRaid({ reportUrl, reportId: rawReportId }, datasets) {
  const reportId = getResolvedReportId({ reportUrl, reportId: rawReportId });
  const fightsData = datasets.fights || {};
  const summaryData = datasets.summary || {};
  const deathsData = datasets.deaths || {};
  const trackedData = datasets.tracked || {};
  const hostileData = datasets.hostile || {};

  const fights = (fightsData.fights || [])
    .filter(fight => getDurationMs(fight.start_time, fight.end_time) > 0)
    .map(fight => {
      const normalizedFight = normalizeFight(fight);
      const damageSnapshot = (datasets.damageByFight?.snapshots || []).find(snapshot => snapshot.fightId === String(normalizedFight.id));
      const healingSnapshot = (datasets.healingByFight?.snapshots || []).find(snapshot => snapshot.fightId === String(normalizedFight.id));
      const deathsSnapshot = (datasets.deathsByFight?.snapshots || []).find(snapshot => snapshot.fightId === String(normalizedFight.id));
      const raiderSnapshot = (datasets.raiderData?.summaries || []).find(snapshot => snapshot.fightId === String(normalizedFight.id));

      return {
        ...normalizedFight,
        playerSnapshots: extractPlayerSnapshots(raiderSnapshot?.summary),
        damageDoneEntries: (damageSnapshot?.damageDone?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: entry.total ?? 0,
            activeTime: entry.activeTime ?? 0,
            abilities: (entry.abilities || []).map(normalizeAbilityEntry).filter(Boolean),
          })),
        healingDoneEntries: (healingSnapshot?.healing?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: entry.total ?? 0,
            activeTime: entry.activeTime ?? 0,
            abilities: (entry.abilities || []).map(normalizeAbilityEntry).filter(Boolean),
          })),
        deathEntries: (deathsSnapshot?.deaths?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: typeof entry.deaths === "number" ? entry.deaths : (entry.total ?? 0),
            events: (entry.events || []).map(normalizeDeathEvent).filter(Boolean),
          })),
      };
    });

  const players = (fightsData.friendlies || [])
    .filter(friendly => PLAYER_TYPES.has(friendly.type) && friendly.name)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const lookups = {
    summary: buildLookup(summaryData.entries || []),
    deaths: buildLookup(deathsData.entries || []),
    tracked: buildLookup(trackedData.entries || []),
    hostile: buildLookup(hostileData.entries || []),
    roles: buildRoleLookup(summaryData),
  };

  const playersWithBaseMetrics = players.map(player => normalizePlayer(player, lookups));
  const analytics = deriveRpbAnalytics(playersWithBaseMetrics, datasets);
  const analyticsByPlayerId = new Map(
    analytics.playerAnalytics.map(entry => [String(entry.playerId), entry])
  );

  return {
    id: makeRaidId(reportId, fightsData.start, fightsData.end),
    reportId,
    title: fightsData.title || reportId,
    zone: fights.find(fight => fight.zoneName)?.zoneName || "",
    zoneId: fightsData.zone ?? null,
    start: fightsData.start ?? null,
    end: fightsData.end ?? null,
    importedAt: new Date().toISOString(),
    fights,
    analytics: analytics.overview,
    players: playersWithBaseMetrics.map(player => ({
      ...player,
      analytics: analyticsByPlayerId.get(String(player.id)) || null,
    })),
  };
}

export async function importRpbRaid({ reportUrl, reportId: rawReportId, apiKey = "" }) {
  const input = { reportUrl, reportId: rawReportId, apiKey };
  const [fights, summary, deaths, tracked, hostile, fullCasts, engineering, oil, buffs, drums, raiderData, damageByFight, healingByFight, deathsByFight] = await Promise.all([
    fetchRpbImportStep("fights", input),
    fetchRpbImportStep("summary", input),
    fetchRpbImportStep("deaths", input),
    fetchRpbImportStep("tracked", input),
    fetchRpbImportStep("hostile", input),
    fetchRpbImportStep("fullCasts", input),
    fetchRpbImportStep("engineering", input),
    fetchRpbImportStep("oil", input),
    fetchRpbImportStep("buffs", input),
    fetchRpbImportStep("drums", input),
    fetchRpbImportStep("raiderData", input),
    fetchRpbImportStep("damageByFight", input),
    fetchRpbImportStep("healingByFight", input),
    fetchRpbImportStep("deathsByFight", input),
  ]);

  return assembleRpbRaid(
    { reportUrl, reportId: rawReportId },
    { fights, summary, deaths, tracked, hostile, fullCasts, engineering, oil, buffs, drums, raiderData, damageByFight, healingByFight, deathsByFight }
  );
}

import { deriveRpbAnalytics } from "./rpbAnalytics.js";
import { buildCacheKey, getJsonCache, setJsonCache } from "./upstashRedis.js";

const BASE_URL = "https://classic.warcraftlogs.com/v1";
const WCL_V2_TOKEN_URL = "https://classic.warcraftlogs.com/oauth/token";
const WCL_V2_API_URL = "https://classic.warcraftlogs.com/api/v2/client";
1
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
const DRUMS_ABILITY_IDS = new Set(["35478", "35476", "35475", "351355", "351358", "351360"]);
const DRUMS_TYPE_LABELS = new Map([
  ["35475", "War"],
  ["351360", "War"],
  ["35476", "Battle"],
  ["351355", "Battle"],
  ["35478", "Restoration"],
  ["351358", "Restoration"],
]);
const TRACKED_BOSS_DEBUFFS = [
  { key: "blood-frenzy-estimate", label: "Blood Frenzy", aliases: [], spellIds: new Set(), preferredClass: "Warrior", order: 0, estimated: true },
  { key: "armor-reduction", label: "Sunder Armor / IEA", aliases: ["sunder armor", "improved expose armor", "expose armor"], spellIds: new Set(["25225", "26866"]), preferredClass: "Warrior", order: 1 },
  { key: "demoralizing-shout", label: "Demoralizing Shout", aliases: ["demoralizing shout"], spellIds: new Set(["25203"]), preferredClass: "Warrior", order: 2 },
  { key: "curse-of-recklessness", label: "Curse of Recklessness", aliases: ["curse of recklessness"], spellIds: new Set(["27226"]), preferredClass: "Warlock", order: 3 },
  { key: "curse-of-the-elements", label: "Curse of the Elements", aliases: ["curse of the elements"], spellIds: new Set(["27228"]), preferredClass: "Warlock", order: 4 },
  { key: "curse-of-weakness", label: "Curse of Weakness", aliases: ["curse of weakness"], spellIds: new Set(["30909"]), preferredClass: "Warlock", order: 5 },
  { key: "hunters-mark", label: "Hunter's Mark", aliases: ["hunter s mark", "hunters mark"], spellIds: new Set(["14325"]), preferredClass: "Hunter", order: 6 },
  { key: "expose-weakness", label: "Expose Weakness", aliases: ["expose weakness"], spellIds: new Set(["34501"]), preferredClass: "Hunter", order: 7 },
  { key: "faerie-fire", label: "Faerie Fire", aliases: ["faerie fire"], spellIds: new Set(["26993", "27011"]), preferredClass: "Druid", order: 8 },
  { key: "judgement-of-wisdom", label: "Judgement of Wisdom", aliases: ["judgement of wisdom"], spellIds: new Set(["27164"]), preferredClass: "Paladin", order: 9 },
  { key: "judgement-of-the-crusader", label: "Judgement of the Crusader", aliases: ["judgement of the crusader"], spellIds: new Set(["27159"]), preferredClass: "Paladin", order: 10 },
];
const TRACKED_BOSS_DEBUFF_SPELL_IDS = new Set(
  TRACKED_BOSS_DEBUFFS.flatMap(entry => [...(entry.spellIds || [])])
);
const BLOOD_FRENZY_PROXY_DEBUFF_IDS = ["12721", "25208"];
const BLOOD_FRENZY_ESTIMATE_MULTIPLIER = 0.038461538461538464;
const RESOURCE_RECOVERY_SPELL_IDS = ["28499", "27869", "16666"];
const RESOURCE_RECOVERY_ABILITY_IDS = new Set(RESOURCE_RECOVERY_SPELL_IDS);
const MANA_POTION_ABILITY_IDS = new Set(["28499"]);
const DARK_RUNE_ABILITY_IDS = new Set(["27869", "16666"]);
const DRUMS_PREPULL_LOOKBACK_MS = 30 * 1000;
const POTIONS_PREPULL_LOOKBACK_MS = 30 * 1000;
const POTION_EVENT_NAME_TOKENS = [
  "potion",
  "restore mana",
  "nightmare seed",
  "healthstone",
  "dark rune",
  "demonic rune",
  "destruction",
  "haste",
  "ironshield",
  "fel mana",
  "insane strength",
  "super mana",
  "super healing",
  "heroic potion",
];
const POTION_BUFF_NAME_TOKENS = [
  "potion",
  "nightmare seed",
  "destruction",
  "haste",
  "ironshield",
  "fel mana",
  "insane strength",
  "heroic potion",
];
const POTION_HEAL_NAME_TOKENS = [
  "healthstone",
  "healing potion",
];
const POTION_CAST_MATCH_WINDOW_MS = 5000;
const POTION_HEAL_MATCH_WINDOW_MS = 5000;
const POTION_RESOURCE_MATCH_WINDOW_MS = 5000;
const WCL_CACHE_TTL_SECONDS = 60 * 15;
const WCL_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];
const WCL_V1_MIN_REQUEST_GAP_MS = 350;
let cachedV2Token = null;
let cachedV2TokenExpiresAt = 0;
let wclV1RequestQueue = Promise.resolve();
let wclV1LastRequestStartedAt = 0;
const wclV1InFlightRequests = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runQueuedWclV1Request(task) {
  const scheduled = wclV1RequestQueue.catch(() => undefined).then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, WCL_V1_MIN_REQUEST_GAP_MS - (now - wclV1LastRequestStartedAt));
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    wclV1LastRequestStartedAt = Date.now();
    return task();
  });

  wclV1RequestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

async function getWclV2AccessToken(clientIdOverride = "", clientSecretOverride = "") {
  if (cachedV2Token && Date.now() < cachedV2TokenExpiresAt) return cachedV2Token;

  const clientId = clientIdOverride || process.env.WCL_CLIENT_ID;
  const clientSecret = clientSecretOverride || process.env.WCL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(WCL_V2_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`WCL v2 token fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedV2Token = data.access_token;
  cachedV2TokenExpiresAt = Date.now() + Math.max(0, (Number(data.expires_in || 0) - 300)) * 1000;
  return cachedV2Token;
}

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

function makeRankingAlias(metric, fightId) {
  return `fight_${metric}_${String(fightId).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function getRankingPercentile(node) {
  const candidates = [
    node?.rankPercent,
    node?.rank?.rankPercent,
    node?.ranks?.rankPercent,
    node?.percentile,
    node?.rank?.percentile,
    node?.ranks?.percentile,
    node?.ranks?.rank?.percentile,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;
  }

  return null;
}

function collectRankingRows(node, rows = []) {
  if (!node) return rows;
  if (Array.isArray(node)) {
    for (const item of node) collectRankingRows(item, rows);
    return rows;
  }
  if (typeof node !== "object") return rows;

  const percentile = getRankingPercentile(node);
  const name = typeof node?.name === "string"
    ? node.name
    : (typeof node?.playerName === "string" ? node.playerName : (typeof node?.characterName === "string" ? node.characterName : ""));
  const id = node?.id ?? node?.playerID ?? node?.playerId ?? node?.characterID ?? node?.characterId ?? null;

  if (name && percentile != null) {
    rows.push({ id: id != null ? String(id) : "", name, percentile });
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectRankingRows(value, rows);
    }
  }

  return rows;
}

function normalizeRankingRows(rawRanking) {
  const byId = {};
  const byName = {};
  const rows = collectRankingRows(rawRanking, []);

  for (const row of rows) {
    if (row.id) {
      byId[row.id] = Math.max(Number(byId[row.id] || 0), row.percentile);
    }
    if (row.name) {
      byName[row.name] = Math.max(Number(byName[row.name] || 0), row.percentile);
    }
  }

  return { byId, byName };
}

function getRootRankingPercentile(rawRanking) {
  const percentile = getRankingPercentile(rawRanking);
  if (percentile != null) return percentile;
  if (!rawRanking || typeof rawRanking !== "object") return null;

  for (const value of Object.values(rawRanking)) {
    if (!value || typeof value !== "object") continue;
    const nestedPercentile = getRootRankingPercentile(value);
    if (nestedPercentile != null) return nestedPercentile;
  }

  return null;
}

function getSpeedRankingPercentile(node) {
  const candidates = [
    node?.speed?.rankPercent,
    node?.speed?.percentile,
    node?.rankings?.speed?.rankPercent,
    node?.rankings?.speed?.percentile,
    node?.rankPercent,
    node?.percentile,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;
  }

  return null;
}

function normalizeReportSpeedRows(rawRanking, encounterFights = []) {
  const rows = Array.isArray(rawRanking?.data) ? rawRanking.data : [];
  const allowedFightIds = new Set((encounterFights || []).map(fight => String(fight.id)));
  const fights = {};
  const reportPercents = [];

  for (const row of rows) {
    const fightId = String(row?.fightID ?? row?.fightId ?? "");
    if (!fightId || (allowedFightIds.size > 0 && !allowedFightIds.has(fightId))) continue;

    const speedParsePercent = getSpeedRankingPercentile(row);
    fights[fightId] = {
      speedParsePercent: speedParsePercent != null ? speedParsePercent : null,
    };

    if (speedParsePercent != null) {
      reportPercents.push(speedParsePercent);
    }
  }

  return {
    compareMode: "Rankings",
    fights,
    reportSpeedPercent: reportPercents.length
      ? reportPercents.reduce((sum, value) => sum + value, 0) / reportPercents.length
      : null,
  };
}

async function fetchReportRankings(reportId, fightsData = {}, clientIdOverride = "", clientSecretOverride = "") {
  const token = await getWclV2AccessToken(clientIdOverride, clientSecretOverride);
  if (!token) {
    return { available: false, fights: {} };
  }

  const encounterFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  if (!encounterFights.length) {
    return {
      available: true,
      compareMode: "Rankings",
      fights: {},
      overall: { damage: { byId: {}, byName: {} }, healing: { byId: {}, byName: {} } },
    };
  }

  const rankingFields = [
    'overall_damage: rankings(compare: Rankings, playerMetric: dps)',
    'overall_healing: rankings(compare: Rankings, playerMetric: hps)',
    ...encounterFights.flatMap(fight => ([
    `${makeRankingAlias("damage", fight.id)}: rankings(compare: Rankings, fightIDs: [${Number(fight.id)}], playerMetric: dps)`,
    `${makeRankingAlias("healing", fight.id)}: rankings(compare: Rankings, fightIDs: [${Number(fight.id)}], playerMetric: hps)`,
    ])),
  ].join("\n");

  const query = `{
    reportData {
      report(code: "${reportId}", allowUnlisted: true) {
        ${rankingFields}
      }
    }
  }`;

  const res = await fetch(WCL_V2_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`WCL v2 rankings query failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const report = data?.data?.reportData?.report || {};
  const fights = {};

  for (const fight of encounterFights) {
    fights[String(fight.id)] = {
      damage: normalizeRankingRows(report?.[makeRankingAlias("damage", fight.id)]),
      healing: normalizeRankingRows(report?.[makeRankingAlias("healing", fight.id)]),
    };
  }

  return {
    available: true,
    compareMode: "Rankings",
    fights,
    overall: {
      damage: normalizeRankingRows(report?.overall_damage),
      healing: normalizeRankingRows(report?.overall_healing),
    },
  };
}

async function fetchReportSpeed(reportId, fightsData = {}, clientIdOverride = "", clientSecretOverride = "") {
  const token = await getWclV2AccessToken(clientIdOverride, clientSecretOverride);
  if (!token) {
    return { available: false, fights: {}, reportSpeedPercent: null };
  }

  const encounterFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const query = `{
    reportData {
      report(code: "${reportId}", allowUnlisted: true) {
        overall_speed: rankings(compare: Rankings, playerMetric: playerspeed)
      }
    }
  }`;

  const res = await fetch(WCL_V2_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`WCL v2 speed query failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const report = data?.data?.reportData?.report || {};
  const normalized = normalizeReportSpeedRows(report?.overall_speed, encounterFights);

  return {
    available: true,
    fights: normalized.fights,
    reportSpeedPercent: normalized.reportSpeedPercent,
  };
}

function getSnapshotEligibleFights(fights = []) {
  return (fights || []).filter(fight => getDurationMs(fight.start_time, fight.end_time) > 0);
}

function aggregateAbilityRows(entries = []) {
  const grouped = new Map();

  for (const entry of entries) {
    const normalized = normalizeAbilityEntry(entry);
    if (!normalized) continue;

    const key = String(normalized.guid ?? normalized.name ?? "unknown");
    const existing = grouped.get(key) || {
      guid: normalized.guid ?? null,
      name: normalized.name || "Unknown Ability",
      total: 0,
      activeTime: 0,
      hits: 0,
      casts: 0,
      crits: 0,
      overheal: 0,
      absorbed: 0,
    };

    existing.total += Number(normalized.total || 0);
    existing.activeTime += Number(normalized.activeTime || 0);
    existing.hits += Number(normalized.hits || 0);
    existing.casts += Number(normalized.casts || 0);
    existing.crits += Number(normalized.crits || 0);
    existing.overheal += Number(normalized.overheal || 0);
    existing.absorbed += Number(normalized.absorbed || 0);
    grouped.set(key, existing);
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function collectRawAbilityRows(node, rows = []) {
  if (!node) return rows;

  if (Array.isArray(node)) {
    node.forEach(entry => collectRawAbilityRows(entry, rows));
    return rows;
  }

  if (typeof node !== "object") return rows;

  const hasAbilityIdentity = node.guid != null || node.gameID != null || node.name || node.abilityName;
  const hasStatPayload =
    node.total != null
    || node.amount != null
    || node.hits != null
    || node.totalHits != null
    || node.hitCount != null
    || node.landedHits != null
    || node.count != null
    || node.missCount != null
    || node.crits != null
    || node.criticalHits != null
    || node.critCount != null
    || node.critHits != null
    || node.critHitCount != null
    || node.casts != null
    || node.uses != null
    || node.totalUses != null
    || node.useCount != null
    || node.executeCount != null;

  if (hasAbilityIdentity && hasStatPayload) {
    rows.push(node);
  }

  for (const childKey of ["subentries", "entries", "abilities", "sources", "targets", "spells"]) {
    if (Array.isArray(node[childKey])) {
      collectRawAbilityRows(node[childKey], rows);
    }
  }
  return rows;
}

function aggregateLegacyAbilityRows(entries = [], castsByGuid = new Map()) {
  const grouped = new Map();

  for (const entry of collectRawAbilityRows(entries)) {
    const guid = entry.guid ?? entry.gameID ?? entry.abilityGameID ?? null;
    const name = entry.name || entry.abilityName || entry.ability?.name || "Unknown Ability";
    const icon = entry.icon || entry.iconName || entry.iconname || entry.abilityIcon || entry.ability?.icon || entry.ability?.iconName || "";
    const key = String(guid ?? name ?? "unknown");
    const existing = grouped.get(key) || {
      guid,
      name,
      icon,
      total: 0,
      activeTime: 0,
      hits: 0,
      casts: 0,
      crits: 0,
      overheal: 0,
      absorbed: 0,
    };

    existing.total += Number(entry.total ?? entry.amount ?? entry.effectiveHealing ?? 0);
    existing.activeTime += Number(entry.activeTime ?? entry.uptime ?? 0);
    existing.hits += Number(entry.hitCount ?? entry.hits ?? entry.totalHits ?? entry.landedHits ?? entry.count ?? 0);
    existing.hits += Number(entry.missCount ?? 0);
    existing.crits += Number(entry.critHitCount ?? entry.criticalHits ?? entry.crits ?? entry.critCount ?? entry.critHits ?? 0);
    existing.overheal += Number(entry.overheal ?? 0);
    existing.absorbed += Number(entry.absorbed ?? 0);

    const directCasts = Number(entry.uses ?? entry.totalUses ?? entry.casts ?? entry.useCount ?? entry.executeCount ?? 0);
    if (directCasts > 0) {
      existing.casts += directCasts;
    } else if (castsByGuid.has(key)) {
      existing.casts += Number(castsByGuid.get(key) || 0);
    }

    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .filter(entry => entry.total > 0 || entry.casts > 0 || entry.hits > 0 || entry.crits > 0)
    .sort((a, b) => b.total - a.total);
}

function getNestedAbilityCollection(entry) {
  return [
    entry?.abilities,
    entry?.entries,
    entry?.sources,
    entry?.targets,
    entry?.spells,
    entry?.subentries,
  ].find(value => Array.isArray(value) && value.length > 0) || [];
}

function findSourceScopedEntry(entries = [], sourceId = "") {
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) return null;

  for (const entry of entries || []) {
    if (!entry || typeof entry !== "object") continue;

    const candidateIds = [
      entry?.id,
      entry?.sourceID,
      entry?.sourceId,
      entry?.playerID,
      entry?.playerId,
    ].map(value => String(value ?? "").trim()).filter(Boolean);

    if (candidateIds.includes(normalizedSourceId)) {
      return entry;
    }
  }

  return null;
}

function buildSourceAbilityCastLookups(castsPayload = {}) {
  const byId = new Map();
  const byName = new Map();

  for (const sourceEntry of castsPayload?.entries || []) {
    const nestedRows = getNestedAbilityCollection(sourceEntry);
    if (!nestedRows.length) continue;

    const castsByGuid = new Map();
    for (const row of collectRawAbilityRows(nestedRows)) {
      const key = String(row.guid ?? row.gameID ?? row.abilityGameID ?? row.name ?? "unknown");
      castsByGuid.set(key, Number(castsByGuid.get(key) || 0) + Number(
        row.total ?? row.uses ?? row.totalUses ?? row.casts ?? row.useCount ?? row.executeCount ?? 0
      ));
    }

    if (sourceEntry?.id != null) byId.set(String(sourceEntry.id), castsByGuid);
    if (sourceEntry?.name) byName.set(sourceEntry.name, castsByGuid);
  }

  return { byId, byName };
}

function enrichFightMetricEntries(entries = [], castsPayload = {}, fallbackLabel = "All Damage") {
  const castLookups = buildSourceAbilityCastLookups(castsPayload);

  return (entries || []).map(entry => {
    const castsByGuid = castLookups.byId.get(String(entry?.id))
      || castLookups.byName.get(entry?.name)
      || new Map();
    const abilities = aggregateLegacyAbilityRows(getNestedAbilityCollection(entry), castsByGuid);
    const totals = abilities.reduce((acc, ability) => ({
      casts: acc.casts + Number(ability?.casts || 0),
      hits: acc.hits + Number(ability?.hits || 0),
      crits: acc.crits + Number(ability?.crits || 0),
    }), { casts: 0, hits: 0, crits: 0 });

    return {
      ...entry,
      abilities: abilities.length > 0 ? abilities : getAbilityRows(entry, fallbackLabel),
      casts: entry?.casts ?? entry?.totalUses ?? entry?.uses ?? entry?.useCount ?? entry?.executeCount ?? totals.casts,
      hits: entry?.hits ?? entry?.totalHits ?? entry?.hitCount ?? entry?.landedHits ?? entry?.count ?? totals.hits,
      crits: entry?.crits ?? entry?.criticalHits ?? entry?.critCount ?? entry?.critHits ?? entry?.critHitCount ?? totals.crits,
    };
  });
}

function shouldHydrateDamageEntry(entry) {
  if (!PLAYER_TYPES.has(entry?.type) || Number(entry?.total || 0) <= 0) return false;

  const abilities = Array.isArray(entry?.abilities) ? entry.abilities : [];
  if (!abilities.length) return true;

  const positiveTotalAbilities = abilities.filter(ability => Number(ability?.total || 0) > 0);
  if (!positiveTotalAbilities.length) return true;

  const abilityHits = positiveTotalAbilities.reduce((sum, ability) => sum + Number(ability?.hits || 0), 0);
  const abilityCrits = positiveTotalAbilities.reduce((sum, ability) => sum + Number(ability?.crits || 0), 0);
  const topLevelHits = Number(entry?.hits || 0);
  const topLevelCrits = Number(entry?.crits || 0);

  if (abilityHits <= 0 && abilityCrits <= 0) return true;
  if (topLevelHits > 0 && abilityHits < Math.ceil(topLevelHits * 0.5)) return true;
  if (topLevelCrits > 0 && abilityCrits < Math.ceil(topLevelCrits * 0.5)) return true;

  if (String(entry?.type || "").trim().toLowerCase() === "hunter") {
    const hasZeroedPositiveAbility = positiveTotalAbilities.some(ability =>
      Number(ability?.hits || 0) <= 0 && Number(ability?.crits || 0) <= 0
    );
    if (hasZeroedPositiveAbility) return true;
  }

  return false;
}

function shouldHydrateHealingEntry(entry) {
  if (!PLAYER_TYPES.has(entry?.type) || Number(entry?.total || 0) <= 0) return false;

  const abilities = Array.isArray(entry?.abilities) ? entry.abilities : [];
  if (!abilities.length) return true;

  const positiveTotalAbilities = abilities.filter(ability => Number(ability?.total || 0) > 0);
  if (!positiveTotalAbilities.length) return true;

  const abilityHits = positiveTotalAbilities.reduce((sum, ability) => sum + Number(ability?.hits || 0), 0);
  const abilityCrits = positiveTotalAbilities.reduce((sum, ability) => sum + Number(ability?.crits || 0), 0);
  const topLevelHits = Number(entry?.hits || 0);
  const topLevelCrits = Number(entry?.crits || 0);

  if (abilityHits <= 0 && abilityCrits <= 0) return true;
  if (topLevelHits > 0 && abilityHits < Math.ceil(topLevelHits * 0.5)) return true;
  if (topLevelCrits > 0 && abilityCrits < Math.ceil(topLevelCrits * 0.5)) return true;

  return false;
}

export async function fetchPlayerAbilityBreakdown({
  reportUrl,
  reportId: rawReportId,
  apiKey = "",
  sourceId,
  fightIds = [],
  mode = "damage",
}) {
  const reportId = getResolvedReportId({ reportUrl, reportId: rawReportId });
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) throw new Error("sourceId is required");

  const fightsData = await fetchRpbImportStep("fights", { reportId, apiKey });
  const requestedFightIds = new Set((fightIds || []).map(value => String(value)).filter(Boolean));
  const eligibleFights = getSnapshotEligibleFights(fightsData.fights || [])
    .filter(fight => requestedFightIds.size === 0 || requestedFightIds.has(String(fight.id)));
  const friendlyById = new Map((fightsData.friendlies || []).map(friendly => [String(friendly?.id || ""), friendly]));
  const selectedFriendly = friendlyById.get(normalizedSourceId) || null;
  const ownedPetsByFightId = new Map();

  if (mode === "damage" && selectedFriendly) {
    for (const pet of fightsData.friendlyPets || []) {
      const ownerId = String(pet?.petOwner || pet?.petOwnerId || pet?.ownerID || pet?.ownerId || "");
      if (ownerId !== normalizedSourceId) continue;

      for (const fight of pet?.fights || []) {
        const fightId = String(fight?.id || "");
        if (!fightId) continue;

        const pets = ownedPetsByFightId.get(fightId) || [];
        pets.push({
          id: String(pet?.id || ""),
          name: pet?.name || "Pet",
        });
        ownedPetsByFightId.set(fightId, pets);
      }
    }
  }

  const path = mode === "healing" ? `/report/tables/healing/${reportId}` : `/report/tables/damage-done/${reportId}`;
  const snapshots = [];

  for (const fight of eligibleFights) {
    const [castsPayload, statPayload] = await Promise.all([
      wclFetch(`/report/tables/casts/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        sourceid: normalizedSourceId,
      }, apiKey),
      wclFetch(path, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        sourceid: normalizedSourceId,
        options: 2,
      }, apiKey),
    ]);

    const castsByGuid = new Map();
    for (const row of collectRawAbilityRows(castsPayload?.entries || [])) {
      const key = String(row.guid ?? row.gameID ?? row.abilityGameID ?? row.name ?? "unknown");
      castsByGuid.set(key, Number(castsByGuid.get(key) || 0) + Number(row.total ?? row.uses ?? row.totalUses ?? 0));
    }

    const scopedEntry = findSourceScopedEntry(statPayload?.entries || [], normalizedSourceId);
    const abilityNodes = scopedEntry ? getNestedAbilityCollection(scopedEntry) : (statPayload?.entries || []);
    const snapshotEntries = aggregateLegacyAbilityRows(abilityNodes, castsByGuid)
      .filter(entry => entry?.guid != null);
    const ownedPets = ownedPetsByFightId.get(String(fight.id)) || [];

    if (mode === "damage" && ownedPets.length > 0) {
      const petPayloads = await Promise.all(ownedPets.map(async pet => {
        const petDamage = await wclFetch(`/report/tables/damage-done/${reportId}`, {
          start: fight.start_time ?? 0,
          end: fight.end_time ?? 0,
          sourceid: pet.id,
        }, apiKey);

        return {
          ...pet,
          entries: petDamage?.entries || [],
        };
      }));

      for (const pet of petPayloads) {
        for (const entry of pet.entries || []) {
          const normalized = normalizeAbilityEntry({
            guid: `pet:${pet.id}:${entry?.guid ?? entry?.name ?? "unknown"}`,
            name: `${pet.name}: ${entry?.name || "Unknown Ability"}`,
            icon: entry?.abilityIcon || entry?.icon || entry?.iconName || "",
            total: entry?.total ?? 0,
            activeTime: 0,
            hits: entry?.hits ?? entry?.totalHits ?? entry?.hitCount ?? entry?.count ?? 0,
            casts: entry?.casts ?? entry?.totalUses ?? entry?.uses ?? entry?.useCount ?? entry?.executeCount ?? 0,
            crits: entry?.crits ?? entry?.criticalHits ?? entry?.critCount ?? entry?.critHits ?? entry?.critHitCount ?? 0,
            overheal: 0,
            absorbed: entry?.absorbed ?? 0,
          });
          if (normalized) snapshotEntries.push(normalized);
        }
      }
    }

    snapshots.push({
      fightId: String(fight.id),
      fightName: fight.name || "Unknown Fight",
      encounterId: fight.boss || 0,
      entries: snapshotEntries,
    });
  }

  const result = {
    mode,
    sourceId: normalizedSourceId,
    fightIds: eligibleFights.map(fight => String(fight.id)),
    entries: aggregateAbilityRows(snapshots.flatMap(snapshot => snapshot.entries || [])),
    snapshots,
  };

  console.log("RPB playerAbilityBreakdown", JSON.stringify({
    reportId,
    sourceId: normalizedSourceId,
    mode,
    fights: result.snapshots.map(snapshot => ({
      fightId: snapshot.fightId,
      fightName: snapshot.fightName,
      entryCount: snapshot.entries.length,
      sample: snapshot.entries.slice(0, 5),
    })),
    combinedCount: result.entries.length,
    combinedSample: result.entries.slice(0, 10),
  }));

  return result;
}

async function hydrateSourceScopedFightEntry({
  reportId,
  fight,
  entry,
  apiKey,
  mode = "damage",
}) {
  const sourceId = String(entry?.id || "").trim();
  if (!sourceId) return entry;

  const path = mode === "healing" ? `/report/tables/healing/${reportId}` : `/report/tables/damage-done/${reportId}`;
  const [castsPayload, statPayload] = await Promise.all([
    wclFetch(`/report/tables/casts/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      sourceid: sourceId,
    }, apiKey),
    wclFetch(path, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      sourceid: sourceId,
      options: 2,
    }, apiKey),
  ]);

  const castsByGuid = new Map();
  for (const row of collectRawAbilityRows(castsPayload?.entries || [])) {
    const key = String(row.guid ?? row.gameID ?? row.abilityGameID ?? row.name ?? "unknown");
    castsByGuid.set(key, Number(castsByGuid.get(key) || 0) + Number(row.total ?? row.uses ?? row.totalUses ?? 0));
  }

  const abilities = aggregateLegacyAbilityRows(statPayload?.entries || [], castsByGuid)
    .filter(ability => ability?.guid != null);
  if (!abilities.length) return entry;

  const preservedPetAbilities = (entry?.abilities || []).filter(ability =>
    String(ability?.guid || "").startsWith("pet:")
  );
  const petTotals = preservedPetAbilities.reduce((acc, ability) => ({
    casts: acc.casts + Number(ability?.casts || 0),
    hits: acc.hits + Number(ability?.hits || 0),
    crits: acc.crits + Number(ability?.crits || 0),
  }), { casts: 0, hits: 0, crits: 0 });

  const totals = abilities.reduce((acc, ability) => ({
    casts: acc.casts + Number(ability?.casts || 0),
    hits: acc.hits + Number(ability?.hits || 0),
    crits: acc.crits + Number(ability?.crits || 0),
  }), { casts: 0, hits: 0, crits: 0 });

  return {
    ...entry,
    abilities: [...abilities, ...preservedPetAbilities],
    casts: totals.casts + petTotals.casts,
    hits: totals.hits + petTotals.hits,
    crits: totals.crits + petTotals.crits,
  };
}

async function fetchFightDamageSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = getSnapshotEligibleFights(fightsData.fights || []);
  const friendlyById = new Map((fightsData.friendlies || []).map(friendly => [String(friendly?.id || ""), friendly]));
  const ownedDamagePetsByFightId = new Map();

  for (const pet of fightsData.friendlyPets || []) {
    const ownerId = String(pet?.petOwner || pet?.petOwnerId || pet?.ownerID || pet?.ownerId || "");
    if (!ownerId) continue;

    const owner = friendlyById.get(ownerId);
    if (!owner || !PLAYER_TYPES.has(owner?.type)) continue;

    for (const fight of pet?.fights || []) {
      const fightId = String(fight?.id || "");
      if (!fightId) continue;

      const pets = ownedDamagePetsByFightId.get(fightId) || [];
      pets.push({
        id: String(pet?.id || ""),
        name: pet?.name || "Pet",
        ownerId,
      });
      ownedDamagePetsByFightId.set(fightId, pets);
    }
  }

  const snapshots = [];
  for (const fight of snapshotFights) {
    try {
      let casts = { entries: [] };
      try {
        casts = await wclFetch(`/report/tables/casts/${reportId}`, {
          start: fight.start_time ?? 0,
          end: fight.end_time ?? 0,
          by: "source",
        }, apiKeyOverride);
      } catch (error) {
        console.warn("RPB damage casts fallback", {
          reportId,
          fightId: String(fight.id),
          fightName: fight?.name || "Unknown Fight",
          message: error?.message || String(error || ""),
        });
      }

      try {
        let damageDone = { entries: [] };
        try {
          damageDone = await wclFetch(`/report/tables/damage-done/${reportId}`, {
            start: fight.start_time ?? 0,
            end: fight.end_time ?? 0,
            by: "source",
            options: 2,
          }, apiKeyOverride);
        } catch (error) {
          console.warn("RPB damage table fallback", {
            reportId,
            fightId: String(fight.id),
            fightName: fight?.name || "Unknown Fight",
            message: error?.message || String(error || ""),
          });
        }
        const ownedPets = ownedDamagePetsByFightId.get(String(fight.id)) || [];
        const petDamageByOwnerId = new Map();

        if (ownedPets.length > 0) {
          const petPayloads = [];
          for (const pet of ownedPets) {
            try {
              const petDamage = await wclFetch(`/report/tables/damage-done/${reportId}`, {
                start: fight.start_time ?? 0,
                end: fight.end_time ?? 0,
                sourceid: pet.id,
              }, apiKeyOverride);

              petPayloads.push({
                ...pet,
                entries: petDamage?.entries || [],
              });
            } catch (error) {
              console.warn("RPB pet damage fallback", {
                reportId,
                fightId: String(fight.id),
                fightName: fight?.name || "Unknown Fight",
                petId: String(pet?.id || ""),
                petName: pet?.name || "Pet",
                ownerId: String(pet?.ownerId || ""),
                message: error?.message || String(error || ""),
              });
            }
          }

          for (const pet of petPayloads) {
            const total = (pet.entries || []).reduce((sum, entry) => sum + Number(entry?.total || 0), 0);
            if (total <= 0) continue;

            const abilities = (pet.entries || []).map(entry => normalizeAbilityEntry({
              guid: `pet:${pet.id}:${entry?.guid ?? entry?.name ?? "unknown"}`,
              name: `${pet.name}: ${entry?.name || "Unknown Ability"}`,
              icon: entry?.abilityIcon || entry?.icon || entry?.iconName || "",
              total: entry?.total ?? 0,
              activeTime: 0,
              hits: entry?.hits ?? entry?.totalHits ?? entry?.hitCount ?? entry?.count ?? 0,
              casts: entry?.casts ?? entry?.totalUses ?? entry?.uses ?? entry?.useCount ?? entry?.executeCount ?? 0,
              crits: entry?.crits ?? entry?.criticalHits ?? entry?.critCount ?? entry?.critHits ?? entry?.critHitCount ?? 0,
              overheal: 0,
              absorbed: entry?.absorbed ?? 0,
            })).filter(Boolean);
            const ownerEntry = petDamageByOwnerId.get(pet.ownerId) || {
              total: 0,
              abilities: [],
              casts: 0,
              hits: 0,
              crits: 0,
            };

            ownerEntry.total += total;
            ownerEntry.abilities.push(...abilities);
            ownerEntry.casts += abilities.reduce((sum, ability) => sum + Number(ability?.casts || 0), 0);
            ownerEntry.hits += abilities.reduce((sum, ability) => sum + Number(ability?.hits || 0), 0);
            ownerEntry.crits += abilities.reduce((sum, ability) => sum + Number(ability?.crits || 0), 0);
            petDamageByOwnerId.set(pet.ownerId, ownerEntry);
          }
        }

        const enrichedEntries = enrichFightMetricEntries(damageDone?.entries || [], casts, "All Damage")
          .map(entry => {
            const petContribution = petDamageByOwnerId.get(String(entry?.id || ""));
            if (!petContribution) return entry;

            return {
              ...entry,
              total: Number(entry?.total || 0) + petContribution.total,
              abilities: [...(entry?.abilities || []), ...petContribution.abilities],
              casts: Number(entry?.casts || 0) + petContribution.casts,
              hits: Number(entry?.hits || 0) + petContribution.hits,
              crits: Number(entry?.crits || 0) + petContribution.crits,
            };
          });
        snapshots.push({
          fightId: String(fight.id),
          encounterId: fight.boss || 0,
          fightName: fight.name || "Unknown Fight",
          damageDone: {
            ...damageDone,
            entries: enrichedEntries,
          },
        });
      } catch (error) {
        console.warn("RPB damage fight snapshot fallback", {
          reportId,
          fightId: String(fight.id),
          fightName: fight?.name || "Unknown Fight",
          message: error?.message || String(error || ""),
        });
        snapshots.push({
          fightId: String(fight.id),
          encounterId: fight.boss || 0,
          fightName: fight.name || "Unknown Fight",
          damageDone: {
            entries: [],
          },
        });
      }
    } catch (error) {
      console.warn("RPB damage fight iteration fallback", {
        reportId,
        fightId: String(fight.id),
        fightName: fight?.name || "Unknown Fight",
        message: error?.message || String(error || ""),
      });
      snapshots.push({
        fightId: String(fight.id),
        encounterId: fight.boss || 0,
        fightName: fight.name || "Unknown Fight",
        damageDone: {
          entries: [],
        },
      });
    }
  }

  return { snapshots };
}

async function fetchFightHealingSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = getSnapshotEligibleFights(fightsData.fights || []);

  const snapshots = [];
  for (const fight of snapshotFights) {
    const [casts, healing] = await Promise.all([
      wclFetch(`/report/tables/casts/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        by: "source",
      }, apiKeyOverride),
      wclFetch(`/report/tables/healing/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        by: "source",
        options: 2,
      }, apiKeyOverride),
    ]);

    const enrichedEntries = enrichFightMetricEntries(healing?.entries || [], casts, "All Healing");

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      healing: {
        ...healing,
        entries: enrichedEntries,
      },
    });
  }

  return { snapshots };
}

async function fetchFightDeathsSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = getSnapshotEligibleFights(fightsData.fights || []);
  const deathActorLookup = buildDeathActorLookup(fightsData);

  const snapshots = [];
  for (const fight of snapshotFights) {
    const deaths = await wclFetch(`/report/tables/deaths/${reportId}`, {
      start: fight.start_time ?? 0,
      end: fight.end_time ?? 0,
      by: "target",
    }, apiKeyOverride);
    let summaryEvents = [];
    try {
      summaryEvents = await fetchAllEventPages(`/report/events/summary/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
      }, apiKeyOverride);
    } catch (error) {
      console.warn("RPB death summary HP lookup failed", {
        reportId,
        fightId: fight?.id,
        fightName: fight?.name,
        error: error?.message || String(error),
      });
    }
    let healingEvents = [];
    try {
      healingEvents = await fetchAllEventPages(`/report/events/healing/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
      }, apiKeyOverride);
    } catch (error) {
      console.warn("RPB death healing window lookup failed", {
        reportId,
        fightId: fight?.id,
        fightName: fight?.name,
        error: error?.message || String(error),
      });
    }
    const healingEventsByTarget = groupHealingEventsByTarget(healingEvents, deathActorLookup);
    const summaryStateByTarget = groupSummaryEventsByTarget(summaryEvents);
    const summaryTimelineByTarget = groupSummaryTimelineEventsByTarget(summaryEvents, deathActorLookup);
    const deathsWithSummaryState = attachSummaryStateToDeathEntries(
      deaths?.entries || [],
      summaryStateByTarget
    );

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      deaths: {
        ...deaths,
        entries: attachHealingWindowsToDeathEntries(
          deathsWithSummaryState,
          healingEventsByTarget,
          summaryTimelineByTarget
        ),
      },
    });
  }

  return { snapshots };
}

async function fetchFightBuffSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );
  const players = (fightsData.friendlies || []).filter(player =>
    PLAYER_TYPES.has(player?.type) && player?.id != null && player?.name
  );

  const snapshots = [];
  for (const fight of snapshotFights) {
    const entries = await Promise.all(players.map(async player => {
      const buffs = await wclFetch(`/report/tables/buffs/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        targetid: player.id,
      }, apiKeyOverride);

      return {
        id: String(player.id),
        name: player.name || "Unknown Player",
        type: player.type || "",
        auras: buffs?.auras || [],
      };
    }));

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      buffs: {
        entries,
        startTime: fight.start_time ?? 0,
        endTime: fight.end_time ?? 0,
        totalTime: getDurationMs(fight.start_time, fight.end_time),
      },
    });
  }

  return { snapshots };
}

async function fetchFightDebuffSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );
  const sourceLookup = new Map(
    (fightsData.friendlies || [])
      .filter(entry => entry?.id != null)
      .map(entry => [String(entry.id), { name: entry.name || "Unknown", type: entry.type || "" }])
  );

  const snapshots = [];
  for (const fight of snapshotFights) {
    const durationMs = getDurationMs(fight.start_time, fight.end_time);
    let debuffsByAbility = {};

    try {
      debuffsByAbility = await wclFetch(`/report/tables/debuffs/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        hostility: 1,
        by: "ability",
        options: 2,
      }, apiKeyOverride);
    } catch (error) {
      console.warn("RPB debuffsByFight lookup failed", {
        reportId,
        fightId: fight?.id,
        fightName: fight?.name,
        error: error?.message || String(error),
      });
    }

    const debuffSummary = summarizeTrackedBossDebuffs(
      debuffsByAbility,
      Number(fight.start_time ?? 0),
      Number(fight.end_time ?? 0)
    );
    const trackedSpellIds = new Set(TRACKED_BOSS_DEBUFF_SPELL_IDS);

    let sourceEvents = [];
    if (trackedSpellIds.size > 0) {
      try {
        sourceEvents = await fetchAllEventPages(`/report/events/debuffs/${reportId}`, {
          start: fight.start_time ?? 0,
          end: fight.end_time ?? 0,
          hostility: 1,
          filter: buildAbilityIdFilter(trackedSpellIds),
        }, apiKeyOverride);
      } catch (error) {
        console.warn("RPB debuff source event lookup failed", {
          reportId,
          fightId: fight?.id,
          fightName: fight?.name,
          error: error?.message || String(error),
        });
      }
    }
    const sourcesByDebuffKey = collectTrackedBossDebuffSourcesFromEvents(sourceEvents, sourceLookup);
    const maxStacksByDebuffKey = collectTrackedBossDebuffMaxStacksFromEvents(sourceEvents);
    const eventBandsByDebuffKey = collectTrackedBossDebuffBandsFromEvents(
      sourceEvents,
      Number(fight.start_time ?? 0),
      Number(fight.end_time ?? 0)
    );
    const mergedDebuffs = mergeTrackedBossDebuffRows(
      debuffSummary,
      sourcesByDebuffKey,
      maxStacksByDebuffKey,
      eventBandsByDebuffKey,
      durationMs
    );
    const bloodFrenzyEstimate = await estimateBloodFrenzyContribution(
      reportId,
      fight,
      apiKeyOverride,
    );
    if (bloodFrenzyEstimate) {
      mergedDebuffs.push(bloodFrenzyEstimate);
      mergedDebuffs.sort((a, b) => Number(a.order ?? 99) - Number(b.order ?? 99));
    }

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      startTime: fight.start_time ?? 0,
      endTime: fight.end_time ?? 0,
      durationMs,
      debuffs: mergedDebuffs,
    });
  }

  return { snapshots };
}

function buildTargetKeyFromEvent(event = {}) {
  return String(
    event?.targetID
    ?? event?.targetId
    ?? event?.target?.id
    ?? event?.targetInstance
    ?? event?.targetName
    ?? "unknown-target"
  );
}

function mergeAbsoluteWindows(windows = []) {
  const normalized = (windows || [])
    .map(window => ({
      start: Number(window?.start || 0),
      end: Number(window?.end || 0),
    }))
    .filter(window => window.end > window.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const window of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || window.start > previous.end) {
      merged.push({ ...window });
      continue;
    }
    previous.end = Math.max(previous.end, window.end);
  }

  return merged;
}

function buildBloodFrenzyProxyWindows(events = [], fightStartMs = 0, fightEndMs = 0) {
  const activeByTarget = new Map();
  const windowsByTarget = new Map();

  function flushWindow(targetKey, endTimestamp) {
    if (!activeByTarget.has(targetKey)) return;
    const startTimestamp = Number(activeByTarget.get(targetKey) || 0);
    const end = Math.max(startTimestamp, Math.min(Number(fightEndMs || 0), Number(endTimestamp || 0)));
    if (end > startTimestamp) {
      const windows = windowsByTarget.get(targetKey) || [];
      windows.push({ start: startTimestamp, end });
      windowsByTarget.set(targetKey, windows);
    }
    activeByTarget.delete(targetKey);
  }

  for (const event of events) {
    const spellId = String(event?.abilityGameID ?? event?.ability?.guid ?? event?.guid ?? "").trim();
    if (!BLOOD_FRENZY_PROXY_DEBUFF_IDS.includes(spellId)) continue;
    const targetKey = buildTargetKeyFromEvent(event);
    const eventType = String(event?.type || "").toLowerCase();
    const timestamp = Number(event?.timestamp || 0);

    if (eventType === "applydebuff" || eventType === "refreshdebuff" || eventType === "applydebuffstack" || eventType === "applydebuffdose") {
      if (!activeByTarget.has(targetKey)) {
        activeByTarget.set(targetKey, timestamp);
      }
      continue;
    }

    if (eventType === "removedebuff" || eventType === "removedebuffstack" || eventType === "removedebuffdose") {
      flushWindow(targetKey, timestamp);
    }
  }

  for (const [targetKey] of activeByTarget.entries()) {
    flushWindow(targetKey, fightEndMs);
  }

  return new Map(
    [...windowsByTarget.entries()].map(([targetKey, windows]) => [targetKey, mergeAbsoluteWindows(windows)])
  );
}

function isTimestampWithinWindows(timestamp = 0, windows = []) {
  const numericTimestamp = Number(timestamp || 0);
  for (const window of windows || []) {
    if (numericTimestamp >= Number(window?.start || 0) && numericTimestamp <= Number(window?.end || 0)) return true;
  }
  return false;
}

async function estimateBloodFrenzyContribution(reportId, fight, apiKeyOverride = "") {
  const start = Number(fight?.start_time ?? 0);
  const end = Number(fight?.end_time ?? 0);
  const durationMs = getDurationMs(start, end);
  if (durationMs <= 0) return null;

  let proxyEvents = [];
  let summaryEvents = [];

  try {
    proxyEvents = await fetchAllEventPages(`/report/events/debuffs/${reportId}`, {
      start,
      end,
      hostility: 1,
      filter: `ability.id IN (${BLOOD_FRENZY_PROXY_DEBUFF_IDS.join(",")})`,
    }, apiKeyOverride);
    summaryEvents = await fetchAllEventPages(`/report/events/summary/${reportId}`, {
      start,
      end,
    }, apiKeyOverride);
  } catch (error) {
    console.warn("RPB blood frenzy estimate lookup failed", {
      reportId,
      fightId: fight?.id,
      fightName: fight?.name,
      error: error?.message || String(error),
    });
    return null;
  }

  const proxyWindowsByTarget = buildBloodFrenzyProxyWindows(proxyEvents, start, end);
  const relativeBands = mergeBands(
    [...proxyWindowsByTarget.values()]
      .flatMap(windows => windows)
      .map(window => ({
        startMs: Math.max(0, Number(window.start || 0) - start),
        endMs: Math.max(0, Number(window.end || 0) - start),
      }))
  );
  const totalUptime = relativeBands.reduce((sum, band) => sum + Math.max(0, Number(band.endMs || 0) - Number(band.startMs || 0)), 0);

  let qualifyingPhysicalDamage = 0;
  let qualifyingEventCount = 0;
  for (const event of summaryEvents || []) {
    if (event?.type !== "damage") continue;
    if (!event?.sourceIsFriendly || event?.targetIsFriendly) continue;
    if (Number(event?.ability?.type || 0) !== 1) continue;
    const targetWindows = proxyWindowsByTarget.get(buildTargetKeyFromEvent(event)) || [];
    if (!isTimestampWithinWindows(event?.timestamp, targetWindows)) continue;

    qualifyingPhysicalDamage += Math.max(0, Number(event?.amount || 0)) + Math.max(0, Number(event?.absorb || 0));
    qualifyingEventCount += 1;
  }

  const estimatedBonusDamage = qualifyingPhysicalDamage * BLOOD_FRENZY_ESTIMATE_MULTIPLIER;
  const estimatedBonusDps = durationMs > 0 ? estimatedBonusDamage / (durationMs / 1000) : 0;

  return {
    key: "blood-frenzy-estimate",
    label: "Blood Frenzy",
    preferredClass: "Warrior",
    order: 0,
    guid: null,
    totalUses: qualifyingEventCount,
    totalUptime,
    bands: relativeBands,
    maxStacks: 0,
    uptimePercent: durationMs > 0 ? (totalUptime / durationMs) * 100 : 0,
    estimatedDamage: estimatedBonusDamage,
    estimatedDps: estimatedBonusDps,
    qualifyingPhysicalDamage,
    estimated: true,
    sources: [],
  };
}

async function fetchAllEventPages(path, params = {}, apiKeyOverride = "") {
  const events = [];
  let nextStart = params.start ?? 0;
  let hasNext = true;

  while (hasNext) {
    const payload = await wclFetch(path, { ...params, start: nextStart }, apiKeyOverride);
    events.push(...(payload?.events || []));
    const nextPageTimestamp = Number(payload?.nextPageTimestamp || 0);
    hasNext = nextPageTimestamp > 0 && nextPageTimestamp !== nextStart;
    nextStart = nextPageTimestamp;
  }

  return events;
}

function getDrumTypeLabel(guid) {
  return DRUMS_TYPE_LABELS.get(String(guid || "")) || "Unknown";
}

function normalizeTrackedAuraName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchTrackedBossDebuff(guid, name) {
  const normalizedGuid = String(guid || "").trim();
  const normalizedName = normalizeTrackedAuraName(name);

  return TRACKED_BOSS_DEBUFFS.find(entry => (
    (entry.spellIds && entry.spellIds.has(normalizedGuid))
    || entry.aliases.some(alias => normalizedName === alias || normalizedName.includes(alias))
  )) || null;
}

function getNestedSourceRows(entry) {
  return [
    entry?.sources,
    entry?.entries,
    entry?.targets,
  ].find(value => Array.isArray(value) && value.length > 0) || [];
}

function getDebuffCastCount(entry) {
  const value = Number(
    entry?.totalUses
    ?? entry?.uses
    ?? entry?.casts
    ?? entry?.useCount
    ?? entry?.count
    ?? 0
  );
  return Number.isFinite(value) ? value : 0;
}

function getDebuffUptimeMs(entry) {
  const value = Number(
    entry?.totalUptime
    ?? entry?.uptime
    ?? entry?.activeTime
    ?? 0
  );
  return Number.isFinite(value) ? value : 0;
}

function normalizeDebuffBands(entry, fightStartMs, fightEndMs) {
  const bands = Array.isArray(entry?.bands) ? entry.bands : [];
  const normalizedBands = [];

  for (const band of bands) {
    const startTime = Number(band?.startTime || 0);
    const endTime = Number(band?.endTime || 0);
    if (!(endTime > startTime)) continue;

    const clippedStart = Math.max(fightStartMs, startTime);
    const clippedEnd = Math.min(fightEndMs, endTime);
    if (!(clippedEnd > clippedStart)) continue;

    normalizedBands.push({
      startMs: clippedStart - fightStartMs,
      endMs: clippedEnd - fightStartMs,
    });
  }

  if (normalizedBands.length > 0) return normalizedBands;

  const totalUptime = getDebuffUptimeMs(entry);
  if (totalUptime > 0) {
    return [{
      startMs: 0,
      endMs: Math.max(0, Math.min(fightEndMs - fightStartMs, totalUptime)),
    }];
  }

  return [];
}

function mergeBands(bands = []) {
  const normalized = (bands || [])
    .map(band => ({
      startMs: Number(band?.startMs || 0),
      endMs: Number(band?.endMs || 0),
    }))
    .filter(band => band.endMs > band.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged = [];
  for (const band of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || band.startMs > previous.endMs) {
      merged.push({ ...band });
      continue;
    }

    previous.endMs = Math.max(previous.endMs, band.endMs);
  }

  return merged;
}

function getNestedAbilityRows(entry) {
  return [
    entry?.abilities,
    entry?.entries,
    entry?.spells,
    entry?.targets,
    entry?.auras,
  ].find(value => Array.isArray(value) && value.length > 0) || [];
}

function summarizeTrackedBossDebuffs(tableData, fightStartMs, fightEndMs) {
  const fightDurationMs = Math.max(0, fightEndMs - fightStartMs);
  const grouped = new Map();
  const rows = [
    ...(Array.isArray(tableData?.entries) ? tableData.entries : []),
    ...(Array.isArray(tableData?.auras) ? tableData.auras : []),
  ];

  for (const row of rows) {
    const tracker = matchTrackedBossDebuff(
      row?.guid ?? row?.gameID ?? row?.abilityGameID ?? row?.id ?? null,
      row?.name || row?.abilityName || row?.ability?.name || ""
    );
    if (!tracker) continue;

    const existing = grouped.get(tracker.key) || {
      key: tracker.key,
      label: tracker.label,
      preferredClass: tracker.preferredClass || "",
      order: Number(tracker.order || 0),
      guid: row?.guid ?? row?.gameID ?? row?.abilityGameID ?? row?.id ?? null,
      totalUses: 0,
      totalUptime: 0,
      bands: [],
      maxStacks: 0,
      sources: new Map(),
    };

    existing.totalUses += getDebuffCastCount(row);
    existing.totalUptime += getDebuffUptimeMs(row);
    existing.bands.push(...normalizeDebuffBands(row, fightStartMs, fightEndMs));

    for (const sourceRow of getNestedSourceRows(row)) {
      const casts = getDebuffCastCount(sourceRow);
      if (casts <= 0) continue;

      const sourceKey = String(
        sourceRow?.id
        ?? sourceRow?.sourceID
        ?? sourceRow?.sourceId
        ?? sourceRow?.guid
        ?? sourceRow?.name
        ?? `source-${existing.sources.size + 1}`
      );
      const sourceEntry = existing.sources.get(sourceKey) || {
        sourceId: sourceRow?.id ?? sourceRow?.sourceID ?? sourceRow?.sourceId ?? null,
        name: sourceRow?.name || sourceRow?.sourceName || "Unknown",
        type: sourceRow?.type || sourceRow?.sourceType || "",
        casts: 0,
      };
      sourceEntry.casts += casts;
      existing.sources.set(sourceKey, sourceEntry);
    }

    grouped.set(tracker.key, existing);
  }

  return [...grouped.values()]
    .map(entry => {
      const mergedBands = mergeBands(entry.bands);
      const cappedTotalUptime = mergedBands.reduce((sum, band) => sum + Math.max(0, band.endMs - band.startMs), 0);
      return {
        key: entry.key,
        label: entry.label,
        preferredClass: entry.preferredClass || "",
        order: Number(entry.order || 0),
        guid: entry.guid,
        totalUses: entry.totalUses,
        totalUptime: cappedTotalUptime,
        bands: mergedBands,
        maxStacks: Number(entry.maxStacks || 0),
        uptimePercent: fightDurationMs > 0 ? (cappedTotalUptime / fightDurationMs) * 100 : 0,
        sources: [...entry.sources.values()].sort((a, b) => {
          if (b.casts !== a.casts) return b.casts - a.casts;
          return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        }),
      };
    })
    .sort((a, b) => {
      return Number(a.order ?? 99) - Number(b.order ?? 99);
    });
}

function collectTrackedBossDebuffSources(tableData) {
  const grouped = new Map();
  const sourceRows = [
    ...(Array.isArray(tableData?.entries) ? tableData.entries : []),
    ...(Array.isArray(tableData?.sources) ? tableData.sources : []),
  ];

  for (const sourceRow of sourceRows) {
    const sourceName = sourceRow?.name || sourceRow?.sourceName || "Unknown";
    const sourceId = sourceRow?.id ?? sourceRow?.sourceID ?? sourceRow?.sourceId ?? null;
    const sourceType = sourceRow?.type || sourceRow?.sourceType || "";

    for (const debuffRow of getNestedAbilityRows(sourceRow)) {
      const tracker = matchTrackedBossDebuff(
        debuffRow?.guid ?? debuffRow?.gameID ?? debuffRow?.abilityGameID ?? debuffRow?.id ?? null,
        debuffRow?.name || debuffRow?.abilityName || debuffRow?.ability?.name || ""
      );
      if (!tracker) continue;

      const casts = getDebuffCastCount(debuffRow);
      if (casts <= 0) continue;

      const trackedSources = grouped.get(tracker.key) || new Map();
      const trackedSourceKey = String(sourceId ?? sourceName);
      const trackedSource = trackedSources.get(trackedSourceKey) || {
        sourceId,
        name: sourceName,
        type: sourceType,
        casts: 0,
      };
      trackedSource.casts += casts;
      trackedSources.set(trackedSourceKey, trackedSource);
      grouped.set(tracker.key, trackedSources);
    }
  }

  return grouped;
}

function collectTrackedBossDebuffSourcesFromEvents(events = [], sourceLookup = new Map()) {
  const grouped = new Map();

  for (const event of events) {
    const eventType = String(event?.type || "").toLowerCase();
    if (
      !eventType.startsWith("applydebuff")
      && !eventType.startsWith("refreshdebuff")
      && !eventType.startsWith("applydebuffstack")
      && !eventType.startsWith("applydebuffdose")
    ) continue;

    const tracker = matchTrackedBossDebuff(
      event?.abilityGameID
      ?? event?.ability?.guid
      ?? event?.ability?.gameID
      ?? event?.guid
      ?? null,
      event?.ability?.name || event?.name || ""
    );
    if (!tracker) continue;

    const sourceMap = grouped.get(tracker.key) || new Map();
    const sourceKey = String(
      event?.sourceID
      ?? event?.sourceId
      ?? event?.source?.id
      ?? event?.sourceName
      ?? event?.source?.name
      ?? "unknown-source"
    );
    const lookupEntry = sourceLookup.get(String(
      event?.sourceID
      ?? event?.sourceId
      ?? event?.source?.id
      ?? ""
    )) || null;
    const sourceEntry = sourceMap.get(sourceKey) || {
      sourceId: event?.sourceID ?? event?.sourceId ?? event?.source?.id ?? null,
      name: event?.sourceName || event?.source?.name || lookupEntry?.name || "Unknown",
      type: event?.source?.type || lookupEntry?.type || "",
      casts: 0,
    };
    sourceEntry.casts += 1;
    sourceMap.set(sourceKey, sourceEntry);
    grouped.set(tracker.key, sourceMap);
  }

  return grouped;
}

function collectTrackedBossDebuffBandsFromEvents(events = [], fightStartMs = 0, fightEndMs = 0) {
  const grouped = new Map();
  const activeByTarget = new Map();
  const relativeFightEndMs = Math.max(0, Number(fightEndMs || 0) - Number(fightStartMs || 0));

  function getTargetKey(event) {
    return String(
      event?.targetID
      ?? event?.targetId
      ?? event?.target?.id
      ?? event?.targetInstance
      ?? event?.targetName
      ?? "unknown-target"
    );
  }

  function closeBand(trackerKey, targetKey, timestampMs) {
    const targetMap = activeByTarget.get(trackerKey);
    if (!targetMap || !targetMap.has(targetKey)) return;
    const startMs = Number(targetMap.get(targetKey) || 0);
    const endMs = Math.max(startMs, Math.min(relativeFightEndMs, Number(timestampMs || 0) - Number(fightStartMs || 0)));
    if (endMs > startMs) {
      const bands = grouped.get(trackerKey) || [];
      bands.push({ startMs, endMs });
      grouped.set(trackerKey, bands);
    }
    targetMap.delete(targetKey);
    if (!targetMap.size) activeByTarget.delete(trackerKey);
  }

  for (const event of events) {
    const tracker = matchTrackedBossDebuff(
      event?.abilityGameID
      ?? event?.ability?.guid
      ?? event?.ability?.gameID
      ?? event?.guid
      ?? null,
      event?.ability?.name || event?.name || ""
    );
    if (!tracker) continue;

    const eventType = String(event?.type || "").toLowerCase();
    const targetKey = getTargetKey(event);
    const relativeTimestampMs = Math.max(0, Math.min(relativeFightEndMs, Number(event?.timestamp || 0) - Number(fightStartMs || 0)));
    const targetMap = activeByTarget.get(tracker.key) || new Map();
    const shouldStart =
      eventType === "applydebuff"
      || eventType === "refreshdebuff"
      || eventType === "applydebuffstack"
      || eventType === "applydebuffdose";
    const shouldClose =
      eventType === "removedebuff"
      || eventType === "removedebuffstack"
      || eventType === "removedebuffdose";

    if (shouldStart) {
      if (!targetMap.has(targetKey)) {
        targetMap.set(targetKey, relativeTimestampMs);
      }
      activeByTarget.set(tracker.key, targetMap);
      continue;
    }

    if (shouldClose) {
      closeBand(tracker.key, targetKey, Number(event?.timestamp || 0));
    }
  }

  for (const [trackerKey, targetMap] of activeByTarget.entries()) {
    for (const [targetKey] of targetMap.entries()) {
      closeBand(trackerKey, targetKey, fightEndMs);
    }
  }
  return new Map(
    [...grouped.entries()].map(([key, bands]) => [key, mergeBands(bands)])
  );
}

function mergeTrackedBossDebuffRows(
  debuffSummary = [],
  sourcesByDebuffKey = new Map(),
  maxStacksByDebuffKey = new Map(),
  eventBandsByDebuffKey = new Map(),
  durationMs = 0
) {
  const rowsByKey = new Map();

  for (const entry of debuffSummary || []) {
    rowsByKey.set(entry.key, {
      ...entry,
      bands: mergeBands([
        ...(entry?.bands || []),
        ...(eventBandsByDebuffKey.get(entry.key) || []),
      ]),
    });
  }

  for (const tracker of TRACKED_BOSS_DEBUFFS) {
    if (rowsByKey.has(tracker.key)) continue;
    if (!sourcesByDebuffKey.has(tracker.key) && !eventBandsByDebuffKey.has(tracker.key)) continue;

    const bands = mergeBands(eventBandsByDebuffKey.get(tracker.key) || []);
    const totalUptime = bands.reduce((sum, band) => sum + Math.max(0, Number(band?.endMs || 0) - Number(band?.startMs || 0)), 0);
    rowsByKey.set(tracker.key, {
      key: tracker.key,
      label: tracker.label,
      preferredClass: tracker.preferredClass || "",
      order: Number(tracker.order || 0),
      guid: null,
      totalUses: 0,
      totalUptime,
      bands,
      maxStacks: 0,
      uptimePercent: durationMs > 0 ? (totalUptime / durationMs) * 100 : 0,
      sources: [],
    });
  }

  return [...rowsByKey.values()]
    .map(entry => {
      const bands = mergeBands([
        ...(entry?.bands || []),
        ...(eventBandsByDebuffKey.get(entry.key) || []),
      ]);
      const totalUptime = bands.reduce((sum, band) => sum + Math.max(0, Number(band?.endMs || 0) - Number(band?.startMs || 0)), 0);
      return {
        ...entry,
        totalUptime,
        bands,
        maxStacks: Number(maxStacksByDebuffKey.get(entry.key) || entry.maxStacks || 0),
        uptimePercent: durationMs > 0 ? (totalUptime / durationMs) * 100 : 0,
        sources: [...(sourcesByDebuffKey.get(entry.key)?.values() || [])].sort((a, b) => {
          if (b.casts !== a.casts) return b.casts - a.casts;
          return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        }),
      };
    })
    .sort((a, b) => {
      return Number(a.order ?? 99) - Number(b.order ?? 99);
    });
}

function collectTrackedBossDebuffMaxStacksFromEvents(events = []) {
  const grouped = new Map();

  for (const event of events) {
    const tracker = matchTrackedBossDebuff(
      event?.abilityGameID
      ?? event?.ability?.guid
      ?? event?.ability?.gameID
      ?? event?.guid
      ?? null,
      event?.ability?.name || event?.name || ""
    );
    if (!tracker) continue;

    const explicitStack = Number(event?.stack ?? event?.stacks ?? 0);
    const value = Number.isFinite(explicitStack) && explicitStack > 0 ? explicitStack : 0;
    if (value > Number(grouped.get(tracker.key) || 0)) {
      grouped.set(tracker.key, value);
    }
  }

  return grouped;
}

function normalizeTrackedConsumableName(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeSpellId(spellId) {
  return String(spellId ?? "").trim();
}

function isManaPotionSpellId(spellId) {
  return MANA_POTION_ABILITY_IDS.has(normalizeSpellId(spellId));
}

function isDarkRuneSpellId(spellId) {
  return DARK_RUNE_ABILITY_IDS.has(normalizeSpellId(spellId));
}

function getResourceRecoveryLabel(name, spellId = null) {
  const normalizedSpellId = normalizeSpellId(spellId);
  if (normalizedSpellId === "28499") return "Mana Potion";
  if (normalizedSpellId === "27869") return "Dark Rune";
  if (normalizedSpellId === "16666") return "Demonic Rune";
  return name || "Unknown Consumable";
}

function nameIncludesAnyToken(name, tokens = []) {
  const normalized = normalizeTrackedConsumableName(name);
  return !!normalized && tokens.some(token => normalized.includes(token));
}

function isTrackedPotionEventName(name, spellId = null) {
  return isManaPotionSpellId(spellId) || nameIncludesAnyToken(name, POTION_EVENT_NAME_TOKENS);
}

function isTrackedPotionBuffName(name) {
  return nameIncludesAnyToken(name, POTION_BUFF_NAME_TOKENS);
}

function isTrackedPotionHealName(name) {
  return nameIncludesAnyToken(name, POTION_HEAL_NAME_TOKENS);
}

function isHealthstoneName(name) {
  return normalizeTrackedConsumableName(name).includes("healthstone");
}

function isDarkRuneName(name, spellId = null) {
  if (isDarkRuneSpellId(spellId)) return true;
  const normalized = normalizeTrackedConsumableName(name);
  return normalized.includes("dark rune") || normalized.includes("demonic rune");
}

function isNightmareSeedName(name) {
  return normalizeTrackedConsumableName(name).includes("nightmare seed");
}

function isManaPotionName(name, spellId = null) {
  if (isManaPotionSpellId(spellId)) return true;
  const normalized = normalizeTrackedConsumableName(name);
  return normalized.includes("mana potion") || normalized.includes("restore mana");
}

function isHealingPotionName(name) {
  return normalizeTrackedConsumableName(name).includes("healing potion");
}

function isGenericPotionName(name) {
  return normalizeTrackedConsumableName(name).includes("potion");
}

function isBuffPotionName(name) {
  const normalized = normalizeTrackedConsumableName(name);
  return normalized.includes("destruction")
    || normalized.includes("haste")
    || normalized.includes("ironshield")
    || normalized.includes("fel mana")
    || normalized.includes("insane strength")
    || normalized.includes("heroic potion");
}

function classifyPotionEventName(name, hasBuffWindow = false, spellId = null) {
  if (isHealthstoneName(name)) {
    return { category: "healthstone", section: "recovery", eventKind: "instant_survival" };
  }
  if (isDarkRuneName(name, spellId)) {
    return { category: "dark_rune", section: "recovery", eventKind: "instant_resource" };
  }
  if (isManaPotionName(name, spellId)) {
    return { category: "mana_potion", section: "recovery", eventKind: "instant_resource" };
  }
  if (isHealingPotionName(name)) {
    return { category: "healing_potion", section: "recovery", eventKind: "instant_survival" };
  }
  if (isNightmareSeedName(name)) {
    return {
      category: "nightmare_seed",
      section: hasBuffWindow ? "combat" : "recovery",
      eventKind: hasBuffWindow ? "combat_buff" : "instant_survival",
    };
  }
  if (isBuffPotionName(name)) {
    return {
      category: "potion",
      section: hasBuffWindow ? "combat" : "recovery",
      eventKind: hasBuffWindow ? "combat_buff" : "instant_resource",
    };
  }
  if (isGenericPotionName(name)) {
    return {
      category: "potion",
      section: hasBuffWindow ? "combat" : "recovery",
      eventKind: hasBuffWindow ? "combat_buff" : "instant_resource",
    };
  }
  return {
    category: "consumable",
    section: hasBuffWindow ? "combat" : "recovery",
    eventKind: hasBuffWindow ? "combat_buff" : "instant_resource",
  };
}

function collectMatchingAbilityIdsFromTable(tableData = {}, matcher = () => false) {
  const ids = new Set();

  for (const entry of tableData?.entries || []) {
    for (const ability of getAbilityRows(entry, "Ability")) {
      const guid = ability?.guid != null ? String(ability.guid) : "";
      if (!guid || !matcher(ability?.name || "", guid)) continue;
      ids.add(guid);
    }
  }

  return ids;
}

function collectMatchingAuraIdsFromTable(tableData = {}, matcher = () => false) {
  const ids = new Set();

  for (const entry of tableData?.entries || []) {
    for (const aura of entry?.auras || []) {
      const guid = aura?.guid != null ? String(aura.guid) : "";
      const name = aura?.name || aura?.abilityName || "";
      if (!guid || !matcher(name)) continue;
      ids.add(guid);
    }
  }

  return ids;
}

function buildAbilityIdFilter(ids = new Set()) {
  const values = [...ids].filter(Boolean);
  if (!values.length) return "";
  return `ability.id IN (${values.join(",")})`;
}

function getPotionEventTimestamp(event, fallback = 0) {
  const timestamp = Number(event?.timestamp);
  return Number.isFinite(timestamp) ? timestamp : Number(fallback || 0);
}

function buildPotionBuffWindows(buffEvents = [], fight = {}) {
  const openWindows = new Map();
  const windows = [];
  const sorted = [...(buffEvents || [])]
    .filter(event => {
      const type = String(event?.type || "").toLowerCase();
      return type === "applybuff" || type === "refreshbuff" || type === "removebuff";
    })
    .sort((left, right) => getPotionEventTimestamp(left) - getPotionEventTimestamp(right));

  const closeWindow = (key, timestamp) => {
    const current = openWindows.get(key);
    if (!current) return;

    windows.push({
      ...current,
      endTimestamp: Math.max(current.startTimestamp, Number(timestamp || current.startTimestamp)),
    });
    openWindows.delete(key);
  };

  for (const event of sorted) {
    const type = String(event?.type || "").toLowerCase();
    const name = event?.ability?.name || event?.abilityName || event?.name || "";
    if (!isTrackedPotionBuffName(name)) continue;

    const guid = String(event?.ability?.guid || event?.abilityGameID || "");
    const actorId = String(event?.sourceID || event?.targetID || "");
    if (!actorId) continue;

    const actorName = event?.sourceName || event?.targetName || "Unknown Player";
    const key = `${actorId}:${guid || normalizeTrackedConsumableName(name)}`;
    const timestamp = getPotionEventTimestamp(event);

    if (type === "removebuff") {
      closeWindow(key, timestamp);
      continue;
    }

    if (openWindows.has(key)) {
      closeWindow(key, timestamp);
    }

    openWindows.set(key, {
      key,
      playerId: actorId,
      playerName: actorName,
      guid,
      name,
      startTimestamp: timestamp,
    });
  }

  for (const current of openWindows.values()) {
    windows.push({
      ...current,
      endTimestamp: Math.max(current.startTimestamp, Number(fight?.end_time || current.startTimestamp)),
    });
  }

  return windows.sort((left, right) => left.startTimestamp - right.startTimestamp);
}

function namesLikelyMatch(left, right) {
  const leftName = normalizeTrackedConsumableName(left);
  const rightName = normalizeTrackedConsumableName(right);
  if (!leftName || !rightName) return false;
  if (leftName === rightName) return true;

  const categoryChecks = [
    isHealthstoneName,
    isDarkRuneName,
    isNightmareSeedName,
    isManaPotionName,
    isHealingPotionName,
  ];

  return categoryChecks.some(check => check(leftName) && check(rightName));
}

function summarizePotionEvents(
  fight,
  castEvents = [],
  buffEvents = [],
  healingEvents = [],
  resourceEvents = [],
  playerNamesById = new Map(),
) {
  const windows = buildPotionBuffWindows(buffEvents, fight);
  const remainingCastsByPlayer = new Map();
  const rowsByPlayer = new Map();
  const healingEventsByPlayer = new Map();
  const resourceEventsByPlayer = new Map();
  const matchedHealingKeys = new Set();
  const matchedResourceKeys = new Set();

  const ensurePlayer = (playerId, playerName = "Unknown Player") => {
    const key = String(playerId || "");
    if (!key) return null;
    if (!rowsByPlayer.has(key)) {
      rowsByPlayer.set(key, {
        playerId: key,
        name: playerName || "Unknown Player",
        events: [],
      });
    }
    const entry = rowsByPlayer.get(key);
    if (!entry.name && playerName) entry.name = playerName;
    return entry;
  };

  const attachHealingAmount = row => {
    if (!row || !(row.category === "healthstone" || row.category === "healing_potion")) return row;

    const playerHealing = healingEventsByPlayer.get(String(row.playerId || "")) || [];
    const rowTimestamp = Number(row.timestamp || 0);
    const match = playerHealing.find(event => {
      if (matchedHealingKeys.has(event.key)) return false;
      if (!namesLikelyMatch(event.name, row.label)) return false;
      const delta = Number(event.timestamp || 0) - rowTimestamp;
      return delta >= -1000 && delta <= POTION_HEAL_MATCH_WINDOW_MS;
    });

    if (!match) return row;
    matchedHealingKeys.add(match.key);
    return {
      ...row,
      amount: Number(match.amount || 0),
      healTimestamp: Number(match.timestamp || 0),
    };
  };

  const pushRow = row => {
    const player = ensurePlayer(row?.playerId, row?.playerName);
    if (!player) return;
    player.events.push(attachHealingAmount(row));
  };

  const attachResourceAmount = row => {
    if (!row || row.eventKind !== "instant_resource") return row;

    const playerResources = resourceEventsByPlayer.get(String(row.playerId || "")) || [];
    const rowTimestamp = Number(row.timestamp || 0);
    const rowSpellId = normalizeSpellId(row.spellId);
    const match = playerResources.find(event => {
      if (matchedResourceKeys.has(event.key)) return false;
      const eventSpellId = normalizeSpellId(event.guid);
      const spellIdMatches = rowSpellId && eventSpellId && rowSpellId === eventSpellId;
      const nameMatches = namesLikelyMatch(event.name, row.label);
      if (!spellIdMatches && !nameMatches) return false;
      const delta = Number(event.timestamp || 0) - rowTimestamp;
      return delta >= -1000 && delta <= POTION_RESOURCE_MATCH_WINDOW_MS;
    });

    if (!match) return row;
    matchedResourceKeys.add(match.key);
    return {
      ...row,
      amount: Number(match.amount || 0),
      resourceTimestamp: Number(match.timestamp || 0),
    };
  };

  const pushConsumableRow = row => {
    pushRow(attachResourceAmount(row));
  };

  for (const event of castEvents || []) {
    if (String(event?.type || "").toLowerCase() !== "cast") continue;
    const name = event?.ability?.name || event?.abilityName || event?.name || "";
    const spellId = event?.ability?.guid ?? event?.abilityGameID ?? null;
    if (!isTrackedPotionEventName(name, spellId)) continue;

    const playerId = String(event?.sourceID || "");
    if (!playerId) continue;

    const list = remainingCastsByPlayer.get(playerId) || [];
    list.push({
      key: `${playerId}:${getPotionEventTimestamp(event)}:${event?.ability?.guid || name}:${list.length}`,
      playerId,
      playerName: event?.sourceName || "Unknown Player",
      guid: event?.ability?.guid ?? event?.abilityGameID ?? null,
      name,
      timestamp: getPotionEventTimestamp(event),
    });
    remainingCastsByPlayer.set(playerId, list);
  }

  for (const event of healingEvents || []) {
    const name = event?.ability?.name || event?.abilityName || event?.name || "";
    if (!isTrackedPotionHealName(name)) continue;

    const playerId = String(event?.sourceID || "");
    if (!playerId) continue;

    const list = healingEventsByPlayer.get(playerId) || [];
    list.push({
      key: `${playerId}:${getPotionEventTimestamp(event)}:${event?.ability?.guid || name}:${list.length}`,
      playerId,
      playerName: event?.sourceName || "Unknown Player",
      guid: event?.ability?.guid ?? event?.abilityGameID ?? null,
      name,
      timestamp: getPotionEventTimestamp(event),
      amount: Number(event?.amount ?? event?.healing ?? 0) || 0,
    });
    healingEventsByPlayer.set(playerId, list);
  }

  for (const event of resourceEvents || []) {
    const type = String(event?.type || "").toLowerCase();
    if (type !== "resourcechange") continue;
    const name = event?.ability?.name || event?.abilityName || event?.name || "";
    const spellId = event?.ability?.guid ?? event?.abilityGameID ?? null;
    if (!RESOURCE_RECOVERY_ABILITY_IDS.has(normalizeSpellId(spellId))) continue;

    const playerId = String(event?.sourceID || event?.targetID || "");
    if (!playerId) continue;

    const list = resourceEventsByPlayer.get(playerId) || [];
    list.push({
      key: `${playerId}:${getPotionEventTimestamp(event)}:${spellId || name}:${list.length}`,
      playerId,
      playerName: playerNamesById.get(playerId) || event?.sourceName || event?.targetName || "Unknown Player",
      guid: spellId,
      name: getResourceRecoveryLabel(name, spellId),
      timestamp: getPotionEventTimestamp(event),
      amount: Number(event?.resourceChange ?? event?.amount ?? 0) || 0,
    });
    resourceEventsByPlayer.set(playerId, list);
  }

  for (const window of windows) {
    const playerCasts = remainingCastsByPlayer.get(window.playerId) || [];
    const matchedCast = playerCasts.find(cast => {
      if (!cast) return false;
      const guidMatches = cast.guid != null && window.guid && String(cast.guid) === String(window.guid);
      const nameMatches = namesLikelyMatch(cast.name, window.name);
      if (!guidMatches && !nameMatches) return false;
      const delta = Number(window.startTimestamp || 0) - Number(cast.timestamp || 0);
      return delta >= -1000 && delta <= POTION_CAST_MATCH_WINDOW_MS;
    });

    if (matchedCast) {
      const remaining = playerCasts.filter(cast => cast.key !== matchedCast.key);
      remainingCastsByPlayer.set(window.playerId, remaining);
    }

    const label = matchedCast?.name || window.name || "Unknown Consumable";
    const classification = classifyPotionEventName(label, true);
    const relativeTimeMs = Number(window.startTimestamp || 0) - Number(fight?.start_time || 0);
    const isPrepull = relativeTimeMs < 0;
    const totalDurationMs = Math.max(0, Number(window.endTimestamp || 0) - Number(window.startTimestamp || 0));
    const combatOverlapMs = Math.max(
      0,
      Math.min(Number(window.endTimestamp || 0), Number(fight?.end_time || 0))
        - Math.max(Number(window.startTimestamp || 0), Number(fight?.start_time || 0))
    );

    pushConsumableRow({
      key: `buff:${window.playerId}:${window.guid || label}:${window.startTimestamp}`,
      playerId: window.playerId,
      playerName: window.playerName,
      label,
      spellId: matchedCast?.guid ?? (window.guid || null),
      timestamp: Number(window.startTimestamp || 0),
      relativeTimeMs,
      isPrepull,
      section: isPrepull ? "prepull" : classification.section,
      category: classification.category,
      eventKind: isPrepull ? "prepot_buff" : classification.eventKind,
      buffAppliedAtMs: relativeTimeMs,
      buffRemovedAtMs: Number(window.endTimestamp || 0) - Number(fight?.start_time || 0),
      totalDurationMs,
      combatOverlapMs,
      amount: 0,
      source: matchedCast ? "cast+buff" : "buff",
    });
  }

  for (const playerCasts of remainingCastsByPlayer.values()) {
    for (const cast of playerCasts) {
      const classification = classifyPotionEventName(cast.name, false, cast.guid);
      const relativeTimeMs = Number(cast.timestamp || 0) - Number(fight?.start_time || 0);
      const isPrepull = relativeTimeMs < 0;

      pushConsumableRow({
        key: `cast:${cast.key}`,
        playerId: cast.playerId,
        playerName: cast.playerName,
        label: getResourceRecoveryLabel(cast.name, cast.guid),
        spellId: cast.guid,
        timestamp: Number(cast.timestamp || 0),
        relativeTimeMs,
        isPrepull,
        section: isPrepull ? "prepull" : classification.section,
        category: classification.category,
        eventKind: classification.eventKind,
        buffAppliedAtMs: null,
        buffRemovedAtMs: null,
        totalDurationMs: 0,
        combatOverlapMs: 0,
        amount: 0,
        source: "cast",
      });
    }
  }

  for (const playerHealing of healingEventsByPlayer.values()) {
    for (const event of playerHealing) {
      if (matchedHealingKeys.has(event.key)) continue;
      const classification = classifyPotionEventName(event.name, false, event.guid);
      const relativeTimeMs = Number(event.timestamp || 0) - Number(fight?.start_time || 0);
      const isPrepull = relativeTimeMs < 0;

      pushRow({
        key: `heal:${event.key}`,
        playerId: event.playerId,
        playerName: event.playerName,
        label: event.name || "Unknown Consumable",
        spellId: event.guid,
        timestamp: Number(event.timestamp || 0),
        relativeTimeMs,
        isPrepull,
        section: isPrepull ? "prepull" : classification.section,
        category: classification.category,
        eventKind: classification.eventKind,
        buffAppliedAtMs: null,
        buffRemovedAtMs: null,
        totalDurationMs: 0,
        combatOverlapMs: 0,
        amount: Number(event.amount || 0),
        source: "healing",
      });
    }
  }

  for (const playerResources of resourceEventsByPlayer.values()) {
    for (const event of playerResources) {
      if (matchedResourceKeys.has(event.key)) continue;
      const classification = classifyPotionEventName(event.name, false, event.guid);
      const relativeTimeMs = Number(event.timestamp || 0) - Number(fight?.start_time || 0);
      const isPrepull = relativeTimeMs < 0;

      pushRow({
        key: `resource:${event.key}`,
        playerId: event.playerId,
        playerName: event.playerName,
        label: event.name || "Unknown Consumable",
        spellId: event.guid,
        timestamp: Number(event.timestamp || 0),
        relativeTimeMs,
        isPrepull,
        section: isPrepull ? "prepull" : classification.section,
        category: classification.category,
        eventKind: classification.eventKind,
        buffAppliedAtMs: null,
        buffRemovedAtMs: null,
        totalDurationMs: 0,
        combatOverlapMs: 0,
        amount: Number(event.amount || 0),
        source: "resource",
      });
    }
  }

  return [...rowsByPlayer.values()]
    .map(player => ({
      ...player,
      events: [...player.events].sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
}

async function fetchFightPotionSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const playerNamesById = new Map(
    (fightsData.friendlies || [])
      .filter(player => player?.id != null)
      .map(player => [String(player.id), player.name || "Unknown Player"])
  );
  const fullCastsData = await wclFetch(`/report/tables/casts/${reportId}`, {
    start: 0,
    end: 999999999999,
    by: "source",
  }, apiKeyOverride);
  const fullBuffsData = await wclFetch(`/report/tables/buffs/${reportId}`, {
    start: 0,
    end: 999999999999,
    by: "target",
    filter: "encounterid != 724",
  }, apiKeyOverride);
  const fullHealingData = await wclFetch(`/report/tables/healing/${reportId}`, {
    start: 0,
    end: 999999999999,
    by: "source",
    options: 2,
  }, apiKeyOverride);

  const castAbilityIds = new Set([
    ...MANA_POTION_ABILITY_IDS,
    ...collectMatchingAbilityIdsFromTable(fullCastsData, isTrackedPotionEventName),
  ]);
  const castFilter = buildAbilityIdFilter(castAbilityIds);
  const buffAbilityIds = new Set([
    ...collectMatchingAuraIdsFromTable(fullBuffsData, isTrackedPotionBuffName),
    ...collectMatchingAbilityIdsFromTable(fullCastsData, isTrackedPotionBuffName),
  ]);
  const buffFilter = buildAbilityIdFilter(buffAbilityIds);
  const healFilter = buildAbilityIdFilter(
    collectMatchingAbilityIdsFromTable(fullHealingData, isTrackedPotionHealName)
  );
  const snapshotFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const snapshots = [];
  for (const fight of snapshotFights) {
    const start = Math.max(0, Number(fight.start_time ?? 0) - POTIONS_PREPULL_LOOKBACK_MS);
    const end = Number(fight.end_time ?? 0);
    const castParams = castFilter ? { start, end, filter: castFilter } : null;
    const buffParams = buffFilter ? { start, end, filter: buffFilter } : null;
    const healParams = healFilter ? { start, end, filter: healFilter } : null;

    const resourceParams = {
      start,
      end,
      filter: `ability.id IN (${RESOURCE_RECOVERY_SPELL_IDS.join(",")})`,
    };
    const resourceEventsPromise = fetchAllEventPages(`/report/events/summary/${reportId}`, resourceParams, apiKeyOverride)
      .catch(error => {
        const message = String(error?.message || "");
        if (message.startsWith("WCL v1 429:")) {
          console.warn("RPB resource recovery summary lookup rate-limited", {
            reportId,
            fightId: String(fight.id),
            message,
          });
          return [];
        }
        throw error;
      });

    const [castEvents, buffEvents, healingEvents, resourceEvents] = await Promise.all([
      castParams ? fetchAllEventPages(`/report/events/casts/${reportId}`, castParams, apiKeyOverride) : Promise.resolve([]),
      buffParams ? fetchAllEventPages(`/report/events/buffs/${reportId}`, buffParams, apiKeyOverride) : Promise.resolve([]),
      healParams ? fetchAllEventPages(`/report/events/healing/${reportId}`, healParams, apiKeyOverride) : Promise.resolve([]),
      resourceEventsPromise,
    ]);

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      players: summarizePotionEvents(
        fight,
        castEvents,
        buffEvents,
        healingEvents,
        resourceEvents,
        playerNamesById,
      ),
    });
  }

  return { snapshots };
}

function buildDrumCasterLookup(drumsData = {}) {
  const byGuid = new Map();

  for (const entry of drumsData?.entries || []) {
    const playerId = String(entry?.id || "");
    if (!playerId) continue;

    for (const ability of getAbilityRows(entry, "Drums")) {
      const guid = String(ability?.guid || "");
      if (!DRUMS_ABILITY_IDS.has(guid)) continue;
      const casts = Number(ability?.casts || ability?.total || 0);
      if (casts <= 0) continue;
      const list = byGuid.get(guid) || [];
      list.push({
        playerId,
        name: entry?.name || "Unknown Player",
        casts,
      });
      byGuid.set(guid, list);
    }
  }

  return byGuid;
}

function summarizeDrumEvents(castEvents = [], buffEvents = [], knownCastersByGuid = new Map()) {
  const byPlayer = new Map();
  const directCastEventsByGuid = new Map();

  const ensurePlayer = (playerId, playerName = "Unknown Player") => {
    const key = String(playerId || "");
    if (!key) return null;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        playerId: key,
        name: playerName || "Unknown Player",
        casts: 0,
        affectedTargets: 0,
        abilityBreakdown: new Map(),
      });
    }
    const current = byPlayer.get(key);
    if (!current.name && playerName) current.name = playerName;
    return current;
  };

  const addCastToPlayer = (player, guid, amount = 1) => {
    player.casts += amount;
    const breakdownKey = `${guid}:${getDrumTypeLabel(guid)}`;
    const current = player.abilityBreakdown.get(breakdownKey) || { guid, label: getDrumTypeLabel(guid), casts: 0 };
    current.casts += amount;
    player.abilityBreakdown.set(breakdownKey, current);
  };

  for (const event of castEvents || []) {
    if (event?.type !== "cast") continue;
    const guid = String(event?.ability?.guid || "");
    if (!DRUMS_ABILITY_IDS.has(guid)) continue;
    const player = ensurePlayer(event?.sourceID, event?.sourceName);
    if (!player) continue;
    addCastToPlayer(player, guid, 1);
    const directEvents = directCastEventsByGuid.get(guid) || [];
    directEvents.push({
      playerId: player.playerId,
      name: player.name,
      timestamp: Number(event?.timestamp || 0),
    });
    directCastEventsByGuid.set(guid, directEvents);
  }

  const clusterByPlayerAndAbility = new Map();
  const unresolvedClusters = [];
  const sortedBuffs = [...(buffEvents || [])]
    .filter(event => event?.type === "applybuff")
    .sort((left, right) => Number(left?.timestamp || 0) - Number(right?.timestamp || 0));

  for (const event of sortedBuffs) {
    const guid = String(event?.ability?.guid || "");
    if (!DRUMS_ABILITY_IDS.has(guid)) continue;
    const timestamp = Number(event?.timestamp || 0);
    const targetId = String(event?.targetID || event?.targetId || event?.target?.id || event?.targetName || "");
    const sourceId = String(event?.sourceID || "");

    if (!sourceId) {
      const previous = unresolvedClusters[unresolvedClusters.length - 1];
      if (previous && previous.guid === guid && Math.abs(timestamp - previous.timestamp) <= 125) {
        if (targetId) previous.targets.add(targetId);
      } else {
        unresolvedClusters.push({
          guid,
          timestamp,
          targets: new Set(targetId ? [targetId] : []),
        });
      }
      continue;
    }

    const player = ensurePlayer(sourceId, event?.sourceName);
    if (!player) continue;

    const clusterKey = `${player.playerId}:${guid}`;
    const previous = clusterByPlayerAndAbility.get(clusterKey);
    if (previous && Math.abs(timestamp - previous.timestamp) <= 125) {
      if (targetId) previous.targets.add(targetId);
      continue;
    }

    if (previous) {
      player.affectedTargets += previous.targets.size;
    }

    clusterByPlayerAndAbility.set(clusterKey, {
      timestamp,
      targets: new Set(targetId ? [targetId] : []),
    });
  }

  for (const [clusterKey, cluster] of clusterByPlayerAndAbility.entries()) {
    const [playerId] = clusterKey.split(":");
    const player = byPlayer.get(playerId);
    if (!player) continue;
    player.affectedTargets += cluster.targets.size;
  }

  for (const cluster of unresolvedClusters) {
    const guid = String(cluster.guid || "");
    const directMatches = (directCastEventsByGuid.get(guid) || []).filter(event =>
      Math.abs(Number(event.timestamp || 0) - Number(cluster.timestamp || 0)) <= 500
    );

    if (directMatches.length === 1) {
      const player = ensurePlayer(directMatches[0].playerId, directMatches[0].name);
      if (player) player.affectedTargets += cluster.targets.size;
      continue;
    }

    const inFightCandidates = [...byPlayer.values()].filter(player =>
      [...player.abilityBreakdown.values()].some(entry => String(entry?.guid || "") === guid)
    );
    const reportCandidates = knownCastersByGuid.get(guid) || [];
    const distinctCandidates = new Map();

    for (const candidate of [...inFightCandidates, ...reportCandidates]) {
      const playerId = String(candidate?.playerId || "");
      if (!playerId) continue;
      if (!distinctCandidates.has(playerId)) {
        distinctCandidates.set(playerId, {
          playerId,
          name: candidate?.name || "Unknown Player",
        });
      }
    }

    if (distinctCandidates.size !== 1) continue;

    const [candidate] = distinctCandidates.values();
    const player = ensurePlayer(candidate.playerId, candidate.name);
    if (!player) continue;
    addCastToPlayer(player, guid, 1);
    player.affectedTargets += cluster.targets.size;
  }

  return [...byPlayer.values()].map(player => ({
    playerId: player.playerId,
    name: player.name,
    casts: player.casts,
    affectedTargets: player.affectedTargets,
    averageAffectedPerCast: player.casts > 0 ? player.affectedTargets / player.casts : 0,
    abilityBreakdown: [...player.abilityBreakdown.values()].sort((a, b) => b.casts - a.casts),
  }));
}

async function fetchFightDrumSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const drumsData = await wclFetch(`/report/tables/casts/${reportId}`, {
    start: 0,
    end: 999999999999,
    by: "source",
    filter: DRUMS_CAST_FILTER,
  }, apiKeyOverride);
  const knownCastersByGuid = buildDrumCasterLookup(drumsData);
  const snapshotFights = (fightsData.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && getDurationMs(fight.start_time, fight.end_time) > 0
  );

  const snapshots = [];
  for (const fight of snapshotFights) {
    const castParams = {
      start: Math.max(0, Number(fight.start_time ?? 0) - DRUMS_PREPULL_LOOKBACK_MS),
      end: fight.end_time ?? 0,
      by: "source",
      filter: DRUMS_CAST_FILTER,
    };
    const buffParams = {
      start: Math.max(0, Number(fight.start_time ?? 0) - DRUMS_PREPULL_LOOKBACK_MS),
      end: fight.end_time ?? 0,
      filter: DRUMS_CAST_FILTER,
    };
    const [castEvents, buffEvents] = await Promise.all([
      fetchAllEventPages(`/report/events/casts/${reportId}`, castParams, apiKeyOverride),
      fetchAllEventPages(`/report/events/buffs/${reportId}`, buffParams, apiKeyOverride),
    ]);

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      players: summarizeDrumEvents(castEvents, buffEvents, knownCastersByGuid),
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
  const inFlightKey = `${apiKey}:${cacheKey}`;
  if (wclV1InFlightRequests.has(inFlightKey)) {
    return wclV1InFlightRequests.get(inFlightKey);
  }

  const requestPromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt <= WCL_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const res = await runQueuedWclV1Request(() => fetch(url.toString()));
        if (!res.ok) {
          const text = await res.text();
          const shouldRetry = [429, 502, 503, 504].includes(res.status) && attempt < WCL_RETRY_DELAYS_MS.length;
          if (shouldRetry) {
            await sleep(WCL_RETRY_DELAYS_MS[attempt]);
            continue;
          }
          throw new Error(`WCL v1 ${res.status}: ${formatWclErrorBody(text, res.status)}`);
        }

        const data = await res.json();
        await setJsonCache(cacheKey, data, WCL_CACHE_TTL_SECONDS);
        return data;
      } catch (error) {
        lastError = error;
        const isNetworkRetryable = attempt < WCL_RETRY_DELAYS_MS.length
          && !String(error?.message || "").startsWith("WCL v1 ")
          && (
            error?.cause?.code === "EAI_AGAIN"
            || error?.cause?.code === "ECONNRESET"
            || error?.cause?.code === "ETIMEDOUT"
            || error?.name === "TypeError"
          );

        if (isNetworkRetryable) {
          await sleep(WCL_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("WCL v1 request failed");
  })();

  wclV1InFlightRequests.set(inFlightKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    wclV1InFlightRequests.delete(inFlightKey);
  }
}

function formatWclErrorBody(body, status = 0) {
  const raw = String(body || "").trim();
  if (!raw) return status === 429 ? "Too Many Requests" : "Request failed";

  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const textOnly = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (status === 429) {
    return textOnly.includes("Too Many Requests") ? "Too Many Requests" : "Too Many Requests";
  }

  return textOnly ? textOnly.slice(0, 240) : raw.slice(0, 240);
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
  if (typeof entry.deaths === "number" && entry.deaths > 0) return entry.deaths;
  if (typeof entry.total === "number" && entry.total > 0) return entry.total;
  if (entry.timestamp != null || entry.killingBlow || entry.deathWindow != null) return 1;
  if (Array.isArray(entry.events) && entry.events.length > 0) return 1;
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

function buildDeathCountLookup(items = []) {
  const byId = new Map();
  const byName = new Map();

  for (const item of items || []) {
    const count = getDeathCount(item);
    if (!(count > 0)) continue;

    if (item?.id != null) {
      const key = String(item.id);
      byId.set(key, Number(byId.get(key) || 0) + count);
    }
    if (item?.name) {
      byName.set(item.name, Number(byName.get(item.name) || 0) + count);
    }
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

  const hits = ability.hits
    ?? ability.totalHits
    ?? ability.hitCount
    ?? ability.landedHits
    ?? ability.count
    ?? 0;
  const casts = ability.casts
    ?? ability.totalUses
    ?? ability.uses
    ?? ability.useCount
    ?? ability.executeCount
    ?? 0;
  const crits = ability.crits
    ?? ability.criticalHits
    ?? ability.critCount
    ?? ability.critHits
    ?? ability.critHitCount
    ?? 0;

  return {
    guid: ability.guid ?? ability.gameID ?? ability.abilityGameID ?? null,
    name: ability.name || ability.abilityName || ability.ability?.name || "Unknown Ability",
    icon: ability.icon || ability.iconName || ability.iconname || ability.abilityIcon || ability.ability?.icon || ability.ability?.iconName || "",
    total: ability.total ?? ability.amount ?? ability.effectiveHealing ?? 0,
    activeTime: ability.activeTime ?? ability.uptime ?? ability.totalUptime ?? 0,
    hits,
    casts,
    crits,
    overheal: ability.overheal ?? 0,
    absorbed: ability.absorbed ?? 0,
  };
}

function getAbilityRows(entry, fallbackLabel) {
  const legacyRows = aggregateLegacyAbilityRows(
    [
      entry?.entries,
      entry?.abilities,
      entry?.sources,
      entry?.targets,
      entry?.spells,
    ].find(value => Array.isArray(value) && value.length > 0) || []
  );
  if (legacyRows.length > 0) return legacyRows;

  const nestedRows = [
    entry?.abilities,
    entry?.entries,
    entry?.sources,
    entry?.targets,
    entry?.spells,
  ].find(value => Array.isArray(value) && value.length > 0) || [];

  const normalizedNestedRows = nestedRows.map(normalizeAbilityEntry).filter(Boolean);
  if (normalizedNestedRows.length > 0) return normalizedNestedRows;

  if (!entry) return [];

  const fallback = normalizeAbilityEntry({
    guid: entry.guid ?? entry.gameID ?? entry.id ?? null,
    name: entry.name || fallbackLabel,
    total: entry.total ?? entry.amount ?? entry.effectiveHealing ?? 0,
    activeTime: entry.activeTime ?? entry.uptime ?? entry.totalUptime ?? 0,
    hits: entry.hits ?? entry.totalHits ?? entry.hitCount ?? entry.count ?? 0,
    casts: entry.casts ?? entry.totalUses ?? entry.uses ?? entry.useCount ?? 0,
    crits: entry.crits ?? entry.criticalHits ?? entry.critCount ?? entry.critHits ?? entry.critHitCount ?? 0,
    overheal: entry.overheal ?? 0,
    absorbed: entry.absorbed ?? 0,
  });

  return fallback ? [fallback] : [];
}

function getEntryParsePercent(entry) {
  const candidates = [
    entry?.rankPercent,
    entry?.rankPercentile,
    entry?.parsePercent,
    entry?.percentile,
    entry?.ranks?.rankPercent,
    entry?.ranks?.rankPercentile,
    entry?.ranks?.percentile,
    entry?.ranks?.historical?.rankPercent,
    entry?.ranks?.historical?.rankPercentile,
    entry?.ranks?.historical?.percentile,
    entry?.ranks?.overall?.rankPercent,
    entry?.ranks?.overall?.rankPercentile,
    entry?.ranks?.overall?.percentile,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    if (numeric >= 0 && numeric <= 1) return numeric * 100;
    if (numeric >= 0 && numeric <= 100) return numeric;
  }

  return null;
}

function resolveDeathActorName(actorId, actorLookup = null) {
  const normalizedId = actorId == null ? "" : String(actorId);
  if (!normalizedId || !(actorLookup instanceof Map)) return "";
  return String(actorLookup.get(normalizedId)?.name || "").trim();
}

function resolveDeathActorMeta(actorId, actorLookup = null) {
  const normalizedId = actorId == null ? "" : String(actorId);
  if (!normalizedId || !(actorLookup instanceof Map)) return null;
  return actorLookup.get(normalizedId) || null;
}

function buildDeathActorLookup(fightsData = {}) {
  const lookup = new Map();
  const collections = [
    { entries: fightsData?.friendlies, hostile: false },
    { entries: fightsData?.friendlyPets, hostile: false },
    { entries: fightsData?.enemies, hostile: true },
    { entries: fightsData?.enemyPets, hostile: true },
  ];

  for (const collection of collections) {
    for (const actor of collection.entries || []) {
      const actorId = actor?.id;
      const actorName = String(actor?.name || "").trim();
      if (actorId == null || !actorName) continue;
      lookup.set(String(actorId), {
        id: String(actorId),
        name: actorName,
        type: String(actor?.type || "").trim(),
        hostile: !!collection.hostile,
      });
    }
  }

  return lookup;
}

function normalizeDeathEvent(event, actorLookup = null) {
  if (!event) return null;

  const sourceId = event.sourceID ?? event.sourceId ?? event.source?.id ?? null;
  const targetId = event.targetID ?? event.targetId ?? event.target?.id ?? null;
  const sourceMeta = resolveDeathActorMeta(sourceId, actorLookup);
  const targetMeta = resolveDeathActorMeta(targetId, actorLookup);

  return {
    timestamp: event.timestamp ?? event.time ?? event.offset ?? 0,
    type: event.type || "",
    abilityGuid: event.abilityGameID ?? event.guid ?? event.ability?.guid ?? null,
    abilityName: event.ability?.name || event.abilityName || event.spellName || event.name || "",
    sourceId,
    sourceName: event.sourceName || event.source?.name || (typeof event.source === "string" ? event.source : "") || resolveDeathActorName(sourceId, actorLookup),
    sourceType: event.sourceType || sourceMeta?.type || "",
    sourceIsEnemy: typeof event.sourceIsEnemy === "boolean" ? event.sourceIsEnemy : !!sourceMeta?.hostile,
    amount: event.amount ?? event.hitPoints ?? event.value ?? 0,
    hitPoints: event.hitPoints ?? event.hitpoints ?? event.hitPoint ?? event.hp ?? null,
    maxHitPoints: event.maxHitPoints ?? event.maxHP ?? event.maxHp ?? null,
    overkill: event.overkill ?? 0,
    overheal: event.overheal ?? 0,
    absorbed: event.absorbed ?? 0,
    hitType: event.hitType ?? null,
    damage: event.damage ?? event.damageTaken ?? 0,
    healing: event.healing ?? event.healingReceived ?? 0,
    targetId,
    targetName: event.targetName || event.target?.name || (typeof event.target === "string" ? event.target : "") || resolveDeathActorName(targetId, actorLookup),
    targetType: event.targetType || targetMeta?.type || "",
    targetIsEnemy: typeof event.targetIsEnemy === "boolean" ? event.targetIsEnemy : !!targetMeta?.hostile,
    events: (event.events || []).map(nestedEvent => normalizeDeathEvent(nestedEvent, actorLookup)).filter(Boolean),
    healingWindowEvents: (event.healingWindowEvents || []).map(nestedEvent => normalizeDeathEvent(nestedEvent, actorLookup)).filter(Boolean),
    deathWindowEvents: (event.deathWindowEvents || []).map(nestedEvent => normalizeDeathEvent(nestedEvent, actorLookup)).filter(Boolean),
  };
}

function getHealingTargetId(event) {
  const targetId = event?.targetID ?? event?.targetId ?? event?.target?.id ?? null;
  return targetId == null ? "" : String(targetId);
}

function groupHealingEventsByTarget(events = [], actorLookup = null) {
  const grouped = new Map();

  for (const event of events || []) {
    const targetId = getHealingTargetId(event);
    if (!targetId) continue;

    const normalized = normalizeDeathEvent(event, actorLookup);
    if (!normalized) continue;

    const targetEvents = grouped.get(targetId) || [];
    targetEvents.push(normalized);
    grouped.set(targetId, targetEvents);
  }

  for (const [targetId, targetEvents] of grouped.entries()) {
    targetEvents.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
    grouped.set(targetId, targetEvents);
  }

  return grouped;
}

function resolveDeathWindowStartTimestamp(targetId, deathTimestamp, summaryTimelineByTarget) {
  const normalizedTargetId = targetId == null ? "" : String(targetId);
  if (!normalizedTargetId) return Number(deathTimestamp || 0);

  const allTargetEvents = summaryTimelineByTarget.get(normalizedTargetId) || [];
  const end = Number(deathTimestamp || 0);
  if (!(end > 0)) return end;

  let lastFullTimestamp = null;
  for (const event of allTargetEvents) {
    const timestamp = Number(event?.timestamp || 0);
    if (!(timestamp > 0) || timestamp > end) continue;

    const hitPoints = Number(event?.hitPoints);
    const maxHitPoints = Number(event?.maxHitPoints);
    if (!Number.isFinite(hitPoints) || !Number.isFinite(maxHitPoints) || !(maxHitPoints > 0)) continue;
    if (hitPoints >= maxHitPoints) {
      lastFullTimestamp = timestamp;
    }
  }

  return lastFullTimestamp ?? end;
}

function buildDeathWindowEvents(targetId, deathTimestamp, summaryTimelineByTarget) {
  const normalizedTargetId = targetId == null ? "" : String(targetId);
  if (!normalizedTargetId) return [];

  const allActorEvents = summaryTimelineByTarget.get(normalizedTargetId) || [];
  const end = Number(deathTimestamp || 0);
  const start = resolveDeathWindowStartTimestamp(targetId, deathTimestamp, summaryTimelineByTarget);

  return allActorEvents.filter(event => {
    const timestamp = Number(event?.timestamp || 0);
    if (!(timestamp >= start && timestamp <= end)) return false;
    if (String(event?.targetId ?? "") !== normalizedTargetId) return false;

    const type = String(event?.type || "").toLowerCase();
    if (type === "death") return false;
    return type === "damage" || type === "heal" || type === "absorbed";
  });
}

function buildHealingWindowEvents(targetId, deathTimestamp, healingEventsByTarget, summaryTimelineByTarget) {
  const normalizedTargetId = targetId == null ? "" : String(targetId);
  if (!normalizedTargetId) return [];

  const allHealingEvents = healingEventsByTarget.get(normalizedTargetId) || [];
  const end = Number(deathTimestamp || 0);
  const start = resolveDeathWindowStartTimestamp(targetId, deathTimestamp, summaryTimelineByTarget);

  return allHealingEvents.filter(event => {
    const timestamp = Number(event?.timestamp || 0);
    return timestamp >= start && timestamp <= end;
  });
}

function attachHealingWindowsToDeathEntry(entry, healingEventsByTarget, summaryTimelineByTarget, inheritedTargetId = null) {
  if (!entry || typeof entry !== "object") return entry;

  const targetId = entry?.id ?? entry?.targetID ?? entry?.targetId ?? inheritedTargetId ?? null;
  const timestamp = entry?.timestamp ?? 0;
  const nestedEvents = Array.isArray(entry?.events)
    ? entry.events.map(event => attachHealingWindowsToDeathEntry(event, healingEventsByTarget, summaryTimelineByTarget, targetId))
    : [];

  return {
    ...entry,
    events: nestedEvents,
    healingWindowEvents: buildHealingWindowEvents(targetId, timestamp, healingEventsByTarget, summaryTimelineByTarget),
    deathWindowEvents: buildDeathWindowEvents(targetId, timestamp, summaryTimelineByTarget),
  };
}

function attachHealingWindowsToDeathEntries(entries = [], healingEventsByTarget, summaryTimelineByTarget) {
  return (entries || []).map(entry => attachHealingWindowsToDeathEntry(entry, healingEventsByTarget, summaryTimelineByTarget));
}

function getSummaryTargetId(event) {
  const targetId = event?.targetID ?? event?.targetId ?? event?.target?.id ?? null;
  return targetId == null ? "" : String(targetId);
}

function getSummarySourceId(event) {
  const sourceId = event?.sourceID ?? event?.sourceId ?? event?.source?.id ?? null;
  return sourceId == null ? "" : String(sourceId);
}

function getSummaryAbilityGuid(event) {
  return String(event?.abilityGameID ?? event?.guid ?? event?.ability?.guid ?? "");
}

function getSummaryAbilityName(event) {
  return String(event?.ability?.name || event?.abilityName || event?.spellName || event?.name || "");
}

function getSummaryEventAmount(event) {
  const candidates = [
    event?.amount,
    event?.damage,
    event?.damageTaken,
    event?.healing,
    event?.healingReceived,
    event?.value,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }

  return 0;
}

function buildDeathSummaryMatchKey(event) {
  return [
    Number(event?.timestamp || event?.time || event?.offset || 0),
    String(event?.type || ""),
    getSummarySourceId(event),
    getSummaryTargetId(event),
    getSummaryAbilityGuid(event),
    getSummaryAbilityName(event),
    Number(getSummaryEventAmount(event) || 0),
    Number(event?.overkill || 0),
    Number(event?.hitType ?? -1),
    event?.tick ? 1 : 0,
  ].join("|");
}

function shouldCaptureSummaryState(event) {
  if (!event || typeof event !== "object") return false;
  if (!("hitPoints" in event) && !("maxHitPoints" in event)) return false;

  const type = String(event?.type || "").toLowerCase();
  return [
    "damage",
    "heal",
    "absorbed",
    "cast",
    "begincast",
    "resourcechange",
    "death",
  ].includes(type);
}

function groupSummaryEventsByTarget(events = []) {
  const grouped = new Map();

  for (const event of events || []) {
    if (!shouldCaptureSummaryState(event)) continue;

    const targetId = getSummaryTargetId(event);
    if (!targetId) continue;

    const targetMap = grouped.get(targetId) || new Map();
    const matchKey = buildDeathSummaryMatchKey(event);
    const bucket = targetMap.get(matchKey) || [];
    bucket.push(event);
    targetMap.set(matchKey, bucket);
    grouped.set(targetId, targetMap);
  }

  return grouped;
}

function groupSummaryTimelineEventsByTarget(events = [], actorLookup = null) {
  const grouped = new Map();

  for (const event of events || []) {
    if (!shouldCaptureSummaryState(event)) continue;

    const normalized = normalizeDeathEvent(event, actorLookup);
    if (!normalized) continue;

    const actorIds = new Set([
      getSummaryTargetId(event),
      getSummarySourceId(event),
    ]);

    for (const actorId of actorIds) {
      if (!actorId) continue;
      const targetEvents = grouped.get(actorId) || [];
      targetEvents.push(normalized);
      grouped.set(actorId, targetEvents);
    }
  }

  for (const [targetId, targetEvents] of grouped.entries()) {
    targetEvents.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
    grouped.set(targetId, targetEvents);
  }

  return grouped;
}

function pullMatchedSummaryState(rawEvent, summaryStateByTarget) {
  const targetId = getSummaryTargetId(rawEvent);
  if (!targetId || !(summaryStateByTarget instanceof Map)) return null;

  const targetMap = summaryStateByTarget.get(targetId);
  if (!(targetMap instanceof Map)) return null;

  const matchKey = buildDeathSummaryMatchKey(rawEvent);
  const bucket = targetMap.get(matchKey);
  if (!Array.isArray(bucket) || !bucket.length) return null;

  const matched = bucket.shift();
  if (!bucket.length) {
    targetMap.delete(matchKey);
  } else {
    targetMap.set(matchKey, bucket);
  }

  return matched || null;
}

function attachSummaryStateToDeathEntry(entry, summaryStateByTarget) {
  if (!entry || typeof entry !== "object") return entry;

  const matched = pullMatchedSummaryState(entry, summaryStateByTarget);
  const nestedEvents = Array.isArray(entry?.events)
    ? entry.events.map(event => attachSummaryStateToDeathEntry(event, summaryStateByTarget))
    : [];

  return {
    ...entry,
    hitPoints: entry?.hitPoints ?? entry?.hitpoints ?? matched?.hitPoints ?? null,
    maxHitPoints: entry?.maxHitPoints ?? entry?.maxHP ?? entry?.maxHp ?? matched?.maxHitPoints ?? null,
    events: nestedEvents,
  };
}

function attachSummaryStateToDeathEntries(entries = [], summaryStateByTarget) {
  return (entries || []).map(entry => attachSummaryStateToDeathEntry(entry, summaryStateByTarget));
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
  const deaths = lookups.deaths.byId.get(String(friendly.id))
    ?? lookups.deaths.byName.get(friendly.name)
    ?? 0;
  const tracked = lookups.tracked.byId.get(String(friendly.id)) || lookups.tracked.byName.get(friendly.name) || null;
  const hostile = lookups.hostile.byId.get(String(friendly.id)) || lookups.hostile.byName.get(friendly.name) || null;
  const role = lookups.roles.roleById.get(String(friendly.id)) || lookups.roles.roleByName.get(friendly.name) || "DPS";
  const damageParsePercent = lookups.reportRankings?.overall?.damage?.byId?.[String(friendly.id)]
    ?? lookups.reportRankings?.overall?.damage?.byName?.[friendly.name]
    ?? null;
  const healingParsePercent = lookups.reportRankings?.overall?.healing?.byId?.[String(friendly.id)]
    ?? lookups.reportRankings?.overall?.healing?.byName?.[friendly.name]
    ?? null;

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
    deaths: Number(deaths || 0),
    trackedCastCount: getTrackedCastCount(tracked),
    hostilePlayerDamage: getHostileDamage(hostile),
    damageParsePercent,
    healingParsePercent,
    summary,
  };
}

function buildPlayerParseFallbackByMetric(fights = [], field = "") {
  const totals = new Map();
  const counts = new Map();

  for (const fight of fights || []) {
    if (!(Number(fight?.encounterId) > 0)) continue;

    for (const entry of fight?.[field] || []) {
      const value = Number(entry?.parsePercent);
      if (!Number.isFinite(value) || value < 0) continue;

      const key = String(entry.id || "");
      if (!key) continue;

      totals.set(key, Number(totals.get(key) || 0) + value);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
  }

  const averages = new Map();
  for (const [key, total] of totals.entries()) {
    const count = Number(counts.get(key) || 0);
    if (count > 0) {
      averages.set(key, total / count);
    }
  }

  return averages;
}

function getResolvedReportId({ reportUrl, reportId: rawReportId }) {
  const reportId = parseReportId(reportUrl || rawReportId || "");
  if (!reportId) throw new Error("reportUrl or reportId required");
  return reportId;
}

export async function fetchRpbImportStep(action, input = {}) {
  const {
    reportUrl,
    reportId: rawReportId,
    apiKey = "",
    wclV2ClientId = "",
    wclV2ClientSecret = "",
    sourceId = "",
    fightIds = [],
    mode = "damage",
  } = input;
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
      return wclFetch(`/report/tables/damage-done/${reportId}`, {
        start: 0,
        end: 999999999999,
        hostility: 1,
        by: "source",
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
        filter: "encounterid != 724",
      }, apiKey);
    case "drums":
      return wclFetch(`/report/tables/casts/${reportId}`, {
        start: 0,
        end: 999999999999,
        by: "source",
        filter: DRUMS_CAST_FILTER,
      }, apiKey);
    case "drumsByFight":
      return fetchFightDrumSnapshots(reportId, apiKey);
    case "potionsByFight":
      return fetchFightPotionSnapshots(reportId, apiKey);
    case "reportRankings":
      try {
        return await fetchReportRankings(
          reportId,
          await fetchRpbImportStep("fights", { reportId, apiKey }),
          wclV2ClientId,
          wclV2ClientSecret,
        );
      } catch {
        return { available: false, fights: {} };
      }
    case "reportSpeed":
      try {
        return await fetchReportSpeed(
          reportId,
          input?.fights || {},
          wclV2ClientId,
          wclV2ClientSecret,
        );
      } catch {
        return { available: false, fights: {}, reportSpeedPercent: null };
      }
    case "raiderData":
      return fetchBossSummarySnapshots(reportId, apiKey);
    case "damageByFight":
      return fetchFightDamageSnapshots(reportId, apiKey);
    case "healingByFight":
      return fetchFightHealingSnapshots(reportId, apiKey);
    case "deathsByFight":
      return fetchFightDeathsSnapshots(reportId, apiKey);
    case "debuffsByFight":
      return fetchFightDebuffSnapshots(reportId, apiKey);
    case "buffsByFight":
      return fetchFightBuffSnapshots(reportId, apiKey);
    case "playerAbilityBreakdown":
      return fetchPlayerAbilityBreakdown({
        reportUrl,
        reportId,
        apiKey,
        sourceId,
        fightIds,
        mode,
      });
    default:
      throw new Error(`Unknown RPB import step: ${action}`);
  }
}

export function assembleRpbRaid({ reportUrl, reportId: rawReportId }, datasets) {
  const reportId = getResolvedReportId({ reportUrl, reportId: rawReportId });
  const fightsData = datasets.fights || {};
  const deathActorLookup = buildDeathActorLookup(fightsData);
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
      const rankingSnapshot = datasets.reportRankings?.fights?.[String(normalizedFight.id)] || {};
      const speedSnapshot = datasets.reportSpeed?.fights?.[String(normalizedFight.id)] || {};

      return {
        ...normalizedFight,
        speedParsePercent: Number.isFinite(Number(speedSnapshot.speedParsePercent))
          ? Number(speedSnapshot.speedParsePercent)
          : null,
        playerSnapshots: extractPlayerSnapshots(raiderSnapshot?.summary),
        damageDoneEntries: (damageSnapshot?.damageDone?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: entry.total ?? 0,
            activeTime: entry.activeTime ?? 0,
            parsePercent: rankingSnapshot.damage?.byId?.[String(entry.id)] ?? rankingSnapshot.damage?.byName?.[entry.name] ?? getEntryParsePercent(entry),
            abilities: getAbilityRows(entry, "All Damage"),
          })),
        healingDoneEntries: (healingSnapshot?.healing?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: entry.total ?? 0,
            activeTime: entry.activeTime ?? 0,
            parsePercent: rankingSnapshot.healing?.byId?.[String(entry.id)] ?? rankingSnapshot.healing?.byName?.[entry.name] ?? getEntryParsePercent(entry),
            abilities: getAbilityRows(entry, "All Healing"),
          })),
        deathEntries: (deathsSnapshot?.deaths?.entries || [])
          .filter(entry => PLAYER_TYPES.has(entry?.type))
          .map(entry => ({
            id: String(entry.id),
            name: entry.name || "Unknown Player",
            type: entry.type || "",
            total: getDeathCount(entry),
            timestamp: entry.timestamp ?? 0,
            overkill: entry.overkill ?? 0,
            deathWindow: entry.deathWindow ?? 0,
            damageTotal: Number(entry?.damage?.total || 0),
            healingTotal: Number(entry?.healing?.total || 0),
            killingBlow: normalizeDeathEvent({
              timestamp: entry.timestamp ?? 0,
              type: "death",
              ability: entry.killingBlow || null,
              sourceName: entry?.damage?.sources?.[0]?.name || "",
              amount: Number(entry?.damage?.total || 0),
              damage: Number(entry?.damage?.total || 0),
              healing: Number(entry?.healing?.total || 0),
              overkill: entry.overkill ?? 0,
            }),
            events: (entry.events || []).map(event => normalizeDeathEvent(event, deathActorLookup)).filter(Boolean),
            healingWindowEvents: (entry.healingWindowEvents || []).map(event => normalizeDeathEvent(event, deathActorLookup)).filter(Boolean),
            deathWindowEvents: (entry.deathWindowEvents || []).map(event => normalizeDeathEvent(event, deathActorLookup)).filter(Boolean),
          })),
      };
    });

  const players = (fightsData.friendlies || [])
    .filter(friendly => PLAYER_TYPES.has(friendly.type) && friendly.name)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const damageParseFallbackByPlayerId = buildPlayerParseFallbackByMetric(fights, "damageDoneEntries");
  const healingParseFallbackByPlayerId = buildPlayerParseFallbackByMetric(fights, "healingDoneEntries");

  const lookups = {
    summary: buildLookup(summaryData.entries || []),
    deaths: buildDeathCountLookup(deathsData.entries || []),
    tracked: buildLookup(trackedData.entries || []),
    hostile: buildLookup(hostileData.entries || []),
    roles: buildRoleLookup(summaryData),
    reportRankings: datasets.reportRankings || { overall: { damage: { byId: {}, byName: {} }, healing: { byId: {}, byName: {} } } },
  };

  const playersWithBaseMetrics = players.map(player => {
    const normalized = normalizePlayer(player, lookups);
    return {
      ...normalized,
      damageParsePercent: normalized.damageParsePercent ?? damageParseFallbackByPlayerId.get(String(normalized.id)) ?? null,
      healingParsePercent: normalized.healingParsePercent ?? healingParseFallbackByPlayerId.get(String(normalized.id)) ?? null,
    };
  });
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
    reportSpeedPercent: Number.isFinite(Number(datasets.reportSpeed?.reportSpeedPercent))
      ? Number(datasets.reportSpeed.reportSpeedPercent)
      : null,
    importPayload: {
      fights: datasets.fights || {},
      summary: datasets.summary || {},
      deaths: datasets.deaths || {},
      tracked: datasets.tracked || {},
      hostile: datasets.hostile || {},
      fullCasts: datasets.fullCasts || {},
      engineering: datasets.engineering || {},
      oil: datasets.oil || {},
      buffs: datasets.buffs || {},
      drums: datasets.drums || {},
      drumsByFight: datasets.drumsByFight || {},
      potionsByFight: datasets.potionsByFight || {},
      reportRankings: datasets.reportRankings || {},
      reportSpeed: datasets.reportSpeed || {},
      raiderData: datasets.raiderData || {},
      damageByFight: datasets.damageByFight || {},
      healingByFight: datasets.healingByFight || {},
      deathsByFight: datasets.deathsByFight || {},
      debuffsByFight: datasets.debuffsByFight || {},
      buffsByFight: datasets.buffsByFight || {},
    },
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
  const stepOrder = [
    "fights",
    "summary",
    "deaths",
    "tracked",
    "hostile",
    "fullCasts",
    "engineering",
    "oil",
    "buffs",
    "drums",
    "drumsByFight",
    "potionsByFight",
    "reportRankings",
    "reportSpeed",
    "raiderData",
    "damageByFight",
    "healingByFight",
    "deathsByFight",
    "debuffsByFight",
    "buffsByFight",
  ];
  const datasets = {};

  for (const step of stepOrder) {
    datasets[step] = await fetchRpbImportStep(step, input);
    await sleep(250);
  }

  return assembleRpbRaid(
    { reportUrl, reportId: rawReportId },
    datasets
  );
}

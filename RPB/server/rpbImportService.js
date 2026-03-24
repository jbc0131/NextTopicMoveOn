import { deriveRpbAnalytics } from "./rpbAnalytics.js";
import { buildCacheKey, getJsonCache, setJsonCache } from "./upstashRedis.js";

const BASE_URL = "https://classic.warcraftlogs.com/v1";
const WCL_V2_TOKEN_URL = "https://classic.warcraftlogs.com/oauth/token";
const WCL_V2_API_URL = "https://classic.warcraftlogs.com/api/v2/client";

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
const DRUMS_PREPULL_LOOKBACK_MS = 30 * 1000;
const WCL_CACHE_TTL_SECONDS = 60 * 15;
let cachedV2Token = null;
let cachedV2TokenExpiresAt = 0;

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

  if (Array.isArray(node.subentries)) collectRawAbilityRows(node.subentries, rows);
  if (Array.isArray(node.entries)) collectRawAbilityRows(node.entries, rows);
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
    const snapshotEntries = aggregateLegacyAbilityRows(abilityNodes, castsByGuid);
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
    const [casts, damageDone] = await Promise.all([
      wclFetch(`/report/tables/casts/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        by: "source",
      }, apiKeyOverride),
      wclFetch(`/report/tables/damage-done/${reportId}`, {
        start: fight.start_time ?? 0,
        end: fight.end_time ?? 0,
        by: "source",
        options: 2,
      }, apiKeyOverride),
    ]);
    const ownedPets = ownedDamagePetsByFightId.get(String(fight.id)) || [];
    const petDamageByOwnerId = new Map();

    if (ownedPets.length > 0) {
      const petPayloads = await Promise.all(ownedPets.map(async pet => {
        const petDamage = await wclFetch(`/report/tables/damage-done/${reportId}`, {
          start: fight.start_time ?? 0,
          end: fight.end_time ?? 0,
          sourceid: pet.id,
        }, apiKeyOverride);

        return {
          ...pet,
          entries: petDamage?.entries || [],
        };
      }));

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

    snapshots.push({
      fightId: String(fight.id),
      encounterId: fight.boss || 0,
      fightName: fight.name || "Unknown Fight",
      healing: {
        ...healing,
        entries: enrichFightMetricEntries(healing?.entries || [], casts, "All Healing"),
      },
    });
  }

  return { snapshots };
}

async function fetchFightDeathsSnapshots(reportId, apiKeyOverride = "") {
  const fightsData = await wclFetch(`/report/fights/${reportId}`, {}, apiKeyOverride);
  const snapshotFights = getSnapshotEligibleFights(fightsData.fights || []);

  const snapshots = [];
  for (const fight of snapshotFights) {
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
            events: (entry.events || []).map(normalizeDeathEvent).filter(Boolean),
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
      reportRankings: datasets.reportRankings || {},
      reportSpeed: datasets.reportSpeed || {},
      raiderData: datasets.raiderData || {},
      damageByFight: datasets.damageByFight || {},
      healingByFight: datasets.healingByFight || {},
      deathsByFight: datasets.deathsByFight || {},
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
  const [fights, summary, deaths, tracked, hostile, fullCasts, engineering, oil, buffs, drums, drumsByFight, reportRankings, reportSpeed, raiderData, damageByFight, healingByFight, deathsByFight, buffsByFight] = await Promise.all([
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
    fetchRpbImportStep("drumsByFight", input),
    fetchRpbImportStep("reportRankings", input),
    fetchRpbImportStep("reportSpeed", input),
    fetchRpbImportStep("raiderData", input),
    fetchRpbImportStep("damageByFight", input),
    fetchRpbImportStep("healingByFight", input),
    fetchRpbImportStep("deathsByFight", input),
    fetchRpbImportStep("buffsByFight", input),
  ]);

  return assembleRpbRaid(
    { reportUrl, reportId: rawReportId },
    { fights, summary, deaths, tracked, hostile, fullCasts, engineering, oil, buffs, drums, drumsByFight, reportRankings, reportSpeed, raiderData, damageByFight, healingByFight, deathsByFight, buffsByFight }
  );
}

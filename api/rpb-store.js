import { assertRedisConfigured, buildCacheKey, deleteKey, getJsonCache, setJsonCache } from "../RPB/server/upstashRedis.js";

const RPB_INDEX_KEY = buildCacheKey("rpb", ["index"]);

function normalizeTeamTag(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function getReportSpeedPercent(raid) {
  const value = Number(raid?.reportSpeedPercent ?? raid?.importPayload?.reportSpeed?.reportSpeedPercent ?? raid?.importPayload?.reportRankings?.reportSpeedPercent);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getReportAverageValue(player, role) {
  const summary = player?.summary || {};
  const summaryTotal = Number(player?.summaryTotal || 0);
  const activeTimeMs = Number(player?.activeTimeMs || 0);
  const candidates = [
    player?.summaryAverage,
    summary?.average,
    summary?.avg,
    role === "Healer" ? summary?.hps : summary?.dps,
    role === "Healer" ? summary?.hpsReduced : summary?.dpsReduced,
    activeTimeMs > 0 ? (summaryTotal / (activeTimeMs / 1000)) : null,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

function getReportParseLeader(raid, role, parseField) {
  const candidates = (raid?.players || []).map(player => {
    const parsePercent = Number(player?.[parseField]);
    const summaryTotal = Number(player?.summaryTotal || 0);
    return {
      name: String(player?.name || "").trim(),
      type: player?.type || "",
      role: player?.role || "",
      parsePercent: Number.isFinite(parsePercent) && parsePercent > 0 ? parsePercent : null,
      averageValue: getReportAverageValue(player, role),
      summaryTotal,
    };
  }).filter(player => player.name && player.role === role && Number.isFinite(Number(player.parsePercent)) && Number(player.parsePercent) > 0);

  if (!candidates.length) return null;

  const winner = [...candidates].sort((left, right) => {
    const averageDiff = Number(right?.averageValue || 0) - Number(left?.averageValue || 0);
    if (averageDiff !== 0) return averageDiff;
    const parseDiff = Number(right?.parsePercent || 0) - Number(left?.parsePercent || 0);
    if (parseDiff !== 0) return parseDiff;
    return Number(right?.summaryTotal || 0) - Number(left?.summaryTotal || 0);
  })[0];

  return {
    name: winner.name,
    type: winner.type,
    parsePercent: winner.parsePercent,
    averageValue: winner.averageValue,
  };
}

function getRaidSummary(raid) {
  return {
    id: raid.id,
    reportId: raid.reportId,
    title: raid.title || "",
    zone: raid.zone || "",
    zoneId: raid.zoneId ?? null,
    start: raid.start ?? null,
    end: raid.end ?? null,
    importedAt: raid.importedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teamTag: normalizeTeamTag(raid.teamTag),
    fightCount: (raid.fights || []).length,
    playerCount: (raid.players || []).length,
    reportSpeedPercent: getReportSpeedPercent(raid),
    topDpsLeader: getReportParseLeader(raid, "DPS", "damageParsePercent"),
    topHealerLeader: getReportParseLeader(raid, "Healer", "healingParsePercent"),
    source: "redis",
    analytics: raid.analytics || null,
  };
}

function getRaidMeta(raid) {
  return {
    id: raid.id,
    reportId: raid.reportId,
    title: raid.title || "",
    zone: raid.zone || "",
    zoneId: raid.zoneId ?? null,
    start: raid.start ?? null,
    end: raid.end ?? null,
    importedAt: raid.importedAt ?? new Date().toISOString(),
    updatedAt: raid.updatedAt ?? new Date().toISOString(),
    teamTag: normalizeTeamTag(raid.teamTag),
    analytics: raid.analytics || null,
    reportSpeedPercent: getReportSpeedPercent(raid),
    topDpsLeader: getReportParseLeader(raid, "DPS", "damageParsePercent"),
    topHealerLeader: getReportParseLeader(raid, "Healer", "healingParsePercent"),
    importPayload: raid.importPayload || null,
    source: "redis",
  };
}

function getRaidKeys(raidId) {
  return {
    meta: buildCacheKey("rpb", ["raid", raidId, "meta"]),
    fights: buildCacheKey("rpb", ["raid", raidId, "fights"]),
    players: buildCacheKey("rpb", ["raid", raidId, "players"]),
  };
}

export async function saveRaidBundle(raid) {
  assertRedisConfigured();
  const keys = getRaidKeys(raid.id);
  const summary = getRaidSummary(raid);
  const meta = getRaidMeta(raid);
  const currentIndex = (await getJsonCache(RPB_INDEX_KEY)) || [];
  const nextIndex = [summary, ...currentIndex.filter(entry => entry?.id !== raid.id)]
    .sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0))
    .slice(0, 100);

  const results = await Promise.all([
    setJsonCache(keys.meta, meta),
    setJsonCache(keys.fights, raid.fights || []),
    setJsonCache(keys.players, raid.players || []),
    setJsonCache(RPB_INDEX_KEY, nextIndex),
  ]);

  if (results.some(result => !result)) {
    throw new Error("Failed to write RPB data to Redis.");
  }

  return summary;
}

async function getRaidBundle(raidId) {
  assertRedisConfigured();
  const keys = getRaidKeys(raidId);
  const [meta, fights, players] = await Promise.all([
    getJsonCache(keys.meta),
    getJsonCache(keys.fights),
    getJsonCache(keys.players),
  ]);

  if (!meta) return null;
  return {
    ...meta,
    fights: fights || [],
    players: players || [],
  };
}

async function updateRaidBundle(raidId, updates) {
  assertRedisConfigured();
  const existingRaid = await getRaidBundle(raidId);
  if (!existingRaid) return null;

  const nextRaid = {
    ...existingRaid,
    ...updates,
    id: existingRaid.id,
    updatedAt: new Date().toISOString(),
    teamTag: normalizeTeamTag(updates.teamTag ?? existingRaid.teamTag),
    fights: Array.isArray(updates.fights) ? updates.fights : (existingRaid.fights || []),
    players: Array.isArray(updates.players) ? updates.players : (existingRaid.players || []),
  };

  await saveRaidBundle(nextRaid);
  return nextRaid;
}

async function deleteRaidBundle(raidId) {
  assertRedisConfigured();
  const keys = getRaidKeys(raidId);
  const currentIndex = (await getJsonCache(RPB_INDEX_KEY)) || [];
  const nextIndex = currentIndex.filter(entry => entry?.id !== raidId);

  const results = await Promise.all([
    deleteKey(keys.meta),
    deleteKey(keys.fights),
    deleteKey(keys.players),
    setJsonCache(RPB_INDEX_KEY, nextIndex),
  ]);

  if (results.some(result => !result)) {
    throw new Error("Failed to delete RPB data from Redis.");
  }

  return true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    assertRedisConfigured();

    if (req.method === "GET") {
      const raidId = String(req.query?.raidId || "").trim();
      const maxCount = Number(req.query?.maxCount || 25);

      if (raidId) {
        const raid = await getRaidBundle(raidId);
        if (!raid) return res.status(404).json({ error: "Raid not found" });
        return res.status(200).json(raid);
      }

      const index = (await getJsonCache(RPB_INDEX_KEY)) || [];
      return res.status(200).json({ raids: index.slice(0, maxCount) });
    }

    if (req.method === "POST") {
      const raid = req.body || {};
      if (!raid?.id && !raid?.reportId) {
        return res.status(400).json({ error: "Raid payload is required" });
      }

      const normalizedRaid = {
        ...raid,
        id: raid.id || `${raid.reportId}-${raid.start ?? "0"}-${raid.end ?? "0"}`,
        importedAt: raid.importedAt || new Date().toISOString(),
      };

      const summary = await saveRaidBundle(normalizedRaid);
      return res.status(200).json({ raidId: normalizedRaid.id, persistence: "remote", summary });
    }

    if (req.method === "PATCH") {
      const raidId = String(req.body?.raidId || "").trim();
      const updates = req.body?.updates || {};
      if (!raidId) return res.status(400).json({ error: "Raid ID is required" });

      const raid = await updateRaidBundle(raidId, updates);
      if (!raid) return res.status(404).json({ error: "Raid not found" });
      return res.status(200).json({ persistence: "remote", raidId, raid, summary: getRaidSummary(raid) });
    }

    if (req.method === "DELETE") {
      const raidId = String(req.query?.raidId || req.body?.raidId || "").trim();
      if (!raidId) return res.status(400).json({ error: "Raid ID is required" });

      const existingRaid = await getRaidBundle(raidId);
      if (!existingRaid) return res.status(404).json({ error: "Raid not found" });

      await deleteRaidBundle(raidId);
      return res.status(200).json({ persistence: "remote", raidId });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("RPB Redis store failed:", error);
    return res.status(500).json({ error: error.message || "RPB Redis store failed" });
  }
}

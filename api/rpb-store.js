import { assertRedisConfigured, buildCacheKey, getJsonCache, setJsonCache } from "../RPB/server/upstashRedis.js";

const RPB_INDEX_KEY = buildCacheKey("rpb", ["index"]);

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
    fightCount: (raid.fights || []).length,
    playerCount: (raid.players || []).length,
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
    analytics: raid.analytics || null,
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

async function saveRaidBundle(raid) {
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("RPB Redis store failed:", error);
    return res.status(500).json({ error: error.message || "RPB Redis store failed" });
  }
}

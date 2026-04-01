import { assertRedisConfigured, buildCacheKey, deleteKey, getJsonCache, setJsonCache } from "../RPB/server/upstashRedis.js";
import { getRaidCardLeaders } from "../src/modules/rpb/leaderboard.js";

const RPB_INDEX_KEY = buildCacheKey("rpb", ["index"]);
const DISCORD_RPB_WEBHOOK_URL = process.env.DISCORD_RPB_WEBHOOK_URL || "";
const RPB_PUBLIC_BASE_URL = process.env.AUTH_DOMAIN || "https://nexttopicmoveon.com";
const TEAM_EMOJI_BY_TAG = new Map([
  ["Team Dick", "🍆"],
  ["Team Balls", "🍒"],
]);
const TEAM_ROLE_MENTION_BY_TAG = new Map([
  ["Team Balls", "<@&1475981188865982495>"],
  ["Team Dick", "<@&1475979740023361627>"],
]);

function normalizeTeamTag(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function getReportSpeedPercent(raid) {
  const value = Number(raid?.reportSpeedPercent ?? raid?.importPayload?.reportSpeed?.reportSpeedPercent ?? raid?.importPayload?.reportRankings?.reportSpeedPercent);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getRaidSummary(raid) {
  const { topDpsLeader, topHealerLeader } = getRaidCardLeaders(raid);
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
    topDpsLeader,
    topHealerLeader,
    source: "redis",
    analytics: raid.analytics || null,
  };
}

function getRaidMeta(raid) {
  const { topDpsLeader, topHealerLeader } = getRaidCardLeaders(raid);
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
    topDpsLeader,
    topHealerLeader,
    source: "redis",
  };
}

function getRaidKeys(raidId) {
  return {
    meta: buildCacheKey("rpb", ["raid", raidId, "meta"]),
    fights: buildCacheKey("rpb", ["raid", raidId, "fights"]),
    players: buildCacheKey("rpb", ["raid", raidId, "players"]),
    importPayload: buildCacheKey("rpb", ["raid", raidId, "import-payload"]),
    threatByFightMeta: buildCacheKey("rpb", ["raid", raidId, "threat-by-fight", "meta"]),
  };
}

function getThreatByFightSnapshotKey(raidId, fightId) {
  return buildCacheKey("rpb", ["raid", raidId, "threat-by-fight", "snapshot", fightId]);
}

function splitImportPayload(importPayload = {}) {
  const payload = importPayload && typeof importPayload === "object" ? importPayload : {};
  const threatByFight = payload.threatByFight && typeof payload.threatByFight === "object"
    ? payload.threatByFight
    : {};

  const snapshots = Array.isArray(threatByFight.snapshots) ? threatByFight.snapshots : [];
  const threatMeta = {
    ...threatByFight,
    snapshots: undefined,
    snapshotFightIds: snapshots.map(snapshot => String(snapshot?.fightId || "")).filter(Boolean),
  };
  delete threatMeta.snapshots;

  return {
    baseImportPayload: {
      ...payload,
      threatByFight: {
        ...threatMeta,
        snapshots: [],
      },
    },
    threatMeta,
    threatSnapshots: snapshots,
  };
}

async function saveThreatByFight(raidId, threatMeta, threatSnapshots) {
  const keys = getRaidKeys(raidId);
  const previousMeta = await getJsonCache(keys.threatByFightMeta);
  const previousFightIds = Array.isArray(previousMeta?.snapshotFightIds) ? previousMeta.snapshotFightIds : [];
  const nextFightIds = threatSnapshots.map(snapshot => String(snapshot?.fightId || "")).filter(Boolean);

  const operations = [];
  operations.push(setJsonCache(keys.threatByFightMeta, {
    ...(threatMeta || {}),
    snapshotFightIds: nextFightIds,
  }));

  for (const snapshot of threatSnapshots) {
    const fightId = String(snapshot?.fightId || "").trim();
    if (!fightId) continue;
    operations.push(setJsonCache(getThreatByFightSnapshotKey(raidId, fightId), snapshot));
  }

  for (const fightId of previousFightIds) {
    if (nextFightIds.includes(String(fightId))) continue;
    operations.push(deleteKey(getThreatByFightSnapshotKey(raidId, fightId)));
  }

  const results = await Promise.all(operations);
  return results.every(Boolean);
}

async function loadThreatByFight(raidId) {
  const keys = getRaidKeys(raidId);
  const meta = await getJsonCache(keys.threatByFightMeta);
  if (!meta) return null;

  const fightIds = Array.isArray(meta?.snapshotFightIds) ? meta.snapshotFightIds : [];
  const snapshots = await Promise.all(
    fightIds.map(fightId => getJsonCache(getThreatByFightSnapshotKey(raidId, fightId)))
  );

  return {
    ...meta,
    snapshots: snapshots.filter(Boolean),
  };
}

function getFightDurationMs(fight) {
  const durationMs = Number(fight?.durationMs || 0);
  if (durationMs > 0) return durationMs;

  const startTime = Number(fight?.startTime ?? fight?.start_time ?? 0);
  const endTime = Number(fight?.endTime ?? fight?.end_time ?? 0);
  if (endTime > startTime) return endTime - startTime;

  return 0;
}

function formatFightDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatFightDurationLong(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function getParseSquare(value) {
  const score = Math.round(Number(value || 0));
  if (!Number.isFinite(score) || score <= 24) return "⬜";
  if (score === 100) return "🟫";
  if (score >= 99) return "🟥";
  if (score >= 95) return "🟧";
  if (score >= 75) return "🟪";
  if (score >= 50) return "🟩";
  return "🟦";
}

function formatKillLines(fights) {
  const kills = (Array.isArray(fights) ? fights : [])
    .filter(fight => Boolean(fight?.kill) && Number(fight?.encounterId) > 0);

  if (!kills.length) return ["No boss kills recorded."];

  return kills.map(fight => {
    const speedParsePercent = Number(fight?.speedParsePercent || 0);
    const parseLabel = Number.isFinite(speedParsePercent) && speedParsePercent > 0
      ? `${getParseSquare(speedParsePercent)} ${Math.round(speedParsePercent)} speed parse`
      : "⬜ no speed parse";
    return `${fight?.name || "Unknown Fight"}: ${parseLabel}, in ${formatFightDurationLong(getFightDurationMs(fight))}.`;
  });
}

function formatOverallSpeedLine(raid) {
  const score = Number(raid?.reportSpeedPercent ?? raid?.importPayload?.reportSpeed?.reportSpeedPercent ?? 0);
  if (!Number.isFinite(score) || score <= 0) return "Overall Speed Parse: ⬜ unavailable";
  return `Overall Speed Parse: ${getParseSquare(score)} ${Math.round(score)}`;
}

function buildReportLine(raid) {
  const teamTag = normalizeTeamTag(raid?.teamTag);
  const emoji = TEAM_EMOJI_BY_TAG.get(teamTag) || "";
  const label = teamTag || raid?.title || "Unassigned Report";
  return emoji ? `${emoji} ${label}` : label;
}

function buildEmbedDescription(raid, raidUrl, reportUrl) {
  const killLines = formatKillLines(raid?.fights || []);
  return [
    buildReportLine(raid),
    "",
    ...killLines,
    "",
    formatOverallSpeedLine(raid),
    "",
    `🔗 [NTMO Combat Analytics](${raidUrl})`,
    `🔗 [Warcraft Logs Link](${reportUrl})`,
  ].join("\n");
}

async function sendNewRaidWebhook(raid, summary) {
  if (!DISCORD_RPB_WEBHOOK_URL) return false;

  const raidPathId = String(raid?.reportId || raid?.id || "");
  const raidUrl = `${RPB_PUBLIC_BASE_URL.replace(/\/$/, "")}/rpb/${encodeURIComponent(raidPathId)}`;
  const reportUrl = raid?.reportId ? `https://classic.warcraftlogs.com/reports/${raid.reportId}` : "";
  const roleMention = TEAM_ROLE_MENTION_BY_TAG.get(normalizeTeamTag(raid?.teamTag)) || "";
  const embed = {
    title: "There is a new RPB available!",
    url: raidUrl || undefined,
    description: buildEmbedDescription(raid, raidUrl, reportUrl),
    color: 3447003,
    fields: [],
    footer: {
      text: raid?.reportId ? `Report ID: ${raid.reportId}` : "RPB webhook test",
    },
    timestamp: new Date(raid?.importedAt || Date.now()).toISOString(),
  };

  const response = await fetch(DISCORD_RPB_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: roleMention,
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`);
  }

  return true;
}

export async function saveRaidBundle(raid, options = {}) {
  assertRedisConfigured();
  const keys = getRaidKeys(raid.id);
  const summary = getRaidSummary(raid);
  const meta = getRaidMeta(raid);
  const { baseImportPayload, threatMeta, threatSnapshots } = splitImportPayload(raid.importPayload || {});
  const currentIndex = (await getJsonCache(RPB_INDEX_KEY)) || [];
  const isNewRaid = !currentIndex.some(entry => entry?.id === raid.id);
  const nextIndex = [summary, ...currentIndex.filter(entry => entry?.id !== raid.id)]
    .sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0))
    .slice(0, 100);

  const results = await Promise.all([
    setJsonCache(keys.meta, meta),
    setJsonCache(keys.fights, raid.fights || []),
    setJsonCache(keys.players, raid.players || []),
    setJsonCache(keys.importPayload, baseImportPayload || {}),
    saveThreatByFight(raid.id, threatMeta, threatSnapshots),
    setJsonCache(RPB_INDEX_KEY, nextIndex),
  ]);

  if (results.some(result => !result)) {
    throw new Error("Failed to write RPB data to Redis.");
  }

  if (options?.notifyIfNew && isNewRaid) {
    try {
      await sendNewRaidWebhook(raid, summary);
    } catch (error) {
      console.error("RPB Discord webhook failed:", error);
    }
  }

  return summary;
}

export async function getRaidBundle(raidId) {
  assertRedisConfigured();
  let resolvedRaidId = String(raidId || "").trim();
  if (!resolvedRaidId) return null;

  let keys = getRaidKeys(resolvedRaidId);
  let [meta, fights, players] = await Promise.all([
    getJsonCache(keys.meta),
    getJsonCache(keys.fights),
    getJsonCache(keys.players),
  ]);

  if (!meta) {
    const currentIndex = (await getJsonCache(RPB_INDEX_KEY)) || [];
    const matchedEntry = currentIndex.find(entry =>
      String(entry?.reportId || "").trim() === resolvedRaidId
      || String(entry?.id || "").trim() === resolvedRaidId
    ) || null;

    if (!matchedEntry?.id) return null;
    resolvedRaidId = String(matchedEntry.id);
    keys = getRaidKeys(resolvedRaidId);
    [meta, fights, players] = await Promise.all([
      getJsonCache(keys.meta),
      getJsonCache(keys.fights),
      getJsonCache(keys.players),
    ]);
  }

  if (!meta) return null;
  const [importPayload, threatByFight] = await Promise.all([
    getJsonCache(keys.importPayload),
    loadThreatByFight(resolvedRaidId),
  ]);
  return {
    ...meta,
    importPayload: {
      ...((importPayload || meta.importPayload || {})),
      threatByFight: threatByFight || importPayload?.threatByFight || meta.importPayload?.threatByFight || {},
    },
    fights: fights || [],
    players: players || [],
  };
}

export async function updateRaidBundle(raidId, updates) {
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
    deleteKey(keys.importPayload),
    (async () => {
      const threatMeta = await getJsonCache(keys.threatByFightMeta);
      const fightIds = Array.isArray(threatMeta?.snapshotFightIds) ? threatMeta.snapshotFightIds : [];
      const deletes = [deleteKey(keys.threatByFightMeta)];
      for (const fightId of fightIds) {
        deletes.push(deleteKey(getThreatByFightSnapshotKey(raidId, fightId)));
      }
      const deleteResults = await Promise.all(deletes);
      return deleteResults.every(Boolean);
    })(),
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

      const summary = await saveRaidBundle(normalizedRaid, { notifyIfNew: true });
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

import { assembleRpbRaid, fetchRpbImportStep, importRpbRaid, parseReportId } from "../RPB/server/rpbImportService.js";
import { acquireLock, buildCacheKey, deleteKey, getJsonCache, releaseLock, setJsonCache } from "../RPB/server/upstashRedis.js";
import { buildAutoReportTitle } from "../src/modules/rpb/reportTitle.js";
import { getRaidBundle, saveRaidBundle } from "./rpb-store.js";

const IMPORT_SESSION_TTL_SECONDS = 60 * 30;

function getImportSessionKey(importSessionId) {
  const normalized = String(importSessionId || "").trim();
  return normalized ? buildCacheKey("rpb:import-session", [normalized]) : "";
}

async function loadStagedDatasets(importSessionId) {
  const key = getImportSessionKey(importSessionId);
  if (!key) return null;
  return (await getJsonCache(key)) || {};
}

async function saveStagedDatasets(importSessionId, datasets) {
  const key = getImportSessionKey(importSessionId);
  if (!key) return false;
  return setJsonCache(key, datasets || {}, IMPORT_SESSION_TTL_SECONDS);
}

async function deleteStagedDatasets(importSessionId) {
  const key = getImportSessionKey(importSessionId);
  if (!key) return false;
  return deleteKey(key);
}

async function assembleMergedRaid(reqBody, datasets) {
  const raidId = String(reqBody?.raidId || "").trim();
  if (!raidId) {
    throw new Error("Raid ID is required for selective imports.");
  }

  const existingRaid = await getRaidBundle(raidId);
  if (!existingRaid) {
    throw new Error("Existing raid not found for selective import.");
  }

  const mergedDatasets = {
    ...(existingRaid.importPayload || {}),
    ...(datasets || {}),
  };

  if (!mergedDatasets?.fights || !Array.isArray(mergedDatasets.fights?.fights)) {
    throw new Error("This report is missing base import payload data. Run a full reimport first.");
  }

  const assembledRaid = assembleRpbRaid({
    reportUrl: reqBody?.reportUrl || "",
    reportId: existingRaid.reportId || reqBody?.reportId || "",
  }, mergedDatasets);

  return {
    ...assembledRaid,
    id: existingRaid.id,
    reportId: existingRaid.reportId || assembledRaid.reportId,
    importedAt: existingRaid.importedAt || assembledRaid.importedAt,
    updatedAt: new Date().toISOString(),
    teamTag: reqBody?.teamTag ?? existingRaid.teamTag ?? "",
    title: String(reqBody?.title || existingRaid.title || "").trim()
      || buildAutoReportTitle({ start: assembledRaid.start, teamTag: reqBody?.teamTag ?? existingRaid.teamTag ?? "" }),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const reportId = parseReportId(req.body?.reportUrl || req.body?.reportId || "");
  const actionLabel = req.body?.action === "step"
    ? `step:${req.body?.step || "unknown"}`
    : (req.body?.action || "import");
  const lockKey = reportId ? buildCacheKey("rpb:import-lock", [reportId, actionLabel]) : "";

  try {
    if (lockKey) {
      const locked = await acquireLock(lockKey, 90);
      if (!locked) {
        return res.status(409).json({ error: "An import for this report is already running. Try again in a moment." });
      }
    }

    if (req.body?.action === "step") {
      const data = await fetchRpbImportStep(req.body.step, req.body || {});
      if (req.body?.importSessionId) {
        const stagedDatasets = (await loadStagedDatasets(req.body.importSessionId)) || {};
        stagedDatasets[req.body.step] = data;
        const saved = await saveStagedDatasets(req.body.importSessionId, stagedDatasets);
        if (!saved) {
          return res.status(500).json({ error: "Failed to stage import data in Redis." });
        }
      }
      return res.status(200).json(data);
    }

    if (req.body?.action === "assemble") {
      const datasets = req.body.datasets || (await loadStagedDatasets(req.body?.importSessionId)) || {};
      const raid = assembleRpbRaid(req.body || {}, datasets);
      return res.status(200).json(raid);
    }

    if (req.body?.action === "assembleMerge") {
      const datasets = req.body.datasets || (await loadStagedDatasets(req.body?.importSessionId)) || {};
      const raid = await assembleMergedRaid(req.body || {}, datasets);
      return res.status(200).json(raid);
    }

    if (req.body?.action === "assembleAndSave") {
      const datasets = req.body.datasets || (await loadStagedDatasets(req.body?.importSessionId)) || {};
      const raid = assembleRpbRaid(req.body || {}, datasets);
      raid.teamTag = req.body?.teamTag || "";
      raid.title = String(req.body?.title || "").trim() || buildAutoReportTitle({ start: raid.start, teamTag: raid.teamTag });
      const summary = await saveRaidBundle(raid, { notifyIfNew: req.body?.notifyIfNew !== false });
      if (req.body?.importSessionId) {
        await deleteStagedDatasets(req.body.importSessionId);
      }
      return res.status(200).json({
        persistence: "remote",
        raidId: raid.id,
        summary,
      });
    }

    if (req.body?.action === "assembleMergeAndSave") {
      const datasets = req.body.datasets || (await loadStagedDatasets(req.body?.importSessionId)) || {};
      const raid = await assembleMergedRaid(req.body || {}, datasets);
      const summary = await saveRaidBundle(raid, { notifyIfNew: false });
      if (req.body?.importSessionId) {
        await deleteStagedDatasets(req.body.importSessionId);
      }
      return res.status(200).json({
        persistence: "remote",
        raidId: raid.id,
        summary,
      });
    }

    const raid = await importRpbRaid(req.body || {});
    return res.status(200).json(raid);
  } catch (error) {
    console.error("RPB import failed:", error);
    return res.status(500).json({ error: error.message || "Import failed" });
  } finally {
    if (lockKey) {
      await releaseLock(lockKey);
    }
  }
}

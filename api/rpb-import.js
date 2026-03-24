import { assembleRpbRaid, fetchRpbImportStep, importRpbRaid, parseReportId } from "../RPB/server/rpbImportService.js";
import { acquireLock, buildCacheKey, releaseLock } from "../RPB/server/upstashRedis.js";
import { buildAutoReportTitle } from "../src/modules/rpb/reportTitle.js";
import { saveRaidBundle } from "./rpb-store.js";

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
      return res.status(200).json(data);
    }

    if (req.body?.action === "assemble") {
      const raid = assembleRpbRaid(req.body || {}, req.body.datasets || {});
      return res.status(200).json(raid);
    }

    if (req.body?.action === "assembleAndSave") {
      const raid = assembleRpbRaid(req.body || {}, req.body.datasets || {});
      raid.teamTag = req.body?.teamTag || "";
      raid.title = String(req.body?.title || "").trim() || buildAutoReportTitle({ start: raid.start, teamTag: raid.teamTag });
      const summary = await saveRaidBundle(raid, { notifyIfNew: true });
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

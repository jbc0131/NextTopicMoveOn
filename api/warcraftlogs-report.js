// api/warcraftlogs-report.js
// Vercel serverless function — proxies WarcraftLogs v1 REST API for report analysis
// Uses WCL_API_KEY env var (v1 public API key, not OAuth)
//
// POST /api/warcraftlogs-report
// Body: { action: "fights"|"damage-taken"|"debuffs"|"casts"|"absorbs"|"cooldowns", reportId, [extra params] }

const BASE_URL = "https://classic.warcraftlogs.com/v1";

// TBC-relevant cooldown spell IDs to track
const COOLDOWN_SPELL_IDS = [
  // Bloodlust / Heroism
  2825, 32182,
  // Innervate
  29166,
  // Power Infusion
  10060,
  // Mana Tide Totem
  16190,
  // Divine Intervention
  19752,
  // Pain Suppression
  33206,
  // Shield Wall
  871,
  // Last Stand
  12975,
  // Aura Mastery
  31821,
  // Lay on Hands
  27154,
  // Nature's Swiftness
  17116, 16188,
  // Rebirth (combat rez)
  20484,
  // Soulstone
  20707,
  // Tricks of the Trade
  57933,
  // Heroic Presence (draenei)
  6562,
].join(",");

async function wclFetch(path) {
  const apiKey = process.env.WCL_API_KEY;
  if (!apiKey) throw new Error("WCL_API_KEY env var is required");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}api_key=${apiKey}&translate=true`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL v1 error ${res.status}: ${text}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, reportId, start, end, sourceId, targetId } = req.body;

  if (!reportId) return res.status(400).json({ error: "reportId required" });

  const timeRange = (start != null && end != null)
    ? `&start=${start}&end=${end}`
    : "&start=0&end=999999999999";

  // Exclude encounter 724 (a common trash filter used by RPB)
  const filter724 = "&filter=encounterid%20%21%3D%20724";

  try {
    let data;

    switch (action) {

      // ── Fight list + metadata ─────────────────────────────────────────────
      case "fights":
        data = await wclFetch(`/report/fights/${reportId}?`);
        // Return slim version: just fights, title, start time
        return res.status(200).json({
          title: data.title,
          start: data.start,
          end: data.end,
          fights: (data.fights || []).map(f => ({
            id: f.id,
            name: f.name,
            start_time: f.start_time,
            end_time: f.end_time,
            boss: f.boss,
            kill: f.kill,
            difficulty: f.difficulty,
            size: f.size,
          })),
          friendlies: (data.friendlies || []).map(f => ({
            id: f.id,
            name: f.name,
            type: f.type,
          })),
        });

      // ── Damage taken per player (boss encounters only) ────────────────────
      case "damage-taken":
        data = await wclFetch(
          `/report/tables/damage-taken/${reportId}?options=4134${timeRange}${filter724}` +
          (sourceId ? `&sourceid=${sourceId}` : "") +
          `&by=ability`
        );
        return res.status(200).json(data);

      // ── Damage taken top-level (all players) ─────────────────────────────
      case "damage-taken-all":
        data = await wclFetch(
          `/report/tables/damage-taken/${reportId}?options=4098${timeRange}${filter724}&by=ability`
        );
        return res.status(200).json(data);

      // ── Debuffs applied on bosses — uptime % ─────────────────────────────
      case "debuffs":
        data = await wclFetch(
          `/report/tables/debuffs/${reportId}?options=2&hostility=1&by=target${timeRange}${filter724}` +
          (targetId ? `&targetid=${targetId}` : "") +
          `&encounter=-2`
        );
        return res.status(200).json(data);

      // ── All debuffs (total, for uptime calc) ─────────────────────────────
      case "debuffs-total":
        data = await wclFetch(
          `/report/tables/debuffs/${reportId}?hostility=1${timeRange}${filter724}&encounter=-2`
        );
        return res.status(200).json(data);

      // ── Casts per player (single-target + AoE) ───────────────────────────
      case "casts":
        data = await wclFetch(
          `/report/tables/casts/${reportId}?${timeRange}${filter724}` +
          (sourceId ? `&sourceid=${sourceId}` : "")
        );
        return res.status(200).json(data);

      // ── All players casting (for player discovery) ────────────────────────
      case "casts-all":
        data = await wclFetch(
          `/report/tables/casts/${reportId}?${timeRange}${filter724}`
        );
        return res.status(200).json(data);

      // ── Absorbs ──────────────────────────────────────────────────────────
      case "absorbs":
        data = await wclFetch(
          `/report/tables/damage-taken/${reportId}?options=4134${timeRange}${filter724}&by=target&hostility=0`
        );
        return res.status(200).json(data);

      // ── Cooldown usage ───────────────────────────────────────────────────
      case "cooldowns":
        data = await wclFetch(
          `/report/tables/casts/${reportId}?${timeRange}${filter724}` +
          `&filter=ability.id%20IN%20%28${COOLDOWN_SPELL_IDS}%29&by=source`
        );
        return res.status(200).json(data);

      // ── Summary (total time, player counts) ──────────────────────────────
      case "summary":
        data = await wclFetch(
          `/report/tables/summary/${reportId}?${timeRange}${filter724}`
        );
        return res.status(200).json(data);

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (err) {
    console.error("WCL report proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

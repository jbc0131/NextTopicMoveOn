// api/warcraftlogs-report.js
// WarcraftLogs v1 REST API proxy for RPB-style analysis
// Requires WCL_API_KEY env var (v1 public API key)

const BASE_URL = "https://classic.warcraftlogs.com/v1";

// Trinket/racial spell IDs we track across all roles
const TRACKED_CAST_IDS = [
  // Caster trinkets
  34429, 34430, 34427, 34428, 34432, 33507, 37445, 37579,
  // Healer trinkets  
  35083, 35084, 35085, 37665, 37666, 35065, 35066, 37064, 26470, 6346,
  // Physical trinkets
  32654, 33496, 33497, 24604, 14108,
  // Tank trinkets
  32666, 33523,
  // Racials (all roles)
  20554, 20572, 20549, 7744,
  // Windfury
  25584, 33750,
  // Bloodlust/Heroism
  2825, 32182,
  // Other key cooldowns
  29166, 10060, 16190, 19752, 33206, 871, 12975, 31821, 27154, 20484, 20707,
].join(",");

async function wclFetch(path) {
  const apiKey = process.env.WCL_API_KEY;
  if (!apiKey) throw new Error("WCL_API_KEY env var is required");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}api_key=${apiKey}&translate=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WCL v1 ${res.status}: ${await res.text()}`);
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
  if (!/^[A-Za-z0-9]+$/.test(reportId)) return res.status(400).json({ error: "Invalid reportId format" });

  const tr = (start != null && end != null) ? `&start=${start}&end=${end}` : "&start=0&end=999999999999";
  const f724 = "&filter=encounterid%20%21%3D%20724";
  const trNoFilter = (start != null && end != null) ? `&start=${start}&end=${end}` : "&start=0&end=999999999999";

  try {
    let data;
    switch (action) {

      // Fight list + friendlies
      case "fights":
        data = await wclFetch(`/report/fights/${reportId}?`);
        return res.status(200).json({
          title: data.title,
          start: data.start,
          end: data.end,
          fights: (data.fights || []).map(f => ({
            id: f.id, name: f.name,
            start_time: f.start_time, end_time: f.end_time,
            boss: f.boss, kill: f.kill,
          })),
          friendlies: (data.friendlies || []).map(f => ({
            id: f.id, name: f.name, type: f.type,
          })),
        });

      // Per-player summary — outgoing/incoming hit stats
      // Returns entries[] where each entry is one player with combatData
      case "summary":
        data = await wclFetch(`/report/tables/summary/${reportId}?${tr}${f724}`);
        return res.status(200).json(data);

      // Damage taken grouped by TARGET then by ABILITY — core avoidable dmg data
      // options=4098 = by source+target, by=ability gives per-ability breakdown per target
      case "damage-taken-by-target":
        data = await wclFetch(
          `/report/tables/damage-taken/${reportId}?options=4098${tr}${f724}&by=ability`
        );
        return res.status(200).json(data);

      // Deaths — all encounters
      case "deaths":
        data = await wclFetch(`/report/tables/deaths/${reportId}?${tr}${f724}`);
        return res.status(200).json(data);

      // Deaths — trash only
      case "deaths-trash":
        data = await wclFetch(`/report/tables/deaths/${reportId}?${tr}${f724}&encounter=0`);
        return res.status(200).json(data);

      // All casts — for trinkets, racials, windfury, cooldowns
      // We use a broad filter to capture all tracked spell IDs
      case "tracked-casts":
        data = await wclFetch(
          `/report/tables/casts/${reportId}?${trNoFilter}` +
          `&filter=ability.id%20IN%20%28${TRACKED_CAST_IDS}%29&by=source`
        );
        return res.status(200).json(data);

      // Buffs on players — for shout uptimes
      // options=2 = uptime; by=target gives uptime per player
      case "buffs-uptime":
        data = await wclFetch(
          `/report/tables/buffs/${reportId}?options=2&by=target${tr}${f724}` +
          (targetId ? `&targetid=${targetId}` : "")
        );
        return res.status(200).json(data);

      // Buffs on ALL players (total) — for shout uptime across raid
      case "buffs-all":
        data = await wclFetch(
          `/report/tables/buffs/${reportId}?options=2&by=target${tr}${f724}`
        );
        return res.status(200).json(data);

      // Hostile (friendly fire) damage — player hitting players
      case "hostile-players":
        data = await wclFetch(
          `/report/tables/damage-done/${reportId}?${tr}${f724}&targetclass=player&by=source`
        );
        return res.status(200).json(data);

      // Debuffs on bosses — uptime
      case "debuffs-bosses":
        data = await wclFetch(
          `/report/tables/debuffs/${reportId}?hostility=1${tr}${f724}&encounter=-2`
        );
        return res.status(200).json(data);

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("WCL proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

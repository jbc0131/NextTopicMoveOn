import fs from "fs";

function readEnv() {
  const path = ".env";
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\n/)
      .filter(line => line && !line.startsWith("#") && line.includes("="))
      .map(line => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

function getArg(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getDurationMs(start, end) {
  return Math.max(0, Number(end || 0) - Number(start || 0));
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
    || node.critTickCount != null;

  if (hasAbilityIdentity && hasStatPayload) rows.push(node);

  for (const childKey of ["subentries", "entries", "abilities", "sources", "targets", "spells"]) {
    if (Array.isArray(node[childKey])) {
      collectRawAbilityRows(node[childKey], rows);
    }
  }

  return rows;
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

function aggregateAbilitiesBefore(entries = []) {
  const grouped = new Map();

  for (const entry of collectRawAbilityRows(entries)) {
    const guid = entry.guid ?? entry.gameID ?? entry.abilityGameID ?? null;
    const name = entry.name || entry.abilityName || entry.ability?.name || "Unknown Ability";
    const key = String(guid ?? name ?? "unknown");
    const current = grouped.get(key) || { guid, name, total: 0, hits: 0, crits: 0 };

    current.total += Number(entry.total ?? entry.amount ?? 0);
    current.hits += Number(entry.hitCount ?? entry.hits ?? entry.totalHits ?? entry.landedHits ?? entry.count ?? 0);
    current.hits += Number(entry.tickCount ?? 0);
    current.hits += Number(entry.missCount ?? 0);
    current.crits += Number(entry.critHitCount ?? entry.criticalHits ?? entry.crits ?? entry.critCount ?? entry.critHits ?? 0);
    current.crits += Number(entry.critTickCount ?? 0);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function aggregateAbilitiesAfter(entries = []) {
  const grouped = new Map();

  for (const entry of collectRawAbilityRows(entries)) {
    const guid = entry.guid ?? entry.gameID ?? entry.abilityGameID ?? null;
    const name = entry.name || entry.abilityName || entry.ability?.name || "Unknown Ability";
    const key = String(guid ?? name ?? "unknown");
    const current = grouped.get(key) || { guid, name, total: 0, hits: 0, crits: 0 };

    current.total += Number(entry.total ?? entry.amount ?? 0);
    current.hits += Number(entry.hitCount ?? entry.hits ?? entry.totalHits ?? entry.landedHits ?? entry.count ?? 0);
    current.hits += Number(entry.tickCount ?? 0);
    current.crits += Number(entry.critHitCount ?? entry.criticalHits ?? entry.crits ?? entry.critCount ?? entry.critHits ?? 0);
    current.crits += Number(entry.critTickCount ?? 0);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function formatPercent(crits, hits) {
  if (!Number.isFinite(hits) || hits <= 0) return "0.0%";
  return `${((Number(crits || 0) / hits) * 100).toFixed(1)}%`;
}

function formatDps(total, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0.0";
  return (Number(total || 0) / (ms / 1000)).toFixed(1);
}

async function wclFetch(path, params, apiKey) {
  const url = new URL(`https://classic.warcraftlogs.com:443/v1${path}`);
  Object.entries({ ...params, api_key: apiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WCL ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  const env = readEnv();
  const apiKey = getArg("--api-key", env.WCL_API_KEY || "");
  const reportId = getArg("--report");
  const fightId = getArg("--fight");
  const playerName = getArg("--player");
  const abilityName = getArg("--ability", "");

  if (!apiKey) throw new Error("Missing WCL API key. Pass --api-key or set WCL_API_KEY in .env.");
  if (!reportId) throw new Error("Missing --report <reportId>.");
  if (!fightId) throw new Error("Missing --fight <fightId>.");
  if (!playerName) throw new Error("Missing --player <playerName>.");

  const fights = await wclFetch(`/report/fights/${reportId}`, {}, apiKey);
  const fight = (fights.fights || []).find(entry => String(entry?.id) === String(fightId));
  if (!fight) throw new Error(`Fight ${fightId} not found in report ${reportId}.`);

  const durationMs = getDurationMs(fight.start_time, fight.end_time);
  const damage = await wclFetch(`/report/tables/damage-done/${reportId}`, {
    start: fight.start_time ?? 0,
    end: fight.end_time ?? 0,
    by: "source",
    options: 2,
  }, apiKey);

  const entry = (damage.entries || []).find(candidate => String(candidate?.name || "").toLowerCase() === String(playerName).toLowerCase());
  if (!entry) throw new Error(`Player ${playerName} not found in fight ${fightId}.`);

  const beforeDps = formatDps(entry.total, Number(entry.activeTime || 0));
  const afterDps = formatDps(entry.total, durationMs);
  const beforeAbilities = aggregateAbilitiesBefore(getNestedAbilityCollection(entry));
  const afterAbilities = aggregateAbilitiesAfter(getNestedAbilityCollection(entry));
  const targetAbilityName = abilityName || "Steady Shot";
  const beforeAbility = beforeAbilities.find(row => String(row.name).toLowerCase() === targetAbilityName.toLowerCase());
  const afterAbility = afterAbilities.find(row => String(row.name).toLowerCase() === targetAbilityName.toLowerCase());

  console.log(`Report: ${reportId}`);
  console.log(`Fight: ${fight.id} ${fight.name}`);
  console.log(`Player: ${entry.name} (${entry.type || "Unknown"})`);
  console.log("");
  console.log("DPS");
  console.log(`  before(activeTime): ${beforeDps}`);
  console.log(`  after(encounter):   ${afterDps}`);
  console.log(`  total damage:       ${Number(entry.total || 0).toLocaleString()}`);
  console.log(`  active time ms:     ${Number(entry.activeTime || 0)}`);
  console.log(`  fight duration ms:  ${durationMs}`);

  if (beforeAbility || afterAbility) {
    console.log("");
    console.log(`Ability: ${targetAbilityName}`);
    console.log(`  before crit%: ${formatPercent(beforeAbility?.crits || 0, beforeAbility?.hits || 0)} (${beforeAbility?.crits || 0}/${beforeAbility?.hits || 0})`);
    console.log(`  after crit%:  ${formatPercent(afterAbility?.crits || 0, afterAbility?.hits || 0)} (${afterAbility?.crits || 0}/${afterAbility?.hits || 0})`);
    console.log(`  total damage: ${Number(afterAbility?.total || beforeAbility?.total || 0).toLocaleString()}`);
  } else {
    console.log("");
    console.log(`Ability ${targetAbilityName} not found for ${entry.name}.`);
  }
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSnapshots, isFirebaseConfigured } from "./firebase";
import { FontImport } from "./components";

const FIREBASE_OK = isFirebaseConfigured();

// ── WoW class colors ──────────────────────────────────────────────────────────
const CLASS_COLOR = {
  Warrior: "#C79C6E", Paladin: "#F58CBA", Hunter: "#ABD473",
  Rogue: "#FFF569", Priest: "#FFFFFF", Shaman: "#0070DE",
  Mage: "#69CCF0", Warlock: "#9482C9", Druid: "#FF7D0A",
};
const CLASS_BG = {
  Warrior: "#2a1a0a", Paladin: "#2a0a18", Hunter: "#0a1a00",
  Rogue:   "#1e1e00", Priest:  "#111111", Shaman: "#001828",
  Mage:    "#001020", Warlock: "#100820", Druid:  "#1e0c00",
};

// ── Role → class membership ───────────────────────────────────────────────────
const ROLE_CLASSES = {
  Caster:   ["Mage", "Warlock", "Druid", "Priest", "Shaman"],
  Healer:   ["Priest", "Paladin", "Druid", "Shaman"],
  Physical: ["Warrior", "Rogue", "Hunter", "Paladin", "Druid", "Shaman"],
  Tank:     ["Warrior", "Paladin", "Druid"],
};

// ── Avoidable damage sources ──────────────────────────────────────────────────
const AVOIDABLE = [
  { key: "cleave",        short: "Cleave",        name: "Cleave (Lair Brute/Magtheridon)", ids: [30284, 26350, 38540, 6343] },
  { key: "shatter",       short: "Shatter",       name: "Shatter (Gruul)",                 ids: [33671, 38010, 33654] },
  { key: "caveIn",        short: "Cave In",       name: "Cave In (Gruul)",                  ids: [36240, 36241, 32007] },
  { key: "rainOfFire",    short: "Rain of Fire",  name: "Rain of Fire (Hellfire Warder)",   ids: [34360, 36680, 36081] },
  { key: "conflagration", short: "Conflag.",      name: "Conflagration (Magtheridon)",      ids: [30757, 39346, 33796] },
  { key: "blastWave",     short: "Blast Wave",    name: "Blast Wave (Krosh Firehand)",      ids: [30600, 38537, 30093] },
  { key: "whirlwind",     short: "Whirlwind",     name: "Whirlwind (High King Maulgar)",    ids: [26038, 38369], tankOnly: true },
  { key: "debris",        short: "Debris",        name: "Debris (Environment)",             ids: [36449, 30409] },
  { key: "falling",       short: "Falling",       name: "Falling",                          ids: [3] },
];

// ── Trinkets & racials per role ───────────────────────────────────────────────
const TRINKETS = {
  Caster: [
    { name: "Oshu'gun Relic",                        ids: [37445, 37579] },
    { name: "Icon of the Silver Crescent",           ids: [34429, 34430] },
    { name: "Spell Power (Scryer/Xi'ri)",            ids: [34427, 34428, 34432] },
    { name: "Forgotten Knowledge",                   ids: [33507] },
    { name: "Blood Fury",                            ids: [20572] },
  ],
  Healer: [
    { name: "Bangle of Endless Blessings",           ids: [35083] },
    { name: "Essence of the Martyr",                 ids: [37665, 37666] },
    { name: "Lower City Prayerbook",                 ids: [35084, 35085] },
    { name: "Pendant of the Violet Eye",             ids: [35065, 35066] },
    { name: "Ribbon of Sacrifice",                   ids: [37064] },
    { name: "Oshu'gun Relic",                        ids: [37445, 37579] },
    { name: "Scarab Brooch",                         ids: [26470] },
    { name: "Berserking",                            ids: [20554] },
    { name: "Fear Ward",                             ids: [6346] },
  ],
  Physical: [
    { name: "Figurine - Dawnstone Crab",             ids: [32654] },
    { name: "Abacus of Violent Odds",                ids: [33496, 33497] },
    { name: "Bladefist's Breadth",                   ids: [24604] },
    { name: "Bloodlust Brooch",                      ids: [34428] },
    { name: "Kiss of the Spider",                    ids: [14108] },
    { name: "Berserking",                            ids: [20554] },
    { name: "Blood Fury",                            ids: [20572] },
  ],
  Tank: [
    { name: "Adamantine Figurine",                   ids: [32666] },
    { name: "Figurine of the Colossus",              ids: [33523] },
    { name: "Berserking",                            ids: [20554] },
    { name: "Blood Fury",                            ids: [20572] },
  ],
};

const BATTLE_SHOUT_IDS    = [25289, 2048, 6673, 11549, 11550, 11551];
const COMMANDING_SHOUT_ID = [469];

// ── API helper ────────────────────────────────────────────────────────────────
async function rpbFetch(action, reportId, extra = {}) {
  const res = await fetch("/api/warcraftlogs-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reportId, ...extra }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function extractCode(url) {
  const m = url?.match(/reports\/([A-Za-z0-9]+)/);
  return m ? m[1] : url;
}

function fmtK(n) {
  if (!n) return "";
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n/1000).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtDur(ms) {
  const s = Math.floor(ms/1000), m = Math.floor(s/60);
  return `${m}:${(s%60).toString().padStart(2,"0")}`;
}

// ── Data accessors ────────────────────────────────────────────────────────────

// Get avoidable damage for a player from a specific ability set
// damageTaken shape (by=ability): { entries: [ { guid, id, name(spell), entries: [ { name(player), total } ] } ] }
function getAvoidDmg(damageTaken, playerName, abilityIds) {
  if (!damageTaken?.entries) return 0;
  let total = 0;
  for (const ab of damageTaken.entries) {
    if (!abilityIds.includes(ab.guid) && !abilityIds.includes(ab.id)) continue;
    const hit = ab.entries?.find(e => e.name === playerName);
    if (hit) total += hit.total || 0;
  }
  return total;
}

// Total damage taken by player
function getTotalDmgTaken(damageTaken, playerName) {
  if (!damageTaken?.entries) return 0;
  let total = 0;
  for (const ab of damageTaken.entries) {
    const hit = ab.entries?.find(e => e.name === playerName);
    if (hit) total += hit.total || 0;
  }
  return total;
}

// Friendly fire (damage done to playerName by other raid members)
function getFriendlyFireDmg(hostilePlayers, playerName) {
  if (!hostilePlayers?.entries) return 0;
  let total = 0;
  for (const source of hostilePlayers.entries) {
    if (source.name === playerName) continue; // skip self-inflicted
    const hit = source.entries?.find(e => e.name === playerName);
    if (hit) total += hit.total || 0;
  }
  return total;
}

// Tracked cast count for a player (trinkets, racials, etc.)
function getCastCount(trackedCasts, playerName, spellIds) {
  if (!trackedCasts?.entries) return 0;
  const pe = trackedCasts.entries.find(e => e.name === playerName);
  if (!pe?.entries) return 0;
  return pe.entries
    .filter(e => spellIds.includes(e.guid) || spellIds.includes(e.id))
    .reduce((s, e) => s + (e.total || 0), 0);
}

// Buff uptime % for a player
// buffsAll shape (by=target): { totalTime, entries: [ { name(player), auras: [ { guid, totalUptime } ] } ] }
function getBuffUptime(buffsAll, playerName, spellIds) {
  if (!buffsAll?.entries) return null;
  const pe = buffsAll.entries.find(e => e.name === playerName);
  if (!pe?.auras) return null;
  const aura = pe.auras.find(a => spellIds.includes(a.guid));
  if (!aura) return null;
  const total = buffsAll.totalTime || pe.totalTime || 1;
  return Math.round(aura.totalUptime * 100 / total);
}

// Death count
function getDeaths(deaths, playerName) {
  if (!deaths?.entries) return 0;
  return deaths.entries.find(e => e.name === playerName)?.total || 0;
}

// ── Compute per-player data for a role ───────────────────────────────────────
function computePlayerData(players, rd, role) {
  const { damageTaken, trackedCasts, buffsAll, hostilePlayers, deaths, deathsTrash } = rd;

  const avoidSources = AVOIDABLE.filter(s => !s.tankOnly || role === "Tank");

  return players.map(p => {
    // Per-mechanic avoidable damage
    const byMechanic = {};
    let avoidTotal = 0;
    for (const src of avoidSources) {
      const dmg = getAvoidDmg(damageTaken, p.name, src.ids);
      byMechanic[src.key] = dmg;
      avoidTotal += dmg;
    }
    // Friendly fire
    const friendlyFire = getFriendlyFireDmg(hostilePlayers, p.name);
    avoidTotal += friendlyFire;

    // Total dmg taken
    const totalDmg = getTotalDmgTaken(damageTaken, p.name);
    const avoidPct = totalDmg > 0 ? Math.round(avoidTotal * 100 / totalDmg) : 0;

    // Deaths
    const totalDeaths = getDeaths(deaths, p.name);
    const trashDeaths = getDeaths(deathsTrash, p.name);

    // Trinkets
    const trinketData = (TRINKETS[role] || []).map(t => ({
      name: t.name,
      count: getCastCount(trackedCasts, p.name, t.ids),
    })).filter(t => t.count > 0);

    // Shout uptimes (only for physical/tank)
    const battleShout    = (role === "Physical" || role === "Tank")
      ? getBuffUptime(buffsAll, p.name, BATTLE_SHOUT_IDS) : null;
    const commandShout   = getBuffUptime(buffsAll, p.name, COMMANDING_SHOUT_ID);

    return {
      ...p,
      byMechanic,
      friendlyFire,
      avoidTotal,
      avoidPct,
      totalDmg,
      totalDeaths,
      trashDeaths,
      trinketData,
      battleShout,
      commandShout,
    };
  });
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function avoidColor(val, max) {
  if (!val || !max) return { bg: "transparent", text: "#333" };
  const r = val / max;
  if (r > 0.70) return { bg: "rgba(200,40,0,0.45)",   text: "#ff9955" };
  if (r > 0.40) return { bg: "rgba(180,110,0,0.35)",  text: "#ffcc77" };
  if (r > 0.10) return { bg: "rgba(100,130,0,0.20)",  text: "#ccdd88" };
  return { bg: "transparent", text: "#888" };
}

function deathsColor(n) {
  if (!n) return { bg: "transparent", text: "#333" };
  if (n >= 4) return { bg: "rgba(200,20,0,0.5)",  text: "#ff7766" };
  if (n >= 2) return { bg: "rgba(180,80,0,0.35)", text: "#ffaa55" };
  return { bg: "rgba(120,100,0,0.25)", text: "#ddcc66" };
}

function pctColor(pct) {
  if (!pct) return "#333";
  if (pct >= 60) return "#ef4444";
  if (pct >= 30) return "#f97316";
  if (pct >= 10) return "#eab308";
  return "#888";
}

// ── Avoidable Damage Table ────────────────────────────────────────────────────
function AvoidableTable({ playerData, role }) {
  const avoidSources = AVOIDABLE.filter(s => !s.tankOnly || role === "Tank");

  // Only show mechanics where at least one player took damage
  const activeSources = avoidSources.filter(src =>
    playerData.some(p => (p.byMechanic[src.key] || 0) > 0)
  );
  const hasFriendlyFire = playerData.some(p => p.friendlyFire > 0);

  // Max per column for heatmap
  const colMax = {};
  activeSources.forEach(src => {
    colMax[src.key] = Math.max(...playerData.map(p => p.byMechanic[src.key] || 0));
  });
  const maxFriendlyFire = Math.max(...playerData.map(p => p.friendlyFire || 0));
  const maxDeaths = Math.max(...playerData.map(p => p.totalDeaths || 0));

  // Sort players: worst avoidable damage first
  const sorted = [...playerData].sort((a, b) => b.avoidTotal - a.avoidTotal);

  const th = {
    padding: "6px 8px", fontSize: 8, letterSpacing: "0.08em",
    color: "#666", fontFamily: "'Cinzel', serif", fontWeight: 600,
    borderBottom: "1px solid #1a1a2a", whiteSpace: "nowrap",
    position: "sticky", top: 0, background: "#06060f", zIndex: 2,
  };
  const tdBase = {
    padding: "5px 8px", fontFamily: "monospace", fontSize: 10,
    borderBottom: "1px solid #0d0d1a", textAlign: "center",
    borderRight: "1px solid #0d0d1a",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", width: 140, position: "sticky", left: 0, zIndex: 3, background: "#06060f" }}>PLAYER</th>
            {activeSources.map(src => (
              <th key={src.key} style={{ ...th, textAlign: "center", maxWidth: 80 }} title={src.name}>{src.short.toUpperCase()}</th>
            ))}
            {hasFriendlyFire && <th style={{ ...th }} title="Friendly Fire">FF DMG</th>}
            <th style={{ ...th }}>TOTAL</th>
            <th style={{ ...th }}>% OF DMG</th>
            <th style={{ ...th }}>DEATHS</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const dc = deathsColor(p.totalDeaths);
            const rowBg = i % 2 === 0 ? "#07070f" : "#06060f";
            return (
              <tr key={p.id} style={{ background: rowBg }}>
                {/* Player name */}
                <td style={{
                  ...tdBase, textAlign: "left", fontFamily: "'Cinzel', serif",
                  position: "sticky", left: 0, background: rowBg,
                  borderRight: "1px solid #1a1a2a",
                }}>
                  <span style={{ color: CLASS_COLOR[p.type] || "#aaa", fontWeight: 600, fontSize: 11 }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 8, color: "#444", marginLeft: 6 }}>{p.type}</span>
                </td>

                {/* Per-mechanic cells */}
                {activeSources.map(src => {
                  const val = p.byMechanic[src.key] || 0;
                  const { bg, text } = avoidColor(val, colMax[src.key]);
                  return (
                    <td key={src.key} style={{ ...tdBase, background: bg, color: text }}>
                      {val ? fmtK(val) : ""}
                    </td>
                  );
                })}

                {/* Friendly fire */}
                {hasFriendlyFire && (() => {
                  const { bg, text } = avoidColor(p.friendlyFire, maxFriendlyFire);
                  return (
                    <td style={{ ...tdBase, background: bg, color: text }}>
                      {p.friendlyFire ? fmtK(p.friendlyFire) : ""}
                    </td>
                  );
                })()}

                {/* Total avoidable */}
                <td style={{ ...tdBase, color: p.avoidTotal > 0 ? "#ffaa66" : "#333", fontWeight: p.avoidTotal > 0 ? 700 : 400 }}>
                  {fmtK(p.avoidTotal) || "0"}
                </td>

                {/* % of total dmg taken */}
                <td style={{ ...tdBase, color: pctColor(p.avoidPct) }}>
                  {p.avoidTotal > 0 ? `${p.avoidPct}%` : ""}
                </td>

                {/* Deaths */}
                <td style={{ ...tdBase, background: dc.bg, color: dc.text, fontWeight: p.totalDeaths ? 700 : 400 }}>
                  {p.totalDeaths > 0
                    ? (p.trashDeaths > 0 ? `${p.totalDeaths} (${p.trashDeaths})` : `${p.totalDeaths}`)
                    : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Trinket Usage Table ───────────────────────────────────────────────────────
function TrinketTable({ playerData, role }) {
  const trinketDefs = TRINKETS[role] || [];
  // Only show trinkets at least one player used
  const activeTrinkets = trinketDefs.filter(t =>
    playerData.some(p => p.trinketData.some(td => td.name === t.name))
  );

  if (!activeTrinkets.length) return (
    <div style={{ color: "#333", fontSize: 10, padding: "12px 0", fontFamily: "'Cinzel', serif" }}>
      No trinket/racial usage detected
    </div>
  );

  const sorted = [...playerData].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 10, fontFamily: "'Cinzel', serif" }}>
        <thead>
          <tr>
            <th style={{ padding: "5px 12px", textAlign: "left", color: "#666", fontSize: 8, letterSpacing: "0.08em", borderBottom: "1px solid #1a1a2a", whiteSpace: "nowrap", minWidth: 140 }}>PLAYER</th>
            {activeTrinkets.map(t => (
              <th key={t.name} style={{ padding: "5px 10px", textAlign: "center", color: "#666", fontSize: 8, letterSpacing: "0.06em", borderBottom: "1px solid #1a1a2a", whiteSpace: "nowrap" }}>
                {t.name.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
              <td style={{ padding: "4px 12px", color: CLASS_COLOR[p.type] || "#aaa", fontWeight: 600, fontSize: 10, borderRight: "1px solid #1a1a2a" }}>
                {p.name}
              </td>
              {activeTrinkets.map(t => {
                const td = p.trinketData.find(x => x.name === t.name);
                return (
                  <td key={t.name} style={{ padding: "4px 10px", textAlign: "center", fontFamily: "monospace", color: td?.count ? "#c8a84b" : "#2a2a2a" }}>
                    {td?.count || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Stats Table ───────────────────────────────────────────────────────────────
function StatsTable({ playerData, role }) {
  const hasShouts = role === "Physical" || role === "Tank";
  const sorted = [...playerData].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 10, fontFamily: "'Cinzel', serif" }}>
        <thead>
          <tr>
            <th style={{ padding: "5px 12px", textAlign: "left", color: "#666", fontSize: 8, letterSpacing: "0.08em", borderBottom: "1px solid #1a1a2a", minWidth: 140 }}>PLAYER</th>
            {hasShouts && <th style={{ padding: "5px 10px", textAlign: "center", color: "#666", fontSize: 8, letterSpacing: "0.06em", borderBottom: "1px solid #1a1a2a" }}>BATTLE SHOUT %</th>}
            <th style={{ padding: "5px 10px", textAlign: "center", color: "#666", fontSize: 8, letterSpacing: "0.06em", borderBottom: "1px solid #1a1a2a" }}>COMMANDING %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
              <td style={{ padding: "4px 12px", color: CLASS_COLOR[p.type] || "#aaa", fontWeight: 600, fontSize: 10, borderRight: "1px solid #1a1a2a" }}>
                {p.name}
              </td>
              {hasShouts && (
                <td style={{ padding: "4px 10px", textAlign: "center", fontFamily: "monospace", color: p.battleShout != null ? "#aaa" : "#2a2a2a" }}>
                  {p.battleShout != null ? `${p.battleShout}%` : ""}
                </td>
              )}
              <td style={{ padding: "4px 10px", textAlign: "center", fontFamily: "monospace", color: p.commandShout != null ? "#aaa" : "#2a2a2a" }}>
                {p.commandShout != null ? `${p.commandShout}%` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer",
          padding: "0 0 8px 0", width: "100%", textAlign: "left",
          borderBottom: "1px solid #1a1a2a", marginBottom: open ? 12 : 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", fontWeight: 700 }}>
          {title}
        </span>
        <span style={{ color: "#444", fontSize: 10, marginLeft: "auto" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && children}
    </div>
  );
}

// ── Fight selector ────────────────────────────────────────────────────────────
function FightBar({ fights, selected, onSelect }) {
  const bossFights = (fights || []).filter(f => f.boss > 0);
  if (!bossFights.length) return null;
  const base = { padding: "3px 10px", borderRadius: 3, cursor: "pointer", fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.05em", border: "none" };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 20px", borderBottom: "1px solid #1a1a2a", background: "#07070f", flexShrink: 0 }}>
      <button onClick={() => onSelect(null)} style={{ ...base, background: !selected ? "#1a1000" : "#0a0a14", border: `1px solid ${!selected ? "#c8a84b" : "#2a2a3a"}`, color: !selected ? "#c8a84b" : "#555" }}>ALL FIGHTS</button>
      {bossFights.map(f => (
        <button key={f.id} onClick={() => onSelect(f)} style={{ ...base, background: selected?.id === f.id ? "#1a1000" : "#0a0a14", border: `1px solid ${selected?.id === f.id ? "#c8a84b" : "#2a2a3a"}`, color: selected?.id === f.id ? "#c8a84b" : "#555" }}>
          {f.name}
          {f.kill === false && <span style={{ color: "#ef4444", marginLeft: 3 }}>✗</span>}
          <span style={{ color: "#444", marginLeft: 5, fontSize: 8 }}>{fmtDur(f.end_time - f.start_time)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Role tabs ─────────────────────────────────────────────────────────────────
const ROLE_TABS = [
  { id: "Caster",   label: "CASTER",   color: "#69CCF0" },
  { id: "Healer",   label: "HEALER",   color: "#F58CBA" },
  { id: "Physical", label: "PHYSICAL", color: "#C79C6E" },
  { id: "Tank",     label: "TANK",     color: "#ABD473" },
];

const CLASS_ORDER = ["Warrior","Paladin","Rogue","Hunter","Mage","Warlock","Druid","Priest","Shaman"];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AnalysisView({ teamId, teamName }) {
  const navigate = useNavigate();
  const [snapshots,     setSnapshots]     = useState([]);
  const [selectedSnap,  setSelectedSnap]  = useState(null);
  const [reportMeta,    setReportMeta]    = useState(null);
  const [selectedFight, setSelectedFight] = useState(null);
  const [activeRole,    setActiveRole]    = useState("Caster");
  const [metaLoading,   setMetaLoading]   = useState(false);
  const [dataLoading,   setDataLoading]   = useState(false);
  const [error,         setError]         = useState(null);
  const [rawData,       setRawData]       = useState(null);

  // Load locked snapshots
  useEffect(() => {
    if (!FIREBASE_OK) return;
    fetchSnapshots(teamId)
      .then(snaps => {
        const locked = snaps.filter(s => s.locked && s.wclReportUrl);
        setSnapshots(locked);
        if (locked.length) setSelectedSnap(locked[0]);
      })
      .catch(console.warn);
  }, [teamId]);

  // Load fight metadata
  useEffect(() => {
    if (!selectedSnap?.wclReportUrl) return;
    const rid = extractCode(selectedSnap.wclReportUrl);
    setReportMeta(null); setRawData(null); setSelectedFight(null); setError(null);
    setMetaLoading(true);
    rpbFetch("fights", rid)
      .then(d => { setReportMeta(d); setMetaLoading(false); })
      .catch(e => { setError(e.message); setMetaLoading(false); });
  }, [selectedSnap]);

  // Load all data when fight changes
  useEffect(() => {
    if (!selectedSnap?.wclReportUrl || !reportMeta) return;
    const rid = extractCode(selectedSnap.wclReportUrl);
    const extra = selectedFight
      ? { start: selectedFight.start_time, end: selectedFight.end_time }
      : {};

    setRawData(null); setDataLoading(true); setError(null);

    Promise.all([
      rpbFetch("damage-taken-by-target", rid, extra),
      rpbFetch("tracked-casts",          rid, extra),
      rpbFetch("buffs-all",              rid, extra),
      rpbFetch("hostile-players",        rid, extra),
      rpbFetch("deaths",                 rid, extra),
      rpbFetch("deaths-trash",           rid, extra),
    ]).then(([damageTaken, trackedCasts, buffsAll, hostilePlayers, deaths, deathsTrash]) => {
      setRawData({ damageTaken, trackedCasts, buffsAll, hostilePlayers, deaths, deathsTrash });
      setDataLoading(false);
    }).catch(e => {
      setError(e.message);
      setDataLoading(false);
    });
  }, [selectedFight, reportMeta, selectedSnap]);

  // Players for active role
  const allPlayers = (reportMeta?.friendlies || []).filter(f => CLASS_COLOR[f.type]);
  const rolePlayers = allPlayers
    .filter(p => (ROLE_CLASSES[activeRole] || []).includes(p.type))
    .sort((a, b) => {
      const ci = CLASS_ORDER.indexOf(a.type) - CLASS_ORDER.indexOf(b.type);
      return ci !== 0 ? ci : a.name.localeCompare(b.name);
    });

  const playerData = rawData
    ? computePlayerData(rolePlayers, rawData, activeRole)
    : null;

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg,#0d0a00,#060608)",
        borderBottom: "1px solid #2a1a00",
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif" }}>
            📊 ROLE PERFORMANCE BREAKDOWN
          </div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.2em", marginTop: 1 }}>{teamName}</div>
        </div>

        {snapshots.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
            <span style={{ fontSize: 9, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>WEEK</span>
            <select
              value={selectedSnap?.id || ""}
              onChange={e => setSelectedSnap(snapshots.find(s => s.id === e.target.value) || null)}
              style={{ background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4, color: "#c8a84b", padding: "4px 10px", fontSize: 10, fontFamily: "'Cinzel', serif", cursor: "pointer", outline: "none" }}
            >
              {snapshots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.raidDate || new Date(s.savedAt).toLocaleDateString()}{s.raidLeader ? ` · ${s.raidLeader}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {reportMeta && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#222" }}>—</span>
            <span style={{ fontSize: 9, color: "#555", fontFamily: "'Cinzel', serif" }}>{reportMeta.title}</span>
            {selectedSnap?.wclReportUrl && (
              <a href={selectedSnap.wclReportUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 9, color: "#60a5fa", textDecoration: "none" }}>↗ WCL</a>
            )}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[["← Public", `/${teamId}`], ["Admin", `/${teamId}/admin`]].map(([label, path]) => (
            <button key={path} onClick={() => navigate(path)} style={{ background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4, color: "#666", cursor: "pointer", padding: "4px 10px", fontSize: 9, fontFamily: "'Cinzel', serif" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!metaLoading && snapshots.length === 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 28 }}>🔒</div>
          <div style={{ fontSize: 12, color: "#444", fontFamily: "'Cinzel', serif" }}>No locked raid weeks found</div>
          <div style={{ fontSize: 9, color: "#222", fontFamily: "'Cinzel', serif" }}>Submit a WarcraftLogs URL in the admin view to unlock analysis</div>
        </div>
      )}

      {metaLoading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "#444", fontFamily: "'Cinzel', serif", letterSpacing: "0.2em" }}>LOADING REPORT…</div>
        </div>
      )}

      {error && (
        <div style={{ margin: "10px 20px", padding: "10px 14px", background: "#1a0808", border: "1px solid #ef444430", borderRadius: 5, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#ef4444", fontFamily: "'Cinzel', serif" }}>⚠ {error}</div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 3 }}>Ensure WCL_API_KEY is set in Vercel environment variables</div>
        </div>
      )}

      {/* Main content */}
      {reportMeta && !metaLoading && (
        <>
          <FightBar fights={reportMeta.fights} selected={selectedFight} onSelect={f => { setSelectedFight(f); setRawData(null); }} />

          {/* Role tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a2a", background: "#07070f", flexShrink: 0, alignItems: "center" }}>
            {ROLE_TABS.map(t => (
              <button key={t.id} onClick={() => setActiveRole(t.id)} style={{
                padding: "8px 22px", background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.1em",
                borderBottom: activeRole === t.id ? `2px solid ${t.color}` : "2px solid transparent",
                color: activeRole === t.id ? t.color : "#444",
                transition: "color 0.15s",
              }}>{t.label}</button>
            ))}
            {selectedFight && (
              <div style={{ marginLeft: "auto", padding: "0 16px", fontSize: 9, color: "#888", fontFamily: "'Cinzel', serif" }}>
                {selectedFight.name}
                {selectedFight.kill === true  && <span style={{ color: "#4ade80", marginLeft: 8 }}>✓ Kill</span>}
                {selectedFight.kill === false && <span style={{ color: "#ef4444", marginLeft: 8 }}>✗ Wipe</span>}
                <span style={{ color: "#444", marginLeft: 8 }}>{fmtDur(selectedFight.end_time - selectedFight.start_time)}</span>
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px" }}>
            {dataLoading && (
              <div style={{ textAlign: "center", color: "#333", fontSize: 10, fontFamily: "'Cinzel', serif", letterSpacing: "0.15em", paddingTop: 40 }}>
                FETCHING COMBAT LOG DATA…
              </div>
            )}

            {!dataLoading && playerData && (
              <>
                <Section title="AVOIDABLE DAMAGE + DEATHS">
                  <AvoidableTable playerData={playerData} role={activeRole} />
                </Section>

                <Section title="TRINKETS & RACIALS" defaultOpen={true}>
                  <TrinketTable playerData={playerData} role={activeRole} />
                </Section>

                <Section title="SHOUT UPTIMES" defaultOpen={false}>
                  <StatsTable playerData={playerData} role={activeRole} />
                </Section>
              </>
            )}

            {!dataLoading && !playerData && !error && (
              <div style={{ textAlign: "center", color: "#333", fontSize: 10, fontFamily: "'Cinzel', serif", paddingTop: 40 }}>
                Select a report above to load data
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

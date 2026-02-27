import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSnapshots, isFirebaseConfigured } from "./firebase";
import { FontImport } from "./components";

const FIREBASE_OK = isFirebaseConfigured();

// ── Class colors matching WoW TBC ─────────────────────────────────────────────
const CLASS_COLORS = {
  Warrior:   "#C79C6E", Paladin:  "#F58CBA", Hunter:  "#ABD473",
  Rogue:     "#FFF569", Priest:   "#FFFFFF", Shaman:  "#0070DE",
  Mage:      "#69CCF0", Warlock:  "#9482C9", Druid:   "#FF7D0A",
  DeathKnight: "#C41F3B",
};

const ROLE_ORDER = ["Tank", "Healer", "DPS"];

// ── Known debuffs to track (TBC relevant) ────────────────────────────────────
const TRACKED_DEBUFFS = [
  { id: "25225", name: "Sunder Armor",     icon: "🛡" },
  { id: "770",   name: "Faerie Fire",      icon: "🌿" },
  { id: "26016", name: "Curse of Elements",icon: "💀" },
  { id: "17800", name: "Shadow Embrace",   icon: "👁" },
  { id: "30033", name: "Expose Armor",     icon: "⚔" },
  { id: "8647",  name: "Expose Weakness",  icon: "🏹" },
  { id: "31709", name: "Judgement of Wisdom", icon: "🔱" },
  { id: "20185", name: "Judgement of Light",  icon: "✨" },
  { id: "27214", name: "Misery",           icon: "🕯" },
  { id: "26083", name: "Blood Frenzy",     icon: "💉" },
];

const TRACKED_COOLDOWNS = [
  { id: "2825",  name: "Bloodlust",        role: "Shaman",  icon: "🩸" },
  { id: "32182", name: "Heroism",          role: "Shaman",  icon: "🩸" },
  { id: "29166", name: "Innervate",        role: "Druid",   icon: "🌿" },
  { id: "10060", name: "Power Infusion",   role: "Priest",  icon: "✨" },
  { id: "16190", name: "Mana Tide",        role: "Shaman",  icon: "🌊" },
  { id: "19752", name: "Divine Intervention", role: "Paladin", icon: "😇" },
  { id: "33206", name: "Pain Suppression", role: "Priest",  icon: "🛡" },
  { id: "871",   name: "Shield Wall",      role: "Warrior", icon: "🛡" },
  { id: "12975", name: "Last Stand",       role: "Warrior", icon: "💪" },
  { id: "31821", name: "Aura Mastery",     role: "Paladin", icon: "🔔" },
  { id: "27154", name: "Lay on Hands",     role: "Paladin", icon: "🤲" },
  { id: "20484", name: "Rebirth",          role: "Druid",   icon: "♻" },
  { id: "20707", name: "Soulstone",        role: "Warlock", icon: "💠" },
];

// ── API helpers ───────────────────────────────────────────────────────────────
async function reportFetch(action, reportId, extra = {}) {
  const res = await fetch("/api/warcraftlogs-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reportId, ...extra }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function extractReportCode(url) {
  const match = url?.match(/reports\/([A-Za-z0-9]+)/);
  return match ? match[1] : url;
}

function fmt(n, digits = 0) {
  if (n == null || isNaN(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getClassColor(cls) {
  return CLASS_COLORS[cls] || "#aaa";
}

// ── Shared table styles ───────────────────────────────────────────────────────
const tableSty = {
  width: "100%", borderCollapse: "collapse", fontSize: 11,
  fontFamily: "'Cinzel', serif",
};
const thSty = {
  padding: "5px 8px", textAlign: "center", fontSize: 9,
  letterSpacing: "0.08em", color: "#888", borderBottom: "1px solid #1a1a2a",
  position: "sticky", top: 0, background: "#08080f", zIndex: 1,
};
const thLeftSty = { ...thSty, textAlign: "left" };
const tdSty = {
  padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #0d0d1a",
  color: "#aaa",
};
const tdLeftSty = { ...tdSty, textAlign: "left" };

function ScoreBar({ value, max, color = "#c8a84b" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "#1a1a2a", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color, minWidth: 40, textAlign: "right", fontFamily: "monospace" }}>
        {fmt(value)}
      </span>
    </div>
  );
}

function SectionHeader({ title, icon, subtitle }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #1a1a2a" }}>
      <div style={{ fontSize: 13, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>
        {icon} {title}
      </div>
      {subtitle && <div style={{ fontSize: 9, color: "#555", marginTop: 2, letterSpacing: "0.08em" }}>{subtitle}</div>}
    </div>
  );
}

// ── Tab: Damage Taken ─────────────────────────────────────────────────────────
function DamageTakenTab({ data, players }) {
  if (!data) return <div style={{ color: "#555", fontSize: 11, padding: 20 }}>Loading…</div>;

  const entries = data.entries || [];
  const byPlayer = {};
  entries.forEach(entry => {
    const name = entry.name;
    if (!byPlayer[name]) byPlayer[name] = { total: 0, sources: [] };
    byPlayer[name].total += entry.total || 0;
    byPlayer[name].sources.push({ name: entry.name, total: entry.total });
  });

  // Build per-player sorted list
  const playerRows = (data.entries || [])
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 40);

  const maxDmg = playerRows[0]?.total || 1;

  return (
    <div>
      <SectionHeader title="DAMAGE TAKEN" icon="💢" subtitle="Sorted by total damage taken — lower is better" />
      <div style={{ overflowX: "auto" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={{ ...thLeftSty, width: 160 }}>PLAYER</th>
              <th style={{ ...thLeftSty }}>TOTAL TAKEN</th>
              <th style={{ ...thSty, width: 60 }}>HITS</th>
            </tr>
          </thead>
          <tbody>
            {playerRows.map((entry, i) => {
              const player = players.find(p => p.name === entry.name);
              const color = getClassColor(player?.type);
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
                  <td style={{ ...tdLeftSty, color }}>
                    <span style={{ fontWeight: 600 }}>{entry.name}</span>
                    {player && <span style={{ fontSize: 8, color: "#555", marginLeft: 6 }}>{player.type}</span>}
                  </td>
                  <td style={tdLeftSty}>
                    <ScoreBar value={entry.total} max={maxDmg} color="#ef4444" />
                  </td>
                  <td style={{ ...tdSty, fontFamily: "monospace" }}>{entry.hits || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Debuff Uptime ────────────────────────────────────────────────────────
function DebuffsTab({ data, totalTime }) {
  if (!data) return <div style={{ color: "#555", fontSize: 11, padding: 20 }}>Loading…</div>;

  const auras = data.auras || [];
  const tracked = TRACKED_DEBUFFS.map(d => {
    const found = auras.find(a => a.guid?.toString() === d.id);
    return {
      ...d,
      uptime: found ? Math.round(found.totalUptime * 100 / Math.max(totalTime, 1)) : 0,
      uses: found?.totalUses || 0,
    };
  }).filter(d => d.uses > 0 || d.uptime > 0);

  // Also show any untracked debuffs with significant uptime
  const trackedIds = new Set(TRACKED_DEBUFFS.map(d => d.id));
  const other = auras
    .filter(a => !trackedIds.has(a.guid?.toString()) && a.totalUptime > 0)
    .map(a => ({
      id: a.guid?.toString(),
      name: a.name,
      icon: "⚡",
      uptime: Math.round(a.totalUptime * 100 / Math.max(totalTime, 1)),
      uses: a.totalUses || 0,
    }))
    .filter(d => d.uptime > 5)
    .sort((a, b) => b.uptime - a.uptime)
    .slice(0, 10);

  const allDebuffs = [...tracked, ...other];

  return (
    <div>
      <SectionHeader title="DEBUFF UPTIME" icon="🎯" subtitle="Boss encounters only — uptime % and application count" />
      <div style={{ overflowX: "auto" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={{ ...thLeftSty, width: 200 }}>DEBUFF</th>
              <th style={{ ...thLeftSty }}>UPTIME</th>
              <th style={{ ...thSty, width: 60 }}>USES</th>
            </tr>
          </thead>
          <tbody>
            {allDebuffs.length === 0 && (
              <tr><td colSpan={3} style={{ ...tdSty, color: "#444", textAlign: "center", padding: 20 }}>No debuff data found for this report</td></tr>
            )}
            {allDebuffs.map((d, i) => {
              const color = d.uptime >= 80 ? "#4ade80" : d.uptime >= 50 ? "#c8a84b" : "#ef4444";
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
                  <td style={tdLeftSty}>
                    <span style={{ marginRight: 6 }}>{d.icon}</span>
                    <span style={{ color: "#ccc" }}>{d.name}</span>
                  </td>
                  <td style={tdLeftSty}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#1a1a2a", borderRadius: 3, overflow: "hidden", maxWidth: 200 }}>
                        <div style={{ width: `${Math.min(100, d.uptime)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontFamily: "monospace", color, fontSize: 12, minWidth: 36 }}>{fmtPct(d.uptime)}</span>
                    </div>
                  </td>
                  <td style={{ ...tdSty, fontFamily: "monospace", color: "#888" }}>{d.uses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Casts ────────────────────────────────────────────────────────────────
function CastsTab({ data, players }) {
  const [view, setView] = useState("all"); // all | player

  if (!data) return <div style={{ color: "#555", fontSize: 11, padding: 20 }}>Loading…</div>;

  const entries = (data.entries || []).filter(e => e.total > 0).sort((a, b) => b.total - a.total);
  const maxCasts = entries[0]?.total || 1;

  return (
    <div>
      <SectionHeader title="SPELL CASTS" icon="🔮" subtitle="Total casts per spell across all players" />
      <div style={{ overflowX: "auto" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={{ ...thLeftSty, width: 220 }}>SPELL</th>
              <th style={{ ...thLeftSty }}>CASTS</th>
              <th style={{ ...thSty, width: 80 }}>HIT %</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 50).map((entry, i) => {
              const hitPct = entry.total > 0 ? Math.round((entry.hits || entry.total) * 100 / entry.total) : null;
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
                  <td style={tdLeftSty}>
                    <span style={{ color: "#c8a84b" }}>{entry.name}</span>
                  </td>
                  <td style={tdLeftSty}>
                    <ScoreBar value={entry.total} max={maxCasts} color="#9b72cf" />
                  </td>
                  <td style={{ ...tdSty, fontFamily: "monospace", color: "#888" }}>
                    {hitPct != null ? `${hitPct}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Absorbs ──────────────────────────────────────────────────────────────
function AbsorbsTab({ data, players }) {
  if (!data) return <div style={{ color: "#555", fontSize: 11, padding: 20 }}>Loading…</div>;

  const entries = (data.entries || [])
    .filter(e => e.absorbed > 0)
    .sort((a, b) => b.absorbed - a.absorbed);

  const maxAbs = entries[0]?.absorbed || 1;

  return (
    <div>
      <SectionHeader title="ABSORBS" icon="🔵" subtitle="Total damage absorbed per player" />
      {entries.length === 0 ? (
        <div style={{ color: "#444", fontSize: 11, padding: 20, textAlign: "center" }}>No absorb data in this report</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableSty}>
            <thead>
              <tr>
                <th style={{ ...thLeftSty, width: 160 }}>PLAYER</th>
                <th style={{ ...thLeftSty }}>ABSORBED</th>
                <th style={{ ...thSty, width: 80 }}>HITS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const player = players.find(p => p.name === entry.name);
                const color = getClassColor(player?.type);
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
                    <td style={{ ...tdLeftSty, color }}>
                      <span style={{ fontWeight: 600 }}>{entry.name}</span>
                      {player && <span style={{ fontSize: 8, color: "#555", marginLeft: 6 }}>{player.type}</span>}
                    </td>
                    <td style={tdLeftSty}>
                      <ScoreBar value={entry.absorbed} max={maxAbs} color="#60a5fa" />
                    </td>
                    <td style={{ ...tdSty, fontFamily: "monospace" }}>{entry.hits || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Cooldowns ────────────────────────────────────────────────────────────
function CooldownsTab({ data, players }) {
  if (!data) return <div style={{ color: "#555", fontSize: 11, padding: 20 }}>Loading…</div>;

  // Build map: spellName → { total, casters: [{name, count}] }
  const bySpell = {};
  (data.entries || []).forEach(entry => {
    if (!bySpell[entry.name]) bySpell[entry.name] = { total: 0, casters: [] };
    bySpell[entry.name].total += entry.total || 0;
    if (entry.total > 0) {
      bySpell[entry.name].casters.push({ name: entry.name, count: entry.total });
    }
  });

  // Map to tracked cooldown definitions
  const rows = TRACKED_COOLDOWNS
    .map(cd => {
      // Match by name (since entries come back by name, not ID)
      const match = Object.entries(bySpell).find(([k]) =>
        k.toLowerCase().includes(cd.name.toLowerCase()) ||
        cd.name.toLowerCase().includes(k.toLowerCase())
      );
      return {
        ...cd,
        total: match?.[1]?.total || 0,
        casters: match?.[1]?.casters || [],
      };
    })
    .filter(cd => cd.total > 0)
    .sort((a, b) => b.total - a.total);

  // Also catch any untracked spells
  const trackedNames = new Set(TRACKED_COOLDOWNS.map(cd => cd.name.toLowerCase()));
  const otherRows = Object.entries(bySpell)
    .filter(([name]) => !trackedNames.has(name.toLowerCase()))
    .map(([name, d]) => ({ name, icon: "⚡", total: d.total, casters: d.casters }))
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const allRows = [...rows, ...otherRows];

  return (
    <div>
      <SectionHeader title="COOLDOWN USAGE" icon="⏱" subtitle="Key cooldowns cast across the raid" />
      {allRows.length === 0 ? (
        <div style={{ color: "#444", fontSize: 11, padding: 20, textAlign: "center" }}>No cooldown data found</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableSty}>
            <thead>
              <tr>
                <th style={{ ...thLeftSty, width: 200 }}>COOLDOWN</th>
                <th style={{ ...thSty, width: 60 }}>USES</th>
                <th style={{ ...thLeftSty }}>CASTERS</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((cd, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#07070f" : "transparent" }}>
                  <td style={tdLeftSty}>
                    <span style={{ marginRight: 6 }}>{cd.icon}</span>
                    <span style={{ color: "#c8a84b" }}>{cd.name}</span>
                    {cd.role && <span style={{ fontSize: 8, color: "#555", marginLeft: 6 }}>{cd.role}</span>}
                  </td>
                  <td style={{ ...tdSty, fontFamily: "monospace", color: "#4ade80", fontSize: 13, fontWeight: 700 }}>
                    {cd.total}
                  </td>
                  <td style={tdLeftSty}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cd.casters.map((c, j) => {
                        const player = null; // caster lookup by name
                        return (
                          <span key={j} style={{
                            fontSize: 9, padding: "1px 6px", borderRadius: 3,
                            background: "#1a1a2a", color: "#aaa",
                          }}>
                            {c.name} {c.count > 1 ? `×${c.count}` : ""}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Fight selector ────────────────────────────────────────────────────────────
function FightSelector({ fights, selected, onSelect }) {
  const bossFights = fights.filter(f => f.boss > 0);
  if (bossFights.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          padding: "4px 12px", borderRadius: 4, cursor: "pointer",
          fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.06em",
          background: !selected ? "#1a1000" : "#0a0a14",
          border: `1px solid ${!selected ? "#c8a84b" : "#2a2a3a"}`,
          color: !selected ? "#c8a84b" : "#666",
        }}
      >
        ALL FIGHTS
      </button>
      {bossFights.map(f => (
        <button
          key={f.id}
          onClick={() => onSelect(f)}
          style={{
            padding: "4px 12px", borderRadius: 4, cursor: "pointer",
            fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.06em",
            background: selected?.id === f.id ? "#1a1000" : "#0a0a14",
            border: `1px solid ${selected?.id === f.id ? "#c8a84b" : "#2a2a3a"}`,
            color: selected?.id === f.id ? "#c8a84b" : "#666",
          }}
        >
          {f.name}
          {f.kill === false && <span style={{ color: "#ef4444", marginLeft: 4 }}>✗</span>}
          <span style={{ color: "#555", marginLeft: 4, fontSize: 8 }}>{fmtDuration(f.end_time - f.start_time)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main AnalysisView ─────────────────────────────────────────────────────────
export default function AnalysisView({ teamId, teamName }) {
  const navigate = useNavigate();
  const [snapshots,     setSnapshots]     = useState([]);
  const [selectedSnap,  setSelectedSnap]  = useState(null);
  const [reportMeta,    setReportMeta]    = useState(null);
  const [selectedFight, setSelectedFight] = useState(null);
  const [activeTab,     setActiveTab]     = useState("damage-taken");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  // Per-tab data
  const [damageTakenData, setDamageTakenData] = useState(null);
  const [debuffsData,     setDebuffsData]     = useState(null);
  const [castsData,       setCastsData]       = useState(null);
  const [absorbsData,     setAbsorbsData]     = useState(null);
  const [cooldownsData,   setCooldownsData]   = useState(null);

  // Load locked snapshots on mount
  useEffect(() => {
    if (!FIREBASE_OK) return;
    fetchSnapshots(teamId)
      .then(snaps => {
        const locked = snaps.filter(s => s.locked && s.wclReportUrl);
        setSnapshots(locked);
        if (locked.length > 0) setSelectedSnap(locked[0]);
      })
      .catch(console.warn);
  }, [teamId]);

  // Load report metadata when snapshot changes
  useEffect(() => {
    if (!selectedSnap?.wclReportUrl) return;
    const reportId = extractReportCode(selectedSnap.wclReportUrl);
    setReportMeta(null);
    setSelectedFight(null);
    setDamageTakenData(null);
    setDebuffsData(null);
    setCastsData(null);
    setAbsorbsData(null);
    setCooldownsData(null);
    setError(null);
    setLoading(true);

    reportFetch("fights", reportId)
      .then(data => { setReportMeta(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedSnap]);

  // Load tab data when tab or fight changes
  const loadTabData = useCallback(async (tab, fight, reportId) => {
    if (!reportId) return;
    const start = fight?.start_time;
    const end   = fight?.end_time;
    const extra = start != null ? { start, end } : {};

    try {
      if (tab === "damage-taken" && !damageTakenData) {
        const d = await reportFetch("damage-taken-all", reportId, extra);
        setDamageTakenData(d);
      } else if (tab === "debuffs" && !debuffsData) {
        const d = await reportFetch("debuffs-total", reportId, extra);
        setDebuffsData(d);
      } else if (tab === "casts" && !castsData) {
        const d = await reportFetch("casts-all", reportId, extra);
        setCastsData(d);
      } else if (tab === "absorbs" && !absorbsData) {
        const d = await reportFetch("absorbs", reportId, extra);
        setAbsorbsData(d);
      } else if (tab === "cooldowns" && !cooldownsData) {
        const d = await reportFetch("cooldowns", reportId, extra);
        setCooldownsData(d);
      }
    } catch (e) {
      console.error(`Failed loading ${tab}:`, e);
    }
  }, [damageTakenData, debuffsData, castsData, absorbsData, cooldownsData]);

  useEffect(() => {
    if (!selectedSnap?.wclReportUrl || !reportMeta) return;
    const reportId = extractReportCode(selectedSnap.wclReportUrl);
    loadTabData(activeTab, selectedFight, reportId);
  }, [activeTab, selectedFight, reportMeta, selectedSnap]);

  // Reset tab data when fight changes
  const handleFightSelect = (fight) => {
    setSelectedFight(fight);
    setDamageTakenData(null);
    setDebuffsData(null);
    setCastsData(null);
    setAbsorbsData(null);
    setCooldownsData(null);
  };

  const players = reportMeta?.friendlies?.filter(f =>
    ["Warrior","Paladin","Hunter","Rogue","Priest","Shaman","Mage","Warlock","Druid"].includes(f.type)
  ) || [];

  const totalTime = reportMeta
    ? ((reportMeta.end || 0) - (reportMeta.start || 0))
    : 1;

  const tabs = [
    { id: "damage-taken", label: "DAMAGE TAKEN",  icon: "💢" },
    { id: "debuffs",      label: "DEBUFFS",        icon: "🎯" },
    { id: "casts",        label: "CASTS",           icon: "🔮" },
    { id: "absorbs",      label: "ABSORBS",         icon: "🔵" },
    { id: "cooldowns",    label: "COOLDOWNS",       icon: "⏱" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(180deg, #0a0a1a 0%, #06060f 100%)",
        borderBottom: "1px solid #1a1a2a",
        padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif", letterSpacing: "0.05em" }}>
            📊 COMBAT LOG ANALYSIS
          </div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.2em", marginTop: 2 }}>{teamName}</div>
        </div>

        {/* Week selector */}
        {snapshots.length > 0 && (
          <div style={{ marginLeft: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>WEEK</span>
            <select
              value={selectedSnap?.id || ""}
              onChange={e => {
                const snap = snapshots.find(s => s.id === e.target.value);
                setSelectedSnap(snap || null);
              }}
              style={{
                background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4,
                color: "#c8a84b", padding: "4px 10px", fontSize: 10,
                fontFamily: "'Cinzel', serif", cursor: "pointer", outline: "none",
              }}
            >
              {snapshots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.raidDate || new Date(s.savedAt).toLocaleDateString()} {s.raidLeader ? `· ${s.raidLeader}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Report title */}
        {reportMeta && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
            <span style={{ fontSize: 9, color: "#555" }}>—</span>
            <span style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel', serif" }}>{reportMeta.title}</span>
            {selectedSnap?.wclReportUrl && (
              <a
                href={selectedSnap.wclReportUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 9, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none" }}
              >
                ↗ WCL
              </a>
            )}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => navigate(`/${teamId}`)}
            style={{
              background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4,
              color: "#888", cursor: "pointer", padding: "5px 12px",
              fontSize: 9, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em",
            }}
          >← Public View</button>
          <button
            onClick={() => navigate(`/${teamId}/admin`)}
            style={{
              background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4,
              color: "#888", cursor: "pointer", padding: "5px 12px",
              fontSize: 9, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em",
            }}
          >Admin</button>
        </div>
      </div>

      {/* ── No snapshots state ── */}
      {snapshots.length === 0 && !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 32 }}>🔒</div>
          <div style={{ fontSize: 13, color: "#555", fontFamily: "'Cinzel', serif" }}>
            No locked raid weeks found
          </div>
          <div style={{ fontSize: 10, color: "#333", fontFamily: "'Cinzel', serif" }}>
            Submit a WarcraftLogs URL in the admin view to lock a week and enable analysis
          </div>
        </div>
      )}

      {/* ── Loading metadata ── */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 11, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
            LOADING REPORT…
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ margin: 24, padding: "12px 16px", background: "#1a0a0a", border: "1px solid #ef444444", borderRadius: 6 }}>
          <span style={{ fontSize: 10, color: "#ef4444", fontFamily: "'Cinzel', serif" }}>⚠ {error}</span>
          <div style={{ fontSize: 9, color: "#666", marginTop: 4 }}>
            Make sure WCL_API_KEY is set in your Vercel environment variables
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {reportMeta && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Fight selector */}
          <div style={{ padding: "12px 24px 0", borderBottom: "1px solid #1a1a2a", background: "#07070f", flexShrink: 0 }}>
            <FightSelector
              fights={reportMeta.fights || []}
              selected={selectedFight}
              onSelect={handleFightSelect}
            />

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: "7px 18px", cursor: "pointer",
                    fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.1em",
                    background: "none", border: "none",
                    borderBottom: activeTab === t.id ? "2px solid #c8a84b" : "2px solid transparent",
                    color: activeTab === t.id ? "#c8a84b" : "#555",
                    transition: "all 0.15s",
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* Fight info bar */}
            {selectedFight && (
              <div style={{
                marginBottom: 16, padding: "8px 14px",
                background: "#08080f", border: "1px solid #1a1a2a", borderRadius: 6,
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <span style={{ fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif" }}>
                  {selectedFight.name}
                </span>
                <span style={{ fontSize: 9, color: "#555" }}>
                  {fmtDuration(selectedFight.end_time - selectedFight.start_time)}
                </span>
                {selectedFight.kill === true  && <span style={{ fontSize: 9, color: "#4ade80" }}>✓ Kill</span>}
                {selectedFight.kill === false && <span style={{ fontSize: 9, color: "#ef4444" }}>✗ Wipe</span>}
              </div>
            )}

            {activeTab === "damage-taken" && <DamageTakenTab data={damageTakenData} players={players} />}
            {activeTab === "debuffs"      && <DebuffsTab data={debuffsData} totalTime={totalTime} />}
            {activeTab === "casts"        && <CastsTab data={castsData} players={players} />}
            {activeTab === "absorbs"      && <AbsorbsTab data={absorbsData} players={players} />}
            {activeTab === "cooldowns"    && <CooldownsTab data={cooldownsData} players={players} />}
          </div>
        </div>
      )}
    </div>
  );
}

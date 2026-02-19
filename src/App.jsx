import { useState, useCallback, useRef } from "react";

// ── Class colour map ──────────────────────────────────────────────────────────
const CLASS_COLORS = {
  Warrior:  "#C69B6D", Paladin:  "#F48CBA", Hunter:   "#AAD372",
  Rogue:    "#FFF468", Priest:   "#FFFFFF", Shaman:   "#0070DD",
  Mage:     "#3FC7EB", Warlock:  "#8788EE", Druid:    "#FF7C0A",
  Tank:     "#AAD372",
};

const ROLE_BY_SPEC = {
  Protection1: "Tank", Protection: "Tank", Guardian: "Tank",
  Holy: "Healer", Holy1: "Healer", Discipline: "Healer",
  Restoration: "Healer", Restoration1: "Healer", Dreamstate: "Healer",
};
function getRole(slot) {
  if (slot.className === "Tank") return "Tank";
  return ROLE_BY_SPEC[slot.specName] || "DPS";
}

// ── Gruul assignment config ──────────────────────────────────────────────────
const GRUUL_MAULGAR = [
  { key: "maulgar_mt",   label: "Maulgar Tank",      role: "Tank",   hint: "Protection Paladin/Warrior" },
  { key: "krosh_soak",   label: "Krosh Soaker",       role: "Tank",   hint: "Prot Paladin immune soak" },
  { key: "olm_tank",     label: "Olm Tank",           role: "Tank",   hint: "Warrior/Druid" },
  { key: "kiggler_kit",  label: "Kiggler Kiter",      role: "Tank",   hint: "Prot Pally / mobile tank" },
  { key: "blindeye_tank",label: "Blindeye Tank",      role: "Tank",   hint: "Any tank" },
  { key: "mt_heal1",     label: "MT Heal 1",          role: "Healer", hint: "" },
  { key: "mt_heal2",     label: "MT Heal 2",          role: "Healer", hint: "" },
  { key: "krosh_heal",   label: "Krosh Soaker Heals", role: "Healer", hint: "Holy Pally ideal" },
  { key: "raid_heal1",   label: "Raid Heal 1",        role: "Healer", hint: "" },
  { key: "raid_heal2",   label: "Raid Heal 2",        role: "Healer", hint: "" },
  { key: "olm_cc",       label: "Olm CC (Sheep)",     role: "DPS",    hint: "Mage" },
  { key: "olm_sleep",    label: "Olm Trap/Sleep",     role: "DPS",    hint: "Hunter/Druid" },
  { key: "kiggler_poly", label: "Kiggler Poly",       role: "DPS",    hint: "Mage" },
  { key: "spellbreak",   label: "Spellbreaker (Krosh)",role:"DPS",    hint: "Pummel/kick chain" },
  { key: "counterspell", label: "Counterspell (Krosh)",role:"DPS",    hint: "Mage CS" },
  { key: "dps_krosh1",   label: "Krosh Kill DPS 1",   role: "DPS",    hint: "" },
  { key: "dps_krosh2",   label: "Krosh Kill DPS 2",   role: "DPS",    hint: "" },
  { key: "dps_olm",      label: "Olm Kill DPS",       role: "DPS",    hint: "" },
  { key: "dps_kiggler",  label: "Kiggler Kill DPS",   role: "DPS",    hint: "" },
  { key: "dps_blindeye", label: "Blindeye Kill DPS",  role: "DPS",    hint: "" },
  { key: "dps_maulgar",  label: "Maulgar Kill DPS",   role: "DPS",    hint: "" },
];

const GRUUL_BOSS = [
  { key: "g_mt",        label: "Main Tank (MT)",    role: "Tank",   hint: "" },
  { key: "g_ot",        label: "Off Tank / Taunt",  role: "Tank",   hint: "" },
  { key: "g_mtheal1",   label: "MT Heal 1",         role: "Healer", hint: "" },
  { key: "g_mtheal2",   label: "MT Heal 2",         role: "Healer", hint: "" },
  { key: "g_mtheal3",   label: "MT Heal 3",         role: "Healer", hint: "" },
  { key: "g_rheal1",    label: "Raid Heal 1",       role: "Healer", hint: "" },
  { key: "g_rheal2",    label: "Raid Heal 2",       role: "Healer", hint: "" },
  { key: "g_rheal3",    label: "Raid Heal 3",       role: "Healer", hint: "" },
  { key: "g_shat1",     label: "Shatter Group NW",  role: "DPS",    hint: "" },
  { key: "g_shat2",     label: "Shatter Group NE",  role: "DPS",    hint: "" },
  { key: "g_shat3",     label: "Shatter Group S",   role: "DPS",    hint: "" },
  { key: "g_shat4",     label: "Shatter Group W",   role: "DPS",    hint: "" },
  { key: "g_shat5",     label: "Shatter Group E",   role: "DPS",    hint: "" },
  { key: "g_dps1",      label: "DPS 1",             role: "DPS",    hint: "" },
  { key: "g_dps2",      label: "DPS 2",             role: "DPS",    hint: "" },
  { key: "g_dps3",      label: "DPS 3",             role: "DPS",    hint: "" },
  { key: "g_dps4",      label: "DPS 4",             role: "DPS",    hint: "" },
  { key: "g_dps5",      label: "DPS 5",             role: "DPS",    hint: "" },
];

// ── Magtheridon config ───────────────────────────────────────────────────────
const MAGS_P1 = [
  { key: "m_ch1", label: "Channeler 1 Tank (N)",  role: "Tank",   hint: "" },
  { key: "m_ch2", label: "Channeler 2 Tank (NE)", role: "Tank",   hint: "" },
  { key: "m_ch3", label: "Channeler 3 Tank (SE)", role: "Tank",   hint: "" },
  { key: "m_ch4", label: "Channeler 4 Tank (SW)", role: "Tank",   hint: "" },
  { key: "m_ch5", label: "Channeler 5 Tank (NW)", role: "Tank",   hint: "" },
  { key: "m_ph1h1",label: "Tank Heal (N)",        role: "Healer", hint: "" },
  { key: "m_ph1h2",label: "Tank Heal (NE)",       role: "Healer", hint: "" },
  { key: "m_ph1h3",label: "Tank Heal (W cluster)",role: "Healer", hint: "" },
  { key: "m_ph1rh1",label:"Raid Heal 1",          role: "Healer", hint: "" },
  { key: "m_ph1rh2",label:"Raid Heal 2",          role: "Healer", hint: "" },
  { key: "m_cube1", label: "Cube Clicker 1 (NE)", role: "DPS",    hint: "Must reach cube fast" },
  { key: "m_cube2", label: "Cube Clicker 2 (SE)", role: "DPS",    hint: "" },
  { key: "m_cube3", label: "Cube Clicker 3 (S)",  role: "DPS",    hint: "" },
  { key: "m_cube4", label: "Cube Clicker 4 (SW)", role: "DPS",    hint: "" },
  { key: "m_cube5", label: "Cube Clicker 5 (NW)", role: "DPS",    hint: "" },
  { key: "m_dps1",  label: "Kill Group 1",        role: "DPS",    hint: "" },
  { key: "m_dps2",  label: "Kill Group 2",        role: "DPS",    hint: "" },
  { key: "m_dps3",  label: "Kill Group 3",        role: "DPS",    hint: "" },
  { key: "m_dps4",  label: "Kill Group 4",        role: "DPS",    hint: "" },
];

const MAGS_P2 = [
  { key: "m_p2mt",  label: "Main Tank (MT)",        role: "Tank",   hint: "" },
  { key: "m_p2ot",  label: "OT – Infernal Kiter",   role: "Tank",   hint: "" },
  { key: "m_p2h1",  label: "MT Heal 1",             role: "Healer", hint: "" },
  { key: "m_p2h2",  label: "MT Heal 2",             role: "Healer", hint: "" },
  { key: "m_p2h3",  label: "MT Heal 3",             role: "Healer", hint: "" },
  { key: "m_p2rh1", label: "Raid Heal 1",           role: "Healer", hint: "" },
  { key: "m_p2rh2", label: "Raid Heal 2",           role: "Healer", hint: "" },
  { key: "m_p2c1",  label: "Cube Primary 1",        role: "DPS",    hint: "" },
  { key: "m_p2c2",  label: "Cube Primary 2",        role: "DPS",    hint: "" },
  { key: "m_p2c3",  label: "Cube Primary 3",        role: "DPS",    hint: "" },
  { key: "m_p2c4",  label: "Cube Backup 4",         role: "DPS",    hint: "" },
  { key: "m_p2c5",  label: "Cube Backup 5",         role: "DPS",    hint: "" },
  { key: "m_p2inf1",label: "Infernal Kill DPS 1",   role: "DPS",    hint: "" },
  { key: "m_p2inf2",label: "Infernal Kill DPS 2",   role: "DPS",    hint: "" },
  { key: "m_p2d1",  label: "DPS 1",                 role: "DPS",    hint: "" },
  { key: "m_p2d2",  label: "DPS 2",                 role: "DPS",    hint: "" },
  { key: "m_p2d3",  label: "DPS 3",                 role: "DPS",    hint: "" },
  { key: "m_p2d4",  label: "DPS 4",                 role: "DPS",    hint: "" },
];

const ROLE_COLORS = {
  Tank:   { bg: "#0d2035", border: "#1a4a7a", label: "#60a5fa", tag: "#1d4ed8" },
  Healer: { bg: "#0b2010", border: "#1a5c1a", label: "#4ade80", tag: "#15803d" },
  DPS:    { bg: "#200d0d", border: "#6b1818", label: "#f87171", tag: "#b91c1c" },
};

// ── Draggable Player token ───────────────────────────────────────────────────
function PlayerToken({ slot, onDragStart, compact = false }) {
  const role = getRole(slot);
  const cls = slot.className === "Tank" ? slot.specName.replace("1","") : slot.className;
  const color = CLASS_COLORS[cls] || CLASS_COLORS[slot.className] || "#aaa";
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, slot)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: `${color}18`, border: `1px solid ${color}55`,
        borderRadius: 4, padding: compact ? "1px 6px" : "3px 8px",
        cursor: "grab", userSelect: "none", fontSize: compact ? 11 : 12,
        color: color, fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
        transition: "background 0.15s",
      }}
      title={`${slot.name} — ${slot.specName} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {slot.name}
    </div>
  );
}

// ── Assignment slot (drop target) ────────────────────────────────────────────
function AssignmentSlot({ rowCfg, assigned, onDrop, onClear, roster }) {
  const [over, setOver] = useState(false);
  const rc = ROLE_COLORS[rowCfg.role];
  const slot = assigned ? roster.find(s => s.id === assigned) : null;
  const cls = slot ? (slot.className === "Tank" ? slot.specName.replace("1","") : slot.className) : null;
  const color = cls ? (CLASS_COLORS[cls] || CLASS_COLORS[slot.className] || "#aaa") : null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e, rowCfg.key); }}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
        background: over ? `${rc.border}55` : rc.bg,
        border: `1px solid ${over ? rc.label : rc.border}`,
        borderRadius: 6, minHeight: 32, transition: "all 0.12s",
      }}
    >
      <span style={{ fontSize: 10, color: rc.label, fontFamily: "'Cinzel', serif", minWidth: 160, flexShrink: 0 }}>
        {rowCfg.label}
        {rowCfg.hint && <span style={{ color: "#555", marginLeft: 4, fontFamily: "monospace", fontSize: 9 }}>({rowCfg.hint})</span>}
      </span>
      <div style={{ flex: 1, minWidth: 120 }}>
        {slot ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              background: `${color}22`, border: `1px solid ${color}55`,
              borderRadius: 4, padding: "2px 8px", fontSize: 12,
              color: color, fontFamily: "'Cinzel', serif",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", marginRight: 5 }} />
              {slot.name}
              <span style={{ color: "#666", marginLeft: 4, fontSize: 10 }}>
                {slot.specName} {slot.className === "Tank" ? slot.specName.replace("1","") : slot.className}
              </span>
            </span>
            <button onClick={() => onClear(rowCfg.key)} style={{
              background: "none", border: "none", color: "#555", cursor: "pointer",
              fontSize: 14, lineHeight: 1, padding: "0 2px",
            }} title="Clear">×</button>
          </div>
        ) : (
          <span style={{ color: "#333", fontSize: 11, fontStyle: "italic" }}>— drag player here —</span>
        )}
      </div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, role }) {
  const rc = ROLE_COLORS[role];
  return (
    <div style={{
      padding: "4px 10px", background: rc.tag, borderRadius: 4,
      fontSize: 11, fontFamily: "'Cinzel', serif", color: "#fff",
      letterSpacing: "0.08em", marginTop: 10, marginBottom: 4,
    }}>
      {icon} {title}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
function Panel({ title, subtitle, icon, rows, assignments, onDrop, onClear, roster }) {
  const sections = [];
  let lastRole = null;
  rows.forEach(r => {
    if (r.role !== lastRole) {
      sections.push({ type: "header", role: r.role });
      lastRole = r.role;
    }
    sections.push({ type: "slot", row: r });
  });

  const roleIcons = { Tank: "🛡", Healer: "💚", DPS: "⚔" };
  const roleTitles = { Tank: "Tank Assignments", Healer: "Healer Assignments", DPS: "DPS Assignments" };

  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e3a",
      borderRadius: 8, padding: 12, flex: 1,
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: 13, color: "#c8a84b",
        borderBottom: "1px solid #2a2a1a", paddingBottom: 6, marginBottom: 8,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {icon} {title}
        {subtitle && <span style={{ color: "#444", fontSize: 10, marginLeft: "auto" }}>{subtitle}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {sections.map((s, i) => s.type === "header" ? (
          <SectionHeader key={i} icon={roleIcons[s.role]} title={roleTitles[s.role]} role={s.role} />
        ) : (
          <AssignmentSlot key={s.row.key} rowCfg={s.row} assigned={assignments[s.row.key]}
            onDrop={onDrop} onClear={onClear} roster={roster} />
        ))}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [roster, setRoster] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [activeTab, setActiveTab] = useState("gruul");
  const [dragSlot, setDragSlot] = useState(null);
  const [jsonError, setJsonError] = useState("");
  const [showImport, setShowImport] = useState(true);
  const [raidDate, setRaidDate] = useState("");
  const [raidLeader, setRaidLeader] = useState("");
  const fileRef = useRef();

  // Roster filter state
  const [roleFilter, setRoleFilter] = useState("All");

  const handleImportJSON = (text) => {
    try {
      const data = JSON.parse(text);
      if (!data.slots) throw new Error("No 'slots' array found");
      setRoster(data.slots);
      setAssignments({});
      setJsonError("");
      setShowImport(false);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleImportJSON(ev.target.result);
    reader.readAsText(file);
  };

  const handleDragStart = (e, slot) => {
    setDragSlot(slot);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e, key) => {
    if (!dragSlot) return;
    setAssignments(prev => ({ ...prev, [key]: dragSlot.id }));
    setDragSlot(null);
  };

  const handleClear = (key) => {
    setAssignments(prev => { const n = {...prev}; delete n[key]; return n; });
  };

  const assignedIds = new Set(Object.values(assignments));
  const filteredRoster = roster.filter(s => {
    if (roleFilter === "All") return true;
    return getRole(s) === roleFilter;
  });
  const unassigned = filteredRoster.filter(s => !assignedIds.has(s.id));
  const assigned = filteredRoster.filter(s => assignedIds.has(s.id));

  // Group roster by teams from dividers — we'll just show groups
  const byGroup = {};
  roster.forEach(s => {
    if (!byGroup[s.groupNumber]) byGroup[s.groupNumber] = [];
    byGroup[s.groupNumber].push(s);
  });

  const tabs = [
    { id: "gruul", label: "Gruul's Lair", icon: "⚔" },
    { id: "mags",  label: "Magtheridon",  icon: "🔥" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#06060f",
      fontFamily: "'Cinzel', serif",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #0d0a1a 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #0a0d1a 0%, transparent 60%)",
    }}>
      {/* Google Font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap');`}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #1a0a00 0%, #0a0608 100%)",
        borderBottom: "1px solid #3a1800", padding: "12px 24px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 18, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif", letterSpacing: "0.05em" }}>
            ⚔ TBC RAID ASSIGNMENTS
          </div>
          <div style={{ fontSize: 10, color: "#4a3a20", letterSpacing: "0.2em" }}>GRUUL'S LAIR  ·  MAGTHERIDON'S LAIR</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <input value={raidDate} onChange={e => setRaidDate(e.target.value)}
            placeholder="Raid Date" style={{
              background: "#111", border: "1px solid #2a2a1a", borderRadius: 4,
              color: "#c8a84b", padding: "4px 10px", fontSize: 11, fontFamily: "'Cinzel', serif",
            }} />
          <input value={raidLeader} onChange={e => setRaidLeader(e.target.value)}
            placeholder="Raid Leader" style={{
              background: "#111", border: "1px solid #2a2a1a", borderRadius: 4,
              color: "#c8a84b", padding: "4px 10px", fontSize: 11, fontFamily: "'Cinzel', serif",
            }} />
          <button onClick={() => setShowImport(v => !v)} style={{
            background: "#1a0800", border: "1px solid #c8a84b55", borderRadius: 4,
            color: "#c8a84b", padding: "5px 14px", cursor: "pointer", fontSize: 11,
            fontFamily: "'Cinzel', serif",
          }}>
            {roster.length ? `↩ Re-import (${roster.length})` : "📂 Import Roster"}
          </button>
        </div>
      </div>

      {/* Import Panel */}
      {showImport && (
        <div style={{
          background: "#0c0c1a", border: "1px solid #2a2a4a",
          margin: "16px 24px", borderRadius: 8, padding: 20,
        }}>
          <div style={{ color: "#c8a84b", fontSize: 13, marginBottom: 12 }}>
            📂 Import Roster JSON
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <textarea
                placeholder='Paste your JSON export here (the format with "slots", "groups", "dividers"…)'
                onChange={e => {
                  const v = e.target.value.trim();
                  if (v) handleImportJSON(v);
                }}
                style={{
                  width: "100%", height: 100, background: "#080810",
                  border: `1px solid ${jsonError ? "#c0392b" : "#2a2a4a"}`,
                  borderRadius: 6, color: "#aaa", padding: 10,
                  fontFamily: "monospace", fontSize: 11, resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => fileRef.current.click()} style={{
                background: "#111a2a", border: "1px solid #1a3a6a", borderRadius: 6,
                color: "#60a5fa", padding: "8px 16px", cursor: "pointer", fontSize: 12,
                fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
              }}>
                📁 Upload .json file
              </button>
              <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: "none" }} />
            </div>
          </div>
          {jsonError && <div style={{ color: "#ef4444", fontSize: 11 }}>⚠ {jsonError}</div>}
          {roster.length > 0 && (
            <div style={{ color: "#4ade80", fontSize: 11 }}>
              ✓ {roster.length} players loaded — drag them onto assignment slots below
            </div>
          )}
        </div>
      )}

      {roster.length === 0 && !showImport && (
        <div style={{ textAlign: "center", color: "#333", padding: 60, fontSize: 13 }}>
          No roster loaded. Click "Import Roster" to get started.
        </div>
      )}

      {roster.length > 0 && (
        <div style={{ display: "flex", gap: 0, height: "calc(100vh - 140px)", overflow: "hidden" }}>

          {/* ── LEFT: Roster Panel ── */}
          <div style={{
            width: 220, background: "#080810", borderRight: "1px solid #1a1a2a",
            display: "flex", flexDirection: "column", flexShrink: 0,
          }}>
            <div style={{
              padding: "10px 12px", borderBottom: "1px solid #1a1a2a",
              fontSize: 10, color: "#666", letterSpacing: "0.15em",
            }}>
              ROSTER  ·  {roster.length} PLAYERS
            </div>

            {/* Role filter */}
            <div style={{ display: "flex", gap: 4, padding: "6px 8px", borderBottom: "1px solid #1a1a2a" }}>
              {["All","Tank","Healer","DPS"].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} style={{
                  flex: 1, padding: "3px 0", fontSize: 9, cursor: "pointer",
                  border: "1px solid", borderRadius: 3, fontFamily: "'Cinzel', serif",
                  letterSpacing: "0.05em",
                  background: roleFilter === r ? (r === "Tank" ? "#1d4ed8" : r === "Healer" ? "#15803d" : r === "DPS" ? "#b91c1c" : "#1a1a3a") : "#0d0d1a",
                  borderColor: roleFilter === r ? "#fff3" : "#1a1a2a",
                  color: roleFilter === r ? "#fff" : "#555",
                }}>
                  {r}
                </button>
              ))}
            </div>

            {/* Unassigned */}
            <div style={{ padding: "6px 8px", fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", borderBottom: "1px solid #1a1a2a" }}>
              UNASSIGNED ({unassigned.length})
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {unassigned.map(s => (
                <PlayerToken key={s.id} slot={s} onDragStart={handleDragStart} />
              ))}
            </div>

            {/* Assigned */}
            {assigned.length > 0 && (
              <>
                <div style={{ padding: "6px 8px", fontSize: 9, color: "#555", letterSpacing: "0.1em", borderTop: "1px solid #1a1a2a" }}>
                  ASSIGNED ({assigned.length})
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {assigned.map(s => (
                    <PlayerToken key={s.id} slot={s} onDragStart={handleDragStart} compact />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Assignment Area ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: "7px 20px", borderRadius: 6, cursor: "pointer",
                  fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.05em",
                  background: activeTab === t.id ? "#1a1000" : "#0a0a14",
                  border: `1px solid ${activeTab === t.id ? "#c8a84b" : "#2a2a3a"}`,
                  color: activeTab === t.id ? "#c8a84b" : "#444",
                }}>
                  {t.icon} {t.label}
                </button>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 10, color: "#333", alignSelf: "center" }}>
                {raidDate && <span style={{ color: "#555", marginRight: 12 }}>📅 {raidDate}</span>}
                {raidLeader && <span style={{ color: "#555" }}>👑 {raidLeader}</span>}
              </div>
            </div>

            {activeTab === "gruul" && (
              <div>
                <div style={{ color: "#ef4444", fontSize: 9, marginBottom: 10, letterSpacing: "0.1em" }}>
                  ⚠  COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <Panel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five"
                    rows={GRUUL_MAULGAR} assignments={assignments}
                    onDrop={handleDrop} onClear={handleClear} roster={roster} />
                  <Panel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter"
                    rows={GRUUL_BOSS} assignments={assignments}
                    onDrop={handleDrop} onClear={handleClear} roster={roster} />
                </div>
              </div>
            )}

            {activeTab === "mags" && (
              <div>
                <div style={{ color: "#ef4444", fontSize: 9, marginBottom: 10, letterSpacing: "0.1em" }}>
                  ⚠  CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <Panel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously"
                    rows={MAGS_P1} assignments={assignments}
                    onDrop={handleDrop} onClear={handleClear} roster={roster} />
                  <Panel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move"
                    rows={MAGS_P2} assignments={assignments}
                    onDrop={handleDrop} onClear={handleClear} roster={roster} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

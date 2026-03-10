import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, CLASS_COLORS, getRole, getClass, getColor, getSpecDisplay, cycleSpec,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  KARA_TUE_1, KARA_TUE_2, KARA_TUE_3, KARA_THU_1, KARA_THU_2, KARA_THU_3,
  KARA_TUE_TEAMS, KARA_THU_TEAMS, KARA_ALL_ROWS, RAID_TEAMS,
  CUBE1_KEYS, CUBE2_KEYS, CUBEBU_KEYS, ALL_CUBE_KEYS,
  GENERAL_CURSES, GENERAL_INTERRUPTS,
  saveState, loadState,
} from "./constants";
import {
  FontImport, PlayerBadge, RoleHeader, BossPanel, RaidTabs, WarningBar, KaraTeamHeader, KaraPlayerBadge, MarkerIcon, RowLabel,
} from "./components";
import { saveToFirebase, fetchFromFirebase, isFirebaseConfigured, saveSnapshot, fetchSnapshots, submitWclLog, updateSnapshot, deleteSnapshot } from "./firebase";
import { useWarcraftLogs, getScoreForTab, getScoreForPlayer, getScoreColor } from "./useWarcraftLogs";

const ADMIN_USERS = {
  "Admin": "JordanJackson123!",
  "JBL":   "raidlead123!",
};
const FIREBASE_OK = isFirebaseConfigured();

// ── Save status indicator ─────────────────────────────────────────────────────
function SaveStatus({ status }) {
  const map = {
    idle:    { color: "#666677", text: "" },
    saving:  { color: "#c8a84b", text: "⏳ Saving…" },
    saved:   { color: "#4ade80", text: "✓ Saved & published" },
    error:   { color: "#ef4444", text: "✗ Save failed" },
    offline: { color: "#888",    text: "💾 Local only (Firebase not configured)" },
  };
  const s = map[status] || map.idle;
  return s.text ? (
    <span style={{ fontSize: 10, color: s.color, fontFamily: "'Cinzel', serif", transition: "color 0.3s" }}>
      {s.text}
    </span>
  ) : null;
}

// ── Draggable roster token ────────────────────────────────────────────────────
function RosterToken({ slot, onDragStart, compact, parseScore, parseColor }) {
  return <PlayerBadge slot={slot} compact={compact} draggable onDragStart={onDragStart} parseScore={parseScore} parseColor={parseColor} />;
}

// ── Admin WCL name editor — always editable, no locking ──────────────────────
function AdminWclNameEditor({ player, onChange }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(player.wclName || "");

  const commit = () => { onChange(value.trim()); setEditing(false); };
  const cancel = () => { setValue(player.wclName || ""); setEditing(false); };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
        title={player.wclName ? `WCL: ${player.wclName} — click to change` : "Click to set WCL character name"}
      >
        {player.name}
        {player.wclName && (
          <span style={{ color: "#555", fontSize: 9, marginLeft: 4 }}>→ {player.wclName}</span>
        )}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flex: 1 }}>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        placeholder="WCL char name…"
        style={{
          flex: 1, minWidth: 0, background: "#080810", border: "1px solid #2a2a4a",
          borderRadius: 3, color: "#ccc", padding: "2px 5px",
          fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none",
        }}
      />
      <button onClick={commit} style={{
        background: "#0a200a", border: "1px solid #4ade8055", borderRadius: 3,
        color: "#4ade80", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0,
      }}>✓</button>
      <button onClick={cancel} style={{
        background: "#1a0a0a", border: "1px solid #ef444455", borderRadius: 3,
        color: "#ef4444", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0,
      }}>✗</button>
    </div>
  );
}

// Returns which cube group (1, 2, 3) a player is currently assigned to, or null
function getCubeGroupOf(playerId, assignments) {
  for (const [k, ids] of Object.entries(assignments)) {
    const idArr = Array.isArray(ids) ? ids : [ids];
    if (!idArr.includes(playerId)) continue;
    if (CUBE1_KEYS.includes(k))  return 1;
    if (CUBE2_KEYS.includes(k))  return 2;
    if (CUBEBU_KEYS.includes(k)) return 3;
  }
  return null;
}
// Returns which cube group a given slot key belongs to, or null
function getCubeGroupOfKey(key) {
  if (CUBE1_KEYS.includes(key))  return 1;
  if (CUBE2_KEYS.includes(key))  return 2;
  if (CUBEBU_KEYS.includes(key)) return 3;
  return null;
}
// Keep these for backwards compat in drop handler
function isInCube1(playerId, assignments) { return getCubeGroupOf(playerId, assignments) === 1; }
function isOnAnyCube(playerId, assignments) { return getCubeGroupOf(playerId, assignments) !== null; }

// ── Assignment row (drop target) — supports multiple players + text input ─────
function AssignmentRow({ rowCfg, assignedIds, textValues, roster, onDrop, onClear, onTextChange, onSpecCycle, onDragStart, assignments, conflictError, compact }) {
  const [over, setOver] = useState(false);
  const dropRef = useRef(null);
  const rc    = ROLE_COLORS[rowCfg.role];
  const ids   = assignedIds ? (Array.isArray(assignedIds) ? assignedIds : [assignedIds]) : [];
  const slots = ids.map(id => roster.find(s => s.id === id)).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={e => {
          if (dropRef.current && dropRef.current.contains(e.relatedTarget)) return;
          setOver(false);
        }}
        onDrop={e => { e.preventDefault(); setOver(false); onDrop(rowCfg.key); }}
        style={{
          display: "flex", alignItems: "center", gap: compact ? 6 : 10,
          padding: compact ? "3px 10px" : "6px 14px 6px 12px",
          minHeight: compact ? 0 : 40,
          background: over ? `${rc.border}22` : "transparent",
          borderLeft: `3px solid ${conflictError ? "#ef4444" : over ? rc.label : rc.border + "88"}`,
          borderTop: "none", borderRight: "none", borderBottom: `1px solid #ffffff08`,
          transition: "all 0.12s",
        }}
      >
        {/* Label — hidden for blank kara slots, shown if markerKey present */}
        {(rowCfg.label || rowCfg.markerKey) && (
          <span style={{ fontSize: compact ? 11 : 14, color: compact ? "#ccc" : "#ffffff", fontFamily: "'Cinzel', serif", minWidth: compact ? 140 : 220, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {rowCfg.markerKey && <MarkerIcon markerKey={rowCfg.markerKey} size={compact ? 13 : 16} />}
            {rowCfg.label}
            {rowCfg.hint && (
              <span style={{ color: "#888", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>
            )}
          </span>
        )}

        {/* Player badges */}
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {slots.map(slot => {
            const color = getColor(slot);
            return (
              <div key={slot.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {onSpecCycle ? (
                  <KaraPlayerBadge slot={slot} onSpecCycle={onSpecCycle} onDragStart={onDragStart ? (e, s) => onDragStart(e, s, rowCfg.key) : undefined} />
                ) : (
                  <span
                    draggable
                    onDragStart={e => { e.stopPropagation(); onDragStart(e, slot, rowCfg.key); }}
                    style={{
                      background: `${color}20`, border: `1px solid ${color}44`,
                      borderRadius: 4, padding: "2px 8px",
                      color: color, fontFamily: "'Cinzel', serif", fontSize: 13,
                      display: "inline-flex", alignItems: "center", gap: 5,
                      cursor: "grab", userSelect: "none",
                    }}
                    title="Drag to move to another slot"
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {slot.name}
                    <span style={{ color: `${color}77`, fontSize: 11 }}>{getSpecDisplay(slot)} {getClass(slot)}</span>
                  </span>
                )}
                <button onClick={() => onClear(rowCfg.key, slot.id)} style={{
                  background: "none", border: "none", color: "#555",
                  cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px",
                }} title="Remove">×</button>
              </div>
            );
          })}
          {over && <span style={{ color: rc.label, fontSize: 10, fontStyle: "italic" }}>⬇ drop here</span>}
        </div>

        {/* Text input for shatter groups */}
        {rowCfg.textInput && (
          <input
            value={textValues?.[rowCfg.key] || ""}
            onChange={e => onTextChange(rowCfg.key, e.target.value)}
            placeholder="Notes…"
            style={{
              background: "#0d0d1a", border: "1px solid #2a2a4a", borderRadius: 4,
              color: "#c8a84b", padding: "3px 8px", fontSize: 11,
              fontFamily: "'Cinzel', serif", outline: "none", width: 160,
            }}
          />
        )}
      </div>
      {conflictError && (
        <div style={{ fontSize: 9, color: "#ef4444", paddingLeft: 10, fontFamily: "'Cinzel', serif" }}>
          ⚠ {conflictError}
        </div>
      )}
    </div>
  );
}

// ── Boss panel wrapper ────────────────────────────────────────────────────────
function AdminPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, onDrop, onClear, onTextChange, onSpecCycle, onDragStart, compact }) {
  // Build section headers, respecting roleLabel overrides on first row of each new label
  const items = [];
  let lastSectionKey = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) {
      items.push({ type: "header", role: r.role, label: r.roleLabel || null });
      lastSectionKey = sectionKey;
    }
    // Cube conflict error — flag any player assigned to this slot that's also in a different cube group
    let conflictError = null;
    const thisGroup = getCubeGroupOfKey(r.key);
    if (thisGroup !== null) {
      const ids = assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : [];
      const groupNames = { 1: "Cube Clicker 1", 2: "Cube Clicker 2", 3: "Backup Cube Clickers" };
      for (const id of ids) {
        const otherGroup = getCubeGroupOf(id, { ...assignments, [r.key]: ids.filter(x => x !== id) });
        if (otherGroup !== null && otherGroup !== thisGroup) {
          const player = roster.find(s => s.id === id);
          conflictError = `${player?.name || "Player"} is also in ${groupNames[otherGroup]}!`;
          break;
        }
      }
    }
    items.push({ type: "row", row: r, conflictError });
  });

  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage} compact={compact}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <AssignmentRow key={item.row.key} rowCfg={item.row}
              assignedIds={assignments[item.row.key]}
              textValues={textValues}
              roster={roster} onDrop={onDrop} onClear={onClear}
              onTextChange={onTextChange}
              onSpecCycle={onSpecCycle}
              onDragStart={onDragStart}
              assignments={assignments}
              conflictError={item.conflictError} />
      )}
    </BossPanel>
  );
}

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [user, setUser] = useState("");
  const [pw,   setPw]   = useState("");
  const [err,  setErr]  = useState(false);
  const attempt = () => {
    if (ADMIN_USERS[user] && ADMIN_USERS[user] === pw) {
      onUnlock();
    } else {
      setErr(true);
    }
  };
  return (
    <div style={{
      minHeight: "100vh", background: "#06060f", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel', serif",
    }}>
      <FontImport />
      <div style={{
        background: "#0c0c1a", border: "1px solid #2a2a4a", borderRadius: 12,
        padding: "40px 48px", textAlign: "center", minWidth: 320,
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚔</div>
        <div style={{ color: "#c8a84b", fontSize: 16, marginBottom: 4 }}>Admin Access</div>
        <div style={{ color: "#666", fontSize: 10, letterSpacing: "0.15em", marginBottom: 24 }}>TBC RAID ASSIGNMENTS</div>
        <input
          type="text" value={user} autoFocus
          onChange={e => { setUser(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Username"
          style={{
            width: "100%", background: "#080810",
            border: `1px solid ${err ? "#ef4444" : "#2a2a4a"}`,
            borderRadius: 6, color: "#c8a84b", padding: "10px 14px",
            fontFamily: "'Cinzel', serif", fontSize: 13, textAlign: "center",
            outline: "none", marginBottom: 10, boxSizing: "border-box",
          }}
        />
        <input
          type="password" value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Password"
          style={{
            width: "100%", background: "#080810",
            border: `1px solid ${err ? "#ef4444" : "#2a2a4a"}`,
            borderRadius: 6, color: "#c8a84b", padding: "10px 14px",
            fontFamily: "'Cinzel', serif", fontSize: 13, textAlign: "center",
            outline: "none", marginBottom: 12, boxSizing: "border-box",
          }}
        />
        {err && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8 }}>Incorrect username or password</div>}
        <button onClick={attempt} style={{
          width: "100%", padding: "10px", background: "#1a0800",
          border: "1px solid #c8a84b55", borderRadius: 6,
          color: "#c8a84b", cursor: "pointer", fontFamily: "'Cinzel', serif", fontSize: 13,
        }}>Enter</button>
      </div>
    </div>
  );
}

// ── Firebase setup banner (shown when config not filled in) ───────────────────
function SetupBanner() {
  return (
    <div style={{
      background: "#1a0a00", border: "1px solid #c8a84b44",
      borderRadius: 6, padding: "10px 16px", marginBottom: 12,
      fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span>
        Firebase not configured — assignments save locally only and won't sync to the public view on other devices.{" "}
        <span style={{ color: "#888" }}>
          Fill in your config in <code style={{ color: "#aaa" }}>src/firebase.js</code> to enable real-time sync.
        </span>
      </span>
    </div>
  );
}


// ── Class/spec definitions for manual character creation ─────────────────────
const CLASS_SPECS = {
  Warrior:  ["Arms", "Fury", "Protection"],
  Paladin:  ["Holy", "Protection1", "Retribution"],
  Hunter:   ["Beast Mastery", "Marksmanship", "Survival"],
  Rogue:    ["Assassination", "Combat", "Subtlety"],
  Priest:   ["Discipline", "Holy1", "Shadow"],
  Shaman:   ["Elemental", "Enhancement", "Restoration"],
  Mage:     ["Arcane", "Fire", "Frost"],
  Warlock:  ["Affliction", "Demonology", "Destruction"],
  Druid:    ["Balance", "Feral", "Restoration1", "Guardian"],
};
// Friendly display names for spec keys that have suffix numbers
const SPEC_DISPLAY = {
  Protection1: "Protection", Holy1: "Holy", Restoration1: "Restoration",
};
function specLabel(s) { return SPEC_DISPLAY[s] || s; }

// ── Manual character creator ──────────────────────────────────────────────────
function ManualAddPlayer({ onAdd }) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [cls,  setCls]        = useState("Warrior");
  const [spec, setSpec]       = useState("Arms");
  const [error, setError]     = useState("");

  const specs = CLASS_SPECS[cls] || [];

  // Reset spec when class changes
  const handleClass = c => { setCls(c); setSpec(CLASS_SPECS[c][0]); };

  const handleAdd = () => {
    if (!name.trim()) { setError("Enter a name"); return; }
    const color = CLASS_COLORS[cls] || "#aaa";
    const newSlot = {
      id:        `manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      name:      name.trim(),
      className: cls,
      specName:  spec,
      color,
      manual:    true,
    };
    onAdd(newSlot);
    setName("");
    setCls("Warrior");
    setSpec("Arms");
    setError("");
    setOpen(false);
  };

  const color = CLASS_COLORS[cls] || "#aaa";

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      background: "#0a100a", border: "1px dashed #2a4a2a", borderRadius: 5,
      color: "#4ade80", padding: "4px 12px", cursor: "pointer",
      fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.05em",
      width: "100%", marginTop: 6,
    }}>
      + Add Character
    </button>
  );

  return (
    <div style={{
      background: "#0a100a", border: "1px solid #2a4a2a", borderRadius: 6,
      padding: "10px 10px 8px", marginTop: 6, display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", fontFamily: "'Cinzel', serif", marginBottom: 2 }}>
        ADD CHARACTER
      </div>
      {/* Name input */}
      <input
        autoFocus
        value={name}
        onChange={e => { setName(e.target.value); setError(""); }}
        onKeyDown={e => e.key === "Enter" && handleAdd()}
        placeholder="Character name"
        style={{
          background: "#080810", border: `1px solid ${error ? "#ef4444" : "#1a1a2a"}`,
          borderRadius: 4, color: "#fff", padding: "5px 8px",
          fontFamily: "'Cinzel', serif", fontSize: 11, outline: "none", width: "100%",
        }}
      />
      {error && <div style={{ color: "#ef4444", fontSize: 10 }}>{error}</div>}
      {/* Class selector */}
      <select value={cls} onChange={e => handleClass(e.target.value)} style={{
        background: "#080810", border: "1px solid #1a1a2a", borderRadius: 4,
        color: color, padding: "5px 8px", fontFamily: "'Cinzel', serif",
        fontSize: 11, outline: "none", width: "100%", cursor: "pointer",
      }}>
        {Object.keys(CLASS_SPECS).map(c => (
          <option key={c} value={c} style={{ color: CLASS_COLORS[c] || "#fff", background: "#080810" }}>{c}</option>
        ))}
      </select>
      {/* Spec selector */}
      <select value={spec} onChange={e => setSpec(e.target.value)} style={{
        background: "#080810", border: "1px solid #1a1a2a", borderRadius: 4,
        color: "#aaa", padding: "5px 8px", fontFamily: "'Cinzel', serif",
        fontSize: 11, outline: "none", width: "100%", cursor: "pointer",
      }}>
        {specs.map(s => (
          <option key={s} value={s} style={{ background: "#080810" }}>{specLabel(s)}</option>
        ))}
      </select>
      {/* Buttons */}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={handleAdd} style={{
          flex: 1, background: "#0a200a", border: "1px solid #4ade8055",
          borderRadius: 4, color: "#4ade80", padding: "5px",
          cursor: "pointer", fontFamily: "'Cinzel', serif", fontSize: 10,
        }}>✓ Add</button>
        <button onClick={() => { setOpen(false); setError(""); setName(""); }} style={{
          flex: 1, background: "#1a0a0a", border: "1px solid #ef444455",
          borderRadius: 4, color: "#ef4444", padding: "5px",
          cursor: "pointer", fontFamily: "'Cinzel', serif", fontSize: 10,
        }}>✗ Cancel</button>
      </div>
    </div>
  );
}

// ── Main Admin App ────────────────────────────────────────────────────────────
// ── Admin Kara Section ────────────────────────────────────────────────────────
function AdminKaraSection({ rosterTue, rosterThu, viewAssignments, isLocked, handleDrop, handleClear, handleDragStart, handleSpecCycle, discordCopiedTue, discordCopiedThu, setDiscordCopiedTue, setDiscordCopiedThu, copyNightDiscord }) {
  const allRosters = [...rosterTue, ...rosterThu];
  const nightSections = [
    { label: "📅 TUESDAY",  teams: KARA_TUE_TEAMS, color: "#4ade80", copied: discordCopiedTue, setCopied: setDiscordCopiedTue },
    { label: "📅 THURSDAY", teams: KARA_THU_TEAMS, color: "#60a5fa", copied: discordCopiedThu, setCopied: setDiscordCopiedThu },
  ];
  const UTILITY = {
    removeCurse: { label: "Remove Curse", icon: "🧹", specs: new Set(["Balance","Restoration","Feral","Guardian","Arcane","Fire","Frost"]) },
    dispelMagic: { label: "Dispel Magic", icon: "✨", specs: new Set(["Holy","Holy1","Discipline","Shadow"]) },
    curePoison:  { label: "Cure Poison",  icon: "🧪", specs: new Set(["Balance","Restoration","Feral","Guardian","Restoration1"]) },
    cureDisease: { label: "Cure Disease", icon: "💊", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution"]) },
    interrupt:   { label: "Interrupt",    icon: "⚡", specs: new Set(["Arms","Fury","Protection","Assassination","Combat","Subtlety","Enhancement","Retribution","Protection1","Feral","Guardian"]) },
    deenrage:    { label: "De-Enrage",    icon: "😤", specs: new Set(["BeastMastery","Beastmastery","Marksmanship","Survival","Feral","Guardian","Balance","Restoration"]) },
    bloodlust:   { label: "Bloodlust",    icon: "🥁", specs: new Set(["Elemental","Enhancement","Restoration1"]) },
  };
  return (
    <>
      {nightSections.map(({ label, teams, color, copied, setCopied }) => (
        <div key={label} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "7px 14px", background: "#0a0a14", border: "1px solid #1e1e3a", borderRadius: 6 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>{label}</span>
            <button
              onClick={() => copyNightDiscord(label, teams, setCopied)}
              style={{ ...btn("#000820", "#5865f244", copied ? "#4ade80" : "#5865f2"), marginLeft: "auto", fontSize: 10, padding: "3px 10px" }}
            >
              {copied ? "✓ Copied!" : "💬 Copy Discord"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {teams.map((team, i) => {
              const filledG1 = team.g1.filter(r => viewAssignments[r.key]).length;
              const filledG2 = team.g2.filter(r => viewAssignments[r.key]).length;
              const filledCount = filledG1 + filledG2;
              const teamPlayers = [...team.g1, ...team.g2]
                .flatMap(r => viewAssignments[r.key] ? (Array.isArray(viewAssignments[r.key]) ? viewAssignments[r.key] : [viewAssignments[r.key]]) : [])
                .map(id => allRosters.find(p => p.id === id)).filter(Boolean);
              const tankCount   = teamPlayers.filter(p => getRole(p) === "Tank").length;
              const healerCount = teamPlayers.filter(p => getRole(p) === "Healer").length;
              const has = {};
              Object.keys(UTILITY).forEach(k => { has[k] = teamPlayers.some(p => UTILITY[k].specs.has(p.specName)); });
              return (
                <div key={i} style={{ flex: 1, background: "#0a0a12", border: `1px solid ${color}33`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", borderBottom: `1px solid ${color}22`, display: "flex", alignItems: "center", gap: 6, background: `${color}08` }}>
                    <span style={{ fontSize: 13, color, fontFamily: "'Cinzel', serif", fontWeight: 700 }}>🏰 TEAM {i + 1}</span>
                    <div style={{ display: "flex", gap: 8, marginLeft: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#60a5fa", fontFamily: "'Cinzel', serif" }}>🛡 {tankCount}</span>
                      <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>💚 {healerCount}</span>
                    </div>
                    <span style={{ fontSize: 9, color: "#555", marginLeft: "auto", fontFamily: "'Cinzel', serif" }}>{filledCount}/10</span>
                  </div>
                  {filledCount > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "5px 10px", borderBottom: `1px solid ${color}11`, background: "#06060e" }}>
                      {Object.entries(UTILITY).map(([k, u]) => (
                        <span key={k} style={{ fontSize: 9, fontFamily: "'Cinzel', serif", padding: "1px 6px", borderRadius: 3, background: has[k] ? "#0a1a0a" : "#1a0a0a", border: `1px solid ${has[k] ? "#4ade8033" : "#ef444433"}`, color: has[k] ? "#4ade80" : "#ef444488", opacity: has[k] ? 1 : 0.7 }}>
                          {u.icon} {u.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex" }}>
                    {[team.g1, team.g2].map((group, gi) => (
                      <div key={gi} style={{ flex: 1, borderRight: gi === 0 ? `1px solid ${color}18` : "none" }}>
                        <div style={{ padding: "4px 10px", borderBottom: `1px solid ${color}11`, display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: `${color}88`, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>GROUP {gi + 1}</span>
                          <span style={{ fontSize: 9, color: "#444", fontFamily: "'Cinzel', serif" }}>{gi === 0 ? filledG1 : filledG2}/5</span>
                        </div>
                        <div style={{ padding: "4px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                          {group.map(row => (
                            <AssignmentRow
                              key={row.key} rowCfg={row}
                              assignedIds={viewAssignments[row.key]}
                              roster={allRosters}
                              onDrop={isLocked ? null : handleDrop}
                              onClear={isLocked ? null : handleClear}
                              onDragStart={isLocked ? null : handleDragStart}
                              onSpecCycle={handleSpecCycle}
                              assignments={viewAssignments}
                              compact={false}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Conflict resolution modal ─────────────────────────────────────────────────
// Shown when the same Discord ID appears in both imports with different classes.
// User sets a WCL character name for each of their two characters before import proceeds.
function ConflictModal({ conflicts, resolved, onChange, onConfirm }) {
  const allFilled = conflicts.every(c => {
    const r = resolved[c.discordId];
    return r?.tueName?.trim() && r?.thuName?.trim();
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#0c0c1a", border: "1px solid #a78bfa44", borderRadius: 10,
        padding: "24px 28px", width: 520, maxWidth: "95vw", maxHeight: "80vh",
        overflowY: "auto", fontFamily: "'Cinzel', serif",
      }}>
        <div style={{ fontSize: 16, color: "#a78bfa", marginBottom: 6 }}>⚔ Character Conflicts Detected</div>
        <div style={{ fontSize: 10, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
          The following players are signed up on <span style={{ color: "#4ade80" }}>Tuesday</span> and{" "}
          <span style={{ color: "#60a5fa" }}>Thursday</span> on <strong style={{ color: "#fff" }}>different characters</strong>.
          They'll be split into two separate roster entries.
          Set the WarcraftLogs character name for each so parse scores work correctly.
        </div>

        {conflicts.map(({ discordId, tueSlot, thuSlot }) => {
          const r = resolved[discordId] || { tueName: tueSlot.name, thuName: thuSlot.name };
          return (
            <div key={discordId} style={{
              marginBottom: 16, padding: "12px 14px",
              background: "#08081a", border: "1px solid #2a2a4a", borderRadius: 7,
            }}>
              {/* Discord display name header */}
              <div style={{ fontSize: 11, color: "#c8a84b", marginBottom: 10, letterSpacing: "0.08em" }}>
                🎮 {tueSlot.name}
                <span style={{ color: "#444", fontSize: 9, marginLeft: 8 }}>Discord ID: {discordId}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {/* Tuesday character */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", marginBottom: 5 }}>
                    📅 TUESDAY
                  </div>
                  <div style={{ fontSize: 10, color: CLASS_COLORS[tueSlot.className] || "#aaa", marginBottom: 6 }}>
                    {tueSlot.specName} {tueSlot.className}
                  </div>
                  <div style={{ fontSize: 9, color: "#666", marginBottom: 3 }}>WCL Character Name</div>
                  <input
                    value={r.tueName}
                    onChange={e => onChange(discordId, "tueName", e.target.value)}
                    placeholder="Character name…"
                    style={{
                      width: "100%", background: "#080810", border: "1px solid #2a2a4a",
                      borderRadius: 4, color: "#4ade80", padding: "5px 8px",
                      fontFamily: "'Cinzel', serif", fontSize: 11, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Thursday character */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "#60a5fa", letterSpacing: "0.1em", marginBottom: 5 }}>
                    📅 THURSDAY
                  </div>
                  <div style={{ fontSize: 10, color: CLASS_COLORS[thuSlot.className] || "#aaa", marginBottom: 6 }}>
                    {thuSlot.specName} {thuSlot.className}
                  </div>
                  <div style={{ fontSize: 9, color: "#666", marginBottom: 3 }}>WCL Character Name</div>
                  <input
                    value={r.thuName}
                    onChange={e => onChange(discordId, "thuName", e.target.value)}
                    placeholder="Character name…"
                    style={{
                      width: "100%", background: "#080810", border: "1px solid #2a2a4a",
                      borderRadius: 4, color: "#60a5fa", padding: "5px 8px",
                      fontFamily: "'Cinzel', serif", fontSize: 11, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <button
          onClick={onConfirm}
          disabled={!allFilled}
          style={{
            width: "100%", marginTop: 8, padding: "10px",
            background: allFilled ? "#0a1a0a" : "#0a0a0a",
            border: `1px solid ${allFilled ? "#4ade8066" : "#333"}`,
            borderRadius: 6, color: allFilled ? "#4ade80" : "#444",
            cursor: allFilled ? "pointer" : "not-allowed",
            fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.05em",
            transition: "all 0.15s",
          }}
        >
          {allFilled ? "✓ Confirm & Import" : `Fill in all character names to continue (${conflicts.filter(c => { const r = resolved[c.discordId]; return r?.tueName?.trim() && r?.thuName?.trim(); }).length}/${conflicts.length} done)`}
        </button>
      </div>
    </div>
  );
}

export default function AdminView({ teamId, teamName }) {
  const [unlocked,    setUnlocked]    = useState(false);
  const [roster,      setRoster]      = useState([]);
  const [rosterTue,   setRosterTue]   = useState([]);
  const [rosterThu,   setRosterThu]   = useState([]);
  const [karaNight,   setKaraNight]   = useState("tue"); // "tue" | "thu"
  const [assignments,  setAssignments]  = useState({});
  const [textInputs,   setTextInputs]   = useState({});
  const [specOverrides, setSpecOverrides] = useState({}); // { [playerId]: specName }
  const [dividers,      setDividers]      = useState([]); // [{ name, position }]
  const [raidDate,    setRaidDate]    = useState("");
  const [raidLeader,  setRaidLeader]  = useState("");
  const [activeTab,   setActiveTab]   = useState("gruul");
  const [dragSlot,    setDragSlot]    = useState(null);
  const [dragSourceKey, setDragSourceKey] = useState(null); // slot key player is being dragged FROM
  const [roleFilter,  setRoleFilter]  = useState("All");
  const [showImport,  setShowImport]  = useState(false);
  const [jsonError,    setJsonError]    = useState("");
  const [jsonErrorTue, setJsonErrorTue] = useState("");
  const [jsonErrorThu, setJsonErrorThu] = useState("");
  const [saveStatus,    setSaveStatus]    = useState(FIREBASE_OK ? "idle" : "offline");
  const [snapshotStatus, setSnapshotStatus] = useState("idle");
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [snapshots,     setSnapshots]     = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedSnap,  setExpandedSnap]  = useState(null);
  // Week slider — null means "current week (live)", otherwise a snapshot id
  const [viewingSnap,   setViewingSnap]   = useState(null);
  // WCL log submission
  const [wclSubmitUrl,    setWclSubmitUrl]    = useState("");
  const [sheetSubmitUrl,  setSheetSubmitUrl]  = useState("");
  const [combatLogSubmitUrl, setCombatLogSubmitUrl] = useState("");
  const [wclSubmitStatus, setWclSubmitStatus] = useState("idle"); // idle | saving | saved | error
  const [sheetEditUrl,    setSheetEditUrl]    = useState("");
  const [sheetEditStatus, setSheetEditStatus] = useState("idle"); // idle | saving | saved
  const [combatLogEditUrl,    setCombatLogEditUrl]    = useState("");
  const [combatLogEditStatus, setCombatLogEditStatus] = useState("idle"); // idle | saving | saved
  const [discordCopied, setDiscordCopied] = useState(false);
  const [discordCopiedTue, setDiscordCopiedTue] = useState(false);
  const [discordCopiedThu, setDiscordCopiedThu] = useState(false);
  const [mrtCopied,   setMrtCopied]   = useState(false);
  const [parsesOpen,  setParsesOpen]  = useState(false);
  const [deleteMode,   setDeleteMode]   = useState(false);
  const [deleteSelected, setDeleteSelected] = useState(new Set());
  const [hasUnsaved,   setHasUnsaved]   = useState(false);
  // ── Conflict resolution modal ───────────────────────────────────────────────
  // pendingConflicts: array of { discordId, tueSlot, thuSlot }
  // pendingResolved: { [discordId]: { tueName, thuName } } — wclName inputs
  // pendingImportQueue: slots/dividers staged until conflicts are resolved
  const [pendingConflicts,   setPendingConflicts]   = useState([]);
  const [pendingResolved,    setPendingResolved]    = useState({});
  const [pendingImportQueue, setPendingImportQueue] = useState(null); // { tueSlots, thuSlots, tueDividers, thuDividers }
  const autoSaveTimer = useRef(null);
  const fileRef    = useRef();
  const fileRefTue = useRef();
  const fileRefThu = useRef();
  const commitImportRef = useRef(null); // always points to latest commitImport
  const navigate = useNavigate();

  // ── WarcraftLogs parse scores ───────────────────────────────────────────────
  const { scores: wclScores, loading: wclLoading, error: wclError, lastFetch: wclLastFetch, refetch: wclRefetch } = useWarcraftLogs(roster);

  // ── Load initial state ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      let s = null;
      if (FIREBASE_OK) {
        try { s = await fetchFromFirebase(teamId); } catch (e) { console.warn("Firebase fetch failed", e); }
      }
      if (!s) s = loadState(teamId);
      if (s) {
        if (s.roster)        setRoster(s.roster);
        if (s.rosterTue)     setRosterTue(s.rosterTue);
        if (s.rosterThu)     setRosterThu(s.rosterThu);
        if (s.assignments)   setAssignments(s.assignments);
        if (s.raidDate)      setRaidDate(s.raidDate);
        if (s.raidLeader)    setRaidLeader(s.raidLeader);
        if (s.textInputs)    setTextInputs(s.textInputs);
        if (s.specOverrides) setSpecOverrides(s.specOverrides);
        if (s.dividers)      setDividers(s.dividers);
      }
    }
    load();
  }, [teamId]);

  // ── Auto-save: debounce 4s after any meaningful state change ────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    setHasUnsaved(true);
    if (!FIREBASE_OK) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const state = { roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers };
      saveState(state, teamId);
      try {
        setSaveStatus("saving");
        await saveToFirebase(state, teamId);
        setSaveStatus("saved");
        setHasUnsaved(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    }, 4000);
  }, [roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers]);

  // ── Save handler ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const state = { roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers };
    saveState(state, teamId);

    if (!FIREBASE_OK) {
      setSaveStatus("offline");
      return;
    }

    setSaveStatus("saving");
    try {
      await saveToFirebase(state, teamId);
      setSaveStatus("saved");
      setHasUnsaved(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      console.error("Firebase save failed", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }, [roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers, teamId]);

  // ── Snapshot handler ─────────────────────────────────────────────────────────
  const handleSaveSnapshot = useCallback(async () => {
    if (!FIREBASE_OK) return alert("Firebase required to save snapshots.");
    setSnapshotStatus("saving");
    try {
      const state = { roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers };
      await saveSnapshot(state, teamId);
      setSnapshotStatus("saved");
      // Refresh history list if panel is open
      if (historyOpen) {
        const snaps = await fetchSnapshots(teamId);
        setSnapshots(snaps);
      }
      setTimeout(() => setSnapshotStatus("idle"), 3000);
    } catch (e) {
      console.error("Snapshot save failed", e);
      setSnapshotStatus("error");
      setTimeout(() => setSnapshotStatus("idle"), 4000);
    }
  }, [roster, rosterTue, rosterThu, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers, teamId, historyOpen]);

  // Load snapshots when history panel opens
  const handleToggleHistory = useCallback(async () => {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (opening && FIREBASE_OK && snapshots.length === 0) {
      setHistoryLoading(true);
      try {
        const snaps = await fetchSnapshots(teamId);
        setSnapshots(snaps);
      } finally {
        setHistoryLoading(false);
      }
    }
  }, [historyOpen, snapshots.length, teamId]);

  // Load snapshots on mount for the week slider
  useEffect(() => {
    if (!FIREBASE_OK) return;
    fetchSnapshots(teamId).then(setSnapshots).catch(console.warn);
  }, [teamId]);

  // ── Auto-fetch raid date from WCL report ─────────────────────────────────
  async function fetchRaidDateFromReport(reportCode) {
    try {
      const res = await fetch("/api/warcraftlogs-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fights", reportId: reportCode }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.start) return null;
      const d = new Date(data.start);
      return `${d.getMonth() + 1}-${d.getDate()}-${String(d.getFullYear()).slice(2)}`;
    } catch (e) {
      console.warn("Could not auto-fetch raid date from WCL", e);
      return null;
    }
  }

  // Submit a WCL report URL — saves snapshot if current week, locks it
  const handleWclSubmit = useCallback(async () => {
    const url = wclSubmitUrl.trim();
    if (!url) return;
    // Normalize WCL URL
    const match = url.match(/reports\/([A-Za-z0-9]+)/);
    const reportCode = match ? match[1] : null;
    const finalUrl = reportCode
      ? `https://fresh.warcraftlogs.com/reports/${reportCode}`
      : url;

    // ── Auto-fetch raid date from the WCL report ──────────────────────────
    let autoDate = raidDate;
    if (reportCode) {
      const fetched = await fetchRaidDateFromReport(reportCode);
      if (fetched) {
        autoDate = fetched;
        setRaidDate(fetched);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Normalize sheet URL — convert /edit or /view links to embeddable URL
    const rawSheet = sheetSubmitUrl.trim();
    const sheetUrl = rawSheet
      ? rawSheet.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview")
      : null;

    const rawCombatLog = combatLogSubmitUrl.trim();
    const combatLogUrl = rawCombatLog
      ? rawCombatLog.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview")
      : null;

    setWclSubmitStatus("saving");
    try {
      const extra = {
        wclReportUrl: finalUrl, locked: true,
        ...(sheetUrl     ? { sheetUrl }     : {}),
        ...(combatLogUrl ? { combatLogUrl } : {}),
      };
      if (viewingSnap) {
        await submitWclLog(teamId, viewingSnap, finalUrl);
        const updates = {};
        if (sheetUrl)     updates.sheetUrl     = sheetUrl;
        if (combatLogUrl) updates.combatLogUrl = combatLogUrl;
        if (Object.keys(updates).length) {
          const { updateSnapshot } = await import("./firebase");
          await updateSnapshot(teamId, viewingSnap, updates);
        }
        setSnapshots(prev => prev.map(s => s.id === viewingSnap ? { ...s, ...extra } : s));
      } else {
        // Use autoDate (fetched from WCL) instead of potentially stale raidDate state
        const state = { roster, rosterTue, rosterThu, assignments, textInputs, raidDate: autoDate, raidLeader, specOverrides, dividers };
        await saveSnapshot(state, teamId, extra);
        const snaps = await fetchSnapshots(teamId);
        setSnapshots(snaps);
      }
      setWclSubmitStatus("saved");
      setWclSubmitUrl("");
      setSheetSubmitUrl("");
      setCombatLogSubmitUrl("");
      setTimeout(() => setWclSubmitStatus("idle"), 3000);
    } catch (e) {
      console.error("WCL submit failed", e);
      setWclSubmitStatus("error");
      setTimeout(() => setWclSubmitStatus("idle"), 4000);
    }
  }, [wclSubmitUrl, sheetSubmitUrl, combatLogSubmitUrl, viewingSnap, teamId, roster, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers]);


  const handleSpecCycle = (playerId) => {
    const updateSlot = s => {
      if (s.id !== playerId) return s;
      const { specName: nextSpec, baseClass } = cycleSpec(s);
      return { ...s, specName: nextSpec, className: nextSpec, baseClass };
    };
    setRoster(prev => prev.map(updateSlot));
    setRosterTue(prev => prev.map(updateSlot));
    setRosterThu(prev => prev.map(updateSlot));
    setSpecOverrides(prev => {
      const player = roster.find(s => s.id === playerId);
      if (!player) return prev;
      const { specName: nextSpec } = cycleSpec(player);
      return { ...prev, [playerId]: nextSpec };
    });
  };

  // ── JSON import ─────────────────────────────────────────────────────────────
  // Stage both imports, detect class conflicts, show modal if needed.
  // A "conflict" = same Discord ID in both JSONs with a DIFFERENT className.
  // Same ID + same class = one player on both nights, no conflict.
  // Conflicting players are split into two separate roster entries:
  //   {discordId}_tue  and  {discordId}_thu
  // each with their own wclName so WCL lookup works independently.
  const handleImportJSON = (text, night) => {
    try {
      const data = JSON.parse(text);
      if (!data.slots) throw new Error("No 'slots' array found");
      const slots = data.slots;
      const dividers = data.dividers || [];

      // Check if the OTHER night is already staged in the queue
      // If so, add this night to the queue and let the useEffect handle conflict detection
      // If not, commit this night directly to roster (single-night import)
      setPendingImportQueue(prev => {
        const otherNightAlreadyStaged = prev && (
          night === "tue" ? prev.thuSlots.length > 0 : prev.tueSlots.length > 0
        );

        if (otherNightAlreadyStaged) {
          // Both nights now staged — queue for conflict detection
          if (night === "tue") {
            return { ...prev, tueSlots: slots, tueDividers: dividers };
          } else {
            return { ...prev, thuSlots: slots, thuDividers: dividers };
          }
        } else {
          // Single night import — commit immediately, bypassing queue
          const queue = night === "tue"
            ? { tueSlots: slots, thuSlots: [], tueDividers: dividers, thuDividers: [] }
            : { tueSlots: [], thuSlots: slots, tueDividers: [], thuDividers: dividers };
          // Use setTimeout to call commitImport after state settles
          setTimeout(() => commitImportRef.current(queue, []), 0);
          return null; // clear any stale queue
        }
      });

      if (night === "tue") setJsonErrorTue("");
      else setJsonErrorThu("");
    } catch (e) {
      if (night === "tue") setJsonErrorTue(e.message);
      else setJsonErrorThu(e.message);
    }
  };

  // Commit staged import to roster — called either directly (no conflicts) or after modal confirm
  const commitImport = useCallback((queue, resolvedConflicts) => {
    const { tueSlots, thuSlots, tueDividers, thuDividers } = queue;
    const conflictIds = new Set(resolvedConflicts.map(c => c.discordId));

    // Build final slot lists, splitting conflicting players into two entries
    const buildSlots = (slots, night) => slots.flatMap(slot => {
      if (conflictIds.has(slot.id)) {
        // Split into night-specific entry with its own id and wclName
        const resolved = resolvedConflicts.find(c => c.discordId === slot.id);
        const wclName = night === "tue"
          ? resolved?.resolvedNames?.tueName
          : resolved?.resolvedNames?.thuName;
        return [{
          ...slot,
          id: `${slot.id}_${night}`,
          karaNight: night,
          wclName: wclName || undefined,
          _discordId: slot.id, // preserve original for reference
        }];
      }
      return [{ ...slot, karaNight: night }];
    });

    const finalTue = buildSlots(tueSlots, "tue");
    const finalThu = buildSlots(thuSlots, "thu");

    setRoster(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));

      // Clear out any previously imported slots for each night before merging,
      // so re-importing a night fully replaces that night's players
      const nightsBeingImported = new Set();
      if (tueSlots.length) nightsBeingImported.add("tue");
      if (thuSlots.length) nightsBeingImported.add("thu");
      for (const [id, p] of byId) {
        if (nightsBeingImported.has(p.karaNight)) byId.delete(id);
      }

      [...finalTue, ...finalThu].forEach(slot => {
        const existing = byId.get(slot.id);
        byId.set(slot.id, {
          ...(existing || {}),
          ...slot,
          // Preserve wclName from existing entry unless the new slot explicitly sets one
          wclName: slot.wclName ?? existing?.wclName,
        });
      });

      const merged = [...byId.values()];
      setRosterTue(merged.filter(p => p.karaNight === "tue"));
      setRosterThu(merged.filter(p => p.karaNight === "thu"));
      return merged;
    });

    if (tueDividers.length) setDividers(tueDividers);
    else if (thuDividers.length) setDividers(thuDividers);

    // Clear pending state
    setPendingImportQueue(null);
    setPendingConflicts([]);
    setPendingResolved({});
  }, [roster]);

  // Keep ref in sync so handleImportJSON can call it without stale closure
  commitImportRef.current = commitImport;

  // Runs whenever pendingImportQueue changes — if both nights are staged, check for conflicts
  useEffect(() => {
    if (!pendingImportQueue) return;
    const { tueSlots, thuSlots } = pendingImportQueue;
    // Wait until both nights are staged before doing anything
    if (!tueSlots.length || !thuSlots.length) return;

    // Both nights staged — detect conflicts
    const thuById = new Map(thuSlots.map(s => [s.id, s]));
    const conflicts = [];
    tueSlots.forEach(tueSlot => {
      const thuSlot = thuById.get(tueSlot.id);
      if (thuSlot && thuSlot.className !== tueSlot.className) {
        conflicts.push({ discordId: tueSlot.id, tueSlot, thuSlot });
      }
    });

    if (conflicts.length === 0) {
      commitImport(pendingImportQueue, []);
    } else {
      // Pre-fill wclName inputs from existing roster data if available
      const initialResolved = {};
      conflicts.forEach(({ discordId, tueSlot, thuSlot }) => {
        const existingTue = roster.find(p => p.id === `${discordId}_tue`);
        const existingThu = roster.find(p => p.id === `${discordId}_thu`);
        initialResolved[discordId] = {
          tueName: existingTue?.wclName ?? tueSlot.name,
          thuName: existingThu?.wclName ?? thuSlot.name,
        };
      });
      setPendingConflicts(conflicts);
      setPendingResolved(initialResolved);
    }
  }, [pendingImportQueue, commitImport, roster]);

  // Called when user confirms the conflict modal
  const handleConflictConfirm = useCallback(() => {
    const resolvedConflicts = pendingConflicts.map(c => ({
      ...c,
      resolvedNames: pendingResolved[c.discordId] || { tueName: c.tueSlot.name, thuName: c.thuSlot.name },
    }));
    commitImport(pendingImportQueue, resolvedConflicts);
  }, [pendingConflicts, pendingResolved, pendingImportQueue, commitImport]);

  const handleFile = (e, night) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleImportJSON(ev.target.result.trim(), night);
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDragStart = (e, slot, sourceKey = null) => {
    setDragSlot(slot);
    setDragSourceKey(sourceKey);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDrop = key => {
    if (!dragSlot) return;
    const playerId = dragSlot.id;
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      if (existing.includes(playerId) && dragSourceKey === key) return prev; // same slot, no-op

      // Kara: block if a player with the same name is already placed in any kara slot
      if (karaKeys.has(key)) {
        const dragName = dragSlot.name.toLowerCase();
        const alreadyPlaced = Object.entries(prev)
          .filter(([k]) => karaKeys.has(k) && k !== dragSourceKey)
          .flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
          .some(id => {
            const p = roster.find(s => s.id === id);
            return p && p.name.toLowerCase() === dragName;
          });
        if (alreadyPlaced) {
          alert(`${dragSlot.name} is already assigned to a Karazhan team.`);
          return prev;
        }
      }

      // Cube group conflict check
      const targetGroup = getCubeGroupOfKey(key);
      if (targetGroup !== null) {
        const playerCurrentGroup = getCubeGroupOf(playerId, prev);
        if (playerCurrentGroup !== null && playerCurrentGroup !== targetGroup) {
          const groupNames = { 1: "Cube Clicker 1", 2: "Cube Clicker 2", 3: "Backup Cube Clickers" };
          alert(`${dragSlot.name} is already in "${groupNames[playerCurrentGroup]}" and cannot also be in "${groupNames[targetGroup]}".`);
          return prev;
        }
      }

      let next = { ...prev };

      // Remove from source slot if dragging from an assigned slot
      if (dragSourceKey && dragSourceKey !== key) {
        const srcExisting = next[dragSourceKey] ? (Array.isArray(next[dragSourceKey]) ? next[dragSourceKey] : [next[dragSourceKey]]) : [];
        const srcUpdated = srcExisting.filter(id => id !== playerId);
        if (srcUpdated.length === 0) delete next[dragSourceKey];
        else next[dragSourceKey] = srcUpdated;
      }

      if (!existing.includes(playerId)) {
        next[key] = [...existing, playerId];
      }
      return next;
    });
    setDragSlot(null);
    setDragSourceKey(null);
  };
  const handleClear = (key, playerId) => setAssignments(prev => {
    const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
    const updated = existing.filter(id => id !== playerId);
    const n = { ...prev };
    if (updated.length === 0) delete n[key];
    else n[key] = updated;
    return n;
  });
  const handleClearAll  = () => { if (confirm("Clear all assignments?")) { setAssignments({}); setTextInputs({}); } };
  const handleAddManual  = slot => setRoster(prev => [...prev, slot]);
  const handleTextChange = (key, val) => setTextInputs(prev => ({ ...prev, [key]: val }));
  const handleWclNameChange = async (playerId, wclName) => {
    const updatedRoster = roster.map(p => p.id === playerId ? { ...p, wclName: wclName || undefined } : p);
    setRoster(updatedRoster);
    const state = { roster: updatedRoster, assignments, textInputs, raidDate, raidLeader, specOverrides, dividers };
    saveState(state, teamId);
    if (FIREBASE_OK) {
      try { await saveToFirebase(state, teamId); } catch (e) { console.warn("WCL name save failed", e); }
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  // When viewing a past snapshot, use its data; otherwise use live state
  const viewSnap     = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked     = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : assignments;
  const viewRoster      = viewSnap ? (viewSnap.roster      ?? []) : roster;
  const viewTextInputs  = viewSnap ? (viewSnap.textInputs  ?? {}) : textInputs;
  const viewRaidDate    = viewSnap ? viewSnap.raidDate   : raidDate;
  const viewRaidLeader  = viewSnap ? viewSnap.raidLeader : raidLeader;

  // All players always visible in sidebar — same player can fill multiple roles
  const assignedIds  = new Set(Object.values(assignments).flat());
  const filtered     = roster.filter(s => roleFilter === "All" || getRole(s) === roleFilter);
  const unassigned   = filtered; // show everyone always
  const assignedList = [];       // no separate assigned section needed

  // ── Karazhan-specific sidebar logic ─────────────────────────────────────────
  // Active night roster for the sidebar
  const karaActiveRoster = karaNight === "tue" ? rosterTue : rosterThu;
  const seenNames = new Set();
  const karaFiltered = karaActiveRoster.filter(s => {
    if (roleFilter !== "All" && getRole(s) !== roleFilter) return false;
    if (seenNames.has(s.name.toLowerCase())) return false;
    seenNames.add(s.name.toLowerCase());
    return true;
  });
  const karaKeys = new Set(KARA_ALL_ROWS.map(r => r.key));
  // IDs placed into any Kara slot
  const karaAssignedIds = new Set(
    Object.entries(assignments)
      .filter(([k]) => karaKeys.has(k))
      .flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
  );

  const handleCopyMRT = () => {
    const allRosters = [...rosterTue, ...rosterThu];
    const allTeams = [...KARA_TUE_TEAMS, ...KARA_THU_TEAMS];
    const rows = [];
    for (let slot = 0; slot < 10; slot++) {
      const rowNames = allTeams.map(team => {
        const row = team[slot];
        if (!row) return "-";
        const ids = assignments[row.key];
        if (!ids) return "-";
        const id = Array.isArray(ids) ? ids[0] : ids;
        const player = allRosters.find(s => s.id === id);
        return player ? player.name : "-";
      });
      while (rowNames.length > 1 && rowNames[rowNames.length - 1] === "-") rowNames.pop();
      rows.push(rowNames.join(" "));
    }
    navigator.clipboard.writeText(rows.join("\n")).then(() => {
      setMrtCopied(true);
      setTimeout(() => setMrtCopied(false), 2000);
    });
  };

  const copyNightDiscord = (nightLabel, teams, setCopied) => {
    const allRosters = [...rosterTue, ...rosterThu];
    const lines = [];
    lines.push(`**${nightLabel}**`);
    lines.push("");
    teams.forEach((team, i) => {
      const g1Ids = team.g1.flatMap(r => viewAssignments[r.key] ? (Array.isArray(viewAssignments[r.key]) ? viewAssignments[r.key] : [viewAssignments[r.key]]) : []);
      const g2Ids = team.g2.flatMap(r => viewAssignments[r.key] ? (Array.isArray(viewAssignments[r.key]) ? viewAssignments[r.key] : [viewAssignments[r.key]]) : []);
      if (!g1Ids.length && !g2Ids.length) return;
      lines.push(`🏰 **Team ${i + 1}**`);
      if (g1Ids.length) { lines.push(`> **Group 1**`); g1Ids.forEach(id => { const p = allRosters.find(s => s.id === id); if (p) lines.push(`> • <@${p.id}>`); }); }
      if (g2Ids.length) { lines.push(`> **Group 2**`); g2Ids.forEach(id => { const p = allRosters.find(s => s.id === id); if (p) lines.push(`> • <@${p.id}>`); }); }
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyDiscord = () => {
    const allRosters = [...rosterTue, ...rosterThu];
    const lines = [];
    const raidInfo = [raidDate, raidLeader].filter(Boolean).join(" · ");
    lines.push(`📅 **Karazhan Raid${raidInfo ? " — " + raidInfo : ""}**`);
    lines.push("");

    [["📅 TUESDAY", KARA_TUE_TEAMS], ["📅 THURSDAY", KARA_THU_TEAMS]].forEach(([nightLabel, teams]) => {
      const nightHasAny = teams.some(team =>
        [...team.g1, ...team.g2].some(r => assignments[r.key])
      );
      if (!nightHasAny) return;
      lines.push(`**${nightLabel}**`);
      teams.forEach((team, i) => {
        const g1Ids = team.g1.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
        const g2Ids = team.g2.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
        if (!g1Ids.length && !g2Ids.length) return;
        lines.push(`🏰 **Team ${i + 1}**`);
        if (g1Ids.length) { lines.push(`> **Group 1**`); g1Ids.forEach(id => { const player = allRosters.find(s => s.id === id); if (player) lines.push(`> • <@${player.id}>`); }); }
        if (g2Ids.length) { lines.push(`> **Group 2**`); g2Ids.forEach(id => { const player = allRosters.find(s => s.id === id); if (player) lines.push(`> • <@${player.id}>`); }); }
        lines.push("");
      });
    });

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setDiscordCopied(true);
      setTimeout(() => setDiscordCopied(false), 2000);
    });
  };

  // Handler for conflict modal name input changes
  const handleConflictNameChange = (discordId, field, value) => {
    setPendingResolved(prev => ({
      ...prev,
      [discordId]: { ...(prev[discordId] || {}), [field]: value },
    }));
  };

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Conflict resolution modal ── */}
      {pendingConflicts.length > 0 && (
        <ConflictModal
          conflicts={pendingConflicts}
          resolved={pendingResolved}
          onChange={handleConflictNameChange}
          onConfirm={handleConflictConfirm}
        />
      )}

      {/* ── Top bar ── */}
      <div style={{
        background: "linear-gradient(180deg, #1a0a00 0%, #0a0608 100%)",
        borderBottom: "1px solid #3a1800",
        padding: "10px 20px", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0,
      }}>
        {/* Row 1: title + buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif" }}>
              ⚔ NEXT TOPIC MOVE ON — ADMIN
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              {RAID_TEAMS.map(t => (
                <button key={t.id} onClick={() => navigate(`/${t.id}/admin`)} style={{
                  fontSize: 9, padding: "2px 10px", cursor: "pointer",
                  border: "1px solid", borderRadius: 3, fontFamily: "'Cinzel', serif",
                  background: teamId === t.id ? "#1a1000" : "#0a0a0a",
                  borderColor: teamId === t.id ? "#c8a84b" : "#333",
                  color: teamId === t.id ? "#c8a84b" : "#555",
                  fontWeight: teamId === t.id ? 700 : 400,
                }}>{t.name}</button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <SaveStatus status={saveStatus} />
            <button onClick={() => setShowImport(v => !v)} style={btn("#1a0000", "#ef444488", "#ef4444")}>
              📂 {roster.length ? `Roster (${roster.length})` : "Import JSON"}
            </button>
            <button onClick={handleClearAll} style={btn("#100010", "#878800", "#8788EE")}>
              🗑 Clear All
            </button>
            <button onClick={handleSave} style={btn("#0a1a00", hasUnsaved ? "#4ade8088" : "#4ade8044", "#4ade80")}>
              {FIREBASE_OK ? `${hasUnsaved ? "● " : ""}☁️ Save & Publish` : "💾 Save"}
            </button>
            {FIREBASE_OK && (
              <button onClick={handleSaveSnapshot} disabled={snapshotStatus === "saving"} style={btn(
                "#0a0a1a",
                snapshotStatus === "saved" ? "#4ade8044" : "#a78bfa44",
                snapshotStatus === "saved" ? "#4ade80" : "#a78bfa"
              )}>
                {snapshotStatus === "saving" ? "📸 Saving…" : snapshotStatus === "saved" ? "✓ Snapshot Saved!" : "📸 Save Snapshot"}
              </button>
            )}
            <button onClick={() => navigate(`/${teamId}`)} style={btn("#001020", "#60a5fa44", "#60a5fa")}>
              👁 Public View →
            </button>
            {activeTab === "kara" && (
              <button onClick={handleCopyDiscord} style={btn("#000820", "#5865f244", discordCopied ? "#4ade80" : "#5865f2")}>
                {discordCopied ? "✓ Copied!" : "💬 Copy Discord"}
              </button>
            )}
            {activeTab === "kara" && (
              <button onClick={handleCopyMRT} style={btn("#001a10", "#22c55e44", mrtCopied ? "#4ade80" : "#22c55e")}>
                {mrtCopied ? "✓ Copied!" : "⚔ Export MRT"}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: week slider — aligned under the right-side buttons */}
        {FIREBASE_OK && snapshots.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", width: "fit-content", minWidth: 320 }}>
            <button
              onClick={() => {
                const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1;
                const nextIdx = idx + 1;
                setViewingSnap(nextIdx < snapshots.length ? snapshots[nextIdx].id : null);
              }}
              disabled={viewingSnap === snapshots[snapshots.length - 1]?.id}
              style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: viewingSnap === snapshots[snapshots.length - 1]?.id ? 0.3 : 1 }}
            >‹</button>
            <div style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>
              {viewSnap ? (
                <span style={{ fontSize: 10, color: viewSnap.locked ? "#a78bfa" : "#c8a84b", fontFamily: "'Cinzel', serif" }}>
                  {viewSnap.locked ? "🔒" : "📸"} {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}
                  {viewSnap.raidLeader ? ` · ${viewSnap.raidLeader}` : ""}
                  {viewSnap.locked && <span style={{ color: "#555", marginLeft: 6, fontSize: 9 }}>LOCKED</span>}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>⚡ Current Week (Live)</span>
              )}
            </div>
            <button
              onClick={() => {
                const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1;
                setViewingSnap(idx > 0 ? snapshots[idx - 1].id : null);
              }}
              disabled={!viewingSnap}
              style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: !viewingSnap ? 0.3 : 1 }}
            >›</button>
            {viewingSnap && (
              <button
                onClick={async () => {
                  if (!window.confirm("Delete this snapshot? This cannot be undone.")) return;
                  try {
                    await deleteSnapshot(teamId, viewingSnap);
                    setSnapshots(prev => prev.filter(s => s.id !== viewingSnap));
                    setViewingSnap(null);
                  } catch (e) { alert("Delete failed: " + e.message); }
                }}
                title="Delete this snapshot"
                style={{ background: "none", border: "1px solid #3a1a1a", borderRadius: 4, color: "#ef444488", padding: "1px 7px", cursor: "pointer", fontSize: 12, lineHeight: 1.4 }}
              >🗑</button>
            )}
          </div>
        )}
      </div>

      {/* ── Import panel ── */}
      {showImport && (
        <div style={{
          background: "#0c0c1a", borderBottom: "1px solid #1a1a3a",
          padding: "14px 20px", display: "flex", gap: 16, alignItems: "flex-start",
        }}>
          {/* Tuesday */}
          <div style={{ flex: 1 }}>
            <div style={{ color: "#4ade80", fontSize: 10, marginBottom: 5, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>
              📅 TUESDAY RAID JSON
            </div>
            <textarea
              key="tue-import"
              placeholder='Paste Tuesday JSON…'
              onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim(), "tue"); }}
              style={{
                width: "100%", height: 75, background: "#080810",
                border: `1px solid ${jsonErrorTue ? "#ef4444" : "#1a3a1a"}`,
                borderRadius: 6, color: "#aaa", padding: 8,
                fontFamily: "monospace", fontSize: 10, resize: "vertical",
              }}
            />
            {jsonErrorTue && <div style={{ color: "#ef4444", fontSize: 10, marginTop: 3 }}>⚠ {jsonErrorTue}</div>}
            {rosterTue.length > 0 && !jsonErrorTue && (
              <div style={{ color: "#4ade80", fontSize: 10, marginTop: 3 }}>✓ {rosterTue.length} Tuesday players</div>
            )}
            <button onClick={() => fileRefTue.current.click()} style={{ ...btn("#0a1a0a", "#4ade8033", "#4ade80"), marginTop: 5, fontSize: 10, padding: "3px 10px" }}>
              📁 Upload Tuesday .json
            </button>
            <input ref={fileRefTue} type="file" accept=".json" onChange={e => handleFile(e, "tue")} style={{ display: "none" }} />
          </div>

          {/* Thursday */}
          <div style={{ flex: 1 }}>
            <div style={{ color: "#60a5fa", fontSize: 10, marginBottom: 5, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>
              📅 THURSDAY RAID JSON
            </div>
            <textarea
              key="thu-import"
              placeholder='Paste Thursday JSON…'
              onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim(), "thu"); }}
              style={{
                width: "100%", height: 75, background: "#080810",
                border: `1px solid ${jsonErrorThu ? "#ef4444" : "#1a2a3a"}`,
                borderRadius: 6, color: "#aaa", padding: 8,
                fontFamily: "monospace", fontSize: 10, resize: "vertical",
              }}
            />
            {jsonErrorThu && <div style={{ color: "#ef4444", fontSize: 10, marginTop: 3 }}>⚠ {jsonErrorThu}</div>}
            {rosterThu.length > 0 && !jsonErrorThu && (
              <div style={{ color: "#60a5fa", fontSize: 10, marginTop: 3 }}>✓ {rosterThu.length} Thursday players</div>
            )}
            <button onClick={() => fileRefThu.current.click()} style={{ ...btn("#0a101a", "#60a5fa33", "#60a5fa"), marginTop: 5, fontSize: 10, padding: "3px 10px" }}>
              📁 Upload Thursday .json
            </button>
            <input ref={fileRefThu} type="file" accept=".json" onChange={e => handleFile(e, "thu")} style={{ display: "none" }} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 22 }}>
            <div style={{ color: "#555", fontSize: 9, fontFamily: "'Cinzel', serif", textAlign: "center" }}>
              {roster.length > 0 ? `${roster.length} total` : ""}
            </div>
            <button onClick={() => { setRoster([]); setRosterTue([]); setRosterThu([]); setAssignments({}); setDividers([]); setJsonErrorTue(""); setJsonErrorThu(""); }} style={btn("#1a0808", "#ef444433", "#ef4444")}>
              🗑 Clear
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {roster.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "#4a4a6a" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚔</div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13 }}>Import your roster JSON to get started</div>
            <button onClick={() => setShowImport(true)} style={{ ...btn("#1a0800", "#c8a84b44", "#c8a84b"), marginTop: 16, padding: "10px 24px" }}>
              📂 Import Roster
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

          {/* ── Roster sidebar ── */}
          <div style={{
            width: 220, background: "#080810", borderRight: "1px solid #1a1a2a",
            display: "flex", flexDirection: "column", flexShrink: 0,
            height: "100%", overflow: "hidden",
            zIndex: 10,
          }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a2a", fontSize: 9, color: "#9999bb", letterSpacing: "0.15em" }}>
              {activeTab === "kara"
                ? `KARA ROSTER · ${karaNight === "tue" ? rosterTue.length : rosterThu.length} PLAYERS`
                : `ROSTER · ${roster.length} PLAYERS`}
              {activeTab === "kara" && <span style={{ color: "#9b72cf", marginLeft: 6 }}>· KARA MODE</span>}
            </div>
            {/* Night toggle for Kara */}
            {activeTab === "kara" && (
              <div style={{ display: "flex", borderBottom: "1px solid #1a1a2a" }}>
                {[["tue", "📅 Tuesday"], ["thu", "📅 Thursday"]].map(([night, label]) => (
                  <button key={night} onClick={() => setKaraNight(night)} style={{
                    flex: 1, padding: "5px 4px", fontSize: 9, cursor: "pointer",
                    border: "none", fontFamily: "'Cinzel', serif",
                    background: karaNight === night ? "#1a0a2a" : "#080810",
                    color: karaNight === night ? "#9b72cf" : "#555",
                    borderBottom: karaNight === night ? "2px solid #9b72cf" : "2px solid transparent",
                    transition: "all 0.15s",
                  }}>{label}</button>
                ))}
              </div>
            )}
            {/* Role filter */}
            <div style={{ display: "flex", gap: 3, padding: "6px 8px", borderBottom: "1px solid #1a1a2a" }}>
              {["All","Tank","Healer","DPS"].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} style={{
                  flex: 1, padding: "3px 0", fontSize: 8, cursor: "pointer",
                  border: "1px solid", borderRadius: 3, fontFamily: "'Cinzel', serif",
                  background: roleFilter === r ? (r==="Tank"?"#1d4ed8":r==="Healer"?"#15803d":r==="DPS"?"#b91c1c":"#1a1a3a") : "#0d0d1a",
                  borderColor: roleFilter === r ? "#fff3" : "#1a1a2a",
                  color: roleFilter === r ? "#fff" : "#888",
                }}>{r}</button>
              ))}
            </div>
            {/* Player list */}
            <div style={{ padding: "5px 8px", fontSize: 8, color: activeTab === "kara" ? "#9b72cf" : "#4ade80", letterSpacing: "0.1em", borderBottom: "1px solid #1a1a2a" }}>
              {activeTab === "kara"
                ? `UNIQUE PLAYERS (${karaFiltered.length}) · ${karaAssignedIds.size} PLACED`
                : `ALL PLAYERS (${filtered.length})`}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
              {activeTab === "kara"
                ? (() => {
                    // Split into unplaced (top) and placed (bottom, greyed)
                    const unplaced = karaFiltered.filter(s => !karaAssignedIds.has(s.id));
                    const placed   = karaFiltered.filter(s =>  karaAssignedIds.has(s.id));
                    const sorted   = [...unplaced, ...placed];
                    const items = [];
                    sorted.forEach((s) => {
                      const isPlaced = karaAssignedIds.has(s.id);
                      items.push(
                        <div key={s.id} style={{ position: "relative", opacity: isPlaced ? 0.35 : 1, transition: "opacity 0.2s" }}
                          title={isPlaced ? `${s.name} is already in a Kara team` : undefined}>
                          <KaraPlayerBadge slot={s}
                            onSpecCycle={isPlaced ? null : handleSpecCycle}
                            onDragStart={isPlaced ? null : (e, slot) => handleDragStart(e, slot, null)} />
                          {isPlaced && (
                            <span style={{
                              position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                              fontSize: 9, color: "#9b72cf", fontFamily: "'Cinzel', serif", pointerEvents: "none",
                            }}>✓</span>
                          )}
                        </div>
                      );
                    });
                    // Divider between unplaced and placed
                    if (unplaced.length > 0 && placed.length > 0) {
                      items.splice(unplaced.length, 0,
                        <div key="placed-divider" style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 2px" }}>
                          <div style={{ flex: 1, height: 1, background: "#9b72cf22" }} />
                          <span style={{ fontSize: 7, color: "#9b72cf55", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em", whiteSpace: "nowrap" }}>PLACED</span>
                          <div style={{ flex: 1, height: 1, background: "#9b72cf22" }} />
                        </div>
                      );
                    }
                    return items;
                  })()
                : (() => {
                    const items = [];
                    const shownDividers = new Set();
                    unassigned.forEach(s => {
                      dividers.forEach(d => {
                        if (!shownDividers.has(d.name) && s.groupNumber >= d.position) {
                          shownDividers.add(d.name);
                          items.push(
                            <div key={`divider-${d.name}`} style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 2px" }}>
                              <div style={{ flex: 1, height: 1, background: "#ff444455" }} />
                              <span style={{ fontSize: 8, color: "#ff7755", fontFamily: "'Cinzel', serif", letterSpacing: "0.2em", whiteSpace: "nowrap" }}>— {d.name} —</span>
                              <div style={{ flex: 1, height: 1, background: "#ff444455" }} />
                            </div>
                          );
                        }
                      });
                      items.push(<RosterToken key={s.id} slot={s} onDragStart={handleDragStart} compact={false}
                        parseScore={getScoreForPlayer(wclScores, s, activeTab)}
                        parseColor={getScoreColor(getScoreForPlayer(wclScores, s, activeTab))} />);
                    });
                    return items;
                  })()
              }
            </div>
            {activeTab === "kara"
              ? (
                <div style={{ padding: "0 8px 8px" }}>
                  <ManualAddPlayer onAdd={p => {
                    const newPlayer = { ...p, id: `${karaNight}_${Date.now()}` };
                    if (karaNight === "tue") setRosterTue(r => [...r, newPlayer]);
                    else setRosterThu(r => [...r, newPlayer]);
                  }} />
                </div>
              )
              : <div style={{ padding: "0 8px 8px" }}><ManualAddPlayer onAdd={handleAddManual} /></div>
            }

            {/* ── WCL Parses Panel ── */}
            <div style={{ borderTop: "1px solid #1a1a2a", flexShrink: 0 }}>
              <button onClick={() => setParsesOpen(o => !o)} style={{
                width: "100%", background: "none", border: "none", cursor: "pointer",
                padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 9, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
                  📊 PARSE SCORES
                  {wclLoading && <span style={{ color: "#888", marginLeft: 6 }}>loading…</span>}
                  {wclError   && <span style={{ color: "#ef4444", marginLeft: 6 }}>error</span>}
                </span>
                <span style={{ fontSize: 9, color: "#555" }}>{parsesOpen ? "▲" : "▼"}</span>
              </button>

              {parsesOpen && (() => {
                // Build sortable rows — one per real player, with all 3 scores
                const players = roster.filter(p => !p.isDivider && p.name);
                const rows = players.map(p => {
                  const lookupName = p.wclName?.trim() || p.name;
                  return {
                    ...p,
                    kara:      wclScores[lookupName]?.kara      ?? null,
                    gruulMags: wclScores[lookupName]?.gruulMags ?? null,
                  };
                });

                // Sort by the context-aware tab score, then by name
                const sortScore = r => getScoreForPlayer(wclScores, r, activeTab) ?? -1;
                rows.sort((a, b) => sortScore(b) - sortScore(a));

                return (
                  <div style={{ padding: "0 8px 8px" }}>
                    {/* Refresh button + last updated */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif" }}>
                        {wclLastFetch ? `Updated ${wclLastFetch.toLocaleTimeString()}` : "Not yet fetched"}
                      </span>
                      <button onClick={wclRefetch} disabled={wclLoading} style={{
                        background: "none", border: "1px solid #333", borderRadius: 3,
                        color: "#888", fontSize: 8, cursor: "pointer", padding: "2px 6px",
                        fontFamily: "'Cinzel', serif",
                      }}>↺ Refresh</button>
                    </div>
                    {/* Column headers */}
                    <div style={{ display: "flex", alignItems: "center", padding: "2px 4px", marginBottom: 2 }}>
                      <span style={{ flex: 1, fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>PLAYER</span>
                      <span style={{ width: 32, fontSize: 8, color: "#9b72cf", textAlign: "center", fontFamily: "'Cinzel', serif" }}>KARA</span>
                      <span style={{ width: 36, fontSize: 8, color: "#c8a84b", textAlign: "center", fontFamily: "'Cinzel', serif" }}>G/M</span>
                    </div>
                    {/* Player rows */}
                    {rows.map(p => {
                      const karaColor = getScoreColor(p.kara);
                      const gmColor   = getScoreColor(p.gruulMags);
                      const pColor    = getColor(p);
                      return (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center",
                          padding: "3px 4px", borderBottom: "1px solid #ffffff06",
                        }}>
                          <span style={{ flex: 1, fontSize: 11, color: pColor, fontFamily: "'Cinzel', serif",
                            overflow: "hidden", minWidth: 0 }}>
                            <AdminWclNameEditor
                              player={p}
                              onChange={wclName => handleWclNameChange(p.id, wclName)}
                            />
                          </span>
                          <span style={{ width: 32, textAlign: "center", fontSize: 11, fontWeight: 700,
                            fontFamily: "monospace", color: karaColor || "#444" }}>
                            {p.kara != null ? Math.round(p.kara) : "—"}
                          </span>
                          <span style={{ width: 36, textAlign: "center", fontSize: 11, fontWeight: 700,
                            fontFamily: "monospace", color: gmColor || "#444" }}>
                            {p.gruulMags != null ? Math.round(p.gruulMags) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* ── History Panel ── */}
            {FIREBASE_OK && (
              <div style={{ borderTop: "1px solid #1a1a2a", flexShrink: 0 }}>
                <button onClick={handleToggleHistory} style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 9, color: "#a78bfa", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
                    📜 RAID HISTORY
                    {historyLoading && <span style={{ color: "#888", marginLeft: 6 }}>loading…</span>}
                  </span>
                  <span style={{ fontSize: 9, color: "#555" }}>{historyOpen ? "▲" : "▼"}</span>
                </button>

                {historyOpen && (() => {
                  // Group snapshots by raidDate (or formatted savedAt)
                  const grouped = {};
                  snapshots.forEach(snap => {
                    const key = snap.raidDate || new Date(snap.savedAt).toLocaleDateString();
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(snap);
                  });
                  const duplicateDates = Object.keys(grouped).filter(k => grouped[k].length > 1);
                  const hasDuplicates  = duplicateDates.length > 0;

                  return (
                  <div style={{ padding: "0 8px 8px", maxHeight: 480, overflowY: "auto" }}>
                    {snapshots.length === 0 && !historyLoading && (
                      <div style={{ fontSize: 9, color: "#444", fontFamily: "'Cinzel', serif", padding: "8px 4px" }}>
                        No snapshots yet. Use 📸 Save Snapshot after a raid.
                      </div>
                    )}

                    {/* ── Duplicate cleanup banner ── */}
                    {hasDuplicates && (
                      <div style={{ marginBottom: 8, padding: "6px 8px", background: "#1a0a00", border: "1px solid #ef444433", borderRadius: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: deleteMode ? 6 : 0 }}>
                          <span style={{ fontSize: 9, color: "#ef9944", fontFamily: "'Cinzel', serif" }}>
                            ⚠ {duplicateDates.length} date{duplicateDates.length > 1 ? "s" : ""} with duplicates
                          </span>
                          <button
                            onClick={() => { setDeleteMode(v => !v); setDeleteSelected(new Set()); }}
                            style={{
                              background: deleteMode ? "#200808" : "#0a0a1a", border: `1px solid ${deleteMode ? "#ef444466" : "#55555566"}`,
                              borderRadius: 3, color: deleteMode ? "#ef4444" : "#888", fontSize: 8,
                              padding: "2px 7px", cursor: "pointer", fontFamily: "'Cinzel', serif",
                            }}
                          >{deleteMode ? "✗ Cancel" : "🗑 Clean Up"}</button>
                        </div>

                        {deleteMode && (
                          <div>
                            <div style={{ fontSize: 8, color: "#888", fontFamily: "'Cinzel', serif", marginBottom: 4 }}>
                              Select snapshots to delete — keep at least one per date:
                            </div>
                            {duplicateDates.map(date => (
                              <div key={date} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 8, color: "#ef9944", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", marginBottom: 3 }}>
                                  📅 {date} ({grouped[date].length} entries)
                                </div>
                                {grouped[date].map((snap, i) => {
                                  const isChecked = deleteSelected.has(snap.id);
                                  const savedTime = new Date(snap.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                  return (
                                    <div key={snap.id} onClick={() => {
                                      setDeleteSelected(prev => {
                                        const next = new Set(prev);
                                        if (next.has(snap.id)) next.delete(snap.id);
                                        else next.add(snap.id);
                                        return next;
                                      });
                                    }} style={{
                                      display: "flex", alignItems: "center", gap: 5,
                                      padding: "3px 5px", marginBottom: 2, cursor: "pointer", borderRadius: 3,
                                      background: isChecked ? "#2a0808" : "#0d0d1a",
                                      border: `1px solid ${isChecked ? "#ef444466" : "#1a1a2a"}`,
                                    }}>
                                      <span style={{ fontSize: 11, color: isChecked ? "#ef4444" : "#555", flexShrink: 0 }}>
                                        {isChecked ? "☑" : "☐"}
                                      </span>
                                      <span style={{ flex: 1, fontSize: 9, color: isChecked ? "#ef4444" : "#888", fontFamily: "'Cinzel', serif" }}>
                                        {snap.locked ? "🔒" : "📸"} {savedTime}
                                        {snap.wclReportUrl && <span style={{ color: "#60a5fa55", marginLeft: 4 }}>WCL</span>}
                                        {snap.sheetUrl    && <span style={{ color: "#4ade8055", marginLeft: 3 }}>RPB</span>}
                                      </span>
                                      {i === 0 && <span style={{ fontSize: 7, color: "#4ade8077", fontFamily: "'Cinzel', serif" }}>oldest</span>}
                                      {i === grouped[date].length - 1 && <span style={{ fontSize: 7, color: "#a78bfa77", fontFamily: "'Cinzel', serif" }}>newest</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                            {deleteSelected.size > 0 && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Permanently delete ${deleteSelected.size} snapshot${deleteSelected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
                                  try {
                                    const { deleteSnapshot } = await import("./firebase");
                                    for (const id of deleteSelected) {
                                      await deleteSnapshot(teamId, id);
                                    }
                                    setSnapshots(prev => prev.filter(s => !deleteSelected.has(s.id)));
                                    if (deleteSelected.has(viewingSnap)) setViewingSnap(null);
                                    setDeleteSelected(new Set());
                                    setDeleteMode(false);
                                  } catch (e) {
                                    console.error("Delete failed", e);
                                    alert("Delete failed — check console for details.");
                                  }
                                }}
                                style={{
                                  width: "100%", marginTop: 4, padding: "4px",
                                  background: "#200808", border: "1px solid #ef444466",
                                  borderRadius: 4, color: "#ef4444", cursor: "pointer",
                                  fontFamily: "'Cinzel', serif", fontSize: 9,
                                }}
                              >
                                🗑 Delete {deleteSelected.size} selected snapshot{deleteSelected.size > 1 ? "s" : ""}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Normal history list */}
                    {!deleteMode && snapshots.map(snap => {
                      const isExpanded = expandedSnap === snap.id;
                      const snapRoster = snap.roster ?? [];
                      const currentNames = new Set(roster.filter(p => !p.isDivider && p.name).map(p => p.name.toLowerCase()));
                      const snapNames    = new Set(snapRoster.filter(p => !p.isDivider && p.name).map(p => p.name.toLowerCase()));
                      const newPlayers     = roster.filter(p => !p.isDivider && p.name && !snapNames.has(p.name.toLowerCase()));
                      const missingPlayers = snapRoster.filter(p => !p.isDivider && p.name && !currentNames.has(p.name.toLowerCase()));
                      const label = snap.raidDate
                        ? `${snap.raidDate}${snap.raidLeader ? ` · ${snap.raidLeader}` : ""}`
                        : new Date(snap.savedAt).toLocaleDateString();
                      const isDupe = grouped[snap.raidDate || new Date(snap.savedAt).toLocaleDateString()]?.length > 1;

                      return (
                        <div key={snap.id} style={{ marginBottom: 6, border: `1px solid ${isDupe ? "#ef444422" : "#1a1a2a"}`, borderRadius: 4, overflow: "hidden" }}>
                          <button onClick={() => setExpandedSnap(isExpanded ? null : snap.id)} style={{
                            width: "100%", background: "#080810", border: "none", cursor: "pointer",
                            padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between",
                          }}>
                            <span style={{ fontSize: 10, color: isDupe ? "#ef9944" : "#c8a84b", fontFamily: "'Cinzel', serif" }}>
                              {isDupe && <span style={{ fontSize: 8, marginRight: 4 }}>⚠</span>}{label}
                            </span>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {newPlayers.length > 0     && <span style={{ fontSize: 8, color: "#4ade80" }}>+{newPlayers.length}</span>}
                              {missingPlayers.length > 0 && <span style={{ fontSize: 8, color: "#ef4444" }}>−{missingPlayers.length}</span>}
                              <span style={{ fontSize: 9, color: "#555" }}>{isExpanded ? "▲" : "▼"}</span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div style={{ background: "#06060f", padding: "6px 8px" }}>
                              {(newPlayers.length > 0 || missingPlayers.length > 0) ? (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", marginBottom: 4 }}>ROSTER CHANGES</div>
                                  {newPlayers.map(p => (
                                    <div key={p.id} style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif", padding: "1px 0" }}>
                                      + {p.name} <span style={{ color: "#555", fontSize: 9 }}>{p.specName}</span>
                                    </div>
                                  ))}
                                  {missingPlayers.map(p => (
                                    <div key={p.id} style={{ fontSize: 10, color: "#ef4444", fontFamily: "'Cinzel', serif", padding: "1px 0" }}>
                                      − {p.name} <span style={{ color: "#555", fontSize: 9 }}>{p.specName}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 9, color: "#4ade80", fontFamily: "'Cinzel', serif", marginBottom: 8 }}>✓ Same roster</div>
                              )}
                              <div style={{ fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", marginBottom: 4 }}>
                                SNAPSHOT ROSTER ({snapRoster.filter(p => !p.isDivider && p.name).length})
                              </div>
                              {snapRoster.filter(p => !p.isDivider && p.name).map(p => (
                                <div key={p.id} style={{ fontSize: 10, fontFamily: "'Cinzel', serif", padding: "1px 0",
                                  color: !currentNames.has(p.name.toLowerCase()) ? "#ef444488" : "#666" }}>
                                  {p.name} <span style={{ fontSize: 9, color: "#444" }}>{p.specName}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
            )}

          </div>

          {/* ── Assignment area ── */}
          <div style={{ flex: 1, padding: "14px 16px", minWidth: 0, overflowY: "auto", height: "100%" }}>
            {!FIREBASE_OK && <SetupBanner />}

            {/* ── WCL log submission (only on current week or unlocked snapshots) ── */}
            {FIREBASE_OK && !isLocked && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={wclSubmitUrl}
                    onChange={e => setWclSubmitUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleWclSubmit()}
                    placeholder="🔗 WarcraftLogs report URL (required to lock)…"
                    style={{ flex: 1, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 4, color: "#ccc", padding: "5px 10px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={sheetSubmitUrl}
                    onChange={e => setSheetSubmitUrl(e.target.value)}
                    placeholder="📊 Google Sheet URL (optional — RPB Analysis)…"
                    style={{ flex: 1, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 4, color: "#ccc", padding: "5px 10px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={combatLogSubmitUrl}
                    onChange={e => setCombatLogSubmitUrl(e.target.value)}
                    placeholder="⚔ Combat Log Analytics URL (optional)…"
                    style={{ flex: 1, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 4, color: "#ccc", padding: "5px 10px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }}
                  />
                  <button
                    onClick={handleWclSubmit}
                    disabled={!wclSubmitUrl.trim() || wclSubmitStatus === "saving"}
                    style={btn(
                      wclSubmitStatus === "saved" ? "#0a200a" : "#0a0a1a",
                      wclSubmitStatus === "saved" ? "#4ade8066" : "#a78bfa66",
                      wclSubmitStatus === "saved" ? "#4ade80" : "#a78bfa"
                    )}
                  >
                    {wclSubmitStatus === "saving" ? "Locking…" : wclSubmitStatus === "saved" ? "✓ Locked!" : "🔒 Submit & Lock"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Locked banner ── */}
            {isLocked && viewSnap && (
              <div style={{ marginBottom: 12, padding: "10px 12px", background: "#0a0820", border: "1px solid #a78bfa44", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: viewSnap.sheetUrl ? 0 : 8 }}>
                  <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: "'Cinzel', serif" }}>
                    🔒 This week is locked
                  </span>
                  {viewSnap.wclReportUrl && (
                    <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>
                      📋 WarcraftLogs →
                    </a>
                  )}
                  {viewSnap.sheetUrl && (
                    <a href={viewSnap.sheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>
                      📊 RPB Sheet →
                    </a>
                  )}
                  {viewSnap.combatLogUrl && (
                    <a href={viewSnap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#f59e0b", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>
                      ⚔ Combat Log →
                    </a>
                  )}
                </div>
                {/* RPB Sheet URL edit */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <input
                    value={sheetEditUrl}
                    onChange={e => setSheetEditUrl(e.target.value)}
                    placeholder={viewSnap.sheetUrl ? "📊 Update RPB Sheet URL…" : "📊 Paste RPB Sheet URL…"}
                    style={{ flex: 1, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 4, color: "#ccc", padding: "4px 10px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      const raw = sheetEditUrl.trim();
                      if (!raw) return;
                      if (!raw.includes("docs.google.com/spreadsheets")) {
                        alert("Please paste a Google Sheets URL (should contain docs.google.com/spreadsheets)");
                        return;
                      }
                      const sheetUrl = raw.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview");
                      setSheetEditStatus("saving");
                      try {
                        await updateSnapshot(teamId, viewSnap.id, { sheetUrl });
                        setSnapshots(prev => prev.map(s => s.id === viewSnap.id ? { ...s, sheetUrl } : s));
                        setSheetEditUrl("");
                        setSheetEditStatus("saved");
                        setTimeout(() => setSheetEditStatus("idle"), 3000);
                      } catch (e) {
                        console.error("Sheet URL save failed", e);
                        setSheetEditStatus("idle");
                      }
                    }}
                    disabled={!sheetEditUrl.trim() || sheetEditStatus === "saving"}
                    style={btn(
                      sheetEditStatus === "saved" ? "#0a200a" : "#0a1a10",
                      sheetEditStatus === "saved" ? "#4ade8066" : "#4ade8033",
                      sheetEditStatus === "saved" ? "#4ade80" : "#4ade80"
                    )}
                  >
                    {sheetEditStatus === "saving" ? "Saving…" : sheetEditStatus === "saved" ? "✓ Saved!" : "💾 Save RPB"}
                  </button>
                </div>
                {/* Combat Log URL edit */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <input
                    value={combatLogEditUrl}
                    onChange={e => setCombatLogEditUrl(e.target.value)}
                    placeholder={viewSnap.combatLogUrl ? "⚔ Update Combat Log Analytics URL…" : "⚔ Paste Combat Log Analytics URL…"}
                    style={{ flex: 1, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 4, color: "#ccc", padding: "4px 10px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      const raw = combatLogEditUrl.trim();
                      if (!raw) return;
                      if (!raw.includes("docs.google.com/spreadsheets")) {
                        alert("Please paste a Google Sheets URL (should contain docs.google.com/spreadsheets)");
                        return;
                      }
                      const combatLogUrl = raw.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview");
                      setCombatLogEditStatus("saving");
                      try {
                        await updateSnapshot(teamId, viewSnap.id, { combatLogUrl });
                        setSnapshots(prev => prev.map(s => s.id === viewSnap.id ? { ...s, combatLogUrl } : s));
                        setCombatLogEditUrl("");
                        setCombatLogEditStatus("saved");
                        setTimeout(() => setCombatLogEditStatus("idle"), 3000);
                      } catch (e) {
                        console.error("Combat log URL save failed", e);
                        setCombatLogEditStatus("idle");
                      }
                    }}
                    disabled={!combatLogEditUrl.trim() || combatLogEditStatus === "saving"}
                    style={btn(
                      combatLogEditStatus === "saved" ? "#1a0a00" : "#100800",
                      combatLogEditStatus === "saved" ? "#f59e0b66" : "#f59e0b33",
                      combatLogEditStatus === "saved" ? "#f59e0b" : "#f59e0b"
                    )}
                  >
                    {combatLogEditStatus === "saving" ? "Saving…" : combatLogEditStatus === "saved" ? "✓ Saved!" : "💾 Save Combat Log"}
                  </button>
                </div>
              </div>
            )}

            {/* ── General Raid Assignments — hidden on Kara tab ── */}
            {activeTab !== "kara" && (
            <div style={{
              marginBottom: 12, display: "flex", gap: 0,
              background: "#0a0a12", border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden",
            }}>
              {/* Warlock Curses */}
              <div style={{ flex: 1, borderRight: "1px solid #1e1e3a" }}>
                <div style={{ padding: "6px 12px", borderBottom: "1px solid #1e1e3a", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#8788EE", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", fontWeight: 700 }}>🟣 WARLOCK CURSES</span>
                </div>
                {GENERAL_CURSES.map(row => (
                  <AssignmentRow key={row.key} rowCfg={row}
                    assignedIds={viewAssignments[row.key]}
                    textValues={viewTextInputs}
                    roster={viewRoster}
                    onDrop={isLocked ? null : handleDrop}
                    onClear={isLocked ? null : handleClear}
                    onTextChange={isLocked ? null : handleTextChange}
                    onDragStart={isLocked ? null : handleDragStart}
                    assignments={viewAssignments}
                    compact />
                ))}
              </div>
              {/* Trash Interrupts */}
              <div style={{ flex: 1 }}>
                <div style={{ padding: "6px 12px", borderBottom: "1px solid #1e1e3a", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", fontWeight: 700 }}>⚡ TRASH INTERRUPTS</span>
                </div>
                {GENERAL_INTERRUPTS.map(row => (
                  <AssignmentRow key={row.key} rowCfg={row}
                    assignedIds={viewAssignments[row.key]}
                    textValues={viewTextInputs}
                    roster={viewRoster}
                    onDrop={isLocked ? null : handleDrop}
                    onClear={isLocked ? null : handleClear}
                    onTextChange={isLocked ? null : handleTextChange}
                    onDragStart={isLocked ? null : handleDragStart}
                    assignments={viewAssignments}
                    compact />
                ))}
              </div>
            </div>
            )}

            <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={viewRaidDate} raidLeader={viewRaidLeader} />

            {activeTab === "gruul" && <>
              <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
              <div style={{ display: "flex", gap: 12 }}>
                <AdminPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar}
                  rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster}
                  onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={isLocked ? null : handleTextChange} onDragStart={isLocked ? null : handleDragStart} />
                <AdminPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul}
                  rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster}
                  onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={isLocked ? null : handleTextChange} onDragStart={isLocked ? null : handleDragStart} />
              </div>
            </>}

            {activeTab === "kara" && (
              <AdminKaraSection
                rosterTue={rosterTue}
                rosterThu={rosterThu}
                viewAssignments={viewAssignments}
                isLocked={isLocked}
                handleDrop={handleDrop}
                handleClear={handleClear}
                handleDragStart={handleDragStart}
                handleSpecCycle={handleSpecCycle}
                discordCopiedTue={discordCopiedTue}
                discordCopiedThu={discordCopiedThu}
                setDiscordCopiedTue={setDiscordCopiedTue}
                setDiscordCopiedThu={setDiscordCopiedThu}
                copyNightDiscord={copyNightDiscord}
              />
            )}

            {activeTab === "mags" && <>
              <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
              <div style={{ display: "flex", gap: 12 }}>
                <AdminPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags}
                  rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster}
                  onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={isLocked ? null : handleTextChange} onDragStart={isLocked ? null : handleDragStart} />
                <AdminPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags}
                  rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster}
                  onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={isLocked ? null : handleTextChange} onDragStart={isLocked ? null : handleDragStart} />
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

const inputSty = {
  background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 4,
  color: "#c8a84b", padding: "5px 10px", fontSize: 11,
  fontFamily: "'Cinzel', serif", outline: "none",
};

function btn(bg, border, color) {
  return {
    background: bg, border: `1px solid ${border}`, borderRadius: 5,
    color: color, padding: "5px 13px", cursor: "pointer",
    fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.04em",
  };
}

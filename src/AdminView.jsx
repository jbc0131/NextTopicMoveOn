import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, CLASS_COLORS, getRole, getClass, getColor, getSpecDisplay,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  KARA_TEAM_1, KARA_TEAM_2, KARA_TEAM_3,
  CUBE1_KEYS, CUBE2_KEYS, CUBEBU_KEYS, ALL_CUBE_KEYS,
  saveState, loadState,
} from "./constants";
import {
  FontImport, PlayerBadge, RoleHeader, BossPanel, RaidTabs, WarningBar,
} from "./components";
import { saveToFirebase, fetchFromFirebase, isFirebaseConfigured } from "./firebase";

const ADMIN_PASSWORD = "raidlead"; // ← change this!
const FIREBASE_OK = isFirebaseConfigured();

// ── Save status indicator ─────────────────────────────────────────────────────
function SaveStatus({ status }) {
  const map = {
    idle:    { color: "#2a2a3a", text: "" },
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
function RosterToken({ slot, onDragStart, compact }) {
  return <PlayerBadge slot={slot} compact={compact} draggable onDragStart={onDragStart} />;
}

// ── Cube conflict checker ─────────────────────────────────────────────────────
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
function AssignmentRow({ rowCfg, assignedIds, textValues, roster, onDrop, onClear, onTextChange, assignments, conflictError }) {
  const [over, setOver] = useState(false);
  const rc    = ROLE_COLORS[rowCfg.role];
  const ids   = assignedIds ? (Array.isArray(assignedIds) ? assignedIds : [assignedIds]) : [];
  const slots = ids.map(id => roster.find(s => s.id === id)).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); onDrop(rowCfg.key); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderRadius: 5, minHeight: 44,
          background: over ? `${rc.border}55` : rc.bg,
          border: `1px solid ${conflictError ? "#ef4444" : over ? rc.label : rc.border}`,
          transition: "all 0.12s",
        }}
      >
        {/* Label */}
        <span style={{ fontSize: 14, color: "#ffffff", fontFamily: "'Cinzel', serif", minWidth: 220, flexShrink: 0 }}>
          {rowCfg.label}
          {rowCfg.hint && (
            <span style={{ color: "#888", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>
          )}
        </span>

        {/* Player badges */}
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {slots.map(slot => {
            const color = getColor(slot);
            return (
              <div key={slot.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{
                  background: `${color}20`, border: `1px solid ${color}44`,
                  borderRadius: 4, padding: "2px 8px",
                  color: color, fontFamily: "'Cinzel', serif", fontSize: 14,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  {slot.name}
                  <span style={{ color: `${color}77`, fontSize: 11 }}>{getSpecDisplay(slot)} {getClass(slot)}</span>
                </span>
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
function AdminPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, onDrop, onClear, onTextChange }) {
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
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <AssignmentRow key={item.row.key} rowCfg={item.row}
              assignedIds={assignments[item.row.key]}
              textValues={textValues}
              roster={roster} onDrop={onDrop} onClear={onClear}
              onTextChange={onTextChange}
              assignments={assignments}
              conflictError={item.conflictError} />
      )}
    </BossPanel>
  );
}

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw]   = useState("");
  const [err, setErr] = useState(false);
  const attempt = () => pw === ADMIN_PASSWORD ? onUnlock() : setErr(true);
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
        <div style={{ color: "#333", fontSize: 10, letterSpacing: "0.15em", marginBottom: 24 }}>TBC RAID ASSIGNMENTS</div>
        <input
          type="password" value={pw} autoFocus
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Enter password"
          style={{
            width: "100%", background: "#080810",
            border: `1px solid ${err ? "#ef4444" : "#2a2a4a"}`,
            borderRadius: 6, color: "#c8a84b", padding: "10px 14px",
            fontFamily: "'Cinzel', serif", fontSize: 13, textAlign: "center",
            outline: "none", marginBottom: 12,
          }}
        />
        {err && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8 }}>Incorrect password</div>}
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
export default function AdminView() {
  const [unlocked,    setUnlocked]    = useState(false);
  const [roster,      setRoster]      = useState([]);
  const [assignments,  setAssignments]  = useState({});
  const [textInputs,   setTextInputs]   = useState({});
  const [raidDate,    setRaidDate]    = useState("");
  const [raidLeader,  setRaidLeader]  = useState("");
  const [activeTab,   setActiveTab]   = useState("gruul");
  const [dragSlot,    setDragSlot]    = useState(null);
  const [roleFilter,  setRoleFilter]  = useState("All");
  const [showImport,  setShowImport]  = useState(false);
  const [jsonError,   setJsonError]   = useState("");
  const [saveStatus,  setSaveStatus]  = useState(FIREBASE_OK ? "idle" : "offline");
  const fileRef  = useRef();
  const navigate = useNavigate();

  // ── Load initial state ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      let s = null;
      if (FIREBASE_OK) {
        try { s = await fetchFromFirebase(); } catch (e) { console.warn("Firebase fetch failed", e); }
      }
      // Fall back to localStorage
      if (!s) s = loadState();
      if (s) {
        if (s.roster)      setRoster(s.roster);
        if (s.assignments) setAssignments(s.assignments);
        if (s.raidDate)    setRaidDate(s.raidDate);
        if (s.raidLeader)  setRaidLeader(s.raidLeader);
        if (s.textInputs)  setTextInputs(s.textInputs);
      }
    }
    load();
  }, []);

  // ── Save handler ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const state = { roster, assignments, textInputs, raidDate, raidLeader };
    // Always save locally as a backup
    saveState(state);

    if (!FIREBASE_OK) {
      setSaveStatus("offline");
      return;
    }

    setSaveStatus("saving");
    try {
      await saveToFirebase(state);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      console.error("Firebase save failed", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }, [roster, assignments, raidDate, raidLeader]);

  // ── JSON import ─────────────────────────────────────────────────────────────
  const handleImportJSON = text => {
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

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleImportJSON(ev.target.result.trim());
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDragStart = (e, slot) => { setDragSlot(slot); e.dataTransfer.effectAllowed = "move"; };
  const handleDrop = key => {
    if (!dragSlot) return;
    const playerId = dragSlot.id;
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      if (existing.includes(playerId)) return prev; // already on this exact slot

      // Cube group conflict: a player can only be in ONE cube group (1, 2, or Backup)
      const targetGroup = getCubeGroupOfKey(key);
      if (targetGroup !== null) {
        const playerCurrentGroup = getCubeGroupOf(playerId, prev);
        if (playerCurrentGroup !== null && playerCurrentGroup !== targetGroup) {
          const groupNames = { 1: "Cube Clicker 1", 2: "Cube Clicker 2", 3: "Backup Cube Clickers" };
          alert(`${dragSlot.name} is already in "${groupNames[playerCurrentGroup]}" and cannot also be in "${groupNames[targetGroup]}".`);
          return prev;
        }
      }
      return { ...prev, [key]: [...existing, playerId] };
    });
    setDragSlot(null);
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  // All players always visible in sidebar — same player can fill multiple roles
  const assignedIds  = new Set(Object.values(assignments));
  const filtered     = roster.filter(s => roleFilter === "All" || getRole(s) === roleFilter);
  const unassigned   = filtered; // show everyone always
  const assignedList = [];       // no separate assigned section needed

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Top bar ── */}
      <div style={{
        background: "linear-gradient(180deg, #1a0a00 0%, #0a0608 100%)",
        borderBottom: "1px solid #3a1800",
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif" }}>
            ⚔ NEXT TOPIC MOVE ON — ADMIN
          </div>
          <div style={{ fontSize: 9, color: "#3a2000", letterSpacing: "0.2em" }}>GRUUL'S LAIR  ·  MAGTHERIDON'S LAIR</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginLeft: 16, alignItems: "center" }}>
          <input value={raidDate}   onChange={e => setRaidDate(e.target.value)}   placeholder="📅 Raid Date"   style={inputSty} />
          <input value={raidLeader} onChange={e => setRaidLeader(e.target.value)} placeholder="👑 Raid Leader" style={inputSty} />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <SaveStatus status={saveStatus} />
          <button onClick={() => setShowImport(v => !v)} style={btn("#1a0000", "#ef444488", "#ef4444")}>
            📂 {roster.length ? `Roster (${roster.length})` : "Import JSON"}
          </button>
          <button onClick={handleClearAll} style={btn("#100010", "#878800", "#8788EE")}>
            🗑 Clear All
          </button>
          <button onClick={handleSave} style={btn("#0a1a00", "#4ade8044", "#4ade80")}>
            {FIREBASE_OK ? "☁️ Save & Publish" : "💾 Save"}
          </button>
          <button onClick={() => navigate("/")} style={btn("#001020", "#60a5fa44", "#60a5fa")}>
            👁 Public View →
          </button>
        </div>
      </div>

      {/* ── Import panel ── */}
      {showImport && (
        <div style={{
          background: "#0c0c1a", borderBottom: "1px solid #1a1a3a",
          padding: "14px 20px", display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#c8a84b", fontSize: 11, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>
              Paste or upload your roster JSON export:
            </div>
            <textarea
              placeholder='{"slots":[...], "groups":[...], ...}'
              onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim()); }}
              style={{
                width: "100%", height: 80, background: "#080810",
                border: `1px solid ${jsonError ? "#ef4444" : "#2a2a4a"}`,
                borderRadius: 6, color: "#aaa", padding: 10,
                fontFamily: "monospace", fontSize: 11, resize: "vertical",
              }}
            />
            {jsonError && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>⚠ {jsonError}</div>}
            {roster.length > 0 && !jsonError && (
              <div style={{ color: "#4ade80", fontSize: 11, marginTop: 4 }}>✓ {roster.length} players loaded</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => fileRef.current.click()} style={btn("#111a2a", "#60a5fa44", "#60a5fa")}>
              📁 Upload .json
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: "none" }} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {roster.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "#2a2a4a" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚔</div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13 }}>Import your roster JSON to get started</div>
            <button onClick={() => setShowImport(true)} style={{ ...btn("#1a0800", "#c8a84b44", "#c8a84b"), marginTop: 16, padding: "10px 24px" }}>
              📂 Import Roster
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "auto", position: "relative" }}>

          {/* ── Roster sidebar ── */}
          <div style={{
            width: 280, background: "#080810", borderRight: "1px solid #1a1a2a",
            display: "flex", flexDirection: "column", flexShrink: 0,
            position: "sticky", left: 0, top: 0,
            height: "calc(100vh - 52px)", overflowY: "hidden",
            zIndex: 10,
          }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a2a", fontSize: 9, color: "#3a3a5a", letterSpacing: "0.15em" }}>
              ROSTER · {roster.length} PLAYERS
            </div>
            {/* Role filter */}
            <div style={{ display: "flex", gap: 3, padding: "6px 8px", borderBottom: "1px solid #1a1a2a" }}>
              {["All","Tank","Healer","DPS"].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} style={{
                  flex: 1, padding: "3px 0", fontSize: 8, cursor: "pointer",
                  border: "1px solid", borderRadius: 3, fontFamily: "'Cinzel', serif",
                  background: roleFilter === r ? (r==="Tank"?"#1d4ed8":r==="Healer"?"#15803d":r==="DPS"?"#b91c1c":"#1a1a3a") : "#0d0d1a",
                  borderColor: roleFilter === r ? "#fff3" : "#1a1a2a",
                  color: roleFilter === r ? "#fff" : "#444",
                }}>{r}</button>
              ))}
            </div>
            {/* Unassigned */}
            <div style={{ padding: "5px 8px", fontSize: 8, color: "#4ade80", letterSpacing: "0.1em", borderBottom: "1px solid #1a1a2a" }}>
              ALL PLAYERS ({filtered.length})
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {unassigned.map(s => <RosterToken key={s.id} slot={s} onDragStart={handleDragStart} />)}
            </div>
            <div style={{ padding: "0 8px 8px" }}><ManualAddPlayer onAdd={handleAddManual} /></div>

          </div>

          {/* ── Assignment area ── */}
          <div style={{ flex: 1, padding: "14px 16px", minWidth: 0 }}>
            {!FIREBASE_OK && <SetupBanner />}
            <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={raidDate} raidLeader={raidLeader} />

            {activeTab === "gruul" && <>
              <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
              <div style={{ display: "flex", gap: 12 }}>
                <AdminPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar}
                  rows={GRUUL_MAULGAR} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
                <AdminPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul}
                  rows={GRUUL_BOSS} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
              </div>
            </>}

            {activeTab === "kara" && <>
              <div style={{ display: "flex", gap: 12 }}>
                <AdminPanel title="KARAZHAN — TEAM 1" icon="🏰" subtitle="10-Man Roster" bossImage="kara"
                  rows={KARA_TEAM_1} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
                <AdminPanel title="KARAZHAN — TEAM 2" icon="🏰" subtitle="10-Man Roster" bossImage="kara"
                  rows={KARA_TEAM_2} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
                <AdminPanel title="KARAZHAN — TEAM 3" icon="🏰" subtitle="10-Man Roster" bossImage="kara"
                  rows={KARA_TEAM_3} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
              </div>
            </>}

              <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
              <div style={{ display: "flex", gap: 12 }}>
                <AdminPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags}
                  rows={MAGS_P1} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
                <AdminPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags}
                  rows={MAGS_P2} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={handleTextChange} />
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

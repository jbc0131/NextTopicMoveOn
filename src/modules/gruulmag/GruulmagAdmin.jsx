import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle, layout,
} from "../../shared/theme";
import {
  getRole, getClass, getColor, getSpecDisplay, CLASS_COLORS, ROLE_COLORS, CLASS_SPECS,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS, CUBE_TEAMS,
  GENERAL_CURSES, GENERAL_INTERRUPTS, CUBE1_KEYS, CUBE2_KEYS, CUBE3_KEYS, CUBE4_KEYS, CUBEBU_KEYS,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, BossPanel, RoleHeader, PlayerBadge, MarkerIcon,
  EmptyState, ConfirmDialog, toast, SaveStatus,
} from "../../shared/components";
import {
  saveTwentyFiveState, fetchTwentyFiveState, isFirebaseConfigured,
} from "../../shared/firebase";
import { saveState, loadState } from "../../shared/constants";

const FIREBASE_OK = isFirebaseConfigured();

// ── Cube group helpers ────────────────────────────────────────────────────────
function getCubeGroupOf(playerId, assignments) {
  for (const [k, ids] of Object.entries(assignments)) {
    const idArr = Array.isArray(ids) ? ids : [ids];
    if (!idArr.includes(playerId)) continue;
    if (CUBE1_KEYS.includes(k))  return 1;
    if (CUBE2_KEYS.includes(k))  return 2;
    if (CUBE3_KEYS.includes(k))  return 3;
    if (CUBE4_KEYS.includes(k))  return 4;
    if (CUBEBU_KEYS.includes(k)) return 5;
  }
  return null;
}
function getCubeGroupOfKey(key) {
  if (CUBE1_KEYS.includes(key))  return 1;
  if (CUBE2_KEYS.includes(key))  return 2;
  if (CUBE3_KEYS.includes(key))  return 3;
  if (CUBE4_KEYS.includes(key))  return 4;
  if (CUBEBU_KEYS.includes(key)) return 5;
  return null;
}

// ── Assignment row ────────────────────────────────────────────────────────────
function AssignmentRow({ rowCfg, assignedIds, textValues, roster, onDrop, onClear, onTextChange, onDragStart, assignments, compact }) {
  const [over, setOver] = useState(false);
  const dropRef = useRef(null);
  const rc    = ROLE_COLORS[rowCfg.role];
  const ids   = assignedIds ? (Array.isArray(assignedIds) ? assignedIds : [assignedIds]) : [];
  const slots = ids.map(id => roster.find(s => s.id === id)).filter(Boolean);

  let conflictError = null;
  const thisGroup = getCubeGroupOfKey(rowCfg.key);
  if (thisGroup !== null) {
    const groupNames = { 1: "Cube Team 1", 2: "Cube Team 2", 3: "Cube Team 3", 4: "Cube Team 4" };
    for (const id of ids) {
      const otherGroup = getCubeGroupOf(id, { ...assignments, [rowCfg.key]: ids.filter(x => x !== id) });
      if (otherGroup !== null && otherGroup !== thisGroup) {
        const player = roster.find(s => s.id === id);
        conflictError = `${player?.name || "Player"} is also in ${groupNames[otherGroup]}!`;
        break;
      }
    }
  }

  return (
    <div>
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={e => { if (!dropRef.current?.contains(e.relatedTarget)) setOver(false); }}
        onDrop={e => { e.preventDefault(); setOver(false); if (onDrop) onDrop(rowCfg.key); }}
        style={{
          display: "flex", alignItems: "center", gap: compact ? space[2] : space[3],
          padding: compact ? `${space[1]}px ${space[3]}px` : `${space[1]}px ${space[3]}px`,
          minHeight: layout.rowHeight,
          background: over ? `${accent.blue}12` : "transparent",
          borderLeft: `2px solid ${conflictError ? intent.danger : over ? accent.blue : border.subtle}`,
          borderBottom: `1px solid ${border.subtle}`,
          transition: "all 0.1s",
        }}
      >
        {(rowCfg.label || rowCfg.markerKey) && (
          <span style={{ fontSize: compact ? fontSize.xs : fontSize.sm, color: text.secondary, fontFamily: font.sans, width: 180, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: space[1] }}>
            {rowCfg.markerKey && <MarkerIcon markerKey={rowCfg.markerKey} size={compact ? 13 : 15} />}
            {rowCfg.label}
          </span>
        )}
        {/* Cube Clicker rows — two-column grid when multiple players assigned */}
        {rowCfg.cubeGroup != null && slots.length > 1 ? (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[1] }}>
            {slots.map(slot => {
              const color = getColor(slot);
              return (
                <div key={slot.id}>
                  <span
                    draggable={!!onDragStart}
                    onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(e, slot, rowCfg.key); } : undefined}
                    onDoubleClick={() => onClear && onClear(rowCfg.key, slot.id)}
                    style={{
                      background: `${color}18`, border: `1px solid ${color}44`, borderRadius: radius.sm,
                      padding: "2px 8px", color, fontFamily: font.sans, fontSize: fontSize.sm,
                      display: "inline-flex", alignItems: "center", gap: space[1],
                      cursor: onDragStart ? "grab" : "default", userSelect: "none", flex: 1,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {slot.name}
                    <span style={{ color: `${color}77`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)}</span>
                  </span>
                </div>
              );
            })}
            {over && <span style={{ fontSize: fontSize.xs, color: accent.blue, fontStyle: "italic" }}>drop here</span>}
          </div>
        ) : (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: space[1], alignItems: "center" }}>
          {slots.map(slot => {
            const color = getColor(slot);
            return (
              <div key={slot.id}>
                <span
                  draggable={!!onDragStart}
                  onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(e, slot, rowCfg.key); } : undefined}
                  onDoubleClick={() => onClear && onClear(rowCfg.key, slot.id)}
                  style={{
                    background: `${color}18`, border: `1px solid ${color}44`, borderRadius: radius.sm,
                    padding: "2px 8px", color, fontFamily: font.sans, fontSize: fontSize.sm,
                    display: "inline-flex", alignItems: "center", gap: space[1],
                    cursor: onDragStart ? "grab" : "default", userSelect: "none",
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  {slot.name}
                  <span style={{ color: `${color}77`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)}</span>
                </span>
              </div>
            );
          })}
          {over && <span style={{ fontSize: fontSize.xs, color: accent.blue, fontStyle: "italic" }}>drop here</span>}
        </div>
        )}
        {rowCfg.textInput && (
          <input
            value={textValues?.[rowCfg.key] || ""}
            onChange={e => onTextChange && onTextChange(rowCfg.key, e.target.value)}
            placeholder="Notes…"
            style={{ ...inputStyle, width: 160, fontSize: fontSize.xs }}
          />
        )}
      </div>
      {conflictError && <div style={{ fontSize: 9, color: intent.danger, paddingLeft: space[3], fontFamily: font.sans }}>⚠ {conflictError}</div>}
    </div>
  );
}

// ── Assignment panel ──────────────────────────────────────────────────────────
function AssignmentPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, onDrop, onClear, onTextChange, onDragStart }) {
  const items = [];
  let lastSectionKey = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) { items.push({ type: "header", role: r.role, label: r.roleLabel || null }); lastSectionKey = sectionKey; }
    items.push({ type: "row", row: r });
  });
  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <AssignmentRow key={item.row.key} rowCfg={item.row} assignedIds={assignments[item.row.key]}
              textValues={textValues} roster={roster}
              onDrop={onDrop} onClear={onClear} onTextChange={onTextChange} onDragStart={onDragStart}
              assignments={assignments} />
      )}
    </BossPanel>
  );
}

// ── Manual add player ─────────────────────────────────────────────────────────
function ManualAddPlayer({ onAdd, roster }) {
  const [open,       setOpen]       = useState(false);
  const [name,       setName]       = useState("");
  const [cls,        setCls]        = useState("Warrior");
  const [spec,       setSpec]       = useState("Arms");
  const [linkId,     setLinkId]     = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkFocus,  setLinkFocus]  = useState(false);
  const [error,      setError]      = useState("");
  const linkRef = useRef(null);

  const specs = CLASS_SPECS[cls] || [];
  const handleClass = c => { setCls(c); setSpec(CLASS_SPECS[c][0].specName); };

  // Deduplicated roster for the link dropdown
  const linkOptions = useMemo(() => {
    const seen = new Set();
    return (roster || []).filter(p => {
      if (p.manual) return false;
      const key = p._discordId || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [roster]);

  const filteredOptions = useMemo(() => {
    if (!linkSearch.trim()) return linkOptions;
    const q = linkSearch.toLowerCase();
    return linkOptions.filter(p => p.name.toLowerCase().includes(q));
  }, [linkOptions, linkSearch]);

  const selectedPlayer = linkId ? linkOptions.find(p => (p._discordId || p.id) === linkId) : null;

  const handleSelectLink = (p) => {
    setLinkId(p._discordId || p.id);
    setLinkSearch(p.name);
    setLinkFocus(false);
  };

  const handleClearLink = () => {
    setLinkId(""); setLinkSearch(""); linkRef.current?.focus();
  };

  const handleAdd = () => {
    if (!name.trim()) { setError("Enter a name"); return; }
    const player = {
      id:        `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name:      name.trim(),
      className: cls,
      specName:  spec,
      color:     CLASS_COLORS[cls] || "#aaa",
      manual:    true,
    };
    if (linkId) player._discordId = linkId;
    onAdd(player);
    setName(""); setCls("Warrior"); setSpec("Arms"); setLinkId(""); setLinkSearch(""); setError(""); setOpen(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      width: "100%", background: "transparent",
      border: `1px dashed ${border.subtle}`, borderRadius: radius.base,
      color: text.muted, padding: `${space[1]}px`, cursor: "pointer",
      fontFamily: font.sans, fontSize: fontSize.xs, marginTop: space[1],
    }}>
      + Add Player Manually
    </button>
  );

  const color = CLASS_COLORS[cls] || "#aaa";
  return (
    <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[2], marginTop: space[1], display: "flex", flexDirection: "column", gap: space[1] }}>
      <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Add Player</div>
      <input
        autoFocus value={name}
        onChange={e => { setName(e.target.value); setError(""); }}
        onKeyDown={e => e.key === "Enter" && handleAdd()}
        placeholder="Character name"
        style={{ ...inputStyle, width: "100%", fontSize: fontSize.xs }}
      />
      {error && <div style={{ fontSize: 10, color: intent.danger, fontFamily: font.sans }}>{error}</div>}
      <select value={cls} onChange={e => handleClass(e.target.value)} style={{ ...inputStyle, color, fontSize: fontSize.xs, cursor: "pointer" }}>
        {Object.keys(CLASS_SPECS).map(c => (
          <option key={c} value={c} style={{ color: CLASS_COLORS[c] || "#fff", background: surface.base }}>{c}</option>
        ))}
      </select>
      <select value={spec} onChange={e => setSpec(e.target.value)} style={{ ...inputStyle, fontSize: fontSize.xs, cursor: "pointer" }}>
        {specs.map(s => (
          <option key={s.specName} value={s.specName} style={{ background: surface.base }}>
            {s.specName.replace(/\d+$/, "")} ({s.role})
          </option>
        ))}
      </select>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <input
            ref={linkRef}
            value={linkSearch}
            onChange={e => { setLinkSearch(e.target.value); setLinkId(""); }}
            onFocus={() => setLinkFocus(true)}
            onBlur={() => setTimeout(() => setLinkFocus(false), 150)}
            placeholder="Link to Discord (optional)"
            style={{ ...inputStyle, width: "100%", fontSize: fontSize.xs, color: selectedPlayer ? accent.blue : text.primary }}
          />
          {(linkId || linkSearch) && (
            <button onClick={handleClearLink} style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }} title="Clear">×</button>
          )}
        </div>
        {selectedPlayer && (
          <div style={{ fontSize: 9, color: accent.blue, fontFamily: font.sans, marginTop: 2 }}>
            Linked to {selectedPlayer.name}
          </div>
        )}
        {linkFocus && !linkId && filteredOptions.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.sm,
            maxHeight: 120, overflowY: "auto", marginTop: 2,
          }}>
            {filteredOptions.map(p => (
              <div
                key={p._discordId || p.id}
                onMouseDown={() => handleSelectLink(p)}
                style={{
                  padding: `3px ${space[2]}px`, cursor: "pointer", fontSize: fontSize.xs,
                  fontFamily: font.sans, color: CLASS_COLORS[getClass(p)] || text.primary,
                  background: "transparent",
                }}
                onMouseEnter={e => e.currentTarget.style.background = surface.overlay}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: space[1] }}>
        <button onClick={handleAdd} style={{ ...btnStyle("success"), flex: 1, fontSize: fontSize.xs, height: 26 }}>Add</button>
        <button onClick={() => { setOpen(false); setError(""); setName(""); setLinkId(""); setLinkSearch(""); }} style={{ ...btnStyle("default"), flex: 1, fontSize: fontSize.xs, height: 26 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Roster sidebar ────────────────────────────────────────────────────────────
function GruulmagRosterPanel({ roster, assignments, roleFilter, setRoleFilter, onDragStart, onAddManual, onRemove }) {
  const nightRoster = roster;
  const filtered    = nightRoster.filter(s => roleFilter === "All" || getRole(s) === roleFilter);

  return (
    <div style={{ width: layout.rosterWidth, flexShrink: 0, background: surface.panel, borderRight: `1px solid ${border.subtle}`, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.xs, color: text.muted, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Roster · {filtered.length}
      </div>
      <div style={{ display: "flex", gap: 2, padding: space[2], borderBottom: `1px solid ${border.subtle}` }}>
        {["All","Tank","Healer","DPS"].map(r => {
          const rc = r === "Tank" ? ROLE_COLORS.Tank : r === "Healer" ? ROLE_COLORS.Healer : r === "DPS" ? ROLE_COLORS.DPS : null;
          return (
            <button key={r} onClick={() => setRoleFilter(r)} style={{ flex: 1, padding: "2px 0", fontSize: 9, cursor: "pointer", border: "1px solid", borderRadius: radius.sm, fontFamily: font.sans, background: roleFilter === r ? (rc?.tag || surface.overlay) : surface.base, borderColor: roleFilter === r ? `${text.muted}66` : border.subtle, color: roleFilter === r ? text.primary : text.muted }}>{r}</button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: space[2], display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlayerBadge slot={s} onDragStart={onDragStart} draggable />
            </div>
            <button
              onClick={() => onRemove(s.id)}
              title={`Remove ${s.name}`}
              style={{
                background: "none", border: "none", color: text.muted,
                cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px",
                flexShrink: 0, opacity: 0.5, transition: "opacity 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
            >×</button>
          </div>
        ))}
        <ManualAddPlayer onAdd={onAddManual} roster={roster} />
      </div>
    </div>
  );
}

// ── Cube Teams 2x2 Grid ──────────────────────────────────────────────────────
function CubeTeamsGrid({ assignments, roster, onDrop, onClear, onDragStart }) {
  return (
    <div style={{
      border: `2px solid ${accent.blue}`, borderRadius: radius.lg,
      padding: space[3], marginBottom: space[3], background: `${accent.blue}06`,
    }}>
      <div style={{
        textAlign: "center", marginBottom: space[3],
        fontSize: fontSize.base, fontFamily: font.sans, fontWeight: fontWeight.bold,
        color: accent.blue, letterSpacing: "0.05em",
      }}>
        CUBE CLICKERS — THE CORE OF WINNING
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[3],
      }}>
      {CUBE_TEAMS.map(team => {
        const teamPlayers = team.rows
          .flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : [])
          .map(id => roster.find(s => s.id === id)).filter(Boolean);
        return (
          <div key={team.cubeGroup} style={{
            background: surface.panel, border: `1px solid ${border.subtle}`,
            borderRadius: radius.lg, overflow: "hidden",
          }}>
            <div style={{
              padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}`,
              display: "flex", alignItems: "center", gap: space[2], background: `${accent.blue}08`,
            }}>
              <span style={{ fontSize: fontSize.sm, color: accent.blue, fontFamily: font.sans, fontWeight: fontWeight.bold }}>
                {team.label}
              </span>
              <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, marginLeft: "auto" }}>
                {teamPlayers.length}/5
              </span>
            </div>
            {team.rows.map(row => (
              <AssignmentRow
                key={row.key} rowCfg={row} assignedIds={assignments[row.key]}
                textValues={{}} roster={roster}
                onDrop={onDrop} onClear={onClear} onTextChange={null} onDragStart={onDragStart}
                assignments={assignments} compact
              />
            ))}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Main GruulmagAdmin ────────────────────────────────────────────────────────
export default function GruulmagAdmin({ teamId }) {
  const night = teamId === "team-balls" ? "thu" : "tue";
  const [roster,       setRoster]       = useState([]);
  const [assignments,  setAssignments]  = useState({});
  const [textInputs,   setTextInputs]   = useState({});
  const [dividers,     setDividers]     = useState([]);
  const [raidDate,     setRaidDate]     = useState("");
  const [raidLeader,   setRaidLeader]   = useState("");
  const [activeTab,    setActiveTab]    = useState("mags");
  const [dragSlot,     setDragSlot]     = useState(null);
  const [dragSourceKey, setDragSourceKey] = useState(null);
  const [roleFilter,   setRoleFilter]   = useState("All");
  const [showImport,   setShowImport]   = useState(false);
  const [jsonError,    setJsonError]    = useState("");
  const [saveStatus,   setSaveStatus]   = useState(FIREBASE_OK ? "idle" : "offline");
  const [hasUnsaved,   setHasUnsaved]   = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const autoSaveTimer = useRef(null);
  const fileRef       = useRef();

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadNight = useCallback(async (n) => {
    let s = null;
    if (FIREBASE_OK) {
      try { s = await fetchTwentyFiveState(teamId, n); } catch (e) { console.warn(e); }
    }
    if (!s) s = loadState(teamId, `25man-${n}`);
    if (s) {
      setRoster(s.roster || []);
      setAssignments(s.assignments || {});
      setTextInputs(s.textInputs || {});
      setDividers(s.dividers || []);
      setRaidDate(s.raidDate || "");
      setRaidLeader(s.raidLeader || "");
    } else {
      setRoster([]); setAssignments({}); setTextInputs({}); setDividers([]); setRaidDate(""); setRaidLeader("");
    }
  }, [teamId]);

  useEffect(() => {
    loadNight(night);
    document.title = `NTMO T4 Admin – ${teamId === "team-dick" ? "Tuesday" : "Thursday"}`;
  }, [teamId, night, loadNight]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    setHasUnsaved(true);
    if (!FIREBASE_OK) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const state = { roster, assignments, textInputs, dividers, raidDate, raidLeader };
      saveState(state, teamId, `25man-${night}`);
      try {
        setSaveStatus("saving");
        await saveTwentyFiveState(state, teamId, night);
        setSaveStatus("saved"); setHasUnsaved(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    }, 4000);
  }, [roster, assignments, textInputs, raidDate, raidLeader]);

  const handleSave = useCallback(async () => {
    const state = { roster, assignments, textInputs, dividers, raidDate, raidLeader };
    saveState(state, teamId, `25man-${night}`);
    if (!FIREBASE_OK) { setSaveStatus("offline"); return; }
    setSaveStatus("saving");
    try {
      await saveTwentyFiveState(state, teamId, night);
      setSaveStatus("saved"); setHasUnsaved(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 4000); }
  }, [roster, assignments, textInputs, dividers, raidDate, raidLeader, teamId, night]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportJSON = useCallback((text) => {
    try {
      const data = JSON.parse(text);
      if (!data.slots) throw new Error("No 'slots' array found");
      const existingOverrides = {};
      roster.forEach(p => { if (p.wclName) existingOverrides[p.name.toLowerCase()] = p.wclName; });
      const mergedSlots = data.slots.map(slot => {
        const override = existingOverrides[slot.name?.toLowerCase()];
        return override ? { ...slot, wclName: override } : slot;
      });
      setRoster(mergedSlots);
      setDividers(data.dividers || []);
      setAssignments(prev => {
        const validIds = new Set(mergedSlots.map(p => p.id));
        const next = {};
        for (const [key, ids] of Object.entries(prev)) {
          const arr  = Array.isArray(ids) ? ids : [ids];
          const kept = arr.filter(id => validIds.has(id));
          if (kept.length) next[key] = kept.length === 1 ? kept[0] : kept;
        }
        return next;
      });
      setJsonError("");
      setShowImport(false);
    } catch (e) { setJsonError(e.message); }
  }, [roster]);

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, slot, sourceKey = null) => {
    setDragSlot(slot); setDragSourceKey(sourceKey);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback((key) => {
    if (!dragSlot) return;
    const playerId = dragSlot.id;
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      if (existing.includes(playerId) && dragSourceKey === key) return prev;
      const targetGroup = getCubeGroupOfKey(key);
      if (targetGroup !== null) {
        const playerCurrentGroup = getCubeGroupOf(playerId, prev);
        if (playerCurrentGroup !== null && playerCurrentGroup !== targetGroup) {
          const groupNames = { 1: "Cube Team 1", 2: "Cube Team 2", 3: "Cube Team 3", 4: "Cube Team 4" };
          toast({ message: `${dragSlot.name} is already in "${groupNames[playerCurrentGroup]}"`, type: "danger" });
          return prev;
        }
      }
      let next = { ...prev };
      if (dragSourceKey && dragSourceKey !== key) {
        const srcExisting = next[dragSourceKey] ? (Array.isArray(next[dragSourceKey]) ? next[dragSourceKey] : [next[dragSourceKey]]) : [];
        const srcUpdated  = srcExisting.filter(id => id !== playerId);
        if (srcUpdated.length === 0) delete next[dragSourceKey]; else next[dragSourceKey] = srcUpdated;
      }
      if (!existing.includes(playerId)) next[key] = [...existing, playerId];
      return next;
    });
    setDragSlot(null); setDragSourceKey(null);
  }, [dragSlot, dragSourceKey]);

  const handleClear = useCallback((key, playerId) => {
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      const updated  = existing.filter(id => id !== playerId);
      const n = { ...prev };
      if (updated.length === 0) delete n[key]; else n[key] = updated;
      return n;
    });
  }, []);

  const handleRemoveFromRoster = useCallback((playerId) => {
    setRoster(prev => prev.filter(p => p.id !== playerId));
    setAssignments(prev => {
      const next = {};
      for (const [key, ids] of Object.entries(prev)) {
        const arr = Array.isArray(ids) ? ids : [ids];
        const kept = arr.filter(id => id !== playerId);
        if (kept.length) next[key] = kept.length === 1 ? kept[0] : kept;
      }
      return next;
    });
  }, []);

  const nightColor = night === "tue" ? intent.success : accent.blue;
  const nightLabel = night === "tue" ? "Tuesday" : "Thursday";

  return (
    <AppShell teamId={teamId} adminMode>
      <ConfirmDialog open={confirmClearOpen} title="Clear All Assignments" message="This will remove all T4 (Gruul/Mag) assignments for this night. Cannot be undone." confirmLabel="Clear All" dangerous onConfirm={() => { setAssignments({}); setTextInputs({}); setConfirmClearOpen(false); }} onCancel={() => setConfirmClearOpen(false)} />

      <ModuleHeader
        icon="⚔"
        title="T4 — Gruul's Lair + Magtheridon Admin"
        breadcrumb={`${teamId === "team-dick" ? "Team Dick" : "Team Balls"} / T4`}
        actions={<>
          <SaveStatus status={saveStatus} />
          <button onClick={() => setShowImport(v => !v)} style={btnStyle("default")}>📂 {roster.length ? `Roster (${roster.length})` : "Import JSON"}</button>
          <button onClick={() => setConfirmClearOpen(true)} style={btnStyle("danger")}>🗑 Clear</button>
          <button onClick={handleSave} style={btnStyle(hasUnsaved ? "warning" : "success")}>{FIREBASE_OK ? `${hasUnsaved ? "● " : ""}☁ Save` : "💾 Save"}</button>
        </>}
      />

      {/* Import panel */}
      {showImport && (
        <div style={{ padding: space[3], background: surface.panel, borderBottom: `1px solid ${border.subtle}` }}>
          <div style={{ fontSize: fontSize.xs, color: nightColor, fontWeight: fontWeight.medium, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[1] }}>
            📅 {nightLabel} Raid JSON
          </div>
          <textarea
            placeholder={`Paste ${nightLabel} JSON…`}
            onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim()); }}
            style={{ ...inputStyle, width: "100%", height: 80, resize: "vertical", fontFamily: font.mono, fontSize: fontSize.xs, padding: space[2], borderColor: jsonError ? intent.danger : border.subtle }}
          />
          {jsonError && <div style={{ fontSize: fontSize.xs, color: intent.danger, marginTop: 2 }}>⚠ {jsonError}</div>}
          {roster.length > 0 && !jsonError && <div style={{ fontSize: fontSize.xs, color: intent.success, marginTop: 2 }}>✓ {roster.length} players</div>}
          <div style={{ display: "flex", gap: space[2], marginTop: space[2] }}>
            <button onClick={() => fileRef.current.click()} style={btnStyle("default")}>📁 Upload .json</button>
            <input ref={fileRef} type="file" accept=".json" onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => handleImportJSON(ev.target.result.trim()); r.readAsText(f); e.target.value = ""; }} style={{ display: "none" }} />
          </div>
        </div>
      )}

      {/* Raid date / leader inputs */}
      <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[3], alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
          <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Raid Date</span>
          <input value={raidDate} onChange={e => setRaidDate(e.target.value)} placeholder="e.g. 3-18-26" style={{ ...inputStyle, width: 100, fontSize: fontSize.xs }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
          <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Raid Leader</span>
          <input value={raidLeader} onChange={e => setRaidLeader(e.target.value)} placeholder="Name" style={{ ...inputStyle, width: 120, fontSize: fontSize.xs }} />
        </div>
      </div>

      {/* Main content */}
      {roster.length === 0 ? (
        <EmptyState icon="⚔" title={`No ${nightLabel} roster`} message={`Import the ${nightLabel} JSON to get started`} action="Import JSON" onAction={() => setShowImport(true)} />
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <GruulmagRosterPanel
            roster={roster}
            assignments={assignments}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            onDragStart={handleDragStart}
            onAddManual={slot => setRoster(prev => [...prev, slot])}
            onRemove={handleRemoveFromRoster}
          />

          <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
            {/* Tab bar — segmented control style */}
            <div style={{
              display: "flex", marginBottom: space[3],
              background: surface.panel, border: `1px solid ${border.subtle}`,
              borderRadius: radius.base, padding: 3, gap: 2, width: "fit-content",
            }}>
              {[["mags","Magtheridon"], ["gruul","Gruul's Lair"]].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: `${space[1]}px ${space[4]}px`, height: 30,
                  border: "none", borderRadius: radius.sm, cursor: "pointer",
                  fontFamily: font.sans, fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                  background: activeTab === tab ? surface.overlay : "transparent",
                  color: activeTab === tab ? text.primary : text.muted,
                  boxShadow: activeTab === tab ? `0 1px 3px rgba(0,0,0,0.3)` : "none",
                  transition: "all 0.15s",
                }}>{label}</button>
              ))}
            </div>

            {activeTab === "mags" && <>
              <CubeTeamsGrid assignments={assignments} roster={roster} onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} />
              <div style={{ marginBottom: space[3], display: "flex", gap: 0, background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
                <div style={{ flex: 1, borderRight: `1px solid ${border.subtle}` }}>
                  <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}><span style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Trash Interrupts</span></div>
                  {GENERAL_INTERRUPTS.map(row => <AssignmentRow key={row.key} rowCfg={row} assignedIds={assignments[row.key]} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} assignments={assignments} compact />)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}><span style={{ fontSize: fontSize.xs, color: "#8788EE", fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Warlock Curses</span></div>
                  {GENERAL_CURSES.map(row => <AssignmentRow key={row.key} rowCfg={row} assignedIds={assignments[row.key]} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} assignments={assignments} compact />)}
                </div>
              </div>
              <div style={{ display: "flex", gap: space[3] }}>
                <AssignmentPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags} rows={MAGS_P1} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={handleDragStart} />
                <AssignmentPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags} rows={MAGS_P2} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={handleDragStart} />
              </div>
            </>}

            {activeTab === "gruul" && <>
              <div style={{ display: "flex", gap: space[3] }}>
                <AssignmentPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar} rows={GRUUL_MAULGAR} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={handleDragStart} />
                <AssignmentPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul} rows={GRUUL_BOSS} assignments={assignments} textValues={textInputs} roster={roster} onDrop={handleDrop} onClear={handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={handleDragStart} />
              </div>
            </>}
          </div>
        </div>
      )}
    </AppShell>
  );
}

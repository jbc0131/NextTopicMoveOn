import { useState, useRef, useEffect, useCallback } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle, layout,
} from "../../shared/theme";
import {
  getRole, getClass, getColor, getSpecDisplay, CLASS_COLORS, ROLE_COLORS,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  GENERAL_CURSES, GENERAL_INTERRUPTS, CUBE1_KEYS, CUBE2_KEYS, CUBEBU_KEYS,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, BossPanel, RoleHeader, PlayerBadge, MarkerIcon,
  StatusChip, EmptyState, ConfirmDialog, WarningBar, toast, SaveStatus,
  ParseScoresPanel,
} from "../../shared/components";
import {
  saveTwentyFiveState, fetchTwentyFiveState, saveTwentyFiveSnapshot,
  fetchTwentyFiveSnapshots, updateTwentyFiveSnapshot, deleteTwentyFiveSnapshot,
  submitTwentyFiveWclLog, isFirebaseConfigured,
} from "../../shared/firebase";
import { useWarcraftLogs, getScoreForPlayer, getScoreColor } from "../../shared/useWarcraftLogs";
import { saveState, loadState } from "../../shared/constants";

const FIREBASE_OK = isFirebaseConfigured();

// ── Cube group helpers ────────────────────────────────────────────────────────
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
function getCubeGroupOfKey(key) {
  if (CUBE1_KEYS.includes(key))  return 1;
  if (CUBE2_KEYS.includes(key))  return 2;
  if (CUBEBU_KEYS.includes(key)) return 3;
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
    const groupNames = { 1: "Cube Clicker 1", 2: "Cube Clicker 2", 3: "Backup" };
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
                <div key={slot.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                  <span
                    draggable={!!onDragStart}
                    onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(e, slot, rowCfg.key); } : undefined}
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
                  <button onClick={() => onClear && onClear(rowCfg.key, slot.id)} style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }} title="Remove">×</button>
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
              <div key={slot.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <span
                  draggable={!!onDragStart}
                  onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(e, slot, rowCfg.key); } : undefined}
                  style={{
                    background: `${color}18`, border: `1px solid ${color}44`, borderRadius: radius.sm,
                    padding: "2px 8px", color, fontFamily: font.sans, fontSize: fontSize.sm,
                    display: "inline-flex", alignItems: "center", gap: space[1],
                    cursor: onDragStart ? "grab" : "default", userSelect: "none",
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  {slot.name}
                  <span style={{ color: `${color}77`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)} {getClass(slot)}</span>
                </span>
                <button onClick={() => onClear && onClear(rowCfg.key, slot.id)} style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }} title="Remove">×</button>
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

// ── Roster sidebar ────────────────────────────────────────────────────────────
function TwentyFiveRosterPanel({ roster, assignments, roleFilter, setRoleFilter, onDragStart, wclScores, wclLoading, wclError, wclLastFetch, onWclRefetch, onWclNameChange, activeTab }) {
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
          <PlayerBadge key={s.id} slot={s} onDragStart={onDragStart} draggable
            parseScore={getScoreForPlayer(wclScores, s, activeTab)}
            parseColor={getScoreColor(getScoreForPlayer(wclScores, s, activeTab))} />
        ))}
      </div>
    </div>
  );
}

// ── Main TwentyFiveAdmin ──────────────────────────────────────────────────────
export default function TwentyFiveAdmin({ teamId }) {
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
  const [snapshots,    setSnapshots]    = useState([]);
  const [viewingSnap,  setViewingSnap]  = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState("idle");
  const [wclSubmitUrl,   setWclSubmitUrl]   = useState("");
  const [sheetSubmitUrl, setSheetSubmitUrl] = useState("");
  const [combatLogUrl,   setCombatLogUrl]   = useState("");
  const [wclSubmitStatus, setWclSubmitStatus] = useState("idle");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const autoSaveTimer = useRef(null);
  const fileRef       = useRef();

  const { scores: wclScores, loading: wclLoading, refetch: wclRefetch } =
    useWarcraftLogs(roster, { teamId, module: "25man" });

  const handleWclNameChange = useCallback((playerId, newName) => {
    setRoster(prev => prev.map(s => s.id !== playerId ? s : { ...s, wclName: newName }));
  }, []);

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
    setViewingSnap(null);
  }, [teamId]);

  useEffect(() => {
    loadNight(night);
    if (FIREBASE_OK) fetchTwentyFiveSnapshots(teamId).then(setSnapshots).catch(console.warn);
    document.title = `NTMO 25-Man Admin – ${teamId === "team-dick" ? "Tuesday" : "Thursday"}`;
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

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const handleSaveSnapshot = useCallback(async () => {
    if (!FIREBASE_OK) { toast({ message: "Firebase required", type: "danger" }); return; }
    setSnapshotStatus("saving");
    try {
      await saveTwentyFiveSnapshot({ roster, assignments, textInputs, raidDate, raidLeader }, teamId, night);
      setSnapshotStatus("saved");
      const snaps = await fetchTwentyFiveSnapshots(teamId);
      setSnapshots(snaps);
      setTimeout(() => setSnapshotStatus("idle"), 3000);
    } catch (e) { setSnapshotStatus("error"); setTimeout(() => setSnapshotStatus("idle"), 4000); }
  }, [roster, assignments, textInputs, raidDate, raidLeader, teamId, night]);

  // ── WCL submit ────────────────────────────────────────────────────────────
  const handleWclSubmit = useCallback(async () => {
    const url = wclSubmitUrl.trim();
    if (!url) return;
    const match      = url.match(/reports\/([A-Za-z0-9]+)/);
    const reportCode = match ? match[1] : null;
    const finalUrl   = reportCode ? `https://fresh.warcraftlogs.com/reports/${reportCode}` : url;

    // Auto-fetch raid date
    if (reportCode) {
      try {
        const res = await fetch("/api/warcraftlogs-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fights", reportId: reportCode }) });
        if (res.ok) {
          const d = await res.json();
          if (d.start) { const dt = new Date(d.start); setRaidDate(`${dt.getMonth() + 1}-${dt.getDate()}-${String(dt.getFullYear()).slice(2)}`); }
        }
      } catch {}
    }

    const sheetUrlNorm    = sheetSubmitUrl.trim()  ? sheetSubmitUrl.trim().replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview") : null;
    const combatLogNorm   = combatLogUrl.trim()    ? combatLogUrl.trim().replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview")   : null;
    const extra = { wclReportUrl: finalUrl, locked: true, ...(sheetUrlNorm ? { sheetUrl: sheetUrlNorm } : {}), ...(combatLogNorm ? { combatLogUrl: combatLogNorm } : {}) };

    setWclSubmitStatus("saving");
    try {
      if (viewingSnap) {
        await submitTwentyFiveWclLog(teamId, viewingSnap, finalUrl);
        const updates = {};
        if (sheetUrlNorm)  updates.sheetUrl    = sheetUrlNorm;
        if (combatLogNorm) updates.combatLogUrl = combatLogNorm;
        if (Object.keys(updates).length) await updateTwentyFiveSnapshot(teamId, viewingSnap, updates);
        setSnapshots(prev => prev.map(s => s.id === viewingSnap ? { ...s, ...extra } : s));
      } else {
        await saveTwentyFiveSnapshot({ roster, assignments, textInputs, raidDate, raidLeader }, teamId, night, extra);
        const snaps = await fetchTwentyFiveSnapshots(teamId);
        setSnapshots(snaps);
      }
      setWclSubmitStatus("saved");
      setWclSubmitUrl(""); setSheetSubmitUrl(""); setCombatLogUrl("");
      setTimeout(() => setWclSubmitStatus("idle"), 3000);
    } catch (e) { setWclSubmitStatus("error"); setTimeout(() => setWclSubmitStatus("idle"), 4000); }
  }, [wclSubmitUrl, sheetSubmitUrl, combatLogUrl, viewingSnap, teamId, night, roster, assignments, textInputs, raidDate, raidLeader]);

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
          const groupNames = { 1: "Cube Clicker 1", 2: "Cube Clicker 2", 3: "Backup Cube Clickers" };
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const viewSnap        = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : assignments;
  const viewRoster      = viewSnap ? (viewSnap.roster ?? []) : roster;
  const viewTextInputs  = viewSnap ? (viewSnap.textInputs ?? {}) : textInputs;
  const nightRoster     = viewRoster;

  const nightColor = night === "tue" ? intent.success : accent.blue;
  const nightLabel = night === "tue" ? "Tuesday" : "Thursday";

  return (
    <AppShell teamId={teamId} adminMode parsePanelContent={
      <ParseScoresPanel scores={wclScores} roster={roster} module="25man"
        loading={wclLoading} lastFetch={null} onRefetch={wclRefetch} onWclNameChange={handleWclNameChange} />
    }>
      <ConfirmDialog open={confirmClearOpen} title="Clear All Assignments" message="This will remove all 25-man assignments for this night. Cannot be undone." confirmLabel="Clear All" dangerous onConfirm={() => { setAssignments({}); setTextInputs({}); setConfirmClearOpen(false); }} onCancel={() => setConfirmClearOpen(false)} />

      <ModuleHeader
        icon="⚔"
        title="25-Man Raids Admin"
        breadcrumb={`${teamId === "team-dick" ? "Team Dick" : "Team Balls"} / 25-Man`}
        actions={<>
          <SaveStatus status={saveStatus} />
          <button onClick={() => setShowImport(v => !v)} style={btnStyle("default")}>📂 {roster.length ? `Roster (${roster.length})` : "Import JSON"}</button>
          <button onClick={() => setConfirmClearOpen(true)} style={btnStyle("danger")}>🗑 Clear</button>
          <button onClick={handleSave} style={btnStyle(hasUnsaved ? "warning" : "success")}>{FIREBASE_OK ? `${hasUnsaved ? "● " : ""}☁ Save` : "💾 Save"}</button>
          {FIREBASE_OK && <button onClick={handleSaveSnapshot} style={btnStyle("default")}>{snapshotStatus === "saved" ? "✓ Snapshotted" : "📸 Snapshot"}</button>}
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

      {/* Week slider */}
      {FIREBASE_OK && snapshots.filter(s => s.night === night).length > 0 && (
        <div style={{ padding: `${space[1]}px ${space[3]}px`, background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", alignItems: "center", gap: space[2] }}>
          {(() => {
            const nightSnaps = snapshots.filter(s => s.night === night);
            return (<>
              <button onClick={() => { const idx = viewingSnap ? nightSnaps.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx + 1 < nightSnaps.length ? nightSnaps[idx + 1].id : null); }} disabled={viewingSnap === nightSnaps[nightSnaps.length - 1]?.id} style={{ ...btnStyle("default"), padding: "0 8px", opacity: viewingSnap === nightSnaps[nightSnaps.length - 1]?.id ? 0.3 : 1 }}>‹</button>
              <div style={{ flex: 1, textAlign: "center", fontSize: fontSize.xs, fontFamily: font.sans }}>
                {viewSnap ? <span style={{ color: viewSnap.locked ? "#9980D4" : text.secondary }}>{viewSnap.locked ? "🔒" : "📸"} {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}</span> : <span style={{ color: intent.success }}>⚡ Current Week (Live)</span>}
              </div>
              <button onClick={() => { const idx = viewingSnap ? nightSnaps.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx > 0 ? nightSnaps[idx - 1].id : null); }} disabled={!viewingSnap} style={{ ...btnStyle("default"), padding: "0 8px", opacity: !viewingSnap ? 0.3 : 1 }}>›</button>
              {viewingSnap && <button onClick={async () => { if (!window.confirm("Delete snapshot?")) return; await deleteTwentyFiveSnapshot(teamId, viewingSnap); setSnapshots(prev => prev.filter(s => s.id !== viewingSnap)); setViewingSnap(null); }} style={{ ...btnStyle("danger"), padding: "0 8px" }}>🗑</button>}
            </>);
          })()}
        </div>
      )}

      {/* WCL submit */}
      {FIREBASE_OK && !isLocked && (
        <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center" }}>
          <input value={wclSubmitUrl} onChange={e => setWclSubmitUrl(e.target.value)} placeholder="🔗 WarcraftLogs report URL…" style={{ ...inputStyle, flex: 1 }} />
          <input value={sheetSubmitUrl} onChange={e => setSheetSubmitUrl(e.target.value)} placeholder="📊 RPB Sheet URL (optional)…" style={{ ...inputStyle, flex: 1 }} />
          <input value={combatLogUrl} onChange={e => setCombatLogUrl(e.target.value)} placeholder="⚔ Combat Log URL (optional)…" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleWclSubmit} disabled={!wclSubmitUrl.trim()} style={btnStyle(wclSubmitStatus === "saved" ? "success" : "default")}>
            {wclSubmitStatus === "saving" ? "Locking…" : wclSubmitStatus === "saved" ? "✓ Locked!" : "🔒 Lock"}
          </button>
        </div>
      )}

      {/* Main content */}
      {roster.length === 0 ? (
        <EmptyState icon="⚔" title={`No ${nightLabel} roster`} message={`Import the ${nightLabel} JSON to get started`} action="Import JSON" onAction={() => setShowImport(true)} />
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <TwentyFiveRosterPanel
            roster={nightRoster}
            assignments={viewAssignments}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            onDragStart={handleDragStart}
            wclScores={wclScores}
            wclLoading={wclLoading}
            wclLastFetch={null}
            onWclRefetch={wclRefetch}
            onWclNameChange={handleWclNameChange}
            activeTab={activeTab}
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
              <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
              <div style={{ display: "flex", gap: space[3] }}>
                <AssignmentPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags} rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={isLocked ? null : handleDragStart} />
                <AssignmentPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags} rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={isLocked ? null : handleDragStart} />
              </div>
            </>}

            {activeTab === "gruul" && <>
              <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
              <div style={{ display: "flex", gap: space[3] }}>
                <AssignmentPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar} rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={isLocked ? null : handleDragStart} />
                <AssignmentPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul} rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onTextChange={(k, v) => setTextInputs(p => ({ ...p, [k]: v }))} onDragStart={isLocked ? null : handleDragStart} />
              </div>
            </>}

            {/* General assignments — bottom */}
            <div style={{ marginTop: space[3], display: "flex", gap: 0, background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
              <div style={{ flex: 1, borderRight: `1px solid ${border.subtle}` }}>
                <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}><span style={{ fontSize: fontSize.xs, color: "#8788EE", fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Warlock Curses</span></div>
                {GENERAL_CURSES.map(row => <AssignmentRow key={row.key} rowCfg={row} assignedIds={viewAssignments[row.key]} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onDragStart={isLocked ? null : handleDragStart} assignments={viewAssignments} compact />)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}><span style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Trash Interrupts</span></div>
                {GENERAL_INTERRUPTS.map(row => <AssignmentRow key={row.key} rowCfg={row} assignedIds={viewAssignments[row.key]} textValues={viewTextInputs} roster={viewRoster} onDrop={isLocked ? null : handleDrop} onClear={isLocked ? null : handleClear} onDragStart={isLocked ? null : handleDragStart} assignments={viewAssignments} compact />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

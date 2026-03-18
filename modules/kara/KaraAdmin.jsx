import { useState, useRef, useEffect, useCallback } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle, layout,
} from "../../shared/theme";
import {
  getRole, getClass, getColor, getSpecDisplay, cycleSpec,
  CLASS_COLORS, CLASS_SPECS, ROLE_COLORS,
  KARA_TUE_TEAMS, KARA_THU_TEAMS, KARA_ALL_ROWS,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, BossPanel, RoleHeader, KaraPlayerBadge,
  PlayerBadge, StatusChip, EmptyState, ConfirmDialog, toast, SaveStatus,
  LoadingSpinner, ParseScoresPanel,
} from "../../shared/components";
import {
  saveKaraState, fetchKaraState, saveKaraSnapshot, fetchKaraSnapshots,
  updateKaraSnapshot, deleteKaraSnapshot, submitKaraWclLog,
  isFirebaseConfigured,
} from "../../shared/firebase";
import { useWarcraftLogs, getScoreForPlayer, getScoreColor } from "../../shared/useWarcraftLogs";
import { saveState, loadState } from "../../shared/constants";

const FIREBASE_OK = isFirebaseConfigured();

// ── Utility ───────────────────────────────────────────────────────────────────
const CLASS_SPEC_MAP = {
  Warrior:  ["Arms","Fury","Protection"],
  Paladin:  ["Holy","Protection1","Retribution"],
  Hunter:   ["Beast Mastery","Marksmanship","Survival"],
  Rogue:    ["Assassination","Combat","Subtlety"],
  Priest:   ["Discipline","Holy1","Shadow"],
  Shaman:   ["Elemental","Enhancement","Restoration"],
  Mage:     ["Arcane","Fire","Frost"],
  Warlock:  ["Affliction","Demonology","Destruction"],
  Druid:    ["Balance","Feral","Restoration1","Guardian"],
};
const SPEC_DISPLAY_MAP = { Protection1: "Protection", Holy1: "Holy", Restoration1: "Restoration" };
const specLabel = s => SPEC_DISPLAY_MAP[s] || s;

// ── Assignment drop row ───────────────────────────────────────────────────────
function KaraDropRow({ rowCfg, assignedIds, allRosters, onDrop, onClear, onSpecCycle, onDragStart, assignments }) {
  const [over, setOver] = useState(false);
  const dropRef = useRef(null);
  const ids   = assignedIds ? (Array.isArray(assignedIds) ? assignedIds : [assignedIds]) : [];
  const slots = ids.map(id => allRosters.find(s => s.id === id)).filter(Boolean);

  return (
    <div
      ref={dropRef}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => { if (!dropRef.current?.contains(e.relatedTarget)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(rowCfg.key); }}
      style={{
        display: "flex", alignItems: "center", gap: space[2],
        padding: `${space[1]}px ${space[3]}px`,
        minHeight: layout.rowHeight,
        background: over ? `${accent.blue}12` : "transparent",
        borderLeft: `2px solid ${over ? accent.blue : border.subtle}`,
        borderBottom: `1px solid ${border.subtle}`,
        transition: "all 0.1s",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: space[1], alignItems: "center" }}>
        {slots.map(slot => (
          <div key={slot.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <KaraPlayerBadge
              slot={slot}
              onSpecCycle={onSpecCycle}
              onDragStart={onDragStart ? (e, s) => onDragStart(e, s, rowCfg.key) : undefined}
            />
            <button
              onClick={() => onClear(rowCfg.key, slot.id)}
              style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
              title="Remove"
            >×</button>
          </div>
        ))}
        {over && <span style={{ fontSize: fontSize.xs, color: accent.blue, fontStyle: "italic" }}>drop here</span>}
      </div>
    </div>
  );
}

// ── Night section (3 teams) ───────────────────────────────────────────────────
function NightSection({ night, teams, color, assignments, allRosters, isLocked, onDrop, onClear, onDragStart, onSpecCycle, onCopyDiscord, discordCopied }) {
  const UTILITY = {
    removeCurse: { label: "Remove Curse", icon: "🧹", specs: new Set(["Balance","Restoration","Feral","Guardian","Arcane","Fire","Frost"]) },
    dispelMagic: { label: "Dispel Magic", icon: "✨", specs: new Set(["Holy","Holy1","Discipline","Shadow"]) },
    curePoison:  { label: "Cure Poison",  icon: "🧪", specs: new Set(["Balance","Restoration","Feral","Guardian","Restoration1"]) },
    cureDisease: { label: "Cure Disease", icon: "💊", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution"]) },
    interrupt:   { label: "Interrupt",    icon: "⚡", specs: new Set(["Arms","Fury","Protection","Assassination","Combat","Subtlety","Enhancement","Retribution","Protection1","Feral","Guardian"]) },
    bloodlust:   { label: "Bloodlust",    icon: "🥁", specs: new Set(["Elemental","Enhancement","Restoration1"]) },
  };

  return (
    <div style={{ marginBottom: space[6] }}>
      {/* Night header */}
      <div style={{
        display: "flex", alignItems: "center", gap: space[3], marginBottom: space[3],
        padding: `${space[2]}px ${space[3]}px`,
        background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base,
      }}>
        <div style={{ width: 3, height: 18, borderRadius: 1, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color, fontFamily: font.sans }}>
          {night === "tue" ? "📅 TUESDAY" : "📅 THURSDAY"}
        </span>
        <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>3 TEAMS · 2 GROUPS OF 5</span>
        {!isLocked && (
          <button
            onClick={onCopyDiscord}
            style={{ ...btnStyle("default"), marginLeft: "auto", fontSize: fontSize.xs }}
          >
            {discordCopied ? "✓ Copied!" : "💬 Copy Discord"}
          </button>
        )}
      </div>

      {/* Teams */}
      <div style={{ display: "flex", gap: space[3] }}>
        {teams.map((team, i) => {
          const allRows     = [...team.g1, ...team.g2];
          const teamPlayers = allRows
            .flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : [])
            .map(id => allRosters.find(p => p.id === id)).filter(Boolean);
          const tankCount   = teamPlayers.filter(p => getRole(p) === "Tank").length;
          const healerCount = teamPlayers.filter(p => getRole(p) === "Healer").length;
          const filledCount = teamPlayers.length;
          const has = {};
          Object.keys(UTILITY).forEach(k => { has[k] = teamPlayers.some(p => UTILITY[k].specs.has(p.specName)); });

          return (
            <div key={i} style={{
              flex: 1, background: surface.panel, border: `1px solid ${color}33`,
              borderRadius: radius.lg, overflow: "hidden",
            }}>
              {/* Team header */}
              <div style={{
                padding: `${space[2]}px ${space[3]}px`,
                borderBottom: `1px solid ${color}22`,
                display: "flex", alignItems: "center", gap: space[2],
                background: `${color}08`,
              }}>
                <span style={{ fontSize: fontSize.sm, color, fontFamily: font.sans, fontWeight: fontWeight.bold }}>🏰 TEAM {i + 1}</span>
                <span style={{ fontSize: fontSize.xs, color: "#4C90F0", fontFamily: font.sans }}>🛡 {tankCount}</span>
                <span style={{ fontSize: fontSize.xs, color: "#32A467", fontFamily: font.sans }}>💚 {healerCount}</span>
                <span style={{ fontSize: fontSize.xs, color: text.muted, marginLeft: "auto", fontFamily: font.sans }}>{filledCount}/10</span>
              </div>

              {/* Utility tracker */}
              {filledCount > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: `${space[1]}px ${space[2]}px`, borderBottom: `1px solid ${color}11`, background: surface.base }}>
                  {Object.entries(UTILITY).map(([k, u]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: font.sans, padding: "1px 5px", borderRadius: radius.sm,
                      background: has[k] ? `${intent.success}15` : `${intent.danger}15`,
                      border: `1px solid ${has[k] ? intent.success + "33" : intent.danger + "33"}`,
                      color: has[k] ? intent.success : `${intent.danger}88`,
                    }}>
                      {u.icon} {u.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Groups */}
              <div style={{ display: "flex" }}>
                {[team.g1, team.g2].map((group, gi) => {
                  const filled = group.filter(r => assignments[r.key]).length;
                  return (
                    <div key={gi} style={{ flex: 1, borderRight: gi === 0 ? `1px solid ${color}18` : "none" }}>
                      <div style={{
                        padding: `3px ${space[2]}px`,
                        borderBottom: `1px solid ${color}11`,
                        display: "flex", justifyContent: "space-between",
                      }}>
                        <span style={{ fontSize: 9, color: `${color}88`, fontFamily: font.sans, letterSpacing: "0.1em" }}>GROUP {gi + 1}</span>
                        <span style={{ fontSize: 9, color: text.muted, fontFamily: font.sans }}>{filled}/5</span>
                      </div>
                      {group.map(row => (
                        <KaraDropRow
                          key={row.key}
                          rowCfg={row}
                          assignedIds={assignments[row.key]}
                          allRosters={allRosters}
                          onDrop={isLocked ? () => {} : onDrop}
                          onClear={isLocked ? () => {} : onClear}
                          onDragStart={isLocked ? null : onDragStart}
                          onSpecCycle={onSpecCycle}
                          assignments={assignments}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conflict modal ────────────────────────────────────────────────────────────
function ConflictModal({ conflicts, resolved, onChange, onConfirm }) {
  const allFilled = conflicts.every(c => {
    const r = resolved[c.discordId];
    return r?.tueName?.trim() && r?.thuName?.trim();
  });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.lg, padding: space[6], width: 520, maxWidth: "95vw", maxHeight: "80vh", overflowY: "auto", fontFamily: font.sans }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary, marginBottom: space[2] }}>⚔ Character Conflicts Detected</div>
        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[4], lineHeight: 1.6 }}>
          These players are signed up on <span style={{ color: intent.success }}>Tuesday</span> and{" "}
          <span style={{ color: accent.blue }}>Thursday</span> on <strong style={{ color: text.primary }}>different characters</strong>.
          Set the WarcraftLogs character name for each night so parse scores work correctly.
        </div>
        {conflicts.map(({ discordId, tueSlot, thuSlot }) => {
          const r = resolved[discordId] || { tueName: tueSlot.name, thuName: thuSlot.name };
          return (
            <div key={discordId} style={{ marginBottom: space[3], padding: space[3], background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base }}>
              <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                🎮 {tueSlot.name} <span style={{ color: text.muted, fontSize: fontSize.xs }}>· {discordId}</span>
              </div>
              <div style={{ display: "flex", gap: space[3] }}>
                {[["tue", tueSlot, intent.success, "TUESDAY"], ["thu", thuSlot, accent.blue, "THURSDAY"]].map(([night, slot, color, label]) => (
                  <div key={night} style={{ flex: 1 }}>
                    <div style={{ fontSize: fontSize.xs, color, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[1] }}>{label}</div>
                    <div style={{ fontSize: fontSize.xs, color: CLASS_COLORS[slot.className] || text.muted, marginBottom: space[2] }}>{slot.specName} {slot.className}</div>
                    <input
                      value={r[night === "tue" ? "tueName" : "thuName"]}
                      onChange={e => onChange(discordId, night === "tue" ? "tueName" : "thuName", e.target.value)}
                      placeholder="WCL character name…"
                      style={{ ...inputStyle, width: "100%", color, borderColor: `${color}44`, fontSize: fontSize.sm }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <button
          onClick={onConfirm}
          disabled={!allFilled}
          style={{ ...btnStyle(allFilled ? "success" : "default"), width: "100%", height: 36, justifyContent: "center", marginTop: space[2] }}
        >
          {allFilled ? "✓ Confirm & Import" : `Fill in all names (${conflicts.filter(c => { const r = resolved[c.discordId]; return r?.tueName?.trim() && r?.thuName?.trim(); }).length}/${conflicts.length} done)`}
        </button>
      </div>
    </div>
  );
}

// ── Roster sidebar ────────────────────────────────────────────────────────────
function KaraRosterPanel({ karaNight, setKaraNight, rosterTue, rosterThu, assignments, roleFilter, setRoleFilter, onDragStart, onSpecCycle, wclScores, wclLoading, wclError, wclLastFetch, onWclRefetch, onWclNameChange }) {
  const karaKeys       = new Set(KARA_ALL_ROWS.map(r => r.key));
  const activeRoster   = karaNight === "tue" ? rosterTue : rosterThu;
  const karaAssignedIds = new Set(
    Object.entries(assignments).filter(([k]) => karaKeys.has(k)).flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
  );

  const seenNames  = new Set();
  const filtered   = activeRoster.filter(s => {
    if (roleFilter !== "All" && getRole(s) !== roleFilter) return false;
    if (seenNames.has(s.name.toLowerCase())) return false;
    seenNames.add(s.name.toLowerCase());
    return true;
  });

  const unplaced = filtered.filter(s => !karaAssignedIds.has(s.id));
  const placed   = filtered.filter(s =>  karaAssignedIds.has(s.id));
  const sorted   = [...unplaced, ...placed];

  return (
    <div style={{
      width: layout.rosterWidth, flexShrink: 0,
      background: surface.panel, borderRight: `1px solid ${border.subtle}`,
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.xs, color: text.muted, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Kara Roster · {activeRoster.length}
      </div>

      {/* Night toggle */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border.subtle}` }}>
        {[["tue", "Tuesday"], ["thu", "Thursday"]].map(([night, label]) => (
          <button key={night} onClick={() => setKaraNight(night)} style={{
            flex: 1, padding: `${space[1]}px`, fontSize: fontSize.xs, cursor: "pointer",
            border: "none", fontFamily: font.sans,
            background: karaNight === night ? surface.card : "transparent",
            color: karaNight === night ? accent.blue : text.muted,
            borderBottom: karaNight === night ? `2px solid ${accent.blue}` : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      {/* Role filter */}
      <div style={{ display: "flex", gap: 2, padding: space[2], borderBottom: `1px solid ${border.subtle}` }}>
        {["All","Tank","Healer","DPS"].map(r => {
          const rc = r === "Tank" ? ROLE_COLORS.Tank : r === "Healer" ? ROLE_COLORS.Healer : r === "DPS" ? ROLE_COLORS.DPS : null;
          return (
            <button key={r} onClick={() => setRoleFilter(r)} style={{
              flex: 1, padding: "2px 0", fontSize: 9, cursor: "pointer",
              border: "1px solid", borderRadius: radius.sm, fontFamily: font.sans,
              background: roleFilter === r ? (rc?.tag || surface.overlay) : surface.base,
              borderColor: roleFilter === r ? `${text.muted}66` : border.subtle,
              color: roleFilter === r ? text.primary : text.muted,
            }}>{r}</button>
          );
        })}
      </div>

      {/* Players */}
      <div style={{ padding: `${space[1]}px ${space[2]}px`, fontSize: 9, color: accent.blue, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${border.subtle}` }}>
        {filtered.length} players · {karaAssignedIds.size} placed
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: space[2], display: "flex", flexDirection: "column", gap: 3 }}>
        {sorted.map((s, idx) => {
          const isPlaced = karaAssignedIds.has(s.id);
          if (idx === unplaced.length && placed.length > 0) {
            // Insert divider between unplaced and placed
          }
          return (
            <div key={s.id} style={{ position: "relative", opacity: isPlaced ? 0.35 : 1, transition: "opacity 0.15s" }}>
              <KaraPlayerBadge
                slot={s}
                onSpecCycle={isPlaced ? null : onSpecCycle}
                onDragStart={isPlaced ? null : (e, slot) => onDragStart(e, slot, null)}
              />
              {isPlaced && (
                <span style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: accent.blue, fontFamily: font.sans, pointerEvents: "none" }}>✓</span>
              )}
            </div>
          );
        })}
      </div>

      <ParseScoresPanel
        scores={wclScores}
        roster={[...rosterTue, ...rosterThu]}
        module="kara"
        loading={wclLoading}
        error={wclError}
        lastFetch={wclLastFetch}
        onRefetch={onWclRefetch}
        onWclNameChange={onWclNameChange}
      />
    </div>
  );
}

// ── Main KaraAdmin ────────────────────────────────────────────────────────────
export default function KaraAdmin() {
  const [roster,        setRoster]        = useState([]);
  const [rosterTue,     setRosterTue]     = useState([]);
  const [rosterThu,     setRosterThu]     = useState([]);
  const [assignments,   setAssignments]   = useState({});
  const [specOverrides, setSpecOverrides] = useState({});
  const [raidDateTue,   setRaidDateTue]   = useState("");
  const [raidDateThu,   setRaidDateThu]   = useState("");
  const [karaNight,     setKaraNight]     = useState("tue");
  const [roleFilter,    setRoleFilter]    = useState("All");
  const [dragSlot,      setDragSlot]      = useState(null);
  const [dragSourceKey, setDragSourceKey] = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [jsonErrorTue,  setJsonErrorTue]  = useState("");
  const [jsonErrorThu,  setJsonErrorThu]  = useState("");
  const [saveStatus,    setSaveStatus]    = useState(FIREBASE_OK ? "idle" : "offline");
  const [hasUnsaved,    setHasUnsaved]    = useState(false);
  const [snapshots,     setSnapshots]     = useState([]);
  const [viewingSnap,   setViewingSnap]   = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState("idle");
  const [wclSubmitUrl,   setWclSubmitUrl]   = useState("");
  const [sheetSubmitUrl, setSheetSubmitUrl] = useState("");
  const [wclSubmitStatus, setWclSubmitStatus] = useState("idle");
  const [discordCopiedTue, setDiscordCopiedTue] = useState(false);
  const [discordCopiedThu, setDiscordCopiedThu] = useState(false);
  const [parsesOpen,    setParsesOpen]    = useState(false);
  const [pendingConflicts,   setPendingConflicts]   = useState([]);
  const [pendingResolved,    setPendingResolved]    = useState({});
  const [pendingImportQueue, setPendingImportQueue] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const autoSaveTimer  = useRef(null);
  const fileRefTue     = useRef();
  const fileRefThu     = useRef();
  const commitImportRef = useRef(null);

  const { scores: wclScores, loading: wclLoading, error: wclError, lastFetch: wclLastFetch, refetch: wclRefetch } =
    useWarcraftLogs(roster, { teamId: "shared", module: "kara" });

  const handleWclNameChange = useCallback((playerId, newName) => {
    const update = s => s.id !== playerId ? s : { ...s, wclName: newName };
    setRosterTue(prev => prev.map(update));
    setRosterThu(prev => prev.map(update));
    setRoster(prev => prev.map(update));
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      let s = null;
      if (FIREBASE_OK) {
        try { s = await fetchKaraState(); } catch (e) { console.warn(e); }
      }
      if (!s) s = loadState("shared", "kara");
      if (s) {
        if (s.rosterTue)     setRosterTue(s.rosterTue);
        if (s.rosterThu)     setRosterThu(s.rosterThu);
        if (s.assignments)   setAssignments(s.assignments);
        if (s.specOverrides) setSpecOverrides(s.specOverrides);
        if (s.raidDateTue)   setRaidDateTue(s.raidDateTue);
        if (s.raidDateThu)   setRaidDateThu(s.raidDateThu);
        // Rebuild combined roster
        const combined = [...(s.rosterTue || []), ...(s.rosterThu || [])];
        setRoster(combined);
      }
    }
    load();
    if (FIREBASE_OK) fetchKaraSnapshots().then(setSnapshots).catch(console.warn);
    document.title = "NTMO · Karazhan Admin";
  }, [teamId]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    setHasUnsaved(true);
    if (!FIREBASE_OK) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
      saveState(state, "shared", "kara");
      try {
        setSaveStatus("saving");
        await saveKaraState(state);
        setSaveStatus("saved");
        setHasUnsaved(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    }, 4000);
  }, [rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu]);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
    saveState(state, "shared", "kara");
    if (!FIREBASE_OK) { setSaveStatus("offline"); return; }
    setSaveStatus("saving");
    try {
      await saveKaraState(state);
      setSaveStatus("saved"); setHasUnsaved(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 4000); }
  }, [rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu, teamId]);

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const handleSaveSnapshot = useCallback(async () => {
    if (!FIREBASE_OK) { toast({ message: "Firebase required for snapshots", type: "danger" }); return; }
    setSnapshotStatus("saving");
    try {
      const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
      await saveKaraSnapshot(state);
      setSnapshotStatus("saved");
      const snaps = await fetchKaraSnapshots();
      setSnapshots(snaps);
      setTimeout(() => setSnapshotStatus("idle"), 3000);
    } catch (e) { setSnapshotStatus("error"); setTimeout(() => setSnapshotStatus("idle"), 4000); }
  }, [rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu, teamId]);

  // ── WCL submit ────────────────────────────────────────────────────────────
  const handleWclSubmit = useCallback(async () => {
    const url = wclSubmitUrl.trim();
    if (!url) return;
    const match = url.match(/reports\/([A-Za-z0-9]+)/);
    const reportCode = match ? match[1] : null;
    const finalUrl   = reportCode ? `https://fresh.warcraftlogs.com/reports/${reportCode}` : url;
    const rawSheet   = sheetSubmitUrl.trim();
    const sheetUrl   = rawSheet ? rawSheet.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview") : null;
    setWclSubmitStatus("saving");
    try {
      const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
      const extra = { wclReportUrl: finalUrl, locked: true, ...(sheetUrl ? { sheetUrl } : {}) };
      if (viewingSnap) {
        await submitKaraWclLog(viewingSnap, finalUrl);
        if (sheetUrl) await updateKaraSnapshot(viewingSnap, { sheetUrl });
        setSnapshots(prev => prev.map(s => s.id === viewingSnap ? { ...s, ...extra } : s));
      } else {
        await saveKaraSnapshot(state, extra);
        const snaps = await fetchKaraSnapshots();
        setSnapshots(snaps);
      }
      setWclSubmitStatus("saved");
      setWclSubmitUrl(""); setSheetSubmitUrl("");
      setTimeout(() => setWclSubmitStatus("idle"), 3000);
    } catch (e) { setWclSubmitStatus("error"); setTimeout(() => setWclSubmitStatus("idle"), 4000); }
  }, [wclSubmitUrl, sheetSubmitUrl, viewingSnap, teamId, rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu]);

  // ── Spec cycle ────────────────────────────────────────────────────────────
  const handleSpecCycle = useCallback((playerId) => {
    const update = s => {
      if (s.id !== playerId) return s;
      const { specName: nextSpec, baseClass } = cycleSpec(s);
      return { ...s, specName: nextSpec, className: nextSpec, baseClass };
    };
    setRosterTue(prev => prev.map(update));
    setRosterThu(prev => prev.map(update));
    setRoster(prev => prev.map(update));
    setSpecOverrides(prev => {
      const player = [...rosterTue, ...rosterThu].find(s => s.id === playerId);
      if (!player) return prev;
      const { specName: nextSpec } = cycleSpec(player);
      return { ...prev, [playerId]: nextSpec };
    });
  }, [rosterTue, rosterThu]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportJSON = useCallback((text, night) => {
    try {
      const data = JSON.parse(text);
      if (!data.slots) throw new Error("No 'slots' array found");
      const otherNight = night === "tue" ? "thu" : "tue";
      const otherSlots = roster.filter(p => p.karaNight === otherNight);

      if (otherSlots.length > 0) {
        const normalizedOther = otherSlots.map(p => ({ ...p, id: p._discordId || p.id.replace(/_tue$|_thu$/, "") }));
        const tueSlots = night === "tue" ? data.slots : normalizedOther;
        const thuSlots = night === "thu" ? data.slots : normalizedOther;
        setPendingImportQueue({ tueSlots, thuSlots });
      } else {
        const queue = night === "tue"
          ? { tueSlots: data.slots, thuSlots: [] }
          : { tueSlots: [], thuSlots: data.slots };
        commitImportRef.current(queue, []);
      }
      if (night === "tue") setJsonErrorTue(""); else setJsonErrorThu("");
    } catch (e) {
      if (night === "tue") setJsonErrorTue(e.message); else setJsonErrorThu(e.message);
    }
  }, [roster]);

  const commitImport = useCallback((queue, resolvedConflicts) => {
    const { tueSlots, thuSlots } = queue;
    const conflictIds = new Set(resolvedConflicts.map(c => c.discordId));

    const buildSlots = (slots, night) => slots.flatMap(slot => {
      if (conflictIds.has(slot.id)) {
        const resolved     = resolvedConflicts.find(c => c.discordId === slot.id);
        const resolvedName = night === "tue" ? resolved?.resolvedNames?.tueName : resolved?.resolvedNames?.thuName;
        return [{ ...slot, id: `${slot.id}_${night}`, karaNight: night, name: resolvedName || slot.name, wclName: resolvedName || undefined, _discordId: slot.id }];
      }
      return [{ ...slot, karaNight: night }];
    });

    const finalTue = buildSlots(tueSlots, "tue");
    const finalThu = buildSlots(thuSlots, "thu");

    setRoster(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      const nightsBeingImported = new Set();
      if (tueSlots.length) nightsBeingImported.add("tue");
      if (thuSlots.length) nightsBeingImported.add("thu");
      for (const [id, p] of byId) {
        if (nightsBeingImported.has(p.karaNight) || p.manual || !p.karaNight) byId.delete(id);
      }
      [...finalTue, ...finalThu].forEach(slot => {
        const existing = byId.get(slot.id);
        byId.set(slot.id, { ...(existing || {}), ...slot, wclName: slot.wclName ?? existing?.wclName });
      });
      const merged  = [...byId.values()];
      const validIds = new Set(merged.map(p => p.id));
      setRosterTue(merged.filter(p => p.karaNight === "tue"));
      setRosterThu(merged.filter(p => p.karaNight === "thu"));
      setAssignments(prev => {
        const next = {};
        for (const [key, ids] of Object.entries(prev)) {
          const arr  = Array.isArray(ids) ? ids : [ids];
          const kept = arr.filter(id => validIds.has(id));
          if (kept.length) next[key] = kept.length === 1 ? kept[0] : kept;
        }
        return next;
      });
      return merged;
    });
    setPendingImportQueue(null); setPendingConflicts([]); setPendingResolved({});
  }, [roster]);

  commitImportRef.current = commitImport;

  useEffect(() => {
    if (!pendingImportQueue) return;
    const { tueSlots, thuSlots } = pendingImportQueue;
    if (!tueSlots.length || !thuSlots.length) return;
    const thuById   = new Map(thuSlots.map(s => [s.id, s]));
    const conflicts = tueSlots.reduce((acc, tueSlot) => {
      const thuSlot = thuById.get(tueSlot.id);
      if (thuSlot && thuSlot.className !== tueSlot.className) acc.push({ discordId: tueSlot.id, tueSlot, thuSlot });
      return acc;
    }, []);
    if (conflicts.length === 0) {
      commitImport(pendingImportQueue, []);
    } else {
      const initialResolved = {};
      conflicts.forEach(({ discordId, tueSlot, thuSlot }) => {
        const existingTue = roster.find(p => p.id === `${discordId}_tue`);
        const existingThu = roster.find(p => p.id === `${discordId}_thu`);
        initialResolved[discordId] = { tueName: existingTue?.wclName ?? tueSlot.name, thuName: existingThu?.wclName ?? thuSlot.name };
      });
      setPendingConflicts(conflicts); setPendingResolved(initialResolved);
    }
  }, [pendingImportQueue, commitImport, roster]);

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const karaKeys = new Set(KARA_ALL_ROWS.map(r => r.key));

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
      const allRosters = [...rosterTue, ...rosterThu];
      const dragName   = dragSlot.name.toLowerCase();
      const alreadyPlaced = Object.entries(prev)
        .filter(([k]) => karaKeys.has(k) && k !== dragSourceKey)
        .flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
        .some(id => { const p = allRosters.find(s => s.id === id); return p && p.name.toLowerCase() === dragName; });
      if (alreadyPlaced) { toast({ message: `${dragSlot.name} is already assigned to a Karazhan team`, type: "danger" }); return prev; }
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
  }, [dragSlot, dragSourceKey, rosterTue, rosterThu, karaKeys]);

  const handleClear = useCallback((key, playerId) => {
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      const updated  = existing.filter(id => id !== playerId);
      const n = { ...prev };
      if (updated.length === 0) delete n[key]; else n[key] = updated;
      return n;
    });
  }, []);

  // ── Discord copy ──────────────────────────────────────────────────────────
  const copyNightDiscord = useCallback((night, teams, setCopied) => {
    const allRosters = [...rosterTue, ...rosterThu];
    const nightLabel = night === "tue" ? "📅 TUESDAY" : "📅 THURSDAY";
    const lines = [`**${nightLabel}**`, ""];
    teams.forEach((team, i) => {
      const g1Ids = team.g1.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
      const g2Ids = team.g2.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
      if (!g1Ids.length && !g2Ids.length) return;
      lines.push(`🏰 **Team ${i + 1}**`);
      if (g1Ids.length) { lines.push(`> **Group 1**`); g1Ids.forEach(id => { const p = allRosters.find(s => s.id === id); if (p) lines.push(`> • <@${p.id}>`); }); }
      if (g2Ids.length) { lines.push(`> **Group 2**`); g2Ids.forEach(id => { const p = allRosters.find(s => s.id === id); if (p) lines.push(`> • <@${p.id}>`); }); }
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }, [rosterTue, rosterThu, assignments]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const viewSnap        = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : assignments;
  const allRosters      = [...rosterTue, ...rosterThu];

  if (roster.length === 0 && !showImport) {
    return (
      <AppShell adminMode>
        <ModuleHeader icon="🏰" title="Karazhan Admin" breadcrumb="Karazhan" />
        <EmptyState icon="🏰" title="No roster imported" message="Import Tuesday and Thursday JSONs to get started" action="Import Roster" onAction={() => setShowImport(true)} />
      </AppShell>
    );
  }

  return (
    <AppShell adminMode>
      {/* Conflict modal */}
      {pendingConflicts.length > 0 && (
        <ConflictModal
          conflicts={pendingConflicts}
          resolved={pendingResolved}
          onChange={(discordId, field, value) => setPendingResolved(prev => ({ ...prev, [discordId]: { ...(prev[discordId] || {}), [field]: value } }))}
          onConfirm={() => {
            const resolvedConflicts = pendingConflicts.map(c => ({ ...c, resolvedNames: pendingResolved[c.discordId] || { tueName: c.tueSlot.name, thuName: c.thuSlot.name } }));
            commitImport(pendingImportQueue, resolvedConflicts);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Assignments"
        message="This will remove all Karazhan assignments. This cannot be undone."
        confirmLabel="Clear All"
        dangerous
        onConfirm={() => { setAssignments({}); setConfirmClearOpen(false); }}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* Module header */}
      <ModuleHeader
        icon="🏰"
        title="Karazhan Admin"
        breadcrumb="Karazhan"
        actions={<>
          <SaveStatus status={saveStatus} />
          <button onClick={() => setShowImport(v => !v)} style={btnStyle("default")}>
            📂 {rosterTue.length || rosterThu.length ? `Roster (${rosterTue.length}T / ${rosterThu.length}H)` : "Import JSON"}
          </button>
          <button onClick={() => setConfirmClearOpen(true)} style={btnStyle("danger")}>🗑 Clear</button>
          <button onClick={handleSave} style={btnStyle(hasUnsaved ? "warning" : "success")}>
            {FIREBASE_OK ? `${hasUnsaved ? "● " : ""}☁ Save` : "💾 Save"}
          </button>
          {FIREBASE_OK && (
            <button onClick={handleSaveSnapshot} style={btnStyle("default")}>
              {snapshotStatus === "saved" ? "✓ Snapshotted" : "📸 Snapshot"}
            </button>
          )}
        </>}
      />

      {/* Import panel */}
      {showImport && (
        <div style={{ padding: space[3], background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[3] }}>
          {[["tue", "Tuesday", jsonErrorTue, setJsonErrorTue, fileRefTue, rosterTue.length], ["thu", "Thursday", jsonErrorThu, setJsonErrorThu, fileRefThu, rosterThu.length]].map(([night, label, err, setErr, ref, count]) => (
            <div key={night} style={{ flex: 1 }}>
              <div style={{ fontSize: fontSize.xs, color: night === "tue" ? intent.success : accent.blue, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[1] }}>
                📅 {label} Raid JSON
              </div>
              <textarea
                placeholder={`Paste ${label} JSON…`}
                onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim(), night); }}
                style={{ ...inputStyle, width: "100%", height: 70, resize: "vertical", fontFamily: font.mono, fontSize: fontSize.xs, padding: space[2], borderColor: err ? intent.danger : border.subtle }}
              />
              {err && <div style={{ fontSize: fontSize.xs, color: intent.danger, marginTop: 2 }}>⚠ {err}</div>}
              {count > 0 && !err && <div style={{ fontSize: fontSize.xs, color: intent.success, marginTop: 2 }}>✓ {count} players</div>}
              <button onClick={() => ref.current.click()} style={{ ...btnStyle("default"), marginTop: space[1], fontSize: fontSize.xs }}>📁 Upload .json</button>
              <input ref={ref} type="file" accept=".json" onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => handleImportJSON(ev.target.result.trim(), night); r.readAsText(f); e.target.value = ""; }} style={{ display: "none" }} />
            </div>
          ))}
        </div>
      )}

      {/* Week slider */}
      {FIREBASE_OK && snapshots.length > 0 && (
        <div style={{ padding: `${space[1]}px ${space[3]}px`, background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", alignItems: "center", gap: space[2] }}>
          <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx + 1 < snapshots.length ? snapshots[idx + 1].id : null); }} disabled={viewingSnap === snapshots[snapshots.length - 1]?.id} style={{ ...btnStyle("default"), padding: "0 8px", opacity: viewingSnap === snapshots[snapshots.length - 1]?.id ? 0.3 : 1 }}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: fontSize.xs, fontFamily: font.sans }}>
            {viewSnap ? (
              <span style={{ color: viewSnap.locked ? "#9980D4" : text.secondary }}>
                {viewSnap.locked ? "🔒" : "📸"} {viewSnap.raidDateTue || viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}
                {viewSnap.locked && <StatusChip type="locked" style={{ marginLeft: space[2] }}>LOCKED</StatusChip>}
              </span>
            ) : <span style={{ color: intent.success }}>⚡ Current Week (Live)</span>}
          </div>
          <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx > 0 ? snapshots[idx - 1].id : null); }} disabled={!viewingSnap} style={{ ...btnStyle("default"), padding: "0 8px", opacity: !viewingSnap ? 0.3 : 1 }}>›</button>
          {viewingSnap && (
            <button onClick={async () => { if (!window.confirm("Delete snapshot?")) return; await deleteKaraSnapshot(viewingSnap); setSnapshots(prev => prev.filter(s => s.id !== viewingSnap)); setViewingSnap(null); }} style={{ ...btnStyle("danger"), padding: "0 8px" }}>🗑</button>
          )}
        </div>
      )}

      {/* WCL submit */}
      {FIREBASE_OK && !isLocked && (
        <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center" }}>
          <input value={wclSubmitUrl} onChange={e => setWclSubmitUrl(e.target.value)} placeholder="🔗 WarcraftLogs report URL…" style={{ ...inputStyle, flex: 1 }} />
          <input value={sheetSubmitUrl} onChange={e => setSheetSubmitUrl(e.target.value)} placeholder="📊 Google Sheet URL (optional)…" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleWclSubmit} disabled={!wclSubmitUrl.trim()} style={btnStyle(wclSubmitStatus === "saved" ? "success" : "default")}>
            {wclSubmitStatus === "saving" ? "Locking…" : wclSubmitStatus === "saved" ? "✓ Locked!" : "🔒 Lock"}
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Roster sidebar */}
        <KaraRosterPanel
          karaNight={karaNight}
          setKaraNight={setKaraNight}
          rosterTue={rosterTue}
          rosterThu={rosterThu}
          assignments={viewAssignments}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          onDragStart={handleDragStart}
          onSpecCycle={handleSpecCycle}
          wclScores={wclScores}
          wclLoading={wclLoading}
          wclError={wclError}
          wclLastFetch={wclLastFetch}
          onWclRefetch={wclRefetch}
          onWclNameChange={handleWclNameChange}
          activeTabForScores="kara"
        />

        {/* Assignment area */}
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          <NightSection
            night="tue" teams={KARA_TUE_TEAMS} color={intent.success}
            assignments={viewAssignments} allRosters={allRosters} isLocked={isLocked}
            onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} onSpecCycle={handleSpecCycle}
            onCopyDiscord={() => copyNightDiscord("tue", KARA_TUE_TEAMS, setDiscordCopiedTue)}
            discordCopied={discordCopiedTue}
          />
          <NightSection
            night="thu" teams={KARA_THU_TEAMS} color={accent.blue}
            assignments={viewAssignments} allRosters={allRosters} isLocked={isLocked}
            onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} onSpecCycle={handleSpecCycle}
            onCopyDiscord={() => copyNightDiscord("thu", KARA_THU_TEAMS, setDiscordCopiedThu)}
            discordCopied={discordCopiedThu}
          />
        </div>
      </div>
    </AppShell>
  );
}

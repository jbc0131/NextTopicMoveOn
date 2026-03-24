import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, layout,
} from "../../shared/theme";
import {
  getColor, getSpecDisplay, getClass, ROLE_COLORS,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, CUBE_TEAMS,
  GENERAL_CURSES, GENERAL_INTERRUPTS,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, BossPanel, RoleHeader, MarkerIcon,
  StatusChip, SyncBadge, SearchBox, EmptyState, LoadingSpinner, ParseScoresPanel,
} from "../../shared/components";
import {
  fetchTwentyFiveState, subscribeToTwentyFiveState, fetchTwentyFiveSnapshots,
  isFirebaseConfigured,
} from "../../shared/firebase";
import { useWarcraftLogs, getScoreForPlayer, getScoreColor } from "../../shared/useWarcraftLogs";

const FIREBASE_OK = isFirebaseConfigured();

function PlayerChip({ slot, searchName, wclScores, activeTab }) {
  if (!slot) return null;
  const color      = getColor(slot);
  const nameMatch  = searchName && slot.name.toLowerCase().includes(searchName.toLowerCase());
  const score      = getScoreForPlayer(wclScores, slot, activeTab);
  const scoreColor = getScoreColor(score);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: nameMatch ? `${color}30` : `${color}18`,
      border: `1px solid ${nameMatch ? color : color + "44"}`,
      borderRadius: radius.sm, padding: "2px 7px",
      color, fontFamily: font.sans, fontSize: fontSize.sm,
      boxShadow: nameMatch ? `0 0 6px ${color}55` : "none",
      flexWrap: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: nameMatch ? fontWeight.bold : fontWeight.semibold }}>{slot.name}</span>
      <span style={{ color: `${color}88`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)}</span>
      {nameMatch && <span style={{ color, fontSize: 9 }}>◄</span>}
    </span>
  );
}

function PublicRow({ rowCfg, ids, textValues, roster, searchName, wclScores, activeTab }) {
  const slots = ids ? (Array.isArray(ids) ? ids : [ids]).map(id => roster.find(s => s.id === id)).filter(Boolean) : [];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: space[2],
      padding: `${space[1]}px ${space[3]}px`,
      minHeight: layout.rowHeight,
      borderBottom: `1px solid ${border.subtle}`,
    }}>
      {(rowCfg.label || rowCfg.markerKey) && (
        <span style={{ fontSize: fontSize.sm, color: text.secondary, fontFamily: font.sans, minWidth: 200, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: space[1] }}>
          {rowCfg.markerKey && <MarkerIcon markerKey={rowCfg.markerKey} size={14} />}
          {rowCfg.label}
        </span>
      )}
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {slots.map(slot => (
          <PlayerChip key={slot.id} slot={slot} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
        ))}
        {slots.length === 0 && <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>—</span>}
        {rowCfg.textInput && textValues?.[rowCfg.key] && (
          <span style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, fontStyle: "italic" }}>{textValues[rowCfg.key]}</span>
        )}
      </div>
    </div>
  );
}

function PublicPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, searchName, wclScores, activeTab }) {
  const items = [];
  let lastSectionKey = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) { items.push({ type: "header", role: r.role, label: r.roleLabel || null }); lastSectionKey = sectionKey; }
    items.push({ type: "row", row: r });
  });
  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage}>
        {items.map((item, i) =>
          item.type === "header"
            ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
            : <PublicRow key={item.row.key} rowCfg={item.row} ids={assignments[item.row.key]}
                textValues={textValues} roster={roster} searchName={searchName}
                wclScores={wclScores} activeTab={activeTab} />
        )}
      </BossPanel>
    </div>
  );
}

function PublicCubeTeamsGrid({ assignments, roster, searchName, wclScores, activeTab }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[3], marginBottom: space[3],
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
              <PublicRow key={row.key} rowCfg={row} ids={assignments[row.key]}
                textValues={{}} roster={roster} searchName={searchName}
                wclScores={wclScores} activeTab={activeTab} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function TwentyFivePublic({ teamId }) {
  const night = teamId === "team-balls" ? "thu" : "tue";
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [liveSync,    setLiveSync]    = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [snapshots,   setSnapshots]   = useState([]);
  const [viewingSnap, setViewingSnap] = useState(null);
  const [activeTab,   setActiveTab]   = useState("mags");
  const [searchName,  setSearchName]  = useState("");

  const { scores: wclScores, loading: wclLoading, lastFetch: wclLastFetch, refetch: wclRefetch } =
    useWarcraftLogs(data?.roster ?? [], { teamId, module: "25man" });

  useEffect(() => {
    document.title = `NTMO 25-Man – ${teamId === "team-dick" ? "Team Dick" : "Team Balls"}`;
    if (!FIREBASE_OK) { setLoading(false); return; }

    setLoading(true); setLiveSync(false); setData(null);
    const unsub = subscribeToTwentyFiveState(teamId, night, snap => {
      setData(snap); setLoading(false); setLiveSync(true); setLastUpdate(new Date());
    });
    fetchTwentyFiveState(teamId, night).then(d => { if (d) { setData(d); setLoading(false); } }).catch(() => {});
    fetchTwentyFiveSnapshots(teamId).then(setSnapshots).catch(console.warn);
    return () => unsub();
  }, [teamId, night]);

  const nightSnaps      = snapshots.filter(s => s.night === night);
  const viewSnap        = viewingSnap ? nightSnaps.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : (data?.assignments ?? {});
  const viewRoster      = viewSnap ? (viewSnap.roster ?? []) : (data?.roster ?? []);
  const viewTextInputs  = viewSnap ? (viewSnap.textInputs ?? {}) : (data?.textInputs ?? {});
  const viewRaidDate    = viewSnap ? viewSnap.raidDate : data?.raidDate;
  const viewRaidLeader  = viewSnap ? viewSnap.raidLeader : data?.raidLeader;
  const hasData         = viewRoster.length > 0;
  const nightColor      = night === "tue" ? intent.success : accent.blue;
  const nightLabel      = night === "tue" ? "Tuesday" : "Thursday";

  return (
    <AppShell teamId={teamId} parsePanelContent={
      <ParseScoresPanel scores={wclScores} roster={viewRoster} module="25man"
        loading={wclLoading} lastFetch={wclLastFetch} onRefetch={wclRefetch} onWclNameChange={null} />
    }>
      <ModuleHeader
        icon="⚔"
        title="25-Man Raids"
        breadcrumb={`${teamId === "team-dick" ? "Team Dick" : "Team Balls"} / 25-Man`}
        mobileActions={<>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
        </>}
        actions={<>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <SearchBox value={searchName} onChange={setSearchName} placeholder="Search your name…" />
          {FIREBASE_OK && nightSnaps.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: space[1] }}>
              <button onClick={() => { const idx = viewingSnap ? nightSnaps.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx + 1 < nightSnaps.length ? nightSnaps[idx + 1].id : null); }} disabled={viewingSnap === nightSnaps[nightSnaps.length - 1]?.id} style={{ ...btnStyle("default"), padding: "0 8px", opacity: viewingSnap === nightSnaps[nightSnaps.length - 1]?.id ? 0.3 : 1 }}>‹</button>
              <span style={{ fontSize: fontSize.xs, color: viewSnap ? (viewSnap.locked ? "#9980D4" : text.secondary) : intent.success, fontFamily: font.sans, minWidth: 130, textAlign: "center" }}>
                {viewSnap ? `${viewSnap.locked ? "🔒" : "📸"} ${viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}` : "Current Week"}
              </span>
              <button onClick={() => { const idx = viewingSnap ? nightSnaps.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx > 0 ? nightSnaps[idx - 1].id : null); }} disabled={!viewingSnap} style={{ ...btnStyle("default"), padding: "0 8px", opacity: !viewingSnap ? 0.3 : 1 }}>›</button>
            </div>
          )}
        </>}
      />

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !hasData ? (
        <EmptyState icon="⚔" title="No assignments published yet" message={`The raid leader hasn't published ${nightLabel} 25-man assignments yet — check back soon.`} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[3] }}>

          {/* Locked snapshot banner */}
          {isLocked && viewSnap && (
            <div style={{ marginBottom: space[3], padding: `${space[2]}px ${space[3]}px`, background: surface.panel, border: `1px solid ${"#9980D4"}33`, borderRadius: radius.base, display: "flex", alignItems: "center", gap: space[3] }}>
              <StatusChip type="locked">🔒 Locked</StatusChip>
              {viewRaidDate   && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>📅 {viewRaidDate}</span>}
              {viewRaidLeader && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>👤 {viewRaidLeader}</span>}
              {viewSnap.wclReportUrl && <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: accent.blue,   fontFamily: font.sans, textDecoration: "none" }}>📊 WarcraftLogs →</a>}
              {viewSnap.sheetUrl     && <a href={viewSnap.sheetUrl}     target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>📊 RPB Sheet →</a>}
              {viewSnap.combatLogUrl && <a href={viewSnap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>⚔ Combat Log →</a>}
            </div>
          )}

          {/* Date / leader bar */}
          {(viewRaidDate || viewRaidLeader) && !isLocked && (
            <div style={{ marginBottom: space[3], fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, display: "flex", gap: space[3] }}>
              {viewRaidDate   && <span>📅 {viewRaidDate}</span>}
              {viewRaidLeader && <span>👤 {viewRaidLeader}</span>}
            </div>
          )}

          {/* Tab bar — segmented control style */}
          <div style={{
            display: "flex", marginBottom: space[3],
            background: surface.panel, border: `1px solid ${border.subtle}`,
            borderRadius: radius.base, padding: 3, gap: 2, width: "fit-content",
          }}>
            {[["mags","Magtheridon"],["gruul","Gruul's Lair"]].map(([tab, label]) => (
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

          {activeTab === "mags" && (<>
            <PublicCubeTeamsGrid assignments={viewAssignments} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
            <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
              <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage="mags" rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
              <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage="mags" rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
            </div>
          </>)}

          {activeTab === "gruul" && (
            <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
              <PublicPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage="maulgar" rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
              <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage="gruul" rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />
            </div>
          )}

          {/* General assignments — bottom */}
          <div style={{ marginTop: space[3], display: "flex", flexWrap: "wrap", gap: 0, background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
            <div style={{ flex: 1, minWidth: 260, borderRight: `1px solid ${border.subtle}`, borderBottom: `1px solid ${border.subtle}` }}>
              <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}>
                <span style={{ fontSize: fontSize.xs, color: "#8788EE", fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Warlock Curses</span>
              </div>
              {GENERAL_CURSES.map(row => <PublicRow key={row.key} rowCfg={row} ids={viewAssignments[row.key]} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />)}
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}` }}>
                <span style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase" }}>Trash Interrupts</span>
              </div>
              {GENERAL_INTERRUPTS.map(row => <PublicRow key={row.key} rowCfg={row} ids={viewAssignments[row.key]} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} wclScores={wclScores} activeTab={activeTab} />)}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

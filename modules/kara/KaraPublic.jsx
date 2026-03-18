import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, layout,
} from "../../shared/theme";
import { getRole, getColor, getSpecDisplay, KARA_TUE_TEAMS, KARA_THU_TEAMS } from "../../shared/constants";
import {
  AppShell, ModuleHeader, StatusChip, SyncBadge, SearchBox,
  EmptyState, LoadingSpinner, KaraPlayerBadge, ParseScoresPanel,
} from "../../shared/components";
import {
  fetchKaraState, subscribeToKaraState, fetchKaraSnapshots, isFirebaseConfigured,
} from "../../shared/firebase";
import { useWarcraftLogs, getScoreForPlayer, getScoreColor } from "../../shared/useWarcraftLogs";

const FIREBASE_OK = isFirebaseConfigured();

const UTILITY = {
  removeCurse: { label: "Remove Curse", icon: "🧹", specs: new Set(["Balance","Restoration","Feral","Guardian","Arcane","Fire","Frost"]) },
  dispelMagic: { label: "Dispel Magic", icon: "✨", specs: new Set(["Holy","Holy1","Discipline","Shadow"]) },
  curePoison:  { label: "Cure Poison",  icon: "🧪", specs: new Set(["Balance","Restoration","Feral","Guardian","Restoration1"]) },
  cureDisease: { label: "Cure Disease", icon: "💊", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution"]) },
  interrupt:   { label: "Interrupt",    icon: "⚡", specs: new Set(["Arms","Fury","Protection","Assassination","Combat","Subtlety","Enhancement","Retribution","Protection1","Feral","Guardian"]) },
  bloodlust:   { label: "Bloodlust",    icon: "🥁", specs: new Set(["Elemental","Enhancement","Restoration1"]) },
};

function PlayerSlot({ ids, allRosters, searchName, wclScores }) {
  const slots = (Array.isArray(ids) ? ids : [ids]).map(id => allRosters.find(p => p.id === id)).filter(Boolean);
  return (
    <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 3 }}>
      {slots.map(slot => {
        const color      = getColor(slot);
        const nameMatch  = searchName && slot.name.toLowerCase().includes(searchName.toLowerCase());
        const score      = getScoreForPlayer(wclScores, slot, "kara");
        const scoreColor = getScoreColor(score);
        return (
          <span key={slot.id} style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            background: nameMatch ? `${color}30` : `${color}18`,
            border: `1px solid ${nameMatch ? color : color + "44"}`,
            borderRadius: radius.sm, padding: "2px 7px",
            color, fontFamily: font.sans, fontSize: fontSize.sm,
            boxShadow: nameMatch ? `0 0 6px ${color}55` : "none",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontWeight: nameMatch ? fontWeight.bold : fontWeight.semibold }}>{slot.name}</span>
            <span style={{ color: `${color}88`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)}</span>
            {score != null && <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: scoreColor, fontFamily: font.mono }}>{Math.round(score)}</span>}
            {nameMatch && <span style={{ color, fontSize: 9 }}>◄</span>}
          </span>
        );
      })}
    </div>
  );
}

function KaraTeamCard({ team, teamNum, color, viewAssignments, allRosters, searchName, wclScores }) {
  const allRows     = [...team.g1, ...team.g2];
  const filledCount = allRows.filter(r => viewAssignments[r.key]).length;
  const teamPlayers = allRows
    .flatMap(r => viewAssignments[r.key] ? (Array.isArray(viewAssignments[r.key]) ? viewAssignments[r.key] : [viewAssignments[r.key]]) : [])
    .map(id => allRosters.find(p => p.id === id)).filter(Boolean);
  const tankCount   = teamPlayers.filter(p => getRole(p) === "Tank").length;
  const healerCount = teamPlayers.filter(p => getRole(p) === "Healer").length;
  const has = {};
  Object.keys(UTILITY).forEach(k => { has[k] = teamPlayers.some(p => UTILITY[k].specs.has(p.specName)); });

  return (
    <div style={{ flex: 1, background: surface.panel, border: `1px solid ${color}33`, borderRadius: radius.lg, overflow: "hidden" }}>
      <div style={{ padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color}22`, display: "flex", alignItems: "center", gap: space[2], background: `${color}08` }}>
        <span style={{ fontSize: fontSize.sm, color, fontFamily: font.sans, fontWeight: fontWeight.bold }}>🏰 TEAM {teamNum}</span>
        <span style={{ fontSize: fontSize.xs, color: "#4C90F0", fontFamily: font.sans }}>🛡 {tankCount}</span>
        <span style={{ fontSize: fontSize.xs, color: "#32A467", fontFamily: font.sans }}>💚 {healerCount}</span>
        <span style={{ fontSize: fontSize.xs, color: text.muted, marginLeft: "auto", fontFamily: font.sans }}>{filledCount}/10</span>
      </div>
      {filledCount > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: `${space[1]}px ${space[2]}px`, borderBottom: `1px solid ${color}11`, background: surface.base }}>
          {Object.entries(UTILITY).map(([k, u]) => (
            <span key={k} style={{ fontSize: 9, fontFamily: font.sans, padding: "1px 5px", borderRadius: radius.sm, background: has[k] ? `${intent.success}15` : `${intent.danger}15`, border: `1px solid ${has[k] ? intent.success + "33" : intent.danger + "33"}`, color: has[k] ? intent.success : `${intent.danger}88` }}>
              {u.icon} {u.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex" }}>
        {[team.g1, team.g2].map((group, gi) => {
          const filled = group.filter(r => viewAssignments[r.key]).length;
          return (
            <div key={gi} style={{ flex: 1, borderRight: gi === 0 ? `1px solid ${color}18` : "none" }}>
              <div style={{ padding: `3px ${space[2]}px`, borderBottom: `1px solid ${color}11`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, color: `${color}88`, fontFamily: font.sans, letterSpacing: "0.1em" }}>GROUP {gi + 1}</span>
                <span style={{ fontSize: 9, color: text.muted, fontFamily: font.sans }}>{filled}/5</span>
              </div>
              {group.map(row => {
                const ids = viewAssignments[row.key];
                if (!ids) return (
                  <div key={row.key} style={{ minHeight: layout.rowHeight, borderBottom: `1px solid ${border.subtle}`, padding: `${space[1]}px ${space[2]}px` }}>
                    <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>—</span>
                  </div>
                );
                return (
                  <div key={row.key} style={{ padding: `${space[1]}px ${space[2]}px`, borderBottom: `1px solid ${border.subtle}`, minHeight: layout.rowHeight, display: "flex", alignItems: "center" }}>
                    <PlayerSlot ids={ids} allRosters={allRosters} searchName={searchName} wclScores={wclScores} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NightSection({ label, teams, color, viewAssignments, allRosters, searchName, wclScores }) {
  return (
    <div style={{ marginBottom: space[6] }}>
      <div style={{ display: "flex", alignItems: "center", gap: space[3], marginBottom: space[3], padding: `${space[2]}px ${space[3]}px`, background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base }}>
        <div style={{ width: 3, height: 18, borderRadius: 1, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color, fontFamily: font.sans }}>{label}</span>
        <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>3 TEAMS · 2 GROUPS OF 5</span>
      </div>
      <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
        {teams.map((team, i) => (
          <KaraTeamCard key={i} team={team} teamNum={i + 1} color={color}
            viewAssignments={viewAssignments} allRosters={allRosters}
            searchName={searchName} wclScores={wclScores} />
        ))}
      </div>
    </div>
  );
}

export default function KaraPublic() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [liveSync,    setLiveSync]    = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [snapshots,   setSnapshots]   = useState([]);
  const [viewingSnap, setViewingSnap] = useState(null);
  const [searchName,  setSearchName]  = useState("");

  const roster = [...(data?.rosterTue ?? []), ...(data?.rosterThu ?? [])];
  const { scores: wclScores, loading: wclLoading, lastFetch: wclLastFetch, refetch: wclRefetch } =
    useWarcraftLogs(roster, { teamId: "shared", module: "kara" });

  useEffect(() => {
    document.title = "NTMO · Karazhan";
    if (!FIREBASE_OK) { setLoading(false); return; }
    const unsub = subscribeToKaraState(snap => {
      setData(snap); setLoading(false); setLiveSync(true); setLastUpdate(new Date());
    });
    fetchKaraState().then(d => { if (d) { setData(d); setLoading(false); } }).catch(() => {});
    fetchKaraSnapshots().then(setSnapshots).catch(console.warn);
    return () => unsub();
  }, []);

  const viewSnap        = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : (data?.assignments ?? {});
  const viewRosterTue   = viewSnap ? (viewSnap.rosterTue ?? []) : (data?.rosterTue ?? []);
  const viewRosterThu   = viewSnap ? (viewSnap.rosterThu ?? []) : (data?.rosterThu ?? []);
  const allRosters      = [...viewRosterTue, ...viewRosterThu];
  const hasData         = allRosters.length > 0;

  return (
    <AppShell>
      <ModuleHeader
        icon="🏰"
        title="Karazhan"
        breadcrumb="Karazhan"
        actions={<>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <SearchBox value={searchName} onChange={setSearchName} placeholder="Search your name…" />
          {FIREBASE_OK && snapshots.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: space[1] }}>
              <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx + 1 < snapshots.length ? snapshots[idx + 1].id : null); }} disabled={viewingSnap === snapshots[snapshots.length - 1]?.id} style={{ ...btnStyle("default"), padding: "0 8px", opacity: viewingSnap === snapshots[snapshots.length - 1]?.id ? 0.3 : 1 }}>‹</button>
              <span style={{ fontSize: fontSize.xs, color: viewSnap ? (viewSnap.locked ? "#9980D4" : text.secondary) : intent.success, fontFamily: font.sans, minWidth: 140, textAlign: "center" }}>
                {viewSnap ? `${viewSnap.locked ? "🔒" : "📸"} ${viewSnap.raidDateTue || viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}` : "⚡ Current Week"}
              </span>
              <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx > 0 ? snapshots[idx - 1].id : null); }} disabled={!viewingSnap} style={{ ...btnStyle("default"), padding: "0 8px", opacity: !viewingSnap ? 0.3 : 1 }}>›</button>
            </div>
          )}
        </>}
      />
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !hasData ? (
        <EmptyState icon="🏰" title="No assignments published yet" message="The raid leader hasn't published Karazhan assignments yet — check back soon." />
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Main content */}
          <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
            {isLocked && viewSnap && (
              <div style={{ marginBottom: space[3], padding: `${space[2]}px ${space[3]}px`, background: surface.panel, border: `1px solid ${"#9980D4"}33`, borderRadius: radius.base, display: "flex", alignItems: "center", gap: space[3] }}>
                <StatusChip type="locked">🔒 Locked</StatusChip>
                {viewSnap.wclReportUrl && <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: accent.blue,   fontFamily: font.sans, textDecoration: "none" }}>📊 WarcraftLogs →</a>}
                {viewSnap.sheetUrl     && <a href={viewSnap.sheetUrl}     target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>📊 RPB Sheet →</a>}
                {viewSnap.combatLogUrl && <a href={viewSnap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>⚔ Combat Log →</a>}
              </div>
            )}
            <NightSection label="📅 TUESDAY"  teams={KARA_TUE_TEAMS} color={intent.success} viewAssignments={viewAssignments} allRosters={allRosters} searchName={searchName} wclScores={wclScores} />
            <NightSection label="📅 THURSDAY" teams={KARA_THU_TEAMS} color={accent.blue}    viewAssignments={viewAssignments} allRosters={allRosters} searchName={searchName} wclScores={wclScores} />
          </div>

          {/* Parse scores panel — right sidebar */}
          <div style={{ width: 200, flexShrink: 0, borderLeft: `1px solid ${border.subtle}`, background: surface.panel, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <ParseScoresPanel
              scores={wclScores}
              roster={allRosters}
              module="kara"
              loading={wclLoading}
              lastFetch={wclLastFetch}
              onRefetch={wclRefetch}
              onWclNameChange={null}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

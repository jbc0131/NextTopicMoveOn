import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, layout,
} from "../../shared/theme";
import {
  getColor, getSpecDisplay, KARA_TUE_TEAMS, KARA_THU_TEAMS,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, StatusChip, EmptyState, LoadingSpinner, SearchBox,
} from "../../shared/components";
import {
  fetchAllSnapshots, updateKaraSnapshot, updateTwentyFiveSnapshot, isFirebaseConfigured,
} from "../../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function formatDate(snap) {
  if (snap.raidDate)    return snap.raidDate;
  if (snap.raidDateTue) return `Tue ${snap.raidDateTue} / Thu ${snap.raidDateThu || "?"}`;
  if (snap.savedAt)     return new Date(snap.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return "Unknown date";
}

function ModuleTag({ module }) {
  return (
    <StatusChip type={module === "kara" ? "blue" : "warning"}>
      {module === "kara" ? "🏰 Kara" : "⚔ 25-Man"}
    </StatusChip>
  );
}

function SnapshotCard({ snap, expanded, onToggle, onEditUrls, teamId }) {
  const [editMode, setEditMode]   = useState(false);
  const [wclUrl,   setWclUrl]     = useState(snap.wclReportUrl || "");
  const [sheetUrl, setSheetUrl]   = useState(snap.sheetUrl    || "");
  const [clogUrl,  setClogUrl]    = useState(snap.combatLogUrl || "");
  const [saving,   setSaving]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      wclReportUrl: wclUrl.trim() || null,
      sheetUrl:     sheetUrl.trim() || null,
      combatLogUrl: clogUrl.trim() || null,
    };
    await onEditUrls(snap, updates);
    setSaving(false);
    setEditMode(false);
  };

  const rosterCount = snap.module === "kara"
    ? ((snap.rosterTue?.length || 0) + (snap.rosterThu?.length || 0))
    : (snap.roster?.length || 0);

  return (
    <div style={{
      background: surface.panel, border: `1px solid ${snap.locked ? "#9980D433" : border.subtle}`,
      borderRadius: radius.lg, overflow: "hidden", marginBottom: space[3],
    }}>
      {/* Card header */}
      <div
        onClick={onToggle}
        style={{
          padding: `${space[2]}px ${space[4]}px`,
          display: "flex", alignItems: "center", gap: space[3],
          cursor: "pointer", background: snap.locked ? `${"#9980D4"}08` : surface.panel,
          borderBottom: expanded ? `1px solid ${border.subtle}` : "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
            {snap.locked && <span style={{ fontSize: 14 }}>🔒</span>}
            <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>{formatDate(snap)}</span>
            <ModuleTag module={snap.module} />
            {snap.module === "25man" && snap.night && (
              <StatusChip type={snap.night === "tue" ? "success" : "blue"}>{snap.night === "tue" ? "Tuesday" : "Thursday"}</StatusChip>
            )}
            {!snap.locked && <StatusChip type="neutral">Draft</StatusChip>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: space[3], flexWrap: "wrap" }}>
            {snap.raidLeader && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>👤 {snap.raidLeader}</span>}
            {rosterCount > 0 && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>👥 {rosterCount} players</span>}
            {snap.savedAt   && <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>Saved {new Date(snap.savedAt).toLocaleString()}</span>}
          </div>
        </div>

        {/* Resource links */}
        <div style={{ display: "flex", gap: space[2], alignItems: "center", flexShrink: 0 }}>
          {snap.wclReportUrl && <a href={snap.wclReportUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: accent.blue,   fontFamily: font.sans, textDecoration: "none" }}>📊 WCL →</a>}
          {snap.sheetUrl     && <a href={snap.sheetUrl}     target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>📊 Sheet →</a>}
          {snap.combatLogUrl && <a href={snap.combatLogUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>⚔ CLog →</a>}
          <button onClick={e => { e.stopPropagation(); setEditMode(v => !v); }} style={{ ...btnStyle("default"), padding: "0 8px", fontSize: fontSize.xs }}>✏</button>
          <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* URL edit panel */}
      {editMode && (
        <div style={{ padding: space[3], background: surface.card, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center", flexWrap: "wrap" }}>
          {[
            ["🔗 WarcraftLogs URL", wclUrl, setWclUrl],
            ["📊 RPB Sheet URL",    sheetUrl, setSheetUrl],
            ["⚔ Combat Log URL",   clogUrl, setClogUrl],
          ].map(([placeholder, val, setter]) => (
            <input key={placeholder} value={val} onChange={e => setter(e.target.value)} placeholder={placeholder}
              style={{ flex: "1 1 220px", height: 28, padding: "0 8px", borderRadius: radius.base, border: `1px solid ${border.subtle}`, background: surface.base, color: text.primary, fontFamily: font.sans, fontSize: fontSize.xs, outline: "none" }} />
          ))}
          <button onClick={handleSave} disabled={saving} style={{ ...btnStyle("success"), height: 28 }}>{saving ? "Saving…" : "✓ Save"}</button>
          <button onClick={() => setEditMode(false)} style={{ ...btnStyle("default"), height: 28 }}>Cancel</button>
        </div>
      )}

      {/* Expanded roster view */}
      {expanded && (
        <div style={{ padding: space[3] }}>
          {snap.module === "kara" ? (
            <KaraSnapDetail snap={snap} />
          ) : (
            <TwentyFiveSnapDetail snap={snap} />
          )}
        </div>
      )}
    </div>
  );
}

function PlayerChip({ slot }) {
  if (!slot) return null;
  const color = getColor(slot);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: radius.sm, padding: "1px 6px", color, fontFamily: font.sans, fontSize: fontSize.xs }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {slot.name}
      <span style={{ color: `${color}77`, fontSize: 9 }}>{getSpecDisplay(slot)}</span>
    </span>
  );
}

function KaraSnapDetail({ snap }) {
  const allRosters = [...(snap.rosterTue || []), ...(snap.rosterThu || [])];
  if (allRosters.length === 0 && snap.legacyRoster) {
    return (
      <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontStyle: "italic" }}>
        Legacy snapshot — roster data not split by night. {(snap.legacyRoster || []).length} total players.
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: space[2] }}>
          {(snap.legacyRoster || []).map(p => <PlayerChip key={p.id} slot={p} />)}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[3] }}>
      {[["📅 Tuesday", snap.rosterTue || [], KARA_TUE_TEAMS, intent.success], ["📅 Thursday", snap.rosterThu || [], KARA_THU_TEAMS, accent.blue]].map(([label, nightRoster, teams, color]) => {
        if (!nightRoster.length) return null;
        return (
          <div key={label}>
            <div style={{ fontSize: fontSize.xs, color, fontFamily: font.sans, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[2] }}>{label}</div>
            <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
              {teams.map((team, ti) => {
                const allRows    = [...team.g1, ...team.g2];
                const playerIds  = allRows.flatMap(r => {
                  const ids = snap.assignments?.[r.key];
                  return ids ? (Array.isArray(ids) ? ids : [ids]) : [];
                });
                const players    = [...new Set(playerIds)].map(id => nightRoster.find(p => p.id === id)).filter(Boolean);
                if (!players.length) return null;
                return (
                  <div key={ti} style={{ flex: "1 1 200px", background: surface.card, border: `1px solid ${color}22`, borderRadius: radius.base, padding: space[2] }}>
                    <div style={{ fontSize: fontSize.xs, color, fontFamily: font.sans, fontWeight: fontWeight.bold, marginBottom: space[1] }}>Team {ti + 1}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {players.map(p => <PlayerChip key={p.id} slot={p} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TwentyFiveSnapDetail({ snap }) {
  const roster = snap.roster || snap.legacyRoster || [];
  if (!roster.length) {
    return <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontStyle: "italic" }}>No roster data in this snapshot.</div>;
  }
  const allAssignRows = [...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2];
  const filledRows    = allAssignRows.filter(r => snap.assignments?.[r.key]);

  return (
    <div style={{ display: "flex", gap: space[6], flexWrap: "wrap" }}>
      {/* Roster */}
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.bold, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[2] }}>Roster ({roster.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {roster.map(p => <PlayerChip key={p.id} slot={p} />)}
        </div>
      </div>
      {/* Key assignments */}
      {filledRows.length > 0 && (
        <div style={{ flex: "1 1 220px" }}>
          <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.bold, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[2] }}>Assignments ({filledRows.length} filled)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {filledRows.slice(0, 12).map(row => {
              const ids   = snap.assignments[row.key];
              const idArr = Array.isArray(ids) ? ids : [ids];
              const slots = idArr.map(id => roster.find(p => p.id === id)).filter(Boolean);
              return (
                <div key={row.key} style={{ display: "flex", alignItems: "center", gap: space[2] }}>
                  <span style={{ fontSize: 10, color: text.muted, fontFamily: font.sans, minWidth: 160 }}>{row.label}</span>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {slots.map(s => <PlayerChip key={s.id} slot={s} />)}
                  </div>
                </div>
              );
            })}
            {filledRows.length > 12 && <span style={{ fontSize: 10, color: text.muted, fontFamily: font.sans, fontStyle: "italic" }}>…and {filledRows.length - 12} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoryView({ teamId }) {
  const [snapshots,  setSnapshots]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filter,     setFilter]     = useState("all"); // all | kara | 25man | locked
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    document.title = `NTMO History – ${teamId === "team-dick" ? "Team Dick" : "Team Balls"}`;
    if (!FIREBASE_OK) { setLoading(false); return; }
    fetchAllSnapshots(teamId, 60)
      .then(snaps => { setSnapshots(snaps); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  const handleEditUrls = async (snap, updates) => {
    if (snap.module === "kara") await updateKaraSnapshot(teamId, snap.id, updates);
    else                         await updateTwentyFiveSnapshot(teamId, snap.id, updates);
    setSnapshots(prev => prev.map(s => s.id === snap.id ? { ...s, ...updates } : s));
  };

  const filtered = snapshots.filter(s => {
    if (filter === "kara"   && s.module !== "kara")  return false;
    if (filter === "25man"  && s.module !== "25man") return false;
    if (filter === "locked" && !s.locked)            return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const inDate   = (s.raidDate || s.raidDateTue || "").toLowerCase().includes(q);
      const inLeader = (s.raidLeader || "").toLowerCase().includes(q);
      const inRoster = [...(s.roster || []), ...(s.rosterTue || []), ...(s.rosterThu || [])].some(p => p.name?.toLowerCase().includes(q));
      if (!inDate && !inLeader && !inRoster) return false;
    }
    return true;
  });

  const karaCount   = snapshots.filter(s => s.module === "kara").length;
  const tfCount     = snapshots.filter(s => s.module === "25man").length;
  const lockedCount = snapshots.filter(s => s.locked).length;

  return (
    <AppShell teamId={teamId}>
      <ModuleHeader
        icon="📜"
        title="Raid History"
        breadcrumb={`${teamId === "team-dick" ? "Team Dick" : "Team Balls"} / History`}
        subtitle={`${lockedCount} locked raids · ${snapshots.length} total snapshots`}
        actions={<SearchBox value={searchText} onChange={setSearchText} placeholder="Search name, date…" />}
      />

      {/* Filter bar */}
      <div style={{ padding: `${space[2]}px ${space[4]}px`, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center", background: surface.panel }}>
        {[
          ["all",    `All (${snapshots.length})`],
          ["locked", `🔒 Locked (${lockedCount})`],
          ["kara",   `🏰 Kara (${karaCount})`],
          ["25man",  `⚔ 25-Man (${tfCount})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ ...btnStyle(filter === val ? "primary" : "default"), height: 28, fontSize: fontSize.xs }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !snapshots.length ? (
        <EmptyState icon="📜" title="No raid history yet" message="Snapshots appear here once the raid leader saves or locks a raid night. Ask your raid leader to submit a WarcraftLogs report to create the first entry." />
      ) : !filtered.length ? (
        <EmptyState icon="🔍" title="No results" message={`No snapshots match "${searchText || filter}"`} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          {filtered.map(snap => (
            <SnapshotCard
              key={snap.id}
              snap={snap}
              teamId={teamId}
              expanded={expandedId === snap.id}
              onToggle={() => setExpandedId(prev => prev === snap.id ? null : snap.id)}
              onEditUrls={handleEditUrls}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

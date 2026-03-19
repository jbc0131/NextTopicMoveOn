import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle,
} from "../../shared/theme";
import {
  getColor, getSpecDisplay,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, StatusChip, EmptyState, LoadingSpinner, SearchBox,
} from "../../shared/components";
import { fetchTwentyFiveSnapshots, isFirebaseConfigured } from "../../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function formatDate(snap) {
  if (snap.raidDate) return snap.raidDate;
  if (snap.savedAt)  return new Date(snap.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return "Unknown date";
}

function normalizeEmbedUrl(url) {
  if (!url) return null;
  if (!url.includes("docs.google.com/spreadsheets")) return null;
  return url.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview");
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

function AssignmentsSection({ snap }) {
  const [open, setOpen] = useState(false);
  const roster = snap.roster || [];
  const allRows = [...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2];
  const filledRows = allRows.filter(r => snap.assignments?.[r.key]);

  return (
    <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left", padding: `${space[2]}px ${space[3]}px`, background: surface.panel, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: font.sans }}>
        <span style={{ fontSize: fontSize.xs, color: text.secondary, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Raid Assignments {filledRows.length > 0 ? `(${filledRows.length} filled)` : ""}
        </span>
        <span style={{ fontSize: fontSize.xs, color: text.muted }}>{open ? "▲ collapse" : "▼ expand"}</span>
      </button>
      {open && (
        <div style={{ padding: space[3], background: surface.base, display: "flex", gap: space[6], flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.bold, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[2] }}>Roster ({roster.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {roster.map(p => <PlayerChip key={p.id} slot={p} />)}
            </div>
          </div>
          {filledRows.length > 0 && (
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.bold, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[2] }}>Assignments</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {filledRows.map(row => {
                  const ids = snap.assignments[row.key];
                  const idArr = Array.isArray(ids) ? ids : [ids];
                  const slots = idArr.map(id => roster.find(p => p.id === id)).filter(Boolean);
                  if (!slots.length) return null;
                  return (
                    <div key={row.key} style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: text.muted, fontFamily: font.sans, minWidth: 160, flexShrink: 0 }}>{row.label}</span>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {slots.map(s => <PlayerChip key={s.id} slot={s} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SnapshotCard({ snap }) {
  const [expanded, setExpanded] = useState(false);
  const rpbUrl  = normalizeEmbedUrl(snap.sheetUrl);
  const clogUrl = normalizeEmbedUrl(snap.combatLogUrl);
  const nightLabel = snap.night === "tue" ? "Tuesday" : snap.night === "thu" ? "Thursday" : null;

  return (
    <div style={{ background: surface.panel, border: `1px solid ${snap.locked ? "#9980D433" : border.subtle}`, borderRadius: radius.lg, overflow: "hidden", marginBottom: space[3] }}>
      <div onClick={() => setExpanded(v => !v)} style={{ padding: `${space[3]}px ${space[4]}px`, display: "flex", alignItems: "center", gap: space[3], cursor: "pointer", background: snap.locked ? "#9980D408" : surface.panel }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
            {snap.locked ? <StatusChip type="locked">Locked</StatusChip> : <StatusChip type="neutral">Draft</StatusChip>}
            <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>{formatDate(snap)}</span>
            {nightLabel && <StatusChip type={snap.night === "tue" ? "success" : "blue"}>{nightLabel}</StatusChip>}
          </div>
          <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
            {snap.wclReportUrl && <a href={snap.wclReportUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: accent.blue, fontFamily: font.sans, textDecoration: "none" }}>WCL Report →</a>}
            {snap.sheetUrl     && <a href={snap.sheetUrl}     target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>RPB Sheet →</a>}
            {snap.combatLogUrl && <a href={snap.combatLogUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>Combat Log →</a>}
            {snap.roster?.length > 0 && <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>{snap.roster.length} players</span>}
          </div>
        </div>
        <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${border.subtle}` }}>
          {rpbUrl && (
            <div style={{ borderBottom: `1px solid ${border.subtle}` }}>
              <div style={{ padding: `${space[2]}px ${space[4]}px`, background: surface.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>Role Performance Breakdown</span>
                <a href={snap.sheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>Open in Sheets →</a>
              </div>
              <iframe src={`${rpbUrl}?rm=minimal#gid=548293748`} style={{ width: "100%", height: 560, border: "none", display: "block", background: surface.base }} title="RPB Analysis Sheet" allowFullScreen />
            </div>
          )}
          {clogUrl && (
            <div style={{ borderBottom: `1px solid ${border.subtle}` }}>
              <div style={{ padding: `${space[2]}px ${space[4]}px`, background: surface.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>Combat Log Analysis</span>
                <a href={snap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>Open in Sheets →</a>
              </div>
              <iframe src={`${clogUrl}?rm=minimal`} style={{ width: "100%", height: 560, border: "none", display: "block", background: surface.base }} title="Combat Log Analysis" allowFullScreen />
            </div>
          )}
          <div style={{ padding: space[3] }}>
            <AssignmentsSection snap={snap} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoryView() {
  const [snapshots,  setSnapshots]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState("all");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    document.title = "NTMO · Raid History";
    if (!FIREBASE_OK) { setLoading(false); return; }
    // Fetch from both teams in parallel
    Promise.all([
      fetchTwentyFiveSnapshots("team-dick",  60),
      fetchTwentyFiveSnapshots("team-balls", 60),
    ]).then(([dickSnaps, ballsSnaps]) => {
      const all = [...dickSnaps, ...ballsSnaps]
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      setSnapshots(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const tueCount = snapshots.filter(s => s.night === "tue").length;
  const thuCount = snapshots.filter(s => s.night === "thu").length;

  const filtered = snapshots.filter(s => {
    if (filter === "tue" && s.night !== "tue") return false;
    if (filter === "thu" && s.night !== "thu") return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const inDate   = (s.raidDate || "").toLowerCase().includes(q);
      const inLeader = (s.raidLeader || "").toLowerCase().includes(q);
      const inRoster = (s.roster || []).some(p => p.name?.toLowerCase().includes(q));
      if (!inDate && !inLeader && !inRoster) return false;
    }
    return true;
  });

  return (
    <AppShell>
      <ModuleHeader
        title="Raid History"
        breadcrumb="History"
        subtitle={`${snapshots.filter(s => s.locked).length} locked raids · ${snapshots.length} total`}
        mobileActions={null}
        actions={<SearchBox value={searchText} onChange={setSearchText} placeholder="Search name, date…" />}
      />

      <div style={{ padding: `${space[2]}px ${space[4]}px`, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center", background: surface.panel, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["all", `All (${snapshots.length})`],
          ["tue", `Tuesday (${tueCount})`],
          ["thu", `Thursday (${thuCount})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ ...btnStyle(filter === val ? "primary" : "default"), height: 28, fontSize: fontSize.xs }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !snapshots.length ? (
        <EmptyState title="No raid history yet" message="Locked raid weeks will appear here once the raid leader submits a WarcraftLogs report." />
      ) : !filtered.length ? (
        <EmptyState title="No results" message="No snapshots match your current filter." />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          {filtered.map(snap => <SnapshotCard key={snap.id} snap={snap} />)}
        </div>
      )}
    </AppShell>
  );
}

import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle, layout,
} from "../../shared/theme";
import { getColor, getSpecDisplay } from "../../shared/constants";
import {
  AppShell, ModuleHeader, StatusChip, EmptyState, LoadingSpinner,
  ConfirmDialog, SaveStatus,
} from "../../shared/components";
import {
  fetchTwentyFiveSnapshots, updateTwentyFiveSnapshot,
  deleteTwentyFiveSnapshot, isFirebaseConfigured,
} from "../../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function formatDate(snap) {
  if (snap.raidDate) return snap.raidDate;
  if (snap.savedAt)  return new Date(snap.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return "Unknown date";
}

// Fetch raid date from WCL report URL (same logic as old AdminView)
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
  } catch { return null; }
}

// ── Individual snapshot admin card ────────────────────────────────────────────
function HistoryAdminCard({ snap, onUpdate, onDelete }) {
  const [wclUrl,   setWclUrl]   = useState(snap.wclReportUrl || "");
  const [sheetUrl, setSheetUrl] = useState(snap.sheetUrl     || "");
  const [clogUrl,  setClogUrl]  = useState(snap.combatLogUrl || "");
  const [saving,   setSaving]   = useState("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const nightColor = snap.night === "tue" ? intent.success : accent.blue;
  const nightLabel = snap.night === "tue" ? "Tuesday" : snap.night === "thu" ? "Thursday" : null;

  const handleSave = async () => {
    setSaving("saving");
    const match = wclUrl.trim().match(/reports\/([A-Za-z0-9]+)/);
    const reportCode = match ? match[1] : null;
    let raidDate = snap.raidDate;

    // Auto-fetch date from WCL if URL changed and we have a report code
    if (reportCode && wclUrl.trim() !== (snap.wclReportUrl || "")) {
      const fetched = await fetchRaidDateFromReport(reportCode);
      if (fetched) raidDate = fetched;
    }

    const finalWclUrl = reportCode
      ? `https://fresh.warcraftlogs.com/reports/${reportCode}`
      : wclUrl.trim() || null;

    const normalizeSheet = (url) => url.trim()
      ? url.trim().replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview")
      : null;

    const updates = {
      wclReportUrl: finalWclUrl,
      sheetUrl:     normalizeSheet(sheetUrl),
      combatLogUrl: normalizeSheet(clogUrl),
      locked:       !!finalWclUrl,
      ...(raidDate ? { raidDate } : {}),
    };
    await onUpdate(snap.id, updates);
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 2500);
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Snapshot"
        message={`Permanently delete the ${formatDate(snap)} snapshot? This cannot be undone.`}
        confirmLabel="Delete"
        dangerous
        onConfirm={() => { setConfirmDelete(false); onDelete(snap.id); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <div style={{
        background: surface.panel,
        border: `1px solid ${snap.locked ? "#9980D433" : border.subtle}`,
        borderRadius: radius.lg, overflow: "hidden", marginBottom: space[3],
      }}>
        {/* Card header */}
        <div style={{
          padding: `${space[3]}px ${space[4]}px`,
          display: "flex", alignItems: "center", gap: space[3],
          background: snap.locked ? "#9980D408" : surface.panel,
          borderBottom: `1px solid ${border.subtle}`,
        }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
              {snap.locked
                ? <StatusChip type="locked">Locked</StatusChip>
                : <StatusChip type="neutral">Draft</StatusChip>
              }
              <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>
                {formatDate(snap)}
              </span>
              {nightLabel && (
                <StatusChip type={snap.night === "tue" ? "success" : "blue"}>{nightLabel}</StatusChip>
              )}
            </div>
            <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
              {snap.wclReportUrl && <a href={snap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: accent.blue, fontFamily: font.sans, textDecoration: "none" }}>WCL Report →</a>}
              {snap.sheetUrl     && <a href={snap.sheetUrl}     target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>RPB Sheet →</a>}
              {snap.combatLogUrl && <a href={snap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>Combat Log →</a>}
              <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>
                Saved {new Date(snap.savedAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: space[2], alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setExpanded(v => !v)} style={{ ...btnStyle("default"), height: 28, fontSize: fontSize.xs }}>
              {expanded ? "▲ Collapse" : "▼ Edit"}
            </button>
            <button onClick={() => setConfirmDelete(true)} style={{ ...btnStyle("danger"), height: 28, fontSize: fontSize.xs }}>
              Delete
            </button>
          </div>
        </div>

        {/* Edit panel */}
        {expanded && (
          <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, background: surface.card }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[3] }}>
              Report URLs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>WarcraftLogs Report URL</div>
                <input
                  value={wclUrl}
                  onChange={e => setWclUrl(e.target.value)}
                  placeholder="https://fresh.warcraftlogs.com/reports/…"
                  style={{ ...inputStyle, width: "100%" }}
                />
                <div style={{ fontSize: 10, color: text.disabled, fontFamily: font.sans, marginTop: 3 }}>
                  Pasting a WCL URL will auto-populate the raid date and lock this week.
                </div>
              </div>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>RPB Sheet URL</div>
                <input
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/…"
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>Combat Log Analysis URL</div>
                <input
                  value={clogUrl}
                  onChange={e => setClogUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/…"
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: space[2], marginTop: space[3], alignItems: "center" }}>
              <button onClick={handleSave} disabled={saving === "saving"} style={btnStyle(saving === "saved" ? "success" : "primary")}>
                {saving === "saving" ? "Saving…" : saving === "saved" ? "✓ Saved" : "Save"}
              </button>
              <button onClick={() => setExpanded(false)} style={btnStyle("default")}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main HistoryAdmin ─────────────────────────────────────────────────────────
export default function HistoryAdmin({ teamId }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all"); // all | tue | thu

  useEffect(() => {
    document.title = `NTMO History Admin – ${teamId === "team-dick" ? "Team Dick" : "Team Balls"}`;
    if (!FIREBASE_OK) { setLoading(false); return; }
    fetchTwentyFiveSnapshots(teamId, 60)
      .then(snaps => { setSnapshots(snaps); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  const handleUpdate = async (snapId, updates) => {
    await updateTwentyFiveSnapshot(teamId, snapId, updates);
    setSnapshots(prev => prev.map(s => s.id === snapId ? { ...s, ...updates } : s));
  };

  const handleDelete = async (snapId) => {
    await deleteTwentyFiveSnapshot(teamId, snapId);
    setSnapshots(prev => prev.filter(s => s.id !== snapId));
  };

  const tueCount = snapshots.filter(s => s.night === "tue").length;
  const thuCount = snapshots.filter(s => s.night === "thu").length;

  const filtered = snapshots.filter(s => {
    if (filter === "tue") return s.night === "tue";
    if (filter === "thu") return s.night === "thu";
    return true;
  });

  return (
    <AppShell teamId={teamId} adminMode>
      <ModuleHeader
        icon="📜"
        title="Raid History Admin"
        breadcrumb={`${teamId === "team-dick" ? "Team Dick" : "Team Balls"} / History / Admin`}
        subtitle={`${snapshots.length} snapshots · ${snapshots.filter(s => s.locked).length} locked`}
      />

      {/* Filter bar */}
      <div style={{
        padding: `${space[2]}px ${space[4]}px`,
        borderBottom: `1px solid ${border.subtle}`,
        display: "flex", gap: space[2], alignItems: "center",
        background: surface.panel, flexShrink: 0,
      }}>
        {[
          ["all", `All (${snapshots.length})`],
          ["tue", `Tuesday (${tueCount})`],
          ["thu", `Thursday (${thuCount})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ ...btnStyle(filter === val ? "primary" : "default"), height: 28, fontSize: fontSize.xs }}>
            {label}
          </button>
        ))}
        <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans, marginLeft: "auto" }}>
          Changes save immediately to Firebase
        </span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size={32} />
        </div>
      ) : !snapshots.length ? (
        <EmptyState
          title="No raid history yet"
          message="Snapshots appear here once the raid leader saves a raid night from the 25-Man admin page."
        />
      ) : !filtered.length ? (
        <EmptyState title="No results" message={`No ${filter === "tue" ? "Tuesday" : "Thursday"} snapshots found.`} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          {filtered.map(snap => (
            <HistoryAdminCard
              key={snap.id}
              snap={snap}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

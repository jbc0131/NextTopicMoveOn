import { useState, useEffect } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle,
} from "../../shared/theme";
import {
  AppShell, ModuleHeader, StatusChip, EmptyState, LoadingSpinner, ConfirmDialog,
} from "../../shared/components";
import {
  fetchTwentyFiveSnapshots, updateTwentyFiveSnapshot, deleteTwentyFiveSnapshot,
  saveTwentyFiveSnapshot, fetchTwentyFiveState, isFirebaseConfigured,
} from "../../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function formatDate(snap) {
  if (snap.raidDate) return snap.raidDate;
  if (snap.savedAt)  return new Date(snap.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return "Unknown date";
}

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

function HistoryAdminCard({ snap, onUpdate, onDelete }) {
  const [wclUrl,   setWclUrl]   = useState(snap.wclReportUrl || "");
  const [sheetUrl, setSheetUrl] = useState(snap.sheetUrl     || "");
  const [clogUrl,  setClogUrl]  = useState(snap.combatLogUrl || "");
  const [night,    setNight]    = useState(snap.night        || "");
  const [saving,   setSaving]   = useState("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(!snap.night);

  const nightLabel = snap.night === "tue" ? "Tuesday" : snap.night === "thu" ? "Thursday" : null;

  const handleSave = async () => {
    setSaving("saving");
    const match = wclUrl.trim().match(/reports\/([A-Za-z0-9]+)/);
    const reportCode = match ? match[1] : null;
    let raidDate = snap.raidDate;

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
      ...(night    ? { night }    : {}),
      ...(raidDate ? { raidDate } : {}),
    };
    await onUpdate(snap._teamId, snap.id, updates);
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
        onConfirm={() => { setConfirmDelete(false); onDelete(snap._teamId, snap.id); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <div style={{ background: surface.panel, border: `1px solid ${snap.locked ? "#9980D433" : border.subtle}`, borderRadius: radius.lg, overflow: "hidden", marginBottom: space[3] }}>
        {/* Header */}
        <div style={{ padding: `${space[3]}px ${space[4]}px`, display: "flex", alignItems: "center", gap: space[3], background: snap.locked ? "#9980D408" : surface.panel, borderBottom: `1px solid ${border.subtle}` }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
              {snap.locked ? <StatusChip type="locked">Locked</StatusChip> : <StatusChip type="neutral">Draft</StatusChip>}
              <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>{formatDate(snap)}</span>
              {nightLabel
                ? <StatusChip type={snap.night === "tue" ? "success" : "blue"}>{nightLabel}</StatusChip>
                : <StatusChip type="danger">Night unset</StatusChip>
              }
              <StatusChip type="neutral">{snap._teamId === "team-dick" ? "Team Dick" : "Team Balls"}</StatusChip>
            </div>
            <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
              {snap.wclReportUrl && <a href={snap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: accent.blue, fontFamily: font.sans, textDecoration: "none" }}>WCL Report →</a>}
              {snap.sheetUrl     && <a href={snap.sheetUrl}     target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.success, fontFamily: font.sans, textDecoration: "none" }}>RPB Sheet →</a>}
              {snap.combatLogUrl && <a href={snap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: fontSize.xs, color: intent.warning, fontFamily: font.sans, textDecoration: "none" }}>Combat Log →</a>}
              <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>Saved {new Date(snap.savedAt).toLocaleString()}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: space[2], flexShrink: 0 }}>
            <button onClick={() => setExpanded(v => !v)} style={{ ...btnStyle("default"), height: 28, fontSize: fontSize.xs }}>{expanded ? "▲ Collapse" : "▼ Edit"}</button>
            <button onClick={() => setConfirmDelete(true)} style={{ ...btnStyle("danger"), height: 28, fontSize: fontSize.xs }}>Delete</button>
          </div>
        </div>

        {/* Edit panel */}
        {expanded && (
          <div style={{ padding: space[4], background: surface.card, borderBottom: `1px solid ${border.subtle}` }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[3] }}>Report URLs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>WarcraftLogs Report URL</div>
                <input value={wclUrl} onChange={e => setWclUrl(e.target.value)} placeholder="https://fresh.warcraftlogs.com/reports/…" style={{ ...inputStyle, width: "100%" }} />
                <div style={{ fontSize: 10, color: text.disabled, fontFamily: font.sans, marginTop: 3 }}>Pasting a WCL URL will auto-populate the raid date and lock this week.</div>
              </div>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>RPB Sheet URL</div>
                <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>Combat Log Analysis URL</div>
                <input value={clogUrl} onChange={e => setClogUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <div style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, marginBottom: 4 }}>
                  Raid Night
                  {!snap.night && <span style={{ color: intent.danger, marginLeft: space[2], fontSize: 10 }}>⚠ Missing — required for Tuesday/Thursday filters</span>}
                </div>
                <div style={{ display: "flex", gap: space[2] }}>
                  {[["tue", "Tuesday"], ["thu", "Thursday"]].map(([val, label]) => (
                    <button key={val} onClick={() => setNight(val)} style={{ ...btnStyle(night === val ? (val === "tue" ? "success" : "primary") : "default"), height: 30, fontSize: fontSize.xs }}>{label}</button>
                  ))}
                  {night && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, alignSelf: "center" }}>Selected: {night === "tue" ? "Tuesday" : "Thursday"}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: space[2], marginTop: space[3] }}>
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

// ── Add Raid Week modal ───────────────────────────────────────────────────────
function AddRaidWeekModal({ onClose, onAdded }) {
  const [night,      setNight]      = useState("tue");
  const [wclUrl,     setWclUrl]     = useState("");
  const [sheetUrl,   setSheetUrl]   = useState("");
  const [clogUrl,    setClogUrl]    = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const teamId = night === "tue" ? "team-dick" : "team-balls";

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      // Fetch current live state for this team/night
      const liveState = await fetchTwentyFiveState(teamId, night);
      if (!liveState) throw new Error(`No live data found for ${night === "tue" ? "Tuesday" : "Thursday"}. Make sure assignments have been saved in the 25-Man admin first.`);

      // Auto-fetch date from WCL
      let raidDate = liveState.raidDate || "";
      const match = wclUrl.trim().match(/reports\/([A-Za-z0-9]+)/);
      const reportCode = match ? match[1] : null;
      if (reportCode) {
        try {
          const res = await fetch("/api/warcraftlogs-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fights", reportId: reportCode }) });
          if (res.ok) {
            const d = await res.json();
            if (d.start) { const dt = new Date(d.start); raidDate = `${dt.getMonth() + 1}-${dt.getDate()}-${String(dt.getFullYear()).slice(2)}`; }
          }
        } catch {}
      }

      const finalWclUrl  = reportCode ? `https://fresh.warcraftlogs.com/reports/${reportCode}` : wclUrl.trim() || null;
      const norm = url => url.trim() ? url.trim().replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview") : null;

      const extra = {
        ...(finalWclUrl          ? { wclReportUrl: finalWclUrl, locked: true } : {}),
        ...(norm(sheetUrl)       ? { sheetUrl: norm(sheetUrl) }                : {}),
        ...(norm(clogUrl)        ? { combatLogUrl: norm(clogUrl) }             : {}),
        ...(raidDate             ? { raidDate }                                : {}),
      };

      const snap = await saveTwentyFiveSnapshot(
        { roster: liveState.roster || [], assignments: liveState.assignments || {}, textInputs: liveState.textInputs || {}, raidDate, raidLeader: liveState.raidLeader || "" },
        teamId, night, extra
      );

      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.lg, padding: space[6], width: 520, maxWidth: "95vw", fontFamily: font.sans }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary, marginBottom: space[1] }}>Add Raid Week</div>
        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[4] }}>
          Creates a new history entry from the current live assignments in the 25-Man admin.
        </div>

        {/* Night selector */}
        <div style={{ marginBottom: space[3] }}>
          <div style={{ fontSize: fontSize.xs, color: text.secondary, marginBottom: space[2] }}>Raid Night</div>
          <div style={{ display: "flex", gap: space[2] }}>
            {[["tue", "Tuesday (Team Dick)"], ["thu", "Thursday (Team Balls)"]].map(([val, label]) => (
              <button key={val} onClick={() => setNight(val)}
                style={{ ...btnStyle(night === val ? (val === "tue" ? "success" : "primary") : "default"), flex: 1 }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2], marginBottom: space[4] }}>
          <div>
            <div style={{ fontSize: fontSize.xs, color: text.secondary, marginBottom: 4 }}>WarcraftLogs Report URL</div>
            <input value={wclUrl} onChange={e => setWclUrl(e.target.value)} placeholder="https://fresh.warcraftlogs.com/reports/… (auto-fills date + locks week)" style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <div style={{ fontSize: fontSize.xs, color: text.secondary, marginBottom: 4 }}>RPB Sheet URL <span style={{ color: text.disabled }}>(optional)</span></div>
            <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <div style={{ fontSize: fontSize.xs, color: text.secondary, marginBottom: 4 }}>Combat Log Analysis URL <span style={{ color: text.disabled }}>(optional)</span></div>
            <input value={clogUrl} onChange={e => setClogUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        {error && <div style={{ fontSize: fontSize.xs, color: intent.danger, fontFamily: font.sans, marginBottom: space[3], padding: space[2], background: `${intent.danger}10`, borderRadius: radius.base, border: `1px solid ${intent.danger}33` }}>{error}</div>}

        <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle("default")}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnStyle("primary")}>
            {saving ? "Saving…" : "Save to History"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoryAdmin() {
  const [snapshots,    setSnapshots]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const loadSnapshots = () => {
    if (!FIREBASE_OK) { setLoading(false); return; }
    Promise.all([
      fetchTwentyFiveSnapshots("team-dick",  60),
      fetchTwentyFiveSnapshots("team-balls", 60),
    ]).then(([dickSnaps, ballsSnaps]) => {
      const tagged = [
        ...dickSnaps.map(s => ({ ...s, _teamId: "team-dick"  })),
        ...ballsSnaps.map(s => ({ ...s, _teamId: "team-balls" })),
      ].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      setSnapshots(tagged);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    document.title = "NTMO · Raid History Admin";
    loadSnapshots();
  }, []);

  const handleUpdate = async (teamId, snapId, updates) => {
    await updateTwentyFiveSnapshot(teamId, snapId, updates);
    setSnapshots(prev => prev.map(s => s.id === snapId && s._teamId === teamId ? { ...s, ...updates } : s));
  };

  const handleDelete = async (teamId, snapId) => {
    await deleteTwentyFiveSnapshot(teamId, snapId);
    setSnapshots(prev => prev.filter(s => !(s.id === snapId && s._teamId === teamId)));
  };

  const tueCount = snapshots.filter(s => s.night === "tue").length;
  const thuCount = snapshots.filter(s => s.night === "thu").length;
  const untagged = snapshots.filter(s => !s.night).length;

  const filtered = snapshots.filter(s => {
    if (filter === "tue") return s.night === "tue";
    if (filter === "thu") return s.night === "thu";
    return true;
  });

  return (
    <AppShell adminMode>
      {showAddModal && (
        <AddRaidWeekModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setLoading(true); loadSnapshots(); }}
        />
      )}

      <ModuleHeader
        title="Raid History Admin"
        breadcrumb="History / Admin"
        subtitle={`${snapshots.length} snapshots · ${snapshots.filter(s => s.locked).length} locked${untagged > 0 ? ` · ${untagged} missing night` : ""}`}
        actions={
          <button onClick={() => setShowAddModal(true)} style={btnStyle("primary")}>+ Add Raid Week</button>
        }
      />

      <div style={{ padding: `${space[2]}px ${space[4]}px`, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[2], alignItems: "center", background: surface.panel, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["all", `All (${snapshots.length})`],
          ["tue", `Tuesday (${tueCount})`],
          ["thu", `Thursday (${thuCount})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ ...btnStyle(filter === val ? "primary" : "default"), height: 28, fontSize: fontSize.xs }}>{label}</button>
        ))}
        {untagged > 0 && (
          <span style={{ fontSize: fontSize.xs, color: intent.danger, fontFamily: font.sans, marginLeft: "auto" }}>
            {untagged} snapshot{untagged > 1 ? "s" : ""} missing night — expand to fix
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !snapshots.length ? (
        <EmptyState title="No raid history yet" message="Click '+ Add Raid Week' to create your first entry from the current live assignments." />
      ) : !filtered.length ? (
        <EmptyState title="No results" message={`No ${filter === "tue" ? "Tuesday" : "Thursday"} snapshots found.`} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          {filtered.map(snap => (
            <HistoryAdminCard key={`${snap._teamId}-${snap.id}`} snap={snap} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

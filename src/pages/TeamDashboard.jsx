import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, chipStyle,
} from "../shared/theme";
import { RAID_TEAMS } from "../shared/constants";
import {
  AppShell, ModuleHeader, StatusChip, LoadingSpinner, EmptyState,
} from "../shared/components";
import {
  fetchKaraSummary, fetchTwentyFiveSummary, fetchAllSnapshots,
  isFirebaseConfigured,
} from "../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function SummaryCard({ icon, title, description, onClick, children, loading }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: "1 1 280px", minWidth: 260,
        background: surface.panel, border: `1px solid ${border.subtle}`,
        borderRadius: radius.lg, overflow: "hidden",
        cursor: "pointer", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = accent.blue}
      onMouseLeave={e => e.currentTarget.style.borderColor = border.subtle}
    >
      {/* Card header */}
      <div style={{
        padding: `${space[3]}px ${space[4]}px`,
        borderBottom: `1px solid ${border.subtle}`,
        display: "flex", alignItems: "center", gap: space[2],
        background: surface.card,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>{title}</div>
          {description && <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>{description}</div>}
        </div>
        <div style={{ marginLeft: "auto", fontSize: fontSize.xs, color: accent.blue, fontFamily: font.sans }}>View →</div>
      </div>

      {/* Card body */}
      <div style={{ padding: space[4] }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: space[4] }}>
            <LoadingSpinner />
          </div>
        ) : children}
      </div>
    </div>
  );
}

function StatRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: `${space[1]}px 0`, borderBottom: `1px solid ${border.subtle}`,
    }}>
      <span style={{ fontSize: fontSize.sm, color: text.secondary, fontFamily: font.sans }}>{label}</span>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: valueColor || text.primary, fontFamily: font.sans }}>{value}</span>
    </div>
  );
}

export default function TeamDashboard({ teamId }) {
  const navigate = useNavigate();
  const team     = RAID_TEAMS.find(t => t.id === teamId);

  const [karaSummary,    setKaraSummary]    = useState(null);
  const [tfTueSummary,   setTfTueSummary]   = useState(null);
  const [tfThuSummary,   setTfThuSummary]   = useState(null);
  const [recentSnaps,    setRecentSnaps]    = useState([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (!FIREBASE_OK) { setLoading(false); return; }
    Promise.all([
      fetchKaraSummary(teamId),
      fetchTwentyFiveSummary(teamId, "tue"),
      fetchTwentyFiveSummary(teamId, "thu"),
      fetchAllSnapshots(teamId, 5),
    ]).then(([kara, tfTue, tfThu, snaps]) => {
      setKaraSummary(kara);
      setTfTueSummary(tfTue);
      setTfThuSummary(tfThu);
      setRecentSnaps(snaps.filter(s => s.locked).slice(0, 3));
    }).catch(console.warn)
      .finally(() => setLoading(false));
  }, [teamId]);

  return (
    <AppShell teamId={teamId}>
      <ModuleHeader
        icon="🏠"
        title={team?.name || teamId}
        subtitle="Raid assignment dashboard"
        breadcrumb="Dashboard"
      />

      <div style={{ padding: space[4], display: "flex", flexWrap: "wrap", gap: space[4] }}>

        {/* Karazhan card */}
        <SummaryCard
          icon="🏰"
          title="Karazhan"
          description="10-man — Tuesday & Thursday"
          onClick={() => navigate(`/${teamId}/kara`)}
          loading={loading && FIREBASE_OK}
        >
          {karaSummary ? (<>
            <StatRow label="Tuesday date"  value={karaSummary.raidDateTue || "Not set"} />
            <StatRow label="Thursday date" value={karaSummary.raidDateThu || "Not set"} />
            <StatRow label="Tuesday roster"  value={`${karaSummary.rosterTueCount} players`} />
            <StatRow label="Thursday roster" value={`${karaSummary.rosterThuCount} players`} />
            <StatRow
              label="Slots filled"
              value={`${karaSummary.filledSlots} / ${karaSummary.totalSlots}`}
              valueColor={karaSummary.filledSlots === karaSummary.totalSlots ? intent.success : text.primary}
            />
          </>) : (
            <div style={{ fontSize: fontSize.sm, color: text.muted, fontFamily: font.sans }}>
              {FIREBASE_OK ? "No data yet" : "Firebase not configured"}
            </div>
          )}
        </SummaryCard>

        {/* T4 - Gruuls / Mags card */}
        <SummaryCard
          icon="⚔"
          title="T4 - Gruuls / Mags"
          description="Gruul's Lair & Magtheridon"
          onClick={() => navigate(`/${teamId}/gruulmag`)}
          loading={loading && FIREBASE_OK}
        >
          {(tfTueSummary || tfThuSummary) ? (<>
            {tfTueSummary && <>
              <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: space[1] }}>Tuesday</div>
              <StatRow label="Raid date"   value={tfTueSummary.raidDate   || "Not set"} />
              <StatRow label="Raid leader" value={tfTueSummary.raidLeader || "Not set"} />
              <StatRow label="Roster"      value={`${tfTueSummary.rosterCount} players`} />
            </>}
            {tfThuSummary && <>
              <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: space[3], marginBottom: space[1] }}>Thursday</div>
              <StatRow label="Raid date"   value={tfThuSummary.raidDate   || "Not set"} />
              <StatRow label="Raid leader" value={tfThuSummary.raidLeader || "Not set"} />
              <StatRow label="Roster"      value={`${tfThuSummary.rosterCount} players`} />
            </>}
          </>) : (
            <div style={{ fontSize: fontSize.sm, color: text.muted, fontFamily: font.sans }}>
              {FIREBASE_OK ? "No data yet" : "Firebase not configured"}
            </div>
          )}
        </SummaryCard>

        {/* History card */}
        <SummaryCard
          icon="📜"
          title="Raid History"
          description="Past raids, WCL reports, RPB sheets"
          onClick={() => navigate(`/${teamId}/history`)}
          loading={loading && FIREBASE_OK}
        >
          {recentSnaps.length > 0 ? (
            recentSnaps.map(snap => (
              <div key={snap.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: `${space[1]}px 0`, borderBottom: `1px solid ${border.subtle}`,
              }}>
                <div>
                  <div style={{ fontSize: fontSize.sm, color: text.primary, fontFamily: font.sans }}>
                    {snap.raidDate || new Date(snap.savedAt).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, marginTop: 1 }}>
                    {snap.module === "kara" ? "🏰 Karazhan" : "⚔ T4"}
                    {snap.raidLeader ? ` · ${snap.raidLeader}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: space[1] }}>
                  {snap.wclReportUrl && (
                    <a href={snap.wclReportUrl} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: fontSize.xs, color: accent.blue, fontFamily: font.sans, textDecoration: "none" }}
                    >WCL →</a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: fontSize.sm, color: text.muted, fontFamily: font.sans }}>
              {FIREBASE_OK ? "No locked snapshots yet" : "Firebase not configured"}
            </div>
          )}
        </SummaryCard>

      </div>
    </AppShell>
  );
}

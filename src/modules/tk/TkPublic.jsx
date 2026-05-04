import { useState, useEffect } from "react";
import {
  surface, border, text, accent, font, fontSize,
  fontWeight, radius, space, layout,
} from "../../shared/theme";
import {
  getColor, getSpecDisplay, TK_BOSSES,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, BossPanel, RoleHeader, SubSectionDivider, MarkerIcon,
  SyncBadge, SearchBox, EmptyState, LoadingSpinner,
} from "../../shared/components";
import {
  fetchTkState, subscribeToTkState, isFirebaseConfigured,
} from "../../shared/firebase";

const FIREBASE_OK = isFirebaseConfigured();

function PlayerChip({ slot, searchName }) {
  if (!slot) return null;
  const color     = getColor(slot);
  const nameMatch = searchName && slot.name.toLowerCase().includes(searchName.toLowerCase());
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

function PublicRow({ rowCfg, ids, textValues, roster, searchName }) {
  const slots = ids ? (Array.isArray(ids) ? ids : [ids]).map(id => roster.find(s => s.id === id)).filter(Boolean) : [];
  const noteText = rowCfg.textInput ? textValues?.[rowCfg.key] : null;
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
          <PlayerChip key={slot.id} slot={slot} searchName={searchName} />
        ))}
        {slots.length === 0 && !noteText && <span style={{ fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>-</span>}
        {noteText && (
          <span style={{ fontSize: fontSize.xs, color: text.secondary, fontFamily: font.sans, fontStyle: "italic" }}>{noteText}</span>
        )}
      </div>
      {rowCfg.hint && !rowCfg.textInput && (
        <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontStyle: "italic", maxWidth: 220, textAlign: "right", lineHeight: 1.2 }}>
          {rowCfg.hint}
        </span>
      )}
    </div>
  );
}

function PublicPanel({ title, subtitle, rows, assignments, textValues, roster, searchName }) {
  const items = [];
  let lastSectionKey = null;
  let lastSubSection = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) {
      items.push({ type: "header", role: r.role, label: r.roleLabel || null });
      lastSectionKey = sectionKey;
      lastSubSection = null;
    }
    if (r.subSection && r.subSection !== lastSubSection) {
      items.push({ type: "subdivider", label: r.subSection });
      lastSubSection = r.subSection;
    }
    items.push({ type: "row", row: r });
  });
  return (
    <div style={{ flex: "1 1 420px", minWidth: 320, display: "flex" }}>
      <BossPanel title={title} subtitle={subtitle}>
        {items.map((item, i) =>
          item.type === "header"
            ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
            : item.type === "subdivider"
            ? <SubSectionDivider key={i} label={item.label} />
            : <PublicRow key={item.row.key} rowCfg={item.row} ids={assignments[item.row.key]}
                textValues={textValues} roster={roster} searchName={searchName} />
        )}
      </BossPanel>
    </div>
  );
}

export default function TkPublic({ teamId }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [liveSync,   setLiveSync]   = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeBoss, setActiveBoss] = useState(TK_BOSSES[0].id);
  const [searchName, setSearchName] = useState("");

  useEffect(() => {
    document.title = `NTMO TK – ${teamId === "team-dick" ? "Team Dick" : "Team Balls"}`;
    if (!FIREBASE_OK) { setLoading(false); return; }

    setLoading(true); setLiveSync(false); setData(null);
    const unsub = subscribeToTkState(teamId, snap => {
      setData(snap); setLoading(false); setLiveSync(true); setLastUpdate(new Date());
    });
    fetchTkState(teamId).then(d => { if (d) { setData(d); setLoading(false); } }).catch(() => {});
    return () => unsub();
  }, [teamId]);

  const viewAssignments = data?.assignments ?? {};
  const viewRoster      = data?.roster      ?? [];
  const viewTextInputs  = data?.textInputs  ?? {};
  const hasData         = viewRoster.length > 0;

  const currentBoss = TK_BOSSES.find(b => b.id === activeBoss) || TK_BOSSES[0];

  return (
    <AppShell teamId={teamId}>
      <ModuleHeader
        icon={teamId === "team-dick" ? "🍆" : "🍒"}
        title="Tempest Keep"
        breadcrumb={teamId === "team-dick" ? "Team Dick" : "Team Balls"}
        mobileActions={<>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
        </>}
        actions={<>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && <span style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <SearchBox value={searchName} onChange={setSearchName} placeholder="Search your name…" />
        </>}
      />

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingSpinner size={32} /></div>
      ) : !hasData ? (
        <EmptyState icon="⚡" title="No TK assignments published yet" message="The raid leader hasn't published TK assignments yet. Check back soon." />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: space[3] }}>

          {/* Boss tab bar */}
          <div style={{
            display: "flex", marginBottom: space[3], flexWrap: "wrap",
            background: surface.panel, border: `1px solid ${border.subtle}`,
            borderRadius: radius.base, padding: 3, gap: 2, width: "fit-content",
          }}>
            {TK_BOSSES.map(boss => (
              <button
                key={boss.id}
                onClick={() => setActiveBoss(boss.id)}
                style={{
                  padding: `${space[1]}px ${space[4]}px`, height: 30,
                  border: "none", borderRadius: radius.sm, cursor: "pointer",
                  fontFamily: font.sans, fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                  background: activeBoss === boss.id ? surface.overlay : "transparent",
                  color: activeBoss === boss.id ? text.primary : text.muted,
                  boxShadow: activeBoss === boss.id ? `0 1px 3px rgba(0,0,0,0.3)` : "none",
                  transition: "all 0.15s",
                }}
              >
                {boss.name}
              </button>
            ))}
          </div>

          {/* Phases - side-by-side, wrap on narrow viewports */}
          <div style={{ display: "flex", gap: space[3], flexWrap: "wrap", alignItems: "flex-start" }}>
            {currentBoss.phases.map(phase => (
              <PublicPanel
                key={phase.id}
                title={phase.label ? `${currentBoss.name.toUpperCase()} - ${phase.label.toUpperCase()}` : currentBoss.name.toUpperCase()}
                rows={phase.slots}
                assignments={viewAssignments}
                textValues={viewTextInputs}
                roster={viewRoster}
                searchName={searchName}
              />
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, getColor, getSpecDisplay, getClass, getRole,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  KARA_TUE_TEAMS, KARA_THU_TEAMS, KARA_ALL_ROWS,
  GENERAL_CURSES, GENERAL_INTERRUPTS,
  loadState, saveState,
} from "./constants";
import { FontImport, RoleHeader, BossPanel, RaidTabs, WarningBar, KaraTeamHeader, MarkerIcon } from "./components";
import { fetchFromFirebase, subscribeToFirebase, saveToFirebase, isFirebaseConfigured, fetchSnapshots } from "./firebase";
import { useWarcraftLogs, getScoreForTab, getScoreForPlayer, getScoreColor } from "./useWarcraftLogs";

const FIREBASE_OK = isFirebaseConfigured();

import teamDickImg  from "./teamdick.png";
import teamBallsImg from "./teamballs.png";

const TEAM_IMAGES = {
  "team-dick":  teamDickImg,
  "team-balls": teamBallsImg,
};

// ── Responsive hook ───────────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ── Live sync badge ───────────────────────────────────────────────────────────
function SyncBadge({ live }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: live ? "#4ade80" : "#888", fontFamily: "'Cinzel', serif" }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: live ? "#4ade80" : "#333",
        boxShadow: live ? "0 0 6px #4ade80" : "none",
        animation: live ? "pulse 2s infinite" : "none",
      }} />
      {live ? "LIVE" : "LOCAL"}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}

// ── Search box ────────────────────────────────────────────────────────────────
function SearchBox({ value, onChange }) {
  return (
    <div style={{ position: "relative", width: 240 }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#444", pointerEvents: "none" }}>🔍</span>
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder="Search your name…"
        style={{ width: "100%", background: "#0d0d1a", border: `1px solid ${value ? "#c8a84b88" : "#2a2a3a"}`, borderRadius: 6, color: value ? "#c8a84b" : "#666", padding: "6px 10px 6px 32px", fontFamily: "'Cinzel', serif", fontSize: 11, outline: "none", transition: "border-color 0.2s, color 0.2s" }}
      />
      {value && <button onClick={() => onChange("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>×</button>}
    </div>
  );
}

// ── Read-only assignment row ──────────────────────────────────────────────────
function PublicRow({ rowCfg, slots, textValue, searchName, isMobile, wclScores, activeTab, compact }) {
  const rc = ROLE_COLORS[rowCfg.role];
  const isHighlighted = searchName && slots.some(s => s.name.toLowerCase().includes(searchName.toLowerCase()));
  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 4 : 8,
      padding: compact ? "3px 10px" : "6px 14px 6px 12px",
      minHeight: compact ? 0 : 40,
      background: isHighlighted ? "#2a200888" : "transparent",
      borderLeft: `3px solid ${isHighlighted ? "#c8a84b" : rc.border + "88"}`,
      borderTop: "none", borderRight: "none", borderBottom: "1px solid #ffffff08",
      boxShadow: isHighlighted ? "0 0 12px #c8a84b22" : "none", transition: "all 0.2s",
    }}>
      <span style={{
        fontSize: compact ? 11 : (isMobile ? 12 : 13), color: "#ccc", fontFamily: "'Cinzel', serif", flexShrink: 0,
        display: "inline-flex", alignItems: "center", gap: 6,
        ...(isMobile ? {} : { minWidth: compact ? (rowCfg.markerKey && !rowCfg.label ? 24 : 140) : 180, maxWidth: compact ? 180 : 220 }),
      }}>
        {rowCfg.markerKey && <MarkerIcon markerKey={rowCfg.markerKey} size={compact ? 13 : 15} />}
        {rowCfg.label}
        {rowCfg.hint && <span style={{ color: "#666", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1 }}>
        {slots && slots.length > 0 && slots.map(slot => {
          const color = getColor(slot);
          const nameMatch = searchName && slot.name.toLowerCase().includes(searchName.toLowerCase());
          return (
            <span key={slot.id} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: nameMatch ? `${color}35` : `${color}18`,
              border: `1px solid ${nameMatch ? color : color + "44"}`,
              borderRadius: 4, padding: compact ? "1px 7px" : "3px 10px",
              color, fontFamily: "'Cinzel', serif", fontSize: compact ? 11 : (isMobile ? 12 : 13),
              boxShadow: nameMatch ? `0 0 8px ${color}66` : "none", transition: "all 0.2s", maxWidth: "100%",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: nameMatch ? 700 : 600 }}>{slot.name}</span>
              {!isMobile && !compact && <span style={{ color: `${color}bb`, fontSize: 11 }}>{getSpecDisplay(slot)} {getClass(slot)}</span>}
              {(() => { const score = getScoreForPlayer(wclScores, slot, activeTab); const scoreColor = getScoreColor(score); return score != null ? <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, fontFamily: "monospace" }}>{Math.round(score)}</span> : null; })()}
              {nameMatch && <span style={{ color, fontSize: 9 }}>◄</span>}
            </span>
          );
        })}
      </div>
      {textValue && <span style={{ fontSize: 10, color: "#c8a84b", fontFamily: "'Cinzel', serif", background: "#1a1000", border: "1px solid #c8a84b33", borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>{textValue}</span>}
    </div>
  );
}

// ── Public read-only panel ────────────────────────────────────────────────────
function PublicPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, searchName, isMobile, specOverrides, compact, wclScores, activeTab }) {
  const items = [];
  let lastSectionKey = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) { items.push({ type: "header", role: r.role, label: r.roleLabel || null }); lastSectionKey = sectionKey; }
    items.push({ type: "row", row: r });
  });
  const resolve = key => {
    if (!assignments[key]) return [];
    const ids = Array.isArray(assignments[key]) ? assignments[key] : [assignments[key]];
    return ids.map(id => { const p = roster.find(s => s.id === id); if (!p) return null; const overriddenSpec = specOverrides?.[id]; return overriddenSpec ? { ...p, specName: overriddenSpec, className: overriddenSpec } : p; }).filter(Boolean);
  };
  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage} compact={compact}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <PublicRow key={item.row.key} rowCfg={item.row} slots={resolve(item.row.key)} textValue={textValues?.[item.row.key] || ""} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
      )}
    </BossPanel>
  );
}

// ── Kara team card — matches AdminView exactly ────────────────────────────────
function KaraTeamCard({ team, teamNum, color, viewAssignments, allRosters, searchName, isMobile, isNarrow, wclScores, activeTab }) {
  const allRows = [...team.g1, ...team.g2];
  const filledG1 = team.g1.filter(r => viewAssignments[r.key]).length;
  const filledG2 = team.g2.filter(r => viewAssignments[r.key]).length;
  const filledCount = filledG1 + filledG2;

  const teamPlayers = allRows
    .flatMap(r => viewAssignments[r.key] ? (Array.isArray(viewAssignments[r.key]) ? viewAssignments[r.key] : [viewAssignments[r.key]]) : [])
    .map(id => allRosters.find(p => p.id === id)).filter(Boolean);

  const tankCount   = teamPlayers.filter(p => getRole(p) === "Tank").length;
  const healerCount = teamPlayers.filter(p => getRole(p) === "Healer").length;

  const UTILITY = {
    removeCurse: { label: "Remove Curse", icon: "🧹", specs: new Set(["Balance","Restoration","Feral","Guardian","Arcane","Fire","Frost"]) },
    dispelMagic: { label: "Dispel Magic", icon: "✨", specs: new Set(["Holy","Holy1","Discipline","Shadow"]) },
    curePoison:  { label: "Cure Poison",  icon: "🧪", specs: new Set(["Balance","Restoration","Feral","Guardian","Restoration1"]) },
    cureDisease: { label: "Cure Disease", icon: "💊", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution"]) },
    interrupt:   { label: "Interrupt",    icon: "⚡", specs: new Set(["Arms","Fury","Protection","Assassination","Combat","Subtlety","Enhancement","Retribution","Protection1","Feral","Guardian"]) },
    deenrage:    { label: "De-Enrage",    icon: "😤", specs: new Set(["BeastMastery","Beastmastery","Marksmanship","Survival","Feral","Guardian","Balance","Restoration"]) },
    bloodlust:   { label: "Bloodlust",    icon: "🥁", specs: new Set(["Elemental","Enhancement","Restoration1"]) },
  };
  const has = {};
  Object.keys(UTILITY).forEach(k => { has[k] = teamPlayers.some(p => UTILITY[k].specs.has(p.specName)); });

  return (
    <div style={{ flex: 1, background: "#0a0a12", border: `1px solid ${color}33`, borderRadius: 8, overflow: "hidden" }}>
      {/* Team header */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${color}22`, display: "flex", alignItems: "center", gap: 6, background: `${color}08` }}>
        <span style={{ fontSize: 13, color, fontFamily: "'Cinzel', serif", fontWeight: 700 }}>🏰 TEAM {teamNum}</span>
        <div style={{ display: "flex", gap: 8, marginLeft: 10, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#60a5fa", fontFamily: "'Cinzel', serif" }}>🛡 {tankCount}</span>
          <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>💚 {healerCount}</span>
        </div>
        <span style={{ fontSize: 9, color: "#555", marginLeft: "auto", fontFamily: "'Cinzel', serif" }}>{filledCount}/10</span>
      </div>

      {/* Comp utility tracker */}
      {filledCount > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "5px 10px", borderBottom: `1px solid ${color}11`, background: "#06060e" }}>
          {Object.entries(UTILITY).map(([k, u]) => (
            <span key={k} style={{
              fontSize: 9, fontFamily: "'Cinzel', serif", padding: "1px 6px", borderRadius: 3,
              background: has[k] ? "#0a1a0a" : "#1a0a0a",
              border: `1px solid ${has[k] ? "#4ade8033" : "#ef444433"}`,
              color: has[k] ? "#4ade80" : "#ef444488", opacity: has[k] ? 1 : 0.7,
            }}>
              {u.icon} {u.label}
            </span>
          ))}
        </div>
      )}

      {/* Groups stacked vertically, full width — matches Gruul/Mags panel sizing */}
      {[team.g1, team.g2].map((group, gi) => (
        <div key={gi} style={{ borderBottom: gi === 0 ? `1px solid ${color}18` : "none" }}>
          <div style={{ padding: "5px 14px", borderBottom: `1px solid ${color}11`, display: "flex", justifyContent: "space-between", background: `${color}05` }}>
            <span style={{ fontSize: 10, color: `${color}99`, fontFamily: "'Cinzel', serif", letterSpacing: "0.12em", fontWeight: 700 }}>GROUP {gi + 1}</span>
            <span style={{ fontSize: 10, color: "#555", fontFamily: "'Cinzel', serif" }}>{gi === 0 ? filledG1 : filledG2}/5</span>
          </div>
          {group.map(row => {
            const ids = viewAssignments[row.key];
            const slots = ids ? (Array.isArray(ids) ? ids : [ids]).map(id => allRosters.find(p => p.id === id)).filter(Boolean) : [];
            return <PublicRow key={row.key} rowCfg={row} slots={slots} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} compact={false} />;
          })}
        </div>
      ))}
    </div>
  );
}

// ── Kara section — Tuesday + Thursday nights ──────────────────────────────────
function KaraSection({ viewAssignments, viewRosterTue, viewRosterThu, searchName, isMobile, isNarrow, wclScores, activeTab }) {
  const allRosters = [...viewRosterTue, ...viewRosterThu];
  const nightSections = [
    { label: "📅 TUESDAY",  teams: KARA_TUE_TEAMS, color: "#4ade80" },
    { label: "📅 THURSDAY", teams: KARA_THU_TEAMS, color: "#60a5fa" },
  ];
  return (
    <>
      {nightSections.map(({ label, teams, color }) => (
        <div key={label} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "7px 14px", background: "#0a0a14", border: "1px solid #1e1e3a", borderRadius: 6 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>{label}</span>
            <span style={{ fontSize: 10, color: "#555", fontFamily: "'Cinzel', serif", marginLeft: 4 }}>3 TEAMS · 2 GROUPS OF 5</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {teams.map((team, i) => (
              <KaraTeamCard key={i} team={team} teamNum={i + 1} color={color}
                viewAssignments={viewAssignments} allRosters={allRosters}
                searchName={searchName} isMobile={isMobile} isNarrow={isNarrow}
                wclScores={wclScores} activeTab={activeTab} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Empty / loading states ────────────────────────────────────────────────────
function EmptyState({ loading }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 56 }}>{loading ? "⏳" : "⚔"}</div>
      <div style={{ fontFamily: "'Cinzel', serif", color: "#6a6a8a", fontSize: 14 }}>{loading ? "Loading assignments…" : "No assignments published yet"}</div>
      {!loading && <div style={{ color: "#5a5a7a", fontSize: 11 }}>The raid leader hasn't saved assignments yet — check back soon.</div>}
    </div>
  );
}

// ── WCL name override editor ──────────────────────────────────────────────────
function WclNameEditor({ player, onChange, locked }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(player.wclName || "");
  const commit = () => { onChange(value.trim()); setEditing(false); };
  const cancel = () => { setValue(player.wclName || ""); setEditing(false); };

  if (locked) {
    const charName = player.wclName?.trim() || player.name;
    return <a href={`https://fresh.warcraftlogs.com/character/us/dreamscythe/${charName.toLowerCase()}`} target="_blank" rel="noreferrer" style={{ fontFamily: "'Cinzel', serif", color: "inherit", textDecoration: "none", cursor: "pointer" }} title={`View ${charName} on WarcraftLogs`}>{charName}</a>;
  }
  if (!editing) {
    return <span onClick={() => setEditing(true)} style={{ cursor: "pointer", fontFamily: "'Cinzel', serif", textDecoration: "underline dotted", textUnderlineOffset: 3 }} title="Click to set WCL character name">{player.wclName?.trim() || player.name}</span>;
  }
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flex: 1 }}>
      <input autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }} placeholder="WCL char name…" style={{ flex: 1, minWidth: 0, background: "#080810", border: "1px solid #2a2a4a", borderRadius: 3, color: "#ccc", padding: "2px 5px", fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none" }} />
      <button onClick={commit} style={{ background: "#0a200a", border: "1px solid #4ade8055", borderRadius: 3, color: "#4ade80", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>✓</button>
      <button onClick={cancel} style={{ background: "#1a0a0a", border: "1px solid #ef444455", borderRadius: 3, color: "#ef4444", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>✗</button>
    </div>
  );
}

// ── Parse scores list ─────────────────────────────────────────────────────────
function ParseScoresList({ roster, wclScores, wclLoading, activeTab, onWclNameChange, rowPadding = "3px 8px", fontSize = 11, scoreWidth = 28 }) {
  const players = roster.filter(p => !p.isDivider && p.name);
  const rows = players.map(p => { const n = p.wclName?.trim() || p.name; return { ...p, kara: wclScores[n]?.kara ?? null, gruulMags: wclScores[n]?.gruulMags ?? null }; });
  rows.sort((a, b) => { const sa = getScoreForPlayer(wclScores, a, activeTab) ?? -1; const sb = getScoreForPlayer(wclScores, b, activeTab) ?? -1; return sb - sa; });
  if (wclLoading && rows.every(r => r.kara == null && r.gruulMags == null)) return <div style={{ padding: "12px 8px", fontSize: 9, color: "#555", fontFamily: "'Cinzel', serif", textAlign: "center" }}>Loading…</div>;
  return rows.map(p => {
    const pColor = getColor(p); const lookupKey = p.wclName?.trim() || p.name; const isLocked = !!(wclScores[lookupKey]?.found);
    return (
      <div key={p.id} style={{ display: "flex", alignItems: "center", padding: rowPadding, borderBottom: "1px solid #ffffff05" }}>
        <span style={{ flex: 1, fontSize, color: pColor, fontFamily: "'Cinzel', serif", overflow: "hidden", minWidth: 0 }}><WclNameEditor player={p} onChange={wclName => onWclNameChange(p.id, wclName)} locked={isLocked} /></span>
        <span style={{ width: scoreWidth, textAlign: "center", fontSize, fontWeight: 700, fontFamily: "monospace", color: getScoreColor(p.kara) || "#333" }}>{p.kara != null ? Math.round(p.kara) : "—"}</span>
        <span style={{ width: scoreWidth, textAlign: "center", fontSize, fontWeight: 700, fontFamily: "monospace", color: getScoreColor(p.gruulMags) || "#333" }}>{p.gruulMags != null ? Math.round(p.gruulMags) : "—"}</span>
      </div>
    );
  });
}

// ── General assignments block ─────────────────────────────────────────────────
function GeneralAssignments({ viewAssignments, viewRoster, searchName, isMobile, wclScores, activeTab }) {
  const resolveRow = row => {
    const ids = viewAssignments[row.key] ? (Array.isArray(viewAssignments[row.key]) ? viewAssignments[row.key] : [viewAssignments[row.key]]) : [];
    return ids.map(id => viewRoster.find(s => s.id === id)).filter(Boolean);
  };
  return (
    <div style={{ marginBottom: 12, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 0, background: "#0a0a12", border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ flex: 1, borderRight: isMobile ? "none" : "1px solid #1e1e3a", borderBottom: isMobile ? "1px solid #1e1e3a" : "none" }}>
        <div style={{ padding: "6px 12px", borderBottom: "1px solid #1e1e3a" }}><span style={{ fontSize: 11, color: "#8788EE", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", fontWeight: 700 }}>🟣 WARLOCK CURSES</span></div>
        {GENERAL_CURSES.map(row => <PublicRow key={row.key} rowCfg={row} slots={resolveRow(row)} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} compact />)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ padding: "6px 12px", borderBottom: "1px solid #1e1e3a" }}><span style={{ fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", fontWeight: 700 }}>⚡ TRASH INTERRUPTS</span></div>
        {GENERAL_INTERRUPTS.map(row => <PublicRow key={row.key} rowCfg={row} slots={resolveRow(row)} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} compact />)}
      </div>
    </div>
  );
}

// ── Main Public View ──────────────────────────────────────────────────────────
export default function PublicView({ teamId, teamName }) {
  const navBtn = { background: "#0d0d1a", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", padding: "6px 14px", fontSize: 12, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" };
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [liveSync,   setLiveSync]   = useState(false);
  const [activeTab,  setActiveTab]  = useState("gruul");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [searchName, setSearchName] = useState("");
  const [snapshots,  setSnapshots]  = useState([]);
  const [viewingSnap, setViewingSnap] = useState(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const navigate = useNavigate();
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isNarrow = width < 1100;

  const { scores: wclScores, loading: wclLoading, lastFetch: wclLastFetch } = useWarcraftLogs(data?.roster ?? []);

  const handleWclNameChange = useCallback(async (playerId, wclName) => {
    const updatedRoster = (data?.roster ?? []).map(p => p.id === playerId ? { ...p, wclName: wclName || undefined } : p);
    const newData = { ...data, roster: updatedRoster };
    setData(newData);
    if (FIREBASE_OK) { try { await saveToFirebase(newData, teamId); } catch (e) { console.warn("WCL name save failed", e); } }
    else saveState(newData, teamId);
  }, [data, teamId]);

  useEffect(() => {
    if (FIREBASE_OK) {
      const unsub = subscribeToFirebase(snapshot => { setData(snapshot); setLoading(false); setLiveSync(true); setLastUpdate(new Date()); }, teamId);
      fetchFromFirebase(teamId).then(d => { if (d) { setData(d); setLoading(false); } }).catch(() => {});
      fetchSnapshots(teamId).then(setSnapshots).catch(console.warn);
      return () => unsub();
    } else {
      setData(loadState(teamId)); setLoading(false); setLiveSync(false);
    }
  }, [teamId]);

  const roster        = data?.roster        ?? [];
  const rosterTue     = data?.rosterTue     ?? [];
  const rosterThu     = data?.rosterThu     ?? [];
  const assignments   = data?.assignments   ?? {};
  const specOverrides = data?.specOverrides ?? {};
  const raidDate      = data?.raidDate      ?? "";
  const raidLeader    = data?.raidLeader    ?? "";

  const viewSnap        = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : assignments;
  const viewRoster      = viewSnap ? (viewSnap.roster      ?? []) : roster;
  const viewRosterTue   = viewSnap ? (viewSnap.rosterTue   ?? []) : rosterTue;
  const viewRosterThu   = viewSnap ? (viewSnap.rosterThu   ?? []) : rosterThu;
  const viewTextInputs  = viewSnap ? (viewSnap.textInputs  ?? {}) : (data?.textInputs ?? {});
  const viewRaidDate    = viewSnap ? viewSnap.raidDate   : raidDate;
  const viewRaidLeader  = viewSnap ? viewSnap.raidLeader : raidLeader;

  const hasData = roster.length > 0 && Object.keys(assignments).length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #1a1a2a", background: "#06060f", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, height: isMobile ? 90 : 110 }}>
        <img src={TEAM_IMAGES[teamId]} alt={teamName} onClick={() => navigate(`/${teamId}`)} style={{ width: isMobile ? 72 : 96, height: isMobile ? 72 : 96, objectFit: "cover", borderRadius: 8, flexShrink: 0, display: "block", cursor: "pointer" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {FIREBASE_OK && <SyncBadge live={liveSync} />}
              {lastUpdate && <span style={{ fontSize: 11, color: "#aaa", fontFamily: "'Cinzel', serif" }}>Updated {lastUpdate.toLocaleTimeString()}</span>}
              {FIREBASE_OK && snapshots.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
                  <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx + 1 < snapshots.length ? snapshots[idx + 1].id : null); setAssignmentsOpen(false); }} disabled={viewingSnap === snapshots[snapshots.length - 1]?.id} style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: viewingSnap === snapshots[snapshots.length - 1]?.id ? 0.3 : 1 }}>‹</button>
                  <div style={{ textAlign: "center", whiteSpace: "nowrap", minWidth: 160 }}>
                    {viewSnap ? (
                      <span style={{ fontSize: 13, color: viewSnap.locked ? "#a78bfa" : "#c8a84b", fontFamily: "'Cinzel', serif" }}>
                        {viewSnap.locked ? "🔒" : "📸"} {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}
                        {viewSnap.raidLeader ? ` · ${viewSnap.raidLeader}` : ""}
                        {viewSnap.locked && <span style={{ color: "#888", marginLeft: 6, fontSize: 11 }}>LOCKED</span>}
                      </span>
                    ) : <span style={{ fontSize: 13, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>⚡ Current Week (Live)</span>}
                  </div>
                  <button onClick={() => { const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1; setViewingSnap(idx > 0 ? snapshots[idx - 1].id : null); setAssignmentsOpen(false); }} disabled={!viewingSnap} style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: !viewingSnap ? 0.3 : 1 }}>›</button>
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => navigate("/")} style={navBtn} onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }} onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}>← Teams</button>
            {hasData && !isMobile && <div style={{ width: 200 }}><SearchBox value={searchName} onChange={setSearchName} /></div>}
            <button onClick={() => navigate(`/${teamId}/admin`)} style={{ ...navBtn, marginLeft: "auto" }} onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }} onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}>Admin</button>
          </div>
        </div>
      </div>

      {hasData && isMobile && <div style={{ padding: "6px 16px", borderBottom: "1px solid #1a1a2a" }}><SearchBox value={searchName} onChange={setSearchName} /></div>}

      {!hasData ? <EmptyState loading={loading} /> : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", height: 0, minHeight: "100%" }}>

          {/* ── Parse Scores Sidebar ── */}
          {!isMobile && (
            <div style={{ width: 160, flexShrink: 0, borderRight: "1px solid #1a1a2a", display: "flex", flexDirection: "column", overflowY: "hidden", background: "#06060f" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a2a", fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>📊 PARSE SCORES{wclLoading && <span style={{ color: "#888", marginLeft: 6 }}>…</span>}</div>
              <div style={{ display: "flex", padding: "5px 8px 3px", borderBottom: "1px solid #1a1a2a" }}>
                <span style={{ flex: 1, fontSize: 10, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>PLAYER</span>
                <span style={{ width: 28, fontSize: 10, color: "#9b72cf", textAlign: "center", fontFamily: "'Cinzel', serif" }}>KR</span>
                <span style={{ width: 28, fontSize: 10, color: "#c8a84b", textAlign: "center", fontFamily: "'Cinzel', serif" }}>GM</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                <ParseScoresList roster={viewRoster} wclScores={wclScores} wclLoading={wclLoading} activeTab={activeTab} onWclNameChange={handleWclNameChange} />
              </div>
              {wclLastFetch && <div style={{ padding: "5px 8px", borderTop: "1px solid #1a1a2a", fontSize: 10, color: "#555", fontFamily: "'Cinzel', serif" }}>Updated {wclLastFetch.toLocaleTimeString()}</div>}
            </div>
          )}

          {/* ── Main content ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 10px" : "16px 24px" }}>

            {/* ── LOCKED SNAPSHOT ── */}
            {isLocked && (() => {
              const embedUrl = viewSnap?.sheetUrl ? (() => { const url = viewSnap.sheetUrl; if (!url.includes("docs.google.com/spreadsheets")) return null; const base = url.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview"); return `${base}?rm=minimal#gid=548293748`; })() : null;
              const combatLogEmbedUrl = viewSnap?.combatLogUrl ? (() => { const url = viewSnap.combatLogUrl; if (!url.includes("docs.google.com/spreadsheets")) return null; const base = url.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview"); return `${base}?rm=minimal`; })() : null;
              return (<>
                <div style={{ marginBottom: 14 }}>
                  {embedUrl ? (
                    <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #a78bfa33" }}>
                      <div style={{ padding: "8px 14px", background: "#0a0820", borderBottom: "1px solid #a78bfa22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "#a78bfa", fontFamily: "'Cinzel', serif", fontWeight: 700 }}>🔒 {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()} — Role Performance Breakdown</span>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          {viewSnap.wclReportUrl && <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>📊 WarcraftLogs →</a>}
                          <a href={viewSnap.sheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>↗ Google Sheets →</a>
                        </div>
                      </div>
                      <iframe key={embedUrl} src={embedUrl} style={{ width: "100%", height: isMobile ? 420 : 600, border: "none", display: "block" }} title="RPB Analysis Sheet" allowFullScreen />
                    </div>
                  ) : (
                    <div style={{ padding: "14px 18px", background: "#0a0820", border: "1px solid #a78bfa33", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: "'Cinzel', serif" }}>🔒 {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()} — Locked Raid Week</span>
                      {viewSnap.wclReportUrl && <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none", fontWeight: 600 }}>📊 View WarcraftLogs Report →</a>}
                    </div>
                  )}
                </div>
                {combatLogEmbedUrl && (
                  <div style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden", border: "1px solid #f59e0b33" }}>
                    <div style={{ padding: "8px 14px", background: "#0f0800", borderBottom: "1px solid #f59e0b22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'Cinzel', serif", fontWeight: 700 }}>⚔ Combat Log Analytics</span>
                      <a href={viewSnap.combatLogUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#f59e0b", fontFamily: "'Cinzel', serif", textDecoration: "none" }}>↗ Google Sheets →</a>
                    </div>
                    <iframe key={combatLogEmbedUrl} src={combatLogEmbedUrl} style={{ width: "100%", height: isMobile ? 420 : 600, border: "none", display: "block" }} title="Combat Log Analytics" allowFullScreen />
                  </div>
                )}
                <div style={{ border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                  <button onClick={() => setAssignmentsOpen(o => !o)} style={{ width: "100%", background: "#0a0a14", border: "none", cursor: "pointer", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#666", fontFamily: "'Cinzel', serif", letterSpacing: "0.12em" }}>📋 RAID ASSIGNMENTS</span>
                    <span style={{ fontSize: 11, color: "#444" }}>{assignmentsOpen ? "▲ collapse" : "▼ expand"}</span>
                  </button>
                  {assignmentsOpen && (
                    <div style={{ padding: isMobile ? "10px 8px" : "14px 16px", borderTop: "1px solid #1a1a2a" }}>
                      <GeneralAssignments viewAssignments={viewAssignments} viewRoster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                      <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={viewRaidDate} raidLeader={viewRaidLeader} />
                      {activeTab === "gruul" && <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14, marginTop: 12 }}>
                        <PublicPanel title="HIGH KING MAULGAR" icon="👑" bossImage={BOSS_KEYS.maulgar} rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                        <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" bossImage={BOSS_KEYS.gruul} rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                      </div>}
                      {activeTab === "mags" && <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14, marginTop: 12 }}>
                        <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" bossImage={BOSS_KEYS.mags} rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                        <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" bossImage={BOSS_KEYS.mags} rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                      </div>}
                      {activeTab === "kara" && <KaraSection viewAssignments={viewAssignments} viewRosterTue={viewRosterTue} viewRosterThu={viewRosterThu} searchName={searchName} isMobile={isMobile} isNarrow={isNarrow} wclScores={wclScores} activeTab={activeTab} />}
                    </div>
                  )}
                </div>
              </>);
            })()}

            {/* ── CURRENT / UNLOCKED WEEK ── */}
            {!isLocked && (<>
              {viewSnap?.wclReportUrl && (
                <div style={{ marginBottom: 12, padding: "8px 14px", background: "#0a0820", border: "1px solid #a78bfa44", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: "'Cinzel', serif" }}>📸 Snapshot</span>
                  <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none", fontWeight: 600 }}>📊 View WarcraftLogs Report →</a>
                </div>
              )}

              <GeneralAssignments viewAssignments={viewAssignments} viewRoster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />

              <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={viewRaidDate} raidLeader={viewRaidLeader} />

              {activeTab === "gruul" && (
                <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
                  <PublicPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar} rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                  <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul} rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                </div>
              )}

              {activeTab === "kara" && (
                <KaraSection viewAssignments={viewAssignments} viewRosterTue={viewRosterTue} viewRosterThu={viewRosterThu} searchName={searchName} isMobile={isMobile} isNarrow={isNarrow} wclScores={wclScores} activeTab={activeTab} />
              )}

              {activeTab === "mags" && (
                <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
                  <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags} rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                  <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags} rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
                </div>
              )}

              {isMobile && viewRoster.length > 0 && (
                <div style={{ marginTop: 20, border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", background: "#0a0a14", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>📊 PARSE SCORES{wclLoading && <span style={{ color: "#888", marginLeft: 8 }}>loading…</span>}</span>
                    {wclLastFetch && <span style={{ fontSize: 7, color: "#555", fontFamily: "'Cinzel', serif" }}>Updated {wclLastFetch.toLocaleTimeString()}</span>}
                  </div>
                  <div style={{ background: "#07070f" }}>
                    <div style={{ display: "flex", padding: "5px 12px 4px", borderBottom: "1px solid #1a1a2a" }}>
                      <span style={{ flex: 1, fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>PLAYER</span>
                      <span style={{ width: 40, fontSize: 8, color: "#9b72cf", textAlign: "center", fontFamily: "'Cinzel', serif" }}>KARA</span>
                      <span style={{ width: 40, fontSize: 8, color: "#c8a84b", textAlign: "center", fontFamily: "'Cinzel', serif" }}>G/M</span>
                    </div>
                    <ParseScoresList roster={viewRoster} wclScores={wclScores} wclLoading={wclLoading} activeTab={activeTab} onWclNameChange={handleWclNameChange} rowPadding="4px 12px" fontSize={12} scoreWidth={40} />
                  </div>
                </div>
              )}
            </>)}

          </div>
        </div>
      )}
    </div>
  );
}

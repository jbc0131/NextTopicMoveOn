import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, getColor, getSpecDisplay, getClass,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  KARA_TEAM_1, KARA_TEAM_2, KARA_TEAM_3, KARA_ALL_ROWS,
  loadState, saveState,
} from "./constants";
import { FontImport, RoleHeader, BossPanel, RaidTabs, WarningBar, KaraTeamHeader } from "./components";
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
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: live ? "#4ade80" : "#888", fontFamily: "'Cinzel', serif" }}>
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
      <span style={{
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        fontSize: 13, color: "#444", pointerEvents: "none",
      }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search your name…"
        style={{
          width: "100%", background: "#0d0d1a",
          border: `1px solid ${value ? "#c8a84b88" : "#2a2a3a"}`,
          borderRadius: 6, color: value ? "#c8a84b" : "#666",
          padding: "6px 10px 6px 32px",
          fontFamily: "'Cinzel', serif", fontSize: 11, outline: "none",
          transition: "border-color 0.2s, color 0.2s",
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14,
          }}
        >×</button>
      )}
    </div>
  );
}

// ── Read-only assignment row — with highlight support ─────────────────────────
function PublicRow({ rowCfg, slots, textValue, searchName, isMobile, wclScores, activeTab }) {
  const rc = ROLE_COLORS[rowCfg.role];

  const isHighlighted = searchName && slots.some(
    s => s.name.toLowerCase().includes(searchName.toLowerCase())
  );

  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "center",
      gap: isMobile ? 6 : 10,
      padding: "6px 14px 6px 12px", minHeight: 40,
      background: isHighlighted ? "#2a200888" : "transparent",
      borderLeft: `3px solid ${isHighlighted ? "#c8a84b" : rc.border + "88"}`,
      borderTop: "none", borderRight: "none", borderBottom: "1px solid #ffffff08",
      boxShadow: isHighlighted ? "0 0 12px #c8a84b22" : "none",
      transition: "all 0.2s",
    }}>
      <span style={{
        fontSize: isMobile ? 12 : 13, color: "#ccc",
        fontFamily: "'Cinzel', serif",
        flexShrink: 0,
        ...(isMobile ? {} : { minWidth: 180, maxWidth: 220 }),
      }}>
        {rowCfg.label}
        {rowCfg.hint && <span style={{ color: "#666", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1 }}>
        {slots && slots.length > 0 && slots.map(slot => {
          const color = getColor(slot);
          const nameMatch = searchName && slot.name.toLowerCase().includes(searchName.toLowerCase());
          return (
            <span key={slot.id} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: nameMatch ? `${color}35` : `${color}18`,
              border: `1px solid ${nameMatch ? color : color + "44"}`,
              borderRadius: 4, padding: "3px 10px",
              color: color, fontFamily: "'Cinzel', serif", fontSize: isMobile ? 12 : 13,
              boxShadow: nameMatch ? `0 0 8px ${color}66` : "none",
              transition: "all 0.2s", maxWidth: "100%",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: nameMatch ? 700 : 600 }}>{slot.name}</span>
              {!isMobile && (
                <span style={{ color: `${color}bb`, fontSize: 11 }}>{getSpecDisplay(slot)} {getClass(slot)}</span>
              )}
              {(() => {
                  const score = getScoreForPlayer(wclScores, slot, activeTab);
                  const scoreColor = getScoreColor(score);
                  return score != null ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, fontFamily: "monospace" }}>
                      {Math.round(score)}
                    </span>
                  ) : null;
                })()}
              {nameMatch && <span style={{ color: color, fontSize: 9 }}>◄</span>}
            </span>
          );
        })}
      </div>
      {textValue && (
        <span style={{
          fontSize: 10, color: "#c8a84b", fontFamily: "'Cinzel', serif",
          background: "#1a1000", border: "1px solid #c8a84b33",
          borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap",
        }}>
          {textValue}
        </span>
      )}
    </div>
  );
}

// ── Public read-only panel ────────────────────────────────────────────────────
function PublicPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, searchName, isMobile, specOverrides, compact, wclScores, activeTab }) {
  const items = [];
  let lastSectionKey = null;
  rows.forEach(r => {
    const sectionKey = r.roleLabel || r.role;
    if (sectionKey !== lastSectionKey) {
      items.push({ type: "header", role: r.role, label: r.roleLabel || null });
      lastSectionKey = sectionKey;
    }
    items.push({ type: "row", row: r });
  });
  const resolve = key => {
    if (!assignments[key]) return [];
    const ids = Array.isArray(assignments[key]) ? assignments[key] : [assignments[key]];
    return ids.map(id => {
      const p = roster.find(s => s.id === id);
      if (!p) return null;
      const overriddenSpec = specOverrides?.[id];
      return overriddenSpec ? { ...p, specName: overriddenSpec, className: overriddenSpec } : p;
    }).filter(Boolean);
  };
  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage} compact={compact}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <PublicRow key={item.row.key} rowCfg={item.row}
              slots={resolve(item.row.key)}
              textValue={textValues?.[item.row.key] || ""}
              searchName={searchName}
              isMobile={isMobile}
              wclScores={wclScores}
              activeTab={activeTab} />
      )}
    </BossPanel>
  );
}

// ── Empty / loading states ────────────────────────────────────────────────────
function EmptyState({ loading }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 56 }}>{loading ? "⏳" : "⚔"}</div>
      <div style={{ fontFamily: "'Cinzel', serif", color: "#6a6a8a", fontSize: 14 }}>
        {loading ? "Loading assignments…" : "No assignments published yet"}
      </div>
      {!loading && <div style={{ color: "#5a5a7a", fontSize: 11 }}>The raid leader hasn't saved assignments yet — check back soon.</div>}
    </div>
  );
}

// ── Meta label ────────────────────────────────────────────────────────────────
function Meta({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 8, color: "#aaa", letterSpacing: "0.15em", fontFamily: "'Cinzel', serif" }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 11, color: "#c8a84b", fontFamily: "'Cinzel', serif" }}>{value}</span>
    </div>
  );
}

// ── WCL name override editor ──────────────────────────────────────────────────
function WclNameEditor({ player, onChange, locked }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(player.wclName || "");

  const commit = () => {
    onChange(value.trim());
    setEditing(false);
  };
  const cancel = () => {
    setValue(player.wclName || "");
    setEditing(false);
  };

  // Already matched — clicking opens their WCL profile
  if (locked) {
    const charName = player.wclName?.trim() || player.name;
    const wclUrl = `https://fresh.warcraftlogs.com/character/us/dreamscythe/${charName.toLowerCase()}`;
    return (
      <a
        href={wclUrl}
        target="_blank"
        rel="noreferrer"
        style={{ fontFamily: "'Cinzel', serif", color: "inherit", textDecoration: "none", cursor: "pointer" }}
        title={`View ${charName} on WarcraftLogs`}
      >
        {charName}
      </a>
    );
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ cursor: "pointer", fontFamily: "'Cinzel', serif", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
        title="Click to set WCL character name"
      >
        {player.wclName?.trim() || player.name}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flex: 1 }}>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        placeholder="WCL char name…"
        style={{
          flex: 1, minWidth: 0, background: "#080810", border: "1px solid #2a2a4a",
          borderRadius: 3, color: "#ccc", padding: "2px 5px",
          fontFamily: "'Cinzel', serif", fontSize: 10, outline: "none",
        }}
      />
      <button onClick={commit} style={{
        background: "#0a200a", border: "1px solid #4ade8055", borderRadius: 3,
        color: "#4ade80", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0,
      }}>✓</button>
      <button onClick={cancel} style={{
        background: "#1a0a0a", border: "1px solid #ef444455", borderRadius: 3,
        color: "#ef4444", padding: "2px 5px", cursor: "pointer", fontSize: 11, flexShrink: 0,
      }}>✗</button>
    </div>
  );
}

// ── Shared parse scores list — used by both desktop sidebar and mobile panel ──
function ParseScoresList({ roster, wclScores, wclLoading, activeTab, onWclNameChange, rowPadding = "3px 8px", fontSize = 11, scoreWidth = 28 }) {
  const players = roster.filter(p => !p.isDivider && p.name);
  const rows = players.map(p => {
    const lookupName = p.wclName?.trim() || p.name;
    return {
      ...p,
      kara:      wclScores[lookupName]?.kara      ?? null,
      gruulMags: wclScores[lookupName]?.gruulMags ?? null,
    };
  });
  rows.sort((a, b) => {
    const sa = getScoreForPlayer(wclScores, a, activeTab) ?? -1;
    const sb = getScoreForPlayer(wclScores, b, activeTab) ?? -1;
    return sb - sa;
  });

  if (wclLoading && rows.every(r => r.kara == null && r.gruulMags == null)) {
    return <div style={{ padding: "12px 8px", fontSize: 9, color: "#555", fontFamily: "'Cinzel', serif", textAlign: "center" }}>Loading…</div>;
  }

  return rows.map(p => {
    const karaColor = getScoreColor(p.kara);
    const gmColor   = getScoreColor(p.gruulMags);
    const pColor    = getColor(p);
    const lookupKey = p.wclName?.trim() || p.name;
    const isLocked  = !!(wclScores[lookupKey]?.found);
    return (
      <div key={p.id} style={{ display: "flex", alignItems: "center", padding: rowPadding, borderBottom: "1px solid #ffffff05" }}>
        <span style={{ flex: 1, fontSize, color: pColor, fontFamily: "'Cinzel', serif", overflow: "hidden", minWidth: 0 }}>
          <WclNameEditor player={p} onChange={wclName => onWclNameChange(p.id, wclName)} locked={isLocked} />
        </span>
        <span style={{ width: scoreWidth, textAlign: "center", fontSize, fontWeight: 700, fontFamily: "monospace", color: karaColor || "#333" }}>
          {p.kara != null ? Math.round(p.kara) : "—"}
        </span>
        <span style={{ width: scoreWidth, textAlign: "center", fontSize, fontWeight: 700, fontFamily: "monospace", color: gmColor || "#333" }}>
          {p.gruulMags != null ? Math.round(p.gruulMags) : "—"}
        </span>
      </div>
    );
  });
}

// ── Main Public View ──────────────────────────────────────────────────────────
export default function PublicView({ teamId, teamName }) {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [liveSync,   setLiveSync]  = useState(false);
  const [activeTab,  setActiveTab] = useState("gruul");
  const [lastUpdate, setLastUpdate]= useState(null);
  const [searchName, setSearchName]= useState("");
  const [snapshots,  setSnapshots] = useState([]);
  const [viewingSnap, setViewingSnap] = useState(null);
  const navigate = useNavigate();
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isNarrow = width < 1100;

  // ── WarcraftLogs scores ─────────────────────────────────────────────────────
  const { scores: wclScores, loading: wclLoading, lastFetch: wclLastFetch, refetch: wclRefetch } = useWarcraftLogs(
    data?.roster ?? []
  );

  // Save wclName override directly from the public view
  const handleWclNameChange = useCallback(async (playerId, wclName) => {
    const updatedRoster = (data?.roster ?? []).map(p =>
      p.id === playerId ? { ...p, wclName: wclName || undefined } : p
    );
    const newData = { ...data, roster: updatedRoster };
    setData(newData);
    if (FIREBASE_OK) {
      try { await saveToFirebase(newData, teamId); } catch (e) { console.warn("WCL name save failed", e); }
    } else {
      saveState(newData, teamId);
    }
  }, [data, teamId]);

  useEffect(() => {
    if (FIREBASE_OK) {
      const unsub = subscribeToFirebase(snapshot => {
        setData(snapshot);
        setLoading(false);
        setLiveSync(true);
        setLastUpdate(new Date());
      }, teamId);
      fetchFromFirebase(teamId)
        .then(d => { if (d) { setData(d); setLoading(false); } })
        .catch(() => {});
      fetchSnapshots(teamId).then(setSnapshots).catch(console.warn);
      return () => unsub();
    } else {
      const s = loadState(teamId);
      setData(s);
      setLoading(false);
      setLiveSync(false);
    }
  }, [teamId]);

  const roster        = data?.roster        ?? [];
  const assignments   = data?.assignments   ?? {};
  const specOverrides = data?.specOverrides ?? {};
  const raidDate      = data?.raidDate      ?? "";
  const raidLeader    = data?.raidLeader    ?? "";

  // When viewing a past snapshot, use its data
  const viewSnap        = viewingSnap ? snapshots.find(s => s.id === viewingSnap) : null;
  const isLocked        = viewSnap?.locked ?? false;
  const viewAssignments = viewSnap ? (viewSnap.assignments ?? {}) : assignments;
  const viewRoster      = viewSnap ? (viewSnap.roster      ?? []) : roster;
  const viewTextInputs  = viewSnap ? (viewSnap.textInputs  ?? {}) : (data?.textInputs ?? {});
  const viewRaidDate    = viewSnap ? viewSnap.raidDate   : raidDate;
  const viewRaidLeader  = viewSnap ? viewSnap.raidLeader : raidLeader;

  const totalSlots  = [...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2, ...KARA_ALL_ROWS].length;
  const filledSlots = Object.keys(assignments).length;
  const hasData     = roster.length > 0 && filledSlots > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Header ── */}
      <div style={{
        position: "relative", height: isMobile ? 50 : 60,
        flexShrink: 0, overflow: "hidden",
        borderBottom: "1px solid #1a1a2a",
        background: "#06060f",
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
      }}>
        {/* Team image as small square logo */}
        <img
          src={TEAM_IMAGES[teamId]}
          alt={teamName}
          style={{
            width: isMobile ? 36 : 44,
            height: isMobile ? 36 : 44,
            objectFit: "contain",
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
          {/* 🔍 Search box */}
          {hasData && (
            <div style={{ marginLeft: "auto", width: isMobile ? 160 : 240 }}>
              <SearchBox value={searchName} onChange={setSearchName} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: hasData ? 12 : "auto" }}>
            {FIREBASE_OK && <SyncBadge live={liveSync} />}
            {lastUpdate && !isMobile && (
              <span style={{ fontSize: 9, color: "#aaa", fontFamily: "'Cinzel', serif" }}>
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => navigate("/")}
              style={{ background: "#0d0d1a", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", padding: "5px 12px", fontSize: 10, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}
              onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }}
              onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}
            >← Teams</button>
            <button
              onClick={() => navigate(`/${teamId}/analysis`)}
              style={{ background: "#0d0d1a", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", padding: "5px 12px", fontSize: 10, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}
              onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }}
              onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}
            >📊 Analysis</button>
            <button
              onClick={() => navigate(`/${teamId}/admin`)}
              style={{ background: "#0d0d1a", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", padding: "5px 12px", fontSize: 10, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}
              onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }}
              onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}
            >Admin</button>
          </div>
      </div>

      {/* ── Week slider bar — right-aligned to sit under the header buttons ── */}
      {FIREBASE_OK && snapshots.length > 0 && (
        <div style={{
          background: "#08080f", borderBottom: "1px solid #1a1a2a",
          padding: "4px 20px", display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 280 }}>
            <button
              onClick={() => {
                const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1;
                setViewingSnap(idx + 1 < snapshots.length ? snapshots[idx + 1].id : null);
              }}
              disabled={viewingSnap === snapshots[snapshots.length - 1]?.id}
              style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: viewingSnap === snapshots[snapshots.length - 1]?.id ? 0.3 : 1 }}
            >‹</button>
            <div style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>
              {viewSnap ? (
                <span style={{ fontSize: 10, color: viewSnap.locked ? "#a78bfa" : "#c8a84b", fontFamily: "'Cinzel', serif" }}>
                  {viewSnap.locked ? "🔒" : "📸"} {viewSnap.raidDate || new Date(viewSnap.savedAt).toLocaleDateString()}
                  {viewSnap.raidLeader ? ` · ${viewSnap.raidLeader}` : ""}
                  {viewSnap.locked && <span style={{ color: "#555", marginLeft: 6, fontSize: 9 }}>LOCKED</span>}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>⚡ Current Week (Live)</span>
              )}
            </div>
            <button
              onClick={() => {
                const idx = viewingSnap ? snapshots.findIndex(s => s.id === viewingSnap) : -1;
                setViewingSnap(idx > 0 ? snapshots[idx - 1].id : null);
              }}
              disabled={!viewingSnap}
              style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#888", padding: "1px 8px", cursor: "pointer", fontSize: 14, lineHeight: 1.4, opacity: !viewingSnap ? 0.3 : 1 }}
            >›</button>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {(!hasData) ? (
        <EmptyState loading={loading} />
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", height: 0, minHeight: "100%" }}>

          {/* ── Parse Scores Sidebar ── */}
          {!isMobile && (
            <div style={{
              width: 160, flexShrink: 0, borderRight: "1px solid #1a1a2a",
              display: "flex", flexDirection: "column", overflowY: "hidden",
              background: "#06060f",
            }}>
              {/* Header */}
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a2a", fontSize: 9, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
                📊 PARSE SCORES
                {wclLoading && <span style={{ color: "#888", marginLeft: 6 }}>…</span>}
              </div>

              {/* Column headers */}
              <div style={{ display: "flex", padding: "5px 8px 3px", borderBottom: "1px solid #1a1a2a" }}>
                <span style={{ flex: 1, fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>PLAYER</span>
                <span style={{ width: 28, fontSize: 8, color: "#9b72cf", textAlign: "center", fontFamily: "'Cinzel', serif" }}>KR</span>
                <span style={{ width: 28, fontSize: 8, color: "#c8a84b", textAlign: "center", fontFamily: "'Cinzel', serif" }}>GM</span>
              </div>

              {/* Player rows — sorted by active tab score */}
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                <ParseScoresList
                  roster={viewRoster} wclScores={wclScores} wclLoading={wclLoading}
                  activeTab={activeTab} onWclNameChange={handleWclNameChange}
                  rowPadding="3px 8px" fontSize={11} scoreWidth={28}
                />
              </div>

              {/* Last updated footer */}
              {wclLastFetch && (
                <div style={{ padding: "5px 8px", borderTop: "1px solid #1a1a2a", fontSize: 7, color: "#444", fontFamily: "'Cinzel', serif" }}>
                  Updated {wclLastFetch.toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {/* ── Main assignment content ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 10px" : "16px 24px" }}>

          {/* ── Locked week WCL banner ── */}
          {isLocked && viewSnap?.wclReportUrl && (
            <div style={{ marginBottom: 12, padding: "8px 14px", background: "#0a0820", border: "1px solid #a78bfa44", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: "'Cinzel', serif" }}>🔒 Raid Completed</span>
              <a href={viewSnap.wclReportUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none", fontWeight: 600 }}>
                📊 View WarcraftLogs Report →
              </a>
            </div>
          )}

          <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={viewRaidDate} raidLeader={viewRaidLeader} />

          {activeTab === "gruul" && <>
            <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
            <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
              <PublicPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar}
                rows={GRUUL_MAULGAR} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
              <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul}
                rows={GRUUL_BOSS} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
            </div>
          </>}

          {activeTab === "kara" && <>
            {[KARA_TEAM_1, KARA_TEAM_2, KARA_TEAM_3].map((team, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
                <KaraTeamHeader teamNum={i + 1} assignments={viewAssignments} allRows={[...team.g1, ...team.g2]} roster={viewRoster} specOverrides={specOverrides} />
                <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row" }}>
                  <div style={{ flex: 1, borderRight: isNarrow ? "none" : "1px solid #9b72cf18", borderBottom: isNarrow ? "1px solid #9b72cf18" : "none" }}>
                    <PublicPanel title="GROUP 1" icon="🏰" subtitle="5-Man Group" bossImage="kara" compact={true}
                      rows={team.g1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} specOverrides={specOverrides} wclScores={wclScores} activeTab={activeTab} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <PublicPanel title="GROUP 2" icon="🏰" subtitle="5-Man Group" bossImage="kara" compact={true}
                      rows={team.g2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} specOverrides={specOverrides} wclScores={wclScores} activeTab={activeTab} />
                  </div>
                </div>
              </div>
            ))}
          </>}

          {activeTab === "mags" && <>
            <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
            <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
              <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P1} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
              <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P2} assignments={viewAssignments} textValues={viewTextInputs} roster={viewRoster} searchName={searchName} isMobile={isMobile} wclScores={wclScores} activeTab={activeTab} />
            </div>
          </>}

          {/* ── Mobile Parse Scores (bottom, only on mobile) ── */}
          {isMobile && viewRoster.length > 0 && (
            <div style={{ marginTop: 20, border: "1px solid #1e1e3a", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "#0a0a14", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#c8a84b", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em" }}>
                  📊 PARSE SCORES
                  {wclLoading && <span style={{ color: "#888", marginLeft: 8 }}>loading…</span>}
                </span>
                {wclLastFetch && <span style={{ fontSize: 7, color: "#555", fontFamily: "'Cinzel', serif" }}>Updated {wclLastFetch.toLocaleTimeString()}</span>}
              </div>
              <div style={{ background: "#07070f" }}>
                <div style={{ display: "flex", padding: "5px 12px 4px", borderBottom: "1px solid #1a1a2a" }}>
                  <span style={{ flex: 1, fontSize: 8, color: "#555", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>PLAYER</span>
                  <span style={{ width: 40, fontSize: 8, color: "#9b72cf", textAlign: "center", fontFamily: "'Cinzel', serif" }}>KARA</span>
                  <span style={{ width: 40, fontSize: 8, color: "#c8a84b", textAlign: "center", fontFamily: "'Cinzel', serif" }}>G/M</span>
                </div>
                <ParseScoresList
                  roster={viewRoster} wclScores={wclScores} wclLoading={wclLoading}
                  activeTab={activeTab} onWclNameChange={handleWclNameChange}
                  rowPadding="4px 12px" fontSize={12} scoreWidth={40}
                />
              </div>
            </div>
          )}

          </div>
        </div>
      )}
    </div>
  );
}

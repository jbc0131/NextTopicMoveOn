import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, getColor, getSpecDisplay, getClass,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  KARA_TEAM_1, KARA_TEAM_2, KARA_TEAM_3, KARA_ALL_ROWS,
  loadState,
} from "./constants";
import { FontImport, RoleHeader, BossPanel, RaidTabs, WarningBar, KaraTeamHeader } from "./components";
import { fetchFromFirebase, subscribeToFirebase, isFirebaseConfigured } from "./firebase";

const FIREBASE_OK = isFirebaseConfigured();

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
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: live ? "#4ade80" : "#444", fontFamily: "'Cinzel', serif" }}>
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
function PublicRow({ rowCfg, slots, textValue, searchName, isMobile }) {
  const rc = ROLE_COLORS[rowCfg.role];

  const isHighlighted = searchName && slots.some(
    s => s.name.toLowerCase().includes(searchName.toLowerCase())
  );

  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "center",
      gap: isMobile ? 6 : 10,
      padding: "8px 12px", borderRadius: 5, minHeight: 44,
      background: isHighlighted ? "#2a2000" : rc.bg,
      border: `1px solid ${isHighlighted ? "#c8a84b" : rc.border}`,
      transition: "all 0.2s",
      boxShadow: isHighlighted ? "0 0 12px #c8a84b44, inset 0 0 20px #c8a84b0a" : "none",
    }}>
      <span style={{
        fontSize: isMobile ? 12 : 14, color: "#ffffff",
        fontFamily: "'Cinzel', serif",
        flexShrink: 0,
        ...(isMobile ? {} : { minWidth: 180, maxWidth: 220 }),
      }}>
        {rowCfg.label}
        {rowCfg.hint && <span style={{ color: "#888", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>}
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
              borderRadius: 4, padding: "4px 10px",
              color: color, fontFamily: "'Cinzel', serif", fontSize: isMobile ? 13 : 14,
              boxShadow: nameMatch ? `0 0 8px ${color}66` : "none",
              transition: "all 0.2s", maxWidth: "100%",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: nameMatch ? 700 : 600 }}>{slot.name}</span>
              {!isMobile && (
                <span style={{ color: `${color}77`, fontSize: 11 }}>{getSpecDisplay(slot)} {getClass(slot)}</span>
              )}
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
function PublicPanel({ title, icon, subtitle, bossImage, rows, assignments, textValues, roster, searchName, isMobile }) {
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
    return ids.map(id => roster.find(s => s.id === id)).filter(Boolean);
  };
  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} overrideLabel={item.label} />
          : <PublicRow key={item.row.key} rowCfg={item.row}
              slots={resolve(item.row.key)}
              textValue={textValues?.[item.row.key] || ""}
              searchName={searchName}
              isMobile={isMobile} />
      )}
    </BossPanel>
  );
}

// ── Empty / loading states ────────────────────────────────────────────────────
function EmptyState({ loading }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 56 }}>{loading ? "⏳" : "⚔"}</div>
      <div style={{ fontFamily: "'Cinzel', serif", color: "#2a2a4a", fontSize: 14 }}>
        {loading ? "Loading assignments…" : "No assignments published yet"}
      </div>
      {!loading && <div style={{ color: "#1a1a2a", fontSize: 11 }}>The raid leader hasn't saved assignments yet — check back soon.</div>}
    </div>
  );
}

// ── Main Public View ──────────────────────────────────────────────────────────
export default function PublicView({ teamId, teamName }) {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [liveSync,   setLiveSync]  = useState(false);
  const [activeTab,  setActiveTab] = useState("gruul");
  const [lastUpdate, setLastUpdate]= useState(null);
  const [searchName, setSearchName]= useState("");
  const navigate = useNavigate();
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isNarrow = width < 1100;

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
      return () => unsub();
    } else {
      const s = loadState(teamId);
      setData(s);
      setLoading(false);
      setLiveSync(false);
    }
  }, [teamId]);

  const roster      = data?.roster      ?? [];
  const assignments = data?.assignments ?? {};
  const raidDate    = data?.raidDate    ?? "";
  const raidLeader  = data?.raidLeader  ?? "";

  const totalSlots  = [...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2, ...KARA_ALL_ROWS].length;
  const filledSlots = Object.keys(assignments).length;
  const hasData     = roster.length > 0 && filledSlots > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(180deg, #0d0800 0%, #060608 100%)",
        borderBottom: "1px solid #2a1800",
        padding: "12px 24px", display: "flex", alignItems: "center", gap: 16,
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: isMobile ? 14 : 18, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif", letterSpacing: "0.04em" }}>
            ⚔ NEXT TOPIC MOVE ON
          </div>
          <div style={{ fontSize: 11, color: "#ffffff", letterSpacing: "0.05em", marginTop: 2 }}>
            {teamName}
          </div>
        </div>

        {hasData && !isMobile && (
          <div style={{ display: "flex", gap: 20, marginLeft: 16, alignItems: "center" }}>
            {raidDate   && <Meta label="Date"   value={raidDate} />}
            {raidLeader && <Meta label="Leader" value={raidLeader} />}
          </div>
        )}

        {/* 🔍 Search box */}
        {hasData && (
          <div style={{ marginLeft: isMobile ? 0 : "auto", width: isMobile ? "100%" : 240 }}>
            <SearchBox value={searchName} onChange={setSearchName} />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: isMobile ? 0 : (hasData ? 12 : "auto") }}>
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && !isMobile && (
            <span style={{ fontSize: 9, color: "#666", fontFamily: "'Cinzel', serif" }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => navigate("/")}
            style={{
              background: "#0d0d1a", border: "1px solid #444",
              borderRadius: 4, color: "#aaa", cursor: "pointer",
              padding: "5px 12px", fontSize: 10, fontFamily: "'Cinzel', serif",
              transition: "color 0.2s, border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }}
            onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}
          >
            ← Teams
          </button>
          <button
            onClick={() => navigate(`/${teamId}/admin`)}
            style={{
              background: "#0d0d1a", border: "1px solid #444",
              borderRadius: 4, color: "#aaa", cursor: "pointer",
              padding: "5px 12px", fontSize: 10, fontFamily: "'Cinzel', serif",
              transition: "color 0.2s, border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#888"; }}
            onMouseLeave={e => { e.currentTarget.style.color="#aaa"; e.currentTarget.style.borderColor="#444"; }}
          >
            Admin
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {(!hasData) ? (
        <EmptyState loading={loading} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 10px" : "16px 24px" }}>
          <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={raidDate} raidLeader={raidLeader} />

          {activeTab === "gruul" && <>
            <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
            <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
              <PublicPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar}
                rows={GRUUL_MAULGAR} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
              <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul}
                rows={GRUUL_BOSS} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
            </div>
          </>}

          {activeTab === "kara" && <>
            {[KARA_TEAM_1, KARA_TEAM_2, KARA_TEAM_3].map((team, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
                <KaraTeamHeader
                  teamNum={i + 1}
                  assignments={assignments}
                  allRows={[...team.g1, ...team.g2]}
                  roster={roster}
                />
                <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", border: "1px solid #9b72cf33", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                  <div style={{ flex: 1, borderRight: isNarrow ? "none" : "1px solid #9b72cf22", borderBottom: isNarrow ? "1px solid #9b72cf22" : "none" }}>
                    <PublicPanel title="GROUP 1" icon="🏰" subtitle="5-Man Group" bossImage="kara"
                      rows={team.g1} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <PublicPanel title="GROUP 2" icon="🏰" subtitle="5-Man Group" bossImage="kara"
                      rows={team.g2} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
                  </div>
                </div>
              </div>
            ))}
          </>}

          {activeTab === "mags" && <>
            <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
            <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 14 }}>
              <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P1} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
              <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P2} assignments={assignments} textValues={data?.textInputs} roster={roster} searchName={searchName} isMobile={isMobile} />
            </div>
          </>}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 8, color: "#2a2010", letterSpacing: "0.15em", fontFamily: "'Cinzel', serif" }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 11, color: "#8a7040", fontFamily: "'Cinzel', serif" }}>{value}</span>
    </div>
  );
}

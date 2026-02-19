import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_COLORS, getColor, getClass,
  GRUUL_MAULGAR, GRUUL_BOSS, MAGS_P1, MAGS_P2, BOSS_KEYS,
  loadState,
} from "./constants";
import { FontImport, RoleHeader, BossPanel, RaidTabs, WarningBar } from "./components";
import { fetchFromFirebase, subscribeToFirebase, isFirebaseConfigured } from "./firebase";

const FIREBASE_OK = isFirebaseConfigured();

// ── Live sync indicator ───────────────────────────────────────────────────────
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

// ── Single read-only assignment row ──────────────────────────────────────────
function PublicRow({ rowCfg, slot }) {
  const rc    = ROLE_COLORS[rowCfg.role];
  const color = slot ? getColor(slot) : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "5px 10px", borderRadius: 5, minHeight: 30,
      background: rc.bg, border: `1px solid ${rc.border}`,
    }}>
      <span style={{ fontSize: 10, color: rc.label, fontFamily: "'Cinzel', serif", minWidth: 180, flexShrink: 0 }}>
        {rowCfg.label}
        {rowCfg.hint && <span style={{ color: "#333", marginLeft: 5, fontSize: 9, fontFamily: "monospace" }}>({rowCfg.hint})</span>}
      </span>
      <div style={{ flex: 1 }}>
        {slot ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: `${color}18`, border: `1px solid ${color}44`,
            borderRadius: 4, padding: "3px 10px",
            color: color, fontFamily: "'Cinzel', serif", fontSize: 12,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{slot.name}</span>
            <span style={{ color: `${color}77`, fontSize: 9 }}>{slot.specName} {getClass(slot)}</span>
          </span>
        ) : (
          <span style={{ color: "#1e1e2e", fontSize: 11, fontStyle: "italic" }}>— unassigned —</span>
        )}
      </div>
    </div>
  );
}

// ── Public read-only panel ────────────────────────────────────────────────────
function PublicPanel({ title, icon, subtitle, bossImage, rows, assignments, roster }) {
  let lastRole = null;
  const items  = [];
  rows.forEach(r => {
    if (r.role !== lastRole) { items.push({ type: "header", role: r.role }); lastRole = r.role; }
    items.push({ type: "row", row: r });
  });
  const resolve = key => assignments[key] ? roster.find(s => s.id === assignments[key]) : null;
  return (
    <BossPanel title={title} icon={icon} subtitle={subtitle} bossImage={bossImage}>
      {items.map((item, i) =>
        item.type === "header"
          ? <RoleHeader key={i} role={item.role} />
          : <PublicRow key={item.row.key} rowCfg={item.row} slot={resolve(item.row.key)} />
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
      {!loading && (
        <div style={{ color: "#1a1a2a", fontSize: 11 }}>The raid leader hasn't saved assignments yet — check back soon.</div>
      )}
    </div>
  );
}

// ── Main Public View ──────────────────────────────────────────────────────────
export default function PublicView() {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [liveSync,   setLiveSync]  = useState(false);
  const [activeTab,  setActiveTab] = useState("gruul");
  const [lastUpdate, setLastUpdate]= useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (FIREBASE_OK) {
      // Subscribe to real-time updates
      const unsub = subscribeToFirebase(snapshot => {
        setData(snapshot);
        setLoading(false);
        setLiveSync(true);
        setLastUpdate(new Date());
      });
      // Also do an initial fetch to populate faster before the subscription fires
      fetchFromFirebase()
        .then(d => { if (d) { setData(d); setLoading(false); } })
        .catch(() => {});
      return () => unsub();
    } else {
      // Fallback: load from localStorage
      const s = loadState();
      setData(s);
      setLoading(false);
      setLiveSync(false);
    }
  }, []);

  const roster      = data?.roster      ?? [];
  const assignments = data?.assignments ?? {};
  const raidDate    = data?.raidDate    ?? "";
  const raidLeader  = data?.raidLeader  ?? "";

  const totalSlots  = [...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2].length;
  const filledSlots = Object.keys(assignments).length;
  const hasData     = roster.length > 0 && filledSlots > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#06060f", display: "flex", flexDirection: "column" }}>
      <FontImport />

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(180deg, #0d0800 0%, #060608 100%)",
        borderBottom: "1px solid #2a1800",
        padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 18, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif", letterSpacing: "0.04em" }}>
            ⚔ NEXT TOPIC MOVE ON
          </div>
          <div style={{ fontSize: 9, color: "#2a1800", letterSpacing: "0.2em", marginTop: 1 }}>
            GRUUL'S LAIR · MAGTHERIDON'S LAIR · READ ONLY
          </div>
        </div>

        {hasData && (
          <div style={{ display: "flex", gap: 20, marginLeft: 24, alignItems: "center" }}>
            {raidDate   && <Meta label="Date"   value={raidDate} />}
            {raidLeader && <Meta label="Leader" value={raidLeader} />}
            <Meta label="Slots" value={`${filledSlots} / ${totalSlots}`} />
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          {/* Live sync badge */}
          {FIREBASE_OK && <SyncBadge live={liveSync} />}
          {lastUpdate && (
            <span style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "'Cinzel', serif" }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          {/* Subtle admin link */}
          <button
            onClick={() => navigate("/admin")}
            style={{
              background: "none", border: "1px solid #1a1a1a",
              borderRadius: 4, color: "#2a2a2a", cursor: "pointer",
              padding: "4px 10px", fontSize: 10, fontFamily: "'Cinzel', serif",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color="#555"; e.currentTarget.style.borderColor="#555"; }}
            onMouseLeave={e => { e.currentTarget.style.color="#2a2a2a"; e.currentTarget.style.borderColor="#1a1a1a"; }}
          >
            Admin
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {(!hasData) ? (
        <EmptyState loading={loading} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <RaidTabs activeTab={activeTab} onTab={setActiveTab} raidDate={raidDate} raidLeader={raidLeader} />

          {activeTab === "gruul" && <>
            <WarningBar text="COUNCIL: Kill order — Krosh → Olm → Kiggler → Blindeye → Maulgar  |  Spellbreaker chain on Krosh" />
            <div style={{ display: "flex", gap: 14 }}>
              <PublicPanel title="HIGH KING MAULGAR" icon="👑" subtitle="Council of Five" bossImage={BOSS_KEYS.maulgar}
                rows={GRUUL_MAULGAR} assignments={assignments} roster={roster} />
              <PublicPanel title="GRUUL THE DRAGONKILLER" icon="🗿" subtitle="Spread 10yd on Shatter" bossImage={BOSS_KEYS.gruul}
                rows={GRUUL_BOSS} assignments={assignments} roster={roster} />
            </div>
          </>}

          {activeTab === "mags" && <>
            <WarningBar text="CUBES: All 5 clickers must click simultaneously  |  Blast Nova every ~2 min  |  Kill channelers simultaneously" />
            <div style={{ display: "flex", gap: 14 }}>
              <PublicPanel title="PHASE 1 — CHANNELERS" icon="⛓" subtitle="Kill simultaneously" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P1} assignments={assignments} roster={roster} />
              <PublicPanel title="PHASE 2 — MAGTHERIDON" icon="😈" subtitle="Cleave frontal / Quake no move" bossImage={BOSS_KEYS.mags}
                rows={MAGS_P2} assignments={assignments} roster={roster} />
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

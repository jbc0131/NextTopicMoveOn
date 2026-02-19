import { useState } from "react";
import { CLASS_COLORS, ROLE_COLORS, getClass, getColor, getRole } from "./constants";

// ── Shared font import ────────────────────────────────────────────────────────
export function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: #080810; }
      ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
    `}</style>
  );
}

// ── Player badge (used in both views) ────────────────────────────────────────
export function PlayerBadge({ slot, compact = false, draggable: isDraggable = false, onDragStart }) {
  const color = getColor(slot);
  const cls   = getClass(slot);
  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => onDragStart(e, slot) : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 4, padding: compact ? "2px 7px" : "4px 10px",
        cursor: isDraggable ? "grab" : "default",
        userSelect: "none", fontSize: compact ? 11 : 12,
        color: color, fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
        transition: "background 0.15s, border-color 0.15s",
      }}
      title={`${slot.name} — ${slot.specName} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span>{slot.name}</span>
      {!compact && (
        <span style={{ color: `${color}88`, fontSize: 9, marginLeft: 2 }}>
          {slot.specName} {cls}
        </span>
      )}
    </div>
  );
}

// ── Section role header ───────────────────────────────────────────────────────
export function RoleHeader({ role }) {
  const rc     = ROLE_COLORS[role];
  const icons  = { Tank: "🛡", Healer: "💚", DPS: "⚔" };
  const titles = { Tank: "Tank Assignments", Healer: "Healer Assignments", DPS: "DPS Assignments" };
  return (
    <div style={{
      padding: "4px 10px", background: rc.tag, borderRadius: 4,
      fontSize: 10, fontFamily: "'Cinzel', serif", color: "#fff",
      letterSpacing: "0.1em", marginTop: 10, marginBottom: 3,
    }}>
      {icons[role]} {titles[role]}
    </div>
  );
}

// ── Boss panel wrapper ────────────────────────────────────────────────────────
export function BossPanel({ title, icon, subtitle, bossImage, children }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e3a",
      borderRadius: 8, overflow: "hidden", flex: 1, minWidth: 0,
    }}>
      {/* Boss image banner */}
      {bossImage && !imgError && (
        <div style={{
          position: "relative", height: 90, overflow: "hidden",
          borderBottom: "1px solid #1e1e3a",
        }}>
          <img
            src={bossImage}
            alt={title}
            onError={() => setImgError(true)}
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              objectPosition: "center 25%",
              filter: "brightness(0.55) saturate(0.8)",
            }}
          />
          {/* Gradient overlay so title is readable */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to right, #0a0a12cc 0%, transparent 50%, #0a0a12cc 100%)",
          }} />
          {/* Title overlaid on image */}
          <div style={{
            position: "absolute", bottom: 8, left: 12, right: 12,
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: "#e8c870", fontWeight: 700, textShadow: "0 1px 6px #000a" }}>
              {icon} {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 9, color: "#8a7040", letterSpacing: "0.1em", textShadow: "0 1px 4px #000" }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fallback header when no image / image failed */}
      {(!bossImage || imgError) && (
        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: 13, color: "#c8a84b",
          borderBottom: "1px solid #2a2a1a", padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {icon} {title}
          {subtitle && (
            <span style={{ color: "#3a3a2a", fontSize: 9, marginLeft: "auto", letterSpacing: "0.1em" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ── Raid tab bar ──────────────────────────────────────────────────────────────
export function RaidTabs({ activeTab, onTab, raidDate, raidLeader }) {
  const tabs = [
    { id: "gruul", label: "Gruul's Lair", icon: "⚔" },
    { id: "mags",  label: "Magtheridon",  icon: "🔥" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTab(t.id)} style={{
          padding: "7px 20px", borderRadius: 6, cursor: "pointer",
          fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.05em",
          background: activeTab === t.id ? "#1a1000" : "#0a0a14",
          border: `1px solid ${activeTab === t.id ? "#c8a84b" : "#2a2a3a"}`,
          color: activeTab === t.id ? "#c8a84b" : "#444",
          transition: "all 0.15s",
        }}>
          {t.icon} {t.label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 10, color: "#444", display: "flex", gap: 16 }}>
        {raidDate   && <span>📅 {raidDate}</span>}
        {raidLeader && <span>👑 {raidLeader}</span>}
      </div>
    </div>
  );
}

// ── Warning bar ───────────────────────────────────────────────────────────────
export function WarningBar({ text }) {
  return (
    <div style={{
      color: "#ef4444", fontSize: 9, marginBottom: 10,
      letterSpacing: "0.08em", padding: "4px 8px",
      background: "#200a0a", border: "1px solid #3a1010", borderRadius: 4,
    }}>
      ⚠ {text}
    </div>
  );
}

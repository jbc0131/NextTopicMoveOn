import { ROLE_COLORS, getClass, getSpecDisplay, getColor } from "./constants";

// ── Shared font import ────────────────────────────────────────────────────────
export function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: #080810; }
      ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
      body { margin: 0; overflow-x: hidden; }
      @media (max-width: 768px) {
        input, textarea, select { font-size: 16px !important; }
      }
    `}</style>
  );
}

// ── Boss banner config ────────────────────────────────────────────────────────
// Each boss gets a unique gradient + accent color + flavor text
const BOSS_BANNERS = {
  maulgar: {
    gradient: "linear-gradient(135deg, #2a1200 0%, #1a0c00 40%, #0e0800 100%)",
    accent:   "#c87820",
    glow:     "radial-gradient(ellipse at 20% 50%, #c8781822 0%, transparent 65%)",
    label:    "GRUUL'S LAIR  ·  BOSS 1 OF 2",
    rune:     "⚔",
  },
  gruul: {
    gradient: "linear-gradient(135deg, #0a1828 0%, #061018 40%, #040810 100%)",
    accent:   "#4a8aCC",
    glow:     "radial-gradient(ellipse at 20% 50%, #2a5a9a22 0%, transparent 65%)",
    label:    "GRUUL'S LAIR  ·  BOSS 2 OF 2",
    rune:     "🗿",
  },
  kara: {
    gradient: "linear-gradient(135deg, #0d0a1a 0%, #080610 40%, #050408 100%)",
    accent:   "#9b72cf",
    glow:     "radial-gradient(ellipse at 20% 50%, #9b72cf22 0%, transparent 65%)",
    label:    "KARAZHAN  ·  10-MAN RAID",
    rune:     "🏰",
  },
  mags: {
    gradient: "linear-gradient(135deg, #200800 0%, #140400 40%, #0c0204 100%)",
    accent:   "#cc3300",
    glow:     "radial-gradient(ellipse at 20% 50%, #cc330022 0%, transparent 65%)",
    label:    "MAGTHERIDON'S LAIR  ·  SOLO BOSS",
    rune:     "🔥",
  },
};

// ── Player badge ──────────────────────────────────────────────────────────────
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
        userSelect: "none", fontSize: compact ? 13 : 15,
        color: color, fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
        transition: "background 0.15s, border-color 0.15s",
      }}
      title={`${slot.name} — ${getSpecDisplay(slot)} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span>{slot.name}</span>
      {!compact && (
        <span style={{ color: `${color}88`, fontSize: 11, marginLeft: 2 }}>
          {getSpecDisplay(slot)} {cls}
        </span>
      )}
    </div>
  );
}

// ── Section role header ───────────────────────────────────────────────────────
export function RoleHeader({ role, overrideLabel }) {
  const rc     = ROLE_COLORS[role];
  const icons  = { Tank: "🛡", Healer: "💚", DPS: "⚔" };
  const titles = { Tank: "Tank Assignments", Healer: "Healer Assignments", DPS: "DPS Assignments" };
  const label  = overrideLabel ?? titles[role];
  if (!label.trim()) return null;
  return (
    <div style={{
      padding: "7px 10px", background: rc.tag, borderRadius: 4,
      fontSize: 16, fontFamily: "'Cinzel', serif", color: "#fff",
      letterSpacing: "0.12em", marginTop: 12, marginBottom: 4,
      textAlign: "center", fontWeight: 700,
    }}>
      {icons[role]}  {label}
    </div>
  );
}

// ── Boss panel wrapper ────────────────────────────────────────────────────────
export function BossPanel({ title, icon, subtitle, bossImage, children }) {
  const banner = bossImage ? BOSS_BANNERS[bossImage] : null;

  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e3a",
      borderRadius: 8, overflow: "hidden", flex: 1, minWidth: 0,
    }}>
      {/* Banner */}
      <div style={{
        position: "relative", height: 64,
        background: banner ? banner.gradient : "#0d0d1a",
        borderBottom: `1px solid ${banner ? banner.accent + "44" : "#1e1e3a"}`,
        overflow: "hidden",
      }}>
        {/* Glow layer */}
        {banner && (
          <div style={{ position: "absolute", inset: 0, background: banner.glow }} />
        )}



        {/* Top-right metadata label */}
        {banner && (
          <div style={{
            position: "absolute", top: 8, right: 12,
            fontSize: 8, color: banner.accent + "66",
            fontFamily: "'Cinzel', serif", letterSpacing: "0.15em",
          }}>
            {banner.label}
          </div>
        )}

        {/* Large decorative rune watermark */}
        {banner && (
          <div style={{
            position: "absolute", right: 16, bottom: -8,
            fontSize: 52, opacity: 0.06, lineHeight: 1,
            userSelect: "none", pointerEvents: "none",
          }}>
            {banner.rune}
          </div>
        )}

        {/* Main title */}
        <div style={{
          position: "absolute", bottom: 10, left: 14,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 3, height: 28, borderRadius: 2,
            background: banner ? banner.accent : "#c8a84b",
            flexShrink: 0,
          }} />
          <div>
            <div style={{
              fontFamily: "'Cinzel', serif", fontSize: 17, fontWeight: 700,
              color: banner ? banner.accent : "#c8a84b",
              letterSpacing: "0.05em", lineHeight: 1.2,
            }}>
              {icon} {title}
            </div>
            {subtitle && (
              <div style={{
                fontSize: 9, color: banner ? banner.accent + "66" : "#3a3a2a",
                letterSpacing: "0.12em", marginTop: 2,
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </div>

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
    { id: "kara",  label: "Karazhan",     icon: "🏰" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTab(t.id)} style={{
          padding: "7px 20px", borderRadius: 6, cursor: "pointer",
          fontFamily: "'Cinzel', serif", fontSize: 15, letterSpacing: "0.05em",
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

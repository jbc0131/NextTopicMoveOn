import { ROLE_COLORS, getClass, getSpecDisplay, getColor, getRole, cycleSpec, CLASS_SPECS } from "./constants";

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
  const specFull = getSpecDisplay(slot);
  // Abbreviated spec+class for sidebar: "Fury War", "BM Hunt", "Resto Sham" etc.
  const specShort = specFull.slice(0, 4) + " " + cls.slice(0, 4);
  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => onDragStart(e, slot) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 4, padding: "4px 8px",
        cursor: isDraggable ? "grab" : "default",
        userSelect: "none", fontSize: "13px", lineHeight: "1.2",
        color: color, fontFamily: "'Cinzel', serif",
        width: "100%", minWidth: 0, overflow: "hidden", boxSizing: "border-box",
        transition: "background 0.15s, border-color 0.15s",
      }}
      title={`${slot.name} — ${specFull} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>
        {slot.name}
      </span>
      {!compact && (
        <span style={{ color: `${color}bb`, fontSize: 10, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 2 }}>
          {specShort}
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
export function BossPanel({ title, icon, subtitle, bossImage, children, compact = false }) {
  const banner = bossImage ? BOSS_BANNERS[bossImage] : null;

  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e3a",
      borderRadius: compact ? 0 : 8, overflow: "hidden", flex: 1, minWidth: 0,
    }}>
      {/* Banner */}
      <div style={{
        position: "relative", height: compact ? 44 : 64,
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
            fontSize: 8, color: banner.accent + "bb",
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
              fontFamily: "'Cinzel', serif", fontSize: compact ? 12 : 17, fontWeight: 700,
              color: banner ? banner.accent : "#c8a84b",
              letterSpacing: "0.05em", lineHeight: 1.2,
            }}>
              {icon} {title}
            </div>
            {subtitle && !compact && (
              <div style={{
                fontSize: 9, color: banner ? banner.accent + "bb" : "#888",
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

// ── Raid utility mappings (TBC) ──────────────────────────────────────────────
const UTILITY = {
  decurse: {
    label: "Decurse", icon: "🌿", color: "#86efac",
    specs: new Set(["Arcane","Fire","Frost","Balance","Feral","Restoration","Guardian","Dreamstate"]),
  },
  dispelMagicFriendly: {
    label: "Dispel Magic", icon: "💜", color: "#c084fc",
    specs: new Set(["Holy","Discipline","Shadow","Smite","Holy1","Protection1","Retribution"]),
  },
  dispelPoison: {
    label: "Cure Poison", icon: "💚", color: "#4ade80",
    specs: new Set(["Holy1","Protection1","Retribution","Balance","Feral","Restoration","Guardian","Dreamstate","Elemental","Enhancement","Restoration1"]),
  },
  dispelDisease: {
    label: "Cure Disease", icon: "🤍", color: "#e2e8f0",
    specs: new Set(["Holy","Discipline","Shadow","Smite","Holy1","Protection1","Retribution","Elemental","Enhancement","Restoration1"]),
  },
  interrupt: {
    label: "Interrupts", icon: "⚡", color: "#fbbf24",
    specs: new Set(["Arms","Fury","Protection","Combat","Subtlety","Assassination","Elemental","Enhancement","Restoration1","Beastmastery","Marksmanship","Survival","Affliction","Demonology","Destruction"]),
  },
  deenrage: {
    label: "De-Enrage", icon: "🏹", color: "#fb923c",
    specs: new Set(["Beastmastery","Marksmanship","Survival"]),
  },
};

function getUtilityCounts(playerList) {
  const counts = {};
  Object.keys(UTILITY).forEach(k => counts[k] = 0);
  playerList.forEach(player => {
    const spec = player.specName;
    Object.entries(UTILITY).forEach(([key, def]) => {
      if (def.specs.has(spec)) counts[key]++;
    });
  });
  return counts;
}

// ── Karazhan team header with composition tracker ─────────────────────────────
export function KaraTeamHeader({ teamNum, assignments, allRows, roster, specOverrides }) {
  const keys = new Set(allRows.map(r => r.key));
  let tanks = 0, healers = 0, dps = 0;
  const players = [];

  Object.entries(assignments).forEach(([key, ids]) => {
    if (!keys.has(key)) return;
    const idList = Array.isArray(ids) ? ids : [ids];
    idList.forEach(id => {
      const player = roster.find(s => s.id === id);
      if (!player) return;
      const overriddenSpec = specOverrides?.[id];
      const effective = overriddenSpec ? { ...player, specName: overriddenSpec, className: overriddenSpec } : player;
      const role = getRole(effective);
      if (role === "Tank")        tanks++;
      else if (role === "Healer") healers++;
      else dps++;
      players.push(effective);
    });
  });
  const total = tanks + healers + dps;
  const utility = getUtilityCounts(players);

  const pill = (label, count, color, bg) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: bg, border: `1px solid ${color}44`,
      borderRadius: 20, padding: "4px 12px",
    }}>
      <span style={{ fontSize: 11, color, fontFamily: "'Cinzel', serif", fontWeight: 700 }}>{label}</span>
      <span style={{
        background: count > 0 ? color : "#333", color: count > 0 ? "#000" : "#666",
        borderRadius: 10, fontSize: 11, fontWeight: 700,
        padding: "1px 7px", fontFamily: "'Cinzel', serif", minWidth: 20, textAlign: "center",
      }}>{count}</span>
    </div>
  );

  const utilPill = (key) => {
    const { label, icon, color } = UTILITY[key];
    const count = utility[key];
    return (
      <div key={key} style={{
        display: "flex", alignItems: "center", gap: 5,
        background: count > 0 ? `${color}12` : "#0a0a12",
        border: `1px solid ${count > 0 ? color + "44" : "#1a1a2a"}`,
        borderRadius: 16, padding: "3px 10px",
      }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 10, color: count > 0 ? color : "#777", fontFamily: "'Cinzel', serif" }}>{label}</span>
        <span style={{
          background: count > 0 ? color : "#222", color: count > 0 ? "#000" : "#555",
          borderRadius: 10, fontSize: 10, fontWeight: 700,
          padding: "1px 6px", fontFamily: "'Cinzel', serif", minWidth: 16, textAlign: "center",
        }}>{count}</span>
      </div>
    );
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, #0d0a1a 0%, #080610 100%)",
      border: "1px solid #9b72cf44",
      borderRadius: "8px 8px 0 0",
      padding: "14px 24px 12px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      borderBottom: "2px solid #9b72cf55",
      position: "relative",
    }}>
      {/* Row 1: Title + role pills + counter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap", width: "100%" }}>
        <div style={{
          fontSize: 30, color: "#d4b8f0", fontFamily: "'Cinzel Decorative', serif",
          letterSpacing: "0.1em", textAlign: "center", textShadow: "0 0 20px #9b72cf66",
        }}>
          🏰 TEAM {teamNum}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {pill("TANK",   tanks,   "#60a5fa", "#001828")}
          {pill("HEALER", healers, "#4ade80", "#001808")}
          {pill("DPS",    dps,     "#f87171", "#180808")}
        </div>
        <div style={{
          position: "absolute", right: 16, top: 16,
          fontSize: 11, color: total === 10 ? "#4ade80" : "#b09ad0",
          fontFamily: "'Cinzel', serif", letterSpacing: "0.1em",
          fontWeight: total === 10 ? 700 : 400,
        }}>
          {total}/10 {total === 10 ? "✓ FULL" : ""}
        </div>
      </div>

      {/* Row 2: Utility pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#9b72cf", fontFamily: "'Cinzel', serif", letterSpacing: "0.15em", marginRight: 2 }}>RAID UTILITY</span>
        {Object.keys(UTILITY).map(k => utilPill(k))}
      </div>
    </div>
  );
}

// ── Kara player badge — with click-to-cycle spec ──────────────────────────────
export function KaraPlayerBadge({ slot, onSpecCycle, onDragStart, compact = false }) {
  const color   = getColor(slot);
  const cls     = getClass(slot);
  const specs   = CLASS_SPECS[cls] || [];
  const canCycle = specs.length > 1;
  const specDisplay = (slot.specName || "").replace(/\d+$/, "");
  const role    = getRole(slot);
  const roleColor = role === "Tank" ? "#60a5fa" : role === "Healer" ? "#4ade80" : "#f87171";

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(e, slot); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 4, padding: "4px 8px 4px 10px",
        color, fontFamily: "'Cinzel', serif",
        cursor: onDragStart ? "grab" : "default",
      }}
      title={onDragStart ? "Drag to move to another slot" : undefined}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: 600, fontSize: 13 }}>{slot.name}</span>

      {/* Spec cycling button */}
      {canCycle && onSpecCycle ? (
        <button
          onClick={() => onSpecCycle(slot.id)}
          title={`Click to cycle spec (${specs.map(s => s.specName.replace(/\d+$/,'')).join(' → ')})`}
          style={{
            marginLeft: 4, display: "flex", alignItems: "center", gap: 4,
            background: `${roleColor}18`, border: `1px solid ${roleColor}44`,
            borderRadius: 10, padding: "2px 8px", cursor: "pointer",
            color: roleColor, fontSize: 10, fontFamily: "'Cinzel', serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background=`${roleColor}33`; e.currentTarget.style.borderColor=roleColor; }}
          onMouseLeave={e => { e.currentTarget.style.background=`${roleColor}18`; e.currentTarget.style.borderColor=`${roleColor}44`; }}
        >
          {specDisplay} {cls} ↻
        </button>
      ) : (
        <span style={{ color: `${color}77`, fontSize: 11 }}>{specDisplay} {cls}</span>
      )}
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
          color: activeTab === t.id ? "#c8a84b" : "#888",
          transition: "all 0.15s",
        }}>
          {t.icon} {t.label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 10, color: "#888", display: "flex", gap: 16 }}>
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

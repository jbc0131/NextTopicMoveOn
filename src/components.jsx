import { CLASS_COLORS, ROLE_COLORS, getClass, getColor } from "./constants";

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

// ── Inline SVG boss art ───────────────────────────────────────────────────────
// Stylised silhouettes so we have no external image dependency

function MaulgarSVG() {
  return (
    <svg viewBox="0 0 400 90" xmlns="http://www.w3.org/2000/svg" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
      <defs>
        <radialGradient id="mg_bg" cx="30%" cy="60%">
          <stop offset="0%" stopColor="#3a1a00"/>
          <stop offset="100%" stopColor="#080608"/>
        </radialGradient>
        <radialGradient id="mg_glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#c8720055"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="400" height="90" fill="url(#mg_bg)"/>
      {/* Atmospheric glow behind figure */}
      <ellipse cx="130" cy="70" rx="90" ry="55" fill="url(#mg_glow)" opacity="0.6"/>
      {/* Council silhouettes - 5 rough ogre/humanoid shapes */}
      {/* Maulgar - large central ogre */}
      <g fill="#2a1400" opacity="0.9">
        <ellipse cx="128" cy="85" rx="22" ry="6"/>
        <rect x="112" y="38" width="32" height="48" rx="4"/>
        <ellipse cx="128" cy="34" rx="18" ry="16"/>
        {/* horns */}
        <polygon points="116,24 110,8 120,22"/>
        <polygon points="140,24 146,8 136,22"/>
        {/* shoulders wide */}
        <ellipse cx="108" cy="46" rx="10" ry="7"/>
        <ellipse cx="148" cy="46" rx="10" ry="7"/>
        {/* weapon - axe */}
        <rect x="150" y="28" width="5" height="55" rx="2"/>
        <polygon points="155,28 170,20 168,38"/>
      </g>
      {/* Smaller council members */}
      <g fill="#1e1000" opacity="0.7">
        {/* left - robed figure */}
        <rect x="70" y="52" width="18" height="38" rx="3"/>
        <ellipse cx="79" cy="48" rx="10" ry="10"/>
        <polygon points="74,38 79,22 84,38"/>
        {/* far left - hunched */}
        <rect x="30" y="60" width="16" height="30" rx="3"/>
        <ellipse cx="38" cy="57" rx="9" ry="9"/>
        {/* right - mage with staff */}
        <rect x="168" y="50" width="16" height="40" rx="3"/>
        <ellipse cx="176" cy="46" rx="9" ry="9"/>
        <rect x="185" y="28" width="3" height="52" rx="1"/>
        <circle cx="186" cy="27" r="5" fill="#ff8c00" opacity="0.8"/>
        {/* far right */}
        <rect x="200" y="55" width="14" height="35" rx="3"/>
        <ellipse cx="207" cy="51" rx="8" ry="8"/>
      </g>
      {/* Rune/fire particles */}
      <circle cx="95"  cy="35" r="2" fill="#ff6a00" opacity="0.6"/>
      <circle cx="160" cy="30" r="1.5" fill="#ff8c00" opacity="0.5"/>
      <circle cx="55"  cy="45" r="1.5" fill="#ff6a00" opacity="0.4"/>
      <circle cx="220" cy="42" r="2" fill="#ffa500" opacity="0.5"/>
      {/* Right side - decorative runes/text area */}
      <text x="280" y="40" fontFamily="serif" fontSize="26" fill="#3a1800" opacity="0.4" letterSpacing="4">⚔ ♦ ⚔</text>
      <text x="265" y="65" fontFamily="serif" fontSize="11" fill="#2a1000" opacity="0.5" letterSpacing="6">BLADESPIRE OGRES</text>
    </svg>
  );
}

function GruulSVG() {
  return (
    <svg viewBox="0 0 400 90" xmlns="http://www.w3.org/2000/svg" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
      <defs>
        <radialGradient id="gr_bg" cx="25%" cy="70%">
          <stop offset="0%" stopColor="#0d1a2a"/>
          <stop offset="100%" stopColor="#04080e"/>
        </radialGradient>
        <radialGradient id="gr_glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#1a4a7a66"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="400" height="90" fill="url(#gr_bg)"/>
      <ellipse cx="140" cy="75" rx="110" ry="50" fill="url(#gr_glow)" opacity="0.5"/>
      {/* Gruul - enormous gronn, mostly fills left side */}
      <g fill="#0d1e30" opacity="0.95">
        {/* body - very wide and tall */}
        <rect x="60" y="10" width="90" height="80" rx="8"/>
        {/* head - large boxy */}
        <rect x="72" y="2" width="66" height="50" rx="6"/>
        {/* jaw protrusion */}
        <rect x="82" y="38" width="46" height="18" rx="4"/>
        {/* massive shoulders */}
        <ellipse cx="58"  cy="30" rx="20" ry="18"/>
        <ellipse cx="152" cy="30" rx="20" ry="18"/>
        {/* arms hanging */}
        <rect x="38" y="30" width="24" height="52" rx="6"/>
        <rect x="148" y="30" width="24" height="52" rx="6"/>
        {/* fists */}
        <ellipse cx="50"  cy="84" rx="14" ry="10"/>
        <ellipse cx="160" cy="84" rx="14" ry="10"/>
        {/* rocky protrusions on back */}
        <polygon points="75,10 80,0 85,10"/>
        <polygon points="100,5 105,-4 110,5"/>
        <polygon points="122,8 127,0 132,8"/>
        {/* eye glow sockets */}
        <ellipse cx="92"  cy="20" rx="8" ry="6" fill="#061424"/>
        <ellipse cx="118" cy="20" rx="8" ry="6" fill="#061424"/>
      </g>
      {/* eye glow */}
      <ellipse cx="92"  cy="20" rx="5" ry="4" fill="#1a4a8a" opacity="0.8"/>
      <ellipse cx="118" cy="20" rx="5" ry="4" fill="#1a4a8a" opacity="0.8"/>
      <ellipse cx="92"  cy="20" rx="2" ry="2" fill="#4a9aff" opacity="0.9"/>
      <ellipse cx="118" cy="20" rx="2" ry="2" fill="#4a9aff" opacity="0.9"/>
      {/* cave debris/rocks on ground */}
      <ellipse cx="48"  cy="89" rx="12" ry="4" fill="#0a1420" opacity="0.6"/>
      <ellipse cx="168" cy="89" rx="10" ry="4" fill="#0a1420" opacity="0.6"/>
      {/* right panel decorative */}
      <text x="230" y="38" fontFamily="serif" fontSize="28" fill="#0d2035" opacity="0.5" letterSpacing="3">🗿</text>
      <text x="215" y="62" fontFamily="serif" fontSize="10" fill="#0d1e30" opacity="0.5" letterSpacing="5">THE DRAGONKILLER</text>
      {/* Scattered rock shapes */}
      <polygon points="220,75 232,68 238,78 225,82" fill="#0a1828" opacity="0.5"/>
      <polygon points="290,70 305,62 312,74 297,80" fill="#0a1828" opacity="0.4"/>
    </svg>
  );
}

function MagsSVG() {
  return (
    <svg viewBox="0 0 400 90" xmlns="http://www.w3.org/2000/svg" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
      <defs>
        <radialGradient id="ms_bg" cx="30%" cy="60%">
          <stop offset="0%" stopColor="#1a0800"/>
          <stop offset="100%" stopColor="#080608"/>
        </radialGradient>
        <radialGradient id="ms_fire" cx="50%" cy="80%">
          <stop offset="0%" stopColor="#ff450055"/>
          <stop offset="60%" stopColor="#8b000033"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="400" height="90" fill="url(#ms_bg)"/>
      <ellipse cx="140" cy="90" rx="130" ry="60" fill="url(#ms_fire)" opacity="0.7"/>
      {/* Magtheridon - pit lord, huge, chained */}
      <g fill="#180808" opacity="0.95">
        {/* massive torso */}
        <rect x="65" y="20" width="85" height="70" rx="6"/>
        {/* broad chest */}
        <ellipse cx="107" cy="38" rx="48" ry="28"/>
        {/* head - demonic with horns */}
        <ellipse cx="107" cy="18" rx="26" ry="22"/>
        {/* large curved horns */}
        <path d="M88,10 Q70,-10 78,2" stroke="#180808" strokeWidth="10" fill="none"/>
        <path d="M126,10 Q144,-10 136,2" stroke="#180808" strokeWidth="10" fill="none"/>
        {/* horn tips */}
        <polygon points="74,-4 70,-14 80,-2"/>
        <polygon points="140,-4 144,-14 134,-2"/>
        {/* chains on wrists */}
        <rect x="40" y="35" width="28" height="48" rx="5"/>
        <rect x="148" y="35" width="28" height="48" rx="5"/>
        {/* chain links */}
        <rect x="35" y="40" width="10" height="5" rx="2" fill="#2a0a00"/>
        <rect x="33" y="48" width="10" height="5" rx="2" fill="#2a0a00"/>
        <rect x="35" y="56" width="10" height="5" rx="2" fill="#2a0a00"/>
        <rect x="169" y="40" width="10" height="5" rx="2" fill="#2a0a00"/>
        <rect x="171" y="48" width="10" height="5" rx="2" fill="#2a0a00"/>
        <rect x="169" y="56" width="10" height="5" rx="2" fill="#2a0a00"/>
        {/* legs */}
        <rect x="75" y="78" width="24" height="12" rx="4"/>
        <rect x="115" y="78" width="24" height="12" rx="4"/>
        {/* wing stubs */}
        <polygon points="65,25 30,10 55,38"/>
        <polygon points="149,25 184,10 159,38"/>
      </g>
      {/* Demonic eyes - glowing red */}
      <ellipse cx="98"  cy="17" rx="7" ry="5" fill="#3a0000"/>
      <ellipse cx="116" cy="17" rx="7" ry="5" fill="#3a0000"/>
      <ellipse cx="98"  cy="17" rx="4" ry="3" fill="#cc2200" opacity="0.9"/>
      <ellipse cx="116" cy="17" rx="4" ry="3" fill="#cc2200" opacity="0.9"/>
      <ellipse cx="98"  cy="17" rx="1.5" ry="1.5" fill="#ff4400"/>
      <ellipse cx="116" cy="17" rx="1.5" ry="1.5" fill="#ff4400"/>
      {/* Fire/fel energy at feet */}
      <ellipse cx="107" cy="90" rx="55" ry="8" fill="#ff2200" opacity="0.15"/>
      <ellipse cx="107" cy="88" rx="30" ry="5" fill="#ff4400" opacity="0.2"/>
      {/* Cube glows in background */}
      <rect x="230" y="30" width="18" height="18" rx="2" fill="#2a0800" opacity="0.6" stroke="#ff440022" strokeWidth="1"/>
      <rect x="270" y="45" width="15" height="15" rx="2" fill="#2a0800" opacity="0.5" stroke="#ff440022" strokeWidth="1"/>
      <rect x="310" y="28" width="18" height="18" rx="2" fill="#2a0800" opacity="0.6" stroke="#ff440022" strokeWidth="1"/>
      <rect x="355" y="40" width="14" height="14" rx="2" fill="#2a0800" opacity="0.5" stroke="#ff440022" strokeWidth="1"/>
      <text x="222" y="75" fontFamily="serif" fontSize="9" fill="#2a0800" opacity="0.6" letterSpacing="4">MANTICRON CUBES</text>
    </svg>
  );
}

const BOSS_SVG = { maulgar: MaulgarSVG, gruul: GruulSVG, mags: MagsSVG };

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
  const BossSVGComponent = bossImage ? BOSS_SVG[bossImage] : null;
  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e3a",
      borderRadius: 8, overflow: "hidden", flex: 1, minWidth: 0,
    }}>
      {/* Boss banner */}
      <div style={{ position: "relative", height: 90, overflow: "hidden", borderBottom: "1px solid #1e1e3a" }}>
        {BossSVGComponent && <BossSVGComponent />}
        {!BossSVGComponent && <div style={{ width: "100%", height: "100%", background: "#080810" }} />}

        {/* Dark vignette so text pops */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, #0a0a12ee 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        {/* Title + subtitle overlaid */}
        <div style={{
          position: "absolute", bottom: 8, left: 12, right: 12,
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        }}>
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700,
            color: "#e8c870", textShadow: "0 1px 8px #000, 0 0 20px #000a",
          }}>
            {icon} {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 9, color: "#6a5828", letterSpacing: "0.1em",
              textShadow: "0 1px 4px #000",
            }}>
              {subtitle}
            </div>
          )}
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

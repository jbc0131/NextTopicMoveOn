/**
 * NTMO Shared Component Library
 * Replaces src/components.jsx — restyled with Palantir Blueprint tokens.
 * All modules import from here. No module-specific logic lives here.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  surface, border, text, accent, intent, role as roleColors,
  font, fontSize, fontWeight, radius, space, layout,
  btnStyle, inputStyle, panelStyle, badgeStyle, navItemStyle, chipStyle,
  classColors,
} from "./theme";
import { getClass, getSpecDisplay, getColor, getRole, RAID_TEAMS } from "./constants";

// ── Marker SVGs (unchanged) ───────────────────────────────────────────────────
const MARKER_SVGS = {
  star:     s => <svg viewBox="0 0 64 64" width={s} height={s}><polygon points="32,4 39,24 60,24 44,37 50,58 32,46 14,58 20,37 4,24 25,24" fill="#FFD700" stroke="#B8860B" strokeWidth="2"/></svg>,
  circle:   s => <svg viewBox="0 0 64 64" width={s} height={s}><circle cx="32" cy="32" r="26" fill="none" stroke="#FF6600" strokeWidth="8"/></svg>,
  diamond:  s => <svg viewBox="0 0 64 64" width={s} height={s}><polygon points="32,4 58,32 32,60 6,32" fill="#9932CC" stroke="#6A0DAD" strokeWidth="2"/></svg>,
  triangle: s => <svg viewBox="0 0 64 64" width={s} height={s}><polygon points="32,6 60,58 4,58" fill="#00CC00" stroke="#006600" strokeWidth="2"/></svg>,
  moon:     s => <svg viewBox="0 0 64 64" width={s} height={s}><path d="M44,12 A24,24 0 1,0 44,52 A16,16 0 1,1 44,12Z" fill="#87CEEB" stroke="#4682B4" strokeWidth="2"/></svg>,
  square:   s => <svg viewBox="0 0 64 64" width={s} height={s}><rect x="10" y="10" width="44" height="44" fill="#1E90FF" stroke="#00008B" strokeWidth="2"/></svg>,
  cross:    s => <svg viewBox="0 0 64 64" width={s} height={s}><line x1="8" y1="8" x2="56" y2="56" stroke="#FF0000" strokeWidth="10" strokeLinecap="round"/><line x1="56" y1="8" x2="8" y2="56" stroke="#FF0000" strokeWidth="10" strokeLinecap="round"/></svg>,
  skull:    s => <svg viewBox="0 0 64 64" width={s} height={s}><ellipse cx="32" cy="28" rx="22" ry="20" fill="#F5F5F5" stroke="#999" strokeWidth="2"/><rect x="18" y="44" width="10" height="12" rx="2" fill="#F5F5F5" stroke="#999" strokeWidth="1.5"/><rect x="36" y="44" width="10" height="12" rx="2" fill="#F5F5F5" stroke="#999" strokeWidth="1.5"/><circle cx="24" cy="27" r="6" fill="#333"/><circle cx="40" cy="27" r="6" fill="#333"/></svg>,
};

export function MarkerIcon({ markerKey, size = 16 }) {
  const fn = MARKER_SVGS[markerKey];
  if (!fn) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{fn(size)}</span>;
}

// ── Player badge ──────────────────────────────────────────────────────────────
export function PlayerBadge({ slot, compact = false, draggable: isDraggable = false, onDragStart, parseScore, parseColor }) {
  const color = getColor(slot);
  const cls   = getClass(slot);
  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? e => onDragStart(e, slot) : undefined}
      style={{
        ...badgeStyle(color),
        padding: compact ? "1px 6px" : "3px 8px",
        cursor: isDraggable ? "grab" : "default",
        fontSize: compact ? fontSize.xs : fontSize.sm,
      }}
      title={`${slot.name} — ${getSpecDisplay(slot)} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: fontWeight.semibold }}>{slot.name}</span>
      {!compact && (
        <span style={{ color: `${color}80`, fontSize: fontSize.xs }}>
          {getSpecDisplay(slot)} {cls}
        </span>
      )}
      {parseScore != null && (
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: parseColor || text.muted, fontFamily: font.mono }}>
          {Math.round(parseScore)}
        </span>
      )}
    </div>
  );
}

// ── Kara player badge (with spec cycle) ───────────────────────────────────────
export function KaraPlayerBadge({ slot, onSpecCycle, onDragStart }) {
  const color = getColor(slot);
  const cls   = getClass(slot);
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => onDragStart(e, slot) : undefined}
      style={{
        ...badgeStyle(color),
        padding: "2px 4px 2px 8px",
        cursor: onDragStart ? "grab" : "default",
        gap: space[1],
      }}
      title={`${slot.name} — ${getSpecDisplay(slot)} ${cls}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: fontWeight.semibold }}>{slot.name}</span>
      <span style={{ color: `${color}80`, fontSize: fontSize.xs }}>{getSpecDisplay(slot)}</span>
      {onSpecCycle && (
        <button
          onClick={e => { e.stopPropagation(); onSpecCycle(slot.id); }}
          style={{
            background: `${color}22`, border: `1px solid ${color}44`,
            borderRadius: radius.sm, color, cursor: "pointer",
            fontSize: 10, padding: "1px 4px", marginLeft: 2, lineHeight: 1.4,
            fontFamily: font.sans,
          }}
          title="Cycle spec"
        >⟳</button>
      )}
    </div>
  );
}

// ── Role section header ───────────────────────────────────────────────────────
export function RoleHeader({ role: roleName, overrideLabel }) {
  const rc     = roleColors[roleName?.toLowerCase()] || roleColors.dps;
  const icons  = { Tank: "🛡", Healer: "💚", DPS: "⚔" };
  const titles = { Tank: "Tank Assignments", Healer: "Healer Assignments", DPS: "DPS Assignments" };
  const label  = overrideLabel || titles[roleName];
  return (
    <div style={{
      padding: "5px 10px",
      background: rc.tag,
      borderRadius: radius.sm,
      fontSize: fontSize.xs,
      fontFamily: font.sans,
      fontWeight: fontWeight.bold,
      color: text.primary,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      marginTop: 10,
      marginBottom: 4,
    }}>
      {icons[roleName]}  {label}
    </div>
  );
}

// ── Boss panel ────────────────────────────────────────────────────────────────
const BOSS_META = {
  maulgar: { accent: "#C87820", label: "GRUUL'S LAIR · BOSS 1 OF 2", icon: "⚔" },
  gruul:   { accent: "#4A8ACC", label: "GRUUL'S LAIR · BOSS 2 OF 2", icon: "🗿" },
  mags:    { accent: "#CC3300", label: "MAGTHERIDON'S LAIR",          icon: "🔥" },
  kara:    { accent: accent.blue, label: "KARAZHAN",                  icon: "🏰" },
};

export function BossPanel({ title, icon, subtitle, bossImage, children, compact }) {
  const meta = bossImage ? BOSS_META[bossImage] : null;
  const accentColor = meta?.accent || accent.blue;
  return (
    <div style={{ ...panelStyle, flex: 1, minWidth: 0 }}>
      {/* Flat header with left accent border */}
      <div style={{
        display: "flex", alignItems: "center", gap: space[2],
        padding: compact ? `${space[2]}px ${space[3]}px` : `${space[2]}px ${space[3]}px`,
        borderBottom: `1px solid ${border.subtle}`,
        background: surface.panel,
        minHeight: compact ? 36 : 48,
      }}>
        <div style={{ width: 3, height: 20, borderRadius: 1, background: accentColor, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: accentColor, fontFamily: font.sans }}>
            {icon} {title}
          </div>
          {subtitle && !compact && (
            <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
        {meta && !compact && (
          <span style={{ marginLeft: "auto", fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, letterSpacing: "0.06em" }}>
            {meta.label}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: compact ? space[2] : space[3] }}>
        {children}
      </div>
    </div>
  );
}

// ── Warning bar ───────────────────────────────────────────────────────────────
export function WarningBar({ text: msg }) {
  return (
    <div style={{
      fontSize: fontSize.sm,
      color: intent.warning,
      padding: `${space[1]}px ${space[3]}px`,
      background: `${intent.warning}12`,
      border: `1px solid ${intent.warning}33`,
      borderRadius: radius.base,
      marginBottom: space[3],
      fontFamily: font.sans,
    }}>
      ⚠ {msg}
    </div>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────
export function StatusChip({ type = "neutral", children }) {
  return <span style={chipStyle(type)}>{children}</span>;
}

// ── Kara team header ──────────────────────────────────────────────────────────
export function KaraTeamHeader({ teamNum, assignments, allRows, roster }) {
  const placedIds = allRows.flatMap(r =>
    assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []
  );
  const uniqueIds = [...new Set(placedIds)];
  const players   = uniqueIds.map(id => roster.find(s => s.id === id)).filter(Boolean);
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap", gap: space[1],
      padding: `${space[1]}px ${space[3]}px`,
      background: surface.panel,
      borderBottom: `1px solid ${border.subtle}`,
      minHeight: 32,
    }}>
      <span style={{ fontSize: fontSize.xs, color: accent.blue, fontWeight: fontWeight.bold, fontFamily: font.sans, marginRight: space[1] }}>
        🏰 TEAM {teamNum}
      </span>
      {players.map(p => {
        const color = getColor(p);
        return (
          <span key={p.id} style={{
            fontSize: fontSize.xs, color, fontFamily: font.sans,
            background: `${color}15`, border: `1px solid ${color}33`,
            borderRadius: radius.sm, padding: "1px 6px",
          }}>
            {p.name} <span style={{ color: `${color}66`, fontSize: 9 }}>{getSpecDisplay(p)}</span>
          </span>
        );
      })}
      {players.length === 0 && (
        <span style={{ fontSize: fontSize.xs, color: text.disabled, fontStyle: "italic" }}>No players assigned yet</span>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = "⚔", title, message, action, onAction }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: space[3], padding: space[8],
      color: text.muted,
    }}>
      <div style={{ fontSize: 48, opacity: 0.4 }}>{icon}</div>
      {title && <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.secondary, fontFamily: font.sans }}>{title}</div>}
      {message && <div style={{ fontSize: fontSize.sm, color: text.muted, fontFamily: font.sans, textAlign: "center", maxWidth: 340 }}>{message}</div>}
      {action && onAction && (
        <button onClick={onAction} style={{ ...btnStyle("primary"), padding: "0 20px", height: 34 }}>
          {action}
        </button>
      )}
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────
export function LoadingSpinner({ size = 20 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={border.strong} strokeWidth="3"/>
        <path d="M12 2 A10 10 0 0 1 22 12" stroke={accent.blue} strokeWidth="3" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
        </path>
      </svg>
    </span>
  );
}

// ── Toast notification system ─────────────────────────────────────────────────
let _addToast = null;

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _addToast = ({ message, type = "neutral", duration = 3000 }) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    };
    return () => { _addToast = null; };
  }, []);

  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", top: space[4], right: space[4],
      zIndex: 9999, display: "flex", flexDirection: "column", gap: space[2],
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          ...chipStyle(t.type),
          padding: `${space[2]}px ${space[3]}px`,
          fontSize: fontSize.sm,
          borderRadius: radius.base,
          border: `1px solid ${t.type === "success" ? intent.success + "44" : t.type === "danger" ? intent.danger + "44" : border.subtle}`,
          background: surface.overlay,
          color: t.type === "success" ? intent.success : t.type === "danger" ? intent.danger : text.primary,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          pointerEvents: "auto",
          minWidth: 200,
          maxWidth: 360,
          fontFamily: font.sans,
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function toast(opts) {
  if (_addToast) _addToast(typeof opts === "string" ? { message: opts } : opts);
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel, dangerous = false }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: surface.panel, border: `1px solid ${border.subtle}`,
        borderRadius: radius.lg, padding: space[6], width: 360, maxWidth: "90vw",
        fontFamily: font.sans,
      }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary, marginBottom: space[2] }}>{title}</div>
        <div style={{ fontSize: fontSize.base, color: text.secondary, marginBottom: space[6] }}>{message}</div>
        <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnStyle("default")}>Cancel</button>
          <button onClick={onConfirm} style={btnStyle(dangerous ? "danger" : "primary")}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export function AppShell({ teamId, children, adminMode = false, parsePanelContent }) {
  return (
    <div style={{ height: "100vh", overflow: "hidden", background: surface.base, display: "flex", flexDirection: "column", fontFamily: font.sans }}>
      <AppHeader teamId={teamId} adminMode={adminMode} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <NavSidebar teamId={teamId} adminMode={adminMode} parsePanelContent={parsePanelContent} />
        <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {children}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

// ── App header ────────────────────────────────────────────────────────────────
function AppHeader({ teamId, adminMode }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const isKara     = location.pathname.startsWith("/kara");
  const team       = RAID_TEAMS.find(t => t.id === teamId);

  return (
    <div style={{
      height: layout.headerHeight,
      background: surface.panel,
      borderBottom: `1px solid ${border.subtle}`,
      display: "flex", alignItems: "center", padding: `0 ${space[4]}px`,
      gap: space[3], flexShrink: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <button
        onClick={() => navigate("/")}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: space[2], padding: 0 }}
      >
        <div style={{ width: 28, height: 28, borderRadius: radius.base, background: accent.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", fontWeight: fontWeight.bold }}>N</div>
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans, letterSpacing: "0.02em" }}>NTMO</span>
      </button>

      <div style={{ width: 1, height: 20, background: border.subtle }} />

      {/* Context label */}
      {isKara ? (
        <span style={{ fontSize: fontSize.sm, color: text.secondary, fontFamily: font.sans }}>
          Karazhan <span style={{ color: text.muted, marginLeft: space[1] }}>· All Teams</span>
        </span>
      ) : team ? (
        <span style={{ fontSize: fontSize.sm, color: text.secondary, fontFamily: font.sans }}>
          {team.name}<span style={{ color: text.muted, marginLeft: space[2] }}>· {team.night}</span>
        </span>
      ) : null}

      {adminMode && <StatusChip type="warning">Admin</StatusChip>}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: space[2] }}>
        {adminMode ? (
          <button onClick={() => navigate(isKara ? "/kara" : `/${teamId}`)} style={btnStyle("default")}>← Public View</button>
        ) : (
          <button onClick={() => navigate(isKara ? "/kara/admin" : `/${teamId}/25man/admin`)} style={btnStyle("default")}>Admin →</button>
        )}
      </div>
    </div>
  );
}

// ── Nav sidebar ───────────────────────────────────────────────────────────────
function NavSidebar({ teamId, adminMode, parsePanelContent }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const isKara    = location.pathname.startsWith("/kara");

  // Kara is teamless — always links to /kara
  // 25-man and history are team-scoped
  const navLinks = [
    { path: `/kara${adminMode ? "/admin" : ""}`,                          label: "Karazhan",    icon: "🏰" },
    { path: `/${teamId || "team-dick"}/25man${adminMode ? "/admin" : ""}`, label: "25-Man Raids", icon: "⚔" },
    { path: `/${teamId || "team-dick"}/history`,                           label: "Raid History", icon: "📜" },
  ];

  return (
    <div style={{
      width: layout.sidebarWidth, flexShrink: 0,
      background: surface.panel, borderRight: `1px solid ${border.subtle}`,
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
    }}>
      {/* Module nav */}
      <div style={{ padding: `${space[2]}px 0`, borderBottom: `1px solid ${border.subtle}` }}>
        <div style={{ padding: `${space[1]}px ${space[3]}px ${space[2]}px`, fontSize: fontSize.xs, color: text.muted, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Modules
        </div>
        {navLinks.map(link => {
          const active =
            (link.path.includes("/kara")    && location.pathname.startsWith("/kara"))   ||
            (link.path.includes("/25man")   && location.pathname.includes("/25man"))    ||
            (link.path.includes("/history") && location.pathname.includes("/history"));
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              style={{ ...navItemStyle(active), width: "100%", border: "none", textAlign: "left" }}
            >
              <span style={{ fontSize: 14 }}>{link.icon}</span>
              <span>{link.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {parsePanelContent}
      </div>

      {/* Team switcher — hidden on kara routes since kara is teamless */}
      {!isKara && (
      <div style={{ padding: space[3], borderTop: `1px solid ${border.subtle}` }}>
        <div style={{ fontSize: fontSize.xs, color: text.muted, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[2] }}>
          Team
        </div>
        {RAID_TEAMS.map(team => {
          const active = team.id === teamId;
          return (
            <button
              key={team.id}
              onClick={() => {
                const currentModule = location.pathname.includes("/25man") ? "/25man"
                  : location.pathname.includes("/history") ? "/history"
                  : "";
                const adminSuffix = adminMode && currentModule !== "/history" ? "/admin" : "";
                navigate(`/${team.id}${currentModule}${adminSuffix}`);
              }}
              style={{
                width: "100%", border: "none", cursor: "pointer", textAlign: "left",
                padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.base,
                background: active ? `${accent.blue}18` : "transparent",
                color: active ? accent.blue : text.secondary,
                fontSize: fontSize.sm, fontFamily: font.sans,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span>{team.name}</span>
              <span style={{ fontSize: fontSize.xs, color: text.muted }}>{team.night}</span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ── Module header ─────────────────────────────────────────────────────────────
export function ModuleHeader({ title, subtitle, icon, actions, breadcrumb }) {
  return (
    <div style={{
      padding: `${space[3]}px ${space[4]}px`,
      borderBottom: `1px solid ${border.subtle}`,
      background: surface.panel,
      display: "flex", alignItems: "center", gap: space[3], flexShrink: 0,
    }}>
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb && <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, marginBottom: 2 }}>{breadcrumb}</div>}
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary, fontFamily: font.sans }}>{title}</div>
        {subtitle && <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: space[2], alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Sync badge ────────────────────────────────────────────────────────────────
export function SyncBadge({ live }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space[1], fontSize: fontSize.xs, color: live ? intent.success : text.muted, fontFamily: font.sans }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: live ? intent.success : border.strong,
        boxShadow: live ? `0 0 5px ${intent.success}` : "none",
        animation: live ? "pulse 2s infinite" : "none",
      }} />
      {live ? "LIVE" : "LOCAL"}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}

// ── Save status ───────────────────────────────────────────────────────────────
export function SaveStatus({ status }) {
  const map = {
    idle:    null,
    saving:  { type: "warning", text: "Saving…" },
    saved:   { type: "success", text: "✓ Saved" },
    error:   { type: "danger",  text: "✗ Save failed" },
    offline: { type: "neutral", text: "Local only" },
  };
  const s = map[status];
  if (!s) return null;
  return <StatusChip type={s.type}>{s.text}</StatusChip>;
}

// ── Search box ────────────────────────────────────────────────────────────────
export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: text.muted, pointerEvents: "none" }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingLeft: 28, width: 220, fontSize: fontSize.sm }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
        >×</button>
      )}
    </div>
  );
}

// ── Parse scores panel ────────────────────────────────────────────────────────
// Collapsible sidebar panel showing WCL median performance averages.
// module: "kara" | "25man" — controls which score column is shown.
// Pass wclLoading, wclError, wclLastFetch, onRefetch from useWarcraftLogs.
export function ParseScoresPanel({ scores, roster, module, loading, error, lastFetch, onRefetch, onWclNameChange }) {
  const [open,   setOpen]   = useState(true);
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  // Deduplicate by name, pick score for this module
  const seen = new Set();
  const rows = roster
    .filter(p => {
      const name = (p.wclName?.trim() || p.name).toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(p => {
      const lookupName = p.wclName?.trim() || p.name;
      const entry      = scores?.[lookupName] || {};
      const score      = module === "kara" ? entry.kara : entry.gruulMags;
      return { ...p, score, lookupName };
    })
    .sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });

  const label = module === "kara" ? "Karazhan Parses" : "25-Man Parses";

  return (
    <div style={{ borderTop: `1px solid ${border.subtle}`, flexShrink: 0 }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", border: "none", cursor: "pointer", textAlign: "left",
          padding: `${space[2]}px ${space[3]}px`,
          background: surface.panel,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: fontSize.xs, color: accent.blue, fontWeight: fontWeight.bold, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: font.sans }}>
          📊 {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
          {loading && <LoadingSpinner size={12} />}
          {lastFetch && !loading && (
            <span style={{ fontSize: 9, color: text.muted, fontFamily: font.sans }}>
              {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span style={{ fontSize: fontSize.xs, color: text.muted }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div style={{ maxHeight: 320, overflowY: "auto", background: surface.base }}>
          {/* Toolbar */}
          <div style={{ padding: `${space[1]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: text.muted, fontFamily: font.sans }}>{rows.length} players</span>
            <button
              onClick={onRefetch}
              disabled={loading}
              style={{ ...btnStyle("default"), height: 20, padding: "0 6px", fontSize: 9, opacity: loading ? 0.5 : 1 }}
            >
              {loading ? "…" : "↻ Refresh"}
            </button>
          </div>

          {error && (
            <div style={{ padding: `${space[1]}px ${space[3]}px`, fontSize: 9, color: intent.danger, fontFamily: font.sans }}>
              ⚠ {error}
            </div>
          )}

          {/* Score rows */}
          {rows.map(p => {
            const roleKey   = getRole(p);
            const rc        = roleKey === "Tank" ? "#60a5fa" : roleKey === "Healer" ? "#4ade80" : "#f87171";
            const classColor = getColor(p);
            const scoreColor = p.score == null ? text.disabled
              : p.score === 100  ? "#e5cc80"
              : p.score >= 99    ? "#e268a8"
              : p.score >= 95    ? "#ff8000"
              : p.score >= 75    ? "#a335ee"
              : p.score >= 50    ? "#0070dd"
              : p.score >= 25    ? "#1eff00"
              :                    "#9d9d9d";
            const isEditing = editId === p.id;

            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center",
                  padding: `2px ${space[3]}px`,
                  borderBottom: `1px solid ${border.subtle}`,
                  minHeight: 26, gap: space[2],
                  background: "transparent",
                }}
                onMouseEnter={e => e.currentTarget.style.background = surface.card}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Role dot */}
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: rc, flexShrink: 0 }} />

                {/* Name / WCL name edit */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => {
                        if (onWclNameChange) onWclNameChange(p.id, editVal.trim() || p.name);
                        setEditId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { if (onWclNameChange) onWclNameChange(p.id, editVal.trim() || p.name); setEditId(null); }
                        if (e.key === "Escape") setEditId(null);
                      }}
                      style={{ ...inputStyle, width: "100%", height: 18, fontSize: 9, padding: "0 4px" }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditId(p.id); setEditVal(p.wclName?.trim() || p.name); }}
                      style={{ fontSize: fontSize.xs, color: classColor, fontFamily: font.sans, cursor: "text", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={`Click to set WCL name (currently: ${p.wclName?.trim() || p.name})`}
                    >
                      {p.name}
                      {p.wclName && p.wclName.trim() !== p.name && (
                        <span style={{ color: text.muted, fontSize: 9, marginLeft: 3 }}>→ {p.wclName}</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Score */}
                <span style={{
                  fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                  color: scoreColor, fontFamily: font.mono,
                  minWidth: 28, textAlign: "right", flexShrink: 0,
                }}>
                  {p.score != null ? Math.round(p.score) : "—"}
                </span>
              </div>
            );
          })}

          {rows.length === 0 && !loading && (
            <div style={{ padding: space[3], fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, textAlign: "center" }}>
              Import a roster to see parse scores
            </div>
          )}
        </div>
      )}
    </div>
  );
}

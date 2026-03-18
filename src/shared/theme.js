/**
 * NTMO Design System — Theme Tokens
 * Based on Palantir Blueprint dark theme.
 *
 * RULE: No hardcoded hex values anywhere else in the codebase.
 * Every component imports from here.
 */

// ── Surface colors ────────────────────────────────────────────────────────────
export const surface = {
  base:    "#1C2127", // Page background — outermost layer
  panel:   "#252A31", // Panel / sidebar backgrounds
  card:    "#2F343C", // Card / row hover backgrounds
  overlay: "#383E47", // Dropdowns, modals, tooltips
};

// ── Border colors ─────────────────────────────────────────────────────────────
export const border = {
  subtle: "#383E47", // Default panel borders
  strong: "#404854", // Emphasized dividers
};

// ── Text colors ───────────────────────────────────────────────────────────────
export const text = {
  primary:   "#F6F7F9", // Headlines, active labels
  secondary: "#ABB3BF", // Body text, descriptions
  muted:     "#5F6B7C", // Timestamps, inactive labels
  disabled:  "#394249", // Disabled state text
};

// ── Accent colors ─────────────────────────────────────────────────────────────
export const accent = {
  blue:    "#4C90F0", // Interactive elements, links, active state
  blueDim: "#2D72D2", // Hover state for blue elements
};

// ── Intent colors ─────────────────────────────────────────────────────────────
export const intent = {
  success: "#32A467", // Confirmed saves, online status
  warning: "#C87619", // Unsaved changes, caution states
  danger:  "#CD4246", // Errors, destructive actions
  neutral: "#5F6B7C", // Inactive / locked states
};

// ── Role colors ───────────────────────────────────────────────────────────────
export const role = {
  tank:   { color: "#4C90F0", bg: "#4C90F015", border: "#4C90F033", tag: "#1D3F6B" },
  healer: { color: "#32A467", bg: "#32A46715", border: "#32A46733", tag: "#0E3320" },
  dps:    { color: "#CD4246", bg: "#CD424615", border: "#CD424633", tag: "#3D1212" },
};

// ── WoW class colors (data-layer only — never use in structural UI chrome) ────
export const classColors = {
  Warrior: "#C69B6D",
  Paladin: "#F48CBA",
  Hunter:  "#AAD372",
  Rogue:   "#FFF468",
  Priest:  "#FFFFFF",
  Shaman:  "#0070DD",
  Mage:    "#3FC7EB",
  Warlock: "#8788EE",
  Druid:   "#FF7C0A",
};

// ── Typography ────────────────────────────────────────────────────────────────
export const font = {
  sans: "-apple-system, 'Inter', 'Segoe UI', sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
};

export const fontSize = {
  xs:   11, // Labels, uppercase tags
  sm:   12, // Secondary body, badges
  base: 14, // Primary body text
  lg:   16, // Section headings
  xl:   20, // Page headings
  "2xl": 24, // Module titles
};

export const fontWeight = {
  normal:   400,
  medium:   500,
  semibold: 600,
  bold:     700,
};

// ── Spacing ───────────────────────────────────────────────────────────────────
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
};

// ── Shape ─────────────────────────────────────────────────────────────────────
export const radius = {
  sm:   2,  // Tags, badges, small chips
  base: 3,  // Buttons, inputs, cards (Blueprint default)
  lg:   4,  // Panels, modals
};

// ── Layout ────────────────────────────────────────────────────────────────────
export const layout = {
  sidebarWidth: 240,
  headerHeight: 50,
  rowHeight:    32,
  rosterWidth:  220,
};

// ── Component style helpers ───────────────────────────────────────────────────

/** Standard button style — outline only, no filled background */
export function btnStyle(intent = "default", active = false) {
  const variants = {
    default: { borderColor: border.subtle, color: text.secondary },
    primary: { borderColor: accent.blue,   color: accent.blue    },
    success: { borderColor: intent.success, color: intent.success },
    warning: { borderColor: intent.warning, color: intent.warning },
    danger:  { borderColor: intent.danger,  color: intent.danger  },
  };
  const v = variants[intent] || variants.default;
  return {
    height: 30,
    padding: "0 12px",
    borderRadius: radius.base,
    border: `1px solid ${v.borderColor}`,
    background: active ? surface.card : "transparent",
    color: active ? text.primary : v.color,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: space[1],
    transition: "background 0.12s, color 0.12s",
    userSelect: "none",
  };
}

/** Standard input style */
export const inputStyle = {
  height: 30,
  padding: "0 8px",
  borderRadius: radius.base,
  border: `1px solid ${border.subtle}`,
  background: surface.base,
  color: text.primary,
  fontFamily: font.sans,
  fontSize: fontSize.base,
  outline: "none",
};

/** Panel / card wrapper */
export const panelStyle = {
  background: surface.panel,
  border: `1px solid ${border.subtle}`,
  borderRadius: radius.lg,
  overflow: "hidden",
};

/** Player badge base style — takes a class color string */
export function badgeStyle(classColor) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: space[1],
    background: `${classColor}18`,
    border: `1px solid ${classColor}44`,
    borderRadius: radius.sm,
    padding: "2px 8px",
    color: classColor,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    userSelect: "none",
    whiteSpace: "nowrap",
  };
}

/** Nav item style */
export function navItemStyle(active = false) {
  return {
    display: "flex",
    alignItems: "center",
    gap: space[2],
    height: layout.rowHeight,
    padding: `0 ${space[3]}px`,
    color: active ? text.primary : text.secondary,
    background: active ? surface.card : "transparent",
    borderLeft: active ? `3px solid ${accent.blue}` : "3px solid transparent",
    fontSize: fontSize.sm,
    fontFamily: font.sans,
    cursor: "pointer",
    textDecoration: "none",
    transition: "background 0.1s, color 0.1s",
    userSelect: "none",
  };
}

/** Status chip style */
export function chipStyle(type = "neutral") {
  const colors = {
    neutral: { bg: `${intent.neutral}20`, color: intent.neutral  },
    success: { bg: `${intent.success}20`, color: intent.success  },
    warning: { bg: `${intent.warning}20`, color: intent.warning  },
    danger:  { bg: `${intent.danger}20`,  color: intent.danger   },
    blue:    { bg: `${accent.blue}20`,    color: accent.blue     },
    locked:  { bg: "#9980D420",           color: "#9980D4"       },
  };
  const c = colors[type] || colors.neutral;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 6px",
    borderRadius: radius.sm,
    background: c.bg,
    color: c.color,
    fontSize: fontSize.xs,
    fontFamily: font.sans,
    fontWeight: fontWeight.medium,
    letterSpacing: "0.04em",
    userSelect: "none",
  };
}

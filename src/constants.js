// ── Class colour map ─────────────────────────────────────────────────────────
export const CLASS_COLORS = {
  Warrior: "#C69B6D", Paladin: "#F48CBA", Hunter:  "#AAD372",
  Rogue:   "#FFF468", Priest:  "#FFFFFF", Shaman:  "#0070DD",
  Mage:    "#3FC7EB", Warlock: "#8788EE", Druid:   "#FF7C0A",
};

// Map spec name → actual class name for Tank-role slots
// (the JSON sets className="Tank" for all tanks regardless of class)
const SPEC_TO_CLASS = {
  Protection1:  "Paladin",
  Protection:   "Warrior",
  Guardian:     "Druid",
  Feral:        "Druid",
  // add more here if your roster ever has a Bear/Prot Warrior edge case
};

const ROLE_BY_SPEC = {
  Protection1: "Tank", Protection: "Tank", Guardian: "Tank", Feral: "Tank",
  Holy: "Healer", Holy1: "Healer", Discipline: "Healer",
  Restoration: "Healer", Restoration1: "Healer", Dreamstate: "Healer",
};

export function getRole(slot) {
  if (slot.className === "Tank") return "Tank";
  return ROLE_BY_SPEC[slot.specName] || "DPS";
}

export function getClass(slot) {
  // If the bot set className="Tank", look up the real class from the spec name
  if (slot.className === "Tank") {
    return SPEC_TO_CLASS[slot.specName] || "Warrior"; // fallback to Warrior
  }
  return slot.className;
}

// Returns a clean display name for the spec — strips trailing digits used
// internally to disambiguate specs with the same name across classes
// e.g. "Protection1" → "Protection", "Holy1" → "Holy", "Restoration1" → "Restoration"
export function getSpecDisplay(slot) {
  return (slot.specName || "").replace(/\d+$/, "");
}

export function getColor(slot) {
  // Prefer the color field from the JSON — it's already correct per class
  if (slot.color && slot.color !== "#000000") return slot.color;
  // Fallback: derive from class name
  const cls = getClass(slot);
  return CLASS_COLORS[cls] || "#aaa";
}

// ── Role colours ─────────────────────────────────────────────────────────────
export const ROLE_COLORS = {
  Tank:   { bg: "#0d2035", border: "#1a4a7a", label: "#60a5fa", tag: "#1d4ed8" },
  Healer: { bg: "#0b2010", border: "#1a5c1a", label: "#4ade80", tag: "#15803d" },
  DPS:    { bg: "#200d0d", border: "#6b1818", label: "#f87171", tag: "#b91c1c" },
};

// Boss images are inline SVG components in components.jsx — see BossBanner
export const BOSS_KEYS = { maulgar: "maulgar", gruul: "gruul", mags: "mags" };

// ── Assignment definitions ────────────────────────────────────────────────────
export const GRUUL_MAULGAR = [
  { key: "maulgar_mt",    label: "Maulgar Tank",         role: "Tank",   hint: "Protection Paladin/Warrior" },
  { key: "krosh_soak",    label: "Krosh Soaker",          role: "Tank",   hint: "Prot Paladin immune soak" },
  { key: "olm_tank",      label: "Olm Tank",              role: "Tank",   hint: "Warrior/Druid" },
  { key: "kiggler_kit",   label: "Kiggler Kiter",         role: "Tank",   hint: "Prot Pally / mobile tank" },
  { key: "blindeye_tank", label: "Blindeye Tank",         role: "Tank",   hint: "Any tank" },
  { key: "mt_heal1",      label: "MT Heal 1",             role: "Healer", hint: "" },
  { key: "mt_heal2",      label: "MT Heal 2",             role: "Healer", hint: "" },
  { key: "krosh_heal",    label: "Krosh Soaker Heals",    role: "Healer", hint: "Holy Pally ideal" },
  { key: "raid_heal1",    label: "Raid Heal 1",           role: "Healer", hint: "" },
  { key: "raid_heal2",    label: "Raid Heal 2",           role: "Healer", hint: "" },
  { key: "olm_cc",        label: "Olm CC (Sheep)",        role: "DPS",    hint: "Mage" },
  { key: "olm_sleep",     label: "Olm Trap/Sleep",        role: "DPS",    hint: "Hunter/Druid" },
  { key: "kiggler_poly",  label: "Kiggler Poly",          role: "DPS",    hint: "Mage" },
  { key: "spellbreak",    label: "Spellbreaker (Krosh)",  role: "DPS",    hint: "Pummel/kick chain" },
  { key: "counterspell",  label: "Counterspell (Krosh)",  role: "DPS",    hint: "Mage CS" },
  { key: "dps_krosh1",    label: "Krosh Kill DPS 1",      role: "DPS",    hint: "" },
  { key: "dps_krosh2",    label: "Krosh Kill DPS 2",      role: "DPS",    hint: "" },
  { key: "dps_olm",       label: "Olm Kill DPS",          role: "DPS",    hint: "" },
  { key: "dps_kiggler",   label: "Kiggler Kill DPS",      role: "DPS",    hint: "" },
  { key: "dps_blindeye",  label: "Blindeye Kill DPS",     role: "DPS",    hint: "" },
  { key: "dps_maulgar",   label: "Maulgar Kill DPS",      role: "DPS",    hint: "" },
];

export const GRUUL_BOSS = [
  { key: "g_mt",      label: "Main Tank (MT)",   role: "Tank",   hint: "" },
  { key: "g_ot",      label: "Off Tank / Taunt", role: "Tank",   hint: "" },
  { key: "g_mtheal1", label: "MT Heal 1",        role: "Healer", hint: "" },
  { key: "g_mtheal2", label: "MT Heal 2",        role: "Healer", hint: "" },
  { key: "g_mtheal3", label: "MT Heal 3",        role: "Healer", hint: "" },
  { key: "g_rheal1",  label: "Raid Heal 1",      role: "Healer", hint: "" },
  { key: "g_rheal2",  label: "Raid Heal 2",      role: "Healer", hint: "" },
  { key: "g_rheal3",  label: "Raid Heal 3",      role: "Healer", hint: "" },
  { key: "g_shat1",   label: "Shatter Group NW", role: "DPS",    hint: "" },
  { key: "g_shat2",   label: "Shatter Group NE", role: "DPS",    hint: "" },
  { key: "g_shat3",   label: "Shatter Group S",  role: "DPS",    hint: "" },
  { key: "g_shat4",   label: "Shatter Group W",  role: "DPS",    hint: "" },
  { key: "g_shat5",   label: "Shatter Group E",  role: "DPS",    hint: "" },
  { key: "g_dps1",    label: "DPS 1",            role: "DPS",    hint: "" },
  { key: "g_dps2",    label: "DPS 2",            role: "DPS",    hint: "" },
  { key: "g_dps3",    label: "DPS 3",            role: "DPS",    hint: "" },
  { key: "g_dps4",    label: "DPS 4",            role: "DPS",    hint: "" },
  { key: "g_dps5",    label: "DPS 5",            role: "DPS",    hint: "" },
];

export const MAGS_P1 = [
  { key: "m_ch1",    label: "Channeler 1 Tank (N)",   role: "Tank",   hint: "" },
  { key: "m_ch2",    label: "Channeler 2 Tank (NE)",  role: "Tank",   hint: "" },
  { key: "m_ch3",    label: "Channeler 3 Tank (SE)",  role: "Tank",   hint: "" },
  { key: "m_ch4",    label: "Channeler 4 Tank (SW)",  role: "Tank",   hint: "" },
  { key: "m_ch5",    label: "Channeler 5 Tank (NW)",  role: "Tank",   hint: "" },
  { key: "m_ph1h1",  label: "Tank Heal (N)",          role: "Healer", hint: "" },
  { key: "m_ph1h2",  label: "Tank Heal (NE)",         role: "Healer", hint: "" },
  { key: "m_ph1h3",  label: "Tank Heal (W cluster)",  role: "Healer", hint: "" },
  { key: "m_ph1rh1", label: "Raid Heal 1",            role: "Healer", hint: "" },
  { key: "m_ph1rh2", label: "Raid Heal 2",            role: "Healer", hint: "" },
  { key: "m_cube1",  label: "Cube Clicker 1 (NE)",    role: "DPS",    hint: "Must reach cube fast" },
  { key: "m_cube2",  label: "Cube Clicker 2 (SE)",    role: "DPS",    hint: "" },
  { key: "m_cube3",  label: "Cube Clicker 3 (S)",     role: "DPS",    hint: "" },
  { key: "m_cube4",  label: "Cube Clicker 4 (SW)",    role: "DPS",    hint: "" },
  { key: "m_cube5",  label: "Cube Clicker 5 (NW)",    role: "DPS",    hint: "" },
  { key: "m_dps1",   label: "Kill Group 1",           role: "DPS",    hint: "" },
  { key: "m_dps2",   label: "Kill Group 2",           role: "DPS",    hint: "" },
  { key: "m_dps3",   label: "Kill Group 3",           role: "DPS",    hint: "" },
  { key: "m_dps4",   label: "Kill Group 4",           role: "DPS",    hint: "" },
];

export const MAGS_P2 = [
  { key: "m_p2mt",   label: "Main Tank (MT)",       role: "Tank",   hint: "" },
  { key: "m_p2ot",   label: "OT – Infernal Kiter",  role: "Tank",   hint: "" },
  { key: "m_p2h1",   label: "MT Heal 1",            role: "Healer", hint: "" },
  { key: "m_p2h2",   label: "MT Heal 2",            role: "Healer", hint: "" },
  { key: "m_p2h3",   label: "MT Heal 3",            role: "Healer", hint: "" },
  { key: "m_p2rh1",  label: "Raid Heal 1",          role: "Healer", hint: "" },
  { key: "m_p2rh2",  label: "Raid Heal 2",          role: "Healer", hint: "" },
  { key: "m_p2c1",   label: "Cube Primary 1",       role: "DPS",    hint: "" },
  { key: "m_p2c2",   label: "Cube Primary 2",       role: "DPS",    hint: "" },
  { key: "m_p2c3",   label: "Cube Primary 3",       role: "DPS",    hint: "" },
  { key: "m_p2c4",   label: "Cube Backup 4",        role: "DPS",    hint: "" },
  { key: "m_p2c5",   label: "Cube Backup 5",        role: "DPS",    hint: "" },
  { key: "m_p2inf1", label: "Infernal Kill DPS 1",  role: "DPS",    hint: "" },
  { key: "m_p2inf2", label: "Infernal Kill DPS 2",  role: "DPS",    hint: "" },
  { key: "m_p2d1",   label: "DPS 1",                role: "DPS",    hint: "" },
  { key: "m_p2d2",   label: "DPS 2",                role: "DPS",    hint: "" },
  { key: "m_p2d3",   label: "DPS 3",                role: "DPS",    hint: "" },
  { key: "m_p2d4",   label: "DPS 4",                role: "DPS",    hint: "" },
];

export const ALL_ROWS = [
  ...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2
];

// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = "raidAssignments_v1";

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error("Failed to save state", e); }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

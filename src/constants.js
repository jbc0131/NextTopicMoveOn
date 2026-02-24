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
  // Tank Assignments
  { key: "maulgar_mt",      label: "High King Maulgar Tank",   role: "Tank",   hint: "" },
  { key: "blindeye_tank",   label: "Blindeye the Seer Tank",   role: "Tank",   hint: "" },
  { key: "olm_tank",        label: "Olm the Summoner Tank",    role: "Tank",   hint: "" },
  { key: "kiggler_tank",    label: "Kiggler the Crazed Tank",  role: "Tank",   hint: "" },
  { key: "krosh_tank",      label: "Krosh Firehand Tank",      role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "heal_maulgar",    label: "High King Maulgar Tank",   role: "Healer", hint: "" },
  { key: "heal_blindeye",   label: "Blindeye the Seer Tank",   role: "Healer", hint: "" },
  { key: "heal_olm",        label: "Olm the Summoner Tank",    role: "Healer", hint: "" },
  { key: "heal_kiggler",    label: "Kiggler the Crazed Tank",  role: "Healer", hint: "" },
  { key: "heal_krosh",      label: "Krosh Firehand Tank",      role: "Healer", hint: "" },
  { key: "heal_raid",       label: "Raid",                     role: "Healer", hint: "" },
  // Misc Assignments
  { key: "misc_blindeye_int",  label: "Blindeye the Seer Interrupt",               role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_olm_warlock",   label: "Olm the Summoner Warlock (Banish)(Enslave)", role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_maulgar",    label: "High King Maulgar Misdirect",               role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_blindeye",   label: "Blindeye the Seer Misdirect",               role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_olm",        label: "Olm the Summoner Misdirect",                role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_kiggler",    label: "Kiggler the Crazed Misdirect",              role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_krosh",      label: "Krosh Firehand Misdirect",                  role: "DPS", roleLabel: "Misc Assignments", hint: "" },
];

export const GRUUL_BOSS = [
  // Tank Assignments
  { key: "g_mt",       label: "Main Tank (MT)",    role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "g_mtheal1",  label: "Main Tank Heal",    role: "Healer", hint: "" },
  { key: "g_rheal1",   label: "Raid Heal",         role: "Healer", hint: "" },
  // Misc Assignments
  { key: "g_shat1",    label: "Shatter Group North", role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat2",    label: "Shatter Group East",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat3",    label: "Shatter Group South", role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat4",    label: "Shatter Group West",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
];

export const MAGS_P1 = [
  // Tank Assignments
  { key: "m_ch1",    label: "Channeler Tank (Skull)",    role: "Tank",   hint: "" },
  { key: "m_ch2",    label: "Channeler Tank (Cross)",    role: "Tank",   hint: "" },
  { key: "m_ch3",    label: "Channeler Tank (Square)",   role: "Tank",   hint: "" },
  { key: "m_ch4",    label: "Channeler Tank (Moon)",     role: "Tank",   hint: "" },
  { key: "m_ch5",    label: "Channeler Tank (Triangle)", role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "m_ph1h1",  label: "Channeler Tank (Skull)",    role: "Healer", hint: "" },
  { key: "m_ph1h2",  label: "Channeler Tank (Cross)",    role: "Healer", hint: "" },
  { key: "m_ph1h3",  label: "Channeler Tank (Square)",   role: "Healer", hint: "" },
  { key: "m_ph1h4",  label: "Channeler Tank (Moon)",     role: "Healer", hint: "" },
  { key: "m_ph1h5",  label: "Channeler Tank (Triangle)", role: "Healer", hint: "" },
  // Interrupt Assignments
  { key: "m_int1",   label: "Interrupt (Skull)",         role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int2",   label: "Interrupt (Cross)",         role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int3",   label: "Interrupt (Square)",        role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int4",   label: "Interrupt (Moon)",          role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int5",   label: "Interrupt (Triangle)",      role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  // Misdirect Assignments
  { key: "m_md1",    label: "Misdirect (Skull)",         role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md2",    label: "Misdirect (Cross)",         role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md3",    label: "Misdirect (Square)",        role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md4",    label: "Misdirect (Moon)",          role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md5",    label: "Misdirect (Triangle)",      role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
];

// Cube clicker key groups — used for conflict validation
export const CUBE1_KEYS   = ["m_p2c1a","m_p2c1b","m_p2c1c","m_p2c1d","m_p2c1e"];
export const CUBE2_KEYS   = [];
export const CUBEBU_KEYS  = [];
export const ALL_CUBE_KEYS = [...CUBE1_KEYS];

export const MAGS_P2 = [
  // Tank Assignments
  { key: "m_p2mt",   label: "Main Tank",                  role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "m_p2h1",   label: "Main Tank",                  role: "Healer", hint: "" },
  { key: "m_p2h2",   label: "Cube Clicker (Skull)",       role: "Healer", hint: "" },
  { key: "m_p2h3",   label: "Cube Clicker (Cross)",       role: "Healer", hint: "" },
  { key: "m_p2h4",   label: "Cube Clicker (Square)",      role: "Healer", hint: "" },
  { key: "m_p2h5",   label: "Cube Clicker (Moon)",        role: "Healer", hint: "" },
  { key: "m_p2h6",   label: "Cube Clicker (Triangle)",    role: "Healer", hint: "" },
  // Cube Clickers
  { key: "m_p2c1a",  label: "Cube Clicker (Skull)",       role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1b",  label: "Cube Clicker (Cross)",       role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1c",  label: "Cube Clicker (Square)",      role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1d",  label: "Cube Clicker (Moon)",        role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1e",  label: "Cube Clicker (Triangle)",    role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
];

// ── Karazhan — 10-man team templates (2 groups of 5) ─────────────────────────
function karaGroup(teamNum, groupNum) {
  const p = `k${teamNum}g${groupNum}`;
  return [
    { key: `${p}_p1`, label: "Player 1", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p2`, label: "Player 2", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p3`, label: "Player 3", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p4`, label: "Player 4", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p5`, label: "Player 5", role: "DPS", roleLabel: " ", hint: "" },
  ];
}

// Each team exposes both groups so panels can render them side by side
export const KARA_TEAM_1 = { g1: karaGroup(1,1), g2: karaGroup(1,2) };
export const KARA_TEAM_2 = { g1: karaGroup(2,1), g2: karaGroup(2,2) };
export const KARA_TEAM_3 = { g1: karaGroup(3,1), g2: karaGroup(3,2) };

// Flat list for ALL_ROWS (used for key lookups)
export const KARA_ALL_ROWS = [
  ...KARA_TEAM_1.g1, ...KARA_TEAM_1.g2,
  ...KARA_TEAM_2.g1, ...KARA_TEAM_2.g2,
  ...KARA_TEAM_3.g1, ...KARA_TEAM_3.g2,
];

export const ALL_ROWS = [
  ...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2,
  ...KARA_ALL_ROWS,
];

// ── localStorage helpers ──────────────────────────────────────────────────────
function storageKey(teamId) {
  return `raidAssignments_v1_${teamId}`;
}

export function saveState(state, teamId) {
  try { localStorage.setItem(storageKey(teamId), JSON.stringify(state)); }
  catch (e) { console.error("Failed to save state", e); }
}

export function loadState(teamId) {
  try {
    const raw = localStorage.getItem(storageKey(teamId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

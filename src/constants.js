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
  // Tanks
  Protection1: "Tank", Protection: "Tank", Guardian: "Tank", Feral: "Tank",
  // Healers
  Holy: "Healer", Holy1: "Healer", Discipline: "Healer",
  Restoration: "Healer", Restoration1: "Healer", Dreamstate: "Healer",
  // Everything else is DPS (Arms, Fury, Retribution, BeastMastery, Marksmanship,
  // Survival, Assassination, Combat, Subtlety, Shadow, Elemental, Enhancement,
  // Arcane, Fire, Frost, Affliction, Demonology, Destruction, Balance)
};

export function getRole(slot) {
  // After spec cycling, className is overwritten — use ROLE_BY_SPEC as source of truth
  return ROLE_BY_SPEC[slot.specName] || "DPS";
}

export function getClass(slot) {
  // If baseClass was preserved by spec cycling, always use it
  if (slot.baseClass) return slot.baseClass;
  // If the bot set className="Tank", look up the real class from the spec name
  if (slot.className === "Tank") {
    return SPEC_TO_CLASS[slot.specName] || "Warrior";
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

// ── All specs per class (TBC) ─────────────────────────────────────────────────
// Used for the Kara spec-cycle feature. Internal names match specName in the JSON.
export const CLASS_SPECS = {
  Warrior: [
    { specName: "Arms",        role: "DPS"    },
    { specName: "Fury",        role: "DPS"    },
    { specName: "Protection",  role: "Tank"   },
  ],
  Paladin: [
    { specName: "Holy1",       role: "Healer" },
    { specName: "Protection1", role: "Tank"   },
    { specName: "Retribution", role: "DPS"    },
  ],
  Hunter: [
    { specName: "BeastMastery", role: "DPS"  },
    { specName: "Marksmanship", role: "DPS"  },
    { specName: "Survival",     role: "DPS"  },
  ],
  Rogue: [
    { specName: "Assassination", role: "DPS" },
    { specName: "Combat",        role: "DPS" },
    { specName: "Subtlety",      role: "DPS" },
  ],
  Priest: [
    { specName: "Discipline",   role: "Healer" },
    { specName: "Holy",         role: "Healer" },
    { specName: "Shadow",       role: "DPS"    },
  ],
  Shaman: [
    { specName: "Elemental",    role: "DPS"    },
    { specName: "Enhancement",  role: "DPS"    },
    { specName: "Restoration1", role: "Healer" },
  ],
  Mage: [
    { specName: "Arcane",  role: "DPS" },
    { specName: "Fire",    role: "DPS" },
    { specName: "Frost",   role: "DPS" },
  ],
  Warlock: [
    { specName: "Affliction",  role: "DPS" },
    { specName: "Demonology",  role: "DPS" },
    { specName: "Destruction", role: "DPS" },
  ],
  Druid: [
    { specName: "Balance",      role: "DPS"    },
    { specName: "Feral",        role: "Tank"   },
    { specName: "Restoration",  role: "Healer" },
  ],
};

// Given a slot, cycle to the next spec. Uses slot.baseClass to preserve the
// real class even after specName/className have been overwritten by cycling.
export function cycleSpec(slot) {
  const cls = slot.baseClass || getClass(slot);
  const specs = CLASS_SPECS[cls];
  if (!specs) return slot.specName;
  const idx = specs.findIndex(s => s.specName === slot.specName);
  const nextSpec = specs[(idx + 1) % specs.length].specName;
  return { specName: nextSpec, baseClass: cls };
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
  { key: "m_ch1",    label: "Channeler Tank",    markerKey: "skull",    role: "Tank",   hint: "" },
  { key: "m_ch2",    label: "Channeler Tank",    markerKey: "cross",    role: "Tank",   hint: "" },
  { key: "m_ch3",    label: "Channeler Tank",    markerKey: "square",   role: "Tank",   hint: "" },
  { key: "m_ch4",    label: "Channeler Tank",    markerKey: "moon",     role: "Tank",   hint: "" },
  { key: "m_ch5",    label: "Channeler Tank",    markerKey: "triangle", role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "m_ph1h1",  label: "Channeler Tank",    markerKey: "skull",    role: "Healer", hint: "" },
  { key: "m_ph1h2",  label: "Channeler Tank",    markerKey: "cross",    role: "Healer", hint: "" },
  { key: "m_ph1h3",  label: "Channeler Tank",    markerKey: "square",   role: "Healer", hint: "" },
  { key: "m_ph1h4",  label: "Channeler Tank",    markerKey: "moon",     role: "Healer", hint: "" },
  { key: "m_ph1h5",  label: "Channeler Tank",    markerKey: "triangle", role: "Healer", hint: "" },
  // Interrupt Assignments
  { key: "m_int1",   label: "Interrupt",         markerKey: "skull",    role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int2",   label: "Interrupt",         markerKey: "cross",    role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int3",   label: "Interrupt",         markerKey: "square",   role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int4",   label: "Interrupt",         markerKey: "moon",     role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int5",   label: "Interrupt",         markerKey: "triangle", role: "DPS",    roleLabel: "Interrupt Assignments", hint: "" },
  // Misdirect Assignments
  { key: "m_md1",    label: "Misdirect",         markerKey: "skull",    role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md2",    label: "Misdirect",         markerKey: "cross",    role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md3",    label: "Misdirect",         markerKey: "square",   role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md4",    label: "Misdirect",         markerKey: "moon",     role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md5",    label: "Misdirect",         markerKey: "triangle", role: "DPS",    roleLabel: "Misdirect Assignments", hint: "" },
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
  { key: "m_p2h2",   label: "Cube Clicker",       markerKey: "skull",    role: "Healer", hint: "" },
  { key: "m_p2h3",   label: "Cube Clicker",       markerKey: "cross",    role: "Healer", hint: "" },
  { key: "m_p2h4",   label: "Cube Clicker",       markerKey: "square",   role: "Healer", hint: "" },
  { key: "m_p2h5",   label: "Cube Clicker",       markerKey: "moon",     role: "Healer", hint: "" },
  { key: "m_p2h6",   label: "Cube Clicker",       markerKey: "triangle", role: "Healer", hint: "" },
  // Cube Clickers
  { key: "m_p2c1a",  label: "Cube Clicker",       markerKey: "skull",    role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1b",  label: "Cube Clicker",       markerKey: "cross",    role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1c",  label: "Cube Clicker",       markerKey: "square",   role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1d",  label: "Cube Clicker",       markerKey: "moon",     role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
  { key: "m_p2c1e",  label: "Cube Clicker",       markerKey: "triangle", role: "DPS",    roleLabel: "Cube Clickers", hint: "", cubeGroup: 1 },
];

// ── Karazhan — 10-man team templates (2 groups of 5) ─────────────────────────
function karaGroup(teamNum, groupNum) {
  const p = `k${teamNum}g${groupNum}`;
  return [
    { key: `${p}_p1`, label: "", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p2`, label: "", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p3`, label: "", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p4`, label: "", role: "DPS", roleLabel: " ", hint: "" },
    { key: `${p}_p5`, label: "", role: "DPS", roleLabel: " ", hint: "" },
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

// ── Raid marker icons (WoW target markers) ────────────────────────────────────
export const MARKER_ICONS = {
  skull:    "https://wow.zamimg.com/images/wow/icons/large/inv_misc_bone_skull_01.jpg",
  cross:    "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_markedfordeath.jpg",
  square:   "https://wow.zamimg.com/images/wow/icons/large/inv_ammo_box_02.jpg",
  moon:     "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_snipershot.jpg",
  triangle: "https://wow.zamimg.com/images/wow/icons/large/ability_marksmanship.jpg",
  diamond:  "https://wow.zamimg.com/images/wow/icons/large/inv_jewelry_ring_03.jpg",
  circle:   "https://wow.zamimg.com/images/wow/icons/large/inv_misc_orb_05.jpg",
  star:     "https://wow.zamimg.com/images/wow/icons/large/alliance_icon.jpg",
};

// ── General Raid Assignments ──────────────────────────────────────────────────
const MARKERS = [
  { key: "skull",    label: "Skull"    },
  { key: "cross",    label: "Cross"    },
  { key: "square",   label: "Square"   },
  { key: "moon",     label: "Moon"     },
  { key: "triangle", label: "Triangle" },
  { key: "diamond",  label: "Diamond"  },
  { key: "circle",   label: "Circle"   },
  { key: "star",     label: "Star"     },
];

export const GENERAL_CURSES = [
  { key: "gen_coe",  label: "Curse of Elements",      role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cor",  label: "Curse of Recklessness",  role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cot",  label: "Curse of Tongues",       role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cow",  label: "Curse of Weakness",      role: "DPS", roleLabel: "Warlock Curses", hint: "" },
];

export const GENERAL_INTERRUPTS = MARKERS.map(m => ({
  key:       `gen_int_${m.key}`,
  label:     "",
  markerKey: m.key,
  role:      "DPS",
  roleLabel: "Trash Interrupts",
  hint:      "",
}));

export const GENERAL_ALL_ROWS = [...GENERAL_CURSES, ...GENERAL_INTERRUPTS];

export const ALL_ROWS = [
  ...GRUUL_MAULGAR, ...GRUUL_BOSS, ...MAGS_P1, ...MAGS_P2,
  ...KARA_ALL_ROWS, ...GENERAL_ALL_ROWS,
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

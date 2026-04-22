/**
 * NTMO Shared Constants
 * Moved from src/constants.js — logic unchanged, paths updated.
 * All modules import from here.
 */

import { classColors, role as roleColors } from "./theme";

// ── Re-export class colors for backwards compat ───────────────────────────────
export const CLASS_COLORS = classColors;

// ── Role colors (full Blueprint-style objects) ────────────────────────────────
export const ROLE_COLORS = {
  Tank:   { bg: "#0d2035", border: "#1a4a7a", label: "#60a5fa", tag: "#1d4ed8" },
  Healer: { bg: "#0b2010", border: "#1a5c1a", label: "#4ade80", tag: "#15803d" },
  DPS:    { bg: "#200d0d", border: "#6b1818", label: "#f87171", tag: "#b91c1c" },
};

// ── Class → spec lookup for Tank-role slots ───────────────────────────────────
const SPEC_TO_CLASS = {
  Protection1: "Paladin",
  Protection:  "Warrior",
  Guardian:    "Druid",
  Feral:       "Druid",
};

const ROLE_BY_SPEC = {
  Protection1: "Tank",   Protection: "Tank",   Guardian: "Tank",   Feral: "Tank",
  Holy:        "Healer", Holy1:      "Healer", Discipline: "Healer",
  Restoration: "Healer", Restoration1: "Healer", Dreamstate: "Healer",
};

export function getRole(slot) {
  return ROLE_BY_SPEC[slot.specName] || "DPS";
}

export function getClass(slot) {
  if (slot.baseClass) return slot.baseClass;
  if (slot.className === "Tank") return SPEC_TO_CLASS[slot.specName] || "Warrior";
  return slot.className;
}

export function getSpecDisplay(slot) {
  return (slot.specName || "").replace(/\d+$/, "");
}

export function getColor(slot) {
  if (slot.color && slot.color !== "#000000") return slot.color;
  return CLASS_COLORS[getClass(slot)] || "#aaa";
}

// ── All specs per class (TBC) ─────────────────────────────────────────────────
export const CLASS_SPECS = {
  Warrior:  [
    { specName: "Arms",          role: "DPS"    },
    { specName: "Fury",          role: "DPS"    },
    { specName: "Protection",    role: "Tank"   },
  ],
  Paladin:  [
    { specName: "Holy1",         role: "Healer" },
    { specName: "Protection1",   role: "Tank"   },
    { specName: "Retribution",   role: "DPS"    },
  ],
  Hunter:   [
    { specName: "BeastMastery",  role: "DPS"    },
    { specName: "Marksmanship",  role: "DPS"    },
    { specName: "Survival",      role: "DPS"    },
  ],
  Rogue:    [
    { specName: "Assassination", role: "DPS"    },
    { specName: "Combat",        role: "DPS"    },
    { specName: "Subtlety",      role: "DPS"    },
  ],
  Priest:   [
    { specName: "Discipline",    role: "Healer" },
    { specName: "Holy",          role: "Healer" },
    { specName: "Shadow",        role: "DPS"    },
  ],
  Shaman:   [
    { specName: "Elemental",     role: "DPS"    },
    { specName: "Enhancement",   role: "DPS"    },
    { specName: "Restoration1",  role: "Healer" },
  ],
  Mage:     [
    { specName: "Arcane",        role: "DPS"    },
    { specName: "Fire",          role: "DPS"    },
    { specName: "Frost",         role: "DPS"    },
  ],
  Warlock:  [
    { specName: "Affliction",    role: "DPS"    },
    { specName: "Demonology",    role: "DPS"    },
    { specName: "Destruction",   role: "DPS"    },
  ],
  Druid:    [
    { specName: "Balance",       role: "DPS"    },
    { specName: "Feral",         role: "Tank"   },
    { specName: "Dreamstate",    role: "Healer" },
    { specName: "Restoration",   role: "Healer" },
  ],
};

export function cycleSpec(slot) {
  const cls   = slot.baseClass || getClass(slot);
  const specs = CLASS_SPECS[cls];
  if (!specs) return { specName: slot.specName, baseClass: cls };
  const idx      = specs.findIndex(s => s.specName === slot.specName);
  const nextSpec = specs[(idx + 1) % specs.length].specName;
  return { specName: nextSpec, baseClass: cls };
}

// ── Boss keys ─────────────────────────────────────────────────────────────────
export const BOSS_KEYS = { maulgar: "maulgar", gruul: "gruul", mags: "mags" };

// ── Raid teams registry ───────────────────────────────────────────────────────
export const RAID_TEAMS = [
  { id: "team-dick",  name: "Team Dick",  night: "Tuesday"  },
  { id: "team-balls", name: "Team Balls", night: "Thursday" },
];

// ── Karazhan slot definitions ─────────────────────────────────────────────────
function karaGroup(night, teamNum, groupNum) {
  const p = `k${night}t${teamNum}g${groupNum}`;
  return Array.from({ length: 5 }, (_, i) => ({
    key: `${p}_p${i + 1}`, label: "", role: "DPS", roleLabel: " ", hint: "",
  }));
}
function karaTeam(night, teamNum) {
  return { g1: karaGroup(night, teamNum, 1), g2: karaGroup(night, teamNum, 2) };
}

export const KARA_TUE_1 = karaTeam("tue", 1);
export const KARA_TUE_2 = karaTeam("tue", 2);
export const KARA_TUE_3 = karaTeam("tue", 3);
export const KARA_THU_1 = karaTeam("thu", 1);
export const KARA_THU_2 = karaTeam("thu", 2);
export const KARA_THU_3 = karaTeam("thu", 3);

export const KARA_TUE_TEAMS = [KARA_TUE_1, KARA_TUE_2, KARA_TUE_3];
export const KARA_THU_TEAMS = [KARA_THU_1, KARA_THU_2, KARA_THU_3];

export const KARA_ALL_ROWS = [
  ...KARA_TUE_1.g1, ...KARA_TUE_1.g2,
  ...KARA_TUE_2.g1, ...KARA_TUE_2.g2,
  ...KARA_TUE_3.g1, ...KARA_TUE_3.g2,
  ...KARA_THU_1.g1, ...KARA_THU_1.g2,
  ...KARA_THU_2.g1, ...KARA_THU_2.g2,
  ...KARA_THU_3.g1, ...KARA_THU_3.g2,
];

// ── 25-man assignment definitions ─────────────────────────────────────────────
export const GRUUL_MAULGAR = [
  { key: "maulgar_mt",       label: "High King Maulgar Tank",               role: "Tank",   hint: "" },
  { key: "blindeye_tank",    label: "Blindeye the Seer Tank",               role: "Tank",   hint: "" },
  { key: "olm_tank",         label: "Olm the Summoner Tank",                role: "Tank",   hint: "" },
  { key: "kiggler_tank",     label: "Kiggler the Crazed Tank",              role: "Tank",   hint: "" },
  { key: "krosh_tank",       label: "Krosh Firehand Tank",                  role: "Tank",   hint: "" },
  { key: "heal_maulgar",     label: "High King Maulgar Tank",               role: "Healer", hint: "" },
  { key: "heal_blindeye",    label: "Blindeye the Seer Tank",               role: "Healer", hint: "" },
  { key: "heal_olm",         label: "Olm the Summoner Tank",                role: "Healer", hint: "" },
  { key: "heal_kiggler",     label: "Kiggler the Crazed Tank",              role: "Healer", hint: "" },
  { key: "heal_krosh",       label: "Krosh Firehand Tank",                  role: "Healer", hint: "" },
  { key: "heal_raid",        label: "Raid",                                 role: "Healer", hint: "" },
  { key: "misc_blindeye_int",  label: "Blindeye the Seer Interrupt",        role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_olm_warlock",   label: "Olm the Summoner Warlock",           role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_maulgar",    label: "High King Maulgar Misdirect",        role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_blindeye",   label: "Blindeye the Seer Misdirect",        role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_olm",        label: "Olm the Summoner Misdirect",         role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_kiggler",    label: "Kiggler the Crazed Misdirect",       role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "misc_md_krosh",      label: "Krosh Firehand Misdirect",           role: "DPS", roleLabel: "Misc Assignments", hint: "" },
];

export const GRUUL_BOSS = [
  { key: "g_mt",      label: "Main Tank (MT)",      role: "Tank",   hint: "" },
  { key: "g_mtheal1", label: "Main Tank Heal",       role: "Healer", hint: "" },
  { key: "g_rheal1",  label: "Raid Heal",            role: "Healer", hint: "" },
  { key: "g_shat1",   label: "Shatter Group North",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat2",   label: "Shatter Group East",   role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat3",   label: "Shatter Group South",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat4",   label: "Shatter Group West",   role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
];

export const MAGS_P1 = [
  { key: "m_int1",  label: "Interrupt",      markerKey: "skull",    role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int2",  label: "Interrupt",      markerKey: "cross",    role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int3",  label: "Interrupt",      markerKey: "square",   role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int4",  label: "Interrupt",      markerKey: "moon",     role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_int5",  label: "Interrupt",      markerKey: "triangle", role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "m_md1",   label: "Misdirect",      markerKey: "skull",    role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md2",   label: "Misdirect",      markerKey: "cross",    role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md3",   label: "Misdirect",      markerKey: "square",   role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md4",   label: "Misdirect",      markerKey: "moon",     role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_md5",   label: "Misdirect",      markerKey: "triangle", role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "m_ch1",   label: "Channeler Tank", markerKey: "skull",    role: "Tank",   hint: "" },
  { key: "m_ch2",   label: "Channeler Tank", markerKey: "cross",    role: "Tank",   hint: "" },
  { key: "m_ch3",   label: "Channeler Tank", markerKey: "square",   role: "Tank",   hint: "" },
  { key: "m_ch4",   label: "Channeler Tank", markerKey: "moon",     role: "Tank",   hint: "" },
  { key: "m_ch5",   label: "Channeler Tank", markerKey: "triangle", role: "Tank",   hint: "" },
  { key: "m_ph1h1", label: "Channeler Tank", markerKey: "skull",    role: "Healer", hint: "" },
  { key: "m_ph1h2", label: "Channeler Tank", markerKey: "cross",    role: "Healer", hint: "" },
  { key: "m_ph1h3", label: "Channeler Tank", markerKey: "square",   role: "Healer", hint: "" },
  { key: "m_ph1h4", label: "Channeler Tank", markerKey: "moon",     role: "Healer", hint: "" },
  { key: "m_ph1h5", label: "Channeler Tank", markerKey: "triangle", role: "Healer", hint: "" },
];

export const CUBE1_KEYS  = ["m_p2c1a","m_p2c1b","m_p2c1c","m_p2c1d","m_p2c1e"];
export const CUBE2_KEYS  = ["m_p2c2a","m_p2c2b","m_p2c2c","m_p2c2d","m_p2c2e"];
export const CUBE3_KEYS  = ["m_p2c3a","m_p2c3b","m_p2c3c","m_p2c3d","m_p2c3e"];
export const CUBE4_KEYS  = ["m_p2c4a","m_p2c4b","m_p2c4c","m_p2c4d","m_p2c4e"];
export const CUBEBU_KEYS = [];
export const ALL_CUBE_KEYS = [...CUBE1_KEYS, ...CUBE2_KEYS, ...CUBE3_KEYS, ...CUBE4_KEYS];

// Cube clicker team definitions (used by admin/public for 2x2 grid layout)
export const CUBE_TEAMS = [
  { label: "Cube Clicker Team 1", cubeGroup: 1, rows: [
    { key: "m_p2c1a", label: "Clicker", markerKey: "skull",    role: "DPS", cubeGroup: 1 },
    { key: "m_p2c1b", label: "Clicker", markerKey: "cross",    role: "DPS", cubeGroup: 1 },
    { key: "m_p2c1c", label: "Clicker", markerKey: "square",   role: "DPS", cubeGroup: 1 },
    { key: "m_p2c1d", label: "Clicker", markerKey: "moon",     role: "DPS", cubeGroup: 1 },
    { key: "m_p2c1e", label: "Clicker", markerKey: "triangle", role: "DPS", cubeGroup: 1 },
  ]},
  { label: "Cube Clicker Team 2", cubeGroup: 2, rows: [
    { key: "m_p2c2a", label: "Clicker", markerKey: "skull",    role: "DPS", cubeGroup: 2 },
    { key: "m_p2c2b", label: "Clicker", markerKey: "cross",    role: "DPS", cubeGroup: 2 },
    { key: "m_p2c2c", label: "Clicker", markerKey: "square",   role: "DPS", cubeGroup: 2 },
    { key: "m_p2c2d", label: "Clicker", markerKey: "moon",     role: "DPS", cubeGroup: 2 },
    { key: "m_p2c2e", label: "Clicker", markerKey: "triangle", role: "DPS", cubeGroup: 2 },
  ]},
  { label: "Cube Clicker Team 3", cubeGroup: 3, rows: [
    { key: "m_p2c3a", label: "Clicker", markerKey: "skull",    role: "DPS", cubeGroup: 3 },
    { key: "m_p2c3b", label: "Clicker", markerKey: "cross",    role: "DPS", cubeGroup: 3 },
    { key: "m_p2c3c", label: "Clicker", markerKey: "square",   role: "DPS", cubeGroup: 3 },
    { key: "m_p2c3d", label: "Clicker", markerKey: "moon",     role: "DPS", cubeGroup: 3 },
    { key: "m_p2c3e", label: "Clicker", markerKey: "triangle", role: "DPS", cubeGroup: 3 },
  ]},
  { label: "Cube Clicker Team 4", cubeGroup: 4, rows: [
    { key: "m_p2c4a", label: "Clicker", markerKey: "skull",    role: "DPS", cubeGroup: 4 },
    { key: "m_p2c4b", label: "Clicker", markerKey: "cross",    role: "DPS", cubeGroup: 4 },
    { key: "m_p2c4c", label: "Clicker", markerKey: "square",   role: "DPS", cubeGroup: 4 },
    { key: "m_p2c4d", label: "Clicker", markerKey: "moon",     role: "DPS", cubeGroup: 4 },
    { key: "m_p2c4e", label: "Clicker", markerKey: "triangle", role: "DPS", cubeGroup: 4 },
  ]},
];

export const MAGS_P2 = [
  // Tank
  { key: "m_p2mt",   label: "Main Tank",    role: "Tank",   hint: "" },
  // Healers
  { key: "m_p2h1",   label: "Main Tank",    role: "Healer", hint: "" },
  { key: "m_p2h2",   label: "Cube Healer",  markerKey: "skull",    role: "Healer", hint: "" },
  { key: "m_p2h3",   label: "Cube Healer",  markerKey: "cross",    role: "Healer", hint: "" },
  { key: "m_p2h4",   label: "Cube Healer",  markerKey: "square",   role: "Healer", hint: "" },
  { key: "m_p2h5",   label: "Cube Healer",  markerKey: "moon",     role: "Healer", hint: "" },
  { key: "m_p2h6",   label: "Cube Healer",  markerKey: "triangle", role: "Healer", hint: "" },
];

// ══════════════════════════════════════════════════════════════════════════════
// SERPENTSHRINE CAVERN (SSC)
// ══════════════════════════════════════════════════════════════════════════════

// ── Hydross the Unstable ─────────────────────────────────────────────────────
// Alternates Frost/Nature stances every ~45s. Adds on each transition:
// 2 Frost Pure Spawns (entering frost) / 4 Nature Tainted Spawns (entering nature).
// Water Tombs spawn on nature side and hatch Tainted Spawns if not broken.
export const SSC_HYDROSS = [
  // Tank Assignments
  { key: "ssc_hy_mt_frost",     label: "Hydross Main Tank (Frost stance)",       role: "Tank",   hint: "Nature resist gear" },
  { key: "ssc_hy_mt_nature",    label: "Hydross Main Tank (Nature stance)",      role: "Tank",   hint: "Frost resist gear — same player if solo, different if trading" },
  { key: "ssc_hy_adds_frost",   label: "Frost Add Tank (Pure Spawns)",           role: "Tank",   hint: "2 adds on nature→frost transition" },
  { key: "ssc_hy_adds_nature",  label: "Nature Add Tank (Tainted Spawns)",       role: "Tank",   hint: "4 adds on frost→nature transition" },
  // Healer Assignments
  { key: "ssc_hy_mth1",         label: "Main Tank Heal (Frost group)",           role: "Healer", hint: "" },
  { key: "ssc_hy_mth2",         label: "Main Tank Heal (Nature group)",          role: "Healer", hint: "" },
  { key: "ssc_hy_addheal1",     label: "Frost Add Tank Heal",                    role: "Healer", hint: "" },
  { key: "ssc_hy_addheal2",     label: "Nature Add Tank Heal",                   role: "Healer", hint: "" },
  { key: "ssc_hy_rheal",        label: "Raid Heal",                              role: "Healer", hint: "" },
  // Misc Assignments
  { key: "ssc_hy_decurse",      label: "Decurse (Mages / Druids)",               role: "DPS", roleLabel: "Misc Assignments", hint: "Curse of the Shaman from Tainted Spawns" },
  { key: "ssc_hy_cleanse",      label: "Poison Cleanse (Paladins / Druids)",     role: "DPS", roleLabel: "Misc Assignments", hint: "" },
  { key: "ssc_hy_water_tomb",   label: "Water Tomb Break (nature stance)",       role: "DPS", roleLabel: "Misc Assignments", hint: "Kill bubbles fast — hatch into Tainted Spawns" },
  { key: "ssc_hy_md_frost",     label: "Misdirect — Frost Adds",                 role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_hy_md_nature",    label: "Misdirect — Nature Adds",                role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_hy_frost_group",  label: "Frost Resist Group (roster)",            role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "ssc_hy_nature_group", label: "Nature Resist Group (roster)",           role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
];

// ── The Lurker Below ─────────────────────────────────────────────────────────
// Alternates boss up (tank & spank + Spout) vs boss submerged (adds phase).
// 2 waves of adds during submerge.
export const SSC_LURKER = [
  // Tank Assignments
  { key: "ssc_lu_mt",         label: "Lurker Main Tank",                         role: "Tank",   hint: "" },
  { key: "ssc_lu_add1",       label: "Coilfang Ambusher Tank (ranged add)",      role: "Tank",   hint: "Stays on platform — ranged caster" },
  { key: "ssc_lu_add2",       label: "Coilfang Guardian Tank 1 (melee add)",     role: "Tank",   hint: "" },
  { key: "ssc_lu_add3",       label: "Coilfang Guardian Tank 2 (melee add)",     role: "Tank",   hint: "" },
  // Healer Assignments
  { key: "ssc_lu_mth",        label: "Main Tank Heal",                           role: "Healer", hint: "" },
  { key: "ssc_lu_addh1",      label: "Ambusher Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_lu_addh2",      label: "Guardian Tank Heal 1",                     role: "Healer", hint: "" },
  { key: "ssc_lu_addh3",      label: "Guardian Tank Heal 2",                     role: "Healer", hint: "" },
  { key: "ssc_lu_rheal",      label: "Raid Heal (Spout damage)",                 role: "Healer", hint: "" },
  // Misc Assignments
  { key: "ssc_lu_fisher",     label: "Fishing Pull (opener)",                    role: "DPS", roleLabel: "Misc Assignments", hint: "Requires Weather-Beaten Journal" },
  { key: "ssc_lu_int_ambush", label: "Ambusher Interrupt (Spout Cast / Knockback)", role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "ssc_lu_md_lurker",  label: "Misdirect — Lurker",                       role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_lu_md_ambush",  label: "Misdirect — Ambusher",                     role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_lu_kill_order", label: "Add Kill Order (notes)",                   role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
];

// ── Leotheras the Blind ──────────────────────────────────────────────────────
// P1 (100%–15%): Alternates Elf form (Whirlwind + charges, tank drops aggro) with
//   Demon form (Chaos Blast frontal + Insidious Whisper → Inner Demons on 5 players).
// P2 (sub-15%): Leotheras splits into stationary Elf body (melee only) and a
//   Shadow demon (mobile, Chaos Blast). Inner Demons continue to spawn on all players.
export const SSC_LEOTHERAS_P1 = [
  // Tank Assignments
  { key: "ssc_le1_mt_elf",   label: "Leotheras Main Tank (Elf form)",             role: "Tank",   hint: "Whirlwind — drop aggro, melee kite" },
  { key: "ssc_le1_mt_demon", label: "Leotheras Main Tank (Demon form)",           role: "Tank",   hint: "Positioning — Chaos Blast frontal cone" },
  // Healer Assignments
  { key: "ssc_le1_mth_elf",  label: "Main Tank Heal (Elf form)",                  role: "Healer", hint: "" },
  { key: "ssc_le1_mth_dem",  label: "Main Tank Heal (Demon form)",                role: "Healer", hint: "" },
  { key: "ssc_le1_rheal",    label: "Raid Heal",                                  role: "Healer", hint: "Chaos Blast splash + Whirlwind" },
  // Inner Demons (Insidious Whisper spawns a Shadow of the player — raid must kill it)
  { key: "ssc_le1_demon1",   label: "Inner Demon — Skull",                        role: "DPS", roleLabel: "Inner Demons (Whisper Targets)", hint: "" },
  { key: "ssc_le1_demon2",   label: "Inner Demon — Cross",                        role: "DPS", roleLabel: "Inner Demons (Whisper Targets)", hint: "" },
  { key: "ssc_le1_demon3",   label: "Inner Demon — Square",                       role: "DPS", roleLabel: "Inner Demons (Whisper Targets)", hint: "" },
  { key: "ssc_le1_demon4",   label: "Inner Demon — Moon",                         role: "DPS", roleLabel: "Inner Demons (Whisper Targets)", hint: "" },
  { key: "ssc_le1_demon5",   label: "Inner Demon — Triangle",                     role: "DPS", roleLabel: "Inner Demons (Whisper Targets)", hint: "" },
  // Misc
  { key: "ssc_le1_ww_plan",  label: "Whirlwind Drop-Aggro Plan (notes)",          role: "DPS", roleLabel: "Misc Assignments", hint: "MT drops aggro, melee kite path", textInput: true },
];

export const SSC_LEOTHERAS_P2 = [
  // Tank Assignments — sub-15% split
  { key: "ssc_le2_mt_body",    label: "Elf Body Tank (stationary)",               role: "Tank",   hint: "Melee-only — body roots in place" },
  { key: "ssc_le2_mt_shadow",  label: "Shadow Demon Tank (Chaos Blast)",          role: "Tank",   hint: "Kite shadow — Chaos Blast frontal" },
  // Healer Assignments
  { key: "ssc_le2_mth_body",   label: "Elf Body Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_le2_mth_shadow", label: "Shadow Demon Tank Heal",                   role: "Healer", hint: "" },
  { key: "ssc_le2_rheal",      label: "Raid Heal (Inner Demons phase)",           role: "Healer", hint: "Cannot heal demon-afflicted players" },
  // Misc — Inner Demons now spawn on every player
  { key: "ssc_le2_demon_order",label: "Inner Demon Kill Priority (notes)",        role: "DPS", roleLabel: "Misc Assignments", hint: "Prioritize healers' demons first", textInput: true },
];

// ── Fathom-Lord Karathress ───────────────────────────────────────────────────
// 4 bosses pulled together. Common kill order: Sharkkis → Caribdis → Tidalvess → Karathress.
// Karathress gains the abilities of each advisor he outlives.
export const SSC_KARATHRESS = [
  // Tank Assignments
  { key: "ssc_ka_mt_kara",     label: "Fathom-Lord Karathress Tank",              role: "Tank",   hint: "Cataclysmic Bolt" },
  { key: "ssc_ka_mt_shark",    label: "Fathom-Guard Sharkkis Tank",               role: "Tank",   hint: "Hunter — kill first (pet + Beast Within)" },
  { key: "ssc_ka_mt_carib",    label: "Fathom-Guard Caribdis Tank",               role: "Tank",   hint: "Priest — heals, kill second" },
  { key: "ssc_ka_mt_tidal",    label: "Fathom-Guard Tidalvess Tank",              role: "Tank",   hint: "Shaman — totems, kill third" },
  { key: "ssc_ka_pet_tank",    label: "Sharkkis Pet Tank (Fathomlurker hyena)",   role: "Tank",   hint: "Pet despawns when Sharkkis dies" },
  // Healer Assignments
  { key: "ssc_ka_heal_kara",   label: "Karathress Tank Heal",                     role: "Healer", hint: "" },
  { key: "ssc_ka_heal_shark",  label: "Sharkkis Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_ka_heal_carib",  label: "Caribdis Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_ka_heal_tidal",  label: "Tidalvess Tank Heal",                      role: "Healer", hint: "" },
  { key: "ssc_ka_heal_raid",   label: "Raid Heal",                                role: "Healer", hint: "" },
  // Interrupts
  { key: "ssc_ka_int_carib",   label: "Caribdis Interrupt (Healing Wave / Tidal Surge)", role: "DPS", roleLabel: "Interrupt Assignments", hint: "Priority #1" },
  { key: "ssc_ka_int_tidal",   label: "Tidalvess Interrupt (Frost Shock)",        role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  { key: "ssc_ka_int_kara",    label: "Karathress Interrupt (backup)",            role: "DPS", roleLabel: "Interrupt Assignments", hint: "" },
  // Misc
  { key: "ssc_ka_totem_stomp", label: "Totem Stomping (Tidalvess)",               role: "DPS", roleLabel: "Misc Assignments", hint: "Windfury / Poison Cleansing / Earthbind" },
  { key: "ssc_ka_dispel_carib",label: "Dispel Caribdis buffs",                    role: "DPS", roleLabel: "Misc Assignments", hint: "Mages / Priests / Shamans" },
  { key: "ssc_ka_kill_order",  label: "Kill Order (confirm)",                     role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  // Misdirects
  { key: "ssc_ka_md_shark",    label: "Misdirect — Sharkkis",                     role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_ka_md_carib",    label: "Misdirect — Caribdis",                     role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_ka_md_tidal",    label: "Misdirect — Tidalvess",                    role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_ka_md_kara",     label: "Misdirect — Karathress",                   role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
];

// ── Morogrim Tidewalker ──────────────────────────────────────────────────────
// Add waves at 75%, 50%, 25% (Murlocs in 2 streams). Watery Grave teleports
// players under grates mid-fight. Water Globules target random players at sub-25%.
export const SSC_MOROGRIM = [
  // Tank Assignments
  { key: "ssc_mo_mt",          label: "Morogrim Main Tank",                       role: "Tank",   hint: "" },
  { key: "ssc_mo_adds1",       label: "Murloc Add Tank (West stream)",            role: "Tank",   hint: "AoE tank — Prot Paladin ideal" },
  { key: "ssc_mo_adds2",       label: "Murloc Add Tank (East stream)",            role: "Tank",   hint: "AoE tank — Prot Paladin ideal" },
  // Healer Assignments
  { key: "ssc_mo_mth",         label: "Main Tank Heal",                           role: "Healer", hint: "" },
  { key: "ssc_mo_addh1",       label: "West Add Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_mo_addh2",       label: "East Add Tank Heal",                       role: "Healer", hint: "" },
  { key: "ssc_mo_rheal",       label: "Raid Heal (Tidal Wave + Globules)",        role: "Healer", hint: "" },
  // Misc
  { key: "ssc_mo_aoe_group",   label: "AoE Group (Murloc waves)",                 role: "DPS", roleLabel: "Misc Assignments", hint: "Mages / Locks / Boomkin", textInput: true },
  { key: "ssc_mo_grate",       label: "Watery Grave Grate-Break",                 role: "DPS", roleLabel: "Misc Assignments", hint: "Free trapped players from grates ASAP" },
  { key: "ssc_mo_globule",     label: "Water Globule Priority (burst)",           role: "DPS", roleLabel: "Misc Assignments", hint: "Kill ASAP — knockup + damage on carrier" },
  // Misdirects
  { key: "ssc_mo_md_boss",     label: "Misdirect — Morogrim",                     role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_mo_md_west",     label: "Misdirect — West Adds",                    role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_mo_md_east",     label: "Misdirect — East Adds",                    role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
];

// ── Lady Vashj ───────────────────────────────────────────────────────────────
// P1 (100%–70%): Tank & spank with Shock Blast + Static Charge.
// P2 (70%–30%): Shield up — must drop with 4 Tainted Cores. Striders kited,
//   Tainted Elementals drop cores, Enchanted Elementals feed Vashj mana if unchecked.
// P3 (30%–0%): Shield down, P1 mechanics resume + Toxic Sporebats + residual P2 adds.
export const SSC_VASHJ_P1 = [
  // Tank Assignments
  { key: "ssc_vs1_mt",          label: "Vashj Main Tank (P1: 100%–70%)",          role: "Tank",   hint: "Shock Blast knockback" },
  // Healer Assignments
  { key: "ssc_vs1_mth",         label: "Main Tank Heal",                          role: "Healer", hint: "" },
  { key: "ssc_vs1_rheal",       label: "Raid Heal (Static Charge)",               role: "Healer", hint: "" },
  // Misc
  { key: "ssc_vs1_disp_static", label: "Static Charge Dispel (Priests)",          role: "DPS", roleLabel: "Misc Assignments", hint: "Dispel off chain target" },
  { key: "ssc_vs1_md",          label: "Misdirect — Vashj (opener)",              role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
];

export const SSC_VASHJ_P2 = [
  // Tank Assignments
  { key: "ssc_vs2_strider1",   label: "Coilfang Strider Kiter (Skull)",            role: "Tank",   hint: "Hunter or OT — uninterruptible, kite only" },
  { key: "ssc_vs2_strider2",   label: "Coilfang Strider Kiter (Cross)",            role: "Tank",   hint: "" },
  { key: "ssc_vs2_strider3",   label: "Coilfang Strider Kiter (Square)",           role: "Tank",   hint: "" },
  { key: "ssc_vs2_elem_tank",  label: "Tainted Elemental Tank",                    role: "Tank",   hint: "Drops Tainted Core on death" },
  { key: "ssc_vs2_naga_tank",  label: "Enchanted Elemental / Naga Off-Tank",       role: "Tank",   hint: "AoE add control" },
  // Healer Assignments
  { key: "ssc_vs2_heal_str",   label: "Strider Kiter Heals",                       role: "Healer", hint: "Kiters take heavy damage" },
  { key: "ssc_vs2_heal_elem",  label: "Elemental / Add Tank Heals",                role: "Healer", hint: "" },
  { key: "ssc_vs2_heal_core",  label: "Core Runner Heals",                         role: "Healer", hint: "" },
  { key: "ssc_vs2_heal_raid",  label: "Raid Heal",                                 role: "Healer", hint: "" },
  // Tainted Core Pass Chain — the defining P2 mechanic
  { key: "ssc_vs2_core1",      label: "Tainted Core Runner 1 (pickup)",            role: "DPS", roleLabel: "Tainted Core Chain", hint: "Grab from Elemental corpse" },
  { key: "ssc_vs2_core2",      label: "Tainted Core Runner 2",                     role: "DPS", roleLabel: "Tainted Core Chain", hint: "" },
  { key: "ssc_vs2_core3",      label: "Tainted Core Runner 3",                     role: "DPS", roleLabel: "Tainted Core Chain", hint: "" },
  { key: "ssc_vs2_core4",      label: "Tainted Core Runner 4 (throws at Vashj)",   role: "DPS", roleLabel: "Tainted Core Chain", hint: "Drops Vashj shield" },
  { key: "ssc_vs2_core_backup",label: "Core Chain Backup (if runner dies)",        role: "DPS", roleLabel: "Tainted Core Chain", hint: "", textInput: true },
  // Misc
  { key: "ssc_vs2_naga_burst", label: "Enchanted Elemental Burst (Mages/Locks)",   role: "DPS", roleLabel: "Misc Assignments", hint: "Feeds Vashj mana if they reach her" },
  { key: "ssc_vs2_decurse",    label: "Entangle Decurse (Mages / Druids)",         role: "DPS", roleLabel: "Misc Assignments", hint: "Vashj's root on random players" },
  // Misdirects
  { key: "ssc_vs2_md_elem",    label: "Misdirect — Tainted Elementals",            role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
  { key: "ssc_vs2_md_naga",    label: "Misdirect — Naga",                          role: "DPS", roleLabel: "Misdirect Assignments", hint: "" },
];

export const SSC_VASHJ_P3 = [
  // Tank Assignments
  { key: "ssc_vs3_mt",         label: "Vashj Main Tank (P3: sub-30%)",             role: "Tank",   hint: "Shock Blast resumes" },
  { key: "ssc_vs3_strider",    label: "Residual Strider Kiters",                   role: "Tank",   hint: "Striders continue spawning in P3" },
  // Healer Assignments
  { key: "ssc_vs3_mth",        label: "Main Tank Heal",                            role: "Healer", hint: "" },
  { key: "ssc_vs3_rheal",      label: "Raid Heal (Sporebat burst)",                role: "Healer", hint: "" },
  // Misc
  { key: "ssc_vs3_spore_duty", label: "Toxic Sporebat Kills",                      role: "DPS", roleLabel: "Misc Assignments", hint: "Kill ASAP — raidwide poison" },
  { key: "ssc_vs3_burn_group", label: "Burn Phase Plan (notes)",                   role: "DPS", roleLabel: "Misc Assignments", hint: "Bloodlust + cooldowns", textInput: true },
];

// SSC_BOSSES — structured wrapper for tab-per-boss admin rendering.
// Each boss has one or more phases; each phase holds a slot array with the same
// shape as GRUUL_MAULGAR / MAGS_P1 / MAGS_P2.
export const SSC_BOSSES = [
  { id: "hydross",    name: "Hydross the Unstable",  phases: [
    { id: "main", label: "", slots: SSC_HYDROSS },
  ]},
  { id: "lurker",     name: "The Lurker Below",      phases: [
    { id: "main", label: "", slots: SSC_LURKER },
  ]},
  { id: "leotheras",  name: "Leotheras the Blind",   phases: [
    { id: "p1", label: "P1 (100%–15%)",  slots: SSC_LEOTHERAS_P1 },
    { id: "p2", label: "P2 (sub-15% split)", slots: SSC_LEOTHERAS_P2 },
  ]},
  { id: "karathress", name: "Fathom-Lord Karathress", phases: [
    { id: "main", label: "", slots: SSC_KARATHRESS },
  ]},
  { id: "morogrim",   name: "Morogrim Tidewalker",   phases: [
    { id: "main", label: "", slots: SSC_MOROGRIM },
  ]},
  { id: "vashj",      name: "Lady Vashj",            phases: [
    { id: "p1", label: "P1 (100%–70%)", slots: SSC_VASHJ_P1 },
    { id: "p2", label: "P2 (70%–30%)",  slots: SSC_VASHJ_P2 },
    { id: "p3", label: "P3 (sub-30%)",  slots: SSC_VASHJ_P3 },
  ]},
];

// ── General assignments ───────────────────────────────────────────────────────
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
  { key: "gen_coe", label: "Curse of Elements",     role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cor", label: "Curse of Recklessness", role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cot", label: "Curse of Tongues",      role: "DPS", roleLabel: "Warlock Curses", hint: "" },
  { key: "gen_cow", label: "Curse of Weakness",     role: "DPS", roleLabel: "Warlock Curses", hint: "" },
];

export const GENERAL_INTERRUPTS = MARKERS.slice(0, 3).map(m => ({
  key: `gen_int_${m.key}`, label: "", markerKey: m.key,
  role: "DPS", roleLabel: "Trash Interrupts", hint: "",
}));

export const GENERAL_ALL_ROWS = [...GENERAL_CURSES, ...GENERAL_INTERRUPTS];

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

// ── localStorage helpers ──────────────────────────────────────────────────────
function storageKey(teamId, module) {
  return `raidAssignments_v2_${teamId}_${module}`;
}

export function saveState(state, teamId, module) {
  try { localStorage.setItem(storageKey(teamId, module), JSON.stringify(state)); }
  catch (e) { console.error("Failed to save state", e); }
}

export function loadState(teamId, module) {
  try {
    const raw = localStorage.getItem(storageKey(teamId, module));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

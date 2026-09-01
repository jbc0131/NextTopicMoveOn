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
    key: `${p}_p${i + 1}`, label: "", role: "DPS", roleLabel: " ",
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
  { key: "maulgar_mt",       label: "High King Maulgar Tank",               role: "Tank" },
  { key: "blindeye_tank",    label: "Blindeye the Seer Tank",               role: "Tank" },
  { key: "olm_tank",         label: "Olm the Summoner Tank",                role: "Tank" },
  { key: "kiggler_tank",     label: "Kiggler the Crazed Tank",              role: "Tank" },
  { key: "krosh_tank",       label: "Krosh Firehand Tank",                  role: "Tank" },
  { key: "heal_maulgar",     label: "High King Maulgar Tank",               role: "Healer" },
  { key: "heal_blindeye",    label: "Blindeye the Seer Tank",               role: "Healer" },
  { key: "heal_olm",         label: "Olm the Summoner Tank",                role: "Healer" },
  { key: "heal_kiggler",     label: "Kiggler the Crazed Tank",              role: "Healer" },
  { key: "heal_krosh",       label: "Krosh Firehand Tank",                  role: "Healer" },
  { key: "heal_raid",        label: "Raid",                                 role: "Healer" },
  { key: "misc_blindeye_int",  label: "Blindeye the Seer Interrupt",        role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_olm_warlock",   label: "Olm the Summoner Warlock",           role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_md_maulgar",    label: "High King Maulgar Misdirect",        role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_md_blindeye",   label: "Blindeye the Seer Misdirect",        role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_md_olm",        label: "Olm the Summoner Misdirect",         role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_md_kiggler",    label: "Kiggler the Crazed Misdirect",       role: "DPS", roleLabel: "Misc Assignments" },
  { key: "misc_md_krosh",      label: "Krosh Firehand Misdirect",           role: "DPS", roleLabel: "Misc Assignments" },
];

export const GRUUL_BOSS = [
  { key: "g_mt",      label: "Main Tank (MT)",      role: "Tank" },
  { key: "g_mtheal1", label: "Main Tank Heal",       role: "Healer" },
  { key: "g_rheal1",  label: "Raid Heal",            role: "Healer" },
  { key: "g_shat1",   label: "Shatter Group North",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat2",   label: "Shatter Group East",   role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat3",   label: "Shatter Group South",  role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "g_shat4",   label: "Shatter Group West",   role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
];

export const MAGS_P1 = [
  { key: "m_int1",  label: "Interrupt",      markerKey: "skull",    role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "m_int2",  label: "Interrupt",      markerKey: "cross",    role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "m_int3",  label: "Interrupt",      markerKey: "square",   role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "m_int4",  label: "Interrupt",      markerKey: "moon",     role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "m_int5",  label: "Interrupt",      markerKey: "triangle", role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "m_md1",   label: "Misdirect",      markerKey: "skull",    role: "DPS", roleLabel: "Misdirect Assignments" },
  { key: "m_md2",   label: "Misdirect",      markerKey: "cross",    role: "DPS", roleLabel: "Misdirect Assignments" },
  { key: "m_md3",   label: "Misdirect",      markerKey: "square",   role: "DPS", roleLabel: "Misdirect Assignments" },
  { key: "m_md4",   label: "Misdirect",      markerKey: "moon",     role: "DPS", roleLabel: "Misdirect Assignments" },
  { key: "m_md5",   label: "Misdirect",      markerKey: "triangle", role: "DPS", roleLabel: "Misdirect Assignments" },
  { key: "m_ch1",   label: "Channeler Tank", markerKey: "skull",    role: "Tank" },
  { key: "m_ch2",   label: "Channeler Tank", markerKey: "cross",    role: "Tank" },
  { key: "m_ch3",   label: "Channeler Tank", markerKey: "square",   role: "Tank" },
  { key: "m_ch4",   label: "Channeler Tank", markerKey: "moon",     role: "Tank" },
  { key: "m_ch5",   label: "Channeler Tank", markerKey: "triangle", role: "Tank" },
  { key: "m_ph1h1", label: "Channeler Tank", markerKey: "skull",    role: "Healer" },
  { key: "m_ph1h2", label: "Channeler Tank", markerKey: "cross",    role: "Healer" },
  { key: "m_ph1h3", label: "Channeler Tank", markerKey: "square",   role: "Healer" },
  { key: "m_ph1h4", label: "Channeler Tank", markerKey: "moon",     role: "Healer" },
  { key: "m_ph1h5", label: "Channeler Tank", markerKey: "triangle", role: "Healer" },
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
  { key: "m_p2mt",   label: "Main Tank",    role: "Tank" },
  // Healers
  { key: "m_p2h1",   label: "Main Tank",    role: "Healer" },
  { key: "m_p2h2",   label: "Cube Healer",  markerKey: "skull",    role: "Healer" },
  { key: "m_p2h3",   label: "Cube Healer",  markerKey: "cross",    role: "Healer" },
  { key: "m_p2h4",   label: "Cube Healer",  markerKey: "square",   role: "Healer" },
  { key: "m_p2h5",   label: "Cube Healer",  markerKey: "moon",     role: "Healer" },
  { key: "m_p2h6",   label: "Cube Healer",  markerKey: "triangle", role: "Healer" },
];

// ══════════════════════════════════════════════════════════════════════════════
// SERPENTSHRINE CAVERN (SSC)
// ══════════════════════════════════════════════════════════════════════════════

// ── Hydross the Unstable ─────────────────────────────────────────────────────
// Alternates Frost/Nature stances every ~45s. Adds on each transition:
// 2 Frost Pure Spawns (entering frost) / 4 Nature Tainted Spawns (entering nature).
// Water Tombs spawn on nature side and hatch Tainted Spawns if not broken.
export const SSC_HYDROSS = [
  // Raid Leader Notes
  { key: "ssc_hy_rl_notes",     label: "Notes",                                  role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "ssc_hy_bloodlust",    label: "Bloodlust Timing",                       role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. 10s after contact (let MT generate threat first)", textInput: true },
  // Tank Assignments
  { key: "ssc_hy_mt_frost",     label: "Frost Tank",                             role: "Tank" },
  { key: "ssc_hy_mt_nature",    label: "Nature Tank",                            role: "Tank" },
  { key: "ssc_hy_adds_frost",   label: "Frost Add Tank",                         role: "Tank" },
  { key: "ssc_hy_adds_nature",  label: "Nature Add Tank",                        role: "Tank" },
  // Healer Assignments
  { key: "ssc_hy_mth1",         label: "Tank Heal",                              role: "Healer" },
  { key: "ssc_hy_addheal1",     label: "Add Tank Heal",                          role: "Healer" },
  { key: "ssc_hy_rheal",        label: "Raid Heal",                              role: "Healer" },
  // Misc Assignments
  { key: "ssc_hy_nr_aura",      label: "Tank Group Nature Resistance Aura",      role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_hy_md_frost",     label: "Misdirect - Frost Side",                 role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_hy_md_nature",    label: "Misdirect - Nature Side",                role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_hy_md_adds",      label: "Misdirect - Adds",                       role: "DPS", roleLabel: "Misc Assignments" },
];

// ── The Lurker Below ─────────────────────────────────────────────────────────
// Alternates boss up (tank & spank + Spout) vs boss submerged (adds phase).
// 2 waves of adds during submerge.
export const SSC_LURKER = [
  // Raid Leader Notes
  { key: "ssc_lu_rl_notes",   label: "Notes",                                    role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "ssc_lu_bloodlust",  label: "Bloodlust Timing",                         role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. on pull (casters have no threat table)", textInput: true },
  // Tank Assignments
  { key: "ssc_lu_mt",         label: "Tank",                                     role: "Tank" },
  { key: "ssc_lu_add2",       label: "Coilfang Guardian Tank 1",                 role: "Tank" },
  { key: "ssc_lu_add3",       label: "Coilfang Guardian Tank 2",                 role: "Tank" },
  { key: "ssc_lu_add4",       label: "Coilfang Guardian Tank 3",                 role: "Tank" },
  // Healer Assignments - boss phase + paired heals per add tank (phases do not overlap)
  { key: "ssc_lu_mth_1",      label: "Tank Heal",                                role: "Healer" },
  { key: "ssc_lu_gh_1a",      label: "Coilfang Guardian Tank 1 Heal",            role: "Healer" },
  { key: "ssc_lu_gh_2a",      label: "Coilfang Guardian Tank 2 Heal",            role: "Healer" },
  { key: "ssc_lu_gh_2b",      label: "Coilfang Guardian Tank 3 Heal",            role: "Healer" },
  { key: "ssc_lu_rheal",      label: "Raid Heal",                                role: "Healer" },
  // Misc Assignments
  { key: "ssc_lu_sheep_left",  label: "Mage Platform - Sheep Left",              role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_lu_sheep_right", label: "Mage Platform - Sheep Right",             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_lu_md1",        label: "Misdirect #1",                             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_lu_md2",        label: "Misdirect #2",                             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_lu_md3",        label: "Misdirect #3",                             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_lu_fisher",     label: "Fishing Pull (opener)",                    role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Leotheras the Blind ──────────────────────────────────────────────────────
// P1 (100%–15%): Alternates Elf form (Whirlwind + charges, tank drops aggro) with
//   Demon form (Chaos Blast frontal + Insidious Whisper → Inner Demons on 5 players).
// P2 (sub-15%): Leotheras splits into stationary Elf body (melee only) and a
//   Shadow demon (mobile, Chaos Blast). Inner Demons continue to spawn on all players.
export const SSC_LEOTHERAS_P1 = [
  // Raid Leader Notes
  { key: "ssc_le1_rl_notes",  label: "Notes",                                     role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "ssc_le1_bloodlust", label: "Bloodlust Timing",                          role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. first Demon phase, once Warlock or Prot Pally has aggro lead", textInput: true },
  // Tank Assignments
  { key: "ssc_le1_mt_elf",   label: "Blood Elf Tank",                             role: "Tank" },
  { key: "ssc_le1_mt_demon", label: "Demon Tank",                                 role: "Tank" },
  // Healer Assignments
  { key: "ssc_le1_mth_elf",  label: "Blood Elf Tank Heal",                        role: "Healer" },
  { key: "ssc_le1_mth_dem",  label: "Demon Tank Heal",                            role: "Healer" },
  { key: "ssc_le1_rheal",    label: "Raid Heal",                                  role: "Healer" },
  // Misc Assignments
  { key: "ssc_le1_misc_notes", label: "Notes",                                    role: "DPS", roleLabel: "Misc Assignments", hint: "", textInput: true },
  { key: "ssc_le1_md_elf",   label: "Misdirect - Blood Elf Tank",                 role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_le1_md_demon", label: "Misdirect - Demon Tank",                     role: "DPS", roleLabel: "Misc Assignments" },
];

export const SSC_LEOTHERAS_P2 = [
  // Tank Assignments - sub-15% split
  { key: "ssc_le2_mt_body",    label: "Blood Elf Tank",                           role: "Tank" },
  { key: "ssc_le2_mt_shadow",  label: "Demon Tank",                               role: "Tank" },
  // Healer Assignments
  { key: "ssc_le2_mth_body",   label: "Blood Elf Tank Heal",                      role: "Healer" },
  { key: "ssc_le2_mth_shadow", label: "Demon Tank Heal",                          role: "Healer" },
  { key: "ssc_le2_rheal",      label: "Raid Heal",                                role: "Healer" },
  // Misc Assignments
  { key: "ssc_le2_md_elf",     label: "Misdirect - Blood Elf Tank",               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_le2_md_demon",   label: "Misdirect - Demon Tank",                   role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Fathom-Lord Karathress ───────────────────────────────────────────────────
// 4 bosses pulled together. Common kill order: Sharkkis → Caribdis → Tidalvess → Karathress.
// Karathress gains the abilities of each advisor he outlives.
export const SSC_KARATHRESS = [
  // Raid Leader Notes
  { key: "ssc_ka_rl_notes",    label: "Notes",                                    role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "ssc_ka_bloodlust",   label: "Bloodlust Timing",                         role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. when Skull/X are dead and boss is at 75%", textInput: true },
  // Tank Assignments
  { key: "ssc_ka_mt_kara",     label: "Karathress Tank",                          role: "Tank" },
  { key: "ssc_ka_mt_shark",    label: "Sharkkis Tank",                            role: "Tank" },
  { key: "ssc_ka_mt_carib",    label: "Caribdis Tank",                            role: "Tank" },
  { key: "ssc_ka_mt_tidal",    label: "Tidalvess Tank",                           role: "Tank" },
  // Healer Assignments
  { key: "ssc_ka_heal_kara",   label: "Karathress Tank Heal",                     role: "Healer" },
  { key: "ssc_ka_heal_shark",  label: "Sharkkis Tank Heal",                       role: "Healer" },
  { key: "ssc_ka_heal_carib",  label: "Caribdis Tank Heal",                       role: "Healer" },
  { key: "ssc_ka_heal_tidal",  label: "Tidalvess Tank Heal",                      role: "Healer" },
  { key: "ssc_ka_heal_raid",   label: "Raid Heal",                                role: "Healer" },
  // Interrupts
  { key: "ssc_ka_int_carib",     label: "Caribdis Interrupt (Healing Wave / Tidal Surge)", role: "DPS", roleLabel: "Interrupt Assignments" },
  { key: "ssc_ka_int_grounding", label: "Tidalvess Grounding Totem (absorb cast)",  role: "DPS", roleLabel: "Interrupt Assignments" },
  // Misc Assignments
  { key: "ssc_ka_md_shark",     label: "Misdirect - Sharkkis",                     role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_ka_md_shark_pet", label: "Misdirect - Sharkkis Pet (Fathomlurker hyena)", role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_ka_md_carib",     label: "Misdirect - Caribdis",                     role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_ka_md_tidal",     label: "Misdirect - Tidalvess",                    role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_ka_md_kara",      label: "Misdirect - Karathress",                   role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Morogrim Tidewalker ──────────────────────────────────────────────────────
// Add waves at 75%, 50%, 25% (Murlocs in 2 streams). Watery Grave teleports
// players under grates mid-fight. Water Globules target random players at sub-25%.
export const SSC_MOROGRIM = [
  // Raid Leader Notes
  { key: "ssc_mo_rl_notes",    label: "Notes",                                    role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "ssc_mo_bloodlust",   label: "Bloodlust Timing",                         role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  // Tank Assignments
  { key: "ssc_mo_mt",          label: "Tank",                                     role: "Tank" },
  { key: "ssc_mo_adds1",       label: "Murloc Add Tank",                          role: "Tank" },
  // Healer Assignments - multi-tank-heal model + grave/flex coverage
  { key: "ssc_mo_mth_1",       label: "Tank Heal",                                role: "Healer" },
  { key: "ssc_mo_addh1",       label: "Murloc Add Tank Heal",                     role: "Healer" },
  { key: "ssc_mo_grave_heal",  label: "Grave Heal",                               role: "Healer" },
  { key: "ssc_mo_rheal",       label: "Raid Heal",                                role: "Healer" },
  // Misc Assignments
  { key: "ssc_mo_trap_n",      label: "North Trap",                               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_trap_s",      label: "South Trap",                               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_trap_raid",   label: "Trap on Raid (off-position)",              role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_slow_trap_1", label: "Slow Trap #1",                             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_slow_trap_2", label: "Slow Trap #2",                             role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_md_boss",     label: "Misdirect - Morogrim",                     role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_md_west",     label: "Misdirect - West Adds",                    role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_mo_md_east",     label: "Misdirect - East Adds",                    role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Lady Vashj ───────────────────────────────────────────────────────────────
// P1 (100%–70%) and P3 (sub-30%): Tank & spank with Shock Blast + Static Charge.
//   P3 adds Toxic Sporebats and residual P2 adds, but assignments mirror P1.
// P2 (70%–30%): Shield up - must drop with 4 Tainted Cores. Striders kited,
//   Tainted Elementals drop cores, Enchanted Elementals feed Vashj mana if unchecked.
export const SSC_VASHJ_P1 = [
  // Raid Leader Notes
  { key: "ssc_vs1_rl_notes",    label: "Notes",                                   role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout (fight-level)
  { key: "ssc_vs1_bloodlust",   label: "Bloodlust Timing",                        role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. as soon as P3 adds are dead", textInput: true },
  // Tank Assignments
  { key: "ssc_vs1_mt",          label: "Tank",                                    role: "Tank" },
  // Healer Assignments
  { key: "ssc_vs1_mth",         label: "Tank Heal",                               role: "Healer" },
  { key: "ssc_vs1_rheal",       label: "Raid Heal",                               role: "Healer" },
  // Misc
  { key: "ssc_vs1_grounding",   label: "Grounding Totem",                         role: "DPS", roleLabel: "Misc Assignments" },
  { key: "ssc_vs1_md",          label: "Misdirect - Vashj (opener)",              role: "DPS", roleLabel: "Misc Assignments" },
];

export const SSC_VASHJ_P2 = [
  // Tank Assignments - platform elites + striders
  { key: "ssc_vs2_plat_t1",    label: "Platform Elite Tank 1",                     role: "Tank" },
  { key: "ssc_vs2_plat_t2",    label: "Platform Elite Tank 2",                     role: "Tank" },
  { key: "ssc_vs2_strider1",   label: "Coilfang Strider Kiter (Skull)",            role: "Tank" },
  { key: "ssc_vs2_strider2",   label: "Coilfang Strider Kiter (Cross)",            role: "Tank" },
  { key: "ssc_vs2_strider3",   label: "Coilfang Strider Kiter (Square)",           role: "Tank" },
  // Healer Assignments
  { key: "ssc_vs2_heal_plat",  label: "Platform / Elite Tank Heals",               role: "Healer" },
  { key: "ssc_vs2_heal_str",   label: "Strider Kiter Heals",                       role: "Healer" },
  { key: "ssc_vs2_heal_elem",  label: "Elemental / Add Tank Heals",                role: "Healer" },
  { key: "ssc_vs2_zone_w_heal", label: "West Zone Healer",                         role: "Healer" },
  { key: "ssc_vs2_zone_n_heal", label: "North Zone Healer",                        role: "Healer" },
  { key: "ssc_vs2_zone_e_heal", label: "East Zone Healer",                         role: "Healer" },
  { key: "ssc_vs2_zone_s_heal", label: "South Zone Healer",                        role: "Healer" },
  { key: "ssc_vs2_heal_raid",  label: "Raid Heal",                                 role: "Healer" },
  // Stairs Zones
  { key: "ssc_vs2_zone_w_dps",  label: "West Zone DPS",                            role: "DPS", roleLabel: "Stairs Zones" },
  { key: "ssc_vs2_zone_n_dps",  label: "North Zone DPS",                           role: "DPS", roleLabel: "Stairs Zones" },
  { key: "ssc_vs2_zone_e_dps",  label: "East Zone DPS",                            role: "DPS", roleLabel: "Stairs Zones" },
  { key: "ssc_vs2_zone_s_dps",  label: "South Zone DPS",                           role: "DPS", roleLabel: "Stairs Zones" },
  // Misc
  { key: "ssc_vs2_md_naga",    label: "Misdirect - Naga",                          role: "DPS", roleLabel: "Misc Assignments" },
];

// SSC_BOSSES - structured wrapper for tab-per-boss admin rendering.
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
    { id: "p1", label: "P1 (100%–70%) and P3 (sub-30%)", slots: SSC_VASHJ_P1 },
    { id: "p2", label: "P2 (70%–30%)",                   slots: SSC_VASHJ_P2 },
  ]},
];

// ══════════════════════════════════════════════════════════════════════════════
// TEMPEST KEEP - THE EYE (TK)
// ══════════════════════════════════════════════════════════════════════════════

// ── Al'ar ────────────────────────────────────────────────────────────────────
// Single combined phase: 2 platform tanks rotate during P1 perches, 1 add tank
// handles Embers in P2.
export const TK_ALAR = [
  // Raid Leader Notes
  { key: "tk_alar_rl_notes",   label: "Notes",                                   role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "tk_alar_bloodlust",  label: "Bloodlust Timing",                        role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. on pull or P2 transition", textInput: true },
  // Tanks
  { key: "tk_alar_pt1",        label: "Platform Tank 1",                         role: "Tank" },
  { key: "tk_alar_pt2",        label: "Platform Tank 2",                         role: "Tank" },
  { key: "tk_alar_add",        label: "Add Tank",                                role: "Tank" },
  // Healers
  { key: "tk_alar_h_pt",       label: "Platform Tank Heal",                      role: "Healer" },
  { key: "tk_alar_h_add",      label: "Add Tank Heal",                           role: "Healer" },
  { key: "tk_alar_h_raid",     label: "Raid Heal",                               role: "Healer" },
  // Misc Assignments
  { key: "tk_alar_md1",        label: "Misdirect #1",                            role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_alar_md2",        label: "Misdirect #2",                            role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Void Reaver ──────────────────────────────────────────────────────────────
// Single phase. Knock Away drops MT threat - tanks rotate as they get knocked.
export const TK_VOIDREAVER = [
  // Raid Leader Notes
  { key: "tk_vr_rl_notes",     label: "Notes",                                   role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "tk_vr_bloodlust",    label: "Bloodlust Timing",                        role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. on pull (tank-and-spank fight)", textInput: true },
  // Tanks
  { key: "tk_vr_first",        label: "First Tank",                              role: "Tank" },
  { key: "tk_vr_next",         label: "Next Tanks",                              role: "Tank" },
  // Healers
  { key: "tk_vr_h_tank",       label: "Tank Heal",                               role: "Healer" },
  { key: "tk_vr_h_raid",       label: "Raid Heal",                               role: "Healer" },
  { key: "tk_vr_h_soaker",     label: "Soaker Heal",                             role: "Healer" },
  // Misc Assignments
  { key: "tk_vr_soak1",        label: "Soaker #1",                               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_vr_soak2",        label: "Soaker #2",                               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_vr_soak3",        label: "Soaker #3",                               role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_vr_md1",          label: "Misdirect #1",                            role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_vr_md2",          label: "Misdirect #2",                            role: "DPS", roleLabel: "Misc Assignments" },
];

// ── High Astromancer Solarian ────────────────────────────────────────────────
// Single panel - phases collapsed.
export const TK_SOLARIAN = [
  // Raid Leader Notes
  { key: "tk_sol_rl_notes",    label: "Notes",                                   role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Bloodlust callout
  { key: "tk_sol_bloodlust",   label: "Bloodlust Timing",                        role: "DPS", roleLabel: "Notes + Lust", hint: "e.g. P3 (Solarian boss form)", textInput: true },
  { key: "tk_sol_mt",          label: "Tank",                                    role: "Tank" },
  { key: "tk_sol_h_mt",        label: "Tank Heal",                               role: "Healer" },
  { key: "tk_sol_h_missiles",  label: "Arcane Missiles Heal",                    role: "Healer" },
  { key: "tk_sol_h_raid",      label: "Raid Heal",                               role: "Healer" },
];

// ── Kael'thas Sunstrider ─────────────────────────────────────────────────────
// P1: 4 Advisors killed sequentially (Thaladred → Sanguinar → Capernian → Telonicus).
// P2: 7 Legendary Weapons summoned. Any class can be assigned - shield to tank,
//     mace to healer, bow to hunter, etc.
// P3: Advisors resurrected together (~50% HP each).
// P4: Kael'thas engages. Pyroblast interrupt rotation, Phoenix + Egg duty, MC,
//     Nether Vapor, Gravity Lapse (raid flies, dodge Nether Beams from ceiling).
//     Sub-50% execute-phase mechanics continue in P4 - not a separate phase.
export const TK_KAELTHAS_P1 = [
  // Raid Leader Notes
  { key: "tk_k1_rl_notes",     label: "Notes",                                   role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  // Advisor tanks (killed in order)
  { key: "tk_k1_thaladred",    label: "Thaladred the Darkener (Advisor 1)",      role: "Tank" },
  { key: "tk_k1_sanguinar",    label: "Lord Sanguinar (Advisor 2)",              role: "Tank" },
  { key: "tk_k1_capernian",    label: "Grand Astromancer Capernian (Advisor 3)", role: "Tank" },
  { key: "tk_k1_telonicus",    label: "Master Engineer Telonicus (Advisor 4)",   role: "Tank" },
  // Healers
  { key: "tk_k1_h_thal",       label: "Thaladred Gaze Target Heal",              role: "Healer" },
  { key: "tk_k1_h_tanks",      label: "Advisor Tank Heals",                      role: "Healer" },
  { key: "tk_k1_h_raid",       label: "Raid Heal",                               role: "Healer" },
  // Misc
  { key: "tk_k1_fear_ward",    label: "Fear Ward / Tremor Totem (Sanguinar)",    role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_k1_cap_conflag",  label: "Capernian Conflag Soaker",                role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_k1_md_sanguinar", label: "Misdirect - Lord Sanguinar",              role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_k1_md_capernian", label: "Misdirect - Grand Astromancer Capernian", role: "DPS", roleLabel: "Misc Assignments" },
  { key: "tk_k1_md_telonicus", label: "Misdirect - Master Engineer Telonicus",   role: "DPS", roleLabel: "Misc Assignments" },
];

export const TK_KAELTHAS_P2 = [
  // 7 Legendary Weapons - any class can be assigned. Role is "DPS" with a shared
  // roleLabel so they group together rather than piling into the Tank section.
  { key: "tk_k2_weap_skull",    label: "Staff of Disintegration",                role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_cross",    label: "Warp Slicer",                            role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_square",   label: "Devastation",                            role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_moon",     label: "Cosmic Infuser",                         role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_triangle", label: "Infinity Blade",                         role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_diamond",  label: "Phaseshift Bulwark",                     role: "DPS", roleLabel: "Legendary Weapons" },
  { key: "tk_k2_weap_circle",   label: "Netherstrand Longbow",                   role: "DPS", roleLabel: "Legendary Weapons" },
  // Healers
  { key: "tk_k2_h_weap_group",  label: "Weapons Phase Raid Heal",                role: "Healer" },
  { key: "tk_k2_h_tank_pool",   label: "Weapon Target Heal Pool",                role: "Healer" },
  // Misc
  { key: "tk_k2_weap_order",    label: "Weapon Kill Order (notes)",              role: "DPS", roleLabel: "Misc Assignments", hint: "Typical: Staff → Bow → Mace → Slicer", textInput: true },
  { key: "tk_k2_wielder_pickup",label: "Weapon Pickup Assignments (post-death)", role: "DPS", roleLabel: "Misc Assignments", hint: "Loot & equip - 2 min buff", textInput: true },
];

export const TK_KAELTHAS_P3 = [
  // All 4 advisors resurrected simultaneously at ~50% HP.
  { key: "tk_k3_thaladred",    label: "Thaladred the Darkener",                  role: "Tank" },
  { key: "tk_k3_sanguinar",    label: "Lord Sanguinar",                          role: "Tank" },
  { key: "tk_k3_capernian",    label: "Capernian",                               role: "Tank" },
  { key: "tk_k3_telonicus",    label: "Telonicus",                               role: "Tank" },
  { key: "tk_k3_h_thal",       label: "Thaladred the Darkener Heal",             role: "Healer" },
  { key: "tk_k3_h_sang",       label: "Lord Sanguinar Heal",                     role: "Healer" },
  { key: "tk_k3_h_cap",        label: "Capernian Heal",                          role: "Healer" },
  { key: "tk_k3_h_tel",        label: "Telonicus Heal",                          role: "Healer" },
  { key: "tk_k3_h_raid",       label: "Raid Heal",                               role: "Healer" },
];

export const TK_KAELTHAS_P4 = [
  // Kael'thas himself. Sub-50% execute-phase mechanics continue in this phase -
  // captured as an execute-cooldowns notes row rather than a separate P5.
  // Tanks
  { key: "tk_k4_mt",           label: "Tank",                                    role: "Tank" },
  { key: "tk_k4_phoenix",      label: "Phoenix Kiter / Tank",                    role: "Tank" },
  // Healers
  { key: "tk_k4_h_mt1",        label: "Tank Heal",                               role: "Healer" },
  { key: "tk_k4_h_phoenix",    label: "Phoenix Kiter Heal",                      role: "Healer" },
  { key: "tk_k4_h_mc",         label: "Mind Control Heal-to-Break",              role: "Healer" },
  { key: "tk_k4_h_raid",       label: "Raid Heal",                               role: "Healer" },
  // Pyroblast Interrupt Rotation - 2.5s cast, interruptible, raid-killing
  { key: "tk_k4_pyro_skull",   label: "Pyroblast Interrupt (1st)",               role: "DPS", roleLabel: "Pyroblast Interrupt Rotation" },
  { key: "tk_k4_pyro_cross",   label: "Pyroblast Interrupt (2nd)",               role: "DPS", roleLabel: "Pyroblast Interrupt Rotation" },
  { key: "tk_k4_pyro_backup",  label: "Pyroblast Interrupt Backup",              role: "DPS", roleLabel: "Pyroblast Interrupt Rotation" },
];

// TK_BOSSES - same structured wrapper as SSC_BOSSES.
export const TK_BOSSES = [
  { id: "alar",     name: "Al'ar",                     phases: [
    { id: "main", label: "", slots: TK_ALAR },
  ]},
  { id: "vr",       name: "Void Reaver",               phases: [
    { id: "main", label: "", slots: TK_VOIDREAVER },
  ]},
  { id: "solarian", name: "High Astromancer Solarian", phases: [
    { id: "main", label: "", slots: TK_SOLARIAN },
  ]},
  { id: "kaelthas", name: "Kael'thas Sunstrider",      phases: [
    { id: "p1", label: "P1 (advisors)",            slots: TK_KAELTHAS_P1 },
    { id: "p2", label: "P2 (legendary weapons)",   slots: TK_KAELTHAS_P2 },
    { id: "p3", label: "P3 (advisors revived)",    slots: TK_KAELTHAS_P3 },
    { id: "p4", label: "P4 (Kael + sub-50%)",      slots: TK_KAELTHAS_P4 },
  ]},
];

// ══════════════════════════════════════════════════════════════════════════════
// TIER 6 — MOUNT HYJAL (MH) + BLACK TEMPLE (BT)
// ══════════════════════════════════════════════════════════════════════════════
//
// Same row/phase/boss shape as SSC_BOSSES / TK_BOSSES, plus five optional row
// fields introduced for T6 (all backwards compatible — SSC/TK rows omit them):
//
//   max:       n     cap on how many players the slot accepts ([1]/[2]/[3]/[5]).
//                    Omitted = unlimited ([N]).
//   ordered:   true  order matters — chips render as "A › B › C".
//   note:      "…"   small italic helper line rendered under the row.
//   default:   "…"   seed value for a textInput row (written on first load).
//   textLong:  true  render the text field full-width (long default notes).
//
// Class/role hints from the spec are carried in the row label (the roster picker
// filters by role only, so there is nowhere to attach a class filter).

// ── Hyjal trash (waves 1-8) ──────────────────────────────────────────────────
export const MH_TRASH = [
  // Tank Assignments
  { key: "mh_tr_pally",      label: "Pally Tank (ghouls / everything untanked)", role: "Tank", max: 1 },
  { key: "mh_tr_bears",      label: "Bear Tanks",                               role: "Tank", max: 2 },
  { key: "mh_tr_wyrm",       label: "Frost Wyrm Hunter-Tank",                   role: "Tank", max: 1 },
  // Misc Assignments
  { key: "mh_tr_mc",         label: "Mind Control - Necromancer buffer (Priest)",  role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "mh_tr_banish",     label: "Banish - Fel Stalkers / Infernals (Warlock)", role: "DPS", roleLabel: "Misc Assignments", max: 2 },
  { key: "mh_tr_frost_trap", label: "Frost Trap (Hunter)",                        role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "mh_tr_decurse",    label: "Decurse - Banshee Curse (Mage / Druid)",     role: "DPS", roleLabel: "Misc Assignments", max: 3 },
  { key: "mh_tr_priority",   label: "Kill priority (wave)",                       role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true, hint: "Wave-by-wave kill priority…" },
];

// ── Rage Winterchill ─────────────────────────────────────────────────────────
export const MH_WINTERCHILL = [
  { key: "mh_wc_notes",     label: "Notes",             role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "mh_wc_bloodlust", label: "Bloodlust Timing",  role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "mh_wc_mt",        label: "Main Tank",         role: "Tank", max: 1 },
  { key: "mh_wc_h_tank",    label: "Tank Heal",         role: "Healer" },
  { key: "mh_wc_h_raid",    label: "Raid Heal",         role: "Healer" },
  { key: "mh_wc_misc_notes", label: "Notes",            role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Stack in Death and Decay. Pop Lust when threat is established." },
];

// ── Anetheron ────────────────────────────────────────────────────────────────
export const MH_ANETHERON = [
  { key: "mh_an_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "mh_an_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  // Tank Assignments
  { key: "mh_an_mt",        label: "Main Tank (Bear)",                                          role: "Tank", max: 1 },
  { key: "mh_an_infernal",  label: "Infernal Tank (Pally, FR aura + FR pieces, tanks by Jaina)", role: "Tank", max: 1 },
  { key: "mh_an_fardrop",   label: "Far-drop Delivery (Feral, brings distant Infernals in)",     role: "Tank", max: 1 },
  // Healer Assignments
  { key: "mh_an_h_mt",      label: "Main Tank Heal (from the house)", role: "Healer" },
  { key: "mh_an_h_inf",     label: "Infernal Tank Heal",             role: "Healer" },
  { key: "mh_an_h_raid",    label: "Raid Heal",                      role: "Healer" },
  // Misc Assignments
  { key: "mh_an_ms",        label: "MS / Aimed Shot / Wound Poison uptime", role: "DPS", roleLabel: "Misc Assignments", max: 3 },
  { key: "mh_an_stacks",    label: "Ranged Stack Leads (3 stacks)",        role: "DPS", roleLabel: "Misc Assignments", max: 3 },
];

// ── Kaz'rogal ────────────────────────────────────────────────────────────────
export const MH_KAZROGAL = [
  { key: "mh_kz_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "mh_kz_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "mh_kz_mt",        label: "Main Tank",                                  role: "Tank", max: 1 },
  { key: "mh_kz_cleave",    label: "Cleave Stackers (stack ON TOP of MT, Druid)", role: "Tank", max: 2 },
  { key: "mh_kz_h_tank",    label: "Tank Heal",        role: "Healer" },
  { key: "mh_kz_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "mh_kz_pullback",  label: "Hunter Pull-back to MT", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "mh_kz_mana_note", label: "Mana Note",              role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Mana users: >3000 mana or step out of raid." },
];

// ── Azgalor ──────────────────────────────────────────────────────────────────
export const MH_AZGALOR = [
  { key: "mh_az_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "mh_az_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "mh_az_mt",        label: "Main Tank (Bear, full mitigation set)",                        role: "Tank", max: 1 },
  { key: "mh_az_ot",        label: "Doomguard Off-Tank (Pally, initial threat only)",              role: "Tank", max: 1,
    note: "Tauren Warriors kill the Doomguards - the OT only needs the opening threat." },
  { key: "mh_az_h_tank",    label: "Tank Heal (rolling HoTs/shields pre-pull)", role: "Healer" },
  { key: "mh_az_h_raid",    label: "Raid Heal",                                role: "Healer" },
  { key: "mh_az_soulstone", label: "Soulstone - Doom targets (Warlock)", role: "DPS", roleLabel: "Misc Assignments" },
  { key: "mh_az_doom_note", label: "Doom Note",                          role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Doom target: run PAST the OT by the Tauren." },
];

// ── Archimonde ───────────────────────────────────────────────────────────────
export const MH_ARCHIMONDE = [
  { key: "mh_ar_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "mh_ar_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "mh_ar_mt",        label: "Main Tank (use Tears BEFORE hitting the ground)", role: "Tank", max: 1 },
  { key: "mh_ar_stump",     label: "Stump Tank (optional, if Air Burst bugged, Druid)", role: "Tank", max: 1 },
  { key: "mh_ar_h_tank",    label: "Tank Heal",        role: "Healer" },
  { key: "mh_ar_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "mh_ar_dec_12",    label: "Decurse - Groups 1-2", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "mh_ar_dec_3",     label: "Decurse - Group 3",    role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "mh_ar_dec_45",    label: "Decurse - Groups 4-5", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  // Tremor Totem — one slot per raid group (config has no five-slot row type).
  { key: "mh_ar_tremor_g1", label: "G1", role: "DPS", roleLabel: "Misc Assignments", subSection: "Tremor Totem (Shaman)", max: 1 },
  { key: "mh_ar_tremor_g2", label: "G2", role: "DPS", roleLabel: "Misc Assignments", subSection: "Tremor Totem (Shaman)", max: 1 },
  { key: "mh_ar_tremor_g3", label: "G3", role: "DPS", roleLabel: "Misc Assignments", subSection: "Tremor Totem (Shaman)", max: 1 },
  { key: "mh_ar_tremor_g4", label: "G4", role: "DPS", roleLabel: "Misc Assignments", subSection: "Tremor Totem (Shaman)", max: 1 },
  { key: "mh_ar_tremor_g5", label: "G5", role: "DPS", roleLabel: "Misc Assignments", subSection: "Tremor Totem (Shaman)", max: 1 },
];

export const MH_BOSSES = [
  { id: "trash",       name: "Hyjal Trash",      phases: [{ id: "main", label: "Waves",   slots: MH_TRASH }] },
  { id: "winterchill", name: "Rage Winterchill", phases: [{ id: "main", label: "",        slots: MH_WINTERCHILL }] },
  { id: "anetheron",   name: "Anetheron",        phases: [{ id: "main", label: "",        slots: MH_ANETHERON }] },
  { id: "kazrogal",    name: "Kaz'rogal",        phases: [{ id: "main", label: "",        slots: MH_KAZROGAL }] },
  { id: "azgalor",     name: "Azgalor",          phases: [{ id: "main", label: "",        slots: MH_AZGALOR }] },
  { id: "archimonde",  name: "Archimonde",       phases: [{ id: "main", label: "",        slots: MH_ARCHIMONDE }] },
];

// ── BT trash (routing / marks) ───────────────────────────────────────────────
export const BT_TRASH = [
  // Raid Marks — one player per mark
  { key: "bt_tr_skull",    label: "Skull",              markerKey: "skull",    role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_cross",    label: "Cross (X)",          markerKey: "cross",    role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_triangle", label: "Triangle",           markerKey: "triangle", role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_circle",   label: "Circle",             markerKey: "circle",   role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_square",   label: "Square",             markerKey: "square",   role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_moon",     label: "Moon - Shackle (Priest)",   markerKey: "moon",    role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_star",     label: "Star - Trap (Hunter)",      markerKey: "star",    role: "DPS", roleLabel: "Raid Marks", max: 1 },
  { key: "bt_tr_diamond",  label: "Diamond - Banish (Warlock)", markerKey: "diamond", role: "DPS", roleLabel: "Raid Marks", max: 1 },
  // Misc Assignments
  { key: "bt_tr_hands",    label: "Hands of Gorefiend tanks (bears)", role: "DPS", roleLabel: "Misc Assignments", max: 2 },
  { key: "bt_tr_notes",    label: "Notes",                            role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Illidari Nightlord = ZERG (run out of Rain of Fire). Big pull before Akama = bubble pull + LoS. Freedom the tank on Akama-room root packs. Mana users step out of AoE drain packs. GTFO addon + Rocket Boots for the post-Teron run." },
];

// ── High Warlord Najentus ────────────────────────────────────────────────────
export const BT_NAJENTUS = [
  { key: "bt_na_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_na_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_na_mt",        label: "Main Tank",        role: "Tank", max: 1 },
  { key: "bt_na_h_tank",    label: "Tank Heal",        role: "Healer" },
  { key: "bt_na_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "bt_na_spine",     label: "Spine Note",       role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "1 spine per Impale - closest buddy clicks it off, call 'spine'." },
];

// ── Supremus ─────────────────────────────────────────────────────────────────
export const BT_SUPREMUS = [
  { key: "bt_su_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_su_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_su_mt",        label: "Main Tank",                                 role: "Tank", max: 1 },
  { key: "bt_su_soakers",   label: "Hateful Strike Soakers (chase, stam gear)", role: "Tank", max: 2 },
  { key: "bt_su_h_tank",    label: "Tank / Soaker Heal", role: "Healer" },
  { key: "bt_su_h_raid",    label: "Raid Heal",          role: "Healer" },
  { key: "bt_su_md",        label: "Misdirect on Phase Flip (Hunter)", role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Shade of Akama ───────────────────────────────────────────────────────────
export const BT_AKAMA = [
  { key: "bt_ak_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_ak_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true,
    default: "When Shade releases" },
  { key: "bt_ak_left",      label: "Left Adds Tank",   role: "Tank", max: 1 },
  { key: "bt_ak_right",     label: "Right Adds Tank",  role: "Tank", max: 1 },
  { key: "bt_ak_holder",    label: "Battlemaster / Defender Holder (under Akama for Seed cleave)", role: "Tank", max: 1 },
  { key: "bt_ak_h_left",    label: "Left Tank Heal",   role: "Healer" },
  { key: "bt_ak_h_right",   label: "Right Tank Heal",  role: "Healer" },
  { key: "bt_ak_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "bt_ak_seed",      label: "Seed of Corruption cleavers (Warlock)", role: "DPS", roleLabel: "Misc Assignments" },
];

// ── Teron Gorefiend ──────────────────────────────────────────────────────────
export const BT_TERON = [
  { key: "bt_te_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_te_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_te_mt",        label: "Main Tank",        role: "Tank", max: 1 },
  { key: "bt_te_h_tank",    label: "Tank Heal",        role: "Healer" },
  { key: "bt_te_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "bt_te_brez",      label: "Battle-Res Priority (dead-ghost healers, Druid)", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "bt_te_ghost",     label: "Ghost Order Note",                                role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Button 5 Volley, Button 4 Chains, Button 3 Lance x2 each construct. Ghost simulator MANDATORY." },
];

// ── Gurtogg Bloodboil ────────────────────────────────────────────────────────
export const BT_GURTOGG = [
  { key: "bt_gu_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_gu_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_gu_rotation",  label: "Tank Rotation",    role: "Tank", max: 3, ordered: true,
    note: "~15-20 stacks per swap; first tank drops threat to second, third or first finishes." },
  { key: "bt_gu_h_tank",    label: "Tank Heal",                                    role: "Healer" },
  { key: "bt_gu_h_raid",    label: "Raid Heal",                                    role: "Healer" },
  { key: "bt_gu_h_soak",    label: "Soaker Heal (from mid)",                       role: "Healer" },
  { key: "bt_gu_h_line",    label: "Line Healers (heal from inside Soak Group 1)", role: "Healer" },
  { key: "bt_gu_soak1",     label: "Soak Group 1 - holds the line", role: "DPS", roleLabel: "Misc Assignments", max: 5 },
  { key: "bt_gu_soak2",     label: "Soak Group 2 - jump-ropes",     role: "DPS", roleLabel: "Misc Assignments", max: 5 },
  { key: "bt_gu_never",     label: "Never Soaks",                   role: "DPS", roleLabel: "Misc Assignments" },
  { key: "bt_gu_lust",      label: "Lust Caller",                   role: "DPS", roleLabel: "Misc Assignments", max: 1 },
];

// ── Reliquary of Souls ───────────────────────────────────────────────────────
export const BT_RELIQUARY = [
  { key: "bt_ro_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true, textLong: true,
    default: "P1 = no healing (healthstones/pots). Swap in the MIDDLE - incoming tank waits until RoS actually switches. LUST P3." },
  { key: "bt_ro_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_ro_p1",        label: "P1 Tank Rotation", role: "Tank", max: 4, ordered: true,
    note: "Last slot expected to be a Rogue on Evasion." },
  { key: "bt_ro_p2",        label: "P2 Tank",                    role: "Tank", max: 1 },
  { key: "bt_ro_p3_first",  label: "P3 First Tank (rage dump, Bear)", role: "Tank", max: 1 },
  { key: "bt_ro_p3_mt",     label: "P3 Taunt-off / MT (Pally)",      role: "Tank", max: 1 },
  { key: "bt_ro_h_p2",      label: "P2 Tank Heal", role: "Healer" },
  { key: "bt_ro_h_p3",      label: "P3 Tank Heal", role: "Healer" },
  { key: "bt_ro_h_raid",    label: "Raid Heal",    role: "Healer" },
  { key: "bt_ro_pummel",    label: "Pummel Rotation on Deaden (Warrior)",   role: "DPS", roleLabel: "Misc Assignments", max: 2 },
  { key: "bt_ro_kick",      label: "Kick everything else (Spirit Shock, Rogue)", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "bt_ro_steal",     label: "Spellsteal Rune Shield (Mage)",         role: "DPS", roleLabel: "Misc Assignments", max: 1 },
];

// ── Mother Shahraz ───────────────────────────────────────────────────────────
export const BT_SHAHRAZ = [
  { key: "bt_sh_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_sh_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_sh_mt",        label: "Main Tank (Bear - Shriek silences the pally)", role: "Tank", max: 1 },
  { key: "bt_sh_saber",     label: "Saber Lash Soakers",                          role: "Tank", max: 2 },
  { key: "bt_sh_h_tank",    label: "Tank Heal", role: "Healer" },
  { key: "bt_sh_h_raid",    label: "Raid Heal", role: "Healer" },
  { key: "bt_sh_sr_group",  label: "Shadow Resistance Group", role: "DPS", roleLabel: "Misc Assignments" },
  { key: "bt_sh_fa_note",   label: "Fatal Attraction Note",   role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    hint: "Fatal Attraction handling…" },
];

// ── Illidari Council ─────────────────────────────────────────────────────────
export const BT_COUNCIL = [
  { key: "bt_co_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_co_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_co_gathios",   label: "Gathios Tank",              role: "Tank", max: 1 },
  { key: "bt_co_malande",   label: "Malande Tank",              role: "Tank", max: 1 },
  { key: "bt_co_veras",     label: "Veras Tank (every vanish)", role: "Tank", max: 1 },
  { key: "bt_co_zerevor",   label: "Zerevor Mage-Tank (kite, Mage)", role: "Tank", max: 1 },
  { key: "bt_co_backup",    label: "Backup Mage-Tank (Mage)",        role: "Tank", max: 1 },
  { key: "bt_co_h_gathios", label: "Gathios Tank Heal (glued)", role: "Healer" },
  { key: "bt_co_h_malande", label: "Malande / Veras Heal",      role: "Healer" },
  { key: "bt_co_h_zerevor", label: "Zerevor Flex Heal",         role: "Healer" },
  { key: "bt_co_h_raid",    label: "Raid Heal",                 role: "Healer" },
  { key: "bt_co_int1",      label: "Malande Interrupts - primary (Rogue)",             role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "bt_co_int2",      label: "Malande Interrupts - Earth Shock backup (Shaman)", role: "DPS", roleLabel: "Misc Assignments", max: 2 },
  { key: "bt_co_innervate", label: "Innervate target (Druid to healer)",               role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "bt_co_kill_note", label: "Kill Order Note",                                  role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "All DPS on Gathios. Lust once Gathios is settled." },
];

// ── Illidan Stormrage ────────────────────────────────────────────────────────
export const BT_ILLIDAN = [
  { key: "bt_il_notes",     label: "Notes",            role: "DPS", roleLabel: "Notes + Lust", hint: "Strategy notes, callouts, reminders…", textInput: true },
  { key: "bt_il_bloodlust", label: "Bloodlust Timing", role: "DPS", roleLabel: "Notes + Lust", hint: "When to pop Bloodlust", textInput: true },
  { key: "bt_il_mt",        label: "Main Tank",                       role: "Tank", max: 1 },
  { key: "bt_il_flame_l",   label: "P2 Left Flame Tank (FR gear)",    role: "Tank", max: 1 },
  { key: "bt_il_flame_r",   label: "P2 Right Flame Tank (FR gear)",   role: "Tank", max: 1 },
  { key: "bt_il_flame_bk",  label: "Flame Tank Backup",               role: "Tank", max: 1 },
  { key: "bt_il_demon",     label: "Demon Phase Shadow-Res Warlock Tank", role: "Tank", max: 1 },
  { key: "bt_il_h_mt",      label: "MT Heal",          role: "Healer" },
  { key: "bt_il_h_flame",   label: "Flame Tank Heal",  role: "Healer" },
  { key: "bt_il_h_sr",      label: "SR Warlock Heal",  role: "Healer" },
  { key: "bt_il_h_raid",    label: "Raid Heal",        role: "Healer" },
  { key: "bt_il_brez",      label: "Battle-Res Holder (entire fight, Druid)", role: "DPS", roleLabel: "Misc Assignments", max: 1 },
  { key: "bt_il_demon_note", label: "Shadow Demon Kill Note",                 role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "Shadow Demons = #1 kill; if fixated, STAND STILL." },
  { key: "bt_il_p5_note",   label: "P5 Note",                                 role: "DPS", roleLabel: "Misc Assignments", textInput: true, textLong: true,
    default: "MT drags Illidan into Maiev's traps on her call. LUST P5." },
];

export const BT_BOSSES = [
  { id: "trash",     name: "BT Trash",              phases: [{ id: "main", label: "Routing / Marks", slots: BT_TRASH }] },
  { id: "najentus",  name: "High Warlord Najentus", phases: [{ id: "main", label: "", slots: BT_NAJENTUS }] },
  { id: "supremus",  name: "Supremus",              phases: [{ id: "main", label: "", slots: BT_SUPREMUS }] },
  { id: "akama",     name: "Shade of Akama",        phases: [{ id: "main", label: "", slots: BT_AKAMA }] },
  { id: "teron",     name: "Teron Gorefiend",       phases: [{ id: "main", label: "", slots: BT_TERON }] },
  { id: "gurtogg",   name: "Gurtogg Bloodboil",     phases: [{ id: "main", label: "", slots: BT_GURTOGG }] },
  { id: "reliquary", name: "Reliquary of Souls",    phases: [{ id: "main", label: "", slots: BT_RELIQUARY }] },
  { id: "shahraz",   name: "Mother Shahraz",        phases: [{ id: "main", label: "", slots: BT_SHAHRAZ }] },
  { id: "council",   name: "Illidari Council",      phases: [{ id: "main", label: "", slots: BT_COUNCIL }] },
  { id: "illidan",   name: "Illidan Stormrage",     phases: [{ id: "main", label: "", slots: BT_ILLIDAN }] },
];

// Default text values for a boss list — seeded into textInputs on first load so
// the spec's default notes appear without the raid leader retyping them.
export function defaultTextInputs(bosses) {
  const out = {};
  bosses.forEach(b => b.phases.forEach(p => p.slots.forEach(r => {
    if (r.textInput && r.default) out[r.key] = r.default;
  })));
  return out;
}

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
  { key: "gen_coe", label: "Curse of Elements",     role: "DPS", roleLabel: "Warlock Curses" },
  { key: "gen_cor", label: "Curse of Recklessness", role: "DPS", roleLabel: "Warlock Curses" },
  { key: "gen_cot", label: "Curse of Tongues",      role: "DPS", roleLabel: "Warlock Curses" },
  { key: "gen_cow", label: "Curse of Weakness",     role: "DPS", roleLabel: "Warlock Curses" },
];

export const GENERAL_INTERRUPTS = MARKERS.slice(0, 3).map(m => ({
  key: `gen_int_${m.key}`, label: "", markerKey: m.key,
  role: "DPS", roleLabel: "Trash Interrupts",
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

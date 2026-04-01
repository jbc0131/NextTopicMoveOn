const SCHOOL = {
  PHYSICAL: 1,
  HOLY: 2,
  FIRE: 4,
  NATURE: 8,
  FROST: 16,
  SHADOW: 32,
  ARCANE: 64,
};

const BASE_COEFFICIENT = { value: 1, debug: [] };
const GLOBAL_SPELL_HANDLER_ID = -2000;

const PLAYER_CLASS_COLORS = {
  Druid: "#FF7D0A",
  Hunter: "#ABD473",
  Mage: "#69CCF0",
  Paladin: "#F58CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF569",
  Shaman: "#0070DE",
  Warlock: "#9482C9",
  Warrior: "#C79C6E",
};

const DRUID = {
  MOD: {
    MANGLE: 1 + ((1.5 - 1.15) / 1.15),
    T6_2PC: 1.5,
  },
  BUFF: {
    T6_2PC: 38447,
  },
  TIER: {
    T6: 676,
  },
};

function getThreatCoefficient(values) {
  if (typeof values === "number") values = { 0: values };
  if (!(0 in values)) values[0] = 1;
  return function threatCoefficient(spellSchool = 0) {
    if (spellSchool in values) return values[spellSchool];
    return values[0];
  };
}

function applyThreatCoefficient(coefficient, nextValue, label, bonus) {
  return {
    value: coefficient.value * nextValue,
    debug: [...(coefficient.debug || []), { value: nextValue, label, bonus }],
  };
}

function cloneTalentConfig(talents = {}) {
  const cloned = {};
  for (const [name, talent] of Object.entries(talents)) {
    cloned[name] = { ...talent, rank: talent.maxRank };
  }
  return cloned;
}

function gearHasEnchant(gear = [], enchantId) {
  return (gear || []).some(item => Number(item?.permanentEnchant || 0) === Number(enchantId));
}

function gearSetCount(gear = [], setId) {
  return (gear || []).filter(item => Number(item?.setID || 0) === Number(setId)).length;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function eventKey(event, prefix) {
  const baseId = event?.[`${prefix}ID`] ?? event?.[prefix]?.id ?? null;
  if (baseId == null) return "";
  const instance = event?.[`${prefix}Instance`];
  return instance == null ? String(baseId) : `${baseId}.${instance}`;
}

function sortName(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en", { sensitivity: "base" });
}

function clampThreat(value) {
  return Math.max(0, numeric(value, 0));
}

function isPrimaryTargetAction(event = {}) {
  const abilityGuid = Number(event?.ability?.guid || 0);
  const abilityName = String(event?.ability?.name || "").trim().toLowerCase();
  if (event?.type === "damage" || event?.type === "miss") {
    return abilityGuid === 1 || abilityName === "attack" || abilityName === "melee";
  }
  if (event?.type === "cast" || event?.type === "begincast") {
    return abilityGuid === 1 || abilityName === "attack" || abilityName === "melee";
  }
  return false;
}

function compactThreatSeries(points = [], bucketMs = 1000) {
  if (!Array.isArray(points) || !points.length) return [];
  const compacted = [];
  let lastBucket = -1;

  for (const point of points) {
    const timeMs = Math.max(0, Math.round(numeric(point.timeMs, 0)));
    const threat = Math.round(numeric(point.threat, 0));
    const label = String(point?.label || "").trim();
    const bucket = Math.floor(timeMs / Math.max(1, bucketMs));
    if (bucket !== lastBucket) {
      compacted.push({ timeMs, threat, ...(label ? { label } : {}) });
      lastBucket = bucket;
      continue;
    }
    compacted[compacted.length - 1] = { timeMs, threat, ...(label ? { label } : {}) };
  }

  const lastPoint = points[points.length - 1];
  const normalizedLast = {
    timeMs: Math.max(0, Math.round(numeric(lastPoint?.timeMs, 0))),
    threat: Math.round(numeric(lastPoint?.threat, 0)),
    ...(String(lastPoint?.label || "").trim() ? { label: String(lastPoint.label).trim() } : {}),
  };

  const tail = compacted[compacted.length - 1];
  if (!tail || tail.timeMs !== normalizedLast.timeMs || tail.threat !== normalizedLast.threat) {
    compacted.push(normalizedLast);
  }

  return compacted;
}

function buildModifierRows(unit, config) {
  const rows = [
    { label: "Initial coefficient", value: Number(unit.initialCoeff || 1).toFixed(3) },
  ];

  for (const buffId of Object.keys(unit.buffs || {})) {
    const label = config.buffNames[buffId];
    if (label) rows.push({ label, value: "Active" });
  }

  for (const [talentName, talent] of Object.entries(unit.talents || {})) {
    const rank = Number(talent?.rank || 0);
    if (rank > 0) rows.push({ label: talentName, value: `${rank}/${talent.maxRank}` });
  }

  return rows;
}

const THREAT_CONFIG = {
  preferredSpellSchools: {
    Mage: SCHOOL.FROST,
    Priest: SCHOOL.HOLY,
    Paladin: SCHOOL.HOLY,
    Warlock: SCHOOL.SHADOW,
  },
  baseThreatCoefficients: {},
  initialBuffs: {
    All: {
      1038: 0,
      25895: 0,
      25909: 0,
      2613: 0,
      2621: 0,
    },
  },
  buffNames: {
    71: "Defensive Stance",
    2457: "Battle Stance",
    2458: "Berserker Stance",
    5487: "Bear Form",
    9634: "Dire Bear Form",
    768: "Cat Form",
    25780: "Righteous Fury",
    1038: "Blessing of Salvation",
    25895: "Greater Blessing of Salvation",
    25909: "Tranquil Air Totem",
    2613: "Threat Gloves Enchant",
    2621: "Subtlety Gloves Enchant",
    40618: "Insignificance",
    [DRUID.BUFF.T6_2PC]: "Improved Mangle (T6 2pc)",
  },
  buffMultipliers: {
    71: getThreatCoefficient(1.3),
    5487: getThreatCoefficient(1.3),
    9634: getThreatCoefficient(1.3),
    25780: getThreatCoefficient({ [SCHOOL.HOLY]: 1.6 }),
    1038: getThreatCoefficient(0.7),
    25895: getThreatCoefficient(0.7),
    25909: getThreatCoefficient(0.8),
    2613: getThreatCoefficient(1.02),
    2621: getThreatCoefficient(0.98),
    40618: getThreatCoefficient(0),
    [DRUID.BUFF.T6_2PC]: (spellSchool, spellId) => {
      const mangleSpells = { 33878: true, 33986: true, 33987: true };
      if (spellId in mangleSpells) {
        return DRUID.MOD.T6_2PC / DRUID.MOD.MANGLE;
      }
      return 1;
    },
  },
  talents: {
    Warrior: {
      Defiance: {
        maxRank: 3,
        coeff: (buffs, rank = 3) => getThreatCoefficient((71 in buffs) ? 1 + (0.05 * rank) : 1),
      },
      "Improved Berserker Stance": {
        maxRank: 5,
        coeff: (buffs, rank = 5) => getThreatCoefficient((2458 in buffs) ? 1 - (0.02 * rank) : 1),
      },
      "Tactical Mastery": {
        maxRank: 3,
        coeff: (buffs, rank = 3, spellId) => getThreatCoefficient(
          (71 in buffs && ({
            23881: true, 23892: true, 23893: true, 23894: true, 23888: true, 23885: true, 23891: true,
            12294: true, 21551: true, 21552: true, 21553: true, 25248: true, 30330: true,
          }[spellId])) ? 1 + (0.21 * rank) : 1
        ),
      },
    },
    Druid: {
      "Feral Instinct": {
        maxRank: 3,
        coeff: (buffs, rank = 3) => getThreatCoefficient((5487 in buffs || 9634 in buffs) ? ((1.3 + (0.05 * rank)) / 1.3) : 1),
      },
      Subtlety: {
        maxRank: 5,
        coeff: (_, rank = 5, spellId) => getThreatCoefficient(
          ({
            8936: true, 8938: true, 8940: true, 8941: true, 9750: true, 9856: true, 9857: true, 9858: true, 26980: true,
            774: true, 1058: true, 1430: true, 2090: true, 2091: true, 3627: true, 8910: true, 9839: true, 9840: true,
            9841: true, 25299: true, 26981: true, 26982: true, 5185: true, 5186: true, 5187: true, 5188: true, 5189: true,
            6778: true, 8903: true, 9758: true, 9888: true, 9889: true, 25297: true, 26978: true, 26979: true, 740: true,
            8918: true, 9862: true, 9863: true, 26983: true,
          }[spellId]) ? 1 - (0.04 * rank) : 1
        ),
      },
    },
    Mage: {
      "Arcane Subtlety": { maxRank: 2, coeff: (_, rank = 2) => getThreatCoefficient({ [SCHOOL.ARCANE]: 1 - (0.2 * rank) }) },
      "Burning Soul": { maxRank: 2, coeff: (_, rank = 2) => getThreatCoefficient({ [SCHOOL.FIRE]: 1 - (0.05 * rank) }) },
      "Frost Channeling": { maxRank: 3, coeff: (_, rank = 3) => getThreatCoefficient({ [SCHOOL.FROST]: 1 - (0.033333 * rank) }) },
    },
    Paladin: {
      "Improved Righteous Fury": {
        maxRank: 3,
        coeff: (buffs, rank = 3) => {
          if (!(25780 in buffs)) return getThreatCoefficient(1);
          const amp = 1 + Math.floor((rank * 50) / 3) / 100;
          return getThreatCoefficient({ [SCHOOL.HOLY]: (1 + (0.6 * amp)) / 1.6 });
        },
      },
      Fanaticism: {
        maxRank: 5,
        coeff: (buffs, rank = 0) => getThreatCoefficient((25780 in buffs) ? 1 : 1 - (0.06 * rank)),
      },
    },
    Priest: {
      "Silent Resolve": { maxRank: 5, coeff: (_, rank = 5) => getThreatCoefficient(1 - (0.04 * rank)) },
      "Shadow Affinity": { maxRank: 3, coeff: (_, rank = 3) => getThreatCoefficient({ [SCHOOL.SHADOW]: 1 - (Math.floor((rank * 25) / 3) / 100) }) },
    },
    Shaman: {
      "Healing Grace": {
        maxRank: 3,
        coeff: (_, rank = 3, spellId) => getThreatCoefficient(
          ({
            8004: true, 8008: true, 8010: true, 10466: true, 10467: true, 10468: true,
            331: true, 332: true, 547: true, 913: true, 939: true, 959: true, 8005: true, 10395: true, 10396: true,
            25357: true, 1064: true, 10622: true, 10623: true,
          }[spellId]) ? 1 - (0.05 * rank) : 1
        ),
      },
      "Spirit Weapons": { maxRank: 1, coeff: (_, rank = 1) => getThreatCoefficient({ [SCHOOL.PHYSICAL]: 1 - (0.3 * rank) }) },
      "Elemental Precision (fire)": { maxRank: 3, coeff: (_, rank = 3) => getThreatCoefficient({ [SCHOOL.FIRE]: 1 - (0.033333 * rank) }) },
      "Elemental Precision (nature)": { maxRank: 3, coeff: (_, rank = 3) => getThreatCoefficient({ [SCHOOL.NATURE]: 1 - (0.033333 * rank) }) },
      "Elemental Precision (frost)": { maxRank: 3, coeff: (_, rank = 3) => getThreatCoefficient({ [SCHOOL.FROST]: 1 - (0.033333 * rank) }) },
    },
    Warlock: {
      "Destructive Reach": { maxRank: 2, coeff: (_, rank = 2) => getThreatCoefficient(1 - (0.05 * rank)) },
    },
  },
  fixateBuffs: {
    40604: true,
  },
  notableBuffs: {
    71: true,
    2457: true,
    2458: true,
    5487: true,
    9634: true,
    768: true,
    25780: true,
    1038: true,
    25895: true,
    25909: true,
    2613: true,
    2621: true,
    40618: true,
    40604: true,
  },
  auraImplications: {
    Warrior: {
      7384: 2457, 7887: 2457, 11584: 2457, 11585: 2457, 100: 2457, 6178: 2457, 11578: 2457,
      694: 2457, 7400: 2457, 7402: 2457, 20559: 2457, 20560: 2457, 20230: 2457,
      20252: 2458, 20617: 2458, 20616: 2458, 1680: 2458, 18499: 2458, 1719: 2458, 6552: 2458, 6554: 2458,
      355: 71, 676: 71, 6572: 71, 6574: 71, 7379: 71, 11600: 71, 11601: 71, 25288: 71, 25269: 71, 30357: 71,
      2565: 71, 871: 71, 23922: 71, 23923: 71, 23924: 71, 23925: 71, 25258: 71, 30356: 71,
    },
    Druid: {},
    Paladin: {
      27179: 25780,
    },
  },
  combatantImplications: {
    All: (info, buffs) => {
      if (gearHasEnchant(info?.gear, 2613)) buffs[2613] = true;
      if (gearHasEnchant(info?.gear, 2621)) buffs[2621] = true;
    },
    Druid: (info, buffs, talents) => {
      if ((info?.talents?.[1]?.id ?? 0) < 8 && talents["Feral Instinct"]) talents["Feral Instinct"].rank = 0;
      if (gearSetCount(info?.gear, DRUID.TIER.T6) >= 2) buffs[DRUID.BUFF.T6_2PC] = true;
    },
    Warrior: (info, _buffs, talents) => {
      if ((info?.talents?.[1]?.id ?? 0) < 35 && talents["Improved Berserker Stance"]) talents["Improved Berserker Stance"].rank = 0;
      if ((info?.talents?.[2]?.id ?? 0) < 3 && talents["Tactical Mastery"]) talents["Tactical Mastery"].rank = 0;
      if ((info?.talents?.[2]?.id ?? 0) < 10 && talents.Defiance) talents.Defiance.rank = 0;
    },
    Paladin: (info, _buffs, talents) => {
      if ((info?.talents?.[1]?.id ?? 0) < 13 && talents["Improved Righteous Fury"]) talents["Improved Righteous Fury"].rank = 0;
      if ((info?.talents?.[2]?.id ?? 0) < 40 && talents.Fanaticism) talents.Fanaticism.rank = 0;
    },
    Shaman: (info, _buffs, talents) => {
      if ((info?.talents?.[0]?.id ?? 0) < 28) {
        if (talents["Elemental Precision (fire)"]) talents["Elemental Precision (fire)"].rank = 0;
        if (talents["Elemental Precision (nature)"]) talents["Elemental Precision (nature)"].rank = 0;
        if (talents["Elemental Precision (frost)"]) talents["Elemental Precision (frost)"].rank = 0;
      }
      if ((info?.talents?.[1]?.id ?? 0) < 21 && talents["Spirit Weapons"]) talents["Spirit Weapons"].rank = 0;
      if ((info?.talents?.[2]?.id ?? 0) < 13 && talents["Healing Grace"]) talents["Healing Grace"].rank = 0;
    },
  },
  spellFunctions: {},
};

function concatHandlers(...handlers) {
  return (event, fight) => {
    for (const handler of handlers) handler(event, fight);
  };
}

const threatFunctions = {
  sourceThreatenTarget({ event, fight, amount, useThreatCoefficients = true, multiplier = 1, debugLabel, bonusThreat = 0 }) {
    const source = fight.eventToUnit(event, "source");
    const target = fight.eventToUnit(event, "target");
    if (!source || !target || !target.isEnemy) return;
    const initialCoeff = useThreatCoefficients ? source.threatCoeff(event.ability) : BASE_COEFFICIENT;
    const abilityCoeff = applyThreatCoefficient(initialCoeff, multiplier, debugLabel || event?.ability?.name || "Ability", bonusThreat);
    target.addThreat(
      source.key,
      amount,
      event.timestamp,
      event?.ability?.name || "Ability",
      abilityCoeff,
      bonusThreat * initialCoeff.value,
    );
  },
  unitThreatenEnemiesSplit({ event, unit, fight, amount, useThreatCoefficients = true, multiplier = 1, debugLabel }) {
    const actor = fight.eventToUnit(event, unit);
    if (!actor) return;
    const enemies = Object.values(fight.enemies).filter(enemy => enemy.alive);
    if (!enemies.length) return;
    let coeff = applyThreatCoefficient(
      useThreatCoefficients ? actor.threatCoeff(event.ability) : BASE_COEFFICIENT,
      multiplier,
      debugLabel || event?.ability?.name || "Ability",
    );
    if (enemies.length !== 1) {
      coeff = applyThreatCoefficient(coeff, 1 / enemies.length, `split between ${enemies.length} enemies`);
    }
    for (const enemy of enemies) {
      enemy.addThreat(actor.key, amount, event.timestamp, event?.ability?.name || "Ability", coeff);
    }
  },
  unitThreatenEnemies({ event, unit, fight, amount, useThreatCoefficients = true, multiplier = 1, debugLabel }) {
    const actor = fight.eventToUnit(event, unit);
    if (!actor) return;
    const enemies = Object.values(fight.enemies).filter(enemy => enemy.alive);
    const coeff = applyThreatCoefficient(
      useThreatCoefficients ? actor.threatCoeff(event.ability) : BASE_COEFFICIENT,
      multiplier,
      debugLabel || event?.ability?.name || "Ability",
    );
    for (const enemy of enemies) {
      enemy.addThreat(actor.key, amount, event.timestamp, event?.ability?.name || "Ability", coeff);
    }
  },
  unitLeaveCombat(event, unit, fight, text) {
    const actor = fight.eventToUnit(event, unit);
    if (!actor) return;
    for (const enemy of Object.values(fight.enemies)) {
      if (enemy.threat[actor.key]) {
        enemy.setThreat(actor.key, 0, event.timestamp, text);
      }
    }
  },
};

function handlerZero() {}

function handlerDamage(event, fight) {
  if (event.type !== "damage") return;
  threatFunctions.sourceThreatenTarget({
    event,
    fight,
    amount: numeric(event.amount || 0) + numeric(event.absorbed || 0),
  });
}

function handlerModDamage(multiplier, label = "") {
  return (event, fight) => {
    if (event.type !== "damage") return;
    threatFunctions.sourceThreatenTarget({
      event,
      fight,
      amount: numeric(event.amount || 0) + numeric(event.absorbed || 0),
      multiplier,
      debugLabel: label || event?.ability?.name || "Ability",
    });
  };
}

function handlerModDamagePlusThreat(multiplier, bonusThreat, label = "") {
  return (event, fight) => {
    if (event.type !== "damage" || (event.hitType > 6 && event.hitType !== 10 && event.hitType !== 14) || event.hitType === 0) return;
    threatFunctions.sourceThreatenTarget({
      event,
      fight,
      amount: numeric(event.amount || 0) + numeric(event.absorbed || 0),
      multiplier,
      debugLabel: label || event?.ability?.name || "Ability",
      bonusThreat,
    });
  };
}

function handlerThreatOnHit(bonusThreat, label = "") {
  return (event, fight) => {
    if (event.type !== "damage" || (event.hitType > 6 && event.hitType !== 10 && event.hitType !== 14) || event.hitType === 0) return;
    threatFunctions.sourceThreatenTarget({
      event,
      fight,
      amount: numeric(event.amount || 0) + numeric(event.absorbed || 0),
      bonusThreat,
      debugLabel: label || event?.ability?.name || "Ability",
    });
  };
}

function handlerThreatOnDebuff(threatAmount, label = "") {
  return (event, fight) => {
    if (!["applydebuff", "refreshdebuff", "applydebuffstack"].includes(event.type)) return;
    threatFunctions.sourceThreatenTarget({
      event,
      fight,
      amount: threatAmount,
      debugLabel: label || event?.ability?.name || "Ability",
    });
  };
}

function handlerThreatOnBuffUnsplit(threatAmount, useThreatCoefficients = true, label = "") {
  return (event, fight) => {
    if (!["applybuff", "refreshbuff"].includes(event.type)) return;
    threatFunctions.unitThreatenEnemies({
      event,
      unit: "source",
      fight,
      amount: threatAmount,
      useThreatCoefficients,
      debugLabel: label || event?.ability?.name || "Ability",
    });
  };
}

function handlerResourceChange(event, fight) {
  if (event.type !== "resourcechange") return;
  const diff = numeric(event.resourceChange || 0) - numeric(event.waste || 0);
  if (!diff) return;
  threatFunctions.unitThreatenEnemiesSplit({
    event,
    unit: "source",
    fight,
    amount: diff,
    useThreatCoefficients: false,
    multiplier: Number(event.resourceChangeType) === 0 ? 0.5 : 5,
    debugLabel: event?.ability?.name || "Resource",
  });
}

function handlerBossDropThreatOnHit(percent) {
  return (event, fight) => {
    if (event.type !== "damage" || (event.hitType > 6 && event.hitType !== 10 && event.hitType !== 14) || event.hitType === 0) return;
    const enemy = fight.eventToUnit(event, "source");
    const player = fight.eventToUnit(event, "target");
    if (!enemy?.isEnemy || !player) return;
    const trace = enemy.threat[player.key];
    if (!trace) return;
    enemy.setThreat(player.key, trace.currentThreat * percent, event.timestamp, event?.ability?.name || "Threat drop");
  };
}

function handlerBossThreatWipeOnCast(event, fight) {
  if (event.type !== "cast") return;
  const enemy = fight.eventToUnit(event, "source");
  if (!enemy?.isEnemy) return;
  for (const playerKey of Object.keys(enemy.threat || {})) {
    enemy.setThreat(playerKey, 0, event.timestamp, event?.ability?.name || "Threat wipe");
  }
}

function handlerPartialThreatWipeOnCast(percent) {
  return (event, fight) => {
    if (event.type !== "cast") return;
    const actor = fight.eventToUnit(event, "source");
    if (!actor || actor.isEnemy) return;
    for (const enemy of Object.values(fight.enemies)) {
      const trace = enemy.threat[actor.key];
      if (!trace) continue;
      enemy.setThreat(actor.key, trace.currentThreat * percent, event.timestamp, event?.ability?.name || "Partial wipe");
    }
  };
}

function handlerVanish(event, fight) {
  if (event.type !== "cast") return;
  threatFunctions.unitLeaveCombat(event, "source", fight, event?.ability?.name || "Vanish");
}

function handlerSunderArmor(threatAmount, label = "") {
  return (event, fight) => {
    if (event.type !== "cast") return;
    threatFunctions.sourceThreatenTarget({
      event,
      fight,
      amount: threatAmount,
      debugLabel: label || event?.ability?.name || "Sunder Armor",
    });
  };
}

function buildTbcSpellFunctions() {
  return {
    [GLOBAL_SPELL_HANDLER_ID]: handlerZero,
    29858: handlerPartialThreatWipeOnCast(0.5),
    26889: handlerVanish,
    66: handlerZero,
    25778: handlerBossDropThreatOnHit(0.75),
    31389: handlerBossDropThreatOnHit(0.75),
    37102: handlerBossDropThreatOnHit(0.75),
    40486: handlerBossDropThreatOnHit(0.75),
    40597: handlerBossDropThreatOnHit(0.75),
    10101: handlerBossDropThreatOnHit(0.5),
    18813: handlerBossDropThreatOnHit(0.5),
    18945: handlerBossDropThreatOnHit(0.5),
    20686: handlerBossDropThreatOnHit(0.5),
    23382: handlerBossDropThreatOnHit(0.5),
    30121: handlerBossDropThreatOnHit(0.5),
    32077: handlerBossDropThreatOnHit(0.5),
    32959: handlerBossDropThreatOnHit(0.5),
    37597: handlerBossDropThreatOnHit(0.5),
    30013: handlerBossThreatWipeOnCast,
    33237: handlerBossThreatWipeOnCast,
    41476: handlerBossThreatWipeOnCast,
    39635: handlerBossThreatWipeOnCast,
    40647: handlerBossThreatWipeOnCast,
    27155: concatHandlers(handlerThreatOnBuffUnsplit(58, true, "Seal of Righteousness"), handlerDamage),
    20925: handlerModDamage(1.35, "Holy Shield"),
    20927: handlerModDamage(1.35, "Holy Shield"),
    20928: handlerModDamage(1.35, "Holy Shield"),
    27179: handlerModDamage(1.35, "Holy Shield"),
    31935: handlerModDamage(1.3, "Avenger's Shield"),
    32699: handlerModDamage(1.3, "Avenger's Shield"),
    32700: handlerModDamage(1.3, "Avenger's Shield"),
    31786: handlerResourceChange,
    8042: handlerModDamage(1, "Earth Shock"),
    8044: handlerModDamage(1, "Earth Shock"),
    8045: handlerModDamage(1, "Earth Shock"),
    8046: handlerModDamage(1, "Earth Shock"),
    10412: handlerModDamage(1, "Earth Shock"),
    10413: handlerModDamage(1, "Earth Shock"),
    10414: handlerModDamage(1, "Earth Shock"),
    25454: handlerModDamage(1, "Earth Shock"),
    8056: handlerModDamage(2, "Frost Shock"),
    8058: handlerModDamage(2, "Frost Shock"),
    10472: handlerModDamage(2, "Frost Shock"),
    10473: handlerModDamage(2, "Frost Shock"),
    25464: handlerModDamage(2, "Frost Shock"),
    25286: handlerThreatOnHit(173, "Heroic Strike"),
    29707: handlerThreatOnHit(194, "Heroic Strike"),
    30324: handlerThreatOnHit(220, "Heroic Strike"),
    23925: handlerThreatOnHit(254, "Shield Slam"),
    25258: handlerThreatOnHit(278, "Shield Slam"),
    30356: handlerThreatOnHit(305, "Shield Slam"),
    20243: handlerModDamagePlusThreat(1, 100, "Devastate"),
    30016: handlerModDamagePlusThreat(1, 100, "Devastate"),
    30022: handlerModDamagePlusThreat(1, 100, "Devastate"),
    1672: handlerModDamagePlusThreat(1.5, 156, "Shield Bash"),
    29704: handlerModDamagePlusThreat(1.5, 192, "Shield Bash"),
    11601: handlerThreatOnHit(150, "Revenge"),
    25288: handlerThreatOnHit(175, "Revenge"),
    25269: handlerThreatOnHit(185, "Revenge"),
    30357: handlerThreatOnHit(200, "Revenge"),
    12798: handlerThreatOnHit(20, "Revenge Stun"),
    25231: handlerThreatOnHit(125, "Cleave"),
    6343: handlerModDamage(1.75, "Thunder Clap"),
    8198: handlerModDamage(1.75, "Thunder Clap"),
    8204: handlerModDamage(1.75, "Thunder Clap"),
    8205: handlerModDamage(1.75, "Thunder Clap"),
    11580: handlerModDamage(1.75, "Thunder Clap"),
    11581: handlerModDamage(1.75, "Thunder Clap"),
    25236: handlerModDamage(1.25, "Execute"),
    7386: handlerSunderArmor(45, "Sunder Armor"),
    11597: handlerSunderArmor(261, "Sunder Armor"),
    25225: handlerSunderArmor(301.5, "Sunder Armor"),
    11551: handlerThreatOnBuffUnsplit(52, true, "Battle Shout"),
    25289: handlerThreatOnBuffUnsplit(60, true, "Battle Shout"),
    2048: handlerThreatOnBuffUnsplit(69, true, "Battle Shout"),
    11556: handlerThreatOnDebuff(43, "Demoralizing Shout"),
    25203: handlerThreatOnDebuff(56, "Demoralizing Shout"),
    469: handlerThreatOnBuffUnsplit(69, true, "Commanding Shout"),
    6807: handlerThreatOnHit((322 / 67) * 10, "Maul"),
    6808: handlerThreatOnHit((322 / 67) * 18, "Maul"),
    6809: handlerThreatOnHit((322 / 67) * 26, "Maul"),
    8972: handlerThreatOnHit((322 / 67) * 34, "Maul"),
    9745: handlerThreatOnHit((322 / 67) * 42, "Maul"),
    9880: handlerThreatOnHit((322 / 67) * 50, "Maul"),
    9881: handlerThreatOnHit((322 / 67) * 58, "Maul"),
    26996: handlerThreatOnHit(322, "Maul"),
    779: handlerModDamage(1, "Swipe"),
    780: handlerModDamage(1, "Swipe"),
    769: handlerModDamage(1, "Swipe"),
    9754: handlerModDamage(1, "Swipe"),
    9908: handlerModDamage(1, "Swipe"),
    26997: handlerModDamage(1, "Swipe"),
    33745: handlerModDamagePlusThreat(0.5, 267, "Lacerate"),
    33878: handlerModDamage(1.3043478261, "Mangle"),
    33986: handlerModDamage(1.3043478261, "Mangle"),
    33987: handlerModDamage(1.3043478261, "Mangle"),
    9898: handlerThreatOnDebuff(39, "Demoralizing Roar"),
    26998: handlerThreatOnDebuff(39, "Demoralizing Roar"),
    31709: handlerThreatOnHit(-800, "Cower"),
    27004: handlerThreatOnHit(-1170, "Cower"),
    379: handlerThreatOnDebuff(0, "Earth Shield"),
    33110: handlerThreatOnDebuff(0, "Prayer of Mending"),
    17392: handlerThreatOnDebuff(108, "Faerie Fire"),
    27011: handlerThreatOnDebuff(131, "Faerie Fire"),
    9907: handlerThreatOnDebuff(108, "Faerie Fire"),
    26993: handlerThreatOnDebuff(131, "Faerie Fire"),
    30486: handlerDamage,
    39965: handlerDamage,
    30217: handlerDamage,
    30461: handlerDamage,
    19821: handlerDamage,
    30216: handlerDamage,
    46567: handlerDamage,
    11351: handlerDamage,
  };
}

THREAT_CONFIG.spellFunctions = buildTbcSpellFunctions();

class ThreatTrace {
  constructor(targetUnit, startTime) {
    this.target = targetUnit;
    this.time = [startTime];
    this.threat = [0];
    this.text = ["Joined fight"];
    this.coeff = [targetUnit.threatCoeff()];
    this.currentThreat = 0;
  }

  setThreat(threat, timestamp, label, coeff = null) {
    this.currentThreat = clampThreat(threat);
    this.time.push(numeric(timestamp, 0));
    this.threat.push(this.currentThreat);
    this.text.push(String(label || ""));
    this.coeff.push(coeff);
  }

  addThreat(amount, timestamp, label, coeff, bonusThreat = 0) {
    if (!amount && !bonusThreat) return;
    this.setThreat(this.currentThreat + (numeric(amount, 0) * numeric(coeff?.value, 1)) + numeric(bonusThreat, 0), timestamp, label, coeff);
  }

  threatBySkill(fightStartMs) {
    const totals = {};
    let previousThreat = 0;
    for (let index = 0; index < this.threat.length; index += 1) {
      const delta = numeric(this.threat[index], 0) - previousThreat;
      previousThreat = numeric(this.threat[index], 0);
      if (!delta) continue;
      const label = this.text[index] || "Unknown";
      totals[label] = numeric(totals[label], 0) + delta;
    }

    return Object.entries(totals).map(([label, threat]) => ({
      label,
      threat,
      tps: threat / Math.max(1, (numeric(this.time[this.time.length - 1], fightStartMs) - numeric(fightStartMs, 0)) / 1000),
    })).sort((left, right) => right.threat - left.threat);
  }

  toSeries(fightStartMs) {
    return this.time.map((timestamp, index) => ({
      timeMs: Math.max(0, numeric(timestamp, 0) - numeric(fightStartMs, 0)),
      threat: numeric(this.threat[index], 0),
      label: this.text[index] || "",
    }));
  }
}

class Unit {
  constructor(config, key, info, events, fight) {
    this.config = config;
    this.key = key;
    this.info = info || {};
    this.name = info?.name || "Unknown";
    this.type = info?.type || "NPC";
    this.fight = fight;
    this.buffs = {};
    this.alive = true;
    this.spellSchool = config.preferredSpellSchools[this.type] || SCHOOL.PHYSICAL;
    this.baseThreatCoeff = config.baseThreatCoefficients[this.type] || getThreatCoefficient(1);
    this.initialCoeff = 1;
    this.talents = cloneTalentConfig(config.talents[this.type] || {});
    this.isEnemy = false;

    for (const event of events || []) {
      if (event.type === "combatantinfo" && Number(event.sourceID) === Number(info?.id)) {
        for (const aura of event.auras || []) {
          if (aura?.ability != null) {
            this.buffs[String(aura.ability)] = true;
          }
        }
        config.combatantImplications.All?.(event, this.buffs, this.talents);
        config.combatantImplications[this.type]?.(event, this.buffs, this.talents);
      }
    }

    this.initialCoeff = this.threatCoeff().value;
  }

  threatCoeff(ability = null) {
    const spellSchool = ability?.type ?? this.spellSchool;
    const spellId = ability?.guid ?? null;
    let coefficient = applyThreatCoefficient(BASE_COEFFICIENT, this.baseThreatCoeff(spellSchool), `${this.type} (base)`);

    for (const buffId of Object.keys(this.buffs)) {
      const multiplier = this.config.buffMultipliers[buffId];
      if (!multiplier) continue;
      const nextValue = typeof multiplier === "function" ? multiplier(spellSchool, spellId) : multiplier;
      coefficient = applyThreatCoefficient(coefficient, nextValue, this.config.buffNames[buffId] || `Buff ${buffId}`);
    }

    for (const [talentName, talent] of Object.entries(this.talents || {})) {
      if (!talent?.coeff) continue;
      const nextCoefficient = talent.coeff(this.buffs, talent.rank, spellId);
      coefficient = applyThreatCoefficient(coefficient, nextCoefficient(spellSchool), `${talentName} (talent)`);
    }

    return coefficient;
  }
}

class PlayerUnit extends Unit {
  constructor(config, key, info, events, fight) {
    super(config, key, info, events, fight);
    this.global = info;
    this.isEnemy = false;
    if (this.type === "Warrior" && !(71 in this.buffs) && !(2457 in this.buffs) && !(2458 in this.buffs)) {
      this.buffs[71] = true;
      this.initialCoeff = this.threatCoeff().value;
    }
  }
}

class EnemyUnit extends Unit {
  constructor(config, key, info, events, fight) {
    super(config, key, info, events, fight);
    this.isEnemy = true;
    this.threat = {};
    this.target = null;
    this.targetHistory = [];
  }

  getTrace(playerKey, timestamp) {
    if (!this.threat[playerKey]) {
      const targetUnit = this.fight.units[playerKey];
      if (!targetUnit) return null;
      this.threat[playerKey] = new ThreatTrace(targetUnit, timestamp);
    }
    return this.threat[playerKey];
  }

  setThreat(playerKey, threat, timestamp, label, coeff = null) {
    const trace = this.getTrace(playerKey, timestamp);
    if (!trace) return;
    trace.setThreat(threat, timestamp, label, coeff);
  }

  addThreat(playerKey, amount, timestamp, label, coeff, bonusThreat = 0) {
    const trace = this.getTrace(playerKey, timestamp);
    if (!trace) return;
    trace.addThreat(amount, timestamp, label, coeff, bonusThreat);
  }

  setCurrentTarget(targetUnit, timestamp, reason = "") {
    if (!targetUnit || targetUnit.isEnemy) return;
    this.target = targetUnit;
    const lastEntry = this.targetHistory[this.targetHistory.length - 1];
    if (lastEntry && String(lastEntry.playerKey) === String(targetUnit.key)) return;
    this.targetHistory.push({
      playerKey: targetUnit.key,
      playerId: String(targetUnit.global?.id || targetUnit.key),
      name: targetUnit.name || "Unknown Player",
      timeMs: Math.max(0, numeric(timestamp, 0) - numeric(this.fight.start, 0)),
      reason: String(reason || "").trim(),
    });
  }
}

class FightState {
  constructor(config, fightMeta, globalUnits, report) {
    this.config = config;
    this.fightMeta = fightMeta;
    this.report = report;
    this.start = numeric(fightMeta?.start_time ?? fightMeta?.start, 0);
    this.end = numeric(fightMeta?.end_time ?? fightMeta?.end, 0);
    this.id = String(fightMeta?.id || "");
    this.name = fightMeta?.name || "Unknown Fight";
    this.globalUnits = globalUnits;
    this.units = {};
    this.friendlies = {};
    this.enemies = {};
    this.events = [];
  }

  eventToUnit(event, prefix, createIfMissing = true) {
    const key = eventKey(event, prefix);
    if (!key) return null;
    if (this.units[key]) return this.units[key];
    if (!createIfMissing) return null;

    const id = String(key).split(".")[0];
    const info = this.globalUnits[id];
    if (!info) return null;
    const friendly = prefix === "source"
      ? Boolean(event?.sourceIsFriendly ?? event?.type === "combatantinfo")
      : Boolean(event?.targetIsFriendly);

    const unit = friendly
      ? new PlayerUnit(this.config, key, info, this.events, this)
      : new EnemyUnit(this.config, key, info, this.events, this);

    this.units[key] = unit;
    if (unit.isEnemy) {
      this.enemies[key] = unit;
    } else {
      this.friendlies[key] = unit;
    }
    return unit;
  }

  processEvent(event) {
    if (event?.type === "death") {
      const target = this.eventToUnit(event, "target");
      if (target) target.alive = false;
    }

    if (["applybuff", "refreshbuff", "applydebuff", "refreshdebuff"].includes(event?.type)) {
      const target = this.eventToUnit(event, "target");
      const abilityGuid = String(event?.ability?.guid || "");
      if (target && this.config.notableBuffs[abilityGuid]) {
        target.buffs[abilityGuid] = true;
      }
    }

    if (["removebuff", "removedebuff"].includes(event?.type)) {
      const target = this.eventToUnit(event, "target");
      const abilityGuid = String(event?.ability?.guid || "");
      if (target && this.config.notableBuffs[abilityGuid]) {
        delete target.buffs[abilityGuid];
      }
    }

    const source = this.eventToUnit(event, "source", false);
    const target = this.eventToUnit(event, "target", false);
    if (source && source.isEnemy && target && !target.isEnemy && isPrimaryTargetAction(event)) {
      source.setCurrentTarget(target, event?.timestamp, event?.ability?.name || event?.type || "");
    }

    const globalHandler = this.config.spellFunctions[GLOBAL_SPELL_HANDLER_ID];
    if (globalHandler) globalHandler(event, this);

    const specificHandler = this.config.spellFunctions[event?.ability?.guid];
    if (specificHandler) {
      specificHandler(event, this);
      return;
    }

    if (event?.type === "damage") {
      handlerDamage(event, this);
      return;
    }

    if (event?.type === "heal") {
      threatFunctions.unitThreatenEnemiesSplit({
        event,
        unit: "source",
        fight: this,
        amount: numeric(event.amount || 0),
        multiplier: 0.5,
        debugLabel: event?.ability?.name || "Heal",
      });
      return;
    }

    if (event?.type === "resourcechange") {
      handlerResourceChange(event, this);
      return;
    }

    if (["applybuff", "refreshbuff"].includes(event?.type) && event?.sourceIsFriendly === event?.targetIsFriendly) {
      threatFunctions.unitThreatenEnemiesSplit({
        event,
        unit: "source",
        fight: this,
        amount: 60,
      });
      return;
    }

    if (["applydebuff", "applydebuffstack", "refreshdebuff"].includes(event?.type) && event?.sourceIsFriendly !== event?.targetIsFriendly) {
      threatFunctions.sourceThreatenTarget({
        event,
        fight: this,
        amount: 120,
      });
    }
  }

  process(events) {
    this.events = events || [];
    for (const event of this.events) {
      this.eventToUnit(event, "source", event?.type === "combatantinfo" || event?.sourceID != null);
      this.eventToUnit(event, "target", event?.targetID != null);
    }

    for (const event of this.events) {
      this.processEvent(event);
    }
  }
}

function buildGlobalUnitMap(fightsData = {}) {
  const map = {};
  for (const unit of [
    ...(fightsData?.friendlies || []),
    ...(fightsData?.friendlyPets || []),
    ...(fightsData?.enemies || []),
    ...(fightsData?.enemyPets || []),
  ]) {
    if (unit?.id == null) continue;
    map[String(unit.id)] = unit;
  }
  return map;
}

function buildFightEnemySnapshot(enemy, fight) {
  const players = Object.entries(enemy.threat || {}).map(([playerKey, trace]) => {
    const target = trace.target;
    const series = compactThreatSeries(trace.toSeries(fight.start));
    const highestThreat = Math.max(...series.map(point => numeric(point.threat, 0)), 0);
    return {
      playerId: String(target?.global?.id || playerKey),
      playerKey,
      name: target?.name || "Unknown Player",
      type: target?.type || "",
      color: PLAYER_CLASS_COLORS[target?.type] || "#71d5ff",
      series,
      highestThreat,
      modifiers: buildModifierRows(target, THREAT_CONFIG),
    };
  }).sort((left, right) => right.highestThreat - left.highestThreat || sortName(left.name, right.name));

  return {
    enemyKey: enemy.key,
    enemyId: String(enemy.info?.id || enemy.key),
    name: enemy.name,
    type: enemy.type,
    targetHistory: enemy.targetHistory || [],
    players,
    maxThreat: Math.max(...players.map(player => numeric(player.highestThreat, 0)), 0),
  };
}

export function computeThreatSnapshots({ fightsData = {}, fights = [], fightEventsById = {} }) {
  const globalUnits = buildGlobalUnitMap(fightsData);
  const snapshots = [];

  for (const fight of fights || []) {
    const fightId = String(fight?.id || "");
    const events = (fightEventsById?.[fightId] || []).filter(Boolean);
    if (!fightId || !events.length) {
      snapshots.push({
        fightId,
        encounterId: numeric(fight?.boss || fight?.encounterId, 0),
        fightName: fight?.name || fight?.fightName || "Unknown Fight",
        start: numeric(fight?.start_time ?? fight?.start, 0),
        end: numeric(fight?.end_time ?? fight?.end, 0),
        enemies: [],
      });
      continue;
    }

    const fightState = new FightState(THREAT_CONFIG, fight, globalUnits, fightsData);
    fightState.process(events);
    const enemies = Object.values(fightState.enemies)
      .map(enemy => buildFightEnemySnapshot(enemy, fightState))
      .filter(enemy => enemy.players.length > 0)
      .sort((left, right) => right.maxThreat - left.maxThreat || sortName(left.name, right.name));

    snapshots.push({
      fightId,
      encounterId: numeric(fight?.boss || fight?.encounterId, 0),
      fightName: fight?.name || fight?.fightName || "Unknown Fight",
      start: numeric(fight?.start_time ?? fight?.start, 0),
      end: numeric(fight?.end_time ?? fight?.end, 0),
      enemies,
    });
  }

  return {
    available: true,
    snapshots,
  };
}

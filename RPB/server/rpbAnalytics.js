const ENCHANTABLE_SLOTS = new Map([
  [0, "Head"],
  [2, "Shoulder"],
  [4, "Chest"],
  [6, "Legs"],
  [7, "Feet"],
  [8, "Wrists"],
  [9, "Hands"],
  [14, "Back"],
  [15, "Main Hand"],
  [16, "Off Hand"],
]);

const ALLOWED_UNCOMMON_GEM_IDS = new Set([
  "38549", "32836", "28118", "27679", "30571", "27812", "30598", "27777",
  "28362", "28361", "28363", "28123", "28119", "28120", "28360", "38545",
  "38550", "27785", "27809", "38546", "27820", "38548", "27786", "38547",
]);

const IGNORED_TEMP_ENCHANT_IDS = new Set([
  "4264", "263", "264", "265", "266", "283", "284", "525", "563", "564",
  "1669", "1783", "2636", "2638", "2639",
]);

const BAD_TEMP_ENCHANT_CLASS_RULES = new Map([
  ["2684", new Set(["Druid", "Hunter", "Rogue", "Warrior", "Shaman", "Paladin"])],
  ["2685", new Set(["Druid", "Mage", "Priest", "Warlock", "Shaman", "Paladin"])],
  ["2677", new Set(["Hunter", "Priest"])],
  ["2678", new Set(["Paladin", "Druid", "Priest"])],
  ["2712", new Set(["Hunter"])],
]);

const ALWAYS_BAD_TEMP_ENCHANT_IDS = new Set([
  "2627", "2625", "2626", "2624", "2623", "1643", "2954", "13", "40",
  "20", "1703", "14", "19", "483", "484",
]);

function getGearList(entry) {
  if (Array.isArray(entry?.gear)) return entry.gear;
  if (Array.isArray(entry?.combatantInfo?.gear)) return entry.combatantInfo.gear;
  return [];
}

function getPermanentEnchantId(item) {
  return item?.permanentEnchant
    ?? item?.permanentEnchantId
    ?? item?.enchant
    ?? item?.enchantId
    ?? null;
}

function getTemporaryEnchantName(item) {
  return item?.temporaryEnchantName || item?.temporaryenchant || item?.tempEnchantName || "";
}

function normalizeGearItem(item) {
  return {
    id: item?.id ?? null,
    name: item?.name || "Unknown Item",
    slot: item?.slot ?? null,
    itemLevel: item?.itemLevel ?? null,
    permanentEnchantId: getPermanentEnchantId(item),
    temporaryEnchantName: getTemporaryEnchantName(item),
    temporaryEnchantId: item?.temporaryEnchant ?? item?.temporaryEnchantId ?? null,
    gems: (item?.gems || []).map(gem => ({
      id: gem?.id ?? null,
      itemLevel: gem?.itemLevel ?? null,
    })),
  };
}

function deriveGemIssues(gear) {
  const commonQualityGems = [];
  const uncommonQualityGems = [];

  for (const item of gear) {
    for (const gem of item.gems || []) {
      const gemRecord = {
        itemId: item.id,
        itemName: item.name,
        gemId: gem.id,
        gemItemLevel: gem.itemLevel,
      };
      const gemId = gem.id != null ? String(gem.id) : "";

      if (gem.itemLevel != null && gem.itemLevel < 60) {
        commonQualityGems.push(gemRecord);
      } else if (gem.itemLevel === 60 && !ALLOWED_UNCOMMON_GEM_IDS.has(gemId)) {
        uncommonQualityGems.push(gemRecord);
      }
    }
  }

  return {
    commonQualityGems,
    uncommonQualityGems,
    rareQualityGems: [],
    lowQualityGems: [...commonQualityGems, ...uncommonQualityGems],
    commonQualityGemCount: commonQualityGems.length,
    uncommonQualityGemCount: uncommonQualityGems.length,
    rareQualityGemCount: 0,
    lowQualityGemCount: commonQualityGems.length + uncommonQualityGems.length,
  };
}

function buildLookup(items = []) {
  const byId = new Map();
  const byName = new Map();

  for (const item of items) {
    if (item?.id != null) byId.set(String(item.id), item);
    if (item?.name) byName.set(item.name, item);
  }

  return { byId, byName };
}

function getEntryForPlayer(lookup, player) {
  return lookup.byId.get(String(player.id)) || lookup.byName.get(player.name) || null;
}

function getTotalValue(entry) {
  if (!entry) return 0;
  if (typeof entry.total === "number") return entry.total;
  if (typeof entry.totalDamage === "number") return entry.totalDamage;
  return 0;
}

function getSummaryPlayerEntry(summaryData, player) {
  const roles = [
    ...(summaryData?.playerDetails?.tanks || []),
    ...(summaryData?.playerDetails?.healers || []),
    ...(summaryData?.playerDetails?.dps || []),
  ];

  return roles.find(entry =>
    String(entry?.id) === String(player.id) || entry?.name === player.name
  ) || null;
}

function getRaiderSummaryPlayerEntry(raiderData, player) {
  for (const snapshot of raiderData?.summaries || []) {
    const found = getSummaryPlayerEntry(snapshot?.summary, player);
    if (found) return found;
  }
  return null;
}

function deriveMissingEnchants(gear) {
  const missingPermanent = [];
  const missingTemporary = [];

  for (const item of gear) {
    if (!ENCHANTABLE_SLOTS.has(item.slot)) continue;

    if (!item.permanentEnchantId) {
      missingPermanent.push({
        slot: item.slot,
        slotLabel: ENCHANTABLE_SLOTS.get(item.slot),
        itemId: item.id,
        itemName: item.name,
      });
    }

    if ((item.slot === 15 || item.slot === 16) && !item.temporaryEnchantName) {
      missingTemporary.push({
        slot: item.slot,
        slotLabel: ENCHANTABLE_SLOTS.get(item.slot),
        itemId: item.id,
        itemName: item.name,
      });
    }
  }

  return {
    missingPermanent,
    missingTemporary,
    missingPermanentCount: missingPermanent.length,
    missingTemporaryCount: missingTemporary.length,
  };
}

function isSuboptimalTemporaryEnchant(item, playerType) {
  const enchantId = item?.temporaryEnchantId != null ? String(item.temporaryEnchantId) : "";
  if (!enchantId || IGNORED_TEMP_ENCHANT_IDS.has(enchantId)) return false;
  if (ALWAYS_BAD_TEMP_ENCHANT_IDS.has(enchantId)) return true;

  const allowedClasses = BAD_TEMP_ENCHANT_CLASS_RULES.get(enchantId);
  if (!allowedClasses) return false;
  return !allowedClasses.has(playerType);
}

function deriveTemporaryEnchantIssues(gear, playerType) {
  const activeTemporaryEnchants = [];
  const suboptimalTemporaryEnchants = [];

  for (const item of gear) {
    if (item.slot !== 15 && item.slot !== 16) continue;
    if (!item.temporaryEnchantName) continue;

    const enchant = {
      slot: item.slot,
      slotLabel: ENCHANTABLE_SLOTS.get(item.slot),
      itemId: item.id,
      itemName: item.name,
      enchantId: item.temporaryEnchantId != null ? String(item.temporaryEnchantId) : "",
      enchantName: item.temporaryEnchantName,
    };

    activeTemporaryEnchants.push(enchant);
    if (isSuboptimalTemporaryEnchant(item, playerType)) {
      suboptimalTemporaryEnchants.push(enchant);
    }
  }

  return {
    activeTemporaryEnchants,
    suboptimalTemporaryEnchants,
    suboptimalTemporaryEnchantCount: suboptimalTemporaryEnchants.length,
  };
}

export function deriveRpbAnalytics(players, datasets) {
  const fullCastsLookup = buildLookup(datasets.fullCasts?.entries || []);
  const engineeringLookup = buildLookup(datasets.engineering?.entries || []);
  const oilLookup = buildLookup(datasets.oil?.entries || []);
  const buffsLookup = buildLookup(datasets.buffs?.entries || []);
  const drumsLookup = buildLookup(datasets.drums?.entries || []);

  const playerAnalytics = players.map(player => {
    const fullCastsEntry = getEntryForPlayer(fullCastsLookup, player);
    const summaryPlayerEntry = getSummaryPlayerEntry(datasets.summary, player);
    const raiderSummaryEntry = getRaiderSummaryPlayerEntry(datasets.raiderData, player);
    const gearSource = getGearList(fullCastsEntry).length > 0
      ? fullCastsEntry
      : (getGearList(raiderSummaryEntry).length > 0 ? raiderSummaryEntry : summaryPlayerEntry);
    const gear = getGearList(gearSource).map(normalizeGearItem);
    const missingEnchants = deriveMissingEnchants(gear);
    const gemIssues = deriveGemIssues(gear);
    const temporaryEnchantIssues = deriveTemporaryEnchantIssues(gear, player.type);
    const buffAuras = (getEntryForPlayer(buffsLookup, player)?.auras || []).map(aura => ({
      guid: aura?.guid ?? null,
      name: aura?.name || "Unknown Aura",
      totalUses: aura?.totalUses ?? 0,
      totalUptime: aura?.totalUptime ?? 0,
    }));

    return {
      playerId: String(player.id),
      hasGearData: gear.length > 0,
      gear,
      gearIssueSummary: {
        missingPermanentEnchantCount: missingEnchants.missingPermanentCount,
        missingTemporaryEnchantCount: missingEnchants.missingTemporaryCount,
        suboptimalTemporaryEnchantCount: temporaryEnchantIssues.suboptimalTemporaryEnchantCount,
        commonQualityGemCount: gemIssues.commonQualityGemCount,
        uncommonQualityGemCount: gemIssues.uncommonQualityGemCount,
        rareQualityGemCount: gemIssues.rareQualityGemCount,
        lowQualityGemCount: gemIssues.lowQualityGemCount,
      },
      missingEnchants,
      gemIssues,
      temporaryEnchantIssues,
      engineeringDamageTaken: getTotalValue(getEntryForPlayer(engineeringLookup, player)),
      oilOfImmolationDamageTaken: getTotalValue(getEntryForPlayer(oilLookup, player)),
      buffAuraCount: buffAuras.length,
      buffAuras,
      drumsCastCount: getTotalValue(getEntryForPlayer(drumsLookup, player)),
    };
  });

  return {
    playerAnalytics,
    overview: {
      playersMissingEnchants: playerAnalytics
        .filter(player =>
          player.gearIssueSummary.missingPermanentEnchantCount > 0 ||
          player.gearIssueSummary.missingTemporaryEnchantCount > 0 ||
          player.gearIssueSummary.suboptimalTemporaryEnchantCount > 0 ||
          player.gearIssueSummary.lowQualityGemCount > 0
        )
        .sort((a, b) =>
          (b.gearIssueSummary.missingPermanentEnchantCount +
            b.gearIssueSummary.missingTemporaryEnchantCount +
            b.gearIssueSummary.suboptimalTemporaryEnchantCount +
            b.gearIssueSummary.lowQualityGemCount) -
          (a.gearIssueSummary.missingPermanentEnchantCount +
            a.gearIssueSummary.missingTemporaryEnchantCount +
            a.gearIssueSummary.suboptimalTemporaryEnchantCount +
            a.gearIssueSummary.lowQualityGemCount)
        ),
      engineeringDamageTaken: playerAnalytics
        .filter(player => player.engineeringDamageTaken > 0)
        .sort((a, b) => b.engineeringDamageTaken - a.engineeringDamageTaken),
      oilOfImmolationDamageTaken: playerAnalytics
        .filter(player => player.oilOfImmolationDamageTaken > 0)
        .sort((a, b) => b.oilOfImmolationDamageTaken - a.oilOfImmolationDamageTaken),
      playersWithBuffData: playerAnalytics
        .filter(player => player.buffAuraCount > 0)
        .sort((a, b) => b.buffAuraCount - a.buffAuraCount),
      playersUsingDrums: playerAnalytics
        .filter(player => player.drumsCastCount > 0)
        .sort((a, b) => b.drumsCastCount - a.drumsCastCount),
      playersWithSuboptimalWeaponEnchants: playerAnalytics
        .filter(player => player.temporaryEnchantIssues.suboptimalTemporaryEnchantCount > 0)
        .sort((a, b) => b.temporaryEnchantIssues.suboptimalTemporaryEnchantCount - a.temporaryEnchantIssues.suboptimalTemporaryEnchantCount),
    },
  };
}

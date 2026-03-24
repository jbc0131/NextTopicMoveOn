import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLoginUrl, useAuth } from "../../shared/auth";
import { getScoreColor } from "../../shared/useWarcraftLogs";
import { getRaidCardLeaders } from "./leaderboard.js";
import { buildAutoReportTitle } from "./reportTitle.js";
import {
  fetchRpbRaidBundle,
  deleteRpbRaidImport,
  fetchRpbRaidList,
  fetchUserProfile,
  LOCAL_SANDBOX_PROFILE_ID,
  updateRpbRaidImport,
} from "../../shared/rpbRedis";
import {
  surface, border, text, accent, intent, font, fontSize, fontWeight, radius, space, btnStyle, inputStyle, panelStyle,
} from "../../shared/theme";
import { AppShell, ConfirmDialog, LoadingSpinner, toast } from "../../shared/components";

const CLASS_COLORS = {
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

function getClassColor(type) {
  return CLASS_COLORS[type] || text.primary;
}

function makeWowheadItemUrl(itemId) {
  return `https://www.wowhead.com/tbc/item=${itemId}`;
}

function getItemEnchantId(item) {
  return item?.permanentEnchant ?? item?.permanentEnchantId ?? item?.enchant ?? item?.enchantId ?? null;
}

function getPermanentEnchantLabel(item) {
  return item?.permanentEnchantName
    || item?.enchantName
    || item?.permanentenchantname
    || item?.spellName
    || "";
}

function getTemporaryEnchantLabel(item) {
  return item?.temporaryEnchantName
    || item?.temporaryenchantname
    || item?.tempEnchantName
    || item?.temporaryenchant
    || "";
}

function makeWowheadItemUrlWithGear(item, gear = []) {
  const pcs = new Array(19).fill(0);

  for (const gearItem of gear || []) {
    if (gearItem?.slot == null || gearItem?.id == null) continue;
    const slot = Number(gearItem.slot);
    if (!Number.isNaN(slot) && slot >= 0 && slot < pcs.length) {
      pcs[slot] = gearItem.id;
    }
  }

  const params = new URLSearchParams();
  params.set("pcs", pcs.join(":"));

  const gems = (item?.gems || []).map(gem => gem?.id).filter(Boolean);
  if (gems.length > 0) params.set("gems", gems.join(":"));

  const enchantId = getItemEnchantId(item);
  if (enchantId != null) params.set("ench", String(enchantId));

  return `${makeWowheadItemUrl(item?.id)}?${params.toString()}`;
}

function makeWowheadSpellUrl(spellId) {
  return `https://www.wowhead.com/tbc/spell=${spellId}`;
}

const ROLE_ORDER = {
  Tank: 0,
  Healer: 1,
  DPS: 2,
};

const CLASS_ORDER = {
  Warrior: 0,
  Paladin: 1,
  Druid: 2,
  Priest: 3,
  Shaman: 4,
  Hunter: 5,
  Rogue: 6,
  Mage: 7,
  Warlock: 8,
};

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

const ENGINEERING_DAMAGE_ABILITY_IDS = new Set([
  "23063", "13241", "17291", "30486", "4062", "19821", "15239", "19784",
  "12543", "30461", "30217", "39965", "4068", "19769", "4100", "30216",
  "22792", "30526", "4072", "19805", "27661", "23000", "11350",
]);

const OIL_OF_IMMOLATION_ABILITY_IDS = new Set(["11351"]);
const FLASK_IDS = new Set([
  "17626", "17627", "17628", "28518", "28519", "28520", "42735", "42736",
]);
const FLASK_NAME_TOKENS = [
  "flask of pure death",
  "flask of relentless assault",
  "flask of blinding light",
  "flask of mighty restoration",
  "flask of supreme power",
  "flask of fortification",
  "flask of chromatic wonder",
  "unstable flask of the sorcerer",
  "unstable flask of the beast",
  "unstable flask of the elder",
  "unstable flask of the bandit",
];
const BATTLE_ELIXIR_IDS = new Set([
  "28491", "28497", "33720", "28521", "33726", "17537", "17538", "38954", "33721", "54452",
]);
const BATTLE_ELIXIR_NAME_TOKENS = [
  "adept's elixir",
  "major arcane elixir",
  "elixir of mastery",
  "elixir of major agility",
  "elixir of major firepower",
  "elixir of major frost power",
  "elixir of major shadow power",
  "elixir of onslaught",
  "elixir of demonslaying",
  "elixir of healing power",
  "elixir of major strength",
];
const GUARDIAN_ELIXIR_IDS = new Set([
  "39625", "39626", "17539", "28502", "28509", "39627", "28503", "11348",
]);
const GUARDIAN_ELIXIR_NAME_TOKENS = [
  "elixir of draenic wisdom",
  "elixir of major mageblood",
  "elixir of major defense",
  "elixir of major fortitude",
  "elixir of ironskin",
  "gift of arthas",
];
const SCROLL_IDS = new Set([
  "33077", "33078", "33079", "33080", "33081", "33082",
]);
const SCROLL_AURA_NAMES = new Set([
  "Agility",
  "Spirit",
  "Armor",
  "Protection",
  "Intellect",
  "Strength",
]);
const SCROLL_NAME_OVERRIDES = new Map([
  ["33080", "Spirit"],
]);
const HEALTHSTONE_CAST_IDS = new Set([]);
const HEALTHSTONE_NAME_TOKENS = [
  "minor healthstone",
  "lesser healthstone",
  "healthstone",
  "greater healthstone",
  "major healthstone",
  "master healthstone",
  "demonic healthstone",
  "fel healthstone",
];
const POTION_NAME_TOKENS = ["potion"];
const FOOD_AURA_NAME_TOKENS = [
  "well fed",
  "blackened",
  "blackened basilisk",
  "blackened sporefish",
  "spicy crawdad",
  "spicy hot talbuk",
  "grilled mudfish",
  "poached bluefish",
  "golden fish sticks",
  "skullfish soup",
  "feltail delight",
  "broiled bloodfin",
  "buzzard bites",
  "ravager dog",
  "roasted clefthoof",
  "warp burger",
  "crunchy serpent",
  "mok'nathal shortribs",
  "sporeling snack",
  "fisherman's feast",
  "stormchops",
];

const GEAR_SLOT_LABELS = {
  0: "Head",
  1: "Neck",
  2: "Shoulder",
  4: "Chest",
  5: "Waist",
  6: "Legs",
  7: "Feet",
  8: "Wrist",
  9: "Hands",
  10: "Finger",
  11: "Finger",
  12: "Trinket",
  13: "Trinket",
  14: "Back",
  15: "Weapon",
  16: "Off Hand",
  17: "Ranged / Relic",
  18: "Tabard",
};

const DISPLAY_SLOT_SEQUENCE = [
  0,
  1,
  2,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
];

const OPTIONAL_EMPTY_GEAR_SLOTS = new Set([16, 18]);
const ALL_VISIBLE_ENCOUNTERS_ID = "__all_visible_encounters__";
const ALL_KILLS_ENCOUNTERS_ID = "__all_kills_encounters__";
const ALL_WIPES_ENCOUNTERS_ID = "__all_wipes_encounters__";

const ITEM_QUALITY_COLORS = {
  0: "#9d9d9d",
  1: "#1eff00",
  2: "#ffffff",
  3: "#0070dd",
  4: "#a335ee",
  5: "#ff8000",
};

const PILL_TONE_ORDER = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
  neutral: 4,
};

const TEAM_TAG_OPTIONS = [
  { id: "", label: "All Teams", shortLabel: "Unassigned", tone: "neutral", emoji: "" },
  { id: "Team Dick", label: "🍆 Team Dick", shortLabel: "🍆 Team Dick", tone: "teamDick", emoji: "🍆" },
  { id: "Team Balls", label: "🍒 Team Balls", shortLabel: "🍒 Team Balls", tone: "teamBalls", emoji: "🍒" },
];

function normalizeTeamTag(value) {
  const normalized = String(value || "").trim();
  if (normalized === "Team Dick" || normalized === "Team Balls") return normalized;
  return "";
}

function getTeamOption(teamTag) {
  return TEAM_TAG_OPTIONS.find(option => option.id === normalizeTeamTag(teamTag)) || TEAM_TAG_OPTIONS[0];
}

function getTeamScheduleLabel(teamTag) {
  const normalized = normalizeTeamTag(teamTag);
  if (normalized === "Team Dick") return "Tuesday";
  if (normalized === "Team Balls") return "Thursday";
  return "";
}

function tagStyle(tone = "neutral") {
  const tones = {
    danger: { background: "rgba(205, 78, 78, 0.18)", borderColor: "rgba(205, 78, 78, 0.45)", color: "#ffd5d5" },
    warning: { background: "rgba(222, 166, 53, 0.18)", borderColor: "rgba(222, 166, 53, 0.45)", color: "#ffe6b3" },
    info: { background: "rgba(61, 125, 202, 0.18)", borderColor: "rgba(61, 125, 202, 0.45)", color: "#d6e7ff" },
    success: { background: "rgba(75, 170, 109, 0.18)", borderColor: "rgba(75, 170, 109, 0.45)", color: "#d7ffdf" },
    teamDick: { background: "rgba(191, 156, 255, 0.22)", borderColor: "rgba(191, 156, 255, 0.55)", color: "#f1e5ff" },
    teamBalls: { background: "rgba(255, 146, 167, 0.22)", borderColor: "rgba(255, 146, 167, 0.55)", color: "#ffe2e8" },
    neutral: { background: "rgba(255,255,255,0.06)", borderColor: border.subtle, color: text.secondary },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${tones[tone].borderColor}`,
    background: tones[tone].background,
    color: tones[tone].color,
    fontSize: fontSize.sm,
    lineHeight: 1.2,
  };
}

function parseTagStyle(score) {
  const color = getScoreColor(score) || text.secondary;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${color}66`,
    background: `${color}22`,
    color,
    fontSize: fontSize.sm,
    lineHeight: 1.2,
    fontWeight: fontWeight.semibold,
  };
}

function parseInlineStyle(score) {
  return {
    color: getScoreColor(score) || text.secondary,
    fontWeight: fontWeight.bold,
  };
}

function getDefaultSelectedFightId(raid) {
  const firstKill = (raid?.fights || []).find(fight => fight?.encounterId > 0 && fight?.kill);
  if (firstKill?.id != null) return String(firstKill.id);

  const firstEncounter = (raid?.fights || []).find(fight => fight?.encounterId > 0);
  if (firstEncounter?.id != null) return String(firstEncounter.id);

  return "";
}

function getRaidAwardWinner(raid, role, parseField) {
  const fallbackLeaders = getRaidCardLeaders(raid);
  const fallbackLeader = role === "DPS" ? fallbackLeaders.topDpsLeader : fallbackLeaders.topHealerLeader;
  if (fallbackLeader?.name && Number(fallbackLeader?.parsePercent) > 0) {
    return {
      ...fallbackLeader,
      awardParse: Number(fallbackLeader.parsePercent || 0),
    };
  }

  const persistedLeader = role === "DPS" ? raid?.topDpsLeader : raid?.topHealerLeader;
  if (persistedLeader?.name && Number(persistedLeader?.parsePercent) > 0) {
    return {
      ...persistedLeader,
      awardParse: Number(persistedLeader.parsePercent || 0),
    };
  }

  if (!fallbackLeader) return null;
  return {
    ...fallbackLeader,
    awardParse: Number(fallbackLeader.parsePercent || 0),
  };
}

async function readApiJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(text.trim() || `Request failed with status ${response.status}`);
    }
    throw new Error("Received a non-JSON response from the server.");
  }
}

function teamFilterButtonStyle(option, active) {
  if (option.id === "Team Dick") {
    return {
      ...btnStyle("default", false),
      height: 30,
      background: "rgba(191, 156, 255, 0.22)",
      borderColor: active ? "rgba(191, 156, 255, 0.9)" : "rgba(191, 156, 255, 0.55)",
      color: "#f1e5ff",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
    };
  }

  if (option.id === "Team Balls") {
    return {
      ...btnStyle("default", false),
      height: 30,
      background: "rgba(255, 146, 167, 0.22)",
      borderColor: active ? "rgba(255, 146, 167, 0.9)" : "rgba(255, 146, 167, 0.55)",
      color: "#ffe2e8",
      boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
    };
  }

  return {
    ...btnStyle(active ? "primary" : "default", active),
    height: 30,
  };
}

function MetricTag({ label, value, tone = "neutral", active = false, onClick = null }) {
  const interactive = typeof onClick === "function";
  const activeStyles = {
    success: {
      background: "rgba(75, 170, 109, 0.32)",
      borderColor: "rgba(110, 220, 145, 0.98)",
      boxShadow: "0 0 0 2px rgba(110, 220, 145, 0.28), inset 0 0 0 1px rgba(255,255,255,0.16)",
      color: "#effff3",
    },
    warning: {
      background: "rgba(201, 154, 60, 0.34)",
      borderColor: "rgba(255, 214, 120, 0.98)",
      boxShadow: "0 0 0 2px rgba(255, 214, 120, 0.24), inset 0 0 0 1px rgba(255,255,255,0.16)",
      color: "#fff7e1",
    },
    danger: {
      background: "rgba(205, 78, 78, 0.34)",
      borderColor: "rgba(255, 134, 134, 0.98)",
      boxShadow: "0 0 0 2px rgba(255, 134, 134, 0.24), inset 0 0 0 1px rgba(255,255,255,0.16)",
      color: "#fff0f0",
    },
    info: {
      background: "rgba(61, 125, 202, 0.34)",
      borderColor: "rgba(131, 185, 255, 0.98)",
      boxShadow: "0 0 0 2px rgba(131, 185, 255, 0.24), inset 0 0 0 1px rgba(255,255,255,0.16)",
      color: "#eef6ff",
    },
    neutral: {
      background: "rgba(120, 128, 145, 0.28)",
      borderColor: "rgba(188, 197, 216, 0.95)",
      boxShadow: "0 0 0 2px rgba(188, 197, 216, 0.18), inset 0 0 0 1px rgba(255,255,255,0.14)",
      color: "#f4f7fd",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick || undefined}
      style={{
        ...tagStyle(tone),
        cursor: interactive ? "pointer" : "default",
        ...(active
          ? (activeStyles[tone] || activeStyles.neutral)
          : { borderColor: tagStyle(tone).border.split(" ").slice(-1)[0], boxShadow: "none" }),
        opacity: interactive && !active ? 0.9 : 1,
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
      }}
      disabled={!interactive}
      aria-pressed={interactive ? active : undefined}
    >
      <span style={{ opacity: 0.82 }}>{label}:</span>
      <span style={{ fontWeight: fontWeight.semibold }}>{value}</span>
    </button>
  );
}

function getDisplayName(entry, fallbackPrefix = "Item") {
  return entry?.name
    || entry?.itemName
    || entry?.itemname
    || entry?.item?.name
    || entry?.item?.itemName
    || entry?.gemName
    || entry?.displayName
    || entry?.display_name
    || `${fallbackPrefix} ${entry?.id ?? ""}`.trim();
}

function getResolvedDisplayName(entry, itemMetaById, fallbackPrefix = "Item") {
  const direct = getDisplayName(entry, "");
  if (direct) return direct;
  const meta = itemMetaById?.[String(entry?.id ?? "")];
  return meta?.name || `${fallbackPrefix} ${entry?.id ?? ""}`.trim();
}

function WowheadItemLink({ itemId, children }) {
  if (!itemId) return children;
  return (
    <a
      href={makeWowheadItemUrl(itemId)}
      target="_blank"
      rel="noreferrer"
      data-wowhead={`item=${itemId}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadGearItemLink({ item, gear, children }) {
  if (!item?.id) return children;

  const gems = (item.gems || []).map(gem => gem?.id).filter(Boolean);
  const enchantId = getItemEnchantId(item);
  const tooltipParts = [`item=${item.id}`];
  if (gems.length > 0) tooltipParts.push(`gems=${gems.join(":")}`);
  if (enchantId != null) tooltipParts.push(`ench=${String(enchantId)}`);

  return (
    <a
      href={makeWowheadItemUrlWithGear(item, gear)}
      target="_blank"
      rel="noreferrer"
      data-wowhead={tooltipParts.join("&")}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadSpellLink({ spellId, children }) {
  if (!spellId) return children;
  return (
    <a
      href={makeWowheadSpellUrl(spellId)}
      target="_blank"
      rel="noreferrer"
      data-wowhead={`spell=${spellId}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadSpellAbility({ spellId, name }) {
  const label = name || "Unknown Ability";
  if (!spellId) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: space[2], minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: radius.sm,
            background: `${accent.blue}22`,
            border: `1px solid ${accent.blue}55`,
            flexShrink: 0,
          }}
        />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </span>
    );
  }

  return (
    <WowheadSpellLink spellId={spellId}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </WowheadSpellLink>
  );
}

function getItemQualityColor(item) {
  const rawQuality = item?.quality ?? item?.itemQuality ?? item?.rarity ?? item?.qualityLevel ?? item?.item_quality ?? item?.item?.quality ?? item?.item?.itemQuality;
  const quality = typeof rawQuality === "string"
    ? ({ poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rawQuality.toLowerCase()] ?? Number(rawQuality))
    : rawQuality;
  if (quality != null && !Number.isNaN(Number(quality))) {
    return ITEM_QUALITY_COLORS[Number(quality)] || text.primary;
  }

  const itemLevel = item?.itemLevel ?? item?.ilevel ?? null;
  if (itemLevel != null && Number(itemLevel) >= 115) return ITEM_QUALITY_COLORS[4];
  if (itemLevel != null && Number(itemLevel) >= 100) return ITEM_QUALITY_COLORS[3];
  if (itemLevel != null && Number(itemLevel) >= 60) return ITEM_QUALITY_COLORS[2];
  if (itemLevel != null) return ITEM_QUALITY_COLORS[1];
  return ITEM_QUALITY_COLORS[quality] || text.primary;
}

function getResolvedQualityColor(item, itemMetaById) {
  const directColor = getItemQualityColor(item);
  if (directColor !== text.primary) return directColor;
  const meta = itemMetaById?.[String(item?.id ?? "")];
  if (meta?.quality != null) {
    return ITEM_QUALITY_COLORS[Number(meta.quality)] || text.primary;
  }
  return directColor;
}

function getGemQualityColor(gem) {
  const rawQuality = gem?.quality ?? gem?.itemQuality ?? gem?.rarity ?? gem?.qualityLevel ?? gem?.item_quality ?? gem?.item?.quality ?? gem?.item?.itemQuality;
  const quality = typeof rawQuality === "string"
    ? ({ poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rawQuality.toLowerCase()] ?? Number(rawQuality))
    : rawQuality;

  if (quality != null && !Number.isNaN(Number(quality))) {
    return ITEM_QUALITY_COLORS[Number(quality)] || text.primary;
  }

  const itemLevel = gem?.itemLevel ?? gem?.ilevel ?? null;
  if (itemLevel != null && Number(itemLevel) >= 115) return ITEM_QUALITY_COLORS[4];
  if (itemLevel != null && Number(itemLevel) >= 100) return ITEM_QUALITY_COLORS[3];
  if (itemLevel != null && Number(itemLevel) >= 60) return ITEM_QUALITY_COLORS[2];
  return ITEM_QUALITY_COLORS[1];
}

function getResolvedGemQualityColor(gem, itemMetaById) {
  const directColor = getGemQualityColor(gem);
  if (directColor !== ITEM_QUALITY_COLORS[1]) return directColor;
  const meta = itemMetaById?.[String(gem?.id ?? "")];
  if (meta?.quality != null) {
    return ITEM_QUALITY_COLORS[Number(meta.quality)] || directColor;
  }
  return directColor;
}

function getNormalizedGearText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasGearText(value, tokens) {
  const normalized = getNormalizedGearText(value);
  return !!normalized && tokens.some(token => normalized.includes(token));
}

function getGearItemClass(item) {
  return item?.itemClass ?? item?.class ?? item?.itemclass ?? item?.className ?? "";
}

function getGearItemSubclass(item) {
  return item?.itemSubclass ?? item?.subclass ?? item?.subClass ?? item?.subclassName ?? "";
}

function getGearInventoryType(item) {
  return item?.inventoryType ?? item?.inventorytype ?? item?.invType ?? item?.equipSlot ?? item?.slotName ?? "";
}

function isShieldOrHeldInOffHandItem(item) {
  return hasGearText(getGearInventoryType(item), ["shield", "hold", "held", "off-hand", "off hand"])
    || hasGearText(getGearItemSubclass(item), ["shield", "idol", "totem", "libram", "miscellaneous", "held"])
    || hasGearText(item?.name, ["shield", "idol", "totem", "libram"]);
}

function isWeaponGearItem(item) {
  return hasGearText(getGearItemClass(item), ["weapon"])
    || hasGearText(getGearInventoryType(item), ["weapon", "main hand", "off hand", "one-hand", "one hand", "two-hand", "two hand"])
    || hasGearText(getGearItemSubclass(item), ["axe", "dagger", "fist", "mace", "sword", "staff", "polearm"]);
}

function isTwoHandedWeaponItem(item) {
  return hasGearText(getGearInventoryType(item), ["two-hand", "two hand", "2h"])
    || hasGearText(getGearItemSubclass(item), ["staff", "polearm"])
    || hasGearText(item?.name, ["great", "staff", "polearm"]);
}

function shouldExpectTemporaryEnchant(item, gear = []) {
  if (!item?.id) return false;
  const slot = Number(item?.slot);

  if (slot === 15) return isWeaponGearItem(item);
  if (slot !== 16) return false;
  if (isShieldOrHeldInOffHandItem(item)) return false;
  if (!isWeaponGearItem(item)) return false;

  const mainHand = (gear || []).find(entry => Number(entry?.slot) === 15 && entry?.id);
  if (isTwoHandedWeaponItem(mainHand)) return false;

  return true;
}

function isSuboptimalTemporaryEnchant(item, playerType) {
  const enchantId = item?.temporaryEnchant ?? item?.temporaryEnchantId ?? null;
  const normalizedEnchantId = enchantId != null ? String(enchantId) : "";
  if (!normalizedEnchantId || IGNORED_TEMP_ENCHANT_IDS.has(normalizedEnchantId)) return false;
  if (ALWAYS_BAD_TEMP_ENCHANT_IDS.has(normalizedEnchantId)) return true;

  const allowedClasses = BAD_TEMP_ENCHANT_CLASS_RULES.get(normalizedEnchantId);
  if (!allowedClasses) return false;

  return !allowedClasses.has(playerType);
}

function deriveMissingEnchantsFromGear(gear = []) {
  const missingPermanent = [];
  const missingTemporary = [];

  for (const item of gear) {
    const slot = Number(item?.slot);
    if (!ENCHANTABLE_SLOTS.has(slot)) continue;

    const expectsPermanentEnchant = slot !== 16
      || (!isShieldOrHeldInOffHandItem(item) && isWeaponGearItem(item));

    if (expectsPermanentEnchant && !getItemEnchantId(item)) {
      missingPermanent.push({
        slot,
        slotLabel: ENCHANTABLE_SLOTS.get(slot),
        itemId: item?.id ?? null,
        itemName: item?.name || "Unknown Item",
      });
    }

    if (shouldExpectTemporaryEnchant(item, gear) && !getTemporaryEnchantLabel(item)) {
      missingTemporary.push({
        slot,
        slotLabel: ENCHANTABLE_SLOTS.get(slot),
        itemId: item?.id ?? null,
        itemName: item?.name || "Unknown Item",
      });
    }
  }

  return { missingPermanent, missingTemporary };
}

function deriveTemporaryEnchantIssuesFromGear(gear = [], playerType = "") {
  const activeTemporaryEnchants = [];
  const suboptimalTemporaryEnchants = [];

  for (const item of gear) {
    if (!shouldExpectTemporaryEnchant(item, gear)) continue;

    const enchantName = getTemporaryEnchantLabel(item);
    if (!enchantName) continue;

    activeTemporaryEnchants.push({
      slot: Number(item?.slot),
      slotLabel: ENCHANTABLE_SLOTS.get(Number(item?.slot)),
      itemId: item?.id ?? null,
      itemName: item?.name || "Unknown Item",
      enchantId: item?.temporaryEnchant ?? item?.temporaryEnchantId ?? null,
      enchantName,
    });

    if (isSuboptimalTemporaryEnchant(item, playerType)) {
      suboptimalTemporaryEnchants.push({
        slot: Number(item?.slot),
        slotLabel: ENCHANTABLE_SLOTS.get(Number(item?.slot)),
        itemId: item?.id ?? null,
        itemName: item?.name || "Unknown Item",
        enchantId: item?.temporaryEnchant ?? item?.temporaryEnchantId ?? null,
        enchantName,
      });
    }
  }

  return {
    activeTemporaryEnchants,
    suboptimalTemporaryEnchants,
  };
}

function deriveLowQualityGemIssuesFromGear(gear = []) {
  const commonQualityGems = [];
  const uncommonQualityGems = [];

  for (const item of gear) {
    for (const [gemIndex, gem] of (item?.gems || []).entries()) {
      const gemId = gem?.id != null ? String(gem.id) : "";
      const gemRecord = {
        itemId: item?.id ?? null,
        itemName: item?.name || "Unknown Item",
        slot: Number(item?.slot ?? -1),
        gemId: gem?.id ?? null,
        gemIndex,
        gemItemLevel: gem?.itemLevel ?? null,
      };

      if (gem?.itemLevel != null && gem.itemLevel < 60) {
        commonQualityGems.push(gemRecord);
      } else if (gem?.itemLevel === 60 && !ALLOWED_UNCOMMON_GEM_IDS.has(gemId)) {
        uncommonQualityGems.push(gemRecord);
      }
    }
  }

  return {
    commonQualityGems,
    uncommonQualityGems,
    rareQualityGems: [],
  };
}

function getItemIconUrl(item) {
  const rawIcon =
    item?.icon ||
    item?.iconName ||
    item?.iconname ||
    item?.icon_path ||
    item?.displayIcon ||
    item?.display_icon ||
    item?.itemIcon ||
    item?.item_icon ||
    item?.media?.icon ||
    item?.media?.iconName;

  if (!rawIcon) return "";
  const icon = String(rawIcon).trim();

  if (/^https?:\/\//i.test(icon)) return icon;

  const normalized = icon
    .split("/")
    .pop()
    ?.replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .toLowerCase();

  if (!normalized) return "";
  return `https://wow.zamimg.com/images/wow/icons/large/${normalized}.jpg`;
}

function getResolvedItemIconUrl(item, itemMetaById) {
  return getItemIconUrl(item) || itemMetaById?.[String(item?.id ?? "")]?.icon || "";
}

function buildFightGearDisplayRows(gear = []) {
  const gearBySlot = new Map();

  for (const item of gear || []) {
    if (item?.slot == null) continue;
    const slot = Number(item.slot);
    if (Number.isNaN(slot)) continue;
    if (!gearBySlot.has(slot)) {
      gearBySlot.set(slot, item);
    }
  }

  return DISPLAY_SLOT_SEQUENCE.map(slot => {
    if (gearBySlot.has(slot)) return gearBySlot.get(slot);
    if (OPTIONAL_EMPTY_GEAR_SLOTS.has(slot)) return { slot, id: null, isEmptySlot: true };
    return null;
  }).filter(Boolean);
}

function sortPlayersForDisplay(players) {
  return [...(players || [])].sort((a, b) => {
    const roleDelta = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDelta !== 0) return roleDelta;

    const classDelta = (CLASS_ORDER[a.type] ?? 99) - (CLASS_ORDER[b.type] ?? 99);
    if (classDelta !== 0) return classDelta;

    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

function dedupeBy(items, getKey) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function summarizeGemIssues(gems) {
  const grouped = new Map();

  for (const issue of gems || []) {
    const key = `${issue.itemId}:${issue.itemName}`;
    const existing = grouped.get(key) || {
      itemId: issue.itemId,
      itemName: issue.itemName,
      count: 0,
      gemIds: [],
      minItemLevel: issue.gemItemLevel ?? null,
    };

    existing.count += 1;
    if (issue.gemId != null) existing.gemIds.push(issue.gemId);
    if (issue.gemItemLevel != null) {
      existing.minItemLevel = existing.minItemLevel == null
        ? issue.gemItemLevel
        : Math.min(existing.minItemLevel, issue.gemItemLevel);
    }
    grouped.set(key, existing);
  }

  return [...grouped.values()];
}

function collectAbilityRows(node, rows = []) {
  if (!node) return rows;
  if (Array.isArray(node)) {
    node.forEach(entry => collectAbilityRows(entry, rows));
    return rows;
  }
  if (typeof node !== "object") return rows;

  const guid = node?.guid ?? node?.gameID ?? node?.abilityGameID ?? node?.id ?? null;
  const name = node?.name || node?.abilityName || node?.ability?.name || "";
  const totalUses = Number(node?.totalUses ?? node?.uses ?? node?.total ?? node?.casts ?? 0);
  if ((guid != null || name) && Number.isFinite(totalUses) && totalUses > 0) {
    rows.push({
      guid: guid != null ? String(guid) : "",
      name,
      totalUses,
    });
  }

  Object.values(node).forEach(value => {
    if (value && typeof value === "object") {
      collectAbilityRows(value, rows);
    }
  });
  return rows;
}

function countMatchingCasts(node, { ids = null, nameTokens = [] } = {}) {
  return collectAbilityRows(node).reduce((sum, row) => {
    const normalizedName = String(row.name || "").toLowerCase();
    const matchesId = ids ? ids.has(String(row.guid || "")) : false;
    const matchesName = nameTokens.some(token => normalizedName.includes(token));
    return matchesId || matchesName ? sum + Number(row.totalUses || 0) : sum;
  }, 0);
}

function countMatchingAbilityUses(node, { nameTokens = [] } = {}) {
  if (!node) return 0;

  if (Array.isArray(node)) {
    return node.reduce((sum, entry) => sum + countMatchingAbilityUses(entry, { nameTokens }), 0);
  }

  if (typeof node !== "object") return 0;

  const normalizedName = String(node?.name || node?.abilityName || node?.ability?.name || "").toLowerCase();
  const matchesName = nameTokens.some(token => normalizedName.includes(token));
  const directCount = Number(
    node?.totalUses
    ?? node?.uses
    ?? node?.casts
    ?? node?.useCount
    ?? node?.executeCount
    ?? node?.hits
    ?? node?.totalHits
    ?? node?.hitCount
    ?? node?.landedHits
    ?? node?.count
    ?? 0
  );
  const ownCount = matchesName
    ? (Number.isFinite(directCount) && directCount > 0 ? directCount : (Number(node?.total || 0) > 0 ? 1 : 0))
    : 0;

  return ownCount + Object.values(node).reduce((sum, value) => {
    if (value && typeof value === "object") {
      return sum + countMatchingAbilityUses(value, { nameTokens });
    }
    return sum;
  }, 0);
}

function normalizeAura(aura) {
  return {
    guid: aura?.guid != null ? String(aura.guid) : "",
    name: aura?.name || "Unknown Aura",
    totalUses: aura?.totalUses ?? 0,
    totalUptime: aura?.totalUptime ?? 0,
  };
}

function isFlaskAura(aura) {
  const guid = String(aura?.guid || "");
  const name = String(aura?.name || "").toLowerCase();
  return FLASK_IDS.has(guid) || FLASK_NAME_TOKENS.some(token => name.includes(token)) || name.includes("flask of");
}

function isBattleElixirAura(aura) {
  const guid = String(aura?.guid || "");
  const name = String(aura?.name || "").toLowerCase();
  return BATTLE_ELIXIR_IDS.has(guid)
    || BATTLE_ELIXIR_NAME_TOKENS.some(token => name.includes(token))
    || (name.includes("elixir") && (
      name.includes("adept") || name.includes("major agility") || name.includes("major firepower")
      || name.includes("major shadow power") || name.includes("major frost power")
      || name.includes("onslaught") || name.includes("demonslaying") || name.includes("mastery")
      || name.includes("major strength") || name.includes("healing power") || name.includes("major arcane")
    ));
}

function isGuardianElixirAura(aura) {
  const guid = String(aura?.guid || "");
  const name = String(aura?.name || "").toLowerCase();
  return GUARDIAN_ELIXIR_IDS.has(guid)
    || GUARDIAN_ELIXIR_NAME_TOKENS.some(token => name.includes(token))
    || (name.includes("elixir") && (
      name.includes("draenic wisdom") || name.includes("major mageblood") || name.includes("major defense")
      || name.includes("major fortitude") || name.includes("ironskin") || name.includes("gift of arthas")
    ));
}

function isScrollAura(aura) {
  const guid = String(aura?.guid || "");
  const name = String(aura?.name || "").toLowerCase();
  return SCROLL_IDS.has(guid) || SCROLL_AURA_NAMES.has(aura?.name || "") || name.includes("scroll of");
}

function isFoodAura(aura) {
  const name = String(aura?.name || "").toLowerCase();
  return FOOD_AURA_NAME_TOKENS.some(token => name.includes(token));
}

function getUniqueAuraNames(auras) {
  return [...new Set((auras || []).map(aura => {
    const guid = String(aura?.guid || "");
    return SCROLL_NAME_OVERRIDES.get(guid) || aura?.name;
  }).filter(Boolean))];
}

function getConsumableCoverage(buffSnapshot, playerId, playerName) {
  const entries = buffSnapshot?.buffs?.entries || buffSnapshot?.entries || [];
  const playerEntry = entries.find(entry =>
    String(entry?.id || "") === String(playerId) || entry?.name === playerName
  );
  const auras = (playerEntry?.auras || []).map(normalizeAura);
  const flaskAuras = auras.filter(isFlaskAura);
  const battleElixirAuras = auras.filter(isBattleElixirAura);
  const guardianElixirAuras = auras.filter(isGuardianElixirAura);
  const scrollAuras = auras.filter(isScrollAura);
  const foodAuras = auras.filter(isFoodAura);
  const hasFlask = auras.some(isFlaskAura);
  const hasBattleElixir = auras.some(isBattleElixirAura);
  const hasGuardianElixir = auras.some(isGuardianElixirAura);
  const hasScroll = auras.some(isScrollAura);
  const hasFood = auras.some(isFoodAura);
  const hasElixirCoverage = hasFlask || (hasBattleElixir && hasGuardianElixir);
  const fullyCovered = hasFood && hasElixirCoverage;
  const elixirUnitsRequired = hasFlask ? 1 : 2;
  const elixirUnitsCovered = hasFlask ? 1 : (Number(hasBattleElixir) + Number(hasGuardianElixir));
  const scrollNames = getUniqueAuraNames(scrollAuras);
  return {
    hasFlask,
    hasBattleElixir,
    hasGuardianElixir,
    hasScroll,
    hasFood,
    hasElixirCoverage,
    fullyCovered,
    elixirUnitsCovered,
    elixirUnitsRequired,
    scrollCount: scrollNames.length,
    covered: hasElixirCoverage,
    flaskAuras,
    battleElixirAuras,
    guardianElixirAuras,
    scrollAuras,
    foodAuras,
    flaskNames: getUniqueAuraNames(flaskAuras),
    battleElixirNames: getUniqueAuraNames(battleElixirAuras),
    guardianElixirNames: getUniqueAuraNames(guardianElixirAuras),
    scrollNames,
    foodNames: getUniqueAuraNames(foodAuras),
    elixirAuras: [...flaskAuras, ...battleElixirAuras, ...guardianElixirAuras],
  };
}

function formatAuraList(names, emptyLabel = "Missing") {
  return names?.length ? names.join(", ") : emptyLabel;
}

function getDrumFightCoverage(snapshot, playerId, playerName) {
  const playerEntry = (snapshot?.players || []).find(entry =>
    String(entry?.playerId || "") === String(playerId) || entry?.name === playerName
  );
  const casts = Number(playerEntry?.casts || 0);
  const affectedTargets = Number(playerEntry?.affectedTargets || 0);
  const averageAffectedPerCast = casts > 0
    ? affectedTargets / casts
    : Number(playerEntry?.averageAffectedPerCast || 0);

  return {
    fightId: String(snapshot?.fightId || ""),
    fightName: snapshot?.fightName || "Unknown Fight",
    casts,
    affectedTargets,
    averageAffectedPerCast,
    abilityBreakdown: playerEntry?.abilityBreakdown || [],
  };
}

function buildDrumSliceEntries(players, analyticsByPlayerId, filterIds = null) {
  const rows = [];

  for (const player of players || []) {
    const analytics = analyticsByPlayerId.get(String(player.id));
    if (!analytics) continue;
    if (filterIds && !filterIds.has(String(player.id))) continue;

    const casts = Number(analytics.drumsCastCount || 0);
    if (casts <= 0) continue;

    const affectedTargets = Number(analytics.drumsAffectedCount || 0);
    rows.push({
      id: String(player.id),
      name: player.name || "Unknown Player",
      type: player.type || "",
      total: casts,
      casts,
      affectedTargets,
      averageAffectedPerCast: casts > 0 ? affectedTargets / casts : 0,
    });
  }

  return rows.sort((a, b) => {
    if (b.casts !== a.casts) return b.casts - a.casts;
    if (b.affectedTargets !== a.affectedTargets) return b.affectedTargets - a.affectedTargets;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

function extractReportSpeedPercent(reportRankings) {
  const value = Number(reportRankings?.reportSpeedPercent);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getRaidReportSpeedPercent(raid) {
  const compareMode = String(raid?.importPayload?.reportSpeed?.compareMode || "");
  if (compareMode !== "Rankings") {
    const fightSpeedPercents = (raid?.fights || [])
      .map(fight => Number(fight?.speedParsePercent))
      .filter(value => Number.isFinite(value) && value > 0);
    if (fightSpeedPercents.length > 0) {
      return fightSpeedPercents.reduce((sum, value) => sum + value, 0) / fightSpeedPercents.length;
    }
  }

  const direct = Number(raid?.reportSpeedPercent);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return extractReportSpeedPercent(raid?.importPayload?.reportSpeed) ?? extractReportSpeedPercent(raid?.importPayload?.reportRankings);
}

function isRecentReport(reportStart) {
  if (!reportStart) return false;
  const reportDate = new Date(reportStart);
  if (Number.isNaN(reportDate.getTime())) return false;
  const diffMs = Date.now() - reportDate.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function buildConsumableSliceEntries(players, analyticsByPlayerId, filterIds = null) {
  const rows = [];

  for (const player of players || []) {
    const analytics = analyticsByPlayerId.get(String(player.id));
    if (!analytics) continue;
    if (filterIds && !filterIds.has(String(player.id))) continue;

    const totalFights = Number(analytics.totalConsumableFights || 0);
    const scrollIssues = Number(analytics.scrollIssueCount || 0);
    const elixirIssues = Number(analytics.elixirIssueCount || 0);
    const foodIssues = Number(analytics.foodIssueCount || 0);
    const scrollCovered = Number(analytics.scrollCoverageCount || 0);
    const elixirCovered = Number(analytics.elixirCoverageCount || 0);
    const foodCovered = Number(analytics.foodCoverageCount || 0);
    const elixirUnitCovered = Number(analytics.elixirUnitCoverageCount || 0);
    const elixirUnitRequired = Number(analytics.elixirUnitRequirementCount || 0);
    const totalIssues = elixirIssues + foodIssues;
    const totalRequired = elixirUnitRequired + totalFights;
    const totalCovered = elixirUnitCovered + foodCovered;

    rows.push({
      id: String(player.id),
      name: player.name || "Unknown Player",
      type: player.type || "",
      total: totalCovered,
      totalRequired,
      totalFights,
      scrollCoverageCount: scrollCovered,
      elixirCoverageCount: elixirCovered,
      elixirUnitCoverageCount: elixirUnitCovered,
      elixirUnitRequirementCount: elixirUnitRequired,
      foodCoverageCount: foodCovered,
      scrollIssues,
      elixirIssues,
      foodIssues,
      totalIssues,
    });
  }

  return rows.sort((a, b) => {
    const aPct = a.totalRequired > 0 ? a.total / a.totalRequired : 0;
    const bPct = b.totalRequired > 0 ? b.total / b.totalRequired : 0;
    if (bPct !== aPct) return bPct - aPct;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

function aggregateDamageEntries(fights) {
  const grouped = new Map();

  for (const fight of fights || []) {
    for (const entry of fight.damageDoneEntries || []) {
      const key = String(entry.id);
      const existing = grouped.get(key) || {
        id: key,
        name: entry.name || "Unknown Player",
        type: entry.type || "",
        total: 0,
        activeTime: 0,
        fights: 0,
      };

      existing.total += entry.total || 0;
      existing.activeTime += entry.activeTime || 0;
      existing.fights += 1;
      grouped.set(key, existing);
    }
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function aggregateMetricEntries(fights, field, overallParseByPlayerId = null, useOverallParse = false) {
  const grouped = new Map();

  for (const fight of fights || []) {
    for (const entry of fight[field] || []) {
      const key = String(entry.id);
      const existing = grouped.get(key) || {
        id: key,
        name: entry.name || "Unknown Player",
        type: entry.type || "",
        total: 0,
        activeTime: 0,
        fights: 0,
        parsePercent: null,
        parseTotal: 0,
        parseCount: 0,
      };

      const entryTotal = field === "deathEntries"
        ? getDeathEntryTotal(entry)
        : Number(entry.total || 0);
      existing.total += entryTotal;
      existing.activeTime += entry.activeTime || 0;
      existing.fights += 1;
      if (Number.isFinite(Number(entry.parsePercent))) {
        existing.parseTotal += Number(entry.parsePercent);
        existing.parseCount += 1;
        existing.parsePercent = existing.parseTotal / existing.parseCount;
      }
      grouped.set(key, existing);
    }
  }

  if (useOverallParse && overallParseByPlayerId) {
    for (const entry of grouped.values()) {
      if (entry.parseCount === 0 && overallParseByPlayerId.has(String(entry.id))) {
        entry.parsePercent = overallParseByPlayerId.get(String(entry.id));
      }
    }
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function buildParseFallbackByMetric(fights, field) {
  const next = new Map();
  const totals = new Map();
  const counts = new Map();

  for (const fight of fights || []) {
    if (!(Number(fight?.encounterId) > 0)) continue;

    for (const entry of fight?.[field] || []) {
      const value = Number(entry?.parsePercent);
      if (!Number.isFinite(value) || value < 0) continue;

      const key = String(entry?.id || "");
      if (!key) continue;

      totals.set(key, Number(totals.get(key) || 0) + value);
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
  }

  for (const [key, total] of totals.entries()) {
    const count = Number(counts.get(key) || 0);
    if (count > 0) {
      next.set(key, total / count);
    }
  }

  return next;
}

function getDeathEntryTotal(entry) {
  if (!entry) return 0;
  const explicitDeaths = Number(entry.deaths || 0);
  if (explicitDeaths > 0) return explicitDeaths;
  const directTotal = Number(entry.total || 0);
  if (directTotal > 0) return directTotal;
  if (entry.timestamp != null || entry.killingBlow || entry.deathWindow != null) return 1;
  return Array.isArray(entry.events) && entry.events.length > 0 ? 1 : 0;
}

function applyRankingsToRaidFights(raid, rankings) {
  if (!raid?.fights?.length) return raid;
  if (!rankings?.fights) return raid;

  const nextFights = raid.fights.map(fight => {
    const rankingSnapshot = rankings.fights[String(fight.id)] || {};
    const damageDoneEntries = (fight.damageDoneEntries || []).map(entry => ({
      ...entry,
      parsePercent: rankingSnapshot.damage?.byId?.[String(entry.id)] ?? rankingSnapshot.damage?.byName?.[entry.name] ?? entry.parsePercent ?? null,
    }));
    const healingDoneEntries = (fight.healingDoneEntries || []).map(entry => ({
      ...entry,
      parsePercent: rankingSnapshot.healing?.byId?.[String(entry.id)] ?? rankingSnapshot.healing?.byName?.[entry.name] ?? entry.parsePercent ?? null,
    }));

    return {
      ...fight,
      damageDoneEntries,
      healingDoneEntries,
    };
  });

  const damageParseFallbackByPlayerId = buildParseFallbackByMetric(nextFights, "damageDoneEntries");
  const healingParseFallbackByPlayerId = buildParseFallbackByMetric(nextFights, "healingDoneEntries");

  const nextPlayers = (raid.players || []).map(player => ({
    ...player,
    damageParsePercent:
      rankings?.overall?.damage?.byId?.[String(player.id)]
      ?? rankings?.overall?.damage?.byName?.[player.name]
      ?? player.damageParsePercent
      ?? damageParseFallbackByPlayerId.get(String(player.id))
      ?? null,
    healingParsePercent:
      rankings?.overall?.healing?.byId?.[String(player.id)]
      ?? rankings?.overall?.healing?.byName?.[player.name]
      ?? player.healingParsePercent
      ?? healingParseFallbackByPlayerId.get(String(player.id))
      ?? null,
  }));

  return {
    ...raid,
    fights: nextFights,
    players: nextPlayers,
    importPayload: {
      ...(raid.importPayload || {}),
      reportRankings: rankings,
    },
  };
}

function applySpeedToRaidFights(raid, speedData) {
  if (!raid?.fights?.length) return raid;

  const nextFights = raid.fights.map(fight => {
    const speedSnapshot = speedData?.fights?.[String(fight.id)] || {};
    return {
      ...fight,
      speedParsePercent: Number.isFinite(Number(speedSnapshot?.speedParsePercent))
        ? Number(speedSnapshot.speedParsePercent)
        : (Number.isFinite(Number(fight.speedParsePercent)) ? Number(fight.speedParsePercent) : null),
    };
  });

  return {
    ...raid,
    fights: nextFights,
    reportSpeedPercent: Number.isFinite(Number(speedData?.reportSpeedPercent))
      ? Number(speedData.reportSpeedPercent)
      : (Number.isFinite(Number(raid.reportSpeedPercent)) ? Number(raid.reportSpeedPercent) : null),
    importPayload: {
      ...(raid.importPayload || {}),
      reportSpeed: speedData || {},
    },
  };
}

function getPlayerSliceTotals(fights, playerId, playerRole = "") {
  if (!playerId) {
    return {
      deaths: 0,
      activeTimeMs: 0,
      availableTimeMs: 0,
      visibleFights: 0,
    };
  }

  let deaths = 0;
  let activeTimeMs = 0;
  let availableTimeMs = 0;
  let visibleFights = 0;

  for (const fight of fights || []) {
    const damageEntry = (fight.damageDoneEntries || []).find(entry => String(entry?.id) === String(playerId));
    const healingEntry = (fight.healingDoneEntries || []).find(entry => String(entry?.id) === String(playerId));
    const deathEntry = (fight.deathEntries || []).find(entry => String(entry?.id) === String(playerId));
    const snapshot = getSelectedFightPlayerSnapshot([fight], fight.id, playerId);
    const activeTimeEntry = playerRole === "Healer"
      ? (healingEntry || damageEntry)
      : (damageEntry || healingEntry);

    if (damageEntry || healingEntry || deathEntry || snapshot) {
      visibleFights += 1;
      availableTimeMs += Number(fight?.durationMs || 0);
    }

    activeTimeMs += Number(activeTimeEntry?.activeTime || 0);
    deaths += getDeathEntryTotal(deathEntry);
  }

  return {
    deaths,
    activeTimeMs,
    availableTimeMs,
    visibleFights,
  };
}

function derivePlayerAnalyticsFromFights(fights, playerId, playerName = "", playerType = "", importPayload = null) {
  const snapshots = [];
  const visibleFightIds = new Set((fights || []).map(fight => String(fight?.id || "")).filter(Boolean));

  for (const fight of fights || []) {
    const snapshot = getSelectedFightPlayerSnapshot([fight], fight.id, playerId);
    if (snapshot?.gear?.length) snapshots.push(snapshot);
  }

  const missingPermanent = [];
  const missingTemporary = [];
  const activeTemporaryEnchants = [];
  const suboptimalTemporaryEnchants = [];
  const commonQualityGems = [];
  const uncommonQualityGems = [];

  for (const snapshot of snapshots) {
    const gear = snapshot.gear || [];
    const missing = deriveMissingEnchantsFromGear(gear);
    const temporary = deriveTemporaryEnchantIssuesFromGear(gear, playerType);
    const gems = deriveLowQualityGemIssuesFromGear(gear);

    missingPermanent.push(...missing.missingPermanent);
    missingTemporary.push(...missing.missingTemporary);
    activeTemporaryEnchants.push(...temporary.activeTemporaryEnchants);
    suboptimalTemporaryEnchants.push(...temporary.suboptimalTemporaryEnchants);
    commonQualityGems.push(...gems.commonQualityGems);
    uncommonQualityGems.push(...gems.uncommonQualityGems);
  }

  const uniqueMissingPermanent = dedupeBy(missingPermanent, issue => `${issue.itemId}:${issue.slot}:perm`);
  const uniqueMissingTemporary = dedupeBy(missingTemporary, issue => `${issue.itemId}:${issue.slot}:temp`);
  const uniqueActiveTemporary = dedupeBy(activeTemporaryEnchants, issue => `${issue.itemId}:${issue.slot}:${issue.enchantId}`);
  const uniqueSuboptimalTemporary = dedupeBy(suboptimalTemporaryEnchants, issue => `${issue.itemId}:${issue.slot}:${issue.enchantId}`);
  const uniqueCommonGems = dedupeBy(commonQualityGems, issue => `${issue.itemId}:${issue.slot}:${issue.gemId}:${issue.gemIndex}`);
  const uniqueUncommonGems = dedupeBy(uncommonQualityGems, issue => `${issue.itemId}:${issue.slot}:${issue.gemId}:${issue.gemIndex}`);
  const summarizedCommonGems = summarizeGemIssues(uniqueCommonGems);
  const summarizedUncommonGems = summarizeGemIssues(uniqueUncommonGems);
  const consumableCoverage = ((importPayload?.buffsByFight?.snapshots || [])).filter(snapshot => visibleFightIds.has(String(snapshot?.fightId || ""))).map(snapshot => ({
    fightId: String(snapshot?.fightId || ""),
    fightName: snapshot?.fightName || "Unknown Fight",
    ...getConsumableCoverage(snapshot, playerId, playerName),
  }));
  const coveredConsumableFights = consumableCoverage.filter(entry => entry.fullyCovered).length;
  const consumableIssueCount = consumableCoverage.filter(entry => !entry.fullyCovered).length;
  const scrollCoverageCount = consumableCoverage.reduce((sum, entry) => sum + Number(entry.scrollCount || 0), 0);
  const foodCoverageCount = consumableCoverage.filter(entry => entry.hasFood).length;
  const elixirCoverageCount = consumableCoverage.filter(entry => entry.hasElixirCoverage).length;
  const elixirUnitCoverageCount = consumableCoverage.reduce((sum, entry) => sum + Number(entry.elixirUnitsCovered || 0), 0);
  const elixirUnitRequirementCount = consumableCoverage.reduce((sum, entry) => sum + Number(entry.elixirUnitsRequired || 0), 0);
  const scrollIssueCount = consumableCoverage.filter(entry => !entry.hasScroll).length;
  const foodIssueCount = consumableCoverage.filter(entry => !entry.hasFood).length;
  const elixirIssueCount = consumableCoverage.filter(entry => !entry.hasElixirCoverage).length;
  const fullCastsEntry = (importPayload?.fullCasts?.entries || []).find(entry =>
    String(entry?.id || "") === String(playerId) || entry?.name === playerName
  );
  const potionUseCount = countMatchingCasts(fullCastsEntry, { nameTokens: POTION_NAME_TOKENS });
  const healthstoneCountFromCasts = countMatchingCasts(fullCastsEntry, { ids: HEALTHSTONE_CAST_IDS, nameTokens: HEALTHSTONE_NAME_TOKENS });
  const healthstoneCountFromHealing = (fights || []).reduce((sum, fight) => {
    const healingEntry = (fight?.healingDoneEntries || []).find(entry => String(entry?.id) === String(playerId));
    if (!healingEntry) return sum;
    return sum + countMatchingAbilityUses(healingEntry?.abilities || healingEntry, { nameTokens: HEALTHSTONE_NAME_TOKENS });
  }, 0);
  const hearthstoneCount = Math.max(healthstoneCountFromCasts, healthstoneCountFromHealing);
  const drumsCoverage = ((importPayload?.drumsByFight?.snapshots || []))
    .filter(snapshot => visibleFightIds.has(String(snapshot?.fightId || "")))
    .map(snapshot => getDrumFightCoverage(snapshot, playerId, playerName))
    .filter(row => row.casts > 0 || row.affectedTargets > 0);
  const drumsCastCount = drumsCoverage.reduce((sum, row) => sum + Number(row.casts || 0), 0);
  const drumsAffectedCount = drumsCoverage.reduce((sum, row) => sum + Number(row.affectedTargets || 0), 0);
  const drumsAverageAffected = drumsCastCount > 0 ? drumsAffectedCount / drumsCastCount : 0;

  return {
    hasGearData: snapshots.length > 0,
    gearIssueSummary: {
      missingPermanentEnchantCount: uniqueMissingPermanent.length,
      missingTemporaryEnchantCount: uniqueMissingTemporary.length,
      suboptimalTemporaryEnchantCount: uniqueSuboptimalTemporary.length,
      lowQualityGemCount: summarizedCommonGems.reduce((sum, issue) => sum + issue.count, 0)
        + summarizedUncommonGems.reduce((sum, issue) => sum + issue.count, 0),
    },
    missingEnchants: {
      missingPermanent: uniqueMissingPermanent,
      missingTemporary: uniqueMissingTemporary,
    },
    temporaryEnchantIssues: {
      activeTemporaryEnchants: uniqueActiveTemporary,
      suboptimalTemporaryEnchants: uniqueSuboptimalTemporary,
    },
    gemIssues: {
      commonQualityGems: uniqueCommonGems,
      uncommonQualityGems: uniqueUncommonGems,
      rareQualityGems: [],
    },
    consumableCoverage,
    coveredConsumableFights,
    totalConsumableFights: consumableCoverage.length,
    consumableIssueCount,
    scrollCoverageCount,
    foodCoverageCount,
    elixirCoverageCount,
    elixirUnitCoverageCount,
    elixirUnitRequirementCount,
    scrollIssueCount,
    foodIssueCount,
    elixirIssueCount,
    potionUseCount,
    hearthstoneCount,
    drumsCoverage,
    drumsCastCount,
    drumsAffectedCount,
    drumsAverageAffected,
  };
}

function sortMetricTags(tags) {
  return [...tags].sort((a, b) => {
    const aZero = Number(a.sortValue || 0) === 0;
    const bZero = Number(b.sortValue || 0) === 0;
    if (aZero !== bZero) return aZero ? 1 : -1;

    const toneDelta = (PILL_TONE_ORDER[a.tone] ?? 99) - (PILL_TONE_ORDER[b.tone] ?? 99);
    if (toneDelta !== 0) return toneDelta;

    const valueDelta = Number(b.sortValue || 0) - Number(a.sortValue || 0);
    if (valueDelta !== 0) return valueDelta;

    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });
}

function aggregateAbilityBreakdown(fights, field, playerId) {
  if (!playerId) return [];

  const grouped = new Map();

  for (const fight of fights || []) {
    const entry = (fight[field] || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;

    const abilities = [
      entry.abilities,
      entry.entries,
      entry.spells,
      entry.sources,
      entry.targets,
    ].find(value => Array.isArray(value) && value.length > 0)
      ? [
        entry.abilities,
        entry.entries,
        entry.spells,
        entry.sources,
        entry.targets,
      ].find(value => Array.isArray(value) && value.length > 0)
      : [{
        guid: entry.guid ?? entry.id ?? null,
        icon: entry.icon ?? entry.iconName ?? entry.iconname ?? "",
        name: field === "healingDoneEntries" ? "All Healing" : "All Damage",
        total: entry.total ?? 0,
        activeTime: entry.activeTime ?? entry.uptime ?? 0,
        hits: entry.hits ?? entry.totalHits ?? entry.hitCount ?? entry.landedHits ?? entry.count ?? 0,
        casts: entry.casts ?? entry.totalUses ?? entry.uses ?? entry.useCount ?? entry.executeCount ?? 0,
        crits: entry.crits ?? entry.criticalHits ?? entry.critCount ?? entry.critHits ?? entry.critHitCount ?? 0,
        overheal: entry.overheal ?? 0,
        absorbed: entry.absorbed ?? 0,
      }];

    for (const ability of abilities) {
      const key = String(ability.guid ?? ability.name ?? "unknown");
      const existing = grouped.get(key) || {
        key,
        guid: ability.guid ?? null,
        icon: ability.icon ?? ability.iconName ?? ability.iconname ?? "",
        name: ability.name || "Unknown Ability",
        total: 0,
        activeTime: 0,
        hits: 0,
        casts: 0,
        crits: 0,
        overheal: 0,
        absorbed: 0,
      };

      if (!existing.icon) {
        existing.icon = ability.icon ?? ability.iconName ?? ability.iconname ?? "";
      }
      existing.total += ability.total || 0;
      existing.activeTime += ability.activeTime || 0;
      existing.hits += ability.hits ?? ability.totalHits ?? ability.hitCount ?? ability.landedHits ?? ability.count ?? 0;
      existing.casts += ability.casts ?? ability.totalUses ?? ability.uses ?? ability.useCount ?? ability.executeCount ?? 0;
      existing.crits += ability.crits ?? ability.criticalHits ?? ability.critCount ?? ability.critHits ?? ability.critHitCount ?? 0;
      existing.overheal += ability.overheal || 0;
      existing.absorbed += ability.absorbed || 0;
      grouped.set(key, existing);
    }
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function collectSummaryStatRows(node, mode, path = "root", rows = []) {
  if (!node) return rows;

  if (Array.isArray(node)) {
    node.forEach((entry, index) => collectSummaryStatRows(entry, mode, `${path}[${index}]`, rows));
    return rows;
  }

  if (typeof node !== "object") return rows;

  const lowerPath = path.toLowerCase();
  const isHealingBranch = lowerPath.includes("heal");
  const isDamageBranch = lowerPath.includes("damage") || lowerPath.includes("dps");
  const total = Number(node.total ?? node.amount ?? node.effectiveHealing ?? 0);
  const casts = Number(node.casts ?? node.totalUses ?? node.uses ?? node.useCount ?? node.executeCount ?? 0);
  const hits = Number(node.hits ?? node.totalHits ?? node.hitCount ?? node.landedHits ?? node.count ?? 0);
  const crits = Number(node.crits ?? node.criticalHits ?? node.critCount ?? node.critHits ?? node.critHitCount ?? 0);
  const activeTime = Number(node.activeTime ?? node.uptime ?? node.totalUptime ?? 0);
  const hasUsableStats = [total, casts, hits, crits, activeTime].some(value => Number.isFinite(value) && value > 0);
  const name = typeof node.name === "string" ? node.name.trim() : "";

  const modeMatches =
    mode === "healing"
      ? (isHealingBranch || (!isDamageBranch && Number(node.overheal ?? 0) > 0))
      : (!isHealingBranch || isDamageBranch);

  if (name && hasUsableStats && modeMatches) {
    rows.push({
      key: `${node.guid ?? node.gameID ?? name}-${path}`,
      guid: node.guid ?? node.gameID ?? node.abilityGameID ?? null,
      icon: node.icon || node.iconName || node.iconname || node.abilityIcon || node.ability?.icon || node.ability?.iconName || "",
      name,
      total,
      activeTime,
      hits,
      casts,
      crits,
      overheal: Number(node.overheal ?? 0),
      absorbed: Number(node.absorbed ?? 0),
    });
  }

  Object.entries(node).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      collectSummaryStatRows(value, mode, `${path}.${key}`, rows);
    }
  });

  return rows;
}

function buildSummaryAbilityBreakdown(summary, mode) {
  const grouped = new Map();
  const rows = collectSummaryStatRows(summary, mode);

  for (const row of rows) {
    const key = String(row.guid ?? row.name ?? row.key);
    const existing = grouped.get(key) || {
      key,
      guid: row.guid ?? null,
      icon: row.icon || "",
      name: row.name || "Unknown Ability",
      total: 0,
      activeTime: 0,
      hits: 0,
      casts: 0,
      crits: 0,
      overheal: 0,
      absorbed: 0,
    };

    if (!existing.icon) {
      existing.icon = row.icon || "";
    }
    existing.total += row.total || 0;
    existing.activeTime += row.activeTime || 0;
    existing.hits += row.hits || 0;
    existing.casts += row.casts || 0;
    existing.crits += row.crits || 0;
    existing.overheal += row.overheal || 0;
    existing.absorbed += row.absorbed || 0;
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .filter(row => row.total > 0 || row.casts > 0 || row.hits > 0 || row.crits > 0)
    .sort((a, b) => b.total - a.total);
}

function hasVisibleBreakdownStats(entries = []) {
  return (entries || []).some(entry =>
    Number(entry?.total || 0) > 0
    || Number(entry?.casts || 0) > 0
    || Number(entry?.hits || 0) > 0
    || Number(entry?.crits || 0) > 0
    || Number(entry?.activeTime || 0) > 0
    || Number(entry?.overheal || 0) > 0
    || Number(entry?.absorbed || 0) > 0
  );
}

function getPlayerAbilityTotalFromFights(fights, playerId, abilityIds) {
  if (!playerId) return 0;

  let total = 0;

  for (const fight of fights || []) {
    const entry = (fight.damageDoneEntries || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;

    for (const ability of entry.abilities || []) {
      const guid = ability?.guid != null ? String(ability.guid) : "";
      if (abilityIds.has(guid)) {
        total += Number(ability?.total || 0);
      }
    }
  }

  return total;
}

function getAbilityEntryCountsByPlayer(fights, abilityIds) {
  const totalsByPlayerId = new Map();

  for (const fight of fights || []) {
    for (const entry of fight.damageDoneEntries || []) {
      let entryTotal = 0;

      for (const ability of entry.abilities || []) {
        const guid = ability?.guid != null ? String(ability.guid) : "";
        if (abilityIds.has(guid)) {
          entryTotal += Number(ability?.total || 0);
        }
      }

      if (entryTotal > 0) {
        totalsByPlayerId.set(String(entry.id), (totalsByPlayerId.get(String(entry.id)) || 0) + entryTotal);
      }
    }
  }

  return totalsByPlayerId;
}

function normalizeEncounterEventTimestamp(timestamp, fight) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return null;

  const durationMs = Number(fight?.durationMs || 0);
  const startTime = Number(fight?.startTime || 0);
  if (value > durationMs + 5000 && startTime > 0) {
    return Math.max(0, value - startTime);
  }
  return Math.max(0, value);
}

function getEventTypeToken(event) {
  return String(event?.type || "").toLowerCase();
}

function isDamageLikeEvent(event) {
  const type = getEventTypeToken(event);
  return type.includes("damage") || type.includes("swing") || type.includes("cast") || Number(event?.overkill || 0) > 0 || Number(event?.damage || 0) > 0;
}

function isHealingLikeEvent(event) {
  const type = getEventTypeToken(event);
  return type.includes("heal") || Number(event?.healing || 0) > 0 || Number(event?.overheal || 0) > 0;
}

function getEventAmount(event, kind = "damage") {
  if (kind === "healing") {
    return Number(event?.amount ?? event?.healing ?? 0) || 0;
  }
  return Number(event?.amount ?? event?.damage ?? 0) || 0;
}

function getAbilityName(value, fallback = "Unknown Ability") {
  return value?.abilityName || value?.name || (value?.abilityGuid != null ? `Spell ${value.abilityGuid}` : fallback);
}

function getSourceName(value) {
  return value?.sourceName || "Unknown Source";
}

function formatEventSummary(event) {
  const amount = getEventAmount(event, isHealingLikeEvent(event) ? "healing" : "damage");
  const actor = getSourceName(event);
  const ability = getAbilityName(event, "Unknown");
  const prefix = actor && actor !== "Unknown Source" ? `${actor} - ` : "";
  return `${prefix}${ability}${amount ? ` (${amount.toLocaleString()})` : ""}`;
}

function EventSummary({ event, emphasizeTime = false }) {
  const amount = getEventAmount(event, isHealingLikeEvent(event) ? "healing" : "damage");
  const actor = getSourceName(event);
  const ability = getAbilityName(event, "Unknown");
  const prefix = actor && actor !== "Unknown Source" ? `${actor} - ` : "";
  const spellId = event?.abilityGuid;

  return (
    <span style={{ color: emphasizeTime ? "#ff8d8d" : "inherit" }}>
      {prefix}
      {spellId ? <WowheadSpellLink spellId={spellId}>{ability}</WowheadSpellLink> : ability}
      {amount ? ` (${amount.toLocaleString()})` : ""}
    </span>
  );
}

function getDeathTimelineEventTone(event) {
  const type = getEventTypeToken(event);
  if (type === "death") return "#ff8d8d";
  if (isHealingLikeEvent(event)) return "#9fe3b1";
  return "#ffd5d5";
}

function getDeathTimelineEventLabel(event) {
  const type = getEventTypeToken(event);
  if (type === "death") return "Death";
  if (isHealingLikeEvent(event)) return "Healing";
  return "Damage";
}

function buildDeathDetailRows(fights, playerId) {
  if (!playerId) return [];

  const rows = [];

  for (const fight of fights || []) {
    const entry = (fight.deathEntries || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;

    for (const deathEvent of entry.events || []) {
      const recapEvents = (deathEvent.events || []).length ? (deathEvent.events || []) : [deathEvent];
      const timestampMs = normalizeEncounterEventTimestamp(deathEvent.timestamp ?? entry.timestamp, fight);
      const timelineEvents = recapEvents
        .map(event => ({
          ...event,
          timestampMs: normalizeEncounterEventTimestamp(event.timestamp, fight),
        }))
        .sort((left, right) => Number(left.timestampMs || 0) - Number(right.timestampMs || 0));
      const finalEvent = timelineEvents[timelineEvents.length - 1] || deathEvent;
      const deathTimelineEvent = {
        type: "death",
        timestamp: deathEvent.timestamp ?? entry.timestamp ?? finalEvent?.timestamp ?? 0,
        timestampMs,
        abilityGuid: entry.killingBlow?.abilityGuid ?? finalEvent?.abilityGuid ?? null,
        abilityName: entry.killingBlow?.abilityName || finalEvent?.abilityName || "Death",
        sourceName: entry.killingBlow?.sourceName || finalEvent?.sourceName || "",
        amount: Number(entry.damageTotal || getEventAmount(finalEvent, "damage") || 0),
        damage: Number(entry.damageTotal || getEventAmount(finalEvent, "damage") || 0),
        healing: Number(entry.healingTotal || 0),
        overkill: Number(entry.overkill || finalEvent?.overkill || 0),
      };
      timelineEvents.push(deathTimelineEvent);

      rows.push({
        key: `${fight.id}-${deathEvent.timestamp}-${rows.length}`,
        fightId: String(fight.id),
        fightName: fight.name || "Unknown Fight",
        timestampMs,
        timestampLabel: formatDuration(timestampMs),
        events: timelineEvents,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.fightId !== b.fightId) return a.fightName.localeCompare(b.fightName, "en", { sensitivity: "base" });
    return (a.timestampMs ?? 0) - (b.timestampMs ?? 0);
  });
}

function getPlayerDeathCountFromFights(fights, playerId) {
  if (!playerId) return 0;

  let total = 0;
  for (const fight of fights || []) {
    const entry = (fight.deathEntries || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;
    total += getDeathEntryTotal(entry);
  }

  return total;
}

function getSelectedFightPlayerSnapshot(fights, fightId, playerId) {
  const fight = (fights || []).find(entry => String(entry.id) === String(fightId));
  if (!fight) return null;
  return fight.playerSnapshots?.find(entry => String(entry.id) === String(playerId)) || null;
}

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDateShort(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(value);
  }
}

function formatDuration(ms) {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatEncounterSelectionDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMetricValue(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 100) return `${Math.round(value)}%`;
  if (value >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function formatPerSecond(total, activeTimeMs) {
  const totalNumber = Number(total || 0);
  const activeMs = Number(activeTimeMs || 0);
  if (!Number.isFinite(totalNumber) || !Number.isFinite(activeMs) || activeMs <= 0) return "0";
  return Math.round(totalNumber / (activeMs / 1000)).toLocaleString();
}

function getFightTypeLabel(fight) {
  return fight.encounterId > 0 ? "Encounter" : "Trash";
}

function getEncounterOptions(fights) {
  const perEncounterCount = new Map();
  const options = [];

  for (const fight of fights || []) {
    if (!(fight.encounterId > 0)) continue;
    const encounterKey = `${fight.encounterId}:${fight.name}`;
    const nextCount = (perEncounterCount.get(encounterKey) || 0) + 1;
    perEncounterCount.set(encounterKey, nextCount);

    const prefix = fight.kill ? "Kill" : `Wipe ${nextCount}`;
    options.push({
      id: String(fight.id),
      label: `${prefix}: ${fight.name} (${formatEncounterSelectionDuration(fight.durationMs)})`,
      encounterId: fight.encounterId,
      fightName: fight.name,
      kill: fight.kill,
      speedParsePercent: fight.kill && Number.isFinite(Number(fight.speedParsePercent)) && Number(fight.speedParsePercent) > 0
        ? Number(fight.speedParsePercent)
        : null,
    });
  }

  return options;
}

function filterFights(fights, mode, selectedFightId, outcome = "") {
  return (fights || []).filter(fight => {
    const isEncounter = fight.encounterId > 0;

    if (mode === "encounters" && !isEncounter) return false;
    if (mode === "trash" && isEncounter) return false;
    if (isEncounter && outcome === "kills" && !fight.kill) return false;
    if (isEncounter && outcome === "wipes" && fight.kill) return false;
    if (selectedFightId === ALL_VISIBLE_ENCOUNTERS_ID) {
      return isEncounter;
    }
    if (selectedFightId === ALL_KILLS_ENCOUNTERS_ID) {
      return isEncounter && fight.kill;
    }
    if (selectedFightId === ALL_WIPES_ENCOUNTERS_ID) {
      return isEncounter && !fight.kill;
    }
    if (selectedFightId && String(fight.id) !== String(selectedFightId)) return false;

    return true;
  });
}

function ImportProgressModal({ open, progress }) {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    if (!open) {
      setDisplayPercent(0);
      return undefined;
    }

    const target = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
    const tick = () => {
      setDisplayPercent(current => {
        const delta = target - current;
        if (Math.abs(delta) < 0.35) return target;
        return current + (delta * 0.18);
      });
    };

    const intervalId = window.setInterval(tick, 48);
    tick();
    return () => window.clearInterval(intervalId);
  }, [open, progress?.percent]);

  if (!open) return null;
  const visibleSteps = (progress.steps || []).slice(0, 10);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10000,
      background: "rgba(0,0,0,0.65)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: space[4],
    }}>
      <div style={{
        ...panelStyle,
        width: 440,
        maxWidth: "100%",
        padding: space[6],
        display: "flex",
        flexDirection: "column",
        gap: space[4],
      }}>
        <div>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>Importing Raid</div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4 }}>
            {progress.message}
          </div>
          {!!progress.detail && (
            <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 8, fontFamily: font.mono }}>
              {progress.detail}
            </div>
          )}
        </div>

        <div style={{ height: 12, background: surface.base, border: `1px solid ${border.subtle}`, borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${displayPercent}%`,
            height: "100%",
            background: "linear-gradient(90deg, #3d7dca 0%, #5fb3ff 55%, #87d7ff 100%)",
            transition: "width 0.18s linear",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: text.muted }}>
          <span>{progress.completed} / {progress.total} steps</span>
          <span>{Math.round(displayPercent)}%</span>
        </div>

        {!!visibleSteps.length && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: space[2],
            padding: space[3],
            border: `1px solid ${border.subtle}`,
            borderRadius: radius.base,
            background: "rgba(14, 24, 38, 0.72)",
          }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Staged API Calls
            </div>
            {visibleSteps.map(step => {
              const isActive = step.key === progress.activeStepKey;
              const isDone = !!step.completed;
              const tone = isDone ? "#7fd6a3" : (isActive ? "#8fc8ff" : text.muted);
              return (
                <div
                  key={step.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px minmax(0, 1fr)",
                    gap: space[2],
                    alignItems: "start",
                  }}
                >
                  <div style={{ color: tone, fontSize: fontSize.sm, lineHeight: 1.2 }}>
                    {isDone ? "●" : (isActive ? "◉" : "○")}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fontSize.sm, color: isDone || isActive ? text.primary : text.secondary }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: fontSize.xs, color: tone, fontFamily: font.mono, marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {step.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!!progress.subdetail && (
          <div style={{
            fontSize: fontSize.xs,
            color: "#8fc8ff",
            fontFamily: font.mono,
            padding: `${space[2]}px ${space[3]}px`,
            borderRadius: radius.base,
            background: "rgba(61, 125, 202, 0.12)",
            border: `1px solid rgba(61, 125, 202, 0.24)`,
          }}>
            {progress.subdetail}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamTagModal({ open, title, confirmLabel, value, onChange, onConfirm, onCancel, allowClear = true }) {
  if (!open) return null;

  const options = allowClear ? TEAM_TAG_OPTIONS.slice(1) : TEAM_TAG_OPTIONS;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10001,
      background: "rgba(0,0,0,0.65)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: space[4],
    }}>
      <div style={{
        ...panelStyle,
        width: 420,
        maxWidth: "100%",
        padding: space[6],
        display: "flex",
        flexDirection: "column",
        gap: space[4],
      }}>
        <div>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>{title}</div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4 }}>
            Choose which raid team this report belongs to.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {options.map(option => {
            const active = normalizeTeamTag(value) === option.id;
            return (
              <button
                key={option.id || "untagged"}
                onClick={() => onChange(option.id)}
                style={{
                  ...btnStyle(active ? "primary" : "default", active),
                  justifyContent: "space-between",
                  height: 40,
                  width: "100%",
                }}
              >
                <span>{option.label}</span>
                {active && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}

          {allowClear && (
            <button
              onClick={() => onChange("")}
              style={{
                ...btnStyle(!normalizeTeamTag(value) ? "primary" : "default", !normalizeTeamTag(value)),
                justifyContent: "space-between",
                height: 40,
                width: "100%",
              }}
            >
              <span>No Team Tag</span>
              {!normalizeTeamTag(value) && <span aria-hidden="true">✓</span>}
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: space[2] }}>
          <button onClick={onCancel} style={btnStyle("default")}>Cancel</button>
          <button onClick={onConfirm} style={btnStyle("primary")}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RenameReportModal({ open, value, onChange, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10001,
      background: "rgba(0,0,0,0.65)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: space[4],
    }}>
      <div style={{
        ...panelStyle,
        width: 420,
        maxWidth: "100%",
        padding: space[6],
        display: "flex",
        flexDirection: "column",
        gap: space[4],
      }}>
        <div>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>Rename Report</div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4 }}>
            Update the label shown in Saved Raids.
          </div>
        </div>

        <input
          autoFocus
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="Enter report name"
          style={{ ...inputStyle, height: 40, width: "100%" }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: space[2] }}>
          <button onClick={onCancel} style={btnStyle("default")}>Cancel</button>
          <button onClick={onConfirm} style={btnStyle("primary")}>Save Name</button>
        </div>
      </div>
    </div>
  );
}

function RaidActionsMenu({ raid, onRename, onTag, onDeleteTag, onReimport, onDelete }) {
  const teamTag = normalizeTeamTag(raid?.teamTag);

  const itemStyle = {
    fontSize: fontSize.xs,
    color: text.secondary,
    fontFamily: font.sans,
    textDecoration: "none",
    padding: `${space[2]}px ${space[2]}px`,
    borderRadius: radius.sm,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    width: "100%",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 34,
        minWidth: 180,
        padding: `${space[2]}px`,
        borderRadius: radius.base,
        border: `1px solid ${border.subtle}`,
        background: surface.panel,
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflow: "visible",
        maxHeight: "none",
        zIndex: 250,
      }}
      onClick={event => event.stopPropagation()}
    >
      <button onClick={onTag} style={itemStyle}>
        <span aria-hidden="true">🏷</span>
        <span>Add Tag</span>
      </button>
      <button onClick={onDeleteTag} disabled={!teamTag} style={{ ...itemStyle, opacity: teamTag ? 1 : 0.45, cursor: teamTag ? "pointer" : "not-allowed" }}>
        <span aria-hidden="true">⌫</span>
        <span>Delete Tag</span>
      </button>
      <button onClick={onRename} style={itemStyle}>
        <span aria-hidden="true">✎</span>
        <span>Rename Report</span>
      </button>
      <button onClick={onReimport} style={itemStyle}>
        <span aria-hidden="true">↻</span>
        <span>Reimport Report</span>
      </button>
      <button onClick={onDelete} style={{ ...itemStyle, color: intent.danger }}>
        <span aria-hidden="true">🗑</span>
        <span>Delete Report</span>
      </button>
    </div>
  );
}

function DiscordLoginGate() {
  return (
    <div style={{ minHeight: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.sans }}>
      <div style={{
        ...panelStyle,
        width: 360,
        maxWidth: "90vw",
        padding: space[6],
        display: "flex",
        flexDirection: "column",
        gap: space[3],
      }}>
        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: text.primary }}>RPB</div>
        <div style={{ fontSize: fontSize.base, color: text.secondary, lineHeight: 1.5 }}>
          Sign in with Discord to access the RPB workspace.
        </div>
        <a
          href={getLoginUrl("/rpb")}
          style={{
            ...btnStyle("primary"),
            width: "100%",
            height: 40,
            justifyContent: "center",
            textDecoration: "none",
            background: "#5865F2",
            borderColor: "#4752C4",
            color: "#fff",
          }}
        >
          Sign in with Discord
        </a>
      </div>
    </div>
  );
}

export default function RpbPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { raidId } = useParams();

  const [reportUrl, setReportUrl] = useState("");
  const [profileApiKey, setProfileApiKey] = useState("");
  const [profileV2ClientId, setProfileV2ClientId] = useState("");
  const [profileV2ClientSecret, setProfileV2ClientSecret] = useState("");
  const [raids, setRaids] = useState([]);
  const [selectedRaid, setSelectedRaid] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const suppressAutoSelectPlayerRef = useRef(false);
  const [itemMetaById, setItemMetaById] = useState({});
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRaid, setLoadingRaid] = useState(false);
  const [importing, setImporting] = useState(false);
  const [teamFilter, setTeamFilter] = useState("");
  const [openRaidMenuId, setOpenRaidMenuId] = useState("");
  const [tagModalState, setTagModalState] = useState({ open: false, raid: null, value: "" });
  const [importTagPrompt, setImportTagPrompt] = useState({ open: false, raid: null, value: "", resolve: null });
  const [renameModalState, setRenameModalState] = useState({ open: false, raid: null, value: "" });
  const [deleteConfirmRaid, setDeleteConfirmRaid] = useState(null);
  const [raidAnalyticsFilter, setRaidAnalyticsFilter] = useState("");
  const [filterMode, setFilterMode] = useState("encounters-and-trash");
  const [fightOutcomeFilter, setFightOutcomeFilter] = useState("");
  const [selectedFightId, setSelectedFightId] = useState("");
  const [sliceType, setSliceType] = useState("damage");
  const abilityBreakdownRef = useRef(null);
  const [importProgress, setImportProgress] = useState({
    open: false,
    completed: 0,
    total: 17,
    percent: 0,
    message: "",
    detail: "",
    subdetail: "",
    activeStepKey: "",
    steps: [],
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    window.wowhead_tooltips = {
      ...(window.wowhead_tooltips || {}),
      iconizelinks: false,
      renamelinks: false,
      colorlinks: false,
    };
    if (document.querySelector('script[data-wowhead-power="true"]')) return undefined;

    const script = document.createElement("script");
    script.src = "https://wow.zamimg.com/widgets/power.js";
    script.async = true;
    script.dataset.wowheadPower = "true";
    document.body.appendChild(script);

    return () => {};
  }, []);

  useEffect(() => {
    if (!openRaidMenuId) return undefined;

    function handleWindowClick() {
      setOpenRaidMenuId("");
    }

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [openRaidMenuId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaids() {
      setLoadingList(true);
      try {
        const nextRaids = await fetchRpbRaidList();
        if (!cancelled) {
          setRaids(nextRaids);
          if (!raidId && nextRaids[0]?.id) {
            navigate(`/rpb/${nextRaids[0].id}`, { replace: true });
          }
        }
      } catch (error) {
        if (!cancelled) toast({ message: `Failed to load saved raids: ${error.message}`, type: "danger" });
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    loadRaids();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaid() {
      const normalizedTeamFilter = normalizeTeamTag(teamFilter);
      const visibleRaids = normalizedTeamFilter
        ? raids.filter(raid => normalizeTeamTag(raid.teamTag) === normalizedTeamFilter)
        : raids;
      const noReportsForFilter = !loadingList && !!normalizedTeamFilter && visibleRaids.length === 0;
      const raidVisibleForFilter = !raidId || !normalizedTeamFilter || visibleRaids.some(raid => raid.id === raidId);

      if (!raidId || noReportsForFilter || !raidVisibleForFilter) {
        setSelectedRaid(null);
        setSelectedPlayerId("");
        setLoadingRaid(false);
        return;
      }

      setLoadingRaid(true);
      try {
        const raid = await fetchRpbRaidBundle(raidId);
        if (!cancelled) {
          setSelectedRaid(raid);
          setSelectedFightId(getDefaultSelectedFightId(raid));
          setSelectedPlayerId("");
        }
      } catch (error) {
        if (!cancelled) toast({ message: `Failed to load raid: ${error.message}`, type: "danger" });
      } finally {
        if (!cancelled) setLoadingRaid(false);
      }
    }

    loadRaid();
    return () => { cancelled = true; };
  }, [loadingList, raidId, raids, teamFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileApiKey() {
      if (auth.loading) return;

      try {
        const profile = await fetchUserProfile(auth.user?.discordId || LOCAL_SANDBOX_PROFILE_ID);
        if (!cancelled) {
          setProfileApiKey(profile?.wclV1ApiKey || "");
          setProfileV2ClientId(profile?.wclV2ClientId || "");
          setProfileV2ClientSecret(profile?.wclV2ClientSecret || "");
        }
      } catch {
        if (!cancelled) return;
      }
    }

    loadProfileApiKey();
    return () => { cancelled = true; };
  }, [auth.authenticated, auth.loading, auth.user?.discordId]);

  const selectedPlayer = useMemo(() => {
    return selectedRaid?.players?.find(player => String(player.id) === String(selectedPlayerId)) || null;
  }, [selectedRaid, selectedPlayerId]);
  const isPlayerDetailOpen = !!selectedPlayerId && !!selectedPlayer;

  function toggleSelectedPlayer(playerId) {
    setSelectedPlayerId(current => {
      const isClosing = String(current) === String(playerId);
      suppressAutoSelectPlayerRef.current = isClosing;
      return isClosing ? "" : String(playerId);
    });
  }

  function closeSelectedPlayer() {
    suppressAutoSelectPlayerRef.current = true;
    setSelectedPlayerId("");
  }

  const raidAnalytics = selectedRaid?.analytics || {
    playersMissingEnchants: [],
    engineeringDamageTaken: [],
    oilOfImmolationDamageTaken: [],
    playersWithBuffData: [],
    playersUsingDrums: [],
    playersWithSuboptimalWeaponEnchants: [],
    playersWithConsumableIssues: [],
    playersUsingHearthstone: [],
  };

  const visibleEncounterSourceFights = useMemo(() => {
    return filterFights(selectedRaid?.fights || [], filterMode, "", fightOutcomeFilter);
  }, [selectedRaid, filterMode, fightOutcomeFilter]);

  const encounterOptions = useMemo(() => getEncounterOptions(visibleEncounterSourceFights), [visibleEncounterSourceFights]);

  const filteredFights = useMemo(() => {
    return filterFights(selectedRaid?.fights || [], filterMode, selectedFightId, fightOutcomeFilter);
  }, [selectedRaid, filterMode, selectedFightId, fightOutcomeFilter]);
  const filteredPlayerAnalyticsById = useMemo(() => {
    const next = new Map();

    for (const player of selectedRaid?.players || []) {
      next.set(
        String(player.id),
        derivePlayerAnalyticsFromFights(filteredFights, player.id, player.name, player.type, selectedRaid?.importPayload)
      );
    }

    return next;
  }, [filteredFights, selectedRaid]);
  const filteredEngineeringTotalsByPlayerId = useMemo(() => {
    return getAbilityEntryCountsByPlayer(filteredFights, ENGINEERING_DAMAGE_ABILITY_IDS);
  }, [filteredFights]);
  const filteredOilTotalsByPlayerId = useMemo(() => {
    return getAbilityEntryCountsByPlayer(filteredFights, OIL_OF_IMMOLATION_ABILITY_IDS);
  }, [filteredFights]);
  const filteredRaidAnalytics = useMemo(() => {
    const playersWithIssues = [];
    const playersWithEngineeringDamage = [];
    const playersWithOilDamage = [];
    const playersUsingDrums = [];
    const playersWithConsumableIssues = [];
    const playersUsingHearthstone = [];

    for (const player of selectedRaid?.players || []) {
      const analytics = filteredPlayerAnalyticsById.get(String(player.id));
      if (!analytics) continue;

      const totalIssues =
        Number(analytics.gearIssueSummary?.missingPermanentEnchantCount || 0)
        + Number(analytics.gearIssueSummary?.missingTemporaryEnchantCount || 0)
        + Number(analytics.gearIssueSummary?.suboptimalTemporaryEnchantCount || 0)
        + Number(analytics.gearIssueSummary?.lowQualityGemCount || 0);

      if (totalIssues > 0) {
        playersWithIssues.push({
          playerId: String(player.id),
          name: player.name,
          type: player.type,
          gearIssueSummary: analytics.gearIssueSummary,
          totalIssues,
        });
      }

      const engineeringTotal = Number(filteredEngineeringTotalsByPlayerId.get(String(player.id)) || 0);
      if (engineeringTotal > 0) {
        playersWithEngineeringDamage.push({
          playerId: String(player.id),
          name: player.name,
          total: engineeringTotal,
        });
      }

      const oilTotal = Number(filteredOilTotalsByPlayerId.get(String(player.id)) || 0);
      if (oilTotal > 0) {
        playersWithOilDamage.push({
          playerId: String(player.id),
          name: player.name,
          total: oilTotal,
        });
      }

      const consumableIssues = Number(analytics.consumableIssueCount || 0);
      if (consumableIssues > 0) {
        playersWithConsumableIssues.push({
          playerId: String(player.id),
          name: player.name,
          total: consumableIssues,
          covered: Number(analytics.coveredConsumableFights || 0),
          totalFights: Number(analytics.totalConsumableFights || 0),
        });
      }

      const drumsCastCount = Number(analytics.drumsCastCount || 0);
      if (drumsCastCount > 0) {
        playersUsingDrums.push({
          playerId: String(player.id),
          name: player.name,
          total: drumsCastCount,
          affectedTargets: Number(analytics.drumsAffectedCount || 0),
        });
      }

      const hearthstoneCount = Number(player.analytics?.hearthstoneCount || analytics.hearthstoneCount || 0);
      if (hearthstoneCount > 0) {
        playersUsingHearthstone.push({
          playerId: String(player.id),
          name: player.name,
          total: hearthstoneCount,
        });
      }
    }

    return {
      ...raidAnalytics,
      playersMissingEnchants: playersWithIssues.sort((a, b) => b.totalIssues - a.totalIssues),
      engineeringDamageTaken: playersWithEngineeringDamage.sort((a, b) => b.total - a.total),
      oilOfImmolationDamageTaken: playersWithOilDamage.sort((a, b) => b.total - a.total),
      playersUsingDrums: playersUsingDrums.sort((a, b) => b.total - a.total),
      playersWithConsumableIssues: playersWithConsumableIssues.sort((a, b) => b.total - a.total),
      playersUsingHearthstone: playersUsingHearthstone.sort((a, b) => b.total - a.total),
    };
  }, [filteredEngineeringTotalsByPlayerId, filteredOilTotalsByPlayerId, filteredPlayerAnalyticsById, raidAnalytics, selectedRaid]);
  const raidAnalyticsFilterIds = useMemo(() => {
    switch (raidAnalyticsFilter) {
      case "missing-enchants":
        return new Set(filteredRaidAnalytics.playersMissingEnchants.map(entry => String(entry.playerId)));
      case "engineering":
        return new Set(filteredRaidAnalytics.engineeringDamageTaken.map(entry => String(entry.playerId)));
      case "oil":
        return new Set(filteredRaidAnalytics.oilOfImmolationDamageTaken.map(entry => String(entry.playerId)));
      case "buffs":
        return new Set((filteredRaidAnalytics.playersWithBuffData || raidAnalytics.playersWithBuffData || []).map(entry => String(entry.playerId)));
      case "drums":
        return new Set((filteredRaidAnalytics.playersUsingDrums || raidAnalytics.playersUsingDrums || []).map(entry => String(entry.playerId)));
      case "suboptimal-enchants":
        return new Set((filteredRaidAnalytics.playersWithSuboptimalWeaponEnchants || raidAnalytics.playersWithSuboptimalWeaponEnchants || []).map(entry => String(entry.playerId)));
      case "consumables":
        return new Set((filteredRaidAnalytics.playersWithConsumableIssues || raidAnalytics.playersWithConsumableIssues || []).map(entry => String(entry.playerId)));
      case "hearthstone":
        return new Set((filteredRaidAnalytics.playersUsingHearthstone || raidAnalytics.playersUsingHearthstone || []).map(entry => String(entry.playerId)));
      default:
        return null;
    }
  }, [filteredRaidAnalytics, raidAnalytics, raidAnalyticsFilter]);
  const sortedRaids = useMemo(() => {
    return [...raids].sort((a, b) => new Date(b.start || b.importedAt || 0) - new Date(a.start || a.importedAt || 0));
  }, [raids]);
  const filteredRaids = useMemo(() => {
    const normalizedFilter = normalizeTeamTag(teamFilter);
    if (!normalizedFilter) return sortedRaids;
    return sortedRaids.filter(raid => normalizeTeamTag(raid.teamTag) === normalizedFilter);
  }, [sortedRaids, teamFilter]);
  const noReportsForActiveTeamFilter = !loadingList && !!teamFilter && filteredRaids.length === 0;
  const sliceField = sliceType === "healing" ? "healingDoneEntries" : (sliceType === "deaths" ? "deathEntries" : "damageDoneEntries");
  const showKillParseForSlice = useMemo(() => (
    sliceType !== "deaths"
    && filteredFights.length === 1
    && Number(filteredFights[0]?.encounterId) > 0
  ), [filteredFights, sliceType]);
  const aggregatedSliceEntries = useMemo(() => {
    const entries = aggregateMetricEntries(filteredFights, sliceField);
    if (showKillParseForSlice) return entries;
    return entries.map(entry => ({
      ...entry,
      parsePercent: null,
      parseTotal: 0,
      parseCount: 0,
    }));
  }, [filteredFights, showKillParseForSlice, sliceField]);
  const visibleAggregatedSliceEntries = useMemo(() => {
    if (!raidAnalyticsFilterIds) return aggregatedSliceEntries;
    return aggregatedSliceEntries.filter(entry => raidAnalyticsFilterIds.has(String(entry.id)));
  }, [aggregatedSliceEntries, raidAnalyticsFilterIds]);
  const visibleConsumableSliceEntries = useMemo(() => {
    return buildConsumableSliceEntries(selectedRaid?.players || [], filteredPlayerAnalyticsById, raidAnalyticsFilterIds);
  }, [filteredPlayerAnalyticsById, raidAnalyticsFilterIds, selectedRaid]);
  const visibleDrumSliceEntries = useMemo(() => {
    return buildDrumSliceEntries(selectedRaid?.players || [], filteredPlayerAnalyticsById, raidAnalyticsFilterIds);
  }, [filteredPlayerAnalyticsById, raidAnalyticsFilterIds, selectedRaid]);
  const selectedPlayerDamageBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "damageDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerHealingBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "healingDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerSummaryDamageBreakdown = useMemo(() => buildSummaryAbilityBreakdown(selectedPlayer?.summary, "damage"), [selectedPlayer?.summary]);
  const selectedPlayerSummaryHealingBreakdown = useMemo(() => buildSummaryAbilityBreakdown(selectedPlayer?.summary, "healing"), [selectedPlayer?.summary]);
  const visiblePlayerDamageBreakdown = hasVisibleBreakdownStats(selectedPlayerDamageBreakdown)
    ? selectedPlayerDamageBreakdown
    : selectedPlayerSummaryDamageBreakdown;
  const visiblePlayerHealingBreakdown = hasVisibleBreakdownStats(selectedPlayerHealingBreakdown)
    ? selectedPlayerHealingBreakdown
    : selectedPlayerSummaryHealingBreakdown;
  const selectedPlayerDeathRows = useMemo(() => buildDeathDetailRows(filteredFights, selectedPlayerId), [filteredFights, selectedPlayerId]);
  const defaultVisiblePlayerId = useMemo(() => {
    const source = sliceType === "consumables"
      ? visibleConsumableSliceEntries
      : (sliceType === "drums" ? visibleDrumSliceEntries : visibleAggregatedSliceEntries);
    return source?.[0]?.id ? String(source[0].id) : "";
  }, [sliceType, visibleAggregatedSliceEntries, visibleConsumableSliceEntries, visibleDrumSliceEntries]);
  const selectedPlayerSliceTotals = useMemo(() => {
    return getPlayerSliceTotals(filteredFights, selectedPlayerId, selectedPlayer?.role || "");
  }, [filteredFights, selectedPlayer?.role, selectedPlayerId]);
  const selectedPlayerAnalytics = useMemo(() => {
    if (!selectedPlayer) return null;

    const filteredAnalytics = filteredPlayerAnalyticsById.get(String(selectedPlayer.id));
    const persistedAnalytics = selectedPlayer.analytics || {};

    return {
      ...persistedAnalytics,
      ...filteredAnalytics,
      gearIssueSummary: {
        ...(persistedAnalytics.gearIssueSummary || {}),
        ...(filteredAnalytics?.gearIssueSummary || {}),
      },
      missingEnchants: {
        ...(persistedAnalytics.missingEnchants || {}),
        ...(filteredAnalytics?.missingEnchants || {}),
      },
      temporaryEnchantIssues: {
        ...(persistedAnalytics.temporaryEnchantIssues || {}),
        ...(filteredAnalytics?.temporaryEnchantIssues || {}),
      },
      gemIssues: {
        ...(persistedAnalytics.gemIssues || {}),
        ...(filteredAnalytics?.gemIssues || {}),
      },
    };
  }, [filteredPlayerAnalyticsById, selectedPlayer]);

  const filteredPlayers = useMemo(() => {
    const visiblePlayers = (selectedRaid?.players || []).filter(player => {
      if (!player.fightsPresent) return true;
      if (player.fightsPresent <= 0) return false;
      if (!raidAnalyticsFilterIds) return true;
      return raidAnalyticsFilterIds.has(String(player.id));
    });
    return sortPlayersForDisplay(visiblePlayers);
  }, [raidAnalyticsFilterIds, selectedRaid]);

  const selectedPlayerIssueGroups = useMemo(() => {
    if (!selectedPlayerAnalytics) {
      return {
        missingPermanent: [],
        missingTemporary: [],
        suboptimalTemporary: [],
        commonGems: [],
        uncommonGems: [],
        rareGems: [],
      };
    }

    return {
      missingPermanent: dedupeBy(selectedPlayerAnalytics.missingEnchants?.missingPermanent, issue => `${issue.itemId}:${issue.slot}:perm`),
      missingTemporary: dedupeBy(selectedPlayerAnalytics.missingEnchants?.missingTemporary, issue => `${issue.itemId}:${issue.slot}:temp`),
      suboptimalTemporary: dedupeBy(selectedPlayerAnalytics.temporaryEnchantIssues?.suboptimalTemporaryEnchants, issue => `${issue.itemId}:${issue.slot}:${issue.enchantId}`),
      commonGems: summarizeGemIssues(selectedPlayerAnalytics.gemIssues?.commonQualityGems),
      uncommonGems: summarizeGemIssues(selectedPlayerAnalytics.gemIssues?.uncommonQualityGems),
      rareGems: summarizeGemIssues(selectedPlayerAnalytics.gemIssues?.rareQualityGems),
    };
  }, [selectedPlayerAnalytics]);

  const selectedFightSnapshot = useMemo(() => {
    if (!selectedFightId || selectedFightId === ALL_VISIBLE_ENCOUNTERS_ID || selectedFightId === ALL_KILLS_ENCOUNTERS_ID || selectedFightId === ALL_WIPES_ENCOUNTERS_ID) {
      return null;
    }
    return getSelectedFightPlayerSnapshot(selectedRaid?.fights || [], selectedFightId, selectedPlayerId);
  }, [selectedRaid, selectedFightId, selectedPlayerId]);

  const encounterSelectionOptions = useMemo(() => {
    const options = [];
    if (fightOutcomeFilter === "kills") {
      options.push({ id: ALL_KILLS_ENCOUNTERS_ID, label: "All Kills", kind: "all-kills", kill: true });
    }
    if (fightOutcomeFilter === "wipes") {
      options.push({ id: ALL_WIPES_ENCOUNTERS_ID, label: "All Wipes", kind: "all-wipes", kill: false });
    }

    return [...options, ...encounterOptions];
  }, [encounterOptions, fightOutcomeFilter]);

  const selectedFightGear = useMemo(() => {
    return buildFightGearDisplayRows(selectedFightSnapshot?.gear || []);
  }, [selectedFightSnapshot]);

  const selectedPlayerMetricTags = useMemo(() => {
    if (!selectedPlayer || !selectedPlayerAnalytics) return [];

    const gearSummary = selectedPlayerAnalytics.gearIssueSummary || {};
    const visibleFightCount = selectedPlayerSliceTotals.visibleFights;
    const activeTimeMs = selectedPlayerSliceTotals.activeTimeMs || 0;
    const availableTimeMs = selectedPlayerSliceTotals.availableTimeMs || 0;
    const activeTimePercent = availableTimeMs > 0 ? (activeTimeMs / availableTimeMs) * 100 : 0;
    const deaths = getPlayerDeathCountFromFights(filteredFights, selectedPlayer.id);
    const engineeringDamageDone = getPlayerAbilityTotalFromFights(filteredFights, selectedPlayer.id, ENGINEERING_DAMAGE_ABILITY_IDS)
      || selectedPlayer.analytics?.engineeringDamageTaken
      || 0;
    const oilDamage = getPlayerAbilityTotalFromFights(filteredFights, selectedPlayer.id, OIL_OF_IMMOLATION_ABILITY_IDS)
      || selectedPlayer.analytics?.oilOfImmolationDamageTaken
      || 0;
    const trackedCasts = selectedPlayer.trackedCastCount || 0;
    const friendlyFire = selectedPlayer.hostilePlayerDamage || 0;
    const drumsCastCount = Number(selectedPlayerAnalytics.drumsCastCount || selectedPlayer.analytics?.drumsCastCount || 0);
    const drumsAffectedCount = Number(selectedPlayerAnalytics.drumsAffectedCount || 0);
    const coveredConsumableFights = Number(selectedPlayerAnalytics.coveredConsumableFights || 0);
    const totalConsumableFights = Number(selectedPlayerAnalytics.totalConsumableFights || 0);
    const consumableIssueCount = Number(selectedPlayerAnalytics.consumableIssueCount || 0);
    const potionUseCount = Number(selectedPlayerAnalytics.potionUseCount || 0);
    const hearthstoneCount = Number(selectedPlayerAnalytics.hearthstoneCount || 0);

    return sortMetricTags([
      {
        label: "Missing Permanent Enchants",
        value: gearSummary.missingPermanentEnchantCount || 0,
        tone: (gearSummary.missingPermanentEnchantCount || 0) > 0 ? "danger" : "neutral",
        sortValue: gearSummary.missingPermanentEnchantCount || 0,
      },
      {
        label: "Low Quality Gems",
        value: gearSummary.lowQualityGemCount || 0,
        tone: (gearSummary.lowQualityGemCount || 0) > 0 ? "danger" : "neutral",
        sortValue: gearSummary.lowQualityGemCount || 0,
      },
      {
        label: "Consumable Coverage",
        value: totalConsumableFights > 0 ? `${coveredConsumableFights}/${totalConsumableFights}` : "0/0",
        tone: totalConsumableFights > 0 && consumableIssueCount === 0 ? "success" : (consumableIssueCount > 0 ? "warning" : "neutral"),
        sortValue: consumableIssueCount > 0 ? consumableIssueCount : coveredConsumableFights,
      },
      {
        label: "Potion Uses",
        value: potionUseCount,
        tone: potionUseCount > 0 ? "success" : "neutral",
        sortValue: potionUseCount,
      },
      {
        label: "Healthstones",
        value: hearthstoneCount,
        tone: hearthstoneCount > 0 ? "warning" : "neutral",
        sortValue: hearthstoneCount,
      },
      {
        label: "Deaths",
        value: deaths,
        tone: deaths > 0 ? "warning" : "neutral",
        sortValue: deaths,
      },
      {
        label: "Friendly Fire",
        value: friendlyFire,
        tone: friendlyFire > 0 ? "warning" : "neutral",
        sortValue: friendlyFire,
      },
      {
        label: "Engineering Damage Done",
        value: engineeringDamageDone,
        tone: engineeringDamageDone > 0 ? "warning" : "neutral",
        sortValue: engineeringDamageDone,
      },
      {
        label: "Tracked Casts",
        value: trackedCasts,
        tone: trackedCasts > 0 ? "info" : "neutral",
        sortValue: trackedCasts,
      },
      {
        label: "Drums Casts",
        value: drumsAffectedCount > 0 ? `${drumsCastCount} (${formatMetricValue(drumsAffectedCount)})` : drumsCastCount,
        tone: drumsCastCount > 0 ? "info" : "neutral",
        sortValue: drumsCastCount,
      },
      {
        label: "Visible Fights",
        value: visibleFightCount,
        tone: visibleFightCount > 0 ? "info" : "neutral",
        sortValue: visibleFightCount,
      },
      {
        label: "Active Time %",
        value: formatPercent(activeTimePercent),
        tone: activeTimePercent > 0 ? "success" : "neutral",
        sortValue: activeTimePercent,
      },
    ]);
  }, [filteredFights, selectedPlayer, selectedPlayerAnalytics, selectedPlayerDeathRows.length, selectedPlayerSliceTotals]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const refreshLinks = () => {
      try {
        window.$WowheadPower?.refreshLinks?.();
      } catch {}
      try {
        window.WH?.Tooltips?.refreshLinks?.();
      } catch {}
      try {
        window.WH?.Tooltips?.parseLinks?.(document.body);
      } catch {}
      try {
        const abilityRoot = abilityBreakdownRef.current;
        if (abilityRoot) {
          const previousConfig = window.wowhead_tooltips || {};
          window.wowhead_tooltips = {
            ...previousConfig,
            iconizelinks: true,
          };
          window.WH?.Tooltips?.parseLinks?.(abilityRoot);
          window.wowhead_tooltips = previousConfig;
        }
      } catch {}
    };

    const timeoutId = window.setTimeout(refreshLinks, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    abilityBreakdownRef,
    selectedFightGear.length,
    selectedPlayerDamageBreakdown.length,
    selectedPlayerHealingBreakdown.length,
    selectedPlayerId,
    sliceType,
    visiblePlayerDamageBreakdown.length,
    visiblePlayerHealingBreakdown.length,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateVisibleItemMeta() {
      const ids = [
        ...selectedFightGear.map(item => item?.id),
        ...selectedFightGear.flatMap(item => (item?.gems || []).map(gem => gem?.id)),
      ]
        .map(id => String(id || "").trim())
        .filter(Boolean);

      const missingIds = [...new Set(ids)].filter(id => !itemMetaById[id]);
      if (!missingIds.length) return;

      try {
        const response = await fetch(`/api/rpb-item-meta?ids=${encodeURIComponent(missingIds.join(","))}`);
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.error || "Failed to resolve item metadata");
        if (!cancelled) {
          setItemMetaById(prev => ({ ...prev, ...(data.items || {}) }));
        }
      } catch {
        if (!cancelled) {
          setItemMetaById(prev => ({ ...prev }));
        }
      }
    }

    hydrateVisibleItemMeta();
    return () => { cancelled = true; };
  }, [itemMetaById, selectedFightGear]);

  useEffect(() => {
    if (!selectedFightId) return;

    const validSpecialSelections = new Set([ALL_KILLS_ENCOUNTERS_ID, ALL_WIPES_ENCOUNTERS_ID, ALL_VISIBLE_ENCOUNTERS_ID]);
    if (validSpecialSelections.has(selectedFightId)) {
      if (
        (selectedFightId === ALL_KILLS_ENCOUNTERS_ID && fightOutcomeFilter === "kills")
        || (selectedFightId === ALL_WIPES_ENCOUNTERS_ID && fightOutcomeFilter === "wipes")
        || selectedFightId === ALL_VISIBLE_ENCOUNTERS_ID
      ) {
        return;
      }
    }

    if (!encounterSelectionOptions.some(option => String(option.id) === String(selectedFightId))) {
      setSelectedFightId("");
    }
  }, [encounterSelectionOptions, fightOutcomeFilter, selectedFightId]);

  useEffect(() => {
    if (!filteredPlayers.length || !defaultVisiblePlayerId) {
      setSelectedPlayerId("");
      return;
    }

    if (!selectedPlayerId) {
      if (suppressAutoSelectPlayerRef.current) return;
      setSelectedPlayerId(defaultVisiblePlayerId);
      return;
    }

    if (!filteredPlayers.some(player => String(player.id) === String(selectedPlayerId))) {
      suppressAutoSelectPlayerRef.current = false;
      setSelectedPlayerId(defaultVisiblePlayerId);
    }
  }, [defaultVisiblePlayerId, filteredPlayers, selectedPlayerId]);

  useEffect(() => {
    if (loadingList) return;
    if (!teamFilter) return;

    const visibleRaidIds = new Set(filteredRaids.map(raid => raid.id));
    if (raidId && visibleRaidIds.has(raidId)) return;

    if (filteredRaids[0]?.id) {
      navigate(`/rpb/${filteredRaids[0].id}`, { replace: true });
      return;
    }

    if (raidId) {
      navigate("/rpb", { replace: true });
    }
  }, [filteredRaids, loadingList, navigate, raidId, teamFilter]);

  const isAdmin = auth.isAdmin || auth.fallback;

  async function refreshSelectedRaid(targetRaidId) {
    if (!targetRaidId) {
      setSelectedRaid(null);
      setSelectedPlayerId("");
      return;
    }

    const raid = await fetchRpbRaidBundle(targetRaidId);
    setSelectedRaid(raid);
      setSelectedPlayerId("");
  }

  async function mutateRaidMetadata(targetRaidId, updates, successMessage) {
    const result = await updateRpbRaidImport(targetRaidId, updates);
    const nextRaids = await fetchRpbRaidList();
    setRaids(nextRaids);
    if (raidId === targetRaidId) {
      await refreshSelectedRaid(targetRaidId);
    }
    toast({
      message: result.persistence === "local" ? `${successMessage} Stored locally in this browser only.` : successMessage,
      type: result.persistence === "local" ? "warning" : "success",
    });
  }

  function openRenameModal(raid) {
    setOpenRaidMenuId("");
    setRenameModalState({ open: true, raid, value: raid?.title || raid?.reportId || "" });
  }

  function openTagModal(raid) {
    setOpenRaidMenuId("");
    setTagModalState({ open: true, raid, value: normalizeTeamTag(raid?.teamTag) });
  }

  async function handleDeleteRaid(targetRaid) {
    if (!targetRaid?.id) return;

    const result = await deleteRpbRaidImport(targetRaid.id);
    const nextRaids = await fetchRpbRaidList();
    setRaids(nextRaids);

    if (raidId === targetRaid.id) {
      const nextVisibleRaids = (normalizeTeamTag(teamFilter)
        ? nextRaids.filter(raid => normalizeTeamTag(raid.teamTag) === normalizeTeamTag(teamFilter))
        : nextRaids);
      navigate(nextVisibleRaids[0]?.id ? `/rpb/${nextVisibleRaids[0].id}` : "/rpb");
    }

    toast({
      message: result.persistence === "local"
        ? "Deleted report locally in this browser only."
        : "Deleted report from RPB.",
      type: result.persistence === "local" ? "warning" : "success",
    });
  }

  async function runImportFlow(reportInput, options = {}) {
    const normalizedReportInput = String(reportInput || "").trim();
    if (!normalizedReportInput) {
      toast({ message: "Enter a Warcraft Logs report URL or report ID.", type: "warning" });
      return;
    }
    if (!profileApiKey.trim()) {
      toast({
        message: "Missing Warcraft Logs v1 API key in your profile. Open Profile in settings, then edit it at the bottom of https://fresh.warcraftlogs.com/profile",
        type: "warning",
        duration: 9000,
      });
      return;
    }

    setImporting(true);
    try {
      const steps = [
        { key: "fights", label: "Scanning report structure...", detail: "GET /report/fights" },
        { key: "summary", label: "Pulling summary roster data...", detail: "GET /report/tables/summary" },
        { key: "deaths", label: "Pulling death recap data...", detail: "GET /report/tables/deaths" },
        { key: "tracked", label: "Collecting tracked raid cooldown casts...", detail: "GET /report/tables/casts (tracked filter)" },
        { key: "hostile", label: "Collecting hostile-player damage...", detail: "GET /report/tables/damage-taken (hostility=1)" },
        { key: "fullCasts", label: "Capturing combatant and gear snapshots...", detail: "GET /report/tables/casts (full report)" },
        { key: "engineering", label: "Scanning engineering explosives...", detail: "GET /report/tables/damage-done (engineering filter)" },
        { key: "oil", label: "Scanning oil of immolation ticks...", detail: "GET /report/tables/damage-taken (ability 11351)" },
        { key: "buffs", label: "Extracting buff and consumable auras...", detail: "GET /report/tables/buffs" },
        { key: "buffsByFight", label: "Saving consumable coverage per boss fight...", detail: "GET /report/tables/buffs per boss fight" },
        { key: "drums", label: "Extracting drums usage...", detail: "GET /report/tables/casts (drums filter)" },
        { key: "drumsByFight", label: "Saving drums effectiveness per boss fight...", detail: "GET /report/events/casts + /report/events/buffs per boss fight" },
        { key: "reportRankings", label: "Fetching Warcraft Logs parse rankings...", detail: "POST /api/v2/client report.rankings" },
        { key: "reportSpeed", label: "Fetching report and boss speed rankings...", detail: "POST /api/v2/client report.rankings speed rows" },
        { key: "raiderData", label: "Capturing boss-pull player snapshots...", detail: "GET /report/tables/summary per boss fight" },
        { key: "damageByFight", label: "Saving damage ability breakdowns...", detail: "GET /report/tables/damage-done per fight (options=2)" },
        { key: "healingByFight", label: "Saving healing ability breakdowns...", detail: "GET /report/tables/healing per fight (options=2)" },
        { key: "deathsByFight", label: "Saving death events per fight...", detail: "GET /report/tables/deaths per fight" },
      ];
      const getProgressSteps = (activeStepKey = "", completedKeys = new Set()) => steps.map(step => ({
        ...step,
        completed: completedKeys.has(step.key),
        active: step.key === activeStepKey,
      }));
      const totalUnits = (steps.length * 2) + 4;
      const updateImportProgressState = (completed, message, detail = "", extra = {}) => {
        setImportProgress({
          open: true,
          completed,
          total: totalUnits,
          percent: Math.max(0, Math.min(100, Math.round((completed / totalUnits) * 100))),
          message,
          detail,
          subdetail: extra.subdetail || "",
          activeStepKey: extra.activeStepKey || "",
          steps: extra.steps || [],
        });
      };

      const datasets = {};
      const completedStepKeys = new Set();
      updateImportProgressState(1, "Preparing import payload...", "Initializing staged Warcraft Logs requests", {
        subdetail: "Import will stage every Warcraft Logs call first, then save a single payload-backed raid bundle.",
        steps: getProgressSteps("", completedStepKeys),
      });

      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        updateImportProgressState((index * 2) + 2, step.label, step.detail, {
          subdetail: `Stage ${index + 1} of ${steps.length}`,
          activeStepKey: step.key,
          steps: getProgressSteps(step.key, completedStepKeys),
        });

        const response = await fetch(`/api/rpb-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "step",
            step: step.key,
            reportUrl: normalizedReportInput,
            apiKey: profileApiKey,
            wclV2ClientId: profileV2ClientId,
            wclV2ClientSecret: profileV2ClientSecret,
          }),
        });

        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.error || `Import step failed: ${step.key}`);
        datasets[step.key] = data;
        completedStepKeys.add(step.key);
        updateImportProgressState((index * 2) + 3, `Stored ${step.label.replace(/\.\.\.$/, "").toLowerCase()}`, step.detail, {
          subdetail: `Captured ${step.key} into the saved import payload`,
          activeStepKey: step.key,
          steps: getProgressSteps(step.key, completedStepKeys),
        });
      }

      updateImportProgressState((steps.length * 2) + 2, "Assembling raid payload...", "Normalizing fights, players, analytics, and saved breakdown rows", {
        subdetail: "Converting staged Warcraft Logs responses into persisted raid, fight, player, and breakdown data",
        steps: getProgressSteps("", completedStepKeys),
      });

      const assembleResponse = await fetch(`/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assemble", reportUrl: normalizedReportInput, datasets }),
      });

      const assembledRaid = await readApiJson(assembleResponse);
      if (!assembleResponse.ok) throw new Error(assembledRaid.error || "Failed to assemble raid");

      if (options.presetTeamTag !== undefined) {
        assembledRaid.teamTag = normalizeTeamTag(options.presetTeamTag);
      } else if (isAdmin) {
        updateImportProgressState((steps.length * 2) + 3, "Waiting for team tag selection...", "Admin confirmation required before persisting the raid", {
          subdetail: "Choose the team tag before the import is finalized",
          steps: getProgressSteps("", completedStepKeys),
        });

        const selectedTeamTag = await new Promise(resolve => {
          setImportTagPrompt({
            open: true,
            raid: { id: "__import__", title: assembledRaid.title || assembledRaid.reportId },
            value: "",
            resolve,
          });
        });

        assembledRaid.teamTag = selectedTeamTag;
      }

      assembledRaid.title = buildAutoReportTitle({
        start: assembledRaid.start,
        teamTag: assembledRaid.teamTag,
      });

      updateImportProgressState(totalUnits - 1, "Saving imported raid...", "Persisting raid bundle, fights, players, analytics, and ability rows", {
        subdetail: "Writing the fully payload-backed raid bundle to Redis",
        steps: getProgressSteps("", completedStepKeys),
      });

      const saveResponse = await fetch(`/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assembleAndSave",
          reportUrl: normalizedReportInput,
          datasets,
          teamTag: assembledRaid.teamTag || "",
          title: assembledRaid.title,
        }),
      });

      const saveResult = await readApiJson(saveResponse);
      if (!saveResponse.ok) throw new Error(saveResult.error || "Failed to save imported raid");
      const savedRaidId = saveResult.raidId || assembledRaid.id;
      const nextRaids = await fetchRpbRaidList();
      setRaids(nextRaids);
      setReportUrl("");
      updateImportProgressState(totalUnits, "Import complete.", "RPB payload is ready for saved-raid browsing", {
        subdetail: "Saved raid views now resolve from persisted payload data only",
        steps: getProgressSteps("", new Set(steps.map(step => step.key))),
      });
      toast({
        message: options.successMessage || `Imported ${assembledRaid.title}`,
        type: "success",
        duration: 7000,
      });
      navigate(`/rpb/${savedRaidId}`);
      setTimeout(() => {
        setImportProgress(prev => ({ ...prev, open: false }));
      }, 500);
    } catch (error) {
      setImportProgress({
        open: true,
        completed: 0,
        total: 1,
        percent: 0,
        message: `Import failed: ${error.message}`,
        detail: "",
        subdetail: "",
        activeStepKey: "",
        steps: [],
      });
      toast({ message: `Import failed: ${error.message}`, type: "danger", duration: 5000 });
    } finally {
      setImporting(false);
    }
  }

  async function handleImport(event) {
    event.preventDefault();
    await runImportFlow(reportUrl);
  }

  async function handleReimportRaid(targetRaid) {
    if (!targetRaid?.reportId) return;
    setOpenRaidMenuId("");
    await runImportFlow(targetRaid.reportId, {
      presetTeamTag: targetRaid.teamTag || "",
      successMessage: `Reimported ${targetRaid.title || targetRaid.reportId}`,
    });
  }

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (!auth.fallback && !auth.authenticated) {
    return <DiscordLoginGate />;
  }

  return (
    <AppShell>
      <ImportProgressModal open={importProgress.open} progress={importProgress} />
      <TeamTagModal
        open={importTagPrompt.open}
        title={`Tag ${importTagPrompt.raid?.title || "Imported Report"}`}
        confirmLabel="Save Report"
        value={importTagPrompt.value}
        onChange={value => setImportTagPrompt(prev => ({ ...prev, value }))}
        onConfirm={() => {
          const resolve = importTagPrompt.resolve;
          const value = normalizeTeamTag(importTagPrompt.value);
          setImportTagPrompt({ open: false, raid: null, value: "", resolve: null });
          if (resolve) resolve(value);
        }}
        onCancel={() => {
          const resolve = importTagPrompt.resolve;
          setImportTagPrompt({ open: false, raid: null, value: "", resolve: null });
          if (resolve) resolve("");
        }}
        allowClear
      />
      <TeamTagModal
        open={tagModalState.open}
        title={`Tag ${tagModalState.raid?.title || tagModalState.raid?.reportId || "Report"}`}
        confirmLabel="Save Tag"
        value={tagModalState.value}
        onChange={value => setTagModalState(prev => ({ ...prev, value }))}
        onConfirm={async () => {
          if (!tagModalState.raid?.id) return;
          const normalizedTeamTag = normalizeTeamTag(tagModalState.value);
          await mutateRaidMetadata(tagModalState.raid.id, {
            teamTag: normalizedTeamTag,
            title: buildAutoReportTitle({
              start: tagModalState.raid?.start,
              teamTag: normalizedTeamTag,
            }),
          }, "Updated report tag.");
          setTagModalState({ open: false, raid: null, value: "" });
        }}
        onCancel={() => setTagModalState({ open: false, raid: null, value: "" })}
        allowClear
      />
      <RenameReportModal
        open={renameModalState.open}
        value={renameModalState.value}
        onChange={value => setRenameModalState(prev => ({ ...prev, value }))}
        onConfirm={async () => {
          const nextTitle = renameModalState.value.trim();
          if (!renameModalState.raid?.id) return;
          if (!nextTitle) {
            toast({ message: "Enter a report name before saving.", type: "warning" });
            return;
          }
          await mutateRaidMetadata(renameModalState.raid.id, { title: nextTitle }, "Renamed report.");
          setRenameModalState({ open: false, raid: null, value: "" });
        }}
        onCancel={() => setRenameModalState({ open: false, raid: null, value: "" })}
      />
      <ConfirmDialog
        open={!!deleteConfirmRaid}
        title="Delete Report"
        message={(
          <>
            Delete <strong style={{ color: text.primary }}>{deleteConfirmRaid?.title || deleteConfirmRaid?.reportId || "this report"}</strong> from RPB? This cannot be undone.
          </>
        )}
        confirmLabel="Delete Report"
        dangerous
        onConfirm={async () => {
          const targetRaid = deleteConfirmRaid;
          setDeleteConfirmRaid(null);
          await handleDeleteRaid(targetRaid);
        }}
        onCancel={() => setDeleteConfirmRaid(null)}
      />

      <div style={{
        borderBottom: `1px solid ${border.subtle}`,
        background: surface.panel,
        padding: `${space[4]}px ${space[6]}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space[4],
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: text.primary }}>Combat Log Analytics</div>
          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
            Import Warcraft Logs reports, persist them to Firestore, and browse raid/player data.
          </div>
        </div>

        <form onSubmit={handleImport} style={{ display: "flex", gap: space[2], flex: "1 1 560px", maxWidth: 860, flexWrap: "wrap" }}>
          <input
            value={reportUrl}
            onChange={event => setReportUrl(event.target.value)}
            placeholder="Paste a Warcraft Logs report URL or report ID"
            style={{ ...inputStyle, flex: "1 1 520px", height: 36 }}
          />
          <button type="submit" disabled={importing} style={{ ...btnStyle("primary", importing), height: 36, opacity: importing ? 0.7 : 1 }}>
            {importing ? <LoadingSpinner size={14} /> : "Import"}
          </button>
          <div style={{ width: "100%", fontSize: fontSize.xs, color: text.muted }}>
            Imports use the Warcraft Logs v1 API key saved in your profile.
          </div>
        </form>
      </div>

      <div style={{
        padding: `${space[3]}px ${space[4]}px`,
        borderBottom: `1px solid ${border.subtle}`,
        background: surface.panel,
        display: "flex",
        flexDirection: "column",
        gap: space[2],
      }}>
        <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Team Filter
        </div>
        <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", alignItems: "flex-start" }}>
          {TEAM_TAG_OPTIONS.map(option => {
            const active = normalizeTeamTag(teamFilter) === option.id;
            return (
              <button
                key={option.id || "all"}
                onClick={() => setTeamFilter(option.id)}
                style={teamFilterButtonStyle(option, active)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div style={{ height: 2 }} />
        <div style={{ fontSize: fontSize.lg, color: text.primary, fontWeight: fontWeight.bold, letterSpacing: "0.02em" }}>
          Available Reports
        </div>
        <div style={{ overflow: "visible", paddingBottom: 2 }}>
          <div style={{ display: "flex", gap: space[2], overflowX: "auto", overflowY: "visible", paddingBottom: 2 }}>
            {loadingList && (
              <div style={{ padding: `${space[2]}px 0`, color: text.muted }}>
                Loading raids...
              </div>
            )}
            {!loadingList && raids.length === 0 && (
              <div style={{ padding: `${space[2]}px 0`, color: text.muted }}>
                No persisted raids yet.
              </div>
            )}
            {!loadingList && teamFilter && filteredRaids.length === 0 && (
              <div style={{ padding: `${space[2]}px 0`, color: text.muted }}>
                No reports with this team tag are available.
              </div>
            )}
            {filteredRaids.map((raid, index) => {
              const active = raid.id === raidId;
              const teamOption = getTeamOption(raid.teamTag);
              const teamScheduleLabel = getTeamScheduleLabel(raid.teamTag);
              const isNewestReport = index === 0;
              const isLatestLargeReport = index < 2;
              const reportSpeedPercent = getRaidReportSpeedPercent(raid);
              const topDps = getRaidAwardWinner(raid, "DPS", "damageParsePercent");
              const topHealer = getRaidAwardWinner(raid, "Healer", "healingParsePercent");
              const isExpanded = isLatestLargeReport || active;
              return (
                <div
                  key={raid.id}
                  style={{
                    position: "relative",
                    minWidth: isExpanded ? 220 : 160,
                    flexShrink: 0,
                  }}
                >
                {isAdmin && (
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 30 }} onClick={event => event.stopPropagation()}>
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        setOpenRaidMenuId(current => (current === raid.id ? "" : raid.id));
                      }}
                      style={{
                        ...btnStyle("default"),
                        width: 28,
                        minWidth: 28,
                        height: 28,
                        padding: 0,
                        justifyContent: "center",
                        borderRadius: radius.sm,
                      }}
                      title="Report actions"
                    >
                      ...
                    </button>
                    {openRaidMenuId === raid.id && (
                      <RaidActionsMenu
                        raid={raid}
                        onRename={() => openRenameModal(raid)}
                        onTag={() => openTagModal(raid)}
                        onDeleteTag={async () => {
                          setOpenRaidMenuId("");
                          await mutateRaidMetadata(raid.id, {
                            teamTag: "",
                            title: buildAutoReportTitle({ start: raid.start, teamTag: "" }),
                          }, "Removed report tag.");
                        }}
                        onReimport={() => {
                          handleReimportRaid(raid);
                        }}
                        onDelete={() => {
                          setOpenRaidMenuId("");
                          setDeleteConfirmRaid(raid);
                        }}
                      />
                    )}
                  </div>
                )}

                  <button
                    onClick={() => navigate(`/rpb/${raid.id}`)}
                    style={{
                      ...btnStyle(active ? "primary" : "default", active),
                      width: "100%",
                      height: "100%",
                      minHeight: isExpanded ? 132 : 72,
                      padding: space[3],
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: isExpanded ? "flex-start" : "center",
                      gap: isExpanded ? 4 : 0,
                      paddingRight: isAdmin ? 42 : space[3],
                    }}
                  >
                  <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap", paddingRight: isAdmin ? 18 : 0 }}>
                    {isNewestReport && (
                      <span style={tagStyle("success")}>
                        Newest Report
                      </span>
                    )}
                    <span style={{ fontSize: isExpanded ? fontSize.base : fontSize.sm, fontWeight: fontWeight.bold, textAlign: "left" }}>
                      {raid.title || raid.reportId}
                    </span>
                  </div>
                  {isExpanded && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        {topDps && (
                          <span style={{ fontSize: fontSize.sm, color: active ? "#dce9ff" : text.muted, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "#e5cc80" }}>DPS Leader</span>
                            <span style={{ color: getScoreColor(topDps.awardParse) || (active ? "#f6f8ff" : text.primary), fontWeight: fontWeight.bold, fontSize: fontSize.base }}>
                              {Math.round(Number(topDps.awardParse || 0))}
                            </span>
                            <span style={{ color: getClassColor(topDps.type), fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>
                              {topDps.name}
                            </span>
                          </span>
                        )}
                        {topHealer && (
                          <span style={{ fontSize: fontSize.sm, color: active ? "#dce9ff" : text.muted, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "#e5cc80" }}>Healer Leader</span>
                            <span style={{ color: getScoreColor(topHealer.awardParse) || (active ? "#f6f8ff" : text.primary), fontWeight: fontWeight.bold, fontSize: fontSize.base }}>
                              {Math.round(Number(topHealer.awardParse || 0))}
                            </span>
                            <span style={{ color: getClassColor(topHealer.type), fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>
                              {topHealer.name}
                            </span>
                          </span>
                        )}
                        {!topDps && !topHealer && (
                          <span style={{ fontSize: fontSize.sm, color: active ? "#dce9ff" : text.muted }}>
                            No parse leaders yet
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: space[2], flexWrap: "wrap" }}>
                        {reportSpeedPercent != null && (
                          <span style={parseTagStyle(reportSpeedPercent)}>
                            {`Speed Parse: ${Math.round(reportSpeedPercent)}`}
                          </span>
                        )}
                        <span style={tagStyle(teamOption.tone)}>
                          {teamOption.shortLabel}
                        </span>
                        {teamScheduleLabel && (
                          <span style={tagStyle(teamOption.tone)}>
                            {teamScheduleLabel}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedRaid && (
        <div style={{
          padding: `${space[3]}px ${space[4]}px`,
          borderBottom: `1px solid ${border.subtle}`,
          background: surface.panel,
          display: "flex",
          flexDirection: "column",
          gap: space[3],
        }}>
          <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Filters
          </div>

          <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
            {[
              { id: "encounters", label: "Encounters" },
              { id: "encounters-and-trash", label: "Encounters and Trash" },
              { id: "trash", label: "Trash Only" },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setFilterMode(option.id)}
                style={{
                  ...btnStyle(filterMode === option.id ? "primary" : "default", filterMode === option.id),
                  height: 32,
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Encounter Outcome
            </div>
            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setFightOutcomeFilter("");
                  setSelectedFightId("");
                }}
                style={{
                  ...btnStyle(!fightOutcomeFilter && !selectedFightId ? "primary" : "default", !fightOutcomeFilter && !selectedFightId),
                  height: 30,
                }}
              >
                All Kills and Wipes
              </button>
              {[
                { id: "kills", label: "Kills" },
                { id: "wipes", label: "Wipes" },
              ].map(option => {
                const active = fightOutcomeFilter === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => setFightOutcomeFilter(active ? "" : option.id)}
                    style={{
                      ...btnStyle(active ? "primary" : "default", active),
                      height: 30,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
              {fightOutcomeFilter && (
                <button
                  onClick={() => setFightOutcomeFilter("")}
                  style={{ ...btnStyle("default", false), height: 30 }}
                >
                  Clear Outcome
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Encounter Selection
            </div>
            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
              {encounterSelectionOptions.map(option => {
                const active = String(selectedFightId) === String(option.id);
                const isAggregateOption = option.kind && option.kind.startsWith("all");
                const toneColor = isAggregateOption ? accent.blue : (option.kill ? intent.success : intent.danger);
                const inactiveBackground = isAggregateOption
                  ? "rgba(61, 125, 202, 0.14)"
                  : (option.kill ? "rgba(75, 170, 109, 0.14)" : "rgba(205, 78, 78, 0.14)");
                const activeBackground = isAggregateOption
                  ? "rgba(61, 125, 202, 0.24)"
                  : (option.kill ? "rgba(75, 170, 109, 0.24)" : "rgba(205, 78, 78, 0.24)");
                return (
                  <button
                    key={option.id}
                    onClick={() => setSelectedFightId(active ? "" : option.id)}
                    style={{
                      ...btnStyle("default", active),
                      height: 30,
                      background: active ? activeBackground : inactiveBackground,
                      borderColor: active ? toneColor : `${toneColor}66`,
                      borderWidth: active ? 2 : 1,
                      boxShadow: active ? `0 0 0 2px ${toneColor}33` : "none",
                      color: isAggregateOption ? "#d6e7ff" : (option.kill ? "#d7ffdf" : "#ffd5d5"),
                    }}
                    >
                    {option.speedParsePercent != null && (
                      <span style={parseInlineStyle(option.speedParsePercent)}>
                        {Math.round(option.speedParsePercent)}
                      </span>
                    )}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Visible encounters are listed as individual pulls, like Warcraft Logs. Aggregate buttons only show the outcome that is currently selected.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Raid Analytics
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setRaidAnalyticsFilter("")}
                disabled={!raidAnalyticsFilter}
                style={{
                  ...btnStyle(raidAnalyticsFilter ? "danger" : "default", false),
                  height: 32,
                  opacity: raidAnalyticsFilter ? 1 : 0.65,
                  background: raidAnalyticsFilter ? "rgba(205, 78, 78, 0.24)" : "transparent",
                  borderColor: raidAnalyticsFilter ? "rgba(255, 134, 134, 0.98)" : border.subtle,
                  color: raidAnalyticsFilter ? "#ffdede" : text.secondary,
                  boxShadow: raidAnalyticsFilter ? "0 0 0 2px rgba(255, 134, 134, 0.22)" : "none",
                }}
              >
                Clear Filter
              </button>
              <MetricTag
                label="Gear Issues"
                value={filteredRaidAnalytics.playersMissingEnchants.length}
                tone="danger"
                active={raidAnalyticsFilter === "missing-enchants"}
                onClick={() => setRaidAnalyticsFilter(current => current === "missing-enchants" ? "" : "missing-enchants")}
              />
              <MetricTag
                label="Engineering Damage Done Entries"
                value={filteredRaidAnalytics.engineeringDamageTaken.length}
                tone="warning"
                active={raidAnalyticsFilter === "engineering"}
                onClick={() => setRaidAnalyticsFilter(current => current === "engineering" ? "" : "engineering")}
              />
              <MetricTag
                label="Players Using Drums"
                value={filteredRaidAnalytics.playersUsingDrums.length}
                tone="info"
                active={raidAnalyticsFilter === "drums"}
                onClick={() => {
                  setRaidAnalyticsFilter(current => current === "drums" ? "" : "drums");
                  setSliceType("drums");
                }}
              />
              <MetricTag
                label="Consumable Issues"
                value={filteredRaidAnalytics.playersWithConsumableIssues.reduce((sum, entry) => sum + Number(entry.total || 0), 0)}
                tone="warning"
                active={raidAnalyticsFilter === "consumables"}
                onClick={() => {
                  setRaidAnalyticsFilter(current => current === "consumables" ? "" : "consumables");
                  setSliceType("consumables");
                }}
              />
              <MetricTag
                label="Healthstone Uses"
                value={filteredRaidAnalytics.playersUsingHearthstone.reduce((sum, entry) => sum + Number(entry.total || 0), 0)}
                tone="warning"
                active={raidAnalyticsFilter === "hearthstone"}
                onClick={() => {
                  setRaidAnalyticsFilter(current => current === "hearthstone" ? "" : "hearthstone");
                  setSliceType("healing");
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Player Selection
            </div>
            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
              {filteredPlayers.map(player => {
                const active = String(player.id) === String(selectedPlayerId);
                return (
                  <button
                    key={player.id}
                    onClick={() => toggleSelectedPlayer(player.id)}
                    style={{
                      ...btnStyle(active ? "primary" : "default", active),
                      height: 30,
                      borderWidth: active ? 2 : 1,
                      boxShadow: active ? `0 0 0 2px ${getClassColor(player.type)}33` : "none",
                      borderColor: active ? getClassColor(player.type) : border.subtle,
                      color: getClassColor(player.type),
                      fontWeight: fontWeight.semibold,
                    }}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: fontSize.xs, color: text.muted }}>
            Filters now apply directly to the slicer totals, encounter picks, and player detail breakdowns.
          </div>
        </div>
      )}

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: space[4],
        padding: space[4],
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
          {loadingRaid && !selectedRaid && !noReportsForActiveTeamFilter && (
            <div style={{ ...panelStyle, padding: space[6], display: "flex", justifyContent: "center" }}>
              <LoadingSpinner size={24} />
            </div>
          )}

          {noReportsForActiveTeamFilter && !selectedRaid && (
            <div style={{ ...panelStyle, padding: space[6], color: text.muted }}>
              No reports with this team tag are available.
            </div>
          )}

          {!loadingRaid && !selectedRaid && !noReportsForActiveTeamFilter && (
            <div style={{ ...panelStyle, padding: space[6], color: text.muted }}>
              Choose a saved raid or import a new report to begin.
            </div>
          )}

          {selectedRaid && (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: isPlayerDetailOpen ? "minmax(0, 1.2fr) minmax(360px, 0.8fr)" : "minmax(0, 1fr)",
                gap: space[4],
                alignItems: "start",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
                  <div style={{ ...panelStyle }}>
                    <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Breakdown
                    </div>
                    <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[3] }}>
                      <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
                        {[
                          { id: "damage", label: "Damage" },
                          { id: "healing", label: "Healing" },
                          { id: "deaths", label: "Deaths" },
                          { id: "drums", label: "Drums" },
                          { id: "consumables", label: "Consumables" },
                        ].map(option => (
                          <button
                            key={option.id}
                            onClick={() => setSliceType(option.id)}
                            style={{ ...btnStyle(sliceType === option.id ? "primary" : "default", sliceType === option.id), height: 30 }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                        {((sliceType === "consumables"
                          ? visibleConsumableSliceEntries
                          : (sliceType === "drums" ? visibleDrumSliceEntries : visibleAggregatedSliceEntries)).length === 0) && (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                            {raidAnalyticsFilter
                              ? "No players match the active raid analytics filter in this slice."
                              : "Select encounters and re-import a raid with boss data to populate encounter slices."}
                          </div>
                        )}
                        {sliceType === "drums" && visibleDrumSliceEntries.map(entry => {
                          const active = String(entry.id) === String(selectedPlayerId);
                          const maxAffectedTargets = Math.max(0, Number(entry.casts || 0) * 5);
                          const affectedPercent = maxAffectedTargets > 0
                            ? Math.min(100, (Number(entry.affectedTargets || 0) / maxAffectedTargets) * 100)
                            : 0;
                          return (
                            <button
                              key={`drums-${entry.id}`}
                              onClick={() => toggleSelectedPlayer(entry.id)}
                              style={{
                                background: active ? `${accent.blue}10` : "transparent",
                                border: `${active ? 2 : 1}px solid ${active ? accent.blue : border.subtle}`,
                                boxShadow: active ? `0 0 0 2px ${accent.blue}33` : "none",
                                borderRadius: radius.base,
                                padding: space[3],
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 10 }}>
                                <span style={{ color: getClassColor(entry.type), fontWeight: fontWeight.semibold }}>{entry.name}</span>
                                <span style={{ color: text.secondary, fontWeight: fontWeight.semibold }}>
                                  {entry.casts} cast{entry.casts === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8 }}>
                                <span style={{ fontSize: fontSize.xs, color: "#ffffff", fontWeight: fontWeight.bold }}>
                                  {`${formatMetricValue(entry.affectedTargets)} players affected`}
                                </span>
                                <span style={{ fontSize: fontSize.xs, color: "#ffffff", fontWeight: fontWeight.bold }}>
                                  {`${entry.averageAffectedPerCast.toFixed(1)} avg per cast`}
                                </span>
                              </div>
                              <div style={{ height: 10, borderRadius: 999, background: surface.base, overflow: "hidden", border: `1px solid ${border.subtle}` }}>
                                <div style={{
                                  width: `${Math.max(maxAffectedTargets > 0 ? 4 : 0, Math.round(affectedPercent))}%`,
                                  height: "100%",
                                  background: getClassColor(entry.type),
                                  opacity: 0.9,
                                }} />
                              </div>
                            </button>
                          );
                        })}
                        {sliceType === "consumables" && visibleConsumableSliceEntries.map(entry => {
                          const active = String(entry.id) === String(selectedPlayerId);
                          const totalRequired = Number(entry.totalRequired || 0);
                          const totalCovered = Number(entry.total || 0);
                          const coveragePercent = totalRequired > 0 ? (totalCovered / totalRequired) * 100 : 0;
                          return (
                            <button
                              key={`consumables-${entry.id}`}
                              onClick={() => toggleSelectedPlayer(entry.id)}
                              style={{
                                background: active ? `${accent.blue}10` : "transparent",
                                border: `${active ? 2 : 1}px solid ${active ? accent.blue : border.subtle}`,
                                boxShadow: active ? `0 0 0 2px ${accent.blue}33` : "none",
                                borderRadius: radius.base,
                                padding: space[3],
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 10 }}>
                                <span style={{ color: getClassColor(entry.type), fontWeight: fontWeight.semibold }}>{entry.name}</span>
                                <span style={{ color: entry.totalIssues > 0 ? "#ffd5d5" : "#d7ffdf", fontWeight: fontWeight.semibold }}>
                                  {totalCovered}/{totalRequired}
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8 }}>
                                <span style={{ fontSize: fontSize.xs, color: text.muted }}>
                                  Scrolls {entry.scrollCoverageCount} · Elixirs {entry.elixirUnitCoverageCount}/{entry.elixirUnitRequirementCount} · Food {entry.foodCoverageCount}/{entry.totalFights}
                                </span>
                                <span style={{ fontSize: fontSize.xs, color: entry.totalIssues > 0 ? "#ffb3b3" : text.muted }}>
                                  {entry.totalIssues} missing
                                </span>
                              </div>
                              <div style={{ height: 10, borderRadius: 999, background: surface.base, overflow: "hidden", border: `1px solid ${border.subtle}` }}>
                                <div style={{
                                  width: `${Math.max(3, Math.round(coveragePercent))}%`,
                                  height: "100%",
                                  background: entry.totalIssues > 0 ? intent.warning : intent.success,
                                  opacity: 0.9,
                                }} />
                              </div>
                            </button>
                          );
                        })}
                        {sliceType !== "consumables" && sliceType !== "drums" && visibleAggregatedSliceEntries.map(entry => {
                          const maxValue = visibleAggregatedSliceEntries[0]?.total || 1;
                          const active = String(entry.id) === String(selectedPlayerId);
                          const perSecondValue = sliceType === "deaths"
                            ? ""
                            : formatPerSecond(entry.total, entry.activeTime);
                          return (
                            <button
                              key={`damage-${entry.id}`}
                              onClick={() => toggleSelectedPlayer(entry.id)}
                              style={{
                                background: active ? `${accent.blue}10` : "transparent",
                                border: `${active ? 2 : 1}px solid ${active ? accent.blue : border.subtle}`,
                                boxShadow: active ? `0 0 0 2px ${accent.blue}33` : "none",
                                borderRadius: radius.base,
                                padding: space[3],
                                textAlign: "left",
                                cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: space[2], minWidth: 0 }}>
                                {Number(entry.parsePercent) > 0 && sliceType !== "deaths" && (
                                  <span style={{ color: getScoreColor(entry.parsePercent) || text.muted, fontWeight: fontWeight.bold, fontSize: fontSize.xs }}>
                                    {Math.round(entry.parsePercent)}
                                  </span>
                                )}
                                <span style={{ color: getClassColor(entry.type), fontWeight: fontWeight.semibold }}>{entry.name}</span>
                              </span>
                              <span style={{ color: text.secondary }}>
                                {entry.total.toLocaleString()}
                                {sliceType !== "deaths" ? ` (${perSecondValue})` : ""}
                              </span>
                            </div>
                              <div style={{ height: 10, borderRadius: 999, background: surface.base, overflow: "hidden", border: `1px solid ${border.subtle}` }}>
                                <div style={{
                                  width: `${Math.max(3, Math.round((entry.total / maxValue) * 100))}%`,
                                  height: "100%",
                                  background: getClassColor(entry.type),
                                  opacity: 0.85,
                                }} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {isPlayerDetailOpen && (
                  <div style={{ ...panelStyle, minWidth: 0, overflow: "hidden" }}>
                    <div style={{
                      padding: space[4],
                      borderBottom: `1px solid ${border.subtle}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: space[3],
                    }}>
                      <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Player Detail
                      </div>
                      <button onClick={closeSelectedPlayer} style={{ ...btnStyle("default"), height: 30 }}>
                        Close
                      </button>
                    </div>
                    <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[4] }}>
                      <div>
                        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: getClassColor(selectedPlayer.type) }}>{selectedPlayer.name}</div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: space[2] }}>
                        {selectedPlayerMetricTags.map(tag => (
                          <MetricTag key={tag.label} label={tag.label} value={tag.value} tone={tag.tone} />
                        ))}
                      </div>

                      {sliceType === "deaths" && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Death recap</div>
                          <div ref={abilityBreakdownRef} style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {!selectedPlayerDeathRows.length && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                No deaths found for this player in the current filtered fights.
                              </div>
                            )}
                            {selectedPlayerDeathRows.map((row, rowIndex) => (
                              <div
                                key={row.key}
                                style={{
                                  padding: space[3],
                                  border: `1px solid ${border.subtle}`,
                                  borderRadius: radius.base,
                                  background: surface.card,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: space[2],
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], flexWrap: "wrap" }}>
                                  <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold }}>
                                    {`Death ${rowIndex + 1}`}
                                  </div>
                                  <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                    {row.fightName}
                                  </div>
                                  <div style={{ fontSize: fontSize.sm, color: "#ff8d8d", fontWeight: fontWeight.semibold }}>
                                    {row.timestampLabel || formatDuration(row.timestampMs)}
                                  </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "96px 92px minmax(0, 1fr) 108px", gap: space[2], padding: `0 ${space[1]}px`, fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                  <div>Time</div>
                                  <div>Type</div>
                                  <div>Event</div>
                                  <div>Amount</div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {row.events.map((event, index) => (
                                    <div key={`${row.key}-event-${index}`} style={{ display: "grid", gridTemplateColumns: "96px 92px minmax(0, 1fr) 108px", gap: space[2], alignItems: "start", padding: `${space[1]}px ${space[1]}px` }}>
                                      <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                        {formatDuration(event.timestampMs ?? normalizeEncounterEventTimestamp(event.timestamp, { startTime: 0, durationMs: 0 }))}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: getDeathTimelineEventTone(event), fontWeight: fontWeight.semibold }}>
                                        {getDeathTimelineEventLabel(event)}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0 }}>
                                        <EventSummary event={event} emphasizeTime={getEventTypeToken(event) === "death"} />
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                        {formatMetricValue(getEventAmount(event, isHealingLikeEvent(event) ? "healing" : "damage"))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sliceType === "drums" && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                            Drums usage by boss fight
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {(selectedPlayerAnalytics?.drumsCoverage || []).length > 0 && (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.3fr) 84px 112px 96px",
                                  gap: space[2],
                                  padding: `0 ${space[3]}px`,
                                  fontSize: fontSize.sm,
                                  fontWeight: fontWeight.bold,
                                  color: text.primary,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                <div>Encounter</div>
                                <div>Casts</div>
                                <div>Affected</div>
                                <div>Avg / Cast</div>
                              </div>
                            )}
                            {!(selectedPlayerAnalytics?.drumsCoverage || []).length && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                No drums usage was found for this player in the current filtered fights.
                              </div>
                            )}
                            {(selectedPlayerAnalytics?.drumsCoverage || []).map(row => (
                              <div
                                key={`drum-row-${row.fightId}`}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.3fr) 84px 112px 96px",
                                  gap: space[2],
                                  padding: space[3],
                                  border: `1px solid ${border.subtle}`,
                                  borderRadius: radius.base,
                                  background: surface.card,
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ fontSize: fontSize.sm, color: text.primary }}>
                                  <div>{row.fightName}</div>
                                  {row.abilityBreakdown?.length > 0 && (
                                    <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
                                      {row.abilityBreakdown.map(entry => `${entry.label} ${entry.casts}`).join(" · ")}
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: "#d6e7ff", fontWeight: fontWeight.semibold }}>
                                  {row.casts}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: "#d6e7ff", fontWeight: fontWeight.semibold }}>
                                  {formatMetricValue(row.affectedTargets)}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {row.averageAffectedPerCast > 0 ? row.averageAffectedPerCast.toFixed(1) : "0.0"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sliceType === "consumables" && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                            Consumable coverage by boss fight
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {(selectedPlayerAnalytics?.consumableCoverage || []).length > 0 && (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr) 92px",
                                  gap: space[2],
                                  padding: `0 ${space[3]}px`,
                                  fontSize: fontSize.sm,
                                  fontWeight: fontWeight.bold,
                                  color: text.primary,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                <div>Encounter</div>
                                <div>Scrolls</div>
                                <div>Flask / Elixirs</div>
                                <div>Food</div>
                                <div>Status</div>
                              </div>
                            )}
                            {!(selectedPlayerAnalytics?.consumableCoverage || []).length && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                No boss-fight consumable coverage is attached to this player on the current filtered fights. Re-import the report to populate this view.
                              </div>
                            )}
                            {(selectedPlayerAnalytics?.consumableCoverage || []).map(row => {
                              const rowIssues = Number(!row.hasElixirCoverage) + Number(!row.hasFood);
                              return (
                                <div
                                  key={`consumable-row-${row.fightId}`}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr) 92px",
                                    gap: space[2],
                                    padding: space[3],
                                    border: `1px solid ${border.subtle}`,
                                    borderRadius: radius.base,
                                    background: surface.card,
                                    alignItems: "center",
                                  }}
                                >
                                  <div style={{ fontSize: fontSize.sm, color: text.primary }}>{row.fightName}</div>
                                  <div style={{ fontSize: fontSize.sm, color: row.hasScroll ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                                    {formatAuraList(row.scrollNames)}
                                  </div>
                                  <div style={{ fontSize: fontSize.sm, color: row.hasElixirCoverage ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                                    {`${row.elixirUnitsCovered || 0}/${row.elixirUnitsRequired || 0} · ${row.hasFlask
                                      ? formatAuraList(row.flaskNames)
                                      : formatAuraList([...(row.battleElixirNames || []), ...(row.guardianElixirNames || [])])}`}
                                  </div>
                                  <div style={{ fontSize: fontSize.sm, color: row.hasFood ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                                    {formatAuraList(row.foodNames)}
                                  </div>
                                  <div style={{ fontSize: fontSize.sm, color: rowIssues > 0 ? "#ffd5d5" : "#d7ffdf", fontWeight: fontWeight.semibold }}>
                                    {rowIssues > 0 ? `${rowIssues} issue${rowIssues === 1 ? "" : "s"}` : "Good"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {(sliceType === "damage" || sliceType === "healing") && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                            {sliceType === "healing" ? "Healing breakdown" : "Damage breakdown"}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {!(sliceType === "healing" ? visiblePlayerHealingBreakdown.length : visiblePlayerDamageBreakdown.length) && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                {`No ${sliceType} ability breakdown found for this player in the current filtered fights.`}
                              </div>
                            )}
                            {(sliceType === "healing" ? visiblePlayerHealingBreakdown.length : visiblePlayerDamageBreakdown.length) > 0 && (
                              <div style={{ overflowX: "auto", paddingBottom: 2 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: space[2], minWidth: 680 }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "minmax(180px, 1.8fr) minmax(110px, 0.9fr) 64px 64px 112px minmax(96px, 1fr)",
                                      gap: space[2],
                                      padding: `0 ${space[3]}px`,
                                      fontSize: fontSize.sm,
                                      fontWeight: fontWeight.bold,
                                      color: text.primary,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                    }}
                                  >
                                    <div>Ability</div>
                                    <div>Total</div>
                                    <div>Casts</div>
                                    <div>Hits</div>
                                    <div>Crits</div>
                                    <div>{sliceType === "healing" ? "Overheal" : ""}</div>
                                  </div>
                                  {(sliceType === "healing" ? visiblePlayerHealingBreakdown : visiblePlayerDamageBreakdown).map(ability => (
                                    <div
                                      key={`${sliceType}-${ability.key}`}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(180px, 1.8fr) minmax(110px, 0.9fr) 64px 64px 112px minmax(96px, 1fr)",
                                        gap: space[2],
                                        padding: space[3],
                                        border: `1px solid ${border.subtle}`,
                                        borderRadius: radius.base,
                                        background: surface.card,
                                        alignItems: "center",
                                      }}
                                    >
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold, minWidth: 0, overflowWrap: "anywhere" }}>
                                        <WowheadSpellAbility spellId={ability.guid} name={ability.name} />
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold, whiteSpace: "nowrap" }}>
                                        {formatMetricValue(ability.total)}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, whiteSpace: "nowrap" }}>
                                        {ability.casts || 0}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, whiteSpace: "nowrap" }}>
                                        {ability.hits || 0}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, whiteSpace: "nowrap" }}>
                                        {`${ability.crits || 0} (${ability.hits > 0 ? formatPercent((Number(ability.crits || 0) / Number(ability.hits || 1)) * 100) : "0%"})`}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary, whiteSpace: "nowrap" }}>
                                        {sliceType === "healing" ? `${formatMetricValue(ability.overheal)} overheal` : ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Detected Gear Issues</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                          {!selectedPlayerAnalytics?.hasGearData && (
                            <div style={{ fontSize: fontSize.sm, color: intent.warning }}>
                              No gear snapshot was detected for this player in the current imported datasets. Re-importing the raid usually fixes this when Warcraft Logs exposes combatant gear info for the selected report.
                            </div>
                          )}
                          {selectedPlayerIssueGroups.missingPermanent.map(issue => (
                            <div key={`perm-${issue.slot}-${issue.itemId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Missing permanent enchant: {issue.slotLabel} · <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink>
                            </div>
                          ))}
                          {selectedPlayerIssueGroups.missingTemporary.map(issue => (
                            <div key={`temp-${issue.slot}-${issue.itemId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Missing temporary enchant: {issue.slotLabel} · <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink>
                            </div>
                          ))}
                          {selectedPlayerIssueGroups.suboptimalTemporary.map(issue => (
                            <div key={`subtemp-${issue.slot}-${issue.itemId}-${issue.enchantId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Suboptimal temporary enchant: {issue.slotLabel} · <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink> · <WowheadSpellLink spellId={issue.enchantId}>{issue.enchantName}</WowheadSpellLink>
                            </div>
                          ))}
                          {selectedPlayerIssueGroups.commonGems.map(issue => (
                            <div key={`gem-common-${issue.itemId}-${issue.gemId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Common gem: <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink> · {issue.count} issue{issue.count === 1 ? "" : "s"}{issue.minItemLevel != null ? ` (lowest ilvl ${issue.minItemLevel})` : ""}
                            </div>
                          ))}
                          {selectedPlayerIssueGroups.uncommonGems.map(issue => (
                            <div key={`gem-uncommon-${issue.itemId}-${issue.gemId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Uncommon gem: <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink> · {issue.count} issue{issue.count === 1 ? "" : "s"}{issue.minItemLevel != null ? ` (lowest ilvl ${issue.minItemLevel})` : ""}
                            </div>
                          ))}
                          {selectedPlayerIssueGroups.rareGems.map(issue => (
                            <div key={`gem-${issue.itemId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              Sub-epic rare gem: <WowheadItemLink itemId={issue.itemId}>{issue.itemName}</WowheadItemLink> · {issue.count} issue{issue.count === 1 ? "" : "s"}{issue.minItemLevel != null ? ` (lowest ilvl ${issue.minItemLevel})` : ""}
                            </div>
                          ))}
                          {!(
                            selectedPlayerIssueGroups.missingPermanent.length ||
                            selectedPlayerIssueGroups.missingTemporary.length ||
                            selectedPlayerIssueGroups.suboptimalTemporary.length ||
                            selectedPlayerIssueGroups.commonGems.length ||
                            selectedPlayerIssueGroups.uncommonGems.length ||
                            selectedPlayerIssueGroups.rareGems.length
                          ) && (
                            <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                              {selectedPlayerAnalytics?.hasGearData
                                ? "No baseline enchant or gem issues detected."
                                : "No gear issues shown because no gear snapshot is currently attached to this player."}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Detected temporary weapon enchants</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                          {(selectedPlayerAnalytics?.temporaryEnchantIssues?.activeTemporaryEnchants || []).map(issue => (
                            <div key={`active-temp-${issue.slot}-${issue.itemId}-${issue.enchantId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              {issue.slotLabel}: <WowheadSpellLink spellId={issue.enchantId}>{issue.enchantName}</WowheadSpellLink>
                            </div>
                          ))}
                          {!(selectedPlayerAnalytics?.temporaryEnchantIssues?.activeTemporaryEnchants || []).length && (
                            <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                              No active temporary weapon enchant was captured for this player.
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Selected fight gear</div>
                        {!selectedFightId && (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                            Select an encounter to load the player&apos;s fight-start gear snapshot.
                          </div>
                        )}
                        {selectedFightId && !selectedFightSnapshot && (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                            No fight-start gear snapshot was found for this player on the selected encounter.
                          </div>
                        )}
                        {selectedFightGear.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "72px minmax(110px, 130px) minmax(0, 1fr) minmax(180px, 0.7fr)",
                                gap: space[3],
                                padding: `${space[2]}px ${space[3]}px`,
                                color: text.muted,
                                fontSize: fontSize.xs,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              <div>Ilvl</div>
                              <div>Slot</div>
                              <div>Item</div>
                              <div>Enchant / Gems</div>
                            </div>
                            {selectedFightGear.map(item => {
                              const isEmptySlot = !item?.id;
                              return (
                              <div
                                key={`fight-gear-${item.slot}-${item.id ?? "empty"}`}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "72px minmax(110px, 130px) minmax(0, 1fr) minmax(180px, 0.7fr)",
                                  gap: space[3],
                                  alignItems: "start",
                                  padding: space[3],
                                  border: `1px solid ${border.subtle}`,
                                  borderRadius: radius.base,
                                  background: surface.card,
                                }}
                              >
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {isEmptySlot ? "" : (item.itemLevel ?? "")}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                  {GEAR_SLOT_LABELS[item.slot] || `Slot ${item.slot}`}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: space[2], minWidth: 0 }}>
                                    {!isEmptySlot && getResolvedItemIconUrl(item, itemMetaById) ? (
                                      <img
                                        src={getResolvedItemIconUrl(item, itemMetaById)}
                                        alt=""
                                        style={{
                                          width: 36,
                                          height: 36,
                                          borderRadius: 6,
                                          border: `1px solid ${border.subtle}`,
                                          objectFit: "cover",
                                          flexShrink: 0,
                                        }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width: 36,
                                          height: 36,
                                          borderRadius: 6,
                                          border: `1px solid ${border.subtle}`,
                                          background: surface.base,
                                          flexShrink: 0,
                                        }}
                                      />
                                    )}
                                    {!isEmptySlot && (
                                      <div style={{ minWidth: 0, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                                        <WowheadGearItemLink item={item} gear={selectedFightGear}>
                                          <span style={{ color: getResolvedQualityColor(item, itemMetaById) }}>
                                            {getResolvedDisplayName(item, itemMetaById, "Item")}
                                          </span>
                                        </WowheadGearItemLink>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                                  {!!(getPermanentEnchantLabel(item) || getItemEnchantId(item)) && (
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: fontSize.xs, color: "#1eff00", minWidth: 0 }}>
                                        {getPermanentEnchantLabel(item) || `Enchant ${getItemEnchantId(item)}`}
                                      </div>
                                    </div>
                                  )}
                                  {!!getTemporaryEnchantLabel(item) && (
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: fontSize.xs, color: "#1eff00", minWidth: 0 }}>
                                        {getTemporaryEnchantLabel(item)}
                                      </div>
                                    </div>
                                  )}
                                  {(item.gems || []).length > 0 && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      {(item.gems || []).map((gem, index) => (
                                        <WowheadItemLink key={`fight-gear-gem-row-${item.id}-${gem.id}-${index}`} itemId={gem.id}>
                                          {getResolvedItemIconUrl(gem, itemMetaById) ? (
                                            <img
                                              src={getResolvedItemIconUrl(gem, itemMetaById)}
                                              alt=""
                                              style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: 4,
                                                border: `1px solid ${border.subtle}`,
                                                objectFit: "cover",
                                                flexShrink: 0,
                                              }}
                                            />
                                          ) : (
                                            <div
                                              style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: 4,
                                                border: `1px solid ${border.subtle}`,
                                                background: surface.base,
                                                flexShrink: 0,
                                              }}
                                            />
                                          )}
                                        </WowheadItemLink>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Tracked buff auras</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: space[2], maxHeight: 220, overflowY: "auto" }}>
                          {(selectedPlayer.analytics?.buffAuras || []).slice(0, 20).map(aura => (
                            <div key={`aura-${aura.guid}-${aura.name}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              {aura.name} · {aura.totalUses} uses
                            </div>
                          ))}
                          {!(selectedPlayer.analytics?.buffAuras || []).length && (
                            <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                              No buff aura data was detected for this player in the current import.
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Persisted summary payload</div>
                        <pre style={{
                          margin: 0,
                          padding: space[3],
                          background: surface.base,
                          border: `1px solid ${border.subtle}`,
                          borderRadius: radius.base,
                          color: text.secondary,
                          fontFamily: font.mono,
                          fontSize: 12,
                          lineHeight: 1.5,
                          overflow: "auto",
                          maxHeight: 360,
                        }}>
                          {JSON.stringify(selectedPlayer.summary || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
              )}
            </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

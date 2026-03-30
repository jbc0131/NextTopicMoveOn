import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

const TRACKED_DEBUFF_ROWS = [
  { key: "blood-frenzy-estimate", label: "Blood Frenzy", className: "Warrior", order: 0, estimated: true },
  { key: "armor-reduction", label: "Sunder Armor / IEA", className: "Warrior", order: 1 },
  { key: "demoralizing-shout", label: "Demoralizing Shout", className: "Warrior", order: 2 },
  { key: "curse-of-recklessness", label: "Curse of Recklessness", className: "Warlock", order: 3 },
  { key: "curse-of-the-elements", label: "Curse of the Elements", className: "Warlock", order: 4 },
  { key: "curse-of-weakness", label: "Curse of Weakness", className: "Warlock", order: 5 },
  { key: "hunters-mark", label: "Hunter's Mark", className: "Hunter", order: 6 },
  { key: "expose-weakness", label: "Expose Weakness", className: "Hunter", order: 7 },
  { key: "faerie-fire", label: "Faerie Fire", className: "Druid", order: 8 },
  { key: "judgement-of-wisdom", label: "Judgement of Wisdom", className: "Paladin", order: 9 },
  { key: "judgement-of-the-crusader", label: "Judgement of the Crusader", className: "Paladin", order: 10 },
];
const SUNDER_BAR_COLOR = "#4fb26f";
const ARMOR_STACK_MARKER_COUNT = 5;
const UNDER_DEVELOPMENT_BADGE_STYLE = {
  alignSelf: "flex-start",
  padding: "6px 10px",
  borderRadius: radius.pill,
  background: "rgba(245, 200, 66, 0.18)",
  border: "1px solid rgba(245, 200, 66, 0.55)",
  color: "#ffd54a",
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};
const RAID_ANALYTICS_FILTERS_BY_SLICE = {
  damage: ["missing-enchants", "engineering"],
  potions: ["potion-issues"],
  consumables: ["consumables"],
  healing: ["hearthstone"],
};
const VALID_RPB_TABS = new Set([
  "damage",
  "healing",
  "deaths",
  "drums",
  "potions",
  "consumables",
  "debuffs",
]);

const MOBILE_BREAKPOINT = 960;

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
const POTION_SECTION_ORDER = {
  prepull: 0,
  combat: 1,
  recovery: 2,
};
const LOW_PREPOT_OVERLAP_RATIO = 0.72;
const POTION_AURA_RULES = [
  { match: "destruction", label: "Destruction", category: "potion", durationMs: 15000 },
  { match: "haste", label: "Haste", category: "potion", durationMs: 15000 },
  { match: "heroic potion", label: "Heroic Potion", category: "potion", durationMs: 15000 },
  { match: "insane strength", label: "Insane Strength", category: "potion", durationMs: 15000 },
  { match: "ironshield", label: "Ironshield", category: "potion", durationMs: 120000 },
  { match: "fel mana", label: "Fel Mana", category: "mana_potion", durationMs: 24000 },
  { match: "nightmare seed", label: "Nightmare Seed", category: "nightmare_seed", durationMs: 15000 },
];
const IGNORED_POTION_AURA_IDS = new Set(["21165"]);
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

function normalizeRpbTab(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_RPB_TABS.has(normalized) ? normalized : "damage";
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

function MobileSection({ title, children }) {
  return (
    <div style={{ ...panelStyle, padding: space[4], display: "flex", flexDirection: "column", gap: space[3] }}>
      <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MobileMenuButton({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={open}
      style={{
        ...btnStyle(open ? "primary" : "default", open),
        width: 40,
        minWidth: 40,
        height: 40,
        padding: 0,
        justifyContent: "center",
        gap: 3,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[0, 1, 2].map(line => (
          <span
            key={line}
            style={{
              display: "block",
              width: 16,
              height: 2,
              borderRadius: 999,
              background: "currentColor",
            }}
          />
        ))}
      </span>
    </button>
  );
}

function ReportPickerSheet({
  open,
  loadingList,
  teamFilter,
  setTeamFilter,
  filteredRaids,
  raidId,
  isAdmin,
  openRaidMenuId,
  setOpenRaidMenuId,
  openRaidActionsMenu,
  openRenameModal,
  openTagModal,
  mutateRaidMetadata,
  handleReimportRaid,
  setDeleteConfirmRaid,
  handleRaidSelection,
  openWclReport,
  copyRaidPublicUrl,
  reportUrl,
  setReportUrl,
  handleImport,
  importing,
  onClose,
}) {
  if (!open) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10002,
      background: "rgba(4, 10, 18, 0.82)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: space[3],
    }}>
      <div style={{
        ...panelStyle,
        width: "100%",
        maxWidth: 560,
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        padding: space[4],
        display: "flex",
        flexDirection: "column",
        gap: space[3],
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
          <div>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>Select a Raid Report</div>
            <div style={{ fontSize: fontSize.sm, color: text.muted, marginTop: 4 }}>
              Pick a saved report, then drill into slices from the main view.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...btnStyle("default"), height: 32 }}>
            Close
          </button>
        </div>

        <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          <input
            value={reportUrl}
            onChange={event => setReportUrl(event.target.value)}
            placeholder="Paste a Warcraft Logs report URL or report ID"
            style={{ ...inputStyle, height: 38, width: "100%" }}
          />
          <button type="submit" disabled={importing} style={{ ...btnStyle("primary", importing), height: 38, width: "100%", justifyContent: "center" }}>
            {importing ? <LoadingSpinner size={14} /> : "Import Report"}
          </button>
        </form>

        <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
          {TEAM_TAG_OPTIONS.map(option => {
            const active = normalizeTeamTag(teamFilter) === option.id;
            return (
              <button
                key={option.id || "all"}
                type="button"
                onClick={() => setTeamFilter(option.id)}
                style={teamFilterButtonStyle(option, active)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {loadingList && filteredRaids.length === 0 && (
            <div style={{ color: text.muted }}>Loading raids...</div>
          )}
          {!loadingList && filteredRaids.length === 0 && (
            <div style={{ color: text.muted }}>No reports available for the current team filter.</div>
          )}
          {filteredRaids.map((raid, index) => {
            const active = raid.id === raidId || raid.reportId === raidId;
            const teamOption = getTeamOption(raid.teamTag);
            const reportSpeedPercent = getRaidReportSpeedPercent(raid);
            const isNewestReport = index === 0;
            return (
              <div
                key={raid.id}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 30 }} onClick={event => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={event => openRaidActionsMenu(event, raid.id)}
                      style={{
                        ...btnStyle("default"),
                        width: 28,
                        minWidth: 28,
                        height: 28,
                        padding: 0,
                        justifyContent: "center",
                        borderRadius: radius.sm,
                      }}
                    >
                      ...
                    </button>
                  </div>
                <button
                  type="button"
                  onClick={() => handleRaidSelection(raid.id)}
                  style={{
                    ...btnStyle(active ? "primary" : "default", active),
                    width: "100%",
                    height: "auto",
                    minHeight: 88,
                    padding: space[3],
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 6,
                    textAlign: "left",
                    paddingRight: 42,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minWidth: 0, maxWidth: "100%" }}>
                    <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, minWidth: 0, flex: "1 1 180px", maxWidth: "100%", overflowWrap: "anywhere", lineHeight: 1.25 }}>
                      {raid.title || raid.reportId}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
                    {isNewestReport && (
                      <span style={{ ...tagStyle("success"), maxWidth: "100%", flexShrink: 0 }}>
                        Newest Report
                      </span>
                    )}
                    <span style={{ ...tagStyle(teamOption.tone), maxWidth: "100%" }}>{teamOption.shortLabel}</span>
                    {reportSpeedPercent != null && (
                      <span style={{ ...parseTagStyle(reportSpeedPercent), maxWidth: "100%" }}>
                        {`Speed ${Math.round(reportSpeedPercent)}`}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerDetailPanel({
  isMobile,
  selectedPlayer,
  selectedPlayerMetricTags,
  sliceType,
  abilityBreakdownRef,
  selectedPlayerDeathRows,
  selectedPlayerAnalytics,
  visiblePlayerHealingBreakdown,
  visiblePlayerDamageBreakdown,
  selectedPlayerIssueGroups,
  selectedFightId,
  selectedFightSnapshot,
  selectedFightGear,
  fightGearLoaded,
  loadSelectedFightGear,
  itemMetaById,
  closeSelectedPlayer,
  enableSwipeClose = false,
  onSwipeDismiss = null,
  scrollContainerRef = null,
}) {
  const detailPanelRef = useRef(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(0);
  const compactDetail = isMobile || (detailPanelWidth > 0 && detailPanelWidth < 760);
  const swipeStartRef = useRef(null);
  const swipeDismissModeRef = useRef("");
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const deathGridColumns = compactDetail
    ? "minmax(72px, 88px) minmax(0, 1fr)"
    : "72px 72px minmax(120px, 1.25fr) 96px minmax(132px, 0.9fr) minmax(120px, 1fr)";
  const utilityGridColumns = compactDetail
    ? "minmax(0, 1fr) 72px 88px"
    : "minmax(0, 1.3fr) 84px 112px 96px";
  const consumableGridColumns = compactDetail
    ? "minmax(0, 1fr) minmax(0, 1fr)"
    : "minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr) 92px";
  const potionGridColumns = compactDetail
    ? "minmax(0, 1fr)"
    : "minmax(148px, 0.9fr) minmax(180px, 1.4fr) 92px minmax(120px, 0.9fr) 96px";
  const breakdownGridColumns = compactDetail
    ? "minmax(0, 1.3fr) minmax(88px, 0.7fr) 52px"
    : "minmax(180px, 1.8fr) minmax(110px, 0.9fr) 64px 64px 112px minmax(96px, 1fr)";
  const [mobilePreview, setMobilePreview] = useState(null);
  const potionRows = selectedPlayerAnalytics?.potionEvents || [];
  const potionSections = ["prepull", "combat", "recovery"].map(section => ({
    section,
    label: getPotionSectionLabel(section),
    rows: potionRows.filter(row => row.section === section),
  })).filter(group => group.rows.length > 0);
  const gearIssueRows = [
    ...(selectedPlayerIssueGroups.missingPermanent || []).map(issue => ({
      key: `perm-${issue.slot}-${issue.itemId}`,
      typeLabel: "Missing Permanent Enchant",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: issue.slotLabel || "",
      previewSubtitle: "Missing permanent enchant",
      slotLabel: issue.slotLabel || "",
    })),
    ...(selectedPlayerIssueGroups.missingTemporary || []).map(issue => ({
      key: `temp-${issue.slot}-${issue.itemId}`,
      typeLabel: "Missing Temporary Enchant",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: issue.slotLabel || "",
      previewSubtitle: "Missing temporary enchant",
      slotLabel: issue.slotLabel || "",
    })),
    ...(selectedPlayerIssueGroups.suboptimalTemporary || []).map(issue => ({
      key: `subtemp-${issue.slot}-${issue.itemId}-${issue.enchantId}`,
      typeLabel: "Suboptimal Temporary Enchant",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: issue.enchantName || "",
      previewSubtitle: "Suboptimal temporary enchant",
      slotLabel: issue.slotLabel || "",
      enchantId: issue.enchantId,
      enchantName: issue.enchantName,
    })),
    ...(selectedPlayerIssueGroups.commonGems || []).map(issue => ({
      key: `gem-common-${issue.itemId}-${issue.gemId}`,
      typeLabel: "Lower Quality Gem",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: `${issue.count} gem${issue.count === 1 ? "" : "s"}`,
      previewSubtitle: "Lower quality gem",
    })),
    ...(selectedPlayerIssueGroups.uncommonGems || []).map(issue => ({
      key: `gem-uncommon-${issue.itemId}-${issue.gemId}`,
      typeLabel: "Lower Quality Gem",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: `${issue.count} gem${issue.count === 1 ? "" : "s"}`,
      previewSubtitle: "Lower quality gem",
    })),
    ...(selectedPlayerIssueGroups.rareGems || []).map(issue => ({
      key: `gem-rare-${issue.itemId}-${issue.gemId || issue.count}`,
      typeLabel: "Lower Quality Gem",
      itemId: issue.itemId,
      itemName: issue.itemName,
      countLabel: `${issue.count} gem${issue.count === 1 ? "" : "s"}`,
      previewSubtitle: "Lower quality gem",
    })),
  ];
  const activeTemporaryEnchantRows = (selectedPlayerAnalytics?.temporaryEnchantIssues?.activeTemporaryEnchants || []).map(issue => ({
    key: `active-temp-${issue.slot}-${issue.itemId}-${issue.enchantId}`,
    slotLabel: issue.slotLabel || "",
    itemId: issue.itemId,
    itemName: issue.itemName,
    enchantId: issue.enchantId,
    enchantName: issue.enchantName,
  }));

  const openItemPreview = (item, options = {}) => {
    const resolvedItem = item?.id ? item : { id: options.itemId ?? item?.id, name: options.title };
    if (!resolvedItem?.id) return;

    const previewLines = [];
    if (options.subtitle) previewLines.push(options.subtitle);
    if (options.slotLabel) previewLines.push(options.slotLabel);

    const itemLevel = resolvedItem?.itemLevel ?? itemMetaById?.[String(resolvedItem.id)]?.itemLevel ?? null;
    if (itemLevel != null) previewLines.push(`ilvl ${itemLevel}`);

    const permanentEnchant = getPermanentEnchantLabel(resolvedItem)
      || options.enchantName
      || (getItemEnchantId(resolvedItem) ? `Enchant ${getItemEnchantId(resolvedItem)}` : "");
    if (permanentEnchant) previewLines.push(permanentEnchant);

    const temporaryEnchant = getTemporaryEnchantLabel(resolvedItem);
    if (temporaryEnchant) previewLines.push(temporaryEnchant);

    for (const gem of options.gems || resolvedItem?.gems || []) {
      previewLines.push(`Gem: ${getResolvedDisplayName(gem, itemMetaById, "Gem")}`);
    }

    setMobilePreview({
      title: options.title || getResolvedDisplayName(resolvedItem, itemMetaById, "Item"),
      href: options.href || (options.gear ? makeWowheadItemUrlWithGear(resolvedItem, options.gear) : makeWowheadItemUrl(resolvedItem.id)),
      color: getResolvedQualityColor(resolvedItem, itemMetaById),
      iconUrl: getResolvedItemIconUrl(resolvedItem, itemMetaById),
      lines: previewLines,
    });
  };

  const openSpellPreview = (spellId, title, subtitle = "") => {
    if (!spellId) return;
    const previewLines = [];
    if (subtitle) previewLines.push(subtitle);
    previewLines.push(`Spell ${spellId}`);
    setMobilePreview({
      title: title || `Spell ${spellId}`,
      href: makeWowheadSpellUrl(spellId),
      color: "#71d5ff",
      iconUrl: "",
      lines: previewLines,
    });
  };

  useEffect(() => {
    const panel = detailPanelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return undefined;

    const updateWidth = () => {
      setDetailPanelWidth(panel.getBoundingClientRect().width || 0);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  function handleTouchStart(event) {
    if (!enableSwipeClose) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeDismissModeRef.current = "";
    setSwipeOffset({ x: 0, y: 0 });
  }

  function handleTouchMove(event) {
    if (!enableSwipeClose) return;
    const start = swipeStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const scrollContainer = scrollContainerRef?.current || null;
    const scrollTop = Number(scrollContainer?.scrollTop || 0);
    const scrollHeight = Number(scrollContainer?.scrollHeight || 0);
    const clientHeight = Number(scrollContainer?.clientHeight || 0);
    const atTop = scrollTop <= 0;
    const atBottom = scrollHeight > 0 && (scrollTop + clientHeight >= scrollHeight - 2);

    if (deltaX > 0 && absX > absY) {
      event.preventDefault();
      swipeDismissModeRef.current = "right";
      setSwipeOffset({ x: deltaX, y: 0 });
      return;
    }

    if (absY > absX) {
      if (deltaY > 0 && atTop) {
        event.preventDefault();
        swipeDismissModeRef.current = "down";
        setSwipeOffset({ x: 0, y: deltaY });
        return;
      }

      if (deltaY < 0 && atBottom) {
        event.preventDefault();
        swipeDismissModeRef.current = "up";
        setSwipeOffset({ x: 0, y: deltaY });
        return;
      }
    }

    swipeDismissModeRef.current = "";
    setSwipeOffset({ x: 0, y: 0 });
  }

  function handleTouchEnd(event) {
    if (!enableSwipeClose) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const swipeMode = swipeDismissModeRef.current;
    swipeDismissModeRef.current = "";
    const dismiss = direction => {
      setSwipeOffset({ x: 0, y: 0 });
      if (onSwipeDismiss) {
        onSwipeDismiss(direction);
      } else {
        closeSelectedPlayer();
      }
    };

    if (swipeMode === "right" && deltaX >= 72 && absX > absY) {
      dismiss("right");
      return;
    }

    if (swipeMode === "down" && deltaY >= 72 && absY > absX) {
      dismiss("down");
      return;
    }

    if (swipeMode === "up" && deltaY <= -72 && absY > absX) {
      dismiss("up");
      return;
    }

    setSwipeOffset({ x: 0, y: 0 });
  }

  return (
    <div ref={detailPanelRef} style={{
      ...panelStyle,
      minWidth: 0,
      overflow: "hidden",
      position: "relative",
      transform: enableSwipeClose && (swipeOffset.x !== 0 || swipeOffset.y !== 0)
        ? `translate3d(${swipeOffset.x}px, ${swipeOffset.y}px, 0)`
        : undefined,
      transition: swipeStartRef.current ? "none" : "transform 180ms ease",
    }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div style={{
        padding: space[4],
        borderBottom: `1px solid ${border.subtle}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space[3],
        position: isMobile ? "sticky" : "static",
        top: 0,
        zIndex: 2,
        background: surface.panel,
      }}>
        <div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Player Detail
          </div>
          {isMobile && (
            <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
              Back returns to the slice list.
            </div>
          )}
        </div>
        <button onClick={() => {
          if (enableSwipeClose && onSwipeDismiss) {
            onSwipeDismiss("right");
            return;
          }
          closeSelectedPlayer();
        }} style={{ ...btnStyle("default"), height: 30 }}>
          {isMobile ? "Back" : "Close"}
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
                  {compactDetail ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                      {row.events.map((event, index) => (
                        <div key={`${row.key}-event-mobile-${index}`} style={{ padding: `${space[2]}px 0`, borderTop: index === 0 ? "none" : `1px solid ${border.subtle}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: space[2], flexWrap: "wrap" }}>
                            <span style={{ fontSize: fontSize.xs, color: text.secondary }}>
                              {formatDeathRelativeTime(
                                event.timestampMs ?? normalizeEncounterEventTimestamp(event.timestamp, { startTime: 0, durationMs: 0 }),
                                row.timestampMs
                              )}
                            </span>
                            <span style={{ fontSize: fontSize.xs, color: getDeathTimelineEventTone(event), fontWeight: fontWeight.semibold }}>
                              {getDeathTimelineEventLabel(event)}
                            </span>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <DeathEventHpBar event={event} compact />
                          </div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 8, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", textAlign: "center", alignItems: "center" }}>
                            <span style={{ color: text.primary }}>
                              {event?.abilityGuid ? (
                                <WowheadSpellLink
                                  spellId={event.abilityGuid}
                                  onPreview={() => openSpellPreview(event.abilityGuid, getAbilityName(event, "Unknown"), getDeathTimelineEventLabel(event))}
                                >
                                  {getAbilityName(event, "Unknown")}
                                </WowheadSpellLink>
                              ) : getAbilityName(event, "Unknown")}
                            </span>
                            <span style={{ color: getDeathTimelineEventTone(event), fontWeight: fontWeight.semibold }}>{getDeathEventAmountLabel(event)}</span>
                            <span style={{ color: getDeathEventSourceColor(event), fontWeight: fontWeight.semibold }}>{getSourceName(event)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                      {row.events.map((event, index) => (
                        <div key={`${row.key}-event-${index}`} style={{ padding: `${space[2]}px 0`, borderTop: index === 0 ? "none" : `1px solid ${border.subtle}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], flexWrap: "wrap" }}>
                            <span style={{ fontSize: fontSize.sm, color: text.secondary, whiteSpace: "nowrap" }}>
                              {formatDeathRelativeTime(
                                event.timestampMs ?? normalizeEncounterEventTimestamp(event.timestamp, { startTime: 0, durationMs: 0 }),
                                row.timestampMs
                              )}
                            </span>
                            <span style={{ fontSize: fontSize.sm, color: getDeathTimelineEventTone(event), fontWeight: fontWeight.semibold }}>
                              {getDeathTimelineEventLabel(event)}
                            </span>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <DeathEventHpBar event={event} />
                          </div>
                          <div style={{ fontSize: fontSize.lg, color: text.secondary, marginTop: 8, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", textAlign: "center", alignItems: "center" }}>
                            <span style={{ color: text.primary }}>
                              {event?.abilityGuid ? (
                                <WowheadSpellLink
                                  spellId={event.abilityGuid}
                                  onPreview={() => openSpellPreview(event.abilityGuid, getAbilityName(event, "Unknown"), getDeathTimelineEventLabel(event))}
                                >
                                  {getAbilityName(event, "Unknown")}
                                </WowheadSpellLink>
                              ) : getAbilityName(event, "Unknown")}
                            </span>
                            <span style={{ color: getDeathTimelineEventTone(event), fontWeight: fontWeight.semibold }}>{getDeathEventAmountLabel(event)}</span>
                            <span style={{ color: getDeathEventSourceColor(event), fontWeight: fontWeight.semibold }}>{getSourceName(event)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
              {(selectedPlayerAnalytics?.drumsCoverage || []).length > 0 && !compactDetail && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: utilityGridColumns,
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
                      gridTemplateColumns: compactDetail ? "minmax(0, 1fr)" : utilityGridColumns,
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
                  {compactDetail ? (
                    <div style={{ display: "flex", gap: space[3], flexWrap: "wrap", fontSize: fontSize.sm }}>
                      <span style={{ color: "#d6e7ff", fontWeight: fontWeight.semibold }}>{row.casts} casts</span>
                      <span style={{ color: "#d6e7ff", fontWeight: fontWeight.semibold }}>{formatMetricValue(row.affectedTargets)} affected</span>
                      <span style={{ color: text.secondary }}>{row.averageAffectedPerCast > 0 ? row.averageAffectedPerCast.toFixed(1) : "0.0"} avg/cast</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: fontSize.sm, color: "#d6e7ff", fontWeight: fontWeight.semibold }}>
                        {row.casts}
                      </div>
                      <div style={{ fontSize: fontSize.sm, color: "#d6e7ff", fontWeight: fontWeight.semibold }}>
                        {formatMetricValue(row.affectedTargets)}
                      </div>
                      <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                        {row.averageAffectedPerCast > 0 ? row.averageAffectedPerCast.toFixed(1) : "0.0"}
                      </div>
                    </>
                  )}
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
              {(selectedPlayerAnalytics?.consumableCoverage || []).length > 0 && !compactDetail && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: consumableGridColumns,
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
                      gridTemplateColumns: compactDetail ? "minmax(0, 1fr)" : consumableGridColumns,
                      gap: space[2],
                      padding: space[3],
                      border: `1px solid ${border.subtle}`,
                      borderRadius: radius.base,
                      background: surface.card,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: fontSize.sm, color: text.primary }}>{row.fightName}</div>
                    {compactDetail ? (
                      <>
                        <div style={{ fontSize: fontSize.sm, color: row.hasScroll ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                          {`Scrolls: ${formatAuraList(row.scrollNames)}`}
                        </div>
                        <div style={{ fontSize: fontSize.sm, color: row.hasElixirCoverage ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                          {`Flask / Elixirs: ${row.elixirUnitsCovered || 0}/${row.elixirUnitsRequired || 0} · ${row.hasFlask
                            ? formatAuraList(row.flaskNames)
                            : formatAuraList([...(row.battleElixirNames || []), ...(row.guardianElixirNames || [])])}`}
                        </div>
                        <div style={{ fontSize: fontSize.sm, color: row.hasFood ? "#d7ffdf" : "#ffd5d5", fontWeight: fontWeight.semibold, overflowWrap: "anywhere" }}>
                          {`Food: ${formatAuraList(row.foodNames)}`}
                        </div>
                        <div style={{ fontSize: fontSize.sm, color: rowIssues > 0 ? "#ffd5d5" : "#d7ffdf", fontWeight: fontWeight.semibold }}>
                          {rowIssues > 0 ? `${rowIssues} issue${rowIssues === 1 ? "" : "s"}` : "Good"}
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sliceType === "potions" && (
          <div>
            <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
              Potions and one-shot consumables by boss fight
            </div>
            {!potionRows.length && (
              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                No potion or consumable event timeline is attached to this player for the current filtered fights. Re-import the report to populate this view.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: space[3] }}>
              {potionSections.map(group => (
                <div key={`potions-${group.section}`} style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                  <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: text.primary }}>
                    {group.label}
                  </div>
                  {!compactDetail && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: potionGridColumns,
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
                      <div>Consumable</div>
                      <div>Time</div>
                      <div>Benefit</div>
                      <div>Amount</div>
                    </div>
                  )}
                  {group.rows.map(row => {
                    const overlapRatio = getPotionOverlapRatio(row);
                    const lowOverlap = row.section === "prepull" && overlapRatio > 0 && overlapRatio < LOW_PREPOT_OVERLAP_RATIO;
                    const benefitLabel = getPotionBenefitLabel(row);
                    const amountLabel = Number(row.amount || 0) > 0 ? formatMetricValue(row.amount) : "";
                    const timeLabel = formatPotionRelativeTime(row.relativeTimeMs);
                    const spellTitle = getPotionEventDisplayLabel(row);
                    const amountColor = getPotionAmountColor(row, text);
                    return (
                      <div
                        key={row.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: compactDetail ? "minmax(0, 1fr)" : potionGridColumns,
                          gap: space[2],
                          padding: space[3],
                          border: `1px solid ${border.subtle}`,
                          borderRadius: radius.base,
                          background: surface.card,
                          alignItems: "center",
                        }}
                      >
                        {compactDetail ? (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: space[2], alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold }}>
                                {row.fightName}
                              </span>
                              <span style={{ fontSize: fontSize.sm, color: lowOverlap ? "#ffd5a1" : "#d6e7ff", fontWeight: fontWeight.semibold }}>
                                {`${row.isPrepull ? "⌚ " : ""}${timeLabel}`}
                              </span>
                            </div>
                            <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0, overflowWrap: "anywhere" }}>
                              {row.spellId ? (
                                <WowheadSpellLink
                                  spellId={row.spellId}
                                  onPreview={compactDetail ? () => openSpellPreview(row.spellId, spellTitle, row.fightName) : null}
                                >
                                  {spellTitle}
                                </WowheadSpellLink>
                              ) : spellTitle}
                            </div>
                            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap", fontSize: fontSize.xs }}>
                              <span style={{ color: lowOverlap ? "#ffd5a1" : text.secondary }}>
                                {benefitLabel || "No buff overlap"}
                              </span>
                              {amountLabel && (
                                <span style={{ color: amountColor, fontWeight: fontWeight.semibold }}>
                                  {amountLabel}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: fontSize.sm, color: text.primary }}>
                              {row.fightName}
                            </div>
                            <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0, overflowWrap: "anywhere" }}>
                              {row.spellId ? (
                                <WowheadSpellLink
                                  spellId={row.spellId}
                                  onPreview={compactDetail ? () => openSpellPreview(row.spellId, spellTitle, row.fightName) : null}
                                >
                                  {spellTitle}
                                </WowheadSpellLink>
                              ) : spellTitle}
                            </div>
                            <div style={{ fontSize: fontSize.sm, color: lowOverlap ? "#ffd5a1" : "#d6e7ff", fontWeight: fontWeight.semibold }}>
                              {`${row.isPrepull ? "⌚ " : ""}${timeLabel}`}
                            </div>
                            <div style={{ fontSize: fontSize.sm, color: lowOverlap ? "#ffd5a1" : text.secondary }}>
                              {benefitLabel || "No buff overlap"}
                            </div>
                            <div style={{ fontSize: fontSize.sm, color: amountLabel ? amountColor : text.secondary, fontWeight: amountLabel ? fontWeight.semibold : fontWeight.regular }}>
                              {amountLabel}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
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
                <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                  {compactDetail ? (
                    (sliceType === "healing" ? visiblePlayerHealingBreakdown : visiblePlayerDamageBreakdown).map(ability => (
                      <div
                        key={`${sliceType}-${ability.key}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: space[2],
                          padding: space[3],
                          border: `1px solid ${border.subtle}`,
                          borderRadius: radius.base,
                          background: surface.card,
                        }}
                      >
                        <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold, minWidth: 0, overflowWrap: "anywhere" }}>
                          <WowheadSpellAbility spellId={ability.guid} name={ability.name} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space[2] }}>
                          {[
                            { label: "Total", value: formatMetricValue(ability.total) },
                            { label: "Casts", value: ability.casts || 0 },
                            { label: "Hits", value: ability.hits || 0 },
                            { label: "Crits", value: `${ability.crits || 0}${ability.hits > 0 ? ` (${formatPercent((Number(ability.crits || 0) / Number(ability.hits || 1)) * 100)})` : ""}` },
                            ...(sliceType === "healing" ? [{ label: "Overheal", value: formatMetricValue(ability.overheal) }] : []),
                          ].map(metric => (
                            <div
                              key={`${ability.key}-${metric.label}`}
                              style={{
                                padding: `${space[2]}px ${space[2]}px`,
                                borderRadius: radius.sm,
                                background: surface.base,
                                border: `1px solid ${border.subtle}`,
                                minWidth: 0,
                              }}
                            >
                              <div style={{ fontSize: 11, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {metric.label}
                              </div>
                              <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold, marginTop: 4, overflowWrap: "anywhere" }}>
                                {metric.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: breakdownGridColumns,
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
                  )}
                  {!compactDetail && (sliceType === "healing" ? visiblePlayerHealingBreakdown : visiblePlayerDamageBreakdown).map(ability => (
                    <div
                      key={`${sliceType}-${ability.key}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: breakdownGridColumns,
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
                      <>
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
                        </>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {(gearIssueRows.length > 0 || !selectedPlayerAnalytics?.hasGearData) && (
        <div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
            Gear Issues
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {!selectedPlayerAnalytics?.hasGearData && (
              <div style={{ fontSize: fontSize.sm, color: intent.warning }}>
                No gear snapshot was detected for this player in the current imported datasets. Re-importing the raid usually fixes this when Warcraft Logs exposes combatant gear info for the selected report.
              </div>
            )}
            {gearIssueRows.length > 0 && (
              <>
                {!compactDetail && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1.2fr) 120px",
                      gap: space[2],
                      padding: `0 ${space[3]}px`,
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.bold,
                      color: text.primary,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <div>Type</div>
                    <div>Item</div>
                    <div>Detail</div>
                  </div>
                )}
                {gearIssueRows.map(row => (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: compactDetail ? "minmax(0, 1fr)" : "minmax(180px, 1fr) minmax(180px, 1.2fr) 120px",
                      gap: space[2],
                      padding: space[3],
                      border: `1px solid ${border.subtle}`,
                      borderRadius: radius.base,
                      background: surface.card,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold }}>
                      {row.typeLabel}
                    </div>
                    <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0, overflowWrap: "anywhere" }}>
                      <WowheadItemLink
                        itemId={row.itemId}
                        onPreview={compactDetail ? () => openItemPreview({ id: row.itemId, name: row.itemName }, { title: row.itemName, subtitle: row.previewSubtitle, slotLabel: row.slotLabel }) : null}
                      >
                        {row.itemName}
                      </WowheadItemLink>
                      {row.enchantId && row.enchantName ? (
                        <>
                          {" · "}
                          <WowheadSpellLink
                            spellId={row.enchantId}
                            onPreview={compactDetail ? () => openSpellPreview(row.enchantId, row.enchantName, row.slotLabel) : null}
                          >
                            {row.enchantName}
                          </WowheadSpellLink>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                      {row.countLabel}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        )}

        {activeTemporaryEnchantRows.length > 0 && (
          <div>
            <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
              Temporary Weapon Enchants
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              {!compactDetail && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px minmax(180px, 1.2fr) minmax(160px, 1fr)",
                    gap: space[2],
                    padding: `0 ${space[3]}px`,
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.bold,
                    color: text.primary,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <div>Slot</div>
                  <div>Item</div>
                  <div>Enchant</div>
                </div>
              )}
              {activeTemporaryEnchantRows.map(issue => (
                <div
                  key={issue.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: compactDetail ? "minmax(0, 1fr)" : "120px minmax(180px, 1.2fr) minmax(160px, 1fr)",
                    gap: space[2],
                    padding: space[3],
                    border: `1px solid ${border.subtle}`,
                    borderRadius: radius.base,
                    background: surface.card,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold }}>
                    {issue.slotLabel}
                  </div>
                  <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0, overflowWrap: "anywhere" }}>
                    <WowheadItemLink
                      itemId={issue.itemId}
                      onPreview={compactDetail ? () => openItemPreview({ id: issue.itemId, name: issue.itemName }, { title: issue.itemName, subtitle: "Temporary weapon enchant", slotLabel: issue.slotLabel }) : null}
                    >
                      {issue.itemName}
                    </WowheadItemLink>
                  </div>
                  <div style={{ fontSize: fontSize.sm, color: text.secondary, minWidth: 0, overflowWrap: "anywhere" }}>
                    <WowheadSpellLink
                      spellId={issue.enchantId}
                      onPreview={compactDetail ? () => openSpellPreview(issue.enchantId, issue.enchantName, issue.slotLabel) : null}
                    >
                      {issue.enchantName}
                    </WowheadSpellLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2], fontWeight: fontWeight.bold, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Selected Fight Gear
          </div>
          {!selectedFightId && (
            <div style={{ fontSize: fontSize.sm, color: text.muted }}>
              Select an encounter to load the player&apos;s fight-start gear snapshot.
            </div>
          )}
          {selectedFightId && !fightGearLoaded && (
            <button onClick={loadSelectedFightGear} style={{ ...btnStyle("default"), height: 32 }}>
              Load fight gear
            </button>
          )}
          {selectedFightId && fightGearLoaded && !selectedFightSnapshot && (
            <div style={{ fontSize: fontSize.sm, color: text.muted }}>
              No fight-start gear snapshot was found for this player on the selected encounter.
            </div>
          )}
          {selectedFightId && fightGearLoaded && selectedFightGear.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              {selectedFightGear.map(item => {
                const isEmptySlot = !item?.id;
                const slotLabel = GEAR_SLOT_LABELS[item.slot] || `Slot ${item.slot}`;
                return (
                  <div
                    key={`fight-gear-${item.slot}-${item.id ?? "empty"}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: compactDetail ? "36px 56px minmax(0, 1fr) minmax(0, 1fr)" : "56px 96px minmax(140px, 1fr) minmax(180px, 1.2fr)",
                      gap: space[2],
                      alignItems: "start",
                      padding: space[3],
                      border: `1px solid ${border.subtle}`,
                      borderRadius: radius.base,
                      background: surface.card,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: fontSize.xs, color: text.secondary, textAlign: "center", paddingTop: 4 }}>
                      {!isEmptySlot ? (
                        <>
                          <div style={{ fontSize: compactDetail ? 11 : 12, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>ilvl</div>
                          <div style={{ fontSize: compactDetail ? fontSize.sm : fontSize.base, fontWeight: fontWeight.semibold }}>
                            {item.itemLevel ?? "?"}
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 4, minWidth: 0, overflowWrap: "anywhere" }}>
                      {slotLabel}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: space[2], minWidth: 0 }}>
                      {!isEmptySlot && getResolvedItemIconUrl(item, itemMetaById) ? (
                        <img
                          src={getResolvedItemIconUrl(item, itemMetaById)}
                          alt=""
                          style={{
                            width: compactDetail ? 28 : 40,
                            height: compactDetail ? 28 : 40,
                            borderRadius: 6,
                            border: `1px solid ${border.subtle}`,
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: compactDetail ? 28 : 40,
                            height: compactDetail ? 28 : 40,
                            borderRadius: 6,
                            border: `1px solid ${border.subtle}`,
                            background: surface.base,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, paddingTop: 2 }}>
                        {!isEmptySlot ? (
                          <div style={{ fontSize: compactDetail ? fontSize.xs : fontSize.sm, fontWeight: fontWeight.semibold, minWidth: 0, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                            <WowheadGearItemLink item={item} gear={selectedFightGear} onPreview={compactDetail ? () => openItemPreview(item, {
                              gear: selectedFightGear,
                              slotLabel,
                              enchantName: getPermanentEnchantLabel(item),
                              gems: item.gems || [],
                            }) : null}>
                              <span style={{ color: getResolvedQualityColor(item, itemMetaById) }}>
                                {getResolvedDisplayName(item, itemMetaById, "Item")}
                              </span>
                            </WowheadGearItemLink>
                          </div>
                        ) : (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>Empty slot</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      {!!(getPermanentEnchantLabel(item) || getItemEnchantId(item)) && (
                        <div style={{ fontSize: fontSize.xs, color: "#1eff00", minWidth: 0, lineHeight: 1.35, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {getPermanentEnchantLabel(item) || `Enchant ${getItemEnchantId(item)}`}
                        </div>
                      )}
                      {!!getTemporaryEnchantLabel(item) && (
                        <div style={{ fontSize: fontSize.xs, color: "#1eff00", minWidth: 0, lineHeight: 1.35, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {getTemporaryEnchantLabel(item)}
                        </div>
                      )}
                      {(item.gems || []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(item.gems || []).map((gem, index) => (
                            <div key={`fight-gear-gem-row-${item.id}-${gem.id}-${index}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <WowheadItemLink itemId={gem.id} onPreview={compactDetail ? () => openItemPreview(gem, { title: getResolvedDisplayName(gem, itemMetaById, "Gem") }) : null}>
                                {getResolvedItemIconUrl(gem, itemMetaById) ? (
                                  <img
                                    src={getResolvedItemIconUrl(gem, itemMetaById)}
                                    alt=""
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 4,
                                      border: `1px solid ${border.subtle}`,
                                      objectFit: "cover",
                                      flexShrink: 0,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 4,
                                      border: `1px solid ${border.subtle}`,
                                      background: surface.base,
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                              </WowheadItemLink>
                            </div>
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

      </div>
      <MobileWowheadPreviewModal preview={mobilePreview} onClose={() => setMobilePreview(null)} />
    </div>
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
  const direct = entry?.name
    || entry?.itemName
    || entry?.itemname
    || entry?.item?.name
    || entry?.item?.itemName
    || entry?.gemName
    || entry?.displayName
    || entry?.display_name;
  if (direct) return direct;
  const meta = itemMetaById?.[String(entry?.id ?? "")];
  return meta?.name || `${fallbackPrefix} ${entry?.id ?? ""}`.trim();
}

function handleWowheadPreview(event, onPreview) {
  if (!onPreview) return;
  event.preventDefault();
  event.stopPropagation();
  onPreview();
}

function WowheadItemLink({ itemId, children, onPreview = null }) {
  if (!itemId) return children;
  return (
    <a
      href={makeWowheadItemUrl(itemId)}
      onClick={event => handleWowheadPreview(event, onPreview)}
      data-wowhead={`item=${itemId}`}
      aria-label={`Item ${itemId}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadGearItemLink({ item, gear, children, onPreview = null }) {
  if (!item?.id) return children;

  const gems = (item.gems || []).map(gem => gem?.id).filter(Boolean);
  const enchantId = getItemEnchantId(item);
  const tooltipParts = [`item=${item.id}`];
  if (gems.length > 0) tooltipParts.push(`gems=${gems.join(":")}`);
  if (enchantId != null) tooltipParts.push(`ench=${String(enchantId)}`);

  return (
    <a
      href={makeWowheadItemUrlWithGear(item, gear)}
      onClick={event => handleWowheadPreview(event, onPreview)}
      data-wowhead={tooltipParts.join("&")}
      aria-label={`Item ${item.id}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadSpellLink({ spellId, children, onPreview = null }) {
  if (!spellId) return children;
  return (
    <a
      href={makeWowheadSpellUrl(spellId)}
      onClick={event => handleWowheadPreview(event, onPreview)}
      data-wowhead={`spell=${spellId}`}
      aria-label={`Spell ${spellId}`}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function WowheadSpellAbility({ spellId, name, onPreview = null }) {
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
    <WowheadSpellLink spellId={spellId} onPreview={onPreview}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </WowheadSpellLink>
  );
}

function MobileWowheadPreviewModal({ preview, onClose }) {
  if (!preview) return null;

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: space[3],
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: surface.panel,
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.lg,
          padding: space[4],
          display: "flex",
          flexDirection: "column",
          gap: space[3],
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: space[3] }}>
          {preview.iconUrl ? (
            <img
              src={preview.iconUrl}
              alt=""
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: `1px solid ${border.subtle}`,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: `1px solid ${border.subtle}`,
                background: surface.base,
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: preview.color || text.primary, lineHeight: 1.35, overflowWrap: "anywhere" }}>
              {preview.title}
            </div>
            {preview.lines?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {preview.lines.map((line, index) => (
                  <div key={`${preview.title}-${index}`} style={{ fontSize: fontSize.sm, color: text.secondary, overflowWrap: "anywhere" }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle("default")}>Close</button>
          <a href={preview.href} target="_blank" rel="noreferrer" style={{ ...btnStyle("primary"), textDecoration: "none" }}>
            Open Wowhead
          </a>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return modal;
  return createPortal(modal, document.body);
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

function getPotionFightEvents(snapshot, playerId, playerName) {
  const playerEntry = (snapshot?.players || []).find(entry =>
    String(entry?.playerId || "") === String(playerId) || entry?.name === playerName
  );

  return (playerEntry?.events || []).map((event, index) => ({
    ...event,
    key: event?.key || `potion:${snapshot?.fightId || "fight"}:${playerId}:${index}`,
    fightId: String(snapshot?.fightId || ""),
    fightName: snapshot?.fightName || "Unknown Fight",
  }));
}

function getPotionAuraRule(aura) {
  const normalizedName = String(aura?.name || "").trim().toLowerCase();
  const guid = aura?.guid != null ? String(aura.guid) : "";
  if (IGNORED_POTION_AURA_IDS.has(guid)) return null;
  if (!normalizedName) return null;
  return POTION_AURA_RULES.find(rule => normalizedName.includes(rule.match)) || null;
}

function buildPotionAuraEvents(buffSnapshot, playerId, playerName) {
  const entries = buffSnapshot?.buffs?.entries || [];
  const playerEntry = entries.find(entry =>
    String(entry?.id || "") === String(playerId) || entry?.name === playerName
  );
  if (!playerEntry) return [];

  const fightStart = Number(buffSnapshot?.buffs?.startTime || 0);
  const fightEnd = Number(buffSnapshot?.buffs?.endTime || 0);
  const rows = [];

  for (const aura of playerEntry?.auras || []) {
    const rule = getPotionAuraRule(aura);
    if (!rule) continue;

    const bands = Array.isArray(aura?.bands) && aura.bands.length > 0
      ? aura.bands
      : (Number(aura?.totalUptime || 0) > 0 && fightStart > 0
        ? [{ startTime: fightStart, endTime: fightStart + Number(aura.totalUptime || 0) }]
        : []);

    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];
      const bandStart = Number(band?.startTime || 0);
      const bandEnd = Number(band?.endTime || 0);
      if (!(bandEnd > bandStart)) continue;

      const clippedDurationMs = Math.max(0, bandEnd - bandStart);
      const nominalDurationMs = Number(rule.durationMs || 0) > 0 ? Number(rule.durationMs) : clippedDurationMs;
      const startsAtPull = fightStart > 0 && Math.abs(bandStart - fightStart) <= 250;
      const inferredRelativeTimeMs = startsAtPull
        ? Math.min(0, clippedDurationMs - nominalDurationMs)
        : (bandStart - fightStart);
      const isPrepull = startsAtPull;
      const section = isPrepull ? "prepull" : "combat";
      const category = rule.category || "potion";
      const eventKind = isPrepull ? "prepot_buff" : "combat_buff";

      rows.push({
        key: `aura:${buffSnapshot?.fightId || "fight"}:${playerId}:${aura?.guid || rule.label}:${index}`,
        fightId: String(buffSnapshot?.fightId || ""),
        fightName: buffSnapshot?.fightName || "Unknown Fight",
        playerId: String(playerId || ""),
        playerName: playerName || playerEntry?.name || "Unknown Player",
        label: rule.label || aura?.name || "Unknown Consumable",
        spellId: aura?.guid ?? null,
        timestamp: startsAtPull ? fightStart : bandStart,
        relativeTimeMs: inferredRelativeTimeMs,
        isPrepull,
        section,
        category,
        eventKind,
        buffAppliedAtMs: inferredRelativeTimeMs,
        buffRemovedAtMs: Math.max(0, bandEnd - fightStart),
        totalDurationMs: nominalDurationMs,
        combatOverlapMs: Math.max(0, Math.min(bandEnd, fightEnd) - Math.max(bandStart, fightStart)),
        amount: 0,
        source: "buff-band",
      });
    }
  }

  return rows;
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

function buildDebuffSliceEntries(fights, importPayload = null) {
  const visibleFightIds = new Set((fights || []).map(fight => String(fight?.id || "")).filter(Boolean));
  const grouped = new Map(
    TRACKED_DEBUFF_ROWS.map(entry => [entry.key, {
      key: entry.key,
      label: entry.label,
      preferredClass: entry.className,
      order: entry.order,
      estimated: Boolean(entry.estimated),
      totalUptime: 0,
      totalPossibleUptime: 0,
      casts: 0,
      maxStacks: 0,
      timelineBands: [],
      sources: new Map(),
      estimatedDamage: 0,
      estimatedDps: 0,
      qualifyingPhysicalDamage: 0,
    }])
  );
  let totalEncounterDurationMs = 0;

  function mergeTimelineBands(bands = []) {
    const normalized = (bands || [])
      .map(band => ({
        startMs: Number(band?.startMs || 0),
        endMs: Number(band?.endMs || 0),
      }))
      .filter(band => band.endMs > band.startMs)
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    const merged = [];
    for (const band of normalized) {
      const previous = merged[merged.length - 1];
      if (!previous || band.startMs > previous.endMs) {
        merged.push({ ...band });
        continue;
      }

      previous.endMs = Math.max(previous.endMs, band.endMs);
    }

    return merged;
  }

  for (const snapshot of importPayload?.debuffsByFight?.snapshots || []) {
    if (!visibleFightIds.has(String(snapshot?.fightId || ""))) continue;

    const fightDurationMs = Number(snapshot?.durationMs || 0);
    const fightOffsetMs = totalEncounterDurationMs;
    totalEncounterDurationMs += fightDurationMs;
    for (const entry of grouped.values()) {
      entry.totalPossibleUptime += fightDurationMs;
    }

    for (const debuff of snapshot?.debuffs || []) {
      const key = String(debuff?.key || debuff?.label || "unknown-debuff");
      const existing = grouped.get(key) || {
        key,
        label: debuff?.label || "Unknown Debuff",
        preferredClass: debuff?.preferredClass || "",
        order: Number(debuff?.order ?? 99),
        estimated: Boolean(debuff?.estimated),
        totalUptime: 0,
        totalPossibleUptime: 0,
        casts: 0,
        maxStacks: 0,
        timelineBands: [],
        sources: new Map(),
        estimatedDamage: 0,
        estimatedDps: 0,
        qualifyingPhysicalDamage: 0,
      };

      existing.label = debuff?.label || existing.label;
      existing.preferredClass = debuff?.preferredClass || existing.preferredClass;
      if (!grouped.has(key) && Number.isFinite(Number(debuff?.order))) {
        existing.order = Number(debuff.order);
      }
      existing.estimated = Boolean(debuff?.estimated || existing.estimated);
      existing.totalUptime += Number(debuff?.totalUptime || 0);
      existing.casts += Number(debuff?.totalUses || 0);
      existing.maxStacks = Math.max(Number(existing.maxStacks || 0), Number(debuff?.maxStacks || 0));
      existing.estimatedDamage += Number(debuff?.estimatedDamage || 0);
      existing.estimatedDps += Number(debuff?.estimatedDps || 0);
      existing.qualifyingPhysicalDamage += Number(debuff?.qualifyingPhysicalDamage || 0);
      existing.timelineBands.push(...(debuff?.bands || []).map(band => ({
        startMs: fightOffsetMs + Number(band?.startMs || 0),
        endMs: fightOffsetMs + Number(band?.endMs || 0),
      })));

      for (const source of debuff?.sources || []) {
        const sourceKey = String(source?.sourceId ?? source?.name ?? `source-${existing.sources.size + 1}`);
        const current = existing.sources.get(sourceKey) || {
          sourceId: source?.sourceId ?? null,
          name: source?.name || "Unknown",
          type: source?.type || "",
          casts: 0,
        };
        current.casts += Number(source?.casts || 0);
        existing.sources.set(sourceKey, current);
      }

      grouped.set(key, existing);
    }
  }

  return [...grouped.values()]
    .map(entry => ({
      key: entry.key,
      label: entry.label,
      preferredClass: entry.preferredClass,
      order: entry.order,
      estimated: Boolean(entry.estimated),
      totalUptime: entry.totalUptime,
      totalPossibleUptime: entry.totalPossibleUptime,
      uptimePercent: entry.totalPossibleUptime > 0 ? Math.min(100, (entry.totalUptime / entry.totalPossibleUptime) * 100) : 0,
      casts: entry.casts,
      maxStacks: Number(entry.maxStacks || 0),
      estimatedDamage: Number(entry.estimatedDamage || 0),
      estimatedDps: Number(entry.estimatedDps || 0),
      qualifyingPhysicalDamage: Number(entry.qualifyingPhysicalDamage || 0),
      timelineBands: mergeTimelineBands(entry.timelineBands),
      totalEncounterDurationMs,
      sources: [...entry.sources.values()].sort((a, b) => {
        if (b.casts !== a.casts) return b.casts - a.casts;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      }),
    }))
    .sort((a, b) => Number(a.order ?? 99) - Number(b.order ?? 99));
}

function buildPotionSliceEntries(players, analyticsByPlayerId, filterIds = null) {
  const rows = [];

  for (const player of players || []) {
    const analytics = analyticsByPlayerId.get(String(player.id));
    if (!analytics) continue;
    if (filterIds && !filterIds.has(String(player.id))) continue;

    const totalEvents = Number(analytics.potionEventCount || 0);
    const prepotCount = Number(analytics.prepotCount || 0);
    const combatCount = Number(analytics.combatPotionCount || 0);
    const recoveryCount = Number(analytics.recoveryConsumableCount || 0);
    const usedPotionCount = Number(analytics.usedPotionCount || 0);
    const hasPotionIssue = combatCount <= 0 && recoveryCount <= 0;
    const averagePrepullOverlapMs = Number(analytics.averagePrepullOverlapMs || 0);
    const averagePrepullDurationMs = Number(analytics.averagePrepullDurationMs || 0);
    const averagePrepullOverlapRatio = averagePrepullDurationMs > 0
      ? averagePrepullOverlapMs / averagePrepullDurationMs
      : 0;

    rows.push({
      id: String(player.id),
      name: player.name || "Unknown Player",
      type: player.type || "",
      total: totalEvents,
      prepotCount,
      combatCount,
      recoveryCount,
      usedPotionCount,
      hasPotionIssue,
      averagePrepullOverlapMs,
      averagePrepullDurationMs,
      averagePrepullOverlapRatio,
    });
  }

  return rows.sort((a, b) => {
    if (a.hasPotionIssue !== b.hasPotionIssue) return a.hasPotionIssue ? -1 : 1;
    if (b.prepotCount !== a.prepotCount) return b.prepotCount - a.prepotCount;
    if (b.total !== a.total) return b.total - a.total;
    if (b.averagePrepullOverlapRatio !== a.averagePrepullOverlapRatio) {
      return b.averagePrepullOverlapRatio - a.averagePrepullOverlapRatio;
    }
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

function getPotionSectionLabel(section) {
  switch (section) {
    case "prepull":
      return "Prepull";
    case "combat":
      return "In Combat";
    case "recovery":
      return "Emergency / Recovery";
    default:
      return "Consumables";
  }
}

function getPotionEventDisplayLabel(event) {
  const base = event?.label || "Unknown Consumable";
  if (String(event?.spellId || "") === "28499") {
    return "Mana Potion";
  }
  if (String(event?.spellId || "") === "27869") {
    return "Dark Rune";
  }
  if (String(event?.spellId || "") === "16666") {
    return "Demonic Rune";
  }
  switch (event?.category) {
    case "nightmare_seed":
      return "Nightmare Seed";
    case "dark_rune":
      return base.includes("Rune") ? base : "Dark Rune";
    default:
      return base;
  }
}

function getPotionAmountColor(event, text) {
  if (event?.eventKind === "instant_resource" && Number(event?.amount || 0) > 0) {
    return "#8fc7ff";
  }
  if (Number(event?.amount || 0) > 0) {
    return "#d7ffdf";
  }
  return text.secondary;
}

function formatPotionDurationValue(ms) {
  const seconds = Math.max(0, Number(ms || 0)) / 1000;
  return `${seconds.toFixed(1)}s`;
}

function formatPotionRelativeTime(ms) {
  const value = Number(ms || 0);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const totalSeconds = absolute / 1000;

  if (totalSeconds < 60) {
    return `${sign}${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - (minutes * 60);
  return `${sign}${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function getPotionOverlapRatio(event) {
  const total = Number(event?.totalDurationMs || 0);
  if (!(total > 0)) return 0;
  return Number(event?.combatOverlapMs || 0) / total;
}

function getPotionBenefitLabel(event) {
  const total = Number(event?.totalDurationMs || 0);
  if (total > 0) {
    return `${formatPotionDurationValue(event?.combatOverlapMs || 0)} / ${formatPotionDurationValue(total)}`;
  }
  if (Number(event?.amount || 0) > 0) {
    return "One-time effect";
  }
  return "";
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
  const potionAuraEvents = ((importPayload?.buffsByFight?.snapshots || []))
    .filter(snapshot => visibleFightIds.has(String(snapshot?.fightId || "")))
    .flatMap(snapshot => buildPotionAuraEvents(snapshot, playerId, playerName));
  const potionEventRows = ((importPayload?.potionsByFight?.snapshots || []))
    .filter(snapshot => visibleFightIds.has(String(snapshot?.fightId || "")))
    .flatMap(snapshot => getPotionFightEvents(snapshot, playerId, playerName));
  const potionAuraKeys = new Set(
    potionAuraEvents.map(event => `${event.fightId}:${String(event.label || "").trim().toLowerCase()}:${event.category}`)
  );
  const potionEvents = [...potionAuraEvents, ...potionEventRows.filter(event => {
    const category = String(event?.category || "");
    if (!(category === "potion" || category === "nightmare_seed" || category === "mana_potion")) {
      return true;
    }
    const dedupeKey = `${event.fightId}:${String(event.label || "").trim().toLowerCase()}:${category}`;
    return !potionAuraKeys.has(dedupeKey);
  })]
    .sort((a, b) => {
      const sectionDelta = (POTION_SECTION_ORDER[a.section] ?? 99) - (POTION_SECTION_ORDER[b.section] ?? 99);
      if (sectionDelta !== 0) return sectionDelta;
      if (a.fightName !== b.fightName) {
        return a.fightName.localeCompare(b.fightName, "en", { sensitivity: "base" });
      }
      return Number(a.timestamp || 0) - Number(b.timestamp || 0);
    });
  const drumsCastCount = drumsCoverage.reduce((sum, row) => sum + Number(row.casts || 0), 0);
  const drumsAffectedCount = drumsCoverage.reduce((sum, row) => sum + Number(row.affectedTargets || 0), 0);
  const drumsAverageAffected = drumsCastCount > 0 ? drumsAffectedCount / drumsCastCount : 0;
  const prepotEvents = potionEvents.filter(event => event.section === "prepull");
  const combatPotionEvents = potionEvents.filter(event =>
    event.section === "combat" && (event.category === "potion" || event.category === "nightmare_seed")
  );
  const recoveryConsumableEvents = potionEvents.filter(event => event.section === "recovery");
  const usedPotionCount = prepotEvents.length > 0 || combatPotionEvents.length > 0 ? 1 : 0;
  const potionEventPotionCount = potionEvents.filter(event =>
    event.category === "potion"
    || event.category === "nightmare_seed"
    || event.category === "mana_potion"
    || event.category === "healing_potion"
  ).length;
  const potionUseCount = potionEventPotionCount > 0
    ? potionEventPotionCount
    : countMatchingCasts(fullCastsEntry, { nameTokens: POTION_NAME_TOKENS });
  const healthstoneEventCount = potionEvents.filter(event => event.category === "healthstone").length;
  const prepullOverlapTotalMs = prepotEvents.reduce((sum, event) => sum + Number(event.combatOverlapMs || 0), 0);
  const prepullDurationTotalMs = prepotEvents.reduce((sum, event) => sum + Number(event.totalDurationMs || 0), 0);
  const averagePrepullOverlapMs = prepotEvents.length > 0 ? prepullOverlapTotalMs / prepotEvents.length : 0;
  const averagePrepullDurationMs = prepotEvents.length > 0 ? prepullDurationTotalMs / prepotEvents.length : 0;

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
    potionEvents,
    potionEventCount: potionEvents.length,
    prepotCount: prepotEvents.length,
    combatPotionCount: combatPotionEvents.length,
    recoveryConsumableCount: recoveryConsumableEvents.length,
    usedPotionCount,
    averagePrepullOverlapMs,
    averagePrepullDurationMs,
    hearthstoneCount: Math.max(hearthstoneCount, healthstoneEventCount),
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

function normalizeFetchedAbilityBreakdown(entries = []) {
  return (entries || [])
    .map(entry => ({
      key: String(entry?.guid ?? entry?.name ?? "unknown"),
      guid: entry?.guid ?? null,
      icon: entry?.icon || entry?.iconName || entry?.iconname || "",
      name: entry?.name || "Unknown Ability",
      total: Number(entry?.total || 0),
      activeTime: Number(entry?.activeTime || 0),
      hits:
        Number(entry?.hits ?? entry?.totalHits ?? entry?.hitCount ?? entry?.landedHits ?? entry?.count ?? 0)
        + Number(entry?.tickCount ?? 0)
        + Number(entry?.missCount ?? 0),
      casts: Number(entry?.casts ?? entry?.totalUses ?? entry?.uses ?? entry?.useCount ?? entry?.executeCount ?? 0),
      crits:
        Number(entry?.crits ?? entry?.criticalHits ?? entry?.critCount ?? entry?.critHits ?? entry?.critHitCount ?? 0)
        + Number(entry?.critTickCount ?? 0),
      overheal: Number(entry?.overheal || 0),
      absorbed: Number(entry?.absorbed || 0),
    }))
    .sort((a, b) => b.total - a.total);
}

function mergeLiveBreakdownWithImportedStats(liveEntries = [], importedEntries = [], { includeImportedPets = false } = {}) {
  if (!Array.isArray(liveEntries) || liveEntries.length === 0) return importedEntries || [];
  if (!Array.isArray(importedEntries) || importedEntries.length === 0) return liveEntries || [];

  const importedByKey = new Map(
    importedEntries.map(entry => [String(entry?.key ?? entry?.guid ?? entry?.name ?? ""), entry])
  );

  const merged = liveEntries.map(entry => {
    const key = String(entry?.key ?? entry?.guid ?? entry?.name ?? "");
    const imported = importedByKey.get(key);
    if (!imported) return entry;

    return {
      ...entry,
      casts: Number(entry?.casts || 0) > 0 ? entry.casts : imported.casts,
      hits: Number(entry?.hits || 0) > 0 ? entry.hits : imported.hits,
      crits: Number(entry?.crits || 0) > 0 ? entry.crits : imported.crits,
      overheal: Number(entry?.overheal || 0) > 0 ? entry.overheal : imported.overheal,
      absorbed: Number(entry?.absorbed || 0) > 0 ? entry.absorbed : imported.absorbed,
    };
  });

  const existingKeys = new Set(merged.map(entry => String(entry?.key ?? entry?.guid ?? entry?.name ?? "")));

  for (const entry of importedEntries) {
    const key = String(entry?.key ?? entry?.guid ?? entry?.name ?? "");
    if (!includeImportedPets || !key.startsWith("pet:")) continue;
    if (existingKeys.has(key)) continue;
    merged.push(entry);
    existingKeys.add(key);
  }

  return merged.sort((a, b) => Number(b?.total || 0) - Number(a?.total || 0));
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

function isAbsorbLikeEvent(event) {
  const type = getEventTypeToken(event);
  return type.includes("absorb") || Number(event?.absorbed || 0) > 0;
}

function getEventAmount(event, kind = "damage") {
  if (kind === "healing") {
    return Number(event?.amount ?? event?.healing ?? 0) || 0;
  }
  return Number(event?.amount ?? event?.damage ?? 0) || 0;
}

function getAbilityName(value, fallback = "Unknown Ability") {
  const directAbilityName = value?.abilityName;
  if (typeof directAbilityName === "string" && directAbilityName.trim()) return directAbilityName;

  const directName = value?.name;
  if (typeof directName === "string" && directName.trim()) return directName;

  if (directAbilityName && typeof directAbilityName === "object") {
    if (typeof directAbilityName.name === "string" && directAbilityName.name.trim()) return directAbilityName.name;
    if (typeof directAbilityName.type === "string" && directAbilityName.type.trim()) return directAbilityName.type;
  }

  if (directName && typeof directName === "object") {
    if (typeof directName.name === "string" && directName.name.trim()) return directName.name;
    if (typeof directName.type === "string" && directName.type.trim()) return directName.type;
  }

  return value?.abilityGuid != null ? `Spell ${value.abilityGuid}` : fallback;
}

function getSourceName(value) {
  const source = value?.sourceName;
  if (typeof source === "string" && source.trim()) return source;
  if (source && typeof source === "object") {
    if (typeof source.name === "string" && source.name.trim()) return source.name;
    if (typeof source.type === "string" && source.type.trim()) return source.type;
  }
  return "Unknown Source";
}

function getDeathEventSourceColor(event) {
  if (event?.sourceIsEnemy) return "#ff8d8d";
  if (event?.sourceType) return getClassColor(event.sourceType);
  return text.secondary;
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
  if (isAbsorbLikeEvent(event) && !isHealingLikeEvent(event) && !isDamageLikeEvent(event)) return "Absorb";
  if (isHealingLikeEvent(event)) return "Healing";
  return "Damage";
}

function getDeathSequenceEntries(entry) {
  if (!entry) return [];
  const nestedGroups = (entry.events || []).filter(event => Array.isArray(event?.events) && event.events.length > 0);
  return nestedGroups.length > 0 ? nestedGroups : [entry];
}

function formatDeathRelativeTime(timestampMs, deathTimestampMs) {
  if (!Number.isFinite(Number(timestampMs)) || !Number.isFinite(Number(deathTimestampMs))) return "";
  const deltaSeconds = (Number(timestampMs) - Number(deathTimestampMs)) / 1000;
  if (Math.abs(deltaSeconds) < 0.005) return "0.00s";
  return `${Math.abs(deltaSeconds).toFixed(2)}s`;
}

function getDeathEventAmountLabel(event) {
  if (getEventTypeToken(event) === "death") return "";
  if (isAbsorbLikeEvent(event) && !isHealingLikeEvent(event) && !isDamageLikeEvent(event)) {
    const absorbed = Number(event?.absorbed || event?.amount || 0);
    return absorbed > 0 ? formatMetricValue(absorbed) : "";
  }
  if (isHealingLikeEvent(event)) {
    const healing = Number(event?.healing || event?.amount || 0);
    return healing > 0 ? formatMetricValue(healing) : "";
  }
  const damage = Number(event?.damage || event?.amount || 0);
  if (!(damage > 0)) return "";
  const overkill = Number(event?.overkill || 0);
  return overkill > 0 ? `${formatMetricValue(damage)} (O: ${formatMetricValue(overkill)})` : formatMetricValue(damage);
}

function getDeathEventHpPercent(event) {
  const rawHp = event?.hitPoints;
  if (rawHp == null || rawHp === "") return null;

  const hp = Number(rawHp);
  if (!Number.isFinite(hp)) return null;

  const maxHp = Number(event?.maxHitPoints);
  if (Number.isFinite(maxHp) && maxHp > 0 && maxHp !== 100) {
    return Math.max(0, Math.min(100, (hp / maxHp) * 100));
  }

  return Math.max(0, Math.min(100, hp));
}

function getDeathEventHpLabel(event) {
  const hpPercent = getDeathEventHpPercent(event);
  return hpPercent == null ? "" : `${formatMetricValue(hpPercent)}%`;
}

function getDeathEventHpFillColor(hpPercent) {
  if (!(hpPercent > 0)) return "#0a0a0d";
  if (hpPercent >= 100) return "#8a8f98";

  const clamped = Math.max(0, Math.min(100, hpPercent));
  const hue = Math.max(0, Math.min(120, clamped * 1.2));
  const saturation = 52;
  const lightness = 48;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function DeathEventHpBar({ event, compact = false }) {
  const hpPercent = getDeathEventHpPercent(event) ?? 0;
  const label = `${formatMetricValue(hpPercent)}%`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minWidth: compact ? 120 : 0,
        height: compact ? 20 : 24,
        borderRadius: 999,
        overflow: "hidden",
        background: "#0a0a0d",
        border: `1px solid ${border.subtle}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${hpPercent}%`,
          minWidth: hpPercent > 0 ? 2 : 0,
          background: getDeathEventHpFillColor(hpPercent),
          transition: "width 160ms ease-out",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? fontSize.xs : fontSize.sm,
          fontWeight: fontWeight.semibold,
          color: "#ffffff",
          letterSpacing: "0.02em",
          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function mergeDeathTimelineEvents(recapEvents = [], healingWindowEvents = [], deathWindowEvents = []) {
  const seen = new Set();
  const merged = [];

  for (const event of [...(recapEvents || []), ...(healingWindowEvents || []), ...(deathWindowEvents || [])]) {
    const key = [
      Number(event?.timestamp || 0),
      String(event?.type || ""),
      String(event?.abilityGuid || ""),
      String(event?.sourceId || ""),
      String(event?.targetId || ""),
      Number(event?.amount ?? event?.damage ?? event?.healing ?? 0),
      Number(event?.overkill || 0),
      Number(event?.overheal || 0),
      Number(event?.absorbed || 0),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }

  return merged;
}

function fillDeathTimelineHpValues(events = []) {
  const normalizedEvents = (events || []).map(event => ({ ...event }));
  let lastKnownHp = null;
  let lastKnownMaxHp = null;

  for (const event of normalizedEvents) {
    const hpPercent = getDeathEventHpPercent(event);
    if (hpPercent != null) {
      lastKnownHp = event?.hitPoints ?? null;
      lastKnownMaxHp = event?.maxHitPoints ?? null;
      continue;
    }

    if (lastKnownHp != null) {
      event.hitPoints = lastKnownHp;
      if (lastKnownMaxHp != null) {
        event.maxHitPoints = lastKnownMaxHp;
      }
    }
  }

  let nextKnownHp = null;
  let nextKnownMaxHp = null;
  for (let index = normalizedEvents.length - 1; index >= 0; index -= 1) {
    const event = normalizedEvents[index];
    const hpPercent = getDeathEventHpPercent(event);
    if (hpPercent != null) {
      nextKnownHp = event?.hitPoints ?? null;
      nextKnownMaxHp = event?.maxHitPoints ?? null;
      continue;
    }

    if (nextKnownHp != null) {
      event.hitPoints = nextKnownHp;
      if (nextKnownMaxHp != null) {
        event.maxHitPoints = nextKnownMaxHp;
      }
    }
  }

  return normalizedEvents;
}

function buildDeathDetailRows(fights, playerId) {
  if (!playerId) return [];

  const rows = [];

  for (const fight of fights || []) {
    const entries = (fight.deathEntries || []).filter(candidate => String(candidate?.id) === String(playerId));
    if (!entries.length) continue;

    for (const entry of entries) {
      for (const deathEntry of getDeathSequenceEntries(entry)) {
        const deathTimestampMs = normalizeEncounterEventTimestamp(deathEntry?.timestamp ?? entry?.timestamp, fight);
        const recapEvents = deathEntry === entry ? (entry?.events || []) : (deathEntry?.events || []);
        const healingWindowEvents = deathEntry === entry
          ? (entry?.healingWindowEvents || [])
          : (deathEntry?.healingWindowEvents || []);
        const deathWindowEvents = deathEntry === entry
          ? (entry?.deathWindowEvents || [])
          : (deathEntry?.deathWindowEvents || []);
        const timelineEvents = fillDeathTimelineHpValues(mergeDeathTimelineEvents(recapEvents, healingWindowEvents, deathWindowEvents))
          .map(event => ({
            ...event,
            timestampMs: normalizeEncounterEventTimestamp(event.timestamp, fight),
          }))
          .sort((left, right) => Number(left.timestampMs || 0) - Number(right.timestampMs || 0));
        const finalEvent = timelineEvents[timelineEvents.length - 1] || deathEntry || entry;
        const deathTimelineEvent = {
          type: "death",
          timestamp: deathEntry?.timestamp ?? entry?.timestamp ?? finalEvent?.timestamp ?? 0,
          timestampMs: deathTimestampMs,
          abilityGuid: deathEntry?.killingBlow?.abilityGuid ?? entry?.killingBlow?.abilityGuid ?? finalEvent?.abilityGuid ?? null,
          abilityName: deathEntry?.killingBlow?.abilityName ?? entry?.killingBlow?.abilityName ?? finalEvent?.abilityName ?? "Death",
          sourceName: deathEntry?.killingBlow?.sourceName ?? entry?.killingBlow?.sourceName ?? finalEvent?.sourceName ?? "",
          overkill: Number(deathEntry?.overkill ?? entry?.overkill ?? finalEvent?.overkill ?? 0),
          hitPoints: 0,
          maxHitPoints: 100,
        };

        rows.push({
          key: `${fight.id}-${deathTimelineEvent.timestamp}-${rows.length}`,
          fightId: String(fight.id),
          fightName: fight.name || "Unknown Fight",
          timestampMs: deathTimestampMs,
          timestampLabel: formatDuration(deathTimestampMs),
          events: [deathTimelineEvent, ...timelineEvents.sort((left, right) => Number(right.timestampMs || 0) - Number(left.timestampMs || 0))],
        });
      }
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

function buildTimelineTickMarks(totalDurationMs) {
  const durationMs = Math.max(0, Number(totalDurationMs || 0));
  const ratios = [0, 0.25, 0.5, 0.75, 1];
  const marks = [];
  const seen = new Set();

  for (const ratio of ratios) {
    const timestampMs = Math.round(durationMs * ratio);
    const label = formatDuration(timestampMs);
    const key = `${timestampMs}-${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push({
      ratio,
      label,
      timestampMs,
    });
  }

  return marks;
}

function getArmorReachedStackCount(maxStacks, sources = []) {
  const explicitStacks = Math.max(0, Math.min(ARMOR_STACK_MARKER_COUNT, Math.floor(Number(maxStacks || 0))));
  if (explicitStacks > 0) return explicitStacks;

  const warriorSunderCasts = (sources || []).reduce((sum, source) => {
    if (String(source?.type || "").toLowerCase() !== "warrior") return sum;
    return sum + Number(source?.casts || 0);
  }, 0);

  return Math.max(0, Math.min(ARMOR_STACK_MARKER_COUNT, Math.floor(warriorSunderCasts)));
}

function buildArmorStackMarkers(maxStacks, sources = []) {
  const reachedStacks = getArmorReachedStackCount(maxStacks, sources);
  return Array.from({ length: ARMOR_STACK_MARKER_COUNT }, (_, index) => ({
    stack: index + 1,
    active: index < reachedStacks,
  }));
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

function ImportProgressModal({ open, progress, onClose }) {
  const [displayPercent, setDisplayPercent] = useState(0);
  const [displayEtaMs, setDisplayEtaMs] = useState(null);

  useEffect(() => {
    if (!open) {
      setDisplayPercent(0);
      setDisplayEtaMs(null);
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

  useEffect(() => {
    if (!open) {
      setDisplayEtaMs(null);
      return undefined;
    }

    const startedAtMs = Number(progress?.startedAtMs || 0);
    const estimatedRemainingMs = Number(progress?.estimatedRemainingMs);
    const etaUpdatedAtMs = Number(progress?.etaUpdatedAtMs || 0);

    if (!(startedAtMs > 0) || !Number.isFinite(estimatedRemainingMs)) {
      setDisplayEtaMs(Number(progress?.percent || 0) >= 100 ? 0 : null);
      return undefined;
    }

    const tick = () => {
      const referenceMs = etaUpdatedAtMs > 0 ? etaUpdatedAtMs : Date.now();
      const elapsedSinceEstimateMs = Math.max(0, Date.now() - referenceMs);
      setDisplayEtaMs(Math.max(0, Math.round(estimatedRemainingMs - elapsedSinceEstimateMs)));
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [open, progress?.estimatedRemainingMs, progress?.etaUpdatedAtMs, progress?.percent, progress?.startedAtMs]);

  if (!open) return null;
  const canClose = typeof onClose === "function";

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
          <div>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>Importing Raid</div>
            <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4 }}>
              {progress.message}
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close import progress"
              style={{
                ...btnStyle("default", false),
                minWidth: 32,
                width: 32,
                height: 32,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: fontSize.base,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
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

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space[3],
          fontSize: fontSize.sm,
          color: text.muted,
        }}>
          <span>{displayEtaMs != null ? formatEstimatedTimeRemaining(displayEtaMs) : ""}</span>
          <span>{Math.round(displayPercent)}%</span>
        </div>
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

function formatEstimatedTimeRemaining(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (totalSeconds <= 0) return "Less than 1s remaining";
  if (totalSeconds < 60) return `${totalSeconds}s remaining`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m remaining`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s remaining` : `${minutes}m remaining`;
}

function ImportWebhookModal({ open, raidTitle, onYes, onNo }) {
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
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: text.primary }}>Post Import to Discord?</div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4, lineHeight: 1.5 }}>
            {`"${raidTitle || "Imported Report"}" is ready to save. Do you want to post the new-raid webhook to Discord?`}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: space[2], flexWrap: "wrap" }}>
          <button onClick={onNo} style={btnStyle("default")}>No</button>
          <button onClick={onYes} style={btnStyle("primary")}>Yes</button>
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

function RaidActionsMenu({
  raid,
  isAdmin = false,
  anchor = null,
  compactLabels = false,
  onOpenWcl,
  onCopyReportUrl,
  onRename,
  onTag,
  onDeleteTag,
  onReimport,
  onDelete,
}) {
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

  const top = Math.max(8, Math.round(Number(anchor?.bottom || 0) + 6));
  const left = Math.max(8, Math.round(Number(anchor?.right || 0) - 180));

  return (
    <div
      style={{
        position: "fixed",
        top,
        left,
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
        zIndex: 10050,
      }}
      onClick={event => event.stopPropagation()}
    >
      <button onClick={onOpenWcl} style={itemStyle}>
        <span aria-hidden="true">🔗</span>
        <span>{compactLabels ? "Open WCL" : `WCL: ${raid?.reportId || "Report"}`}</span>
      </button>
      <button onClick={onCopyReportUrl} style={itemStyle}>
        <span aria-hidden="true">⧉</span>
        <span>Copy Report URL</span>
      </button>
      {isAdmin && (
        <>
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
        </>
      )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const fightParam = searchParams.get("fight") || "";
  const tabParam = normalizeRpbTab(searchParams.get("tab"));

  const [reportUrl, setReportUrl] = useState("");
  const [profileApiKey, setProfileApiKey] = useState("");
  const [profileV2ClientId, setProfileV2ClientId] = useState("");
  const [profileV2ClientSecret, setProfileV2ClientSecret] = useState("");
  const [raids, setRaids] = useState([]);
  const [selectedRaid, setSelectedRaid] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [expandedDebuffKeys, setExpandedDebuffKeys] = useState(() => new Set());
  const suppressAutoSelectPlayerRef = useRef(false);
  const [itemMetaById, setItemMetaById] = useState({});
  const [fightGearLoaded, setFightGearLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRaid, setLoadingRaid] = useState(false);
  const [importing, setImporting] = useState(false);
  const [teamFilter, setTeamFilter] = useState("");
  const [openRaidMenuId, setOpenRaidMenuId] = useState("");
  const [openRaidMenuAnchor, setOpenRaidMenuAnchor] = useState(null);
  const [tagModalState, setTagModalState] = useState({ open: false, raid: null, value: "" });
  const [importTagPrompt, setImportTagPrompt] = useState({ open: false, raid: null, value: "", resolve: null });
  const [importWebhookPrompt, setImportWebhookPrompt] = useState({ open: false, raidTitle: "", resolve: null });
  const [renameModalState, setRenameModalState] = useState({ open: false, raid: null, value: "" });
  const [deleteConfirmRaid, setDeleteConfirmRaid] = useState(null);
  const [raidAnalyticsFilter, setRaidAnalyticsFilter] = useState("");
  const [filterMode, setFilterMode] = useState("encounters-and-trash");
  const [fightOutcomeFilter, setFightOutcomeFilter] = useState("");
  const [selectedFightId, setSelectedFightId] = useState(() => fightParam);
  const [sliceType, setSliceType] = useState(() => tabParam);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false
  ));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDetailClosing, setMobileDetailClosing] = useState(false);
  const [mobileDetailCloseDirection, setMobileDetailCloseDirection] = useState("");
  const [liveAbilityBreakdowns, setLiveAbilityBreakdowns] = useState({});
  const abilityBreakdownRef = useRef(null);
  const mobileDetailCloseTimerRef = useRef(null);
  const mobileDetailOverlayRef = useRef(null);
  const [importProgress, setImportProgress] = useState({
    open: false,
    completed: 0,
    total: 17,
    percent: 0,
    message: "",
    startedAtMs: 0,
    estimatedRemainingMs: null,
    etaUpdatedAtMs: 0,
    detail: "",
    subdetail: "",
    activeStepKey: "",
    steps: [],
  });
  const pendingRaidSummary = useMemo(() => (
    raids.find(raid => raid.id === raidId || raid.reportId === raidId) || null
  ), [raids, raidId]);
  const pendingRaidLoadingEmoji = pendingRaidSummary?.teamTag === "Team Dick"
    ? "🍆"
    : (pendingRaidSummary?.teamTag === "Team Balls" ? "🍒" : "⏳");

  useEffect(() => {
    if (fightParam === selectedFightId && tabParam === sliceType) return;

    const nextParams = new URLSearchParams();
    if (selectedFightId) {
      nextParams.set("fight", String(selectedFightId));
    }

    if (sliceType && sliceType !== "damage") {
      nextParams.set("tab", sliceType);
    }

    setSearchParams(nextParams, { replace: true });
  }, [fightParam, selectedFightId, setSearchParams, sliceType, tabParam]);

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
    if (typeof window === "undefined") return undefined;

    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!openRaidMenuId) return undefined;

    function handleWindowClick() {
      setOpenRaidMenuId("");
      setOpenRaidMenuAnchor(null);
    }

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [openRaidMenuId]);

  const openRaidMenuRaid = useMemo(() => {
    if (!openRaidMenuId) return null;
    return raids.find(raid => raid.id === openRaidMenuId) || null;
  }, [openRaidMenuId, raids]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaids() {
      setLoadingList(true);
      try {
        const nextRaids = await fetchRpbRaidList();
        if (!cancelled) {
          setRaids(nextRaids);
          if (!raidId && nextRaids[0]?.id) {
            navigate(`/rpb/${nextRaids[0].reportId || nextRaids[0].id}`, { replace: true });
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
      const raidVisibleForFilter = !raidId || !normalizedTeamFilter || visibleRaids.some(raid => raid.id === raidId || raid.reportId === raidId);

      if (!raidId || noReportsForFilter || !raidVisibleForFilter) {
        setSelectedRaid(null);
        setSelectedPlayerId("");
        setOpenRaidMenuId("");
        setOpenRaidMenuAnchor(null);
        setLoadingRaid(false);
        return;
      }

      setLoadingRaid(true);
      setSelectedRaid(null);
      setSelectedPlayerId("");
      setOpenRaidMenuId("");
      setOpenRaidMenuAnchor(null);
      try {
        const raid = await fetchRpbRaidBundle(raidId);
        if (!cancelled) {
          setSelectedRaid(raid);
          setSelectedFightId(fightParam || "");
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

  function handlePlayerSelection(playerId) {
    if (isMobileViewport) {
      suppressAutoSelectPlayerRef.current = false;
      setSelectedPlayerId(String(playerId));
      return;
    }
    toggleSelectedPlayer(playerId);
  }

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

  function requestMobileDetailClose(direction = "right") {
    if (mobileDetailClosing) return;
    setMobileDetailCloseDirection(direction);
    setMobileDetailClosing(true);
    if (mobileDetailCloseTimerRef.current) {
      window.clearTimeout(mobileDetailCloseTimerRef.current);
    }
    mobileDetailCloseTimerRef.current = window.setTimeout(() => {
      closeSelectedPlayer();
      setMobileDetailClosing(false);
      setMobileDetailCloseDirection("");
      mobileDetailCloseTimerRef.current = null;
    }, 220);
  }

  function toggleDebuffExpansion(debuffKey) {
    setExpandedDebuffKeys(current => {
      const next = new Set(current);
      if (next.has(debuffKey)) {
        next.delete(debuffKey);
      } else {
        next.add(debuffKey);
      }
      return next;
    });
  }

  function handleRaidSelection(targetRaidId) {
    setMobileMenuOpen(false);
    setOpenRaidMenuId("");
    setOpenRaidMenuAnchor(null);
    setSelectedFightId("");
    const targetRaid = raids.find(raid => String(raid.id) === String(targetRaidId) || String(raid.reportId) === String(targetRaidId)) || null;
    const nextParams = new URLSearchParams();
    if (sliceType && sliceType !== "damage") {
      nextParams.set("tab", sliceType);
    }
    navigate(`/rpb/${targetRaid?.reportId || targetRaidId}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
  }

  function openRaidActionsMenu(event, targetRaidId) {
    event.stopPropagation();
    const nextId = String(targetRaidId || "");
    const buttonRect = event.currentTarget?.getBoundingClientRect?.() || null;
    setOpenRaidMenuId(current => {
      if (current === nextId) {
        setOpenRaidMenuAnchor(null);
        return "";
      }
      setOpenRaidMenuAnchor(buttonRect ? {
        top: buttonRect.top,
        right: buttonRect.right,
        bottom: buttonRect.bottom,
        left: buttonRect.left,
      } : null);
      return nextId;
    });
  }

  function buildWclReportUrl(raid) {
    return raid?.reportId ? `https://classic.warcraftlogs.com/reports/${raid.reportId}` : "";
  }

  function buildRaidPublicUrl(raid) {
    const baseUrl = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://nexttopicmoveon.com";
    if (!raid?.id) return "";

    const nextParams = new URLSearchParams();
    if (selectedFightId) {
      nextParams.set("fight", String(selectedFightId));
    }
    if (sliceType && sliceType !== "damage") {
      nextParams.set("tab", sliceType);
    }

    return `${baseUrl.replace(/\/$/, "")}/rpb/${encodeURIComponent(String(raid.reportId || raid.id))}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
  }

  function openWclReport(raid) {
    const url = buildWclReportUrl(raid);
    if (!url) return;
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function copyRaidPublicUrl(raid) {
    const url = buildRaidPublicUrl(raid);
    if (!url) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard unavailable");
      }
      toast({ message: "Copied report URL.", type: "success" });
    } catch (error) {
      toast({ message: `Copy failed: ${error.message || "Clipboard unavailable"}`, type: "danger" });
    }
  }

  function renderTabScopedRaidAnalyticsControls() {
    if (sliceType === "damage") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setRaidAnalyticsFilter("")}
            disabled={!hasTabScopedAnalyticsFilter}
            style={{
              ...btnStyle(hasTabScopedAnalyticsFilter ? "danger" : "default", false),
              height: 32,
              opacity: hasTabScopedAnalyticsFilter ? 1 : 0.65,
              background: hasTabScopedAnalyticsFilter ? "rgba(205, 78, 78, 0.24)" : "transparent",
              borderColor: hasTabScopedAnalyticsFilter ? "rgba(255, 134, 134, 0.98)" : border.subtle,
              color: hasTabScopedAnalyticsFilter ? "#ffdede" : text.secondary,
              boxShadow: hasTabScopedAnalyticsFilter ? "0 0 0 2px rgba(255, 134, 134, 0.22)" : "none",
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
            label="Engineering Damage"
            value={filteredRaidAnalytics.engineeringDamageTaken.length}
            tone="warning"
            active={raidAnalyticsFilter === "engineering"}
            onClick={() => setRaidAnalyticsFilter(current => current === "engineering" ? "" : "engineering")}
          />
        </div>
      );
    }

    if (sliceType === "consumables") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setRaidAnalyticsFilter("")}
            disabled={!hasTabScopedAnalyticsFilter}
            style={{
              ...btnStyle(hasTabScopedAnalyticsFilter ? "danger" : "default", false),
              height: 32,
              opacity: hasTabScopedAnalyticsFilter ? 1 : 0.65,
              background: hasTabScopedAnalyticsFilter ? "rgba(205, 78, 78, 0.24)" : "transparent",
              borderColor: hasTabScopedAnalyticsFilter ? "rgba(255, 134, 134, 0.98)" : border.subtle,
              color: hasTabScopedAnalyticsFilter ? "#ffdede" : text.secondary,
              boxShadow: hasTabScopedAnalyticsFilter ? "0 0 0 2px rgba(255, 134, 134, 0.22)" : "none",
            }}
          >
            Clear Filter
          </button>
          <MetricTag
            label="Consumable Issues"
            value={filteredRaidAnalytics.playersWithConsumableIssues.reduce((sum, entry) => sum + Number(entry.total || 0), 0)}
            tone="warning"
            active={raidAnalyticsFilter === "consumables"}
            onClick={() => setRaidAnalyticsFilter(current => current === "consumables" ? "" : "consumables")}
          />
        </div>
      );
    }

    if (sliceType === "potions") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setRaidAnalyticsFilter("")}
            disabled={!hasTabScopedAnalyticsFilter}
            style={{
              ...btnStyle(hasTabScopedAnalyticsFilter ? "danger" : "default", false),
              height: 32,
              opacity: hasTabScopedAnalyticsFilter ? 1 : 0.65,
              background: hasTabScopedAnalyticsFilter ? "rgba(205, 78, 78, 0.24)" : "transparent",
              borderColor: hasTabScopedAnalyticsFilter ? "rgba(255, 134, 134, 0.98)" : border.subtle,
              color: hasTabScopedAnalyticsFilter ? "#ffdede" : text.secondary,
              boxShadow: hasTabScopedAnalyticsFilter ? "0 0 0 2px rgba(255, 134, 134, 0.22)" : "none",
            }}
          >
            Clear Filter
          </button>
          <MetricTag
            label="Potion Issues"
            value={(filteredRaidAnalytics.playersWithPotionIssues || []).length}
            tone="warning"
            active={raidAnalyticsFilter === "potion-issues"}
            onClick={() => setRaidAnalyticsFilter(current => current === "potion-issues" ? "" : "potion-issues")}
          />
        </div>
      );
    }

    if (sliceType === "healing") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setRaidAnalyticsFilter("")}
            disabled={!hasTabScopedAnalyticsFilter}
            style={{
              ...btnStyle(hasTabScopedAnalyticsFilter ? "danger" : "default", false),
              height: 32,
              opacity: hasTabScopedAnalyticsFilter ? 1 : 0.65,
              background: hasTabScopedAnalyticsFilter ? "rgba(205, 78, 78, 0.24)" : "transparent",
              borderColor: hasTabScopedAnalyticsFilter ? "rgba(255, 134, 134, 0.98)" : border.subtle,
              color: hasTabScopedAnalyticsFilter ? "#ffdede" : text.secondary,
              boxShadow: hasTabScopedAnalyticsFilter ? "0 0 0 2px rgba(255, 134, 134, 0.22)" : "none",
            }}
          >
            Clear Filter
          </button>
          <MetricTag
            label="Healthstone Uses"
            value={filteredRaidAnalytics.playersUsingHearthstone.reduce((sum, entry) => sum + Number(entry.total || 0), 0)}
            tone="warning"
            active={raidAnalyticsFilter === "hearthstone"}
            onClick={() => setRaidAnalyticsFilter(current => current === "hearthstone" ? "" : "hearthstone")}
          />
        </div>
      );
    }

    return null;
  }

  function renderDesktopRaidCard(raid, options = {}) {
    const { layout = "large", index = 0 } = options;
    const active = raid.id === raidId || raid.reportId === raidId;
    const isLarge = layout === "large";
    const teamOption = getTeamOption(raid.teamTag);
    const teamScheduleLabel = getTeamScheduleLabel(raid.teamTag);
    const isNewestReport = index === 0;
    const reportSpeedPercent = getRaidReportSpeedPercent(raid);
    const topDps = getRaidAwardWinner(raid, "DPS", "damageParsePercent");
    const topHealer = getRaidAwardWinner(raid, "Healer", "healingParsePercent");

    return (
      <div
        key={raid.id}
        style={{
          position: "relative",
          minWidth: isLarge ? 220 : 160,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: isLarge ? 6 : 0,
        }}
      >
        <div style={{ position: "absolute", top: isLarge ? 8 : 6, right: isLarge ? 8 : 6, zIndex: 30 }} onClick={event => event.stopPropagation()}>
            <button
              onClick={event => openRaidActionsMenu(event, raid.id)}
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
          </div>

        <button
          onClick={() => handleRaidSelection(raid.id)}
          style={{
            ...btnStyle(active ? "primary" : "default", active),
            width: "100%",
            height: "100%",
            minHeight: isLarge ? 132 : 62,
            padding: space[3],
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: isLarge ? "flex-start" : "center",
            gap: isLarge ? 4 : 6,
            textAlign: "left",
            paddingRight: 42,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap", paddingRight: 18 }}>
            {isLarge && isNewestReport && (
              <span style={tagStyle("success")}>
                Newest Report
              </span>
            )}
            <span style={{ fontSize: isLarge ? fontSize.base : fontSize.sm, fontWeight: fontWeight.bold, textAlign: "left", lineHeight: 1.25 }}>
              {raid.title || raid.reportId}
            </span>
          </div>

          {isLarge ? (
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
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: space[2], flexWrap: "wrap" }}>
              <span style={tagStyle(teamOption.tone)}>
                {teamOption.shortLabel}
              </span>
              {reportSpeedPercent != null && (
                <span style={{ fontSize: fontSize.xs, color: getScoreColor(reportSpeedPercent) || (active ? "#f6f8ff" : text.muted), fontWeight: fontWeight.bold }}>
                  {Math.round(reportSpeedPercent)}
                </span>
              )}
            </div>
          )}
        </button>
      </div>
    );
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
  const filteredFightIds = useMemo(() => {
    return filteredFights.map(fight => String(fight.id)).filter(Boolean);
  }, [filteredFights]);
  const liveBreakdownCacheKey = useMemo(() => {
    if (!selectedRaid?.reportId || !selectedPlayerId || filteredFightIds.length === 0) return "";
    const revision = selectedRaid?.updatedAt || selectedRaid?.importedAt || "";
    return [selectedRaid.id || "", selectedRaid.reportId, revision, selectedPlayerId, filteredFightIds.join(",")].join("|");
  }, [filteredFightIds, selectedPlayerId, selectedRaid?.id, selectedRaid?.importedAt, selectedRaid?.reportId, selectedRaid?.updatedAt]);
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
    const playersWithPotionIssues = [];
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

      const combatPotionCount = Number(analytics.combatPotionCount || 0);
      const recoveryConsumableCount = Number(analytics.recoveryConsumableCount || 0);
      if (combatPotionCount <= 0 && recoveryConsumableCount <= 0) {
        playersWithPotionIssues.push({
          playerId: String(player.id),
          name: player.name,
          type: player.type,
          combatPotionCount,
          recoveryConsumableCount,
          total: 1,
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
      playersWithPotionIssues: playersWithPotionIssues.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      }),
      playersWithConsumableIssues: playersWithConsumableIssues.sort((a, b) => b.total - a.total),
      playersUsingHearthstone: playersUsingHearthstone.sort((a, b) => b.total - a.total),
    };
  }, [filteredEngineeringTotalsByPlayerId, filteredOilTotalsByPlayerId, filteredPlayerAnalyticsById, raidAnalytics, selectedRaid]);
  const activeSliceAnalyticsFilters = RAID_ANALYTICS_FILTERS_BY_SLICE[sliceType] || [];
  const hasTabScopedAnalyticsFilter = activeSliceAnalyticsFilters.includes(raidAnalyticsFilter);
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
      case "potion-issues":
        return new Set((filteredRaidAnalytics.playersWithPotionIssues || []).map(entry => String(entry.playerId)));
      case "hearthstone":
        return new Set((filteredRaidAnalytics.playersUsingHearthstone || raidAnalytics.playersUsingHearthstone || []).map(entry => String(entry.playerId)));
      default:
        return null;
    }
  }, [filteredRaidAnalytics, raidAnalytics, raidAnalyticsFilter]);
  useEffect(() => {
    if (!raidAnalyticsFilter) return;
    if (activeSliceAnalyticsFilters.includes(raidAnalyticsFilter)) return;
    setRaidAnalyticsFilter("");
  }, [activeSliceAnalyticsFilters, raidAnalyticsFilter]);
  const sortedRaids = useMemo(() => {
    return [...raids].sort((a, b) => new Date(b.start || b.importedAt || 0) - new Date(a.start || a.importedAt || 0));
  }, [raids]);
  const filteredRaids = useMemo(() => {
    const normalizedFilter = normalizeTeamTag(teamFilter);
    if (!normalizedFilter) return sortedRaids;
    return sortedRaids.filter(raid => normalizeTeamTag(raid.teamTag) === normalizedFilter);
  }, [sortedRaids, teamFilter]);
  const featuredRaids = useMemo(() => filteredRaids.slice(0, 2), [filteredRaids]);
  const compactRaidColumns = useMemo(() => {
    const columns = [];
    for (let index = 2; index < filteredRaids.length; index += 2) {
      columns.push(filteredRaids.slice(index, index + 2));
    }
    return columns;
  }, [filteredRaids]);
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
  const visiblePotionSliceEntries = useMemo(() => {
    return buildPotionSliceEntries(selectedRaid?.players || [], filteredPlayerAnalyticsById, raidAnalyticsFilterIds);
  }, [filteredPlayerAnalyticsById, raidAnalyticsFilterIds, selectedRaid]);
  const visibleDrumSliceEntries = useMemo(() => {
    return buildDrumSliceEntries(selectedRaid?.players || [], filteredPlayerAnalyticsById, raidAnalyticsFilterIds);
  }, [filteredPlayerAnalyticsById, raidAnalyticsFilterIds, selectedRaid]);
  const visibleDebuffSliceEntries = useMemo(() => {
    return buildDebuffSliceEntries(filteredFights, selectedRaid?.importPayload);
  }, [filteredFights, selectedRaid]);
  const hasSpecificEncounterSelection = useMemo(() => (
    Boolean(selectedFightId)
    && selectedFightId !== ALL_VISIBLE_ENCOUNTERS_ID
    && selectedFightId !== ALL_KILLS_ENCOUNTERS_ID
    && selectedFightId !== ALL_WIPES_ENCOUNTERS_ID
  ), [selectedFightId]);
  const selectedPlayerDamageBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "damageDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerHealingBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "healingDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerSummaryDamageBreakdown = useMemo(() => buildSummaryAbilityBreakdown(selectedPlayer?.summary, "damage"), [selectedPlayer?.summary]);
  const selectedPlayerSummaryHealingBreakdown = useMemo(() => buildSummaryAbilityBreakdown(selectedPlayer?.summary, "healing"), [selectedPlayer?.summary]);
  const liveDamageBreakdown = useMemo(() => {
    return normalizeFetchedAbilityBreakdown(liveAbilityBreakdowns[liveBreakdownCacheKey]?.damage?.entries || []);
  }, [liveAbilityBreakdowns, liveBreakdownCacheKey]);
  const liveHealingBreakdown = useMemo(() => {
    return normalizeFetchedAbilityBreakdown(liveAbilityBreakdowns[liveBreakdownCacheKey]?.healing?.entries || []);
  }, [liveAbilityBreakdowns, liveBreakdownCacheKey]);
  const visiblePlayerDamageBreakdown = hasVisibleBreakdownStats(liveDamageBreakdown)
    ? mergeLiveBreakdownWithImportedStats(liveDamageBreakdown, selectedPlayerDamageBreakdown, { includeImportedPets: true })
    : hasVisibleBreakdownStats(selectedPlayerDamageBreakdown)
      ? selectedPlayerDamageBreakdown
      : selectedPlayerSummaryDamageBreakdown;
  const visiblePlayerHealingBreakdown = hasVisibleBreakdownStats(liveHealingBreakdown)
    ? mergeLiveBreakdownWithImportedStats(liveHealingBreakdown, selectedPlayerHealingBreakdown)
    : hasVisibleBreakdownStats(selectedPlayerHealingBreakdown)
      ? selectedPlayerHealingBreakdown
      : selectedPlayerSummaryHealingBreakdown;
  const selectedPlayerDeathRows = useMemo(() => buildDeathDetailRows(filteredFights, selectedPlayerId), [filteredFights, selectedPlayerId]);
  const defaultVisiblePlayerId = useMemo(() => {
    if (sliceType === "debuffs") return "";

    const source = sliceType === "consumables"
      ? visibleConsumableSliceEntries
      : (sliceType === "potions"
        ? visiblePotionSliceEntries
        : (sliceType === "drums" ? visibleDrumSliceEntries : visibleAggregatedSliceEntries));
    return source?.[0]?.id ? String(source[0].id) : "";
  }, [sliceType, visibleAggregatedSliceEntries, visibleConsumableSliceEntries, visibleDrumSliceEntries, visiblePotionSliceEntries]);
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

  useEffect(() => {
    setFightGearLoaded(false);
  }, [selectedFightId, selectedPlayerId, selectedRaid?.id]);

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
    if (!fightGearLoaded) return [];
    return buildFightGearDisplayRows(selectedFightSnapshot?.gear || []);
  }, [fightGearLoaded, selectedFightSnapshot]);

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
    const potionUseCount = Number(selectedPlayerAnalytics.potionUseCount || 0);
    const prepotCount = Number(selectedPlayerAnalytics.prepotCount || 0);
    const metricTags = [
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
        label: "Potion Uses",
        value: potionUseCount,
        tone: potionUseCount > 0 ? "success" : "neutral",
        sortValue: potionUseCount,
      },
      {
        label: "Prepots",
        value: prepotCount,
        tone: prepotCount > 0 ? "info" : "neutral",
        sortValue: prepotCount,
      },
      {
        label: "Deaths",
        value: deaths,
        tone: deaths > 0 ? "warning" : "neutral",
        sortValue: deaths,
      },
      {
        label: "Engineering Damage Done",
        value: engineeringDamageDone,
        tone: engineeringDamageDone > 0 ? "warning" : "neutral",
        sortValue: engineeringDamageDone,
      },
      {
        label: "Active Time %",
        value: formatPercent(activeTimePercent),
        tone: activeTimePercent > 0 ? "success" : "neutral",
        sortValue: activeTimePercent,
      },
    ];

    return sortMetricTags(metricTags.filter(tag => Number(tag.sortValue || 0) > 0));
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
    let cancelled = false;

    async function hydrateLiveAbilityBreakdown(mode) {
      if (!liveBreakdownCacheKey || !profileApiKey.trim()) return;

      const existing = liveAbilityBreakdowns[liveBreakdownCacheKey]?.[mode];
      if (existing?.loaded || existing?.loading) return;

      setLiveAbilityBreakdowns(prev => ({
        ...prev,
        [liveBreakdownCacheKey]: {
          ...(prev[liveBreakdownCacheKey] || {}),
          [mode]: {
            error: "",
            loaded: false,
            loading: true,
            entries: existing?.entries || [],
          },
        },
      }));

      try {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timeoutId = controller ? window.setTimeout(() => controller.abort(), 15000) : 0;
        const response = await fetch("/api/rpb-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller?.signal,
          body: JSON.stringify({
            action: "step",
            step: "playerAbilityBreakdown",
            reportId: selectedRaid.reportId,
            apiKey: profileApiKey,
            sourceId: selectedPlayerId,
            fightIds: filteredFightIds,
            mode,
          }),
        });
        if (timeoutId) window.clearTimeout(timeoutId);

        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.error || `Failed to load ${mode} breakdown`);

        if (!cancelled) {
          setLiveAbilityBreakdowns(prev => ({
            ...prev,
            [liveBreakdownCacheKey]: {
              ...(prev[liveBreakdownCacheKey] || {}),
              [mode]: {
                error: "",
                loaded: true,
                loading: false,
                entries: Array.isArray(data?.entries) ? data.entries : [],
              },
            },
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setLiveAbilityBreakdowns(prev => ({
            ...prev,
            [liveBreakdownCacheKey]: {
              ...(prev[liveBreakdownCacheKey] || {}),
              [mode]: {
                error: error?.name === "AbortError"
                  ? "Live Warcraft Logs breakdown request timed out."
                  : (error?.message || `Failed to load ${mode} breakdown.`),
                loaded: true,
                loading: false,
                entries: [],
              },
            },
          }));
        }
      }
    }

    if (sliceType === "damage" || sliceType === "healing") {
      hydrateLiveAbilityBreakdown(sliceType);
    }

    return () => { cancelled = true; };
  }, [
    filteredFightIds,
    liveAbilityBreakdowns,
    liveBreakdownCacheKey,
    profileApiKey,
    selectedPlayerId,
    selectedRaid?.reportId,
    sliceType,
  ]);

  useEffect(() => {
    if (loadingRaid || !selectedRaid) return;
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
  }, [encounterSelectionOptions, fightOutcomeFilter, loadingRaid, selectedFightId, selectedRaid]);

  useEffect(() => {
    if (!filteredPlayers.length || !defaultVisiblePlayerId) {
      setSelectedPlayerId("");
      return;
    }

    if (isMobileViewport) {
      if (selectedPlayerId && !filteredPlayers.some(player => String(player.id) === String(selectedPlayerId))) {
        setSelectedPlayerId("");
      }
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
  }, [defaultVisiblePlayerId, filteredPlayers, isMobileViewport, selectedPlayerId]);

  useEffect(() => {
    setExpandedDebuffKeys(current => {
      if (!current.size) return current;
      const visibleKeys = new Set(visibleDebuffSliceEntries.map(entry => entry.key));
      const next = new Set([...current].filter(key => visibleKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [visibleDebuffSliceEntries]);

  useEffect(() => {
    if (sliceType !== "debuffs") return;
    setSelectedPlayerId("");
  }, [sliceType]);

  useEffect(() => {
    if (isPlayerDetailOpen) return undefined;
    if (mobileDetailCloseTimerRef.current) {
      window.clearTimeout(mobileDetailCloseTimerRef.current);
      mobileDetailCloseTimerRef.current = null;
    }
    setMobileDetailClosing(false);
    setMobileDetailCloseDirection("");
    return undefined;
  }, [isPlayerDetailOpen]);

  useEffect(() => {
    if (loadingList) return;
    if (!teamFilter) return;

    const visibleRaidIds = new Set(
      filteredRaids.flatMap(raid => [String(raid.id || ""), String(raid.reportId || "")]).filter(Boolean)
    );
    if (raidId && visibleRaidIds.has(raidId)) return;

    if (filteredRaids[0]?.id) {
      navigate(`/rpb/${filteredRaids[0].reportId || filteredRaids[0].id}`, { replace: true });
      return;
    }

    if (raidId) {
      navigate("/rpb", { replace: true });
    }
  }, [filteredRaids, loadingList, navigate, raidId, teamFilter]);

  const isAdmin = auth.isAdmin || auth.fallback;
  const showReportPicker = isMobileViewport && (mobileMenuOpen || (!selectedRaid && !loadingList && !loadingRaid));

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
        { key: "fights", label: "Scanning report structure...", detail: "GET /report/fights", estimateMs: 1200 },
        { key: "summary", label: "Pulling summary roster data...", detail: "GET /report/tables/summary", estimateMs: 1800 },
        { key: "deaths", label: "Pulling death recap data...", detail: "GET /report/tables/deaths", estimateMs: 1800 },
        { key: "tracked", label: "Collecting tracked raid cooldown casts...", detail: "GET /report/tables/casts (tracked filter)", estimateMs: 1800 },
        { key: "hostile", label: "Collecting hostile-player damage...", detail: "GET /report/tables/damage-taken (hostility=1)", estimateMs: 1800 },
        { key: "fullCasts", label: "Capturing combatant and gear snapshots...", detail: "GET /report/tables/casts (full report)", estimateMs: 2600 },
        { key: "engineering", label: "Scanning engineering explosives...", detail: "GET /report/tables/damage-done (engineering filter)", estimateMs: 1400 },
        { key: "oil", label: "Scanning oil of immolation ticks...", detail: "GET /report/tables/damage-taken (ability 11351)", estimateMs: 1200 },
        { key: "buffs", label: "Extracting buff and consumable auras...", detail: "GET /report/tables/buffs", estimateMs: 2600 },
        { key: "buffsByFight", label: "Saving consumable coverage per boss fight...", detail: "GET /report/tables/buffs per boss fight", estimateMs: 7000 },
        { key: "drums", label: "Extracting drums usage...", detail: "GET /report/tables/casts (drums filter)", estimateMs: 1400 },
        { key: "drumsByFight", label: "Saving drums effectiveness per boss fight...", detail: "GET /report/events/casts + /report/events/buffs per boss fight", estimateMs: 8000 },
        { key: "potionsByFight", label: "Saving potion and recovery timelines...", detail: "GET /report/events/casts + /report/events/buffs + /report/events/healing per boss fight", estimateMs: 10000 },
        { key: "reportRankings", label: "Fetching Warcraft Logs parse rankings...", detail: "POST /api/v2/client report.rankings", estimateMs: 2500 },
        { key: "reportSpeed", label: "Fetching report and boss speed rankings...", detail: "POST /api/v2/client report.rankings speed rows", estimateMs: 2000 },
        { key: "raiderData", label: "Capturing boss-pull player snapshots...", detail: "GET /report/tables/summary per boss fight", estimateMs: 8000 },
        { key: "damageByFight", label: "Saving damage ability breakdowns...", detail: "GET /report/tables/damage-done per fight (options=2)", estimateMs: 20000 },
        { key: "healingByFight", label: "Saving healing ability breakdowns...", detail: "GET /report/tables/healing per fight (options=2)", estimateMs: 15000 },
        { key: "deathsByFight", label: "Saving death events per fight...", detail: "GET /report/tables/deaths per fight", estimateMs: 8000 },
        { key: "debuffsByFight", label: "Saving tracked boss debuffs per fight...", detail: "GET /report/tables/debuffs + /report/events/debuffs per boss fight", estimateMs: 9000 },
      ];
      const phaseEstimateMs = {
        prepare: 1500,
        assemble: 3500,
        save: 3500,
      };
      const stepsEstimatedTotalMs = steps.reduce((sum, step) => sum + Number(step.estimateMs || 0), 0);
      const importEstimatedTotalMs = phaseEstimateMs.prepare + stepsEstimatedTotalMs + phaseEstimateMs.assemble + phaseEstimateMs.save;
      const getProgressSteps = (activeStepKey = "", completedKeys = new Set()) => steps.map(step => ({
        ...step,
        completed: completedKeys.has(step.key),
        active: step.key === activeStepKey,
      }));
      const totalUnits = (steps.length * 2) + 4;
      const importStartedAtMs = Date.now();
      const getEstimatedRemainingMs = ({ completedEstimatedMs = 0, hideEta = false } = {}) => {
        if (hideEta) return null;

        const elapsedMs = Math.max(0, Date.now() - importStartedAtMs);
        const normalizedCompletedEstimate = Math.max(0, Number(completedEstimatedMs || 0));
        const remainingEstimate = Math.max(0, importEstimatedTotalMs - normalizedCompletedEstimate);
        if (remainingEstimate <= 0) return 0;
        if (normalizedCompletedEstimate <= 0 || elapsedMs <= 0) return remainingEstimate;

        const observedScale = elapsedMs / normalizedCompletedEstimate;
        const clampedScale = Math.max(0.85, Math.min(2.5, observedScale));
        return Math.round(remainingEstimate * clampedScale);
      };
      const updateImportProgressState = (completed, message, detail = "", extra = {}) => {
        setImportProgress({
          open: true,
          completed,
          total: totalUnits,
          percent: Math.max(0, Math.min(100, Math.round((completed / totalUnits) * 100))),
          message,
          startedAtMs: importStartedAtMs,
          estimatedRemainingMs: getEstimatedRemainingMs({
            completedEstimatedMs: extra.completedEstimatedMs || 0,
            hideEta: !!extra.hideEta,
          }),
          etaUpdatedAtMs: Date.now(),
          detail,
          subdetail: extra.subdetail || "",
          activeStepKey: extra.activeStepKey || "",
          steps: extra.steps || [],
        });
      };

      const datasets = {};
      const importSessionId = `rpb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const completedStepKeys = new Set();
      updateImportProgressState(1, "Preparing import payload...", "Initializing staged Warcraft Logs requests", {
        subdetail: "Import will stage every Warcraft Logs call first, then save a single payload-backed raid bundle.",
        completedEstimatedMs: phaseEstimateMs.prepare * 0.35,
        steps: getProgressSteps("", completedStepKeys),
      });

      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        const completedStepEstimateMs = steps
          .slice(0, index)
          .reduce((sum, currentStep) => sum + Number(currentStep.estimateMs || 0), 0);
        updateImportProgressState((index * 2) + 2, step.label, step.detail, {
          subdetail: `Stage ${index + 1} of ${steps.length}`,
          completedEstimatedMs: phaseEstimateMs.prepare + completedStepEstimateMs + (Number(step.estimateMs || 0) * 0.35),
          activeStepKey: step.key,
          steps: getProgressSteps(step.key, completedStepKeys),
        });

        const response = await fetch(`/api/rpb-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "step",
            step: step.key,
            importSessionId,
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
          completedEstimatedMs: phaseEstimateMs.prepare + completedStepEstimateMs + Number(step.estimateMs || 0),
          activeStepKey: step.key,
          steps: getProgressSteps(step.key, completedStepKeys),
        });
      }

      updateImportProgressState((steps.length * 2) + 2, "Assembling raid payload...", "Normalizing fights, players, analytics, and saved breakdown rows", {
        subdetail: "Converting staged Warcraft Logs responses into persisted raid, fight, player, and breakdown data",
        completedEstimatedMs: phaseEstimateMs.prepare + stepsEstimatedTotalMs + (phaseEstimateMs.assemble * 0.45),
        steps: getProgressSteps("", completedStepKeys),
      });

      const assembleResponse = await fetch(`/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assemble", reportUrl: normalizedReportInput, importSessionId }),
      });

      const assembledRaid = await readApiJson(assembleResponse);
      if (!assembleResponse.ok) throw new Error(assembledRaid.error || "Failed to assemble raid");

      if (options.presetTeamTag !== undefined) {
        assembledRaid.teamTag = normalizeTeamTag(options.presetTeamTag);
      } else if (isAdmin) {
        updateImportProgressState((steps.length * 2) + 3, "Waiting for team tag selection...", "Admin confirmation required before persisting the raid", {
          subdetail: "Choose the team tag before the import is finalized",
          hideEta: true,
          completedEstimatedMs: phaseEstimateMs.prepare + stepsEstimatedTotalMs + phaseEstimateMs.assemble,
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

      updateImportProgressState(totalUnits - 1, "Waiting for webhook selection...", "Choose whether this import should post to the Discord webhook", {
        subdetail: "This only affects the webhook post. The raid will still be saved either way.",
        hideEta: true,
        completedEstimatedMs: phaseEstimateMs.prepare + stepsEstimatedTotalMs + phaseEstimateMs.assemble,
        steps: getProgressSteps("", completedStepKeys),
      });

      const shouldPostWebhook = await new Promise(resolve => {
        setImportWebhookPrompt({
          open: true,
          raidTitle: assembledRaid.title || assembledRaid.reportId,
          resolve,
        });
      });

      updateImportProgressState(totalUnits - 1, "Saving imported raid...", "Persisting raid bundle, fights, players, analytics, and ability rows", {
        subdetail: "Writing the fully payload-backed raid bundle to Redis",
        completedEstimatedMs: phaseEstimateMs.prepare + stepsEstimatedTotalMs + phaseEstimateMs.assemble + (phaseEstimateMs.save * 0.5),
        steps: getProgressSteps("", completedStepKeys),
      });

      const saveResponse = await fetch(`/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assembleAndSave",
          reportUrl: normalizedReportInput,
          importSessionId,
          teamTag: assembledRaid.teamTag || "",
          title: assembledRaid.title,
          notifyIfNew: shouldPostWebhook,
        }),
      });

      const saveResult = await readApiJson(saveResponse);
      if (!saveResponse.ok) throw new Error(saveResult.error || "Failed to save imported raid");
      const savedRaidId = saveResult.raidId || assembledRaid.id;
      const savedRaidRouteId = assembledRaid.reportId || savedRaidId;
      setLiveAbilityBreakdowns({});
      const nextRaids = await fetchRpbRaidList();
      setRaids(nextRaids);
      setReportUrl("");
      updateImportProgressState(totalUnits, "Import complete.", "RPB payload is ready for saved-raid browsing", {
        subdetail: "Saved raid views now resolve from persisted payload data only",
        completedEstimatedMs: importEstimatedTotalMs,
        steps: getProgressSteps("", new Set(steps.map(step => step.key))),
      });
      toast({
        message: options.successMessage || `Imported ${assembledRaid.title}`,
        type: "success",
        duration: 7000,
      });
      navigate(`/rpb/${savedRaidRouteId}`);
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
        startedAtMs: 0,
        estimatedRemainingMs: null,
        etaUpdatedAtMs: 0,
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
      <style>{`@keyframes rpbMobileDetailSlideIn { from { transform: translate3d(-100%, 0, 0); } to { transform: translate3d(0, 0, 0); } }`}</style>
      <ImportProgressModal
        open={importProgress.open}
        progress={importProgress}
        onClose={() => setImportProgress(prev => ({ ...prev, open: false }))}
      />
      {openRaidMenuRaid && openRaidMenuAnchor && (
        <RaidActionsMenu
          raid={openRaidMenuRaid}
          anchor={openRaidMenuAnchor}
          isAdmin={isAdmin}
          compactLabels={isMobileViewport}
          onOpenWcl={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            openWclReport(openRaidMenuRaid);
          }}
          onCopyReportUrl={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            copyRaidPublicUrl(openRaidMenuRaid);
          }}
          onRename={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            openRenameModal(openRaidMenuRaid);
          }}
          onTag={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            openTagModal(openRaidMenuRaid);
          }}
          onDeleteTag={async () => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            await mutateRaidMetadata(openRaidMenuRaid.id, {
              teamTag: "",
              title: buildAutoReportTitle({ start: openRaidMenuRaid.start, teamTag: "" }),
            }, "Removed report tag.");
          }}
          onReimport={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            handleReimportRaid(openRaidMenuRaid);
          }}
          onDelete={() => {
            setOpenRaidMenuId("");
            setOpenRaidMenuAnchor(null);
            setDeleteConfirmRaid(openRaidMenuRaid);
          }}
        />
      )}
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
      <ImportWebhookModal
        open={importWebhookPrompt.open}
        raidTitle={importWebhookPrompt.raidTitle}
        onYes={() => {
          const resolve = importWebhookPrompt.resolve;
          setImportWebhookPrompt({ open: false, raidTitle: "", resolve: null });
          if (resolve) resolve(true);
        }}
        onNo={() => {
          const resolve = importWebhookPrompt.resolve;
          setImportWebhookPrompt({ open: false, raidTitle: "", resolve: null });
          if (resolve) resolve(false);
        }}
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

      {!isMobileViewport && (
        <>
          <div style={{
            borderBottom: `1px solid ${border.subtle}`,
            background: surface.panel,
            padding: `${space[4]}px ${space[6]}px`,
            display: "flex",
            alignItems: "flex-start",
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
            {loadingList && raids.length === 0 && (
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
            {featuredRaids.map((raid, index) => renderDesktopRaidCard(raid, { layout: "large", index }))}
            {compactRaidColumns.map((column, columnIndex) => (
              <div
                key={`compact-raid-column-${column[0]?.id || columnIndex}`}
                style={{
                  minWidth: 160,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: space[2],
                  alignSelf: "stretch",
                }}
              >
                {column.map(raid => renderDesktopRaidCard(raid, { layout: "compact" }))}
              </div>
            ))}
          </div>
        </div>
      </div>
        </>
      )}

      {isMobileViewport && (
        <>
          <div style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: surface.panel,
            borderBottom: `1px solid ${border.subtle}`,
            padding: `${space[2]}px ${space[3]}px`,
            display: "grid",
            gridTemplateColumns: "40px minmax(0, 1fr)",
            gap: space[2],
            alignItems: "center",
          }}>
            <MobileMenuButton
              open={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(current => !current)}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {selectedRaid ? "Current Report" : "Reports"}
              </div>
              <div style={{ fontSize: fontSize.sm, color: text.primary, fontWeight: fontWeight.semibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedRaid?.title || "Select a raid report"}
              </div>
              {selectedRaid && (
                <div style={{ fontSize: fontSize.xs, color: text.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {encounterSelectionOptions.find(option => String(option.id) === String(selectedFightId))?.label || "All encounters"}
                </div>
              )}
            </div>
          </div>

          <ReportPickerSheet
            open={showReportPicker}
            loadingList={loadingList}
            teamFilter={teamFilter}
            setTeamFilter={setTeamFilter}
            filteredRaids={filteredRaids}
            raidId={raidId}
            isAdmin={isAdmin}
            openRaidMenuId={openRaidMenuId}
            setOpenRaidMenuId={setOpenRaidMenuId}
            openRaidActionsMenu={openRaidActionsMenu}
            openRenameModal={openRenameModal}
            openTagModal={openTagModal}
            mutateRaidMetadata={mutateRaidMetadata}
            handleReimportRaid={handleReimportRaid}
            setDeleteConfirmRaid={setDeleteConfirmRaid}
            handleRaidSelection={handleRaidSelection}
            openWclReport={openWclReport}
            copyRaidPublicUrl={copyRaidPublicUrl}
            reportUrl={reportUrl}
            setReportUrl={setReportUrl}
            handleImport={handleImport}
            importing={importing}
            onClose={() => setMobileMenuOpen(false)}
          />
        </>
      )}

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
            <div style={{ ...panelStyle, padding: space[6], display: "flex", flexDirection: "column", alignItems: "center", gap: space[3], textAlign: "center" }}>
              <style>{`@keyframes rpbReportEmojiSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <div
                aria-hidden="true"
                style={{
                  fontSize: 30,
                  lineHeight: 1,
                  animation: "rpbReportEmojiSpin 1.1s linear infinite",
                  transformOrigin: "50% 55%",
                }}
              >
                {pendingRaidLoadingEmoji}
              </div>
              <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: text.primary }}>
                Loading report
              </div>
              <div style={{ fontSize: fontSize.sm, color: text.secondary, maxWidth: 420, overflowWrap: "anywhere" }}>
                {pendingRaidSummary?.title || "Fetching the selected raid report..."}
              </div>
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
                gridTemplateColumns: !isMobileViewport && isPlayerDetailOpen ? "minmax(0, 1.2fr) minmax(360px, 0.8fr)" : "minmax(0, 1fr)",
                gap: space[4],
                alignItems: "start",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0, width: "100%" }}>
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
                          { id: "potions", label: "Potions" },
                          { id: "consumables", label: "Consumables" },
                          { id: "debuffs", label: "Boss Debuffs" },
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
                      {sliceType === "drums" && (
                        <div style={UNDER_DEVELOPMENT_BADGE_STYLE}>
                          Prepull drums casts not available in logs
                        </div>
                      )}
                      {renderTabScopedRaidAnalyticsControls()}
                      <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                        {((sliceType === "consumables"
                          ? visibleConsumableSliceEntries
                          : (sliceType === "potions"
                            ? visiblePotionSliceEntries
                            : (sliceType === "drums"
                              ? visibleDrumSliceEntries
                              : (sliceType === "debuffs" ? visibleDebuffSliceEntries : visibleAggregatedSliceEntries)))).length === 0) && (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                            {sliceType === "debuffs"
                              ? "No tracked boss debuffs were found in the current filtered fights. Reimport the report if this raid predates debuff snapshots."
                              : (raidAnalyticsFilter
                                ? "No players match the active raid analytics filter in this slice."
                                : "Select encounters and re-import a raid with boss data to populate encounter slices.")}
                          </div>
                        )}
                        {sliceType === "debuffs" && visibleDebuffSliceEntries.map(entry => {
                          const isExpanded = expandedDebuffKeys.has(entry.key);
                          const timelineTickMarks = buildTimelineTickMarks(entry.totalEncounterDurationMs);
                          const isArmorRow = entry.key === "armor-reduction";
                          const isBloodFrenzyEstimate = entry.key === "blood-frenzy-estimate";
                          const armorStackMarkers = isArmorRow ? buildArmorStackMarkers(entry.maxStacks, entry.sources) : [];
                          return (
                            <div
                              key={`debuff-${entry.key}`}
                              style={{
                                border: `1px solid ${isExpanded ? accent.blue : border.subtle}`,
                                boxShadow: isExpanded ? `0 0 0 2px ${accent.blue}22` : "none",
                                borderRadius: radius.base,
                                background: isExpanded ? `${accent.blue}08` : "transparent",
                                overflow: "hidden",
                              }}
                            >
                              <button
                                onClick={() => toggleDebuffExpansion(entry.key)}
                                style={{
                                  width: "100%",
                                  border: "none",
                                  background: "transparent",
                                  padding: space[3],
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8, alignItems: "flex-start" }}>
                                  <span style={{ fontWeight: fontWeight.semibold }}>
                                    {isArmorRow ? (
                                      <>
                                        <span style={{ color: getClassColor("Warrior") }}>Sunder Armor</span>
                                        <span style={{ color: text.secondary }}> / </span>
                                        <span style={{ color: getClassColor("Rogue") }}>Improved Expose Armor</span>
                                      </>
                                    ) : (
                                      <span style={{ color: getClassColor(entry.preferredClass) }}>{entry.label}</span>
                                    )}
                                  </span>
                                  <span style={{ minWidth: 112, textAlign: "right", display: "flex", flexDirection: "column", gap: 4 }}>
                                    {isBloodFrenzyEstimate ? (
                                      <>
                                        <span style={{ color: "#d7ffdf", fontWeight: fontWeight.bold }}>
                                          {`${Math.round(Number(entry.estimatedDamage || 0)).toLocaleString()} (${Number(entry.estimatedDps || 0).toFixed(1)} DPS)`}
                                        </span>
                                        <span style={{ fontSize: fontSize.xs, color: text.secondary }}>
                                          {`${entry.uptimePercent.toFixed(1)}% est. uptime`}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span style={{ color: "#d7ffdf", fontWeight: fontWeight.bold }}>
                                          {`${entry.uptimePercent.toFixed(1)}% uptime`}
                                        </span>
                                        <span style={{ fontSize: fontSize.xs, color: text.secondary }}>
                                          {`${entry.casts} cast${entry.casts === 1 ? "" : "s"}`}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
                                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                                    {isArmorRow && armorStackMarkers.length > 0 && (
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {armorStackMarkers.map(marker => (
                                          <span
                                            key={`${entry.key}-stack-${marker.stack}`}
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              minWidth: 20,
                                              height: 18,
                                              padding: "0 6px",
                                              borderRadius: radius.pill,
                                              background: !hasSpecificEncounterSelection
                                                ? "rgba(255, 255, 255, 0.08)"
                                                : (marker.active ? "rgba(79, 178, 111, 0.18)" : "rgba(191, 72, 72, 0.18)"),
                                              border: !hasSpecificEncounterSelection
                                                ? `1px solid ${border.subtle}`
                                                : (marker.active ? "1px solid rgba(79, 178, 111, 0.55)" : "1px solid rgba(191, 72, 72, 0.55)"),
                                              color: !hasSpecificEncounterSelection
                                                ? text.muted
                                                : (marker.active ? "#8be3a6" : "#ff8e8e"),
                                              fontSize: fontSize.xs,
                                              fontWeight: fontWeight.semibold,
                                              lineHeight: 1,
                                            }}
                                          >
                                            {marker.stack}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <div style={{ height: 12, borderRadius: 999, background: surface.base, overflow: "hidden", border: `1px solid ${border.subtle}`, position: "relative" }}>
                                    {entry.timelineBands.map((band, index) => {
                                      const totalDurationMs = Number(entry.totalEncounterDurationMs || 0);
                                      const leftPercent = totalDurationMs > 0 ? (Number(band.startMs || 0) / totalDurationMs) * 100 : 0;
                                      const widthPercent = totalDurationMs > 0 ? ((Number(band.endMs || 0) - Number(band.startMs || 0)) / totalDurationMs) * 100 : 0;
                                      if (widthPercent <= 0) return null;

                                      return (
                                        <div
                                          key={`${entry.key}-band-${index}`}
                                          style={{
                                            position: "absolute",
                                            left: `${Math.max(0, Math.min(100, leftPercent))}%`,
                                            width: `${Math.max(0.6, Math.min(100, widthPercent))}%`,
                                            top: 0,
                                            bottom: 0,
                                            background: isArmorRow ? SUNDER_BAR_COLOR : intent.success,
                                            opacity: 0.92,
                                          }}
                                        />
                                      );
                                    })}
                                    </div>
                                  </div>
                                  <div style={{ minWidth: 80, textAlign: "right" }}>
                                    {!isArmorRow && !isBloodFrenzyEstimate && (
                                      <span style={{ fontSize: fontSize.xs, color: text.muted }}>Coverage</span>
                                    )}
                                    {isBloodFrenzyEstimate && (
                                      <span style={{ fontSize: fontSize.xs, color: text.muted }}>Estimate</span>
                                    )}
                                  </div>
                                  <span style={{ color: text.muted, fontSize: `calc(${fontSize.base} * 3)`, lineHeight: 0.8, fontWeight: fontWeight.bold }}>
                                    {isExpanded ? "▾" : "▸"}
                                  </span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: space[2], marginTop: 6, paddingRight: 96 }}>
                                  {timelineTickMarks.map(mark => (
                                    <span
                                      key={`${entry.key}-tick-${mark.ratio}`}
                                      style={{
                                        color: text.muted,
                                        fontSize: fontSize.xs,
                                        minWidth: 0,
                                        textAlign: mark.ratio === 0 ? "left" : (mark.ratio === 1 ? "right" : "center"),
                                        flex: 1,
                                      }}
                                    >
                                      {mark.label}
                                    </span>
                                  ))}
                                </div>
                              </button>
                              {isExpanded && (
                                <div style={{ padding: `0 ${space[3]}px ${space[3]}px`, display: "flex", flexDirection: "column", gap: space[2] }}>
                                  {isBloodFrenzyEstimate ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                                      <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        Estimate Details
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.primary }}>
                                        {`Estimated from physical damage dealt while Deep Wounds or Rend was active on the target.`}
                                      </div>
                                      <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                        {`Qualifying Physical Damage: ${Math.round(Number(entry.qualifyingPhysicalDamage || 0)).toLocaleString()}`}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        Caster Breakdown
                                      </div>
                                      {entry.sources.length === 0 && (
                                        <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                          No source cast data was returned for this debuff.
                                        </div>
                                      )}
                                      {entry.sources.length > 0 && (
                                    <>
                                      <div style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0, 1fr) 88px",
                                        gap: space[2],
                                        padding: `0 ${space[1]}px`,
                                        fontSize: fontSize.xs,
                                        color: text.muted,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                      }}>
                                        <div>Caster</div>
                                        <div style={{ textAlign: "right" }}>Casts</div>
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        {entry.sources.map(source => (
                                          <div
                                            key={`${entry.key}-${source.sourceId ?? source.name}`}
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "minmax(0, 1fr) 88px",
                                              gap: space[2],
                                              alignItems: "center",
                                              padding: `${space[2]}px ${space[1]}px`,
                                              borderTop: `1px solid ${border.subtle}`,
                                            }}
                                          >
                                            <div style={{ fontSize: fontSize.sm, color: text.primary, minWidth: 0, overflowWrap: "anywhere" }}>
                                              {source.name}
                                            </div>
                                            <div style={{ fontSize: fontSize.sm, color: "#d6e7ff", fontWeight: fontWeight.semibold, textAlign: "right" }}>
                                              {source.casts}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {sliceType === "drums" && visibleDrumSliceEntries.map(entry => {
                          const active = String(entry.id) === String(selectedPlayerId);
                          const maxAffectedTargets = Math.max(0, Number(entry.casts || 0) * 5);
                          const affectedPercent = maxAffectedTargets > 0
                            ? Math.min(100, (Number(entry.affectedTargets || 0) / maxAffectedTargets) * 100)
                            : 0;
                          return (
                            <button
                              key={`drums-${entry.id}`}
                              onClick={() => handlePlayerSelection(entry.id)}
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
                              onClick={() => handlePlayerSelection(entry.id)}
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
                        {sliceType === "potions" && visiblePotionSliceEntries.map(entry => {
                          const active = String(entry.id) === String(selectedPlayerId);
                          const prepotCount = Number(entry.prepotCount || 0);
                          const combatCount = Number(entry.combatCount || 0);
                          const combatOnlyCount = Math.max(0, combatCount - prepotCount);
                          const recoveryCount = Number(entry.recoveryCount || 0);
                          const totalSegments = prepotCount + combatOnlyCount + recoveryCount;
                          const prepotPercent = totalSegments > 0 ? (prepotCount / totalSegments) * 100 : 0;
                          const combatPercent = totalSegments > 0 ? (combatOnlyCount / totalSegments) * 100 : 0;
                          const recoveryPercent = totalSegments > 0 ? (recoveryCount / totalSegments) * 100 : 0;
                          return (
                            <button
                              key={`potions-${entry.id}`}
                              onClick={() => handlePlayerSelection(entry.id)}
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
                                  {entry.total} event{entry.total === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8 }}>
                                <span style={{ fontSize: fontSize.xs, color: "#ffffff", fontWeight: fontWeight.bold }}>
                                  {`⌚ ${entry.prepotCount} · Combat ${entry.combatCount} · Recovery ${entry.recoveryCount}`}
                                </span>
                                <span style={{ fontSize: fontSize.xs, color: totalSegments > 0 ? "#d7ffdf" : text.muted, fontWeight: fontWeight.bold }}>
                                  {totalSegments > 0 ? `${totalSegments} total` : "No potion used"}
                                </span>
                              </div>
                              <div style={{ height: 10, borderRadius: 999, background: surface.base, overflow: "hidden", border: `1px solid ${border.subtle}` }}>
                                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                  <div style={{
                                    width: `${prepotPercent}%`,
                                    height: "100%",
                                    background: "#ff5c5c",
                                    opacity: prepotPercent > 0 ? 0.95 : 0,
                                  }} />
                                  <div style={{
                                    width: `${combatPercent}%`,
                                    height: "100%",
                                    background: "#3fbf63",
                                    opacity: combatPercent > 0 ? 0.95 : 0,
                                  }} />
                                  <div style={{
                                    width: `${recoveryPercent}%`,
                                    height: "100%",
                                    background: "#4da3ff",
                                    opacity: recoveryPercent > 0 ? 0.95 : 0,
                                  }} />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        {sliceType !== "consumables" && sliceType !== "drums" && sliceType !== "potions" && sliceType !== "debuffs" && visibleAggregatedSliceEntries.map(entry => {
                          const maxValue = visibleAggregatedSliceEntries[0]?.total || 1;
                          const active = String(entry.id) === String(selectedPlayerId);
                          const perSecondValue = sliceType === "deaths"
                            ? ""
                            : formatPerSecond(entry.total, entry.activeTime);
                          return (
                            <button
                              key={`damage-${entry.id}`}
                              onClick={() => handlePlayerSelection(entry.id)}
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

                {!isMobileViewport && isPlayerDetailOpen && sliceType !== "debuffs" && (
                  <PlayerDetailPanel
                    isMobile={isMobileViewport}
                    selectedPlayer={selectedPlayer}
                    selectedPlayerMetricTags={selectedPlayerMetricTags}
                    sliceType={sliceType}
                    abilityBreakdownRef={abilityBreakdownRef}
                    selectedPlayerDeathRows={selectedPlayerDeathRows}
                    selectedPlayerAnalytics={selectedPlayerAnalytics}
                    visiblePlayerHealingBreakdown={visiblePlayerHealingBreakdown}
                    visiblePlayerDamageBreakdown={visiblePlayerDamageBreakdown}
                    selectedPlayerIssueGroups={selectedPlayerIssueGroups}
                    selectedFightId={selectedFightId}
                    selectedFightSnapshot={selectedFightSnapshot}
                  selectedFightGear={selectedFightGear}
                  fightGearLoaded={fightGearLoaded}
                  loadSelectedFightGear={() => setFightGearLoaded(true)}
                  itemMetaById={itemMetaById}
                  closeSelectedPlayer={closeSelectedPlayer}
                  enableSwipeClose={false}
                  onSwipeDismiss={null}
                />
              )}
            </div>
            {isMobileViewport && isPlayerDetailOpen && sliceType !== "debuffs" && (
              <div style={{
                position: "fixed",
                inset: 0,
                zIndex: 10001,
                background: mobileDetailClosing ? "rgba(4, 10, 18, 0)" : "rgba(4, 10, 18, 0.78)",
                padding: space[2],
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                transition: "background 220ms ease",
              }} ref={mobileDetailOverlayRef}>
                <div style={{
                  transform: mobileDetailClosing
                    ? (mobileDetailCloseDirection === "down"
                      ? "translate3d(0, 100%, 0)"
                      : (mobileDetailCloseDirection === "up"
                        ? "translate3d(0, -100%, 0)"
                        : "translate3d(100%, 0, 0)"))
                    : "translate3d(0, 0, 0)",
                  transition: "transform 220ms ease",
                  animation: mobileDetailClosing ? "none" : "rpbMobileDetailSlideIn 220ms ease",
                }}>
                  <PlayerDetailPanel
                    isMobile
                    selectedPlayer={selectedPlayer}
                    selectedPlayerMetricTags={selectedPlayerMetricTags}
                    sliceType={sliceType}
                    abilityBreakdownRef={abilityBreakdownRef}
                    selectedPlayerDeathRows={selectedPlayerDeathRows}
                    selectedPlayerAnalytics={selectedPlayerAnalytics}
                    visiblePlayerHealingBreakdown={visiblePlayerHealingBreakdown}
                    visiblePlayerDamageBreakdown={visiblePlayerDamageBreakdown}
                    selectedPlayerIssueGroups={selectedPlayerIssueGroups}
                    selectedFightId={selectedFightId}
                    selectedFightSnapshot={selectedFightSnapshot}
                    selectedFightGear={selectedFightGear}
                    fightGearLoaded={fightGearLoaded}
                    loadSelectedFightGear={() => setFightGearLoaded(true)}
                    itemMetaById={itemMetaById}
                    closeSelectedPlayer={closeSelectedPlayer}
                    enableSwipeClose
                    onSwipeDismiss={requestMobileDetailClose}
                    scrollContainerRef={mobileDetailOverlayRef}
                  />
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

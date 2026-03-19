import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLoginUrl, useAuth } from "../../shared/auth";
import {
  fetchRpbRaidBundle,
  fetchRpbRaidList,
  saveRpbRaidImport,
  fetchUserProfile,
} from "../../shared/firebase";
import {
  surface, border, text, accent, intent, font, fontSize, fontWeight, radius, space, btnStyle, inputStyle, panelStyle,
} from "../../shared/theme";
import { AppShell, LoadingSpinner, toast } from "../../shared/components";

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

const ITEM_QUALITY_COLORS = {
  0: "#9d9d9d",
  1: "#1eff00",
  2: "#ffffff",
  3: "#0070dd",
  4: "#a335ee",
  5: "#ff8000",
};

function tagStyle(tone = "neutral") {
  const tones = {
    danger: { background: "rgba(205, 78, 78, 0.18)", borderColor: "rgba(205, 78, 78, 0.45)", color: "#ffd5d5" },
    warning: { background: "rgba(222, 166, 53, 0.18)", borderColor: "rgba(222, 166, 53, 0.45)", color: "#ffe6b3" },
    info: { background: "rgba(61, 125, 202, 0.18)", borderColor: "rgba(61, 125, 202, 0.45)", color: "#d6e7ff" },
    success: { background: "rgba(75, 170, 109, 0.18)", borderColor: "rgba(75, 170, 109, 0.45)", color: "#d7ffdf" },
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

function MetricTag({ label, value, tone = "neutral" }) {
  return (
    <div style={tagStyle(tone)}>
      <span style={{ opacity: 0.82 }}>{label}:</span>
      <span style={{ fontWeight: fontWeight.semibold }}>{value}</span>
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

function aggregateMetricEntries(fights, field) {
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
      };

      existing.total += entry.total || 0;
      existing.activeTime += entry.activeTime || 0;
      existing.fights += 1;
      grouped.set(key, existing);
    }
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function aggregateAbilityBreakdown(fights, field, playerId) {
  if (!playerId) return [];

  const grouped = new Map();

  for (const fight of fights || []) {
    const entry = (fight[field] || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;

    for (const ability of entry.abilities || []) {
      const key = String(ability.guid ?? ability.name ?? "unknown");
      const existing = grouped.get(key) || {
        key,
        guid: ability.guid ?? null,
        name: ability.name || "Unknown Ability",
        total: 0,
        activeTime: 0,
        hits: 0,
        casts: 0,
        crits: 0,
        overheal: 0,
        absorbed: 0,
      };

      existing.total += ability.total || 0;
      existing.activeTime += ability.activeTime || 0;
      existing.hits += ability.hits || 0;
      existing.casts += ability.casts || 0;
      existing.crits += ability.crits || 0;
      existing.overheal += ability.overheal || 0;
      existing.absorbed += ability.absorbed || 0;
      grouped.set(key, existing);
    }
  }

  return [...grouped.values()].sort((a, b) => b.total - a.total);
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
  return `${actor} - ${ability}${amount ? ` (${amount.toLocaleString()})` : ""}`;
}

function buildDeathDetailRows(fights, playerId) {
  if (!playerId) return [];

  const rows = [];

  for (const fight of fights || []) {
    const entry = (fight.deathEntries || []).find(candidate => String(candidate?.id) === String(playerId));
    if (!entry) continue;

    for (const deathEvent of entry.events || []) {
      const recapEvents = (deathEvent.events || []).length ? (deathEvent.events || []) : [deathEvent];
      const damageEvents = recapEvents.filter(isDamageLikeEvent);
      const healingEvents = recapEvents.filter(isHealingLikeEvent);
      const killingBlow = [...damageEvents].reverse().find(event => getEventAmount(event, "damage") > 0 || Number(event?.overkill || 0) > 0)
        || damageEvents[damageEvents.length - 1]
        || deathEvent;
      const lastHits = damageEvents.slice(-3).reverse();
      const timestampMs = normalizeEncounterEventTimestamp(deathEvent.timestamp, fight);

      rows.push({
        key: `${fight.id}-${deathEvent.timestamp}-${rows.length}`,
        fightId: String(fight.id),
        fightName: fight.name || "Unknown Fight",
        timestampMs,
        killingBlow,
        lastHits,
        damageTaken: damageEvents.reduce((sum, event) => sum + getEventAmount(event, "damage"), 0) || Number(deathEvent.damage || 0),
        healingReceived: healingEvents.reduce((sum, event) => sum + getEventAmount(event, "healing"), 0) || Number(deathEvent.healing || 0),
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.fightId !== b.fightId) return a.fightName.localeCompare(b.fightName, "en", { sensitivity: "base" });
    return (a.timestampMs ?? 0) - (b.timestampMs ?? 0);
  });
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

function formatMetricValue(value) {
  return Number(value || 0).toLocaleString();
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
      label: `${prefix}: ${fight.name}`,
      encounterId: fight.encounterId,
      fightName: fight.name,
      kill: fight.kill,
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
    if (selectedFightId && String(fight.id) !== String(selectedFightId)) return false;

    return true;
  });
}

function ImportProgressModal({ open, progress }) {
  if (!open) return null;

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
        </div>

        <div style={{ height: 12, background: surface.base, border: `1px solid ${border.subtle}`, borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${progress.percent}%`,
            height: "100%",
            background: accent.blue,
            transition: "width 0.2s ease",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: fontSize.sm, color: text.muted }}>
          <span>{progress.completed} / {progress.total} steps</span>
          <span>{progress.percent}%</span>
        </div>
      </div>
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
  const [raids, setRaids] = useState([]);
  const [selectedRaid, setSelectedRaid] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [itemMetaById, setItemMetaById] = useState({});
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRaid, setLoadingRaid] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filterMode, setFilterMode] = useState("encounters-and-trash");
  const [fightOutcomeFilter, setFightOutcomeFilter] = useState("");
  const [selectedFightId, setSelectedFightId] = useState("");
  const [sliceType, setSliceType] = useState("damage");
  const [importProgress, setImportProgress] = useState({
    open: false,
    completed: 0,
    total: 15,
    percent: 0,
    message: "",
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (document.querySelector('script[data-wowhead-power="true"]')) return undefined;

    const script = document.createElement("script");
    script.src = "https://wow.zamimg.com/widgets/power.js";
    script.async = true;
    script.dataset.wowheadPower = "true";
    document.body.appendChild(script);

    return () => {};
  }, []);

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
  }, [navigate, raidId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaid() {
      if (!raidId) {
        setSelectedRaid(null);
        setSelectedPlayerId("");
        return;
      }

      setLoadingRaid(true);
      try {
        const raid = await fetchRpbRaidBundle(raidId);
        if (!cancelled) {
          setSelectedRaid(raid);
          setSelectedPlayerId(raid?.players?.[0]?.id || "");
        }
      } catch (error) {
        if (!cancelled) toast({ message: `Failed to load raid: ${error.message}`, type: "danger" });
      } finally {
        if (!cancelled) setLoadingRaid(false);
      }
    }

    loadRaid();
    return () => { cancelled = true; };
  }, [raidId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileApiKey() {
      if (auth.loading) return;
      if (!auth.authenticated || !auth.user?.discordId) {
        return;
      }

      try {
        const profile = await fetchUserProfile(auth.user.discordId);
        if (!cancelled) {
          setProfileApiKey(profile?.wclV1ApiKey || "");
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

  const raidAnalytics = selectedRaid?.analytics || {
    playersMissingEnchants: [],
    engineeringDamageTaken: [],
    oilOfImmolationDamageTaken: [],
    playersWithBuffData: [],
    playersUsingDrums: [],
    playersWithSuboptimalWeaponEnchants: [],
  };

  const visibleEncounterSourceFights = useMemo(() => {
    return filterFights(selectedRaid?.fights || [], filterMode, "", fightOutcomeFilter);
  }, [selectedRaid, filterMode, fightOutcomeFilter]);

  const encounterOptions = useMemo(() => getEncounterOptions(visibleEncounterSourceFights), [visibleEncounterSourceFights]);

  const filteredFights = useMemo(() => {
    return filterFights(selectedRaid?.fights || [], filterMode, selectedFightId, fightOutcomeFilter);
  }, [selectedRaid, filterMode, selectedFightId, fightOutcomeFilter]);

  const filteredFightIds = useMemo(() => new Set(filteredFights.map(fight => String(fight.id))), [filteredFights]);
  const sortedRaids = useMemo(() => {
    return [...raids].sort((a, b) => new Date(b.start || b.importedAt || 0) - new Date(a.start || a.importedAt || 0));
  }, [raids]);
  const sliceField = sliceType === "healing" ? "healingDoneEntries" : (sliceType === "deaths" ? "deathEntries" : "damageDoneEntries");
  const aggregatedSliceEntries = useMemo(() => aggregateMetricEntries(filteredFights, sliceField), [filteredFights, sliceField]);
  const selectedPlayerDamageBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "damageDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerHealingBreakdown = useMemo(() => aggregateAbilityBreakdown(filteredFights, "healingDoneEntries", selectedPlayerId), [filteredFights, selectedPlayerId]);
  const selectedPlayerDeathRows = useMemo(() => buildDeathDetailRows(filteredFights, selectedPlayerId), [filteredFights, selectedPlayerId]);

  const filteredPlayers = useMemo(() => {
    const visiblePlayers = (selectedRaid?.players || []).filter(player => {
      if (!player.fightsPresent) return true;
      return player.fightsPresent > 0;
    });
    return sortPlayersForDisplay(visiblePlayers);
  }, [selectedRaid]);

  const selectedPlayerIssueGroups = useMemo(() => {
    if (!selectedPlayer?.analytics) {
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
      missingPermanent: dedupeBy(selectedPlayer.analytics.missingEnchants?.missingPermanent, issue => `${issue.itemId}:${issue.slot}:perm`),
      missingTemporary: dedupeBy(selectedPlayer.analytics.missingEnchants?.missingTemporary, issue => `${issue.itemId}:${issue.slot}:temp`),
      suboptimalTemporary: dedupeBy(selectedPlayer.analytics.temporaryEnchantIssues?.suboptimalTemporaryEnchants, issue => `${issue.itemId}:${issue.slot}:${issue.enchantId}`),
      commonGems: summarizeGemIssues(selectedPlayer.analytics.gemIssues?.commonQualityGems),
      uncommonGems: summarizeGemIssues(selectedPlayer.analytics.gemIssues?.uncommonQualityGems),
      rareGems: summarizeGemIssues(selectedPlayer.analytics.gemIssues?.rareQualityGems),
    };
  }, [selectedPlayer]);

  const selectedFightSnapshot = useMemo(() => {
    return getSelectedFightPlayerSnapshot(selectedRaid?.fights || [], selectedFightId, selectedPlayerId);
  }, [selectedRaid, selectedFightId, selectedPlayerId]);

  const selectedFightGear = useMemo(() => {
    return buildFightGearDisplayRows(selectedFightSnapshot?.gear || []);
  }, [selectedFightSnapshot]);

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
        const data = await response.json();
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
    if (!filteredFights.some(fight => String(fight.id) === String(selectedFightId))) {
      setSelectedFightId("");
    }
  }, [filteredFights, selectedFightId]);

  useEffect(() => {
    if (!filteredPlayers.length) {
      setSelectedPlayerId("");
      return;
    }

    if (!filteredPlayers.some(player => String(player.id) === String(selectedPlayerId))) {
      setSelectedPlayerId(filteredPlayers[0].id);
    }
  }, [filteredPlayers, selectedPlayerId]);

  async function handleImport(event) {
    event.preventDefault();
    if (!reportUrl.trim()) {
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
    setImportProgress({
      open: true,
      completed: 0,
      total: 15,
      percent: 0,
      message: "Preparing import...",
    });
    try {
      const steps = [
        { key: "fights", label: "Loading fight list from Warcraft Logs..." },
        { key: "summary", label: "Loading summary data from Warcraft Logs..." },
        { key: "deaths", label: "Loading deaths data from Warcraft Logs..." },
        { key: "tracked", label: "Loading tracked cast data from Warcraft Logs..." },
        { key: "hostile", label: "Loading friendly-fire data from Warcraft Logs..." },
        { key: "fullCasts", label: "Loading gear and combatant data from Warcraft Logs..." },
        { key: "engineering", label: "Loading engineering damage data from Warcraft Logs..." },
        { key: "oil", label: "Loading oil of immolation damage data from Warcraft Logs..." },
        { key: "buffs", label: "Loading buff and consumable data from Warcraft Logs..." },
        { key: "drums", label: "Loading drums usage data from Warcraft Logs..." },
        { key: "raiderData", label: "Loading detailed raider snapshots from Warcraft Logs..." },
        { key: "damageByFight", label: "Loading encounter damage snapshots from Warcraft Logs..." },
        { key: "healingByFight", label: "Loading encounter healing snapshots from Warcraft Logs..." },
        { key: "deathsByFight", label: "Loading encounter death snapshots from Warcraft Logs..." },
      ];

      const datasets = {};

      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        setImportProgress({
          open: true,
          completed: index,
          total: 15,
          percent: Math.round((index / 15) * 100),
          message: step.label,
        });

        const response = await fetch(`/api/rpb-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step", step: step.key, reportUrl, apiKey: profileApiKey }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Import step failed: ${step.key}`);
        datasets[step.key] = data;

        setImportProgress({
          open: true,
          completed: index + 1,
          total: 15,
          percent: Math.round(((index + 1) / 15) * 100),
          message: `${step.label.replace("Loading", "Loaded")}`,
        });
      }

      setImportProgress({
        open: true,
        completed: 14,
        total: 15,
        percent: 93,
        message: "Assembling raid data...",
      });

      const assembleResponse = await fetch(`/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assemble", reportUrl, datasets }),
      });

      const assembledRaid = await assembleResponse.json();
      if (!assembleResponse.ok) throw new Error(assembledRaid.error || "Failed to assemble raid");

      setImportProgress({
        open: true,
        completed: 14,
        total: 15,
        percent: 97,
        message: "Saving imported raid...",
      });

      const saveResult = await saveRpbRaidImport(assembledRaid);
      const nextRaids = await fetchRpbRaidList();
      setRaids(nextRaids);
      setReportUrl("");
      setImportProgress({
        open: true,
        completed: 15,
        total: 15,
        percent: 100,
        message: "Import complete.",
      });
      toast({
        message: saveResult.persistence === "local"
          ? `Warcraft Logs import succeeded for ${assembledRaid.title}, but Firestore denied storage. Saved locally in this browser only.`
          : `Imported ${assembledRaid.title}`,
        type: saveResult.persistence === "local" ? "warning" : "success",
        duration: 7000,
      });
      navigate(`/rpb/${saveResult.raidId}`);
      setTimeout(() => {
        setImportProgress(prev => ({ ...prev, open: false }));
      }, 500);
    } catch (error) {
      setImportProgress({
        open: true,
        completed: 0,
        total: 15,
        percent: 0,
        message: `Import failed: ${error.message}`,
      });
      toast({ message: `Import failed: ${error.message}`, type: "danger", duration: 5000 });
    } finally {
      setImporting(false);
    }
  }

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (!auth.authenticated) {
    return <DiscordLoginGate />;
  }

  return (
    <AppShell>
      <ImportProgressModal open={importProgress.open} progress={importProgress} />

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
          <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: text.primary }}>RPB Workspace</div>
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
          Saved Raids
        </div>
        <div style={{ display: "flex", gap: space[2], overflowX: "auto", paddingBottom: 2 }}>
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
          {sortedRaids.map(raid => {
            const active = raid.id === raidId;
            return (
              <button
                key={raid.id}
                onClick={() => navigate(`/rpb/${raid.id}`)}
                style={{
                  ...btnStyle(active ? "primary" : "default", active),
                  minWidth: 220,
                  height: "auto",
                  padding: space[3],
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textAlign: "left" }}>{raid.title || raid.reportId}</span>
                <span style={{ fontSize: fontSize.xs, color: active ? "#dce9ff" : text.muted }}>{raid.zone || "Unknown Zone"}</span>
                <span style={{ fontSize: fontSize.xs, color: active ? "#dce9ff" : text.muted }}>Report date: {formatDateShort(raid.start)}</span>
                <span style={{ fontSize: fontSize.xs, color: active ? "#dce9ff" : text.muted }}>{raid.playerCount || 0} players • {raid.fightCount || 0} fights</span>
              </button>
            );
          })}
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
              {encounterOptions.map(option => {
                const active = String(selectedFightId) === String(option.id);
                const toneColor = option.kill ? intent.success : intent.danger;
                const inactiveBackground = option.kill ? "rgba(75, 170, 109, 0.14)" : "rgba(205, 78, 78, 0.14)";
                const activeBackground = option.kill ? "rgba(75, 170, 109, 0.24)" : "rgba(205, 78, 78, 0.24)";
                return (
                  <button
                    key={option.id}
                    onClick={() => setSelectedFightId(active ? "" : option.id)}
                    style={{
                      ...btnStyle("default", active),
                      height: 30,
                      background: active ? activeBackground : inactiveBackground,
                      borderColor: active ? toneColor : `${toneColor}66`,
                      color: option.kill ? "#d7ffdf" : "#ffd5d5",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
              {selectedFightId && (
                <button
                  onClick={() => setSelectedFightId("")}
                  style={{ ...btnStyle("default", false), height: 30 }}
                >
                  Clear Encounter
                </button>
              )}
            </div>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Visible encounters are listed as individual pulls, like Warcraft Logs. Only one encounter can be selected at a time.
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
                    onClick={() => setSelectedPlayerId(player.id)}
                    style={{
                      ...btnStyle(active ? "primary" : "default", active),
                      height: 30,
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
          {loadingRaid && (
            <div style={{ ...panelStyle, padding: space[6], display: "flex", justifyContent: "center" }}>
              <LoadingSpinner size={24} />
            </div>
          )}

          {!loadingRaid && !selectedRaid && (
            <div style={{ ...panelStyle, padding: space[6], color: text.muted }}>
              Choose a saved raid or import a new report to begin.
            </div>
          )}

          {!loadingRaid && selectedRaid && (
            <>
              <div style={{ ...panelStyle, padding: space[4], display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: space[3] }}>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Report</div>
                  <div style={{ marginTop: 6, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary }}>{selectedRaid.title}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Zone</div>
                  <div style={{ marginTop: 6, color: text.primary }}>{selectedRaid.zone || "Unknown"}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Imported</div>
                  <div style={{ marginTop: 6, color: text.primary }}>{formatDate(selectedRaid.importedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filtered View</div>
                  <div style={{ marginTop: 6, color: text.primary }}>{filteredPlayers.length} players • {filteredFights.length} fights</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.8fr)", gap: space[4] }}>
                <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
                  <div style={{ ...panelStyle }}>
                    <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Raid Analytics
                    </div>
                    <div style={{ padding: space[4], display: "flex", flexWrap: "wrap", gap: space[2] }}>
                      <MetricTag label="Players Missing Enchants" value={raidAnalytics.playersMissingEnchants.length} tone="danger" />
                      <MetricTag label="Engineering Damage Entries" value={raidAnalytics.engineeringDamageTaken.length} tone="warning" />
                      <MetricTag label="Oil Damage Entries" value={raidAnalytics.oilOfImmolationDamageTaken.length} tone="warning" />
                      <MetricTag label="Players With Buff Data" value={raidAnalytics.playersWithBuffData.length} tone="info" />
                      <MetricTag label="Players Using Drums" value={raidAnalytics.playersUsingDrums.length} tone="info" />
                      <MetricTag label="Suboptimal Weapon Enchants" value={raidAnalytics.playersWithSuboptimalWeaponEnchants.length} tone="danger" />
                    </div>
                  </div>

                  <div style={{ ...panelStyle }}>
                    <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Encounter Damage
                    </div>
                    <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[3] }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: space[2] }}>
                        <MetricTag label="Visible Encounters" value={filteredFights.filter(fight => fight.encounterId > 0).length} tone="info" />
                        <MetricTag label="Profiles" value={aggregatedSliceEntries.length} tone="info" />
                        <MetricTag label="Parse Scores" value="Pending v2 rankings" tone="neutral" />
                      </div>
                      <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
                        {[
                          { id: "damage", label: "Damage" },
                          { id: "healing", label: "Healing" },
                          { id: "deaths", label: "Deaths" },
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
                        {aggregatedSliceEntries.length === 0 && (
                          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                            Select encounters and re-import a raid with boss data to populate encounter slices.
                          </div>
                        )}
                        {aggregatedSliceEntries.slice(0, 16).map(entry => {
                          const maxValue = aggregatedSliceEntries[0]?.total || 1;
                          const active = String(entry.id) === String(selectedPlayerId);
                          return (
                            <button
                              key={`damage-${entry.id}`}
                              onClick={() => setSelectedPlayerId(entry.id)}
                              style={{
                                background: active ? `${accent.blue}10` : "transparent",
                                border: `1px solid ${active ? accent.blue : border.subtle}`,
                                borderRadius: radius.base,
                                padding: space[3],
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], marginBottom: 8 }}>
                                <span style={{ color: getClassColor(entry.type), fontWeight: fontWeight.semibold }}>{entry.name}</span>
                                <span style={{ color: text.secondary }}>{entry.total.toLocaleString()}</span>
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

                <div style={{ ...panelStyle, minWidth: 0 }}>
                  <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Player Detail
                  </div>

                  {!selectedPlayer && (
                    <div style={{ padding: space[4], color: text.muted }}>
                      Select a player to inspect their persisted raid record.
                    </div>
                  )}

                  {selectedPlayer && (
                    <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[4] }}>
                      <div>
                        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: getClassColor(selectedPlayer.type) }}>{selectedPlayer.name}</div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: space[2] }}>
                        <MetricTag label="Missing Permanent Enchants" value={selectedPlayer.analytics?.gearIssueSummary?.missingPermanentEnchantCount || 0} tone={(selectedPlayer.analytics?.gearIssueSummary?.missingPermanentEnchantCount || 0) > 0 ? "danger" : "neutral"} />
                        <MetricTag label="Missing Temporary Enchants" value={selectedPlayer.analytics?.gearIssueSummary?.missingTemporaryEnchantCount || 0} tone={(selectedPlayer.analytics?.gearIssueSummary?.missingTemporaryEnchantCount || 0) > 0 ? "danger" : "neutral"} />
                        <MetricTag label="Low Quality Gems" value={selectedPlayer.analytics?.gearIssueSummary?.lowQualityGemCount || 0} tone={(selectedPlayer.analytics?.gearIssueSummary?.lowQualityGemCount || 0) > 0 ? "danger" : "neutral"} />
                        <MetricTag label="Suboptimal Weapon Enchants" value={selectedPlayer.analytics?.gearIssueSummary?.suboptimalTemporaryEnchantCount || 0} tone={(selectedPlayer.analytics?.gearIssueSummary?.suboptimalTemporaryEnchantCount || 0) > 0 ? "danger" : "neutral"} />
                        <MetricTag label="Deaths" value={selectedPlayer.deaths} tone={selectedPlayer.deaths > 0 ? "warning" : "neutral"} />
                        <MetricTag label="Tracked Casts" value={selectedPlayer.trackedCastCount} tone="info" />
                        <MetricTag label="Friendly Fire" value={selectedPlayer.hostilePlayerDamage} tone={selectedPlayer.hostilePlayerDamage > 0 ? "warning" : "neutral"} />
                        <MetricTag label="Engineering Damage Taken" value={selectedPlayer.analytics?.engineeringDamageTaken || 0} tone={(selectedPlayer.analytics?.engineeringDamageTaken || 0) > 0 ? "warning" : "neutral"} />
                        <MetricTag label="Oil of Immolation" value={selectedPlayer.analytics?.oilOfImmolationDamageTaken || 0} tone={(selectedPlayer.analytics?.oilOfImmolationDamageTaken || 0) > 0 ? "warning" : "neutral"} />
                        <MetricTag label="Tracked Buff Auras" value={selectedPlayer.analytics?.buffAuraCount || 0} tone="info" />
                        <MetricTag label="Drums Casts" value={selectedPlayer.analytics?.drumsCastCount || 0} tone="info" />
                        <MetricTag label="Visible Fights" value={filteredFightIds.size} tone="neutral" />
                        <MetricTag label="Active Time" value={formatDuration(selectedPlayer.activeTimeMs)} tone="neutral" />
                      </div>

                      {sliceType === "deaths" && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Death recap</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {selectedPlayerDeathRows.length > 0 && (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "92px minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 96px 96px",
                                  gap: space[2],
                                  padding: `0 ${space[3]}px`,
                                  fontSize: fontSize.xs,
                                  color: text.muted,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                <div>Timer</div>
                                <div>Encounter</div>
                                <div>Killing Blow</div>
                                <div>Last 3 Hits</div>
                                <div>Damage</div>
                                <div>Healing</div>
                              </div>
                            )}
                            {!selectedPlayerDeathRows.length && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                No deaths found for this player in the current filtered fights.
                              </div>
                            )}
                            {selectedPlayerDeathRows.map(row => (
                              <div
                                key={row.key}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "92px minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 96px 96px",
                                  gap: space[2],
                                  padding: space[3],
                                  border: `1px solid ${border.subtle}`,
                                  borderRadius: radius.base,
                                  background: surface.card,
                                  alignItems: "start",
                                }}
                              >
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {formatDuration(row.timestampMs)}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {row.fightName}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {formatEventSummary(row.killingBlow)}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {row.lastHits.length > 0 ? row.lastHits.map((hit, index) => (
                                    <div key={`${row.key}-hit-${index}`} style={{ fontSize: fontSize.xs, color: text.muted }}>
                                      {formatEventSummary(hit)}
                                    </div>
                                  )) : (
                                    <div style={{ fontSize: fontSize.xs, color: text.muted }}>
                                      No damage recap captured.
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {formatMetricValue(row.damageTaken)}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {formatMetricValue(row.healingReceived)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sliceType !== "deaths" && (
                        <div>
                          <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                            {sliceType === "healing" ? "Healing breakdown" : "Damage breakdown"}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                            {(sliceType === "healing" ? selectedPlayerHealingBreakdown.length : selectedPlayerDamageBreakdown.length) > 0 && (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.3fr) 110px 72px 72px 72px 92px",
                                  gap: space[2],
                                  padding: `0 ${space[3]}px`,
                                  fontSize: fontSize.xs,
                                  color: text.muted,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                <div>Ability</div>
                                <div>Total</div>
                                <div>Casts</div>
                                <div>Hits</div>
                                <div>Crits</div>
                                <div>{sliceType === "healing" ? "Overheal" : "Active"}</div>
                              </div>
                            )}
                            {!(sliceType === "healing" ? selectedPlayerHealingBreakdown.length : selectedPlayerDamageBreakdown.length) && (
                              <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                No {sliceType} ability breakdown found for this player in the current filtered fights.
                              </div>
                            )}
                            {(sliceType === "healing" ? selectedPlayerHealingBreakdown : selectedPlayerDamageBreakdown).slice(0, 20).map(ability => (
                              <div
                                key={`${sliceType}-${ability.key}`}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.3fr) 110px 72px 72px 72px 92px",
                                  gap: space[2],
                                  padding: space[3],
                                  border: `1px solid ${border.subtle}`,
                                  borderRadius: radius.base,
                                  background: surface.card,
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {ability.name}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                                  {formatMetricValue(ability.total)}
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                  {ability.casts || 0} casts
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                  {ability.hits || 0} hits
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                  {ability.crits || 0} crits
                                </div>
                                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                                  {sliceType === "healing" ? `${formatMetricValue(ability.overheal)} overheal` : `${formatMetricValue(ability.activeTime)} ms`}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Detected Gear Issues</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                          {!selectedPlayer.analytics?.hasGearData && (
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
                              {selectedPlayer.analytics?.hasGearData
                                ? "No baseline enchant or gem issues detected."
                                : "No gear issues shown because no gear snapshot is currently attached to this player."}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Detected temporary weapon enchants</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                          {(selectedPlayer.analytics?.temporaryEnchantIssues?.activeTemporaryEnchants || []).map(issue => (
                            <div key={`active-temp-${issue.slot}-${issue.itemId}-${issue.enchantId}`} style={{ fontSize: fontSize.sm, color: text.secondary }}>
                              {issue.slotLabel}: <WowheadSpellLink spellId={issue.enchantId}>{issue.enchantName}</WowheadSpellLink>
                            </div>
                          ))}
                          {!(selectedPlayer.analytics?.temporaryEnchantIssues?.activeTemporaryEnchants || []).length && (
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
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

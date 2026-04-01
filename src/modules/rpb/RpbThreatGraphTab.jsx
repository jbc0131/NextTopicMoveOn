import { useEffect, useMemo, useState } from "react";
import {
  surface, border, text, accent, fontSize, fontWeight, radius, space, btnStyle, inputStyle, panelStyle,
} from "../../shared/theme";

const FALLBACK_CLASS_COLORS = {
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

const THREAT_SCHOOL = {
  PHYSICAL: 1,
  HOLY: 2,
  FIRE: 4,
  NATURE: 8,
  FROST: 16,
  SHADOW: 32,
  ARCANE: 64,
};

const PREFERRED_SPELL_SCHOOL = {
  Mage: THREAT_SCHOOL.FROST,
  Priest: THREAT_SCHOOL.HOLY,
  Paladin: THREAT_SCHOOL.HOLY,
  Warlock: THREAT_SCHOOL.SHADOW,
};

const BUFF_MULTIPLIERS = {
  71: { default: 1.3 },
  5487: { default: 1.3 },
  9634: { default: 1.3 },
  25780: { bySchool: { [THREAT_SCHOOL.HOLY]: 1.6 } },
  1038: { default: 0.7 },
  25895: { default: 0.7 },
  25909: { default: 0.8 },
  2613: { default: 1.02 },
  2621: { default: 0.98 },
  40618: { default: 0 },
};

const THREAT_BUFF_LABELS = {
  71: "Defensive Stance",
  768: "Cat Form",
  1038: "Blessing of Salvation",
  2457: "Battle Stance",
  2458: "Berserker Stance",
  2613: "Threat Gloves Enchant",
  2621: "Subtlety Gloves Enchant",
  5487: "Bear Form",
  9634: "Dire Bear Form",
  25780: "Righteous Fury",
  25895: "Greater Blessing of Salvation",
  25898: "Greater Blessing of Kings",
  25909: "Tranquil Air Totem",
  27141: "Greater Blessing of Might",
  27143: "Greater Blessing of Wisdom",
  27168: "Greater Blessing of Sanctuary",
  40618: "Insignificance",
  38447: "Improved Mangle (T6 2pc)",
};

function getClassColor(type, index = 0) {
  if (FALLBACK_CLASS_COLORS[type]) return FALLBACK_CLASS_COLORS[type];
  const fallbackPalette = ["#71d5ff", "#f7b955", "#82d992", "#ff8d8d", "#b9a6ff", "#7ee0c5"];
  return fallbackPalette[index % fallbackPalette.length];
}

function isConcreteEncounterOption(option) {
  return option && !option.kind;
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatSecondsFromMs(value) {
  return `${(coerceNumber(value, 0) / 1000).toFixed(1)}s`;
}

function normalizeTracePoint(point = {}, fallbackIndex = 0) {
  const timeMs = coerceNumber(
    point.timeMs ?? point.timestampMs ?? point.timestamp ?? point.time ?? point.x,
    fallbackIndex * 1000,
  );
  const threat = coerceNumber(point.threat ?? point.value ?? point.y ?? point.total, 0);
  return {
    timeMs,
    threat,
    label: String(point.label || point.text || "").trim(),
  };
}

function resolveBuffLabel(row = {}) {
  const buffId = String(row?.buffId || "").trim();
  const numericBuffId = Number(buffId);
  const fallbackLabel = Number.isFinite(numericBuffId) ? THREAT_BUFF_LABELS[numericBuffId] : "";
  const currentLabel = String(row?.label || "").trim();
  if (!currentLabel) return fallbackLabel || (buffId ? `Buff ${buffId}` : "Unknown Buff");
  if (/^Buff \d+$/i.test(currentLabel) && fallbackLabel) return fallbackLabel;
  return currentLabel;
}

function normalizeThreatPlayers(snapshot, raidPlayers, selectedFight) {
  const snapshotPlayers = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playersFromFight = Array.isArray(selectedFight?.damageDoneEntries) ? selectedFight.damageDoneEntries : [];
  const raidPlayersById = new Map((raidPlayers || []).map(player => [String(player.id), player]));

  if (snapshotPlayers.length > 0) {
    return snapshotPlayers.map((player, index) => {
      const raidPlayer = raidPlayersById.get(String(player.playerId || player.id || ""));
      const rawSeries = player.series || player.points || player.trace || [];
      const series = Array.isArray(rawSeries)
        ? rawSeries.map((point, pointIndex) => normalizeTracePoint(point, pointIndex)).sort((left, right) => left.timeMs - right.timeMs)
        : [];
      const normalizedSeries = series.map((point, pointIndex) => ({
        ...point,
        deltaThreat: pointIndex === 0 ? coerceNumber(point.threat, 0) : Math.max(0, coerceNumber(point.threat, 0) - coerceNumber(series[pointIndex - 1]?.threat, 0)),
      }));
      const highestThreat = normalizedSeries.reduce((max, point) => Math.max(max, point.threat), 0);
      const modifiers = [];
      const abilities = Array.isArray(player.abilities) ? player.abilities : [];
      const inferredBuffs = Array.isArray(player.inferredBuffs) ? player.inferredBuffs : [];
      const inferredTalents = Array.isArray(player.inferredTalents) ? player.inferredTalents : [];
      const initialCoefficient = Number.isFinite(Number(player.initialCoefficient)) ? Number(player.initialCoefficient) : null;

      return {
        playerId: String(player.playerId || player.id || raidPlayer?.id || player.name || index),
        name: player.name || raidPlayer?.name || "Unknown Player",
        type: player.type || raidPlayer?.type || "",
        color: player.color || getClassColor(player.type || raidPlayer?.type, index),
        series: normalizedSeries,
        highestThreat,
        abilities,
        inferredBuffs: inferredBuffs.map(row => ({
          ...row,
          label: resolveBuffLabel(row),
        })),
        inferredTalents,
        modifiers,
        initialCoefficient,
      };
    }).sort((left, right) =>
      coerceNumber(right.initialCoefficient, -1) - coerceNumber(left.initialCoefficient, -1)
      || right.highestThreat - left.highestThreat
      || left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  }

  return playersFromFight.map((entry, index) => {
    const raidPlayer = raidPlayersById.get(String(entry.id || ""));
    return {
      playerId: String(entry.id || raidPlayer?.id || entry.name || index),
      name: entry.name || raidPlayer?.name || "Unknown Player",
      type: entry.type || raidPlayer?.type || "",
      color: getClassColor(entry.type || raidPlayer?.type, index),
      series: [],
      highestThreat: 0,
      abilities: [],
      inferredBuffs: [],
      inferredTalents: [],
      modifiers: [],
      initialCoefficient: null,
    };
  }).sort((left, right) =>
    coerceNumber(right.initialCoefficient, -1) - coerceNumber(left.initialCoefficient, -1)
    || left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
}

function formatThreatCoefficient(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "";
}

function formatThreatMetric(value) {
  return coerceNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeBuffState(value) {
  if (value === "On" || value === "Inferred on") return value;
  if (value === "Off" || value === "Inferred off") return value;
  return "Inferred off";
}

function isBuffEnabled(value) {
  return normalizeBuffState(value) === "Inferred on";
}

function getPreferredSpellSchool(type) {
  return PREFERRED_SPELL_SCHOOL[type] || THREAT_SCHOOL.PHYSICAL;
}

function getBuffMultiplier(buffId, spellSchool) {
  const multiplier = BUFF_MULTIPLIERS[buffId];
  if (!multiplier) return 1;
  if (multiplier.bySchool) return multiplier.bySchool[spellSchool] ?? multiplier.bySchool.default ?? 1;
  return multiplier.default ?? 1;
}

function getTalentMultiplier(type, label, rank, activeBuffIds, spellSchool) {
  const normalizedRank = Math.max(0, coerceNumber(rank, 0));
  if (normalizedRank <= 0) return 1;

  if (type === "Warrior") {
    if (label === "Defiance" && activeBuffIds.has("71")) return 1 + (0.05 * normalizedRank);
    if (label === "Improved Berserker Stance" && activeBuffIds.has("2458")) return 1 - (0.02 * normalizedRank);
  }

  if (type === "Druid") {
    if (label === "Feral Instinct" && (activeBuffIds.has("5487") || activeBuffIds.has("9634"))) {
      return (1.3 + (0.05 * normalizedRank)) / 1.3;
    }
  }

  if (type === "Mage") {
    if (label === "Arcane Subtlety" && spellSchool === THREAT_SCHOOL.ARCANE) return 1 - (0.2 * normalizedRank);
    if (label === "Burning Soul" && spellSchool === THREAT_SCHOOL.FIRE) return 1 - (0.05 * normalizedRank);
    if (label === "Frost Channeling" && spellSchool === THREAT_SCHOOL.FROST) return 1 - (0.033333 * normalizedRank);
  }

  if (type === "Paladin") {
    if (label === "Improved Righteous Fury" && activeBuffIds.has("25780")) {
      const amp = 1 + Math.floor((normalizedRank * 50) / 3) / 100;
      return spellSchool === THREAT_SCHOOL.HOLY ? (1 + (0.6 * amp)) / 1.6 : 1;
    }
    if (label === "Fanaticism" && !activeBuffIds.has("25780")) return 1 - (0.06 * normalizedRank);
  }

  if (type === "Priest") {
    if (label === "Silent Resolve") return 1 - (0.04 * normalizedRank);
    if (label === "Shadow Affinity" && spellSchool === THREAT_SCHOOL.SHADOW) {
      return 1 - (Math.floor((normalizedRank * 25) / 3) / 100);
    }
  }

  if (type === "Shaman") {
    if (label === "Healing Grace") return 1 - (0.05 * normalizedRank);
    if (label === "Spirit Weapons" && spellSchool === THREAT_SCHOOL.PHYSICAL) return 1 - (0.3 * normalizedRank);
    if (label === "Elemental Precision (fire)" && spellSchool === THREAT_SCHOOL.FIRE) return 1 - (0.033333 * normalizedRank);
    if (label === "Elemental Precision (nature)" && spellSchool === THREAT_SCHOOL.NATURE) return 1 - (0.033333 * normalizedRank);
    if (label === "Elemental Precision (frost)" && spellSchool === THREAT_SCHOOL.FROST) return 1 - (0.033333 * normalizedRank);
  }

  if (type === "Warlock" && label === "Destructive Reach") {
    return 1 - (0.05 * normalizedRank);
  }

  return 1;
}

function computeThreatCoefficient(type, buffRows = [], buffStates = {}, talentRows = [], talentRanks = {}) {
  const spellSchool = getPreferredSpellSchool(type);
  const activeBuffIds = new Set(
    (buffRows || [])
      .filter(row => isBuffEnabled(buffStates[row.buffId || row.label] ?? row.state))
      .map(row => String(row.buffId || row.label)),
  );

  let coefficient = 1;
  for (const buffId of activeBuffIds) coefficient *= getBuffMultiplier(buffId, spellSchool);

  for (const row of talentRows || []) {
    const rank = talentRanks[row.label] ?? row.rank ?? 0;
    coefficient *= getTalentMultiplier(type, row.label, rank, activeBuffIds, spellSchool);
  }

  return coefficient;
}

function scaleThreatSeries(series = [], ratio = 1) {
  return (series || []).map((point, index, rows) => {
    const previousThreat = index === 0 ? 0 : coerceNumber(rows[index - 1]?.threat, 0);
    const threat = coerceNumber(point.threat, 0) * ratio;
    return {
      ...point,
      threat,
      deltaThreat: Math.max(0, threat - (index === 0 ? 0 : previousThreat * ratio)),
    };
  });
}

function hasManualBuffOverrides(buffRows = [], buffStates = {}) {
  return (buffRows || []).some(row => {
    const key = row.buffId || row.label;
    if (!(key in buffStates)) return false;
    return normalizeBuffState(buffStates[key]) !== normalizeBuffState(row.state);
  });
}

function hasManualTalentOverrides(talentRows = [], talentRanks = {}) {
  return (talentRows || []).some(row => {
    if (!(row.label in talentRanks)) return false;
    return coerceNumber(talentRanks[row.label], row.rank ?? 0) !== coerceNumber(row.rank, 0);
  });
}

function buildAbilityTotals(rows = [], fightDurationMs = 0) {
  const totals = new Map();
  for (const row of rows || []) {
    const label = String(row?.label || "Unknown").trim() || "Unknown";
    totals.set(label, coerceNumber(totals.get(label), 0) + coerceNumber(row?.threat, 0));
  }

  const durationSeconds = Math.max(1, coerceNumber(fightDurationMs, 0) / 1000);
  return [...totals.entries()]
    .map(([label, threat]) => ({
      label,
      threat,
      tps: threat / durationSeconds,
    }))
    .sort((left, right) => right.threat - left.threat || left.label.localeCompare(right.label, "en", { sensitivity: "base" }));
}

function buildThreatChartPath(points, width, height, maxTimeMs, maxThreat) {
  if (!points.length || maxTimeMs <= 0 || maxThreat <= 0) return "";
  return points.map((point, index) => {
    const x = Math.max(0, Math.min(width, (point.timeMs / maxTimeMs) * width));
    const y = Math.max(0, Math.min(height, height - ((point.threat || 0) / maxThreat) * height));
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function getChartPoint(point, width, height, maxTimeMs, maxThreat) {
  return {
    x: Math.max(0, Math.min(width, (coerceNumber(point.timeMs, 0) / maxTimeMs) * width)),
    y: Math.max(0, Math.min(height, height - (coerceNumber(point.threat, 0) / maxThreat) * height)),
  };
}

function buildTargetSegments(targetHistory = [], fightDurationMs = 0) {
  if (!Array.isArray(targetHistory) || !targetHistory.length) return [];
  return targetHistory.map((entry, index) => ({
    ...entry,
    endTimeMs: index < targetHistory.length - 1 ? coerceNumber(targetHistory[index + 1].timeMs, fightDurationMs) : coerceNumber(fightDurationMs, 0),
  })).filter(entry => entry.endTimeMs > coerceNumber(entry.timeMs, 0));
}

function getTooltipPosition(event) {
  return {
    x: event.clientX + 12,
    y: event.clientY - 12,
  };
}

function ThreatChart({
  players,
  hiddenPlayerIds,
  fightDurationMs,
  targetHistory,
  enemyOptions,
  selectedEnemyKey,
  onSelectEnemy,
  raiderOptions,
  selectedRaiderId,
  onSelectRaider,
  selectedRaider,
  underDevelopmentBadgeStyle,
}) {
  const width = 920;
  const height = 320;
  const targetBandHeight = 28;
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [buffStates, setBuffStates] = useState({});
  const [talentRanks, setTalentRanks] = useState({});

  useEffect(() => {
    if (!selectedRaider) {
      setBuffStates({});
      setTalentRanks({});
      return;
    }
    setBuffStates(Object.fromEntries((selectedRaider.inferredBuffs || []).map(row => [row.buffId || row.label, normalizeBuffState(row.state)])));
    setTalentRanks(Object.fromEntries((selectedRaider.inferredTalents || []).map(row => [row.label, row.rank])));
  }, [selectedRaider]);

  const adjustedPlayers = useMemo(() => {
    if (!selectedRaider) return players;

    const hasManualOverrides = hasManualBuffOverrides(
      selectedRaider.inferredBuffs || [],
      buffStates,
    ) || hasManualTalentOverrides(
      selectedRaider.inferredTalents || [],
      talentRanks,
    );
    if (!hasManualOverrides) return players;

    const nextCoefficient = computeThreatCoefficient(
      selectedRaider.type,
      selectedRaider.inferredBuffs || [],
      buffStates,
      selectedRaider.inferredTalents || [],
      talentRanks,
    );
    const baselineCoefficient = Math.max(0.0001, coerceNumber(selectedRaider.initialCoefficient, 1));
    const scaleRatio = nextCoefficient / baselineCoefficient;

    return players.map(player => {
      if (String(player.playerId) !== String(selectedRaider.playerId)) return player;
      const series = scaleThreatSeries(player.series, scaleRatio);
      const abilities = (player.abilities || []).map(row => ({
        ...row,
        threat: coerceNumber(row.threat, 0) * scaleRatio,
      }));
      return {
        ...player,
        series,
        abilities,
        highestThreat: series.reduce((max, point) => Math.max(max, coerceNumber(point.threat, 0)), 0),
        initialCoefficient: nextCoefficient,
        inferredBuffs: (player.inferredBuffs || []).map(row => ({
          ...row,
          state: normalizeBuffState(buffStates[row.buffId || row.label] ?? row.state),
        })),
        inferredTalents: (player.inferredTalents || []).map(row => ({
          ...row,
          rank: Math.max(0, Math.min(coerceNumber(row.maxRank, 0), coerceNumber(talentRanks[row.label], row.rank ?? 0))),
        })),
      };
    });
  }, [players, selectedRaider, buffStates, talentRanks]);

  const displaySelectedRaider = useMemo(
    () => adjustedPlayers.find(player => String(player.playerId) === String(selectedRaiderId)) || adjustedPlayers[0] || null,
    [adjustedPlayers, selectedRaiderId],
  );
  const visiblePlayers = adjustedPlayers.filter(player => !hiddenPlayerIds.has(String(player.playerId)));
  const maxTimeMs = Math.max(
    coerceNumber(fightDurationMs, 0),
    ...visiblePlayers.flatMap(player => player.series.map(point => point.timeMs)),
    1,
  );
  const maxThreat = Math.max(
    ...visiblePlayers.flatMap(player => player.series.map(point => point.threat)),
    0,
  );
  const hasGraphData = maxThreat > 0 && visiblePlayers.some(player => player.series.length > 1);
  const yTicks = maxThreat > 0 ? [0.25, 0.5, 0.75, 1] : [];
  const targetSegments = buildTargetSegments(targetHistory, maxTimeMs);

  const abilityRows = useMemo(
    () => buildAbilityTotals(displaySelectedRaider?.abilities || [], fightDurationMs),
    [displaySelectedRaider, fightDurationMs],
  );
  const abilityTotalThreat = abilityRows.reduce((sum, row) => sum + coerceNumber(row.threat, 0), 0);
  const abilityTotalTps = abilityRows.reduce((sum, row) => sum + coerceNumber(row.tps, 0), 0);

  return (
    <div
      style={{ ...panelStyle, overflow: "hidden", position: "relative" }}
      onMouseLeave={() => setHoveredTooltip(null)}
    >
      <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, display: "flex", flexDirection: "column", gap: space[3] }}>
        <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Threat Timeline
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[3], alignItems: "flex-start", justifyContent: "flex-start" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            <span style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Enemy
            </span>
            <select value={selectedEnemyKey} onChange={event => onSelectEnemy(event.target.value)} disabled={!enemyOptions.length} style={{ ...inputStyle, minHeight: 34 }}>
              {!enemyOptions.length ? <option value="">No enemy data available</option> : null}
              {enemyOptions.map(option => (
                <option key={option.enemyKey} value={option.enemyKey}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            <span style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Raider
            </span>
            <select value={selectedRaiderId} onChange={event => onSelectRaider(event.target.value)} disabled={!raiderOptions.length} style={{ ...inputStyle, minHeight: 34 }}>
              {!raiderOptions.length ? <option value="">No raider data available</option> : null}
              {raiderOptions.map(option => (
                <option key={option.playerId} value={option.playerId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <div style={underDevelopmentBadgeStyle}>
              This tab is currently under development
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: space[4] }}>
        <div
          style={{
            border: `1px solid ${border.subtle}`,
            borderRadius: radius.base,
            background: "linear-gradient(180deg, rgba(9, 17, 27, 0.96) 0%, rgba(6, 12, 19, 0.98) 100%)",
            padding: space[3],
          }}
          onMouseLeave={() => setHoveredTooltip(null)}
        >
          {hasGraphData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Threat timeline">
              {yTicks.map(tick => {
                const y = height - (height * tick);
                const labelValue = Math.round(maxThreat * tick).toLocaleString();
                return (
                  <g key={`y-${tick}`}>
                    <line x1="0" x2={width} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    <text x="8" y={Math.max(14, y - 6)} fill="rgba(204,214,224,0.76)" fontSize="14">
                      {labelValue}
                    </text>
                  </g>
                );
              })}
              {visiblePlayers.map(player => {
                return (
                  <g key={player.playerId}>
                    <path
                      d={buildThreatChartPath(player.series, width, height, maxTimeMs, maxThreat)}
                      fill="none"
                      stroke={player.color}
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{ cursor: "pointer" }}
                    >
                      <title>{player.name}</title>
                    </path>
                    {player.series.map((point, index) => {
                      const position = getChartPoint(point, width, height, maxTimeMs, maxThreat);
                      return (
                        <circle
                          key={`${player.playerId}-${index}-${point.timeMs}`}
                          cx={position.x}
                          cy={position.y}
                          r="2.5"
                          fill={player.color}
                          stroke="rgba(6,12,19,0.95)"
                          strokeWidth="0.75"
                          onMouseMove={event => {
                            const tooltip = getTooltipPosition(event);
                            setHoveredTooltip({
                              x: tooltip.x,
                              y: tooltip.y,
                              title: player.name,
                              lines: [
                                `Ability: ${point.label || "Unknown"}`,
                                `Threat: ${Math.round(coerceNumber(point.deltaThreat, point.threat)).toLocaleString()}`,
                                `Current Threat: ${Math.round(coerceNumber(point.threat, 0)).toLocaleString()}`,
                              ],
                            });
                          }}
                        >
                          <title>{`${player.name}
Ability: ${point.label || "Unknown"}
Threat: ${Math.round(coerceNumber(point.deltaThreat, point.threat)).toLocaleString()}
Current Threat: ${Math.round(coerceNumber(point.threat, 0)).toLocaleString()}`}</title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Boss Target
                </div>
                <svg viewBox={`0 0 ${width} ${targetBandHeight}`} style={{ width: "100%", height: "28px", display: "block" }} role="img" aria-label="Boss target timeline">
                  {targetSegments.length ? targetSegments.map((segment, index) => {
                    const x = (coerceNumber(segment.timeMs, 0) / maxTimeMs) * width;
                    const nextX = (coerceNumber(segment.endTimeMs, 0) / maxTimeMs) * width;
                    const player = adjustedPlayers.find(entry => String(entry.playerId) === String(segment.playerId));
                    return (
                      <g key={`${segment.playerId}-${index}-${segment.timeMs}`}>
                        <rect
                          x={x}
                          y="2"
                          width={Math.max(2, nextX - x)}
                          height={targetBandHeight - 4}
                          fill={`${player?.color || "#64748b"}55`}
                          stroke={player?.color || "#64748b"}
                          strokeWidth="1"
                          rx="4"
                          onMouseMove={event => {
                            const tooltip = getTooltipPosition(event);
                            setHoveredTooltip({
                              x: tooltip.x,
                              y: tooltip.y,
                              title: segment.name,
                              lines: [`Boss Target: ${segment.name}`],
                            });
                          }}
                        >
                          <title>{`Boss Target: ${segment.name}`}</title>
                        </rect>
                        {nextX - x > 64 ? (
                          <text x={x + 6} y={18} fill="rgba(226,232,240,0.9)" fontSize="12">
                            {segment.name}
                          </text>
                        ) : null}
                      </g>
                    );
                  }) : (
                    <text x="6" y="18" fill="rgba(148,163,184,0.9)" fontSize="12">
                      No boss target timeline available
                    </text>
                  )}
                </svg>
              </div>
            </div>
          ) : (
            <div style={{
              minHeight: 280,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: text.muted,
              padding: space[5],
            }}>
              <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: space[2] }}>
                <div style={{ color: text.secondary, fontWeight: fontWeight.semibold }}>
                  Threat event data is not available in this imported report yet.
                </div>
                <div style={{ fontSize: fontSize.sm }}>
                  Import `threatByFight` for this report to populate enemy threat tables and raider lines for the selected boss encounter.
                </div>
              </div>
            </div>
          )}
        </div>
        {displaySelectedRaider ? (
          <div style={{ marginTop: space[4], display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: space[4] }}>
            <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
              <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.base, fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${border.subtle}` }}>
                Threat by Ability
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 108px 92px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, fontSize: fontSize.xs, color: text.muted, borderBottom: `1px solid ${border.subtle}`, background: `${surface.base}cc` }}>
                <div>Ability</div>
                <div style={{ textAlign: "right" }}>Threat</div>
                <div style={{ textAlign: "right" }}>TPS</div>
              </div>
              {abilityRows.length ? abilityRows.map((row, index) => (
                <div
                  key={`${displaySelectedRaider.playerId}-${row.label}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 108px 92px",
                    gap: space[2],
                    padding: `${space[2]}px ${space[3]}px`,
                    borderBottom: `1px solid ${border.subtle}`,
                    fontSize: fontSize.sm,
                    background: index % 2 === 0 ? "transparent" : `${surface.base}80`,
                  }}
                >
                  <div style={{ color: text.primary, overflowWrap: "anywhere", fontWeight: fontWeight.medium }}>{row.label}</div>
                  <div style={{ textAlign: "right", color: text.secondary, fontVariantNumeric: "tabular-nums" }}>{formatThreatMetric(row.threat)}</div>
                  <div style={{ textAlign: "right", color: text.secondary, fontVariantNumeric: "tabular-nums" }}>{formatThreatMetric(row.tps)}</div>
                </div>
              )) : (
                <div style={{ padding: `${space[3]}px ${space[3]}px`, color: text.muted, fontSize: fontSize.sm }}>
                  No threat ability totals available for this raider.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 108px 92px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, background: "rgba(248,250,252,0.96)", color: "#111827" }}>
                <div>Total</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatThreatMetric(abilityTotalThreat)}</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatThreatMetric(abilityTotalTps)}</div>
              </div>
            </div>

            <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
              <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.base, fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${border.subtle}` }}>
                Buff Inference
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 132px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, fontSize: fontSize.xs, color: text.muted, borderBottom: `1px solid ${border.subtle}`, background: `${surface.base}cc` }}>
                <div>Buff</div>
                <div>State</div>
              </div>
              {(displaySelectedRaider.inferredBuffs || []).length ? (displaySelectedRaider.inferredBuffs || []).map((row, index) => {
                const key = row.buffId || row.label;
                return (
                  <div
                    key={`${displaySelectedRaider.playerId}-${key}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 132px",
                      gap: space[2],
                      padding: `${space[2]}px ${space[3]}px`,
                      borderBottom: `1px solid ${border.subtle}`,
                      alignItems: "center",
                      background: index % 2 === 0 ? "transparent" : `${surface.base}80`,
                    }}
                  >
                    <div style={{ color: text.primary, fontSize: fontSize.sm, overflowWrap: "anywhere", fontWeight: fontWeight.medium }}>{row.label}</div>
                    <select
                      value={normalizeBuffState(buffStates[key] || row.state)}
                      onChange={event => setBuffStates(current => ({ ...current, [key]: normalizeBuffState(event.target.value) }))}
                      style={{ ...inputStyle, minHeight: 30 }}
                    >
                      <option value="Inferred on">Inferred on</option>
                      <option value="On">On</option>
                      <option value="Off">Off</option>
                      <option value="Inferred off">Inferred off</option>
                    </select>
                  </div>
                );
              }) : (
                <div style={{ padding: `${space[3]}px ${space[3]}px`, color: text.muted, fontSize: fontSize.sm }}>
                  No buff inference rows available for this raider.
                </div>
              )}
            </div>

            <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
              <div style={{ padding: `${space[2]}px ${space[3]}px`, background: surface.base, fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${border.subtle}` }}>
                Talent Inference
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, fontSize: fontSize.xs, color: text.muted, borderBottom: `1px solid ${border.subtle}`, background: `${surface.base}cc` }}>
                <div>Talent</div>
                <div>Rank</div>
              </div>
              {(displaySelectedRaider.inferredTalents || []).length ? (displaySelectedRaider.inferredTalents || []).map((row, index) => (
                <div
                  key={`${displaySelectedRaider.playerId}-${row.label}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 90px",
                    gap: space[2],
                    padding: `${space[2]}px ${space[3]}px`,
                    borderBottom: `1px solid ${border.subtle}`,
                    alignItems: "center",
                    background: index % 2 === 0 ? "transparent" : `${surface.base}80`,
                  }}
                >
                  <div style={{ color: text.primary, fontSize: fontSize.sm, overflowWrap: "anywhere", fontWeight: fontWeight.medium }}>{row.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min="0"
                      max={String(coerceNumber(row.maxRank, 0))}
                      value={String(talentRanks[row.label] ?? row.rank ?? 0)}
                      onChange={event => {
                        const nextValue = Math.max(0, Math.min(coerceNumber(row.maxRank, 0), coerceNumber(event.target.value, 0)));
                        setTalentRanks(current => ({ ...current, [row.label]: nextValue }));
                      }}
                      style={{ ...inputStyle, minHeight: 30, width: 52 }}
                    />
                    <span style={{ color: text.muted, fontSize: fontSize.sm }}>/ {coerceNumber(row.maxRank, 0)}</span>
                  </div>
                </div>
              )) : (
                <div style={{ padding: `${space[3]}px ${space[3]}px`, color: text.muted, fontSize: fontSize.sm }}>
                  No talent inference rows available for this raider.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {hoveredTooltip ? (
        <div
          style={{
            position: "fixed",
            left: hoveredTooltip.x,
            top: hoveredTooltip.y,
            pointerEvents: "none",
            zIndex: 5,
            background: "rgba(2,6,23,0.96)",
            border: `1px solid ${border.subtle}`,
            borderRadius: radius.base,
            padding: `${space[2]}px ${space[3]}px`,
            boxShadow: "0 12px 24px rgba(0,0,0,0.28)",
            minWidth: 160,
          }}
        >
          <div style={{ color: text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
            {hoveredTooltip.title}
          </div>
          {hoveredTooltip.lines.map(line => (
            <div key={line} style={{ color: text.muted, fontSize: fontSize.xs, marginTop: 2, whiteSpace: "nowrap" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThreatPlayersPanel({ players, hiddenPlayerIds, setHiddenPlayerIds, selectedRaiderId, setSelectedRaiderId }) {
  function togglePlayer(playerId) {
    setHiddenPlayerIds(current => {
      const next = new Set(current);
      if (next.has(String(playerId))) next.delete(String(playerId));
      else next.add(String(playerId));
      return next;
    });
  }

  return (
    <div style={{ ...panelStyle, minWidth: 0, overflow: "hidden" }}>
      <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, display: "flex", justifyContent: "space-between", gap: space[2], flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Raiders
          </div>
          <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
            Show or hide individual threat lines.
          </div>
        </div>
        <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
          <button onClick={() => setHiddenPlayerIds(new Set())} style={{ ...btnStyle("default"), height: 28 }}>
            Show All
          </button>
          <button onClick={() => setHiddenPlayerIds(new Set(players.map(player => String(player.playerId))))} style={{ ...btnStyle("default"), height: 28 }}>
            Hide All
          </button>
        </div>
      </div>
      <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[2], maxHeight: 360, overflowY: "auto" }}>
        {players.map(player => {
          const hidden = hiddenPlayerIds.has(String(player.playerId));
          const selected = String(selectedRaiderId) === String(player.playerId);
          return (
            <div
              key={player.playerId}
              onClick={() => togglePlayer(player.playerId)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  togglePlayer(player.playerId);
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                border: `1px solid ${selected ? accent.blue : border.subtle}`,
                borderRadius: radius.base,
                background: selected ? `${accent.blue}10` : surface.base,
                padding: space[3],
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: space[3],
                color: text.primary,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
                <span
                  onClick={event => {
                    event.stopPropagation();
                  setSelectedRaiderId(String(player.playerId));
                }}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectedRaiderId(String(player.playerId));
                  }
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, cursor: "pointer" }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: player.color, opacity: hidden ? 0.35 : 1, flexShrink: 0 }} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {player.name}{player.initialCoefficient != null ? ` ${formatThreatCoefficient(player.initialCoefficient)}` : ""}
                </span>
              </span>
              <span style={{ fontSize: fontSize.xs, color: text.muted }}>
                {hidden ? "Hidden" : "Visible"}
              </span>
            </div>
          );
        })}
      </div>
      <ThreatModifiersPanel players={players} selectedRaiderId={selectedRaiderId} />
    </div>
  );
}

function ThreatModifiersPanel({ players, selectedRaiderId }) {
  return null;
}

export default function RpbThreatGraphTab({
  selectedRaid,
  selectedFightId,
  setSelectedFightId,
  encounterSelectionOptions,
  filteredFights,
  isMobileViewport,
  underDevelopmentBadgeStyle,
}) {
  const bossFightOptions = useMemo(() => (
    (encounterSelectionOptions || []).filter(option => isConcreteEncounterOption(option))
  ), [encounterSelectionOptions]);

  const activeBossFightId = useMemo(() => {
    if (bossFightOptions.some(option => String(option.id) === String(selectedFightId))) {
      return String(selectedFightId);
    }
    return String(bossFightOptions[0]?.id || "");
  }, [bossFightOptions, selectedFightId]);

  useEffect(() => {
    if (!activeBossFightId) return;
    if (String(selectedFightId) === String(activeBossFightId)) return;
    setSelectedFightId(activeBossFightId);
  }, [activeBossFightId, selectedFightId, setSelectedFightId]);

  const selectedFight = useMemo(() => (
    (filteredFights || []).find(fight => String(fight.id) === String(activeBossFightId))
    || (selectedRaid?.fights || []).find(fight => String(fight.id) === String(activeBossFightId))
    || null
  ), [activeBossFightId, filteredFights, selectedRaid]);

  const threatSnapshot = useMemo(() => {
    const snapshots = selectedRaid?.importPayload?.threatByFight?.snapshots || [];
    return snapshots.find(snapshot => String(snapshot?.fightId || "") === String(activeBossFightId)) || null;
  }, [activeBossFightId, selectedRaid]);

  const enemyOptions = useMemo(() => (
    (threatSnapshot?.enemies || []).map(enemy => ({
      enemyKey: String(enemy.enemyKey || enemy.enemyId || enemy.name || ""),
      name: enemy.name || "Unknown Enemy",
    }))
  ), [threatSnapshot]);

  const [selectedEnemyKey, setSelectedEnemyKey] = useState("");
  useEffect(() => {
    if (!enemyOptions.length) {
      setSelectedEnemyKey("");
      return;
    }
    if (enemyOptions.some(enemy => enemy.enemyKey === selectedEnemyKey)) return;
    setSelectedEnemyKey(enemyOptions[0].enemyKey);
  }, [enemyOptions, selectedEnemyKey]);

  const selectedEnemy = useMemo(() => (
    (threatSnapshot?.enemies || []).find(enemy => String(enemy.enemyKey || enemy.enemyId || "") === String(selectedEnemyKey))
    || threatSnapshot?.enemies?.[0]
    || null
  ), [selectedEnemyKey, threatSnapshot]);

  const players = useMemo(() => (
    normalizeThreatPlayers(selectedEnemy, selectedRaid?.players || [], selectedFight)
  ), [selectedEnemy, selectedFight, selectedRaid]);
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState(() => new Set());
  const [selectedRaiderId, setSelectedRaiderId] = useState("");
  const selectedRaider = useMemo(() => (
    players.find(player => String(player.playerId) === String(selectedRaiderId)) || players[0] || null
  ), [players, selectedRaiderId]);
  const encounterDurationMs = useMemo(() => {
    const snapshotDuration = Math.max(
      0,
      coerceNumber(threatSnapshot?.end, 0) - coerceNumber(threatSnapshot?.start, 0),
    );
    if (snapshotDuration > 0) return snapshotDuration;
    return selectedFight ? Math.max(
      0,
      coerceNumber(selectedFight.end_time ?? selectedFight.end, 0) - coerceNumber(selectedFight.start_time ?? selectedFight.start, 0),
    ) : 0;
  }, [selectedFight, threatSnapshot]);

  const raiderOptions = useMemo(() => (
    players.map(player => ({
      playerId: String(player.playerId),
      name: player.name,
      label: `${player.name}${player.initialCoefficient != null ? ` ${formatThreatCoefficient(player.initialCoefficient)}` : ""}`,
    }))
  ), [players]);

  useEffect(() => {
    setHiddenPlayerIds(new Set());
  }, [activeBossFightId, selectedEnemyKey]);

  useEffect(() => {
    if (!raiderOptions.length) {
      setSelectedRaiderId("");
      return;
    }
    if (raiderOptions.some(option => option.playerId === selectedRaiderId)) return;
    setSelectedRaiderId(raiderOptions[0].playerId);
  }, [raiderOptions, selectedRaiderId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobileViewport ? "minmax(0, 1fr)" : "minmax(0, 1.2fr) minmax(280px, 0.52fr)", gap: space[4], minWidth: 0, alignItems: "start" }}>
      <ThreatChart
        players={players}
        hiddenPlayerIds={hiddenPlayerIds}
        targetHistory={selectedEnemy?.targetHistory || []}
        enemyOptions={enemyOptions}
        selectedEnemyKey={selectedEnemyKey}
        onSelectEnemy={setSelectedEnemyKey}
        raiderOptions={raiderOptions}
        selectedRaiderId={selectedRaiderId}
        onSelectRaider={setSelectedRaiderId}
        selectedRaider={selectedRaider}
        fightDurationMs={encounterDurationMs}
        underDevelopmentBadgeStyle={underDevelopmentBadgeStyle}
      />
      <ThreatPlayersPanel
        players={players}
        hiddenPlayerIds={hiddenPlayerIds}
        setHiddenPlayerIds={setHiddenPlayerIds}
        selectedRaiderId={selectedRaiderId}
        setSelectedRaiderId={setSelectedRaiderId}
      />
    </div>
  );
}

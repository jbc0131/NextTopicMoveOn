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
      const modifiers = Array.isArray(player.modifiers) ? player.modifiers : [];
      const initialCoefficient = (() => {
        const row = modifiers.find(entry => String(entry?.label || "").toLowerCase() === "initial coefficient");
        const parsed = Number(row?.value);
        return Number.isFinite(parsed) ? parsed : null;
      })();

      return {
        playerId: String(player.playerId || player.id || raidPlayer?.id || player.name || index),
        name: player.name || raidPlayer?.name || "Unknown Player",
        type: player.type || raidPlayer?.type || "",
        color: player.color || getClassColor(player.type || raidPlayer?.type, index),
        series: normalizedSeries,
        highestThreat,
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

function getBossTargetAtTime(targetHistory = [], timeMs = 0) {
  let current = null;
  for (const entry of targetHistory) {
    if (coerceNumber(entry.timeMs, 0) <= coerceNumber(timeMs, 0)) current = entry;
    else break;
  }
  return current;
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
  const visiblePlayers = players.filter(player => !hiddenPlayerIds.has(String(player.playerId)));
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
  const [hoveredTooltip, setHoveredTooltip] = useState(null);

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
        {selectedRaider ? (
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Assumed Threat Buffs
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: space[2] }}>
              {(selectedRaider.modifiers || []).length ? selectedRaider.modifiers.map(row => (
                <div
                  key={`${selectedRaider.playerId}-${row.label}`}
                  style={{
                    border: `1px solid ${border.subtle}`,
                    borderRadius: radius.base,
                    background: surface.base,
                    padding: `${space[1]}px ${space[2]}px`,
                    display: "inline-flex",
                    gap: 6,
                    fontSize: fontSize.xs,
                    color: text.muted,
                  }}
                >
                  <span style={{ color: text.primary }}>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              )) : (
                <div style={{ fontSize: fontSize.xs, color: text.muted }}>
                  No assumed buff data available for the selected raider.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ padding: space[4] }}>
        <div style={{
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.base,
          background: "linear-gradient(180deg, rgba(9, 17, 27, 0.96) 0%, rgba(6, 12, 19, 0.98) 100%)",
          padding: space[3],
        }}>
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
                      const bossTarget = getBossTargetAtTime(targetHistory, point.timeMs);
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
Boss Target: ${bossTarget?.name || "Unknown"}`}</title>
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
                    const player = players.find(entry => String(entry.playerId) === String(segment.playerId));
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
        fightDurationMs={selectedFight ? Math.max(0, coerceNumber(selectedFight.end_time ?? selectedFight.end, 0) - coerceNumber(selectedFight.start_time ?? selectedFight.start, 0)) : 0}
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

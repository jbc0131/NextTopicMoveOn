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
      const highestThreat = series.reduce((max, point) => Math.max(max, point.threat), 0);

      return {
        playerId: String(player.playerId || player.id || raidPlayer?.id || player.name || index),
        name: player.name || raidPlayer?.name || "Unknown Player",
        type: player.type || raidPlayer?.type || "",
        color: player.color || getClassColor(player.type || raidPlayer?.type, index),
        series,
        highestThreat,
        modifiers: Array.isArray(player.modifiers) ? player.modifiers : [],
      };
    }).sort((left, right) => right.highestThreat - left.highestThreat || left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
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
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
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

function buildLeaderAnnotations(players = []) {
  const leader = players[0] || null;
  if (!leader || !Array.isArray(leader.series) || leader.series.length < 2) return [];

  let maxPoint = leader.series[0];
  let biggestGain = null;

  for (let index = 1; index < leader.series.length; index += 1) {
    const current = leader.series[index];
    const previous = leader.series[index - 1];
    if (coerceNumber(current.threat, 0) >= coerceNumber(maxPoint.threat, 0)) {
      maxPoint = current;
    }
    const delta = coerceNumber(current.threat, 0) - coerceNumber(previous.threat, 0);
    if (delta <= 0) continue;
    if (!biggestGain || delta > biggestGain.delta) {
      biggestGain = {
        point: current,
        delta,
      };
    }
  }

  const annotations = [];
  if (biggestGain && biggestGain.delta >= 100) {
    annotations.push({
      key: "big-gain",
      point: biggestGain.point,
      title: `${leader.name} spike +${Math.round(biggestGain.delta).toLocaleString()} threat`,
      badge: "Gain",
    });
  }
  annotations.push({
    key: "peak-threat",
    point: maxPoint,
    title: `${leader.name} peak ${Math.round(coerceNumber(maxPoint.threat, 0)).toLocaleString()} threat`,
    badge: "Lead",
  });

  return annotations;
}

function ThreatChart({
  players,
  hiddenPlayerIds,
  fightDurationMs,
  enemyOptions,
  selectedEnemyKey,
  onSelectEnemy,
  raiderOptions,
  selectedRaiderId,
  onSelectRaider,
  underDevelopmentBadgeStyle,
}) {
  const width = 920;
  const height = 360;
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
  const annotations = hasGraphData ? buildLeaderAnnotations(visiblePlayers) : [];

  return (
    <div style={{ ...panelStyle, overflow: "hidden" }}>
      <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, display: "flex", flexDirection: "column", gap: space[3] }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: space[3], alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Threat Timeline
            </div>
            <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
              {hasGraphData
                ? `Showing ${visiblePlayers.length} visible raider line${visiblePlayers.length === 1 ? "" : "s"}`
                : "Threat series data will render here once imported."}
            </div>
          </div>
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
                  {option.name}
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
        <div style={{ fontSize: fontSize.xs, color: text.muted }}>
          {fightDurationMs > 0 ? `Fight length ${formatSecondsFromMs(fightDurationMs)}` : "Awaiting a boss-fight snapshot"}
        </div>
      </div>

      <div style={{ padding: space[4] }}>
        <div style={{
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.base,
          background: "linear-gradient(180deg, rgba(9, 17, 27, 0.96) 0%, rgba(6, 12, 19, 0.98) 100%)",
          padding: space[3],
        }}>
          {hasGraphData ? (
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
              {visiblePlayers.map(player => (
                <path
                  key={player.playerId}
                  d={buildThreatChartPath(player.series, width, height, maxTimeMs, maxThreat)}
                  fill="none"
                  stroke={player.color}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                >
                  <title>{player.name}</title>
                </path>
              ))}
              {annotations.map(annotation => {
                const position = getChartPoint(annotation.point, width, height, maxTimeMs, maxThreat);
                return (
                  <g key={annotation.key}>
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r="6"
                      fill="#facc15"
                      stroke="rgba(15,23,42,0.95)"
                      strokeWidth="2"
                    />
                    <title>{annotation.title}</title>
                    <rect
                      x={Math.max(8, Math.min(width - 92, position.x + 10))}
                      y={Math.max(10, position.y - 28)}
                      width="58"
                      height="20"
                      rx="10"
                      fill="rgba(250,204,21,0.18)"
                      stroke="rgba(250,204,21,0.7)"
                    />
                    <text
                      x={Math.max(18, Math.min(width - 82, position.x + 20))}
                      y={Math.max(24, position.y - 14)}
                      fill="#fde68a"
                      fontSize="12"
                      fontWeight="700"
                    >
                      {annotation.badge}
                    </text>
                  </g>
                );
              })}
            </svg>
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
              style={{
                border: `1px solid ${selected ? accent.blue : border.subtle}`,
                borderRadius: radius.base,
                background: selected ? `${accent.blue}10` : surface.base,
                padding: space[3],
                display: "flex",
                flexDirection: "column",
                gap: space[2],
              }}
            >
              <button
                onClick={() => setSelectedRaiderId(String(player.playerId))}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: text.primary,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: space[3],
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: player.color, opacity: hidden ? 0.35 : 1, flexShrink: 0 }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name}</span>
                </span>
                <span style={{ fontSize: fontSize.xs, color: text.muted }}>
                  {selected ? "Selected" : "Select"}
                </span>
              </button>
              <button
                onClick={() => togglePlayer(player.playerId)}
                style={{ ...btnStyle(hidden ? "default" : "primary", !hidden), height: 28, justifyContent: "center" }}
              >
                {hidden ? "Show Line" : "Hide Line"}
              </button>
            </div>
          );
        })}
      </div>
      <ThreatModifiersPanel players={players} selectedRaiderId={selectedRaiderId} />
    </div>
  );
}

function ThreatModifiersPanel({ players, selectedRaiderId }) {
  const selectedPlayer = players.find(player => String(player.playerId) === String(selectedRaiderId)) || players[0] || null;
  const modifiers = Array.isArray(selectedPlayer?.modifiers) ? selectedPlayer.modifiers : [];

  return (
    <div style={{ borderTop: `1px solid ${border.subtle}`, padding: space[4], display: "flex", flexDirection: "column", gap: space[2] }}>
      <div>
        <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Assumed Buffs
        </div>
        <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
          {selectedPlayer ? `Threat assumptions for ${selectedPlayer.name}` : "Select a raider to inspect threat assumptions."}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: space[2], maxHeight: 220, overflowY: "auto" }}>
        {modifiers.length ? modifiers.map(row => (
          <div
            key={`${selectedPlayer?.playerId || "none"}-${row.label}`}
            style={{
              border: `1px solid ${border.subtle}`,
              borderRadius: radius.base,
              background: surface.base,
              padding: `${space[2]}px ${space[3]}px`,
              display: "flex",
              justifyContent: "space-between",
              gap: space[3],
            }}
          >
            <span style={{ color: text.primary }}>{row.label}</span>
            <span style={{ color: text.muted, whiteSpace: "nowrap" }}>{row.value}</span>
          </div>
        )) : (
          <div style={{ color: text.muted, fontSize: fontSize.sm }}>
            No assumed buff or modifier data is available for the selected raider yet.
          </div>
        )}
      </div>
    </div>
  );
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

  const raiderOptions = useMemo(() => (
    players.map(player => ({
      playerId: String(player.playerId),
      name: player.name,
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
        enemyOptions={enemyOptions}
        selectedEnemyKey={selectedEnemyKey}
        onSelectEnemy={setSelectedEnemyKey}
        raiderOptions={raiderOptions}
        selectedRaiderId={selectedRaiderId}
        onSelectRaider={setSelectedRaiderId}
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

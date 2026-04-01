import { useEffect, useMemo, useState } from "react";
import {
  surface, border, text, accent, intent, fontSize, fontWeight, radius, space, btnStyle, panelStyle,
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

function formatThreatNumber(value) {
  const numeric = coerceNumber(value, 0);
  return Math.round(numeric).toLocaleString();
}

function formatThreatRate(value) {
  const numeric = coerceNumber(value, 0);
  return `${numeric.toFixed(1)}/s`;
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

function normalizeAbilityRow(entry = {}) {
  const label = String(entry.label || entry.name || entry.ability || entry.text || "Unknown");
  const threat = coerceNumber(entry.threat ?? entry.total ?? entry.value, 0);
  const tps = coerceNumber(entry.tps ?? entry.perSecond ?? entry.threatPerSecond, 0);
  return { label, threat, tps };
}

function normalizeModifierRow(entry = {}) {
  return {
    label: String(entry.label || entry.name || entry.buff || "Unknown Modifier"),
    value: String(entry.value || entry.state || entry.coefficient || entry.multiplier || "Assumed"),
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
      const abilities = Array.isArray(player.abilities)
        ? player.abilities.map(normalizeAbilityRow)
        : Object.entries(player.threatBySkill || {}).map(([label, threat]) => normalizeAbilityRow({ label, threat }));
      const modifiers = Array.isArray(player.modifiers)
        ? player.modifiers.map(normalizeModifierRow)
        : (Array.isArray(player.assumedModifiers) ? player.assumedModifiers.map(normalizeModifierRow) : []);
      const highestThreat = series.reduce((max, point) => Math.max(max, point.threat), 0);

      return {
        playerId: String(player.playerId || player.id || raidPlayer?.id || player.name || index),
        name: player.name || raidPlayer?.name || "Unknown Player",
        type: player.type || raidPlayer?.type || "",
        color: player.color || getClassColor(player.type || raidPlayer?.type, index),
        series,
        abilities: abilities.sort((left, right) => right.threat - left.threat),
        modifiers,
        highestThreat,
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
      abilities: [],
      modifiers: [],
      highestThreat: 0,
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

function ThreatChart({ players, hiddenPlayerIds, fightDurationMs }) {
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

  return (
    <div style={{ ...panelStyle, overflow: "hidden" }}>
      <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, display: "flex", justifyContent: "space-between", gap: space[3], flexWrap: "wrap" }}>
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
        <div style={{ fontSize: fontSize.xs, color: text.muted, alignSelf: "flex-start" }}>
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
                />
              ))}
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
                  The tab shell, boss selection, and raider controls are live. The threat engine payload can slot into `importPayload.threatByFight` without changing this UI structure.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreatSidePanel({
  players,
  hiddenPlayerIds,
  setHiddenPlayerIds,
  selectedPlayerId,
  setSelectedPlayerId,
  snapshotLoaded,
}) {
  const selectedPlayer = players.find(player => String(player.playerId) === String(selectedPlayerId)) || players[0] || null;

  function togglePlayerVisibility(playerId) {
    setHiddenPlayerIds(current => {
      const next = new Set(current);
      if (next.has(String(playerId))) {
        next.delete(String(playerId));
      } else {
        next.add(String(playerId));
      }
      return next;
    });
  }

  return (
    <div style={{ ...panelStyle, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, display: "flex", justifyContent: "space-between", gap: space[2], flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Threat Controls
          </div>
          <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
            Toggle raider lines and inspect per-player threat tables.
          </div>
        </div>
        <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
          <button onClick={() => setHiddenPlayerIds(new Set())} style={{ ...btnStyle("default"), height: 28 }}>
            Show All
          </button>
          <button
            onClick={() => setHiddenPlayerIds(new Set(players.map(player => String(player.playerId))))}
            style={{ ...btnStyle("default"), height: 28 }}
          >
            Hide All
          </button>
        </div>
      </div>

      <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[4], overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Raiders
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {players.map(player => {
              const hidden = hiddenPlayerIds.has(String(player.playerId));
              const active = String(selectedPlayer?.playerId || "") === String(player.playerId);
              return (
                <div
                  key={player.playerId}
                  onClick={() => setSelectedPlayerId(String(player.playerId))}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedPlayerId(String(player.playerId));
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    border: `1px solid ${active ? accent.blue : border.subtle}`,
                    borderRadius: radius.base,
                    background: active ? `${accent.blue}10` : surface.card,
                    padding: space[3],
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: space[2], alignItems: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: player.color, flexShrink: 0, opacity: hidden ? 0.3 : 1 }} />
                      <span style={{ color: player.color, fontWeight: fontWeight.semibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {player.name}
                      </span>
                    </span>
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        togglePlayerVisibility(player.playerId);
                      }}
                      style={{ ...btnStyle(hidden ? "default" : "primary", !hidden), height: 24, minWidth: 62, padding: `0 ${space[2]}px` }}
                    >
                      {hidden ? "Show" : "Hide"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {selectedPlayer ? `${selectedPlayer.name} Abilities` : "Abilities"}
          </div>
          <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) 96px 96px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, background: surface.base, color: text.muted, fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div>Ability</div>
              <div style={{ textAlign: "right" }}>Threat</div>
              <div style={{ textAlign: "right" }}>TPS</div>
            </div>
            {(selectedPlayer?.abilities || []).length > 0 ? (
              selectedPlayer.abilities.slice(0, 12).map(row => (
                <div key={`${selectedPlayer.playerId}-${row.label}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) 96px 96px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderTop: `1px solid ${border.subtle}`, fontSize: fontSize.sm }}>
                  <div style={{ color: text.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.label}</div>
                  <div style={{ textAlign: "right", color: text.secondary }}>{formatThreatNumber(row.threat)}</div>
                  <div style={{ textAlign: "right", color: text.secondary }}>{formatThreatRate(row.tps)}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: space[3], borderTop: `1px solid ${border.subtle}`, color: text.muted, fontSize: fontSize.sm }}>
                {snapshotLoaded
                  ? "No ability threat table is available for the selected raider."
                  : "Ability threat rows will appear here once threat snapshots are imported."}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Assumed Threat Modifiers
          </div>
          <div style={{ border: `1px solid ${border.subtle}`, borderRadius: radius.base, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, background: surface.base, color: text.muted, fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div>Modifier</div>
              <div style={{ textAlign: "right" }}>Value</div>
            </div>
            {(selectedPlayer?.modifiers || []).length > 0 ? (
              selectedPlayer.modifiers.map(row => (
                <div key={`${selectedPlayer.playerId}-${row.label}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px", gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderTop: `1px solid ${border.subtle}`, fontSize: fontSize.sm }}>
                  <div style={{ color: text.primary }}>{row.label}</div>
                  <div style={{ textAlign: "right", color: text.secondary }}>{row.value}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: space[3], borderTop: `1px solid ${border.subtle}`, color: text.muted, fontSize: fontSize.sm }}>
                {snapshotLoaded
                  ? "No inferred threat modifiers are available for the selected raider."
                  : "The external threat engine’s inferred modifiers will be listed here."}
              </div>
            )}
          </div>
        </div>
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

  const players = useMemo(() => (
    normalizeThreatPlayers(threatSnapshot, selectedRaid?.players || [], selectedFight)
  ), [selectedFight, selectedRaid, threatSnapshot]);

  const [hiddenPlayerIds, setHiddenPlayerIds] = useState(() => new Set());
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    setHiddenPlayerIds(new Set());
  }, [activeBossFightId]);

  useEffect(() => {
    if (!players.length) {
      setSelectedPlayerId("");
      return;
    }
    if (players.some(player => String(player.playerId) === String(selectedPlayerId))) return;
    setSelectedPlayerId(String(players[0].playerId));
  }, [players, selectedPlayerId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobileViewport ? "minmax(0, 1fr)" : "minmax(0, 1.25fr) minmax(340px, 0.75fr)", gap: space[4], alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
        <div style={{ ...panelStyle, padding: space[4], display: "flex", flexDirection: "column", gap: space[3] }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: space[3], flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: fontSize.sm, color: text.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Threat Graph
              </div>
              <div style={{ fontSize: fontSize.xs, color: text.muted, marginTop: 4 }}>
                Single-boss selection only. This uses the current encounter slicers and locks the graph to one fight at a time.
              </div>
            </div>
            <div style={underDevelopmentBadgeStyle}>
              This tab is currently under development
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ fontSize: fontSize.xs, color: text.muted }}>
              Boss Fight
            </div>
            <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
              {bossFightOptions.length > 0 ? bossFightOptions.map(option => {
                const active = String(activeBossFightId) === String(option.id);
                const toneColor = option.kill ? intent.success : intent.danger;
                return (
                  <button
                    key={option.id}
                    onClick={() => setSelectedFightId(String(option.id))}
                    style={{
                      ...btnStyle("default", active),
                      height: 30,
                      background: active ? `${toneColor}26` : `${toneColor}14`,
                      borderColor: active ? toneColor : `${toneColor}66`,
                    }}
                  >
                    {option.label}
                  </button>
                );
              }) : (
                <div style={{ fontSize: fontSize.sm, color: text.muted }}>
                  No boss fights are available in the current filter set.
                </div>
              )}
            </div>
          </div>
        </div>

        <ThreatChart
          players={players}
          hiddenPlayerIds={hiddenPlayerIds}
          fightDurationMs={selectedFight ? Math.max(0, coerceNumber(selectedFight.end_time ?? selectedFight.end, 0) - coerceNumber(selectedFight.start_time ?? selectedFight.start, 0)) : 0}
        />
      </div>

      <ThreatSidePanel
        players={players}
        hiddenPlayerIds={hiddenPlayerIds}
        setHiddenPlayerIds={setHiddenPlayerIds}
        selectedPlayerId={selectedPlayerId}
        setSelectedPlayerId={setSelectedPlayerId}
        snapshotLoaded={Boolean(threatSnapshot)}
      />
    </div>
  );
}

export function getKillParseLeader(raid, role, entryKey) {
  const playersById = new Map(
    (raid?.players || []).map(player => [String(player?.id || ""), player])
  );
  const grouped = new Map();

  for (const fight of raid?.fights || []) {
    if (!fight?.kill || !(Number(fight?.encounterId) > 0)) continue;

    for (const entry of fight?.[entryKey] || []) {
      const parsePercent = Number(entry?.parsePercent);
      if (!(Number.isFinite(parsePercent) && parsePercent > 0)) continue;

      const player = playersById.get(String(entry?.id || ""));
      if (!player || player?.role !== role) continue;

      const key = String(player.id);
      const existing = grouped.get(key) || {
        id: key,
        name: String(player?.name || entry?.name || "").trim(),
        type: player?.type || entry?.type || "",
        role: player?.role || "",
        totalParse: 0,
        count: 0,
        bestParse: 0,
      };

      existing.totalParse += parsePercent;
      existing.count += 1;
      existing.bestParse = Math.max(existing.bestParse, parsePercent);
      grouped.set(key, existing);
    }
  }

  const candidates = [...grouped.values()].map(player => ({
    ...player,
    parsePercent: player.count > 0 ? (player.totalParse / player.count) : null,
  })).filter(player => Number.isFinite(Number(player.parsePercent)) && Number(player.parsePercent) > 0);

  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => {
    const parseDiff = Number(right?.parsePercent || 0) - Number(left?.parsePercent || 0);
    if (parseDiff !== 0) return parseDiff;
    const bestDiff = Number(right?.bestParse || 0) - Number(left?.bestParse || 0);
    if (bestDiff !== 0) return bestDiff;
    return String(left?.name || "").localeCompare(String(right?.name || ""), "en", { sensitivity: "base" });
  })[0];
}

export function getRaidCardLeaders(raid) {
  return {
    topDpsLeader: getKillParseLeader(raid, "DPS", "damageDoneEntries"),
    topHealerLeader: getKillParseLeader(raid, "Healer", "healingDoneEntries"),
  };
}

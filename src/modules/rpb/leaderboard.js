function getRoleParseField(role) {
  return role === "Healer" ? "healingParsePercent" : "damageParsePercent";
}

function getOverallParseLeader(raid, role) {
  const parseField = getRoleParseField(role);
  const candidates = (raid?.players || [])
    .filter(player => player?.role === role)
    .map(player => ({
      id: String(player?.id || ""),
      name: String(player?.name || "").trim(),
      type: player?.type || "",
      role: player?.role || "",
      parsePercent: Number(player?.[parseField]),
    }))
    .filter(player => player.name && Number.isFinite(player.parsePercent) && player.parsePercent >= 0);

  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => {
    const parseDiff = Number(right?.parsePercent || 0) - Number(left?.parsePercent || 0);
    if (parseDiff !== 0) return parseDiff;
    return String(left?.name || "").localeCompare(String(right?.name || ""), "en", { sensitivity: "base" });
  })[0];
}

export function getRaidCardLeaders(raid) {
  return {
    topDpsLeader: getOverallParseLeader(raid, "DPS"),
    topHealerLeader: getOverallParseLeader(raid, "Healer"),
  };
}

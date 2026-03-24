export const TEAM_TITLE_META = {
  "Team Dick": { emoji: "🍆", name: "Team Dick" },
  "Team Balls": { emoji: "🍒", name: "Team Balls" },
};

export function normalizeReportTeamTag(value) {
  const normalized = String(value || "").trim();
  return TEAM_TITLE_META[normalized] ? normalized : "";
}

export function formatReportDateForTitle(value) {
  if (!value) return "Unknown Date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown Date";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

export function buildAutoReportTitle({ start, teamTag }) {
  const normalizedTeamTag = normalizeReportTeamTag(teamTag);
  const teamMeta = TEAM_TITLE_META[normalizedTeamTag];
  const dateLabel = formatReportDateForTitle(start);

  if (!teamMeta) return `${dateLabel} - Unassigned`;
  return `${dateLabel} - ${teamMeta.emoji} ${teamMeta.name}`;
}

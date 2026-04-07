import fs from "fs";

function readEnv() {
  const path = ".env";
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\n/)
      .filter(Boolean)
      .filter(line => !line.startsWith("#") && line.includes("="))
      .map(line => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

function getArg(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getRankingPercentile(node) {
  const candidates = [
    node?.rankPercent,
    node?.rank?.rankPercent,
    node?.ranks?.rankPercent,
    node?.percentile,
    node?.rank?.percentile,
    node?.ranks?.percentile,
    node?.ranks?.rank?.percentile,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;
  }

  return null;
}

function collectRankingRows(node, rows = []) {
  if (!node) return rows;

  if (Array.isArray(node)) {
    node.forEach(entry => collectRankingRows(entry, rows));
    return rows;
  }

  if (typeof node !== "object") return rows;

  const id = node?.id ?? node?.playerID ?? node?.playerId ?? node?.sourceID ?? node?.sourceId ?? null;
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  const percentile = getRankingPercentile(node);

  if (name && percentile != null) {
    rows.push({ id: id != null ? String(id) : "", name, percentile });
  }

  Object.values(node).forEach(value => {
    if (value && typeof value === "object") {
      collectRankingRows(value, rows);
    }
  });

  return rows;
}

async function redisGetJson(redisUrl, redisToken, key) {
  const res = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["GET", key]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Redis ${res.status}: ${text}`);
  const payload = text ? JSON.parse(text) : null;
  return payload?.result ? JSON.parse(payload.result) : null;
}

async function main() {
  const env = readEnv();
  const report = getArg("--report");
  const player = getArg("--player");
  const v1Key = getArg("--api-key", env.WCL_API_KEY || "");
  const profileKey = getArg("--profile-key", "profile:238119543157948428");
  const dumpNames = getArg("--dump-names", "") === "true";

  if (!report) throw new Error("Missing --report <reportId>.");
  if (!player) throw new Error("Missing --player <playerName>.");
  if (!v1Key) throw new Error("Missing WCL v1 key.");
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error("Missing Upstash Redis env.");

  const profile = await redisGetJson(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, profileKey);
  if (!profile?.wclV2ClientId || !profile?.wclV2ClientSecret) {
    throw new Error(`Profile ${profileKey} does not have WCL v2 credentials.`);
  }

  const basic = Buffer.from(`${profile.wclV2ClientId}:${profile.wclV2ClientSecret}`).toString("base64");
  const tokenRes = await fetch("https://classic.warcraftlogs.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) throw new Error(`WCL token ${tokenRes.status}: ${tokenText}`);
  const token = JSON.parse(tokenText).access_token;

  const fightsRes = await fetch(`https://classic.warcraftlogs.com:443/v1/report/fights/${report}?api_key=${encodeURIComponent(v1Key)}`);
  const fightsText = await fightsRes.text();
  if (!fightsRes.ok) throw new Error(`WCL fights ${fightsRes.status}: ${fightsText}`);
  const fightsPayload = JSON.parse(fightsText);
  const encounterFights = (fightsPayload.fights || []).filter(fight =>
    (fight?.boss || 0) > 0 && Number(fight?.end_time || 0) > Number(fight?.start_time || 0)
  );

  const rankingFields = encounterFights
    .map(fight => `f${fight.id}: rankings(compare: Rankings, fightIDs: [${Number(fight.id)}], playerMetric: dps)`)
    .join("\n");

  const query = `{
    reportData {
      report(code: "${report}", allowUnlisted: true) {
        ${rankingFields}
      }
    }
  }`;

  const rankingsRes = await fetch("https://classic.warcraftlogs.com/api/v2/client", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const rankingsText = await rankingsRes.text();
  if (!rankingsRes.ok) throw new Error(`WCL rankings ${rankingsRes.status}: ${rankingsText}`);
  const reportData = JSON.parse(rankingsText)?.data?.reportData?.report || {};

  const perFight = encounterFights.map(fight => {
    const rows = collectRankingRows(reportData[`f${fight.id}`]);
    if (dumpNames) {
      return {
        fightId: String(fight.id),
        fightName: fight.name || "Unknown Fight",
        kill: Boolean(fight.kill),
        names: rows
          .sort((a, b) => b.percentile - a.percentile || a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
          .slice(0, 80),
      };
    }
    const match = rows
      .filter(row => String(row.name || "").toLowerCase() === String(player).toLowerCase())
      .sort((a, b) => b.percentile - a.percentile)[0] || null;

    return {
      fightId: String(fight.id),
      fightName: fight.name || "Unknown Fight",
      kill: Boolean(fight.kill),
      percentile: match?.percentile ?? null,
    };
  });

  if (dumpNames) {
    console.log(JSON.stringify({
      report,
      fights: perFight,
    }, null, 2));
    return;
  }

  const killRows = perFight.filter(row => row.kill && Number.isFinite(Number(row.percentile)));
  const rawAverage = killRows.length
    ? killRows.reduce((sum, row) => sum + Number(row.percentile), 0) / killRows.length
    : null;

  console.log(JSON.stringify({
    report,
    player,
    perFight,
    killAverageRaw: rawAverage,
    oldDisplayed: rawAverage == null ? null : Math.round(rawAverage),
    newDisplayed: rawAverage == null ? null : Math.floor(rawAverage),
  }, null, 2));
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});

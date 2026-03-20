import { assertRedisConfigured, buildCacheKey, getJsonCache, setJsonCache } from "../RPB/server/upstashRedis.js";

function getProfileKey(discordId) {
  return buildCacheKey("profile", [discordId]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    assertRedisConfigured();

    if (req.method === "GET") {
      const discordId = String(req.query?.discordId || "").trim();
      if (!discordId) return res.status(400).json({ error: "discordId is required" });

      const profile = await getJsonCache(getProfileKey(discordId));
      return res.status(200).json({ profile: profile || null });
    }

    if (req.method === "POST") {
      const discordId = String(req.body?.discordId || "").trim();
      if (!discordId) return res.status(400).json({ error: "discordId is required" });

      const profile = {
        discordId,
        mainCharacterName: req.body?.mainCharacterName || "",
        alts: Array.isArray(req.body?.alts) ? req.body.alts : [],
        wclV1ApiKey: req.body?.wclV1ApiKey || "",
        wclV2ClientId: req.body?.wclV2ClientId || "",
        wclV2ClientSecret: req.body?.wclV2ClientSecret || "",
        updatedAt: new Date().toISOString(),
      };

      const saved = await setJsonCache(getProfileKey(discordId), profile);
      if (!saved) throw new Error("Failed to write profile data to Redis.");
      return res.status(200).json({ persistence: "remote", profile });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Profile Redis store failed:", error);
    return res.status(500).json({ error: error.message || "Profile Redis store failed" });
  }
}

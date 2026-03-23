import { assertRedisConfigured, deleteKey, getJsonCache, setJsonCache } from "../RPB/server/upstashRedis.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const key = `rpb:health:${Date.now()}`;

  try {
    assertRedisConfigured();

    const writeOk = await setJsonCache(key, { ok: true, ts: Date.now() }, 60);
    const readValue = await getJsonCache(key);
    const deleteOk = await deleteKey(key);

    return res.status(200).json({
      configured: true,
      writeOk,
      readOk: !!readValue?.ok,
      deleteOk,
      readValue,
    });
  } catch (error) {
    return res.status(500).json({
      configured: false,
      error: error.message || "RPB Redis health check failed",
    });
  }
}

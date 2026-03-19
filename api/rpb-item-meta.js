import { fetchWowheadItemMetaBatch } from "../RPB/server/wowheadItemMeta.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ids = String(req.query?.ids || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    const data = await fetchWowheadItemMetaBatch(ids);
    return res.status(200).json({ items: data });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to resolve item metadata" });
  }
}

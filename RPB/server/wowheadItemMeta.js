import { buildCacheKey, getJsonCache, setJsonCache } from "./upstashRedis.js";

const WOWHEAD_ITEM_BASE = "https://www.wowhead.com/tbc/item=";
const ITEM_CACHE = new Map();
const ITEM_META_TTL_SECONDS = 60 * 60 * 24 * 7;

function decodeHtml(value = "") {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return "";
}

function extractQuality(html) {
  const patterns = [
    /"quality"\s*:\s*(\d+)/i,
    /"qualityId"\s*:\s*(\d+)/i,
    /class=["'][^"']*\bq([0-9])\b[^"']*["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] != null) {
      const quality = Number(match[1]);
      if (!Number.isNaN(quality)) return quality;
    }
  }

  return null;
}

async function fetchOneItemMeta(itemId) {
  const normalizedId = String(itemId || "").trim();
  if (!normalizedId) return null;
  if (ITEM_CACHE.has(normalizedId)) return ITEM_CACHE.get(normalizedId);

  const promise = (async () => {
    const cacheKey = buildCacheKey("wowhead:item-meta", [normalizedId]);
    const cached = await getJsonCache(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${WOWHEAD_ITEM_BASE}${normalizedId}`, {
      headers: {
        "user-agent": "Mozilla/5.0 Codex RPB",
      },
    });

    if (!response.ok) {
      throw new Error(`Wowhead item ${normalizedId} returned ${response.status}`);
    }

    const html = await response.text();
    const name = extractMatch(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i,
      /<title>([^<]+?)\s*-\s*Item/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
    ]);
    const icon = extractMatch(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"]+)["']/i,
      /"icon"\s*:\s*"([^"]+)"/i,
    ]);

    const result = {
      id: normalizedId,
      name,
      icon,
      quality: extractQuality(html),
    };
    await setJsonCache(cacheKey, result, ITEM_META_TTL_SECONDS);
    return result;
  })()
    .catch(() => ({
      id: normalizedId,
      name: "",
      icon: "",
      quality: null,
    }));

  ITEM_CACHE.set(normalizedId, promise);
  return promise;
}

export async function fetchWowheadItemMetaBatch(ids = []) {
  const uniqueIds = [...new Set((ids || []).map(id => String(id || "").trim()).filter(Boolean))];
  const entries = await Promise.all(uniqueIds.map(async id => [id, await fetchOneItemMeta(id)]));
  return Object.fromEntries(entries);
}

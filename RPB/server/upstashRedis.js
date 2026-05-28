import { gzipSync, gunzipSync } from "node:zlib";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const GZIP_PREFIX = "gz1:";
const GZIP_THRESHOLD_BYTES = 64 * 1024;

function canUseRedis() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

function maybeCompressJsonString(jsonString) {
  if (typeof jsonString !== "string" || jsonString.length < GZIP_THRESHOLD_BYTES) return jsonString;
  return GZIP_PREFIX + gzipSync(jsonString).toString("base64");
}

function maybeDecompressRedisValue(rawValue) {
  if (typeof rawValue !== "string") return rawValue;
  if (!rawValue.startsWith(GZIP_PREFIX)) return rawValue;
  const base64 = rawValue.slice(GZIP_PREFIX.length);
  return gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
}

function sanitizeKeyPart(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

async function upstashFetch(command, args = [], options = {}) {
  if (!canUseRedis()) return null;

  const path = [command, ...args].map(sanitizeKeyPart).join("/");
  const response = await fetch(`${REDIS_URL}/${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      ...(options.body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash ${response.status}: ${text}`);
  }

  return response.json();
}

async function upstashCommand(args = []) {
  if (!canUseRedis()) return null;

  const response = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash ${response.status}: ${text}`);
  }

  return response.json();
}

export async function getJsonCache(key) {
  if (!canUseRedis()) return null;

  try {
    const response = await upstashFetch("get", [key]);
    const raw = response?.result;
    if (!raw) return null;
    const json = maybeDecompressRedisValue(raw);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function setJsonCache(key, value, ttlSeconds) {
  if (!canUseRedis()) return false;

  try {
    const json = JSON.stringify(value);
    const payload = maybeCompressJsonString(json);
    const args = ["SET", key, payload];
    if (ttlSeconds > 0) args.push("EX", String(ttlSeconds));
    const response = await upstashCommand(args);
    if (response?.result !== "OK") throw new Error("Unexpected Upstash SET result");
    return true;
  } catch (error) {
    console.warn("Upstash setJsonCache failed", {
      key,
      message: error?.message || String(error || ""),
    });
    return false;
  }
}

export async function deleteKey(key) {
  if (!canUseRedis()) return false;

  try {
    await upstashFetch("del", [key]);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(key, ttlSeconds = 120) {
  if (!canUseRedis()) return true;

  try {
    const response = await upstashCommand(["SET", key, "1", "NX", "EX", String(ttlSeconds)]);
    return response?.result === "OK";
  } catch {
    return true;
  }
}

export async function releaseLock(key) {
  if (!canUseRedis()) return false;

  try {
    await upstashFetch("del", [key]);
    return true;
  } catch {
    return false;
  }
}

export function buildCacheKey(prefix, parts = []) {
  return [prefix, ...parts.map(value => String(value ?? "").trim()).filter(Boolean)].join(":");
}

export function redisEnabled() {
  return canUseRedis();
}

export function assertRedisConfigured() {
  if (!canUseRedis()) {
    throw new Error("Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }
}

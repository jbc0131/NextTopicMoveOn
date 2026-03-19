const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

function canUseRedis() {
  return !!(REDIS_URL && REDIS_TOKEN);
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

export async function getJsonCache(key) {
  if (!canUseRedis()) return null;

  try {
    const response = await upstashFetch("get", [key]);
    const raw = response?.result;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setJsonCache(key, value, ttlSeconds) {
  if (!canUseRedis()) return false;

  try {
    const args = ttlSeconds > 0 ? [key, "EX", ttlSeconds] : [key];
    const path = ["set", ...args].map(sanitizeKeyPart).join("/");
    const response = await fetch(`${REDIS_URL}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error(await response.text());
    return true;
  } catch {
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
    const response = await upstashFetch("set", [key, "1", "NX", "EX", ttlSeconds]);
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

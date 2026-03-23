const RPB_LOCAL_STORAGE_KEY = "rpb_raids_v1";
const USER_PROFILES_LOCAL_STORAGE_KEY = "ntmo_user_profiles_v1";

export const LOCAL_SANDBOX_PROFILE_ID = "local-sandbox-profile";

function sanitize(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sanitize);
  return Object.fromEntries(
    Object.entries(val)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitize(value)])
  );
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readLocalRpbRaids() {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(RPB_LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalRpbRaids(raids) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(RPB_LOCAL_STORAGE_KEY, JSON.stringify(raids));
  } catch {}
}

function upsertLocalRpbRaid(raid) {
  const raids = readLocalRpbRaids().filter(existing => existing.id !== raid.id);
  raids.unshift(raid);
  writeLocalRpbRaids(raids);
}

function readLocalUserProfiles() {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(USER_PROFILES_LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalUserProfiles(profiles) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(USER_PROFILES_LOCAL_STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
}

function upsertLocalUserProfile(discordId, profile) {
  const profiles = readLocalUserProfiles();
  profiles[String(discordId)] = profile;
  writeLocalUserProfiles(profiles);
}

function readLocalUserProfile(discordId) {
  if (!discordId) return null;
  const profiles = readLocalUserProfiles();
  return profiles[String(discordId)] || null;
}

export async function saveRpbRaidImport(raid) {
  const payload = sanitize({
    ...raid,
    id: raid.id || `${raid.reportId}-${raid.start ?? "0"}-${raid.end ?? "0"}`,
    importedAt: raid.importedAt || new Date().toISOString(),
  });

  upsertLocalRpbRaid(payload);

  try {
    const response = await fetch("/api/rpb-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save RPB raid import");
    return data;
  } catch {
    return { persistence: "local", raidId: payload.id, raid: payload };
  }
}

export async function fetchRpbRaidList(maxCount = 25) {
  try {
    const response = await fetch(`/api/rpb-store?maxCount=${encodeURIComponent(String(maxCount))}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load RPB raid list");

    if (Array.isArray(data.raids)) {
      for (const raid of data.raids) {
        upsertLocalRpbRaid(raid);
      }
    }
    return data.raids || [];
  } catch {
    return readLocalRpbRaids().slice(0, maxCount);
  }
}

async function fetchRpbRaid(raidId) {
  const normalizedRaidId = String(raidId || "").trim();
  if (!normalizedRaidId) return null;

  try {
    const response = await fetch(`/api/rpb-store?raidId=${encodeURIComponent(normalizedRaidId)}`);
    if (response.status === 404) {
      return readLocalRpbRaids().find(raid => raid.id === normalizedRaidId) || null;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load RPB raid");
    if (data) upsertLocalRpbRaid(data);
    return data || null;
  } catch {
    return readLocalRpbRaids().find(raid => raid.id === normalizedRaidId) || null;
  }
}

async function fetchRpbRaidFights(raidId) {
  const raid = await fetchRpbRaid(raidId);
  return raid?.fights || [];
}

async function fetchRpbRaidPlayers(raidId) {
  const raid = await fetchRpbRaid(raidId);
  return raid?.players || [];
}

export async function fetchRpbRaidBundle(raidId) {
  const [raid, fights, players] = await Promise.all([
    fetchRpbRaid(raidId),
    fetchRpbRaidFights(raidId),
    fetchRpbRaidPlayers(raidId),
  ]);

  if (!raid) return null;
  return { ...raid, fights, players };
}

export async function updateRpbRaidImport(raidId, updates) {
  const normalizedRaidId = String(raidId || "").trim();
  if (!normalizedRaidId) throw new Error("raidId is required");

  const existingLocalRaid = readLocalRpbRaids().find(raid => raid.id === normalizedRaidId) || null;
  if (existingLocalRaid) {
    upsertLocalRpbRaid(sanitize({
      ...existingLocalRaid,
      ...updates,
    }));
  }

  try {
    const response = await fetch("/api/rpb-store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raidId: normalizedRaidId,
        updates: sanitize(updates || {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to update RPB raid");
    if (data.raid) upsertLocalRpbRaid(data.raid);
    return data;
  } catch {
    return {
      persistence: "local",
      raidId: normalizedRaidId,
      raid: existingLocalRaid ? sanitize({ ...existingLocalRaid, ...updates }) : null,
    };
  }
}

export async function deleteRpbRaidImport(raidId) {
  const normalizedRaidId = String(raidId || "").trim();
  if (!normalizedRaidId) throw new Error("raidId is required");

  const nextLocalRaids = readLocalRpbRaids().filter(raid => raid.id !== normalizedRaidId);
  writeLocalRpbRaids(nextLocalRaids);

  try {
    const response = await fetch(`/api/rpb-store?raidId=${encodeURIComponent(normalizedRaidId)}`, {
      method: "DELETE",
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete RPB raid");
    return data;
  } catch {
    return { persistence: "local", raidId: normalizedRaidId };
  }
}

export async function fetchUserProfile(discordId) {
  const normalizedDiscordId = String(discordId || LOCAL_SANDBOX_PROFILE_ID).trim();
  if (!normalizedDiscordId) return null;

  try {
    const response = await fetch(`/api/profile-store?discordId=${encodeURIComponent(normalizedDiscordId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load profile");

    if (data.profile) {
      upsertLocalUserProfile(normalizedDiscordId, data.profile);
    }
    return data.profile || readLocalUserProfile(normalizedDiscordId);
  } catch {
    return readLocalUserProfile(normalizedDiscordId);
  }
}

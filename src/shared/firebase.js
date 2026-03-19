/**
 * NTMO Shared Firebase Helpers
 *
 * Path structure:
 *   raid-kara/live                      — Kara live state (shared, no teamId)
 *   raid-kara-snapshots/{id}            — Kara snapshots (shared)
 *   raid/{teamId}/25man-tue/live         — Tuesday 25-man live state
 *   raid/{teamId}/25man-thu/live         — Thursday 25-man live state
 *   raid/{teamId}/25man-snapshots/{id}   — 25-man snapshots
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, setDoc, onSnapshot, getDoc,
  collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, updateDoc, writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyCbZD9wjPOFTS_6RuOKk070b7pCXcndQas",
  authDomain:        "nexttopicmoveon.firebaseapp.com",
  projectId:         "nexttopicmoveon",
  storageBucket:     "nexttopicmoveon.firebasestorage.app",
  messagingSenderId: "778796385515",
  appId:             "1:778796385515:web:421a4b888edd4d57dc6aae",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";
}

function sanitize(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sanitize);
  return Object.fromEntries(
    Object.entries(val)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, sanitize(v)])
  );
}

// ── Document path helpers ─────────────────────────────────────────────────────
// Kara is teamless — single shared document
const KARA_LIVE_DOC      = doc(db, "raid-kara", "live");
const KARA_SNAPSHOTS_COL = collection(db, "raid-kara-snapshots");

function tfLiveDoc(teamId, night) {
  return doc(db, "raid", teamId, `25man-${night}`, "live");
}
function tfSnapshotsCol(teamId) {
  return collection(db, "raid", teamId, "25man-snapshots");
}

const RPB_RAIDS_COL = collection(db, "rpb-raids");
const RPB_LOCAL_STORAGE_KEY = "rpb_raids_v1";
const USER_PROFILES_COL = collection(db, "user-profiles");
const USER_PROFILES_LOCAL_STORAGE_KEY = "ntmo_user_profiles_v1";

function rpbRaidDoc(raidId) {
  return doc(db, "rpb-raids", raidId);
}

function rpbFightsCol(raidId) {
  return collection(db, "rpb-raids", raidId, "fights");
}

function rpbPlayersCol(raidId) {
  return collection(db, "rpb-raids", raidId, "players");
}

function userProfileDoc(discordId) {
  return doc(db, "user-profiles", String(discordId));
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

function chunkItems(items, size = 450) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

// ── Kara — live state ─────────────────────────────────────────────────────────
export async function saveKaraState(state) {
  await setDoc(KARA_LIVE_DOC, sanitize({
    rosterTue:     state.rosterTue     ?? [],
    rosterThu:     state.rosterThu     ?? [],
    assignments:   state.assignments   ?? {},
    specOverrides: state.specOverrides ?? {},
    raidDateTue:   state.raidDateTue   ?? "",
    raidDateThu:   state.raidDateThu   ?? "",
    updatedAt:     new Date().toISOString(),
  }));
}

export async function fetchKaraState() {
  const snap = await getDoc(KARA_LIVE_DOC);
  return snap.exists() ? snap.data() : null;
}

export function subscribeToKaraState(callback) {
  return onSnapshot(KARA_LIVE_DOC, snap => {
    if (snap.exists()) callback(snap.data());
  });
}

// ── Kara — snapshots ──────────────────────────────────────────────────────────
export async function saveKaraSnapshot(state, extra = {}) {
  return await addDoc(KARA_SNAPSHOTS_COL, sanitize({
    rosterTue:     state.rosterTue     ?? [],
    rosterThu:     state.rosterThu     ?? [],
    assignments:   state.assignments   ?? {},
    specOverrides: state.specOverrides ?? {},
    raidDateTue:   state.raidDateTue   ?? "",
    raidDateThu:   state.raidDateThu   ?? "",
    savedAt:       new Date().toISOString(),
    locked:        false,
    wclReportUrl:  null,
    sheetUrl:      null,
    combatLogUrl:  null,
    module:        "kara",
    ...extra,
  }));
}

export async function fetchKaraSnapshots(maxCount = 20) {
  const q    = query(KARA_SNAPSHOTS_COL, orderBy("savedAt", "desc"), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateKaraSnapshot(snapshotId, fields) {
  await updateDoc(doc(db, "raid-kara-snapshots", snapshotId), fields);
}

export async function deleteKaraSnapshot(snapshotId) {
  await deleteDoc(doc(db, "raid-kara-snapshots", snapshotId));
}

export async function submitKaraWclLog(snapshotId, wclReportUrl) {
  await updateDoc(doc(db, "raid-kara-snapshots", snapshotId), {
    wclReportUrl,
    locked: true,
  });
}

// ── 25-Man — live state ───────────────────────────────────────────────────────
export async function saveTwentyFiveState(state, teamId, night) {
  await setDoc(tfLiveDoc(teamId, night), sanitize({
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    dividers:    state.dividers    ?? [],
    raidDate:    state.raidDate    ?? "",
    raidLeader:  state.raidLeader  ?? "",
    updatedAt:   new Date().toISOString(),
  }));
}

export async function fetchTwentyFiveState(teamId, night) {
  const snap = await getDoc(tfLiveDoc(teamId, night));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToTwentyFiveState(teamId, night, callback) {
  return onSnapshot(tfLiveDoc(teamId, night), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

// ── 25-Man — snapshots ────────────────────────────────────────────────────────
export async function saveTwentyFiveSnapshot(state, teamId, night, extra = {}) {
  return await addDoc(tfSnapshotsCol(teamId), sanitize({
    roster:       state.roster      ?? [],
    assignments:  state.assignments ?? {},
    textInputs:   state.textInputs  ?? {},
    raidDate:     state.raidDate    ?? "",
    raidLeader:   state.raidLeader  ?? "",
    night,
    savedAt:      new Date().toISOString(),
    locked:       false,
    wclReportUrl: null,
    sheetUrl:     null,
    combatLogUrl: null,
    module:       "25man",
    ...extra,
  }));
}

export async function fetchTwentyFiveSnapshots(teamId, maxCount = 20) {
  const q    = query(tfSnapshotsCol(teamId), orderBy("savedAt", "desc"), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateTwentyFiveSnapshot(teamId, snapshotId, fields) {
  await updateDoc(doc(db, "raid", teamId, "25man-snapshots", snapshotId), fields);
}

export async function deleteTwentyFiveSnapshot(teamId, snapshotId) {
  await deleteDoc(doc(db, "raid", teamId, "25man-snapshots", snapshotId));
}

export async function submitTwentyFiveWclLog(teamId, snapshotId, wclReportUrl) {
  await updateDoc(doc(db, "raid", teamId, "25man-snapshots", snapshotId), {
    wclReportUrl,
    locked: true,
  });
}

// ── History — fetch all snapshots ─────────────────────────────────────────────
export async function fetchAllSnapshots(teamId, maxCount = 40) {
  const [karaSnaps, tfSnaps] = await Promise.all([
    fetchKaraSnapshots(maxCount),
    fetchTwentyFiveSnapshots(teamId, maxCount),
  ]);
  return [...karaSnaps, ...tfSnaps]
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .slice(0, maxCount);
}

// ── RPB — persistent raid imports ────────────────────────────────────────────
export async function saveRpbRaidImport(raid) {
  const payload = sanitize({
    ...raid,
    id: raid.id || `${raid.reportId}-${raid.start ?? "0"}-${raid.end ?? "0"}`,
    importedAt: raid.importedAt || new Date().toISOString(),
  });

  const response = await fetch("/api/rpb-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to save RPB raid import");
  return data;
}

export async function fetchRpbRaidList(maxCount = 25) {
  const response = await fetch(`/api/rpb-store?maxCount=${encodeURIComponent(String(maxCount))}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load RPB raid list");
  return data.raids || [];
}

export async function fetchRpbRaid(raidId) {
  const response = await fetch(`/api/rpb-store?raidId=${encodeURIComponent(String(raidId))}`);
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load RPB raid");
  return data || null;
}

export async function fetchRpbRaidFights(raidId) {
  const raid = await fetchRpbRaid(raidId);
  return raid?.fights || [];
}

export async function fetchRpbRaidPlayers(raidId) {
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

export async function fetchUserProfile(discordId) {
  if (!discordId) return null;
  const response = await fetch(`/api/profile-store?discordId=${encodeURIComponent(String(discordId))}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load profile");
  return data.profile || null;
}

export async function saveUserProfile(discordId, profile) {
  if (!discordId) throw new Error("discordId is required");

  const payload = sanitize({
    discordId: String(discordId),
    mainCharacterName: profile?.mainCharacterName || "",
    alts: Array.isArray(profile?.alts) ? profile.alts : [],
    wclV1ApiKey: profile?.wclV1ApiKey || "",
  });
  const response = await fetch("/api/profile-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to save profile");
  return data;
}

// ── Dashboard — lightweight summary reads ─────────────────────────────────────
export async function fetchKaraSummary() {
  const state = await fetchKaraState();
  if (!state) return null;
  return {
    raidDateTue:    state.raidDateTue || "",
    raidDateThu:    state.raidDateThu || "",
    filledSlots:    Object.keys(state.assignments || {}).length,
    totalSlots:     60,
    rosterTueCount: (state.rosterTue || []).length,
    rosterThuCount: (state.rosterThu || []).length,
  };
}

export async function fetchTwentyFiveSummary(teamId, night) {
  const state = await fetchTwentyFiveState(teamId, night);
  if (!state) return null;
  return {
    raidDate:        state.raidDate   || "",
    raidLeader:      state.raidLeader || "",
    rosterCount:     (state.roster || []).length,
    assignmentCount: Object.keys(state.assignments || {}).length,
  };
}

/**
 * NTMO Shared Firebase Helpers
 *
 * Path structure:
 *   raid-kara/live                — Kara live state (shared, no teamId)
 *   raid/{teamId}/25man-tue/live   — Tuesday 25-man live state
 *   raid/{teamId}/25man-thu/live   — Thursday 25-man live state
 *   raid/{teamId}/ssc/live         — Serpentshrine Cavern live state
 *   raid/{teamId}/tk/live          — Tempest Keep (The Eye) live state
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, setDoc, onSnapshot, getDoc,
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
const KARA_LIVE_DOC = doc(db, "raid-kara", "live");

function tfLiveDoc(teamId, night) {
  return doc(db, "raid", teamId, `25man-${night}`, "live");
}
function sscLiveDoc(teamId) {
  return doc(db, "raid", teamId, "ssc", "live");
}
function tkLiveDoc(teamId) {
  return doc(db, "raid", teamId, "tk", "live");
}

const USER_PROFILES_LOCAL_STORAGE_KEY = "ntmo_user_profiles_v1";
export const LOCAL_SANDBOX_PROFILE_ID = "local-sandbox-profile";

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
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

// ── Kara — live state ─────────────────────────────────────────────────────────
export async function saveKaraState(state) {
  await setDoc(KARA_LIVE_DOC, sanitize({
    rosterTue:           state.rosterTue           ?? [],
    rosterThu:           state.rosterThu           ?? [],
    assignments:         state.assignments         ?? {},
    specOverrides:       state.specOverrides       ?? {},
    raidDateTue:         state.raidDateTue         ?? "",
    raidDateThu:         state.raidDateThu         ?? "",
    discordMessageIdTue: state.discordMessageIdTue ?? "",
    discordMessageIdThu: state.discordMessageIdThu ?? "",
    updatedAt:           new Date().toISOString(),
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

// ── 25-Man — live state ───────────────────────────────────────────────────────
export async function saveTwentyFiveState(state, teamId, night) {
  await setDoc(tfLiveDoc(teamId, night), sanitize({
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    dividers:    state.dividers    ?? [],
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

// ── User profile ──────────────────────────────────────────────────────────────
// Note: RPB raid import helpers live in src/shared/rpbRedis.js (they go through
// /api/rpb-store, not Firestore, so they don't belong here).
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

export async function saveUserProfile(discordId, profile) {
  const normalizedDiscordId = String(discordId || LOCAL_SANDBOX_PROFILE_ID).trim();
  if (!normalizedDiscordId) throw new Error("discordId is required");

  const payload = sanitize({
    discordId: normalizedDiscordId,
    mainCharacterName: profile?.mainCharacterName || "",
    alts: Array.isArray(profile?.alts) ? profile.alts : [],
    wclV1ApiKey: profile?.wclV1ApiKey || "",
    wclV2ClientId: profile?.wclV2ClientId || "",
    wclV2ClientSecret: profile?.wclV2ClientSecret || "",
    updatedAt: new Date().toISOString(),
  });

  upsertLocalUserProfile(payload.discordId, payload);

  try {
    const response = await fetch("/api/profile-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save profile");

    if (data.profile) {
      upsertLocalUserProfile(payload.discordId, data.profile);
    }
    return data;
  } catch {
    return { persistence: "local", profile: payload };
  }
}

// ── SSC — live state ──────────────────────────────────────────────────────────
export async function saveSscState(state, teamId) {
  await setDoc(sscLiveDoc(teamId), sanitize({
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    dividers:    state.dividers    ?? [],
    updatedAt:   new Date().toISOString(),
  }));
}

export async function fetchSscState(teamId) {
  const snap = await getDoc(sscLiveDoc(teamId));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToSscState(teamId, callback) {
  return onSnapshot(sscLiveDoc(teamId), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

// ── TK — live state ───────────────────────────────────────────────────────────
export async function saveTkState(state, teamId) {
  await setDoc(tkLiveDoc(teamId), sanitize({
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    dividers:    state.dividers    ?? [],
    updatedAt:   new Date().toISOString(),
  }));
}

export async function fetchTkState(teamId) {
  const snap = await getDoc(tkLiveDoc(teamId));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToTkState(teamId, callback) {
  return onSnapshot(tkLiveDoc(teamId), snap => {
    if (snap.exists()) callback(snap.data());
  });
}


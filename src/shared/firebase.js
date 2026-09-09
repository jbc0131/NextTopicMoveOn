/**
 * NTMO Shared Firebase Helpers
 *
 * Path structure:
 *   raid-kara/live                — Kara live state (shared, no teamId)
 *   raid/{teamId}/25man-tue/live   — Tuesday 25-man live state
 *   raid/{teamId}/25man-thu/live   — Thursday 25-man live state
 *   raid/{teamId}/ssc/live         — Serpentshrine Cavern live state
 *   raid/{teamId}/tk/live          — Tempest Keep (The Eye) live state
 *   raid/{teamId}/hyjal/live       — T6 Mount Hyjal live state
 *   raid/{teamId}/bt/live          — T6 Black Temple live state
 *   raid/{teamId}/{module}/positioning — uploaded positioning image index
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
// Generic per-module live doc — raid/{teamId}/{moduleKey}/live.
// Used by the T6 modules (mh, bt); SSC/TK keep their named helpers above.
function moduleLiveDoc(teamId, moduleKey) {
  return doc(db, "raid", teamId, moduleKey, "live");
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

// ── Positioning images — uploaded overrides ───────────────────────────────────
// Which uploaded images belong to which boss, per team and module. The image
// bytes live in Vercel Blob (uploaded through /api/positioning-upload, which is
// admin-gated); this document is just the index pointing at them.
//
// It sits at raid/{teamId}/{moduleKey}/positioning so it lands inside the
// existing `raid/{teamId}/{module}/{docId}` security rule — no rules change.
//
// Shape: { bosses: { "<boss-slug>": [{ url, pathname, caption, uploadedAt, uploadedBy }] } }
// An empty or missing array for a boss means "fall back to the image committed
// under public/positioning" — that is how Restore built-in works.
function positioningDoc(teamId, moduleKey) {
  return doc(db, "raid", teamId, moduleKey, "positioning");
}

export async function fetchPositioningImages(teamId, moduleKey) {
  const snap = await getDoc(positioningDoc(teamId, moduleKey));
  return snap.exists() ? (snap.data().bosses || {}) : {};
}

export function subscribeToPositioningImages(teamId, moduleKey, callback, onError) {
  return onSnapshot(
    positioningDoc(teamId, moduleKey),
    snap => callback(snap.exists() ? (snap.data().bosses || {}) : {}),
    err  => { if (onError) onError(err); },
  );
}

// Replaces the whole list for one boss. Merge keeps the other bosses intact.
export async function savePositioningImages(teamId, moduleKey, bossSlug, images) {
  await setDoc(positioningDoc(teamId, moduleKey), sanitize({
    bosses:    { [bossSlug]: images ?? [] },
    updatedAt: new Date().toISOString(),
  }), { merge: true });
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

// ── Generic raid module — live state ──────────────────────────────────────────
// Same document shape as SSC/TK (roster / assignments / textInputs / dividers),
// keyed by an arbitrary module key so new raids don't each need their own trio
// of helpers. Currently used by Mount Hyjal ("hyjal") and Black Temple ("bt").
export async function saveRaidModuleState(state, teamId, moduleKey) {
  await setDoc(moduleLiveDoc(teamId, moduleKey), sanitize({
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    dividers:    state.dividers    ?? [],
    updatedAt:   new Date().toISOString(),
  }));
}

export async function fetchRaidModuleState(teamId, moduleKey) {
  const snap = await getDoc(moduleLiveDoc(teamId, moduleKey));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToRaidModuleState(teamId, moduleKey, callback) {
  return onSnapshot(moduleLiveDoc(teamId, moduleKey), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

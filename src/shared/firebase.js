/**
 * NTMO Shared Firebase Helpers
 * New per-module paths as defined in the rebuild spec.
 *
 * Path structure:
 *   raid/{teamId}/kara/live              — Kara live state
 *   raid/{teamId}/kara-snapshots/{id}    — Kara snapshots
 *   raid/{teamId}/25man-tue/live         — Tuesday 25-man live state
 *   raid/{teamId}/25man-thu/live         — Thursday 25-man live state
 *   raid/{teamId}/25man-snapshots/{id}   — 25-man snapshots
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, setDoc, onSnapshot, getDoc,
  collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, updateDoc,
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

// Recursively strips undefined values — Firestore rejects them
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
function karaLiveDoc(teamId) {
  return doc(db, "raid", teamId, "kara", "live");
}
function tfLiveDoc(teamId, night) {
  // night: "tue" | "thu"
  return doc(db, "raid", teamId, `25man-${night}`, "live");
}
function karaSnapshotsCol(teamId) {
  return collection(db, "raid", teamId, "kara-snapshots");
}
function tfSnapshotsCol(teamId) {
  return collection(db, "raid", teamId, "25man-snapshots");
}

// ── Kara — live state ─────────────────────────────────────────────────────────
export async function saveKaraState(state, teamId) {
  await setDoc(karaLiveDoc(teamId), sanitize({
    rosterTue:     state.rosterTue     ?? [],
    rosterThu:     state.rosterThu     ?? [],
    assignments:   state.assignments   ?? {},
    specOverrides: state.specOverrides ?? {},
    raidDateTue:   state.raidDateTue   ?? "",
    raidDateThu:   state.raidDateThu   ?? "",
    updatedAt:     new Date().toISOString(),
  }));
}

export async function fetchKaraState(teamId) {
  const snap = await getDoc(karaLiveDoc(teamId));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToKaraState(teamId, callback) {
  return onSnapshot(karaLiveDoc(teamId), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

// ── Kara — snapshots ──────────────────────────────────────────────────────────
export async function saveKaraSnapshot(state, teamId, extra = {}) {
  return await addDoc(karaSnapshotsCol(teamId), sanitize({
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

export async function fetchKaraSnapshots(teamId, maxCount = 20) {
  const q    = query(karaSnapshotsCol(teamId), orderBy("savedAt", "desc"), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateKaraSnapshot(teamId, snapshotId, fields) {
  await updateDoc(doc(db, "raid", teamId, "kara-snapshots", snapshotId), fields);
}

export async function deleteKaraSnapshot(teamId, snapshotId) {
  await deleteDoc(doc(db, "raid", teamId, "kara-snapshots", snapshotId));
}

export async function submitKaraWclLog(teamId, snapshotId, wclReportUrl) {
  await updateDoc(doc(db, "raid", teamId, "kara-snapshots", snapshotId), {
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
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    raidDate:    state.raidDate    ?? "",
    raidLeader:  state.raidLeader  ?? "",
    night:       night,
    savedAt:     new Date().toISOString(),
    locked:      false,
    wclReportUrl: null,
    sheetUrl:    null,
    combatLogUrl: null,
    module:      "25man",
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

// ── History — fetch both snapshot collections ─────────────────────────────────
export async function fetchAllSnapshots(teamId, maxCount = 40) {
  const [karaSnaps, tfSnaps] = await Promise.all([
    fetchKaraSnapshots(teamId, maxCount),
    fetchTwentyFiveSnapshots(teamId, maxCount),
  ]);

  // Merge and sort by savedAt descending
  return [...karaSnaps, ...tfSnaps]
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .slice(0, maxCount);
}

// ── Dashboard — lightweight summary reads ─────────────────────────────────────
export async function fetchKaraSummary(teamId) {
  const state = await fetchKaraState(teamId);
  if (!state) return null;
  const totalSlots   = 60; // 6 teams × 10 slots
  const filledSlots  = Object.keys(state.assignments || {}).length;
  return {
    raidDateTue: state.raidDateTue || "",
    raidDateThu: state.raidDateThu || "",
    filledSlots,
    totalSlots,
    rosterTueCount: (state.rosterTue || []).length,
    rosterThuCount: (state.rosterThu || []).length,
  };
}

export async function fetchTwentyFiveSummary(teamId, night) {
  const state = await fetchTwentyFiveState(teamId, night);
  if (!state) return null;
  return {
    raidDate:    state.raidDate    || "",
    raidLeader:  state.raidLeader  || "",
    rosterCount: (state.roster || []).length,
    assignmentCount: Object.keys(state.assignments || {}).length,
  };
}

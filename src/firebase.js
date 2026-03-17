import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc } from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1: Paste your Firebase config here.
//  Get it from: Firebase Console → Project Settings → Your Apps → SDK setup
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCbZD9wjPOFTS_6RuOKk070b7pCXcndQas",
  authDomain:        "nexttopicmoveon.firebaseapp.com",
  projectId:         "nexttopicmoveon",
  storageBucket:     "nexttopicmoveon.firebasestorage.app",
  messagingSenderId: "778796385515",
  appId:             "1:778796385515:web:421a4b888edd4d57dc6aae",
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Firestore rejects any undefined value anywhere in the document tree.
// This recursively strips undefined, replacing with null for explicit fields.
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

// Each team gets its own Firestore document under the "raid" collection
// teamId: "team-dick" | "team-balls"
function raidDoc(teamId) {
  return doc(db, "raid", teamId);
}

/**
 * Save the full raid state to Firestore for a specific team.
 */
export async function saveToFirebase(state, teamId) {
  await setDoc(raidDoc(teamId), sanitize({
    roster:        state.roster        ?? [],
    rosterTue:     state.rosterTue     ?? [],
    rosterThu:     state.rosterThu     ?? [],
    assignments:   state.assignments   ?? {},
    textInputs:    state.textInputs    ?? {},
    raidDate:      state.raidDate      ?? "",
    raidLeader:    state.raidLeader    ?? "",
    specOverrides: state.specOverrides ?? {},
    dividers:      state.dividers      ?? [],
    updatedAt:     new Date().toISOString(),
  }));
}

/**
 * Read the current state from Firestore once for a specific team.
 * Returns null if the document doesn't exist yet.
 */
export async function fetchFromFirebase(teamId) {
  const snap = await getDoc(raidDoc(teamId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Subscribe to real-time updates from Firestore for a specific team.
 * Returns an unsubscribe function.
 */
export function subscribeToFirebase(callback, teamId) {
  return onSnapshot(raidDoc(teamId), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

/**
 * Check whether the Firebase config has been filled in yet.
 */
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";
}

/**
 * Save a point-in-time snapshot of the current raid to history.
 * Stored as a sub-collection under each team's document.
 */
export async function saveSnapshot(state, teamId, extra = {}) {
  const snapshotsCol = collection(db, "raid", teamId, "snapshots");
  return await addDoc(snapshotsCol, sanitize({
    raidDate:    state.raidDate    ?? "",
    raidLeader:  state.raidLeader  ?? "",
    roster:      state.roster      ?? [],
    rosterTue:   state.rosterTue   ?? [],
    rosterThu:   state.rosterThu   ?? [],
    assignments: state.assignments ?? {},
    textInputs:  state.textInputs  ?? {},
    savedAt:     new Date().toISOString(),
    wclReportUrl: null,
    locked:      false,
    ...extra,
  }));
}

/**
 * Submit a WCL report URL for a snapshot, locking it permanently.
 */
export async function submitWclLog(teamId, snapshotId, wclReportUrl) {
  const { updateDoc } = await import("firebase/firestore");
  const snapDoc = doc(db, "raid", teamId, "snapshots", snapshotId);
  await updateDoc(snapDoc, { wclReportUrl, locked: true });
}

/**
 * Fetch the most recent snapshots for a team (newest first, max 20).
 */
export async function fetchSnapshots(teamId) {
  const snapshotsCol = collection(db, "raid", teamId, "snapshots");
  const q = query(snapshotsCol, orderBy("savedAt", "desc"), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Update arbitrary fields on an existing snapshot.
 */
export async function updateSnapshot(teamId, snapshotId, fields) {
  const { updateDoc } = await import("firebase/firestore");
  const snapDoc = doc(db, "raid", teamId, "snapshots", snapshotId);
  await updateDoc(snapDoc, fields);
}

/**
 * Permanently delete a snapshot by ID.
 */
export async function deleteSnapshot(teamId, snapshotId) {
  const snapDoc = doc(db, "raid", teamId, "snapshots", snapshotId);
  await deleteDoc(snapDoc);
}

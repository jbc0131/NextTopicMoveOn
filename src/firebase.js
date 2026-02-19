import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1: Paste your Firebase config here.
//  Get it from: Firebase Console → Project Settings → Your Apps → SDK setup
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// We store everything in a single Firestore document
const RAID_DOC = doc(db, "raid", "assignments");

/**
 * Save the full raid state to Firestore.
 * @param {{ roster, assignments, raidDate, raidLeader }} state
 */
export async function saveToFirebase(state) {
  await setDoc(RAID_DOC, {
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    raidDate:    state.raidDate    ?? "",
    raidLeader:  state.raidLeader  ?? "",
    updatedAt:   new Date().toISOString(),
  });
}

/**
 * Read the current state from Firestore once (used for initial load).
 * Returns null if the document doesn't exist yet.
 */
export async function fetchFromFirebase() {
  const snap = await getDoc(RAID_DOC);
  return snap.exists() ? snap.data() : null;
}

/**
 * Subscribe to real-time updates from Firestore.
 * Calls `callback(data)` whenever the document changes.
 * Returns an unsubscribe function.
 */
export function subscribeToFirebase(callback) {
  return onSnapshot(RAID_DOC, snap => {
    if (snap.exists()) callback(snap.data());
  });
}

/**
 * Check whether the Firebase config has been filled in yet.
 */
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";
}

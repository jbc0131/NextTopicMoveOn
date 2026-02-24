import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

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

// Each team gets its own Firestore document under the "raid" collection
// teamId: "team-dick" | "team-balls"
function raidDoc(teamId) {
  return doc(db, "raid", teamId);
}

/**
 * Save the full raid state to Firestore for a specific team.
 */
export async function saveToFirebase(state, teamId) {
  await setDoc(raidDoc(teamId), {
    roster:      state.roster      ?? [],
    assignments: state.assignments ?? {},
    raidDate:    state.raidDate    ?? "",
    raidLeader:  state.raidLeader  ?? "",
    updatedAt:   new Date().toISOString(),
  });
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

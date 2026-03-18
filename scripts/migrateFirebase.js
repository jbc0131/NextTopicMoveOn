#!/usr/bin/env node
/**
 * NTMO Firebase Migration Script — Phase 0
 *
 * Reads the current flat raid/{teamId} documents and writes to:
 *   raid/{teamId}/kara           — Kara live state
 *   raid/{teamId}/25man-tue      — Tuesday 25-man live state
 *   raid/{teamId}/25man-thu      — Thursday 25-man live state
 *
 * Also migrates all snapshots under raid/{teamId}/snapshots into:
 *   raid/{teamId}/kara-snapshots
 *   raid/{teamId}/25man-snapshots
 *
 * SAFE TO RUN MULTIPLE TIMES — later runs overwrite earlier writes.
 * Old documents are NOT deleted — they remain as fallback until Phase 4.
 *
 * Usage:
 *   npm install firebase-admin
 *   node scripts/migrateFirebase.js
 *
 * Requires environment variables:
 *   FIREBASE_SERVICE_ACCOUNT — path to your Firebase service account JSON
 *     OR set GOOGLE_APPLICATION_CREDENTIALS to the path
 *
 * Download service account from:
 *   Firebase Console → Project Settings → Service Accounts → Generate New Private Key
 */

const admin = require("firebase-admin");
const path  = require("path");
const fs    = require("fs");

// ── Init ──────────────────────────────────────────────────────────────────────
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error("ERROR: Set FIREBASE_SERVICE_ACCOUNT env var to your service account JSON path");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Constants — kara slot key prefixes ───────────────────────────────────────
// Keys starting with these prefixes belong to Kara assignments
const KARA_KEY_PREFIXES = ["ktue", "kthu"];

// Keys belonging to 25-man assignments
const TWENTY_FIVE_KEY_PREFIXES = [
  "maulgar_", "blindeye_", "olm_", "kiggler_", "krosh_",
  "heal_",
  "misc_",
  "g_",
  "m_",
  "gen_",
];

function isKaraKey(key) {
  return KARA_KEY_PREFIXES.some(p => key.startsWith(p));
}

function isTwentyFiveKey(key) {
  return TWENTY_FIVE_KEY_PREFIXES.some(p => key.startsWith(p));
}

function splitAssignments(assignments = {}) {
  const kara     = {};
  const twentyFive = {};
  const unknown  = [];

  for (const [key, val] of Object.entries(assignments)) {
    if (isKaraKey(key))         kara[key]      = val;
    else if (isTwentyFiveKey(key)) twentyFive[key] = val;
    else                        unknown.push(key);
  }

  return { kara, twentyFive, unknown };
}

function inferSnapshotModule(assignments = {}) {
  const hasKara        = Object.keys(assignments).some(isKaraKey);
  const hasTwentyFive  = Object.keys(assignments).some(isTwentyFiveKey);
  if (hasKara && hasTwentyFive) return "mixed";
  if (hasKara)       return "kara";
  if (hasTwentyFive) return "25man";
  return "unknown";
}

function splitRosterByNight(roster = []) {
  const tue     = roster.filter(p => p.karaNight === "tue");
  const thu     = roster.filter(p => p.karaNight === "thu");
  const neither = roster.filter(p => !p.karaNight);
  return { tue, thu, neither };
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

// ── Migrate one team ──────────────────────────────────────────────────────────
async function migrateTeam(teamId) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Migrating team: ${teamId}`);
  console.log(`${"─".repeat(60)}`);

  // Read current live document
  const liveRef  = db.collection("raid").doc(teamId);
  const liveSnap = await liveRef.get();

  if (!liveSnap.exists) {
    console.log(`  ⚠  No live document found for ${teamId} — skipping`);
    return;
  }

  const live = liveSnap.data();
  console.log(`  ✓  Read live document`);
  console.log(`     roster:    ${(live.roster || []).length} players`);
  console.log(`     rosterTue: ${(live.rosterTue || []).length} players`);
  console.log(`     rosterThu: ${(live.rosterThu || []).length} players`);
  console.log(`     assignments: ${Object.keys(live.assignments || {}).length} keys`);

  // Split assignments
  const { kara: karaAssignments, twentyFive: tfAssignments, unknown: unknownKeys } =
    splitAssignments(live.assignments || {});

  console.log(`\n  Assignment split:`);
  console.log(`     Kara keys:    ${Object.keys(karaAssignments).length}`);
  console.log(`     25-man keys:  ${Object.keys(tfAssignments).length}`);
  if (unknownKeys.length) {
    console.log(`     ⚠  Unknown keys (not migrated): ${unknownKeys.join(", ")}`);
  }

  // Split rosters
  const rosterTue = live.rosterTue || splitRosterByNight(live.roster || {}).tue;
  const rosterThu = live.rosterThu || splitRosterByNight(live.roster || {}).thu;

  console.log(`\n  Roster split:`);
  console.log(`     Tuesday:  ${rosterTue.length} players`);
  console.log(`     Thursday: ${rosterThu.length} players`);

  // ── Write raid/{teamId}/kara ──────────────────────────────────────────────
  const karaDoc = {
    rosterTue:     sanitize(rosterTue),
    rosterThu:     sanitize(rosterThu),
    assignments:   sanitize(karaAssignments),
    specOverrides: sanitize(live.specOverrides || {}),
    raidDateTue:   live.raidDate || "",
    raidDateThu:   live.raidDate || "",
    updatedAt:     new Date().toISOString(),
    migratedAt:    new Date().toISOString(),
    migratedFrom:  `raid/${teamId}`,
  };

  await db.collection("raid").doc(teamId).collection("kara").doc("live").set(sanitize(karaDoc));
  console.log(`\n  ✓  Wrote raid/${teamId}/kara/live`);
  console.log(`     rosterTue: ${rosterTue.length}, rosterThu: ${rosterThu.length}`);
  console.log(`     assignments: ${Object.keys(karaAssignments).length} keys`);

  // ── Write raid/{teamId}/25man-tue ─────────────────────────────────────────
  const tfTueDoc = {
    roster:      sanitize(rosterTue),
    assignments: sanitize(tfAssignments),
    textInputs:  sanitize(live.textInputs || {}),
    dividers:    sanitize(live.dividers   || []),
    raidDate:    live.raidDate   || "",
    raidLeader:  live.raidLeader || "",
    updatedAt:   new Date().toISOString(),
    migratedAt:  new Date().toISOString(),
    migratedFrom: `raid/${teamId}`,
  };

  await db.collection("raid").doc(teamId).collection("25man-tue").doc("live").set(sanitize(tfTueDoc));
  console.log(`\n  ✓  Wrote raid/${teamId}/25man-tue/live`);
  console.log(`     roster: ${rosterTue.length}, assignments: ${Object.keys(tfAssignments).length} keys`);

  // ── Write raid/{teamId}/25man-thu ─────────────────────────────────────────
  const tfThuDoc = {
    roster:      sanitize(rosterThu),
    assignments: sanitize(tfAssignments), // copy same assignments to both — per spec
    textInputs:  sanitize(live.textInputs || {}),
    dividers:    sanitize(live.dividers   || []),
    raidDate:    live.raidDate   || "",
    raidLeader:  live.raidLeader || "",
    updatedAt:   new Date().toISOString(),
    migratedAt:  new Date().toISOString(),
    migratedFrom: `raid/${teamId}`,
  };

  await db.collection("raid").doc(teamId).collection("25man-thu").doc("live").set(sanitize(tfThuDoc));
  console.log(`\n  ✓  Wrote raid/${teamId}/25man-thu/live`);
  console.log(`     roster: ${rosterThu.length}, assignments: ${Object.keys(tfAssignments).length} keys`);

  // ── Migrate snapshots ─────────────────────────────────────────────────────
  console.log(`\n  Migrating snapshots…`);

  const snapshotsRef  = db.collection("raid").doc(teamId).collection("snapshots");
  const snapshotsSnap = await snapshotsRef.orderBy("savedAt", "desc").get();

  if (snapshotsSnap.empty) {
    console.log(`     No snapshots found`);
    return;
  }

  console.log(`     Found ${snapshotsSnap.size} snapshots`);

  let karaCount    = 0;
  let tfCount      = 0;
  let mixedCount   = 0;
  let unknownCount = 0;

  for (const snapDoc of snapshotsSnap.docs) {
    const snap   = snapDoc.data();
    const module = inferSnapshotModule(snap.assignments || {});

    // Split roster for this snapshot
    const snapRosterTue = snap.rosterTue || splitRosterByNight(snap.roster || []).tue;
    const snapRosterThu = snap.rosterThu || splitRosterByNight(snap.roster || []).thu;

    // Split assignments for this snapshot
    const {
      kara:      snapKaraAssign,
      twentyFive: snapTfAssign,
    } = splitAssignments(snap.assignments || {});

    const baseFields = {
      savedAt:      snap.savedAt      || new Date().toISOString(),
      locked:       snap.locked       || false,
      wclReportUrl: snap.wclReportUrl || null,
      sheetUrl:     snap.sheetUrl     || null,
      combatLogUrl: snap.combatLogUrl || null,
      raidDate:     snap.raidDate     || "",
      raidLeader:   snap.raidLeader   || "",
      migratedAt:   new Date().toISOString(),
      migratedFrom: `raid/${teamId}/snapshots/${snapDoc.id}`,
      originalId:   snapDoc.id,
      module,
    };

    if (module === "kara" || module === "mixed") {
      // Write to kara-snapshots
      const karaSnap = {
        ...baseFields,
        rosterTue:     sanitize(snapRosterTue),
        rosterThu:     sanitize(snapRosterThu),
        assignments:   sanitize(snapKaraAssign),
        specOverrides: sanitize(snap.specOverrides || {}),
        raidDateTue:   snap.raidDate || "",
        raidDateThu:   snap.raidDate || "",
      };
      if (module === "mixed") {
        karaSnap.legacyRoster      = sanitize(snap.roster || []);
        karaSnap.legacyAssignments = sanitize(snap.assignments || {});
      }
      await db.collection("raid").doc(teamId)
        .collection("kara-snapshots").doc(snapDoc.id)
        .set(sanitize(karaSnap));
      karaCount++;
    }

    if (module === "25man" || module === "mixed") {
      // Write to 25man-snapshots
      const tfSnap = {
        ...baseFields,
        rosterTue:   sanitize(snapRosterTue),
        rosterThu:   sanitize(snapRosterThu),
        assignments: sanitize(snapTfAssign),
        textInputs:  sanitize(snap.textInputs || {}),
      };
      if (module === "mixed") {
        tfSnap.legacyRoster      = sanitize(snap.roster || []);
        tfSnap.legacyAssignments = sanitize(snap.assignments || {});
      }
      await db.collection("raid").doc(teamId)
        .collection("25man-snapshots").doc(snapDoc.id)
        .set(sanitize(tfSnap));
      tfCount++;
    }

    if (module === "unknown") {
      unknownCount++;
      console.log(`     ⚠  Snapshot ${snapDoc.id} has no recognizable assignment keys — skipped`);
    }

    if (module === "mixed") mixedCount++;
  }

  console.log(`\n  Snapshot migration complete:`);
  console.log(`     → kara-snapshots:   ${karaCount}`);
  console.log(`     → 25man-snapshots:  ${tfCount}`);
  console.log(`     → mixed (in both):  ${mixedCount}`);
  if (unknownCount) console.log(`     ⚠  skipped:        ${unknownCount}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const teams = ["team-dick", "team-balls"];

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       NTMO Firebase Migration Script — Phase 0          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\nThis script is SAFE TO RUN MULTIPLE TIMES.");
  console.log("Old documents are NOT deleted.\n");

  for (const teamId of teams) {
    try {
      await migrateTeam(teamId);
    } catch (err) {
      console.error(`\n  ✗  Migration failed for ${teamId}:`, err.message);
      console.error(err);
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Migration complete. Verify in Firebase Console:        ║");
  console.log("║                                                          ║");
  console.log("║  raid/team-dick/kara/live          ← Kara live state    ║");
  console.log("║  raid/team-dick/25man-tue/live     ← Tue 25-man         ║");
  console.log("║  raid/team-dick/25man-thu/live     ← Thu 25-man         ║");
  console.log("║  raid/team-dick/kara-snapshots     ← Kara history       ║");
  console.log("║  raid/team-dick/25man-snapshots    ← 25-man history     ║");
  console.log("║                                                          ║");
  console.log("║  Same structure for team-balls.                         ║");
  console.log("║                                                          ║");
  console.log("║  Old documents at raid/team-dick remain untouched.      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

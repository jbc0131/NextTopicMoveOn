# NTMO Raid Platform — Product Decisions

A record of significant product and technical decisions, why they were made, and what was rejected.
Read this before proposing architectural changes.

---

## Architecture Decisions

### React SPA over Next.js
**Decision:** Built as a React SPA (Vite) rather than Next.js.

**Why:** The app is entirely auth-gated or public-static — there's no SEO requirement, no server-side rendering benefit, and no need for the App Router's complexity. Vite builds fast and deploys trivially to Vercel. The real-time nature of the app (Firebase subscriptions) is better suited to a client-side SPA anyway.

**What was rejected:** Next.js App Router. Considered briefly but the operational overhead (server components, 'use client' boundaries) wasn't justified for what is essentially a real-time dashboard.

---

### Firebase over Supabase
**Decision:** Using Firebase Firestore for real-time state rather than Supabase.

**Why:** Firestore's real-time `onSnapshot` subscriptions are ideal for raid night use — multiple officers/raiders can have the page open simultaneously and see assignment changes instantly. Supabase Realtime requires more setup for the same behavior.

**What was rejected:** Supabase (used on SAND Signal). The Firebase SDK is simpler for pure real-time key-value document storage without complex relational queries.

---

### Karazhan Is Teamless
**Decision:** Karazhan lives at `/kara` with no team prefix, and is a single shared admin page for both nights.

**Why:** Karazhan runs both Tuesday (Team Dick) and Thursday (Team Balls). Both nights share the same 3-team structure. Having separate `/team-dick/kara` and `/team-balls/kara` routes would mean maintaining two separate Firebase documents for data that is logically the same content — just different nights. One admin page managing both nights is simpler for the raid leader.

**What was rejected:** Team-scoped Kara routes. Rejected because it forced unnecessary duplication and required the raid leader to navigate between two admin pages for the same task.

---

### History Is Teamless
**Decision:** `/history` fetches from both `team-dick` and `team-balls` 25man-snapshots and merges them.

**Why:** A raid leader wants to see all raid history in one place, filtered by Tuesday or Thursday. Having to navigate to `/team-dick/history` vs `/team-balls/history` to see different nights is poor UX — especially when the goal is to compare performance week-over-week across both teams.

**What was rejected:** Team-scoped history routes. Initially implemented this way, but feedback showed players couldn't find their Tuesday or Thursday history without knowing which team to navigate to. Consolidated into one view.

---

### WCL/RPB/CLA URLs in History Admin, Not 25-Man Admin
**Decision:** The WarcraftLogs URL submission, RPB Sheet URL, and Combat Log URL inputs were removed from 25-Man Admin and moved exclusively to History Admin.

**Why:** These URLs are post-raid metadata — you paste them after the raid ends when logs are uploaded. Putting them in the assignment admin mixes the "setup for tonight's raid" workflow with the "document last night's raid" workflow. Separating them makes both workflows cleaner.

**Workflow:** Assign in 25-Man Admin → After raid: open History Admin → Add Raid Week → paste WCL URL (auto-dates) + sheet URLs.

**What was rejected:** Keeping WCL submit in 25-Man Admin alongside assignments. Rejected because it created UI clutter on the most-used admin page and confused the two workflows.

---

### Snapshot Button Removed from 25-Man Admin
**Decision:** The "Snapshot" button was removed from 25-Man Admin. History entries are now created exclusively via History Admin → Add Raid Week.

**Why:** The snapshot button in 25-Man Admin created orphaned history entries with no WCL/RPB/CLA URLs attached. Raiders would see empty weeks in history with no useful information. The new workflow ensures that every history entry is created with intent and with the supporting URLs attached.

**What was rejected:** Keeping the snapshot button for "quick saves without URLs." Rejected because the History Admin's Add Raid Week modal is fast enough and produces better-quality history entries.

---

### Cube Clickers at Top of Phase 2
**Decision:** In MAGS_P2, Cube Clickers appear at the top (before Tank and Healer assignments) with a gold PRIMARY ASSIGNMENT visual treatment.

**Why:** The cube click coordination is the most critical assignment in the Magtheridon encounter — if cubes aren't clicked simultaneously the raid wipes. It's also the assignment most likely to change on the fly. Burying it below Tank and Healer assignments was causing raid leaders to miss it during high-stress moments.

**What was rejected:** Alphabetical or role-based ordering (Tank → Healer → DPS). Rejected in favor of importance-based ordering.

---

### "Cube Healer" Not "Cube Clicker" for Healer Section
**Decision:** The healer rows in Phase 2 Magtheridon are labeled "Cube Healer" rather than "Cube Clicker."

**Why:** Guild feedback indicated raiders were reading the healer section's "Cube Clicker" labels and assuming those were the people clicking the cubes, without reading further down to the DPS Cube Clickers section. The label change makes the distinction unambiguous — a Cube Healer heals the person clicking, a Cube Clicker is the person clicking.

---

### No Inline Parse Scores on Assignment Badges
**Decision:** Parse scores are shown in the sidebar panel only, not on player name badges within assignment rows.

**Why:** Inline scores on every badge created visual noise that made it harder to quickly scan who is assigned where. The sidebar panel provides a ranked view that is more useful for pre-raid prep. The assignment rows should be clean and focused on names.

**What was rejected:** Keeping inline scores on assignment row badges. Removed based on feedback that the assignments view looked "like an aesthetic mess."

---

### Professions as External Link
**Decision:** The Professions module in the sidebar is an external link to https://professions.nexttopicmoveon.com/ rather than an in-app feature.

**Why:** Professions tracking is a separate concern with its own database and logic. Rather than build it into this platform, it lives on a subdomain. The sidebar link provides discoverability without requiring integration.

---

### Admin Gate via sessionStorage
**Decision:** The password gate stores the unlocked state in `sessionStorage` rather than `localStorage` or a cookie.

**Why:** 
- `sessionStorage` persists across page refreshes (so the raid leader doesn't have to re-enter the password if they accidentally refresh mid-raid) 
- `sessionStorage` clears when the browser tab is closed (so the password doesn't persist indefinitely on shared computers)
- It's a temporary solution anyway — Discord OAuth is the intended replacement

**What was rejected:** `localStorage` (too persistent — survives browser restart). Cookies (more complex to implement for a temporary solution).

---

### Mobile Public-Only
**Decision:** Mobile views are implemented for public pages only. Admin is desktop-only.

**Why:** Raid leaders set up assignments on a desktop before or during raid. Raiders check assignments on their phones. These are different use cases for different devices. Building a full drag-and-drop admin UI for mobile would require significant additional work for minimal practical benefit.

**What was rejected:** Full mobile admin. The drag-and-drop assignment interaction is fundamentally a desktop interaction pattern.

---

### Collapsible Sidebar (Not Hidden)
**Decision:** The sidebar collapses to a 44px icon rail rather than hiding entirely.

**Why:** The sidebar contains the team switcher and parse scores panel which are useful during raid. Hiding it entirely would require a toggle to bring it back. Collapsing to an icon rail gives back horizontal screen space while keeping navigation accessible via icon tooltips.

**What was rejected:** Full hide/show toggle. Rejected because losing the icon rail entirely removes navigation affordance. Also rejected: always-visible sidebar — on smaller screens the sidebar + parse panel consumed too much horizontal space.

---

## Rejected Features

### Attendance Tracker
**Considered:** Show who was present vs absent compared to the full roster for each historical week.

**Not yet built:** Deferred for a future session. The comparison baseline (roster-at-time-of-snapshot vs current-roster) is straightforward but requires careful handling of player name changes and roster changes over time.

### Boss Kill Tracker
**Considered:** Checkboxes per week for which bosses were killed.

**Not yet built:** Deferred. Would be a useful addition to history cards but wasn't urgent enough to build in Session 1.

### Kara History
**Considered:** Historical view for Karazhan snapshots alongside 25-Man history.

**Not yet built:** Intentionally excluded from Session 1. The data exists in Firebase (`raid-kara-snapshots`) but the public history view only shows 25-Man snapshots. Kara history should be a filter tab in the consolidated `/history` view.

### Discord Bot Integration
**Rejected:** Connect the Discord bot's roster JSON directly to Firebase rather than requiring manual import.

**Why rejected:** Adds infrastructure complexity (bot permissions, webhook security) for a workflow that currently works fine. The JSON import takes ~10 seconds and gives the raid leader explicit control over when the roster updates.

### MRT Export (WoW Addon)
**Previously existed in old AdminView:** Export assignments in MRT (Method Raid Tools) addon format.

**Not yet ported to new system:** The feature existed in the old AdminView but wasn't ported during the rebuild. Can be re-added to KaraAdmin if needed.

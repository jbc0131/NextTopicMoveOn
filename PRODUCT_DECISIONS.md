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

### Historical Archives Live in Combat Log Analytics (RPB), Not a Snapshot-Based History Module
**Decision:** The snapshot-based `/history` module was retired. Historical raid archives and analytics are served by the Combat Log Analytics module (`/rpb`), which ingests Warcraft Logs reports directly.

**Why:** The old history module had multiple overlapping concerns — it captured assignment snapshots, stored post-raid URLs (WCL/RPB/CLA), and rendered an iFrame of the old Google Sheets RPB/CLA for analysis. RPB replaces all three: it's the canonical archive, it reads directly from WCL (no manual URL pasting), and it does real analytics instead of embedding a spreadsheet. The snapshot-based approach became dead weight.

**What was rejected:** Keeping `/history` alongside RPB. Parallel archives invite drift and confuse users about where to look for past raids. One canonical source wins.

**Legacy:** Snapshot Firestore collections (`raid-kara-snapshots/*`, `raid/{teamId}/25man-snapshots/*`) still exist with their pre-retirement contents. No code reads or writes them — they can be purged when convenient.

---

### 25-Man Module Renamed to `gruulmag` (Firestore Paths Kept)
**Decision:** The in-code module name was changed from `25man` to `gruulmag`. The sidebar label became "T4 - Gruuls / Mags". Firestore paths stay `raid/{teamId}/25man-*`, and the Firebase helper names (`saveTwentyFiveState`, `fetchTwentyFiveState`) stayed.

**Why:** With T5 content (SSC, TK) landing, "25-Man" stopped being a useful module name — SSC and TK are also 25-man content. The sidebar labels now use WoW's tier naming ("T4 - Gruuls / Mags", "T5 - Serpentshrine Cavern", "T5 - Tempest Keep") which is how the guild refers to them in practice. The Firestore paths were not renamed because the live production documents already exist at those paths and renaming would require a migration.

**What was rejected:** A full rename including Firestore paths. Considered but the migration risk outweighed the cosmetic benefit — every raider opening the page during the rename would hit an empty module.

---

### TeamDashboard Page Removed; Home Page Shows Nested Team Cards
**Decision:** The per-team landing page at `/:teamId` was removed in favor of the home page showing nested Raids / Utility cards with Team Dick / Team Balls sub-cards per raid module.

**Why:** The TeamDashboard's job was to route a user who picked a team into their Tue/Thu schedule. But once the home page started showing both teams side-by-side, TeamDashboard became a one-extra-click detour that didn't add information.

**What was rejected:** Keeping TeamDashboard as an optional intermediate step. Rejected because nobody was navigating to it intentionally — it was just in the way.

**Legacy:** `/:teamId` is now a permanent redirect to `/` to preserve old Discord links.

---

### Raid Date / Raid Leader Fields Removed from Assignment Admin
**Decision:** The raid date and raid leader text inputs in the Gruul/Mag, SSC, and TK admin pages were removed. The Firebase save shape no longer includes them.

**Why:** Raid date auto-populates from the WCL report when an archive is created — manual entry was redundant and invited typos. Raid leader was never displayed anywhere useful. Both fields added UI clutter without earning their space.

**What was rejected:** Keeping the fields for completeness. Rejected because unused UI is worse than missing UI.

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

### Discord OAuth with Password Gate as Fallback
**Decision:** Authentication is two-tier Discord OAuth, with the old shared password (`Admin` / `NTMO6969`) retained as a fallback that only activates when Discord env vars are missing.

**Why:** Discord is already the guild's source of truth for membership and roles — we can derive both site access and admin access from it without maintaining a separate account system. Two tiers (member role for site access, admin role for admin pages) map cleanly to the "public vs admin" split the app already had. The password fallback keeps local dev and misconfigured deploys usable without a hard dependency on Discord being reachable.

**Implementation:** Discord OAuth2 + bot token (used as an API credential from Vercel serverless functions, not hosted). Sessions are signed JWTs in an httpOnly cookie with a 7-day expiry.

**What was rejected:**
- Shared password only — doesn't scale beyond a small group and offers no accountability.
- Firebase Auth — another account system the guild would need to manage; Discord already answers "is this person a guild member."
- Per-user admin assignment in the app — admin is already a Discord role, so duplicating it in the app would drift.

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

### Discord Bot Integration
**Rejected:** Connect the Discord bot's roster JSON directly to Firebase rather than requiring manual import.

**Why rejected:** Adds infrastructure complexity (bot permissions, webhook security) for a workflow that currently works fine. The JSON import takes ~10 seconds and gives the raid leader explicit control over when the roster updates.

### MRT Export (WoW Addon)
**Previously existed in old AdminView:** Export assignments in MRT (Method Raid Tools) addon format.

**Not yet ported to new system:** The feature existed in the old AdminView but wasn't ported during the rebuild. Can be re-added to KaraAdmin if needed.

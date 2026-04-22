# NTMO Raid Platform — Next Session

## Status When We Left Off (March 19, 2026)

Session 2 added Discord OAuth authentication. Everything from Session 1 remains working. Discord OAuth is deployed and live.

### Confirmed Working
- Discord OAuth two-tier authentication (member + admin roles)
- Entire site gated behind Discord login (including TeamSelector landing page)
- Admin pages restricted to DISCORD_ALLOWED_ROLE_IDS
- Public pages accessible to DISCORD_MEMBER_ROLE_IDS
- User avatar, display name, and "Sign out" in header for all logged-in users
- "Admin" button hidden from non-admin users
- Access Denied screen for non-admins navigating to admin URLs
- Password gate fallback when Discord env vars are not configured
- Karazhan admin + public
- 25-Man admin + public (Gruul + Magtheridon)
- Raid History consolidated view (both teams, Tuesday/Thursday filter)
- Raid History admin (add week, edit URLs, delete, night tagging)
- Mobile public views with hamburger nav
- Collapsible sidebar with Professions link
- Parse scores panel (admin has refresh, public does not)
- Manual Add Player in 25-Man admin roster

### Known Issues / Left Off Mid-Fix
- None — session ended cleanly

---

## Immediate Next Steps (Priority Order)

### 0. SSC Module — Remaining Follow-Ups

SSC admin + public shipped 2026-04-22 (`/:teamId/ssc` + `/:teamId/ssc/admin`), but these pieces are deliberately unfinished so the module could ship before TK work started.

**a. WCL parse scores for SSC** — `ParseScoresPanel` is hardcoded to `"kara" | "25man"` and `useWarcraftLogs` returns `{ kara, gruulMags, found }` only. SSC public intentionally omits the parse panel. To wire SSC parses:
- Extend `api/warcraftlogs.js` GraphQL query to request SSC encounter scores
- Expand the cached return shape to include `ssc` (bump `CACHE_VERSION` from v6 → v7 to invalidate stale caches)
- Update `getScoreForPlayer` / `getScoreColor` (`src/shared/useWarcraftLogs.js:184-202`) to recognize the SSC tab
- Update `ParseScoresPanel` `module` prop to accept `"ssc"` and show the SSC parse column
- Render the panel in `SscPublic.jsx` via `AppShell`'s `parsePanelContent`

SSC encounter IDs for WCL: Hydross 623 · Lurker 624 · Leotheras 625 · Karathress 626 · Morogrim 627 · Vashj 628.

**b. SSC snapshots + history** — no snapshot collection exists yet. Plan:
- Add `raid/{teamId}/ssc-snapshots/{id}` collection + `saveSscSnapshot` / `fetchSscSnapshots` / `updateSscSnapshot` / `deleteSscSnapshot` helpers mirroring the 25-man ones in `firebase.js`
- Extend `fetchAllSnapshots` to include SSC snapshots in the merged feed
- Extend `HistoryView` / `HistoryAdmin` to filter by SSC and accept per-raid URL edits for SSC rows
- Snapshot-create UI: either an "Add Raid Week" button in `SscAdmin`, or handle exclusively via `HistoryAdmin → Add Raid Week` (same pattern as 25-man)

**c. ~~TeamDashboard SSC card~~** — Obsolete. The per-team dashboard page (`TeamDashboard.jsx`) was removed in favor of the home page's nested team cards, and the `fetchKaraSummary` / `fetchTwentyFiveSummary` / `fetchSscSummary` / `fetchTkSummary` helpers were pruned with it. If per-raid summaries become useful on the home-page sub-cards, the summary helpers can be re-added then.

**d. Data validation against Dreamscythe** — two slots were added based on common TBC configurations but not verified against actual kill logs:
- Lurker submerge — currently 1 Ambusher + 2 Guardian tanks. If a Coilfang Scalebinder (caster/healer) also spawns on this server, add a tank + interrupt slot for it
- Leotheras P2 — tank split into Elf body vs Shadow demon assumes both exist as distinct targetable entities; confirm on a real pull

**e. Text-area affordance (low priority)** — several SSC slots use `textInput: true` for multi-line notes (Inner Demon Kill Priority, Burn Phase Plan, Core Chain Backup, Whirlwind Drop-Aggro Plan). They render as single-line `<input>`. If users find them cramped in practice, add a `textArea: true` variant to `AssignmentRow` and swap the element.

**f. Pattern re-use for TK** — SSC's three files (`src/shared/constants.js` SSC_* exports + `SSC_BOSSES` wrapper, `SscAdmin.jsx`, `SscPublic.jsx`, plus Firestore helpers) are the template to copy for Tempest Keep. If the duplication between `TwentyFiveAdmin.jsx` / `SscAdmin.jsx` / future `TkAdmin.jsx` becomes painful, factor `AssignmentRow` / `AssignmentPanel` / `ManualAddPlayer` / `RosterPanel` into `shared/components.jsx`. Not worth doing until TK is in flight — YAGNI for now.
[Update 2026-04-22: TK is in flight. `TkAdmin.jsx` / `TkPublic.jsx` are now duplicates of the SSC files. Three near-identical admin components is enough weight to justify extracting the shared `AssignmentRow` / `AssignmentPanel` / `ManualAddPlayer` / roster panel. 25-man's cube-group conflict logic is the one thing that makes a full unification awkward; the simplest path is a generic `<BossRaidAdmin bosses={BOSSES} moduleKey saveState fetchState />` wrapper that SSC and TK use, with 25-man staying on its own for now.]

**g. TK — same follow-ups as SSC.** Parse scores (WCL encounter IDs for TK: Al'ar 730 · Void Reaver 731 · Solarian 732 · Kael'thas 733), snapshots (`raid/{teamId}/tk-snapshots/{id}`), and data validation on Dreamscythe (especially Solarian P1 add composition and Kael P4 Nether Vapor vs Gravity Lapse interactions) all apply symmetrically to TK.

---

### 0.5. Mobile Team-Switcher Passes a String to `go()` That Expects an Object

In `MobileNavOverlay` (`src/shared/components.jsx` ~line 738), the team-switcher buttons call `onClick={() => go(\`/${team.id}${currentModule}\`)}` — passing a string. But `go` is defined as:

```js
const go = (link) => {
  if (link.external) { window.open(link.path, "_blank", ...); onClose(); }
  else { navigate(link.path); onClose(); }
};
```

It accesses `link.external` and `link.path`, so a string argument silently resolves to `navigate(undefined)` → nav doesn't happen. This breaks team-switching on mobile for **every** module (25-man, SSC, TK, History).

**Why:** The nav-link buttons in the same overlay use `go(link)` with a link object, so the pattern was cargo-culted onto the team switcher without noticing the shape mismatch.

**Fix sketch:** either change the team-switcher to call `navigate` directly (`onClick={() => { navigate(\`/${team.id}${currentModule}${adminSuffix}\`); onClose(); }}`), or normalize `go` to accept both shapes. Also consider mirroring the desktop behavior of respecting `adminMode` for the `/admin` suffix — the current hardcoded `/ssc/admin` / `/tk/admin` in `currentModule` will drop public-view mobile users onto `/admin` routes they can't access.

Pre-existing bug, surfaced while wiring TK. Doesn't block any desktop workflows.

---

### 1. Clean Up Root-Level Dead Folders
The repo has root-level `modules/`, `shared/`, `pages/`, and `scripts/` folders that are dead weight from early zip extraction errors. Safe to delete:
- `modules/` (root level)
- `shared/` (root level)
- `pages/` (root level)
- `scripts/` (migration scripts — already run, no longer needed)

None of these are imported by anything. Vite builds exclusively from `src/`.

---

### 2. Kara History
Currently Karazhan has no history view — snapshots are saved but there's no way to browse them publicly.

**Scope:**
- Add Kara snapshots to `/history` public view (or a separate `/history/kara` tab)
- History admin should support editing Kara snapshot URLs (WCL, RPB, CLA)
- Filter: All / Karazhan / Tuesday 25-Man / Thursday 25-Man

**Firebase path for Kara snapshots:** `raid-kara-snapshots/{id}`

---

### 3. Raid History — Additional Features
- **Attendance tracker** — show who was present vs absent compared to the roster that week (skipped in Session 1, can revisit)
- **Boss kill tracker** — checkboxes per week for which bosses were killed (Mag, Gruul, Maulgar, Kara bosses)

---

### 4. Kara Admin — WCL Name Change Persistence
The WCL name editor in the Kara admin sidebar allows setting a custom WCL character name per player. Confirm this persists correctly across saves and re-imports.

---

### 5. 25-Man Admin — Raid Date / Leader Fields
The raid date and raid leader fields still exist in the 25-Man admin. Now that WCL URL submission is in History Admin (which auto-fetches the date), these fields may be redundant. Evaluate whether to remove them.

---

## Longer Term Backlog

- [x] Discord OAuth authentication
- [ ] Kara history in public history view
- [ ] Boss kill tracker on history cards
- [ ] Attendance tracker (compare week roster to current roster)
- [ ] RPB: add a "Damage Taken by Ability" section
- [ ] RPB: fix death counts so the summary shows actual total deaths
- [ ] RPB: expand player death details into separate death sequences (Death 1, Death 2, etc.) with killing damage and heals received between damage events
- [x] TeamDashboard (`/:teamId`) — removed. Home page now shows nested Raid/Utility cards with Team Dick / Team Balls sub-cards per raid module.
- [ ] Dark mode / light mode toggle (currently dark only)
- [ ] Export assignments as image (for posting in Discord)
- [ ] Raid composition analyzer — check coverage of key utilities across all teams
- [ ] Sign-up sheet integration — connect Discord bot roster JSON directly
- [ ] Remove password gate fallback (once Discord OAuth is confirmed stable long-term)

---

## Credentials & Access

| Resource | Details |
|----------|---------|
| GitHub | jbc0131/NextTopicMoveOn |
| Vercel | next-topic-move-on project, jbc0131's account |
| Firebase | nexttopicmoveon project |
| Production URL | https://nexttopicmoveon.com |
| Discord App | NTMO Admin (Discord Developer Portal) |
| Auth method | Discord OAuth (role-based, two-tier) |
| Fallback auth | Admin / NTMO6969 (only when Discord env vars not set) |
| Professions subdomain | https://professions.nexttopicmoveon.com/ |

### Vercel Environment Variables (Auth)

| Variable | Purpose |
|----------|---------|
| `DISCORD_CLIENT_ID` | Discord app OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | Discord app OAuth2 client secret |
| `DISCORD_BOT_TOKEN` | Bot token for guild member role lookup |
| `DISCORD_GUILD_ID` | Dreamscythe Discord server ID |
| `DISCORD_ALLOWED_ROLE_IDS` | Comma-separated role IDs for admin access |
| `DISCORD_MEMBER_ROLE_IDS` | Comma-separated role IDs for site access |
| `AUTH_SECRET` | Random hex string for signing JWT cookies |
| `AUTH_DOMAIN` | Optional, defaults to `https://nexttopicmoveon.com` |

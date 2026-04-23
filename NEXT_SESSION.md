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

**b. Data validation against Dreamscythe** — two slots were added based on common TBC configurations but not verified against actual kill logs:
- Lurker submerge — currently 1 Ambusher + 2 Guardian tanks. If a Coilfang Scalebinder (caster/healer) also spawns on this server, add a tank + interrupt slot for it
- Leotheras P2 — tank split into Elf body vs Shadow demon assumes both exist as distinct targetable entities; confirm on a real pull

**c. Text-area affordance (low priority)** — several SSC slots use `textInput: true` for multi-line notes (Inner Demon Kill Priority, Burn Phase Plan, Core Chain Backup, Whirlwind Drop-Aggro Plan). They render as single-line `<input>`. If users find them cramped in practice, add a `textArea: true` variant to `AssignmentRow` and swap the element.

**d. Extract shared `<BossRaidAdmin>` wrapper** — `TkAdmin.jsx` / `TkPublic.jsx` are near-duplicates of `SscAdmin.jsx` / `SscPublic.jsx`. Factor `AssignmentRow` / `AssignmentPanel` / `ManualAddPlayer` / roster panel into a generic `<BossRaidAdmin bosses={BOSSES} moduleKey saveState fetchState />` that SSC and TK use. 25-man's cube-group conflict logic keeps it on its own.

**e. TK — same follow-ups as SSC.** Parse scores (WCL encounter IDs for TK: Al'ar 730 · Void Reaver 731 · Solarian 732 · Kael'thas 733) and data validation on Dreamscythe (especially Solarian P1 add composition and Kael P4 Nether Vapor vs Gravity Lapse interactions) apply symmetrically to TK.

---

### 1. Kara Admin — WCL Name Change Persistence
The WCL name editor in the Kara admin sidebar allows setting a custom WCL character name per player. Confirm this persists correctly across saves and re-imports.

---

## Longer Term Backlog

- [x] Discord OAuth authentication
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

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
- [ ] TeamDashboard (`/:teamId`) — currently exists but may be sparse; add useful content
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

# NTMO Raid Platform — Next Session

## Status When We Left Off (March 18–19, 2026)

Session 1 was a full rebuild + overhaul. Everything listed in CHANGELOG.md is deployed and working.

### ✅ Confirmed Working
- All admin password gates (Admin / NTMO6969)
- Karazhan admin + public
- 25-Man admin + public (Gruul + Magtheridon)
- Raid History consolidated view (both teams, Tuesday/Thursday filter)
- Raid History admin (add week, edit URLs, delete, night tagging)
- Mobile public views with hamburger nav
- Collapsible sidebar with Professions link
- Parse scores panel (admin has refresh, public does not)
- Manual Add Player in 25-Man admin roster

### ⏸ Known Issues / Left Off Mid-Fix
- None — session ended cleanly after admin gate was deployed and confirmed working

---

## Immediate Next Steps (Priority Order)

### 1. Discord OAuth (Phase 5)
Replace the simple `Admin` / `NTMO6969` password gate with Discord OAuth so raid officers can log in with their Discord accounts.

**What to replace:**
- `AdminGate` component in `src/shared/components.jsx`
- `ADMIN_SESSION_KEY` sessionStorage logic
- The `adminMode` prop check in `AppShell`

**What to keep:**
- The `AppShell adminMode` prop pattern — just swap the gate implementation
- All admin routes and functionality stay exactly the same

**Suggested approach:**
- Discord OAuth via Vercel serverless (`/api/auth/discord`)
- Store session in a signed cookie or Vercel KV
- Allowlist specific Discord user IDs (not usernames — they change)

---

### 2. Clean Up Root-Level Dead Folders
The repo has root-level `modules/`, `shared/`, `pages/`, and `scripts/` folders that are dead weight from early zip extraction errors. Safe to delete:
- `modules/` (root level)
- `shared/` (root level)
- `pages/` (root level)
- `scripts/` (migration scripts — already run, no longer needed)

None of these are imported by anything. Vite builds exclusively from `src/`.

---

### 3. Kara History
Currently Karazhan has no history view — snapshots are saved but there's no way to browse them publicly.

**Scope:**
- Add Kara snapshots to `/history` public view (or a separate `/history/kara` tab)
- History admin should support editing Kara snapshot URLs (WCL, RPB, CLA)
- Filter: All / Karazhan / Tuesday 25-Man / Thursday 25-Man

**Firebase path for Kara snapshots:** `raid-kara-snapshots/{id}`

---

### 4. Raid History — Additional Features
- **Attendance tracker** — show who was present vs absent compared to the roster that week (skipped in Session 1, can revisit)
- **Boss kill tracker** — checkboxes per week for which bosses were killed (Mag, Gruul, Maulgar, Kara bosses)

---

### 5. Kara Admin — WCL Name Change Persistence
The WCL name editor in the Kara admin sidebar allows setting a custom WCL character name per player. Confirm this persists correctly across saves and re-imports.

---

### 6. 25-Man Admin — Raid Date / Leader Fields
The raid date and raid leader fields still exist in the 25-Man admin. Now that WCL URL submission is in History Admin (which auto-fetches the date), these fields may be redundant. Evaluate whether to remove them.

---

## Longer Term Backlog

- [ ] Discord OAuth authentication
- [ ] Kara history in public history view
- [ ] Boss kill tracker on history cards
- [ ] Attendance tracker (compare week roster to current roster)
- [ ] TeamDashboard (`/:teamId`) — currently exists but may be sparse; add useful content
- [ ] Dark mode / light mode toggle (currently dark only)
- [ ] Export assignments as image (for posting in Discord)
- [ ] Raid composition analyzer — check coverage of key utilities across all teams
- [ ] Sign-up sheet integration — connect Discord bot roster JSON directly

---

## Credentials & Access

| Resource | Details |
|----------|---------|
| GitHub | jbc0131/NextTopicMoveOn |
| Vercel | next-topic-move-on project, jbc0131's account |
| Firebase | nexttopicmoveon project |
| Production URL | https://nexttopicmoveon.com |
| Admin username | Admin |
| Admin password | NTMO6969 (temporary until Discord OAuth) |
| Professions subdomain | https://professions.nexttopicmoveon.com/ |

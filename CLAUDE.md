# NTMO Raid Platform — Claude Context File

> Read this at the start of every session before touching any code.

## What This Is

NTMO (Next Topic Move On) is a private raid assignment management platform for a World of Warcraft TBC Anniversary guild on the **Dreamscythe** server. It manages raid assignments across two teams and serves as a live, real-time coordination tool on raid nights.

**Live deployment:** https://nexttopicmoveon.com
**GitHub:** jbc0131/NextTopicMoveOn — connected to Vercel for auto-deploy on push to `main`
**Stack:** React/JSX · Vite · Firebase (Firestore) · Vercel (hosting + serverless API routes)

---

## Teams

| Team | Route Prefix | Raid Night | Firebase Path |
|------|-------------|------------|---------------|
| **Team Dick** | `/team-dick` | Tuesday | `raid/team-dick/` |
| **Team Balls** | `/team-balls` | Thursday | `raid/team-balls/` |

Karazhan and Raid History are **teamless** — shared across both teams at `/kara` and `/history`.

---

## Current Status (as of March 19, 2026)

### Working
- Full React SPA with React Router v6
- Firebase Firestore real-time sync for all live state
- **Discord OAuth authentication** — two-tier, role-based:
  - **Member roles** (`DISCORD_MEMBER_ROLE_IDS`) — required to access any page on the site
  - **Admin roles** (`DISCORD_ALLOWED_ROLE_IDS`) — required to access `/admin` pages
  - Password gate fallback when Discord env vars are not configured
- Entire site gated behind Discord login (including `/` landing page)
- User avatar, display name, and "Sign out" shown in header for all logged-in users
- "Admin" button only visible to users with admin roles
- Karazhan admin (`/kara/admin`) — import Tue/Thu JSON rosters, drag-and-drop team assignments, spec cycling, conflict detection, copy Discord output, WCL parse scores, snapshot/history
- T4 (Gruul / Mag) admin (`/:teamId/gruulmag/admin`, aliased as "T4 - Gruuls / Mags" in sidebar) — drag-and-drop Gruul/Mag assignments, manual player add, import JSON, save/auto-save to Firebase. Module is called `gruulmag` in code; Firestore paths remain `25man-*` to preserve live data
- T5 SSC admin (`/:teamId/ssc/admin`, sidebar: "T5 - Serpentshrine Cavern") — 6-boss SSC module, same admin pattern
- T5 TK admin (`/:teamId/tk/admin`, sidebar: "T5 - Tempest Keep") — 4-boss TK module, same admin pattern
- Raid History (`/history`) — consolidated view of both teams, All/Tuesday/Thursday filter, RPB iFrame, CLA iFrame, collapsible assignments
- Raid History Admin (`/history/admin`) — add raid week, edit WCL/RPB/CLA URLs, delete snapshots, tag night, night auto-fetched from WCL URL
- Public views for all modules — read-only, search by name, mobile responsive
- Mobile hamburger nav with full-screen overlay
- Collapsible desktop sidebar (expands/collapses to icon rail)
- WarcraftLogs parse scores sidebar (admin only has refresh button; public does not)
- Professions module link → https://professions.nexttopicmoveon.com/
- TeamSelector landing page at `/`

### Not Yet Built
- Kara history (intentionally excluded — 25-man only)
- Attendance tracker on history
- Phase 5 features (see NEXT_SESSION.md)

---

## Architecture

### File Structure

```
src/
  App.jsx                          — React Router routes
  main.jsx                         — Entry point
  shared/
    theme.js                       — Design tokens (Palantir Blueprint dark)
    constants.js                   — Game data (MAGS_P2, KARA_TUE_TEAMS, etc.)
    firebase.js                    — All Firebase helpers
    useWarcraftLogs.js             — WCL hook, cache key v6
    auth.js                        — useAuth hook, getLoginUrl, getLogoutUrl helpers
    components.jsx                 — ALL shared UI components (AppShell, NavSidebar, etc.)
  pages/
    TeamSelector.jsx               — Landing page / (Discord auth gated)
  modules/
    kara/
      KaraAdmin.jsx                — /kara/admin
      KaraPublic.jsx               — /kara
    gruulmag/
      GruulmagAdmin.jsx            — /:teamId/gruulmag/admin ("T4 - Gruuls / Mags" in sidebar)
      GruulmagPublic.jsx           — /:teamId/gruulmag
    ssc/
      SscAdmin.jsx                 — /:teamId/ssc/admin ("T5 - Serpentshrine Cavern")
      SscPublic.jsx                — /:teamId/ssc
    tk/
      TkAdmin.jsx                  — /:teamId/tk/admin ("T5 - Tempest Keep")
      TkPublic.jsx                 — /:teamId/tk
    history/
      HistoryView.jsx              — /history (public, both teams)
      HistoryAdmin.jsx             — /history/admin
api/
  auth/
    discord.js                     — Vercel serverless: redirect to Discord OAuth
    callback.js                    — Vercel serverless: OAuth callback, role check, set JWT cookie
    me.js                          — Vercel serverless: check auth state from cookie
    logout.js                      — Vercel serverless: clear auth cookie
  warcraftlogs.js                  — Vercel serverless: WCL GraphQL proxy
  warcraftlogs-report.js           — Vercel serverless: WCL v1 REST proxy (fights)
```

### Routes

```
/                          → TeamSelector (Discord login required)
/kara                      → KaraPublic (teamless, member role required)
/kara/admin                → KaraAdmin (teamless, admin role required)
/history                   → HistoryView (teamless, both teams, member role required)
/history/admin             → HistoryAdmin (admin role required)
/:teamId                   → Legacy redirect to / (the per-team dashboard page was removed in favor of the home page's nested team cards)
/:teamId/gruulmag          → GruulmagPublic (member role required)
/:teamId/gruulmag/admin    → GruulmagAdmin (admin role required)
/:teamId/ssc               → SscPublic
/:teamId/ssc/admin         → SscAdmin
/:teamId/tk                → TkPublic
/:teamId/tk/admin          → TkAdmin
Legacy redirects: /:teamId/25man → /:teamId/gruulmag, /:teamId/25man/admin → /:teamId/gruulmag/admin
Legacy redirects: /team-dick/history → /history, etc.
```

### Firebase Schema

```
raid-kara/live                        — Kara live state (teamless)
raid-kara-snapshots/{id}              — Kara snapshots
raid/{teamId}/25man-tue/live          — Tuesday T4 (Gruul/Mag) live state [path kept as "25man-*" post-rename]
raid/{teamId}/25man-thu/live          — Thursday T4 (Gruul/Mag) live state [path kept as "25man-*" post-rename]
raid/{teamId}/25man-snapshots/{id}    — T4 snapshots (has night: "tue"|"thu" field; module metadata still "25man")
raid/{teamId}/ssc/live                — T5 SSC live state
raid/{teamId}/tk/live                 — T5 TK live state
```

### Firestore Rules
```javascript
match /raid/{teamId} { allow read, write: if true; }
match /raid/{teamId}/{module}/{docId} { allow read, write: if true; }
match /raid/{teamId}/25man-snapshots/{snapId} { allow read, write: if true; }
match /raid-kara/{docId} { allow read, write: if true; }
match /raid-kara-snapshots/{snapId} { allow read, write: if true; }
```

---

## Authentication

### Discord OAuth (Primary)
- **Two-tier role-based access** via Discord OAuth2 + bot token for guild role lookup
- **Member tier** — `DISCORD_MEMBER_ROLE_IDS` — grants access to all public pages
- **Admin tier** — `DISCORD_ALLOWED_ROLE_IDS` — grants access to `/admin` pages
- Bot is not hosted anywhere — bot token is used as an API credential in Vercel serverless functions to call `GET /guilds/{guildId}/members/{userId}` at login time
- Sessions stored as signed JWT in `httpOnly` `Secure` `SameSite=Lax` cookie (`ntmo_auth`), 7-day expiry
- Auth state cached in `sessionStorage` for 5 minutes to avoid flash on page navigation
- User info (avatar, display name) shown in header with "Sign out" link
- "Admin" button hidden from non-admin users; Access Denied screen if they navigate to admin URLs directly

### Password Gate (Fallback)
- Only activates when Discord env vars are not configured (e.g. local dev, or if Vercel env vars are missing)
- Username: `Admin` / Password: `NTMO6969`
- Stored in `sessionStorage` (`ntmo_admin_unlocked`)
- Only gates admin pages in fallback mode (public pages are open)

### Vercel Environment Variables

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

### Discord Developer Portal Requirements
- OAuth2 redirect URI: `https://nexttopicmoveon.com/api/auth/callback`
- Bot: **Server Members Intent** must be enabled (Privileged Gateway Intents)
- Bot invited to server with Read Members permission

---

## Key Design Decisions

- **Kara is teamless** — single `/kara` route, single Firebase doc. Tuesday = Team Dick roster, Thursday = Team Balls roster. Both managed in one admin page.
- **History is teamless** — `/history` fetches from both `team-dick` and `team-balls` 25man-snapshots in parallel, merges and sorts by date.
- **WCL/RPB/CLA URLs live in History Admin** — removed from T4 admin. Workflow: assign in T4/T5 admin → add to history in History Admin.
- **Snapshot button removed from T4 admin** — creating history entries now happens exclusively via History Admin → Add Raid Week.
- **T4/T5 sidebar naming** — the 25-man module was renamed `gruulmag` (sidebar: "T4 - Gruuls / Mags"). SSC sidebar: "T5 - Serpentshrine Cavern". TK sidebar: "T5 - Tempest Keep". Internal Firestore paths for the T4 module remain `raid/{teamId}/25man-*` to preserve production data; the `saveTwentyFiveState` / `fetchTwentyFiveState` function names also stayed. SSC and TK use their own identifiers (`ssc`, `tk`) end-to-end.
- **Auth is two-tier** — member role for site access, admin role for admin pages. All pages require Discord login. Password gate is fallback only.
- **Parse scores refresh button** — only shown in admin views (`showRefresh` prop on `ParseScoresPanel`). Hidden in public views.
- **Sidebar collapsible** — state lives in `AppShell`, collapses to 44px icon rail. Parse panel and team switcher hide when collapsed.
- **Mobile** — sidebar hidden entirely on < 768px. Hamburger opens full-screen overlay nav. Parse scores hidden on mobile. Public views only; admin is desktop-only.
- **No emojis in structural UI** — removed from all headers, role labels, boss panels, nav. Kept only in Discord copy output and utility tracker indicators.

---

## WarcraftLogs Integration

**API files (Vercel serverless):**
- `api/warcraftlogs.js` — GraphQL proxy, POST `{ players: [{name, role}] }`, returns `{ [name]: { kara, gruulMags, found } }`
- `api/warcraftlogs-report.js` — v1 REST proxy, `fights` action returns `{ title, start, end, fights[], friendlies[] }`

**Hook:** `useWarcraftLogs(roster, { teamId, module })` — cache key `wcl_scores_v6_{teamId}_{module}`, 10min TTL via sessionStorage

---

## Deployment Workflow

**CRITICAL:** GitHub web editor is the deploy mechanism. No local repo.
- Edit files directly in GitHub → commit → Vercel auto-deploys from `main` branch
- Root-level `modules/`, `shared/`, `pages/` folders exist as dead weight from early zip extraction errors — leave them, they don't affect the build (Vite only bundles what `src/App.jsx` imports)
- Always edit files under `src/` — that's what Vite builds from

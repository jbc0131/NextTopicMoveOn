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

## Current Status (as of March 18, 2026)

### ✅ Working
- Full React SPA with React Router v6
- Firebase Firestore real-time sync for all live state
- Karazhan admin (`/kara/admin`) — import Tue/Thu JSON rosters, drag-and-drop team assignments, spec cycling, conflict detection, copy Discord output, WCL parse scores, snapshot/history
- 25-Man Raids admin (`/:teamId/25man/admin`) — drag-and-drop Gruul/Mag assignments, manual player add, import JSON, save/auto-save to Firebase
- Raid History (`/history`) — consolidated view of both teams, All/Tuesday/Thursday filter, RPB iFrame, CLA iFrame, collapsible assignments
- Raid History Admin (`/history/admin`) — add raid week, edit WCL/RPB/CLA URLs, delete snapshots, tag night, night auto-fetched from WCL URL
- Public views for all modules — read-only, search by name, mobile responsive
- Mobile hamburger nav with full-screen overlay
- Collapsible desktop sidebar (expands/collapses to icon rail)
- Admin password gate: username `Admin` / password `NTMO6969` (sessionStorage, persists across refreshes)
- WarcraftLogs parse scores sidebar (admin only has refresh button; public does not)
- Professions module link → https://professions.nexttopicmoveon.com/
- TeamSelector landing page at `/`

### ❌ Not Yet Built
- Discord OAuth authentication (replacing the simple password gate)
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
    components.jsx                 — ALL shared UI components (AppShell, NavSidebar, etc.)
  pages/
    TeamSelector.jsx               — Landing page /
    TeamDashboard.jsx              — /:teamId dashboard
  modules/
    kara/
      KaraAdmin.jsx                — /kara/admin
      KaraPublic.jsx               — /kara
    25man/
      TwentyFiveAdmin.jsx          — /:teamId/25man/admin
      TwentyFivePublic.jsx         — /:teamId/25man
    history/
      HistoryView.jsx              — /history (public, both teams)
      HistoryAdmin.jsx             — /history/admin
api/
  warcraftlogs.js                  — Vercel serverless: WCL GraphQL proxy
  warcraftlogs-report.js           — Vercel serverless: WCL v1 REST proxy (fights)
```

### Routes

```
/                          → TeamSelector
/kara                      → KaraPublic (teamless)
/kara/admin                → KaraAdmin (teamless, password gated)
/history                   → HistoryView (teamless, both teams)
/history/admin             → HistoryAdmin (password gated)
/:teamId                   → TeamDashboard
/:teamId/25man             → TwentyFivePublic
/:teamId/25man/admin       → TwentyFiveAdmin (password gated)
Legacy redirects: /team-dick/history → /history, etc.
```

### Firebase Schema

```
raid-kara/live                        — Kara live state (teamless)
raid-kara-snapshots/{id}              — Kara snapshots
raid/{teamId}/25man-tue/live          — Tuesday 25-man live state
raid/{teamId}/25man-thu/live          — Thursday 25-man live state
raid/{teamId}/25man-snapshots/{id}    — 25-man snapshots (has night: "tue"|"thu" field)
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

## Key Design Decisions

- **Kara is teamless** — single `/kara` route, single Firebase doc. Tuesday = Team Dick roster, Thursday = Team Balls roster. Both managed in one admin page.
- **History is teamless** — `/history` fetches from both `team-dick` and `team-balls` 25man-snapshots in parallel, merges and sorts by date.
- **WCL/RPB/CLA URLs live in History Admin** — removed from 25-Man admin. Workflow: assign in 25-Man admin → add to history in History Admin.
- **Snapshot button removed from 25-Man admin** — creating history entries now happens exclusively via History Admin → Add Raid Week.
- **Admin gate uses sessionStorage** — survives page refresh, clears on tab close. Ready to swap for Discord OAuth.
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

---

## Admin Credentials (Temporary)

- **Username:** Admin
- **Password:** NTMO6969
- Replacing with Discord OAuth in next session

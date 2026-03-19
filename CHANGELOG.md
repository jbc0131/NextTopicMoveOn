# NTMO Raid Platform — Changelog

---

## Session 2 — March 19, 2026

### Discord OAuth Authentication

Replaced the simple password gate with a two-tier Discord OAuth system. The entire site now requires Discord login.

---

### Authentication System
- **Two-tier role-based access** — member roles for site access, admin roles for admin pages
- **Discord OAuth2 flow** — 4 Vercel serverless endpoints (`/api/auth/discord`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`)
- **Bot token role check** — uses Discord bot API to verify guild membership and roles at login time (bot is not hosted, just an API credential)
- **Signed JWT cookie** — `httpOnly`, `Secure`, `SameSite=Lax`, 7-day expiry, HMAC-SHA256 signed with `AUTH_SECRET`
- **Session caching** — auth state cached in `sessionStorage` for 5 minutes to prevent flash on navigation
- **Password gate fallback** — old `Admin` / `NTMO6969` gate activates only when Discord env vars are not configured

### UI Changes
- **All pages require login** — including TeamSelector landing page at `/`
- **User info in header** — Discord avatar, display name, and "Sign out" link shown for all logged-in users on all pages
- **Admin button visibility** — "Admin" button in header only visible to users with admin roles
- **Access Denied screen** — shown when non-admin users navigate to admin URLs, with user name, "Sign out" and "Go back" options
- **Discord login gate** — branded login page with Discord logo and purple "Sign in with Discord" button (white text)

### Files Added
- `api/auth/discord.js` — redirects to Discord OAuth page
- `api/auth/callback.js` — exchanges code, checks guild roles, sets JWT cookie
- `api/auth/me.js` — returns auth state from cookie
- `api/auth/logout.js` — clears auth cookie
- `src/shared/auth.js` — `useAuth()` hook, `getLoginUrl()`, `getLogoutUrl()`, `clearAuthCache()`

### Files Modified
- `src/shared/components.jsx` — `DiscordLoginGate`, `PasswordGate` (renamed from `AdminGate`), `AppShell` auth logic, `AppHeader` user info + role-based admin button
- `src/pages/TeamSelector.jsx` — added auth gate wrapping the landing page

### Vercel Environment Variables Required
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`, `DISCORD_ALLOWED_ROLE_IDS`, `DISCORD_MEMBER_ROLE_IDS`
- `AUTH_SECRET`, `AUTH_DOMAIN` (optional, defaults to `https://nexttopicmoveon.com`)

### Bug Fixes
- Fixed OAuth redirect URI using `VERCEL_URL` (returns deployment URL, not custom domain) — now uses `AUTH_DOMAIN` env var defaulting to production domain

---

## Session 1 — March 18–19, 2026

### Initial Rebuild + Full UI Overhaul

This was the founding session — a complete architectural rebuild from the old single-file AdminView/PublicView system to a modular, multi-route React application.

---

### Architecture

- **Full rebuild** — replaced monolithic `src/AdminView.jsx` and `src/PublicView.jsx` with a modular structure under `src/modules/`, `src/pages/`, and `src/shared/`
- **React Router v6** — proper SPA routing replacing URL-parameter-based navigation
- **Shared component library** — `src/shared/components.jsx` with AppShell, NavSidebar, ModuleHeader, BossPanel, RoleHeader, ParseScoresPanel, WarningBar, StatusChip, etc.
- **Design system** — `src/shared/theme.js` with Palantir Blueprint dark theme tokens (charcoal, Inter font)
- **Firebase schema migration** — split flat docs into subcollections per module

### Routes Added
- `/` — TeamSelector landing page
- `/kara` + `/kara/admin` — Karazhan public + admin (teamless)
- `/:teamId/25man` + `/:teamId/25man/admin` — 25-Man public + admin
- `/:teamId/history` + `/:teamId/history/admin` → redirected to `/history` and `/history/admin`
- `/history` + `/history/admin` — consolidated Raid History (both teams)
- Legacy redirects for old team-scoped URLs

---

### Karazhan Module

- Teamless `/kara` route — Tuesday = Team Dick roster, Thursday = Team Balls
- Import Tuesday + Thursday JSON rosters separately
- Conflict detection for players raiding different classes on different nights
- Spec cycling (Kara-only)
- Utility tracker per team (Remove Curse, Dispel Magic, etc.)
- Copy Discord button per night (`<@userId>` mention format)
- WCL parse scores panel in left sidebar
- Snapshot + WCL submit (lock week)
- Week slider to browse history

### 25-Man Raids Module

- Gruul's Lair + Magtheridon assignment panels
- **Magtheridon tab loads first** (first raid of the night)
- **Phase 2 panel on left**, Phase 1 on right
- **Cube Clickers at top** of Phase 2 with gold PRIMARY ASSIGNMENT treatment
- Cube Clickers labeled "Cube Healer" in healer section (not "Cube Clicker") to avoid confusion
- Warlock Curses + Trash Interrupts moved to bottom of assignments
- Drag-and-drop assignments with conflict detection (cube group validation)
- Manual Add Player — name + class + spec selector, adds draggable badge to roster
- Segmented control tab bar (not outline buttons)
- Responsive panel wrapping (stack before clipping)
- WCL submit, snapshot, week slider **removed** (moved to History Admin)

### Raid History Module

- **Consolidated `/history`** — fetches from both `team-dick` and `team-balls` 25man-snapshots in parallel
- Filter: All / Tuesday / Thursday
- Each week card expands to show: RPB Sheet iFrame → CLA iFrame → collapsible Raid Assignments
- **History Admin** (`/history/admin`):
  - Add Raid Week modal — select night, paste WCL/RPB/CLA URLs, auto-fetches date from WCL
  - Edit existing weeks — WCL URL, RPB Sheet, CLA URL, Raid Night selector
  - Delete with confirmation
  - "Night unset" warning badge + auto-expand for untagged snapshots
  - Team Dick / Team Balls chip on each card

---

### UI Polish (Palantir-inspired)

- **Role headers** — visible tint background + 3px colored left border per role color (blue/green/red)
- **Boss panel headers** — 4px accent bar, larger bold title, tinted background
- **Parse scores panel** — thin blue bar accent, muted label, full sidebar height
- **Warning bars** — amber intent (not red), left border accent
- **Global dark scrollbar** — injected via AppShell style tag
- **Assignment row labels** — fixed 180px width regardless of marker icon
- **Cube Clicker rows** — two-column grid when two players assigned per cube
- **No emojis in structural UI** — removed from all headers, labels, nav; kept in Discord output and utility tracker indicators

### Mobile

- Sidebar hidden entirely on < 768px
- Hamburger `☰` in header opens full-screen overlay nav
- Overlay includes module links + team switcher
- Parse scores hidden on mobile (not important on raid night mobile view)
- Boss panels + Warlock Curses/Trash Interrupts wrap vertically before clipping
- ModuleHeader suppressed on mobile; LIVE badge + timestamp shown via `mobileActions` prop
- Public view only — admin is desktop-only

### Sidebar

- **Collapsible** — `«` / `»` toggle collapses to 44px icon rail
- Collapsed state hides parse panel and team switcher
- Tooltips on icon rail show full label on hover
- **Professions** module added — opens https://professions.nexttopicmoveon.com/ in new tab with `↗` indicator

### Admin Gate

- Simple password gate on all admin routes via `AppShell adminMode` prop
- Credentials: `Admin` / `NTMO6969`
- Stored in `sessionStorage` — survives refresh, clears on tab close
- Ready to swap for Discord OAuth

### WarcraftLogs

- Parse scores shown in sidebar panel on all admin views
- **Refresh button** visible in admin only (`showRefresh` prop on `ParseScoresPanel`)
- Inline parse scores **removed** from assignment row player badges
- WarcraftLogs/RPB/CLA URL submission moved entirely to History Admin

### Firebase

- Migration scripts for new subcollection schema
- `night` field added to 25-man snapshots (`"tue"` | `"thu"`)
- Untagged old snapshots can be fixed via History Admin night selector

---

### Bug Fixes

- `teamId is not defined` crash in KaraAdmin — stale dependency array references removed
- `ParseScoresPanel` not exported from `src/shared/components.jsx` — file path mismatch (`src/` vs root-level folders)
- JSX syntax error in AppHeader — stray `{}` wrapper around ternary
- Team switcher dropping `/admin` suffix when switching teams on history route
- Search bar appearing on mobile despite ModuleHeader suppression — fixed with `mobileActions` prop pattern
- Warlock Curses / Trash Interrupts not wrapping on mobile — added `flexWrap: wrap` + `minWidth: 260`

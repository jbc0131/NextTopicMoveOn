# NTMO Raid Platform — Product Specification

**Version:** 2.0.0
**Last updated:** April 23, 2026
**Guild:** Next Topic Move On (NTMO)
**Server:** Dreamscythe (WoW TBC Anniversary)

---

## Overview

The NTMO Raid Platform is a private, guild-internal web application for managing World of Warcraft TBC Anniversary raid assignments. It provides a real-time, drag-and-drop assignment interface for raid leaders, a live public view for raiders to check their assignments, and WCL-backed historical analytics.

**Core value:** Replace Discord-based manual assignment coordination with a structured, persistent, real-time tool that works on desktop and mobile.

---

## Teams

| Team | Raid Night | Content |
|------|-----------|---------|
| Team Dick  | Tuesday  | Karazhan + T4 (Gruul / Mag) + T5 (SSC, TK) |
| Team Balls | Thursday | Karazhan + T4 (Gruul / Mag) + T5 (SSC, TK) |

---

## Modules

### Karazhan — `/kara` (teamless)

10-man content. Three teams of 10, each split into 2 groups of 5. Runs Tuesday AND Thursday — both nights use the same admin page, same Firebase document.

**Roster management:**
- Import Tuesday JSON (Team Dick players)
- Import Thursday JSON (Team Balls players)
- Conflict detection for players raiding different classes on different nights (split into `_tue` / `_thu` roster entries)
- Spec cycling — click to cycle through all specs for a player's class

**Assignment UI:**
- Drag-and-drop players from roster sidebar into team group slots
- 3 teams × 2 groups × 5 slots = 30 slots per night
- Utility tracker per team (Remove Curse, Dispel Magic, Cure Poison, Cure Disease, Interrupt, Bloodlust)
- Tank / Healer counts per team

**Discord output:** per-night "Copy Discord" button using `<@discordUserId>` mentions grouped by team and group.

---

### T4 Gruul / Mag — `/:teamId/gruulmag` (per team)

25-man. Sidebar label: "T4 - Gruuls / Mags". Module is called `gruulmag` in code; Firestore paths stay `raid/{teamId}/25man-{night}/*` to preserve live production data.

**Bosses:**
1. **Magtheridon** (tab loads first — first boss of the night)
   - Phase 2 panel on LEFT (primary), Phase 1 Channelers on RIGHT
   - Cube Clickers at top of Phase 2 with gold PRIMARY ASSIGNMENT styling
   - Cube Healers labeled distinctly from Cube Clickers
2. **Gruul's Lair** — High King Maulgar + Gruul the Dragonkiller

**General assignments** (bottom of page, shared across both bosses): Warlock Curses, Trash Interrupts.

**Roster:** JSON import, Manual Add Player, role filter (All / Tank / Healer / DPS).

**Assignment UI:** Drag-and-drop with cube-group conflict detection, text input for Shatter Groups (Gruul).

---

### T5 Serpentshrine Cavern — `/:teamId/ssc` (per team)

Sidebar label: "T5 - Serpentshrine Cavern". 6 bosses: Hydross, Lurker Below, Leotheras, Karathress, Morogrim, Vashj.

Same admin pattern as T4: JSON roster import, drag-and-drop, boss tab bar, auto-save to Firestore. Firestore path: `raid/{teamId}/ssc/live`.

---

### T5 Tempest Keep — `/:teamId/tk` (per team)

Sidebar label: "T5 - Tempest Keep". 4 bosses: Al'ar, Void Reaver, Solarian, Kael'thas.

Same admin pattern as SSC. Firestore path: `raid/{teamId}/tk/live`.

---

### Combat Log Analytics (RPB) — `/rpb`

WCL-driven historical archive and analytics. Ingests Warcraft Logs report URLs and computes per-raid, per-fight, and per-player metrics directly from WCL data. Replaces the retired snapshot-based `/history` module.

Single-raid drilldown available at `/rpb/:raidId`.

---

### Professions

External link to https://professions.nexttopicmoveon.com/ — opens in new tab. Listed as a utility link in the sidebar.

---

## Authentication

All pages require Discord login.

**Two tiers (role-based, checked at OAuth callback via the bot's guild-members API):**
- **Member roles** (`DISCORD_MEMBER_ROLE_IDS`) — access to any page
- **Admin roles** (`DISCORD_ALLOWED_ROLE_IDS`) — access to `/admin` pages

Sessions are signed JWTs in an `httpOnly` `Secure` `SameSite=Lax` cookie (`ntmo_auth`), 7-day expiry. User info (avatar, display name) shown in the header with "Sign out". The "Admin" header button is hidden from non-admins.

**Fallback:** when Discord env vars are not configured, a simple `Admin` / `NTMO6969` password gate activates on admin routes only (public pages stay open).

---

## Admin Features

### Parse Scores Sidebar
- Shows WarcraftLogs Median Performance Average for all roster players
- Kara scores on Kara admin, Gruul/Mags scores on Gruul/Mag admin
- SSC and TK parse-score wiring is pending (see NEXT_SESSION.md)
- Sorted descending by score
- WCL name override — click a player's name to set a different WarcraftLogs character name
- **Refresh button** visible in admin only (not shown in public views)
- 10-minute cache via `sessionStorage`

### Auto-save
Assignment admin pages auto-save to Firestore after ~4s of idle time. Manual save button also present. Local `localStorage` mirror as an offline fallback.

---

## Navigation

### Desktop Sidebar
- Collapsible — `«` / `»` toggle collapses to 44px icon rail
- Sections: **Raids** (T4 Karazhan, T4 Gruuls / Mags, T5 Serpentshrine Cavern, T5 Tempest Keep) and **Utility** (Combat Log Analytics, Profile, Professions ↗)
- Collapsed state hides: parse scores panel, team switcher
- Team switcher (below parse panel) — switches between Team Dick and Team Balls, preserving current module and admin/public state
- Team switcher hidden on teamless routes (kara, rpb)

### Mobile (< 768px)
- Sidebar hidden entirely
- Hamburger `☰` in top-right opens full-screen overlay nav
- Overlay: module links + team switcher
- Admin views are desktop-only

---

## WarcraftLogs Integration

**API files (Vercel serverless):**
- `api/warcraftlogs.js` — GraphQL proxy, returns parse scores for the roster (powers the parse scores panel)

RPB's WCL ingestion runs server-side via `RPB/server/rpbImportService.js`, invoked through `api/rpb-import.js`.

**Current score types returned:** `kara`, `gruulMags`. SSC and TK pending — see NEXT_SESSION.md for encounter IDs and the plumbing plan.

**Parse color scale (WarcraftLogs official):**

| Score | Color |
|-------|-------|
| 100 | Gold (`#e5cc80`) |
| 99 | Pink (`#e268a8`) |
| 95–98 | Orange (`#ff8000`) |
| 75–94 | Purple (`#a335ee`) |
| 50–74 | Blue (`#0070dd`) |
| 25–49 | Green (`#1eff00`) |
| 0–24 | Grey (`#9d9d9d`) |

**Cache key:** `wcl_scores_v6_{teamId}_{module}` in `sessionStorage`, 10-minute TTL.

---

## Public View Features

- **Search by name** — highlights matching player badges across all assignment rows
- **Live sync badge** — green dot + "LIVE" when Firebase is connected
- **Mobile responsive** — panels stack vertically before clipping
- **Read-only** — no drag-and-drop; changes published by admin appear in real-time via Firestore `onSnapshot`

---

## Data Architecture

### Firebase Firestore (live state only)

| Path | Contents |
|------|----------|
| `raid-kara/live` | Kara live state (rosterTue, rosterThu, assignments, specOverrides, per-night raid dates) |
| `raid/{teamId}/25man-tue/live` | Tuesday T4 (Gruul/Mag) live state |
| `raid/{teamId}/25man-thu/live` | Thursday T4 (Gruul/Mag) live state |
| `raid/{teamId}/ssc/live` | T5 SSC live state |
| `raid/{teamId}/tk/live` | T5 TK live state |

Live-state documents contain: `roster`, `assignments`, `textInputs`, `dividers`, `updatedAt`. (Kara has its own richer shape.)

Historical archives are served by RPB, which persists ingested WCL reports separately. The assignment modules do not write snapshot collections.

**Legacy:** `raid-kara-snapshots/*` and `raid/{teamId}/25man-snapshots/*` documents exist from before history retirement. No code reads or writes them; safe to purge.

---

## Non-Goals (Explicitly Out of Scope)

- Multi-guild / multi-server support
- Character gear tracking / BiS lists (RPB surfaces a few gear issues but is not a BiS tracker)
- DKP or loot tracking
- Guild bank management
- Automated Discord posting (the Copy Discord button is manual by design)
- Discord bot integration for roster sync (JSON import is manual by design)
- Mobile admin view (admin is desktop-only)
- In-app voice communication

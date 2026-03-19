# NTMO Raid Platform — Product Specification

**Version:** 1.0.0  
**Last updated:** March 18, 2026  
**Guild:** Next Topic Move On (NTMO)  
**Server:** Dreamscythe (WoW TBC Anniversary)

---

## Overview

The NTMO Raid Platform is a private, guild-internal web application for managing World of Warcraft TBC Anniversary raid assignments. It provides a real-time, drag-and-drop assignment interface for raid leaders, a live public view for raiders to check their assignments, and a historical record of past raids with performance analysis tools.

**Core value:** Replace Discord-based manual assignment coordination with a structured, persistent, real-time tool that works on desktop and mobile.

---

## Teams

| Team | Day | Raid Night |
|------|-----|-----------|
| Team Dick | Tuesday | 25-Man progression (Gruul, Magtheridon) + Karazhan |
| Team Balls | Thursday | 25-Man progression (Gruul, Magtheridon) + Karazhan |

---

## Modules

### Karazhan (`/kara`)

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
- Unplaced vs placed player indicators in roster sidebar

**Discord output:**
- Per-night "Copy Discord" button
- Output format: `<@discordUserId>` mentions grouped by team and group

**History:**
- Snapshot on demand
- WCL report URL submission (locks week)
- RPB Sheet URL + CLA URL
- Week slider to browse historical snapshots

---

### 25-Man Raids (`/:teamId/25man`)

25-man content. Team Dick = Tuesday, Team Balls = Thursday. Each team has its own live state and snapshot history.

**Bosses:**
1. **Magtheridon** (tab loads first — first boss of the night)
   - Phase 2 panel on LEFT (primary), Phase 1 Channelers on RIGHT
   - Cube Clickers shown at top of Phase 2 with gold PRIMARY ASSIGNMENT styling
   - Cube Healers labeled distinctly from Cube Clickers
2. **Gruul's Lair** — High King Maulgar + Gruul the Dragonkiller

**General assignments** (bottom of page, shared across both bosses):
- Warlock Curses (4 rows)
- Trash Interrupts (8 marker rows with WoW target icons)

**Roster:**
- Import JSON roster
- Manual Add Player — name + class + spec, creates draggable badge
- Role filter (All / Tank / Healer / DPS)
- WCL parse scores in sidebar

**Assignment UI:**
- Drag-and-drop from roster to assignment rows
- Drag between assignment rows (move players)
- ✕ button to remove from slot
- Cube group conflict detection (can't be in two cube groups)
- Text input for Shatter Groups (Gruul)

---

### Raid History (`/history`)

Consolidated view of all 25-man raid history across both teams.

**Public view:**
- Filter: All / Tuesday / Thursday
- Each week card shows: date, lock status, night tag, links to WCL/RPB/CLA
- Expand a week to see:
  1. RPB Sheet iFrame (Role Performance Breakdown)
  2. CLA Sheet iFrame (Combat Log Analysis)
  3. Collapsible raid assignments section (roster + key assignments)

**Admin view (`/history/admin`):**
- Add Raid Week modal:
  - Select night (Tuesday = Team Dick, Thursday = Team Balls)
  - WCL Report URL (auto-fetches raid date, locks the week)
  - RPB Sheet URL (optional)
  - CLA URL (optional)
  - Pulls current live assignments from Firebase for that team/night
- Edit existing weeks (expand card): update any URL, change night tag
- Delete week (with confirmation)
- Night unset detection — red badge + auto-expand for snapshots missing the `night` field
- Team Dick / Team Balls chip on each card

---

### Professions

External link to https://professions.nexttopicmoveon.com/ — opens in new tab. Listed as a module in the sidebar.

---

## Admin Features

### Password Gate
All admin routes are protected by a simple password gate:
- Username: `Admin`
- Password: `NTMO6969`
- Session persists via `sessionStorage` (survives refresh, clears on tab close)
- Planned replacement: Discord OAuth

### Parse Scores Sidebar
- Shows WarcraftLogs Median Performance Average for all roster players
- Kara scores on Kara admin, Gruul/Mags scores on 25-Man admin
- Sorted descending by score
- WCL name override — click a player's name to set a different WarcraftLogs character name
- **Refresh button** visible in admin only (not shown in public views)
- 10-minute cache via sessionStorage

### Snapshots
- Admin can snapshot current week's assignments at any time
- WCL URL submission auto-fetches raid date and locks the snapshot
- Locked snapshots appear in Raid History public view with iFrame embeds

---

## Navigation

### Desktop Sidebar
- Collapsible — `«` / `»` toggle collapses to 44px icon rail
- Collapsed state: icon-only (KR, 25, HX, PF), tooltips on hover
- Collapsed state hides: parse scores panel, team switcher
- Links: Karazhan, 25-Man Raids, Raid History, Professions ↗
- Team switcher (below parse panel) — switches between Team Dick and Team Balls, preserving current module and admin/public state
- Team switcher hidden on teamless routes (kara, history)

### Mobile (< 768px)
- Sidebar hidden entirely
- Hamburger `☰` in top-right opens full-screen overlay nav
- Overlay: module links + team switcher
- Admin views are desktop-only

---

## WarcraftLogs Integration

**Score types:**
- `kara` — Karazhan median parse
- `gruulMags` — Gruul/Magtheridon median parse

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

---

## Public View Features

- **Search by name** — highlights matching player badges across all assignment rows
- **Live sync badge** — green dot + "LIVE" when Firebase is connected
- **Week slider** — browse historical snapshots
- **Locked week display** — RPB Sheet + CLA iFrame embeds when week is locked
- **Mobile responsive** — panels stack vertically before clipping

---

## Data Architecture

### Firebase Firestore

| Path | Contents |
|------|----------|
| `raid-kara/live` | Kara live state (rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu) |
| `raid-kara-snapshots/{id}` | Kara historical snapshots |
| `raid/{teamId}/25man-tue/live` | Tuesday 25-man live state |
| `raid/{teamId}/25man-thu/live` | Thursday 25-man live state |
| `raid/{teamId}/25man-snapshots/{id}` | 25-man snapshots (includes `night: "tue"/"thu"`) |

### Snapshot Schema (25-Man)
```json
{
  "roster": [...],
  "assignments": { "key": ["playerId", ...] },
  "textInputs": { "key": "text" },
  "raidDate": "3-18-26",
  "raidLeader": "Name",
  "night": "tue",
  "savedAt": "ISO timestamp",
  "locked": true,
  "wclReportUrl": "https://fresh.warcraftlogs.com/reports/...",
  "sheetUrl": "https://docs.google.com/spreadsheets/.../htmlview",
  "combatLogUrl": "https://docs.google.com/spreadsheets/.../htmlview"
}
```

---

## Non-Goals (Explicitly Out of Scope)

- Multi-guild / multi-server support
- Character gear tracking / BiS lists
- DKP or loot tracking
- Guild bank management
- Discord bot integration (roster JSON is imported manually)
- Mobile admin view
- In-app voice communication
- Automated Discord posting (copy button is manual)

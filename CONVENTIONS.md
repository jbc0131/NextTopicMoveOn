# NTMO Raid Platform — Conventions

Coding standards, patterns, and rules for this project.
Follow these in every session without exception.

---

## Stack

- **React** (functional components, hooks only — no class components)
- **JSX** (`.jsx` extension throughout)
- **Vite** (build tool — all source under `src/`)
- **Firebase Firestore** (real-time database)
- **Vercel** (hosting + serverless API routes in `api/`)
- **No TypeScript** — plain JavaScript throughout

---

## File & Folder Structure

```
src/
  App.jsx              — Router only. No logic.
  main.jsx             — Entry point. Touch rarely.
  shared/              — Shared across all modules
    theme.js           — Design tokens only. No components.
    constants.js       — Game data only. No UI logic.
    firebase.js        — All Firebase helpers. No UI imports.
    useWarcraftLogs.js — WCL hook only.
    auth.js            — Discord OAuth hook + helpers.
    components.jsx     — ALL shared UI components.
  pages/               — Route-level page components (TeamSelector, ProfilePage)
  modules/             — Feature modules
    kara/              — T4 Karazhan (teamless)
    gruulmag/          — T4 Gruul / Magtheridon (per team)
    ssc/               — T5 Serpentshrine Cavern (per team)
    tk/                — T5 Tempest Keep (per team)
    rpb/               — Combat Log Analytics (historical archive)
api/                   — Vercel serverless functions (not under src/)
  auth/                — Discord OAuth endpoints
  warcraftlogs.js      — WCL GraphQL proxy
  warcraftlogs-report.js — WCL v1 REST proxy (fights)
```

**Rules:**
- Never put Firebase logic in a component file — it goes in `src/shared/firebase.js`
- Never put design tokens inline in components — import from `src/shared/theme.js`
- Never put game data (MAGS_P2, SSC_BOSSES, etc.) in components — import from `src/shared/constants.js`
- All shared UI primitives live in `src/shared/components.jsx` — not in module folders
- Module-specific components (e.g. KaraDropRow) live inside the module file, not in shared

---

## Deployment

- **No local repo** — all edits happen in the GitHub web editor
- **Always edit files under `src/`** — Vite only bundles from `src/App.jsx` imports
- Commit in GitHub → Vercel auto-deploys from `main` branch
- Check Vercel build logs immediately after committing — build errors appear within ~30 seconds

---

## Components

### AppShell

Every page wraps in `AppShell`. Props:
- `teamId` — pass for team-scoped pages, omit for teamless (kara, rpb)
- `adminMode` — `true` requires Discord admin role (or password-gate fallback) and applies admin styling
- `parsePanelContent` — JSX for the parse scores panel in the sidebar

```jsx
// Teamless admin
<AppShell adminMode parsePanelContent={<ParseScoresPanel ... showRefresh />}>

// Team-scoped public
<AppShell teamId={teamId}>

// Teamless public
<AppShell>
```

### ModuleHeader

Use `mobileActions` prop for what shows on mobile (LIVE badge + timestamp only).
Full `actions` (search, week slider, etc.) are desktop-only via this pattern.

```jsx
<ModuleHeader
  title="25-Man Raids"
  breadcrumb="Team Dick / 25-Man"
  mobileActions={<><SyncBadge live={liveSync} /><span>Updated...</span></>}
  actions={<><SyncBadge /><SearchBox /><WeekSlider /></>}
/>
```

### ParseScoresPanel

Always pass `showRefresh` in admin views. Never pass it in public views.

```jsx
// Admin — has refresh button
<ParseScoresPanel ... showRefresh />

// Public — no refresh button
<ParseScoresPanel ... />
```

### RoleHeader

- Standard roles: renders with colored left border + tint background
- `overrideLabel="Cube Clickers"` triggers the gold PRIMARY ASSIGNMENT treatment
- Never use emojis in the label prop

### BossPanel

The `icon` prop is accepted but not rendered (removed from BossPanel output). Pass it for documentation but don't rely on it for display.

---

## Design Tokens

All tokens are in `src/shared/theme.js`. Never use raw hex values in components.

```js
import { surface, border, text, accent, intent, font, fontSize,
         fontWeight, radius, space, btnStyle, inputStyle } from "../../shared/theme";
```

Key tokens:
- `surface.base` — page background (`#1C2127`)
- `surface.panel` — sidebar/panel background (`#252A31`)
- `surface.card` — card/elevated background (`#2F343C`)
- `accent.blue` — interactive blue (`#4C90F0`)
- `intent.success` — green (`#32A467`)
- `intent.warning` — amber (`#C87619`)
- `intent.danger` — red (`#CD4246`)
- `text.primary` / `text.secondary` / `text.muted` / `text.disabled`

---

## Emojis

**Never use emojis in structural UI chrome.** This includes:
- Boss panel titles
- Role section headers
- Nav links
- Module headers / breadcrumbs
- Warning bars
- Parse panel headers
- Team/group headers

**Emojis are allowed in:**
- Discord copy output (posted to Discord, not rendered in the app)
- Utility tracker indicators in Kara team cards (functional data indicators)
- ✓ / ✗ confirmation states in buttons

---

## Authentication

All pages require Discord login (via `DiscordLoginGate` in `AppShell`).

Two tiers, checked at OAuth callback time via the bot's guild-members API:
- **Member roles** (`DISCORD_MEMBER_ROLE_IDS`) — access to any page
- **Admin roles** (`DISCORD_ALLOWED_ROLE_IDS`) — access to `/admin` pages

The auth state comes from `useAuth()` in `src/shared/auth.js`. Check `auth.isAdmin` before rendering admin chrome. Admin-only navigation is hidden from non-admins.

If Discord env vars are not configured (e.g. local dev), `PasswordGate` activates on admin routes only — public pages stay open. Do not rely on the password gate for production.

---

## Firebase Patterns

### Saving state
Always `sanitize()` before writing to Firestore (removes `undefined` values which Firestore rejects).

### Paths
- Kara live (teamless): `raid-kara/live`
- T4 Gruul/Mag: `raid/{teamId}/25man-{night}/live` — path kept as `25man-*` post-rename to preserve production data; the module is called `gruulmag` in code
- T5 SSC: `raid/{teamId}/ssc/live`
- T5 TK: `raid/{teamId}/tk/live`

Historical archives are handled by the RPB (Combat Log Analytics) module — no snapshot collections are written by the assignment modules.

---

## Mobile Patterns

Breakpoint: **768px** (defined in `useIsMobile` hook in `components.jsx`).

On mobile:
- Sidebar is hidden entirely
- Hamburger `☰` opens `MobileNavOverlay` (full-screen)
- Admin views are desktop-only — no mobile admin support
- Parse scores hidden (not important on mobile)
- `ModuleHeader` renders only `mobileActions` (LIVE + timestamp), not full `actions`
- Boss panels and section panels use `flexWrap: wrap` + `minWidth` thresholds

---

## Constants File Patterns

### MAGS_P2 order
Cube Clickers first (primary assignment), then Tank, then Healers. This order controls rendering sequence in the assignment panel.

### KARA teams
`KARA_TUE_TEAMS` and `KARA_THU_TEAMS` are arrays of team objects, each with `g1` and `g2` (groups of 5 row configs).

### Role labels for healers in Phase 2
`"Cube Healer"` — not `"Cube Clicker"` — to avoid confusion with the DPS section.

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Component files | PascalCase.jsx | `KaraAdmin.jsx` |
| Shared utilities | camelCase.js | `useWarcraftLogs.js` |
| Firebase helpers | camelCase functions | `saveKaraState()` |
| Route params | camelCase | `teamId` |
| Firebase doc keys | camelCase | `rosterTue`, `raidDate` |
| Assignment keys | snake_case | `m_p2c1a`, `heal_maulgar` |

---

## Anti-Patterns (Never Do These)

- **Don't use IIFEs in JSX** — they cause bracket mismatch errors. Extract to named components.
- **Don't add `teamId` to useEffect dependency arrays in teamless components** — KaraAdmin is teamless and crashed because of this
- **Don't reintroduce snapshot helpers in the assignment modules** — historical archives are RPB's concern; assignment modules write live state only
- **Don't show the Refresh button in public ParseScoresPanel** — use `showRefresh` prop, default is `false`
- **Don't rename the `25man-*` Firestore paths** — the module is called `gruulmag` in code, but the Firestore paths stay `25man-*` to preserve production data
- **Don't pass a string to `go()` in `MobileNavOverlay`** — it expects a `{ path, external }` link object. Use `navigate()` directly for ad-hoc navigation

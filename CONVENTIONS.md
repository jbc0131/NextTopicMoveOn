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
    components.jsx     — ALL shared UI components.
  pages/               — Route-level page components
  modules/             — Feature modules (kara, 25man, history)
    kara/
    25man/
    history/
api/                   — Vercel serverless functions (not under src/)
```

**Rules:**
- Never put Firebase logic in a component file — it goes in `src/shared/firebase.js`
- Never put design tokens inline in components — import from `src/shared/theme.js`
- Never put game data (MAGS_P2, KARA_TUE_TEAMS, etc.) in components — import from `src/shared/constants.js`
- All shared UI primitives live in `src/shared/components.jsx` — not in module folders
- Module-specific components (e.g. KaraDropRow) live inside the module file, not in shared

---

## Deployment

- **No local repo** — all edits happen in the GitHub web editor
- **Always edit files under `src/`** — Vite only bundles from `src/App.jsx` imports
- Root-level `modules/`, `shared/`, `pages/` are dead weight from early zip errors — ignore them
- Commit in GitHub → Vercel auto-deploys from `main` branch
- Check Vercel build logs immediately after committing — build errors appear within ~30 seconds

---

## Components

### AppShell

Every page wraps in `AppShell`. Props:
- `teamId` — pass for team-scoped pages, omit for teamless (kara, history)
- `adminMode` — `true` enables password gate + admin styling
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

## Firebase Patterns

### Saving state
Always `sanitize()` before writing to Firestore (removes `undefined` values which Firestore rejects).

### Snapshot fields
25-man snapshots must always include `night: "tue" | "thu"` — this field drives the Tuesday/Thursday filters in History.

### Teamless paths
- Kara live: `raid-kara/live`
- Kara snapshots: `raid-kara-snapshots/{id}`
- 25-man: `raid/{teamId}/25man-{night}/live` and `raid/{teamId}/25man-snapshots/{id}`

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
- **Don't import from root-level `modules/` or `shared/`** — always import from `src/shared/` or `src/modules/`
- **Don't add `teamId` to useEffect dependency arrays in teamless components** — KaraAdmin is teamless and crashed because of this
- **Don't put the Snapshot/WCL submit UI in 25-Man admin** — this now lives exclusively in History Admin
- **Don't show the Refresh button in public ParseScoresPanel** — use `showRefresh` prop, default is `false`

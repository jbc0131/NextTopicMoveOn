# RPB Migration Notes

This folder is the working area for rebuilding the legacy Google Sheets based RPB/CLA workflow as an internal app.

## What The Legacy System Does

The legacy implementation lives in [oldrpbscripts](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts) and is built around Google Apps Script plus spreadsheet tabs.

Its main behavior is:

- Accept a Warcraft Logs report URL or report ID plus a user-supplied WCL API key.
- Pull raid, fight, player, buff, debuff, damage, healing, death, interrupt, gear, and consumable data from the Warcraft Logs API.
- Compute a large set of raid-performance and player-performance metrics.
- Render the output into spreadsheet tabs instead of a real application UI.

The core entry point is `generateAllSheet()` in [RPB.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/RPB.gs).

## Legacy Script Map

- [RPB.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/RPB.gs)
  Main pipeline. Builds WCL queries, fetches the source data, derives player and raid metrics, and writes the primary RPB sheet.
- [Helpers.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Helpers.gs)
  Shared utilities for localization, sorting, range handling, tracked-ability matching, raid window detection, and style helpers.
- [General.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/General.gs)
  Export flow, Discord webhook posting, time formatting, dark mode toggles, raid range detection, and duplicated helper logic.
- [Filtering.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Filtering.gs)
  Generates role-specific filtered sheets from the main data set.
- [Fights.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Fights.gs)
  Produces fight lists and raid duration views, including side-by-side log comparison support.
- [Consumables.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Consumables.gs)
  Buff and consumable tracking.
- [Drums.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Drums.gs)
  Drums coverage/effectiveness tracking.
- [PullAllGear.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/PullAllGear.gs)
  Gear extraction/breakdown.
- [gearissues.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/gearissues.gs)
  Gear issue checks such as bad enchants or ignored items.
- [ShadowResistance.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/ShadowResistance.gs)
  Boss-specific shadow resistance analysis.
- [Validate.gs](/workspaces/NextTopicMoveOn/RPB/oldrpbscripts/Validate.gs)
  Present but empty in this dump.

## Important Constraints From The Legacy Scripts

- The current logic depends heavily on spreadsheet state and sheet-specific config ranges.
- The scripts read a separate config spreadsheet by hard-coded ID: `1pIbbPkn9i5jxyQ60Xt86fLthtbdCAmFriIpPSvmXiu0`.
- Localization text is externalized through the config spreadsheet.
- The scripts use the Warcraft Logs v1 REST API shape directly.
- The current output format is presentation-driven, which means the calculations and the UI are tightly coupled in the legacy version.

## What We Should Preserve

The spreadsheet layout should not be preserved. The data model and calculations should.

The application we build should preserve:

- Report ingestion from a WCL report URL or report ID
- Per-raid and per-fight drilldowns
- Per-player metric breakdowns
- Role-oriented summaries
- Week-over-week or raid-over-raid history
- Optional specialized views such as consumables, gear issues, and shadow resistance

## Recommended Target Architecture

Build this as a normal app with a clean separation between ingestion, derived analytics, and UI.

Suggested slices:

- `ingest`
  Fetch raw report, fights, players, events, tables, and metadata from WCL.
- `normalize`
  Convert raw WCL responses into stable app-level entities such as `raid`, `fight`, `player`, `buff`, `debuff`, `cast`, `death`, and `gear`.
- `analytics`
  Reimplement the spreadsheet calculations as deterministic functions over normalized data.
- `storage`
  Persist imported raids and derived metric snapshots so the app can support week history and player profiles.
- `ui`
  Dashboard views for raid overview, player profile, fight explorer, and metric drilldown.

## Proposed First Build Order

1. Define the normalized domain model.
2. Implement WCL report ingestion for a single report URL.
3. Port the raid/fight selection logic from `RPB.gs` and `Helpers.gs`.
4. Port the player roster extraction and core raid overview metrics.
5. Build a basic UI that shows:
   - raid metadata
   - fights
   - players
   - per-player summary cards
6. Add deeper views for buffs, consumables, debuffs, deaths, interrupts, and gear.
7. Add persistence and history so week-by-week views become possible.

## Immediate Next Step

The next implementation task should be a code-level spec for the normalized data model and the minimum ingestion pipeline needed to reproduce a first useful dashboard.

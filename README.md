# ES: Operations

A local desktop companion for **Endless Sky** that cuts down alt-tabbing between the game, notes, spreadsheets, and wiki pages.

It reads your installed game data and your current save, then gives you one place for:
- trade planning
- map browsing
- fleet operations
- ship fitting
- spoiler-safe lore and reference pages

[Download the latest build](https://github.com/Aamoree99/endless-sky-operations/releases/latest)  
[Release notes](https://github.com/Aamoree99/endless-sky-operations/blob/main/CHANGELOG.md)

## Why use it

**ES: Operations** is meant for players who want better visibility into their current run without depending on online tools or manually tracking everything themselves.

It uses your local Endless Sky installation and your current save to show information that is relevant to the run you are actually playing.

Key goals:
- **local-first**: no online dependency at runtime
- **save-aware**: uses your current save state instead of generic static data only
- **practical**: focused on planning and decision support, not just browsing data
- **spoiler-safe**: wiki and logbook views are limited to what your save has already revealed

## What it can do

### Planner
Find direct trade deltas, compare round trips, track routes, and preview route maps.

### Map
Browse systems, planets, prices, landing targets, shipyards, outfitters, and local stock based on your current game data.

### Wiki
Read spoiler-safe lore and reference pages built from content already opened in your current save.

### Fleet
Inspect your fleet, cargo, mission occupancy, standings, licenses, grouped ship series, and rollout readiness in one place.

### Fitter
Plan ships and outfits using your local official game data, compare fits, export and import fit payloads, and generate shareable fit cards.

### Settings
Configure the detected Endless Sky installation path and save tracking if auto-detection fails.

## What it reads

The app uses **local Endless Sky files only**:
- game data from your installed Endless Sky folder
- save state from `recent.txt` and the active save file it points to

It does **not** require GitHub wiki access or online game data during runtime.

## Download

The main download point is the Releases page.

Available package formats:
- **macOS**: `.dmg` and `.zip`
- **Windows**: installer `.exe` and portable `.exe`
- **Linux**: `AppImage` and `.deb`

The app starts its own local backend internally. You do not need to run Node manually, manage ports, or clean up background services after closing it.

## What changed in the current beta

The current `0.4.0` beta is focused on fitting and fleet operations:
- fit sharing in text, markdown, BBCode, JSON, and share-code form
- fit import that auto-detects supported formats
- compare view for current, stock, and saved fits
- profile-card image export for sharing builds
- grouped fleet rollout tools with live validation against the current outfitter
- desktop branding update to `ES: Operations`
- platform icon assets prepared for macOS, Windows, and Linux

## Quick start

1. Download the latest release for your platform.
2. Launch the app.
3. In most cases, the app will find your Endless Sky installation and current save automatically.
4. If detection fails, open **Settings** and set:
   - the path to `recent.txt`
   - the Endless Sky installation folder

## Auto-detection paths

Default `recent.txt` paths:
- **macOS**: `~/Library/Application Support/endless-sky/recent.txt`
- **Windows**: `%APPDATA%/endless-sky/recent.txt`
- **Linux**: `~/.local/share/endless-sky/recent.txt`

Linux fallback:
- `~/.config/endless-sky/recent.txt`

Default game install paths vary more on Linux than on macOS or Windows, so if auto-detection misses your install, open **Settings** and point the app at your Endless Sky folder manually.

## Accuracy notes

Most values are rebuilt from your current save and the official game data, but some numbers may still differ slightly from what you see in-game.

Common reasons:
- the app and the game are reading different save snapshots
- the save file on disk is slightly behind your current in-game state
- some values are reconstructed from economy state rather than copied from UI text
- Endless Sky may round or display some values differently

## Who this is for

This tool is especially useful if you:
- trade regularly and want faster route evaluation
- manage a growing fleet and want a clearer overview
- compare ship and outfit options outside the in-game UI
- keep multiple ships on the same standard fit and want to manage them as a group
- want reference tools without opening external wiki pages
- prefer local tools over browser-based helpers

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run desktop
```

Build distributable packages:

```bash
npm run dist
```

## Local config

The app stores local overrides in:
- `cache/app-config.json` during repository development
- the platform app-data folder in packaged desktop builds

Example:

```json
{
  "recentPathOverride": "/custom/path/to/recent.txt",
  "gameRootOverride": "/custom/path/to/Endless Sky"
}
```

## Project status

This is an actively evolving companion app. Feedback on usability, missing workflows, and incorrect data reconstruction is especially useful.

If something looks wrong, open an issue with:
- your platform
- what page you were using
- what value looked incorrect
- what you expected to see

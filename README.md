# Endless Sky Operations

[Download the latest build](https://github.com/Aamoree99/endless-sky-operations/releases/latest)

Local desktop companion for **Endless Sky**.

It reads your installed game data and your current save, then gives you:
- trade route planning
- a live system map
- fleet and cargo overview
- a ship fitter
- spoiler-safe wiki and logbook views

## What you download

The releases page is the main download point.

- `macOS`: `.dmg` and `.zip`
- `Windows`: installer `.exe` and portable `.exe`

The app starts its own local backend internally. You do not need to run Node, manage a port, or stop background processes after closing the app.

## What it uses

Local Endless Sky files only:
- game data from the installed Endless Sky folder
- save state from `recent.txt` and the active save file it points to

No GitHub wiki or online game data is required at runtime.

## Main pages

- `Planner`  
  Direct market deltas, round trips, route tracking, and route map previews.

- `Map`  
  Systems, planets, prices, landing targets, shipyards, outfitters, and live local stock.

- `Wiki`  
  Spoiler-safe lore and reference pages built from what is already opened in the current save.

- `Fleet`  
  Current roster, cargo state, mission occupancy, standings, and licenses.

- `Fitter`  
  Ship and outfit planning based on the official local game data.

- `Settings`  
  Local configuration for `recent.txt` and the Endless Sky installation folder.

## Setup

In the normal case, the app finds everything automatically.

Default `recent.txt` paths:
- `macOS`: `~/Library/Application Support/endless-sky/recent.txt`
- `Windows`: `%APPDATA%/endless-sky/recent.txt`
- `Linux`: `~/.local/share/endless-sky/recent.txt` with fallback to `~/.config/endless-sky/recent.txt`

If automatic detection fails, open `Settings` and set:
- the `recent.txt` path
- the Endless Sky game folder

## Accuracy note

Most values are rebuilt from the current save and the official game data, but a few numbers can still differ slightly from what you see in-game.

Typical reasons:
- the app and the game are looking at different save snapshots
- the save on disk is slightly behind what is currently open in the game
- some values are reconstructed from economy state instead of copied from UI text
- the game may round or display a value a little differently

## Development

```bash
npm install
npm run desktop
```

For distributable packages:

```bash
npm run dist
```

## Local config

The app keeps local overrides in:

- `cache/app-config.json` during normal repo development
- the platform app-data folder in the packaged desktop build

Example:

```json
{
  "recentPathOverride": "/custom/path/to/recent.txt",
  "gameRootOverride": "/custom/path/to/Endless Sky"
}
```

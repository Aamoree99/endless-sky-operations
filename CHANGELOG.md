# Changelog

## v0.4.1

### Improved
- Fleet rollout now reads like an actual operation instead of a vague preview. You can see which ships are changing, which stops they take, what gets sold, what gets bought, travel cost, net cost, final credits, and where those ships end up.
- Rollout is easier to spot in the fleet UI, and the app now says why `Apply current fit` is disabled when the fitter is on the wrong hull.
- Desktop startup is quicker. The window can open after a cheap health check while the heavier bootstrap and status data keep loading in the background.
- Packaged desktop startup is more reliable because Electron now launches the backend and preload from the unpacked runtime root instead of assuming everything lives inside `app.asar`.

### Changed
- Applying a rollout now updates more of the save in one pass: credits, date, ship loadouts, and final ship location.
- Desktop packaging was cleaned up for a stable release path:
  - `asar` is back on
  - server files are unpacked explicitly where needed
  - release assets now use `ES-Operations-*`
  - the package name now matches `es-operations`
- The backend is no longer one giant file. Routes, status builders, save parsing, save editing, game-data loading, fit storage, and helpers live in separate modules now.

### Fixed
- Fixed an early-loading crash caused by old fitter DOM references like `fit-owned-ships`.
- Fixed the startup error fallback so one launch error does not immediately throw a second null-DOM error on top of it.
- Fixed packaged macOS builds failing to launch because the backend was starting from the wrong runtime path or missing packaged server files.

### Added
- Added basic smoke tests for the server modules.
- Added `/api/healthz` so the desktop app can do a lightweight readiness check before the heavier data loads.

## v0.4.0 beta

### Added
- Added fit sharing in plain text, markdown, Steam BBCode, JSON, and a machine-readable share code.
- Added fit import that figures out the format from pasted text instead of making you pick one first.
- Added fit comparison with stat deltas and loadout diffs.
- Added a profile-card image export for posting fits outside the app.
- Fleet rollout tools for applying the current fit to a whole ship group or normalizing a series.
- Added icon assets for macOS, Windows, and Linux builds.
- Added rollout route planning, so the app can work out the shortest outfitter path for the pieces a group still needs.
- Added stop-by-stop rollout routing in the modal, with systems, jump counts, and the items bought at each stop.
- Added travel cost to rollout preview: crew salary per day across route jumps plus a 10% navigator fee.
- Added in-game date advancement when a rollout is applied.

### Improved
- The fitter got a cleaner layout. Header, actions, and saved-fit cards now read like product UI instead of a debug screen.
- Fleet groups do a better job showing rollout readiness and fit drift.
- Share, import, and compare modals now scroll properly in smaller windows and close when you click outside them.
- Desktop branding now presents the app as `ES: Operations`.
- The rollout modal got a better top-line summary with costs, target cargo, jump count, salary/day, and navigator fee.

### Changed
- macOS packaging now uses a proper app icon and display name without breaking helper bundle naming.
- Linux packaging was wired into the release workflow.
- Applying a fleet rollout now actually deducts the economic cost instead of treating it like a free fit swap.

### Fixed
- Fixed rollout sale-location lookup so live `progressSaleLocations` from the wiki are merged correctly. Hai, Remnant, and other faction outfitter stops now resolve properly when building the route.

### Notes
- This was the first real beta cut for daily use. The main workflows were already there, but it still needed UI and packaging cleanup before a stable release.


## v0.3.0

### Added
- Trade operations controls for sorting, filtering, and setting course from planner routes.
- Fleet group summaries with series-aware grouping and fit-drift detection.
- Debug editor improvements including diff previews, backup/history views, and an extreme tier for raw conditions.
- Desktop settings tools for config import/export and richer runtime metadata.

### Improved
- Planner routes now account for wormholes, landing targets, route risk labels, and automatic cost breakdowns.
- Tracker flow now behaves like a fuller route state machine and keeps the travel plan in sync.
- Wiki story/logbook views are more structured, with chains, timeline-style diary entries, and better mission summaries.
- Map rendering between live and debug now shares the same projection and styling rules more consistently.
- Trade price reconstruction now matches the game formula more closely and surfaces save/economy edge cases better.

### Changed
- The frontend was refactored into page and shared modules; the main app entry dropped from more than 6000 lines to under 900.
- Planner, fleet, wiki, fitter, debug, settings, atlas, and route map rendering now hang off dedicated controllers.

### Fixed
- Planner pathfinding now includes wormhole edges instead of silently missing cross-cluster routes.
- Planet override parsing now respects `remove`-style service changes for shipyards, outfitters, and spaceports.
- Stealth-only mission risk no longer collapses to zero in automatic planner cost estimation.
- Desktop runtime/config handling is more robust when save discovery partially succeeds.

## v0.2.0

### Added
- Packaged desktop app for macOS and Windows via Electron.
- Dedicated `Settings` page for `recent.txt` and game folder discovery.
- Save-aware `Wiki` with spoiler-safe sections, logbook, and story summaries.
- `Debug` mode and save editor with safe, advanced, and dangerous edit tiers.
- Ship fitter saved-fit workflow with overwrite, delete, and short note previews.
- Route tracker that advances automatically and updates the travel plan.
- Release workflow for tagged GitHub builds.

### Improved
- Trade planner now ranks routes across the known map instead of only from the current system.
- Route cards now show landing targets, risk labels, and better tracker stages.
- Map rendering, overlays, zoom behavior, and wormhole link display were reworked.
- World-state text and mission summaries are more readable.
- Save/game discovery is more resilient across desktop installs.
- Part of the frontend was split into modules to reduce pressure on the main app entry.

### Changed
- Manual per-jump operating cost was removed in favor of automatic planning cost inputs from save/game state.
- Built-in fitter presets were reduced to stock/baseline fits.

### Fixed
- Price calculation now matches the game formula more closely, including edge-case `erf` saturation.
- Economy parsing now reads pending `purchases` from the save.
- Release workflow now passes the expected GitHub token environment variables.

### Notes
- Some market numbers can still differ slightly from the in-game UI when the game has advanced further in memory than the save snapshot on disk.

# Changelog

## v0.4.0 beta

### Added
- Fit sharing in text, markdown, BBCode, JSON, and machine-readable share-code formats.
- Fit import flow that auto-detects supported payload formats instead of forcing one input style.
- Fit comparison modal with stat deltas and loadout diffs.
- Profile-card image export for sharing builds outside the app.
- Fleet rollout tools for applying the current fit to a whole ship group or normalizing a series.
- Platform icon assets for macOS, Windows, and Linux builds.
- Fleet rollout route planning: calculates the optimal path to outfitter stops for required ship upgrades using the shortest-path graph.
- Outfitter route itinerary in the rollout modal: numbered stops with system name, jump count, and items to buy at each location.
- Travel cost breakdown in rolling preview: daily crew salary × route jumps + 10% navigator commission.
- In-game date advancement: applying a rollout now moves the save file date forward by the number of jumps in the planned route.

### Improved
- Fitter header, fit actions, and saved-fit cards were redesigned to read more like a product UI and less like a debug panel.
- Fleet groups now show rollout readiness and fit drift more clearly.
- Share, import, and compare modals now scroll correctly in smaller windows and close on outside click.
- Desktop branding now presents the app as `ES: Operations`.
- Rollout modal header now shows separate **Outfit cost**, **Travel cost**, and **Total cost** pills alongside target cargo and jump stats.
- Rollout modal shows a summary bar with ships selected for refit, salary/day, navigator fee rate, and total route jumps.

### Changed
- macOS packaging now uses a proper app icon and display name while keeping the helper bundle naming valid.
- Linux release packaging has been prepared in the release workflow.
- Applying a fleet rollout now deducts the full economic cost (outfit purchases + travel expenses) from the player's credits.

### Fixed
- Outfit sale location lookup in rollout now correctly merges live `progressSaleLocations` from the wiki into the outfit definition so Hai, Remnant, and other faction outfitter stops are resolved correctly when building the route.

### Notes
- This is a beta release. The main workflows are in place, but this cut is meant for real use and UI validation before a later stable pass.


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

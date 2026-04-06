# Changelog

## v0.3.1

### Fixed
- Fitter no longer crashes on startup because `formatSaleLocation` is now wired correctly after the v0.3 modular refactor.

### Notes
- This is a focused stability release for the post-refactor desktop build.

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

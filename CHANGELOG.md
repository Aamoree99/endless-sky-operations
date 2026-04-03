# Changelog

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

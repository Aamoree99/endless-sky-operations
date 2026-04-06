# Backlog

## Post-v0.2 review

Recorded after manual code review on 2026-04-03.

### High

#### Planner pathing ignores wormholes

- Current routefinding uses only normal `link` edges.
- Wormholes are parsed and rendered on the map, but planner BFS does not include them.
- Impact:
  - route suggestions can miss valid paths
  - jump counts can be wrong
  - profit/day can be wrong for wormhole-connected regions

Files to revisit:
- `server.mjs`
- route BFS / planning builders

#### World-state overrides do not handle `remove` directives

- Planet override parsing currently handles `clear`, direct assignment, and `add`.
- Official Endless Sky data also uses `remove shipyard`, `remove outfitter`, `remove spaceport`, and similar partial removals.
- Impact:
  - shipyard/outfitter/state views can stay visible after story events remove them
  - wiki/map/system service data can drift from actual game state

Files to revisit:
- `server.mjs`
- planet override parsing
- planet catalog merge logic

### Medium

#### Stealth-only missions are undercounted in planner risk

- Mission exposure detects `stealth` missions.
- Planner operating cost currently converts explicit `illegalFine` into risk cost, but stealth-only missions with no fine still contribute zero.
- Impact:
  - route economics can look safer than they really are
  - planner underestimates risky cargo/passenger work

Files to revisit:
- `server.mjs`
- mission exposure
- planner cost model

### Notes

- Price formula itself was rechecked against Endless Sky source and is now aligned:
  - `base + int(-100 * erf(supply / 20000))`
- Remaining small price mismatches are more likely to come from save snapshot timing, pending purchases, or in-memory game state versus on-disk save state.

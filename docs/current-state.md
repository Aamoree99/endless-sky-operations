# Endless Sky Operations

## Current state

This project is a local web workspace for **Endless Sky** built around the active save file and the installed game data.

The product currently has four primary surfaces:

- `Planner`
- `Atlas`
- `Fleet`
- `Fitter`

The app is intentionally structured so the same frontend can later be wrapped as a desktop application for macOS and Windows.

## What is already implemented

### Planner

- Reads the active save automatically from the save directory referenced by `recent.txt`.
- Rebuilds live market prices from the save `economy` block and the official system trade bases.
- Shows:
  - direct market opportunities from the current system
  - sale exits for the cargo already loaded
  - local loops from the current system
  - reachable loops inside flagship jump range
- Ranks routes with an access-aware score:
  - open destinations stay at full weight
  - gated, unfriendly, or blocked destinations are penalized
  - risky destinations are still shown, but with warnings
- Includes:
  - active route summary
  - focused local map
  - galaxy overview frame
  - loop tracker

### Atlas

- Shows systems known to the current save.
- Displays current market prices by system.
- Displays current planet state after save-driven overrides.
- Displays live shipyard and outfitter state, including cases where vanilla sale locations are disabled by story progress.
- Displays local stock visible in the current system:
  - ships
  - outfits

This page is the beginning of the in-app wiki / knowledge layer.

### Fleet

- Shows mission occupancy:
  - mission cargo
  - mission passengers
- Shows cargo ledger:
  - tons
  - basis
  - local price
  - current margin
- Shows current fleet roster:
  - active ships
  - parked ships
  - flagship marker
  - quick open into fitter
- Shows filtered major standings from the save.
- Shows license cards with:
  - in-game images
  - owned / locked state
  - current acquisition hint
  - current sale locations when applicable
  - ships unlocked by the license

### Fitter

- Uses official ship and outfit data from the installed game.
- Uses in-game ship and outfit images where available.
- Left side:
  - ship browser
  - fit browser
  - outfit catalog
- Right side:
  - selected outfit inspector
  - owned ship strip
  - ship sheet
  - installed loadout
- Enforces fitting constraints before install:
  - outfit space
  - weapon capacity
  - engine capacity
  - gun ports
  - turret mounts
- Shows fit cost:
  - hull value
  - total fit value
  - outfit delta versus stock
- Shows sustain metrics:
  - energy table
  - heat table
  - battery depletion timing
  - overheating timing

## Data model

### Server

Main backend file:

- `server.mjs`

The server currently parses and merges:

- official game data:
  - `data/map systems.txt`
  - `data/map planets.txt`
  - `data/human/*.txt`
  - `data/hai/*.txt`
- official sale groups:
  - `data/human/sales.txt`
  - `data/hai/hai.txt`
- live save data:
  - ships
  - cargo
  - missions
  - basis
  - economy
  - reputation
  - licenses
  - dynamic planet overrides
  - dynamic shipyard / outfitter definitions from the save

The save layer is used to produce:

- live system prices
- current sale availability
- current fleet state
- current standings and licenses
- route access risk

### Frontend

Main frontend files:

- `public/index.html`
- `public/app.js`
- `public/style.css`

The frontend is still plain HTML/CSS/JS on purpose:

- low dependency surface
- easy local deployment
- easy future desktop wrapping

## Style direction

The current visual direction is a restrained dark operations UI.

### Principles

- Neutral grey-blue palette instead of loud gradients or novelty colors.
- Dense information layout without nested card-on-card clutter.
- Strong hierarchy:
  - large page title
  - compact top status pills
  - metric strip
  - content panels
- Product-like copy instead of debug text.
- Important warnings are shown as stateful UI, not buried in raw numbers.

### Current style system

Main tokens live in `public/style.css` as CSS variables.

Important traits:

- dark background with low-contrast atmospheric gradients
- thin blue-grey borders
- compact rounded panels
- monospace only for numeric emphasis
- compact inline pills and tags
- route warnings with distinct state treatments:
  - blocked
  - unfriendly
  - gated
  - unknown

### Planner map behavior

- The main route map shows a focused neighborhood around the current system or selected route.
- The galaxy map stays in the same global orientation.
- The mini overview shows where the focused local frame sits in the whole galaxy.

## Current product decisions

- `Travel plan` is not treated as a primary planning card unless it is relevant to the view.
- Risky but profitable routes are still shown, but they should not outrank safe routes.
- Atlas is the place for current-world availability, not just static wiki information.
- Fitter is built around game-like constraints and browsing, not spreadsheet-only editing.

## Known limitations

- Loop planning is still limited to two-point loops: `A -> B -> A`.
- Route access weighting is reputation-aware, but still heuristic.
- Some governments and special faction states may need finer landing logic later.
- The Atlas system detail view still needs deeper item lookup.
- The ship browser in fitter is already better than before, but can still become more curated.
- Desktop packaging has not been started yet.

## Recommended next steps

- Split risky route candidates into a dedicated section like `Risky but profitable`.
- Add item lookup to `Atlas`:
  - where sold
  - where available right now
  - where blocked by story state
- Add ship wiki detail:
  - current sale locations
  - known vanilla sale locations
  - license requirements
  - cost and description
- Improve fitter browsing:
  - favorites
  - owned-only filter
  - sale-now filter
- Wrap the app as a desktop shell after the web workflow stabilizes.

## Paths

- App root: `/Users/ilia/Projects/endless-sky-trade-app`
- Public UI: `/Users/ilia/Projects/endless-sky-trade-app/public`
- Server: `/Users/ilia/Projects/endless-sky-trade-app/server.mjs`
- This document: `/Users/ilia/Projects/endless-sky-trade-app/docs/current-state.md`

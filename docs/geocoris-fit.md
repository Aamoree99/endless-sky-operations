# Geocoris Fit Notes

## Recommended Fit

`Geocoris Escort Raider` is the current recommended mixed-role fit for an AI-controlled `Geocoris` that should stay durable, contribute real firepower, and still haul more than stock.

### Loadout

Guns:
- `2x Pulse Cannon`

Turrets:
- `2x Pulse Turret`
- `2x Bullfrog Anti-Missile`
- `1x Chameleon Anti-Missile`

Power / Systems:
- `2x Geode Reactor`
- `1x Hai Valley Batteries`
- `1x Hai Diamond Regenerator`
- `4x Hai Williwaw Cooling`
- `1x Hai Cuttlefish Jammer`
- `1x Large Radar Jammer`
- `1x Small Radar Jammer`
- `2x Cargo Expansion`
- `1x Hyperdrive`

Engines:
- `1x "Biroo" Atomic Thruster`
- `1x "Bondir" Atomic Steering`

Removed from stock:
- `1x "Biroo" Reverse Thruster`
- `3x Hai Cuttlefish Jammer`
- `1x Bullfrog Anti-Missile`

## Verified Fit Stats

These numbers were checked against the same fit calculation used by the local fitter in this project:

- Cargo space: `791`
- Fuel capacity: `800`
- Jumps with `Hyperdrive`: `8`
- Required crew: `17`
- Max speed: `141.45`
- Acceleration: `105.59`
- Turning: `72.42`
- Outfit space free: `1 / 582`
- Weapon capacity free: `36 / 172`
- Engine capacity free: `1 / 94`
- Gun ports free: `0 / 2`
- Turret mounts free: `0 / 5`
- Anti-missile: `40`
- Jamming: `radar 12`, `optical 15`
- Shield DPS: `810`
- Hull DPS: `612`
- Battery: `42,222`
- Combat energy net: about `-0.33 / frame`
- Combat sustain: battery stable in the local 20-minute combat simulation
- Heat sustain: stable in the same combat simulation
- Full ship + fit cost: `21.106M`
- Outfit delta vs stock loadout: about `-1.083M`

## Why This Fit

- It preserves the stock `Geocoris` gun battery: `2 Pulse Cannon + 2 Pulse Turret`.
- It improves missile defense instead of turning the ship into a passive brick.
- It adds both human-style `radar jamming` and Hai `optical jamming`, so the ship is not over-specialized into one threat type.
- It keeps the stock `Biroo + Bondir` movement package, so AI escorts keep the same convoy pace you already like.
- It still gains `+30 cargo` over stock because the reverse thruster is removed and that space is repurposed into cargo and defense.

## Why Stock Geocoris Keeps Launching With The Flagship

This is not a special hidden `Geocoris` flag. It is the normal player escort AI working as intended.

What matters:

- In ship data, stock `Geocoris` is just a normal ship definition with a stock loadout in `data/hai/hai ships.txt`.
- It has no special escort-only personality block in that ship definition.
- In the game AI, player-owned escorts follow their parent ship and move with it.
- The jump logic also waits for escorts that are in-system and ready to jump, instead of abandoning them immediately.

Why `Geocoris` feels especially good at this:

- it has `Hyperdrive`
- it carries `800 fuel`
- it is a full ship, not a carried fighter or drone
- its stock speed is already in a good escort band, so it forms up cleanly

## Local Reference Data

Local mirrored data for future fit work is stored in:

- `cache/game-data/data/hai/hai ships.txt`
- `cache/game-data/data/hai/hai outfits.txt`
- `cache/game-data/data/human/outfits.txt`
- `cache/game-data/data/human/weapons.txt`
- `cache/game-data/data/human/sales.txt`
- `cache/game-data/data/map systems.txt`
- `cache/game-data/data/map planets.txt`

The official AI source snapshot used for escort behavior reference is stored in:

- `cache/game-source/AI.cpp`

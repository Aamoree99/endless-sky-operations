export function getLoadoutDiff(currentLoadout, targetLoadout) {
  const names = new Set([
    ...Object.keys(currentLoadout || {}),
    ...Object.keys(targetLoadout || {}),
  ]);

  return [...names]
    .map((name) => {
      const current = Math.max(0, Math.round(Number(currentLoadout?.[name]) || 0));
      const target = Math.max(0, Math.round(Number(targetLoadout?.[name]) || 0));
      const delta = target - current;
      return {
        name,
        current,
        target,
        delta,
      };
    })
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildFleetRolloutPreview({
  group,
  targetLoadout,
  liveMode,
  currentPlanet,
  currentOutfitItems,
  currentCredits,
  getOutfitDefinition,
}) {
  const ships = group?.ships || [];
  const available = new Set(currentOutfitItems || []);
  const changedShips = [];
  const additions = new Map();
  const removals = new Map();

  for (const ship of ships) {
    const diff = getLoadoutDiff(ship.outfits || {}, targetLoadout);
    if (!diff.length) {
      continue;
    }
    changedShips.push({
      ship,
      diff,
    });
    for (const entry of diff) {
      if (entry.delta > 0) {
        additions.set(entry.name, (additions.get(entry.name) || 0) + entry.delta);
      } else {
        removals.set(entry.name, (removals.get(entry.name) || 0) + Math.abs(entry.delta));
      }
    }
  }

  const net = new Map();
  const names = new Set([...additions.keys(), ...removals.keys()]);
  for (const name of names) {
    net.set(name, (additions.get(name) || 0) - (removals.get(name) || 0));
  }

  const items = [...net.entries()]
    .map(([name, delta]) => {
      const outfit = getOutfitDefinition(name);
      const positive = Math.max(0, delta);
      const negative = Math.max(0, -delta);
      const soldHere = available.has(name);
      return {
        name,
        delta,
        buyCount: positive,
        freeCount: negative,
        soldHere,
        cost: Math.max(0, Number(outfit?.attributes?.cost) || 0),
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.name.localeCompare(right.name));

  const missing = items.filter((item) => item.buyCount > 0 && !item.soldHere);
  const purchaseCost = items.reduce((sum, item) => sum + item.buyCount * item.cost, 0);
  const landed = Boolean(currentPlanet);
  const hasOutfitter = Boolean(currentPlanet?.hasOutfitter);
  const canAfford = currentCredits >= purchaseCost;

  const blockers = [];
  if (liveMode && !landed) {
    blockers.push("You must be landed on a planet to roll out a fit in live mode.");
  }
  if (liveMode && landed && !hasOutfitter) {
    blockers.push("The current planet does not have an outfitter.");
  }
  if (liveMode && missing.length) {
    blockers.push("The current outfitter does not sell everything needed for this rollout.");
  }
  if (liveMode && !canAfford) {
    blockers.push("You do not have enough credits for the required purchases.");
  }

  return {
    changedShips,
    changedShipCount: changedShips.length,
    items,
    missing,
    purchaseCost,
    canAfford,
    liveMode,
    currentPlanet,
    blockers,
    canApply: changedShips.length > 0 && blockers.length === 0,
  };
}

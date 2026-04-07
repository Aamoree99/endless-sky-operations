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

function getShipSalaryPerDay(ship) {
  if (!ship || ship.parked) {
    return 0;
  }
  return Math.max(0, Math.round(Number(ship.crew) || 0) - 1) * 100;
}

function getLocationKey(location) {
  return `${location.system}|${location.planet}`;
}

function uniqueSaleLocations(locations) {
  const seen = new Set();
  const result = [];
  for (const location of locations || []) {
    const key = getLocationKey(location);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(location);
  }
  return result;
}

function chooseBestSaleLocation({
  locations,
  startSystem,
  findShortestPath,
}) {
  let best = null;
  for (const location of uniqueSaleLocations(locations)) {
    const path = location.system === startSystem
      ? [startSystem]
      : (findShortestPath(startSystem, location.system) || []);
    if (!path.length) {
      continue;
    }
    const jumps = Math.max(0, path.length - 1);
    const candidate = {
      ...location,
      path,
      jumps,
    };
    if (
      !best ||
      candidate.jumps < best.jumps ||
      (candidate.jumps === best.jumps &&
        `${candidate.system}|${candidate.planet}`.localeCompare(`${best.system}|${best.planet}`) < 0)
    ) {
      best = candidate;
    }
  }
  return best;
}

function buildRoutePlan({
  startSystem,
  stopLocations,
  findShortestPath,
}) {
  const remaining = [...stopLocations];
  const route = [];
  let currentSystem = startSystem;
  let totalJumps = 0;

  while (remaining.length && currentSystem) {
    let bestIndex = -1;
    let bestStop = null;
    for (let index = 0; index < remaining.length; index += 1) {
      const stop = remaining[index];
      const path = stop.system === currentSystem
        ? [currentSystem]
        : (findShortestPath(currentSystem, stop.system) || []);
      if (!path.length) {
        continue;
      }
      const jumps = Math.max(0, path.length - 1);
      if (
        !bestStop ||
        jumps < bestStop.jumps ||
        (jumps === bestStop.jumps &&
          `${stop.system}|${stop.planet}`.localeCompare(`${bestStop.system}|${bestStop.planet}`) < 0)
      ) {
        bestIndex = index;
        bestStop = {
          ...stop,
          path,
          jumps,
        };
      }
    }
    if (!bestStop) {
      break;
    }
    totalJumps += bestStop.jumps;
    route.push(bestStop);
    currentSystem = bestStop.system;
    remaining.splice(bestIndex, 1);
  }

  return {
    stops: route,
    unresolvedStops: remaining,
    totalJumps,
  };
}

export function buildFleetRolloutPreview({
  group,
  targetLoadout,
  liveMode,
  currentSystemName,
  currentPlanet,
  currentOutfitItems,
  currentCredits,
  getOutfitDefinition,
  findShortestPath,
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
      const saleLocations = liveMode
        ? (outfit?.progressSaleLocations || [])
        : (outfit?.currentSaleLocations || outfit?.knownSaleLocations || []);
      const bestSource = positive > 0 && currentSystemName
        ? chooseBestSaleLocation({
            locations: saleLocations,
            startSystem: currentSystemName,
            findShortestPath,
          })
        : null;
      return {
        name,
        delta,
        buyCount: positive,
        freeCount: negative,
        soldHere,
        bestSource,
        cost: Math.max(0, Number(outfit?.attributes?.cost) || 0),
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.name.localeCompare(right.name));

  const missing = items.filter((item) => item.buyCount > 0 && !item.soldHere);
  const unsourceable = missing.filter((item) => !item.bestSource);
  const groupedStops = new Map();
  for (const item of missing) {
    if (!item.bestSource) {
      continue;
    }
    const key = getLocationKey(item.bestSource);
    if (!groupedStops.has(key)) {
      groupedStops.set(key, {
        system: item.bestSource.system,
        planet: item.bestSource.planet,
        requiredReputation: item.bestSource.requiredReputation || 0,
        items: [],
      });
    }
    groupedStops.get(key).items.push(item);
  }
  const routePlan = currentSystemName
    ? buildRoutePlan({
        startSystem: currentSystemName,
        stopLocations: [...groupedStops.values()],
        findShortestPath,
      })
    : { stops: [], unresolvedStops: [...groupedStops.values()], totalJumps: 0 };
  const purchaseCost = items.reduce((sum, item) => sum + item.buyCount * item.cost, 0);
  const selectedSalaryPerDay = changedShips.reduce((sum, entry) => sum + getShipSalaryPerDay(entry.ship), 0);
  const navigatorFeePerDay = Math.round(selectedSalaryPerDay * 0.1);
  const travelCost = routePlan.totalJumps * (selectedSalaryPerDay + navigatorFeePerDay);
  const projectedTotalCost = purchaseCost + travelCost;
  const landed = Boolean(currentPlanet);
  const hasOutfitter = Boolean(currentPlanet?.hasOutfitter);
  const canAfford = currentCredits >= projectedTotalCost;

  const blockers = [];
  if (liveMode && unsourceable.length) {
    blockers.push("Some required outfits are not available on any currently opened outfitter route.");
  }
  if (liveMode && !landed) {
    blockers.push("You must be landed on a planet to apply the rollout in live mode.");
  }
  if (liveMode && landed && !hasOutfitter) {
    blockers.push("The current planet does not have an outfitter.");
  }
  if (liveMode && missing.length && !unsourceable.length) {
    blockers.push("Travel to the planned outfitter stops first, then apply the rollout where the remaining outfits are sold.");
  }
  if (liveMode && !canAfford) {
    blockers.push("You do not have enough credits for the projected purchases and travel costs.");
  }

  return {
    changedShips,
    changedShipCount: changedShips.length,
    items,
    missing,
    unsourceable,
    routePlan,
    purchaseCost,
    selectedSalaryPerDay,
    navigatorFeePerDay,
    travelCost,
    projectedTotalCost,
    canAfford,
    liveMode,
    currentSystemName,
    currentPlanet,
    blockers,
    canApply:
      changedShips.length > 0 &&
      blockers.length === 0 &&
      landed &&
      hasOutfitter &&
      missing.length === 0,
  };
}

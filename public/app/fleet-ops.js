const DEPRECIATION_RULES = {
  min: 0.25,
  daily: 0.997,
  grace: 7,
  maxAge: 1000,
};

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

function chooseNearestOutfitterStop({
  planets,
  startSystem,
  findShortestPath,
  liveMode,
  knownSystems,
  reputationsByGovernment,
}) {
  let best = null;
  for (const planet of planets || []) {
    if (!planet?.hasOutfitter || !planet?.system || !planet?.name) {
      continue;
    }
    if (liveMode && knownSystems?.size && !knownSystems.has(planet.system)) {
      continue;
    }
    const required = Math.max(0, Number(planet.requiredReputation) || 0);
    const reputation = planet.government ? reputationsByGovernment?.[planet.government] ?? null : null;
    const accessible = reputation === null ? required <= 0 : reputation >= required;
    if (liveMode && !accessible) {
      continue;
    }
    const path = planet.system === startSystem
      ? [startSystem]
      : (findShortestPath(startSystem, planet.system) || []);
    if (!path.length) {
      continue;
    }
    const jumps = Math.max(0, path.length - 1);
    const candidate = {
      system: planet.system,
      planet: planet.name,
      government: planet.government || null,
      requiredReputation: required,
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

function dateToGameDayNumber(date) {
  if (!date?.day || !date?.month || !date?.year) {
    return 0;
  }
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  let total = 0;
  for (let year = 1; year < date.year; year += 1) {
    total += isLeap(year) ? 366 : 365;
  }
  for (let month = 1; month < date.month; month += 1) {
    total += monthDays[month - 1];
    if (month === 2 && isLeap(date.year)) {
      total += 1;
    }
  }
  return total + Math.max(0, Number(date.day) || 0);
}

function getDepreciationFraction(age, rules = DEPRECIATION_RULES) {
  const maxAge = rules.maxAge + rules.grace;
  if (age <= rules.grace) {
    return 1;
  }
  if (age >= maxAge) {
    return rules.min;
  }
  const effectiveAge = age - rules.grace;
  const daily = Math.pow(rules.daily, effectiveAge);
  const linear = (maxAge - effectiveAge) / maxAge;
  return rules.min + (1 - rules.min) * daily * linear;
}

function getDefaultDepreciation(isStock, rules = DEPRECIATION_RULES) {
  return isStock ? 1 : rules.min;
}

function getDepreciatedValue(records, currentDay, count, isStock, cost, rules = DEPRECIATION_RULES) {
  const normalizedCost = Math.max(0, Number(cost) || 0);
  let remaining = Math.max(0, Math.round(Number(count) || 0));
  if (!remaining || !normalizedCost) {
    return 0;
  }

  const bins = [...(records || [])]
    .map((entry) => ({
      day: Math.round(Number(entry?.day) || 0),
      count: Math.max(0, Math.round(Number(entry?.count) || 0)),
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => left.day - right.day);

  if (!bins.length) {
    return Math.round(getDefaultDepreciation(isStock, rules) * remaining * normalizedCost);
  }

  const ordered = isStock ? bins : [...bins].reverse();
  let total = 0;
  for (const entry of ordered) {
    if (!remaining) {
      break;
    }
    const used = Math.min(entry.count, remaining);
    remaining -= used;
    total += used * getDepreciationFraction(currentDay - entry.day, rules) * normalizedCost;
  }

  if (remaining) {
    total += remaining * getDefaultDepreciation(isStock, rules) * normalizedCost;
  }
  return Math.round(total);
}

function ensureRouteStop(stopMap, location, kind = "mixed") {
  const key = getLocationKey(location);
  if (!stopMap.has(key)) {
    stopMap.set(key, {
      system: location.system,
      planet: location.planet,
      requiredReputation: Math.max(0, Number(location.requiredReputation) || 0),
      kind,
      buys: [],
      sells: [],
    });
  }
  const stop = stopMap.get(key);
  if (stop.kind !== kind) {
    stop.kind = "mixed";
  }
  return stop;
}

function buildStopLedger({
  routeStops,
  travelCostPerJump,
  startingCredits,
}) {
  let runningCredits = Math.round(Number(startingCredits) || 0);
  let minCredits = runningCredits;

  const stops = routeStops.map((stop) => {
    const jumpCost = Math.max(0, Number(stop.jumps) || 0) * travelCostPerJump;
    const saleCredit = stop.sells.reduce((sum, item) => sum + (Number(item.saleCredit) || 0), 0);
    const buyCost = stop.buys.reduce((sum, item) => sum + (Number(item.buyCost) || 0), 0);
    runningCredits -= jumpCost;
    const afterTravel = runningCredits;
    runningCredits += saleCredit;
    const afterSales = runningCredits;
    runningCredits -= buyCost;
    const afterBuys = runningCredits;
    minCredits = Math.min(minCredits, afterTravel, afterSales, afterBuys);
    return {
      ...stop,
      jumpCost,
      saleCredit,
      buyCost,
      afterTravel,
      afterSales,
      afterBuys,
    };
  });

  return {
    stops,
    minCredits,
    finalCredits: runningCredits,
  };
}

function toReputationMap(standings) {
  const result = {};
  for (const standing of standings || []) {
    if (!standing?.name) {
      continue;
    }
    result[standing.name] = Number(standing.value) || 0;
  }
  return result;
}

export function buildFleetRolloutPreview({
  group,
  targetLoadout,
  liveMode,
  currentSystemName,
  currentPlanet,
  currentOutfitItems,
  currentCredits,
  currentDate,
  depreciation,
  planets,
  knownSystems,
  standings,
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

  const currentDay = dateToGameDayNumber(currentDate);
  const fleetDepreciation = depreciation?.fleetOutfits || {};
  const stockDepreciation = depreciation?.stockOutfits || {};
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
      const soldHere = Boolean(currentPlanet?.hasOutfitter) && available.has(name);
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
      const unitCost = Math.max(0, Number(outfit?.attributes?.cost) || 0);
      const localBuyCost = positive > 0 && soldHere
        ? getDepreciatedValue(stockDepreciation[name], currentDay, positive, true, unitCost)
        : 0;
      const remoteBuyCost = positive > 0 && !soldHere ? positive * unitCost : 0;
      const saleCredit = negative > 0
        ? getDepreciatedValue(fleetDepreciation[name], currentDay, negative, false, unitCost)
        : 0;
      return {
        name,
        delta,
        buyCount: positive,
        freeCount: negative,
        soldHere,
        bestSource,
        unitCost,
        localBuyCost,
        remoteBuyCost,
        saleCredit,
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.name.localeCompare(right.name));

  const missing = items.filter((item) => item.buyCount > 0 && !item.soldHere);
  const unsourceable = missing.filter((item) => !item.bestSource);
  const knownSystemSet = knownSystems instanceof Set ? knownSystems : new Set(knownSystems || []);
  const reputationMap = toReputationMap(standings);
  const stopMap = new Map();

  if (currentPlanet?.hasOutfitter && currentSystemName) {
    const localStop = ensureRouteStop(stopMap, {
      system: currentSystemName,
      planet: currentPlanet.name,
      requiredReputation: currentPlanet.requiredReputation || 0,
    }, "mixed");
    for (const item of items.filter((entry) => entry.buyCount > 0 && entry.soldHere)) {
      localStop.buys.push({
        ...item,
        buyCost: item.localBuyCost,
        pricing: "Local stock",
      });
    }
    for (const item of items.filter((entry) => entry.freeCount > 0)) {
      localStop.sells.push(item);
    }
    if (!localStop.buys.length && !localStop.sells.length) {
      stopMap.delete(getLocationKey(localStop));
    }
  }

  for (const item of missing) {
    if (!item.bestSource) {
      continue;
    }
    const stop = ensureRouteStop(stopMap, item.bestSource, "buy");
    stop.buys.push({
      ...item,
      buyCost: item.remoteBuyCost,
      pricing: "List price",
    });
  }

  if (!currentPlanet?.hasOutfitter && currentSystemName) {
    const removalItems = items.filter((entry) => entry.freeCount > 0);
    if (removalItems.length) {
      const existingStops = [...stopMap.values()];
      let saleStop = null;
      if (existingStops.length) {
        saleStop = chooseBestSaleLocation({
          locations: existingStops,
          startSystem: currentSystemName,
          findShortestPath,
        });
      }
      if (!saleStop) {
        saleStop = chooseNearestOutfitterStop({
          planets,
          startSystem: currentSystemName,
          findShortestPath,
          liveMode,
          knownSystems: knownSystemSet,
          reputationsByGovernment: reputationMap,
        });
      }
      if (saleStop) {
        const stop = ensureRouteStop(stopMap, saleStop, existingStops.length ? "mixed" : "sell");
        for (const item of removalItems) {
          stop.sells.push(item);
        }
      }
    }
  }

  const routePlan = currentSystemName
    ? buildRoutePlan({
        startSystem: currentSystemName,
        stopLocations: [...stopMap.values()],
        findShortestPath,
      })
    : { stops: [], unresolvedStops: [...stopMap.values()], totalJumps: 0 };

  const selectedSalaryPerDay = changedShips.reduce((sum, entry) => sum + getShipSalaryPerDay(entry.ship), 0);
  const navigatorFeePerDay = Math.round(selectedSalaryPerDay * 0.1);
  const travelCostPerJump = selectedSalaryPerDay + navigatorFeePerDay;
  const routeLedger = buildStopLedger({
    routeStops: routePlan.stops,
    travelCostPerJump,
    startingCredits: currentCredits,
  });
  const finalStop = routeLedger.stops[routeLedger.stops.length - 1]
    ? {
        system: routeLedger.stops[routeLedger.stops.length - 1].system,
        planet: routeLedger.stops[routeLedger.stops.length - 1].planet,
      }
    : (currentSystemName && currentPlanet?.name
        ? {
            system: currentSystemName,
            planet: currentPlanet.name,
          }
        : null);

  const purchaseCost = routeLedger.stops.reduce((sum, stop) => sum + stop.buyCost, 0);
  const resaleCredit = routeLedger.stops.reduce((sum, stop) => sum + stop.saleCredit, 0);
  const travelCost = routeLedger.stops.reduce((sum, stop) => sum + stop.jumpCost, 0);
  const projectedTotalCost = purchaseCost + travelCost - resaleCredit;
  const canAfford = routeLedger.minCredits >= 0;

  const blockers = [];
  if (liveMode && !currentSystemName) {
    blockers.push("A current system is required to simulate the rollout route.");
  }
  if (liveMode && unsourceable.length) {
    blockers.push("Some required outfits are not available on any currently opened outfitter route.");
  }
  if (liveMode && routePlan.unresolvedStops?.length) {
    blockers.push("No route was found to at least one required outfitter stop.");
  }
  if (liveMode && !canAfford) {
    blockers.push("You do not have enough credits to complete the rollout in route order.");
  }

  return {
    changedShips,
    changedShipCount: changedShips.length,
    items,
    missing,
    unsourceable,
    routePlan: {
      ...routePlan,
      stops: routeLedger.stops,
    },
    finalStop,
    purchaseCost,
    resaleCredit,
    selectedSalaryPerDay,
    navigatorFeePerDay,
    travelCostPerJump,
    travelCost,
    projectedTotalCost,
    finalCredits: routeLedger.finalCredits,
    canAfford,
    liveMode,
    currentSystemName,
    currentPlanet,
    blockers,
    canApply:
      changedShips.length > 0 &&
      blockers.length === 0 &&
      Boolean(currentSystemName),
    pricingNote: "Sales use fleet depreciation. Buys at the current outfitter use local stock value; remote stops use list price estimates.",
  };
}

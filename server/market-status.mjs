const PRICE_LIMIT = 20000;
const TOP_ROUTE_COUNT = 5;
const STEALTH_PROXY_CARGO_FINE = 40000;
const STEALTH_PROXY_PASSENGER_FINE = 75000;

function toNumber(token) {
  const value = Number(token);
  return Number.isFinite(value) ? value : 0;
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-absX * absX);
  const value = sign * y;
  if (value >= 1 - 1e-12) {
    return 1;
  }
  if (value <= -1 + 1e-12) {
    return -1;
  }
  return Math.max(-1, Math.min(1, value));
}

function pickField(attributes, fieldName, fallback = 0) {
  const value = attributes[fieldName];
  return typeof value === "number" ? value : fallback;
}

export function buildKnownSystems(save, mapSystems) {
  const known = new Set();
  const frontier = new Set();
  const addSystem = (name, includeFrontier = true) => {
    if (!name || !mapSystems[name]) {
      return;
    }
    known.add(name);
    if (includeFrontier) {
      frontier.add(name);
    }
  };

  for (const name of save.visitedSystems || []) {
    addSystem(name, true);
  }
  addSystem(save.currentSystem, true);

  for (const name of save.travelPlan || []) {
    addSystem(name, true);
  }
  for (const ship of save.ships || []) {
    addSystem(ship.system, true);
  }

  for (const name of frontier) {
    for (const next of mapSystems[name]?.links || []) {
      addSystem(next, false);
    }
  }

  return [...known].sort((a, b) => a.localeCompare(b));
}

export function getDriveInfo(flagship) {
  if (!flagship) {
    return {
      drive: "Unknown",
      jumpFuel: 100,
      currentJumps: 0,
      fullJumps: 0,
    };
  }

  const outfits = flagship.outfits || {};
  let drive = "None";
  let jumpFuel = 100;

  if (outfits["Scram Drive"]) {
    drive = "Scram Drive";
    jumpFuel = 150;
  } else if (outfits["Jump Drive"]) {
    drive = "Jump Drive";
    jumpFuel = 200;
  } else if (outfits.Hyperdrive) {
    drive = "Hyperdrive";
    jumpFuel = 100;
  }

  const currentFuel = flagship.fuel || 0;
  const baseFuelCapacity = toNumber(flagship.attributes["fuel capacity"]);
  const fuelCapacity = Math.max(baseFuelCapacity, currentFuel);

  return {
    drive,
    jumpFuel,
    currentJumps: Math.floor(currentFuel / jumpFuel),
    fullJumps: Math.floor(fuelCapacity / jumpFuel),
  };
}

export function computePrices(save, mapSystems) {
  const prices = {};
  for (const [systemName, supplies] of Object.entries(save.economy.supplies)) {
    const systemData = mapSystems[systemName];
    if (!systemData) {
      continue;
    }
    prices[systemName] = {};
    for (const commodity of save.economy.headers) {
      const base = systemData.trade[commodity];
      if (typeof base !== "number") {
        continue;
      }
      const supply = supplies[commodity] ?? 0;
      prices[systemName][commodity] = base + Math.trunc(-100 * erf(supply / PRICE_LIMIT));
    }
  }
  return prices;
}

export function buildRouteGraph(mapSystems, wormholes = []) {
  const graph = {};
  for (const [name, system] of Object.entries(mapSystems || {})) {
    graph[name] = new Set(system.links || []);
  }
  for (const wormhole of wormholes || []) {
    for (const link of wormhole.links || []) {
      if (!graph[link.from] || !mapSystems[link.to]) {
        continue;
      }
      graph[link.from].add(link.to);
    }
  }
  return Object.fromEntries(
    Object.entries(graph).map(([name, links]) => [name, [...links]])
  );
}

function bfsDistances(routeGraph, start) {
  if (!start || !routeGraph[start]) {
    return {};
  }
  const distances = { [start]: 0 };
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    const depth = distances[current];
    for (const next of routeGraph[current] || []) {
      if (distances[next] !== undefined || !routeGraph[next]) {
        continue;
      }
      distances[next] = depth + 1;
      queue.push(next);
    }
  }
  return distances;
}

function bestCommodity(pricesFrom, pricesTo) {
  return topCommodityDeltas(pricesFrom, pricesTo, 1)[0] || null;
}

function topCommodityDeltas(pricesFrom, pricesTo, limit = 3) {
  return Object.entries(pricesFrom || {})
    .map(([commodity, fromPrice]) => {
      const toPrice = pricesTo?.[commodity];
      if (typeof toPrice !== "number") {
        return null;
      }
      const margin = toPrice - fromPrice;
      if (margin <= 0) {
        return null;
      }
      return {
        commodity,
        buy: fromPrice,
        sell: toPrice,
        margin,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.margin - a.margin || a.commodity.localeCompare(b.commodity))
    .slice(0, limit);
}

export function buildIllegalExposure(save, outfitsByName) {
  const activeShips = save.ships.filter((ship) => !ship.parked);
  const ships = activeShips.length ? activeShips : save.ships;
  const byOutfit = new Map();
  let totalIllegalFine = 0;
  let totalScanInterference = 0;
  let totalCargoConcealment = 0;
  let totalOutfitScanOpacity = 0;
  let totalCargoScanOpacity = 0;

  for (const ship of ships) {
    for (const [outfitName, count] of Object.entries(ship.outfits || {})) {
      const outfit = outfitsByName[outfitName];
      if (!outfit) {
        continue;
      }
      const quantity = Math.max(0, Number(count) || 0);
      const illegal = pickField(outfit.attributes, "illegal");
      const scanInterference = pickField(outfit.attributes, "scan interference");
      const scanConcealment = pickField(outfit.attributes, "scan concealment");
      const outfitScanOpacity = pickField(outfit.attributes, "outfit scan opacity");
      const cargoScanOpacity = pickField(outfit.attributes, "cargo scan opacity");
      totalScanInterference += scanInterference * quantity;
      totalCargoConcealment += scanConcealment * quantity;
      totalOutfitScanOpacity += outfitScanOpacity * quantity;
      totalCargoScanOpacity += cargoScanOpacity * quantity;
      if (illegal <= 0) {
        continue;
      }
      totalIllegalFine += illegal * quantity;
      const current = byOutfit.get(outfitName) || {
        name: outfitName,
        count: 0,
        fineEach: illegal,
        totalFine: 0,
      };
      current.count += quantity;
      current.totalFine += illegal * quantity;
      byOutfit.set(outfitName, current);
    }
  }

  return {
    activeShipCount: ships.length,
    totalIllegalFine,
    totalScanInterference,
    totalCargoConcealment,
    totalOutfitScanOpacity,
    totalCargoScanOpacity,
    illegalOutfits: [...byOutfit.values()]
      .sort((a, b) => b.totalFine - a.totalFine || a.name.localeCompare(b.name))
      .slice(0, 12),
  };
}

export function buildMissionExposure(missions = []) {
  const illegalMissions = [];
  let totalIllegalFine = 0;
  let totalEffectiveFine = 0;
  let cargoIllegalFine = 0;
  let passengerIllegalFine = 0;
  let cargoEffectiveFine = 0;
  let passengerEffectiveFine = 0;
  let illegalCargoTons = 0;
  let illegalPassengers = 0;

  for (const mission of missions) {
    const illegalFine = Math.max(0, Number(mission.illegalFine) || 0);
    const stealth = !!(mission.stealth || mission.infiltrating);
    if (!illegalFine && !stealth) {
      continue;
    }
    const cargoTons = Math.max(0, Number(mission.cargoTons) || 0);
    const passengers = Math.max(0, Number(mission.passengers) || 0);
    const effectiveFine =
      illegalFine ||
      (stealth
        ? cargoTons > 0
          ? STEALTH_PROXY_CARGO_FINE
          : passengers > 0
            ? STEALTH_PROXY_PASSENGER_FINE
            : STEALTH_PROXY_CARGO_FINE
        : 0);
    totalIllegalFine += illegalFine;
    totalEffectiveFine += effectiveFine;
    if (cargoTons > 0) {
      cargoIllegalFine += illegalFine;
      cargoEffectiveFine += effectiveFine;
      illegalCargoTons += cargoTons;
    } else {
      passengerIllegalFine += illegalFine;
      passengerEffectiveFine += effectiveFine;
      illegalPassengers += passengers;
    }
    illegalMissions.push({
      id: mission.id,
      name: mission.name,
      destination: mission.destination || null,
      illegalFine,
      effectiveFine,
      cargoTons,
      passengers,
      stealth,
    });
  }

  return {
    totalIllegalFine,
    totalEffectiveFine,
    cargoIllegalFine,
    passengerIllegalFine,
    cargoEffectiveFine,
    passengerEffectiveFine,
    illegalCargoTons,
    illegalPassengers,
    stealthMissionCount: illegalMissions.filter((mission) => mission.stealth).length,
    illegalMissions: illegalMissions
      .sort((a, b) => b.effectiveFine - a.effectiveFine || a.name.localeCompare(b.name))
      .slice(0, 12),
  };
}

export function buildPlannerSettings(save, illegalExposure, missionExposure) {
  const scanInterference = Math.max(0, Number(illegalExposure?.totalScanInterference) || 0);
  const cargoConcealment = Math.max(0, Number(illegalExposure?.totalCargoConcealment) || 0);
  const scanSuccessChance = 1 / (1 + scanInterference);
  const scanBlockChance = 1 - scanSuccessChance;
  const illegalCargoTons = Math.max(0, Number(missionExposure?.illegalCargoTons) || 0);
  const cargoVisibleShare = illegalCargoTons
    ? Math.max(0, illegalCargoTons - cargoConcealment) / illegalCargoTons
    : 0;
  const salaryPerJump = Math.max(0, Number(save?.dailySalary) || 0);
  const debtPerJump = Math.max(0, Number(save?.dailyDebt) || 0);
  const illegalOutfitRiskPerJump = Math.round(
    Math.max(0, Number(illegalExposure?.totalIllegalFine) || 0) * scanSuccessChance
  );
  const illegalMissionRiskPerJump = Math.round(
    Math.max(0, Number(missionExposure?.passengerEffectiveFine) || 0) * scanSuccessChance +
      Math.max(0, Number(missionExposure?.cargoEffectiveFine) || 0) * scanSuccessChance * cargoVisibleShare
  );
  const operatingCostPerJump =
    salaryPerJump + debtPerJump + illegalOutfitRiskPerJump + illegalMissionRiskPerJump;

  return {
    operatingCostPerJump,
    estimated: true,
    salaryPerJump,
    debtPerJump,
    illegalOutfitRiskPerJump,
    illegalMissionRiskPerJump,
    scanSuccessChance,
    scanBlockChance,
    cargoVisibleShare,
    illegalExposure,
    missionExposure,
  };
}

function applyRouteEconomics(grossProfit, jumpCount, accessPenalty, planning, effectiveJumps = jumpCount) {
  const jumps = Math.max(1, Number(jumpCount) || 0);
  const routeJumps = Math.max(1, Number(effectiveJumps) || jumps);
  const operatingCostPerJump = planning?.operatingCostPerJump || 0;
  const operatingCost = operatingCostPerJump * routeJumps;
  const netProfit = grossProfit - operatingCost;
  const grossPerJump = Math.round(grossProfit / jumps);
  const netPerJump = Math.round(netProfit / routeJumps);
  const grossPerDay = Math.round(grossProfit / routeJumps);
  const netPerDay = Math.round(netProfit / routeJumps);
  const weightedNetPerDay = Math.round(netPerDay * (accessPenalty || 1));
  return {
    operatingCostPerJump,
    operatingCost,
    netProfit,
    grossPerJump,
    netPerJump,
    grossPerDay,
    netPerDay,
    weightedNetPerDay,
  };
}

export function buildDirectMarketsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning) {
  const systems = Object.keys(prices);
  const currentSystem = save.currentSystem;
  const currentDistances = bfsDistances(routeGraph, currentSystem);
  const maxLegJumps = Math.max(0, driveInfo.fullJumps);
  const routes = [];

  for (const origin of systems) {
    const repositionJumps = currentDistances[origin];
    if (repositionJumps === undefined) {
      continue;
    }
    const originPrices = prices[origin] || {};
    const originDistances = bfsDistances(routeGraph, origin);

    for (const [destination, jumps] of Object.entries(originDistances)) {
      if (destination === origin || jumps <= 0 || jumps > maxLegJumps) {
        continue;
      }
      const destinationPrices = prices[destination];
      if (!destinationPrices) {
        continue;
      }

      const topTrades = topCommodityDeltas(originPrices, destinationPrices, 3);
      const best = topTrades[0];
      if (!best) {
        continue;
      }

      const access = combineRouteAccess([origin, destination], systemAccess);
      const grossProfit = best.margin * save.tradeCargoCapacity;
      const travelJumps = repositionJumps + jumps;
      const economics = applyRouteEconomics(grossProfit, jumps, access.penalty, planning, travelJumps);
      if (economics.netProfit <= 0) {
        continue;
      }

      routes.push({
        type: "directMarket",
        origin,
        destination,
        jumps,
        repositionJumps,
        travelJumps,
        outward: best,
        topTrades,
        access,
        tradeCapacity: save.tradeCargoCapacity,
        projectedProfit: grossProfit,
        operatingCost: economics.operatingCost,
        operatingCostPerJump: economics.operatingCostPerJump,
        netProfit: economics.netProfit,
        profitPerJump: economics.grossPerJump,
        netProfitPerJump: economics.netPerJump,
        profitPerDayFromHere: economics.netPerDay,
        weightedProfitPerDayFromHere: economics.weightedNetPerDay,
        marginPerTonPerJump: Math.round((best.margin / Math.max(1, travelJumps)) * 10) / 10,
      });
    }
  }

  return pickRouteResults(
    routes,
    (a, b) =>
      b.weightedProfitPerDayFromHere - a.weightedProfitPerDayFromHere ||
      a.repositionJumps - b.repositionJumps ||
      b.netProfit - a.netProfit ||
      b.outward.margin - a.outward.margin,
    (a, b) =>
      b.netProfit - a.netProfit ||
      b.weightedProfitPerDayFromHere - a.weightedProfitPerDayFromHere ||
      a.repositionJumps - b.repositionJumps,
  );
}

export function buildCarrySales(save, prices, routeGraph, driveInfo, systemAccess, planning) {
  const origin = save.currentSystem;
  const originDistances = bfsDistances(routeGraph, origin);
  const routes = [];

  for (const [commodity, tons] of Object.entries(save.cargo)) {
    const basisTotal = save.basis[commodity] || 0;
    const basisPerTon = tons > 0 ? basisTotal / tons : 0;

    for (const [destination, jumps] of Object.entries(originDistances)) {
      if (destination === origin || jumps === 0 || jumps > driveInfo.currentJumps) {
        continue;
      }
      const sellPrice = prices[destination]?.[commodity];
      if (typeof sellPrice !== "number") {
        continue;
      }
      const margin = sellPrice - basisPerTon;
      if (margin <= 0) {
        continue;
      }
      const access = combineRouteAccess([destination], systemAccess);
      const projectedProfit = Math.round(margin * tons);
      const economics = applyRouteEconomics(projectedProfit, jumps, access.penalty, planning, jumps);
      if (economics.netProfit <= 0) {
        continue;
      }
      routes.push({
        type: "carrySale",
        origin,
        destination,
        commodity,
        tons,
        jumps,
        buy: Math.round(basisPerTon * 100) / 100,
        sell: sellPrice,
        margin: Math.round(margin * 100) / 100,
        access,
        projectedProfit,
        operatingCost: economics.operatingCost,
        operatingCostPerJump: economics.operatingCostPerJump,
        netProfit: economics.netProfit,
        profitPerJump: economics.grossPerJump,
        netProfitPerJump: economics.netPerJump,
        weightedProfitPerJump: Math.round(economics.netPerJump * access.penalty),
      });
    }
  }

  return pickRouteResults(
    routes,
    (a, b) => b.weightedProfitPerJump - a.weightedProfitPerJump || b.netProfit - a.netProfit,
    (a, b) => b.netProfit - a.netProfit || b.weightedProfitPerJump - a.weightedProfitPerJump,
  );
}

export function buildLoopsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning) {
  const systems = Object.keys(prices);
  const currentSystem = save.currentSystem;
  const currentDistances = bfsDistances(routeGraph, currentSystem);
  const maxLegJumps = Math.max(0, driveInfo.fullJumps);
  const loopMap = new Map();

  for (const origin of systems) {
    const repositionJumps = currentDistances[origin];
    if (repositionJumps === undefined) {
      continue;
    }
    const originPrices = prices[origin];
    const originDistances = bfsDistances(routeGraph, origin);

    for (const [destination, jumpsOut] of Object.entries(originDistances)) {
      if (destination === origin || jumpsOut <= 0 || jumpsOut > maxLegJumps) {
        continue;
      }
      const destinationPrices = prices[destination];
      if (!destinationPrices) {
        continue;
      }
      const outward = bestCommodity(originPrices, destinationPrices);
      const jumpsBack = bfsDistances(routeGraph, destination)[origin];
      const inbound = bestCommodity(destinationPrices, originPrices);
      if (!outward || !inbound || jumpsBack === undefined || jumpsBack > maxLegJumps) {
        continue;
      }

      const totalJumps = jumpsOut + jumpsBack;
      const totalMargin = outward.margin + inbound.margin;
      const effectiveDays = totalJumps + repositionJumps;
      const access = combineRouteAccess([origin, destination], systemAccess);
      const projectedProfit = totalMargin * save.tradeCargoCapacity;
      const economics = applyRouteEconomics(projectedProfit, totalJumps, access.penalty, planning, effectiveDays);
      if (economics.netProfit <= 0) {
        continue;
      }
      const candidate = {
        type: "loop",
        origin,
        destination,
        outward,
        inbound,
        jumpsOut,
        jumpsBack,
        totalJumps,
        totalMargin,
        projectedProfit,
        repositionJumps,
        effectiveDays,
        access,
        operatingCost: economics.operatingCost,
        operatingCostPerJump: economics.operatingCostPerJump,
        netProfit: economics.netProfit,
        profitPerJump: economics.grossPerJump,
        netProfitPerJump: economics.netPerJump,
        profitPerDayFromHere: economics.netPerDay,
        weightedProfitPerDayFromHere: economics.weightedNetPerDay,
        cargoBasis: "trade capacity",
        tradeCapacity: save.tradeCargoCapacity,
      };

      const pairKey = [origin, destination].sort().join("|");
      const existing = loopMap.get(pairKey);
      if (
        !existing ||
        candidate.weightedProfitPerDayFromHere > existing.weightedProfitPerDayFromHere ||
        (candidate.weightedProfitPerDayFromHere === existing.weightedProfitPerDayFromHere &&
          candidate.projectedProfit > existing.projectedProfit)
      ) {
        loopMap.set(pairKey, candidate);
      }
    }
  }

  return pickRouteResults(
    [...loopMap.values()],
    (a, b) =>
      b.weightedProfitPerDayFromHere - a.weightedProfitPerDayFromHere ||
      a.repositionJumps - b.repositionJumps ||
      b.netProfit - a.netProfit,
    (a, b) =>
      b.profitPerDayFromHere - a.profitPerDayFromHere ||
      a.repositionJumps - b.repositionJumps ||
      b.netProfit - a.netProfit,
  );
}

export function buildReachableLoops(save, prices, routeGraph, driveInfo, systemAccess, planning) {
  return buildLoopsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning);
}

export function buildCargoSummary(save, localPrices) {
  return Object.entries(save.cargo)
    .map(([commodity, tons]) => {
      const basisTotal = save.basis[commodity] || 0;
      const basisPerTon = tons > 0 ? basisTotal / tons : 0;
      const localPrice = localPrices?.[commodity] || 0;
      return {
        commodity,
        tons,
        basisPerTon: Math.round(basisPerTon * 100) / 100,
        localPrice,
        localMarginPerTon: Math.round((localPrice - basisPerTon) * 100) / 100,
        localSaleValue: localPrice * tons,
      };
    })
    .sort((a, b) => b.tons - a.tons);
}

function pickRouteResults(routes, primarySort, rawSort, limit = TOP_ROUTE_COUNT, extras = 2) {
  const ranked = [...routes].sort(primarySort);
  const selected = ranked.slice(0, limit);
  const notable = [...routes]
    .sort(rawSort)
    .filter((route) => route.access?.status && route.access.status !== "open" && !selected.includes(route))
    .slice(0, extras);
  return [...selected, ...notable];
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

export function mergeSaleGroups(baseGroups, dynamicGroups) {
  return {
    shipyard: {
      ...(baseGroups?.shipyard || {}),
      ...(dynamicGroups?.shipyard || {}),
    },
    outfitter: {
      ...(baseGroups?.outfitter || {}),
      ...(dynamicGroups?.outfitter || {}),
    },
  };
}

export function buildPlanetCatalog(planets, saleGroups, overrides = {}) {
  return planets.map((planet) => {
    const override = overrides[planet.name] || null;
    let shipyardGroups = [...(planet.shipyards || [])];
    let outfitterGroups = [...(planet.outfitters || [])];
    let spaceport = [...(planet.spaceport || [])];

    if (override?.shipyardClear) {
      shipyardGroups = [];
    }
    if (override?.outfitterClear) {
      outfitterGroups = [];
    }
    if (override?.spaceportClear) {
      spaceport = [];
    }
    if (override?.shipyardRemovals?.length) {
      const removed = new Set(override.shipyardRemovals);
      shipyardGroups = shipyardGroups.filter((group) => !removed.has(group));
    }
    if (override?.outfitterRemovals?.length) {
      const removed = new Set(override.outfitterRemovals);
      outfitterGroups = outfitterGroups.filter((group) => !removed.has(group));
    }
    if (override?.shipyards?.length) {
      shipyardGroups = uniqueStrings([...shipyardGroups, ...override.shipyards]);
    }
    if (override?.outfitters?.length) {
      outfitterGroups = uniqueStrings([...outfitterGroups, ...override.outfitters]);
    }
    if (override?.spaceport?.length) {
      spaceport = override.spaceport;
    }

    const shipItems = uniqueStrings(
      shipyardGroups.flatMap((groupName) => saleGroups.shipyard[groupName]?.items || [])
    );
    const outfitItems = uniqueStrings(
      outfitterGroups.flatMap((groupName) => saleGroups.outfitter[groupName]?.items || [])
    );

    return {
      ...planet,
      descriptions: override?.descriptions?.length ? override.descriptions : planet.descriptions,
      spaceport,
      requiredReputation:
        override?.requiredReputation !== null && override?.requiredReputation !== undefined
          ? override.requiredReputation
          : planet.requiredReputation,
      security:
        override?.security !== null && override?.security !== undefined
          ? override.security
          : planet.security,
      shipyards: shipyardGroups,
      outfitters: outfitterGroups,
      shipItems,
      outfitItems,
      hasShipyard: shipyardGroups.length > 0,
      hasOutfitter: outfitterGroups.length > 0,
      saveOverride: override
        ? {
            present: true,
            shipyardClear: Boolean(override.shipyardClear),
            outfitterClear: Boolean(override.outfitterClear),
            spaceportClear: Boolean(override.spaceportClear),
            shipyardAdds: [...(override.shipyards || [])],
            outfitterAdds: [...(override.outfitters || [])],
            shipyardRemovals: [...(override.shipyardRemovals || [])],
            outfitterRemovals: [...(override.outfitterRemovals || [])],
            requiredReputation:
              override.requiredReputation !== null && override.requiredReputation !== undefined
                ? override.requiredReputation
                : null,
            security:
              override.security !== null && override.security !== undefined ? override.security : null,
            descriptionsCount: override?.descriptions?.length || 0,
            spaceportCount: override?.spaceport?.length || 0,
          }
        : null,
    };
  });
}

export function buildSaleIndex(planets, shipsByName, outfitsByName) {
  const shipSales = {};
  const outfitSales = {};

  for (const planet of planets) {
    for (const shipName of planet.shipItems || []) {
      const ship = shipsByName[shipName];
      if (!shipSales[shipName]) {
        shipSales[shipName] = [];
      }
      shipSales[shipName].push({
        planet: planet.name,
        system: planet.system,
        government: planet.government || planet.systemGovernment || null,
        shipyardGroups: planet.shipyards,
        requiredReputation: planet.requiredReputation,
        cost: ship?.attributes?.cost || null,
        licenses: ship?.licenses || [],
      });
    }

    for (const outfitName of planet.outfitItems || []) {
      const outfit = outfitsByName[outfitName];
      if (!outfitSales[outfitName]) {
        outfitSales[outfitName] = [];
      }
      outfitSales[outfitName].push({
        planet: planet.name,
        system: planet.system,
        government: planet.government || planet.systemGovernment || null,
        outfitterGroups: planet.outfitters,
        requiredReputation: planet.requiredReputation,
        cost: outfit?.attributes?.cost || null,
      });
    }
  }

  return { shipSales, outfitSales };
}

function reputationForGovernment(save, government) {
  if (!government) {
    return null;
  }
  if (save.reputations[government] !== undefined) {
    return save.reputations[government];
  }
  const simplified = government.replace(/\s*\([^)]*\)\s*$/, "");
  if (simplified && save.reputations[simplified] !== undefined) {
    return save.reputations[simplified];
  }
  return null;
}

function hasRequiredLicenses(save, licenses = []) {
  if (!licenses.length) {
    return true;
  }
  const owned = new Set(save.licenses || []);
  return licenses.every((license) => {
    if (owned.has(license)) {
      return true;
    }
    return owned.has(license.replace(/ License$/, ""));
  });
}

function canAccessSaleLocation(save, location, licenses = []) {
  const requiredReputation = location.requiredReputation ?? 0;
  const reputation = reputationForGovernment(save, location.government);
  const reputationOk = reputation === null ? requiredReputation <= 0 : reputation >= requiredReputation;
  return reputationOk && hasRequiredLicenses(save, licenses);
}

export function buildSystemAccessMap(planets, save) {
  const bySystem = new Map();

  for (const planet of planets) {
    if (!planet.system) {
      continue;
    }
    if (!bySystem.has(planet.system)) {
      bySystem.set(planet.system, []);
    }
    const government = planet.government || planet.systemGovernment || null;
    const reputation = reputationForGovernment(save, government);
    const requiredReputation =
      planet.requiredReputation !== null && planet.requiredReputation !== undefined
        ? planet.requiredReputation
        : 0;
    const accessible = reputation === null ? requiredReputation <= 0 : reputation >= requiredReputation;

    let status = "open";
    let penalty = 1;
    if (!accessible) {
      status = "blocked";
      penalty = 0.12;
    } else if (reputation !== null && reputation < 0) {
      status = "unfriendly";
      penalty = 0.72;
    } else if (requiredReputation > 0) {
      status = "gated";
      penalty = 0.92;
    }

    const alert =
      status === "blocked"
        ? `Landing blocked at ${planet.name}${government ? ` by ${government}` : ""}${reputation !== null ? ` · reputation ${Math.round(reputation)}` : ""}${requiredReputation ? ` · needs ${requiredReputation}` : ""}`
        : status === "unfriendly"
          ? `Landing possible at ${planet.name}, but ${government || "local government"} reputation is ${Math.round(reputation)}`
          : status === "gated"
            ? `Landing open at ${planet.name} if reputation stays above ${requiredReputation}`
            : `Landing open at ${planet.name}`;

    bySystem.get(planet.system).push({
      system: planet.system,
      planet: planet.name,
      government,
      reputation,
      requiredReputation,
      accessible,
      status,
      penalty,
      alert,
    });
  }

  const result = {};
  for (const [systemName, entries] of bySystem.entries()) {
    const accessible = entries.filter((entry) => entry.accessible);
    const sortAccessible = (left, right) =>
      right.penalty - left.penalty ||
      (right.reputation ?? Number.POSITIVE_INFINITY) - (left.reputation ?? Number.POSITIVE_INFINITY) ||
      left.requiredReputation - right.requiredReputation ||
      left.planet.localeCompare(right.planet);
    const sortBlocked = (left, right) =>
      (right.reputation ?? Number.NEGATIVE_INFINITY) - (left.reputation ?? Number.NEGATIVE_INFINITY) ||
      left.requiredReputation - right.requiredReputation ||
      left.planet.localeCompare(right.planet);

    if (accessible.length) {
      const best = [...accessible].sort(sortAccessible)[0];
      result[systemName] = {
        system: systemName,
        status: best.status,
        penalty: best.penalty,
        accessible: true,
        bestPlanet: best.planet,
        government: best.government,
        reputation: best.reputation,
        requiredReputation: best.requiredReputation,
        alert: best.alert,
      };
      continue;
    }

    if (entries.length) {
      const best = [...entries].sort(sortBlocked)[0];
      result[systemName] = {
        system: systemName,
        status: "blocked",
        penalty: 0.12,
        accessible: false,
        bestPlanet: best.planet,
        government: best.government,
        reputation: best.reputation,
        requiredReputation: best.requiredReputation,
        alert: best.alert,
      };
      continue;
    }

    result[systemName] = {
      system: systemName,
      status: "unknown",
      penalty: 0.4,
      accessible: false,
      bestPlanet: null,
      government: null,
      reputation: null,
      requiredReputation: 0,
      alert: `No landable planet data recorded for ${systemName}.`,
    };
  }

  return result;
}

function combineRouteAccess(systems, systemAccess) {
  const nodes = systems
    .filter(Boolean)
    .map((system) => systemAccess[system] || {
      system,
      status: "unknown",
      penalty: 0.4,
      accessible: false,
      alert: `No landable planet data recorded for ${system}.`,
    });
  const worst = [...nodes].sort((left, right) => left.penalty - right.penalty)[0] || null;
  const penalty = nodes.reduce((value, entry) => Math.min(value, entry.penalty ?? 1), 1);
  return {
    status: worst?.status || "open",
    penalty,
    systems: nodes,
    alert: worst?.alert || "",
  };
}

export function buildLicenseWiki(outfits, outfitSales, save, ships) {
  const requiredByLicense = {};
  for (const ship of ships) {
    for (const license of ship.licenses || []) {
      const normalized = `${license} License`;
      if (!requiredByLicense[normalized]) {
        requiredByLicense[normalized] = [];
      }
      requiredByLicense[normalized].push(ship.name);
    }
  }

  return outfits
    .filter((outfit) => outfit.category === "Licenses")
    .map((license) => {
      const owned = save.licenses.includes(license.name) ||
        save.licenses.includes(license.name.replace(/ License$/, ""));
      const locations = outfitSales[license.name] || [];
      return {
        ...license,
        owned,
        currentSaleLocations: locations,
        requiredByShips: (requiredByLicense[license.name] || []).sort(),
        acquisitionHint: locations.length
          ? "Sold at the listed outfitters if you meet local access requirements."
          : "Not sold at a standard outfitter in the current game state. This license usually comes from faction or story progression.",
      };
    })
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
}

export function buildShipWiki(ships, currentSaleIndex, baseSaleIndex, save) {
  return ships
    .map((ship) => {
      const currentSaleLocations = currentSaleIndex.shipSales[ship.name] || [];
      const knownSaleLocations = baseSaleIndex.shipSales[ship.name] || [];
      const progressSaleLocations = currentSaleLocations.filter((location) =>
        canAccessSaleLocation(save, location, ship.licenses || [])
      );
      return {
        name: ship.name,
        cost: ship.attributes.cost || 0,
        licenses: ship.licenses || [],
        currentSaleLocations,
        knownSaleLocations,
        progressSaleLocations,
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.progressSaleLocations.length)) - Number(Boolean(a.progressSaleLocations.length)) ||
        Number(Boolean(b.currentSaleLocations.length)) - Number(Boolean(a.currentSaleLocations.length)) ||
        a.name.localeCompare(b.name)
    );
}

export function buildOutfitWiki(outfits, currentSaleIndex, baseSaleIndex, save) {
  return outfits
    .filter((outfit) => outfit.category !== "Licenses")
    .map((outfit) => {
      const currentSaleLocations = currentSaleIndex.outfitSales[outfit.name] || [];
      const knownSaleLocations = baseSaleIndex.outfitSales[outfit.name] || [];
      const progressSaleLocations = currentSaleLocations.filter((location) =>
        canAccessSaleLocation(save, location)
      );
      return {
        name: outfit.name,
        category: outfit.category,
        slotType: outfit.slotType,
        cost: outfit.attributes?.cost || 0,
        currentSaleLocations,
        knownSaleLocations,
        progressSaleLocations,
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.progressSaleLocations.length)) - Number(Boolean(a.progressSaleLocations.length)) ||
        Number(Boolean(b.currentSaleLocations.length)) - Number(Boolean(a.currentSaleLocations.length)) ||
        a.name.localeCompare(b.name)
    );
}

export function buildAtlasSystems(planets, prices, systems) {
  const planetsBySystem = {};
  for (const planet of planets) {
    if (!planet.system) {
      continue;
    }
    if (!planetsBySystem[planet.system]) {
      planetsBySystem[planet.system] = [];
    }
    planetsBySystem[planet.system].push({
      name: planet.name,
      hasShipyard: planet.hasShipyard,
      hasOutfitter: planet.hasOutfitter,
      shipCount: planet.shipItems.length,
      outfitCount: planet.outfitItems.length,
      requiredReputation: planet.requiredReputation,
    });
  }

  return Object.entries(systems)
    .map(([systemName, system]) => ({
      name: systemName,
      x: system.pos?.[0] ?? null,
      y: system.pos?.[1] ?? null,
      prices: prices[systemName] || null,
      planets: (planetsBySystem[systemName] || []).sort((a, b) => a.name.localeCompare(b.name)),
      hasTrade: !!prices[systemName],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

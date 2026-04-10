import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAtlasSystems,
  buildCarrySales,
  buildCargoSummary,
  buildDirectMarketsFromHere,
  buildIllegalExposure,
  buildKnownSystems,
  buildLicenseWiki,
  buildLoopsFromHere,
  buildMissionExposure,
  buildOutfitWiki,
  buildPlanetCatalog,
  buildPlannerSettings,
  buildReachableLoops,
  buildRouteGraph,
  buildSaleIndex,
  buildShipWiki,
  buildSystemAccessMap,
  computePrices,
  getDriveInfo,
  mergeSaleGroups,
} from "./market-status.mjs";
import { loadSavedFits } from "./fits-store.mjs";
import { loadAppMeta, resolveGameRootSelection, resolveSaveSelection } from "./runtime-paths.mjs";
import { parseSave } from "./save-parse.mjs";

function toNumber(token) {
  const value = Number(token);
  return Number.isFinite(value) ? value : 0;
}

function reduceShipForStatus(ship, saveIndex = null) {
  return {
    saveIndex,
    uuid: ship.uuid,
    model: ship.model,
    name: ship.name,
    parked: ship.parked,
    system: ship.system,
    planet: ship.planet,
    crew: ship.crew,
    fuel: ship.fuel,
    shields: ship.shields,
    hull: ship.hull,
    attributes: {
      cargoSpace: toNumber(ship.attributes["cargo space"]),
      bunks: toNumber(ship.attributes.bunks),
      requiredCrew: toNumber(ship.attributes["required crew"]),
      fuelCapacity: toNumber(ship.attributes["fuel capacity"]),
      outfitSpace: toNumber(ship.attributes["outfit space"]),
      weaponCapacity: toNumber(ship.attributes["weapon capacity"]),
      engineCapacity: toNumber(ship.attributes["engine capacity"]),
      gunPorts: toNumber(ship.attributes["gun ports"]),
      turretMounts: toNumber(ship.attributes["turret mounts"]),
      mass: toNumber(ship.attributes.mass),
      drag: toNumber(ship.attributes.drag),
      shields: toNumber(ship.attributes.shields),
      hull: toNumber(ship.attributes.hull),
    },
    outfits: ship.outfits,
    cargo: ship.cargo,
  };
}

function pickMajorReputations(reputations) {
  const preferredOrder = [
    "Republic",
    "Free Worlds",
    "Syndicate",
    "Militia",
    "Merchant",
    "Navy",
    "Pirate",
    "Deep",
    "Hai",
    "Unfettered",
    "Kor Mereti",
    "Kor Sestor",
    "Korath",
    "Coalition",
    "Remnant",
  ];
  const excludedPatterns = [
    /Test Dummy/i,
    /\(Hostile\)/i,
    /\(Killable\)/i,
    /^Bad Trip$/i,
    /^Alpha$/i,
    /^Bounty$/i,
    /^Bounty Hunter/i,
    /^Drak/i,
    /^Scars? Legion/i,
    /^Pirate \(Devil-Run Gang\)$/i,
  ];

  return Object.entries(reputations)
    .filter(([name, value]) => {
      if (Math.abs(value) < 50) {
        return false;
      }
      if (excludedPatterns.some((pattern) => pattern.test(name))) {
        return false;
      }
      if (preferredOrder.includes(name)) {
        return true;
      }
      return /Pirate|Hai|Kor|Republic|Free Worlds|Syndicate|Militia|Merchant|Navy|Deep|Coalition|Remnant/i.test(name);
    })
    .sort((a, b) => {
      const rankA = preferredOrder.indexOf(a[0]);
      const rankB = preferredOrder.indexOf(b[0]);
      if (rankA !== -1 || rankB !== -1) {
        return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
      }
      return Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]);
    })
    .slice(0, 16)
    .map(([name, value]) => ({ name, value }));
}

export async function resolveGameData(deps) {
  const { APP_CONFIG_PATH, ensureGameData } = deps;
  const selection = await resolveGameRootSelection(APP_CONFIG_PATH);
  if (!selection.available || !selection.gameRoot) {
    return {
      available: false,
      selection,
      game: null,
      issue: selection.issue,
    };
  }

  try {
    const game = await ensureGameData();
    return {
      available: true,
      selection,
      game,
      issue: null,
    };
  } catch (error) {
    return {
      available: false,
      selection,
      game: null,
      issue: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildBootstrap(deps) {
  const {
    APP_CONFIG_PATH,
    PACKAGE_JSON_PATH,
    POLL_SECONDS,
    appMetaCache,
    fitsStoreDeps,
  } = deps;
  const appMeta = await loadAppMeta(PACKAGE_JSON_PATH, appMetaCache);
  const gameState = await resolveGameData(deps);
  const game = gameState.game;
  const savedFits = await loadSavedFits(fitsStoreDeps);
  const saveSelection = await resolveSaveSelection(APP_CONFIG_PATH);
  return {
    generatedAt: new Date().toISOString(),
    pollSeconds: POLL_SECONDS,
    gameRoot: game?.gameRoot || gameState.selection.gameRoot,
    game: {
      available: gameState.available,
      root: gameState.selection.gameRoot,
      source: gameState.selection.source,
      configuredGameRoot: gameState.selection.configuredGameRoot,
      configPath: gameState.selection.configPath,
      issue: gameState.issue,
      candidates: gameState.selection.candidates,
    },
    save: {
      available: saveSelection.available,
      path: saveSelection.selectedSavePath,
      name: saveSelection.selectedSavePath
        ? path.basename(saveSelection.selectedSavePath).trim()
        : null,
      source: saveSelection.source,
      configuredRecentPath: saveSelection.configuredRecentPath,
      configPath: saveSelection.configPath,
      platform: saveSelection.platform,
      issue: saveSelection.issue,
      recentPath: saveSelection.recentSavePath,
      directory: saveSelection.savesDir,
      defaultRecentPath: saveSelection.defaultRecentPath,
      recentCandidates: saveSelection.recentCandidates,
      candidates: saveSelection.saves,
    },
    map: {
      systems: game?.systems || [],
      planets: game?.planets || [],
      wormholes: game?.wormholes || [],
    },
    ships: game?.ships || [],
    outfits: game?.outfits || [],
    fits: {
      presets: game?.presets || [],
      saved: savedFits,
    },
    config: {
      configPath: APP_CONFIG_PATH,
    },
    app: appMeta,
  };
}

export async function buildStatus(deps) {
  const {
    APP_CONFIG_PATH,
    PACKAGE_JSON_PATH,
    POLL_SECONDS,
    appMetaCache,
    listSaveBackups,
  } = deps;
  const appMeta = await loadAppMeta(PACKAGE_JSON_PATH, appMetaCache);
  const gameState = await resolveGameData(deps);
  const game = gameState.game;
  const saveSelection = await resolveSaveSelection(APP_CONFIG_PATH);
  if (!saveSelection.selectedSavePath || !game) {
    const saveAvailable = Boolean(saveSelection.selectedSavePath);
    return {
      generatedAt: new Date().toISOString(),
      saveUnavailable: !saveAvailable,
      gameUnavailable: !gameState.available,
      game: {
        available: gameState.available,
        root: gameState.selection.gameRoot,
        source: gameState.selection.source,
        configuredGameRoot: gameState.selection.configuredGameRoot,
        configPath: gameState.selection.configPath,
        issue: gameState.issue,
        candidates: gameState.selection.candidates,
      },
      save: {
        available: saveAvailable,
        path: saveSelection.selectedSavePath,
        name: saveSelection.selectedSavePath ? path.basename(saveSelection.selectedSavePath).trim() : null,
        source: saveSelection.source,
        configuredRecentPath: saveSelection.configuredRecentPath,
        configPath: saveSelection.configPath,
        platform: saveSelection.platform,
        issue: saveSelection.issue,
        recentPath: saveSelection.recentSavePath,
        directory: saveSelection.savesDir,
        defaultRecentPath: saveSelection.defaultRecentPath,
        recentCandidates: saveSelection.recentCandidates,
        candidates: saveSelection.saves,
      },
      player: {
        date: null,
        currentSystem: null,
        currentPlanet: null,
        currentPosition: null,
        credits: 0,
        score: 0,
        licenses: [],
        visitedSystems: [],
        visitedPlanets: [],
        knownSystems: [],
        standings: [],
        depreciation: {
          fleetOutfits: {},
          stockOutfits: {},
        },
        drive: {
          drive: "Unavailable",
          jumpFuel: 0,
          currentFuel: 0,
          currentJumps: 0,
          fullJumps: 0,
        },
        travelPlan: [],
      },
      fleet: {
        flagshipIndex: 0,
        flagshipUuid: null,
        flagshipName: null,
        activeShips: [],
        parkedShips: [],
        totals: {
          cargoCapacity: 0,
          usedCargo: 0,
          freeCargo: 0,
          missionCargo: 0,
          usedCargoWithMission: 0,
          freeCargoAfterMission: 0,
          tradeCargoCapacity: 0,
          tradeFreeCargo: 0,
          crew: 0,
          requiredCrew: 0,
          bunks: 0,
          missionPassengers: 0,
          occupiedBunks: 0,
          freeBunks: 0,
          dailySalary: 0,
        },
      },
      missions: {
        occupancy: [],
        entries: [],
      },
      wiki: {
        ships: [],
        outfits: [],
        licenses: [],
        planets: [],
        systems: [],
        logbook: { dated: [], named: {} },
      },
      debugEditor: null,
      market: {
        plannerSettings: {
          operatingCostPerJump: 0,
          estimated: true,
          salaryPerJump: 0,
          debtPerJump: 0,
          illegalOutfitRiskPerJump: 0,
          illegalMissionRiskPerJump: 0,
          scanSuccessChance: 1,
          scanBlockChance: 0,
          cargoVisibleShare: 0,
          illegalExposure: {
            activeShipCount: 0,
            totalIllegalFine: 0,
            totalScanInterference: 0,
            totalCargoConcealment: 0,
            totalOutfitScanOpacity: 0,
            totalCargoScanOpacity: 0,
            illegalOutfits: [],
          },
          missionExposure: {
            totalIllegalFine: 0,
            cargoIllegalFine: 0,
            passengerIllegalFine: 0,
            illegalCargoTons: 0,
            illegalPassengers: 0,
            stealthMissionCount: 0,
            illegalMissions: [],
          },
        },
        localPrices: {},
        cargoSummary: [],
        planner: {
          directMarketsFromHere: [],
          carrySales: [],
          loopsFromHere: [],
          reachableLoops: [],
        },
      },
      app: appMeta,
    };
  }
  const savePath = saveSelection.selectedSavePath;
  const saveText = await readFile(savePath, "utf8");
  const save = parseSave(saveText);
  const drive = getDriveInfo(save.flagship);
  const prices = computePrices(save, game.mapSystems);
  const localPrices = prices[save.currentSystem] || {};
  const cargoSummary = buildCargoSummary(save, localPrices);
  const fleetShips = save.ships.map((ship, saveIndex) => reduceShipForStatus(ship, saveIndex));
  const currentSystemData = game.mapSystems[save.currentSystem] || null;
  const shipsByName = Object.fromEntries(game.ships.map((ship) => [ship.name, ship]));
  const outfitsByName = Object.fromEntries(game.outfits.map((outfit) => [outfit.name, outfit]));
  const illegalExposure = buildIllegalExposure(save, outfitsByName);
  const missionsById = Object.fromEntries((game.missions || []).map((mission) => [mission.id, mission]));
  const missionsByName = Object.fromEntries((game.missions || []).map((mission) => [mission.name, mission]));
  const basePlanets = buildPlanetCatalog(game.planets, game.saleGroups);
  const currentPlanets = buildPlanetCatalog(
    game.planets,
    mergeSaleGroups(game.saleGroups, save.dynamicSaleGroups),
    save.dynamicPlanets
  );
  const systemAccess = buildSystemAccessMap(currentPlanets, save);
  const currentSaleIndex = buildSaleIndex(currentPlanets, shipsByName, outfitsByName);
  const baseSaleIndex = buildSaleIndex(basePlanets, shipsByName, outfitsByName);
  const shipWiki = buildShipWiki(game.ships, currentSaleIndex, baseSaleIndex, save);
  const licenseWiki = buildLicenseWiki(game.outfits, currentSaleIndex.outfitSales, save, game.ships);
  const outfitWiki = buildOutfitWiki(game.outfits, currentSaleIndex, baseSaleIndex, save);
  const atlasSystems = buildAtlasSystems(currentPlanets, prices, game.mapSystems);
  const knownSystems = buildKnownSystems(save, game.mapSystems);
  const resolveMissionMeta = (mission) => {
    return (
      missionsById[mission.id] ||
      missionsByName[mission.name] ||
      (game.missions || []).find((entry) => entry.id.startsWith(`${mission.id}:`)) ||
      (game.missions || []).find((entry) => entry.name.startsWith(`${mission.name}:`)) ||
      null
    );
  };
  const missionEntries = save.missions.map((mission) => {
    const meta = resolveMissionMeta(mission);
    return {
      ...mission,
      description: meta?.description || "",
      summary: meta?.summary || "",
      sourcePath: meta?.sourcePath || null,
      illegalFine: meta?.illegalFine || 0,
      stealth: !!meta?.stealth,
      infiltrating: !!meta?.infiltrating,
    };
  });
  const missionExposure = buildMissionExposure(missionEntries);
  const plannerSettings = buildPlannerSettings(save, illegalExposure, missionExposure);
  const saveBackups = await listSaveBackups(savePath);
  const routeGraph = buildRouteGraph(game.mapSystems, game.wormholes);

  return {
    generatedAt: new Date().toISOString(),
    pollSeconds: POLL_SECONDS,
    savePath,
    gameUnavailable: false,
    game: {
      available: true,
      root: gameState.selection.gameRoot,
      source: gameState.selection.source,
      configuredGameRoot: gameState.selection.configuredGameRoot,
      configPath: gameState.selection.configPath,
      issue: null,
      candidates: gameState.selection.candidates,
    },
    save: {
      available: true,
      path: savePath,
      name: path.basename(savePath).trim(),
      source: saveSelection.source,
      configuredRecentPath: saveSelection.configuredRecentPath,
      configPath: saveSelection.configPath,
      platform: saveSelection.platform,
      issue: null,
      recentPath: saveSelection.recentSavePath,
      directory: saveSelection.savesDir,
      defaultRecentPath: saveSelection.defaultRecentPath,
      recentCandidates: saveSelection.recentCandidates,
      candidates: saveSelection.saves,
    },
    player: {
      date: save.date,
      currentSystem: save.currentSystem,
      currentPlanet: save.currentPlanet,
      currentPosition: currentSystemData?.pos || null,
      credits: save.credits,
      score: save.score,
      licenses: save.licenses,
      visitedSystems: save.visitedSystems,
      visitedPlanets: save.visitedPlanets,
      knownSystems,
      standings: pickMajorReputations(save.reputations),
      depreciation: save.depreciation,
      drive,
      travelPlan: save.travelPlan,
    },
    fleet: {
      flagshipIndex: save.flagshipIndex,
      flagshipUuid: save.flagship?.uuid || null,
      flagshipName: save.flagship?.name || null,
      activeShips: fleetShips.filter((ship) => !ship.parked),
      parkedShips: fleetShips.filter((ship) => ship.parked),
      totals: {
        cargoCapacity: save.totalCargoCapacity,
        usedCargo: save.usedCargo,
        freeCargo: save.freeCargo,
        missionCargo: save.missionCargo,
        usedCargoWithMission: save.usedCargoWithMission,
        freeCargoAfterMission: save.freeCargoAfterMission,
        tradeCargoCapacity: save.tradeCargoCapacity,
        tradeFreeCargo: save.tradeFreeCargo,
        crew: save.totalCrew,
        requiredCrew: save.requiredCrew,
        bunks: save.totalBunks,
        missionPassengers: save.missionPassengers,
        occupiedBunks: save.occupiedBunks,
        freeBunks: save.freeBunks,
        dailySalary: save.dailySalary,
      },
    },
    missions: {
      occupancy: save.missionOccupancy,
      entries: missionEntries,
    },
    wiki: {
      ships: shipWiki,
      outfits: outfitWiki,
      licenses: licenseWiki,
      planets: currentPlanets,
      systems: atlasSystems,
      logbook: save.logbook,
    },
    debugEditor: {
      savePath,
      backups: saveBackups,
      safe: {
        credits: save.credits,
        currentSystem: save.currentSystem,
        currentPlanet: save.currentPlanet,
        flagshipIndex: save.flagshipIndex,
      },
      advanced: {
        licenses: [...save.licenses].sort((a, b) => a.localeCompare(b)),
        reputations: Object.entries(save.reputations)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        visitedSystems: save.visitedSystems,
        visitedPlanets: save.visitedPlanets,
        travelPlan: save.travelPlan,
      },
      dangerous: {
        ships: save.ships.map((ship, saveIndex) => ({
          saveIndex,
          uuid: ship.uuid,
          model: ship.model,
          name: ship.name,
          parked: ship.parked,
          system: ship.system,
          planet: ship.planet,
          crew: ship.crew,
          fuel: ship.fuel,
          shields: ship.shields,
          hull: ship.hull,
          maxFuel: toNumber(ship.attributes["fuel capacity"]),
          maxShields: toNumber(ship.attributes.shields),
          maxHull: toNumber(ship.attributes.hull),
          requiredCrew: toNumber(ship.attributes["required crew"]),
          bunks: toNumber(ship.attributes.bunks),
        })),
      },
      extreme: {
        conditions: save.conditions,
      },
    },
    market: {
      plannerSettings,
      localPrices,
      cargoSummary,
      planner: {
        directMarketsFromHere: buildDirectMarketsFromHere(
          save,
          prices,
          routeGraph,
          drive,
          systemAccess,
          plannerSettings
        ),
        carrySales: buildCarrySales(save, prices, routeGraph, drive, systemAccess, plannerSettings),
        loopsFromHere: buildLoopsFromHere(save, prices, routeGraph, drive, systemAccess, plannerSettings),
        reachableLoops: buildReachableLoops(save, prices, routeGraph, drive, systemAccess, plannerSettings),
      },
    },
    app: appMeta,
  };
}

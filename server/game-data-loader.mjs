export function createGameDataLoader(deps) {
  const {
    APP_CONFIG_PATH,
    path,
    readFile,
    fileExists,
    findGameRoot,
    listTextFiles,
    parseMapSystems,
    parsePlanetDefinitions,
    parseWormholes,
    parseDefinitions,
    parseMissionDefinitions,
    parseSaleGroups,
    reduceShipForClient,
    reduceOutfitForClient,
    buildPresetFits,
  } = deps;

  let gameDataPromise = null;

  async function ensureGameData() {
    if (gameDataPromise) {
      return gameDataPromise;
    }

    gameDataPromise = (async () => {
      const gameRoot = await findGameRoot(APP_CONFIG_PATH);
      const mapSystemsPath = path.join(gameRoot, "data", "map systems.txt");
      const mapPlanetsPath = path.join(gameRoot, "data", "map planets.txt");
      const mapSystemsRaw = await readFile(mapSystemsPath, "utf8");
      const mapPlanetsRaw = await readFile(mapPlanetsPath, "utf8");
      const mapSystems = parseMapSystems(mapSystemsRaw);
      const basePlanets = parsePlanetDefinitions(mapPlanetsRaw);
      const wormholes = parseWormholes(mapPlanetsRaw);

      const objectToSystem = {};
      for (const system of Object.values(mapSystems)) {
        for (const objectName of system.objects || []) {
          if (!objectToSystem[objectName]) {
            objectToSystem[objectName] = system.name;
          }
        }
      }

      const definitionFiles = [
        ...(await listTextFiles(path.join(gameRoot, "data", "human"))),
        ...(await listTextFiles(path.join(gameRoot, "data", "hai"))),
      ];
      const missionFiles = await listTextFiles(path.join(gameRoot, "data"));

      const shipMap = {};
      const outfitMap = {};
      const missionMap = {};
      const saleGroups = {
        shipyard: {},
        outfitter: {},
      };

      for (const filePath of definitionFiles) {
        const raw = await readFile(filePath, "utf8");
        const definitions = parseDefinitions(raw, filePath, gameRoot);
        for (const definition of definitions) {
          if (definition.kind === "ship") {
            if (definition.variant) {
              continue;
            }
            shipMap[definition.name] = definition;
          } else if (definition.kind === "outfit") {
            outfitMap[definition.name] = definition;
          }
        }
      }

      for (const filePath of missionFiles) {
        const raw = await readFile(filePath, "utf8");
        const missions = parseMissionDefinitions(raw, filePath);
        for (const mission of missions) {
          if (!missionMap[mission.id]) {
            missionMap[mission.id] = mission;
          }
        }
      }

      const saleFiles = [
        path.join(gameRoot, "data", "human", "sales.txt"),
        path.join(gameRoot, "data", "hai", "hai.txt"),
      ];
      for (const filePath of saleFiles) {
        if (!(await fileExists(filePath))) {
          continue;
        }
        const raw = await readFile(filePath, "utf8");
        const parsedGroups = parseSaleGroups(raw, filePath);
        Object.assign(saleGroups.shipyard, parsedGroups.shipyard);
        Object.assign(saleGroups.outfitter, parsedGroups.outfitter);
      }

      const ships = Object.values(shipMap)
        .map(reduceShipForClient)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

      const outfits = Object.values(outfitMap)
        .map(reduceOutfitForClient)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

      const systems = Object.values(mapSystems)
        .filter((system) => Array.isArray(system.pos))
        .map((system) => ({
          name: system.name,
          x: system.pos[0],
          y: system.pos[1],
          links: system.links,
          hasTrade: Object.keys(system.trade).length > 0,
          planets: (system.objects || []).filter((objectName) => !!basePlanets[objectName]),
        }));

      const planets = Object.values(basePlanets)
        .map((planet) => ({
          ...planet,
          system: objectToSystem[planet.name] || null,
          systemGovernment: objectToSystem[planet.name] ? mapSystems[objectToSystem[planet.name]]?.government || null : null,
        }))
        .sort((a, b) => (a.system || "").localeCompare(b.system || "") || a.name.localeCompare(b.name));

      return {
        gameRoot,
        mapSystems,
        basePlanets,
        saleGroups,
        missions: Object.values(missionMap),
        objectToSystem,
        ships,
        outfits,
        presets: buildPresetFits(ships),
        systems,
        planets,
        wormholes,
      };
    })();

    try {
      return await gameDataPromise;
    } catch (error) {
      gameDataPromise = null;
      throw error;
    }
  }

  function resetGameData() {
    gameDataPromise = null;
  }

  return {
    ensureGameData,
    resetGameData,
  };
}

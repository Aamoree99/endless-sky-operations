function tokenize(line) {
  const matches = line.match(/"[^"]*"|`[^`]*`|\S+/g) || [];
  return matches.map((token) => token.replace(/^["`]|["`]$/g, ""));
}

function toNumber(token) {
  const value = Number(token);
  return Number.isFinite(value) ? value : 0;
}

function parseValue(tokens) {
  if (!tokens.length) {
    return null;
  }
  if (tokens.length === 1) {
    const asNumber = Number(tokens[0]);
    return Number.isFinite(asNumber) ? asNumber : tokens[0];
  }
  return tokens.join(" ");
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

export function parseSave(text) {
  const lines = text.split(/\r?\n/);
  const save = {
    date: null,
    currentSystem: null,
    currentPlanet: null,
    travelPlan: [],
    visitedSystems: [],
    visitedPlanets: [],
    conditions: [],
    flagshipIndex: 0,
    ships: [],
    depreciation: {
      fleetOutfits: {},
      stockOutfits: {},
    },
    basis: {},
    economy: {
      headers: [],
      supplies: {},
      purchases: {},
    },
    debts: [],
    credits: 0,
    score: 0,
    licenses: [],
    reputations: {},
    missions: [],
    dynamicPlanets: {},
    dynamicSaleGroups: {
      shipyard: {},
      outfitter: {},
    },
    logbook: {
      dated: [],
      named: {},
    },
  };

  let currentShip = null;
  let currentMission = null;
  let currentDynamic = null;
  let dynamicType = null;
  let shipContext = null;
  let section = null;
  let economyMode = null;
  let currentDebt = null;
  let currentDepreciationBucket = null;
  let currentDepreciationOutfit = null;

  const finalizeShip = () => {
    if (!currentShip) {
      return;
    }
    save.ships.push(currentShip);
    currentShip = null;
    shipContext = null;
  };

  const finalizeMission = () => {
    if (!currentMission) {
      return;
    }
    save.missions.push(currentMission);
    currentMission = null;
  };

  const finalizeDynamic = () => {
    if (!currentDynamic || !dynamicType) {
      return;
    }
    if (dynamicType === "planet") {
      const hasPlanetChanges =
        currentDynamic.shipyardClear ||
        currentDynamic.outfitterClear ||
        currentDynamic.spaceportClear ||
        currentDynamic.shipyards.length ||
        currentDynamic.outfitters.length ||
        currentDynamic.shipyardRemovals.length ||
        currentDynamic.outfitterRemovals.length ||
        currentDynamic.requiredReputation !== null ||
        currentDynamic.security !== null ||
        currentDynamic.descriptions.length ||
        currentDynamic.spaceport.length;
      if (!hasPlanetChanges) {
        currentDynamic = null;
        dynamicType = null;
        return;
      }
      const existing = save.dynamicPlanets[currentDynamic.name] || {
        name: currentDynamic.name,
        shipyardClear: false,
        outfitterClear: false,
        spaceportClear: false,
        shipyards: [],
        outfitters: [],
        shipyardRemovals: [],
        outfitterRemovals: [],
        requiredReputation: null,
        security: null,
        descriptions: [],
        spaceport: [],
      };
      existing.shipyardClear = existing.shipyardClear || currentDynamic.shipyardClear;
      existing.outfitterClear = existing.outfitterClear || currentDynamic.outfitterClear;
      existing.spaceportClear = existing.spaceportClear || currentDynamic.spaceportClear;
      existing.shipyards.push(...currentDynamic.shipyards);
      existing.outfitters.push(...currentDynamic.outfitters);
      existing.shipyardRemovals.push(...currentDynamic.shipyardRemovals);
      existing.outfitterRemovals.push(...currentDynamic.outfitterRemovals);
      if (currentDynamic.requiredReputation !== null) {
        existing.requiredReputation = currentDynamic.requiredReputation;
      }
      if (currentDynamic.security !== null) {
        existing.security = currentDynamic.security;
      }
      if (currentDynamic.descriptions.length) {
        existing.descriptions = currentDynamic.descriptions;
      }
      if (currentDynamic.spaceport.length) {
        existing.spaceport = currentDynamic.spaceport;
      }
      save.dynamicPlanets[currentDynamic.name] = existing;
    } else if (dynamicType === "shipyard" || dynamicType === "outfitter") {
      save.dynamicSaleGroups[dynamicType][currentDynamic.name] = {
        name: currentDynamic.name,
        kind: dynamicType,
        items: currentDynamic.items,
      };
    }
    currentDynamic = null;
    dynamicType = null;
  };

  const finalizeDebt = () => {
    if (!currentDebt) {
      return;
    }
    save.debts.push(currentDebt);
    currentDebt = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(line);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0) {
      finalizeShip();
      finalizeMission();
      finalizeDynamic();
      finalizeDebt();
      currentDepreciationBucket = null;
      currentDepreciationOutfit = null;

      if (tokens[0] === "visited" && tokens[1]) {
        save.visitedSystems.push(tokens.slice(1).join(" "));
        section = null;
        continue;
      }
      if (tokens[0] === "visited planet" && tokens[1]) {
        save.visitedPlanets.push(tokens.slice(1).join(" "));
        section = null;
        continue;
      }

      section = tokens[0];

      if (tokens[0] === "logbook") {
        continue;
      } else if (tokens[0] === "ship" && tokens[1]) {
        currentShip = {
          model: tokens[1],
          variant: tokens[2] || null,
          name: tokens[1],
          parked: false,
          attributes: {},
          outfits: {},
          cargo: {},
          crew: 0,
          fuel: 0,
          shields: 0,
          hull: 0,
          system: null,
          planet: null,
          uuid: null,
        };
        shipContext = null;
      } else if (tokens[0] === "mission" && tokens[1]) {
        currentMission = {
          id: tokens[1],
          name: tokens[1],
          uuid: null,
          destination: null,
          source: null,
          cargoName: null,
          cargoTons: 0,
          passengers: 0,
          deadline: null,
          job: false,
          minor: false,
        };
      } else if ((tokens[0] === "shipyard" || tokens[0] === "outfitter") && tokens[1]) {
        currentDynamic = {
          name: tokens[1],
          depth: 0,
          items: [],
        };
        dynamicType = tokens[0];
      } else if (tokens[0] === "date") {
        save.date = {
          day: toNumber(tokens[1]),
          month: toNumber(tokens[2]),
          year: toNumber(tokens[3]),
        };
      } else if (tokens[0] === "system" && tokens[1] && !save.currentSystem) {
        save.currentSystem = tokens[1];
      } else if (tokens[0] === "planet" && tokens[1] && !save.currentPlanet) {
        save.currentPlanet = tokens[1];
      } else if (tokens[0] === "travel" && tokens[1]) {
        save.travelPlan.push(tokens[1]);
      } else if (tokens[0] === "flagship" && tokens[1] === "index") {
        save.flagshipIndex = toNumber(tokens[2]);
      } else if (tokens[0] === "flagship" && tokens[1]) {
        save.flagshipIndex = toNumber(tokens[1]);
      } else if (tokens[0] === "economy") {
        economyMode = null;
      }
      continue;
    }

    if (section === "fleet depreciation" || section === "stock depreciation") {
      currentDepreciationBucket = section === "fleet depreciation"
        ? save.depreciation.fleetOutfits
        : save.depreciation.stockOutfits;

      if (depth === 1) {
        currentDepreciationOutfit = null;
        if (tokens[0] === "outfit" && tokens[1]) {
          currentDepreciationOutfit = tokens[1];
          if (!currentDepreciationBucket[currentDepreciationOutfit]) {
            currentDepreciationBucket[currentDepreciationOutfit] = [];
          }
        }
        continue;
      }

      if (depth === 2 && currentDepreciationBucket && currentDepreciationOutfit && tokens.length >= 2) {
        currentDepreciationBucket[currentDepreciationOutfit].push({
          day: toNumber(tokens[0]),
          count: toNumber(tokens[1]),
        });
      }
      continue;
    }

    if (!currentShip && !currentMission && depth === 1 && tokens[0] === "planet" && tokens[1]) {
      finalizeDynamic();
      currentDynamic = {
        name: tokens[1],
        depth: 1,
        shipyardClear: false,
        outfitterClear: false,
        spaceportClear: false,
        shipyards: [],
        outfitters: [],
        shipyardRemovals: [],
        outfitterRemovals: [],
        requiredReputation: null,
        security: null,
        descriptions: [],
        spaceport: [],
      };
      dynamicType = "planet";
      continue;
    }

    if (section === "logbook") {
      if (depth === 1) {
        const d0 = toNumber(tokens[0]);
        const d1 = toNumber(tokens[1]);
        const d2 = toNumber(tokens[2]);
        if (d0 > 0 && d1 > 0 && d2 > 0 && !tokens[3]) {
          save.logbook.dated.push({ day: d0, month: d1, year: d2, entries: [] });
        } else {
          const category = tokens[0];
          const name = tokens[1] || "";
          if (!save.logbook.named[category]) save.logbook.named[category] = {};
          if (!save.logbook.named[category][name]) save.logbook.named[category][name] = [];
        }
      } else if (depth === 2) {
        const text = tokens[0];
        if (!text) continue;
        const lastDated = save.logbook.dated[save.logbook.dated.length - 1];
        const namedCats = Object.keys(save.logbook.named);
        const lastCat = namedCats[namedCats.length - 1];
        const lastCatKeys = lastCat ? Object.keys(save.logbook.named[lastCat]) : [];
        const lastName = lastCatKeys[lastCatKeys.length - 1];
        if (save._logbookLastKind === "dated" && lastDated) {
          lastDated.entries.push(text);
        } else if (save._logbookLastKind === "named" && lastCat && lastName !== undefined) {
          save.logbook.named[lastCat][lastName].push(text);
        }
      }
      if (depth === 1) {
        const d0 = toNumber(tokens[0]);
        const d1 = toNumber(tokens[1]);
        const d2 = toNumber(tokens[2]);
        save._logbookLastKind = (d0 > 0 && d1 > 0 && d2 > 0 && !tokens[3]) ? "dated" : "named";
      }
      continue;
    }

    if (currentDynamic) {
      if (dynamicType === "planet" && depth === (currentDynamic.depth ?? 0) + 1) {
        if (tokens[0] === "shipyard" && tokens[1] === "clear") {
          currentDynamic.shipyardClear = true;
        } else if (tokens[0] === "outfitter" && tokens[1] === "clear") {
          currentDynamic.outfitterClear = true;
        } else if (tokens[0] === "remove" && tokens[1] === "shipyard") {
          if (tokens[2]) {
            currentDynamic.shipyardRemovals.push(tokens[2]);
          } else {
            currentDynamic.shipyardClear = true;
          }
        } else if (tokens[0] === "remove" && tokens[1] === "outfitter") {
          if (tokens[2]) {
            currentDynamic.outfitterRemovals.push(tokens[2]);
          } else {
            currentDynamic.outfitterClear = true;
          }
        } else if (tokens[0] === "remove" && tokens[1] === "spaceport") {
          currentDynamic.spaceportClear = true;
        } else if (tokens[0] === "shipyard" && tokens[1]) {
          currentDynamic.shipyards.push(tokens[1]);
        } else if (tokens[0] === "outfitter" && tokens[1]) {
          currentDynamic.outfitters.push(tokens[1]);
        } else if (tokens[0] === "add" && tokens[1] === "shipyard" && tokens[2]) {
          currentDynamic.shipyards.push(tokens[2]);
        } else if (tokens[0] === "add" && tokens[1] === "outfitter" && tokens[2]) {
          currentDynamic.outfitters.push(tokens[2]);
        } else if (tokens[0] === "required reputation" && tokens[1]) {
          currentDynamic.requiredReputation = toNumber(tokens[1]);
        } else if (tokens[0] === "security" && tokens[1]) {
          currentDynamic.security = toNumber(tokens[1]);
        } else if (tokens[0] === "description" && tokens[1]) {
          currentDynamic.descriptions.push(tokens.slice(1).join(" "));
        } else if (tokens[0] === "spaceport" && tokens[1]) {
          currentDynamic.spaceport.push(tokens.slice(1).join(" "));
        }
        continue;
      }

      if ((dynamicType === "shipyard" || dynamicType === "outfitter") && depth === (currentDynamic.depth ?? 0) + 1) {
        currentDynamic.items.push(tokens[0]);
        continue;
      }
    }

    if (currentShip) {
      if (depth === 1) {
        if (tokens[0] === "attributes") {
          shipContext = "attributes";
          continue;
        }
        if (tokens[0] === "outfits") {
          shipContext = "outfits";
          continue;
        }
        if (tokens[0] === "cargo") {
          shipContext = "cargo";
          continue;
        }

        shipContext = null;

        if (tokens[0] === "name" && tokens[1]) {
          currentShip.name = tokens.slice(1).join(" ");
        } else if (tokens[0] === "uuid" && tokens[1]) {
          currentShip.uuid = tokens[1];
        } else if (tokens[0] === "crew") {
          currentShip.crew = toNumber(tokens[1]);
        } else if (tokens[0] === "fuel") {
          currentShip.fuel = toNumber(tokens[1]);
        } else if (tokens[0] === "shields") {
          currentShip.shields = toNumber(tokens[1]);
        } else if (tokens[0] === "hull") {
          currentShip.hull = toNumber(tokens[1]);
        } else if (tokens[0] === "parked") {
          currentShip.parked = true;
        } else if (tokens[0] === "system" && tokens[1]) {
          currentShip.system = tokens[1];
        } else if (tokens[0] === "planet" && tokens[1]) {
          currentShip.planet = tokens[1];
        }
      } else if (shipContext === "attributes" && depth === 2) {
        currentShip.attributes[tokens[0]] = parseValue(tokens.slice(1));
      } else if (shipContext === "outfits" && depth === 2) {
        const count = tokens[1] ? toNumber(tokens[1]) : 1;
        currentShip.outfits[tokens[0]] = (currentShip.outfits[tokens[0]] || 0) + count;
      } else if (shipContext === "cargo" && depth === 2 && tokens[0] === "commodities") {
        shipContext = "cargoCommodities";
      } else if (shipContext === "cargoCommodities" && depth === 3) {
        currentShip.cargo[tokens[0]] = toNumber(tokens[1]);
      } else if (depth <= 1) {
        shipContext = null;
      }
      continue;
    }

    if (currentMission) {
      if (depth === 1) {
        if (tokens[0] === "name" && tokens[1]) {
          currentMission.name = tokens.slice(1).join(" ");
        } else if (tokens[0] === "uuid" && tokens[1]) {
          currentMission.uuid = tokens[1];
        } else if (tokens[0] === "cargo" && tokens.length >= 3) {
          currentMission.cargoName = tokens.slice(1, -1).join(" ");
          currentMission.cargoTons = toNumber(tokens[tokens.length - 1]);
        } else if (tokens[0] === "passengers" && tokens[1]) {
          currentMission.passengers = toNumber(tokens[1]);
        } else if (tokens[0] === "destination" && tokens[1]) {
          currentMission.destination = tokens.slice(1).join(" ");
        } else if (tokens[0] === "source" && tokens[1]) {
          currentMission.source = tokens.slice(1).join(" ");
        } else if (
          tokens[0] === "deadline" &&
          tokens[1] &&
          tokens[2] &&
          tokens[3]
        ) {
          currentMission.deadline = {
            day: toNumber(tokens[1]),
            month: toNumber(tokens[2]),
            year: toNumber(tokens[3]),
          };
        } else if (tokens[0] === "job") {
          currentMission.job = true;
        } else if (tokens[0] === "minor") {
          currentMission.minor = true;
        }
      }
      continue;
    }

    if (section === "account" && depth === 1) {
      if (tokens[0] === "credits") {
        save.credits = toNumber(tokens[1]);
      } else if (tokens[0] === "score") {
        save.score = toNumber(tokens[1]);
      } else {
        finalizeDebt();
        currentDebt = {
          kind: tokens[0],
          name: tokens[1] || tokens[0],
          principal: 0,
          interest: 0,
          term: 0,
        };
      }
      continue;
    }

    if (section === "account" && depth === 2 && currentDebt) {
      if (tokens[0] === "principal") {
        currentDebt.principal = toNumber(tokens[1]);
      } else if (tokens[0] === "interest") {
        currentDebt.interest = toNumber(tokens[1]);
      } else if (tokens[0] === "term") {
        currentDebt.term = toNumber(tokens[1]);
      }
      continue;
    }

    if (section === "licenses" && depth === 1) {
      save.licenses.push(tokens.join(" "));
      continue;
    }

    if (section === "reputation with" && depth === 1) {
      const value = toNumber(tokens[tokens.length - 1]);
      const name = tokens.slice(0, -1).join(" ");
      save.reputations[name] = value;
      continue;
    }

    if (section === "basis" && depth === 1) {
      save.basis[tokens[0]] = toNumber(tokens[1]);
      continue;
    }

    if (section === "conditions" && depth === 1) {
      save.conditions.push(line);
      continue;
    }

    if (section === "economy") {
      if (depth === 1 && tokens[0] === "purchases") {
        economyMode = "purchases";
        continue;
      }
      if (depth === 1 && tokens[0] === "system") {
        save.economy.headers = tokens.slice(1);
        economyMode = "supplies";
        continue;
      }
      if (depth === 1 && economyMode === "supplies" && tokens.length > 2) {
        const systemName = tokens[0];
        save.economy.supplies[systemName] = Object.fromEntries(
          save.economy.headers.map((commodity, index) => [
            commodity,
            toNumber(tokens[index + 1]),
          ])
        );
      }
      if (depth === 2 && economyMode === "purchases" && tokens.length >= 3) {
        const systemName = tokens[0];
        const commodity = tokens[1];
        const tons = toNumber(tokens[2]);
        if (!save.economy.purchases[systemName]) {
          save.economy.purchases[systemName] = {};
        }
        save.economy.purchases[systemName][commodity] = tons;
      }
    }
  }

  finalizeShip();
  finalizeMission();
  finalizeDynamic();
  finalizeDebt();

  save.visitedSystems = uniqueStrings(save.visitedSystems);
  save.visitedPlanets = uniqueStrings(save.visitedPlanets);
  save.flagship = save.ships[save.flagshipIndex] || null;
  save.activeShips = save.ships.filter((ship) => !ship.parked);
  save.parkedShips = save.ships.filter((ship) => ship.parked);
  save.totalCargoCapacity = save.activeShips.reduce(
    (sum, ship) => sum + toNumber(ship.attributes["cargo space"]),
    0
  );
  save.totalBunks = save.activeShips.reduce(
    (sum, ship) => sum + toNumber(ship.attributes.bunks),
    0
  );
  save.totalCrew = save.activeShips.reduce((sum, ship) => sum + ship.crew, 0);
  save.requiredCrew = save.activeShips.reduce(
    (sum, ship) => sum + toNumber(ship.attributes["required crew"]),
    0
  );

  const aggregatedCargo = {};
  for (const ship of save.activeShips) {
    for (const [commodity, tons] of Object.entries(ship.cargo)) {
      aggregatedCargo[commodity] = (aggregatedCargo[commodity] || 0) + tons;
    }
  }
  save.cargo = aggregatedCargo;
  save.usedCargo = Object.values(aggregatedCargo).reduce((sum, tons) => sum + tons, 0);
  save.missionOccupancy = save.missions
    .filter((mission) => mission.cargoTons > 0 || mission.passengers > 0)
    .sort(
      (a, b) =>
        b.cargoTons - a.cargoTons ||
        b.passengers - a.passengers ||
        a.name.localeCompare(b.name)
    );
  save.missionCargo = save.missionOccupancy.reduce(
    (sum, mission) => sum + mission.cargoTons,
    0
  );
  save.missionPassengers = save.missionOccupancy.reduce(
    (sum, mission) => sum + mission.passengers,
    0
  );
  save.usedCargoWithMission = save.usedCargo + save.missionCargo;
  save.tradeCargoCapacity = Math.max(0, save.totalCargoCapacity - save.missionCargo);
  save.freeCargo = Math.max(0, save.totalCargoCapacity - save.usedCargo);
  save.freeCargoAfterMission = Math.max(
    0,
    save.totalCargoCapacity - save.usedCargoWithMission
  );
  save.tradeFreeCargo = Math.max(0, save.tradeCargoCapacity - save.usedCargo);
  save.occupiedBunks = save.totalCrew + save.missionPassengers;
  save.freeBunks = Math.max(0, save.totalBunks - save.occupiedBunks);
  save.dailySalary = Math.max(0, save.totalCrew - 1) * 100;
  save.dailyDebt = save.debts.reduce((sum, debt) => {
    const principal = Math.max(0, Number(debt.principal) || 0);
    const interest = Math.max(0, Number(debt.interest) || 0);
    const term = Math.max(0, Number(debt.term) || 0);
    if (!principal || !term) {
      return sum;
    }
    if (!interest) {
      return sum + Math.round(principal / term);
    }
    const denominator = 1 - Math.pow(1 + interest, -term);
    if (!denominator) {
      return sum;
    }
    return sum + Math.round((principal * interest) / denominator);
  }, 0);
  delete save._logbookLastKind;

  return save;
}

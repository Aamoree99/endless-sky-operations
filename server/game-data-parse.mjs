import path from "node:path";

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

function relativeImagePathFromRef(ref) {
  if (!ref) {
    return null;
  }
  return `${ref}.png`;
}

function imageUrlFromRef(ref) {
  const relativePath = relativeImagePathFromRef(ref);
  if (!relativePath) {
    return null;
  }
  return `/game-assets/${relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function parseMapSystems(raw) {
  const systems = {};
  let current = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && tokens[0] === "system" && tokens[1]) {
      current = {
        name: tokens[1],
        links: [],
        trade: {},
        pos: null,
        objects: [],
        government: null,
      };
      systems[current.name] = current;
      continue;
    }

    if (!current) {
      continue;
    }

    if (tokens[0] === "object" && tokens[1]) {
      current.objects.push(tokens[1]);
      continue;
    }

    if (depth !== 1) {
      continue;
    }

    if (tokens[0] === "link" && tokens[1]) {
      current.links.push(tokens[1]);
    } else if (tokens[0] === "trade" && tokens[1] && tokens[2]) {
      current.trade[tokens[1]] = toNumber(tokens[2]);
    } else if (tokens[0] === "pos" && tokens[1] && tokens[2]) {
      current.pos = [toNumber(tokens[1]), toNumber(tokens[2])];
    } else if (tokens[0] === "government" && tokens[1]) {
      current.government = tokens.slice(1).join(" ");
    }
  }

  return systems;
}

export function parsePlanetDefinitions(raw) {
  const planets = {};
  let current = null;

  const finalize = () => {
    if (!current) {
      return;
    }
    current.landscapeUrl = imageUrlFromRef(current.landscapeRef);
    planets[current.name] = current;
    current = null;
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && tokens[0] === "planet" && tokens[1]) {
      finalize();
      current = {
        name: tokens[1],
        attributes: [],
        descriptions: [],
        spaceport: [],
        landscapeRef: null,
        landscapeUrl: null,
        shipyards: [],
        outfitters: [],
        requiredReputation: null,
        government: null,
      };
      continue;
    }

    if (!current || depth !== 1) {
      continue;
    }

    if (tokens[0] === "attributes") {
      current.attributes.push(...tokens.slice(1));
    } else if (tokens[0] === "description" && tokens[1]) {
      current.descriptions.push(tokens.slice(1).join(" "));
    } else if (tokens[0] === "spaceport" && tokens[1]) {
      current.spaceport.push(tokens.slice(1).join(" "));
    } else if (tokens[0] === "landscape" && tokens[1]) {
      current.landscapeRef = tokens[1];
    } else if (tokens[0] === "shipyard" && tokens[1]) {
      current.shipyards.push(tokens[1]);
    } else if (tokens[0] === "outfitter" && tokens[1]) {
      current.outfitters.push(tokens[1]);
    } else if (tokens[0] === "required reputation" && tokens[1]) {
      current.requiredReputation = toNumber(tokens[1]);
    } else if (tokens[0] === "government" && tokens[1]) {
      current.government = tokens.slice(1).join(" ");
    }
  }

  finalize();
  return planets;
}

export function parseWormholes(raw) {
  const wormholes = [];
  let current = null;

  const finalize = () => {
    if (current?.links?.length) {
      wormholes.push(current);
    }
    current = null;
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && tokens[0] === "wormhole" && tokens[1]) {
      finalize();
      current = {
        name: tokens[1],
        links: [],
      };
      continue;
    }

    if (!current || depth !== 1) {
      continue;
    }

    if (tokens[0] === "link" && tokens[1] && tokens[2]) {
      current.links.push({
        from: tokens[1],
        to: tokens[2],
      });
    }
  }

  finalize();
  return wormholes;
}

export function parseSaleGroups(raw, sourcePath) {
  const groups = {
    shipyard: {},
    outfitter: {},
  };
  let current = null;

  const finalize = () => {
    if (!current) {
      return;
    }
    groups[current.kind][current.name] = {
      name: current.name,
      kind: current.kind,
      sourcePath,
      items: current.items,
    };
    current = null;
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && (tokens[0] === "shipyard" || tokens[0] === "outfitter") && tokens[1]) {
      finalize();
      current = {
        kind: tokens[0],
        name: tokens[1],
        items: [],
      };
      continue;
    }

    if (current && depth === 1 && tokens[0]) {
      current.items.push(tokens[0]);
    }
  }

  finalize();
  return groups;
}

function parseDefinitionBlock(kind, name, variant, entries, sourcePath, gameRoot) {
  const definition = {
    kind,
    name,
    variant,
    sourcePath,
    faction: path.basename(path.dirname(sourcePath)),
    attributes: {},
    stockOutfits: {},
    weapon: {},
    spriteRef: null,
    thumbnailRef: null,
    description: "",
    gunHardpoints: 0,
    turretHardpoints: 0,
    licenses: [],
  };

  let context = null;

  for (const entry of entries) {
    const { depth, tokens } = entry;
    if (!tokens.length) {
      continue;
    }
    const key = tokens[0];

    if (depth === 1) {
      if (key === "attributes") {
        context = "attributes";
        continue;
      }
      if (key === "outfits") {
        context = "outfits";
        continue;
      }
      if (key === "weapon") {
        context = "weapon";
        continue;
      }
      if (key === "licenses") {
        context = "licenses";
        continue;
      }
      context = null;

      if (key === "sprite") {
        definition.spriteRef = tokens[1] || null;
      } else if (key === "thumbnail") {
        definition.thumbnailRef = tokens[1] || null;
      } else if (key === "description") {
        definition.description = tokens.slice(1).join(" ");
      } else if (key === "gun") {
        definition.gunHardpoints += 1;
      } else if (key === "turret") {
        definition.turretHardpoints += 1;
      } else {
        definition.attributes[key] = parseValue(tokens.slice(1));
      }
      continue;
    }

    if (context === "attributes" && depth === 2) {
      definition.attributes[key] = parseValue(tokens.slice(1));
      continue;
    }

    if (context === "weapon" && depth === 2) {
      definition.weapon[key] = parseValue(tokens.slice(1));
      continue;
    }

    if (context === "licenses" && depth === 2) {
      definition.licenses.push(tokens.join(" "));
      continue;
    }

    if (context === "outfits" && depth === 2) {
      const count = tokens[1] ? toNumber(tokens[1]) : 1;
      definition.stockOutfits[key] = (definition.stockOutfits[key] || 0) + count;
    }
  }

  if (kind === "ship") {
    if (!definition.attributes["gun ports"] && definition.gunHardpoints) {
      definition.attributes["gun ports"] = definition.gunHardpoints;
    }
    if (!definition.attributes["turret mounts"] && definition.turretHardpoints) {
      definition.attributes["turret mounts"] = definition.turretHardpoints;
    }
  }

  definition.spriteUrl = imageUrlFromRef(definition.spriteRef);
  definition.thumbnailUrl = imageUrlFromRef(definition.thumbnailRef);
  definition.existsSprite =
    !!definition.spriteRef &&
    path.join(gameRoot, "images", relativeImagePathFromRef(definition.spriteRef));
  definition.existsThumbnail =
    !!definition.thumbnailRef &&
    path.join(gameRoot, "images", relativeImagePathFromRef(definition.thumbnailRef));

  return definition;
}

export function parseDefinitions(raw, sourcePath, gameRoot) {
  const lines = raw.split(/\r?\n/);
  const definitions = [];
  let current = null;

  const finalize = () => {
    if (!current) {
      return;
    }
    definitions.push(
      parseDefinitionBlock(
        current.kind,
        current.name,
        current.variant,
        current.entries,
        sourcePath,
        gameRoot
      )
    );
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && (tokens[0] === "ship" || tokens[0] === "outfit") && tokens[1]) {
      finalize();
      current = {
        kind: tokens[0],
        name: tokens[1],
        variant: tokens[0] === "ship" ? tokens[2] || null : null,
        entries: [],
      };
      continue;
    }

    if (current) {
      current.entries.push({ depth, tokens, line: trimmed });
    }
  }

  finalize();
  return definitions;
}

function parseMissionBlock(name, entries, sourcePath) {
  const mission = {
    id: name,
    name,
    sourcePath,
    description: "",
    summary: "",
    minor: false,
    job: false,
    illegalFine: 0,
    stealth: false,
    infiltrating: false,
  };

  const descriptionLines = [];
  let firstLogText = "";
  let firstNarrativeText = "";

  for (const entry of entries) {
    const { depth, tokens, line } = entry;
    if (!tokens.length) {
      continue;
    }
    const key = tokens[0];

    if (depth === 1) {
      if (key === "name" && tokens[1]) {
        mission.name = tokens.slice(1).join(" ");
      } else if (key === "description" && tokens[1]) {
        descriptionLines.push(tokens.slice(1).join(" "));
      } else if (key === "minor") {
        mission.minor = true;
      } else if (key === "job") {
        mission.job = true;
      } else if (key === "illegal" && tokens[1]) {
        mission.illegalFine = toNumber(tokens[1]);
      } else if (key === "stealth") {
        mission.stealth = true;
      } else if (key === "infiltrating") {
        mission.infiltrating = true;
      }
    }

    if (!firstLogText && key === "log") {
      if (tokens.length >= 4) {
        firstLogText = tokens.slice(3).join(" ");
      } else if (tokens.length >= 2) {
        firstLogText = tokens.slice(1).join(" ");
      }
    }

    if (!firstNarrativeText && (line.startsWith("`") || line.startsWith("\""))) {
      firstNarrativeText = tokens.join(" ");
    }
  }

  mission.description = descriptionLines.join(" ").trim();
  mission.summary = mission.description || firstLogText || firstNarrativeText;
  return mission;
}

export function parseMissionDefinitions(raw, sourcePath) {
  const lines = raw.split(/\r?\n/);
  const missions = [];
  let current = null;

  const finalize = () => {
    if (!current) {
      return;
    }
    missions.push(parseMissionBlock(current.name, current.entries, sourcePath));
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const depth = (rawLine.match(/^\t*/) || [""])[0].length;
    const tokens = tokenize(trimmed);
    if (!tokens.length) {
      continue;
    }

    if (depth === 0 && tokens[0] === "mission" && tokens[1]) {
      finalize();
      current = {
        name: tokens[1],
        entries: [],
      };
      continue;
    }

    if (current) {
      current.entries.push({ depth, tokens, line: trimmed });
    }
  }

  finalize();
  return missions;
}

function pickField(attributes, fieldName, fallback = 0) {
  const value = attributes[fieldName];
  return typeof value === "number" ? value : fallback;
}

function getOutfitSlotType(outfit) {
  if (pickField(outfit.attributes, "turret mounts") < 0) {
    return "turret";
  }
  if (pickField(outfit.attributes, "gun ports") < 0) {
    return "gun";
  }
  if (outfit.attributes.category === "Engines") {
    return "engine";
  }
  return "system";
}

export function reduceShipForClient(ship) {
  return {
    name: ship.name,
    faction: ship.faction,
    category: ship.attributes.category || "Ship",
    description: ship.description || "",
    licenses: ship.licenses || [],
    spriteUrl: ship.spriteUrl,
    thumbnailUrl: ship.thumbnailUrl,
    sourcePath: ship.sourcePath,
    attributes: {
      cost: pickField(ship.attributes, "cost"),
      shields: pickField(ship.attributes, "shields"),
      hull: pickField(ship.attributes, "hull"),
      requiredCrew: pickField(ship.attributes, "required crew"),
      bunks: pickField(ship.attributes, "bunks"),
      mass: pickField(ship.attributes, "mass"),
      drag: pickField(ship.attributes, "drag"),
      heatDissipation: pickField(ship.attributes, "heat dissipation"),
      heatCapacity: pickField(ship.attributes, "heat capacity"),
      coolingInefficiency: pickField(ship.attributes, "cooling inefficiency"),
      energyGeneration: pickField(ship.attributes, "energy generation"),
      energyConsumption: pickField(ship.attributes, "energy consumption"),
      heatGeneration: pickField(ship.attributes, "heat generation"),
      solarCollection: pickField(ship.attributes, "solar collection"),
      solarHeat: pickField(ship.attributes, "solar heat"),
      cooling: pickField(ship.attributes, "cooling"),
      activeCooling: pickField(ship.attributes, "active cooling"),
      coolingEnergy: pickField(ship.attributes, "cooling energy"),
      shieldGeneration: pickField(ship.attributes, "shield generation"),
      shieldEnergy: pickField(ship.attributes, "shield energy"),
      shieldHeat: pickField(ship.attributes, "shield heat"),
      delayedShieldEnergy: pickField(ship.attributes, "delayed shield energy"),
      delayedShieldHeat: pickField(ship.attributes, "delayed shield heat"),
      shieldEnergyMultiplier: pickField(ship.attributes, "shield energy multiplier"),
      shieldHeatMultiplier: pickField(ship.attributes, "shield heat multiplier"),
      hullEnergy: pickField(ship.attributes, "hull energy"),
      hullHeat: pickField(ship.attributes, "hull heat"),
      delayedHullEnergy: pickField(ship.attributes, "delayed hull energy"),
      delayedHullHeat: pickField(ship.attributes, "delayed hull heat"),
      hullEnergyMultiplier: pickField(ship.attributes, "hull energy multiplier"),
      hullHeatMultiplier: pickField(ship.attributes, "hull heat multiplier"),
      afterburnerEnergy: pickField(ship.attributes, "afterburner energy"),
      afterburnerHeat: pickField(ship.attributes, "afterburner heat"),
      fuelCapacity: pickField(ship.attributes, "fuel capacity"),
      cargoSpace: pickField(ship.attributes, "cargo space"),
      outfitSpace: pickField(ship.attributes, "outfit space"),
      weaponCapacity: pickField(ship.attributes, "weapon capacity"),
      engineCapacity: pickField(ship.attributes, "engine capacity"),
      gunPorts: pickField(ship.attributes, "gun ports"),
      turretMounts: pickField(ship.attributes, "turret mounts"),
    },
    stockOutfits: ship.stockOutfits,
  };
}

export function reduceOutfitForClient(outfit) {
  return {
    name: outfit.name,
    faction: outfit.faction,
    category: outfit.attributes.category || "Outfit",
    slotType: getOutfitSlotType(outfit),
    description: outfit.description || "",
    thumbnailUrl: outfit.thumbnailUrl,
    spriteUrl: outfit.spriteUrl,
    imageUrl: outfit.thumbnailUrl || outfit.spriteUrl || null,
    sourcePath: outfit.sourcePath,
    attributes: {
      cost: pickField(outfit.attributes, "cost"),
      mass: pickField(outfit.attributes, "mass"),
      outfitSpace: pickField(outfit.attributes, "outfit space"),
      weaponCapacity: pickField(outfit.attributes, "weapon capacity"),
      engineCapacity: pickField(outfit.attributes, "engine capacity"),
      gunPorts: pickField(outfit.attributes, "gun ports"),
      turretMounts: pickField(outfit.attributes, "turret mounts"),
      cargoSpace: pickField(outfit.attributes, "cargo space"),
      fuelCapacity: pickField(outfit.attributes, "fuel capacity"),
      requiredCrew: pickField(outfit.attributes, "required crew"),
      bunks: pickField(outfit.attributes, "bunks"),
      energyGeneration: pickField(outfit.attributes, "energy generation"),
      heatGeneration: pickField(outfit.attributes, "heat generation"),
      solarCollection: pickField(outfit.attributes, "solar collection"),
      solarHeat: pickField(outfit.attributes, "solar heat"),
      energyCapacity: pickField(outfit.attributes, "energy capacity"),
      energyConsumption: pickField(outfit.attributes, "energy consumption"),
      fuelGeneration: pickField(outfit.attributes, "fuel generation"),
      fuelEnergy: pickField(outfit.attributes, "fuel energy"),
      fuelConsumption: pickField(outfit.attributes, "fuel consumption"),
      fuelHeat: pickField(outfit.attributes, "fuel heat"),
      cooling: pickField(outfit.attributes, "cooling"),
      activeCooling: pickField(outfit.attributes, "active cooling"),
      coolingEnergy: pickField(outfit.attributes, "cooling energy"),
      coolingInefficiency: pickField(
        outfit.attributes,
        "cooling inefficiency"
      ),
      heatCapacity: pickField(outfit.attributes, "heat capacity"),
      shieldGeneration: pickField(outfit.attributes, "shield generation"),
      shieldEnergy: pickField(outfit.attributes, "shield energy"),
      shieldHeat: pickField(outfit.attributes, "shield heat"),
      delayedShieldEnergy: pickField(outfit.attributes, "delayed shield energy"),
      delayedShieldHeat: pickField(outfit.attributes, "delayed shield heat"),
      shieldEnergyMultiplier: pickField(outfit.attributes, "shield energy multiplier"),
      shieldHeatMultiplier: pickField(outfit.attributes, "shield heat multiplier"),
      hullEnergy: pickField(outfit.attributes, "hull energy"),
      hullHeat: pickField(outfit.attributes, "hull heat"),
      delayedHullEnergy: pickField(outfit.attributes, "delayed hull energy"),
      delayedHullHeat: pickField(outfit.attributes, "delayed hull heat"),
      hullEnergyMultiplier: pickField(outfit.attributes, "hull energy multiplier"),
      hullHeatMultiplier: pickField(outfit.attributes, "hull heat multiplier"),
      radarJamming: pickField(outfit.attributes, "radar jamming"),
      opticalJamming: pickField(outfit.attributes, "optical jamming"),
      infraredJamming: pickField(outfit.attributes, "infrared jamming"),
      thrust: pickField(outfit.attributes, "thrust"),
      thrustingEnergy: pickField(outfit.attributes, "thrusting energy"),
      thrustingHeat: pickField(outfit.attributes, "thrusting heat"),
      turn: pickField(outfit.attributes, "turn"),
      turningEnergy: pickField(outfit.attributes, "turning energy"),
      turningHeat: pickField(outfit.attributes, "turning heat"),
      afterburnerEnergy: pickField(outfit.attributes, "afterburner energy"),
      afterburnerHeat: pickField(outfit.attributes, "afterburner heat"),
      reverseThrust: pickField(outfit.attributes, "reverse thrust"),
      reverseThrustingEnergy: pickField(
        outfit.attributes,
        "reverse thrusting energy"
      ),
      reverseThrustingHeat: pickField(
        outfit.attributes,
        "reverse thrusting heat"
      ),
      jumpFuel: pickField(outfit.attributes, "jump fuel"),
      hyperdrive: pickField(outfit.attributes, "hyperdrive"),
      scramDrive: pickField(outfit.attributes, "scram drive"),
      jumpDrive: pickField(outfit.attributes, "jump drive"),
      quantumKeystone: pickField(outfit.attributes, "quantum keystone"),
      antiMissile: pickField(outfit.weapon, "anti-missile"),
      shieldDamage: pickField(outfit.weapon, "shield damage"),
      hullDamage: pickField(outfit.weapon, "hull damage"),
      firingEnergy: pickField(outfit.weapon, "firing energy"),
      firingHeat: pickField(outfit.weapon, "firing heat"),
      relativeFiringEnergy: pickField(outfit.weapon, "relative firing energy"),
      relativeFiringFuel: pickField(outfit.weapon, "relative firing fuel"),
      relativeFiringHeat: pickField(outfit.weapon, "relative firing heat"),
      firingFuel: pickField(outfit.weapon, "firing fuel"),
      reload: pickField(outfit.weapon, "reload"),
      burstCount: pickField(outfit.weapon, "burst count"),
      burstReload: pickField(outfit.weapon, "burst reload"),
    },
  };
}

export function buildPresetFits(ships = []) {
  const toId = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return ships.map((ship) => ({
    id: `${toId(ship.name)}-stock`,
    kind: "builtin",
    shipName: ship.name,
    name: `${ship.name} Stock`,
    role: "Baseline",
    note: "Official stock fit from the game.",
    loadout: null,
  }));
}

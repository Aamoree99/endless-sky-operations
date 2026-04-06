import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_DIR = process.env.ENDLESS_SKY_APP_CACHE_DIR || path.join(__dirname, "cache");
const FITS_PATH = path.join(CACHE_DIR, "user-fits.json");
const APP_CONFIG_PATH = path.join(CACHE_DIR, "app-config.json");
const PACKAGE_JSON_PATH = path.join(__dirname, "package.json");
const PORT = Number(process.env.PORT || 41783);
function getGameRootCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const programFiles = process.env.PROGRAMFILES || "C:\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\Program Files (x86)";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const candidates = [process.env.ENDLESS_SKY_ROOT];

  if (process.platform === "darwin") {
    candidates.push(
      path.join(home, "Library/Application Support/Steam/steamapps/common/Endless Sky"),
      "/Applications/Endless Sky.app/Contents/Resources"
    );
  } else if (process.platform === "win32") {
    candidates.push(
      path.join(programFilesX86, "Steam/steamapps/common/Endless Sky"),
      path.join(programFiles, "Steam/steamapps/common/Endless Sky"),
      path.join(appData, "..", "Local", "Programs", "Steam", "steamapps", "common", "Endless Sky")
    );
  } else {
    candidates.push(
      path.join(home, ".local/share/Steam/steamapps/common/Endless Sky"),
      path.join(home, ".steam/steam/steamapps/common/Endless Sky"),
      path.join(home, ".var/app/com.valvesoftware.Steam/data/Steam/steamapps/common/Endless Sky")
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

function expandGameRootCandidate(candidate) {
  if (!candidate) {
    return [];
  }
  const normalized = path.normalize(candidate);
  const expanded = [normalized];
  if (process.platform === "darwin" && normalized.toLowerCase().endsWith(".app")) {
    expanded.unshift(path.join(normalized, "Contents", "Resources"));
  }
  return [...new Set(expanded)];
}
const POLL_SECONDS = 5;
const PRICE_LIMIT = 20000;
const TOP_ROUTE_COUNT = 5;
const STEALTH_PROXY_CARGO_FINE = 40000;
const STEALTH_PROXY_PASSENGER_FINE = 75000;
const execFileAsync = promisify(execFile);

let gameDataPromise = null;
let appMetaPromise = null;

async function loadAppMeta() {
  if (!appMetaPromise) {
    appMetaPromise = readFile(PACKAGE_JSON_PATH, "utf8")
      .then((raw) => {
        const parsed = JSON.parse(raw);
        return {
          name: String(parsed?.name || "endless-sky-trade-app"),
          productName: String(parsed?.build?.productName || parsed?.name || "Endless Sky Operations"),
          version: String(parsed?.version || "0.0.0"),
        };
      })
      .catch(() => ({
        name: "endless-sky-trade-app",
        productName: "Endless Sky Operations",
        version: "0.0.0",
      }));
  }
  return appMetaPromise;
}

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

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function resolveGameRootSelection() {
  const config = await loadAppConfig();
  const configuredGameRoot = String(config.gameRootOverride || "").trim();
  const defaultCandidates = getGameRootCandidates();
  const candidates = configuredGameRoot
    ? [configuredGameRoot, ...defaultCandidates.filter((candidate) => path.normalize(candidate) !== path.normalize(configuredGameRoot))]
    : defaultCandidates;

  for (const candidate of candidates) {
    for (const expandedCandidate of expandGameRootCandidate(candidate)) {
      const systemsPath = path.join(expandedCandidate, "data", "map systems.txt");
      if (await fileExists(systemsPath)) {
        return {
          available: true,
          source: configuredGameRoot && path.normalize(candidate) === path.normalize(configuredGameRoot)
            ? "configured-game-root"
            : "auto-game-root",
          configuredGameRoot,
          gameRoot: expandedCandidate,
          candidates,
          configPath: APP_CONFIG_PATH,
          issue: null,
        };
      }
    }
  }

  return {
    available: false,
    source: configuredGameRoot ? "configured-game-root-missing" : "missing-game-root",
    configuredGameRoot,
    gameRoot: null,
    candidates,
    configPath: APP_CONFIG_PATH,
    issue: configuredGameRoot
      ? "The configured Endless Sky game folder was not found."
      : "No Endless Sky game files were found automatically.",
  };
}

async function findGameRoot() {
  const selection = await resolveGameRootSelection();
  if (selection.available && selection.gameRoot) {
    return selection.gameRoot;
  }
  throw new Error(selection.issue || "Could not find Endless Sky game files.");
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

async function listTextFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".txt")) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files.sort();
}

function parseMapSystems(raw) {
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

function parsePlanetDefinitions(raw) {
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

function parseWormholes(raw) {
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

function parseSaleGroups(raw, sourcePath) {
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

function parseDefinitions(raw, sourcePath, gameRoot) {
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

function parseMissionDefinitions(raw, sourcePath) {
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

function reduceShipForClient(ship) {
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

function reduceOutfitForClient(outfit) {
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

function buildPresetFits(ships = []) {
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

async function resolveSaveSelection() {
  const config = await loadAppConfig();
  const hints = getPlatformSaveHints();
  const configuredRecentPath = String(config.recentPathOverride || "").trim();
  const recentCandidates = configuredRecentPath
    ? [configuredRecentPath, ...hints.recentCandidates.filter((candidate) => candidate !== configuredRecentPath)]
    : hints.recentCandidates;

  for (const recentPath of recentCandidates) {
    if (!(await fileExists(recentPath))) {
      continue;
    }
    try {
      const recentSavePath = (await readFile(recentPath, "utf8")).trim();
      const recentSelection = await resolvePathAsSaveSelection(recentSavePath, configuredRecentPath && recentPath === configuredRecentPath ? "configured-recent" : "recent", recentPath);
      if (recentSelection?.available) {
        return {
          ...recentSelection,
          configuredRecentPath,
          configPath: APP_CONFIG_PATH,
          platform: hints.platform,
          defaultRecentPath: hints.recentCandidates[0] || null,
          recentCandidates,
          issue: null,
        };
      }
    } catch {
    }
  }

  return {
    source: configuredRecentPath ? "configured-recent-missing" : "missing",
    recentSavePath: recentCandidates[0] || null,
    savesDir: "",
    selectedSavePath: null,
    saves: [],
    available: false,
    configuredRecentPath,
    configPath: APP_CONFIG_PATH,
    platform: hints.platform,
    defaultRecentPath: hints.recentCandidates[0] || null,
    recentCandidates,
    issue: configuredRecentPath
      ? "The configured recent.txt path was not found."
      : "No Endless Sky save was found from recent.txt.",
  };
}

async function ensureGameData() {
  if (gameDataPromise) {
    return gameDataPromise;
  }

  gameDataPromise = (async () => {
    const gameRoot = await findGameRoot();
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

function parseSave(text) {
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
      dated: [],   // [{ day, month, year, entries: string[] }]
      named: {},   // { category: { name: string[] } }
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

function buildKnownSystems(save, mapSystems) {
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

function getDriveInfo(flagship) {
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

function computePrices(save, mapSystems) {
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

function buildRouteGraph(mapSystems, wormholes = []) {
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

function buildIllegalExposure(save, outfitsByName) {
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

function buildMissionExposure(missions = []) {
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

function buildPlannerSettings(save, illegalExposure, missionExposure) {
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

function buildDirectMarketsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning) {
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

function buildCarrySales(save, prices, routeGraph, driveInfo, systemAccess, planning) {
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

function buildLoopsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning) {
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

function buildReachableLoops(save, prices, routeGraph, driveInfo, systemAccess, planning) {
  return buildLoopsFromHere(save, prices, routeGraph, driveInfo, systemAccess, planning);
}

function buildCargoSummary(save, localPrices) {
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

function mergeSaleGroups(baseGroups, dynamicGroups) {
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

function buildPlanetCatalog(planets, saleGroups, overrides = {}) {
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

function buildSaleIndex(planets, shipsByName, outfitsByName) {
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

function buildSystemAccessMap(planets, save) {
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

function buildLicenseWiki(outfits, outfitSales, save, ships) {
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

function buildShipWiki(ships, currentSaleIndex, baseSaleIndex, save) {
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

function buildOutfitWiki(outfits, currentSaleIndex, baseSaleIndex, save) {
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

function buildAtlasSystems(planets, prices, systems) {
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

function reduceShipForStatus(ship) {
  return {
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

async function loadSavedFits() {
  await ensureDir(CACHE_DIR);
  if (!(await fileExists(FITS_PATH))) {
    return [];
  }
  try {
    const raw = await readFile(FITS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSavedFits(fits) {
  await ensureDir(CACHE_DIR);
  await writeFile(FITS_PATH, JSON.stringify(fits, null, 2), "utf8");
}

async function loadAppConfig() {
  await ensureDir(CACHE_DIR);
  const defaultConfig = {
    recentPathOverride: "",
    gameRootOverride: "",
  };
  if (!(await fileExists(APP_CONFIG_PATH))) {
    await writeFile(APP_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
    return defaultConfig;
  }
  try {
    const raw = await readFile(APP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeAppConfig(parsed);
  } catch {
    return defaultConfig;
  }
}

async function writeAppConfig(config) {
  await ensureDir(CACHE_DIR);
  const current = await loadAppConfig();
  await writeFile(APP_CONFIG_PATH, JSON.stringify(normalizeAppConfig({ ...current, ...config }), null, 2), "utf8");
}

function normalizeAppConfig(parsed) {
  return {
    recentPathOverride:
      typeof parsed?.recentPathOverride === "string"
        ? parsed.recentPathOverride
        : typeof parsed?.savePathOverride === "string" && /recent\.txt$/i.test(parsed.savePathOverride)
          ? parsed.savePathOverride
          : "",
    gameRootOverride:
      typeof parsed?.gameRootOverride === "string"
        ? parsed.gameRootOverride
        : "",
  };
}

async function exportAppConfig(targetPath) {
  const config = await loadAppConfig();
  await writeFile(targetPath, JSON.stringify(config, null, 2), "utf8");
  return targetPath;
}

async function importAppConfig(sourcePath) {
  const raw = await readFile(sourcePath, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = normalizeAppConfig(parsed);
  await ensureDir(CACHE_DIR);
  await writeFile(APP_CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf8");
  gameDataPromise = null;
  return normalized;
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

function getPlatformSaveHints() {
  const home = getHomeDir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");

  if (process.platform === "win32") {
    const base = path.join(appData, "endless-sky");
    return {
      platform: "Windows",
      recentCandidates: [path.join(base, "recent.txt")],
      saveDirCandidates: [path.join(base, "saves")],
    };
  }

  if (process.platform === "darwin") {
    const base = path.join(home, "Library/Application Support/endless-sky");
    return {
      platform: "macOS",
      recentCandidates: [path.join(base, "recent.txt")],
      saveDirCandidates: [path.join(base, "saves")],
    };
  }

  const shareBase = path.join(xdgDataHome, "endless-sky");
  const configBase = path.join(home, ".config", "endless-sky");
  return {
    platform: "Linux",
    recentCandidates: [
      path.join(shareBase, "recent.txt"),
      path.join(configBase, "recent.txt"),
    ],
    saveDirCandidates: [
      path.join(shareBase, "saves"),
      path.join(configBase, "saves"),
    ],
  };
}

async function listSaveCandidates(savesDir, recentSavePath = null) {
  let entries = [];
  try {
    entries = await readdir(savesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const saveEntries = entries.filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".txt") &&
      entry.name !== "steam_autocloud.vdf"
  );

  const saves = await Promise.all(
    saveEntries.map(async (entry) => {
      const fullPath = path.join(savesDir, entry.name);
      const info = await stat(fullPath);
      return {
        name: entry.name.trim(),
        path: fullPath,
        updatedAt: info.mtime.toISOString(),
        mtimeMs: info.mtimeMs,
        isRecent: recentSavePath ? fullPath === recentSavePath : false,
        isBackup: entry.name.includes("~~previous"),
      };
    })
  );

  saves.sort(
    (a, b) =>
      b.mtimeMs - a.mtimeMs ||
      Number(b.isRecent) - Number(a.isRecent) ||
      Number(a.isBackup) - Number(b.isBackup) ||
      a.name.localeCompare(b.name)
  );

  return saves.map(({ mtimeMs, ...save }) => save);
}

async function resolvePathAsSaveSelection(targetPath, source, recentSavePath = null) {
  if (!targetPath) {
    return null;
  }

  const normalized = path.normalize(String(targetPath).trim());
  if (!normalized || !(await fileExists(normalized))) {
    return null;
  }

  const info = await stat(normalized);
  if (info.isDirectory()) {
    const saves = await listSaveCandidates(normalized, recentSavePath);
    return {
      source,
      recentSavePath,
      savesDir: normalized,
      selectedSavePath: saves[0]?.path || null,
      saves,
      available: Boolean(saves[0]?.path),
    };
  }

  if (!info.isFile()) {
    return null;
  }

  const savesDir = path.dirname(normalized);
  const saves = await listSaveCandidates(savesDir, recentSavePath || normalized);
  return {
    source,
    recentSavePath: recentSavePath || normalized,
    savesDir,
    selectedSavePath: normalized,
    saves,
    available: true,
  };
}

async function openNativeSavePathPicker(kind = "file") {
  const normalizedKind = kind === "directory" ? "directory" : "file";
  const isCancelled = (error) => {
    const message = String(error?.stderr || error?.message || "").toLowerCase();
    return error?.code === 1 || message.includes("cancel") || message.includes("canceled") || message.includes("cancelled");
  };

  const tryCommand = async (command, args) => {
    try {
      const { stdout } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
      const picked = String(stdout || "").trim();
      return picked || null;
    } catch (error) {
      if (isCancelled(error)) {
        return null;
      }
      if (error?.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  };

  if (process.platform === "darwin") {
    const script = normalizedKind === "directory"
      ? 'POSIX path of (choose folder with prompt "Select the Endless Sky saves folder")'
      : 'POSIX path of (choose file with prompt "Select an Endless Sky save file" of type {"txt"})';
    return await tryCommand("osascript", ["-e", script]);
  }

  if (process.platform === "win32") {
    const script = normalizedKind === "directory"
      ? [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
          '$dialog.Description = "Select the Endless Sky saves folder"',
          'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
        ].join('; ')
      : [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
          '$dialog.Title = "Select an Endless Sky save file"',
          '$dialog.Filter = "Text Files (*.txt)|*.txt|All Files (*.*)|*.*"',
          'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }',
        ].join('; ');
    return await tryCommand("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
  }

  const zenityArgs = normalizedKind === "directory"
    ? ["--file-selection", "--directory", "--title=Select the Endless Sky saves folder"]
    : ["--file-selection", "--title=Select an Endless Sky save file", "--file-filter=*.txt"];
  const zenityResult = await tryCommand("zenity", zenityArgs);
  if (zenityResult !== undefined) {
    return zenityResult;
  }

  const kdialogArgs = normalizedKind === "directory"
    ? ["--getexistingdirectory", getHomeDir(), "--title", "Select the Endless Sky saves folder"]
    : ["--getopenfilename", getHomeDir(), "*.txt|Text Files (*.txt)", "--title", "Select an Endless Sky save file"];
  const kdialogResult = await tryCommand("kdialog", kdialogArgs);
  if (kdialogResult !== undefined) {
    return kdialogResult;
  }

  throw new Error("A native file picker is not available on this platform.");
}

async function upsertSavedFit(payload) {
  const fits = await loadSavedFits();
  const normalized = {
    id: payload.id || `fit-${Date.now()}`,
    kind: "user",
    shipName: payload.shipName,
    name: payload.name,
    role: payload.role || "Custom",
    note: payload.note || "",
    loadout: payload.loadout || {},
    updatedAt: new Date().toISOString(),
  };
  const index = fits.findIndex((fit) => fit.id === normalized.id);
  if (index >= 0) {
    fits[index] = normalized;
  } else {
    fits.push(normalized);
  }
  await writeSavedFits(fits);
  return normalized;
}

async function removeSavedFit(id) {
  const fits = await loadSavedFits();
  const next = fits.filter((fit) => fit.id !== id);
  await writeSavedFits(next);
  return next;
}

async function resolveGameData() {
  const selection = await resolveGameRootSelection();
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

async function buildBootstrap() {
  const appMeta = await loadAppMeta();
  const gameState = await resolveGameData();
  const game = gameState.game;
  const savedFits = await loadSavedFits();
  const saveSelection = await resolveSaveSelection();
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

async function buildStatus() {
  const appMeta = await loadAppMeta();
  const gameState = await resolveGameData();
  const game = gameState.game;
  const saveSelection = await resolveSaveSelection();
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
  const fleetShips = save.ships.map(reduceShipForStatus);
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

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[ext] || "application/octet-stream"
  );
}

function json(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function formatSaveNumber(value) {
  const numeric = Number(value) || 0;
  if (Number.isInteger(numeric)) {
    return String(numeric);
  }
  return String(Math.round(numeric * 1000) / 1000);
}

function formatSaveToken(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_.+\-']+$/.test(text) ? text : JSON.stringify(text);
}

function splitTopLevelBlocks(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (!current.length) {
      current.push(line);
      continue;
    }
    if (line && !line.startsWith("\t")) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    blocks.push(current);
  }
  return blocks;
}

function joinTopLevelBlocks(blocks) {
  return blocks.map((block) => block.join("\n")).join("\n");
}

function rewriteTopLevelBlock(raw, predicate, updater) {
  const blocks = splitTopLevelBlocks(raw);
  const index = blocks.findIndex((block) => predicate(block[0], block));
  if (index === -1) {
    throw new Error("Required save block was not found.");
  }
  blocks[index] = updater([...blocks[index]]);
  return joinTopLevelBlocks(blocks);
}

function rewriteNthTopLevelBlock(raw, predicate, targetMatchIndex, updater) {
  const blocks = splitTopLevelBlocks(raw);
  let matchIndex = -1;
  const index = blocks.findIndex((block) => {
    if (!predicate(block[0], block)) {
      return false;
    }
    matchIndex += 1;
    return matchIndex === targetMatchIndex;
  });
  if (index === -1) {
    throw new Error("Required indexed save block was not found.");
  }
  blocks[index] = updater([...blocks[index]]);
  return joinTopLevelBlocks(blocks);
}

function replaceTopLevelBlocks(raw, predicate, replacementBlocks, options = {}) {
  const blocks = splitTopLevelBlocks(raw);
  const matchIndexes = [];
  blocks.forEach((block, index) => {
    if (predicate(block[0], block)) {
      matchIndexes.push(index);
    }
  });

  let insertIndex = matchIndexes.length ? matchIndexes[0] : blocks.length;
  if (!matchIndexes.length && options.insertAfter) {
    const anchorIndex = blocks.findIndex((block) => options.insertAfter(block[0], block));
    if (anchorIndex >= 0) {
      insertIndex = anchorIndex + 1;
    }
  }

  const nextBlocks = blocks.filter((_, index) => !matchIndexes.includes(index));
  nextBlocks.splice(insertIndex, 0, ...replacementBlocks);
  return joinTopLevelBlocks(nextBlocks);
}

function replaceOrInsertIndentedLine(lines, prefix, nextLine, insertAfterPrefixes = []) {
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (!nextLine) {
    if (index >= 0) {
      lines.splice(index, 1);
    }
    return;
  }
  if (index >= 0) {
    lines[index] = nextLine;
    return;
  }
  let insertIndex = lines.length;
  for (let i = lines.length - 1; i >= 1; i -= 1) {
    if (insertAfterPrefixes.some((candidate) => lines[i].startsWith(candidate))) {
      insertIndex = i + 1;
      break;
    }
  }
  lines.splice(insertIndex, 0, nextLine);
}

function patchCreditsInSave(raw, credits) {
  const normalized = Math.max(0, Math.round(Number(credits) || 0));
  return rewriteTopLevelBlock(raw, (header) => header === "account", (lines) => {
    replaceOrInsertIndentedLine(lines, "\tcredits ", `\tcredits ${normalized}`);
    return lines;
  });
}

function patchPlayerLocationInSave(raw, locationPatch) {
  let next = raw;
  if (locationPatch.currentSystem !== undefined) {
    next = rewriteTopLevelBlock(next, (header) => header.startsWith("system "), (lines) => {
      lines[0] = locationPatch.currentSystem
        ? `system ${formatSaveToken(locationPatch.currentSystem)}`
        : "system";
      return lines;
    });
  }
  if (locationPatch.currentPlanet !== undefined) {
    next = rewriteTopLevelBlock(next, (header) => header.startsWith("planet "), (lines) => {
      lines[0] = locationPatch.currentPlanet
        ? `planet ${formatSaveToken(locationPatch.currentPlanet)}`
        : "planet";
      return lines;
    });
  }
  if (locationPatch.flagshipIndex !== undefined) {
    const normalized = Math.max(0, Math.round(Number(locationPatch.flagshipIndex) || 0));
    next = rewriteTopLevelBlock(next, (header) => header.startsWith('"flagship index"'), (lines) => {
      lines[0] = `"flagship index" ${normalized}`;
      return lines;
    });
  }
  return next;
}

function patchRepeatedTopLevelLines(raw, prefix, values, insertAfterPrefixes = []) {
  const replacementBlocks = (values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => [`${prefix} ${formatSaveToken(value)}`]);
  return replaceTopLevelBlocks(
    raw,
    (header) => header.startsWith(`${prefix} `),
    replacementBlocks,
    {
      insertAfter: (header) => insertAfterPrefixes.some((candidate) => header.startsWith(candidate)),
    }
  );
}

function patchConditionsInSave(raw, lines) {
  const nextLines = (lines || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return rewriteTopLevelBlock(raw, (header) => header === "conditions", () => {
    return ["conditions", ...nextLines.map((line) => `\t${line}`)];
  });
}

function patchLicensesInSave(raw, licenses) {
  const target = [...new Set((licenses || []).map((entry) => String(entry).trim()).filter(Boolean))];
  return rewriteTopLevelBlock(raw, (header) => header === "licenses", (lines) => {
    const existing = lines
      .slice(1)
      .map((line) => tokenize(line.trim())[0])
      .filter(Boolean);
    const ordered = [...existing.filter((name) => target.includes(name))];
    const missing = target.filter((name) => !ordered.includes(name)).sort((a, b) => a.localeCompare(b));
    return ["licenses", ...ordered.concat(missing).map((name) => `\t${formatSaveToken(name)}`)];
  });
}

function patchReputationsInSave(raw, updates) {
  const patch = Object.fromEntries(
    Object.entries(updates || {}).map(([name, value]) => [String(name), Number(value) || 0])
  );
  return rewriteTopLevelBlock(raw, (header) => header === '"reputation with"', (lines) => {
    const existingEntries = [];
    for (const line of lines.slice(1)) {
      if (!line.startsWith("\t")) {
        continue;
      }
      const tokens = tokenize(line.trim());
      if (tokens.length < 2) {
        continue;
      }
      existingEntries.push({ name: tokens[0], value: Number(tokens[1]) || 0 });
    }

    const seen = new Set();
    const nextEntries = existingEntries.map((entry) => {
      seen.add(entry.name);
      return {
        name: entry.name,
        value: Object.prototype.hasOwnProperty.call(patch, entry.name) ? patch[entry.name] : entry.value,
      };
    });

    const newEntries = Object.entries(patch)
      .filter(([name]) => !seen.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));

    return [
      '"reputation with"',
      ...nextEntries
        .concat(newEntries)
        .map((entry) => `\t${formatSaveToken(entry.name)} ${formatSaveNumber(entry.value)}`),
    ];
  });
}

function patchShipBlock(raw, shipPatch) {
  const shipId = String(shipPatch?.uuid || "").trim();
  const shipName = String(shipPatch?.name || "").trim();
  const originalName = String(shipPatch?.originalName || shipPatch?.name || "").trim();
  const saveIndex = Number(shipPatch?.saveIndex);
  const updater = (lines) => {
      if (shipPatch.name !== undefined) {
        replaceOrInsertIndentedLine(lines, "\tname ", `\tname ${formatSaveToken(shipName)}`);
      }
      if (shipPatch.crew !== undefined) {
        replaceOrInsertIndentedLine(lines, "\tcrew ", `\tcrew ${Math.max(0, Math.round(Number(shipPatch.crew) || 0))}`);
      }
      if (shipPatch.fuel !== undefined) {
        replaceOrInsertIndentedLine(lines, "\tfuel ", `\tfuel ${Math.max(0, Math.round(Number(shipPatch.fuel) || 0))}`);
      }
      if (shipPatch.shields !== undefined) {
        replaceOrInsertIndentedLine(lines, "\tshields ", `\tshields ${Math.max(0, Math.round(Number(shipPatch.shields) || 0))}`);
      }
      if (shipPatch.hull !== undefined) {
        replaceOrInsertIndentedLine(lines, "\thull ", `\thull ${Math.max(0, Math.round(Number(shipPatch.hull) || 0))}`);
      }
      if (shipPatch.system !== undefined) {
        replaceOrInsertIndentedLine(
          lines,
          "\tsystem ",
          shipPatch.system ? `\tsystem ${formatSaveToken(shipPatch.system)}` : null,
          ["\thull ", "\tparked"]
        );
      }
      if (shipPatch.planet !== undefined) {
        replaceOrInsertIndentedLine(
          lines,
          "\tplanet ",
          shipPatch.planet ? `\tplanet ${formatSaveToken(shipPatch.planet)}` : null,
          ["\tsystem "]
        );
      }
      if (shipPatch.parked !== undefined) {
        replaceOrInsertIndentedLine(
          lines,
          "\tparked",
          shipPatch.parked ? "\tparked" : null,
          ["\thull ", "\tplanet ", "\tsystem "]
        );
      }
      return lines;
    };

  if (Number.isInteger(saveIndex) && saveIndex >= 0) {
    return rewriteNthTopLevelBlock(
      raw,
      (header) => header.startsWith("ship "),
      saveIndex,
      updater
    );
  }

  if (!shipId && !originalName) {
    throw new Error("Ship identifier is required for ship edits.");
  }

  return rewriteTopLevelBlock(
    raw,
    (header, lines) =>
      header.startsWith("ship ") &&
      (!shipId || lines.some((line) => line.trim() === `uuid ${shipId}`)) &&
      (!originalName || lines.some((line) => line.trim() === `name ${originalName}`)),
    updater
  );
}

async function createSaveBackup(savePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.dirname(savePath);
  const parsed = path.parse(savePath);
  const backupPath = path.join(directory, `${parsed.name}~~codex-backup-${timestamp}${parsed.ext}`);
  const raw = await readFile(savePath, "utf8");
  await writeFile(backupPath, raw, "utf8");
  return backupPath;
}

async function listSaveBackups(savePath, limit = 12) {
  const directory = path.dirname(savePath);
  const parsed = path.parse(savePath);
  const prefix = `${parsed.name}~~codex-backup-`;
  const names = await readdir(directory);
  const matches = [];
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(parsed.ext)) {
      continue;
    }
    const fullPath = path.join(directory, name);
    try {
      const info = await stat(fullPath);
      matches.push({
        name,
        path: fullPath,
        updatedAt: info.mtime.toISOString(),
        updatedAtMs: info.mtimeMs,
      });
    } catch {
    }
  }
  return matches
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, limit);
}

async function applySaveEdits(savePath, payload) {
  const trackerOnlyTravelPatch =
    ["tracker", "planner"].includes(payload?.source) &&
    Array.isArray(payload?.travelPlan) &&
    payload?.credits === undefined &&
    payload?.currentSystem === undefined &&
    payload?.currentPlanet === undefined &&
    payload?.flagshipIndex === undefined &&
    !payload?.licenses &&
    !payload?.reputations &&
    !payload?.visitedSystems &&
    !payload?.visitedPlanets &&
    !payload?.ships &&
    !payload?.conditions &&
    !payload?.createBackup;

  if (!payload?.confirmGameClosed && !trackerOnlyTravelPatch) {
    throw new Error("Close Endless Sky before writing the save, then confirm it in the editor.");
  }

  const level = payload.level || "safe";
  let raw = await readFile(savePath, "utf8");
  let backupPath = null;
  if (payload.createBackup) {
    backupPath = await createSaveBackup(savePath);
  }

  const applied = [];

  if (payload.credits !== undefined) {
    raw = patchCreditsInSave(raw, payload.credits);
    applied.push("credits");
  }

  if (
    payload.currentSystem !== undefined ||
    payload.currentPlanet !== undefined ||
    payload.flagshipIndex !== undefined
  ) {
    raw = patchPlayerLocationInSave(raw, payload);
    applied.push("location");
  }

  if (payload.licenses) {
    raw = patchLicensesInSave(raw, payload.licenses);
    applied.push("licenses");
  }

  if (payload.reputations && Object.keys(payload.reputations).length) {
    raw = patchReputationsInSave(raw, payload.reputations);
    applied.push("reputations");
  }

  if (payload.visitedSystems) {
    raw = patchRepeatedTopLevelLines(raw, "visited", payload.visitedSystems, ["planet ", "system "]);
    applied.push("visitedSystems");
  }

  if (payload.visitedPlanets) {
    raw = patchRepeatedTopLevelLines(raw, "visited planet", payload.visitedPlanets, ["visited "]);
    applied.push("visitedPlanets");
  }

  if (payload.travelPlan) {
    raw = patchRepeatedTopLevelLines(raw, "travel", payload.travelPlan, ["visited planet", "visited "]);
    applied.push("travelPlan");
  }

  if (Array.isArray(payload.ships) && payload.ships.length) {
    for (const shipPatch of payload.ships) {
      raw = patchShipBlock(raw, shipPatch);
    }
    applied.push("ships");
  }

  if (payload.conditions) {
    raw = patchConditionsInSave(raw, payload.conditions);
    applied.push("conditions");
  }

  await writeFile(savePath, raw, "utf8");
  return { level, backupPath, applied };
}

async function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.join(PUBLIC_DIR, safePath);
  try {
    const data = await readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": getMimeType(fullPath),
      "Cache-Control": safePath.endsWith(".html") ? "no-store" : "public, max-age=300",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function serveGameAsset(requestPath, response) {
  const game = await ensureGameData();
  const relative = decodeURIComponent(
    requestPath.replace(/^\/game-assets\//, "")
  ).replace(/^\/+/, "");
  const baseDir = path.join(game.gameRoot, "images");
  const fullPath = path.normalize(path.join(baseDir, relative));
  if (!fullPath.startsWith(baseDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  const altPath = fullPath.endsWith(".png")
    ? fullPath.slice(0, -4) + ".jpg"
    : fullPath.endsWith(".jpg")
      ? fullPath.slice(0, -4) + ".png"
      : null;

  for (const tryPath of [fullPath, altPath].filter(Boolean)) {
    try {
      const data = await readFile(tryPath);
      response.writeHead(200, {
        "Content-Type": getMimeType(tryPath),
        "Cache-Control": "public, max-age=3600",
      });
      response.end(data);
      return;
    } catch {
    }
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://127.0.0.1:${PORT}`);

    if (requestUrl.pathname === "/api/bootstrap" && request.method === "GET") {
      json(response, await buildBootstrap());
      return;
    }

    if (requestUrl.pathname === "/api/status" && request.method === "GET") {
      json(response, await buildStatus());
      return;
    }

    if (requestUrl.pathname === "/api/fits" && request.method === "POST") {
      const payload = await readJsonBody(request);
      if (!payload?.shipName || !payload?.name) {
        json(response, { error: "shipName and name are required" }, 400);
        return;
      }
      const saved = await upsertSavedFit(payload);
      json(response, saved, 201);
      return;
    }

    if (requestUrl.pathname === "/api/fits" && request.method === "DELETE") {
      const id = requestUrl.searchParams.get("id");
      if (!id) {
        json(response, { error: "id is required" }, 400);
        return;
      }
      const fits = await removeSavedFit(id);
      json(response, { fits });
      return;
    }

    if (requestUrl.pathname === "/api/save-config/browse" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const browseKind = String(payload?.kind || "").trim().toLowerCase();
      const kind = browseKind === "directory" || browseKind === "game-root" ? "directory" : "file";
      const pickedPath = await openNativeSavePathPicker(kind);
      json(response, { ok: Boolean(pickedPath), cancelled: !pickedPath, path: pickedPath ? path.normalize(pickedPath) : null }, 200);
      return;
    }

    if (requestUrl.pathname === "/api/app-config/export" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const targetPath = String(payload?.path || "").trim();
      if (!targetPath) {
        json(response, { error: "A target path is required for config export." }, 400);
        return;
      }
      const normalizedPath = path.normalize(targetPath);
      await exportAppConfig(normalizedPath);
      json(response, { ok: true, path: normalizedPath }, 200);
      return;
    }

    if (requestUrl.pathname === "/api/app-config/import" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const sourcePath = String(payload?.path || "").trim();
      if (!sourcePath) {
        json(response, { error: "A source path is required for config import." }, 400);
        return;
      }
      const normalizedPath = path.normalize(sourcePath);
      if (!(await fileExists(normalizedPath))) {
        json(response, { error: "The selected config file was not found." }, 400);
        return;
      }
      const config = await importAppConfig(normalizedPath);
      json(response, { ok: true, path: normalizedPath, config }, 200);
      return;
    }

    if (requestUrl.pathname === "/api/save-config" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const nextRecentPath = Object.prototype.hasOwnProperty.call(payload || {}, "recentPathOverride")
        ? String(payload?.recentPathOverride || "").trim()
        : null;
      const nextGameRoot = Object.prototype.hasOwnProperty.call(payload || {}, "gameRootOverride")
        ? String(payload?.gameRootOverride || "").trim()
        : null;
      const updates = {};

      if (nextRecentPath !== null) {
        if (!nextRecentPath) {
          updates.recentPathOverride = "";
        } else {
          const normalizedPath = path.normalize(nextRecentPath);
          const exists = await fileExists(normalizedPath);
          if (!exists || !/recent\.txt$/i.test(path.basename(normalizedPath))) {
            json(
              response,
              { error: "The provided recent.txt path was not found." },
              400
            );
            return;
          }
          updates.recentPathOverride = normalizedPath;
        }
      }

      if (nextGameRoot !== null) {
        if (!nextGameRoot) {
          updates.gameRootOverride = "";
        } else {
          const candidates = expandGameRootCandidate(nextGameRoot);
          let resolvedGameRoot = null;
          for (const candidate of candidates) {
            if (await fileExists(path.join(candidate, "data", "map systems.txt"))) {
              resolvedGameRoot = candidate;
              break;
            }
          }
          if (!resolvedGameRoot) {
            json(
              response,
              { error: "The provided Endless Sky game folder was not found." },
              400
            );
            return;
          }
          updates.gameRootOverride = resolvedGameRoot;
        }
      }

      await writeAppConfig(updates);
      if (Object.prototype.hasOwnProperty.call(updates, "gameRootOverride")) {
        gameDataPromise = null;
      }
      json(
        response,
        {
          ok: true,
          recentPath: updates.recentPathOverride ?? null,
          gameRoot: updates.gameRootOverride ?? null,
          cleared: Object.values(updates).some((value) => value === ""),
        },
        200
      );
      return;
    }

    if (requestUrl.pathname === "/api/save-editor" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const saveSelection = await resolveSaveSelection();
      const targetSavePath = payload?.savePathOverride
        ? path.normalize(String(payload.savePathOverride))
        : saveSelection.selectedSavePath;
      const savesDirResolved = path.resolve(saveSelection.savesDir);
      const targetResolved = path.resolve(targetSavePath);
      if (!targetResolved.startsWith(savesDirResolved)) {
        json(response, { error: "savePathOverride must stay inside the save directory." }, 400);
        return;
      }
      const result = await applySaveEdits(targetResolved, payload);
      json(response, result, 200);
      return;
    }

    if (requestUrl.pathname.startsWith("/game-assets/")) {
      await serveGameAsset(requestUrl.pathname, response);
      return;
    }

    await serveStatic(requestUrl.pathname, response);
  } catch (error) {
    json(
      response,
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

server.listen(PORT, () => {
  console.log(`Endless Sky trade app: http://127.0.0.1:${PORT}`);
});

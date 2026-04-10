import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPresetFits,
  parseDefinitions,
  parseMapSystems,
  parseMissionDefinitions,
  parsePlanetDefinitions,
  parseSaleGroups,
  parseWormholes,
  reduceOutfitForClient,
  reduceShipForClient,
} from "./server/game-data-parse.mjs";
import {
  ensureDir,
  fileExists,
  findGameRoot,
  listTextFiles,
  resolveGameRootOverrideInput,
} from "./server/runtime-paths.mjs";
import { applySaveEdits, listSaveBackups } from "./server/save-editor.mjs";
import { json } from "./server/http-utils.mjs";
import { buildBootstrap, buildStatus } from "./server/status-builders.mjs";
import { handleApiRequest } from "./server/api-routes.mjs";
import { createGameDataLoader } from "./server/game-data-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_DIR = process.env.ENDLESS_SKY_APP_CACHE_DIR || path.join(__dirname, "cache");
const FITS_PATH = path.join(CACHE_DIR, "user-fits.json");
const APP_CONFIG_PATH = path.join(CACHE_DIR, "app-config.json");
const PACKAGE_JSON_PATH = path.join(__dirname, "package.json");
const PORT = Number(process.env.PORT || 41783);
const POLL_SECONDS = 5;
const fitsStoreDeps = { cacheDir: CACHE_DIR, fitsPath: FITS_PATH, ensureDir, fileExists };

const appMetaCache = {};
const gameDataLoader = createGameDataLoader({
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
});
const ensureGameData = gameDataLoader.ensureGameData;

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://127.0.0.1:${PORT}`);
    await handleApiRequest(serverDeps, requestUrl, request, response);
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

const gameStateControl = {
  resetGameData() {
    gameDataLoader.resetGameData();
  },
};

const serverDeps = {
  APP_CONFIG_PATH,
  PACKAGE_JSON_PATH,
  POLL_SECONDS,
  PUBLIC_DIR,
  appMetaCache,
  fitsStoreDeps,
  applySaveEdits,
  listSaveBackups,
  resolveGameRootOverrideInput,
  ensureGameData,
  buildBootstrap,
  buildStatus,
  gameStateControl,
};

server.listen(PORT, () => {
  console.log(`Endless Sky trade app: http://127.0.0.1:${PORT}`);
});

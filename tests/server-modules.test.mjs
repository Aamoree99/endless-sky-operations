import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  exportAppConfig,
  fileExists,
  importAppConfig,
  loadAppConfig,
  resolveGameRootOverrideInput,
  resolveSaveSelection,
  writeAppConfig,
} from "../server/runtime-paths.mjs";
import {
  loadSavedFits,
  removeSavedFit,
  upsertSavedFit,
} from "../server/fits-store.mjs";
import { createGameDataLoader } from "../server/game-data-loader.mjs";
import { buildStatus } from "../server/status-builders.mjs";
import { handleApiRequest } from "../server/api-routes.mjs";

async function makeTempDir(prefix = "es-operations-test-") {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensure(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function withPatchedEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createResponseCapture() {
  let statusCode = null;
  let headers = null;
  const chunks = [];
  return {
    writeHead(code, nextHeaders) {
      statusCode = code;
      headers = nextHeaders;
    },
    end(chunk = "") {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
    },
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get text() {
      return Buffer.concat(chunks).toString("utf8");
    },
    get json() {
      return JSON.parse(this.text || "{}");
    },
  };
}

function createRequest(method, body = undefined) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

test("runtime-paths resolves configured recent.txt and supports config roundtrip", async () => {
  const tempDir = await makeTempDir();
  const savesDir = path.join(tempDir, "saves");
  const savePath = path.join(savesDir, "Pilot.txt");
  const recentPath = path.join(tempDir, "recent.txt");
  const appConfigPath = path.join(tempDir, "app-config.json");
  const exportedPath = path.join(tempDir, "exported-config.json");
  const importedPath = path.join(tempDir, "import-config.json");

  await ensure(savesDir);
  await writeFile(savePath, "pilot data", "utf8");
  await writeFile(recentPath, `${savePath}\n`, "utf8");

  const defaults = await loadAppConfig(appConfigPath);
  assert.deepEqual(defaults, {
    recentPathOverride: "",
    gameRootOverride: "",
  });

  await writeAppConfig(appConfigPath, { recentPathOverride: recentPath });
  const selection = await resolveSaveSelection(appConfigPath);
  assert.equal(selection.available, true);
  assert.equal(selection.selectedSavePath, savePath);
  assert.equal(selection.recentSavePath, recentPath);

  await exportAppConfig(appConfigPath, exportedPath);
  const exported = JSON.parse(await readFile(exportedPath, "utf8"));
  assert.equal(exported.recentPathOverride, recentPath);

  await writeFile(importedPath, JSON.stringify({ gameRootOverride: "/tmp/game-root" }, null, 2), "utf8");
  const imported = await importAppConfig(appConfigPath, importedPath);
  assert.deepEqual(imported, {
    recentPathOverride: "",
    gameRootOverride: "/tmp/game-root",
  });
});

test("runtime-paths validates a game root override when map systems exists", async () => {
  const tempDir = await makeTempDir();
  const gameRoot = path.join(tempDir, "Endless Sky");
  await ensure(path.join(gameRoot, "data"));
  await writeFile(path.join(gameRoot, "data", "map systems.txt"), "system data", "utf8");

  const resolved = await resolveGameRootOverrideInput(gameRoot);
  assert.equal(resolved, gameRoot);
});

test("fits-store upserts and removes saved fits", async () => {
  const tempDir = await makeTempDir();
  const deps = {
    cacheDir: tempDir,
    fitsPath: path.join(tempDir, "user-fits.json"),
    ensureDir: ensure,
    fileExists: exists,
  };

  const saved = await upsertSavedFit(deps, {
    shipName: "Geocoris",
    name: "Cargo Test",
    note: "For smoke test",
    loadout: { Hyperdrive: 1, "Fuel Pod": 1 },
  });
  const loaded = await loadSavedFits(deps);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, saved.id);

  const next = await removeSavedFit(deps, saved.id);
  assert.equal(next.length, 0);
});

test("game-data-loader caches results and resets cleanly", async () => {
  let mapParseCalls = 0;
  let readCalls = 0;

  const loader = createGameDataLoader({
    APP_CONFIG_PATH: "/tmp/app-config.json",
    path,
    readFile: async () => {
      readCalls += 1;
      return "raw";
    },
    fileExists: async () => true,
    findGameRoot: async () => "/tmp/endless-sky",
    listTextFiles: async (dir) => {
      if (dir.endsWith(path.join("data", "human"))) {
        return [path.join(dir, "ships.txt")];
      }
      if (dir.endsWith(path.join("data", "hai"))) {
        return [];
      }
      return [path.join(dir, "missions.txt")];
    },
    parseMapSystems: () => {
      mapParseCalls += 1;
      return {
        Alpha: {
          name: "Alpha",
          pos: [12, 34],
          links: [],
          objects: ["World"],
          trade: {},
        },
      };
    },
    parsePlanetDefinitions: () => ({
      World: { name: "World" },
    }),
    parseWormholes: () => [],
    parseDefinitions: () => [
      { kind: "ship", name: "Scout", category: "Light", attributes: {} },
      { kind: "outfit", name: "Hyperdrive", category: "Systems", attributes: {} },
    ],
    parseMissionDefinitions: () => [{ id: "m1", name: "Mission" }],
    parseSaleGroups: () => ({ shipyard: {}, outfitter: {} }),
    reduceShipForClient: (ship) => ship,
    reduceOutfitForClient: (outfit) => outfit,
    buildPresetFits: (ships) => ships.map((ship) => ({ shipName: ship.name, name: "Stock" })),
  });

  const first = await loader.ensureGameData();
  const second = await loader.ensureGameData();
  assert.strictEqual(first, second);
  assert.equal(mapParseCalls, 1);
  assert.ok(readCalls > 0);

  loader.resetGameData();
  const third = await loader.ensureGameData();
  assert.notStrictEqual(third, first);
  assert.equal(mapParseCalls, 2);
});

test("status-builders returns unavailable skeleton when save and game are missing", async () => {
  const tempDir = await makeTempDir();
  const appConfigPath = path.join(tempDir, "app-config.json");
  const packageJsonPath = path.join(tempDir, "package.json");

  await writeFile(packageJsonPath, JSON.stringify({ name: "es-operations", version: "0.4.0" }), "utf8");

  await withPatchedEnv(
    {
      HOME: tempDir,
      APPDATA: path.join(tempDir, "AppData", "Roaming"),
      XDG_DATA_HOME: path.join(tempDir, ".local", "share"),
    },
    async () => {
      const status = await buildStatus({
        APP_CONFIG_PATH: appConfigPath,
        PACKAGE_JSON_PATH: packageJsonPath,
        POLL_SECONDS: 5,
        appMetaCache: {},
        ensureGameData: async () => {
          throw new Error("should not be called");
        },
        resolveGameRootSelection: async () => ({
          available: false,
          gameRoot: null,
          source: "missing-game-root",
          configuredGameRoot: "",
          configPath: appConfigPath,
          candidates: [],
          issue: "No Endless Sky game files were found automatically.",
        }),
        listSaveBackups: async () => [],
      });

      assert.equal(status.gameUnavailable, true);
      assert.equal(status.saveUnavailable, true);
      assert.equal(status.player.credits, 0);
      assert.equal(status.app.version, "0.4.0");
    }
  );
});

test("api-routes serves bootstrap and validates missing fit payload", async () => {
  const baseDeps = {
    APP_CONFIG_PATH: "/tmp/app-config.json",
    PUBLIC_DIR: "/tmp/public",
    applySaveEdits: async () => {
      throw new Error("not expected");
    },
    buildBootstrap: async () => ({ ok: true, generatedAt: "now" }),
    buildStatus: async () => ({ ok: true }),
    resolveGameRootOverrideInput: async () => null,
    ensureGameData: async () => ({ gameRoot: "/tmp/game" }),
    fitsStoreDeps: {},
    gameStateControl: { resetGameData() {} },
  };

  const bootstrapResponse = createResponseCapture();
  await handleApiRequest(
    baseDeps,
    new URL("http://127.0.0.1/api/bootstrap"),
    createRequest("GET"),
    bootstrapResponse
  );
  assert.equal(bootstrapResponse.statusCode, 200);
  assert.deepEqual(bootstrapResponse.json, { ok: true, generatedAt: "now" });

  const fitsResponse = createResponseCapture();
  await handleApiRequest(
    baseDeps,
    new URL("http://127.0.0.1/api/fits"),
    createRequest("POST", {}),
    fitsResponse
  );
  assert.equal(fitsResponse.statusCode, 400);
  assert.equal(fitsResponse.json.error, "shipName and name are required");
});

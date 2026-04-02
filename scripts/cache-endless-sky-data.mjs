import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const cacheRoot = path.join(projectRoot, "cache");
const snapshotRoot = path.join(cacheRoot, "game-data");
const sourceRoot = path.join(cacheRoot, "game-source");
const apiSnapshotRoot = path.join(cacheRoot, "snapshots");
const recentPath = path.join(
  process.env.HOME || "",
  "Library/Application Support/endless-sky/recent.txt"
);
const gameRootCandidates = [
  process.env.ENDLESS_SKY_ROOT,
  path.join(
    process.env.HOME || "",
    "Library/Application Support/Steam/steamapps/common/Endless Sky"
  ),
  "/Applications/Endless Sky.app/Contents/Resources",
].filter(Boolean);
const mirroredFiles = [
  "data/map systems.txt",
  "data/map planets.txt",
  "data/human/ships.txt",
  "data/human/outfits.txt",
  "data/human/weapons.txt",
  "data/human/engines.txt",
  "data/human/power.txt",
  "data/human/sales.txt",
  "data/human/campaign events.txt",
  "data/hai/hai.txt",
  "data/hai/hai ships.txt",
  "data/hai/hai outfits.txt",
];
const remoteSources = [
  {
    label: "AI escort logic",
    url: "https://raw.githubusercontent.com/endless-sky/endless-sky/master/source/AI.cpp",
    target: "AI.cpp",
  },
];

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

async function findGameRoot() {
  for (const candidate of gameRootCandidates) {
    if (!candidate) {
      continue;
    }
    const systemsPath = path.join(candidate, "data", "map systems.txt");
    if (await fileExists(systemsPath)) {
      return candidate;
    }
  }
  throw new Error("Could not find Endless Sky game files. Set ENDLESS_SKY_ROOT.");
}

async function mirrorGameFiles(gameRoot) {
  const copied = [];
  for (const relativePath of mirroredFiles) {
    const sourcePath = path.join(gameRoot, relativePath);
    if (!(await fileExists(sourcePath))) {
      continue;
    }
    const targetPath = path.join(snapshotRoot, relativePath);
    await ensureDir(path.dirname(targetPath));
    await copyFile(sourcePath, targetPath);
    copied.push({
      relativePath,
      sourcePath,
      targetPath,
    });
  }
  return copied;
}

async function fetchRemoteSources() {
  const fetched = [];
  await ensureDir(sourceRoot);
  for (const entry of remoteSources) {
    try {
      const response = await fetch(entry.url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      const targetPath = path.join(sourceRoot, entry.target);
      await writeFile(targetPath, text, "utf8");
      fetched.push({
        ...entry,
        targetPath,
        ok: true,
      });
    } catch (error) {
      fetched.push({
        ...entry,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return fetched;
}

async function writeManifest(data) {
  await ensureDir(snapshotRoot);
  const targetPath = path.join(snapshotRoot, "manifest.json");
  await writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
  return targetPath;
}

async function writeApiSnapshots() {
  const endpoints = [
    { name: "bootstrap", url: "http://127.0.0.1:41783/api/bootstrap" },
    { name: "status", url: "http://127.0.0.1:41783/api/status" },
  ];
  const results = [];
  await ensureDir(apiSnapshotRoot);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      const targetPath = path.join(apiSnapshotRoot, `${endpoint.name}-snapshot.json`);
      await writeFile(targetPath, JSON.stringify(json, null, 2), "utf8");
      results.push({
        ...endpoint,
        ok: true,
        targetPath,
      });
    } catch (error) {
      results.push({
        ...endpoint,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

const gameRoot = await findGameRoot();
const mirrored = await mirrorGameFiles(gameRoot);
const remote = await fetchRemoteSources();
const apiSnapshots = await writeApiSnapshots();
const manifestPath = await writeManifest({
  generatedAt: new Date().toISOString(),
  gameRoot,
  recentPath,
  mirroredFiles: mirrored,
  remoteSources: remote,
  apiSnapshots,
});

console.log(`Mirrored ${mirrored.length} game data files to ${snapshotRoot}`);
console.log(`Wrote manifest to ${manifestPath}`);
for (const item of remote) {
  if (item.ok) {
    console.log(`Fetched ${item.label}: ${item.targetPath}`);
  } else {
    console.log(`Skipped ${item.label}: ${item.error}`);
  }
}
for (const item of apiSnapshots) {
  if (item.ok) {
    console.log(`Wrote API snapshot ${item.name}: ${item.targetPath}`);
  } else {
    console.log(`Skipped API snapshot ${item.name}: ${item.error}`);
  }
}

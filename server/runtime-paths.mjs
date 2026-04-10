import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function listTextFiles(rootDir) {
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

export async function loadAppMeta(packageJsonPath, cache = {}) {
  if (!cache.appMetaPromise) {
    cache.appMetaPromise = readFile(packageJsonPath, "utf8")
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
  return cache.appMetaPromise;
}

function getGameRootCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
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

export async function loadAppConfig(appConfigPath) {
  await ensureDir(path.dirname(appConfigPath));
  const defaultConfig = {
    recentPathOverride: "",
    gameRootOverride: "",
  };
  if (!(await fileExists(appConfigPath))) {
    await writeFile(appConfigPath, JSON.stringify(defaultConfig, null, 2), "utf8");
    return defaultConfig;
  }
  try {
    const raw = await readFile(appConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeAppConfig(parsed);
  } catch {
    return defaultConfig;
  }
}

export async function writeAppConfig(appConfigPath, config) {
  await ensureDir(path.dirname(appConfigPath));
  const current = await loadAppConfig(appConfigPath);
  await writeFile(
    appConfigPath,
    JSON.stringify(normalizeAppConfig({ ...current, ...config }), null, 2),
    "utf8"
  );
}

export async function exportAppConfig(appConfigPath, targetPath) {
  const config = await loadAppConfig(appConfigPath);
  await writeFile(targetPath, JSON.stringify(config, null, 2), "utf8");
  return targetPath;
}

export async function importAppConfig(appConfigPath, sourcePath) {
  const raw = await readFile(sourcePath, "utf8");
  const parsed = JSON.parse(raw);
  const normalized = normalizeAppConfig(parsed);
  await ensureDir(path.dirname(appConfigPath));
  await writeFile(appConfigPath, JSON.stringify(normalized, null, 2), "utf8");
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

export async function resolveGameRootSelection(appConfigPath) {
  const config = await loadAppConfig(appConfigPath);
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
          configPath: appConfigPath,
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
    configPath: appConfigPath,
    issue: configuredGameRoot
      ? "The configured Endless Sky game folder was not found."
      : "No Endless Sky game files were found automatically.",
  };
}

export async function findGameRoot(appConfigPath) {
  const selection = await resolveGameRootSelection(appConfigPath);
  if (selection.available && selection.gameRoot) {
    return selection.gameRoot;
  }
  throw new Error(selection.issue || "Could not find Endless Sky game files.");
}

export async function resolveGameRootOverrideInput(rawValue) {
  const configuredGameRoot = String(rawValue || "").trim();
  if (!configuredGameRoot) {
    return "";
  }
  for (const candidate of expandGameRootCandidate(configuredGameRoot)) {
    if (await fileExists(path.join(candidate, "data", "map systems.txt"))) {
      return candidate;
    }
  }
  return null;
}

export async function resolveSaveSelection(appConfigPath) {
  const config = await loadAppConfig(appConfigPath);
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
      const recentSelection = await resolvePathAsSaveSelection(
        recentSavePath,
        configuredRecentPath && recentPath === configuredRecentPath ? "configured-recent" : "recent",
        recentPath
      );
      if (recentSelection?.available) {
        return {
          ...recentSelection,
          configuredRecentPath,
          configPath: appConfigPath,
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
    configPath: appConfigPath,
    platform: hints.platform,
    defaultRecentPath: hints.recentCandidates[0] || null,
    recentCandidates,
    issue: configuredRecentPath
      ? "The configured recent.txt path was not found."
      : "No Endless Sky save was found from recent.txt.",
  };
}

export async function openNativeSavePathPicker(kind = "file") {
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
        ].join("; ")
      : [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
          '$dialog.Title = "Select an Endless Sky save file"',
          '$dialog.Filter = "Text Files (*.txt)|*.txt|All Files (*.*)|*.*"',
          'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }',
        ].join("; ");
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

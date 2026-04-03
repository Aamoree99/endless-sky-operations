import {
  clamp,
  lerp,
  easeOutCubic,
  fitViewBox,
  getAtlasMapProjection,
  clampAtlasView,
  getDefaultAtlasView,
  getAtlasFocusViewForNames,
} from "./app/map-view.js";
import { firstCopyLine, clampCopy, uniqueByName } from "./app/text-utils.js";
import {
  createTrackerState,
  normalizeTrackerState,
  getTrackerTravelPlan,
  getTrackerStageMeta,
} from "./app/tracker-state.js";
import {
  formatTradeLocation,
  getRouteAccessLabel,
  getRouteRiskBadges,
} from "./app/planner-text.js";
import { humanizeMissionSummary, humanizeWorldStateNotes } from "./app/wiki-text.js";

const heroMeta = document.getElementById("hero-meta");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const summaryStrip = document.getElementById("summary-strip");
const saveSetupBanner = document.getElementById("save-setup-banner");
const missionOccupancy = document.getElementById("mission-occupancy");
const cargoSummary = document.getElementById("cargo-summary");
const directMarkets = document.getElementById("direct-markets");
const carrySales = document.getElementById("carry-sales");
const localLoops = document.getElementById("local-loops");
const reachableLoops = document.getElementById("reachable-loops");
const activeRouteCard = document.getElementById("active-route-card");
const atlasSearch = document.getElementById("atlas-search");
const atlasSystemList = document.getElementById("atlas-system-list");
const atlasMapSvg = document.getElementById("atlas-map-svg");
const atlasMapOverlaySvg = document.getElementById("atlas-map-overlay-svg");
const atlasMapPlanet = document.getElementById("atlas-map-planet");
const atlasMapStock = document.getElementById("atlas-map-stock");
const atlasMapMarket = document.getElementById("atlas-map-market");
const atlasDetail = document.getElementById("atlas-detail");
const wikiNav = document.getElementById("wiki-nav");
const wikiContent = document.getElementById("wiki-content");
const settingsOverview = document.getElementById("settings-overview");
const settingsSave = document.getElementById("settings-save");
const settingsGame = document.getElementById("settings-game");
const settingsPlanner = document.getElementById("settings-planner");
const debugEditorWarning = document.getElementById("debug-editor-warning");
const debugEditorSettings = document.getElementById("debug-editor-settings");
const debugEditorStatus = document.getElementById("debug-editor-status");
const debugSafeEditor = document.getElementById("debug-safe-editor");
const debugAdvancedEditor = document.getElementById("debug-advanced-editor");
const debugDangerousEditor = document.getElementById("debug-dangerous-editor");
const fleetList = document.getElementById("fleet-list");
const standings = document.getElementById("standings");
const licenses = document.getElementById("licenses");
const outfitSearch = document.getElementById("outfit-search");
const outfitCategory = document.getElementById("outfit-category");
const saveFitButton = document.getElementById("save-fit-button");
const fitSaveModal = document.getElementById("fit-save-modal");
const fitSaveName = document.getElementById("fit-save-name");
const fitSaveNote = document.getElementById("fit-save-note");
const fitSaveCharcount = document.getElementById("fit-save-charcount");
const fitSaveCancel = document.getElementById("fit-save-cancel");
const fitSaveSubmit = document.getElementById("fit-save-submit");
const debugWarningModal = document.getElementById("debug-warning-modal");
const debugWarningCancel = document.getElementById("debug-warning-cancel");
const debugWarningConfirm = document.getElementById("debug-warning-confirm");
const savePathModal = document.getElementById("save-path-modal");
const savePathTitle = document.getElementById("save-path-title");
const savePathCopy = document.getElementById("save-path-copy");
const savePathLabel = document.getElementById("save-path-label");
const savePathInput = document.getElementById("save-path-input");
const savePathHints = document.getElementById("save-path-hints");
const savePathStatus = document.getElementById("save-path-status");
const savePathCancel = document.getElementById("save-path-cancel");
const savePathClear = document.getElementById("save-path-clear");
const savePathBrowse = document.getElementById("save-path-browse");
const savePathSubmit = document.getElementById("save-path-submit");
const fitBrowserSearch = document.getElementById("fit-browser-search");
const fitShipCategory = document.getElementById("fit-ship-category");
const fitShipCategoryField = document.getElementById("fit-ship-category-field");
const fitBrowserList = document.getElementById("fit-browser-list");
const fitBrowserTabs = Array.from(document.querySelectorAll("[data-fit-browser-tab]"));
const fitBrowserModeButtons = Array.from(document.querySelectorAll("[data-fit-browser-mode]"));
const fitSelection = document.getElementById("fit-selection");
const fitOwnedShips = document.getElementById("fit-owned-ships");
const fitOwnedShipsCompact = document.getElementById("fit-owned-ships-compact");
const fitHeader = document.getElementById("fit-header");
const fitSummary = document.getElementById("fit-summary");
const fitLoadout = document.getElementById("fit-loadout");
const outfitCatalog = document.getElementById("outfit-catalog");
const fitterBrowserPane = document.getElementById("fitter-browser-pane");
const fitterModulesPane = document.getElementById("fitter-modules-pane");
const mapSvg = document.getElementById("map-svg");
const galaxyMapSvg = document.getElementById("galaxy-map-svg");
const selectedRouteMeta = document.getElementById("selected-route-meta");
const tracker = document.getElementById("tracker");
const clearTrackerButton = document.getElementById("clear-tracker");
const tabButtons = Array.from(document.querySelectorAll("[data-page-target]"));
const pages = {
  planner: document.getElementById("page-planner"),
  atlas: document.getElementById("page-atlas"),
  wiki: document.getElementById("page-wiki"),
  settings: document.getElementById("page-settings"),
  debug: document.getElementById("page-debug"),
  fleet: document.getElementById("page-fleet"),
  fitter: document.getElementById("page-fitter"),
};

const TRACKER_KEY = "es-loop-tracker-v3";
const DEBUG_KEY = "es-debug-mode-v1";
const DEBUG_BACKUP_KEY = "es-debug-backup-v1";
const DESKTOP_BRIDGE = window.esDesktop || null;
const DESKTOP_RUNTIME = {
  bridge: DESKTOP_BRIDGE,
  isDesktop:
    Boolean(DESKTOP_BRIDGE?.isDesktop) ||
    document.documentElement?.dataset?.esDesktop === "1" ||
    /\bElectron\/\d+/i.test(navigator.userAgent || ""),
  platform: DESKTOP_BRIDGE?.platform || null,
};
const FRAMES_PER_SECOND = 60;
const MAX_SIMULATION_SECONDS = 20 * 60;
const MAX_SIMULATION_FRAMES = MAX_SIMULATION_SECONDS * FRAMES_PER_SECOND;
const FIT_CATEGORY_ORDER = [
  "Engines",
  "Guns",
  "Turrets",
  "Secondary Weapons",
  "Ammunition",
  "Power",
  "Systems",
  "Special",
  "Hand to Hand",
  "Licenses",
  "Outfit",
  "Unique",
];
const CATALOG_SECTION_ORDER = [
  "Guns",
  "Turrets",
  "Secondary Weapons",
  "Ammunition",
  "Systems",
  "Hand to Hand",
];
const MARKET_COMMODITY_ORDER = [
  "Food",
  "Clothing",
  "Metal",
  "Plastic",
  "Equipment",
  "Medical",
  "Industrial",
  "Electronics",
  "Heavy Metals",
  "Luxury Goods",
];

const state = {
  bootstrap: null,
  status: null,
  fitShipName: null,
  fitLoadout: {},
  fitSourceShipId: null,
  fitSelectedOutfitName: null,
  fitBrowserMode: "ships",
  fitterPane: "ships",
  fitListScopeShipName: null,
  fitShipCategory: "all",
  selectedRouteKey: null,
  selectedRoute: null,
  atlasSelectedSystem: null,
  atlasMapView: null,
  atlasMapDrag: null,
  atlasSuppressClickUntil: 0,
  atlasMapAnimationFrame: null,
  atlasMapProjectionKey: null,
  atlasPendingFocus: null,
  atlasAllBounds: null,
  atlasMapVisualEntries: [],
  activePage: "planner",
  debugMode: false,
  showAllStandings: false,
  debugGameClosed: false,
  debugAutoBackup: true,
  debugCreditsDraft: "",
  debugCurrentSystemDraft: "",
  debugCurrentPlanetDraft: "",
  debugFlagshipIndexDraft: "0",
  debugLicenseFilter: "",
  debugReputationFilter: "",
  debugShipFilter: "",
  debugLicensesDraft: [],
  debugReputationDrafts: {},
  debugShipDrafts: {},
  debugVisitedSystemsDraft: "",
  debugVisitedPlanetsDraft: "",
  debugTravelPlanDraft: "",
  debugConditionsDraft: "",
  debugEditorMessage: null,
  debugEditorInitialized: false,
  trackerTravelSyncInFlight: false,
  trackerTravelSyncKey: null,
  savePathPrompted: false,
  pathSetupMode: "recent",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(value) || 0));
}

function formatCredits(value) {
  return `${formatNumber(value)} cr`;
}

function formatSignedNumber(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded >= 0 ? "+" : ""}${formatNumber(rounded)}`;
}

function formatRemaining(value) {
  const rounded = Math.round(Number(value) || 0);
  return rounded >= 0 ? formatNumber(rounded) : `-${formatNumber(Math.abs(rounded))}`;
}

function formatOneDecimal(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function formatTwoDecimals(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(date) {
  if (!date) {
    return "Unknown";
  }
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

function shortDate(date) {
  if (!date) {
    return "Unknown";
  }
  return `${date.day}.${date.month}.${date.year}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "Stable";
  }
  if (seconds < 1) {
    return "<1 s";
  }
  if (seconds < 60) {
    return `${formatOneDecimal(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function formatRequirement(reputation) {
  if (reputation === null || reputation === undefined || Number.isNaN(Number(reputation))) {
    return "No recorded reputation gate";
  }
  return reputation > 0 ? `Requires ${reputation} reputation` : "No recorded reputation gate";
}

function formatSaleLocation(location, options = {}) {
  const includeReputation = options.includeReputation ?? false;
  const bits = [`${location.system} / ${location.planet}`];
  if (includeReputation && location.requiredReputation > 0) {
    bits.push(`rep ${location.requiredReputation}`);
  }
  return bits.join(" · ");
}

function cloneLoadout(loadout) {
  return Object.fromEntries(
    Object.entries(loadout || {}).filter(([, count]) => Number(count) > 0)
  );
}

function loadDebugMode() {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function loadDebugBackupPreference() {
  try {
    return localStorage.getItem(DEBUG_BACKUP_KEY) !== "0";
  } catch {
    return true;
  }
}

function persistDebugMode() {
  try {
    localStorage.setItem(DEBUG_KEY, state.debugMode ? "1" : "0");
  } catch {
  }
}

function persistDebugBackupPreference() {
  try {
    localStorage.setItem(DEBUG_BACKUP_KEY, state.debugAutoBackup ? "1" : "0");
  } catch {
  }
}

function syncModalBodyState() {
  const anyOpen = !fitSaveModal?.hidden || !debugWarningModal?.hidden || !savePathModal?.hidden;
  document.body.classList.toggle("is-modal-open", Boolean(anyOpen));
}

function platformLabel(platform) {
  if (platform === "darwin") {
    return "macOS";
  }
  if (platform === "win32") {
    return "Windows";
  }
  if (platform === "linux") {
    return "Linux";
  }
  return platform || "Unknown";
}

function getSaveInfo() {
  return state.status?.save || state.bootstrap?.save || null;
}

function getGameInfo() {
  return state.status?.game || state.bootstrap?.game || null;
}

function getPlannerSettings() {
  return state.status?.market?.plannerSettings || state.bootstrap?.config || null;
}

function hasActiveSave() {
  return Boolean(getSaveInfo()?.available);
}

function getPathSetupMeta(mode) {
  if (mode === "game") {
    const gameInfo = getGameInfo();
    return {
      title: "Set game folder",
      copy: "Choose the Endless Sky installation folder if automatic game detection does not match this machine.",
      label: "Game folder",
      placeholder: "/path/to/Endless Sky",
      status: gameInfo?.issue || "",
      hints: [...new Set([...(gameInfo?.candidates || [])].filter(Boolean))],
      currentValue: gameInfo?.configuredGameRoot || gameInfo?.root || "",
      browseKind: "game-root",
    };
  }

  const saveInfo = getSaveInfo();
  return {
    title: "Set recent.txt path",
    copy: "Choose Endless Sky recent.txt if automatic save detection does not match this machine.",
    label: "recent.txt",
    placeholder: "/path/to/recent.txt",
    status: saveInfo?.issue || "",
    hints: [...new Set([saveInfo?.defaultRecentPath, ...(saveInfo?.recentCandidates || [])].filter(Boolean))],
    currentValue: saveInfo?.configuredRecentPath || saveInfo?.recentPath || saveInfo?.defaultRecentPath || "",
    browseKind: "recent",
  };
}

function openSavePathModal(mode = "recent", prefillPath = null) {
  if (!savePathModal) {
    return;
  }
  state.savePathPrompted = true;
  state.pathSetupMode = mode;
  const meta = getPathSetupMeta(mode);
  const initialValue = prefillPath || meta.currentValue || "";
  if (savePathTitle) {
    savePathTitle.textContent = meta.title;
  }
  if (savePathCopy) {
    savePathCopy.textContent = meta.copy;
  }
  if (savePathLabel) {
    savePathLabel.textContent = meta.label;
  }
  if (savePathInput) {
    savePathInput.value = initialValue;
    savePathInput.placeholder = meta.placeholder;
  }
  if (savePathStatus) {
    savePathStatus.textContent = meta.status;
  }
  if (savePathHints) {
    savePathHints.innerHTML = meta.hints.length
      ? meta.hints
          .map(
            (hint) =>
              `<button class="tag save-path-hint" data-save-path-hint="${escapeHtml(hint)}" type="button">${escapeHtml(hint)}</button>`
          )
          .join("")
      : "";
  }
  savePathModal.hidden = false;
  syncModalBodyState();
}

function closeSavePathModal() {
  if (!savePathModal) {
    return;
  }
  savePathModal.hidden = true;
  syncModalBodyState();
}

async function applyPathConfig(mode, value, options = {}) {
  const payload = mode === "game"
    ? { gameRootOverride: value }
    : { recentPathOverride: value };
  try {
    const response = await fetch("/api/save-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to save the path.");
    }
    await fetchBootstrap();
    await fetchStatus();
    rerenderAll();
    if (options.closeModal) {
      closeSavePathModal();
    }
    return data;
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }
    return { error: error.message || String(error) };
  }
}

async function submitSavePathConfig() {
  const value = savePathInput?.value?.trim() || "";
  if (!value) {
    savePathInput?.focus();
    return;
  }
  if (savePathSubmit) {
    savePathSubmit.disabled = true;
  }
  if (savePathStatus) {
    savePathStatus.textContent = "Checking path…";
  }
  const result = await applyPathConfig(state.pathSetupMode, value, { closeModal: true });
  if (result?.error && savePathStatus) {
    savePathStatus.textContent = result.error;
  }
  if (savePathSubmit) {
    savePathSubmit.disabled = false;
  }
}

async function clearSavePathConfig() {
  if (savePathStatus) {
    savePathStatus.textContent = "Clearing override…";
  }
  const result = await applyPathConfig(state.pathSetupMode, "", {});
  if (result?.error && savePathStatus) {
    savePathStatus.textContent = result.error;
    return;
  }
  if (!hasActiveSave() || !getGameInfo()?.available) {
    openSavePathModal(state.pathSetupMode);
  } else {
    closeSavePathModal();
  }
}

async function browseSavePath() {
  if (savePathStatus) {
    savePathStatus.textContent = "Opening file picker…";
  }
  if (savePathBrowse) {
    savePathBrowse.disabled = true;
  }
  try {
    let pickedPath = null;
    if (DESKTOP_RUNTIME.isDesktop && DESKTOP_RUNTIME.bridge) {
      pickedPath =
        state.pathSetupMode === "game"
          ? await DESKTOP_RUNTIME.bridge.pickGameRoot()
          : await DESKTOP_RUNTIME.bridge.pickRecentPath();
    } else {
      const response = await fetch("/api/save-config/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: state.pathSetupMode === "game" ? "game-root" : "file" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "The file picker could not be opened.");
      }
      if (data.cancelled) {
        if (savePathStatus) {
          savePathStatus.textContent = "";
        }
        return;
      }
      pickedPath = data.path || null;
    }
    if (!pickedPath) {
      if (savePathStatus) {
        savePathStatus.textContent = "";
      }
      return;
    }
    if (savePathInput) {
      savePathInput.value = pickedPath;
      savePathInput.focus();
    }
    if (savePathStatus) {
      savePathStatus.textContent = "Path selected.";
    }
  } catch (error) {
    if (savePathStatus) {
      savePathStatus.textContent = error.message || String(error);
    }
  } finally {
    if (savePathBrowse) {
      savePathBrowse.disabled = false;
    }
  }
}

function renderSaveSetupBanner() {
  if (!saveSetupBanner) {
    return;
  }
  const saveInfo = getSaveInfo();
  const gameInfo = getGameInfo();
  const cards = [];

  if (saveInfo && !saveInfo.available) {
    cards.push(`
      <div class="save-setup-card">
        <div class="save-setup-copy">
          <div class="save-setup-title">Save file not found</div>
          <div class="save-setup-text">${escapeHtml(saveInfo.issue || "The app could not locate an Endless Sky save from recent.txt.")}</div>
          <div class="save-setup-meta">
            ${saveInfo.recentPath ? `<span class="metric-pill">Recent.txt <strong>${escapeHtml(saveInfo.recentPath)}</strong></span>` : ""}
            ${saveInfo.configPath ? `<span class="metric-pill">Config <strong>${escapeHtml(saveInfo.configPath)}</strong></span>` : ""}
          </div>
          <div class="save-setup-actions">
            <button class="button-secondary" data-setup-open="recent" type="button">Choose recent.txt</button>
          </div>
        </div>
      </div>
    `);
  }

  if (gameInfo && !gameInfo.available) {
    cards.push(`
      <div class="save-setup-card">
        <div class="save-setup-copy">
          <div class="save-setup-title">Game files not found</div>
          <div class="save-setup-text">${escapeHtml(gameInfo.issue || "The app could not locate the Endless Sky installation.")}</div>
          <div class="save-setup-meta">
            ${gameInfo.root ? `<span class="metric-pill">Game root <strong>${escapeHtml(gameInfo.root)}</strong></span>` : ""}
            ${gameInfo.configPath ? `<span class="metric-pill">Config <strong>${escapeHtml(gameInfo.configPath)}</strong></span>` : ""}
          </div>
          <div class="save-setup-actions">
            <button class="button-secondary" data-setup-open="game" type="button">Choose game folder</button>
          </div>
        </div>
      </div>
    `);
  }

  if (!cards.length) {
    saveSetupBanner.hidden = true;
    saveSetupBanner.innerHTML = "";
    return;
  }

  saveSetupBanner.hidden = false;
  saveSetupBanner.innerHTML = cards.join("");
  saveSetupBanner.querySelectorAll("[data-setup-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openSavePathModal(button.dataset.setupOpen === "game" ? "game" : "recent");
    });
  });
}

function openDebugWarningModal() {
  if (!debugWarningModal) {
    return;
  }
  debugWarningModal.hidden = false;
  syncModalBodyState();
}

function closeDebugWarningModal() {
  if (!debugWarningModal) {
    return;
  }
  debugWarningModal.hidden = true;
  syncModalBodyState();
}

function toggleDebugMode() {
  if (state.debugMode) {
    state.debugMode = false;
    persistDebugMode();
    if (state.activePage === "debug") {
      setPage("planner");
    }
    rerenderAll();
    return;
  }
  openDebugWarningModal();
}

function confirmDebugMode() {
  state.debugMode = true;
  persistDebugMode();
  closeDebugWarningModal();
  rerenderAll();
}

function initializeDebugEditorDrafts(force = false) {
  const editor = state.status?.debugEditor;
  if (!editor) {
    return;
  }
  if (state.debugEditorInitialized && !force) {
    return;
  }
  state.debugCreditsDraft = String(editor.safe?.credits ?? 0);
  state.debugCurrentSystemDraft = String(editor.safe?.currentSystem ?? "");
  state.debugCurrentPlanetDraft = String(editor.safe?.currentPlanet ?? "");
  state.debugFlagshipIndexDraft = String(editor.safe?.flagshipIndex ?? 0);
  state.debugLicensesDraft = [...(editor.advanced?.licenses || [])];
  state.debugReputationDrafts = Object.fromEntries(
    (editor.advanced?.reputations || []).map((entry) => [entry.name, String(entry.value)])
  );
  state.debugVisitedSystemsDraft = (editor.advanced?.visitedSystems || []).join("\n");
  state.debugVisitedPlanetsDraft = (editor.advanced?.visitedPlanets || []).join("\n");
  state.debugTravelPlanDraft = (editor.advanced?.travelPlan || []).join("\n");
  state.debugConditionsDraft = (editor.dangerous?.conditions || []).join("\n");
  state.debugShipDrafts = Object.fromEntries(
    (editor.dangerous?.ships || []).map((ship) => [
      ship.saveIndex,
      {
        saveIndex: ship.saveIndex,
        uuid: ship.uuid,
        originalName: ship.name,
        model: ship.model,
        name: ship.name,
        crew: String(ship.crew ?? 0),
        fuel: String(ship.fuel ?? 0),
        shields: String(ship.shields ?? 0),
        hull: String(ship.hull ?? 0),
        system: ship.system || "",
        planet: ship.planet || "",
        parked: Boolean(ship.parked),
      },
    ])
  );
  state.debugEditorInitialized = true;
}

function resetDebugEditorDrafts() {
  state.debugEditorInitialized = false;
  initializeDebugEditorDrafts(true);
}

function renderPrimaryTabs() {
  for (const button of tabButtons) {
    if (button.dataset.pageTarget === "debug") {
      button.hidden = !state.debugMode;
    }
  }
}

function setDebugEditorMessage(type, title, text, detail = "") {
  state.debugEditorMessage = { type, title, text, detail };
}

function clearDebugEditorMessage() {
  state.debugEditorMessage = null;
}

function getDebugLicenseCatalog() {
  const fromWiki = (state.status?.wiki?.licenses || []).map((item) => item.name);
  const fromBootstrap = (state.bootstrap?.outfits || [])
    .filter((item) => item.category === "Licenses")
    .map((item) => item.name);
  const names = new Set([...(state.debugLicensesDraft || []), ...fromWiki, ...fromBootstrap]);
  return [...names].sort((a, b) => a.localeCompare(b));
}

function getDebugLicenseInfo(name) {
  return (state.status?.wiki?.licenses || []).find((item) => item.name === name) || null;
}

function getDebugAdvancedData() {
  return state.status?.debugEditor?.advanced || { licenses: [], reputations: [] };
}

function getDebugDangerousShips() {
  return state.status?.debugEditor?.dangerous?.ships || [];
}

function parseDebugTextareaList(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getDebugComboboxMatches(options, query, limit = 12) {
  const list = [...new Set((options || []).filter(Boolean))];
  const q = String(query || "").trim().toLowerCase();
  const scored = list
    .map((value) => {
      const lower = value.toLowerCase();
      const starts = q && lower.startsWith(q);
      const contains = q && lower.includes(q);
      const rank = !q ? 2 : starts ? 0 : contains ? 1 : 9;
      return { value, rank };
    })
    .filter((entry) => entry.rank < 9)
    .sort((a, b) => a.rank - b.rank || a.value.localeCompare(b.value));
  return scored.slice(0, limit).map((entry) => entry.value);
}

function bindDebugCombobox(input, options, onCommit) {
  if (!input) {
    return;
  }
  const shell = input.closest(".debug-combobox");
  const list = shell?.querySelector(".debug-combobox-list");
  if (!list) {
    return;
  }

  const renderList = () => {
    const matches = getDebugComboboxMatches(options, input.value);
    if (!matches.length) {
      list.hidden = true;
      list.innerHTML = "";
      return;
    }
    list.hidden = false;
    list.innerHTML = matches
      .map(
        (value) =>
          `<button class="debug-combobox-option" type="button" data-debug-combobox-option="${escapeHtml(value)}">${escapeHtml(value)}</button>`
      )
      .join("");
    list.querySelectorAll("[data-debug-combobox-option]").forEach((button) => {
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        input.value = button.dataset.debugComboboxOption || "";
        onCommit(input.value);
        list.hidden = true;
        list.innerHTML = "";
      });
    });
  };

  input.addEventListener("focus", renderList);
  input.addEventListener("input", () => {
    onCommit(input.value);
    renderList();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      list.hidden = true;
      list.innerHTML = "";
    } else if (event.key === "Enter") {
      const first = list.querySelector("[data-debug-combobox-option]");
      if (first) {
        event.preventDefault();
        input.value = first.dataset.debugComboboxOption || input.value;
        onCommit(input.value);
        list.hidden = true;
        list.innerHTML = "";
      }
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      list.hidden = true;
      list.innerHTML = "";
    }, 120);
  });
}

function clampDebugNumber(value, max = null, decimals = 0, allowNegative = false) {
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    numeric = 0;
  }
  if (decimals <= 0) {
    numeric = Math.round(numeric);
  } else {
    const precision = 10 ** decimals;
    numeric = Math.round(numeric * precision) / precision;
  }
  if (max !== null && Number.isFinite(Number(max))) {
    numeric = Math.min(numeric, Number(max));
  }
  return allowNegative ? numeric : Math.max(0, numeric);
}

async function applyDebugSaveEdits(payload, successTitle) {
  try {
    setDebugEditorMessage("info", "Applying changes", "Writing the current save file now.");
    rerenderAll();
    const response = await fetch("/api/save-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Save edit failed.");
    }
    await fetchStatus();
    resetDebugEditorDrafts();
    const detail = result.backupPath
      ? `Backup created at ${result.backupPath}`
      : "No backup file was created for this write.";
    setDebugEditorMessage(
      "success",
      successTitle,
      result.applied?.length ? `Applied: ${result.applied.join(", ")}.` : "No fields were changed.",
      detail
    );
    rerenderAll();
  } catch (error) {
    setDebugEditorMessage(
      "error",
      "Save edit failed",
      error instanceof Error ? error.message : String(error)
    );
    rerenderAll();
  }
}

async function applySafeDebugChanges() {
  const source = state.status?.debugEditor?.safe || {};
  const credits = clampDebugNumber(state.debugCreditsDraft);
  const currentSystem = String(state.debugCurrentSystemDraft || "").trim();
  const currentPlanet = String(state.debugCurrentPlanetDraft || "").trim();
  const flagshipIndex = clampDebugNumber(state.debugFlagshipIndexDraft);
  const changed =
    credits !== Number(source.credits || 0) ||
    currentSystem !== String(source.currentSystem || "") ||
    currentPlanet !== String(source.currentPlanet || "") ||
    flagshipIndex !== Number(source.flagshipIndex || 0);
  if (!changed) {
    setDebugEditorMessage("info", "Nothing to apply", "Safe drafts still match the current save.");
    rerenderAll();
    return;
  }
  await applyDebugSaveEdits(
    {
      level: "safe",
      confirmGameClosed: state.debugGameClosed,
      credits,
      currentSystem,
      currentPlanet,
      flagshipIndex,
    },
    "Safe changes applied"
  );
}

async function applyAdvancedDebugChanges() {
  const source = getDebugAdvancedData();
  const originalLicenses = source.licenses || [];
  const nextLicenses = [...new Set((state.debugLicensesDraft || []).map((name) => String(name).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const reputations = {};
  for (const entry of source.reputations || []) {
    const draftValue = state.debugReputationDrafts[entry.name];
    const normalized = clampDebugNumber(draftValue, null, 2, true);
    if (Math.abs(normalized - Number(entry.value || 0)) > 0.0001) {
      reputations[entry.name] = normalized;
    }
  }
  const visitedSystems = parseDebugTextareaList(state.debugVisitedSystemsDraft);
  const visitedPlanets = parseDebugTextareaList(state.debugVisitedPlanetsDraft);
  const travelPlan = parseDebugTextareaList(state.debugTravelPlanDraft);
  const licensesChanged =
    originalLicenses.length !== nextLicenses.length ||
    originalLicenses.some((name, index) => nextLicenses[index] !== name);
  const visitedSystemsChanged =
    JSON.stringify(visitedSystems) !== JSON.stringify(source.visitedSystems || []);
  const visitedPlanetsChanged =
    JSON.stringify(visitedPlanets) !== JSON.stringify(source.visitedPlanets || []);
  const travelPlanChanged =
    JSON.stringify(travelPlan) !== JSON.stringify(source.travelPlan || []);

  if (
    !licensesChanged &&
    !Object.keys(reputations).length &&
    !visitedSystemsChanged &&
    !visitedPlanetsChanged &&
    !travelPlanChanged
  ) {
    setDebugEditorMessage("info", "Nothing to apply", "Advanced drafts still match the current save.");
    rerenderAll();
    return;
  }

  await applyDebugSaveEdits(
    {
      level: "advanced",
      confirmGameClosed: state.debugGameClosed,
      licenses: nextLicenses,
      reputations,
      visitedSystems,
      visitedPlanets,
      travelPlan,
    },
    "Advanced changes applied"
  );
}

async function applyDangerousDebugChanges() {
  const ships = getDebugDangerousShips();
  const sourceConditions = state.status?.debugEditor?.dangerous?.conditions || [];
  const nextConditions = parseDebugTextareaList(state.debugConditionsDraft);
  const patches = [];
  for (const ship of ships) {
    const draft = state.debugShipDrafts[ship.saveIndex];
    if (!draft) {
      continue;
    }
    const patch = {
      saveIndex: ship.saveIndex,
      uuid: ship.uuid,
      originalName: ship.name,
      name: String(draft.name || "").trim() || ship.name,
      crew: clampDebugNumber(draft.crew, ship.bunks || null),
      fuel: clampDebugNumber(draft.fuel, ship.maxFuel || null),
      shields: clampDebugNumber(draft.shields, ship.maxShields || null),
      hull: clampDebugNumber(draft.hull, ship.maxHull || null),
      system: String(draft.system || "").trim(),
      planet: String(draft.planet || "").trim(),
      parked: Boolean(draft.parked),
    };
    const changed =
      patch.name !== ship.name ||
      patch.crew !== Number(ship.crew || 0) ||
      patch.fuel !== Number(ship.fuel || 0) ||
      patch.shields !== Number(ship.shields || 0) ||
      patch.hull !== Number(ship.hull || 0) ||
      patch.system !== String(ship.system || "") ||
      patch.planet !== String(ship.planet || "") ||
      patch.parked !== Boolean(ship.parked);
    if (changed) {
      patches.push(patch);
    }
  }

  const conditionsChanged = JSON.stringify(nextConditions) !== JSON.stringify(sourceConditions);

  if (!patches.length && !conditionsChanged) {
    setDebugEditorMessage("info", "Nothing to apply", "Dangerous drafts still match the current save.");
    rerenderAll();
    return;
  }

  await applyDebugSaveEdits(
    {
      level: "dangerous",
      confirmGameClosed: state.debugGameClosed,
      createBackup: state.debugAutoBackup,
      ships: patches,
      conditions: nextConditions,
    },
    "Dangerous changes applied"
  );
}

function renderDebugEditor() {
  if (!debugEditorWarning || !debugEditorSettings || !debugSafeEditor || !debugAdvancedEditor || !debugDangerousEditor) {
    return;
  }
  if (!state.debugMode || !state.status?.debugEditor) {
    debugEditorWarning.innerHTML = "";
    debugEditorSettings.innerHTML = "";
    debugSafeEditor.innerHTML = "";
    debugAdvancedEditor.innerHTML = "";
    debugDangerousEditor.innerHTML = "";
    if (debugEditorStatus) {
      debugEditorStatus.hidden = true;
      debugEditorStatus.innerHTML = "";
    }
    return;
  }

  initializeDebugEditorDrafts();

  const canApply = state.debugGameClosed;
  const editor = state.status.debugEditor;
  const advanced = getDebugAdvancedData();
  const dangerousShips = getDebugDangerousShips();
  const licenseFilter = state.debugLicenseFilter.trim().toLowerCase();
  const reputationFilter = state.debugReputationFilter.trim().toLowerCase();
  const shipFilter = state.debugShipFilter.trim().toLowerCase();
  const allSystems = (state.bootstrap?.map?.systems || []).map((system) => system.name).sort((a, b) => a.localeCompare(b));
  const allPlanets = (state.bootstrap?.map?.planets || []).map((planet) => planet.name).sort((a, b) => a.localeCompare(b));
  const flagshipOptions = dangerousShips
    .map(
      (ship, index) => `<option value="${index}" ${Number(state.debugFlagshipIndexDraft) === index ? "selected" : ""}>${escapeHtml(ship.name)} · ${escapeHtml(ship.model)}</option>`
    )
    .join("");

  const licenseRows = getDebugLicenseCatalog()
    .filter((name) => !licenseFilter || name.toLowerCase().includes(licenseFilter))
    .map((name) => {
      const checked = state.debugLicensesDraft.includes(name);
      const info = getDebugLicenseInfo(name);
      const stateCopy = checked ? "Owned in draft" : info?.owned ? "Owned now" : "Locked";
      const stateClass = checked ? "is-owned" : info?.owned ? "is-present" : "is-locked";
      return `
        <label class="debug-check-row debug-license-row">
          <input type="checkbox" data-debug-license="${escapeHtml(name)}" ${checked ? "checked" : ""} />
          <span class="debug-check-body">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(stateCopy)}</small>
          </span>
          <span class="debug-license-state ${stateClass}">${escapeHtml(checked ? "Owned" : info?.owned ? "Live" : "Locked")}</span>
        </label>
      `;
    })
    .join("");

  const reputationRows = (advanced.reputations || [])
    .filter((entry) => !reputationFilter || entry.name.toLowerCase().includes(reputationFilter))
    .map((entry) => {
      const value = state.debugReputationDrafts[entry.name] ?? entry.value;
      return `
        <label class="debug-inline-row">
          <span class="debug-inline-label">${escapeHtml(entry.name)}</span>
          <input
            type="number"
            step="0.01"
            value="${escapeHtml(String(value))}"
            data-debug-reputation="${escapeHtml(entry.name)}"
          />
        </label>
      `;
    })
    .join("");

  const shipCards = dangerousShips
    .filter((ship) => {
      if (!shipFilter) {
        return true;
      }
      const haystack = `${ship.name} ${ship.model} ${ship.system || ""} ${ship.planet || ""}`.toLowerCase();
      return haystack.includes(shipFilter);
    })
    .map((ship) => {
      const draft = state.debugShipDrafts[ship.saveIndex] || {};
      return `
        <article class="debug-ship-card">
          <div class="debug-ship-head">
            <div>
              <div class="debug-ship-title">${escapeHtml(ship.name)}</div>
              <div class="debug-ship-subtitle">${escapeHtml(ship.model)} · ${escapeHtml(ship.system || "In space")}${ship.planet ? ` / ${escapeHtml(ship.planet)}` : ""}</div>
            </div>
            <div class="debug-chip-row">
              <span class="debug-chip">${ship.parked ? "Parked" : "Active"}</span>
              <span class="debug-chip">Crew ${formatNumber(ship.requiredCrew)} / ${formatNumber(ship.bunks)}</span>
              <span class="debug-chip">Fuel ${formatNumber(ship.maxFuel)}</span>
            </div>
          </div>
          <div class="debug-form-grid debug-form-grid-ship">
            <label class="field">
              <span>Name</span>
              <input type="text" value="${escapeHtml(String(draft.name ?? ship.name))}" data-debug-ship-field="${ship.saveIndex}:name" />
            </label>
            <label class="field">
              <span>System</span>
              <div class="debug-combobox">
                <input type="text" value="${escapeHtml(String(draft.system ?? ship.system ?? ""))}" data-debug-ship-field="${ship.saveIndex}:system" autocomplete="off" />
                <div class="debug-combobox-list" hidden></div>
              </div>
            </label>
            <label class="field">
              <span>Planet</span>
              <div class="debug-combobox">
                <input type="text" value="${escapeHtml(String(draft.planet ?? ship.planet ?? ""))}" data-debug-ship-field="${ship.saveIndex}:planet" autocomplete="off" />
                <div class="debug-combobox-list" hidden></div>
              </div>
            </label>
            <label class="field debug-check-field">
              <span>Parked</span>
              <label class="debug-check-row debug-check-row-inline">
                <input type="checkbox" data-debug-ship-field="${ship.saveIndex}:parked" ${draft.parked ? "checked" : ""} />
                <span class="debug-check-body">
                  <strong>${draft.parked ? "Yes" : "No"}</strong>
                  <small>Stored instead of active</small>
                </span>
              </label>
            </label>
            <label class="field">
              <span>Crew</span>
              <input type="number" min="0" max="${escapeHtml(String(ship.bunks || 0))}" value="${escapeHtml(String(draft.crew ?? ship.crew ?? 0))}" data-debug-ship-field="${ship.saveIndex}:crew" />
            </label>
            <label class="field">
              <span>Fuel</span>
              <input type="number" min="0" max="${escapeHtml(String(ship.maxFuel || 0))}" value="${escapeHtml(String(draft.fuel ?? ship.fuel ?? 0))}" data-debug-ship-field="${ship.saveIndex}:fuel" />
            </label>
            <label class="field">
              <span>Shields</span>
              <input type="number" min="0" max="${escapeHtml(String(ship.maxShields || 0))}" value="${escapeHtml(String(draft.shields ?? ship.shields ?? 0))}" data-debug-ship-field="${ship.saveIndex}:shields" />
            </label>
            <label class="field">
              <span>Hull</span>
              <input type="number" min="0" max="${escapeHtml(String(ship.maxHull || 0))}" value="${escapeHtml(String(draft.hull ?? ship.hull ?? 0))}" data-debug-ship-field="${ship.saveIndex}:hull" />
            </label>
          </div>
        </article>
      `;
    })
    .join("");

  debugEditorWarning.innerHTML = `
    <div class="debug-warning-copy">
      <strong>Close Endless Sky before applying changes.</strong>
      <span>If the game is still open, the save can be overwritten and your edits may disappear.</span>
    </div>
  `;

  debugEditorSettings.innerHTML = `
    <div class="debug-settings-grid">
      <div class="debug-settings-meta">
        <div class="debug-settings-title">Current save</div>
        <code>${escapeHtml(editor.savePath || "")}</code>
      </div>
      <label class="debug-check-row">
        <input id="debug-confirm-closed" type="checkbox" ${state.debugGameClosed ? "checked" : ""} />
        <span class="debug-check-body">
          <strong>Endless Sky is closed</strong>
          <small>Required before any write can be applied.</small>
        </span>
      </label>
      <label class="debug-check-row">
        <input id="debug-auto-backup" type="checkbox" ${state.debugAutoBackup ? "checked" : ""} />
        <span class="debug-check-body">
          <strong>Create a backup before dangerous edits</strong>
          <small>Writes a timestamped copy next to the save file.</small>
        </span>
      </label>
      <div class="debug-settings-actions">
        <button id="debug-reload-drafts" class="button-secondary" type="button">Reload from save</button>
      </div>
    </div>
  `;

  if (debugEditorStatus) {
    if (!state.debugEditorMessage) {
      debugEditorStatus.hidden = true;
      debugEditorStatus.innerHTML = "";
    } else {
      const message = state.debugEditorMessage;
      debugEditorStatus.hidden = false;
      debugEditorStatus.className = `debug-status-box is-${message.type || "info"}`;
      debugEditorStatus.innerHTML = `
        <div class="debug-status-title">${escapeHtml(message.title || "Status")}</div>
        <div class="debug-status-copy">${escapeHtml(message.text || "")}</div>
        ${message.detail ? `<div class="debug-status-detail">${escapeHtml(message.detail)}</div>` : ""}
      `;
    }
  }

  debugSafeEditor.innerHTML = `
    <div class="debug-form-grid">
      <label class="field field-grow">
        <span>Credits</span>
        <input id="debug-credits-input" type="number" min="0" step="1" value="${escapeHtml(state.debugCreditsDraft)}" />
      </label>
      <label class="field">
        <span>Current system</span>
        <div class="debug-combobox">
          <input id="debug-current-system" type="text" value="${escapeHtml(state.debugCurrentSystemDraft)}" autocomplete="off" />
          <div class="debug-combobox-list" hidden></div>
        </div>
      </label>
      <label class="field">
        <span>Current planet</span>
        <div class="debug-combobox">
          <input id="debug-current-planet" type="text" value="${escapeHtml(state.debugCurrentPlanetDraft)}" autocomplete="off" />
          <div class="debug-combobox-list" hidden></div>
        </div>
      </label>
      <label class="field">
        <span>Flagship</span>
        <div class="select-shell">
          <select id="debug-flagship-index">${flagshipOptions}</select>
        </div>
      </label>
    </div>
    <div class="debug-section-actions">
      <button id="debug-apply-safe" class="button-primary" type="button" ${canApply ? "" : "disabled"}>Apply safe changes</button>
    </div>
  `;

  debugAdvancedEditor.innerHTML = `
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Licenses</h3>
        <p>Toggle owned licenses in the current save.</p>
      </div>
      <label class="field">
        <span>Find license</span>
        <input id="debug-license-filter" type="search" placeholder="Pilot's, Navy, City-Ship…" value="${escapeHtml(state.debugLicenseFilter)}" />
      </label>
      <div class="debug-license-list">
        ${licenseRows || `<div class="empty-state">No licenses matched this filter.</div>`}
      </div>
    </div>
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Reputations</h3>
        <p>Edit faction standings directly.</p>
      </div>
      <label class="field">
        <span>Find faction</span>
        <input id="debug-reputation-filter" type="search" placeholder="Republic, Pirate, Hai…" value="${escapeHtml(state.debugReputationFilter)}" />
      </label>
      <div class="debug-reputation-list">
        ${reputationRows || `<div class="empty-state">No faction standings matched this filter.</div>`}
      </div>
    </div>
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Visited systems</h3>
        <p>One system per line. These affect what the live map and wiki consider opened.</p>
      </div>
      <label class="field">
        <span>Visited systems</span>
        <textarea id="debug-visited-systems" class="modal-textarea debug-textarea-mono" placeholder="Sol&#10;Sirius&#10;Phecda">${escapeHtml(state.debugVisitedSystemsDraft)}</textarea>
      </label>
    </div>
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Visited planets</h3>
        <p>One planet per line.</p>
      </div>
      <label class="field">
        <span>Visited planets</span>
        <textarea id="debug-visited-planets" class="modal-textarea debug-textarea-mono" placeholder="Earth&#10;New Sahara">${escapeHtml(state.debugVisitedPlanetsDraft)}</textarea>
      </label>
    </div>
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Travel plan</h3>
        <p>One destination system per line in the current route queue.</p>
      </div>
      <label class="field">
        <span>Travel plan</span>
        <textarea id="debug-travel-plan" class="modal-textarea debug-textarea-mono" placeholder="Sirius&#10;Deneb">${escapeHtml(state.debugTravelPlanDraft)}</textarea>
      </label>
    </div>
    <div class="debug-section-actions">
      <button id="debug-apply-advanced" class="button-primary" type="button" ${canApply ? "" : "disabled"}>Apply advanced changes</button>
    </div>
  `;

  debugDangerousEditor.innerHTML = `
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Ships</h3>
        <p>Edit direct ship state. This can break saves if you enter nonsense.</p>
      </div>
      <label class="field">
        <span>Find ship</span>
        <input id="debug-ship-filter" type="search" placeholder="Leviathan, Wise, parked…" value="${escapeHtml(state.debugShipFilter)}" />
      </label>
      <div class="debug-ship-list">
        ${shipCards || `<div class="empty-state">No ships matched this filter.</div>`}
      </div>
    </div>
    <div class="debug-subsection">
      <div class="debug-subsection-head">
        <h3>Condition flags</h3>
        <p>Raw save conditions. One entry per line. This is where many story and world-state switches live.</p>
      </div>
      <label class="field">
        <span>Conditions</span>
        <textarea id="debug-conditions" class="modal-textarea debug-textarea-mono debug-conditions-textarea" placeholder="event: war begins&#10;wormhole alpha found">${escapeHtml(state.debugConditionsDraft)}</textarea>
      </label>
    </div>
    <div class="debug-section-actions">
      <button id="debug-apply-dangerous" class="button-primary" type="button" ${canApply ? "" : "disabled"}>Apply dangerous changes</button>
    </div>
  `;

  debugEditorSettings.querySelector("#debug-confirm-closed")?.addEventListener("change", (event) => {
    state.debugGameClosed = Boolean(event.target.checked);
    clearDebugEditorMessage();
    rerenderAll();
  });
  debugEditorSettings.querySelector("#debug-auto-backup")?.addEventListener("change", (event) => {
    state.debugAutoBackup = Boolean(event.target.checked);
    persistDebugBackupPreference();
    clearDebugEditorMessage();
    rerenderAll();
  });
  debugEditorSettings.querySelector("#debug-reload-drafts")?.addEventListener("click", async () => {
    clearDebugEditorMessage();
    await fetchStatus();
    resetDebugEditorDrafts();
    setDebugEditorMessage("success", "Drafts reloaded", "Debug fields were reset from the current save file.");
    rerenderAll();
  });

  debugSafeEditor.querySelector("#debug-credits-input")?.addEventListener("input", (event) => {
    state.debugCreditsDraft = event.target.value;
  });
  debugSafeEditor.querySelector("#debug-current-system")?.addEventListener("input", (event) => {
    state.debugCurrentSystemDraft = event.target.value;
  });
  debugSafeEditor.querySelector("#debug-current-planet")?.addEventListener("input", (event) => {
    state.debugCurrentPlanetDraft = event.target.value;
  });
  debugSafeEditor.querySelector("#debug-flagship-index")?.addEventListener("change", (event) => {
    state.debugFlagshipIndexDraft = event.target.value;
  });
  bindDebugCombobox(
    debugSafeEditor.querySelector("#debug-current-system"),
    allSystems,
    (value) => {
      state.debugCurrentSystemDraft = value;
    }
  );
  bindDebugCombobox(
    debugSafeEditor.querySelector("#debug-current-planet"),
    allPlanets,
    (value) => {
      state.debugCurrentPlanetDraft = value;
    }
  );
  debugSafeEditor.querySelector("#debug-apply-safe")?.addEventListener("click", applySafeDebugChanges);

  debugAdvancedEditor.querySelector("#debug-license-filter")?.addEventListener("input", (event) => {
    state.debugLicenseFilter = event.target.value;
    renderDebugEditor();
  });
  debugAdvancedEditor.querySelectorAll("[data-debug-license]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const name = event.target.dataset.debugLicense;
      if (!name) {
        return;
      }
      if (event.target.checked) {
        if (!state.debugLicensesDraft.includes(name)) {
          state.debugLicensesDraft = [...state.debugLicensesDraft, name].sort((a, b) => a.localeCompare(b));
        }
      } else {
        state.debugLicensesDraft = state.debugLicensesDraft.filter((entry) => entry !== name);
      }
    });
  });
  debugAdvancedEditor.querySelector("#debug-reputation-filter")?.addEventListener("input", (event) => {
    state.debugReputationFilter = event.target.value;
    renderDebugEditor();
  });
  debugAdvancedEditor.querySelectorAll("[data-debug-reputation]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const name = event.target.dataset.debugReputation;
      if (!name) {
        return;
      }
      state.debugReputationDrafts[name] = event.target.value;
    });
  });
  debugAdvancedEditor.querySelector("#debug-visited-systems")?.addEventListener("input", (event) => {
    state.debugVisitedSystemsDraft = event.target.value;
  });
  debugAdvancedEditor.querySelector("#debug-visited-planets")?.addEventListener("input", (event) => {
    state.debugVisitedPlanetsDraft = event.target.value;
  });
  debugAdvancedEditor.querySelector("#debug-travel-plan")?.addEventListener("input", (event) => {
    state.debugTravelPlanDraft = event.target.value;
  });
  debugAdvancedEditor.querySelector("#debug-apply-advanced")?.addEventListener("click", applyAdvancedDebugChanges);

  debugDangerousEditor.querySelector("#debug-ship-filter")?.addEventListener("input", (event) => {
    state.debugShipFilter = event.target.value;
    renderDebugEditor();
  });
  debugDangerousEditor.querySelectorAll("[data-debug-ship-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const [saveIndex, field] = String(event.target.dataset.debugShipField || "").split(":");
      if (!field || !Object.prototype.hasOwnProperty.call(state.debugShipDrafts, saveIndex)) {
        return;
      }
      state.debugShipDrafts[saveIndex] = {
        ...state.debugShipDrafts[saveIndex],
        [field]: input.type === "checkbox" ? Boolean(input.checked) : input.value,
      };
    });
    if (input.type === "checkbox") {
      input.addEventListener("change", (event) => {
        const [saveIndex, field] = String(event.target.dataset.debugShipField || "").split(":");
        if (!field || !Object.prototype.hasOwnProperty.call(state.debugShipDrafts, saveIndex)) {
          return;
        }
        state.debugShipDrafts[saveIndex] = {
          ...state.debugShipDrafts[saveIndex],
          [field]: Boolean(input.checked),
        };
        renderDebugEditor();
      });
    }
  });
  debugDangerousEditor.querySelectorAll('[data-debug-ship-field$=":system"]').forEach((input) => {
    bindDebugCombobox(input, allSystems, (value) => {
      const [saveIndex] = String(input.dataset.debugShipField || "").split(":");
      if (!Object.prototype.hasOwnProperty.call(state.debugShipDrafts, saveIndex)) {
        return;
      }
      state.debugShipDrafts[saveIndex] = {
        ...state.debugShipDrafts[saveIndex],
        system: value,
      };
    });
  });
  debugDangerousEditor.querySelectorAll('[data-debug-ship-field$=":planet"]').forEach((input) => {
    bindDebugCombobox(input, allPlanets, (value) => {
      const [saveIndex] = String(input.dataset.debugShipField || "").split(":");
      if (!Object.prototype.hasOwnProperty.call(state.debugShipDrafts, saveIndex)) {
        return;
      }
      state.debugShipDrafts[saveIndex] = {
        ...state.debugShipDrafts[saveIndex],
        planet: value,
      };
    });
  });
  debugDangerousEditor.querySelector("#debug-conditions")?.addEventListener("input", (event) => {
    state.debugConditionsDraft = event.target.value;
  });
  debugDangerousEditor.querySelector("#debug-apply-dangerous")?.addEventListener("click", applyDangerousDebugChanges);
}

function getOwnedShipsRaw() {
  return [
    ...(state.status?.fleet?.activeShips || []),
    ...(state.status?.fleet?.parkedShips || []),
  ];
}

function getOwnedShipModelNames() {
  return new Set(getOwnedShipsRaw().map((ship) => ship.model));
}

function getInstalledOutfitNames() {
  const names = new Set();
  for (const ship of getOwnedShipsRaw()) {
    for (const outfitName of Object.keys(ship.outfits || {})) {
      names.add(outfitName);
    }
  }
  return names;
}

function getOutfitWikiMap() {
  return Object.fromEntries((state.status?.wiki?.outfits || []).map((outfit) => [outfit.name, outfit]));
}

function getOutfitWiki(outfitName) {
  return getOutfitWikiMap()[outfitName] || null;
}

function getProgressAvailableOutfitNames() {
  const names = new Set();
  for (const outfit of state.status?.wiki?.outfits || []) {
    if (outfit.progressSaleLocations?.length) {
      names.add(outfit.name);
    }
  }
  return names;
}

function canShipEverUseOutfit(shipName, outfitName) {
  const ship = getShipDefinition(shipName);
  const outfit = getOutfitDefinition(outfitName);
  if (!ship || !outfit) {
    return false;
  }

  const attr = outfit.attributes || {};
  const requiredOutfit = Math.max(0, -(attr.outfitSpace || 0));
  const requiredWeapon = Math.max(0, -(attr.weaponCapacity || 0));
  const requiredEngine = Math.max(0, -(attr.engineCapacity || 0));
  const requiredGuns = Math.max(0, -(attr.gunPorts || 0));
  const requiredTurrets = Math.max(0, -(attr.turretMounts || 0));

  if (requiredOutfit > ship.attributes.outfitSpace) {
    return false;
  }
  if (requiredWeapon > ship.attributes.weaponCapacity) {
    return false;
  }
  if (requiredEngine > ship.attributes.engineCapacity) {
    return false;
  }
  if (requiredGuns > ship.attributes.gunPorts) {
    return false;
  }
  if (requiredTurrets > ship.attributes.turretMounts) {
    return false;
  }
  if (outfit.slotType === "gun" && ship.attributes.gunPorts <= 0) {
    return false;
  }
  if (outfit.slotType === "turret" && ship.attributes.turretMounts <= 0) {
    return false;
  }
  return true;
}

function isRouteAccessible(route) {
  return !route?.access || route.access.status === "open";
}

function isRouteKnownInLive(route) {
  if (state.debugMode) {
    return true;
  }
  const known = getLiveKnownSystemNames();
  const names = [route?.origin, route?.destination].filter(Boolean);
  return names.every((name) => known.has(name));
}

function filterPlannerRoutesForMode(routes = []) {
  return routes.filter((route) => isRouteKnownInLive(route));
}

function splitRoutesByAccess(routes = []) {
  const visibleRoutes = filterPlannerRoutesForMode(routes);
  return {
    safe: visibleRoutes.filter((route) =>
      ["open", "gated", "unfriendly"].includes(route?.access?.status || "open")
    ),
    risky: visibleRoutes.filter((route) =>
      ["blocked", "unknown"].includes(route?.access?.status || "open")
    ),
    hiddenInLive: Math.max(0, routes.length - visibleRoutes.length),
  };
}

function setPage(page) {
  if (page === "debug" && !state.debugMode) {
    state.activePage = "planner";
  } else {
    state.activePage = pages[page] ? page : "planner";
  }
  document.body.dataset.page = state.activePage;
  const pageMeta = {
    planner: {
      title: "Planner",
      subtitle: "Route selection, market deltas, and loop execution for the active save.",
    },
    atlas: {
      title: "Map",
      subtitle: "Systems, prices, and live shipyard state pulled from the current save.",
    },
    wiki: {
      title: "Wiki",
      subtitle: "Spoiler-safe chapters built from the active save, visited worlds, and opened market data.",
    },
    settings: {
      title: "Settings",
      subtitle: "Local save and game-data configuration for this machine.",
    },
    debug: {
      title: "Debug",
      subtitle: "Direct save editing for the active commander. Close the game before applying changes.",
    },
    fleet: {
      title: "Fleet",
      subtitle: "Cargo, licenses, standings, and the current roster from the active commander.",
    },
    fitter: {
      title: "Fitter",
      subtitle: "Build against live ship data with game limits, sale info, and installed loadouts.",
    },
  }[state.activePage];
  if (pageMeta) {
    pageTitle.textContent = pageMeta.title;
    pageSubtitle.textContent = pageMeta.subtitle;
    document.title = `Endless Sky ${pageMeta.title}`;
  }
  if (location.hash !== `#${state.activePage}`) {
    history.replaceState(null, "", `#${state.activePage}`);
  }
  for (const [name, element] of Object.entries(pages)) {
    element.classList.toggle("is-active", name === state.activePage);
  }
  renderPrimaryTabs();
  for (const button of tabButtons) {
    button.classList.toggle("is-active", button.dataset.pageTarget === state.activePage);
  }
  if (state.activePage === "atlas") {
    requestAnimationFrame(() => renderAtlas());
  } else if (state.activePage === "planner") {
    requestAnimationFrame(() => renderMap());
  }
}

function syncPageFromHash() {
  const requested = location.hash.replace(/^#/, "");
  setPage(requested || "planner");
}

function getShipMap() {
  return Object.fromEntries((state.bootstrap?.ships || []).map((ship) => [ship.name, ship]));
}

function getOutfitMap() {
  return Object.fromEntries((state.bootstrap?.outfits || []).map((outfit) => [outfit.name, outfit]));
}

function getSystemsMap() {
  return Object.fromEntries((state.bootstrap?.map?.systems || []).map((system) => [system.name, system]));
}

function getPlanetMap() {
  return Object.fromEntries((state.status?.wiki?.planets || []).map((planet) => [planet.name, planet]));
}

function getBasePlanetMap() {
  return Object.fromEntries((state.bootstrap?.map?.planets || []).map((planet) => [planet.name, planet]));
}

function getShipDefinition(shipName) {
  return getShipMap()[shipName] || null;
}

function getOutfitDefinition(outfitName) {
  return getOutfitMap()[outfitName] || null;
}

function getStockLoadout(shipName) {
  return cloneLoadout(getShipDefinition(shipName)?.stockOutfits || {});
}

function getSlotTypeLabel(slotType) {
  return (
    {
      gun: "Guns",
      turret: "Turrets",
      engine: "Engines",
      system: "Systems",
    }[slotType] || "Systems"
  );
}

function getFitCategoryOrder(category) {
  const index = FIT_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? FIT_CATEGORY_ORDER.length : index;
}

function getCatalogSection(category) {
  if (category === "Guns" || category === "Turrets" || category === "Secondary Weapons" || category === "Ammunition") {
    return category;
  }
  if (category === "Hand to Hand") {
    return "Hand to Hand";
  }
  return "Systems";
}

function loadShipIntoFitter(shipName, loadout = null, sourceShipId = null) {
  state.fitShipName = shipName;
  state.fitLoadout = cloneLoadout(loadout || getStockLoadout(shipName));
  state.fitSourceShipId = sourceShipId;
  state.fitSelectedOutfitName = null;
  state.fitListScopeShipName = shipName;
  setPage("fitter");
  renderFitter();
}

function normalizeShipDisplayShip(shipRecord) {
  const shipDef = getShipDefinition(shipRecord.model);
  return {
    ...shipRecord,
    thumbnailUrl: shipDef?.thumbnailUrl || null,
    spriteUrl: shipDef?.spriteUrl || null,
    category: shipDef?.category || "Ship",
  };
}

function getWeaponCycleFrames(attributes) {
  const reload = Math.max(1, Number(attributes.reload) || 1);
  const burstCount = Math.max(1, Number(attributes.burstCount) || 1);
  const burstReload = Math.max(0, Number(attributes.burstReload) || 0);
  return burstCount > 1 ? burstCount * reload + burstReload : reload;
}

function coolingEfficiency(value) {
  const x = Number(value) || 0;
  return 2 + 2 / (1 + Math.exp(x / -2)) - 4 / (1 + Math.exp(x / -4));
}

function simulateScenario(summary, scenario) {
  const maxHeat = Math.max(1, summary.maximumHeat);
  const efficiency = coolingEfficiency(summary.coolingInefficiency);
  const passiveCooling = efficiency * summary.cooling;
  const activeCooling = efficiency * summary.activeCooling;
  let energy = Math.max(0, summary.energyCapacity);
  let fuel = Math.max(0, summary.fuelCapacity);
  let heat = Math.max(0, summary.idleHeat);
  let batteryEmptyAt = null;
  let overheatedAt = null;
  let fuelEmptyAt = null;

  for (let frame = 1; frame <= MAX_SIMULATION_FRAMES; frame += 1) {
    energy = Math.min(energy, summary.energyCapacity);
    fuel = Math.min(fuel, summary.fuelCapacity);
    heat = Math.max(0, heat - heat * summary.heatDissipation);

    energy += summary.energyGeneration - summary.energyConsumption;
    fuel += summary.fuelGeneration;
    heat += summary.heatGeneration;
    heat -= passiveCooling;

    if (summary.fuelConsumption <= fuel) {
      fuel -= summary.fuelConsumption;
      energy += summary.fuelEnergy;
      heat += summary.fuelHeat;
    }

    if (activeCooling > 0 && heat > 0 && energy >= 0) {
      const heatFraction = Math.min(1, heat / maxHeat);
      if (summary.coolingEnergy > 0) {
        const spentEnergy = Math.min(energy, summary.coolingEnergy * heatFraction);
        heat -= activeCooling * spentEnergy / summary.coolingEnergy;
        energy -= spentEnergy;
      } else {
        heat -= activeCooling * heatFraction;
      }
    }

    if (scenario.useShields) {
      energy -= summary.shieldEnergy;
      heat += summary.shieldHeat;
    }
    if (scenario.useThrust) {
      energy -= summary.thrustingEnergy;
      heat += summary.thrustingHeat;
    }
    if (scenario.useTurn) {
      energy -= summary.turningEnergy;
      heat += summary.turningHeat;
    }
    if (scenario.useFire) {
      energy -= summary.firingEnergyPerFrame;
      fuel -= summary.firingFuelPerFrame;
      heat += summary.firingHeatPerFrame;
    }

    if (batteryEmptyAt === null && energy <= 0 && scenario.energyDemand > 0) {
      batteryEmptyAt = frame / FRAMES_PER_SECOND;
    }
    if (fuelEmptyAt === null && fuel <= 0 && scenario.fuelDemand > 0) {
      fuelEmptyAt = frame / FRAMES_PER_SECOND;
    }
    if (overheatedAt === null && heat > maxHeat) {
      overheatedAt = frame / FRAMES_PER_SECOND;
      break;
    }

    energy = Math.max(0, energy);
    fuel = Math.max(0, fuel);
    heat = Math.max(0, heat);
  }

  return {
    batteryEmptyAt,
    fuelEmptyAt,
    overheatedAt,
  };
}

function buildSustainReport(summary) {
  const scenarios = [
    {
      key: "idle",
      label: "Idle",
      useShields: false,
      useThrust: false,
      useTurn: false,
      useFire: false,
    },
    {
      key: "cruise",
      label: "Cruise",
      useShields: false,
      useThrust: true,
      useTurn: false,
      useFire: false,
    },
    {
      key: "firing",
      label: "Firing",
      useShields: false,
      useThrust: false,
      useTurn: false,
      useFire: true,
    },
    {
      key: "combat",
      label: "Combat",
      useShields: true,
      useThrust: true,
      useTurn: false,
      useFire: true,
    },
  ].map((scenario) => {
    const energyDemand =
      (scenario.useShields ? summary.shieldEnergy : 0) +
      (scenario.useThrust ? summary.thrustingEnergy : 0) +
      (scenario.useTurn ? summary.turningEnergy : 0) +
      (scenario.useFire ? summary.firingEnergyPerFrame : 0);
    const fuelDemand =
      (scenario.useFire ? summary.firingFuelPerFrame : 0) + summary.fuelConsumption;
    const generationNet =
      summary.energyGeneration +
      summary.fuelEnergy -
      summary.energyConsumption -
      energyDemand;

    const simulation = simulateScenario(summary, {
      ...scenario,
      energyDemand,
      fuelDemand,
    });

    return {
      ...scenario,
      energyNet: generationNet,
      batteryEmptyAt: simulation.batteryEmptyAt,
      fuelEmptyAt: simulation.fuelEmptyAt,
      overheatedAt: simulation.overheatedAt,
    };
  });

  const combat = scenarios.find((item) => item.key === "combat");
  return {
    scenarios,
    combat,
  };
}

function summarizeFit(shipName, rawLoadout, options = {}) {
  const includeSustain = options.includeSustain ?? true;
  const ship = getShipDefinition(shipName);
  if (!ship) {
    return null;
  }

  const loadout = cloneLoadout(rawLoadout);
  const stats = {
    shipName,
    valid: true,
    warnings: [],
    loadout,
    cargoSpace: ship.attributes.cargoSpace,
    fuelCapacity: ship.attributes.fuelCapacity,
    bunks: ship.attributes.bunks,
    requiredCrew: ship.attributes.requiredCrew,
    mass: ship.attributes.mass,
    drag: ship.attributes.drag,
    shields: ship.attributes.shields,
    hull: ship.attributes.hull,
    heatDissipation: (ship.attributes.heatDissipation || 0) * 0.001,
    heatCapacity: ship.attributes.heatCapacity || 0,
    coolingInefficiency: ship.attributes.coolingInefficiency || 0,
    freeOutfit: ship.attributes.outfitSpace,
    freeWeapon: ship.attributes.weaponCapacity,
    freeEngine: ship.attributes.engineCapacity,
    freeGunPorts: ship.attributes.gunPorts,
    freeTurretMounts: ship.attributes.turretMounts,
    thrust: 0,
    turn: 0,
    reverseThrust: 0,
    cooling: ship.attributes.cooling || 0,
    activeCooling: ship.attributes.activeCooling || 0,
    coolingEnergy: ship.attributes.coolingEnergy || 0,
    energyGeneration: ship.attributes.energyGeneration || 0,
    energyConsumption: ship.attributes.energyConsumption || 0,
    solarCollection: ship.attributes.solarCollection || 0,
    solarHeat: ship.attributes.solarHeat || 0,
    fuelGeneration: 0,
    fuelEnergy: 0,
    fuelConsumption: 0,
    fuelHeat: 0,
    heatGeneration: ship.attributes.heatGeneration || 0,
    energyCapacity: 0,
    shieldGeneration: 0,
    shieldEnergy: 0,
    shieldHeat: 0,
    delayedShieldEnergy: ship.attributes.delayedShieldEnergy || 0,
    delayedShieldHeat: ship.attributes.delayedShieldHeat || 0,
    shieldEnergyMultiplier: ship.attributes.shieldEnergyMultiplier || 0,
    shieldHeatMultiplier: ship.attributes.shieldHeatMultiplier || 0,
    hullEnergy: ship.attributes.hullEnergy || 0,
    hullHeat: ship.attributes.hullHeat || 0,
    delayedHullEnergy: ship.attributes.delayedHullEnergy || 0,
    delayedHullHeat: ship.attributes.delayedHullHeat || 0,
    hullEnergyMultiplier: ship.attributes.hullEnergyMultiplier || 0,
    hullHeatMultiplier: ship.attributes.hullHeatMultiplier || 0,
    radarJamming: 0,
    opticalJamming: 0,
    infraredJamming: 0,
    antiMissile: 0,
    shieldDps: 0,
    hullDps: 0,
    firingEnergyPerFrame: 0,
    firingFuelPerFrame: 0,
    firingHeatPerFrame: 0,
    thrustingEnergy: 0,
    thrustingHeat: 0,
    turningEnergy: 0,
    turningHeat: 0,
    afterburnerEnergy: ship.attributes.afterburnerEnergy || 0,
    afterburnerHeat: ship.attributes.afterburnerHeat || 0,
    reverseThrustingEnergy: 0,
    reverseThrustingHeat: 0,
    outfitCost: 0,
    shipCost: ship.attributes.cost || 0,
    stockOutfitCost: 0,
  };
  const weaponEntries = [];

  for (const [outfitName, count] of Object.entries(loadout)) {
    const outfit = getOutfitDefinition(outfitName);
    if (!outfit) {
      stats.warnings.push(`Missing outfit data: ${outfitName}`);
      continue;
    }

    const attr = outfit.attributes;
    stats.outfitCost += (attr.cost || 0) * count;
    stats.mass += (attr.mass || 0) * count;
    stats.cargoSpace += (attr.cargoSpace || 0) * count;
    stats.fuelCapacity += (attr.fuelCapacity || 0) * count;
    stats.bunks += (attr.bunks || 0) * count;
    stats.requiredCrew += (attr.requiredCrew || 0) * count;
    stats.freeOutfit += (attr.outfitSpace || 0) * count;
    stats.freeWeapon += (attr.weaponCapacity || 0) * count;
    stats.freeEngine += (attr.engineCapacity || 0) * count;
    stats.freeGunPorts += (attr.gunPorts || 0) * count;
    stats.freeTurretMounts += (attr.turretMounts || 0) * count;
    stats.energyGeneration += (attr.energyGeneration || 0) * count;
    stats.energyConsumption += (attr.energyConsumption || 0) * count;
    stats.solarCollection += (attr.solarCollection || 0) * count;
    stats.solarHeat += (attr.solarHeat || 0) * count;
    stats.heatGeneration += (attr.heatGeneration || 0) * count;
    stats.energyCapacity += (attr.energyCapacity || 0) * count;
    stats.fuelGeneration += (attr.fuelGeneration || 0) * count;
    stats.fuelEnergy += (attr.fuelEnergy || 0) * count;
    stats.fuelConsumption += (attr.fuelConsumption || 0) * count;
    stats.fuelHeat += (attr.fuelHeat || 0) * count;
    stats.cooling += (attr.cooling || 0) * count;
    stats.activeCooling += (attr.activeCooling || 0) * count;
    stats.coolingEnergy += (attr.coolingEnergy || 0) * count;
    stats.coolingInefficiency += (attr.coolingInefficiency || 0) * count;
    stats.heatCapacity += (attr.heatCapacity || 0) * count;
    stats.shieldGeneration += (attr.shieldGeneration || 0) * count;
    stats.shieldEnergy += (attr.shieldEnergy || 0) * count;
    stats.shieldHeat += (attr.shieldHeat || 0) * count;
    stats.delayedShieldEnergy += (attr.delayedShieldEnergy || 0) * count;
    stats.delayedShieldHeat += (attr.delayedShieldHeat || 0) * count;
    stats.shieldEnergyMultiplier += (attr.shieldEnergyMultiplier || 0) * count;
    stats.shieldHeatMultiplier += (attr.shieldHeatMultiplier || 0) * count;
    stats.hullEnergy += (attr.hullEnergy || 0) * count;
    stats.hullHeat += (attr.hullHeat || 0) * count;
    stats.delayedHullEnergy += (attr.delayedHullEnergy || 0) * count;
    stats.delayedHullHeat += (attr.delayedHullHeat || 0) * count;
    stats.hullEnergyMultiplier += (attr.hullEnergyMultiplier || 0) * count;
    stats.hullHeatMultiplier += (attr.hullHeatMultiplier || 0) * count;
    stats.radarJamming += (attr.radarJamming || 0) * count;
    stats.opticalJamming += (attr.opticalJamming || 0) * count;
    stats.infraredJamming += (attr.infraredJamming || 0) * count;
    stats.thrust += (attr.thrust || 0) * count;
    stats.turn += (attr.turn || 0) * count;
    stats.reverseThrust += (attr.reverseThrust || 0) * count;
    stats.thrustingEnergy += (attr.thrustingEnergy || 0) * count;
    stats.thrustingHeat += (attr.thrustingHeat || 0) * count;
    stats.turningEnergy += (attr.turningEnergy || 0) * count;
    stats.turningHeat += (attr.turningHeat || 0) * count;
    stats.afterburnerEnergy += (attr.afterburnerEnergy || 0) * count;
    stats.afterburnerHeat += (attr.afterburnerHeat || 0) * count;
    stats.reverseThrustingEnergy += (attr.reverseThrustingEnergy || 0) * count;
    stats.reverseThrustingHeat += (attr.reverseThrustingHeat || 0) * count;
    stats.antiMissile += (attr.antiMissile || 0) * count;

    if (
      attr.reload ||
      attr.firingEnergy ||
      attr.firingFuel ||
      attr.firingHeat ||
      attr.relativeFiringEnergy ||
      attr.relativeFiringFuel ||
      attr.relativeFiringHeat
    ) {
      weaponEntries.push({ attr, count });
    }
  }

  stats.usedOutfit = ship.attributes.outfitSpace - stats.freeOutfit;
  stats.usedWeapon = ship.attributes.weaponCapacity - stats.freeWeapon;
  stats.usedEngine = ship.attributes.engineCapacity - stats.freeEngine;
  stats.usedGunPorts = ship.attributes.gunPorts - stats.freeGunPorts;
  stats.usedTurretMounts = ship.attributes.turretMounts - stats.freeTurretMounts;
  stats.maxSpeed = stats.drag ? (60 * stats.thrust) / stats.drag : 0;
  stats.acceleration = stats.mass ? (3600 * stats.thrust) / stats.mass : 0;
  stats.turning = stats.mass ? (60 * stats.turn) / stats.mass : 0;
  stats.shieldDps = Math.round(stats.shieldDps * 10) / 10;
  stats.hullDps = Math.round(stats.hullDps * 10) / 10;
  stats.maximumHeat = 100 * Math.max(1, stats.mass + stats.heatCapacity);

  for (const entry of weaponEntries) {
    const { attr, count } = entry;
    const cycleFrames = getWeaponCycleFrames(attr);
    const burstCount = Math.max(1, Number(attr.burstCount) || 1);
    const energyPerCycle =
      (attr.firingEnergy || 0) +
      (attr.relativeFiringEnergy || 0) * stats.energyCapacity;
    const fuelPerCycle =
      (attr.firingFuel || 0) +
      (attr.relativeFiringFuel || 0) * stats.fuelCapacity;
    const heatPerCycle =
      (attr.firingHeat || 0) +
      (attr.relativeFiringHeat || 0) * stats.maximumHeat;

    stats.firingEnergyPerFrame += (energyPerCycle * burstCount * count) / cycleFrames;
    stats.firingFuelPerFrame += (fuelPerCycle * burstCount * count) / cycleFrames;
    stats.firingHeatPerFrame += (heatPerCycle * burstCount * count) / cycleFrames;
    stats.shieldDps += (((attr.shieldDamage || 0) * burstCount) / cycleFrames) * FRAMES_PER_SECOND * count;
    stats.hullDps += (((attr.hullDamage || 0) * burstCount) / cycleFrames) * FRAMES_PER_SECOND * count;
  }

  stats.shieldDps = Math.round(stats.shieldDps * 10) / 10;
  stats.hullDps = Math.round(stats.hullDps * 10) / 10;
  const efficiency = coolingEfficiency(stats.coolingInefficiency);
  const passiveCooling = efficiency * stats.cooling;
  const activeCooling = efficiency * stats.activeCooling;
  const idleProduction = Math.max(0, stats.heatGeneration - passiveCooling);
  const idleDissipation = stats.heatDissipation + activeCooling / stats.maximumHeat;
  stats.idleHeat =
    idleDissipation === 0
      ? idleProduction > 0
        ? Number.POSITIVE_INFINITY
        : 0
      : idleProduction / idleDissipation;
  const hasShieldRegen =
    stats.shieldGeneration > 0 ||
    stats.shieldEnergy > 0 ||
    stats.delayedShieldEnergy > 0;
  const hasHullRepair =
    stats.hullEnergy > 0 ||
    stats.delayedHullEnergy > 0 ||
    stats.hullHeat > 0 ||
    stats.delayedHullHeat > 0;
  stats.idleEnergyPerFrame =
    stats.energyGeneration +
    stats.solarCollection +
    stats.fuelEnergy -
    stats.energyConsumption -
    stats.coolingEnergy;
  stats.idleHeatPerFrame =
    stats.heatGeneration +
    stats.solarHeat +
    stats.fuelHeat -
    efficiency * (stats.cooling + stats.activeCooling);
  stats.movingEnergyPerFrame =
    Math.max(stats.thrustingEnergy, stats.reverseThrustingEnergy) +
    stats.turningEnergy +
    stats.afterburnerEnergy;
  stats.movingHeatPerFrame =
    Math.max(stats.thrustingHeat, stats.reverseThrustingHeat) +
    stats.turningHeat +
    stats.afterburnerHeat;
  stats.shieldAndHullEnergyPerFrame =
    (hasShieldRegen
      ? (stats.shieldEnergy + stats.delayedShieldEnergy) * (1 + stats.shieldEnergyMultiplier)
      : 0) +
    (hasHullRepair
      ? (stats.hullEnergy + stats.delayedHullEnergy) * (1 + stats.hullEnergyMultiplier)
      : 0);
  stats.shieldAndHullHeatPerFrame =
    (hasShieldRegen
      ? (stats.shieldHeat + stats.delayedShieldHeat) * (1 + stats.shieldHeatMultiplier)
      : 0) +
    (hasHullRepair
      ? (stats.hullHeat + stats.delayedHullHeat) * (1 + stats.hullHeatMultiplier)
      : 0);
  stats.repairLabel =
    hasShieldRegen && hasHullRepair
      ? "Shields / hull"
      : hasHullRepair
        ? "Repairing hull"
        : "Charging shields";
  stats.netEnergyPerFrame =
    stats.idleEnergyPerFrame -
    stats.movingEnergyPerFrame -
    stats.firingEnergyPerFrame -
    stats.shieldAndHullEnergyPerFrame;
  stats.netHeatPerFrame =
    stats.idleHeatPerFrame +
    stats.movingHeatPerFrame +
    stats.firingHeatPerFrame +
    stats.shieldAndHullHeatPerFrame;
  stats.displayMaxHeat = FRAMES_PER_SECOND * stats.heatDissipation * stats.maximumHeat;

  const invalid =
    stats.freeOutfit < 0 ||
    stats.freeWeapon < 0 ||
    stats.freeEngine < 0 ||
    stats.freeGunPorts < 0 ||
    stats.freeTurretMounts < 0;
  stats.valid = !invalid;

  const driveOutfit = Object.keys(loadout).find((name) => {
    const outfit = getOutfitDefinition(name);
    return outfit?.attributes.hyperdrive || outfit?.attributes.scramDrive || outfit?.attributes.jumpDrive;
  });
  if (driveOutfit) {
    const drive = getOutfitDefinition(driveOutfit);
    stats.jumpFuel = drive.attributes.jumpFuel || 100;
    stats.jumpCount = Math.floor(stats.fuelCapacity / Math.max(1, stats.jumpFuel));
    stats.driveName = driveOutfit;
  } else {
    stats.jumpFuel = 0;
    stats.jumpCount = 0;
    stats.driveName = "None";
  }

  stats.stockOutfitCost = Object.entries(ship.stockOutfits || {}).reduce((sum, [name, count]) => {
    const outfit = getOutfitDefinition(name);
    return sum + (outfit?.attributes?.cost || 0) * count;
  }, 0);
  stats.totalCost = stats.shipCost + stats.outfitCost;
  stats.outfitDeltaCost = stats.outfitCost - stats.stockOutfitCost;

  if (includeSustain) {
    stats.sustain = buildSustainReport(stats);
  }

  return stats;
}

function getInstallCheck(shipName, loadout, outfitName, delta) {
  const next = cloneLoadout(loadout);
  next[outfitName] = Math.max(0, (next[outfitName] || 0) + delta);
  if (next[outfitName] <= 0) {
    delete next[outfitName];
  }
  const summary = summarizeFit(shipName, next, { includeSustain: false });
  if (!summary) {
    return { ok: false, reason: "Missing ship data." };
  }

  const issues = [];
  if (summary.freeOutfit < 0) {
    issues.push("Not enough outfit space");
  }
  if (summary.freeWeapon < 0) {
    issues.push("Not enough weapon capacity");
  }
  if (summary.freeEngine < 0) {
    issues.push("Not enough engine capacity");
  }
  if (summary.freeGunPorts < 0) {
    issues.push("No free gun ports");
  }
  if (summary.freeTurretMounts < 0) {
    issues.push("No free turret mounts");
  }

  return {
    ok: issues.length === 0,
    reason: issues.join(" · "),
  };
}

function adjustLoadout(outfitName, delta) {
  const check = delta > 0
    ? getInstallCheck(state.fitShipName, state.fitLoadout, outfitName, delta)
    : { ok: true };
  if (!check.ok) {
    return;
  }

  const next = cloneLoadout(state.fitLoadout);
  next[outfitName] = Math.max(0, (next[outfitName] || 0) + delta);
  if (next[outfitName] <= 0) {
    delete next[outfitName];
  }
  state.fitLoadout = next;
  state.fitSelectedOutfitName = outfitName;
  renderFitter();
}

function makeRouteKey(group, route) {
  if (!route) {
    return null;
  }
  if (route.type === "directMarket") {
    return [group, route.origin, route.destination, route.outward?.commodity].join("|");
  }
  if (route.type === "carrySale") {
    return [group, route.origin, route.destination, route.commodity, route.tons].join("|");
  }
  return [
    group,
    route.origin,
    route.destination,
    route.outward?.commodity,
    route.inbound?.commodity,
  ].join("|");
}

function setSelectedRoute(group, route) {
  state.selectedRouteKey = makeRouteKey(group, route);
  state.selectedRoute = { group, route };
  renderPlanner();
  renderMap();
}

function getAllRouteGroups() {
  const planner = state.status?.market?.planner;
  return {
    directMarkets: filterPlannerRoutesForMode(planner?.directMarketsFromHere || []),
    carrySales: filterPlannerRoutesForMode(planner?.carrySales || []),
    localLoops: filterPlannerRoutesForMode(planner?.loopsFromHere || []),
    reachableLoops: filterPlannerRoutesForMode(planner?.reachableLoops || []),
  };
}

function getTrackedRouteContext() {
  const trackerState = getTrackerState();
  if (!trackerState) {
    return null;
  }

  for (const group of ["localLoops", "reachableLoops"]) {
    const routes = getAllRouteGroups()[group] || [];
    const matched = routes.find(
      (route) =>
        route.origin === trackerState.origin &&
        route.destination === trackerState.destination &&
        route.outward?.commodity === trackerState.outwardCommodity &&
        route.inbound?.commodity === trackerState.inboundCommodity
    );
    if (matched) {
      return { group, route: matched, source: "tracker" };
    }
  }

  return null;
}

function pickPreferredRoute(group, routes = []) {
  if (!routes.length) {
    return null;
  }
  return routes.find(isRouteAccessible) || routes[0];
}

function getPreferredRouteContext() {
  if (state.selectedRouteKey) {
    const groups = getAllRouteGroups();
    for (const [group, routes] of Object.entries(groups)) {
      const route = routes.find((candidate) => makeRouteKey(group, candidate) === state.selectedRouteKey);
      if (route) {
        return { group, route, source: "selected" };
      }
    }
  }

  const tracked = getTrackedRouteContext();
  if (tracked) {
    return tracked;
  }

  const groups = getAllRouteGroups();
  const priority = [
    ["localLoops", groups.localLoops],
    ["directMarkets", groups.directMarkets],
    ["carrySales", groups.carrySales],
    ["reachableLoops", groups.reachableLoops],
  ];

  for (const [group, routes] of priority) {
    const route = pickPreferredRoute(group, routes);
    if (route) {
      return { group, route, source: "auto" };
    }
  }

  return null;
}

function bfsDistances(start, maxDepth = Infinity) {
  const systems = getSystemsMap();
  if (!start || !systems[start]) {
    return {};
  }
  const distances = { [start]: 0 };
  const queue = [start];

  while (queue.length) {
    const current = queue.shift();
    const depth = distances[current];
    if (depth >= maxDepth) {
      continue;
    }
    for (const next of systems[current].links || []) {
      if (!systems[next] || distances[next] !== undefined) {
        continue;
      }
      distances[next] = depth + 1;
      queue.push(next);
    }
  }

  return distances;
}

function findShortestPath(start, end) {
  const systems = getSystemsMap();
  if (!systems[start] || !systems[end]) {
    return [];
  }
  const queue = [start];
  const previous = new Map([[start, null]]);

  while (queue.length) {
    const current = queue.shift();
    if (current === end) {
      break;
    }
    for (const next of systems[current].links || []) {
      if (!systems[next] || previous.has(next)) {
        continue;
      }
      previous.set(next, current);
      queue.push(next);
    }
  }

  if (!previous.has(end)) {
    return [];
  }

  const path = [];
  let current = end;
  while (current) {
    path.push(current);
    current = previous.get(current) || null;
  }
  return path.reverse();
}

function getConnectedSystemComponents() {
  const systems = state.bootstrap?.map?.systems || [];
  const systemsMap = getSystemsMap();
  const visited = new Set();
  const components = [];

  for (const system of systems) {
    if (visited.has(system.name)) {
      continue;
    }
    const component = new Set();
    const queue = [system.name];
    visited.add(system.name);
    while (queue.length) {
      const current = queue.shift();
      component.add(current);
      for (const next of systemsMap[current]?.links || []) {
        if (!systemsMap[next] || visited.has(next)) {
          continue;
        }
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }

  return components.sort((left, right) => right.size - left.size);
}

function getProjectionSystemNames(anchorNames = []) {
  const components = getConnectedSystemComponents();
  if (!components.length) {
    return new Set();
  }

  const keep = new Set(components[0]);
  const anchors = new Set(anchorNames.filter(Boolean));
  if (!anchors.size) {
    return keep;
  }

  for (const component of components.slice(1)) {
    let include = false;
    for (const name of component) {
      if (anchors.has(name)) {
        include = true;
        break;
      }
    }
    if (include) {
      for (const name of component) {
        keep.add(name);
      }
    }
  }

  return keep;
}

function getGlobalProjection(anchorNames = []) {
  const systems = state.bootstrap?.map?.systems || [];
  const projectedNames = getProjectionSystemNames(anchorNames);
  const projectedSystems = systems.filter((system) => projectedNames.has(system.name));
  if (!projectedSystems.length) {
    return null;
  }

  const xs = projectedSystems.map((system) => system.x);
  const ys = projectedSystems.map((system) => system.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 1600;
  const height = 1200;
  const padding = 92;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  return {
    width,
    height,
    projectedNames,
    project(system) {
      const x = padding + ((system.x - minX) / spanX) * (width - padding * 2);
      const y = padding + ((system.y - minY) / spanY) * (height - padding * 2);
      return [x, y];
    },
  };
}

function expandFocus(seedNames, depth = 1) {
  const systems = getSystemsMap();
  const expanded = new Set(seedNames);
  const queue = Array.from(seedNames).map((name) => ({ name, depth: 0 }));

  while (queue.length) {
    const current = queue.shift();
    if (!systems[current.name] || current.depth >= depth) {
      continue;
    }
    for (const next of systems[current.name].links || []) {
      if (!systems[next] || expanded.has(next)) {
        continue;
      }
      expanded.add(next);
      queue.push({ name: next, depth: current.depth + 1 });
    }
  }

  return expanded;
}

function getMapContext() {
  const systems = getSystemsMap();
  const currentSystem = state.status?.player?.currentSystem;
  const focused = getPreferredRouteContext();
  const selected = focused?.route || null;
  const focus = new Set();

  if (currentSystem) {
    focus.add(currentSystem);
  }

  if (selected) {
    const currentToOrigin =
      selected.origin && currentSystem && selected.origin !== currentSystem
        ? findShortestPath(currentSystem, selected.origin)
        : [];
    const outward = findShortestPath(selected.origin, selected.destination);
    const inbound = selected.type === "loop" ? findShortestPath(selected.destination, selected.origin) : [];
    for (const name of [...currentToOrigin, ...outward, ...inbound]) {
      if (name) {
        focus.add(name);
      }
    }
  } else if (currentSystem) {
    const visibleDepth = Math.max(3, Math.min(6, state.status?.player?.drive?.fullJumps + 1 || 4));
    const distances = bfsDistances(currentSystem, visibleDepth);
    for (const name of Object.keys(distances)) {
      focus.add(name);
    }
  }

  const globalProjection = getGlobalProjection([
    currentSystem,
    selected?.origin,
    selected?.destination,
  ]);
  if (!globalProjection) {
    return null;
  }

  const selectedDepth = selected ? (focus.size <= 4 ? 1 : 0) : 1;
  const expanded = expandFocus(focus, selectedDepth);
  const seed = [currentSystem, selected?.origin, selected?.destination].find((name) => expanded.has(name));
  const connected = new Set();
  if (seed) {
    const queue = [seed];
    connected.add(seed);
    while (queue.length) {
      const current = queue.shift();
      for (const next of systems[current]?.links || []) {
        if (!expanded.has(next) || connected.has(next)) {
          continue;
        }
        connected.add(next);
        queue.push(next);
      }
    }
  }
  const names = connected.size ? connected : expanded;
  const visibleSystems = Array.from(names)
    .map((name) => systems[name])
    .filter((system) => Boolean(system) && globalProjection.projectedNames.has(system.name));

  if (!visibleSystems.length) {
    return null;
  }

  const projected = visibleSystems.map((system) => globalProjection.project(system));
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const localWidth = 1320;
  const localHeight = 860;
  const viewBox = fitViewBox(
    minX,
    minY,
    maxX,
    maxY,
    localWidth,
    localHeight,
    globalProjection.width,
    globalProjection.height
  );

  return {
    names,
    systems: visibleSystems,
    width: localWidth,
    height: localHeight,
    viewBox,
    globalProjection,
  };
}

function getTrackerState() {
  try {
    return JSON.parse(localStorage.getItem(TRACKER_KEY) || "null");
  } catch {
    return null;
  }
}

async function syncTrackerTravelPlan(trackerState) {
  const desired = getTrackerTravelPlan(trackerState);
  const current = state.status?.player?.travelPlan || [];
  const desiredKey = JSON.stringify(desired);
  if (desiredKey === JSON.stringify(current)) {
    state.trackerTravelSyncKey = desiredKey;
    return;
  }
  if (state.trackerTravelSyncInFlight && state.trackerTravelSyncKey === desiredKey) {
    return;
  }
  state.trackerTravelSyncInFlight = true;
  state.trackerTravelSyncKey = desiredKey;
  try {
    const response = await fetch("/api/save-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "tracker",
        level: "advanced",
        travelPlan: desired,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to sync travel plan.");
    }
    await fetchStatus();
  } catch (error) {
    console.error("Tracker travel plan sync failed:", error);
  } finally {
    state.trackerTravelSyncInFlight = false;
  }
}

function setTrackerState(next) {
  localStorage.setItem(TRACKER_KEY, JSON.stringify(next));
  void syncTrackerTravelPlan(next);
  renderTracker();
  renderActiveRouteCard();
  renderPlanner();
  renderMap();
}

function clearTracker() {
  localStorage.removeItem(TRACKER_KEY);
  renderTracker();
  renderActiveRouteCard();
  renderPlanner();
  renderMap();
}

function startTrackingLoop(route) {
  const currentSystem = state.status?.player?.currentSystem;
  const cargoRows = state.status?.market?.cargoSummary || [];
  setTrackerState(createTrackerState(route, currentSystem, cargoRows, new Date().toISOString()));
}

function updateTrackerFromStatus() {
  const trackerState = getTrackerState();
  const currentSystem = state.status?.player?.currentSystem;
  const cargoRows = state.status?.market?.cargoSummary || [];
  if (!trackerState || !currentSystem) {
    return;
  }
  const next = normalizeTrackerState(trackerState, currentSystem, cargoRows);
  if (JSON.stringify(next) !== JSON.stringify(trackerState)) {
    setTrackerState(next);
  }
}

function openFitSaveModal() {
  if (!fitSaveModal) {
    return;
  }
  fitSaveName.value = state.fitShipName ? `${state.fitShipName} fit` : "";
  fitSaveNote.value = "";
  updateFitSaveCharcount();
  updateFitSaveActions();
  fitSaveModal.hidden = false;
  syncModalBodyState();
  setTimeout(() => fitSaveName?.focus(), 0);
}

function closeFitSaveModal() {
  if (!fitSaveModal) {
    return;
  }
  fitSaveModal.hidden = true;
  syncModalBodyState();
}

function updateFitSaveCharcount() {
  if (!fitSaveCharcount || !fitSaveNote) {
    return;
  }
  fitSaveCharcount.textContent = `${fitSaveNote.value.length} / 280`;
}

function updateFitSaveActions() {
  if (!fitSaveSubmit || !fitSaveName) {
    return;
  }
  fitSaveSubmit.disabled = !fitSaveName.value.trim();
}

function metricCard(label, value, detail = "") {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      ${detail ? `<div class="metric-detail">${detail}</div>` : ""}
    </article>
  `;
}

function renderHeroMeta() {
  if (!state.bootstrap || !state.status) {
    heroMeta.innerHTML = `<div class="meta-pill">Loading…</div>`;
    return;
  }

  const { player, fleet, save } = state.status;
  const saveUnavailable = !save?.available;
  const saveLabel = (save?.name || (saveUnavailable ? "Not found" : "Unknown")).replace(/\.txt$/i, "");
  const locationLabel = `${player.currentSystem || "Unknown"}${player.currentPlanet ? ` / ${player.currentPlanet}` : ""}`;
  heroMeta.innerHTML = [
    `<div class="meta-pill"><span>Save</span><strong>${escapeHtml(saveLabel)}</strong></div>`,
    saveUnavailable
      ? `<div class="meta-pill"><span>Status</span><strong>${escapeHtml(save?.issue || "Save not found")}</strong></div>`
      : `<div class="meta-pill"><span>Location</span><strong>${escapeHtml(locationLabel)}</strong></div>`,
    saveUnavailable
      ? `<div class="meta-pill"><span>Recent.txt</span><strong>${escapeHtml(save?.recentPath || save?.defaultRecentPath || "Not found")}</strong></div>`
      : `<div class="meta-pill"><span>Jumps</span><strong>${player.drive.currentJumps} / ${player.drive.fullJumps}</strong></div>`,
    saveUnavailable
      ? `<div class="meta-pill"><span>Config</span><strong>${escapeHtml(save?.configPath || "cache/app-config.json")}</strong></div>`
      : `<div class="meta-pill"><span>Fleet</span><strong>${fleet.activeShips.length} active · ${fleet.parkedShips.length} parked</strong></div>`,
    `<button class="meta-pill meta-pill-button ${state.debugMode ? "is-active" : ""}" id="debug-toggle" type="button"><span>Mode</span><strong>${state.debugMode ? "Debug" : "Live"}</strong></button>`,
    `<div class="meta-pill"><span>Updated</span><strong>${new Date(state.status.generatedAt).toLocaleTimeString()}</strong></div>`,
  ].join("");

  document.getElementById("debug-toggle")?.addEventListener("click", toggleDebugMode);
}

function renderSummary() {
  if (!state.status || !hasActiveSave()) {
    summaryStrip.innerHTML = "";
    return;
  }

  const { player, fleet } = state.status;
  const totals = fleet.totals;
  const cards = [
    metricCard("Date", escapeHtml(formatDate(player.date))),
    metricCard("Credits", `<span class="mono">${formatNumber(player.credits)}</span>`),
    metricCard(
      "Trade hold",
      `<span class="mono">${formatNumber(totals.tradeCargoCapacity)}</span>`,
      totals.missionCargo > 0
        ? `${formatNumber(totals.tradeFreeCargo)} free · ${formatNumber(totals.missionCargo)} mission cargo`
        : `${formatNumber(totals.tradeFreeCargo)} free right now`
    ),
    metricCard(
      "Cargo loaded",
      `<span class="mono">${formatNumber(totals.usedCargo)}</span>`,
      totals.freeCargoAfterMission > 0
        ? `${formatNumber(totals.freeCargoAfterMission)} free after mission reservations`
        : "No free cargo after mission reservations"
    ),
    metricCard(
      "Crew",
      `<span class="mono">${formatNumber(totals.crew)} / ${formatNumber(totals.bunks)}</span>`,
      totals.missionPassengers > 0
        ? `${formatNumber(totals.missionPassengers)} mission passengers · ${formatNumber(totals.dailySalary)} salary / day`
        : `${formatNumber(totals.freeBunks)} bunks free · ${formatNumber(totals.dailySalary)} salary / day`
    ),
    metricCard("Drive", escapeHtml(player.drive.drive), `${player.drive.fullJumps} full jumps`),
  ];
  summaryStrip.innerHTML = cards.join("");
}

function renderMissionOccupancy() {
  const totals = state.status?.fleet?.totals;
  const rows = state.status?.missions?.occupancy || [];
  if (!totals) {
    missionOccupancy.innerHTML = "";
    return;
  }

  if (!rows.length) {
    missionOccupancy.innerHTML = `<div class="empty-state">No mission cargo or passengers are currently occupying space.</div>`;
    return;
  }

  missionOccupancy.innerHTML = `
    <div class="pill-row">
      <div class="metric-pill">Mission cargo <strong>${formatNumber(totals.missionCargo)}</strong></div>
      <div class="metric-pill">Mission passengers <strong>${formatNumber(totals.missionPassengers)}</strong></div>
      <div class="metric-pill">Trade hold <strong>${formatNumber(totals.tradeCargoCapacity)}</strong></div>
      <div class="metric-pill">Free after missions <strong>${formatNumber(totals.freeCargoAfterMission)}</strong></div>
    </div>
    <div class="mission-grid">
      ${rows
        .map(
          (mission) => `
            <article class="mission-card">
              <div class="mission-name">${escapeHtml(mission.name)}</div>
              <div class="meta-row">
                ${mission.destination ? `<span>${escapeHtml(mission.destination)}</span>` : ""}
                ${mission.deadline ? `<span>${escapeHtml(formatDate(mission.deadline))}</span>` : ""}
              </div>
              ${mission.cargoTons > 0 ? `<div class="mission-line">${formatNumber(mission.cargoTons)} tons${mission.cargoName ? ` of ${escapeHtml(mission.cargoName)}` : ""}</div>` : ""}
              ${mission.passengers > 0 ? `<div class="mission-line">${formatNumber(mission.passengers)} passengers</div>` : ""}
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCargo() {
  const panel = cargoSummary.closest(".panel");
  const rows = state.status?.market?.cargoSummary || [];
  if (!rows.length) {
    if (panel) {
      panel.hidden = true;
    }
    cargoSummary.innerHTML = `<div class="empty-state">No ordinary trade cargo is currently loaded.</div>`;
    return;
  }

  if (panel) {
    panel.hidden = false;
  }

  cargoSummary.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Commodity</th>
          <th>Tons</th>
          <th>Basis / t</th>
          <th>Local</th>
          <th>Margin / t</th>
          <th>Local sale</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.commodity)}</td>
                <td>${formatNumber(row.tons)}</td>
                <td>${formatNumber(row.basisPerTon)}</td>
                <td>${formatNumber(row.localPrice)}</td>
                <td class="${row.localMarginPerTon >= 0 ? "good" : "bad"}">${formatSignedNumber(row.localMarginPerTon)}</td>
                <td>${formatNumber(row.localSaleValue)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function routeMeta(bits) {
  return `<div class="meta-row">${bits.map((bit) => `<span>${bit}</span>`).join("")}</div>`;
}

function renderRouteAccess(access) {
  if (!access || access.status === "open") {
    return "";
  }
  return `
    <div class="route-access route-access-${escapeHtml(access.status)}">
      <strong>${escapeHtml(getRouteAccessLabel(access))}</strong>
      <span>${escapeHtml(access.alert || "")}</span>
    </div>
  `;
}

function renderRouteRiskTags(route) {
  const tags = getRouteRiskBadges(route, getPlannerSettings()).map(
    (badge) => `<span class="tag is-${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`
  );

  return tags.length ? `<div class="tag-row">${tags.join("")}</div>` : "";
}

function renderCarrySales() {
  const panel = carrySales.closest(".panel");
  const routes = state.status?.market?.planner?.carrySales || [];
  const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
  const focused = getPreferredRouteContext();
  const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
  if (!safe.length) {
    if (panel) {
      panel.hidden = true;
    }
    carrySales.innerHTML = `<div class="empty-state">No attractive sale route was found for the cargo currently onboard.</div>`;
    return;
  }
  if (panel) {
    panel.hidden = false;
  }

  carrySales.innerHTML = safe
    .map((route) => {
      const routeKey = makeRouteKey("carrySales", route);
      const active = activeRouteKey === routeKey ? "is-active" : "";
      return `
        <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="carrySales">
          <div class="route-head">
            <div class="route-title">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</div>
            <div class="route-score mono">${formatNumber(route.profitPerJump)} cr / jump</div>
          </div>
          ${routeMeta([
            `<strong>${escapeHtml(route.commodity)}</strong>`,
            `${formatNumber(route.tons)} tons`,
            `${formatNumber(route.jumps)} jumps`,
            `${formatNumber(route.projectedProfit)} total`,
          ])}
          <div class="route-note">
            Basis ${formatNumber(route.buy)} / t, projected sale ${formatNumber(route.sell)} / t.
          </div>
          ${renderRouteAccess(route.access)}
        </article>
      `;
    })
    .join("") +
    [
      risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky cargo exits hidden in live mode.</div>` : "",
      hiddenInLive && !state.debugMode
        ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened destinations hidden in live mode.</div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
}

function renderDirectMarkets() {
  const routes = state.status?.market?.planner?.directMarketsFromHere || [];
  const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
  const focused = getPreferredRouteContext();
  const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
  if (!safe.length) {
    directMarkets.innerHTML = `<div class="empty-state">${risky.length ? `${formatNumber(risky.length)} routes were hidden because landing is blocked or not verified.` : "No profitable known trade run was found for the current cost model."}</div>`;
    return;
  }

  directMarkets.innerHTML = safe
    .map((route) => {
      const routeKey = makeRouteKey("directMarkets", route);
      const active = activeRouteKey === routeKey ? "is-active" : "";
      return `
        <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="directMarkets">
          <div class="route-head">
            <div class="route-title">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</div>
            <div class="route-score mono">${formatNumber(route.netProfit)} / run</div>
          </div>
          ${routeMeta([
            `${formatNumber(route.travelJumps)} jumps total`,
            route.repositionJumps ? `${formatNumber(route.repositionJumps)} to start` : "Start here",
            `${formatOneDecimal(route.marginPerTonPerJump)} cr / t / jump`,
            `Buy on <strong>${escapeHtml(formatTradeLocation(route.origin, route.access))}</strong>`,
            `Sell on <strong>${escapeHtml(formatTradeLocation(route.destination, route.access))}</strong>`,
            `Best: <strong>${escapeHtml(route.outward.commodity)}</strong>`,
            `${formatNumber(route.netProfit)} net full hold`,
          ])}
          ${renderRouteRiskTags(route)}
          <div class="tag-row">
            ${route.topTrades
              .map(
                (trade) =>
                  `<span class="tag">${escapeHtml(trade.commodity)} <strong>+${formatNumber(trade.margin)}</strong></span>`
              )
              .join("")}
          </div>
          <div class="route-note">
            Land on <strong>${escapeHtml(formatTradeLocation(route.origin, route.access))}</strong>, buy <strong>${escapeHtml(route.outward.commodity)}</strong> at ${formatNumber(route.outward.buy)},
            then sell on <strong>${escapeHtml(formatTradeLocation(route.destination, route.access))}</strong> at ${formatNumber(route.outward.sell)}.
          </div>
          ${route.operatingCost > 0 ? `<div class="route-note">Route cost: ${formatCredits(route.operatingCost)} across ${formatNumber(route.travelJumps)} jumps.</div>` : ""}
          ${renderRouteAccess(route.access)}
        </article>
      `;
    })
    .join("") +
    [
      risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky or unverified markets hidden in live mode.</div>` : "",
      hiddenInLive && !state.debugMode
        ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened systems hidden in live mode.</div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
}

function renderLoopCards(target, group, routes, emptyText) {
  const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
  const focused = getPreferredRouteContext();
  const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
  if (!safe.length) {
    target.innerHTML = `<div class="empty-state">${escapeHtml(risky.length ? `${formatNumber(risky.length)} routes were hidden because landing is blocked or not verified.` : emptyText)}</div>`;
    return;
  }

  target.innerHTML = safe
    .map((route) => {
      const routeKey = makeRouteKey(group, route);
      const active = activeRouteKey === routeKey ? "is-active" : "";
      const supportingMetric =
        group === "reachableLoops"
          ? `${formatNumber(route.profitPerDayFromHere)} net / day from current position`
          : `${formatNumber(route.netProfitPerJump || route.profitPerJump)} net / jump`;

      return `
        <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="${escapeHtml(group)}">
          <div class="route-head">
            <div class="route-title">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)} → ${escapeHtml(route.origin)}</div>
            <div class="route-score mono">${formatNumber(route.netProfit)} / loop</div>
          </div>
          ${routeMeta([
            `${formatNumber(route.totalJumps + (route.repositionJumps || 0))} jumps total`,
            `${formatNumber(route.totalMargin)} cr / t`,
            `${formatNumber(route.tradeCapacity || 0)} trade hold`,
            supportingMetric,
            `Buy on <strong>${escapeHtml(formatTradeLocation(route.origin, route.access))}</strong>`,
            `Return via <strong>${escapeHtml(formatTradeLocation(route.destination, route.access))}</strong>`,
            route.repositionJumps !== undefined ? `${formatNumber(route.repositionJumps)} to start` : "",
          ].filter(Boolean))}
          ${renderRouteRiskTags(route)}
          <div class="route-note">
            Outbound: land on <strong>${escapeHtml(formatTradeLocation(route.origin, route.access))}</strong>, buy <strong>${escapeHtml(route.outward.commodity)}</strong>
            at ${formatNumber(route.outward.buy)} and sell in ${escapeHtml(formatTradeLocation(route.destination, route.access))}
            at ${formatNumber(route.outward.sell)}.
          </div>
          <div class="route-note">
            Return: land on <strong>${escapeHtml(formatTradeLocation(route.destination, route.access))}</strong>, buy <strong>${escapeHtml(route.inbound.commodity)}</strong>
            at ${formatNumber(route.inbound.buy)} and sell in ${escapeHtml(formatTradeLocation(route.origin, route.access))}
            at ${formatNumber(route.inbound.sell)}.
          </div>
          ${route.operatingCost > 0 ? `<div class="route-note">Route cost: ${formatCredits(route.operatingCost)} across ${formatNumber(route.totalJumps + (route.repositionJumps || 0))} jumps.</div>` : ""}
          ${renderRouteAccess(route.access)}
          <div class="route-actions">
            <button class="button-inline" data-track-loop="${escapeHtml(routeKey)}" type="button">Track loop</button>
          </div>
        </article>
      `;
    })
    .join("") +
    [
      risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky or unverified routes hidden in live mode.</div>` : "",
      hiddenInLive && !state.debugMode
        ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened systems hidden in live mode.</div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
}

function bindRouteInteractions() {
  document.querySelectorAll("[data-select-route]").forEach((card) => {
    card.addEventListener("click", () => {
      const group = card.dataset.routeGroup;
      const routeKey = card.dataset.selectRoute;
      const routes = getAllRouteGroups()[group] || [];
      const route = routes.find((candidate) => makeRouteKey(group, candidate) === routeKey);
      if (route) {
        setSelectedRoute(group, route);
      }
    });
  });
  document.querySelectorAll("[data-track-loop]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const routeKey = button.dataset.trackLoop;
      const routes = [
        ...(state.status?.market?.planner?.loopsFromHere || []),
        ...(state.status?.market?.planner?.reachableLoops || []),
      ];
      const route =
        routes.find((candidate) => makeRouteKey("localLoops", candidate) === routeKey) ||
        routes.find((candidate) => makeRouteKey("reachableLoops", candidate) === routeKey);
      if (route) {
        startTrackingLoop(route);
        renderPlanner();
        renderMap();
      }
    });
  });
}

function renderActiveRouteCard() {
  const trackerState = getTrackerState();
  const currentSystem = state.status?.player?.currentSystem;
  if (!trackerState || !currentSystem) {
    activeRouteCard.innerHTML = "";
    activeRouteCard.classList.remove("has-route");
    return;
  }
  const stageMeta = getTrackerStageMeta(trackerState, currentSystem);

  activeRouteCard.innerHTML = `
    <div class="active-route-head">
      <div>
        <div class="active-route-label">Tracked loop</div>
        <div class="active-route-title">${escapeHtml(stageMeta?.title || `${trackerState.origin} → ${trackerState.destination} → ${trackerState.origin}`)}</div>
      </div>
      <div class="route-actions">
        <div class="active-route-score mono">${formatNumber(trackerState.laps || 0)} laps</div>
        <button class="button-inline" id="active-route-untrack" type="button">Untrack</button>
      </div>
    </div>
    <div class="tracker-line muted">${escapeHtml(stageMeta?.stageLabel || "Tracking")} · <span class="mono">${escapeHtml(currentSystem)}</span></div>
    <div class="active-route-copy">${escapeHtml(stageMeta?.copy || `Current system: ${currentSystem}.`)}</div>
  `;
  activeRouteCard.classList.add("has-route");
  document.getElementById("active-route-untrack")?.addEventListener("click", clearTracker);
}

function renderPlanner() {
  renderDirectMarkets();
  renderLoopCards(
    localLoops,
    "localLoops",
    state.status?.market?.planner?.loopsFromHere || [],
    "No worthwhile known trade loop was found for the current cost model."
  );
  bindRouteInteractions();
  renderActiveRouteCard();
}

function renderFleet() {
  const ships = [
    ...(state.status?.fleet?.activeShips || []),
    ...(state.status?.fleet?.parkedShips || []),
  ].map(normalizeShipDisplayShip);

  if (!ships.length) {
    fleetList.innerHTML = `<div class="empty-state">No ships were found for the current commander.</div>`;
    return;
  }

  fleetList.innerHTML = ships
    .map((ship) => {
      const fit = summarizeFit(ship.model, ship.outfits, { includeSustain: false });
      const isFlagship =
        !ship.parked &&
        ((state.status?.fleet?.flagshipUuid &&
          ship.uuid === state.status.fleet.flagshipUuid) ||
          ship.name === state.status?.fleet?.flagshipName);

      return `
        <article class="fleet-card ${isFlagship ? "is-flagship" : ""}">
          <div class="ship-head">
            ${ship.thumbnailUrl ? `<img class="ship-thumb" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(ship.model)}" />` : `<div class="ship-thumb ship-thumb-placeholder"></div>`}
            <div>
              <div class="ship-title">${escapeHtml(ship.name)}</div>
              <div class="ship-subtitle">${escapeHtml(ship.model)} · ${escapeHtml(ship.category)}${ship.parked ? " · parked" : ""}${isFlagship ? " · flagship" : ""}</div>
              <div class="ship-meta">${escapeHtml(ship.system || "Unknown")}${ship.planet ? ` / ${escapeHtml(ship.planet)}` : ""}</div>
            </div>
          </div>
          <div class="pill-row">
            <div class="metric-pill">Cargo <strong>${formatNumber(ship.attributes.cargoSpace)}</strong></div>
            <div class="metric-pill">Fuel <strong>${formatNumber(ship.fuel)} / ${formatNumber(Math.max(ship.attributes.fuelCapacity, ship.fuel))}</strong></div>
            <div class="metric-pill">Crew <strong>${formatNumber(ship.crew)} / ${formatNumber(ship.attributes.bunks)}</strong></div>
            <div class="metric-pill">Outfit <strong>${fit ? formatNumber(fit.usedOutfit) : "?"} / ${formatNumber(ship.attributes.outfitSpace)}</strong></div>
          </div>
          <div class="meta-row">
            <span>Weapon <strong>${fit ? formatNumber(fit.usedWeapon) : "?"}</strong></span>
            <span>Engine <strong>${fit ? formatNumber(fit.usedEngine) : "?"}</strong></span>
            <span>Speed <strong>${fit ? formatOneDecimal(fit.maxSpeed) : "?"}</strong></span>
            <span>${fit?.valid ? `<strong class="good">Fit valid</strong>` : `<strong class="bad">Fit invalid</strong>`}</span>
          </div>
          <div class="route-actions">
            <button class="button-inline" data-load-fleet-fit="${escapeHtml(ship.uuid || `${ship.model}-${ship.name}`)}" type="button">Open in fitter</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-load-fleet-fit]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.loadFleetFit;
      const ship = ships.find((candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === id);
      if (ship) {
        loadShipIntoFitter(ship.model, ship.outfits, id);
      }
    });
  });
}

function renderStandings() {
  const rows = state.status?.player?.standings || [];
  const majorOrder = [
    "Republic",
    "Free Worlds",
    "Syndicate",
    "Militia",
    "Merchant",
    "Pirate",
    "Hai",
    "Deep",
    "Korath",
    "Heliarch",
    "Coalition",
    "Remnant",
  ];
  const majorSet = new Set(majorOrder);
  const visibleRows = (state.debugMode ? rows : rows.filter((row) => majorSet.has(row.name) || row.value > -999.5))
    .sort((left, right) => {
      const leftRank = majorOrder.indexOf(left.name);
      const rightRank = majorOrder.indexOf(right.name);
      return (
        (leftRank === -1 ? 999 : leftRank) - (rightRank === -1 ? 999 : rightRank) ||
        Math.abs(right.value) - Math.abs(left.value) ||
        left.name.localeCompare(right.name)
      );
    });

  standings.innerHTML = visibleRows.length
    ? `
      <table>
        <thead>
          <tr>
            <th>Faction</th>
            <th>Reputation</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.name)}</td>
                  <td class="${row.value >= 0 ? "good" : "bad"}">${row.value >= 0 ? "+" : ""}${formatTwoDecimals(row.value)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state">No notable faction standings were found.</div>`;
}

function buildLicenseActionCopy(item) {
  if (item.owned) {
    return item.description || "Already unlocked for the current commander.";
  }
  if (item.currentSaleLocations?.length) {
    const first = item.currentSaleLocations[0];
    return `Buy at ${formatSaleLocation(first, { includeReputation: true })}.`;
  }
  if (item.requiredByShips?.length) {
    return `Not sold at an active outfitter right now. Usually unlocked through faction access or story progress.`;
  }
  return item.acquisitionHint || "Usually unlocked through faction or story progression.";
}

function renderLicenses() {
  const all = state.status?.wiki?.licenses || [];
  const items = all.filter(
    (item) => item.owned || item.currentSaleLocations?.length || item.requiredByShips?.length
  );
  const owned = items.filter((item) => item.owned);
  const locked = items.filter((item) => !item.owned);
  const renderCards = (list) =>
    list
      .map(
        (item) => `
          <article class="license-card ${item.owned ? "is-owned" : ""}">
            <div class="license-card-head">
              ${item.imageUrl ? `<img class="license-card-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />` : `<div class="license-card-image outfit-icon-placeholder"></div>`}
              <div>
                <div class="license-card-title">${escapeHtml(item.name)}</div>
                <div class="license-card-state ${item.owned ? "good" : "muted"}">${item.owned ? "Owned" : "Locked"}</div>
              </div>
            </div>
            <div class="license-card-copy">${escapeHtml(buildLicenseActionCopy(item))}</div>
            ${
              item.currentSaleLocations?.length
                ? `<div class="license-card-tags">${item.currentSaleLocations
                    .slice(0, 3)
                    .map((location) => `<span class="tag">${escapeHtml(formatSaleLocation(location, { includeReputation: true }))}</span>`)
                    .join("")}</div>`
                : ""
            }
            ${
              item.requiredByShips?.length
                ? `<div class="license-card-copy">Used by ${escapeHtml(item.requiredByShips.slice(0, 4).join(", "))}${item.requiredByShips.length > 4 ? "…" : ""}</div>`
                : ""
            }
          </article>
        `
      )
      .join("");

  licenses.innerHTML = items.length
    ? `
      ${owned.length ? `<section class="license-section"><div class="license-section-title">Owned</div><div class="license-grid">${renderCards(owned)}</div></section>` : ""}
      ${locked.length ? `<section class="license-section"><div class="license-section-title">Not yet unlocked</div><div class="license-grid">${renderCards(locked)}</div></section>` : ""}
    `
    : `<div class="empty-state">No active or relevant license records were found.</div>`;
}

function getShipAvailability(shipName) {
  const ship = getShipWiki(shipName);
  const progress = ship?.progressSaleLocations || [];
  const current = ship?.currentSaleLocations || [];
  const known = ship?.knownSaleLocations || [];
  if (progress.length) {
    return {
      tone: "available",
      label: `Buyable now at ${formatSaleLocation(progress[0], { includeReputation: true })}`,
      tags: progress.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })),
    };
  }
  if (current.length) {
    return {
      tone: "known",
      label: `On sale, but currently gated at ${formatSaleLocation(current[0], { includeReputation: true })}`,
      tags: current.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })),
    };
  }
  if (known.length) {
    return {
      tone: "known",
      label: `Known sale location: ${formatSaleLocation(known[0], { includeReputation: true })}`,
      tags: known.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })),
    };
  }
  return {
    tone: "unlisted",
    label: "No standard shipyard listing found in the current data.",
    tags: [],
  };
}

function getShipVisibilityState(shipName) {
  const owned = getOwnedShipModelNames().has(shipName);
  const ship = getShipWiki(shipName);
  const progress = Boolean(ship?.progressSaleLocations?.length);
  const onSale = Boolean(ship?.currentSaleLocations?.length);
  const known = Boolean(ship?.knownSaleLocations?.length);
  const buyable = owned || progress;
  return { owned, progress, onSale, known, buyable };
}

function getBrowsableShips() {
  const categoryOrder = [
    "Heavy Warship",
    "Heavy Freighter",
    "Transport",
    "Medium Warship",
    "Freighter",
    "Light Warship",
    "Interceptor",
    "Fighter",
    "Drone",
  ];

  return (state.bootstrap?.ships || [])
    .filter((ship) => {
      if (/(?:missions|events|jobs)\.txt$/i.test(ship.sourcePath || "")) {
        return false;
      }
      if (/Unknown Ship Type/i.test(ship.name)) {
        return false;
      }
      if (state.debugMode) {
        return true;
      }
      const visibility = getShipVisibilityState(ship.name);
      return visibility.buyable;
    })
    .sort((left, right) => {
      const leftVisibility = getShipVisibilityState(left.name);
      const rightVisibility = getShipVisibilityState(right.name);
      const leftCategory = categoryOrder.indexOf(left.category);
      const rightCategory = categoryOrder.indexOf(right.category);
      return (
        Number(rightVisibility.owned) - Number(leftVisibility.owned) ||
        Number(rightVisibility.progress) - Number(leftVisibility.progress) ||
        Number(rightVisibility.onSale) - Number(leftVisibility.onSale) ||
        Number(rightVisibility.known) - Number(leftVisibility.known) ||
        (leftCategory === -1 ? 999 : leftCategory) - (rightCategory === -1 ? 999 : rightCategory) ||
        left.name.localeCompare(right.name)
      );
    });
}

function renderShipCategoryOptions() {
  if (!fitShipCategory) {
    return;
  }
  const categories = [...new Set((state.bootstrap?.ships || []).map((ship) => ship.category).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  fitShipCategory.innerHTML = [
    `<option value="all">All</option>`,
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
  ].join("");
  fitShipCategory.value = categories.includes(state.fitShipCategory) ? state.fitShipCategory : "all";
}

function getKnownSystemNames() {
  const allSystems = state.status?.wiki?.systems || [];
  if (state.debugMode) {
    return new Set(allSystems.map((system) => system.name));
  }

  const names = new Set(state.status?.player?.knownSystems || []);
  if (state.status?.player?.currentSystem) {
    names.add(state.status.player.currentSystem);
  }
  return names;
}

function getLiveKnownSystemNames() {
  const names = new Set(state.status?.player?.knownSystems || []);
  if (state.status?.player?.currentSystem) {
    names.add(state.status.player.currentSystem);
  }
  return names;
}

function getWormholeEdges() {
  const edges = [];
  const seen = new Set();
  const systemsMap = getSystemsMap();
  for (const wormhole of state.bootstrap?.map?.wormholes || []) {
    for (const link of wormhole.links || []) {
      if (!systemsMap[link.from] || !systemsMap[link.to]) {
        continue;
      }
      const key = [link.from, link.to].sort().join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({
        name: wormhole.name,
        from: link.from,
        to: link.to,
        key,
      });
    }
  }
  return edges;
}

function getAtlasSystems() {
  const liveSystems = state.status?.wiki?.systems || [];
  const liveByName = new Map(liveSystems.map((system) => [system.name, system]));
  const systems = (state.bootstrap?.map?.systems || []).map((system) => {
    const live = liveByName.get(system.name);
    return {
      ...system,
      ...(live || {}),
      links: system.links || [],
      planets: live?.planets || [],
      prices: live?.prices || {},
      government: live?.government || system.government || null,
      hasTrade: Boolean(live?.hasTrade || system.hasTrade),
    };
  });
  if (state.debugMode) {
    return systems;
  }
  const knownNames = getKnownSystemNames();
  return systems.filter((system) => knownNames.has(system.name));
}

function getAllAtlasSystems() {
  const liveSystems = state.status?.wiki?.systems || [];
  const liveByName = new Map(liveSystems.map((system) => [system.name, system]));
  return (state.bootstrap?.map?.systems || []).map((system) => {
    const live = liveByName.get(system.name);
    return {
      ...system,
      ...(live || {}),
      links: system.links || [],
      planets: live?.planets || [],
      prices: live?.prices || {},
      government: live?.government || system.government || null,
      hasTrade: Boolean(live?.hasTrade || system.hasTrade),
    };
  });
}

function getOpenedPlanetNames() {
  const names = new Set(state.status?.player?.visitedPlanets || []);
  if (state.status?.player?.currentPlanet) {
    names.add(state.status.player.currentPlanet);
  }
  return names;
}

function filterOpenedLocations(locations = []) {
  if (state.debugMode) {
    return locations;
  }
  const openedPlanets = getOpenedPlanetNames();
  return locations.filter((location) => openedPlanets.has(location.planet));
}


function wikiVisibility(label, tone, opened = false) {
  return { label, tone, opened };
}

function renderWikiVisibilityPill(visibility) {
  if (!visibility?.label) {
    return "";
  }
  return `<span class="wiki-pill wiki-pill-state is-${escapeHtml(visibility.tone || "hidden")}">${escapeHtml(visibility.label)}</span>`;
}

function getWorldVisibility(planet, context) {
  const isCurrent = planet.name === context.currentPlanet;
  const visited = context.openedPlanets.has(planet.name) || isCurrent;
  if (isCurrent || visited) {
    return wikiVisibility("Opened", "opened", true);
  }

  const systemKnown = context.knownSystemNames.has(planet.system);
  const requiredReputation = Number(planet.requiredReputation || 0);
  const standing = getGovernmentStanding(planet.government || planet.systemGovernment || "");
  if (systemKnown && requiredReputation > 0 && standing !== null && standing < requiredReputation) {
    return wikiVisibility("Known but locked", "locked", false);
  }
  if (systemKnown) {
    return wikiVisibility("Not visited", "known", false);
  }
  return wikiVisibility("Hidden in live mode", "hidden", false);
}

function getShipVisibility(ship) {
  if (ship.owned) {
    return wikiVisibility("Opened", "opened", true);
  }
  if (ship.openedSaleLocations.length) {
    return wikiVisibility("Opened", "opened", true);
  }
  if (ship.seenSaleLocations.length || ship.knownOpenedSaleLocations.length) {
    return wikiVisibility("Seen", "seen", false);
  }
  if (ship.rawKnownSaleLocations.length || ship.rawProgressSaleLocations.length || ship.rawCurrentSaleLocations.length) {
    return wikiVisibility("Known but locked", "locked", false);
  }
  return wikiVisibility("Hidden in live mode", "hidden", false);
}

function getFactionVisibility(row, context) {
  if (context.logbookFactions.has(row.name) || context.encounteredGovernments.has(row.name) || row.value > -999.5) {
    return wikiVisibility("Opened", "opened", true);
  }
  return wikiVisibility("Hidden in live mode", "hidden", false);
}

function buildWikiData() {
  const atlasSystems = getAtlasSystems();
  const systemsMap = getSystemsMap();
  const basePlanetsMap = getBasePlanetMap();
  const currentSystem = state.status?.player?.currentSystem || null;
  const currentPlanet = state.status?.player?.currentPlanet || null;
  const liveKnownSystemNames = new Set(state.status?.player?.knownSystems || []);
  if (currentSystem) {
    liveKnownSystemNames.add(currentSystem);
  }
  const openedPlanets = getOpenedPlanetNames();
  const visitedSystems = new Set(state.status?.player?.visitedSystems || []);
  const ownedShipModels = getOwnedShipModelNames();
  const standingsRows = state.status?.player?.standings || [];
  const rawLogbook = state.status?.wiki?.logbook || { dated: [], named: {} };
  const logbookFactions = new Set(Object.keys(rawLogbook.named?.Factions || {}));
  const allPlanets = (state.status?.wiki?.planets || []).filter((planet) =>
    state.debugMode ? true : liveKnownSystemNames.has(planet.system)
  );
  const worlds = allPlanets
    .map((planet) => {
      const visibility = getWorldVisibility(planet, {
        currentPlanet,
        openedPlanets,
        knownSystemNames: liveKnownSystemNames,
      });
      return {
        ...planet,
        visited: openedPlanets.has(planet.name),
        current: planet.name === currentPlanet,
        visibility,
        shortCopy: clampCopy(
          firstCopyLine(
            visibility.opened || state.debugMode ? planet.descriptions : "",
            visibility.opened || state.debugMode ? planet.spaceport : ""
          ),
          220
        ),
      };
    })
    .filter((planet) => state.debugMode || planet.visibility.opened)
    .sort((left, right) =>
      (left.system || "").localeCompare(right.system || "") || left.name.localeCompare(right.name)
    );

  const systems = atlasSystems
    .map((system) => {
      const base = systemsMap[system.name] || {};
      const systemPlanets = allPlanets.filter((planet) => planet.system === system.name);
      const shipyardCount = systemPlanets.filter((planet) => planet.hasShipyard).length;
      const outfitterCount = systemPlanets.filter((planet) => planet.hasOutfitter).length;
      const visited = visitedSystems.has(system.name);
      const visibility = system.name === currentSystem
        ? wikiVisibility("Opened", "opened", true)
        : visited
          ? wikiVisibility("Opened", "opened", true)
          : liveKnownSystemNames.has(system.name)
            ? wikiVisibility("Seen", "seen", false)
            : wikiVisibility("Hidden in live mode", "hidden", false);
      return {
        ...system,
        government: base.government || null,
        visited,
        isCurrent: system.name === currentSystem,
        visibility,
        shipyardCount,
        outfitterCount,
        livePlanetCount: systemPlanets.length,
        pricesCount: Object.keys(system.prices || {}).length,
      };
    })
    .sort((left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent) ||
      Number(right.visited) - Number(left.visited) ||
      left.name.localeCompare(right.name)
    );

  const ships = uniqueByName(
    (state.bootstrap?.ships || [])
      .map((ship) => {
        const wiki = (state.status?.wiki?.ships || []).find((entry) => entry.name === ship.name) || null;
        const rawProgressSaleLocations = wiki?.progressSaleLocations || [];
        const rawCurrentSaleLocations = wiki?.currentSaleLocations || [];
        const rawKnownSaleLocations = wiki?.knownSaleLocations || [];
        const openedSaleLocations = rawProgressSaleLocations.filter((location) => openedPlanets.has(location.planet));
        const seenSaleLocations = rawCurrentSaleLocations.filter((location) => openedPlanets.has(location.planet));
        const knownOpenedSaleLocations = rawKnownSaleLocations.filter((location) => openedPlanets.has(location.planet));
        const owned = ownedShipModels.has(ship.name);
        const draft = {
          ...ship,
          owned,
          openedSaleLocations,
          seenSaleLocations,
          knownOpenedSaleLocations,
          rawProgressSaleLocations,
          rawCurrentSaleLocations,
          rawKnownSaleLocations,
        };
        const visibility = getShipVisibility(draft);
        const visible = state.debugMode || visibility.opened;
        if (!visible) {
          return null;
        }
        return {
          ...draft,
          visibility,
          shortCopy: clampCopy(ship.description, 220),
        };
      })
      .filter(Boolean)
  ).sort((left, right) =>
    Number(right.visibility.opened) - Number(left.visibility.opened) ||
    Number(right.owned) - Number(left.owned) ||
    Number(Boolean(right.openedSaleLocations.length)) - Number(Boolean(left.openedSaleLocations.length)) ||
    left.category.localeCompare(right.category) ||
    left.name.localeCompare(right.name)
  );

  const encounteredGovernments = new Set(
    [
      ...atlasSystems
        .filter((system) => liveKnownSystemNames.has(system.name))
        .map((system) => systemsMap[system.name]?.government || system.government),
      ...allPlanets
        .filter((planet) => liveKnownSystemNames.has(planet.system) || openedPlanets.has(planet.name))
        .map((planet) => planet.government || planet.systemGovernment),
    ].filter(Boolean)
  );
  const factions = standingsRows
    .map((row) => ({
      ...row,
      visibility: getFactionVisibility(row, { encounteredGovernments, logbookFactions }),
    }))
    .filter((row) => state.debugMode || row.visibility.opened)
    .sort(
      (left, right) =>
        Number(right.visibility.opened) - Number(left.visibility.opened) ||
        Number(right.name === "Republic") - Number(left.name === "Republic") ||
        Math.abs(right.value) - Math.abs(left.value) ||
        left.name.localeCompare(right.name)
    );

  const storyMissions = (state.status?.missions?.entries || [])
    .map((mission) => ({
      ...mission,
      visibility: mission.minor
        ? wikiVisibility("Hidden in live mode", "hidden", false)
        : wikiVisibility("Opened", "opened", true),
    }))
    .filter((mission) => state.debugMode || mission.visibility.opened)
    .sort(
      (left, right) =>
        Number(left.job) - Number(right.job) ||
        (left.name || left.id || "").localeCompare(right.name || right.id || "")
    )
    .map((mission) => ({
      ...mission,
      shortCopy: clampCopy(humanizeMissionSummary(mission), 220),
    }));

  const worldState = worlds
    .map((planet) => {
      const base = basePlanetsMap[planet.name] || null;
      const override = planet.saveOverride || null;
      if (!base && !override?.present) {
        return null;
      }
      const notes = humanizeWorldStateNotes(planet, base, override);
      if (!notes.length) {
        return null;
      }
      return {
        name: planet.name,
        system: planet.system,
        landscapeUrl: planet.landscapeUrl,
        notes,
        visibility: planet.visibility,
        overrideOnly: Boolean(override?.present) && !base,
      };
    })
    .filter(Boolean)
    .filter((entry) => state.debugMode || entry.visibility.opened)
    .sort((left, right) => (left.system || "").localeCompare(right.system || "") || left.name.localeCompare(right.name));

  const codexEntries = [];
  for (const [category, names] of Object.entries(rawLogbook.named || {})) {
    for (const [name, lines] of Object.entries(names)) {
      if (!name || !lines.length) continue;
      codexEntries.push({
        category,
        name,
        text: lines.join(" "),
        visibility: wikiVisibility("Opened", "opened", true),
      });
    }
  }
  codexEntries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const preferredLogbookCategoryOrder = ["Factions", "People", "Minor People"];
  const logbookGroupsMap = new Map();
  for (const entry of codexEntries) {
    if (!logbookGroupsMap.has(entry.category)) {
      logbookGroupsMap.set(entry.category, []);
    }
    logbookGroupsMap.get(entry.category).push(entry);
  }
  const logbookGroups = Array.from(logbookGroupsMap.entries())
    .sort((left, right) => {
      const leftRank = preferredLogbookCategoryOrder.indexOf(left[0]);
      const rightRank = preferredLogbookCategoryOrder.indexOf(right[0]);
      return (
        (leftRank === -1 ? 999 : leftRank) - (rightRank === -1 ? 999 : rightRank) ||
        left[0].localeCompare(right[0])
      );
    })
    .map(([category, entries]) => ({ category, entries }));

  const diaryEntries = [...(rawLogbook.dated || [])]
    .sort((a, b) => {
      const ay = a.year * 10000 + a.month * 100 + a.day;
      const by = b.year * 10000 + b.month * 100 + b.day;
      return by - ay;
    })
    .filter((d) => d.entries.length > 0)
    .map((entry) => ({
      ...entry,
      visibility: wikiVisibility("Opened", "opened", true),
    }));

  const diaryLineCount = diaryEntries.reduce((sum, entry) => sum + entry.entries.length, 0);
  const factionLogCount = logbookGroups.find((group) => group.category === "Factions")?.entries.length || 0;
  const peopleLogCount = logbookGroups.find((group) => group.category === "People")?.entries.length || 0;
  const minorPeopleLogCount =
    logbookGroups.find((group) => group.category === "Minor People")?.entries.length || 0;

  const counts = {
    systems: systems.length,
    worlds: worlds.length,
    ships: ships.length,
    factions: factions.length,
    story: storyMissions.length + worldState.length,
    logbook: codexEntries.length + diaryLineCount,
    factionLog: factionLogCount,
    peopleLog: peopleLogCount,
    minorPeopleLog: minorPeopleLogCount,
    diaryLines: diaryLineCount,
  };
  const openedCounts = {
    systems: systems.filter((entry) => entry.visibility?.opened).length,
    worlds: worlds.filter((entry) => entry.visibility?.opened).length,
    ships: ships.filter((entry) => entry.visibility?.opened).length,
    factions: factions.filter((entry) => entry.visibility?.opened).length,
    story:
      storyMissions.filter((entry) => entry.visibility?.opened).length +
      worldState.filter((entry) => entry.visibility?.opened).length,
    logbook: codexEntries.length + diaryLineCount,
  };

  return {
    currentSystem,
    currentPlanet,
    systems,
    worlds,
    ships,
    factions,
    story: {
      missions: storyMissions,
      worldState,
    },
    logbook: {
      codex: codexEntries,
      diary: diaryEntries,
      groups: logbookGroups,
    },
    counts,
    openedCounts,
  };
}

function updateAtlasMapViewBox() {
  if (!atlasMapSvg || !state.atlasMapView) {
    return;
  }
  const viewBox = `${state.atlasMapView.x} ${state.atlasMapView.y} ${state.atlasMapView.width} ${state.atlasMapView.height}`;
  atlasMapSvg.setAttribute("viewBox", viewBox);
  if (atlasMapOverlaySvg) {
    atlasMapOverlaySvg.setAttribute("viewBox", viewBox);
  }
  updateAtlasMapVisualScale();
}

function updateAtlasMapVisualScale() {
  const wrap = atlasMapSvg?.closest(".atlas-map-wrap");
  if (!wrap || !atlasMapOverlaySvg || !state.atlasMapView || !state.atlasMapVisualEntries?.length) {
    if (atlasMapOverlaySvg) {
      atlasMapOverlaySvg.innerHTML = "";
    }
    return;
  }

  const width = Math.max(1, wrap.clientWidth || wrap.getBoundingClientRect().width || 1);
  const height = Math.max(1, wrap.clientHeight || wrap.getBoundingClientRect().height || 1);
  const view = state.atlasMapView;
  const worldScale = Math.min(
    width / Math.max(1, view.width),
    height / Math.max(1, view.height)
  );
  const inverseScale = 1 / Math.max(worldScale, 0.0001);
  const renderedWidth = view.width * worldScale;
  const renderedHeight = view.height * worldScale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  const hitRadius = 12;
  const selectedRadius = 4.5;
  const currentRadius = 4.1;
  const defaultRadius = 2.2;
  const wrapRect = wrap.getBoundingClientRect();
  const blockedRects = [atlasMapPlanet, atlasMapMarket]
    .filter((element) => element && !element.hidden && element.innerHTML.trim())
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - wrapRect.left,
        right: rect.right - wrapRect.left,
        top: rect.top - wrapRect.top,
        bottom: rect.bottom - wrapRect.top,
      };
    });

  const overlayMarkup = state.atlasMapVisualEntries
    .filter((entry) => isAtlasEntryInView(entry, view, 10 * inverseScale))
    .map((entry) => {
      const screenX = offsetX + (entry.x - view.x) * worldScale;
      const screenY = offsetY + (entry.y - view.y) * worldScale;
      const estimatedWidth = Math.max(52, entry.name.length * 6.5);
      const estimatedHeight = 16;
      const candidates = [
        { dx: 8, dy: -8 },
        { dx: 8, dy: 14 },
        { dx: -estimatedWidth - 8, dy: -8 },
        { dx: -estimatedWidth - 8, dy: 14 },
        { dx: 14, dy: -24 },
        { dx: 14, dy: 28 },
      ];
      let labelDx = candidates[0].dx;
      let labelDy = candidates[0].dy;
      for (const candidate of candidates) {
        const labelLeft = screenX + candidate.dx - 2;
        const labelRight = labelLeft + estimatedWidth;
        const labelTop = screenY + candidate.dy - estimatedHeight + 2;
        const labelBottom = labelTop + estimatedHeight;
        const inBounds =
          labelLeft >= 4 &&
          labelRight <= width - 4 &&
          labelTop >= 4 &&
          labelBottom <= height - 4;
        if (!inBounds) {
          continue;
        }
        const overlaps = blockedRects.some(
          (rect) =>
            labelRight >= rect.left &&
            labelLeft <= rect.right &&
            labelBottom >= rect.top &&
            labelTop <= rect.bottom
        );
        if (!overlaps) {
          labelDx = candidate.dx;
          labelDy = candidate.dy;
          break;
        }
      }
      const nodeClass = [
        "atlas-node",
        entry.isCurrent ? "is-current" : "",
        entry.isSelected ? "is-selected" : "",
        entry.isUnknown ? "is-unknown" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const labelClass = [
        "atlas-map-label",
        entry.isCurrent ? "is-current" : "",
        entry.isSelected ? "is-selected" : "",
        entry.isUnknown ? "is-unknown" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const radius = entry.isSelected
        ? selectedRadius
        : entry.isCurrent
          ? currentRadius
          : defaultRadius;
      return `
        <g class="atlas-map-overlay-node" data-atlas-node="${escapeHtml(entry.name)}" transform="translate(${entry.x} ${entry.y}) scale(${inverseScale})">
          <circle cx="0" cy="0" r="${hitRadius}" class="atlas-node-hit" data-atlas-node="${escapeHtml(entry.name)}" />
          <circle cx="0" cy="0" r="${radius}" class="${nodeClass}" />
          <text x="${labelDx}" y="${labelDy}" class="${labelClass}" data-atlas-node="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</text>
        </g>
      `;
    })
    .join("");

  atlasMapOverlaySvg.innerHTML = overlayMarkup;
}

function getAtlasViewportMetrics() {
  const wrap = atlasMapSvg?.closest(".atlas-map-wrap");
  const rect = wrap?.getBoundingClientRect();
  return {
    width: Math.max(1, wrap?.clientWidth || rect?.width || 1),
    height: Math.max(1, wrap?.clientHeight || rect?.height || 1),
  };
}

function getAtlasDefaultViewForViewport(projection, bounds) {
  const { width, height } = getAtlasViewportMetrics();
  const sourceBounds = bounds || {
    minX: 0,
    maxX: projection.width,
    minY: 0,
    maxY: projection.height,
  };
  const fitted = fitViewBox(
    sourceBounds.minX,
    sourceBounds.minY,
    sourceBounds.maxX,
    sourceBounds.maxY,
    width,
    height,
    projection.width,
    projection.height
  );
  return clampAtlasView(fitted, projection, bounds);
}

function getAtlasFocusViewForNamesInViewport(names, projection, systemsMap, bounds, fallbackName = null, zoom = 0.22) {
  const entries = [...new Set(names)]
    .map((name) => systemsMap[name])
    .filter(Boolean)
    .map((system) => {
      const [x, y] = projection.project(system);
      return { x, y };
    });
  const { width, height } = getAtlasViewportMetrics();
  if (!entries.length) {
    if (fallbackName && systemsMap[fallbackName]) {
      const [x, y] = projection.project(systemsMap[fallbackName]);
      const span = projection.width * zoom;
      const fitted = fitViewBox(
        x - span / 2,
        y - span / 2,
        x + span / 2,
        y + span / 2,
        width,
        height,
        projection.width,
        projection.height
      );
      return clampAtlasView(fitted, projection, bounds);
    }
    return getAtlasDefaultViewForViewport(projection, bounds);
  }
  const xs = entries.map((entry) => entry.x);
  const ys = entries.map((entry) => entry.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, projection.width * 0.08);
  const padding = Math.max(40, span * 0.16);
  const fitted = fitViewBox(
    minX - padding,
    minY - padding,
    maxX + padding,
    maxY + padding,
    width,
    height,
    projection.width,
    projection.height
  );
  return clampAtlasView(fitted, projection, bounds);
}

function cancelAtlasMapAnimation() {
  if (state.atlasMapAnimationFrame !== null) {
    cancelAnimationFrame(state.atlasMapAnimationFrame);
    state.atlasMapAnimationFrame = null;
  }
}

function animateAtlasMapView(targetView, projection, duration = 260) {
  cancelAtlasMapAnimation();
  const startView = clampAtlasView(
    state.atlasMapView || getAtlasDefaultViewForViewport(projection, state.atlasAllBounds),
    projection,
    state.atlasAllBounds
  );
  const endView = clampAtlasView(targetView, projection, state.atlasAllBounds);

  if (
    Math.abs(startView.x - endView.x) < 0.5 &&
    Math.abs(startView.y - endView.y) < 0.5 &&
    Math.abs(startView.width - endView.width) < 0.5
  ) {
    state.atlasMapView = endView;
    updateAtlasMapViewBox();
    return;
  }

  const startedAt = performance.now();
  const step = (now) => {
    const t = clamp((now - startedAt) / duration, 0, 1);
    const eased = easeOutCubic(t);
    state.atlasMapView = {
      x: lerp(startView.x, endView.x, eased),
      y: lerp(startView.y, endView.y, eased),
      width: lerp(startView.width, endView.width, eased),
      height: lerp(startView.height, endView.height, eased),
    };
    updateAtlasMapViewBox();
    if (t < 1) {
      state.atlasMapAnimationFrame = requestAnimationFrame(step);
    } else {
      state.atlasMapAnimationFrame = null;
      state.atlasMapView = endView;
      updateAtlasMapViewBox();
    }
  };
  state.atlasMapAnimationFrame = requestAnimationFrame(step);
}

function ensureAtlasMapView(projection) {
  if (!state.atlasMapView || state.atlasMapProjectionKey !== projection.key) {
    cancelAtlasMapAnimation();
    state.atlasMapView = getAtlasDefaultViewForViewport(projection, state.atlasAllBounds);
    state.atlasMapProjectionKey = projection.key;
    return;
  }

  state.atlasMapProjectionKey = projection.key;
  state.atlasMapView = clampAtlasView(state.atlasMapView, projection, state.atlasAllBounds);
}

function focusAtlasSystem(systemName, options = {}) {
  if (!systemName) {
    return;
  }
  state.atlasSelectedSystem = systemName;
  state.atlasPendingFocus = {
    name: systemName,
    animate: options.animate !== false,
  };
  renderAtlas();
}

function getGovernmentStanding(government) {
  if (!government) {
    return null;
  }
  const standings = state.status?.player?.standings || [];
  const exact = standings.find((entry) => entry.name === government);
  if (exact) {
    return exact.value;
  }
  const simplified = government.replace(/\s*\([^)]*\)\s*$/, "");
  return standings.find((entry) => entry.name === simplified)?.value ?? null;
}

function pickAtlasLabelEntries(entries, currentSystem, selectedSystem) {
  const taken = [];
  const sorted = [...entries].sort((left, right) => {
    const leftPriority =
      Number(left.name === selectedSystem) * 4 +
      Number(left.name === currentSystem) * 3 +
      Number(Boolean(left.hasTrade)) * 2;
    const rightPriority =
      Number(right.name === selectedSystem) * 4 +
      Number(right.name === currentSystem) * 3 +
      Number(Boolean(right.hasTrade)) * 2;
    return rightPriority - leftPriority || left.name.localeCompare(right.name);
  });

  return sorted.filter((entry) => {
    const minDistance = entry.name === selectedSystem || entry.name === currentSystem ? 0 : 34;
    const canPlace = taken.every(
      (placed) => Math.hypot(entry.x - placed.x, entry.y - placed.y) >= minDistance
    );
    if (canPlace) {
      taken.push(entry);
    }
    return canPlace;
  });
}

function isAtlasEntryInView(entry, view, padding = 34) {
  if (!entry || !view) {
    return false;
  }
  return (
    entry.x >= view.x - padding &&
    entry.x <= view.x + view.width + padding &&
    entry.y >= view.y - padding &&
    entry.y <= view.y + view.height + padding
  );
}

function renderAtlasList() {
  const systems = getAtlasSystems();
  const search = atlasSearch.value.trim().toLowerCase();
  const currentSystem = state.status?.player?.currentSystem;
  const filtered = systems.filter((system) => {
    if (!search) {
      return true;
    }
    return (
      system.name.toLowerCase().includes(search) ||
      system.planets.some((planet) => planet.name.toLowerCase().includes(search))
    );
  });

  atlasSystemList.innerHTML = filtered.length
    ? filtered
        .map(
          (system) => {
            const shipCount = system.planets.reduce((sum, planet) => sum + (planet.shipCount || 0), 0);
            const outfitCount = system.planets.reduce((sum, planet) => sum + (planet.outfitCount || 0), 0);
            return `
            <button class="atlas-system-card ${system.name === state.atlasSelectedSystem ? "is-active" : ""}" data-atlas-system="${escapeHtml(system.name)}" type="button">
              <div class="atlas-system-card-head">
                <span>${escapeHtml(system.name)}</span>
                ${system.name === currentSystem ? `<span class="tag">Current</span>` : ""}
              </div>
              <div class="atlas-system-card-copy">
                ${system.prices ? `${Object.keys(system.prices).length} live prices` : "No live market prices yet"}
              </div>
              <div class="atlas-system-card-copy">
                ${system.planets.length ? `${system.planets.length} planets · ${shipCount} ships · ${outfitCount} outfits` : "No indexed landable planets"}
              </div>
            </button>
          `;
          }
        )
        .join("")
    : `<div class="empty-state">No systems match the current search.</div>`;

  atlasSystemList.querySelectorAll("[data-atlas-system]").forEach((button) => {
    button.addEventListener("click", () => {
      focusAtlasSystem(button.dataset.atlasSystem, { animate: true });
    });
  });
}

function renderAtlasMap() {
  const systems = getAtlasSystems();
  const allSystems = getAllAtlasSystems();
  const systemsMap = Object.fromEntries(allSystems.map((system) => [system.name, system]));
  const viewport = getAtlasViewportMetrics();
  const currentSystem = state.status?.player?.currentSystem;
  const selectedSystem = state.atlasSelectedSystem;
  const liveKnownNames = getLiveKnownSystemNames();
  const knownNames = getKnownSystemNames();
  let visibleNameSet = new Set(
    state.debugMode ? systems.map((system) => system.name) : Array.from(knownNames)
  );
  let focusNameSet = new Set(state.debugMode ? Array.from(liveKnownNames) : Array.from(knownNames));
  if (currentSystem) {
    visibleNameSet.add(currentSystem);
    focusNameSet.add(currentSystem);
  }
  if (selectedSystem && systemsMap[selectedSystem]) {
    if (state.debugMode && !liveKnownNames.has(selectedSystem)) {
      const component = getConnectedSystemComponents().find((entry) => entry.has(selectedSystem));
      focusNameSet = component ? new Set(component) : new Set([selectedSystem]);
    } else {
      visibleNameSet.add(selectedSystem);
      focusNameSet.add(selectedSystem);
    }
  }
  const visibleSystems = systems.filter((system) => visibleNameSet.has(system.name));
  const projection = getAtlasMapProjection(allSystems, viewport.width / Math.max(1, viewport.height));
  state.atlasMapProjectionWidth = projection?.width ?? 1800;
  if (!projection) {
    atlasMapSvg.innerHTML = "";
    if (atlasMapOverlaySvg) {
      atlasMapOverlaySvg.innerHTML = "";
    }
    if (atlasMapMarket) {
      atlasMapMarket.innerHTML = "";
    }
    if (atlasMapStock) {
      atlasMapStock.innerHTML = "";
    }
    if (atlasMapPlanet) {
      atlasMapPlanet.innerHTML = "";
    }
    return;
  }

  const lines = new Set();
  const wormholeEdges = getWormholeEdges();
  const wormholeKeys = new Set(wormholeEdges.map((edge) => edge.key));
  let linkMarkup = "";
  for (const system of visibleSystems) {
    for (const next of system.links || []) {
      if (!systemsMap[next] || !visibleNameSet.has(next)) {
        continue;
      }
      const key = [system.name, next].sort().join("|");
      if (lines.has(key) || wormholeKeys.has(key)) {
        continue;
      }
      lines.add(key);
      const [x1, y1] = projection.project(system);
      const [x2, y2] = projection.project(systemsMap[next]);
      linkMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mini-link" />`;
    }
  }
  let wormholeMarkup = "";
  for (const edge of wormholeEdges) {
    if (!visibleNameSet.has(edge.from) || !visibleNameSet.has(edge.to)) {
      continue;
    }
    const [x1, y1] = projection.project(systemsMap[edge.from]);
    const [x2, y2] = projection.project(systemsMap[edge.to]);
    wormholeMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mini-link mini-link-wormhole" />`;
  }

  const allPointEntries = allSystems.map((system) => {
    const [x, y] = projection.project(system);
    return { ...system, x, y };
  });
  const pointEntryMap = new Map(allPointEntries.map((entry) => [entry.name, entry]));
  const pointEntries = visibleSystems
    .map((system) => pointEntryMap.get(system.name))
    .filter(Boolean);
  if (allPointEntries.length > 0) {
    const xs = allPointEntries.map((e) => e.x);
    const ys = allPointEntries.map((e) => e.y);
    state.atlasAllBounds = {
      minX: Math.min(...xs) - projection.padding,
      maxX: Math.max(...xs) + projection.padding,
      minY: Math.min(...ys) - projection.padding,
      maxY: Math.max(...ys) + projection.padding,
    };
  } else {
    state.atlasAllBounds = null;
  }
  const initialFocusEntry =
    pointEntries.find((entry) => entry.name === selectedSystem) ||
    pointEntries.find((entry) => entry.name === currentSystem) ||
    pointEntries[0] ||
    null;
  if (!state.atlasMapView || state.atlasMapProjectionKey !== projection.key) {
    cancelAtlasMapAnimation();
    state.atlasMapProjectionKey = projection.key;
      state.atlasMapView = getAtlasFocusViewForNamesInViewport(
      [...focusNameSet],
      projection,
      systemsMap,
      state.atlasAllBounds,
      initialFocusEntry?.name || currentSystem || selectedSystem || null
    );
  } else {
    state.atlasMapProjectionKey = projection.key;
    state.atlasMapView = clampAtlasView(state.atlasMapView, projection, state.atlasAllBounds);
  }
  const pendingFocus =
    state.atlasPendingFocus &&
    pointEntries.find((entry) => entry.name === state.atlasPendingFocus.name);
  if (pendingFocus) {
    const pendingFocusNames =
      state.debugMode && !liveKnownNames.has(state.atlasPendingFocus.name)
        ? (() => {
            const component = getConnectedSystemComponents().find((entry) =>
              entry.has(state.atlasPendingFocus.name)
            );
            return component ? [...component] : [state.atlasPendingFocus.name];
          })()
        : [state.atlasPendingFocus.name];
    const targetView = getAtlasFocusViewForNamesInViewport(
      pendingFocusNames,
      projection,
      systemsMap,
      state.atlasAllBounds,
      state.atlasPendingFocus.name
    );
    if (state.atlasPendingFocus.animate) {
      animateAtlasMapView(targetView, projection);
    } else {
      state.atlasMapView = targetView;
    }
    state.atlasPendingFocus = null;
  }
  const atlasView = clampAtlasView(
    state.atlasMapView || getAtlasDefaultViewForViewport(projection, state.atlasAllBounds),
    projection,
    state.atlasAllBounds
  );
  state.atlasMapView = atlasView;
  const atlasWrap = atlasMapSvg.closest(".atlas-map-wrap");

  state.atlasMapVisualEntries = pointEntries.map((system) => ({
    name: system.name,
    x: system.x,
    y: system.y,
    isCurrent: system.name === currentSystem,
    isSelected: system.name === selectedSystem,
    isUnknown: !knownNames.has(system.name),
  }));

  atlasMapSvg.innerHTML = `
    <rect x="0" y="0" width="${projection.width}" height="${projection.height}" class="map-bg" />
    ${linkMarkup}
    ${wormholeMarkup}
  `;
  updateAtlasMapViewBox();

  const selected = getAtlasSystems().find((system) => system.name === selectedSystem) || null;
  const currentPrices =
    getAtlasSystems().find((system) => system.name === currentSystem)?.prices || null;
  const livePlanets = (state.status?.wiki?.planets || []).filter(
    (planet) => planet.system === selectedSystem
  );

  if (atlasMapMarket) {
    if (!selected) {
      atlasMapMarket.innerHTML = "";
    } else {
      const isCurrentSystem = selected.name === currentSystem;
      const government =
        livePlanets.find((planet) => planet.government)?.government ||
        livePlanets[0]?.systemGovernment ||
        "";
      const marketRows = MARKET_COMMODITY_ORDER.filter(
        (commodity) => typeof selected.prices?.[commodity] === "number"
      )
        .map((commodity) => {
          const price = selected.prices[commodity];
          const delta =
            typeof currentPrices?.[commodity] === "number" ? price - currentPrices[commodity] : null;
          const tone =
            delta === null ? "neutral" : delta > 0 ? "up" : delta < 0 ? "down" : "equal";
          return {
            commodity,
            price,
            delta,
            tone,
          };
        });

      atlasMapMarket.innerHTML = `
        <div class="atlas-market-head">
          <div class="atlas-market-title">${escapeHtml(selected.name)}</div>
          <div class="atlas-market-subtitle">${escapeHtml(isCurrentSystem ? "Current local prices" : government || "Unknown government")}</div>
        </div>
        ${
          marketRows.length
            ? `<div class="atlas-market-table">
                ${marketRows
                  .map(
                    (row) => {
                      const valueStr = isCurrentSystem
                        ? formatNumber(row.price)
                        : row.delta === null
                          ? "—"
                          : (row.delta > 0 ? "+" : "") + formatNumber(row.delta);
                      const valueClass = isCurrentSystem ? "atlas-market-value is-price" : `atlas-market-delta is-${row.tone}`;
                      return `
                      <div class="atlas-market-row">
                        <div class="atlas-market-commodity">${escapeHtml(row.commodity)}</div>
                        <div class="${valueClass}">${valueStr}</div>
                      </div>
                    `;}
                  )
                  .join("")}
              </div>`
            : `<div class="atlas-market-empty">No live prices for this system.</div>`
        }
      `;
    }
  }

  if (atlasMapPlanet) {
    if (!selected) {
      atlasMapPlanet.innerHTML = "";
    } else {
      const visitedPlanets = new Set(state.status?.player?.visitedPlanets || []);
      const preferredPlanet =
        livePlanets.find(
          (planet) =>
            planet.name === state.status?.player?.currentPlanet && selectedSystem === currentSystem
        ) ||
        livePlanets.find((planet) => visitedPlanets.has(planet.name)) ||
        livePlanets[0] ||
        null;

      if (!livePlanets.length) {
        const government = selected.government || "Unknown government";
        atlasMapPlanet.innerHTML = `
          <div class="atlas-planet-copy-mini">
            <div class="atlas-planet-name-mini">${escapeHtml(selected.name)}</div>
            <div class="atlas-planet-gov-mini">${escapeHtml(government)}</div>
            <div class="atlas-planet-service">No indexed planets</div>
          </div>
        `;
      } else {
        const shipsTotal = livePlanets.flatMap((p) => p.shipItems || []).length;
        const outfitsTotal = livePlanets.flatMap((p) => p.outfitItems || []).length;
        const planetRows = livePlanets.map((planet) => {
          const standing = getGovernmentStanding(planet.government || planet.systemGovernment || "");
          const req = planet.requiredReputation ?? 0;
          const accessLabel =
            standing !== null && standing < req ? "Gated"
            : standing !== null && standing < 0 ? "Hostile"
            : "Friendly";
          const accessClass = accessLabel === "Hostile" ? "bad" : accessLabel === "Gated" ? "warn" : "good";
          const isVisited = visitedPlanets.has(planet.name);
          const tags = [
            `<span class="atlas-ptag is-${accessClass}">${escapeHtml(accessLabel)}</span>`,
            planet.shipyards.length ? `<span class="atlas-ptag">Shipyard</span>` : "",
            planet.outfitters.length ? `<span class="atlas-ptag">Outfitter</span>` : "",
            isVisited ? `<span class="atlas-ptag is-visited">Visited</span>` : `<span class="atlas-ptag is-unvisited">Unvisited</span>`,
          ].filter(Boolean).join("");
          return `
            <div class="atlas-planet-row">
              <div class="atlas-planet-row-name">${escapeHtml(planet.name)}</div>
              <div class="atlas-planet-row-tags">${tags}</div>
            </div>
          `;
        }).join("");
        const gov = livePlanets[0]?.systemGovernment || livePlanets[0]?.government || "";
        atlasMapPlanet.innerHTML = `
          <div class="atlas-planet-copy-mini">
            <div class="atlas-planet-name-mini">${escapeHtml(selected.name)}</div>
            ${gov ? `<div class="atlas-planet-gov-mini">${escapeHtml(gov)}</div>` : ""}
            ${shipsTotal ? `<div class="atlas-planet-gov-mini">${formatNumber(shipsTotal)} ships · ${formatNumber(outfitsTotal)} outfits</div>` : ""}
          </div>
          <div class="atlas-planet-list">${planetRows}</div>
        `;
      }
    }
  }

  if (atlasMapStock) {
    atlasMapStock.innerHTML = "";
  }

  atlasWrap.onpointerdown = (event) => {
    event.preventDefault();
    cancelAtlasMapAnimation();
    const rect = atlasWrap.getBoundingClientRect();
    const hitNode = event.target?.closest?.("[data-atlas-node]");
    state.atlasMapDrag = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: state.atlasMapView?.x || 0,
      startY: state.atlasMapView?.y || 0,
      widthPx: rect.width,
      heightPx: rect.height,
      moved: false,
      hitSystem: hitNode?.dataset?.atlasNode || null,
    };
  };
  atlasWrap.onpointermove = (event) => {
    if (!state.atlasMapDrag || !state.atlasMapView) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - state.atlasMapDrag.startClientX;
    const dy = event.clientY - state.atlasMapDrag.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.atlasMapDrag.moved = true;
    }
    const nextView = clampAtlasView(
      {
        ...state.atlasMapView,
        x:
          state.atlasMapDrag.startX -
          (dx / Math.max(1, state.atlasMapDrag.widthPx)) * state.atlasMapView.width,
        y:
          state.atlasMapDrag.startY -
          (dy / Math.max(1, state.atlasMapDrag.heightPx)) * state.atlasMapView.height,
      },
      projection,
      state.atlasAllBounds
    );
    state.atlasMapView = nextView;
    updateAtlasMapViewBox();
  };
  atlasWrap.onpointerup = () => {
    const drag = state.atlasMapDrag;
    state.atlasMapDrag = null;
    if (drag?.moved) {
      state.atlasSuppressClickUntil = Date.now() + 180;
      return;
    }
    if (drag?.hitSystem) {
      focusAtlasSystem(drag.hitSystem, { animate: true });
    }
  };
  atlasWrap.onpointerleave = () => {
    state.atlasMapDrag = null;
  };
  atlasWrap.onpointercancel = () => {
    state.atlasMapDrag = null;
  };
  atlasWrap.onwheel = (event) => {
    event.preventDefault();
    cancelAtlasMapAnimation();
    const rect = atlasWrap.getBoundingClientRect();
    const currentView = clampAtlasView(
      state.atlasMapView || getAtlasDefaultViewForViewport(projection, state.atlasAllBounds),
      projection,
      state.atlasAllBounds
    );
    const pointerX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const pointerY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    const worldX = currentView.x + currentView.width * pointerX;
    const worldY = currentView.y + currentView.height * pointerY;
    const zoomFactor = event.deltaY > 0 ? 1.15 : 0.82;
    const b2 = state.atlasAllBounds;
    const maxZoomOut = b2
      ? Math.max(projection.width * 1.45, b2.maxX - b2.minX + projection.padding * 2, b2.maxY - b2.minY + projection.padding * 2)
      : projection.width * 1.45;
    const aspect = currentView.width / Math.max(1, currentView.height);
    const nextWidth = clamp(currentView.width * zoomFactor, projection.width * 0.035, maxZoomOut);
    const nextHeight = nextWidth / Math.max(aspect, 0.0001);
    state.atlasMapView = clampAtlasView(
      {
        x: worldX - nextWidth * pointerX,
        y: worldY - nextHeight * pointerY,
        width: nextWidth,
        height: nextHeight,
      },
      projection,
      state.atlasAllBounds
    );
    updateAtlasMapViewBox();
  };
}

function renderAtlasDetail() {
  if (atlasDetail) {
    atlasDetail.innerHTML = "";
  }
}

function renderAtlas() {
  renderAtlasList();
  renderAtlasMap();
  renderAtlasDetail();
}

function renderWiki() {
  if (!wikiNav || !wikiContent) {
    return;
  }
  if (!state.bootstrap || !state.status) {
    wikiNav.innerHTML = "";
    wikiContent.innerHTML = `<div class="empty-state">Loading wiki…</div>`;
    return;
  }

  const data = buildWikiData();
  const chapterMeta = (key, fallbackCopy) => {
    if (!key) {
      return fallbackCopy;
    }
    if (state.debugMode) {
      return `${formatNumber(data.counts[key] || 0)} shown · ${formatNumber(data.openedCounts[key] || 0)} opened`;
    }
    return `${formatNumber(data.openedCounts[key] || 0)} unlocked`;
  };
  const chapters = [
    {
      id: "wiki-overview",
      key: null,
      title: "Overview",
      count: null,
      copy: "Live field manual built from the active save.",
    },
    {
      id: "wiki-logbook",
      key: "logbook",
      title: "Logbook",
      count: data.counts.logbook,
      copy: "Codex entries and diary unlocked in this save.",
    },
    {
      id: "wiki-worlds",
      key: "worlds",
      title: "Worlds",
      count: data.counts.worlds,
      copy: "Visited planets, lore, and services.",
    },
    {
      id: "wiki-ships",
      key: "ships",
      title: "Ships",
      count: data.counts.ships,
      copy: "Owned hulls and models seen on visited markets.",
    },
    {
      id: "wiki-factions",
      key: "factions",
      title: "Factions",
      count: data.counts.factions,
      copy: "Governments and current standings.",
    },
    {
      id: "wiki-story",
      key: "story",
      title: "Story",
      count: data.counts.story,
      copy: "Active missions and world-state changes.",
    },
  ];

  wikiNav.innerHTML = chapters
    .map(
      (chapter) => `
        <button class="wiki-nav-button" data-wiki-target="${chapter.id}" type="button">
          <span class="wiki-nav-title">${escapeHtml(chapter.title)}</span>
          <span class="wiki-nav-meta">${escapeHtml(chapterMeta(chapter.key, chapter.copy))}</span>
        </button>
      `
    )
    .join("");

  const systemsMarkup = data.systems.length
    ? data.systems
        .map(
          (system) => `
            <article class="wiki-card wiki-system-card">
              <div class="wiki-card-head">
                <div>
                  <div class="wiki-card-title">${escapeHtml(system.name)}</div>
                  <div class="wiki-card-meta">${escapeHtml(system.government || "Unknown government")}</div>
                </div>
                <div class="wiki-chip-row">
                  ${renderWikiVisibilityPill(system.visibility)}
                  ${system.isCurrent ? `<span class="wiki-pill is-current">Current</span>` : ""}
                </div>
              </div>
              <div class="wiki-system-stats">
                <span class="wiki-chip">${formatNumber(system.livePlanetCount)} worlds</span>
                <span class="wiki-chip">${formatNumber(system.pricesCount)} prices</span>
                <span class="wiki-chip">${formatNumber(system.shipyardCount)} shipyards</span>
                <span class="wiki-chip">${formatNumber(system.outfitterCount)} outfitters</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="wiki-empty">No known systems yet.</div>`;

  const worldsMarkup = data.worlds.length
    ? data.worlds
        .map(
          (planet) => {
            const desc = (planet.descriptions || []).join(" ").trim() ||
              (planet.spaceport || []).join(" ").trim() || "";
            return `
            <article class="wiki-card wiki-world-card">
              ${planet.landscapeUrl
                ? `<div class="wiki-world-landscape"><img src="${escapeHtml(planet.landscapeUrl)}" alt="${escapeHtml(planet.name)}" onerror="this.parentElement.style.display='none'" /></div>`
                : ""}
              <div class="wiki-entity-body">
                <div class="wiki-card-head">
                  <div>
                    <div class="wiki-card-title">${escapeHtml(planet.name)}</div>
                    <div class="wiki-card-meta">${escapeHtml(planet.system || "Unknown system")} · ${escapeHtml(planet.government || planet.systemGovernment || "Unknown government")}</div>
                  </div>
                  <div class="wiki-chip-row">
                    ${renderWikiVisibilityPill(planet.visibility)}
                    ${planet.current ? `<span class="wiki-pill is-current">Current</span>` : ""}
                    ${planet.hasShipyard ? `<span class="wiki-chip">Shipyard</span>` : ""}
                    ${planet.hasOutfitter ? `<span class="wiki-chip">Outfitter</span>` : ""}
                    ${planet.requiredReputation > 0 ? `<span class="wiki-chip">Rep ${formatNumber(planet.requiredReputation)}</span>` : ""}
                  </div>
                </div>
                ${desc ? `<p class="wiki-card-copy">${escapeHtml(desc)}</p>` : ""}
              </div>
            </article>
          `;}
        )
        .join("")
    : `<div class="wiki-empty">No visited worlds yet.</div>`;

  const shipsMarkup = data.ships.length
    ? data.ships
        .map(
          (ship) => `
            <article class="wiki-card wiki-ship-card">
              <div class="wiki-entity-art">
                ${
                  ship.thumbnailUrl || ship.spriteUrl
                    ? `<img src="${escapeHtml(ship.thumbnailUrl || ship.spriteUrl)}" alt="${escapeHtml(ship.name)}" />`
                    : `<div class="wiki-art-placeholder"></div>`
                }
              </div>
              <div class="wiki-entity-body">
                <div class="wiki-card-head">
                  <div>
                    <div class="wiki-card-title">${escapeHtml(ship.name)}</div>
                    <div class="wiki-card-meta">${escapeHtml(ship.category)} · ${formatCredits(ship.attributes.cost || 0)}</div>
                  </div>
                  <div class="wiki-chip-row">
                    ${renderWikiVisibilityPill(ship.visibility)}
                    ${ship.owned ? `<span class="wiki-chip">Owned hull</span>` : ""}
                    ${!ship.owned && ship.openedSaleLocations.length ? `<span class="wiki-chip">Opened market</span>` : ""}
                    ${!ship.owned && !ship.openedSaleLocations.length && ship.seenSaleLocations.length ? `<span class="wiki-chip">Seen on sale</span>` : ""}
                  </div>
                </div>
                ${
                  ship.shortCopy
                    ? `<p class="wiki-card-copy">${escapeHtml(ship.shortCopy)}</p>`
                    : ""
                }
                <div class="wiki-chip-row">
                  <span class="wiki-chip">Shields ${formatNumber(ship.attributes.shields || 0)}</span>
                  <span class="wiki-chip">Hull ${formatNumber(ship.attributes.hull || 0)}</span>
                  <span class="wiki-chip">Cargo ${formatNumber(ship.attributes.cargoSpace || 0)}</span>
                  <span class="wiki-chip">Crew ${formatNumber(ship.attributes.requiredCrew || 0)}</span>
                </div>
                ${
                  ship.openedSaleLocations.length
                    ? `<div class="wiki-card-note">Opened market: ${escapeHtml(ship.openedSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                    : ship.seenSaleLocations.length
                      ? `<div class="wiki-card-note">Seen on opened worlds: ${escapeHtml(ship.seenSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                      : state.debugMode && ship.rawKnownSaleLocations.length
                        ? `<div class="wiki-card-note">Known sale data: ${escapeHtml(ship.rawKnownSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                      : ""
                }
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="wiki-empty">No opened ship dossiers yet.</div>`;

  const factionsMarkup = data.factions.length
    ? `
      <div class="wiki-faction-table">
        ${data.factions
          .map(
            (row) => `
              <div class="wiki-faction-row">
                <div class="wiki-faction-name">
                  <span>${escapeHtml(row.name)}</span>
                  ${renderWikiVisibilityPill(row.visibility)}
                </div>
                <div class="wiki-faction-value ${row.value >= 0 ? "good" : "bad"}">${row.value >= 0 ? "+" : ""}${formatTwoDecimals(row.value)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `
    : `<div class="wiki-empty">No faction records have been opened yet.</div>`;

  const missionsMarkup = data.story.missions.length
    ? data.story.missions
        .map(
          (mission) => `
            <article class="wiki-card wiki-story-card">
              <div class="wiki-card-head">
                <div>
                  <div class="wiki-card-title">${escapeHtml(mission.name || mission.id)}</div>
                  <div class="wiki-card-meta">${mission.job ? "Job" : "Mission"}${mission.deadline ? ` · due ${escapeHtml(shortDate(mission.deadline))}` : ""}</div>
                </div>
                <div class="wiki-chip-row">
                  ${renderWikiVisibilityPill(mission.visibility)}
                  ${mission.destination ? `<span class="wiki-pill is-open">${escapeHtml(mission.destination)}</span>` : ""}
                </div>
              </div>
              ${
                mission.shortCopy
                  ? `<p class="wiki-card-copy">${escapeHtml(mission.shortCopy)}</p>`
                  : `<p class="wiki-card-copy muted">No extra mission notes are stored in this save.</p>`
              }
            </article>
          `
        )
        .join("")
    : `<div class="wiki-empty">No active story threads are recorded right now.</div>`;

  const worldStateMarkup = data.story.worldState.length
    ? data.story.worldState
        .map(
          (entry) => `
            <article class="wiki-card wiki-worldstate-card">
              <div class="wiki-worldstate-head">
                <div>
                  <div class="wiki-worldstate-title">${escapeHtml(entry.name)}</div>
                  <div class="wiki-worldstate-meta">${escapeHtml(entry.system || "Unknown system")}</div>
                </div>
                <div class="wiki-chip-row">${renderWikiVisibilityPill(entry.visibility)}</div>
              </div>
              <div class="wiki-worldstate-list">
                ${entry.notes.map((note) => `<div class="wiki-worldstate-note">${escapeHtml(note)}</div>`).join("")}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="wiki-empty">No opened world-state changes are visible yet.</div>`;

  wikiContent.innerHTML = `
    <section id="wiki-overview" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Overview</h2>
          <p>${escapeHtml(state.debugMode ? "Debug mode shows locked and hidden dossiers, but every entry keeps an explicit spoiler-state label." : "This field manual stays inside the current save state. Unknown worlds, locked story branches, and unopened markets stay hidden.")}</p>
        </div>
      </div>
      <div class="wiki-overview-grid">
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Current location</div>
          <div class="wiki-stat-value">${escapeHtml(data.currentSystem || "Unknown")}</div>
          <div class="wiki-stat-copy">${escapeHtml(data.currentPlanet || "In transit")}</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Faction entries</div>
          <div class="wiki-stat-value">${formatNumber(data.counts.factionLog)}</div>
          <div class="wiki-stat-copy">Unlocked faction codex notes from the save logbook.</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">People</div>
          <div class="wiki-stat-value">${formatNumber(data.counts.peopleLog)}</div>
          <div class="wiki-stat-copy">Named people already recorded in the codex.</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Minor people</div>
          <div class="wiki-stat-value">${formatNumber(data.counts.minorPeopleLog)}</div>
          <div class="wiki-stat-copy">Side characters and local threads already unlocked.</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Diary lines</div>
          <div class="wiki-stat-value">${formatNumber(data.counts.diaryLines)}</div>
          <div class="wiki-stat-copy">Personal log entries currently stored in the save.</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Visited worlds</div>
          <div class="wiki-stat-value">${formatNumber(state.debugMode ? data.counts.worlds : data.openedCounts.worlds)}</div>
          <div class="wiki-stat-copy">${escapeHtml(state.debugMode ? `${formatNumber(data.openedCounts.worlds)} opened · ${formatNumber(data.counts.worlds - data.openedCounts.worlds)} still hidden in live mode.` : "World lore and local descriptions already seen.")}</div>
        </article>
        <article class="wiki-stat-card">
          <div class="wiki-stat-label">Story threads</div>
          <div class="wiki-stat-value">${formatNumber(state.debugMode ? data.counts.story : data.openedCounts.story)}</div>
          <div class="wiki-stat-copy">${escapeHtml(state.debugMode ? `${formatNumber(data.openedCounts.story)} opened · ${formatNumber(data.counts.story - data.openedCounts.story)} hidden or minor threads.` : "Active missions and world-state changes visible now.")}</div>
        </article>
      </div>
    </section>

    <section id="wiki-logbook" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Logbook</h2>
          <p>${escapeHtml(state.debugMode ? "Logbook stays spoiler-safe even in debug mode: it only contains entries already written into the save." : "Codex entries and diary notes unlocked in this save.")}</p>
        </div>
      </div>
      ${(() => {
        const { groups, diary } = data.logbook;
        if (!groups.length && !diary.length) {
          return `<div class="wiki-empty">No logbook entries found yet.</div>`;
        }

        const codexMarkup = groups.map(({ category, entries }) => `
          <div class="logbook-category">
            <div class="logbook-category-title-row">
              <div class="logbook-category-title">${escapeHtml(category)}</div>
              <div class="logbook-category-meta">${formatNumber(entries.length)} entries</div>
            </div>
            <div class="logbook-entries">
              ${entries.map((e) => `
                <article class="logbook-entry">
                  <div class="logbook-entry-head">
                    <div class="logbook-entry-name">${escapeHtml(e.name)}</div>
                    ${renderWikiVisibilityPill(e.visibility)}
                  </div>
                  <p class="logbook-entry-text">${escapeHtml(e.text)}</p>
                </article>
              `).join("")}
            </div>
          </div>
        `).join("");

        const diaryMarkup = diary.length ? `
          <div class="logbook-category">
            <div class="logbook-category-title-row">
              <div class="logbook-category-title">Diary</div>
              <div class="logbook-category-meta">${formatNumber(diary.length)} dates</div>
            </div>
            <div class="logbook-entries">
              ${diary.map((d) => `
                <article class="logbook-entry">
                  <div class="logbook-entry-head">
                    <div class="logbook-entry-date">${escapeHtml(shortDate(d))}</div>
                    ${renderWikiVisibilityPill(d.visibility)}
                  </div>
                  ${d.entries.map((line) => `<p class="logbook-entry-text">${escapeHtml(line)}</p>`).join("")}
                </article>
              `).join("")}
            </div>
          </div>
        ` : "";

        return `<div class="logbook-layout">${codexMarkup}${diaryMarkup}</div>`;
      })()}
    </section>

    <section id="wiki-worlds" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Worlds</h2>
          <p>${escapeHtml(state.debugMode ? "Debug mode includes unopened worlds and marks whether they are merely unvisited, reputation-gated, or hidden in live mode." : "Visited planets and the local lore already visible in the current save.")}</p>
        </div>
      </div>
      <div class="wiki-stack">${worldsMarkup}</div>
    </section>

    <section id="wiki-ships" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Ships</h2>
          <p>${escapeHtml(state.debugMode ? "Debug mode lists every hull in the data and marks whether it is opened, merely seen, locked behind markets, or still hidden in live mode." : "Ship descriptions, hull stats, and opened market sightings.")}</p>
        </div>
      </div>
      <div class="wiki-stack">${shipsMarkup}</div>
    </section>

    <section id="wiki-factions" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Factions</h2>
          <p>${escapeHtml(state.debugMode ? "Debug mode keeps every faction row, but hidden governments are marked instead of pretending they were opened." : "Governments and standings already tied to known space.")}</p>
        </div>
      </div>
      ${factionsMarkup}
    </section>

    <section id="wiki-story" class="wiki-section">
      <div class="panel-head">
        <div>
          <h2>Story</h2>
          <p>${escapeHtml(state.debugMode ? "Debug mode exposes minor and hidden save threads, but labels them instead of mixing them with opened story beats." : "Active threads and current-world changes visible in the save file.")}</p>
        </div>
      </div>
      <div class="wiki-story-columns">
        <div class="wiki-story-column">
          <div class="wiki-subhead">Active missions</div>
          <div class="wiki-stack">${missionsMarkup}</div>
        </div>
        <div class="wiki-story-column">
          <div class="wiki-subhead">World state</div>
          <div class="wiki-stack">${worldStateMarkup}</div>
        </div>
      </div>
    </section>
  `;

  wikiNav.querySelectorAll("[data-wiki-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.wikiTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderSettings() {
  if (!settingsOverview || !settingsSave || !settingsGame || !settingsPlanner) {
    return;
  }

  const saveInfo = getSaveInfo();
  const gameInfo = getGameInfo();
  const plannerSettings = getPlannerSettings();
  const operatingCostPerJump = Math.max(0, Math.round(Number(plannerSettings?.operatingCostPerJump) || 0));
  const salaryPerJump = Math.max(0, Math.round(Number(plannerSettings?.salaryPerJump) || 0));
  const debtPerJump = Math.max(0, Math.round(Number(plannerSettings?.debtPerJump) || 0));
  const illegalOutfitRiskPerJump = Math.max(0, Math.round(Number(plannerSettings?.illegalOutfitRiskPerJump) || 0));
  const illegalMissionRiskPerJump = Math.max(0, Math.round(Number(plannerSettings?.illegalMissionRiskPerJump) || 0));
  const scanBlockChance = Math.max(0, Math.min(1, Number(plannerSettings?.scanBlockChance) || 0));
  const illegalExposure = plannerSettings?.illegalExposure || {};
  const missionExposure = plannerSettings?.missionExposure || {};

  settingsOverview.innerHTML = [
    metricCard("Mode", DESKTOP_RUNTIME.isDesktop ? "Desktop" : "Web", DESKTOP_RUNTIME.isDesktop ? "Native pickers enabled" : "Runs in the browser"),
    metricCard("Config", saveInfo?.configPath || gameInfo?.configPath || "Not available", "Local per-user app config"),
    metricCard("Save", saveInfo?.available ? "Found" : "Missing", saveInfo?.recentPath || saveInfo?.defaultRecentPath || "No recent.txt path"),
    metricCard("Game data", gameInfo?.available ? "Found" : "Missing", gameInfo?.root || "No game folder detected"),
  ].join("");

  settingsSave.innerHTML = `
    <article class="settings-card">
      <div class="settings-card-head">
        <div>
          <h3>recent.txt</h3>
          <p>Active save discovery file.</p>
        </div>
        <span class="settings-state ${saveInfo?.available ? "is-ok" : "is-warning"}">${saveInfo?.available ? "Found" : "Missing"}</span>
      </div>
      <div class="settings-list">
        <div class="settings-row"><span>Using</span><strong>${escapeHtml(saveInfo?.recentPath || saveInfo?.defaultRecentPath || "Not detected")}</strong></div>
        <div class="settings-row"><span>Override</span><strong>${escapeHtml(saveInfo?.configuredRecentPath || "Automatic")}</strong></div>
        <div class="settings-row"><span>Config</span><strong>${escapeHtml(saveInfo?.configPath || "Not available")}</strong></div>
      </div>
      ${saveInfo?.issue ? `<div class="settings-note">${escapeHtml(saveInfo.issue)}</div>` : ""}
      <div class="settings-actions">
        <button class="button-primary" data-settings-open="recent" type="button">Choose recent.txt</button>
        <button class="button-secondary" data-settings-clear="recent" type="button">Use automatic path</button>
      </div>
    </article>
  `;

  settingsGame.innerHTML = `
    <article class="settings-card">
      <div class="settings-card-head">
        <div>
          <h3>Game folder</h3>
          <p>Installed Endless Sky data files.</p>
        </div>
        <span class="settings-state ${gameInfo?.available ? "is-ok" : "is-warning"}">${gameInfo?.available ? "Found" : "Missing"}</span>
      </div>
      <div class="settings-list">
        <div class="settings-row"><span>Using</span><strong>${escapeHtml(gameInfo?.root || "Not detected")}</strong></div>
        <div class="settings-row"><span>Override</span><strong>${escapeHtml(gameInfo?.configuredGameRoot || "Automatic")}</strong></div>
        <div class="settings-row"><span>Config</span><strong>${escapeHtml(gameInfo?.configPath || "Not available")}</strong></div>
      </div>
      ${gameInfo?.issue ? `<div class="settings-note">${escapeHtml(gameInfo.issue)}</div>` : ""}
      <div class="settings-actions">
        <button class="button-primary" data-settings-open="game" type="button">Choose game folder</button>
        <button class="button-secondary" data-settings-clear="game" type="button">Use automatic path</button>
      </div>
    </article>
  `;

  settingsPlanner.innerHTML = `
    <article class="settings-card">
      <div class="settings-card-head">
        <div>
          <h3>Automatic route cost</h3>
          <p>The planner subtracts this from every jump, including repositioning to the route start.</p>
        </div>
        <span class="settings-state ${operatingCostPerJump > 0 ? "is-ok" : "is-warning"}">${operatingCostPerJump > 0 ? `${formatNumber(operatingCostPerJump)} cr / jump` : "No recurring cost found"}</span>
      </div>
      <div class="settings-list">
        <div class="settings-row">
          <span>Total automatic cost</span>
          <strong>${formatCredits(operatingCostPerJump)}</strong>
        </div>
        <div class="settings-row">
          <span>Salary / jump</span>
          <strong>${formatCredits(salaryPerJump)}</strong>
        </div>
        <div class="settings-row">
          <span>Mortgage / jump</span>
          <strong>${formatCredits(debtPerJump)}</strong>
        </div>
        <div class="settings-row">
          <span>Illegal outfit risk / jump</span>
          <strong>${formatCredits(illegalOutfitRiskPerJump)}</strong>
        </div>
        <div class="settings-row">
          <span>Illegal mission risk / jump</span>
          <strong>${formatCredits(illegalMissionRiskPerJump)}</strong>
        </div>
        <div class="settings-row">
          <span>Illegal outfit exposure</span>
          <strong>${illegalExposure?.totalIllegalFine ? formatCredits(illegalExposure.totalIllegalFine) : "None detected"}</strong>
        </div>
        <div class="settings-row">
          <span>Active illegal mission fines</span>
          <strong>${missionExposure?.totalIllegalFine ? formatCredits(missionExposure.totalIllegalFine) : "None detected"}</strong>
        </div>
        <div class="settings-row">
          <span>Scan interference</span>
          <strong>${formatOneDecimal(illegalExposure?.totalScanInterference || 0)} · blocks about ${formatNumber(Math.round(scanBlockChance * 100))}% of scans</strong>
        </div>
        <div class="settings-row">
          <span>Cargo concealment</span>
          <strong>${formatOneDecimal(illegalExposure?.totalCargoConcealment || 0)}</strong>
        </div>
      </div>
      <div class="settings-note">This is a best-effort estimate from save data and official game data: salary, debt, active illegal missions, illegal outfits, and scan interference. Scripted or story-specific fines can still make the in-game result differ slightly.</div>
    </article>
  `;

  document.querySelectorAll("[data-settings-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openSavePathModal(button.dataset.settingsOpen === "game" ? "game" : "recent");
    });
  });

  document.querySelectorAll("[data-settings-clear]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = button.dataset.settingsClear === "game" ? "game" : "recent";
      await applyPathConfig(mode, "");
      rerenderAll();
    });
  });
}

function getShipWiki(shipName) {
  return (state.status?.wiki?.ships || []).find((ship) => ship.name === shipName) || null;
}

function renderFitBrowser() {
  const mode = state.fitterPane === "fits" ? "fits" : "ships";
  state.fitBrowserMode = mode;
  fitBrowserTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.fitBrowserTab === state.fitterPane);
  });

  const label = fitBrowserSearch.closest(".field")?.querySelector("span");
  if (label) {
    label.textContent = mode === "fits" ? "Find fit" : "Find ship";
  }
  if (fitShipCategoryField) {
    fitShipCategoryField.hidden = mode !== "ships";
  }
  fitBrowserSearch.placeholder =
    mode === "fits" ? "Escort, stock, flagship, convoy…" : "Geocoris, Shield Beetle, Behemoth…";

  const search = fitBrowserSearch.value.trim().toLowerCase();
  if (mode === "ships") {
    const selectedCategory = fitShipCategory?.value || "all";
    const ships = getBrowsableShips().filter((ship) => {
      if (selectedCategory !== "all" && ship.category !== selectedCategory) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        ship.name.toLowerCase().includes(search) ||
        ship.category.toLowerCase().includes(search) ||
        (ship.description || "").toLowerCase().includes(search)
      );
    });

    fitBrowserList.innerHTML = ships.length
      ? ships
        .map((ship) => {
            const availability = getShipAvailability(ship.name);
            const visibility = getShipVisibilityState(ship.name);
            const stateLabel = visibility.owned
              ? "Owned"
              : visibility.progress
                ? "Buyable"
                : availability.tone === "known"
                  ? "Gated"
                  : availability.tone === "available"
                    ? "On sale"
                    : "Restricted";
            const stateClass = visibility.owned
              ? "owned"
              : visibility.progress
                ? "buyable"
                : availability.tone === "known"
                  ? "known"
                  : availability.tone === "available"
                    ? "available"
                    : "unlisted";
            const compactDescription = (ship.description || "").trim();
            return `
              <article class="fit-browser-card ${ship.name === state.fitShipName ? "is-active" : ""}" data-load-stock-ship="${escapeHtml(ship.name)}">
                ${ship.thumbnailUrl ? `<img class="fit-browser-card-image" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(ship.name)}" />` : `<div class="fit-browser-card-image ship-thumb-placeholder"></div>`}
                <div class="fit-browser-card-body">
                  <div class="fit-browser-card-head">
                    <div class="fit-browser-card-title">${escapeHtml(ship.name)}</div>
                    <div class="fit-browser-card-state is-${escapeHtml(stateClass)}">${escapeHtml(stateLabel)}</div>
                  </div>
                  <div class="fit-browser-card-meta">${escapeHtml(ship.category)} · ${formatCredits(ship.attributes.cost || 0)} · ${formatNumber(ship.attributes.cargoSpace || 0)} cargo</div>
                  <div class="fit-browser-card-copy">${escapeHtml(availability.label)}</div>
                  ${compactDescription ? `<div class="fit-browser-card-copy fit-browser-card-copy-clamped">${escapeHtml(compactDescription)}</div>` : ""}
                  <div class="fit-browser-card-tags">
                    <span class="tag">${formatNumber(ship.attributes.weaponCapacity || 0)} weapon</span>
                    <span class="tag">${formatNumber(ship.attributes.engineCapacity || 0)} engine</span>
                    ${ship.licenses?.length ? `<span class="tag">${escapeHtml(ship.licenses.join(", "))}</span>` : ""}
                  </div>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state">${state.debugMode ? "No ships match the current search." : "No owned or currently available ships match the current search."}</div>`;

    fitBrowserList.querySelectorAll("[data-load-stock-ship]").forEach((card) => {
      card.addEventListener("click", () => {
        loadShipIntoFitter(card.dataset.loadStockShip);
      });
    });
    return;
  }

  const scopeShipName = state.fitListScopeShipName;
  const fitMatchesSearch = (fit) =>
    !search ||
    fit.name.toLowerCase().includes(search) ||
    fit.shipName.toLowerCase().includes(search) ||
    (fit.note || "").toLowerCase().includes(search);
  const fitMatchesScope = (fit) =>
    state.debugMode || !scopeShipName || fit.shipName === scopeShipName;

  const presets = (state.bootstrap?.fits?.presets || []).filter((fit) => fitMatchesSearch(fit) && fitMatchesScope(fit));
  const saved = (state.bootstrap?.fits?.saved || []).filter((fit) => fitMatchesSearch(fit) && fitMatchesScope(fit));

  const renderFitCard = (fit, type) => `
    <article class="fit-browser-card fit-browser-card-compact fit-browser-fit-card" data-load-fit-browser="${escapeHtml(fit.id)}" data-fit-type="${type}">
      <div class="fit-browser-fit-main">
        <div class="fit-browser-card-head">
          <div class="fit-browser-card-title">${escapeHtml(fit.name)}</div>
          ${type === "saved" ? `<button class="fit-delete-btn" data-delete-fit="${escapeHtml(fit.id)}" title="Delete fit" type="button">✕</button>` : ""}
        </div>
        <div class="fit-browser-card-meta">${escapeHtml(fit.shipName)}</div>
      </div>
      ${fit.note ? `<div class="fit-browser-fit-note">${escapeHtml(fit.note)}</div>` : `<div class="fit-browser-fit-note fit-browser-fit-note-empty">No note.</div>`}
    </article>
  `;

  fitBrowserList.innerHTML = `
    ${scopeShipName && !state.debugMode ? `<div class="fit-browser-scope"><span class="tag">Ship filter: ${escapeHtml(scopeShipName)}</span><button class="button-inline" id="clear-fit-scope" type="button">Show all fits</button></div>` : ""}
    <section class="fit-browser-section">
      <div class="fit-browser-section-title">Baseline fits</div>
      <div class="fit-browser-grid">
        ${presets.length ? presets.map((fit) => renderFitCard(fit, "preset")).join("") : `<div class="empty-state">No baseline fits match the current scope.</div>`}
      </div>
    </section>
    <section class="fit-browser-section">
      <div class="fit-browser-section-title">Saved fits</div>
      <div class="fit-browser-grid">
        ${saved.length ? saved.map((fit) => renderFitCard(fit, "saved")).join("") : `<div class="empty-state">No saved fits match the current scope.</div>`}
      </div>
    </section>
  `;

  document.getElementById("clear-fit-scope")?.addEventListener("click", () => {
    state.fitListScopeShipName = null;
    renderFitBrowser();
  });

  fitBrowserList.querySelectorAll("[data-load-fit-browser]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-fit]")) return;
      const type = card.dataset.fitType;
      if (type === "preset") {
        const fit = (state.bootstrap?.fits?.presets || []).find((item) => item.id === card.dataset.loadFitBrowser);
        if (fit) {
          loadShipIntoFitter(fit.shipName, fit.loadout || getStockLoadout(fit.shipName));
        }
      } else {
        const fit = (state.bootstrap?.fits?.saved || []).find((item) => item.id === card.dataset.loadFitBrowser);
        if (fit) {
          loadShipIntoFitter(fit.shipName, fit.loadout);
        }
      }
    });
  });

  fitBrowserList.querySelectorAll("[data-delete-fit]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteFit;
      const response = await fetch(`/api/fits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.ok) {
        const data = await response.json();
        state.bootstrap.fits.saved = data.fits;
        renderFitBrowser();
      }
    });
  });
}

function getFitterOwnedShips() {
  return [
    ...(state.status?.fleet?.activeShips || []),
    ...(state.status?.fleet?.parkedShips || []),
  ].map(normalizeShipDisplayShip);
}

function setFitSelection(outfitName = null) {
  state.fitSelectedOutfitName = outfitName;
  renderFitSelection();
}

function renderFitSelection() {
  const outfit = state.fitSelectedOutfitName ? getOutfitDefinition(state.fitSelectedOutfitName) : null;
  if (!outfit) {
    fitSelection.innerHTML = `
      <div class="fit-selection-empty">
        <div class="fit-selection-kicker">Module inspector</div>
        <div class="fit-selection-copy">Select a module or installed outfit to inspect it here.</div>
      </div>
    `;
    return;
  }

  const attr = outfit.attributes || {};
  const installedCount = state.fitLoadout[outfit.name] || 0;
  const installCheck = getInstallCheck(state.fitShipName, state.fitLoadout, outfit.name, 1);
  const outfitWiki = getOutfitWiki(outfit.name);
  const progressAvailable = Boolean(outfitWiki?.progressSaleLocations?.length);
  const currentSale = Boolean(outfitWiki?.currentSaleLocations?.length);
  const factChips = [];

  if (attr.cost) {
    factChips.push(`Price ${formatCredits(attr.cost)}`);
  }
  if (attr.outfitSpace) {
    factChips.push(`Outfit ${formatNumber(Math.abs(attr.outfitSpace))}`);
  }
  if (attr.weaponCapacity) {
    factChips.push(`Weapon ${formatNumber(Math.abs(attr.weaponCapacity))}`);
  }
  if (attr.engineCapacity) {
    factChips.push(`Engine ${formatNumber(Math.abs(attr.engineCapacity))}`);
  }
  if (attr.hullDamage || attr.shieldDamage) {
    factChips.push(`${formatOneDecimal(attr.hullDamage || 0)} hull / ${formatOneDecimal(attr.shieldDamage || 0)} shield`);
  }
  if (attr.antiMissile) {
    factChips.push(`AM ${formatNumber(attr.antiMissile)}`);
  }
  if (attr.energyGeneration) {
    factChips.push(`+${formatTwoDecimals(attr.energyGeneration)} energy`);
  }
  if (attr.energyCapacity) {
    factChips.push(`+${formatNumber(attr.energyCapacity)} battery`);
  }
  if (attr.cooling) {
    factChips.push(`+${formatNumber(attr.cooling)} cooling`);
  }
  if (attr.shieldGeneration) {
    factChips.push(`+${formatTwoDecimals(attr.shieldGeneration)} shields`);
  }
  if (attr.thrust) {
    factChips.push(`+${formatOneDecimal(attr.thrust)} thrust`);
  }
  if (attr.turn) {
    factChips.push(`+${formatOneDecimal(attr.turn)} turn`);
  }
  if (attr.radarJamming) {
    factChips.push(`Radar jam ${formatNumber(attr.radarJamming)}`);
  }
  if (attr.opticalJamming) {
    factChips.push(`Optical jam ${formatNumber(attr.opticalJamming)}`);
  }

  fitSelection.innerHTML = `
    <div class="fit-selection-card">
      <div class="fit-selection-media">
        ${outfit.imageUrl ? `<img class="fit-selection-image" src="${escapeHtml(outfit.imageUrl)}" alt="${escapeHtml(outfit.name)}" />` : `<div class="fit-selection-image outfit-icon-placeholder"></div>`}
      </div>
      <div class="fit-selection-body">
        <div class="fit-selection-head">
          <div class="fit-selection-heading">
            <div class="fit-selection-kicker">${escapeHtml(getSlotTypeLabel(outfit.slotType))} · ${escapeHtml(outfit.category)}</div>
            <div class="fit-selection-title">${escapeHtml(outfit.name)}</div>
          </div>
          <div class="fit-selection-tags">
            ${installedCount ? `<span class="tag is-owned">Installed ${formatNumber(installedCount)}</span>` : ""}
            ${progressAvailable ? `<span class="tag is-buyable">Buyable now</span>` : ""}
            ${!progressAvailable && currentSale ? `<span class="tag is-gated">On sale but gated</span>` : ""}
          </div>
        </div>
        <div class="fit-selection-copy">${escapeHtml(outfit.description || describeOutfit(outfit) || "No description available.")}</div>
        ${factChips.length ? `<div class="fit-selection-facts">${factChips.slice(0, 4).map((line) => `<span class="fit-selection-fact">${escapeHtml(line)}</span>`).join("")}</div>` : ""}
        ${!installCheck.ok ? `<div class="fit-selection-alert">${escapeHtml(installCheck.reason)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderFitOwnedShips() {
  const ships = getFitterOwnedShips();
  const targets = [fitOwnedShips, fitOwnedShipsCompact].filter(Boolean);
  if (!ships.length) {
    targets.forEach((target) => {
      target.innerHTML = `<div class="empty-state">No live ships available in the current save.</div>`;
    });
    return;
  }

  const markup = ships
    .map((ship) => {
      const shipId = ship.uuid || `${ship.model}-${ship.name}`;
      const isCurrent = state.fitSourceShipId === shipId;
      return `
        <button class="owned-ship-chip ${isCurrent ? "is-current" : ""}" data-owned-ship="${escapeHtml(shipId)}" type="button">
          ${ship.thumbnailUrl ? `<img class="owned-ship-image" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(ship.model)}" />` : `<div class="owned-ship-image ship-thumb-placeholder"></div>`}
          <span class="owned-ship-name">${escapeHtml(ship.name)}</span>
        </button>
      `;
    })
    .join("");

  targets.forEach((target) => {
    target.innerHTML = markup;
  });

  document.querySelectorAll("[data-owned-ship]").forEach((button) => {
    button.addEventListener("click", () => {
      const shipId = button.dataset.ownedShip;
      const ship = ships.find((candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === shipId);
      if (ship) {
        loadShipIntoFitter(ship.model, ship.outfits, shipId);
      }
    });
  });
}

function renderFitHeader(summary) {
  const ship = getShipDefinition(state.fitShipName);
  if (!ship || !summary) {
    fitHeader.innerHTML = `<div class="fit-ship-display is-empty"><div class="empty-state">Pick a ship to start building a fit.</div></div>`;
    return;
  }

  const liveShip = getFitterOwnedShips().find(
    (candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === state.fitSourceShipId
  );
  const shipWiki = getShipWiki(ship.name);
  const liveShipLabel = liveShip
    ? `${liveShip.name}${liveShip.parked ? " · parked" : ""}`
    : "Custom configuration";
  const availability = getShipAvailability(ship.name);
  const saleTags = availability.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  fitHeader.innerHTML = `
    <div class="fit-hero-row">
      <div class="fit-hero-media">
        ${ship.thumbnailUrl
          ? `<img class="fit-hero-image-inline" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(ship.name)}" />`
          : `<div class="fit-hero-image-inline fit-hero-placeholder"></div>`}
      </div>
      <div class="fit-hero-body">
        <div class="eyebrow">${escapeHtml(ship.category)}</div>
        <h2>${escapeHtml(ship.name)}</h2>
        <p class="fit-description">${escapeHtml(ship.description || "No description available.")}</p>
        <p class="fit-description muted">${escapeHtml(availability.label)}</p>
        ${saleTags ? `<div class="fit-header-tags">${saleTags}</div>` : ""}
        <div class="fit-header-meta">
          <div class="metric-pill">Fit value <strong>${formatCredits(summary.totalCost)}</strong></div>
          <div class="metric-pill">Outfit delta <strong>${summary.outfitDeltaCost >= 0 ? "+" : "-"}${formatCredits(Math.abs(summary.outfitDeltaCost))}</strong></div>
          <div class="metric-pill">Hull price <strong>${formatCredits(ship.attributes.cost || 0)}</strong></div>
          ${ship.licenses?.length ? `<div class="metric-pill">License <strong>${escapeHtml(ship.licenses.join(", "))}</strong></div>` : ""}
          <div class="metric-pill">Source <strong>${escapeHtml(liveShipLabel)}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderFitSummary() {
  if (!state.fitShipName) {
    fitHeader.innerHTML = `<div class="fit-ship-display is-empty"><div class="empty-state">Pick a ship to start building a fit.</div></div>`;
    fitSummary.innerHTML = "";
    fitLoadout.innerHTML = "";
    outfitCatalog.innerHTML = "";
    fitSelection.innerHTML = "";
    fitOwnedShips.innerHTML = "";
    if (fitOwnedShipsCompact) {
      fitOwnedShipsCompact.innerHTML = "";
    }
    return;
  }

  const summary = summarizeFit(state.fitShipName, state.fitLoadout, { includeSustain: true });
  const ship = getShipDefinition(state.fitShipName);
  renderFitSelection();
  renderFitOwnedShips();
  renderFitHeader(summary);
  if (!summary || !ship) {
    return;
  }

  const combat = summary.sustain?.combat;
  const row = (label, value, classes = "") => `
    <div class="fit-stat-row ${classes}">
      <span class="fit-stat-label">${escapeHtml(label)}</span>
      <span class="fit-stat-value">${value}</span>
    </div>
  `;
  const energyHeatRows = [
    {
      label: "Idle",
      energy: 60 * summary.idleEnergyPerFrame,
      heat: 60 * summary.idleHeatPerFrame,
    },
    {
      label: "Moving",
      energy: -60 * summary.movingEnergyPerFrame,
      heat: 60 * summary.movingHeatPerFrame,
    },
    {
      label: "Firing",
      energy: -60 * summary.firingEnergyPerFrame,
      heat: 60 * summary.firingHeatPerFrame,
    },
    {
      label: summary.repairLabel,
      energy: -60 * summary.shieldAndHullEnergyPerFrame,
      heat: 60 * summary.shieldAndHullHeatPerFrame,
    },
    {
      label: "Net change",
      energy: 60 * summary.netEnergyPerFrame,
      heat: 60 * summary.netHeatPerFrame,
      strong: true,
    },
    {
      label: "Max",
      energy: summary.energyCapacity,
      heat: summary.displayMaxHeat,
      strong: true,
    },
  ];

  fitSummary.innerHTML = `
    <section class="fit-stat-block">
      <div class="fit-stat-title">Ship</div>
      <div class="fit-stat-list">
        ${row("Model", escapeHtml(ship.name))}
        ${row("Category", escapeHtml(ship.category))}
        ${row("Shields", formatNumber(summary.shields))}
        ${row("Hull", formatNumber(summary.hull))}
        ${row("Mass", `${formatNumber(summary.mass)} tons`)}
        ${row("Cargo space", `${formatNumber(summary.cargoSpace)} tons`)}
        ${row("Crew / bunks", `${formatNumber(summary.requiredCrew)} / ${formatNumber(summary.bunks)}`)}
        ${row("Fuel capacity", formatNumber(summary.fuelCapacity))}
        ${row("Drive", `${escapeHtml(summary.driveName)} · ${formatNumber(summary.jumpCount)} jumps`)}
      </div>
    </section>
    <section class="fit-stat-block">
      <div class="fit-stat-title">Movement</div>
      <div class="fit-stat-list">
        ${row("Max speed", formatOneDecimal(summary.maxSpeed))}
        ${row("Acceleration", formatOneDecimal(summary.acceleration))}
        ${row("Turning", formatOneDecimal(summary.turning))}
      </div>
    </section>
    <section class="fit-stat-block">
      <div class="fit-stat-title">Capacity</div>
      <div class="fit-stat-list">
        ${row("Outfit space free", `${formatRemaining(summary.freeOutfit)} / ${formatNumber(ship.attributes.outfitSpace)}`, summary.freeOutfit < 0 ? "is-invalid" : "")}
        ${row("Weapon capacity", `${formatRemaining(summary.freeWeapon)} / ${formatNumber(ship.attributes.weaponCapacity)}`, summary.freeWeapon < 0 ? "is-invalid" : "")}
        ${row("Engine capacity", `${formatRemaining(summary.freeEngine)} / ${formatNumber(ship.attributes.engineCapacity)}`, summary.freeEngine < 0 ? "is-invalid" : "")}
        ${row("Gun ports free", `${formatRemaining(summary.freeGunPorts)} / ${formatNumber(ship.attributes.gunPorts)}`, summary.freeGunPorts < 0 ? "is-invalid" : "")}
        ${row("Turret mounts free", `${formatRemaining(summary.freeTurretMounts)} / ${formatNumber(ship.attributes.turretMounts)}`, summary.freeTurretMounts < 0 ? "is-invalid" : "")}
      </div>
    </section>
    <section class="fit-stat-block fit-energy-block">
      <div class="fit-stat-title">Energy / heat</div>
      <div class="fit-energy-table">
        <div class="fit-energy-head"></div>
        <div class="fit-energy-head">Energy</div>
        <div class="fit-energy-head">Heat</div>
        ${energyHeatRows
          .map(
            (item) => `
              <div class="fit-energy-label ${item.strong ? "is-strong" : ""}">${escapeHtml(item.label)}</div>
              <div class="fit-energy-value ${item.strong ? "is-strong" : ""}">${formatOneDecimal(item.energy)}</div>
              <div class="fit-energy-value ${item.strong ? "is-strong" : ""}">${formatOneDecimal(item.heat)}</div>
            `
          )
          .join("")}
      </div>
    </section>
    <section class="fit-stat-block">
      <div class="fit-stat-title">Combat</div>
      <div class="fit-stat-list">
        ${row("Hull DPS", formatOneDecimal(summary.hullDps))}
        ${row("Shield DPS", formatOneDecimal(summary.shieldDps))}
        ${row("Anti-missile", formatNumber(summary.antiMissile))}
        ${row("Jamming", `R ${formatNumber(summary.radarJamming)} · O ${formatNumber(summary.opticalJamming)} · IR ${formatNumber(summary.infraredJamming)}`)}
        ${row("Battery", combat?.batteryEmptyAt ? `Empty in ${formatDuration(combat.batteryEmptyAt)}` : "Stable", combat?.batteryEmptyAt ? "is-invalid" : "")}
        ${row("Heat", combat?.overheatedAt ? `Overheats in ${formatDuration(combat.overheatedAt)}` : "Stable", combat?.overheatedAt ? "is-invalid" : "")}
        ${row("Fit state", summary.valid ? `<span class="good">Valid</span>` : `<span class="bad">Invalid</span>`, !summary.valid ? "is-invalid" : "")}
      </div>
    </section>
  `;
}

function groupLoadoutEntries(loadout) {
  return Object.entries(loadout)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({
      name,
      count,
      outfit: getOutfitDefinition(name),
    }))
    .sort(
      (a, b) =>
        getFitCategoryOrder(a.outfit?.category || "Systems") -
          getFitCategoryOrder(b.outfit?.category || "Systems") ||
        a.name.localeCompare(b.name)
    );
}

function describeOutfit(outfit) {
  const attr = outfit.attributes;
  const parts = [];

  if (attr.outfitSpace) {
    parts.push(`O ${formatNumber(Math.abs(attr.outfitSpace))}`);
  }
  if (attr.weaponCapacity) {
    parts.push(`W ${formatNumber(Math.abs(attr.weaponCapacity))}`);
  }
  if (attr.engineCapacity) {
    parts.push(`E ${formatNumber(Math.abs(attr.engineCapacity))}`);
  }
  if (outfit.slotType === "gun" || outfit.slotType === "turret") {
    if (attr.hullDamage || attr.shieldDamage) {
      parts.push(`${formatOneDecimal(attr.hullDamage || 0)} hull`);
      parts.push(`${formatOneDecimal(attr.shieldDamage || 0)} shield`);
    }
    if (attr.antiMissile) {
      parts.push(`AM ${formatNumber(attr.antiMissile)}`);
    }
  } else {
    if (attr.energyGeneration) {
      parts.push(`+${formatTwoDecimals(attr.energyGeneration)} energy`);
    }
    if (attr.energyCapacity) {
      parts.push(`+${formatNumber(attr.energyCapacity)} battery`);
    }
    if (attr.cooling) {
      parts.push(`+${formatNumber(attr.cooling)} cooling`);
    }
    if (attr.shieldGeneration) {
      parts.push(`+${formatTwoDecimals(attr.shieldGeneration)} shields`);
    }
    if (attr.thrust) {
      parts.push(`+${formatOneDecimal(attr.thrust)} thrust`);
    }
    if (attr.turn) {
      parts.push(`+${formatOneDecimal(attr.turn)} turn`);
    }
    if (attr.radarJamming) {
      parts.push(`R jam ${formatNumber(attr.radarJamming)}`);
    }
    if (attr.opticalJamming) {
      parts.push(`O jam ${formatNumber(attr.opticalJamming)}`);
    }
  }

  return parts.slice(0, 4).join(" · ");
}

function buildOutfitTooltip(outfit, options = {}) {
  const includeWrapper = options.includeWrapper ?? true;
  const attr = outfit.attributes;
  const facts = [];

  if (attr.cost) {
    facts.push(`Price: ${formatCredits(attr.cost)}`);
  }
  if (attr.outfitSpace) {
    facts.push(`Outfit space: ${formatNumber(Math.abs(attr.outfitSpace))}`);
  }
  if (attr.weaponCapacity) {
    facts.push(`Weapon capacity: ${formatNumber(Math.abs(attr.weaponCapacity))}`);
  }
  if (attr.engineCapacity) {
    facts.push(`Engine capacity: ${formatNumber(Math.abs(attr.engineCapacity))}`);
  }
  if (attr.energyGeneration) {
    facts.push(`Energy generation: ${formatTwoDecimals(attr.energyGeneration)}`);
  }
  if (attr.energyCapacity) {
    facts.push(`Battery: ${formatNumber(attr.energyCapacity)}`);
  }
  if (attr.cooling) {
    facts.push(`Cooling: ${formatNumber(attr.cooling)}`);
  }
  if (attr.shieldGeneration) {
    facts.push(`Shield generation: ${formatTwoDecimals(attr.shieldGeneration)}`);
  }
  if (attr.thrust) {
    facts.push(`Thrust: ${formatOneDecimal(attr.thrust)}`);
  }
  if (attr.turn) {
    facts.push(`Turn: ${formatOneDecimal(attr.turn)}`);
  }
  if (attr.hullDamage || attr.shieldDamage) {
    facts.push(
      `Damage: ${formatOneDecimal(attr.hullDamage || 0)} hull / ${formatOneDecimal(attr.shieldDamage || 0)} shield`
    );
  }
  if (attr.antiMissile) {
    facts.push(`Anti-missile: ${formatNumber(attr.antiMissile)}`);
  }
  if (attr.radarJamming) {
    facts.push(`Radar jamming: ${formatNumber(attr.radarJamming)}`);
  }
  if (attr.opticalJamming) {
    facts.push(`Optical jamming: ${formatNumber(attr.opticalJamming)}`);
  }

  const content = `
    <div class="outfit-tooltip-title">${escapeHtml(outfit.name)}</div>
    <div class="outfit-tooltip-subtitle">${escapeHtml(getSlotTypeLabel(outfit.slotType))} · ${escapeHtml(outfit.category)}</div>
    ${outfit.description ? `<div class="tooltip-copy">${escapeHtml(outfit.description)}</div>` : ""}
    ${facts.length ? `<div class="tooltip-facts">${facts.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>` : ""}
  `;
  return includeWrapper ? `<div class="outfit-tooltip">${content}</div>` : content;
}

function groupEntriesByCategory(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const category = entry.outfit?.category || "Systems";
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(entry);
  }

  return Array.from(groups.entries()).sort(
    ([left], [right]) => getFitCategoryOrder(left) - getFitCategoryOrder(right)
  );
}

function groupCatalogEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const section = getCatalogSection(entry.outfit?.category || "Systems");
    if (!groups.has(section)) {
      groups.set(section, []);
    }
    groups.get(section).push(entry);
  }

  return Array.from(groups.entries()).sort(
    ([left], [right]) => CATALOG_SECTION_ORDER.indexOf(left) - CATALOG_SECTION_ORDER.indexOf(right)
  );
}

function bindFitterSelectionTargets(container) {
  container.querySelectorAll("[data-select-outfit]").forEach((element) => {
    const outfitName = element.dataset.selectOutfit;
    element.addEventListener("click", () => setFitSelection(outfitName));
  });
}

function renderFitLoadout() {
  const rows = groupLoadoutEntries(state.fitLoadout);
  if (!rows.length) {
    fitLoadout.innerHTML = `<div class="empty-state">No outfits installed yet.</div>`;
    return;
  }

  fitLoadout.innerHTML = groupEntriesByCategory(rows)
    .map(
      ([category, items]) => `
        <section class="loadout-group">
          <div class="loadout-group-title">${escapeHtml(category)}</div>
          <div class="loadout-group-list">
            ${items
              .map((row) => {
                const plusCheck = getInstallCheck(state.fitShipName, state.fitLoadout, row.name, 1);
                return `
                  <article class="loadout-row" data-select-outfit="${escapeHtml(row.name)}" tabindex="0">
                    <div class="outfit-row-main">
                      ${row.outfit?.imageUrl ? `<img class="outfit-icon outfit-icon-large" src="${escapeHtml(row.outfit.imageUrl)}" alt="${escapeHtml(row.name)}" />` : `<div class="outfit-icon outfit-icon-large outfit-icon-placeholder"></div>`}
                      <div>
                        <div class="row-title">${escapeHtml(row.name)}</div>
                        <div class="row-subtitle">${escapeHtml(row.outfit?.category || "Outfit")}</div>
                        <div class="row-meta">${escapeHtml(describeOutfit(row.outfit || { attributes: {}, slotType: "system" }))}</div>
                        <div class="row-meta">${formatCredits((row.outfit?.attributes?.cost || 0) * row.count)}</div>
                      </div>
                    </div>
                    <div class="row-actions">
                      <button class="button-inline" data-adjust="${escapeHtml(row.name)}" data-delta="-1" type="button">−</button>
                      <div class="counter">${formatNumber(row.count)}</div>
                      <button class="button-inline" data-adjust="${escapeHtml(row.name)}" data-delta="1" type="button" ${plusCheck.ok ? "" : `disabled title="${escapeHtml(plusCheck.reason)}"`}>+</button>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `
    )
    .join("");

  fitLoadout.querySelectorAll("[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      adjustLoadout(button.dataset.adjust, Number(button.dataset.delta));
    });
  });
  bindFitterSelectionTargets(fitLoadout);
}

function renderOutfitCatalog() {
  const search = outfitSearch.value.trim().toLowerCase();
  const filter = outfitCategory.value;
  const progressAvailable = getProgressAvailableOutfitNames();
  const installedNow = getInstalledOutfitNames();
  const all = (state.bootstrap?.outfits || []).filter(
    (outfit) => !/(?:missions|events|jobs)\.txt$/i.test(outfit.sourcePath || "")
  );

  const matches = all.filter((outfit) => {
    if (!canShipEverUseOutfit(state.fitShipName, outfit.name)) {
      return false;
    }
    if (!state.debugMode && !progressAvailable.has(outfit.name) && !installedNow.has(outfit.name)) {
      return false;
    }
    if (filter !== "all" && outfit.category !== filter) {
      return false;
    }
    if (!search) {
      return true;
    }
    return (
      outfit.name.toLowerCase().includes(search) ||
      outfit.category.toLowerCase().includes(search)
    );
  });

  outfitCatalog.innerHTML = matches.length
    ? groupCatalogEntries(matches.map((outfit) => ({ outfit })))
        .map(
          ([section, items]) => `
            <section class="catalog-group">
              <div class="catalog-group-title">${escapeHtml(section)}</div>
              <div class="catalog-group-grid">
                ${items
                  .sort(
                    (left, right) =>
                      Number(installedNow.has(right.outfit.name)) - Number(installedNow.has(left.outfit.name)) ||
                      Number(progressAvailable.has(right.outfit.name)) - Number(progressAvailable.has(left.outfit.name)) ||
                      getFitCategoryOrder(left.outfit.category) -
                        getFitCategoryOrder(right.outfit.category) ||
                      left.outfit.name.localeCompare(right.outfit.name)
                  )
                  .map(({ outfit }) => {
                    const check = getInstallCheck(state.fitShipName, state.fitLoadout, outfit.name, 1);
                    const installedCount = state.fitLoadout[outfit.name] || 0;
                    return `
                      <article class="catalog-tile ${check.ok ? "" : "is-blocked"}" data-select-outfit="${escapeHtml(outfit.name)}" tabindex="0">
                        <div class="catalog-tile-media">
                          ${outfit.imageUrl ? `<img class="catalog-tile-image" src="${escapeHtml(outfit.imageUrl)}" alt="${escapeHtml(outfit.name)}" />` : `<div class="catalog-tile-image outfit-icon-placeholder"></div>`}
                        </div>
                        <div class="catalog-tile-title">${escapeHtml(outfit.name)}</div>
                        <div class="catalog-tile-meta">${escapeHtml(outfit.category)}</div>
                        <div class="catalog-tile-meta">${escapeHtml(describeOutfit(outfit))}</div>
                        <div class="catalog-tile-flags">
                          ${installedNow.has(outfit.name) ? `<span class="tag is-owned">Installed</span>` : ""}
                          ${progressAvailable.has(outfit.name) ? `<span class="tag is-buyable">Buyable now</span>` : ""}
                          ${!installedNow.has(outfit.name) && !progressAvailable.has(outfit.name) ? `<span class="tag is-debug">Debug only</span>` : ""}
                        </div>
                        <div class="catalog-tile-cost">${formatCredits(outfit.attributes.cost || 0)}</div>
                        <div class="catalog-tile-actions">
                          <button class="button-inline" data-adjust="${escapeHtml(outfit.name)}" data-delta="-1" type="button" ${installedCount > 0 ? "" : "disabled"}>−</button>
                          <div class="counter">${formatNumber(installedCount)}</div>
                          <button class="button-inline" data-adjust="${escapeHtml(outfit.name)}" data-delta="1" type="button" ${check.ok ? "" : `disabled title="${escapeHtml(check.reason)}"`}>+</button>
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `
        )
        .join("")
    : `<div class="empty-state">${state.debugMode ? "No outfits match the current filter." : "No modules for this ship match your current progression and filter."}</div>`;

  outfitCatalog.querySelectorAll("[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      adjustLoadout(button.dataset.adjust, Number(button.dataset.delta));
    });
  });
  bindFitterSelectionTargets(outfitCatalog);
}

function renderFitter() {
  fitterBrowserPane?.classList.toggle("is-active", state.fitterPane !== "modules");
  fitterModulesPane?.classList.toggle("is-active", state.fitterPane === "modules");
  renderFitBrowser();
  renderFitSummary();
  renderFitLoadout();
  if (state.fitterPane === "modules") {
    renderOutfitCatalog();
  } else {
    outfitCatalog.innerHTML = "";
  }
}

function renderTracker() {
  const trackerState = getTrackerState();
  const currentSystem = state.status?.player?.currentSystem;
  if (!trackerState || !currentSystem) {
    tracker.innerHTML = `<div class="empty-state">Select a loop and press <span class="mono">Track loop</span> to start.</div>`;
    return;
  }
  const stageMeta = getTrackerStageMeta(trackerState, currentSystem);

  tracker.innerHTML = `
    <div class="tracker-line muted">${escapeHtml(stageMeta?.stageLabel || "Tracking")} · <span class="mono">${escapeHtml(currentSystem)}</span></div>
    <div class="tracker-body">${escapeHtml(stageMeta?.copy || `Current system: ${currentSystem}.`)}</div>
  `;
}

function renderMap() {
  const context = getMapContext();
  const systemsMap = getSystemsMap();
  if (!context) {
    mapSvg.innerHTML = "";
    galaxyMapSvg.innerHTML = "";
    return;
  }

  const currentSystem = state.status?.player?.currentSystem;
  const focused = getPreferredRouteContext();
  const selected = focused?.route || null;
  const project = context.globalProjection.project;
  const visibleNames = context.names;
  const lines = new Set();
  const wormholeEdges = getWormholeEdges();
  const wormholeKeys = new Set(wormholeEdges.map((edge) => edge.key));
  let linkMarkup = "";

  for (const system of context.systems) {
    for (const next of system.links || []) {
      if (!visibleNames.has(next) || !systemsMap[next]) {
        continue;
      }
      const key = [system.name, next].sort().join("|");
      if (lines.has(key) || wormholeKeys.has(key)) {
        continue;
      }
      lines.add(key);
      const [x1, y1] = project(system);
      const [x2, y2] = project(systemsMap[next]);
      linkMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="map-link" />`;
    }
  }
  let wormholeMarkup = "";
  for (const edge of wormholeEdges) {
    if (!visibleNames.has(edge.from) || !visibleNames.has(edge.to)) {
      continue;
    }
    const [x1, y1] = project(systemsMap[edge.from]);
    const [x2, y2] = project(systemsMap[edge.to]);
    wormholeMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="map-link map-link-wormhole" />`;
  }

  let overlayMarkup = "";
  let metaText = currentSystem ? `${currentSystem} · local jump neighborhood` : "Select a route to inspect it.";
  if (selected) {
    const currentToOrigin =
      selected.origin && currentSystem && selected.origin !== currentSystem
        ? findShortestPath(currentSystem, selected.origin)
        : [];
    const outwardPath = findShortestPath(selected.origin, selected.destination);
    const returnPath = selected.type === "loop" ? findShortestPath(selected.destination, selected.origin) : [];

    function polyline(path, className) {
      if (!path.length) {
        return "";
      }
      const points = path
        .map((name) => {
          const system = systemsMap[name];
          if (!system || !visibleNames.has(name)) {
            return null;
          }
          const [x, y] = project(system);
          return `${x},${y}`;
        })
        .filter(Boolean)
        .join(" ");
      return points
        ? `<polyline points="${points}" class="${className}" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`
        : "";
    }

    overlayMarkup += polyline(currentToOrigin, "map-path map-path-dashed");
    overlayMarkup += polyline(outwardPath, "map-path map-path-outbound");
    overlayMarkup += polyline(returnPath, "map-path map-path-return");

    metaText =
      selected.type === "directMarket"
        ? `${formatTradeLocation(selected.origin, selected.access)} → ${formatTradeLocation(selected.destination, selected.access)} · ${selected.outward.commodity} · ${formatNumber(selected.netProfit || selected.projectedProfit)} net credits`
        : selected.type === "carrySale"
          ? `${formatTradeLocation(selected.origin, selected.access)} → ${formatTradeLocation(selected.destination, selected.access)} · ${selected.commodity} · ${formatNumber(selected.netProfit || selected.projectedProfit)} net credits`
          : `${formatTradeLocation(selected.origin, selected.access)} → ${formatTradeLocation(selected.destination, selected.access)} → ${formatTradeLocation(selected.origin, selected.access)} · ${formatNumber(selected.netProfit || selected.projectedProfit)} net credits per loop`;
  }

  const pointMarkup = context.systems
    .map((system) => {
      const [x, y] = project(system);
      const isCurrent = system.name === currentSystem;
      const isOrigin = selected?.origin === system.name;
      const isDestination = selected?.destination === system.name;
      const className = isCurrent
        ? "map-node is-current"
        : isOrigin
          ? "map-node is-origin"
          : isDestination
            ? "map-node is-destination"
            : "map-node";
      const radius = isCurrent ? 5.4 : isOrigin || isDestination ? 4.3 : 2.3;
      return `<circle cx="${x}" cy="${y}" r="${radius}" class="${className}" />`;
    })
    .join("");

  const labelTargets = selected
    ? [selected.origin, selected.destination]
    : currentSystem
      ? [currentSystem]
      : [];
  const labels = labelTargets
    .filter(Boolean)
    .map((name) => {
      const system = systemsMap[name];
      if (!system || !visibleNames.has(name)) {
        return "";
      }
      const [x, y] = project(system);
      return `<text x="${x + 8}" y="${y - 10}" class="map-label">${escapeHtml(name)}</text>`;
    })
    .join("");

  selectedRouteMeta.textContent = metaText;
  mapSvg.setAttribute(
    "viewBox",
    `${context.viewBox.x} ${context.viewBox.y} ${context.viewBox.width} ${context.viewBox.height}`
  );
  mapSvg.innerHTML = `
    <rect x="0" y="0" width="${context.globalProjection.width}" height="${context.globalProjection.height}" class="map-bg" />
    ${linkMarkup}
    ${wormholeMarkup}
    ${overlayMarkup}
    ${pointMarkup}
    ${labels}
  `;

  renderGalaxyMap(context, systemsMap, currentSystem, selected);
}

function renderGalaxyMap(context, systemsMap, currentSystem, selected) {
  const project = context.globalProjection.project;
  const allSystems = (state.bootstrap?.map?.systems || []).filter((system) =>
    context.globalProjection.projectedNames.has(system.name)
  );
  const lines = new Set();
  const wormholeEdges = getWormholeEdges();
  const wormholeKeys = new Set(wormholeEdges.map((edge) => edge.key));
  let linkMarkup = "";
  for (const system of allSystems) {
    for (const next of system.links || []) {
      if (!systemsMap[next]) {
        continue;
      }
      const key = [system.name, next].sort().join("|");
      if (lines.has(key) || wormholeKeys.has(key)) {
        continue;
      }
      lines.add(key);
      const [x1, y1] = project(system);
      const [x2, y2] = project(systemsMap[next]);
      linkMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mini-link" />`;
    }
  }
  let wormholeMarkup = "";
  for (const edge of wormholeEdges) {
    if (!context.globalProjection.projectedNames.has(edge.from) || !context.globalProjection.projectedNames.has(edge.to)) {
      continue;
    }
    const [x1, y1] = project(systemsMap[edge.from]);
    const [x2, y2] = project(systemsMap[edge.to]);
    wormholeMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mini-link mini-link-wormhole" />`;
  }

  const pointMarkup = allSystems
    .map((system) => {
      const [x, y] = project(system);
      const inFocus = context.names.has(system.name);
      const isCurrent = system.name === currentSystem;
      const isOrigin = selected?.origin === system.name;
      const isDestination = selected?.destination === system.name;
      const className = isCurrent
        ? "mini-node is-current"
        : isOrigin
          ? "mini-node is-origin"
          : isDestination
            ? "mini-node is-destination"
            : inFocus
              ? "mini-node is-focus"
              : "mini-node";
      const radius = isCurrent ? 5 : isOrigin || isDestination ? 4.2 : inFocus ? 2.5 : 1.5;
      return `<circle cx="${x}" cy="${y}" r="${radius}" class="${className}" />`;
    })
    .join("");

  const currentToOrigin =
    selected?.origin && currentSystem && selected.origin !== currentSystem
      ? findShortestPath(currentSystem, selected.origin)
      : [];
  const outwardPath = selected ? findShortestPath(selected.origin, selected.destination) : [];
  const returnPath = selected?.type === "loop" ? findShortestPath(selected.destination, selected.origin) : [];

  function polyline(path, className) {
    if (!path.length) {
      return "";
    }
    const points = path
      .map((name) => {
        const system = systemsMap[name];
        if (!system) {
          return null;
        }
        const [x, y] = project(system);
        return `${x},${y}`;
      })
      .filter(Boolean)
      .join(" ");
    return points
      ? `<polyline points="${points}" class="${className}" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`
      : "";
  }

  galaxyMapSvg.setAttribute(
    "viewBox",
    `0 0 ${context.globalProjection.width} ${context.globalProjection.height}`
  );
  galaxyMapSvg.innerHTML = `
    <rect x="0" y="0" width="${context.globalProjection.width}" height="${context.globalProjection.height}" class="map-bg" />
    ${linkMarkup}
    ${wormholeMarkup}
    ${polyline(currentToOrigin, "mini-path mini-path-dashed")}
    ${polyline(outwardPath, "mini-path mini-path-outbound")}
    ${polyline(returnPath, "mini-path mini-path-return")}
    ${pointMarkup}
    <rect
      x="${context.viewBox.x}"
      y="${context.viewBox.y}"
      width="${context.viewBox.width}"
      height="${context.viewBox.height}"
      class="mini-window"
      rx="18"
      ry="18"
    />
  `;
}

async function saveCurrentFit() {
  if (!state.fitShipName) {
    return;
  }
  const name = fitSaveName?.value?.trim();
  const note = fitSaveNote?.value?.trim() || "";
  if (!name) {
    fitSaveName?.focus();
    return;
  }
  const existingFit = (state.bootstrap?.fits?.saved || []).find(
    (f) => f.name.toLowerCase() === name.toLowerCase()
  );
  const payload = {
    ...(existingFit ? { id: existingFit.id } : {}),
    shipName: state.fitShipName,
    name,
    note: note.slice(0, 280),
    loadout: state.fitLoadout,
  };
  const response = await fetch("/api/fits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const saved = await response.json();
  if (response.ok) {
    const existing = state.bootstrap.fits.saved || [];
    const idx = existing.findIndex((f) => f.id === saved.id);
    state.bootstrap.fits.saved = idx >= 0
      ? existing.map((f, i) => (i === idx ? saved : f))
      : [...existing, saved];
    state.fitBrowserMode = "fits";
    closeFitSaveModal();
    renderFitBrowser();
  }
}

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load bootstrap.");
  }
  state.bootstrap = data;
  if (!state.fitShipName && data.ships?.length) {
    const defaultShip =
      data.ships.find((ship) => ship.name === "Geocoris")?.name || data.ships[0].name;
    state.fitShipName = defaultShip;
    state.fitLoadout = getStockLoadout(defaultShip);
    state.fitListScopeShipName = defaultShip;
  }
  renderShipCategoryOptions();
}

async function fetchStatus() {
  const response = await fetch("/api/status", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load status.");
  }
  state.status = data;
  if (hasActiveSave()) {
    state.savePathPrompted = false;
  }
  const atlasSystems = getAtlasSystems();
  const atlasNames = new Set(atlasSystems.map((system) => system.name));
  if (!state.atlasSelectedSystem || !atlasNames.has(state.atlasSelectedSystem)) {
    state.atlasSelectedSystem =
      data.player?.currentSystem && atlasNames.has(data.player.currentSystem)
        ? data.player.currentSystem
        : atlasSystems[0]?.name || null;
  }
  if (state.selectedRouteKey) {
    let matched = null;
    for (const [group, routes] of Object.entries(getAllRouteGroups())) {
      const route = routes.find((candidate) => makeRouteKey(group, candidate) === state.selectedRouteKey);
      if (route) {
        matched = { group, route };
        break;
      }
    }
    state.selectedRoute = matched;
    if (!matched) {
      state.selectedRouteKey = null;
    }
  }
  updateTrackerFromStatus();
}

function rerenderAll() {
  renderPrimaryTabs();
  renderHeroMeta();
  renderSummary();
  renderSaveSetupBanner();
  renderMissionOccupancy();
  renderCargo();
  renderPlanner();
  renderDebugEditor();
  renderFleet();
  renderStandings();
  renderLicenses();
  renderAtlas();
  renderWiki();
  renderSettings();
  renderFitter();
  renderMap();
  renderTracker();
}

function attachStaticEvents() {
  outfitSearch.addEventListener("input", renderOutfitCatalog);
  outfitCategory.addEventListener("change", renderOutfitCatalog);
  saveFitButton.addEventListener("click", openFitSaveModal);
  fitSaveSubmit?.addEventListener("click", saveCurrentFit);
  fitSaveCancel?.addEventListener("click", closeFitSaveModal);
  fitSaveNote?.addEventListener("input", updateFitSaveCharcount);
  fitSaveName?.addEventListener("input", updateFitSaveActions);
  fitSaveName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCurrentFit();
    }
  });
  fitSaveModal?.querySelectorAll("[data-modal-close='fit-save']").forEach((element) => {
    element.addEventListener("click", closeFitSaveModal);
  });
  fitShipCategory?.addEventListener("change", () => {
    state.fitShipCategory = fitShipCategory.value || "all";
    renderFitBrowser();
  });
  debugWarningModal?.querySelectorAll("[data-modal-close='debug-warning']").forEach((element) => {
    element.addEventListener("click", closeDebugWarningModal);
  });
  debugWarningCancel?.addEventListener("click", closeDebugWarningModal);
  debugWarningConfirm?.addEventListener("click", confirmDebugMode);
  savePathModal?.querySelectorAll("[data-modal-close='save-path']").forEach((element) => {
    element.addEventListener("click", closeSavePathModal);
  });
  savePathCancel?.addEventListener("click", closeSavePathModal);
  savePathClear?.addEventListener("click", clearSavePathConfig);
  savePathBrowse?.addEventListener("click", browseSavePath);
  savePathSubmit?.addEventListener("click", submitSavePathConfig);
  savePathInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSavePathConfig();
    }
  });
  savePathHints?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-path-hint]");
    if (!button || !savePathInput) {
      return;
    }
    savePathInput.value = button.dataset.savePathHint || "";
    savePathInput.focus();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !fitSaveModal?.hidden) {
      closeFitSaveModal();
    }
    if (event.key === "Escape" && !debugWarningModal?.hidden) {
      closeDebugWarningModal();
    }
    if (event.key === "Escape" && !savePathModal?.hidden) {
      closeSavePathModal();
    }
  });
  fitBrowserSearch.addEventListener("input", renderFitBrowser);
  fitBrowserTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.fitterPane = tab.dataset.fitBrowserTab;
      if (state.fitterPane === "ships" || state.fitterPane === "fits") {
        state.fitBrowserMode = state.fitterPane;
      }
      renderFitter();
    });
  });
  atlasSearch.addEventListener("input", () => {
    renderAtlasList();
  });
  clearTrackerButton.addEventListener("click", clearTracker);

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPage(button.dataset.pageTarget);
    });
  });

  window.addEventListener("hashchange", syncPageFromHash);
}

async function init() {
  state.debugMode = loadDebugMode();
  state.debugAutoBackup = loadDebugBackupPreference();
  attachStaticEvents();
  syncPageFromHash();
  await fetchBootstrap();
  await fetchStatus();
  rerenderAll();
  setInterval(async () => {
    try {
      await fetchStatus();
      rerenderAll();
    } catch (error) {
      console.error(error);
    }
  }, (state.bootstrap?.pollSeconds || 5) * 1000);
}

init().catch((error) => {
  console.error(error);
  heroMeta.innerHTML = `<div class="meta-pill error">${escapeHtml(error.message || String(error))}</div>`;
});

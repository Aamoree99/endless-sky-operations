import {
  createTrackerState,
  normalizeTrackerState,
  getTrackerTravelPlan,
} from "./app/tracker-state.js";
import { formatTradeLocation } from "./app/planner-text.js";
import {
  escapeHtml,
  formatNumber,
  formatCredits,
  formatRemaining,
  formatOneDecimal,
  formatTwoDecimals,
  formatDate,
  formatDuration,
  formatSaleLocation,
  cloneLoadout,
} from "./app/formatters.js";
import { metricCard, routeMeta, getRouteJumpCount } from "./app/ui-helpers.js";
import { createDataController } from "./app/data-controller.js";
import { createShellController } from "./app/shell-view.js";
import { createFitEngine } from "./app/fit-engine.js";
import { createTrackerController } from "./app/tracker-controller.js";
import { createPlannerController } from "./app/planner-view.js";
import { createFleetController } from "./app/fleet-view.js";
import { buildFleetRolloutPreview } from "./app/fleet-ops.js";
import { createAtlasController } from "./app/atlas-view.js";
import { createRouteMapController } from "./app/route-map-view.js";
import { createWikiController } from "./app/wiki-view.js";
import { createFitterController } from "./app/fitter-view.js";
import { createDebugController } from "./app/debug-view.js";
import {
  createSettingsController,
  getSaveInfo as selectSaveInfo,
  getGameInfo as selectGameInfo,
  getPlannerSettings as selectPlannerSettings,
  getAppInfo as selectAppInfo,
  hasActiveSave as selectHasActiveSave,
} from "./app/settings-view.js";

const heroMeta = document.getElementById("hero-meta");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const summaryStrip = document.getElementById("summary-strip");
const saveSetupBanner = document.getElementById("save-setup-banner");
const missionOccupancy = document.getElementById("mission-occupancy");
const cargoSummary = document.getElementById("cargo-summary");
const fleetOverview = document.getElementById("fleet-overview");
const fleetGroups = document.getElementById("fleet-groups");
const plannerControls = document.getElementById("planner-controls");
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
const settingsDesktop = document.getElementById("settings-desktop");
const settingsSave = document.getElementById("settings-save");
const settingsGame = document.getElementById("settings-game");
const settingsPlanner = document.getElementById("settings-planner");
const debugEditorWarning = document.getElementById("debug-editor-warning");
const debugEditorSettings = document.getElementById("debug-editor-settings");
const debugEditorStatus = document.getElementById("debug-editor-status");
const debugBackups = document.getElementById("debug-backups");
const debugHistory = document.getElementById("debug-history");
const debugSafeEditor = document.getElementById("debug-safe-editor");
const debugAdvancedEditor = document.getElementById("debug-advanced-editor");
const debugDangerousEditor = document.getElementById("debug-dangerous-editor");
const debugExtremeEditor = document.getElementById("debug-extreme-editor");
const fleetList = document.getElementById("fleet-list");
const standings = document.getElementById("standings");
const licenses = document.getElementById("licenses");
const outfitSearch = document.getElementById("outfit-search");
const outfitCategory = document.getElementById("outfit-category");
const saveFitButton = document.getElementById("save-fit-button");
const compareFitButton = document.getElementById("compare-fit-button");
const shareFitButton = document.getElementById("share-fit-button");
const importFitButton = document.getElementById("import-fit-button");
const resetFitButton = document.getElementById("reset-fit-button");
const fitSaveModal = document.getElementById("fit-save-modal");
const fitSaveName = document.getElementById("fit-save-name");
const fitSaveNote = document.getElementById("fit-save-note");
const fitSaveCharcount = document.getElementById("fit-save-charcount");
const fitSaveCancel = document.getElementById("fit-save-cancel");
const fitSaveSubmit = document.getElementById("fit-save-submit");
const fitShareModal = document.getElementById("fit-share-modal");
const fitShareFormat = document.getElementById("fit-share-format");
const fitShareOutput = document.getElementById("fit-share-output");
const fitShareTextPanel = document.getElementById("fit-share-text-panel");
const fitShareImagePanel = document.getElementById("fit-share-image-panel");
const fitShareImagePreview = document.getElementById("fit-share-image-preview");
const fitShareStatus = document.getElementById("fit-share-status");
const fitShareCancel = document.getElementById("fit-share-cancel");
const fitShareCopy = document.getElementById("fit-share-copy");
const fitShareDownload = document.getElementById("fit-share-download");
const fitImportModal = document.getElementById("fit-import-modal");
const fitImportInput = document.getElementById("fit-import-input");
const fitImportStatus = document.getElementById("fit-import-status");
const fitImportCancel = document.getElementById("fit-import-cancel");
const fitImportSubmit = document.getElementById("fit-import-submit");
const fitShareExportPanel = document.getElementById("fit-share-export-panel");
const fitCompareModal = document.getElementById("fit-compare-modal");
const fitCompareTarget = document.getElementById("fit-compare-target");
const fitCompareStatus = document.getElementById("fit-compare-status");
const fitCompareSummary = document.getElementById("fit-compare-summary");
const fitCompareLoadout = document.getElementById("fit-compare-loadout");
const fitCompareCancel = document.getElementById("fit-compare-cancel");
const fleetRolloutModal = document.getElementById("fleet-rollout-modal");
const fleetRolloutPreview = document.getElementById("fleet-rollout-preview");
const fleetRolloutGameClosed = document.getElementById("fleet-rollout-game-closed");
const fleetRolloutStatus = document.getElementById("fleet-rollout-status");
const fleetRolloutCancel = document.getElementById("fleet-rollout-cancel");
const fleetRolloutApply = document.getElementById("fleet-rollout-apply");
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
const DEBUG_HISTORY_KEY = "es-debug-history-v1";
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
  fitDraftName: "",
  fitDraftNote: "",
  fitSelectedOutfitName: null,
  fitBrowserMode: "ships",
  fitterPane: "ships",
  fitListScopeShipName: null,
  fitShipCategory: "all",
  fleetRolloutDraft: null,
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
  plannerQuery: "",
  plannerSort: "netDay",
  plannerLandingFilter: "all",
  plannerStartFilter: "all",
};

const dataController = createDataController({
  state,
  cloneLoadout,
});

const {
  getOwnedShipsRaw,
  getOwnedShipModelNames,
  getShipMap,
  getOutfitMap,
  getSystemsMap,
  getPlanetMap,
  getBasePlanetMap,
  getShipDefinition,
  getOutfitDefinition,
  getStockLoadout,
  getKnownSystemNames,
  getLiveKnownSystemNames,
  getWormholeEdges,
  getRouteGraph,
  bfsDistances,
  findShortestPath,
  getConnectedSystemComponents,
} = dataController;

const debugController = createDebugController({
  state,
  dom: {
    fitSaveModal,
    savePathModal,
    debugEditorWarning,
    debugEditorSettings,
    debugEditorStatus,
    debugBackups,
    debugHistory,
    debugSafeEditor,
    debugAdvancedEditor,
    debugDangerousEditor,
    debugExtremeEditor,
    debugWarningModal,
  },
  keys: {
    DEBUG_KEY,
    DEBUG_BACKUP_KEY,
    DEBUG_HISTORY_KEY,
  },
  helpers: {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatTwoDecimals,
  },
  actions: {
    syncModalBodyState,
    rerenderAll,
    fetchStatus,
    setPage,
  },
});

const {
  loadDebugMode,
  loadDebugBackupPreference,
  toggleDebugMode,
  confirmDebugMode,
  closeDebugWarningModal,
  initializeDebugEditorDrafts,
  renderDebugEditor,
  bindDebugEvents,
  handleGlobalEscape,
} = debugController;

const settingsController = createSettingsController({
  state,
  dom: {
    saveSetupBanner,
    settingsOverview,
    settingsDesktop,
    settingsSave,
    settingsGame,
    settingsPlanner,
    savePathModal,
    savePathTitle,
    savePathCopy,
    savePathLabel,
    savePathInput,
    savePathHints,
    savePathStatus,
    savePathCancel,
    savePathClear,
    savePathBrowse,
    savePathSubmit,
  },
  runtime: DESKTOP_RUNTIME,
  helpers: {
    escapeHtml,
    metricCard,
    formatCredits,
    formatNumber,
    formatOneDecimal,
  },
  actions: {
    syncModalBodyState,
    rerenderAll,
    fetchBootstrap,
    fetchStatus,
  },
});

const {
  renderSaveSetupBanner,
  renderSettings,
  openSavePathModal,
  closeSavePathModal,
  bindSettingsEvents,
} = settingsController;

const shellController = createShellController({
  state,
  dom: {
    heroMeta,
    summaryStrip,
    missionOccupancy,
    cargoSummary,
  },
  helpers: {
    escapeHtml,
    formatDate,
    formatNumber,
    metricCard,
  },
  selectors: {
    hasActiveSave,
  },
  actions: {
    toggleDebugMode,
  },
});

const {
  renderHeroMeta,
  renderSummary,
  renderMissionOccupancy,
  renderCargo,
} = shellController;

const fitEngine = createFitEngine({
  state,
  cloneLoadout,
  selectors: {
    getShipDefinition,
    getOutfitDefinition,
  },
  constants: {
    FRAMES_PER_SECOND,
    MAX_SIMULATION_FRAMES,
  },
});

const {
  normalizeShipDisplayShip,
  summarizeFit,
  getInstallCheck,
} = fitEngine;

let renderMap = () => {};
let renderPlanner = () => {};
let renderTracker = () => {};

const trackerController = createTrackerController({
  state,
  storageKey: TRACKER_KEY,
  helpers: {
    createTrackerState,
    normalizeTrackerState,
    getTrackerTravelPlan,
  },
  actions: {
    fetchStatus,
    renderPlanner: () => renderPlanner(),
    renderTracker: () => renderTracker(),
    renderMap: () => renderMap(),
  },
});

const {
  getTrackerState,
  applyTravelPlan,
  getPlannerCourseTarget,
  clearTracker,
  startTrackingLoop,
  updateTrackerFromStatus,
} = trackerController;

const plannerController = createPlannerController({
  state,
  dom: {
    plannerControls,
    directMarkets,
    carrySales,
    localLoops,
    reachableLoops,
    activeRouteCard,
    tracker,
  },
  helpers: {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    routeMeta,
    getRouteJumpCount,
  },
  selectors: {
    getPlannerSettings,
    getLiveKnownSystemNames,
    getTrackerState,
    getPlannerCourseTarget,
  },
  actions: {
    applyTravelPlan,
    startTrackingLoop,
    clearTracker,
    renderMap: () => renderMap(),
  },
});

const {
  makeRouteKey,
  getAllRouteGroups,
  getPreferredRouteContext,
  renderPlanner: renderPlannerView,
  renderTracker: renderTrackerView,
} = plannerController;

renderPlanner = renderPlannerView;
renderTracker = renderTrackerView;

const routeMapController = createRouteMapController({
  state,
  dom: {
    mapSvg,
    galaxyMapSvg,
    selectedRouteMeta,
  },
  helpers: {
    escapeHtml,
    formatNumber,
  },
  selectors: {
    getSystemsMap,
    getRouteGraph,
    getWormholeEdges,
    getPreferredRouteContext,
    findShortestPath,
    bfsDistances,
    getConnectedSystemComponents,
  },
  text: {
    formatTradeLocation,
  },
});

renderMap = routeMapController.renderMap;

const fleetController = createFleetController({
  state,
  dom: {
    fleetOverview,
    fleetGroups,
    fleetList,
    standings,
    licenses,
    fleetRolloutModal,
    fleetRolloutPreview,
    fleetRolloutGameClosed,
    fleetRolloutStatus,
    fleetRolloutCancel,
    fleetRolloutApply,
  },
  helpers: {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    formatTwoDecimals,
    metricCard,
    buildFleetRolloutPreview,
  },
  selectors: {
    summarizeFit,
    normalizeShipDisplayShip,
    formatSaleLocation,
    getOutfitDefinition,
  },
  actions: {
    loadShipIntoFitter,
    syncModalBodyState,
    fetchStatus,
    rerenderAll,
  },
});

const {
  renderFleet,
  renderStandings,
  renderLicenses,
  bindFleetEvents,
  closeFleetRolloutModal,
} = fleetController;

const atlasController = createAtlasController({
  state,
  dom: {
    atlasSearch,
    atlasSystemList,
    atlasMapSvg,
    atlasMapOverlaySvg,
    atlasMapPlanet,
    atlasMapStock,
    atlasMapMarket,
    atlasDetail,
  },
  helpers: {
    escapeHtml,
    formatNumber,
  },
  selectors: {
    getKnownSystemNames,
    getLiveKnownSystemNames,
    getSystemsMap,
    getWormholeEdges,
    getConnectedSystemComponents,
  },
  marketCommodityOrder: MARKET_COMMODITY_ORDER,
});

const {
  getAtlasSystems,
  getOpenedPlanetNames,
  getGovernmentStanding,
  renderAtlas,
  bindAtlasEvents,
} = atlasController;

const wikiController = createWikiController({
  state,
  dom: {
    wikiNav,
    wikiContent,
  },
  helpers: {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatTwoDecimals,
  },
  selectors: {
    getAtlasSystems,
    getSystemsMap,
    getBasePlanetMap,
    getOpenedPlanetNames,
    getOwnedShipModelNames,
    getGovernmentStanding,
    formatSaleLocation,
  },
});

const { renderWiki } = wikiController;

const fitterController = createFitterController({
  state,
  dom: {
    outfitSearch,
    outfitCategory,
    saveFitButton,
    compareFitButton,
    shareFitButton,
    importFitButton,
    resetFitButton,
    fitSaveModal,
    fitSaveName,
    fitSaveNote,
    fitSaveCharcount,
    fitSaveCancel,
    fitSaveSubmit,
    fitShareModal,
    fitShareFormat,
    fitShareOutput,
    fitShareTextPanel,
    fitShareImagePanel,
    fitShareImagePreview,
    fitShareStatus,
    fitShareCancel,
    fitShareCopy,
    fitShareDownload,
    fitImportModal,
    fitImportInput,
    fitImportStatus,
    fitImportCancel,
    fitImportSubmit,
    fitShareExportPanel,
    fitCompareModal,
    fitCompareTarget,
    fitCompareStatus,
    fitCompareSummary,
    fitCompareLoadout,
    fitCompareCancel,
    fitBrowserSearch,
    fitShipCategory,
    fitShipCategoryField,
    fitBrowserList,
    fitBrowserTabs,
    fitSelection,
    fitOwnedShips,
    fitOwnedShipsCompact,
    fitHeader,
    fitSummary,
    fitLoadout,
    outfitCatalog,
    fitterBrowserPane,
    fitterModulesPane,
  },
  helpers: {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    formatTwoDecimals,
    formatRemaining,
    formatDuration,
    formatSaleLocation,
  },
  selectors: {
    getShipDefinition,
    getOutfitDefinition,
    getStockLoadout,
    getInstallCheck,
    summarizeFit,
    normalizeShipDisplayShip,
  },
  actions: {
    loadShipIntoFitter,
    adjustLoadout,
    syncModalBodyState,
  },
});

const {
  renderShipCategoryOptions,
  renderFitter,
  renderFitBrowser,
  bindFitterEvents,
  closeFitSaveModal,
  closeFitShareModal,
  closeFitImportModal,
  closeFitCompareModal,
} = fitterController;

function getSaveInfo() {
  return selectSaveInfo(state);
}

function getGameInfo() {
  return selectGameInfo(state);
}

function getPlannerSettings() {
  return selectPlannerSettings(state);
}

function getAppInfo() {
  return selectAppInfo(state);
}

function hasActiveSave() {
  return selectHasActiveSave(state);
}

function syncModalBodyState() {
  const anyOpen =
    !fitSaveModal?.hidden ||
    !fitShareModal?.hidden ||
    !fitImportModal?.hidden ||
    !fitCompareModal?.hidden ||
    !fleetRolloutModal?.hidden ||
    !debugWarningModal?.hidden ||
    !savePathModal?.hidden;
  document.body.classList.toggle("is-modal-open", Boolean(anyOpen));
}
function renderPrimaryTabs() {
  for (const button of tabButtons) {
    if (button.dataset.pageTarget === "debug") {
      button.hidden = !state.debugMode;
    }
  }
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

function loadShipIntoFitter(shipName, loadout = null, sourceShipId = null, fitMeta = null) {
  state.fitShipName = shipName;
  state.fitLoadout = cloneLoadout(loadout || getStockLoadout(shipName));
  state.fitSourceShipId = sourceShipId;
  state.fitDraftName = String(fitMeta?.name || "").trim() || `${shipName} fit`;
  state.fitDraftNote = String(fitMeta?.note || "").trim().slice(0, 280);
  state.fitSelectedOutfitName = null;
  state.fitListScopeShipName = shipName;
  setPage("fitter");
  renderFitter();
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
    state.fitDraftName = `${defaultShip} fit`;
    state.fitDraftNote = "";
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
  bindFitterEvents();
  bindFleetEvents();
  bindDebugEvents();
  bindAtlasEvents();
  debugWarningCancel?.addEventListener("click", closeDebugWarningModal);
  debugWarningConfirm?.addEventListener("click", confirmDebugMode);
  bindSettingsEvents();

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !fitSaveModal?.hidden) {
      closeFitSaveModal();
    }
    if (event.key === "Escape" && !fitShareModal?.hidden) {
      closeFitShareModal();
    }
    if (event.key === "Escape" && !fitImportModal?.hidden) {
      closeFitImportModal();
    }
    if (event.key === "Escape" && !fitCompareModal?.hidden) {
      closeFitCompareModal();
    }
    if (event.key === "Escape" && !fleetRolloutModal?.hidden) {
      closeFleetRolloutModal();
    }
    handleGlobalEscape(event);
    if (event.key === "Escape" && !savePathModal?.hidden) {
      closeSavePathModal();
    }
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

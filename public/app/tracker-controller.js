export function createTrackerController({
  state,
  storageKey,
  helpers,
  actions,
}) {
  const {
    createTrackerState,
    normalizeTrackerState,
    getTrackerTravelPlan,
  } = helpers;
  const {
    fetchStatus,
    renderPlanner,
    renderTracker,
    renderMap,
  } = actions;

  function getTrackerState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  }

  async function applyTravelPlan(desired, source = "planner") {
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
          source,
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

  async function syncTrackerTravelPlan(trackerState) {
    const desired = getTrackerTravelPlan(trackerState);
    await applyTravelPlan(desired, "tracker");
  }

  function getPlannerCourseTarget(route) {
    const currentSystem = state.status?.player?.currentSystem || null;
    if (!route) {
      return null;
    }
    if (route.type === "loop") {
      if (currentSystem === route.origin) {
        return route.destination;
      }
      if (currentSystem === route.destination) {
        return route.origin;
      }
      return route.origin;
    }
    if (currentSystem === route.origin) {
      return route.destination;
    }
    return route.origin;
  }

  function setTrackerState(next) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    void syncTrackerTravelPlan(next);
    renderTracker();
    renderPlanner();
    renderMap();
  }

  function clearTracker() {
    localStorage.removeItem(storageKey);
    renderTracker();
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

  return {
    getTrackerState,
    applyTravelPlan,
    getPlannerCourseTarget,
    clearTracker,
    startTrackingLoop,
    updateTrackerFromStatus,
  };
}

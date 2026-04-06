export function createDebugController({ state, dom, keys, helpers, actions }) {
  const {
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
  } = dom;
  const {
    DEBUG_KEY,
    DEBUG_BACKUP_KEY,
    DEBUG_HISTORY_KEY,
  } = keys;
  const {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatTwoDecimals,
  } = helpers;
  const {
    syncModalBodyState,
    rerenderAll,
    fetchStatus,
    setPage,
  } = actions;

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
    state.debugConditionsDraft = (editor.extreme?.conditions || []).join("\n");
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

  function setDebugEditorMessage(type, title, text, detail = "") {
    state.debugEditorMessage = { type, title, text, detail };
  }

  function clearDebugEditorMessage() {
    state.debugEditorMessage = null;
  }

  function loadDebugHistory() {
    try {
      const items = JSON.parse(localStorage.getItem(DEBUG_HISTORY_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function saveDebugHistory(items) {
    localStorage.setItem(DEBUG_HISTORY_KEY, JSON.stringify(items.slice(0, 12)));
  }

  function pushDebugHistory(entry) {
    const items = loadDebugHistory();
    items.unshift({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    saveDebugHistory(items);
  }

  function parseDebugTextareaList(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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

  function getDebugAdvancedData() {
    return state.status?.debugEditor?.advanced || { licenses: [], reputations: [] };
  }

  function getDebugDangerousShips() {
    return state.status?.debugEditor?.dangerous?.ships || [];
  }

  function buildSafeDebugDiff() {
    const source = state.status?.debugEditor?.safe || {};
    const rows = [];
    const credits = clampDebugNumber(state.debugCreditsDraft);
    const currentSystem = String(state.debugCurrentSystemDraft || "").trim();
    const currentPlanet = String(state.debugCurrentPlanetDraft || "").trim();
    const flagshipIndex = clampDebugNumber(state.debugFlagshipIndexDraft);
    if (credits !== Number(source.credits || 0)) {
      rows.push(`Credits: ${formatCredits(source.credits || 0)} → ${formatCredits(credits)}`);
    }
    if (currentSystem !== String(source.currentSystem || "")) {
      rows.push(`Current system: ${source.currentSystem || "none"} → ${currentSystem || "none"}`);
    }
    if (currentPlanet !== String(source.currentPlanet || "")) {
      rows.push(`Current planet: ${source.currentPlanet || "none"} → ${currentPlanet || "none"}`);
    }
    if (flagshipIndex !== Number(source.flagshipIndex || 0)) {
      rows.push(`Flagship index: ${formatNumber(source.flagshipIndex || 0)} → ${formatNumber(flagshipIndex)}`);
    }
    return rows;
  }

  function buildAdvancedDebugDiff() {
    const source = getDebugAdvancedData();
    const rows = [];
    const originalLicenses = source.licenses || [];
    const nextLicenses = [...new Set((state.debugLicensesDraft || []).map((name) => String(name).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const addedLicenses = nextLicenses.filter((name) => !originalLicenses.includes(name));
    const removedLicenses = originalLicenses.filter((name) => !nextLicenses.includes(name));
    if (addedLicenses.length || removedLicenses.length) {
      rows.push(`Licenses: +${addedLicenses.length} / -${removedLicenses.length}`);
    }

    let changedReputationCount = 0;
    for (const entry of source.reputations || []) {
      const draftValue = state.debugReputationDrafts[entry.name];
      const normalized = clampDebugNumber(draftValue, null, 2, true);
      if (Math.abs(normalized - Number(entry.value || 0)) > 0.0001) {
        changedReputationCount += 1;
      }
    }
    if (changedReputationCount) {
      rows.push(`Reputations: ${formatNumber(changedReputationCount)} edited`);
    }

    const visitedSystems = parseDebugTextareaList(state.debugVisitedSystemsDraft);
    const visitedPlanets = parseDebugTextareaList(state.debugVisitedPlanetsDraft);
    const travelPlan = parseDebugTextareaList(state.debugTravelPlanDraft);
    if (JSON.stringify(visitedSystems) !== JSON.stringify(source.visitedSystems || [])) {
      rows.push(`Visited systems: ${formatNumber((source.visitedSystems || []).length)} → ${formatNumber(visitedSystems.length)}`);
    }
    if (JSON.stringify(visitedPlanets) !== JSON.stringify(source.visitedPlanets || [])) {
      rows.push(`Visited planets: ${formatNumber((source.visitedPlanets || []).length)} → ${formatNumber(visitedPlanets.length)}`);
    }
    if (JSON.stringify(travelPlan) !== JSON.stringify(source.travelPlan || [])) {
      rows.push(`Travel plan: ${formatNumber((source.travelPlan || []).length)} → ${formatNumber(travelPlan.length)} stops`);
    }
    return rows;
  }

  function buildDangerousDebugDiff() {
    const ships = getDebugDangerousShips();
    const rows = [];
    let changedShips = 0;
    for (const ship of ships) {
      const draft = state.debugShipDrafts[ship.saveIndex];
      if (!draft) {
        continue;
      }
      const changed =
        String(draft.name || "").trim() !== ship.name ||
        clampDebugNumber(draft.crew, ship.bunks || null) !== Number(ship.crew || 0) ||
        clampDebugNumber(draft.fuel, ship.maxFuel || null) !== Number(ship.fuel || 0) ||
        clampDebugNumber(draft.shields, ship.maxShields || null) !== Number(ship.shields || 0) ||
        clampDebugNumber(draft.hull, ship.maxHull || null) !== Number(ship.hull || 0) ||
        String(draft.system || "").trim() !== String(ship.system || "") ||
        String(draft.planet || "").trim() !== String(ship.planet || "") ||
        Boolean(draft.parked) !== Boolean(ship.parked);
      if (changed) {
        changedShips += 1;
      }
    }
    if (changedShips) {
      rows.push(`Ships: ${formatNumber(changedShips)} edited`);
    }
    return rows;
  }

  function buildExtremeDebugDiff() {
    const sourceConditions = state.status?.debugEditor?.extreme?.conditions || [];
    const nextConditions = parseDebugTextareaList(state.debugConditionsDraft);
    if (JSON.stringify(nextConditions) === JSON.stringify(sourceConditions)) {
      return [];
    }
    return [
      `Conditions: ${formatNumber(sourceConditions.length)} → ${formatNumber(nextConditions.length)} entries`,
    ];
  }

  function renderDebugDiff(rows, emptyCopy) {
    return rows.length
      ? `<div class="debug-diff-list">${rows.map((row) => `<div class="debug-diff-row">${escapeHtml(row)}</div>`).join("")}</div>`
      : `<div class="settings-note">${escapeHtml(emptyCopy)}</div>`;
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
      pushDebugHistory({
        level: payload.level || "safe",
        title: successTitle,
        applied: result.applied || [],
        backupPath: result.backupPath || "",
      });
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

    if (!patches.length) {
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
      },
      "Dangerous changes applied"
    );
  }

  async function applyExtremeDebugChanges() {
    const sourceConditions = state.status?.debugEditor?.extreme?.conditions || [];
    const nextConditions = parseDebugTextareaList(state.debugConditionsDraft);
    const conditionsChanged = JSON.stringify(nextConditions) !== JSON.stringify(sourceConditions);

    if (!conditionsChanged) {
      setDebugEditorMessage("info", "Nothing to apply", "Extreme drafts still match the current save.");
      rerenderAll();
      return;
    }

    await applyDebugSaveEdits(
      {
        level: "extreme",
        confirmGameClosed: state.debugGameClosed,
        createBackup: state.debugAutoBackup,
        conditions: nextConditions,
      },
      "Extreme changes applied"
    );
  }

  function renderDebugEditor() {
    if (!debugEditorWarning || !debugEditorSettings || !debugSafeEditor || !debugAdvancedEditor || !debugDangerousEditor || !debugExtremeEditor) {
      return;
    }
    if (!state.debugMode || !state.status?.debugEditor) {
      debugEditorWarning.innerHTML = "";
      debugEditorSettings.innerHTML = "";
      debugSafeEditor.innerHTML = "";
      debugAdvancedEditor.innerHTML = "";
      debugDangerousEditor.innerHTML = "";
      debugExtremeEditor.innerHTML = "";
      if (debugBackups) {
        debugBackups.innerHTML = "";
      }
      if (debugHistory) {
        debugHistory.innerHTML = "";
      }
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
    const safeDiff = buildSafeDebugDiff();
    const advancedDiff = buildAdvancedDebugDiff();
    const dangerousDiff = buildDangerousDebugDiff();
    const extremeDiff = buildExtremeDebugDiff();
    const backupRows = (editor.backups || [])
      .map(
        (entry) => `
          <div class="debug-side-row">
            <strong>${escapeHtml(entry.name)}</strong>
            <small>${escapeHtml(entry.updatedAt || "")}</small>
            <code>${escapeHtml(entry.path || "")}</code>
          </div>
        `
      )
      .join("");
    const historyRows = loadDebugHistory()
      .map(
        (entry) => `
          <div class="debug-side-row">
            <strong>${escapeHtml(entry.title || "Applied changes")}</strong>
            <small>${escapeHtml(entry.timestamp || "")}</small>
            ${
              entry.applied?.length
                ? `<span class="debug-side-copy">${escapeHtml(entry.applied.join(", "))}</span>`
                : ""
            }
            ${
              entry.backupPath
                ? `<code>${escapeHtml(entry.backupPath)}</code>`
                : ""
            }
          </div>
        `
      )
      .join("");
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

    if (debugBackups) {
      debugBackups.innerHTML = `
        <div class="debug-sidecard-head">
          <strong>Recent backups</strong>
          <span class="muted">${formatNumber((editor.backups || []).length)} files</span>
        </div>
        ${backupRows || `<div class="settings-note">No Codex backups found next to the current save yet.</div>`}
      `;
    }

    if (debugHistory) {
      debugHistory.innerHTML = `
        <div class="debug-sidecard-head">
          <strong>Recent changes</strong>
          <span class="muted">${formatNumber(loadDebugHistory().length)} entries</span>
        </div>
        ${historyRows || `<div class="settings-note">No debug changes have been applied in this browser yet.</div>`}
      `;
    }

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
      <div class="debug-subsection">
        <div class="debug-subsection-head">
          <h3>Diff preview</h3>
          <p>What will change if you apply the current safe draft.</p>
        </div>
        ${renderDebugDiff(safeDiff, "Safe drafts still match the current save.")}
      </div>
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
          <h3>Diff preview</h3>
          <p>Summary of progression changes waiting to be written.</p>
        </div>
        ${renderDebugDiff(advancedDiff, "Advanced drafts still match the current save.")}
      </div>
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
          <h3>Diff preview</h3>
          <p>Ship edits that will be written into the save.</p>
        </div>
        ${renderDebugDiff(dangerousDiff, "Dangerous drafts still match the current save.")}
      </div>
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
      <div class="debug-section-actions">
        <button id="debug-apply-dangerous" class="button-primary" type="button" ${canApply ? "" : "disabled"}>Apply dangerous changes</button>
      </div>
    `;

    debugExtremeEditor.innerHTML = `
      <div class="debug-subsection">
        <div class="debug-subsection-head">
          <h3>Diff preview</h3>
          <p>Raw story and world-state flags that will change.</p>
        </div>
        ${renderDebugDiff(extremeDiff, "Extreme drafts still match the current save.")}
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
        <button id="debug-apply-extreme" class="button-primary" type="button" ${canApply ? "" : "disabled"}>Apply extreme changes</button>
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
        input.addEventListener("change", () => {
          const [saveIndex, field] = String(input.dataset.debugShipField || "").split(":");
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
    debugDangerousEditor.querySelector("#debug-apply-dangerous")?.addEventListener("click", applyDangerousDebugChanges);
    debugExtremeEditor.querySelector("#debug-conditions")?.addEventListener("input", (event) => {
      state.debugConditionsDraft = event.target.value;
    });
    debugExtremeEditor.querySelector("#debug-apply-extreme")?.addEventListener("click", applyExtremeDebugChanges);
  }

  function bindDebugEvents() {
    debugWarningModal?.querySelectorAll("[data-modal-close='debug-warning']").forEach((element) => {
      element.addEventListener("click", closeDebugWarningModal);
    });
  }

  function handleGlobalEscape(event) {
    if (event.key === "Escape" && !debugWarningModal?.hidden) {
      closeDebugWarningModal();
    }
  }

  function syncModalState() {
    const anyOpen = !fitSaveModal?.hidden || !debugWarningModal?.hidden || !savePathModal?.hidden;
    document.body.classList.toggle("is-modal-open", Boolean(anyOpen));
  }

  return {
    loadDebugMode,
    loadDebugBackupPreference,
    toggleDebugMode,
    confirmDebugMode,
    closeDebugWarningModal,
    initializeDebugEditorDrafts,
    renderDebugEditor,
    bindDebugEvents,
    handleGlobalEscape,
    syncModalState,
  };
}

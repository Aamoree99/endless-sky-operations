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

export function getSaveInfo(state) {
  return state.status?.save || state.bootstrap?.save || null;
}

export function getGameInfo(state) {
  return state.status?.game || state.bootstrap?.game || null;
}

export function getPlannerSettings(state) {
  return state.status?.market?.plannerSettings || state.bootstrap?.config || null;
}

export function getAppInfo(state) {
  return state.status?.app || state.bootstrap?.app || null;
}

export function hasActiveSave(state) {
  return Boolean(getSaveInfo(state)?.available);
}

export function createSettingsController({ state, dom, runtime, helpers, actions }) {
  const {
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
  } = dom;
  const {
    escapeHtml,
    metricCard,
    formatCredits,
    formatNumber,
    formatOneDecimal,
  } = helpers;
  const {
    syncModalBodyState,
    rerenderAll,
    fetchBootstrap,
    fetchStatus,
  } = actions;

  function getPathSetupMeta(mode) {
    if (mode === "game") {
      const gameInfo = getGameInfo(state);
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

    const saveInfo = getSaveInfo(state);
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

  function getSettingsIssueCopy(kind, info) {
    if (!info?.issue) {
      return "";
    }
    if (kind === "save") {
      if (info.configuredRecentPath) {
        return "The configured recent.txt path is invalid. Choose a working recent.txt path or return to automatic detection.";
      }
      return "Automatic save discovery did not find a usable recent.txt. Choose recent.txt manually if this machine stores Endless Sky saves in a different location.";
    }
    if (info.configuredGameRoot) {
      return "The configured Endless Sky folder is invalid. Choose the real game folder or return to automatic detection.";
    }
    return "Automatic game detection did not find an Endless Sky install. Choose the game folder manually if it is installed in a custom location.";
  }

  async function exportAppConfigFromSettings() {
    try {
      let targetPath = null;
      if (runtime.isDesktop && runtime.bridge?.pickConfigExportPath) {
        targetPath = await runtime.bridge.pickConfigExportPath();
      }
      if (!targetPath) {
        return;
      }
      const response = await fetch("/api/app-config/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Config export failed.");
      }
      rerenderAll();
    } catch (error) {
      console.error(error);
    }
  }

  async function importAppConfigFromSettings() {
    try {
      let sourcePath = null;
      if (runtime.isDesktop && runtime.bridge?.pickConfigImportPath) {
        sourcePath = await runtime.bridge.pickConfigImportPath();
      }
      if (!sourcePath) {
        return;
      }
      const response = await fetch("/api/app-config/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sourcePath }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Config import failed.");
      }
      await fetchBootstrap();
      await fetchStatus();
      rerenderAll();
    } catch (error) {
      console.error(error);
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
    if (!hasActiveSave(state) || !getGameInfo(state)?.available) {
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
      if (runtime.isDesktop && runtime.bridge) {
        pickedPath =
          state.pathSetupMode === "game"
            ? await runtime.bridge.pickGameRoot()
            : await runtime.bridge.pickRecentPath();
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
    const saveInfo = getSaveInfo(state);
    const gameInfo = getGameInfo(state);
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

  function renderSettings() {
    if (!settingsOverview || !settingsDesktop || !settingsSave || !settingsGame || !settingsPlanner) {
      return;
    }

    const appInfo = getAppInfo(state);
    const saveInfo = getSaveInfo(state);
    const gameInfo = getGameInfo(state);
    const plannerSettings = getPlannerSettings(state);
    const operatingCostPerJump = Math.max(0, Math.round(Number(plannerSettings?.operatingCostPerJump) || 0));
    const salaryPerJump = Math.max(0, Math.round(Number(plannerSettings?.salaryPerJump) || 0));
    const debtPerJump = Math.max(0, Math.round(Number(plannerSettings?.debtPerJump) || 0));
    const illegalOutfitRiskPerJump = Math.max(0, Math.round(Number(plannerSettings?.illegalOutfitRiskPerJump) || 0));
    const illegalMissionRiskPerJump = Math.max(0, Math.round(Number(plannerSettings?.illegalMissionRiskPerJump) || 0));
    const scanBlockChance = Math.max(0, Math.min(1, Number(plannerSettings?.scanBlockChance) || 0));
    const scanSuccessChance = Math.max(0, Math.min(1, Number(plannerSettings?.scanSuccessChance) || 0));
    const cargoVisibleShare = Math.max(0, Math.min(1, Number(plannerSettings?.cargoVisibleShare) || 0));
    const illegalExposure = plannerSettings?.illegalExposure || {};
    const missionExposure = plannerSettings?.missionExposure || {};
    const illegalOutfits = illegalExposure?.illegalOutfits || [];
    const illegalMissions = missionExposure?.illegalMissions || [];
    const effectiveMissionFine = Math.max(0, Number(missionExposure?.totalEffectiveFine) || 0);

    const breakdownCards = [
      {
        label: "Salary",
        value: formatCredits(salaryPerJump),
        copy: "Crew wages pulled from the active fleet.",
      },
      {
        label: "Debt",
        value: formatCredits(debtPerJump),
        copy: "Mortgages and account debt amortized per jump-day.",
      },
      {
        label: "Outfit risk",
        value: formatCredits(illegalOutfitRiskPerJump),
        copy: illegalExposure?.totalIllegalFine
          ? `${formatCredits(illegalExposure.totalIllegalFine)} exposed if scanned.`
          : "No illegal outfits detected.",
      },
      {
        label: "Mission risk",
        value: formatCredits(illegalMissionRiskPerJump),
        copy: effectiveMissionFine
          ? `${formatCredits(effectiveMissionFine)} effective mission exposure.`
          : "No illegal or stealth missions detected.",
      },
    ];

    const outfitRiskRows = illegalOutfits.length
      ? illegalOutfits
          .slice(0, 6)
          .map(
            (item) => `
              <div class="settings-mini-row">
                <span>${escapeHtml(item.name)}</span>
                <strong>${formatNumber(item.count)} × ${formatCredits(item.fineEach)}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="settings-empty muted">No illegal outfits detected.</div>`;

    const missionRiskRows = illegalMissions.length
      ? illegalMissions
          .slice(0, 6)
          .map(
            (mission) => `
              <div class="settings-mini-row">
                <span>${escapeHtml(mission.name)}</span>
                <strong>${formatCredits(mission.effectiveFine || mission.illegalFine || 0)}${mission.stealth ? " · stealth" : ""}</strong>
              </div>
            `
          )
          .join("")
      : `<div class="settings-empty muted">No illegal or stealth missions detected.</div>`;

    settingsOverview.innerHTML = [
      metricCard("Mode", runtime.isDesktop ? "Desktop" : "Web", runtime.isDesktop ? "Native pickers enabled" : "Runs in the browser"),
      metricCard("Config", saveInfo?.configPath || gameInfo?.configPath || "Not available", "Local per-user app config"),
      metricCard("Save", saveInfo?.available ? "Found" : "Missing", saveInfo?.recentPath || saveInfo?.defaultRecentPath || "No recent.txt path"),
      metricCard("Game data", gameInfo?.available ? "Found" : "Missing", gameInfo?.root || "No game folder detected"),
    ].join("");

    settingsDesktop.innerHTML = `
      <article class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>About</h3>
            <p>Desktop build and local configuration tools.</p>
          </div>
          <span class="settings-state is-ok">v${escapeHtml(appInfo?.version || "0.0.0")}</span>
        </div>
        <div class="settings-list">
          <div class="settings-row"><span>Application</span><strong>${escapeHtml(appInfo?.productName || "Endless Sky Operations")}</strong></div>
          <div class="settings-row"><span>Runtime</span><strong>${escapeHtml(runtime.isDesktop ? `Desktop · ${platformLabel(runtime.platform)}` : "Web preview")}</strong></div>
          <div class="settings-row"><span>Config file</span><strong>${escapeHtml(saveInfo?.configPath || gameInfo?.configPath || "Not available")}</strong></div>
        </div>
        <div class="settings-actions">
          <button class="button-primary" data-settings-config-action="export" type="button" ${runtime.isDesktop ? "" : "disabled"}>Export config</button>
          <button class="button-secondary" data-settings-config-action="import" type="button" ${runtime.isDesktop ? "" : "disabled"}>Import config</button>
        </div>
        <div class="settings-note">${escapeHtml(runtime.isDesktop ? "Desktop builds can import or export the local app config with native file dialogs." : "Config import and export are available in the desktop app.")}</div>
      </article>
    `;

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
        ${saveInfo?.issue ? `<div class="settings-note">${escapeHtml(getSettingsIssueCopy("save", saveInfo))}</div>` : ""}
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
        ${gameInfo?.issue ? `<div class="settings-note">${escapeHtml(getSettingsIssueCopy("game", gameInfo))}</div>` : ""}
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
        <div class="settings-breakdown-grid">
          ${breakdownCards
            .map(
              (card) => `
                <div class="settings-breakdown-card">
                  <div class="settings-breakdown-label">${escapeHtml(card.label)}</div>
                  <div class="settings-breakdown-value">${escapeHtml(card.value)}</div>
                  <div class="settings-breakdown-copy">${escapeHtml(card.copy)}</div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="settings-list">
          <div class="settings-row">
            <span>Total automatic cost</span>
            <strong>${formatCredits(operatingCostPerJump)}</strong>
          </div>
          <div class="settings-row">
            <span>Scan survival</span>
            <strong>${formatNumber(Math.round(scanBlockChance * 100))}% blocked · ${formatNumber(Math.round(scanSuccessChance * 100))}% seen</strong>
          </div>
          <div class="settings-row">
            <span>Cargo concealment</span>
            <strong>${formatOneDecimal(illegalExposure?.totalCargoConcealment || 0)} · ${formatNumber(Math.round(cargoVisibleShare * 100))}% visible</strong>
          </div>
          <div class="settings-row">
            <span>Illegal outfit exposure</span>
            <strong>${illegalExposure?.totalIllegalFine ? formatCredits(illegalExposure.totalIllegalFine) : "None detected"}</strong>
          </div>
          <div class="settings-row">
            <span>Mission exposure</span>
            <strong>${effectiveMissionFine ? formatCredits(effectiveMissionFine) : "None detected"}</strong>
          </div>
        </div>
        <div class="settings-two-column">
          <div class="settings-subcard">
            <div class="settings-subcard-head">
              <strong>Outfit sources</strong>
              <span class="muted">${formatNumber(illegalOutfits.length)} items</span>
            </div>
            <div class="settings-mini-list">${outfitRiskRows}</div>
          </div>
          <div class="settings-subcard">
            <div class="settings-subcard-head">
              <strong>Mission sources</strong>
              <span class="muted">${formatNumber(illegalMissions.length)} entries</span>
            </div>
            <div class="settings-mini-list">${missionRiskRows}</div>
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

    document.querySelectorAll("[data-settings-config-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.dataset.settingsConfigAction === "import") {
          await importAppConfigFromSettings();
        } else {
          await exportAppConfigFromSettings();
        }
      });
    });
  }

  function bindSettingsEvents() {
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
  }

  return {
    renderSaveSetupBanner,
    renderSettings,
    openSavePathModal,
    closeSavePathModal,
    bindSettingsEvents,
  };
}

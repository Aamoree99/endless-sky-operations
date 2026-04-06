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

export function createFitterController({ state, dom, helpers, selectors, actions }) {
  const {
    outfitSearch,
    outfitCategory,
    saveFitButton,
    fitSaveModal,
    fitSaveName,
    fitSaveNote,
    fitSaveCharcount,
    fitSaveCancel,
    fitSaveSubmit,
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
  } = dom;
  const {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    formatTwoDecimals,
    formatRemaining,
    formatDuration,
    formatSaleLocation,
  } = helpers;
  const {
    getShipDefinition,
    getOutfitDefinition,
    getStockLoadout,
    getInstallCheck,
    summarizeFit,
    normalizeShipDisplayShip,
  } = selectors;
  const {
    loadShipIntoFitter,
    adjustLoadout,
    syncModalBodyState,
  } = actions;

  function getInstalledOutfitNames() {
    const names = new Set();
    for (const ship of [
      ...(state.status?.fleet?.activeShips || []),
      ...(state.status?.fleet?.parkedShips || []),
    ]) {
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

  function getShipWiki(shipName) {
    return (state.status?.wiki?.ships || []).find((ship) => ship.name === shipName) || null;
  }

  function getShipAvailability(shipName) {
    const ship = getShipWiki(shipName);
    const progress = ship?.progressSaleLocations || [];
    const current = ship?.currentSaleLocations || [];
    const known = ship?.knownSaleLocations || [];
    if (progress.length) {
      return {
        tone: "available",
        label: `Buyable now at ${progress.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · ")}`,
        tags: progress.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })),
      };
    }
    if (current.length) {
      return {
        tone: "available",
        label: `On sale now at ${current.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · ")}`,
        tags: current.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })),
      };
    }
    if (known.length) {
      return {
        tone: "known",
        label: `Known sale data at ${known.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · ")}`,
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
    const owned = new Set([
      ...(state.status?.fleet?.activeShips || []),
      ...(state.status?.fleet?.parkedShips || []),
    ].map((ship) => ship.model)).has(shipName);
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
        return getShipVisibilityState(ship.name).buyable;
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

  function getFitterOwnedShips() {
    return [
      ...(state.status?.fleet?.activeShips || []),
      ...(state.status?.fleet?.parkedShips || []),
    ].map(normalizeShipDisplayShip);
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
      (fit) => fit.name.toLowerCase() === name.toLowerCase()
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
      const index = existing.findIndex((fit) => fit.id === saved.id);
      state.bootstrap.fits.saved = index >= 0
        ? existing.map((fit, fitIndex) => (fitIndex === index ? saved : fit))
        : [...existing, saved];
      state.fitBrowserMode = "fits";
      closeFitSaveModal();
      renderFitBrowser();
    }
  }

  function setFitSelection(outfitName = null) {
    state.fitSelectedOutfitName = outfitName;
    renderFitSelection();
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
      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-delete-fit]")) {
          return;
        }
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

    fitBrowserList.querySelectorAll("[data-delete-fit]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const id = button.dataset.deleteFit;
        const response = await fetch(`/api/fits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (response.ok) {
          const data = await response.json();
          state.bootstrap.fits.saved = data.fits;
          renderFitBrowser();
        }
      });
    });
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

    if (attr.cost) factChips.push(`Price ${formatCredits(attr.cost)}`);
    if (attr.outfitSpace) factChips.push(`Outfit ${formatNumber(Math.abs(attr.outfitSpace))}`);
    if (attr.weaponCapacity) factChips.push(`Weapon ${formatNumber(Math.abs(attr.weaponCapacity))}`);
    if (attr.engineCapacity) factChips.push(`Engine ${formatNumber(Math.abs(attr.engineCapacity))}`);
    if (attr.hullDamage || attr.shieldDamage) factChips.push(`${formatOneDecimal(attr.hullDamage || 0)} hull / ${formatOneDecimal(attr.shieldDamage || 0)} shield`);
    if (attr.antiMissile) factChips.push(`AM ${formatNumber(attr.antiMissile)}`);
    if (attr.energyGeneration) factChips.push(`+${formatTwoDecimals(attr.energyGeneration)} energy`);
    if (attr.energyCapacity) factChips.push(`+${formatNumber(attr.energyCapacity)} battery`);
    if (attr.cooling) factChips.push(`+${formatNumber(attr.cooling)} cooling`);
    if (attr.shieldGeneration) factChips.push(`+${formatTwoDecimals(attr.shieldGeneration)} shields`);
    if (attr.thrust) factChips.push(`+${formatOneDecimal(attr.thrust)} thrust`);
    if (attr.turn) factChips.push(`+${formatOneDecimal(attr.turn)} turn`);
    if (attr.radarJamming) factChips.push(`Radar jam ${formatNumber(attr.radarJamming)}`);
    if (attr.opticalJamming) factChips.push(`Optical jam ${formatNumber(attr.opticalJamming)}`);

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
      { label: "Idle", energy: 60 * summary.idleEnergyPerFrame, heat: 60 * summary.idleHeatPerFrame },
      { label: "Moving", energy: -60 * summary.movingEnergyPerFrame, heat: 60 * summary.movingHeatPerFrame },
      { label: "Firing", energy: -60 * summary.firingEnergyPerFrame, heat: 60 * summary.firingHeatPerFrame },
      { label: summary.repairLabel, energy: -60 * summary.shieldAndHullEnergyPerFrame, heat: 60 * summary.shieldAndHullHeatPerFrame },
      { label: "Net change", energy: 60 * summary.netEnergyPerFrame, heat: 60 * summary.netHeatPerFrame, strong: true },
      { label: "Max", energy: summary.energyCapacity, heat: summary.displayMaxHeat, strong: true },
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
        (left, right) =>
          getFitCategoryOrder(left.outfit?.category || "Systems") -
            getFitCategoryOrder(right.outfit?.category || "Systems") ||
          left.name.localeCompare(right.name)
      );
  }

  function describeOutfit(outfit) {
    const attr = outfit.attributes;
    const parts = [];

    if (attr.outfitSpace) parts.push(`O ${formatNumber(Math.abs(attr.outfitSpace))}`);
    if (attr.weaponCapacity) parts.push(`W ${formatNumber(Math.abs(attr.weaponCapacity))}`);
    if (attr.engineCapacity) parts.push(`E ${formatNumber(Math.abs(attr.engineCapacity))}`);
    if (outfit.slotType === "gun" || outfit.slotType === "turret") {
      if (attr.hullDamage || attr.shieldDamage) {
        parts.push(`${formatOneDecimal(attr.hullDamage || 0)} hull`);
        parts.push(`${formatOneDecimal(attr.shieldDamage || 0)} shield`);
      }
      if (attr.antiMissile) {
        parts.push(`AM ${formatNumber(attr.antiMissile)}`);
      }
    } else {
      if (attr.energyGeneration) parts.push(`+${formatTwoDecimals(attr.energyGeneration)} energy`);
      if (attr.energyCapacity) parts.push(`+${formatNumber(attr.energyCapacity)} battery`);
      if (attr.cooling) parts.push(`+${formatNumber(attr.cooling)} cooling`);
      if (attr.shieldGeneration) parts.push(`+${formatTwoDecimals(attr.shieldGeneration)} shields`);
      if (attr.thrust) parts.push(`+${formatOneDecimal(attr.thrust)} thrust`);
      if (attr.turn) parts.push(`+${formatOneDecimal(attr.turn)} turn`);
      if (attr.radarJamming) parts.push(`R jam ${formatNumber(attr.radarJamming)}`);
      if (attr.opticalJamming) parts.push(`O jam ${formatNumber(attr.opticalJamming)}`);
    }

    return parts.slice(0, 4).join(" · ");
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
                        getFitCategoryOrder(left.outfit.category) - getFitCategoryOrder(right.outfit.category) ||
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

  function bindFitterEvents() {
    outfitSearch?.addEventListener("input", renderOutfitCatalog);
    outfitCategory?.addEventListener("change", renderOutfitCatalog);
    saveFitButton?.addEventListener("click", openFitSaveModal);
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
    fitBrowserSearch?.addEventListener("input", renderFitBrowser);
    fitBrowserTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.fitterPane = tab.dataset.fitBrowserTab;
        if (state.fitterPane === "ships" || state.fitterPane === "fits") {
          state.fitBrowserMode = state.fitterPane;
        }
        renderFitter();
      });
    });
  }

  return {
    renderShipCategoryOptions,
    renderFitter,
    renderFitBrowser,
    bindFitterEvents,
    closeFitSaveModal,
  };
}

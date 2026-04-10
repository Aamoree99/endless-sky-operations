import {
  buildFitSharePayload,
  buildFitProfileCardSvg,
  formatFitShareText,
  parseFitShareText,
} from "./fit-share.js";

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

  let fitShareContext = null;
  let fitShareProfileSvg = "";
  let fitCompareContext = null;
  let fitCompareTargetKey = "";
  let fitShareRenderToken = 0;
  const shipImageCache = new Map();

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

  function getCurrentFitDraft() {
    if (!state.fitShipName) {
      return null;
    }
    const liveShip = getFitterOwnedShips().find(
      (candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === state.fitSourceShipId
    );
    return {
      shipName: state.fitShipName,
      shipLabel: liveShip?.name || state.fitShipName,
      name: state.fitDraftName || `${state.fitShipName} fit`,
      note: state.fitDraftNote || "",
      loadout: state.fitLoadout,
    };
  }

  function resetCurrentFit() {
    if (!state.fitShipName) {
      return;
    }
    loadShipIntoFitter(state.fitShipName);
  }

  function updateFitCommandState() {
    const hasShip = Boolean(state.fitShipName);
    if (saveFitButton) {
      saveFitButton.disabled = !hasShip;
    }
    if (compareFitButton) {
      compareFitButton.disabled = !hasShip;
    }
    if (shareFitButton) {
      shareFitButton.disabled = !hasShip;
    }
    if (importFitButton) {
      importFitButton.disabled = false;
    }
    if (resetFitButton) {
      resetFitButton.disabled = !hasShip;
    }
  }

  function showFitShareStatus(target, message = "", tone = "info") {
    if (!target) {
      return;
    }
    target.hidden = !message;
    target.textContent = message;
    target.dataset.tone = message ? tone : "";
  }

  function getFitShareContext() {
    return fitShareContext || getCurrentFitDraft();
  }

  function getFitCompareEntries(shipName = state.fitShipName) {
    if (!shipName) {
      return [];
    }
    const entries = [
      {
        key: `stock:${shipName}`,
        shipName,
        label: `Stock · ${shipName}`,
        name: `${shipName} Stock`,
        note: "Official stock fit from the game.",
        loadout: getStockLoadout(shipName),
        kind: "stock",
      },
      ...(state.bootstrap?.fits?.presets || [])
        .filter((fit) => fit.shipName === shipName)
        .map((fit) => ({
          key: `preset:${fit.id}`,
          shipName: fit.shipName,
          label: `Baseline · ${fit.name}`,
          name: fit.name,
          note: fit.note || "",
          loadout: fit.loadout || getStockLoadout(fit.shipName),
          kind: "preset",
        })),
      ...(state.bootstrap?.fits?.saved || [])
        .filter((fit) => fit.shipName === shipName)
        .map((fit) => ({
          key: `saved:${fit.id}`,
          shipName: fit.shipName,
          label: `Saved · ${fit.name}`,
          name: fit.name,
          note: fit.note || "",
          loadout: fit.loadout,
          kind: "saved",
        })),
    ];
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry?.loadout) {
        return false;
      }
      if (seen.has(entry.key)) {
        return false;
      }
      seen.add(entry.key);
      return true;
    });
  }

  function getFitCompareTarget() {
    const current = fitCompareContext || getCurrentFitDraft();
    if (!current) {
      return null;
    }
    const options = getFitCompareEntries(current.shipName);
    return options.find((entry) => entry.key === fitCompareTargetKey) || options[0] || null;
  }

  function diffFitLoadouts(currentLoadout, targetLoadout) {
    const names = [...new Set([...Object.keys(currentLoadout || {}), ...Object.keys(targetLoadout || {})])].sort((a, b) =>
      a.localeCompare(b)
    );
    const added = [];
    const removed = [];
    const changed = [];
    for (const name of names) {
      const current = Number(currentLoadout?.[name] || 0);
      const target = Number(targetLoadout?.[name] || 0);
      if (current === target) {
        continue;
      }
      if (!current && target) {
        added.push({ name, current, target, delta: target });
      } else if (current && !target) {
        removed.push({ name, current, target, delta: -current });
      } else {
        changed.push({ name, current, target, delta: target - current });
      }
    }
    return { added, removed, changed };
  }

  function formatSignedDelta(value, formatter = formatNumber) {
    const numeric = Number(value) || 0;
    const abs = formatter(Math.abs(numeric));
    if (!numeric) {
      return "0";
    }
    return `${numeric > 0 ? "+" : "-"}${abs}`;
  }

  function renderCompareMetricRow(label, currentValue, targetValue, deltaText, tone = "neutral") {
    return `
      <div class="fit-compare-metric-row">
        <span class="fit-compare-metric-label">${escapeHtml(label)}</span>
        <span class="fit-compare-metric-value">${escapeHtml(currentValue)}</span>
        <span class="fit-compare-metric-value">${escapeHtml(targetValue)}</span>
        <span class="fit-compare-metric-delta is-${escapeHtml(tone)}">${escapeHtml(deltaText)}</span>
      </div>
    `;
  }

  function renderCompareLoadoutPanel(title, payload) {
    const grouped = groupEntriesByCategory(groupLoadoutEntries(payload.loadout || {}));
    return `
      <section class="fit-compare-loadout-panel">
        <div class="fit-compare-loadout-title">${escapeHtml(title)}</div>
        <div class="fit-compare-loadout-groups">
          ${
            grouped.length
              ? grouped
                  .map(
                    ([category, items]) => `
                      <div class="fit-compare-loadout-group">
                        <div class="fit-compare-loadout-group-title">${escapeHtml(category)}</div>
                        <div class="fit-compare-loadout-group-list">
                          ${items
                            .map(
                              (item) => `
                                <div class="fit-compare-loadout-item">
                                  <span>${escapeHtml(item.name)}</span>
                                  <strong>${escapeHtml(formatNumber(item.count))}</strong>
                                </div>
                              `
                            )
                            .join("")}
                        </div>
                      </div>
                    `
                  )
                  .join("")
              : `<div class="fit-compare-diff-empty">No outfits.</div>`
          }
        </div>
      </section>
    `;
  }

  function renderFitCompareModal() {
    if (!fitCompareModal) {
      return;
    }
    const current = fitCompareContext || getCurrentFitDraft();
    if (!current || !fitCompareTarget || !fitCompareSummary || !fitCompareLoadout) {
      return;
    }
    const options = getFitCompareEntries(current.shipName);
    if (!options.length) {
      fitCompareTarget.innerHTML = "";
      fitCompareSummary.innerHTML = "";
      fitCompareLoadout.innerHTML = "";
      showFitShareStatus(fitCompareStatus, "No comparable fits found for this hull yet.", "info");
      return;
    }

    if (!options.some((entry) => entry.key === fitCompareTargetKey)) {
      fitCompareTargetKey = options[0].key;
    }
    fitCompareTarget.innerHTML = options
      .map((entry) => `<option value="${escapeHtml(entry.key)}">${escapeHtml(entry.label)}</option>`)
      .join("");
    fitCompareTarget.value = fitCompareTargetKey;

    const target = getFitCompareTarget();
    if (!target) {
      fitCompareSummary.innerHTML = "";
      fitCompareLoadout.innerHTML = "";
      showFitShareStatus(fitCompareStatus, "Pick another fit to compare against.", "error");
      return;
    }

    const currentSummary = summarizeFit(current.shipName, current.loadout, { includeSustain: true });
    const targetSummary = summarizeFit(target.shipName, target.loadout, { includeSustain: true });
    if (!currentSummary || !targetSummary) {
      fitCompareSummary.innerHTML = "";
      fitCompareLoadout.innerHTML = "";
      showFitShareStatus(fitCompareStatus, "One of the compared fits could not be summarized.", "error");
      return;
    }

    showFitShareStatus(fitCompareStatus, "", "info");

    const currentCombat = currentSummary.sustain?.combat;
    const targetCombat = targetSummary.sustain?.combat;
    const metrics = [
      {
        label: "Speed",
        current: formatOneDecimal(currentSummary.maxSpeed),
        target: formatOneDecimal(targetSummary.maxSpeed),
        delta: formatSignedDelta(targetSummary.maxSpeed - currentSummary.maxSpeed, formatOneDecimal),
        tone: targetSummary.maxSpeed >= currentSummary.maxSpeed ? "up" : "down",
      },
      {
        label: "Cargo",
        current: `${formatNumber(currentSummary.cargoSpace)} t`,
        target: `${formatNumber(targetSummary.cargoSpace)} t`,
        delta: `${targetSummary.cargoSpace - currentSummary.cargoSpace >= 0 ? "+" : "-"}${formatNumber(Math.abs(targetSummary.cargoSpace - currentSummary.cargoSpace))} t`,
        tone: targetSummary.cargoSpace >= currentSummary.cargoSpace ? "up" : "down",
      },
      {
        label: "Jumps",
        current: formatNumber(currentSummary.jumpCount),
        target: formatNumber(targetSummary.jumpCount),
        delta: formatSignedDelta(targetSummary.jumpCount - currentSummary.jumpCount, formatNumber),
        tone: targetSummary.jumpCount >= currentSummary.jumpCount ? "up" : "down",
      },
      {
        label: "Shields",
        current: formatNumber(currentSummary.shields),
        target: formatNumber(targetSummary.shields),
        delta: formatSignedDelta(targetSummary.shields - currentSummary.shields, formatNumber),
        tone: targetSummary.shields >= currentSummary.shields ? "up" : "down",
      },
      {
        label: "Hull",
        current: formatNumber(currentSummary.hull),
        target: formatNumber(targetSummary.hull),
        delta: formatSignedDelta(targetSummary.hull - currentSummary.hull, formatNumber),
        tone: targetSummary.hull >= currentSummary.hull ? "up" : "down",
      },
      {
        label: "Crew",
        current: `${formatNumber(currentSummary.requiredCrew)} / ${formatNumber(currentSummary.bunks)}`,
        target: `${formatNumber(targetSummary.requiredCrew)} / ${formatNumber(targetSummary.bunks)}`,
        delta: formatSignedDelta(targetSummary.requiredCrew - currentSummary.requiredCrew, formatNumber),
        tone: "neutral",
      },
      {
        label: "Value",
        current: formatCredits(currentSummary.totalCost),
        target: formatCredits(targetSummary.totalCost),
        delta: formatSignedDelta(targetSummary.totalCost - currentSummary.totalCost, formatCredits),
        tone: "neutral",
      },
      {
        label: "Outfit free",
        current: `${formatRemaining(currentSummary.freeOutfit)} / ${formatNumber(getShipDefinition(current.shipName)?.attributes?.outfitSpace || 0)}`,
        target: `${formatRemaining(targetSummary.freeOutfit)} / ${formatNumber(getShipDefinition(target.shipName)?.attributes?.outfitSpace || 0)}`,
        delta: formatSignedDelta(targetSummary.freeOutfit - currentSummary.freeOutfit, formatNumber),
        tone: targetSummary.freeOutfit >= currentSummary.freeOutfit ? "up" : "down",
      },
      {
        label: "Weapon free",
        current: `${formatRemaining(currentSummary.freeWeapon)} / ${formatNumber(getShipDefinition(current.shipName)?.attributes?.weaponCapacity || 0)}`,
        target: `${formatRemaining(targetSummary.freeWeapon)} / ${formatNumber(getShipDefinition(target.shipName)?.attributes?.weaponCapacity || 0)}`,
        delta: formatSignedDelta(targetSummary.freeWeapon - currentSummary.freeWeapon, formatNumber),
        tone: targetSummary.freeWeapon >= currentSummary.freeWeapon ? "up" : "down",
      },
      {
        label: "Engine free",
        current: `${formatRemaining(currentSummary.freeEngine)} / ${formatNumber(getShipDefinition(current.shipName)?.attributes?.engineCapacity || 0)}`,
        target: `${formatRemaining(targetSummary.freeEngine)} / ${formatNumber(getShipDefinition(target.shipName)?.attributes?.engineCapacity || 0)}`,
        delta: formatSignedDelta(targetSummary.freeEngine - currentSummary.freeEngine, formatNumber),
        tone: targetSummary.freeEngine >= currentSummary.freeEngine ? "up" : "down",
      },
      {
        label: "Hull DPS",
        current: formatOneDecimal(currentSummary.hullDps),
        target: formatOneDecimal(targetSummary.hullDps),
        delta: formatSignedDelta(targetSummary.hullDps - currentSummary.hullDps, formatOneDecimal),
        tone: targetSummary.hullDps >= currentSummary.hullDps ? "up" : "down",
      },
      {
        label: "Shield DPS",
        current: formatOneDecimal(currentSummary.shieldDps),
        target: formatOneDecimal(targetSummary.shieldDps),
        delta: formatSignedDelta(targetSummary.shieldDps - currentSummary.shieldDps, formatOneDecimal),
        tone: targetSummary.shieldDps >= currentSummary.shieldDps ? "up" : "down",
      },
      {
        label: "Anti-missile",
        current: formatNumber(currentSummary.antiMissile),
        target: formatNumber(targetSummary.antiMissile),
        delta: formatSignedDelta(targetSummary.antiMissile - currentSummary.antiMissile, formatNumber),
        tone: targetSummary.antiMissile >= currentSummary.antiMissile ? "up" : "down",
      },
      {
        label: "Jamming",
        current: `R ${formatNumber(currentSummary.radarJamming)} · O ${formatNumber(currentSummary.opticalJamming)} · IR ${formatNumber(currentSummary.infraredJamming)}`,
        target: `R ${formatNumber(targetSummary.radarJamming)} · O ${formatNumber(targetSummary.opticalJamming)} · IR ${formatNumber(targetSummary.infraredJamming)}`,
        delta: "mixed",
        tone: "neutral",
      },
      {
        label: "Battery",
        current: currentCombat?.batteryEmptyAt ? `Empty in ${formatDuration(currentCombat.batteryEmptyAt)}` : "Stable",
        target: targetCombat?.batteryEmptyAt ? `Empty in ${formatDuration(targetCombat.batteryEmptyAt)}` : "Stable",
        delta:
          currentCombat?.batteryEmptyAt === targetCombat?.batteryEmptyAt
            ? "same"
            : targetCombat?.batteryEmptyAt
              ? "weaker"
              : "safer",
        tone:
          currentCombat?.batteryEmptyAt === targetCombat?.batteryEmptyAt
            ? "neutral"
            : targetCombat?.batteryEmptyAt
              ? "down"
              : "up",
      },
      {
        label: "Heat",
        current: currentCombat?.overheatedAt ? `Overheats in ${formatDuration(currentCombat.overheatedAt)}` : "Stable",
        target: targetCombat?.overheatedAt ? `Overheats in ${formatDuration(targetCombat.overheatedAt)}` : "Stable",
        delta:
          currentCombat?.overheatedAt === targetCombat?.overheatedAt
            ? "same"
            : targetCombat?.overheatedAt
              ? "hotter"
              : "cooler",
        tone:
          currentCombat?.overheatedAt === targetCombat?.overheatedAt
            ? "neutral"
            : targetCombat?.overheatedAt
              ? "down"
              : "up",
      },
      {
        label: "Fit state",
        current: currentSummary.valid ? "Valid" : "Blocked",
        target: targetSummary.valid ? "Valid" : "Blocked",
        delta: targetSummary.valid === currentSummary.valid ? "same" : targetSummary.valid ? "safer" : "riskier",
        tone: targetSummary.valid === currentSummary.valid ? "neutral" : targetSummary.valid ? "up" : "down",
      },
    ];

    fitCompareSummary.innerHTML = `
      <div class="fit-compare-head">
        <article class="fit-compare-side">
          <div class="eyebrow">Current</div>
          <strong>${escapeHtml(current.name || `${current.shipName} fit`)}</strong>
          <span>${escapeHtml(current.shipLabel || current.shipName)}</span>
          <span>${escapeHtml(current.shipName)}</span>
          ${current.note ? `<p>${escapeHtml(current.note)}</p>` : ""}
        </article>
        <article class="fit-compare-side">
          <div class="eyebrow">Compared fit</div>
          <strong>${escapeHtml(target.name)}</strong>
          <span>${escapeHtml(target.shipLabel || target.shipName)}</span>
          <span>${escapeHtml(target.shipName)}</span>
          ${target.note ? `<p>${escapeHtml(target.note)}</p>` : ""}
        </article>
      </div>
      <div class="fit-compare-metrics">
        <div class="fit-compare-metric-row fit-compare-metric-row-head">
          <span class="fit-compare-metric-label">Metric</span>
          <span class="fit-compare-metric-value">Current</span>
          <span class="fit-compare-metric-value">Compared</span>
          <span class="fit-compare-metric-delta">Delta</span>
        </div>
        ${metrics.map((metric) => renderCompareMetricRow(metric.label, metric.current, metric.target, metric.delta, metric.tone)).join("")}
      </div>
    `;

    const diff = diffFitLoadouts(current.loadout, target.loadout);
    const renderDiffList = (title, items, tone) => `
      <section class="fit-compare-diff-card">
        <div class="fit-compare-diff-title">${escapeHtml(title)}</div>
        ${
          items.length
            ? `<div class="fit-compare-diff-list">
                ${items
                  .map(
                    (item) => `
                      <div class="fit-compare-diff-row">
                        <span>${escapeHtml(item.name)}</span>
                        <strong class="is-${escapeHtml(tone)}">${escapeHtml(`${item.current} → ${item.target}`)}</strong>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="fit-compare-diff-empty">No changes.</div>`
        }
      </section>
    `;

    fitCompareLoadout.innerHTML = `
      <div class="fit-compare-loadout-columns">
        ${renderCompareLoadoutPanel("Current loadout", current)}
        ${renderCompareLoadoutPanel("Compared loadout", target)}
      </div>
      <div class="fit-compare-diff-grid">
        ${renderDiffList("Added or increased", [...diff.added, ...diff.changed.filter((item) => item.delta > 0)], "up")}
        ${renderDiffList("Removed or reduced", [...diff.removed, ...diff.changed.filter((item) => item.delta < 0)], "down")}
      </div>
    `;
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read blob."));
      reader.readAsDataURL(blob);
    });
  }

  async function getShipImageDataUrl(ship) {
    const imageUrl = ship?.spriteUrl || ship?.thumbnailUrl || "";
    if (!imageUrl) {
      return "";
    }
    if (shipImageCache.has(imageUrl)) {
      return shipImageCache.get(imageUrl);
    }
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error("The ship art could not be loaded for image export.");
    }
    const dataUrl = await blobToDataUrl(await response.blob());
    shipImageCache.set(imageUrl, dataUrl);
    return dataUrl;
  }

  async function renderFitShareModal() {
    if (!fitShareModal) {
      return;
    }

    const context = getFitShareContext();
    if (!context) {
      if (fitShareOutput) {
        fitShareOutput.value = "";
      }
      if (fitShareImagePreview) {
        fitShareImagePreview.removeAttribute("src");
      }
      if (fitShareDownload) {
        fitShareDownload.hidden = true;
      }
      showFitShareStatus(fitShareStatus, "Pick a ship or load a fit first.", "info");
      return;
    }

    const payload = buildFitSharePayload(context);
    const summary = summarizeFit(payload.shipName, payload.loadout, { includeSustain: false });
    const format = fitShareFormat?.value || "plain";
    if (fitShareExportPanel) {
      fitShareExportPanel.hidden = false;
    }
    if (fitShareOutput) {
      fitShareOutput.value = formatFitShareText(payload, {
        format,
        summary,
        getOutfitDefinition,
        helpers: {
          formatCredits,
          formatNumber,
          formatOneDecimal,
        },
      });
    }

    const ship = getShipDefinition(payload.shipName);
    const renderToken = ++fitShareRenderToken;
    fitShareProfileSvg = "";
    showFitShareStatus(fitShareStatus, "Rendering profile card…", "info");
    try {
      const shipImageDataUrl = await getShipImageDataUrl(ship);
      if (renderToken !== fitShareRenderToken) {
        return;
      }
      fitShareProfileSvg = buildFitProfileCardSvg(payload, {
        ship,
        summary,
        shipImageDataUrl,
        sourceLabel: state.fitSourceShipId
          ? `Loaded from ${(getFitterOwnedShips().find((candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === state.fitSourceShipId)?.name || "current ship")}`
          : "Current fit",
        getOutfitDefinition,
        helpers: {
          formatCredits,
          formatNumber,
          formatOneDecimal,
        },
      });
      if (fitShareImagePreview) {
        fitShareImagePreview.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fitShareProfileSvg)}`;
      }
      showFitShareStatus(fitShareStatus, "Profile card ready.", "success");
    } catch (error) {
      fitShareProfileSvg = "";
      showFitShareStatus(fitShareStatus, error.message || "The profile card could not be rendered.", "error");
    }
  }

  function openFitShareModal(payload = null) {
    if (!fitShareModal) {
      return;
    }
    fitShareContext = payload ? buildFitSharePayload(payload) : getCurrentFitDraft();
    fitShareFormat.value = fitShareFormat.value || "plain";
    showFitShareStatus(fitShareStatus, "", "info");
    fitShareModal.hidden = false;
    syncModalBodyState();
    renderFitShareModal();
    setTimeout(() => fitShareOutput?.focus?.(), 0);
  }

  function closeFitShareModal() {
    if (!fitShareModal) {
      return;
    }
    fitShareModal.hidden = true;
    fitShareProfileSvg = "";
    showFitShareStatus(fitShareStatus, "", "info");
    syncModalBodyState();
  }

  async function copyFitShareOutput() {
    const output = fitShareOutput?.value?.trim();
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      showFitShareStatus(fitShareStatus, "Copied to clipboard.", "success");
    } catch {
      showFitShareStatus(fitShareStatus, "Clipboard access failed. Copy the text manually.", "error");
    }
  }

  async function downloadFitShareImage() {
    if (!fitShareProfileSvg) {
      return;
    }
    const blob = new Blob([fitShareProfileSvg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "sync";
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      image.src = svgUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 820;
      const context = canvas.getContext("2d");
      context.fillStyle = "#101110";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpgBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      const downloadUrl = URL.createObjectURL(jpgBlob || blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${(fitShareContext?.name || state.fitShipName || "fit").replace(/[^\w.-]+/g, "-")}-profile.jpg`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      showFitShareStatus(fitShareStatus, "Profile card downloaded.", "success");
    } catch {
      const fallbackUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fallbackUrl;
      link.download = `${(fitShareContext?.name || state.fitShipName || "fit").replace(/[^\w.-]+/g, "-")}-profile.svg`;
      link.click();
      URL.revokeObjectURL(fallbackUrl);
      showFitShareStatus(fitShareStatus, "JPG export failed. Downloaded SVG instead.", "error");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function openFitImportModal() {
    if (!fitImportModal) {
      return;
    }
    if (fitImportInput) {
      fitImportInput.value = "";
    }
    showFitShareStatus(fitImportStatus, "", "info");
    fitImportModal.hidden = false;
    syncModalBodyState();
    setTimeout(() => fitImportInput?.focus(), 0);
  }

  function closeFitImportModal() {
    if (!fitImportModal) {
      return;
    }
    fitImportModal.hidden = true;
    showFitShareStatus(fitImportStatus, "", "info");
    syncModalBodyState();
  }

  function loadImportedFit() {
    try {
      const payload = parseFitShareText(fitImportInput?.value || "");
      if (!getShipDefinition(payload.shipName)) {
        throw new Error(`This fit uses ${payload.shipName}, which is not available in the current game data.`);
      }
      state.fitterPane = "modules";
      loadShipIntoFitter(payload.shipName, payload.loadout, null, {
        name: payload.name,
        note: payload.note,
      });
      closeFitImportModal();
    } catch (error) {
      showFitShareStatus(fitImportStatus, error.message || "The fit could not be imported.", "error");
    }
  }

  function openFitCompareModal(targetKey = "") {
    if (!fitCompareModal) {
      return;
    }
    const current = getCurrentFitDraft();
    if (!current) {
      return;
    }
    fitCompareContext = buildFitSharePayload(current);
    fitCompareTargetKey = targetKey;
    fitCompareModal.hidden = false;
    syncModalBodyState();
    renderFitCompareModal();
  }

  function closeFitCompareModal() {
    if (!fitCompareModal) {
      return;
    }
    fitCompareModal.hidden = true;
    showFitShareStatus(fitCompareStatus, "", "info");
    syncModalBodyState();
  }

  function openFitSaveModal() {
    if (!fitSaveModal) {
      return;
    }
    fitSaveName.value = state.fitDraftName || (state.fitShipName ? `${state.fitShipName} fit` : "");
    fitSaveNote.value = state.fitDraftNote || "";
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
      state.fitDraftName = saved.name;
      state.fitDraftNote = saved.note || "";
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

    const renderFitCard = (fit, type) => {
      const loadout = fit.loadout || getStockLoadout(fit.shipName);
      const summary = summarizeFit(fit.shipName, loadout, { includeSustain: false });
      const ship = getShipDefinition(fit.shipName);
      const fitState = summary?.valid ? "Valid" : "Invalid";
      const kindLabel = type === "preset" ? "Baseline" : "Saved";
      const stats = summary
        ? [
            `Speed ${formatOneDecimal(summary.maxSpeed)}`,
            `Cargo ${formatNumber(summary.cargoSpace)}`,
            `Jumps ${formatNumber(summary.jumpCount)}`,
            `Value ${formatCredits(summary.totalCost)}`,
          ]
        : [];
      return `
        <article class="fit-browser-card fit-browser-card-compact fit-browser-fit-card" data-load-fit-browser="${escapeHtml(fit.id)}" data-fit-type="${type}">
          ${ship?.thumbnailUrl
            ? `<img class="fit-browser-card-image fit-browser-fit-image" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(fit.shipName)}" />`
            : `<div class="fit-browser-card-image fit-browser-fit-image ship-thumb-placeholder"></div>`}
          <div class="fit-browser-fit-body">
            <div class="fit-browser-card-head">
              <div>
                <div class="fit-browser-card-title">${escapeHtml(fit.name)}</div>
                <div class="fit-browser-card-meta">${escapeHtml(fit.shipName)} · ${escapeHtml(kindLabel)} · ${escapeHtml(fitState)}</div>
              </div>
            </div>
            ${stats.length ? `<div class="fit-browser-fit-stats">${stats.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
            ${fit.note ? `<div class="fit-browser-fit-note">${escapeHtml(fit.note)}</div>` : `<div class="fit-browser-fit-note fit-browser-fit-note-empty">No note.</div>`}
          </div>
          <div class="fit-browser-fit-side">
            <button class="button-inline" data-load-fit-button="${escapeHtml(fit.id)}" data-fit-type="${type}" type="button">Load</button>
            <button class="button-inline" data-compare-fit-browser="${escapeHtml(fit.id)}" data-fit-type="${type}" type="button">Compare</button>
            <button class="button-inline" data-share-fit-browser="${escapeHtml(fit.id)}" data-fit-type="${type}" type="button">Share</button>
            ${type === "saved" ? `<button class="fit-delete-btn" data-delete-fit="${escapeHtml(fit.id)}" title="Delete fit" type="button">✕</button>` : ""}
          </div>
        </article>
      `;
    };

    fitBrowserList.innerHTML = `
      ${scopeShipName && !state.debugMode ? `<div class="fit-browser-scope"><span class="tag">Ship filter: ${escapeHtml(scopeShipName)}</span><button class="button-inline" id="clear-fit-scope" type="button">Show all fits</button></div>` : ""}
      <section class="fit-browser-section">
        <div class="fit-browser-section-title">Baseline fits <span class="fit-browser-section-count">${formatNumber(presets.length)}</span></div>
        <div class="fit-browser-grid">
          ${presets.length ? presets.map((fit) => renderFitCard(fit, "preset")).join("") : `<div class="empty-state">No baseline fits match the current scope.</div>`}
        </div>
      </section>
      <section class="fit-browser-section">
        <div class="fit-browser-section-title">Saved fits <span class="fit-browser-section-count">${formatNumber(saved.length)}</span></div>
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
        if (
          event.target.closest("[data-delete-fit]") ||
          event.target.closest("[data-share-fit-browser]") ||
          event.target.closest("[data-load-fit-button]") ||
          event.target.closest("[data-compare-fit-browser]")
        ) {
          return;
        }
        const type = card.dataset.fitType;
        if (type === "preset") {
          const fit = (state.bootstrap?.fits?.presets || []).find((item) => item.id === card.dataset.loadFitBrowser);
          if (fit) {
            loadShipIntoFitter(fit.shipName, fit.loadout || getStockLoadout(fit.shipName), null, {
              name: fit.name,
              note: fit.note,
            });
          }
        } else {
          const fit = (state.bootstrap?.fits?.saved || []).find((item) => item.id === card.dataset.loadFitBrowser);
          if (fit) {
            loadShipIntoFitter(fit.shipName, fit.loadout, null, {
              name: fit.name,
              note: fit.note,
            });
          }
        }
      });
    });

    fitBrowserList.querySelectorAll("[data-load-fit-button]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const type = button.dataset.fitType;
        const source = type === "preset" ? state.bootstrap?.fits?.presets || [] : state.bootstrap?.fits?.saved || [];
        const fit = source.find((item) => item.id === button.dataset.loadFitButton);
        if (!fit) {
          return;
        }
        const loadout = type === "preset" ? fit.loadout || getStockLoadout(fit.shipName) : fit.loadout;
        loadShipIntoFitter(fit.shipName, loadout, null, {
          name: fit.name,
          note: fit.note,
        });
      });
    });

    fitBrowserList.querySelectorAll("[data-share-fit-browser]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const type = button.dataset.fitType;
        const source = type === "preset" ? state.bootstrap?.fits?.presets || [] : state.bootstrap?.fits?.saved || [];
        const fit = source.find((item) => item.id === button.dataset.shareFitBrowser);
        if (!fit) {
          return;
        }
        openFitShareModal({
          shipName: fit.shipName,
          name: fit.name,
          note: fit.note,
          loadout: fit.loadout,
        });
      });
    });

    fitBrowserList.querySelectorAll("[data-compare-fit-browser]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const type = button.dataset.fitType;
        const source = type === "preset" ? state.bootstrap?.fits?.presets || [] : state.bootstrap?.fits?.saved || [];
        const fit = source.find((item) => item.id === button.dataset.compareFitBrowser);
        if (!fit) {
          return;
        }
        if (state.fitShipName !== fit.shipName) {
          loadShipIntoFitter(fit.shipName, fit.loadout || getStockLoadout(fit.shipName), null, {
            name: fit.name,
            note: fit.note,
          });
        }
        requestAnimationFrame(() => openFitCompareModal(`${type}:${fit.id}`));
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
          loadShipIntoFitter(ship.model, ship.outfits, shipId, {
            name: `${ship.model} fit`,
            note: `Loaded from ${ship.name}`,
          });
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
    const fitTitle = state.fitDraftName && state.fitDraftName !== ship.name ? state.fitDraftName : "";
    const fitNote = state.fitDraftNote || "";
    const displayTitle = fitTitle || ship.name;
    const validityLabel = summary.valid ? "Fit valid" : "Fit blocked";
    const headerStats = [
      { label: "Speed", value: formatOneDecimal(summary.maxSpeed) },
      { label: "Cargo", value: `${formatNumber(summary.cargoSpace)} t` },
      { label: "Jumps", value: formatNumber(summary.jumpCount) },
      { label: "Crew", value: `${formatNumber(summary.requiredCrew)} / ${formatNumber(summary.bunks)}` },
      { label: "Value", value: formatCredits(summary.totalCost) },
      { label: "Outfit free", value: formatRemaining(summary.freeOutfit) },
    ];

    fitHeader.innerHTML = `
      <section class="fit-hero-card ${summary.valid ? "" : "is-invalid"}">
        <div class="fit-hero-topline">
          <div class="fit-hero-titleblock">
            <div class="eyebrow">${escapeHtml(ship.category)}</div>
            <h2>${escapeHtml(displayTitle)}</h2>
            <div class="fit-hero-identity">${fitTitle ? `${escapeHtml(ship.name)} · ${escapeHtml(ship.category)}` : `${escapeHtml(ship.category)} hull`}</div>
          </div>
          <div class="fit-hero-status">
            <span class="tag ${summary.valid ? "is-owned" : "is-invalid"}">${escapeHtml(validityLabel)}</span>
            <span class="tag">${escapeHtml(liveShipLabel)}</span>
          </div>
        </div>
        <div class="fit-hero-row">
          <div class="fit-hero-media">
            ${ship.thumbnailUrl
              ? `<img class="fit-hero-image-inline" src="${escapeHtml(ship.thumbnailUrl)}" alt="${escapeHtml(ship.name)}" />`
              : `<div class="fit-hero-image-inline fit-hero-placeholder"></div>`}
          </div>
          <div class="fit-hero-body">
            <div class="fit-hero-copyblock">
              ${fitNote ? `<p class="fit-description fit-description-strong">${escapeHtml(fitNote)}</p>` : ""}
              <p class="fit-description">${escapeHtml(ship.description || "No description available.")}</p>
              <p class="fit-description muted">${escapeHtml(availability.label)}</p>
              ${saleTags ? `<div class="fit-header-tags">${saleTags}</div>` : ""}
            </div>
            <div class="fit-hero-stats">
              ${headerStats
                .map(
                  (item) => `
                    <div class="fit-hero-stat">
                      <div class="fit-hero-stat-label">${escapeHtml(item.label)}</div>
                      <div class="fit-hero-stat-value">${escapeHtml(item.value)}</div>
                    </div>
                  `
                )
                .join("")}
            </div>
            <div class="fit-header-meta">
              <div class="metric-pill">Outfit delta <strong>${summary.outfitDeltaCost >= 0 ? "+" : "-"}${formatCredits(Math.abs(summary.outfitDeltaCost))}</strong></div>
              <div class="metric-pill">Hull price <strong>${formatCredits(ship.attributes.cost || 0)}</strong></div>
              ${ship.licenses?.length ? `<div class="metric-pill">License <strong>${escapeHtml(ship.licenses.join(", "))}</strong></div>` : ""}
              <div class="metric-pill">Source <strong>${escapeHtml(liveShipLabel)}</strong></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderFitSummary() {
    if (!state.fitShipName) {
      fitHeader.innerHTML = `<div class="fit-ship-display is-empty"><div class="empty-state">Pick a ship to start building a fit.</div></div>`;
      fitSummary.innerHTML = "";
      fitLoadout.innerHTML = "";
      outfitCatalog.innerHTML = "";
      fitSelection.innerHTML = "";
      if (fitOwnedShips) {
        fitOwnedShips.innerHTML = "";
      }
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
    updateFitCommandState();
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
    compareFitButton?.addEventListener("click", () => openFitCompareModal());
    shareFitButton?.addEventListener("click", () => openFitShareModal());
    importFitButton?.addEventListener("click", openFitImportModal);
    resetFitButton?.addEventListener("click", resetCurrentFit);
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
    fitShareFormat?.addEventListener("change", renderFitShareModal);
    fitShareCancel?.addEventListener("click", closeFitShareModal);
    fitShareCopy?.addEventListener("click", copyFitShareOutput);
    fitShareDownload?.addEventListener("click", downloadFitShareImage);
    fitImportCancel?.addEventListener("click", closeFitImportModal);
    fitImportSubmit?.addEventListener("click", loadImportedFit);
    fitImportInput?.addEventListener("input", () => showFitShareStatus(fitImportStatus, "", "info"));
    fitShareModal?.querySelectorAll("[data-modal-close='fit-share']").forEach((element) => {
      element.addEventListener("click", closeFitShareModal);
    });
    fitShareModal?.addEventListener("click", (event) => {
      if (event.target === fitShareModal) {
        closeFitShareModal();
      }
    });
    fitImportModal?.querySelectorAll("[data-modal-close='fit-import']").forEach((element) => {
      element.addEventListener("click", closeFitImportModal);
    });
    fitImportModal?.addEventListener("click", (event) => {
      if (event.target === fitImportModal) {
        closeFitImportModal();
      }
    });
    fitCompareTarget?.addEventListener("change", () => {
      fitCompareTargetKey = fitCompareTarget.value;
      renderFitCompareModal();
    });
    fitCompareCancel?.addEventListener("click", closeFitCompareModal);
    fitCompareModal?.querySelectorAll("[data-modal-close='fit-compare']").forEach((element) => {
      element.addEventListener("click", closeFitCompareModal);
    });
    fitCompareModal?.addEventListener("click", (event) => {
      if (event.target === fitCompareModal) {
        closeFitCompareModal();
      }
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
    closeFitShareModal,
    closeFitImportModal,
    closeFitCompareModal,
  };
}

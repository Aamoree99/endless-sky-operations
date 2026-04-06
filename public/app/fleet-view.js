export function createFleetController({ state, dom, helpers, selectors, actions }) {
  const {
    fleetOverview,
    fleetGroups,
    fleetList,
    standings,
    licenses,
  } = dom;
  const {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    formatTwoDecimals,
    metricCard,
  } = helpers;
  const {
    summarizeFit,
    normalizeShipDisplayShip,
    formatSaleLocation,
  } = selectors;
  const {
    loadShipIntoFitter,
  } = actions;

  function getShipSalaryPerDay(ship) {
    if (!ship || ship.parked) {
      return 0;
    }
    return Math.max(0, Math.round(Number(ship.crew) || 0) - 1) * 100;
  }

  function getShipSignature(ship) {
    return Object.entries(ship?.outfits || {})
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([name, count]) => `${name}:${count}`)
      .join("|");
  }

  function getShipSeriesBase(name) {
    const match = String(name || "").trim().match(/^(.*?)(?:\s+([IVXLCDM]+|\d+))$/i);
    return match?.[1]?.trim() || null;
  }

  function buildFleetGroupRows(ships) {
    const seriesCounts = new Map();
    for (const ship of ships) {
      const base = getShipSeriesBase(ship.name);
      if (!base) {
        continue;
      }
      const key = `${ship.model}|${base}`;
      seriesCounts.set(key, (seriesCounts.get(key) || 0) + 1);
    }

    const groups = new Map();
    for (const ship of ships) {
      const base = getShipSeriesBase(ship.name);
      const seriesKey = base ? `${ship.model}|${base}` : null;
      const isSeries = seriesKey && (seriesCounts.get(seriesKey) || 0) > 1;
      const groupKey = isSeries ? `series:${seriesKey}` : `model:${ship.model}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: isSeries ? base : ship.model,
          model: ship.model,
          kind: isSeries ? "series" : "model",
          ships: [],
        });
      }
      groups.get(groupKey).ships.push(ship);
    }

    return [...groups.values()]
      .map((group) => {
        const shipsInGroup = [...group.ships].sort((left, right) => left.name.localeCompare(right.name));
        const signatures = new Map();
        for (const ship of shipsInGroup) {
          const signature = getShipSignature(ship);
          if (!signatures.has(signature)) {
            signatures.set(signature, []);
          }
          signatures.get(signature).push(ship);
        }
        const canonicalSignature = [...signatures.entries()].sort(
          (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0])
        )[0]?.[0] || "";
        const outliers = shipsInGroup.filter((ship) => getShipSignature(ship) !== canonicalSignature);
        const leadShip =
          shipsInGroup.find((ship) => !ship.parked && getShipSignature(ship) === canonicalSignature) ||
          shipsInGroup.find((ship) => !ship.parked) ||
          shipsInGroup[0];

        return {
          ...group,
          ships: shipsInGroup,
          leadShip,
          outliers,
          fitVariants: signatures.size,
          activeCount: shipsInGroup.filter((ship) => !ship.parked).length,
          parkedCount: shipsInGroup.filter((ship) => ship.parked).length,
          totalCargo: shipsInGroup.reduce((sum, ship) => sum + (Number(ship.attributes?.cargoSpace) || 0), 0),
          totalFuel: shipsInGroup.reduce((sum, ship) => sum + Math.max(Number(ship.fuel) || 0, 0), 0),
          maxFuel: shipsInGroup.reduce(
            (sum, ship) => sum + Math.max(Number(ship.attributes?.fuelCapacity) || 0, Number(ship.fuel) || 0),
            0
          ),
          totalCrew: shipsInGroup.reduce((sum, ship) => sum + (Number(ship.crew) || 0), 0),
          totalSalary: shipsInGroup.reduce((sum, ship) => sum + getShipSalaryPerDay(ship), 0),
        };
      })
      .sort(
        (left, right) =>
          right.activeCount - left.activeCount ||
          right.ships.length - left.ships.length ||
          left.label.localeCompare(right.label)
      );
  }

  function renderFleetOverview(ships, groups) {
    if (!fleetOverview) {
      return;
    }
    const totalCargo = ships.reduce((sum, ship) => sum + (Number(ship.attributes?.cargoSpace) || 0), 0);
    const totalFuel = ships.reduce((sum, ship) => sum + Math.max(Number(ship.fuel) || 0, 0), 0);
    const totalFuelCap = ships.reduce(
      (sum, ship) => sum + Math.max(Number(ship.attributes?.fuelCapacity) || 0, Number(ship.fuel) || 0),
      0
    );
    const totalCrew = ships.reduce((sum, ship) => sum + (Number(ship.crew) || 0), 0);
    const totalSalary = ships.reduce((sum, ship) => sum + getShipSalaryPerDay(ship), 0);
    const driftCount = groups.filter((group) => group.outliers.length > 0).length;
    const largestGroup = groups[0] || null;

    fleetOverview.innerHTML = [
      metricCard("Fleet groups", formatNumber(groups.length), largestGroup ? `${largestGroup.label} · ${largestGroup.ships.length} ships` : "No grouped hulls"),
      metricCard("Cargo space", formatNumber(totalCargo), "Installed fleet cargo capacity"),
      metricCard("Fuel", `${formatNumber(totalFuel)} / ${formatNumber(totalFuelCap)}`, "Current fuel across the fleet"),
      metricCard("Crew", formatNumber(totalCrew), `${formatCredits(totalSalary)} / day active salary`),
      metricCard("Fit drift", formatNumber(driftCount), driftCount ? "Groups with non-standard loadouts detected" : "No subgroup fit drift detected"),
    ].join("");
  }

  function renderFleetGroups(groups) {
    if (!fleetGroups) {
      return;
    }
    if (!groups.length) {
      fleetGroups.innerHTML = `<div class="empty-state">No fleet groups were found.</div>`;
      return;
    }

    fleetGroups.innerHTML = groups
      .map((group) => {
        const leadId = group.leadShip?.uuid || `${group.leadShip?.model}-${group.leadShip?.name}`;
        const driftCopy = group.outliers.length
          ? `Drift: ${group.outliers.map((ship) => ship.name).join(", ")}`
          : group.fitVariants > 1
            ? `${formatNumber(group.fitVariants)} fit variants detected`
            : "Uniform subgroup fit";
        return `
          <article class="fleet-card fleet-group-card">
            <div class="ship-head">
              ${group.leadShip?.thumbnailUrl ? `<img class="ship-thumb" src="${escapeHtml(group.leadShip.thumbnailUrl)}" alt="${escapeHtml(group.model)}" />` : `<div class="ship-thumb ship-thumb-placeholder"></div>`}
              <div>
                <div class="ship-title">${escapeHtml(group.label)}</div>
                <div class="ship-subtitle">${escapeHtml(group.model)} · ${group.kind === "series" ? "series" : "group"} · ${formatNumber(group.ships.length)} ships</div>
                <div class="ship-meta">${formatNumber(group.activeCount)} active · ${formatNumber(group.parkedCount)} parked</div>
              </div>
            </div>
            <div class="pill-row">
              <div class="metric-pill">Cargo <strong>${formatNumber(group.totalCargo)}</strong></div>
              <div class="metric-pill">Fuel <strong>${formatNumber(group.totalFuel)} / ${formatNumber(group.maxFuel)}</strong></div>
              <div class="metric-pill">Crew <strong>${formatNumber(group.totalCrew)}</strong></div>
              <div class="metric-pill">Salary <strong>${formatCredits(group.totalSalary)}</strong></div>
            </div>
            <div class="meta-row">
              <span>Lead <strong>${escapeHtml(group.leadShip?.name || group.label)}</strong></span>
              <span>Variants <strong>${formatNumber(group.fitVariants)}</strong></span>
              <span>${group.outliers.length ? `<strong class="bad">${formatNumber(group.outliers.length)} drift</strong>` : `<strong class="good">Uniform</strong>`}</span>
            </div>
            <div class="route-note">${escapeHtml(driftCopy)}</div>
            <div class="route-actions">
              <button class="button-inline" data-load-group-fit="${escapeHtml(leadId)}" type="button">Open lead in fitter</button>
            </div>
          </article>
        `;
      })
      .join("");

    document.querySelectorAll("[data-load-group-fit]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.loadGroupFit;
        const allShips = [
          ...(state.status?.fleet?.activeShips || []),
          ...(state.status?.fleet?.parkedShips || []),
        ].map(normalizeShipDisplayShip);
        const ship = allShips.find((candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === id);
        if (ship) {
          loadShipIntoFitter(ship.model, ship.outfits, id);
        }
      });
    });
  }

  function renderFleet() {
    const ships = [
      ...(state.status?.fleet?.activeShips || []),
      ...(state.status?.fleet?.parkedShips || []),
    ].map(normalizeShipDisplayShip);

    if (!ships.length) {
      if (fleetOverview) {
        fleetOverview.innerHTML = "";
      }
      if (fleetGroups) {
        fleetGroups.innerHTML = "";
      }
      if (fleetList) {
        fleetList.innerHTML = `<div class="empty-state">No ships were found for the current commander.</div>`;
      }
      return;
    }

    const groups = buildFleetGroupRows(ships);
    renderFleetOverview(ships, groups);
    renderFleetGroups(groups);
    const shipGroupMeta = new Map();
    for (const group of groups) {
      for (const ship of group.ships) {
        shipGroupMeta.set(ship.uuid || `${ship.model}-${ship.name}`, {
          label: group.label,
          drift: group.outliers.some((entry) => (entry.uuid || `${entry.model}-${entry.name}`) === (ship.uuid || `${ship.model}-${ship.name}`)),
        });
      }
    }
    const sortedShips = [...ships].sort((left, right) => {
      const leftMeta = shipGroupMeta.get(left.uuid || `${left.model}-${left.name}`);
      const rightMeta = shipGroupMeta.get(right.uuid || `${right.model}-${right.name}`);
      return (
        String(leftMeta?.label || left.model).localeCompare(String(rightMeta?.label || right.model)) ||
        left.name.localeCompare(right.name)
      );
    });

    fleetList.innerHTML = sortedShips
      .map((ship) => {
        const fit = summarizeFit(ship.model, ship.outfits, { includeSustain: false });
        const groupMeta = shipGroupMeta.get(ship.uuid || `${ship.model}-${ship.name}`) || null;
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
                <div class="ship-meta">${escapeHtml(ship.system || "Unknown")}${ship.planet ? ` / ${escapeHtml(ship.planet)}` : ""}${groupMeta ? ` · ${escapeHtml(groupMeta.label)}` : ""}</div>
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
              <span>${groupMeta?.drift ? `<strong class="bad">Fit drift</strong>` : `<strong class="good">In series</strong>`}</span>
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
        const ship = sortedShips.find((candidate) => (candidate.uuid || `${candidate.model}-${candidate.name}`) === id);
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
      return "Not sold at an active outfitter right now. Usually unlocked through faction access or story progress.";
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

  return {
    renderFleet,
    renderStandings,
    renderLicenses,
  };
}

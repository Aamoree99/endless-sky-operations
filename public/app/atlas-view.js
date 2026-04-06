import {
  clamp,
  lerp,
  easeOutCubic,
  fitViewBox,
  getAtlasMapProjection,
  clampAtlasView,
} from "./map-view.js";

export function createAtlasController({
  state,
  dom,
  helpers,
  selectors,
  marketCommodityOrder,
}) {
  const {
    atlasSearch,
    atlasSystemList,
    atlasMapSvg,
    atlasMapOverlaySvg,
    atlasMapPlanet,
    atlasMapStock,
    atlasMapMarket,
    atlasDetail,
  } = dom;
  const { escapeHtml, formatNumber } = helpers;
  const {
    getKnownSystemNames,
    getLiveKnownSystemNames,
    getSystemsMap,
    getWormholeEdges,
    getConnectedSystemComponents,
  } = selectors;

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
    const worldScale = Math.min(width / Math.max(1, view.width), height / Math.max(1, view.height));
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
          .map((system) => {
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
          })
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
    const visibleNameSet = new Set(
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
    const pointEntries = visibleSystems.map((system) => pointEntryMap.get(system.name)).filter(Boolean);
    if (allPointEntries.length > 0) {
      const xs = allPointEntries.map((entry) => entry.x);
      const ys = allPointEntries.map((entry) => entry.y);
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
        const marketRows = marketCommodityOrder
          .filter((commodity) => typeof selected.prices?.[commodity] === "number")
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
                    .map((row) => {
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
                      `;
                    })
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
      } else if (!livePlanets.length) {
        const government = selected.government || "Unknown government";
        atlasMapPlanet.innerHTML = `
          <div class="atlas-planet-copy-mini">
            <div class="atlas-planet-name-mini">${escapeHtml(selected.name)}</div>
            <div class="atlas-planet-gov-mini">${escapeHtml(government)}</div>
            <div class="atlas-planet-service">No indexed planets</div>
          </div>
        `;
      } else {
        const visitedPlanets = new Set(state.status?.player?.visitedPlanets || []);
        const shipsTotal = livePlanets.flatMap((planet) => planet.shipItems || []).length;
        const outfitsTotal = livePlanets.flatMap((planet) => planet.outfitItems || []).length;
        const planetRows = livePlanets
          .map((planet) => {
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
          })
          .join("");
        const government = livePlanets[0]?.systemGovernment || livePlanets[0]?.government || "";
        atlasMapPlanet.innerHTML = `
          <div class="atlas-planet-copy-mini">
            <div class="atlas-planet-name-mini">${escapeHtml(selected.name)}</div>
            ${government ? `<div class="atlas-planet-gov-mini">${escapeHtml(government)}</div>` : ""}
            ${shipsTotal ? `<div class="atlas-planet-gov-mini">${formatNumber(shipsTotal)} ships · ${formatNumber(outfitsTotal)} outfits</div>` : ""}
          </div>
          <div class="atlas-planet-list">${planetRows}</div>
        `;
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
      const bounds = state.atlasAllBounds;
      const maxZoomOut = bounds
        ? Math.max(
            projection.width * 1.45,
            bounds.maxX - bounds.minX + projection.padding * 2,
            bounds.maxY - bounds.minY + projection.padding * 2
          )
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

  function bindAtlasEvents() {
    atlasSearch?.addEventListener("input", renderAtlasList);
  }

  return {
    getAtlasSystems,
    getOpenedPlanetNames,
    getGovernmentStanding,
    renderAtlasList,
    renderAtlas,
    bindAtlasEvents,
  };
}

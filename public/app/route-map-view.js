import { fitViewBox } from "./map-view.js";

export function createRouteMapController({
  state,
  dom,
  helpers,
  selectors,
  text,
}) {
  const { mapSvg, galaxyMapSvg, selectedRouteMeta } = dom;
  const { escapeHtml, formatNumber } = helpers;
  const {
    getSystemsMap,
    getRouteGraph,
    getWormholeEdges,
    getPreferredRouteContext,
    findShortestPath,
    bfsDistances,
    getConnectedSystemComponents,
  } = selectors;
  const { formatTradeLocation } = text;

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
    const routeGraph = getRouteGraph();
    const expanded = new Set(seedNames);
    const queue = Array.from(seedNames).map((name) => ({ name, depth: 0 }));

    while (queue.length) {
      const current = queue.shift();
      if (!routeGraph[current.name] || current.depth >= depth) {
        continue;
      }
      for (const next of routeGraph[current.name] || []) {
        if (!routeGraph[next] || expanded.has(next)) {
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
    const routeGraph = getRouteGraph();
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
        for (const next of routeGraph[current] || []) {
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

  return {
    renderMap,
  };
}

export function createDataController({ state, cloneLoadout }) {
  function getOwnedShipsRaw() {
    return [
      ...(state.status?.fleet?.activeShips || []),
      ...(state.status?.fleet?.parkedShips || []),
    ];
  }

  function getOwnedShipModelNames() {
    return new Set(getOwnedShipsRaw().map((ship) => ship.model));
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

  function getRouteGraph() {
    const systemsMap = getSystemsMap();
    const graph = {};
    for (const [name, system] of Object.entries(systemsMap)) {
      graph[name] = new Set(system.links || []);
    }
    for (const wormhole of state.bootstrap?.map?.wormholes || []) {
      for (const link of wormhole.links || []) {
        if (!graph[link.from] || !systemsMap[link.to]) {
          continue;
        }
        graph[link.from].add(link.to);
      }
    }
    return Object.fromEntries(Object.entries(graph).map(([name, links]) => [name, [...links]]));
  }

  function bfsDistances(start, maxDepth = Infinity) {
    const routeGraph = getRouteGraph();
    if (!start || !routeGraph[start]) {
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
      for (const next of routeGraph[current] || []) {
        if (!routeGraph[next] || distances[next] !== undefined) {
          continue;
        }
        distances[next] = depth + 1;
        queue.push(next);
      }
    }

    return distances;
  }

  function findShortestPath(start, end) {
    const routeGraph = getRouteGraph();
    if (!routeGraph[start] || !routeGraph[end]) {
      return [];
    }
    const queue = [start];
    const previous = new Map([[start, null]]);

    while (queue.length) {
      const current = queue.shift();
      if (current === end) {
        break;
      }
      for (const next of routeGraph[current] || []) {
        if (!routeGraph[next] || previous.has(next)) {
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
    const routeGraph = getRouteGraph();
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
        for (const next of routeGraph[current] || []) {
          if (!routeGraph[next] || visited.has(next)) {
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

  return {
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
  };
}

function hasCommodity(rows, commodity) {
  return rows.some((row) => row.commodity === commodity && Number(row.tons) > 0);
}

function formatLanding(planet, system) {
  return planet ? `${planet} (${system})` : system;
}

export function createTrackerState(route, currentSystem, cargoRows, startedAt) {
  const originLanding =
    route.access?.systems?.find((entry) => entry.system === route.origin)?.bestPlanet || null;
  const destinationLanding =
    route.access?.systems?.find((entry) => entry.system === route.destination)?.bestPlanet || null;
  return normalizeTrackerState(
    {
      origin: route.origin,
      destination: route.destination,
      originLanding,
      destinationLanding,
      outwardCommodity: route.outward.commodity,
      inboundCommodity: route.inbound.commodity,
      stage: "positioning",
      laps: 0,
      startedAt,
    },
    currentSystem,
    cargoRows
  );
}

export function normalizeTrackerState(trackerState, currentSystem, cargoRows) {
  if (!trackerState || !currentSystem) {
    return trackerState;
  }

  const outwardLoaded = hasCommodity(cargoRows, trackerState.outwardCommodity);
  const inboundLoaded = hasCommodity(cargoRows, trackerState.inboundCommodity);
  const next = { ...trackerState };

  if (currentSystem === trackerState.origin) {
    if (inboundLoaded) {
      next.stage = "home-ready";
      return next;
    }

    if (trackerState.stage === "return" || trackerState.stage === "home-ready") {
      next.laps = (trackerState.laps || 0) + 1;
    }
    next.stage = outwardLoaded ? "outbound" : "outbound-ready";
    return next;
  }

  if (currentSystem === trackerState.destination) {
    if (inboundLoaded) {
      next.stage = "return";
      return next;
    }
    next.stage = outwardLoaded ? "outbound" : "return-ready";
    return next;
  }

  next.stage = inboundLoaded ? "return" : outwardLoaded ? "outbound" : "positioning";
  return next;
}

export function getTrackerTravelPlan(trackerState) {
  if (!trackerState) {
    return [];
  }
  if (trackerState.stage === "positioning" || trackerState.stage === "home-ready") {
    return trackerState.origin ? [trackerState.origin] : [];
  }
  if (trackerState.stage === "outbound-ready" || trackerState.stage === "outbound") {
    return trackerState.destination ? [trackerState.destination] : [];
  }
  if (trackerState.stage === "return-ready" || trackerState.stage === "return") {
    return trackerState.origin ? [trackerState.origin] : [];
  }
  return [];
}

export function getTrackerStageMeta(trackerState, currentSystem) {
  if (!trackerState) {
    return null;
  }

  const loopLabel = `${trackerState.origin} → ${trackerState.destination} → ${trackerState.origin}`;
  const originLanding = formatLanding(trackerState.originLanding, trackerState.origin);
  const destinationLanding = formatLanding(
    trackerState.destinationLanding,
    trackerState.destination
  );

  if (trackerState.stage === "positioning") {
    return {
      title: loopLabel,
      stageLabel: "Positioning",
      copy: `Fly to ${originLanding} to begin the run.`,
    };
  }
  if (trackerState.stage === "outbound-ready") {
    return {
      title: loopLabel,
      stageLabel: "Outbound buy",
      copy: `You are at ${originLanding}. Buy ${trackerState.outwardCommodity} and launch for ${destinationLanding}.`,
    };
  }
  if (trackerState.stage === "outbound") {
    return {
      title: loopLabel,
      stageLabel: "Outbound sell",
      copy: `Carry ${trackerState.outwardCommodity} to ${destinationLanding}.`,
    };
  }
  if (trackerState.stage === "return-ready") {
    return {
      title: loopLabel,
      stageLabel: "Return buy",
      copy: `You are at ${destinationLanding}. Sell ${trackerState.outwardCommodity}, then buy ${trackerState.inboundCommodity}.`,
    };
  }
  if (trackerState.stage === "return") {
    return {
      title: loopLabel,
      stageLabel: "Return sell",
      copy: `Carry ${trackerState.inboundCommodity} back to ${originLanding}.`,
    };
  }
  if (trackerState.stage === "home-ready") {
    return {
      title: loopLabel,
      stageLabel: "Home sell",
      copy: `You are back at ${originLanding}. Sell ${trackerState.inboundCommodity} to complete the lap.`,
    };
  }
  return {
    title: loopLabel,
    stageLabel: "Tracking",
    copy: currentSystem ? `Current system: ${currentSystem}.` : "Tracking this loop.",
  };
}

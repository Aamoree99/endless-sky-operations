export function getBestPlanetForSystem(access, systemName) {
  return access?.systems?.find((entry) => entry.system === systemName)?.bestPlanet || null;
}

export function formatTradeLocation(systemName, access) {
  const planet = getBestPlanetForSystem(access, systemName);
  return planet ? `${planet} (${systemName})` : systemName;
}

export function getRouteAccessLabel(access) {
  switch (access?.status) {
    case "blocked":
      return "Landing blocked";
    case "unfriendly":
      return "Low reputation";
    case "gated":
      return "Access gate";
    case "unknown":
      return "Unknown access";
    default:
      return "Landing open";
  }
}

export function getRouteRiskBadges(route, plannerSettings) {
  const badges = [];
  const illegalOutfitRisk = Math.max(0, Number(plannerSettings?.illegalOutfitRiskPerJump) || 0);
  const illegalMissionRisk = Math.max(0, Number(plannerSettings?.illegalMissionRiskPerJump) || 0);
  const stealthMissionCount = Math.max(
    0,
    Number(plannerSettings?.missionExposure?.stealthMissionCount) || 0
  );

  if (route.access?.status === "open") {
    badges.push({ tone: "buyable", label: "Open landing" });
  } else if (route.access?.status === "gated") {
    badges.push({ tone: "owned", label: "Rep gate" });
  } else if (route.access?.status === "unfriendly") {
    badges.push({ tone: "owned", label: "Unfriendly space" });
  } else if (route.access?.status === "unknown") {
    badges.push({ tone: "debug", label: "Unknown access" });
  } else if (route.access?.status === "blocked") {
    badges.push({ tone: "owned", label: "Landing blocked" });
  }

  if (illegalOutfitRisk > 0) {
    badges.push({ tone: "owned", label: "Illegal outfits" });
  }
  if (illegalMissionRisk > 0) {
    badges.push({
      tone: stealthMissionCount > 0 ? "owned" : "warn",
      label: stealthMissionCount > 0 ? "Stealth mission" : "Illegal mission",
    });
  }
  if (illegalOutfitRisk <= 0 && illegalMissionRisk <= 0) {
    badges.push({ tone: "buyable", label: "Legal route" });
  }

  return badges;
}

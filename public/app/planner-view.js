import { getRouteAccessLabel, getRouteRiskBadges, formatTradeLocation } from "./planner-text.js";
import { getTrackerStageMeta } from "./tracker-state.js";

export function createPlannerController({ state, dom, helpers, selectors, actions }) {
  const {
    plannerControls,
    directMarkets,
    carrySales,
    localLoops,
    reachableLoops,
    activeRouteCard,
    tracker,
  } = dom;
  const {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatOneDecimal,
    routeMeta,
    getRouteJumpCount,
  } = helpers;
  const {
    getPlannerSettings,
    getLiveKnownSystemNames,
    getTrackerState,
    getPlannerCourseTarget,
  } = selectors;
  const {
    applyTravelPlan,
    startTrackingLoop,
    clearTracker,
    renderMap,
  } = actions;

  function isRouteAccessible(route) {
    return !route?.access || route.access.status === "open";
  }

  function isRouteLegalForPlanner(route) {
    const plannerSettings = getPlannerSettings();
    const illegalOutfitRisk = Math.max(0, Number(plannerSettings?.illegalOutfitRiskPerJump) || 0);
    const illegalMissionRisk = Math.max(0, Number(plannerSettings?.illegalMissionRiskPerJump) || 0);
    return (route?.access?.status || "open") === "open" && illegalOutfitRisk <= 0 && illegalMissionRisk <= 0;
  }

  function getPlannerQueryHaystack(route) {
    return [
      route?.origin,
      route?.destination,
      route?.commodity,
      route?.outward?.commodity,
      route?.inbound?.commodity,
      ...(route?.topTrades || []).map((trade) => trade.commodity),
      ...(route?.access?.systems || []).flatMap((entry) => [entry.planet, entry.government]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function routeMatchesPlannerControls(route) {
    const query = state.plannerQuery.trim().toLowerCase();
    if (query && !getPlannerQueryHaystack(route).includes(query)) {
      return false;
    }

    const status = route?.access?.status || "open";
    if (state.plannerLandingFilter === "open" && status !== "open") {
      return false;
    }
    if (state.plannerLandingFilter === "landable" && ["blocked", "unknown"].includes(status)) {
      return false;
    }
    if (state.plannerLandingFilter === "legal" && !isRouteLegalForPlanner(route)) {
      return false;
    }

    const reposition = Math.max(0, Number(route?.repositionJumps) || 0);
    if (state.plannerStartFilter === "here" && reposition !== 0) {
      return false;
    }
    if (state.plannerStartFilter === "2" && reposition > 2) {
      return false;
    }
    if (state.plannerStartFilter === "4" && reposition > 4) {
      return false;
    }

    return true;
  }

  function getRouteTradeSortValue(route) {
    switch (state.plannerSort) {
      case "netRun":
        return Number(route?.netProfit) || 0;
      case "fastest":
        return -(getRouteJumpCount(route) || 0);
      case "closest":
        return -(Math.max(0, Number(route?.repositionJumps) || 0));
      case "netDay":
      default:
        return (
          Number(route?.weightedProfitPerDayFromHere) ||
          Number(route?.profitPerDayFromHere) ||
          Number(route?.weightedProfitPerJump) ||
          Number(route?.netProfitPerJump) ||
          Number(route?.netProfit) ||
          0
        );
    }
  }

  function comparePlannerRoutes(left, right) {
    if (state.plannerSort === "fastest") {
      return (
        (getRouteJumpCount(left) || 0) - (getRouteJumpCount(right) || 0) ||
        (Math.max(0, Number(left?.repositionJumps) || 0) - Math.max(0, Number(right?.repositionJumps) || 0)) ||
        (Number(right?.netProfit) || 0) - (Number(left?.netProfit) || 0)
      );
    }
    if (state.plannerSort === "closest") {
      return (
        (Math.max(0, Number(left?.repositionJumps) || 0) - Math.max(0, Number(right?.repositionJumps) || 0)) ||
        (Number(right?.weightedProfitPerDayFromHere) || Number(right?.netProfit) || 0) -
          (Number(left?.weightedProfitPerDayFromHere) || Number(left?.netProfit) || 0)
      );
    }
    return (
      getRouteTradeSortValue(right) - getRouteTradeSortValue(left) ||
      (Math.max(0, Number(left?.repositionJumps) || 0) - Math.max(0, Number(right?.repositionJumps) || 0)) ||
      (getRouteJumpCount(left) || 0) - (getRouteJumpCount(right) || 0)
    );
  }

  function applyPlannerControls(routes = []) {
    return routes.filter(routeMatchesPlannerControls).sort(comparePlannerRoutes);
  }

  function isRouteKnownInLive(route) {
    if (state.debugMode) {
      return true;
    }
    const known = getLiveKnownSystemNames();
    const names = [route?.origin, route?.destination].filter(Boolean);
    return names.every((name) => known.has(name));
  }

  function filterPlannerRoutesForMode(routes = []) {
    return routes.filter((route) => isRouteKnownInLive(route));
  }

  function splitRoutesByAccess(routes = []) {
    const visibleRoutes = filterPlannerRoutesForMode(routes);
    return {
      safe: visibleRoutes.filter((route) =>
        ["open", "gated", "unfriendly"].includes(route?.access?.status || "open")
      ),
      risky: visibleRoutes.filter((route) =>
        ["blocked", "unknown"].includes(route?.access?.status || "open")
      ),
      hiddenInLive: Math.max(0, routes.length - visibleRoutes.length),
    };
  }

  function makeRouteKey(group, route) {
    if (!route) {
      return null;
    }
    if (route.type === "directMarket") {
      return [group, route.origin, route.destination, route.outward?.commodity].join("|");
    }
    if (route.type === "carrySale") {
      return [group, route.origin, route.destination, route.commodity, route.tons].join("|");
    }
    return [
      group,
      route.origin,
      route.destination,
      route.outward?.commodity,
      route.inbound?.commodity,
    ].join("|");
  }

  function setSelectedRoute(group, route) {
    state.selectedRouteKey = makeRouteKey(group, route);
    state.selectedRoute = { group, route };
    renderPlanner();
    renderMap();
  }

  function getAllRouteGroups() {
    const planner = state.status?.market?.planner;
    return {
      directMarkets: applyPlannerControls(filterPlannerRoutesForMode(planner?.directMarketsFromHere || [])),
      carrySales: applyPlannerControls(filterPlannerRoutesForMode(planner?.carrySales || [])),
      localLoops: applyPlannerControls(filterPlannerRoutesForMode(planner?.loopsFromHere || [])),
      reachableLoops: applyPlannerControls(filterPlannerRoutesForMode(planner?.reachableLoops || [])),
    };
  }

  function getTrackedRouteContext() {
    const trackerState = getTrackerState();
    if (!trackerState) {
      return null;
    }

    for (const group of ["localLoops", "reachableLoops"]) {
      const routes = getAllRouteGroups()[group] || [];
      const matched = routes.find(
        (route) =>
          route.origin === trackerState.origin &&
          route.destination === trackerState.destination &&
          route.outward?.commodity === trackerState.outwardCommodity &&
          route.inbound?.commodity === trackerState.inboundCommodity
      );
      if (matched) {
        return { group, route: matched, source: "tracker" };
      }
    }

    return null;
  }

  function pickPreferredRoute(group, routes = []) {
    if (!routes.length) {
      return null;
    }
    return routes.find(isRouteAccessible) || routes[0];
  }

  function getPreferredRouteContext() {
    if (state.selectedRouteKey) {
      const groups = getAllRouteGroups();
      for (const [group, routes] of Object.entries(groups)) {
        const route = routes.find((candidate) => makeRouteKey(group, candidate) === state.selectedRouteKey);
        if (route) {
          return { group, route, source: "selected" };
        }
      }
    }

    const tracked = getTrackedRouteContext();
    if (tracked) {
      return tracked;
    }

    const groups = getAllRouteGroups();
    const priority = [
      ["localLoops", groups.localLoops],
      ["directMarkets", groups.directMarkets],
      ["carrySales", groups.carrySales],
      ["reachableLoops", groups.reachableLoops],
    ];

    for (const [group, routes] of priority) {
      const route = pickPreferredRoute(group, routes);
      if (route) {
        return { group, route, source: "auto" };
      }
    }

    return null;
  }

  function renderPlannerControls() {
    if (!plannerControls) {
      return;
    }

    plannerControls.innerHTML = `
      <label class="planner-control planner-control-search">
        <span>Find route</span>
        <input id="planner-query" type="search" placeholder="System, planet, commodity…" value="${escapeHtml(state.plannerQuery)}" />
      </label>
      <label class="planner-control">
        <span>Sort by</span>
        <select id="planner-sort">
          <option value="netDay" ${state.plannerSort === "netDay" ? "selected" : ""}>Best net / day</option>
          <option value="netRun" ${state.plannerSort === "netRun" ? "selected" : ""}>Biggest net / run</option>
          <option value="fastest" ${state.plannerSort === "fastest" ? "selected" : ""}>Shortest trip</option>
          <option value="closest" ${state.plannerSort === "closest" ? "selected" : ""}>Closest start</option>
        </select>
      </label>
      <label class="planner-control">
        <span>Landing</span>
        <select id="planner-landing-filter">
          <option value="all" ${state.plannerLandingFilter === "all" ? "selected" : ""}>All routes</option>
          <option value="landable" ${state.plannerLandingFilter === "landable" ? "selected" : ""}>Landable only</option>
          <option value="open" ${state.plannerLandingFilter === "open" ? "selected" : ""}>Open landing only</option>
          <option value="legal" ${state.plannerLandingFilter === "legal" ? "selected" : ""}>Legal only</option>
        </select>
      </label>
      <label class="planner-control">
        <span>Start distance</span>
        <select id="planner-start-filter">
          <option value="all" ${state.plannerStartFilter === "all" ? "selected" : ""}>Anywhere</option>
          <option value="here" ${state.plannerStartFilter === "here" ? "selected" : ""}>Start here</option>
          <option value="2" ${state.plannerStartFilter === "2" ? "selected" : ""}>Within 2 jumps</option>
          <option value="4" ${state.plannerStartFilter === "4" ? "selected" : ""}>Within 4 jumps</option>
        </select>
      </label>
    `;

    plannerControls.querySelector("#planner-query")?.addEventListener("input", (event) => {
      state.plannerQuery = event.target.value;
      renderPlanner();
    });
    plannerControls.querySelector("#planner-sort")?.addEventListener("change", (event) => {
      state.plannerSort = event.target.value;
      renderPlanner();
    });
    plannerControls.querySelector("#planner-landing-filter")?.addEventListener("change", (event) => {
      state.plannerLandingFilter = event.target.value;
      renderPlanner();
    });
    plannerControls.querySelector("#planner-start-filter")?.addEventListener("change", (event) => {
      state.plannerStartFilter = event.target.value;
      renderPlanner();
    });
  }

  function renderRouteCostBreakdown(route) {
    const plannerSettings = getPlannerSettings();
    const operatingCostPerJump = Math.max(
      0,
      Number(route?.operatingCostPerJump ?? plannerSettings?.operatingCostPerJump) || 0
    );
    const totalOperatingCost = Math.max(0, Number(route?.operatingCost) || 0);
    if (operatingCostPerJump <= 0 && totalOperatingCost <= 0) {
      return "";
    }

    const breakdownBits = [
      ["salary", Math.max(0, Number(plannerSettings?.salaryPerJump) || 0)],
      ["debt", Math.max(0, Number(plannerSettings?.debtPerJump) || 0)],
      ["outfits", Math.max(0, Number(plannerSettings?.illegalOutfitRiskPerJump) || 0)],
      ["missions", Math.max(0, Number(plannerSettings?.illegalMissionRiskPerJump) || 0)],
    ]
      .filter(([, value]) => value > 0)
      .map(([label, value]) => `${label} ${formatCredits(value)}`);

    const jumpCount = getRouteJumpCount(route);
    return `
      <div class="route-note">
        Auto cost <strong>${formatCredits(operatingCostPerJump)} / jump</strong>
        ${totalOperatingCost > 0 ? ` · ${formatCredits(totalOperatingCost)} across ${formatNumber(jumpCount)} jumps` : ""}
        ${breakdownBits.length ? ` · ${escapeHtml(breakdownBits.join(" · "))}` : ""}
      </div>
    `;
  }

  function renderRouteAccess(access) {
    if (!access || access.status === "open") {
      return "";
    }
    return `
      <div class="route-access route-access-${escapeHtml(access.status)}">
        <strong>${escapeHtml(getRouteAccessLabel(access))}</strong>
        <span>${escapeHtml(access.alert || "")}</span>
      </div>
    `;
  }

  function renderRouteRiskTags(route) {
    const tags = getRouteRiskBadges(route, getPlannerSettings()).map(
      (badge) => `<span class="tag is-${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`
    );

    return tags.length ? `<div class="tag-row">${tags.join("")}</div>` : "";
  }

  function renderRouteActions(routeKey, group, options = {}) {
    const actions = [
      `<button class="button-inline" data-set-course="${escapeHtml(routeKey)}" data-route-group="${escapeHtml(group)}" type="button">Set course</button>`,
    ];
    if (options.trackLoop) {
      actions.push(
        `<button class="button-inline" data-track-loop="${escapeHtml(routeKey)}" data-route-group="${escapeHtml(group)}" type="button">Track loop</button>`
      );
    }
    return `<div class="route-actions">${actions.join("")}</div>`;
  }

  function renderCarrySales() {
    if (!carrySales) {
      return;
    }
    const panel = carrySales.closest(".panel");
    const routes = getAllRouteGroups().carrySales || [];
    const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
    const focused = getPreferredRouteContext();
    const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
    if (!safe.length) {
      if (panel) {
        panel.hidden = true;
      }
      carrySales.innerHTML = `<div class="empty-state">No attractive sale route was found for the cargo currently onboard.</div>`;
      return;
    }
    if (panel) {
      panel.hidden = false;
    }

    carrySales.innerHTML = safe
      .map((route) => {
        const routeKey = makeRouteKey("carrySales", route);
        const active = activeRouteKey === routeKey ? "is-active" : "";
        const destinationLabel = formatTradeLocation(route.destination, route.access);
        return `
          <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="carrySales">
            <div class="route-head">
              <div class="route-title">${escapeHtml(route.origin)} → ${escapeHtml(destinationLabel)}</div>
              <div class="route-score mono">${formatNumber(route.profitPerJump)} cr / jump</div>
            </div>
            ${routeMeta([
              `<strong>${escapeHtml(route.commodity)}</strong>`,
              `${formatNumber(route.tons)} tons`,
              `${formatNumber(route.jumps)} jumps`,
              `${formatNumber(route.projectedProfit)} total`,
            ])}
            ${renderRouteRiskTags(route)}
            ${renderRouteCostBreakdown(route)}
            <div class="route-note">
              Sell on <strong>${escapeHtml(destinationLabel)}</strong>. Basis ${formatNumber(route.buy)} / t, projected sale ${formatNumber(route.sell)} / t.
            </div>
            ${renderRouteAccess(route.access)}
            ${renderRouteActions(routeKey, "carrySales")}
          </article>
        `;
      })
      .join("") +
      [
        risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky cargo exits hidden in live mode.</div>` : "",
        hiddenInLive && !state.debugMode
          ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened destinations hidden in live mode.</div>`
          : "",
      ]
        .filter(Boolean)
        .join("");
  }

  function renderDirectMarkets() {
    if (!directMarkets) {
      return;
    }
    const routes = getAllRouteGroups().directMarkets || [];
    const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
    const focused = getPreferredRouteContext();
    const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
    if (!safe.length) {
      directMarkets.innerHTML = `<div class="empty-state">${risky.length ? `${formatNumber(risky.length)} routes were hidden because landing is blocked or not verified.` : "No profitable known trade run was found for the current cost model."}</div>`;
      return;
    }

    directMarkets.innerHTML = safe
      .map((route) => {
        const routeKey = makeRouteKey("directMarkets", route);
        const active = activeRouteKey === routeKey ? "is-active" : "";
        const originLabel = formatTradeLocation(route.origin, route.access);
        const destinationLabel = formatTradeLocation(route.destination, route.access);
        return `
          <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="directMarkets">
            <div class="route-head">
              <div class="route-title">${escapeHtml(originLabel)} → ${escapeHtml(destinationLabel)}</div>
              <div class="route-score mono">${formatNumber(route.netProfit)} / run</div>
            </div>
            ${routeMeta([
              `${formatNumber(route.travelJumps)} jumps total`,
              route.repositionJumps ? `${formatNumber(route.repositionJumps)} to start` : "Start here",
              `${formatOneDecimal(route.marginPerTonPerJump)} cr / t / jump`,
              `Buy on <strong>${escapeHtml(originLabel)}</strong>`,
              `Sell on <strong>${escapeHtml(destinationLabel)}</strong>`,
              `Best: <strong>${escapeHtml(route.outward.commodity)}</strong>`,
              `${formatNumber(route.netProfit)} net full hold`,
            ])}
            ${renderRouteRiskTags(route)}
            <div class="tag-row">
              ${route.topTrades
                .map(
                  (trade) =>
                    `<span class="tag">${escapeHtml(trade.commodity)} <strong>+${formatNumber(trade.margin)}</strong></span>`
                )
                .join("")}
            </div>
            <div class="route-note">
              Land on <strong>${escapeHtml(originLabel)}</strong>, buy <strong>${escapeHtml(route.outward.commodity)}</strong> at ${formatNumber(route.outward.buy)},
              then sell on <strong>${escapeHtml(destinationLabel)}</strong> at ${formatNumber(route.outward.sell)}.
            </div>
            ${renderRouteCostBreakdown(route)}
            ${renderRouteAccess(route.access)}
            ${renderRouteActions(routeKey, "directMarkets")}
          </article>
        `;
      })
      .join("") +
      [
        risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky or unverified markets hidden in live mode.</div>` : "",
        hiddenInLive && !state.debugMode
          ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened systems hidden in live mode.</div>`
          : "",
      ]
        .filter(Boolean)
        .join("");
  }

  function renderLoopCards(target, group, routes, emptyText) {
    if (!target) {
      return;
    }
    const { safe, risky, hiddenInLive } = splitRoutesByAccess(routes);
    const focused = getPreferredRouteContext();
    const activeRouteKey = focused ? makeRouteKey(focused.group, focused.route) : null;
    if (!safe.length) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(risky.length ? `${formatNumber(risky.length)} routes were hidden because landing is blocked or not verified.` : emptyText)}</div>`;
      return;
    }

    target.innerHTML = safe
      .map((route) => {
        const routeKey = makeRouteKey(group, route);
        const active = activeRouteKey === routeKey ? "is-active" : "";
        const originLabel = formatTradeLocation(route.origin, route.access);
        const destinationLabel = formatTradeLocation(route.destination, route.access);
        const supportingMetric =
          group === "reachableLoops"
            ? `${formatNumber(route.profitPerDayFromHere)} net / day from current position`
            : `${formatNumber(route.netProfitPerJump || route.profitPerJump)} net / jump`;

        return `
          <article class="route-card ${active} ${route.access?.status && route.access.status !== "open" ? `has-access-${route.access.status}` : ""}" data-select-route="${escapeHtml(routeKey)}" data-route-group="${escapeHtml(group)}">
            <div class="route-head">
              <div class="route-title">${escapeHtml(originLabel)} → ${escapeHtml(destinationLabel)} → ${escapeHtml(originLabel)}</div>
              <div class="route-score mono">${formatNumber(route.netProfit)} / loop</div>
            </div>
            ${routeMeta([
              `${formatNumber(route.totalJumps + (route.repositionJumps || 0))} jumps total`,
              `${formatNumber(route.totalMargin)} cr / t`,
              `${formatNumber(route.tradeCapacity || 0)} trade hold`,
              supportingMetric,
              `Buy on <strong>${escapeHtml(originLabel)}</strong>`,
              `Return via <strong>${escapeHtml(destinationLabel)}</strong>`,
              route.repositionJumps !== undefined ? `${formatNumber(route.repositionJumps)} to start` : "",
            ].filter(Boolean))}
            ${renderRouteRiskTags(route)}
            <div class="route-note">
              Outbound: land on <strong>${escapeHtml(originLabel)}</strong>, buy <strong>${escapeHtml(route.outward.commodity)}</strong>
              at ${formatNumber(route.outward.buy)} and sell in ${escapeHtml(destinationLabel)}
              at ${formatNumber(route.outward.sell)}.
            </div>
            <div class="route-note">
              Return: land on <strong>${escapeHtml(destinationLabel)}</strong>, buy <strong>${escapeHtml(route.inbound.commodity)}</strong>
              at ${formatNumber(route.inbound.buy)} and sell in ${escapeHtml(originLabel)}
              at ${formatNumber(route.inbound.sell)}.
            </div>
            ${renderRouteCostBreakdown(route)}
            ${renderRouteAccess(route.access)}
            ${renderRouteActions(routeKey, group, { trackLoop: true })}
          </article>
        `;
      })
      .join("") +
      [
        risky.length ? `<div class="route-footnote muted">${formatNumber(risky.length)} risky or unverified routes hidden in live mode.</div>` : "",
        hiddenInLive && !state.debugMode
          ? `<div class="route-footnote muted">${formatNumber(hiddenInLive)} unopened systems hidden in live mode.</div>`
          : "",
      ]
        .filter(Boolean)
        .join("");
  }

  function bindRouteInteractions() {
    document.querySelectorAll("[data-select-route]").forEach((card) => {
      card.addEventListener("click", () => {
        const group = card.dataset.routeGroup;
        const routeKey = card.dataset.selectRoute;
        const routes = getAllRouteGroups()[group] || [];
        const route = routes.find((candidate) => makeRouteKey(group, candidate) === routeKey);
        if (route) {
          setSelectedRoute(group, route);
        }
      });
    });
    document.querySelectorAll("[data-set-course]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const routeKey = button.dataset.setCourse;
        const group = button.dataset.routeGroup;
        const routes = getAllRouteGroups()[group] || [];
        const route = routes.find((candidate) => makeRouteKey(group, candidate) === routeKey);
        const target = getPlannerCourseTarget(route);
        if (target) {
          await applyTravelPlan([target], "planner");
          renderPlanner();
        }
      });
    });
    document.querySelectorAll("[data-track-loop]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const routeKey = button.dataset.trackLoop;
        const group = button.dataset.routeGroup;
        const routes = [...(getAllRouteGroups()[group] || [])];
        const route = routes.find((candidate) => makeRouteKey(group, candidate) === routeKey);
        if (route) {
          startTrackingLoop(route);
          renderPlanner();
          renderMap();
        }
      });
    });
  }

  function renderActiveRouteCard() {
    if (!activeRouteCard) {
      return;
    }
    const trackerState = getTrackerState();
    const currentSystem = state.status?.player?.currentSystem;
    if (!trackerState || !currentSystem) {
      activeRouteCard.innerHTML = "";
      activeRouteCard.classList.remove("has-route");
      return;
    }
    const stageMeta = getTrackerStageMeta(trackerState, currentSystem);

    activeRouteCard.innerHTML = `
      <div class="active-route-head">
        <div>
          <div class="active-route-label">Tracked loop</div>
          <div class="active-route-title">${escapeHtml(stageMeta?.title || `${trackerState.origin} → ${trackerState.destination} → ${trackerState.origin}`)}</div>
        </div>
        <div class="route-actions">
          <div class="active-route-score mono">${formatNumber(trackerState.laps || 0)} laps</div>
          <button class="button-inline" id="active-route-untrack" type="button">Untrack</button>
        </div>
      </div>
      <div class="tracker-line muted">${escapeHtml(stageMeta?.stageLabel || "Tracking")} · <span class="mono">${escapeHtml(currentSystem)}</span></div>
      <div class="active-route-copy">${escapeHtml(stageMeta?.copy || `Current system: ${currentSystem}.`)}</div>
    `;
    activeRouteCard.classList.add("has-route");
    document.getElementById("active-route-untrack")?.addEventListener("click", clearTracker);
  }

  function renderTracker() {
    if (!tracker) {
      return;
    }
    const trackerState = getTrackerState();
    const currentSystem = state.status?.player?.currentSystem;
    if (!trackerState || !currentSystem) {
      tracker.innerHTML = `<div class="empty-state">Select a loop and press <span class="mono">Track loop</span> to start.</div>`;
      return;
    }
    const stageMeta = getTrackerStageMeta(trackerState, currentSystem);

    tracker.innerHTML = `
      <div class="tracker-line muted">${escapeHtml(stageMeta?.stageLabel || "Tracking")} · <span class="mono">${escapeHtml(currentSystem)}</span></div>
      <div class="tracker-body">${escapeHtml(stageMeta?.copy || `Current system: ${currentSystem}.`)}</div>
    `;
  }

  function renderPlanner() {
    const groups = getAllRouteGroups();
    renderPlannerControls();
    renderCarrySales();
    renderDirectMarkets();
    renderLoopCards(
      localLoops,
      "localLoops",
      groups.localLoops || [],
      "No worthwhile known trade loop was found for the current cost model."
    );
    renderLoopCards(
      reachableLoops,
      "reachableLoops",
      groups.reachableLoops || [],
      "No reachable loop was found for the current cost model."
    );
    bindRouteInteractions();
    renderActiveRouteCard();
  }

  return {
    makeRouteKey,
    getAllRouteGroups,
    getPreferredRouteContext,
    renderPlanner,
    renderTracker,
  };
}

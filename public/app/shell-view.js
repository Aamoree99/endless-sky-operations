export function createShellController({ state, dom, helpers, selectors, actions }) {
  const {
    heroMeta,
    summaryStrip,
    missionOccupancy,
    cargoSummary,
  } = dom;
  const {
    escapeHtml,
    formatDate,
    formatNumber,
    metricCard,
  } = helpers;
  const { hasActiveSave } = selectors;
  const { toggleDebugMode } = actions;

  function renderHeroMeta() {
    if (!state.bootstrap || !state.status) {
      heroMeta.innerHTML = `<div class="meta-pill">Loading…</div>`;
      return;
    }

    const { player, fleet, save } = state.status;
    const saveUnavailable = !save?.available;
    const saveLabel = (save?.name || (saveUnavailable ? "Not found" : "Unknown")).replace(/\.txt$/i, "");
    const locationLabel = `${player.currentSystem || "Unknown"}${player.currentPlanet ? ` / ${player.currentPlanet}` : ""}`;
    heroMeta.innerHTML = [
      `<div class="meta-pill"><span>Save</span><strong>${escapeHtml(saveLabel)}</strong></div>`,
      saveUnavailable
        ? `<div class="meta-pill"><span>Status</span><strong>${escapeHtml(save?.issue || "Save not found")}</strong></div>`
        : `<div class="meta-pill"><span>Location</span><strong>${escapeHtml(locationLabel)}</strong></div>`,
      saveUnavailable
        ? `<div class="meta-pill"><span>Recent.txt</span><strong>${escapeHtml(save?.recentPath || save?.defaultRecentPath || "Not found")}</strong></div>`
        : `<div class="meta-pill"><span>Jumps</span><strong>${player.drive.currentJumps} / ${player.drive.fullJumps}</strong></div>`,
      saveUnavailable
        ? `<div class="meta-pill"><span>Config</span><strong>${escapeHtml(save?.configPath || "cache/app-config.json")}</strong></div>`
        : `<div class="meta-pill"><span>Fleet</span><strong>${fleet.activeShips.length} active · ${fleet.parkedShips.length} parked</strong></div>`,
      `<button class="meta-pill meta-pill-button ${state.debugMode ? "is-active" : ""}" id="debug-toggle" type="button"><span>Mode</span><strong>${state.debugMode ? "Debug" : "Live"}</strong></button>`,
      `<div class="meta-pill"><span>Updated</span><strong>${new Date(state.status.generatedAt).toLocaleTimeString()}</strong></div>`,
    ].join("");

    document.getElementById("debug-toggle")?.addEventListener("click", toggleDebugMode);
  }

  function renderSummary() {
    if (!state.status || !hasActiveSave()) {
      summaryStrip.innerHTML = "";
      return;
    }

    const { player, fleet } = state.status;
    const totals = fleet.totals;
    const cards = [
      metricCard("Date", escapeHtml(formatDate(player.date))),
      metricCard("Credits", `<span class="mono">${formatNumber(player.credits)}</span>`),
      metricCard(
        "Trade hold",
        `<span class="mono">${formatNumber(totals.tradeCargoCapacity)}</span>`,
        totals.missionCargo > 0
          ? `${formatNumber(totals.tradeFreeCargo)} free · ${formatNumber(totals.missionCargo)} mission cargo`
          : `${formatNumber(totals.tradeFreeCargo)} free right now`
      ),
      metricCard(
        "Cargo loaded",
        `<span class="mono">${formatNumber(totals.usedCargo)}</span>`,
        totals.freeCargoAfterMission > 0
          ? `${formatNumber(totals.freeCargoAfterMission)} free after mission reservations`
          : "No free cargo after mission reservations"
      ),
      metricCard(
        "Crew",
        `<span class="mono">${formatNumber(totals.crew)} / ${formatNumber(totals.bunks)}</span>`,
        totals.missionPassengers > 0
          ? `${formatNumber(totals.missionPassengers)} mission passengers · ${formatNumber(totals.dailySalary)} salary / day`
          : `${formatNumber(totals.freeBunks)} bunks free · ${formatNumber(totals.dailySalary)} salary / day`
      ),
      metricCard("Drive", escapeHtml(player.drive.drive), `${player.drive.fullJumps} full jumps`),
    ];
    summaryStrip.innerHTML = cards.join("");
  }

  function renderMissionOccupancy() {
    const totals = state.status?.fleet?.totals;
    const rows = state.status?.missions?.occupancy || [];
    if (!totals) {
      missionOccupancy.innerHTML = "";
      return;
    }

    if (!rows.length) {
      missionOccupancy.innerHTML = `<div class="empty-state">No mission cargo or passengers are currently occupying space.</div>`;
      return;
    }

    missionOccupancy.innerHTML = `
      <div class="pill-row">
        <div class="metric-pill">Mission cargo <strong>${formatNumber(totals.missionCargo)}</strong></div>
        <div class="metric-pill">Mission passengers <strong>${formatNumber(totals.missionPassengers)}</strong></div>
        <div class="metric-pill">Trade hold <strong>${formatNumber(totals.tradeCargoCapacity)}</strong></div>
        <div class="metric-pill">Free after missions <strong>${formatNumber(totals.freeCargoAfterMission)}</strong></div>
      </div>
      <div class="mission-grid">
        ${rows
          .map(
            (mission) => `
              <article class="mission-card">
                <div class="mission-name">${escapeHtml(mission.name)}</div>
                <div class="meta-row">
                  ${mission.destination ? `<span>${escapeHtml(mission.destination)}</span>` : ""}
                  ${mission.deadline ? `<span>${escapeHtml(formatDate(mission.deadline))}</span>` : ""}
                </div>
                ${mission.cargoTons > 0 ? `<div class="mission-line">${formatNumber(mission.cargoTons)} tons${mission.cargoName ? ` of ${escapeHtml(mission.cargoName)}` : ""}</div>` : ""}
                ${mission.passengers > 0 ? `<div class="mission-line">${formatNumber(mission.passengers)} passengers</div>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderCargo() {
    const panel = cargoSummary.closest(".panel");
    const rows = state.status?.market?.cargoSummary || [];
    if (!rows.length) {
      if (panel) {
        panel.hidden = true;
      }
      cargoSummary.innerHTML = `<div class="empty-state">No ordinary trade cargo is currently loaded.</div>`;
      return;
    }

    if (panel) {
      panel.hidden = false;
    }

    cargoSummary.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Commodity</th>
            <th>Tons</th>
            <th>Basis / t</th>
            <th>Local</th>
            <th>Margin / t</th>
            <th>Local sale</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.commodity)}</td>
                  <td>${formatNumber(row.tons)}</td>
                  <td>${formatNumber(row.basisPerTon)}</td>
                  <td>${formatNumber(row.localPrice)}</td>
                  <td class="${row.localMarginPerTon >= 0 ? "good" : "bad"}">${row.localMarginPerTon >= 0 ? "+" : ""}${formatNumber(row.localMarginPerTon)}</td>
                  <td>${formatNumber(row.localSaleValue)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  return {
    renderHeroMeta,
    renderSummary,
    renderMissionOccupancy,
    renderCargo,
  };
}

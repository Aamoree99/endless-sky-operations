import { firstCopyLine, clampCopy, uniqueByName } from "./text-utils.js";
import {
  humanizeMissionSummary,
  humanizeWorldStateNotes,
  getMissionChainKey,
  humanizeMissionChainSummary,
  humanizeDiaryEntry,
} from "./wiki-text.js";

export function createWikiController({ state, dom, helpers, selectors }) {
  const {
    wikiNav,
    wikiContent,
  } = dom;
  const {
    escapeHtml,
    formatCredits,
    formatNumber,
    formatTwoDecimals,
  } = helpers;
  const {
    getAtlasSystems,
    getSystemsMap,
    getBasePlanetMap,
    getOpenedPlanetNames,
    getOwnedShipModelNames,
    getGovernmentStanding,
    formatSaleLocation,
  } = selectors;

  function shortDate(date) {
    if (!date) {
      return "Unknown";
    }
    return `${date.day}.${date.month}.${date.year}`;
  }

  function wikiVisibility(label, tone, opened = false) {
    return { label, tone, opened };
  }

  function renderWikiVisibilityPill(visibility) {
    if (!visibility?.label) {
      return "";
    }
    return `<span class="wiki-pill wiki-pill-state is-${escapeHtml(visibility.tone || "hidden")}">${escapeHtml(visibility.label)}</span>`;
  }

  function getWorldVisibility(planet, context) {
    const isCurrent = planet.name === context.currentPlanet;
    const visited = context.openedPlanets.has(planet.name) || isCurrent;
    if (isCurrent || visited) {
      return wikiVisibility("Opened", "opened", true);
    }

    const systemKnown = context.knownSystemNames.has(planet.system);
    const requiredReputation = Number(planet.requiredReputation || 0);
    const standing = getGovernmentStanding(planet.government || planet.systemGovernment || "");
    if (systemKnown && requiredReputation > 0 && standing !== null && standing < requiredReputation) {
      return wikiVisibility("Known but locked", "locked", false);
    }
    if (systemKnown) {
      return wikiVisibility("Not visited", "known", false);
    }
    return wikiVisibility("Hidden in live mode", "hidden", false);
  }

  function getShipVisibility(ship) {
    if (ship.owned) {
      return wikiVisibility("Opened", "opened", true);
    }
    if (ship.openedSaleLocations.length) {
      return wikiVisibility("Opened", "opened", true);
    }
    if (ship.seenSaleLocations.length || ship.knownOpenedSaleLocations.length) {
      return wikiVisibility("Seen", "seen", false);
    }
    if (
      ship.rawKnownSaleLocations.length ||
      ship.rawProgressSaleLocations.length ||
      ship.rawCurrentSaleLocations.length
    ) {
      return wikiVisibility("Known but locked", "locked", false);
    }
    return wikiVisibility("Hidden in live mode", "hidden", false);
  }

  function getFactionVisibility(row, context) {
    if (
      context.logbookFactions.has(row.name) ||
      context.encounteredGovernments.has(row.name) ||
      row.value > -999.5
    ) {
      return wikiVisibility("Opened", "opened", true);
    }
    return wikiVisibility("Hidden in live mode", "hidden", false);
  }

  function buildWikiData() {
    const atlasSystems = getAtlasSystems();
    const systemsMap = getSystemsMap();
    const basePlanetsMap = getBasePlanetMap();
    const currentSystem = state.status?.player?.currentSystem || null;
    const currentPlanet = state.status?.player?.currentPlanet || null;
    const liveKnownSystemNames = new Set(state.status?.player?.knownSystems || []);
    if (currentSystem) {
      liveKnownSystemNames.add(currentSystem);
    }
    const openedPlanets = getOpenedPlanetNames();
    const visitedSystems = new Set(state.status?.player?.visitedSystems || []);
    const ownedShipModels = getOwnedShipModelNames();
    const standingsRows = state.status?.player?.standings || [];
    const rawLogbook = state.status?.wiki?.logbook || { dated: [], named: {} };
    const logbookFactions = new Set(Object.keys(rawLogbook.named?.Factions || {}));
    const factionLogIndex = new Map(
      Object.entries(rawLogbook.named?.Factions || {}).map(([name, lines]) => [
        name,
        lines.join(" ").trim(),
      ])
    );
    const allPlanets = (state.status?.wiki?.planets || []).filter((planet) =>
      state.debugMode ? true : liveKnownSystemNames.has(planet.system)
    );
    const worlds = allPlanets
      .map((planet) => {
        const visibility = getWorldVisibility(planet, {
          currentPlanet,
          openedPlanets,
          knownSystemNames: liveKnownSystemNames,
        });
        return {
          ...planet,
          visited: openedPlanets.has(planet.name),
          current: planet.name === currentPlanet,
          visibility,
          shortCopy: clampCopy(
            firstCopyLine(
              visibility.opened || state.debugMode ? planet.descriptions : "",
              visibility.opened || state.debugMode ? planet.spaceport : ""
            ),
            220
          ),
        };
      })
      .filter((planet) => state.debugMode || planet.visibility.opened)
      .sort(
        (left, right) =>
          (left.system || "").localeCompare(right.system || "") || left.name.localeCompare(right.name)
      );

    const systems = atlasSystems
      .map((system) => {
        const base = systemsMap[system.name] || {};
        const systemPlanets = allPlanets.filter((planet) => planet.system === system.name);
        const shipyardCount = systemPlanets.filter((planet) => planet.hasShipyard).length;
        const outfitterCount = systemPlanets.filter((planet) => planet.hasOutfitter).length;
        const visited = visitedSystems.has(system.name);
        const visibility = system.name === currentSystem
          ? wikiVisibility("Opened", "opened", true)
          : visited
            ? wikiVisibility("Opened", "opened", true)
            : liveKnownSystemNames.has(system.name)
              ? wikiVisibility("Seen", "seen", false)
              : wikiVisibility("Hidden in live mode", "hidden", false);
        return {
          ...system,
          government: base.government || null,
          visited,
          isCurrent: system.name === currentSystem,
          visibility,
          shipyardCount,
          outfitterCount,
          livePlanetCount: systemPlanets.length,
          pricesCount: Object.keys(system.prices || {}).length,
        };
      })
      .sort(
        (left, right) =>
          Number(right.isCurrent) - Number(left.isCurrent) ||
          Number(right.visited) - Number(left.visited) ||
          left.name.localeCompare(right.name)
      );

    const ships = uniqueByName(
      (state.bootstrap?.ships || [])
        .map((ship) => {
          const wiki = (state.status?.wiki?.ships || []).find((entry) => entry.name === ship.name) || null;
          const rawProgressSaleLocations = wiki?.progressSaleLocations || [];
          const rawCurrentSaleLocations = wiki?.currentSaleLocations || [];
          const rawKnownSaleLocations = wiki?.knownSaleLocations || [];
          const openedSaleLocations = rawProgressSaleLocations.filter((location) => openedPlanets.has(location.planet));
          const seenSaleLocations = rawCurrentSaleLocations.filter((location) => openedPlanets.has(location.planet));
          const knownOpenedSaleLocations = rawKnownSaleLocations.filter((location) => openedPlanets.has(location.planet));
          const owned = ownedShipModels.has(ship.name);
          const draft = {
            ...ship,
            owned,
            openedSaleLocations,
            seenSaleLocations,
            knownOpenedSaleLocations,
            rawProgressSaleLocations,
            rawCurrentSaleLocations,
            rawKnownSaleLocations,
          };
          const visibility = getShipVisibility(draft);
          if (!(state.debugMode || visibility.opened)) {
            return null;
          }
          return {
            ...draft,
            visibility,
            shortCopy: clampCopy(ship.description, 220),
          };
        })
        .filter(Boolean)
    ).sort(
      (left, right) =>
        Number(right.visibility.opened) - Number(left.visibility.opened) ||
        Number(right.owned) - Number(left.owned) ||
        Number(Boolean(right.openedSaleLocations.length)) - Number(Boolean(left.openedSaleLocations.length)) ||
        left.category.localeCompare(right.category) ||
        left.name.localeCompare(right.name)
    );

    const encounteredGovernments = new Set(
      [
        ...atlasSystems
          .filter((system) => liveKnownSystemNames.has(system.name))
          .map((system) => systemsMap[system.name]?.government || system.government),
        ...allPlanets
          .filter((planet) => liveKnownSystemNames.has(planet.system) || openedPlanets.has(planet.name))
          .map((planet) => planet.government || planet.systemGovernment),
      ].filter(Boolean)
    );
    const factions = standingsRows
      .map((row) => ({
        ...row,
        visibility: getFactionVisibility(row, { encounteredGovernments, logbookFactions }),
        logbookText: factionLogIndex.get(row.name) || "",
      }))
      .filter((row) => state.debugMode || row.visibility.opened)
      .sort(
        (left, right) =>
          Number(right.visibility.opened) - Number(left.visibility.opened) ||
          Number(right.name === "Republic") - Number(left.name === "Republic") ||
          Math.abs(right.value) - Math.abs(left.value) ||
          left.name.localeCompare(right.name)
      );

    const storyMissions = (state.status?.missions?.entries || [])
      .map((mission) => ({
        ...mission,
        visibility: mission.minor
          ? wikiVisibility("Hidden in live mode", "hidden", false)
          : wikiVisibility("Opened", "opened", true),
      }))
      .filter((mission) => state.debugMode || mission.visibility.opened)
      .sort(
        (left, right) =>
          Number(left.job) - Number(right.job) ||
          (left.name || left.id || "").localeCompare(right.name || right.id || "")
      )
      .map((mission) => ({
        ...mission,
        shortCopy: clampCopy(humanizeMissionSummary(mission), 220),
      }));

    const storyChains = Array.from(
      storyMissions.reduce((map, mission) => {
        const key = getMissionChainKey(mission);
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(mission);
        return map;
      }, new Map()).entries()
    )
      .map(([key, missions]) => {
        const destinations = [...new Set(missions.map((mission) => mission.destination).filter(Boolean))];
        const deadlines = missions
          .map((mission) => mission.deadline)
          .filter(Boolean)
          .sort((left, right) => {
            const lx = (left.year || 0) * 10000 + (left.month || 0) * 100 + (left.day || 0);
            const rx = (right.year || 0) * 10000 + (right.month || 0) * 100 + (right.day || 0);
            return lx - rx;
          });
        const visibility = missions.some((mission) => mission.visibility?.opened)
          ? wikiVisibility("Opened", "opened", true)
          : missions.some((mission) => mission.visibility?.tone === "hidden")
            ? wikiVisibility("Hidden in live mode", "hidden", false)
            : wikiVisibility("Seen", "seen", false);
        return {
          key,
          label: key,
          missions,
          destinations,
          visibility,
          deadline: deadlines[0] || null,
          shortCopy: clampCopy(humanizeMissionChainSummary({ missions }), 220),
        };
      })
      .sort(
        (left, right) =>
          Number(right.visibility?.opened) - Number(left.visibility?.opened) ||
          right.missions.length - left.missions.length ||
          left.label.localeCompare(right.label)
      );

    const worldState = worlds
      .map((planet) => {
        const base = basePlanetsMap[planet.name] || null;
        const override = planet.saveOverride || null;
        if (!base && !override?.present) {
          return null;
        }
        const notes = humanizeWorldStateNotes(planet, base, override);
        if (!notes.length) {
          return null;
        }
        return {
          name: planet.name,
          system: planet.system,
          landscapeUrl: planet.landscapeUrl,
          notes,
          visibility: planet.visibility,
          overrideOnly: Boolean(override?.present) && !base,
        };
      })
      .filter(Boolean)
      .filter((entry) => state.debugMode || entry.visibility.opened)
      .sort(
        (left, right) =>
          (left.system || "").localeCompare(right.system || "") || left.name.localeCompare(right.name)
      );

    const codexEntries = [];
    for (const [category, names] of Object.entries(rawLogbook.named || {})) {
      for (const [name, lines] of Object.entries(names)) {
        if (!name || !lines.length) {
          continue;
        }
        codexEntries.push({
          category,
          name,
          text: lines.join(" "),
          visibility: wikiVisibility("Opened", "opened", true),
        });
      }
    }
    codexEntries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const preferredLogbookCategoryOrder = ["Factions", "People", "Minor People"];
    const logbookGroupsMap = new Map();
    for (const entry of codexEntries) {
      if (!logbookGroupsMap.has(entry.category)) {
        logbookGroupsMap.set(entry.category, []);
      }
      logbookGroupsMap.get(entry.category).push(entry);
    }
    const logbookGroups = Array.from(logbookGroupsMap.entries())
      .sort((left, right) => {
        const leftRank = preferredLogbookCategoryOrder.indexOf(left[0]);
        const rightRank = preferredLogbookCategoryOrder.indexOf(right[0]);
        return (
          (leftRank === -1 ? 999 : leftRank) - (rightRank === -1 ? 999 : rightRank) ||
          left[0].localeCompare(right[0])
        );
      })
      .map(([category, entries]) => ({ category, entries }));

    const diaryEntries = [...(rawLogbook.dated || [])]
      .sort((a, b) => {
        const ay = a.year * 10000 + a.month * 100 + a.day;
        const by = b.year * 10000 + b.month * 100 + b.day;
        return by - ay;
      })
      .filter((entry) => entry.entries.length > 0)
      .map((entry) => ({
        ...entry,
        visibility: wikiVisibility("Opened", "opened", true),
      }));

    const diaryTimeline = diaryEntries.flatMap((entry) =>
      entry.entries.map((line, index) => ({
        id: `${entry.year}-${entry.month}-${entry.day}-${index}`,
        date: entry,
        line,
        shortCopy: humanizeDiaryEntry(line),
        visibility: entry.visibility,
      }))
    );

    const diaryLineCount = diaryEntries.reduce((sum, entry) => sum + entry.entries.length, 0);
    const factionLogCount = logbookGroups.find((group) => group.category === "Factions")?.entries.length || 0;
    const peopleLogCount = logbookGroups.find((group) => group.category === "People")?.entries.length || 0;
    const minorPeopleLogCount =
      logbookGroups.find((group) => group.category === "Minor People")?.entries.length || 0;

    const counts = {
      systems: systems.length,
      worlds: worlds.length,
      ships: ships.length,
      factions: factions.length,
      story: storyMissions.length + worldState.length,
      logbook: codexEntries.length + diaryLineCount,
      factionLog: factionLogCount,
      peopleLog: peopleLogCount,
      minorPeopleLog: minorPeopleLogCount,
      diaryLines: diaryLineCount,
    };
    const openedCounts = {
      systems: systems.filter((entry) => entry.visibility?.opened).length,
      worlds: worlds.filter((entry) => entry.visibility?.opened).length,
      ships: ships.filter((entry) => entry.visibility?.opened).length,
      factions: factions.filter((entry) => entry.visibility?.opened).length,
      story:
        storyMissions.filter((entry) => entry.visibility?.opened).length +
        worldState.filter((entry) => entry.visibility?.opened).length,
      logbook: codexEntries.length + diaryLineCount,
    };

    return {
      currentSystem,
      currentPlanet,
      systems,
      worlds,
      ships,
      factions,
      story: {
        missions: storyMissions,
        worldState,
        chains: storyChains,
      },
      logbook: {
        codex: codexEntries,
        diary: diaryEntries,
        timeline: diaryTimeline,
        groups: logbookGroups,
      },
      counts,
      openedCounts,
    };
  }

  function renderWiki() {
    if (!wikiNav || !wikiContent) {
      return;
    }
    if (!state.bootstrap || !state.status) {
      wikiNav.innerHTML = "";
      wikiContent.innerHTML = `<div class="empty-state">Loading wiki…</div>`;
      return;
    }

    const data = buildWikiData();
    const chapterMeta = (key, fallbackCopy) => {
      if (!key) {
        return fallbackCopy;
      }
      if (state.debugMode) {
        return `${formatNumber(data.counts[key] || 0)} shown · ${formatNumber(data.openedCounts[key] || 0)} opened`;
      }
      return `${formatNumber(data.openedCounts[key] || 0)} unlocked`;
    };
    const chapters = [
      {
        id: "wiki-overview",
        key: null,
        title: "Overview",
        copy: "Live field manual built from the active save.",
      },
      {
        id: "wiki-logbook",
        key: "logbook",
        title: "Logbook",
        copy: "Codex entries and diary unlocked in this save.",
      },
      {
        id: "wiki-worlds",
        key: "worlds",
        title: "Worlds",
        copy: "Visited planets, lore, and services.",
      },
      {
        id: "wiki-ships",
        key: "ships",
        title: "Ships",
        copy: "Owned hulls and models seen on visited markets.",
      },
      {
        id: "wiki-factions",
        key: "factions",
        title: "Factions",
        copy: "Governments and current standings.",
      },
      {
        id: "wiki-story",
        key: "story",
        title: "Story",
        copy: "Active missions and world-state changes.",
      },
    ];

    wikiNav.innerHTML = chapters
      .map(
        (chapter) => `
          <button class="wiki-nav-button" data-wiki-target="${chapter.id}" type="button">
            <span class="wiki-nav-title">${escapeHtml(chapter.title)}</span>
            <span class="wiki-nav-meta">${escapeHtml(chapterMeta(chapter.key, chapter.copy))}</span>
          </button>
        `
      )
      .join("");

    const worldsMarkup = data.worlds.length
      ? data.worlds
          .map((planet) => {
            const desc = (planet.descriptions || []).join(" ").trim() ||
              (planet.spaceport || []).join(" ").trim() || "";
            return `
              <article class="wiki-card wiki-world-card">
                ${planet.landscapeUrl
                  ? `<div class="wiki-world-landscape"><img src="${escapeHtml(planet.landscapeUrl)}" alt="${escapeHtml(planet.name)}" onerror="this.parentElement.style.display='none'" /></div>`
                  : ""}
                <div class="wiki-entity-body">
                  <div class="wiki-card-head">
                    <div>
                      <div class="wiki-card-title">${escapeHtml(planet.name)}</div>
                      <div class="wiki-card-meta">${escapeHtml(planet.system || "Unknown system")} · ${escapeHtml(planet.government || planet.systemGovernment || "Unknown government")}</div>
                    </div>
                    <div class="wiki-chip-row">
                      ${renderWikiVisibilityPill(planet.visibility)}
                      ${planet.current ? `<span class="wiki-pill is-current">Current</span>` : ""}
                      ${planet.hasShipyard ? `<span class="wiki-chip">Shipyard</span>` : ""}
                      ${planet.hasOutfitter ? `<span class="wiki-chip">Outfitter</span>` : ""}
                      ${planet.requiredReputation > 0 ? `<span class="wiki-chip">Rep ${formatNumber(planet.requiredReputation)}</span>` : ""}
                    </div>
                  </div>
                  ${desc ? `<p class="wiki-card-copy">${escapeHtml(desc)}</p>` : ""}
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="wiki-empty">No visited worlds yet.</div>`;

    const shipsMarkup = data.ships.length
      ? data.ships
          .map(
            (ship) => `
              <article class="wiki-card wiki-ship-card">
                <div class="wiki-entity-art">
                  ${
                    ship.thumbnailUrl || ship.spriteUrl
                      ? `<img src="${escapeHtml(ship.thumbnailUrl || ship.spriteUrl)}" alt="${escapeHtml(ship.name)}" />`
                      : `<div class="wiki-art-placeholder"></div>`
                  }
                </div>
                <div class="wiki-entity-body">
                  <div class="wiki-card-head">
                    <div>
                      <div class="wiki-card-title">${escapeHtml(ship.name)}</div>
                      <div class="wiki-card-meta">${escapeHtml(ship.category)} · ${formatCredits(ship.attributes.cost || 0)}</div>
                    </div>
                    <div class="wiki-chip-row">
                      ${renderWikiVisibilityPill(ship.visibility)}
                      ${ship.owned ? `<span class="wiki-chip">Owned hull</span>` : ""}
                      ${!ship.owned && ship.openedSaleLocations.length ? `<span class="wiki-chip">Opened market</span>` : ""}
                      ${!ship.owned && !ship.openedSaleLocations.length && ship.seenSaleLocations.length ? `<span class="wiki-chip">Seen on sale</span>` : ""}
                    </div>
                  </div>
                  ${ship.shortCopy ? `<p class="wiki-card-copy">${escapeHtml(ship.shortCopy)}</p>` : ""}
                  <div class="wiki-chip-row">
                    <span class="wiki-chip">Shields ${formatNumber(ship.attributes.shields || 0)}</span>
                    <span class="wiki-chip">Hull ${formatNumber(ship.attributes.hull || 0)}</span>
                    <span class="wiki-chip">Cargo ${formatNumber(ship.attributes.cargoSpace || 0)}</span>
                    <span class="wiki-chip">Crew ${formatNumber(ship.attributes.requiredCrew || 0)}</span>
                  </div>
                  ${
                    ship.openedSaleLocations.length
                      ? `<div class="wiki-card-note">Opened market: ${escapeHtml(ship.openedSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                      : ship.seenSaleLocations.length
                        ? `<div class="wiki-card-note">Seen on opened worlds: ${escapeHtml(ship.seenSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                        : state.debugMode && ship.rawKnownSaleLocations.length
                          ? `<div class="wiki-card-note">Known sale data: ${escapeHtml(ship.rawKnownSaleLocations.slice(0, 3).map((location) => formatSaleLocation(location, { includeReputation: true })).join(" · "))}</div>`
                          : ""
                  }
                </div>
              </article>
            `
          )
          .join("")
      : `<div class="wiki-empty">No opened ship dossiers yet.</div>`;

    const factionsMarkup = data.factions.length
      ? `
        <div class="wiki-faction-table">
          ${data.factions
            .map(
              (row) => `
                <div class="wiki-faction-row">
                  <div class="wiki-faction-main">
                    <div class="wiki-faction-name">
                      <span>${escapeHtml(row.name)}</span>
                      ${renderWikiVisibilityPill(row.visibility)}
                    </div>
                    ${
                      row.logbookText
                        ? `<div class="wiki-faction-note">${escapeHtml(clampCopy(row.logbookText, 220))}</div>`
                        : ""
                    }
                  </div>
                  <div class="wiki-faction-value ${row.value >= 0 ? "good" : "bad"}">${row.value >= 0 ? "+" : ""}${formatTwoDecimals(row.value)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      `
      : `<div class="wiki-empty">No faction records have been opened yet.</div>`;

    const missionsMarkup = data.story.missions.length
      ? data.story.missions
          .map(
            (mission) => `
              <article class="wiki-card wiki-story-card">
                <div class="wiki-card-head">
                  <div>
                    <div class="wiki-card-title">${escapeHtml(mission.name || mission.id)}</div>
                    <div class="wiki-card-meta">${mission.job ? "Job" : "Mission"}${mission.deadline ? ` · due ${escapeHtml(shortDate(mission.deadline))}` : ""}</div>
                  </div>
                  <div class="wiki-chip-row">
                    ${renderWikiVisibilityPill(mission.visibility)}
                    ${mission.destination ? `<span class="wiki-pill is-open">${escapeHtml(mission.destination)}</span>` : ""}
                  </div>
                </div>
                ${
                  mission.shortCopy
                    ? `<p class="wiki-card-copy">${escapeHtml(mission.shortCopy)}</p>`
                    : `<p class="wiki-card-copy muted">No extra mission notes are stored in this save.</p>`
                }
              </article>
            `
          )
          .join("")
      : `<div class="wiki-empty">No active story threads are recorded right now.</div>`;

    const storyChainsMarkup = data.story.chains.length
      ? `
        <div class="wiki-chain-grid">
          ${data.story.chains
            .map(
              (chain) => `
                <article class="wiki-card wiki-chain-card">
                  <div class="wiki-card-head">
                    <div>
                      <div class="wiki-card-title">${escapeHtml(chain.label)}</div>
                      <div class="wiki-card-meta">${formatNumber(chain.missions.length)} active entries${chain.deadline ? ` · next due ${escapeHtml(shortDate(chain.deadline))}` : ""}</div>
                    </div>
                    <div class="wiki-chip-row">
                      ${renderWikiVisibilityPill(chain.visibility)}
                      ${chain.destinations.slice(0, 2).map((name) => `<span class="wiki-pill is-open">${escapeHtml(name)}</span>`).join("")}
                    </div>
                  </div>
                  <p class="wiki-card-copy">${escapeHtml(chain.shortCopy)}</p>
                </article>
              `
            )
            .join("")}
        </div>
      `
      : `<div class="wiki-empty">No active story chains are visible right now.</div>`;

    const worldStateMarkup = data.story.worldState.length
      ? data.story.worldState
          .map(
            (entry) => `
              <article class="wiki-card wiki-worldstate-card">
                <div class="wiki-worldstate-head">
                  <div>
                    <div class="wiki-worldstate-title">${escapeHtml(entry.name)}</div>
                    <div class="wiki-worldstate-meta">${escapeHtml(entry.system || "Unknown system")}</div>
                  </div>
                  <div class="wiki-chip-row">${renderWikiVisibilityPill(entry.visibility)}</div>
                </div>
                <div class="wiki-worldstate-list">
                  ${entry.notes.map((note) => `<div class="wiki-worldstate-note">${escapeHtml(note)}</div>`).join("")}
                </div>
              </article>
            `
          )
          .join("")
      : `<div class="wiki-empty">No opened world-state changes are visible yet.</div>`;

    wikiContent.innerHTML = `
      <section id="wiki-overview" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Overview</h2>
            <p>${escapeHtml(state.debugMode ? "Debug mode shows locked and hidden dossiers, but every entry keeps an explicit spoiler-state label." : "This field manual stays inside the current save state. Unknown worlds, locked story branches, and unopened markets stay hidden.")}</p>
          </div>
        </div>
        <div class="wiki-overview-grid">
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Current location</div>
            <div class="wiki-stat-value">${escapeHtml(data.currentSystem || "Unknown")}</div>
            <div class="wiki-stat-copy">${escapeHtml(data.currentPlanet || "In transit")}</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Faction entries</div>
            <div class="wiki-stat-value">${formatNumber(data.counts.factionLog)}</div>
            <div class="wiki-stat-copy">Unlocked faction codex notes from the save logbook.</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">People</div>
            <div class="wiki-stat-value">${formatNumber(data.counts.peopleLog)}</div>
            <div class="wiki-stat-copy">Named people already recorded in the codex.</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Minor people</div>
            <div class="wiki-stat-value">${formatNumber(data.counts.minorPeopleLog)}</div>
            <div class="wiki-stat-copy">Side characters and local threads already unlocked.</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Diary lines</div>
            <div class="wiki-stat-value">${formatNumber(data.counts.diaryLines)}</div>
            <div class="wiki-stat-copy">Personal log entries currently stored in the save.</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Visited worlds</div>
            <div class="wiki-stat-value">${formatNumber(state.debugMode ? data.counts.worlds : data.openedCounts.worlds)}</div>
            <div class="wiki-stat-copy">${escapeHtml(state.debugMode ? `${formatNumber(data.openedCounts.worlds)} opened · ${formatNumber(data.counts.worlds - data.openedCounts.worlds)} still hidden in live mode.` : "World lore and local descriptions already seen.")}</div>
          </article>
          <article class="wiki-stat-card">
            <div class="wiki-stat-label">Story threads</div>
            <div class="wiki-stat-value">${formatNumber(state.debugMode ? data.counts.story : data.openedCounts.story)}</div>
            <div class="wiki-stat-copy">${escapeHtml(state.debugMode ? `${formatNumber(data.openedCounts.story)} opened · ${formatNumber(data.counts.story - data.openedCounts.story)} hidden or minor threads.` : "Active missions and world-state changes visible now.")}</div>
          </article>
        </div>
      </section>

      <section id="wiki-logbook" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Logbook</h2>
            <p>${escapeHtml(state.debugMode ? "Logbook stays spoiler-safe even in debug mode: it only contains entries already written into the save." : "Codex entries and diary notes unlocked in this save.")}</p>
          </div>
        </div>
        ${(() => {
          const { groups, diary, timeline } = data.logbook;
          if (!groups.length && !diary.length) {
            return `<div class="wiki-empty">No logbook entries found yet.</div>`;
          }

          const codexMarkup = groups.map(({ category, entries }) => `
            <div class="logbook-category">
              <div class="logbook-category-title-row">
                <div class="logbook-category-title">${escapeHtml(category)}</div>
                <div class="logbook-category-meta">${formatNumber(entries.length)} entries</div>
              </div>
              <div class="logbook-entries">
                ${entries.map((entry) => `
                  <article class="logbook-entry">
                    <div class="logbook-entry-head">
                      <div class="logbook-entry-name">${escapeHtml(entry.name)}</div>
                      ${renderWikiVisibilityPill(entry.visibility)}
                    </div>
                    <p class="logbook-entry-text">${escapeHtml(entry.text)}</p>
                  </article>
                `).join("")}
              </div>
            </div>
          `).join("");

          const diaryMarkup = timeline.length ? `
            <div class="logbook-category">
              <div class="logbook-category-title-row">
                <div class="logbook-category-title">Timeline</div>
                <div class="logbook-category-meta">${formatNumber(timeline.length)} lines</div>
              </div>
              <div class="wiki-timeline">
                ${timeline.map((entry) => `
                  <article class="wiki-card wiki-timeline-card">
                    <div class="wiki-card-head">
                      <div>
                        <div class="wiki-card-title">${escapeHtml(shortDate(entry.date))}</div>
                        <div class="wiki-card-meta">Diary</div>
                      </div>
                      <div class="wiki-chip-row">${renderWikiVisibilityPill(entry.visibility)}</div>
                    </div>
                    <p class="wiki-card-copy">${escapeHtml(entry.shortCopy || entry.line)}</p>
                  </article>
                `).join("")}
              </div>
            </div>
          ` : "";

          return `<div class="logbook-layout">${codexMarkup}${diaryMarkup}</div>`;
        })()}
      </section>

      <section id="wiki-worlds" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Worlds</h2>
            <p>${escapeHtml(state.debugMode ? "Debug mode includes unopened worlds and marks whether they are merely unvisited, reputation-gated, or hidden in live mode." : "Visited planets and the local lore already visible in the current save.")}</p>
          </div>
        </div>
        <div class="wiki-stack">${worldsMarkup}</div>
      </section>

      <section id="wiki-ships" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Ships</h2>
            <p>${escapeHtml(state.debugMode ? "Debug mode lists every hull in the data and marks whether it is opened, merely seen, locked behind markets, or still hidden in live mode." : "Ship descriptions, hull stats, and opened market sightings.")}</p>
          </div>
        </div>
        <div class="wiki-stack">${shipsMarkup}</div>
      </section>

      <section id="wiki-factions" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Factions</h2>
            <p>${escapeHtml(state.debugMode ? "Debug mode keeps every faction row, but hidden governments are marked instead of pretending they were opened." : "Governments and standings already tied to known space.")}</p>
          </div>
        </div>
        ${factionsMarkup}
      </section>

      <section id="wiki-story" class="wiki-section">
        <div class="panel-head">
          <div>
            <h2>Story</h2>
            <p>${escapeHtml(state.debugMode ? "Debug mode exposes minor and hidden save threads, but labels them instead of mixing them with opened story beats." : "Active threads and current-world changes visible in the save file.")}</p>
          </div>
        </div>
        <div class="wiki-subhead">Story chains</div>
        ${storyChainsMarkup}
        <div class="wiki-story-columns">
          <div class="wiki-story-column">
            <div class="wiki-subhead">Active missions</div>
            <div class="wiki-stack">${missionsMarkup}</div>
          </div>
          <div class="wiki-story-column">
            <div class="wiki-subhead">World state</div>
            <div class="wiki-stack">${worldStateMarkup}</div>
          </div>
        </div>
      </section>
    `;

    wikiNav.querySelectorAll("[data-wiki-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.wikiTarget);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  return {
    renderWiki,
  };
}

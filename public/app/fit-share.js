const FIT_SHARE_PREFIX = "ESO-FIT:";
const FIT_SHARE_VERSION = 1;

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeFitName(shipName, name) {
  const trimmed = String(name || "").trim();
  if (trimmed) {
    return trimmed.slice(0, 96);
  }
  const ship = String(shipName || "").trim();
  return ship ? `${ship} fit` : "Imported fit";
}

function normalizeFitNote(note) {
  return String(note || "").trim().slice(0, 280);
}

function normalizeShipLabel(shipLabel, shipName) {
  const trimmed = String(shipLabel || "").trim();
  if (trimmed) {
    return trimmed.slice(0, 96);
  }
  return String(shipName || "").trim().slice(0, 96);
}

function normalizeLoadout(loadout) {
  return Object.fromEntries(
    Object.entries(loadout || {})
      .map(([name, count]) => [String(name).trim(), Math.max(0, Math.round(Number(count) || 0))])
      .filter(([name, count]) => name && count > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractCode(text) {
  const match = String(text || "").match(/ESO-FIT:[A-Za-z0-9\-_]+/);
  return match ? match[0] : "";
}

function getSummaryLines(summary, helpers) {
  if (!summary || !helpers) {
    return [];
  }
  const { formatCredits, formatNumber, formatOneDecimal } = helpers;
  return [
    `Fit value: ${formatCredits(summary.totalCost)}`,
    `Cargo: ${formatNumber(summary.cargoSpace)} tons`,
    `Jumps: ${formatNumber(summary.jumpCount)}`,
    `Speed: ${formatOneDecimal(summary.maxSpeed)}`,
  ];
}

function getLoadoutEntries(payload, getOutfitDefinition) {
  return Object.entries(payload.loadout || {})
    .map(([name, count]) => ({
      name,
      count,
      category: getOutfitDefinition?.(name)?.category || "Systems",
    }))
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
}

function getLoadoutLines(payload, getOutfitDefinition) {
  return getLoadoutEntries(payload, getOutfitDefinition).map((entry) => `${entry.count}x ${entry.name}`);
}

function stripShareMarkup(line) {
  return String(line || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\[\/?(?:h1|h2|h3|b|i|u|strike|code|list|olist|quote|noparse|spoiler|hr)\]/gi, "")
    .replace(/\[\*\]/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}

function parseStructuredShareText(rawText) {
  const candidate = String(rawText || "")
    .replace(/```(?:json|text|md|markdown)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const lines = candidate
    .split(/\r?\n/)
    .map(stripShareMarkup)
    .filter(Boolean);

  let shipName = "";
  let shipLabel = "";
  let name = "";
  let note = "";
  let inLoadout = false;
  const loadout = {};

  for (const line of lines) {
    if (/^ship\s*:/i.test(line)) {
      shipLabel = line.replace(/^ship\s*:/i, "").trim();
      continue;
    }
    if (/^model\s*:/i.test(line)) {
      shipName = line.replace(/^model\s*:/i, "").trim();
      continue;
    }
    if (/^note\s*:/i.test(line)) {
      note = line.replace(/^note\s*:/i, "").trim();
      continue;
    }
    if (/^loadout\s*:?$/i.test(line)) {
      inLoadout = true;
      continue;
    }
    if (!name) {
      name = line.trim();
      continue;
    }
    if (inLoadout) {
      const match = line.match(/^(\d+)x\s+(.+)$/i);
      if (match) {
        loadout[match[2].trim()] = Number(match[1]) || 0;
      }
    }
  }

  if (!shipName && shipLabel) {
    shipName = shipLabel;
  }
  if (!shipName || !Object.keys(loadout).length) {
    throw new Error("This text does not look like a supported fit export.");
  }

  return buildFitSharePayload({
    shipName,
    shipLabel,
    name,
    note,
    loadout,
  });
}

function splitIntoColumns(items, columnCount = 2) {
  const columns = Array.from({ length: columnCount }, () => []);
  for (const item of items) {
    const smallest = columns.reduce(
      (best, column, index) =>
        column.length < columns[best].length ? index : best,
      0
    );
    columns[smallest].push(item);
  }
  return columns;
}

function getProfileStatRows(payload, summary, ship, helpers) {
  const { formatCredits, formatNumber, formatOneDecimal } = helpers;
  return [
    ["cost", formatCredits(summary.totalCost)],
    ["shields", formatNumber(summary.shields)],
    ["hull", formatNumber(summary.hull)],
    ["mass", `${formatNumber(summary.mass)} tons`],
    ["cargo", `${formatNumber(summary.cargoSpace)} tons`],
    ["crew / bunks", `${formatNumber(summary.requiredCrew)} / ${formatNumber(summary.bunks)}`],
    ["fuel", `${formatNumber(summary.fuelCapacity)} (${formatNumber(summary.jumpCount)} jumps)`],
    ["max speed", formatOneDecimal(summary.maxSpeed)],
    ["acceleration", formatOneDecimal(summary.acceleration)],
    ["turning", formatOneDecimal(summary.turning)],
    ["outfit free", `${formatNumber(summary.freeOutfit)} / ${formatNumber(ship.attributes.outfitSpace)}`],
    ["weapon free", `${formatNumber(summary.freeWeapon)} / ${formatNumber(ship.attributes.weaponCapacity)}`],
    ["engine free", `${formatNumber(summary.freeEngine)} / ${formatNumber(ship.attributes.engineCapacity)}`],
    ["gun ports free", `${formatNumber(summary.freeGunPorts)} / ${formatNumber(ship.attributes.gunPorts)}`],
    ["turret mounts free", `${formatNumber(summary.freeTurretMounts)} / ${formatNumber(ship.attributes.turretMounts)}`],
    ["energy (idle)", formatOneDecimal(60 * summary.idleEnergyPerFrame)],
    ["heat (idle)", formatOneDecimal(60 * summary.idleHeatPerFrame)],
    ["energy (net)", formatOneDecimal(60 * summary.netEnergyPerFrame)],
    ["heat (net)", formatOneDecimal(60 * summary.netHeatPerFrame)],
  ];
}

export function buildFitSharePayload({ shipName, shipLabel, name, note, loadout }) {
  const normalizedShipName = String(shipName || "").trim();
  if (!normalizedShipName) {
    throw new Error("A ship name is required to share a fit.");
  }

  return {
    version: FIT_SHARE_VERSION,
    shipName: normalizedShipName,
    shipLabel: normalizeShipLabel(shipLabel, normalizedShipName),
    name: normalizeFitName(normalizedShipName, name),
    note: normalizeFitNote(note),
    loadout: normalizeLoadout(loadout),
  };
}

export function encodeFitShareCode(payload) {
  const normalized = buildFitSharePayload(payload);
  return `${FIT_SHARE_PREFIX}${encodeBase64Url(JSON.stringify(normalized))}`;
}

export function parseFitShareText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Paste a fit export, JSON payload, or an older fit code.");
  }

  const code = extractCode(text);
  if (code) {
    const encoded = code.slice(FIT_SHARE_PREFIX.length);
    const parsed = JSON.parse(decodeBase64Url(encoded));
    return buildFitSharePayload(parsed);
  }

  try {
    const fenced = text.match(/```(?:json|text|md|markdown)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;
    const parsed = JSON.parse(candidate);
    return buildFitSharePayload(parsed);
  } catch {
    return parseStructuredShareText(text);
  }
}

export function formatFitShareText(payload, options = {}) {
  const normalized = buildFitSharePayload(payload);
  const format = options.format || "plain";
  const getOutfitDefinition = options.getOutfitDefinition;
  const summary = options.summary || null;
  const helpers = options.helpers || null;
  const loadoutLines = getLoadoutLines(normalized, getOutfitDefinition);
  const summaryLines = getSummaryLines(summary, helpers);

  if (format === "markdown") {
    return [
      `## ${normalized.name}`,
      ``,
      `Ship: ${normalized.shipLabel}`,
      ...(normalized.shipLabel !== normalized.shipName ? [`Model: ${normalized.shipName}`] : []),
      ...(normalized.note ? [`Note: ${normalized.note}`] : []),
      ...(summaryLines.length ? [``, `### Summary`, ...summaryLines.map((line) => `- ${line}`)] : []),
      ``,
      `### Loadout`,
      ...loadoutLines.map((line) => `- \`${line}\``),
    ].join("\n");
  }

  if (format === "steam") {
    return [
      `[h2]${normalized.name}[/h2]`,
      `Ship: [b]${normalized.shipLabel}[/b]`,
      ...(normalized.shipLabel !== normalized.shipName ? [`Model: [b]${normalized.shipName}[/b]`] : []),
      ...(normalized.note ? [`Note: ${normalized.note}`] : []),
      ...(summaryLines.length ? [``, `[h3]Summary[/h3]`, `[list]`, ...summaryLines.map((line) => `[*]${line}`), `[/list]`] : []),
      ``,
      `[h3]Loadout[/h3]`,
      `[list]`,
      ...loadoutLines.map((line) => `[*]${line}`),
      `[/list]`,
    ].join("\n");
  }

  if (format === "json") {
    return JSON.stringify(normalized, null, 2);
  }

  return [
    `${normalized.name}`,
    `Ship: ${normalized.shipLabel}`,
    ...(normalized.shipLabel !== normalized.shipName ? [`Model: ${normalized.shipName}`] : []),
    ...(normalized.note ? [`Note: ${normalized.note}`] : []),
    ...(summaryLines.length ? ["", ...summaryLines] : []),
    ``,
    `Loadout:`,
    ...loadoutLines,
  ].join("\n");
}

export function buildFitProfileCardSvg(payload, options = {}) {
  const normalized = buildFitSharePayload(payload);
  const summary = options.summary;
  const ship = options.ship;
  const helpers = options.helpers;
  if (!summary || !ship || !helpers) {
    throw new Error("Fit profile export needs ship and summary data.");
  }

  const loadoutEntries = getLoadoutEntries(normalized, options.getOutfitDefinition);
  const grouped = Array.from(
    loadoutEntries.reduce((map, entry) => {
      if (!map.has(entry.category)) {
        map.set(entry.category, []);
      }
      map.get(entry.category).push(entry);
      return map;
    }, new Map())
  );
  const columns = splitIntoColumns(grouped, 2);
  const stats = getProfileStatRows(normalized, summary, ship, helpers);
  const shipImage = options.shipImageDataUrl
    ? `<g opacity="0.96">
        <image href="${escapeXml(options.shipImageDataUrl)}" x="612" y="458" width="470" height="274" preserveAspectRatio="xMidYMid meet" filter="url(#blueprint)" opacity="0.78" />
        <image href="${escapeXml(options.shipImageDataUrl)}" x="612" y="458" width="470" height="274" preserveAspectRatio="xMidYMid meet" opacity="0.11" filter="url(#blueprintGlow)" />
      </g>`
    : "";
  const note = String(normalized.note || "").trim();
  const noteLines = [];
  if (note) {
    const words = note.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > 34) {
        if (line) {
          noteLines.push(line);
        }
        line = word;
      } else {
        line = next;
      }
      if (noteLines.length >= 2) {
        break;
      }
    }
    if (line && noteLines.length < 2) {
      noteLines.push(line);
    }
  }
  const noteBlock = noteLines.length
    ? noteLines
        .map(
          (line, index) => `
            <text x="1220" y="${56 + index * 22}" fill="#c6cfca" font-size="16" text-anchor="end" font-family="SF Pro Display, Arial, sans-serif">${escapeXml(line)}</text>
          `
        )
        .join("")
    : "";
  const topSummary = [
    { label: "Ship", value: normalized.shipLabel, x: 64 },
    { label: "Model", value: ship.name, x: 430 },
  ];

  const statRows = stats
    .map(
      ([label, value], index) => `
        <text x="64" y="${162 + index * 28}" fill="#9ea6a2" font-size="15" font-family="SF Pro Display, Arial, sans-serif">${escapeXml(label)}:</text>
        <text x="316" y="${162 + index * 28}" fill="#f0f1ef" font-size="15" text-anchor="end" font-family="Menlo, SFMono-Regular, monospace">${escapeXml(value)}</text>
      `
    )
    .join("");

  const summaryMarkup = topSummary
    .map(
      ({ label, value, x }) => `
        <text x="${x}" y="80" fill="#9ea6a2" font-size="14" font-family="SF Pro Display, Arial, sans-serif">${escapeXml(label)}</text>
        <text x="${x}" y="108" fill="#f0f1ef" font-size="24" font-family="SF Pro Display, Arial, sans-serif" font-weight="700">${escapeXml(value)}</text>
      `
    )
    .join("");

  const columnMarkup = columns
    .map((groups, columnIndex) => {
      const startX = columnIndex === 0 ? 412 : 806;
      let y = 162;
      const parts = [];
      for (const [category, entries] of groups) {
        parts.push(
          `<text x="${startX}" y="${y}" fill="#d7d1b2" font-size="17" font-family="SF Pro Display, Arial, sans-serif">${escapeXml(category)}</text>`
        );
        y += 24;
        for (const entry of entries.slice(0, 9)) {
          parts.push(
            `<text x="${startX}" y="${y}" fill="#c7cfcb" font-size="15" font-family="SF Pro Display, Arial, sans-serif">${escapeXml(entry.name)}</text>
             <text x="${startX + 300}" y="${y}" fill="#f0f1ef" font-size="15" text-anchor="end" font-family="Menlo, SFMono-Regular, monospace">${escapeXml(entry.count)}</text>`
          );
          y += 24;
        }
        y += 10;
      }
      return parts.join("");
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
      <defs>
        <linearGradient id="eso-panel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#343433" />
          <stop offset="100%" stop-color="#2a2a2a" />
        </linearGradient>
        <linearGradient id="eso-tab" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#454545" />
          <stop offset="100%" stop-color="#2f2f2f" />
        </linearGradient>
        <linearGradient id="eso-screen" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#383838" />
          <stop offset="100%" stop-color="#2a2a2a" />
        </linearGradient>
        <pattern id="eso-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>
        </pattern>
        <filter id="blueprint" x="-25%" y="-25%" width="150%" height="150%">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="0.82" exponent="1.08" offset="0" />
            <feFuncG type="gamma" amplitude="0.84" exponent="1.06" offset="0" />
            <feFuncB type="gamma" amplitude="0.88" exponent="1.02" offset="0" />
          </feComponentTransfer>
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.68
                    0 0 0 0 0.7
                    0 0 0 0 0.73
                    0 0 0 0.86 0" />
        </filter>
        <filter id="blueprintGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.74
                    0 0 0 0 0.76
                    0 0 0 0 0.79
                    0 0 0 0.22 0" />
        </filter>
      </defs>
      <rect width="1280" height="820" fill="#101110" />
      <rect x="28" y="28" width="1224" height="758" fill="url(#eso-panel)" stroke="#7e7e79" stroke-width="1" />
      <rect x="52" y="62" width="1176" height="690" fill="url(#eso-screen)" stroke="#6a6a66" stroke-width="1" />
      <rect x="52" y="62" width="1176" height="690" fill="url(#eso-grid)" />
      <text x="70" y="52" fill="#d5d0bb" font-size="14" font-family="Menlo, SFMono-Regular, monospace">${escapeXml(normalized.name)}</text>
      ${summaryMarkup}
      ${noteBlock}
      <line x1="52" y1="124" x2="1228" y2="124" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      ${statRows}
      ${columnMarkup}
      ${shipImage}
    </svg>
  `.trim();
}

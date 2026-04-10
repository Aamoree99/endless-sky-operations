import path from "node:path";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";

function tokenize(line) {
  const matches = line.match(/"[^"]*"|`[^`]*`|\S+/g) || [];
  return matches.map((token) => token.replace(/^["`]|["`]$/g, ""));
}

function formatSaveNumber(value) {
  const numeric = Number(value) || 0;
  if (Number.isInteger(numeric)) {
    return String(numeric);
  }
  return String(Math.round(numeric * 1000) / 1000);
}

function formatSaveToken(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_.+\-']+$/.test(text) ? text : JSON.stringify(text);
}

function splitTopLevelBlocks(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (!current.length) {
      current.push(line);
      continue;
    }
    if (line && !line.startsWith("\t")) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    blocks.push(current);
  }
  return blocks;
}

function joinTopLevelBlocks(blocks) {
  return blocks.map((block) => block.join("\n")).join("\n");
}

function rewriteTopLevelBlock(raw, predicate, updater) {
  const blocks = splitTopLevelBlocks(raw);
  const index = blocks.findIndex((block) => predicate(block[0], block));
  if (index === -1) {
    throw new Error("Required save block was not found.");
  }
  blocks[index] = updater([...blocks[index]]);
  return joinTopLevelBlocks(blocks);
}

function rewriteNthTopLevelBlock(raw, predicate, targetMatchIndex, updater) {
  const blocks = splitTopLevelBlocks(raw);
  let matchIndex = -1;
  const index = blocks.findIndex((block) => {
    if (!predicate(block[0], block)) {
      return false;
    }
    matchIndex += 1;
    return matchIndex === targetMatchIndex;
  });
  if (index === -1) {
    throw new Error("Required indexed save block was not found.");
  }
  blocks[index] = updater([...blocks[index]]);
  return joinTopLevelBlocks(blocks);
}

function replaceTopLevelBlocks(raw, predicate, replacementBlocks, options = {}) {
  const blocks = splitTopLevelBlocks(raw);
  const matchIndexes = [];
  blocks.forEach((block, index) => {
    if (predicate(block[0], block)) {
      matchIndexes.push(index);
    }
  });

  let insertIndex = matchIndexes.length ? matchIndexes[0] : blocks.length;
  if (!matchIndexes.length && options.insertAfter) {
    const anchorIndex = blocks.findIndex((block) => options.insertAfter(block[0], block));
    if (anchorIndex >= 0) {
      insertIndex = anchorIndex + 1;
    }
  }

  const nextBlocks = blocks.filter((_, index) => !matchIndexes.includes(index));
  nextBlocks.splice(insertIndex, 0, ...replacementBlocks);
  return joinTopLevelBlocks(nextBlocks);
}

function replaceOrInsertIndentedLine(lines, prefix, nextLine, insertAfterPrefixes = []) {
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (!nextLine) {
    if (index >= 0) {
      lines.splice(index, 1);
    }
    return;
  }
  if (index >= 0) {
    lines[index] = nextLine;
    return;
  }
  let insertIndex = lines.length;
  for (let i = lines.length - 1; i >= 1; i -= 1) {
    if (insertAfterPrefixes.some((candidate) => lines[i].startsWith(candidate))) {
      insertIndex = i + 1;
      break;
    }
  }
  lines.splice(insertIndex, 0, nextLine);
}

function replaceIndentedSection(lines, sectionHeader, childPrefix, nextSectionLines) {
  const startIndex = lines.findIndex((line) => line === sectionHeader);
  if (startIndex === -1) {
    lines.push(...nextSectionLines);
    return lines;
  }

  let endIndex = startIndex + 1;
  while (endIndex < lines.length && lines[endIndex].startsWith(childPrefix)) {
    endIndex += 1;
  }
  lines.splice(startIndex, endIndex - startIndex, ...nextSectionLines);
  return lines;
}

function patchCreditsInSave(raw, credits) {
  const normalized = Math.max(0, Math.round(Number(credits) || 0));
  return rewriteTopLevelBlock(raw, (header) => header === "account", (lines) => {
    replaceOrInsertIndentedLine(lines, "\tcredits ", `\tcredits ${normalized}`);
    return lines;
  });
}

function advanceGameDate({ day, month, year }, daysToAdd) {
  const MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }
  let d = day;
  let m = month;
  let y = year;
  let remaining = Math.max(0, Math.round(daysToAdd));
  while (remaining > 0) {
    const daysInMonth = MONTHS[m - 1] + (m === 2 && isLeap(y) ? 1 : 0);
    const available = daysInMonth - d;
    if (remaining <= available) {
      d += remaining;
      remaining = 0;
    } else {
      remaining -= available + 1;
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return { day: d, month: m, year: y };
}

function patchDateInSave(raw, currentDate, travelDays) {
  const next = advanceGameDate(currentDate, travelDays);
  const lines = raw.split("\n");
  const idx = lines.findIndex((line) => line.startsWith("date "));
  const newLine = `date ${next.day} ${next.month} ${next.year}`;
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.unshift(newLine);
  }
  return lines.join("\n");
}

function patchPlayerLocationInSave(raw, locationPatch) {
  let next = raw;
  if (locationPatch.currentSystem !== undefined) {
    next = rewriteTopLevelBlock(next, (header) => header.startsWith("system "), (lines) => {
      lines[0] = locationPatch.currentSystem
        ? `system ${formatSaveToken(locationPatch.currentSystem)}`
        : "system";
      return lines;
    });
  }
  if (locationPatch.currentPlanet !== undefined) {
    next = rewriteTopLevelBlock(next, (header) => header.startsWith("planet "), (lines) => {
      lines[0] = locationPatch.currentPlanet
        ? `planet ${formatSaveToken(locationPatch.currentPlanet)}`
        : "planet";
      return lines;
    });
  }
  if (locationPatch.flagshipIndex !== undefined) {
    const normalized = Math.max(0, Math.round(Number(locationPatch.flagshipIndex) || 0));
    next = rewriteTopLevelBlock(next, (header) => header.startsWith('"flagship index"'), (lines) => {
      lines[0] = `"flagship index" ${normalized}`;
      return lines;
    });
  }
  return next;
}

function patchRepeatedTopLevelLines(raw, prefix, values, insertAfterPrefixes = []) {
  const replacementBlocks = (values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => [`${prefix} ${formatSaveToken(value)}`]);
  return replaceTopLevelBlocks(
    raw,
    (header) => header.startsWith(`${prefix} `),
    replacementBlocks,
    {
      insertAfter: (header) => insertAfterPrefixes.some((candidate) => header.startsWith(candidate)),
    }
  );
}

function patchConditionsInSave(raw, lines) {
  const nextLines = (lines || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return rewriteTopLevelBlock(raw, (header) => header === "conditions", () => {
    return ["conditions", ...nextLines.map((line) => `\t${line}`)];
  });
}

function patchLicensesInSave(raw, licenses) {
  const target = [...new Set((licenses || []).map((entry) => String(entry).trim()).filter(Boolean))];
  return rewriteTopLevelBlock(raw, (header) => header === "licenses", (lines) => {
    const existing = lines
      .slice(1)
      .map((line) => tokenize(line.trim())[0])
      .filter(Boolean);
    const ordered = [...existing.filter((name) => target.includes(name))];
    const missing = target.filter((name) => !ordered.includes(name)).sort((a, b) => a.localeCompare(b));
    return ["licenses", ...ordered.concat(missing).map((name) => `\t${formatSaveToken(name)}`)];
  });
}

function patchReputationsInSave(raw, updates) {
  const patch = Object.fromEntries(
    Object.entries(updates || {}).map(([name, value]) => [String(name), Number(value) || 0])
  );
  return rewriteTopLevelBlock(raw, (header) => header === '"reputation with"', (lines) => {
    const existingEntries = [];
    for (const line of lines.slice(1)) {
      if (!line.startsWith("\t")) {
        continue;
      }
      const tokens = tokenize(line.trim());
      if (tokens.length < 2) {
        continue;
      }
      existingEntries.push({ name: tokens[0], value: Number(tokens[1]) || 0 });
    }

    const seen = new Set();
    const nextEntries = existingEntries.map((entry) => {
      seen.add(entry.name);
      return {
        name: entry.name,
        value: Object.prototype.hasOwnProperty.call(patch, entry.name) ? patch[entry.name] : entry.value,
      };
    });

    const newEntries = Object.entries(patch)
      .filter(([name]) => !seen.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));

    return [
      '"reputation with"',
      ...nextEntries
        .concat(newEntries)
        .map((entry) => `\t${formatSaveToken(entry.name)} ${formatSaveNumber(entry.value)}`),
    ];
  });
}

function patchShipBlock(raw, shipPatch) {
  const shipId = String(shipPatch?.uuid || "").trim();
  const shipName = String(shipPatch?.name || "").trim();
  const originalName = String(shipPatch?.originalName || shipPatch?.name || "").trim();
  const saveIndex = Number(shipPatch?.saveIndex);
  const updater = (lines) => {
    if (shipPatch.name !== undefined) {
      replaceOrInsertIndentedLine(lines, "\tname ", `\tname ${formatSaveToken(shipName)}`);
    }
    if (shipPatch.crew !== undefined) {
      replaceOrInsertIndentedLine(lines, "\tcrew ", `\tcrew ${Math.max(0, Math.round(Number(shipPatch.crew) || 0))}`);
    }
    if (shipPatch.fuel !== undefined) {
      replaceOrInsertIndentedLine(lines, "\tfuel ", `\tfuel ${Math.max(0, Math.round(Number(shipPatch.fuel) || 0))}`);
    }
    if (shipPatch.shields !== undefined) {
      replaceOrInsertIndentedLine(lines, "\tshields ", `\tshields ${Math.max(0, Math.round(Number(shipPatch.shields) || 0))}`);
    }
    if (shipPatch.hull !== undefined) {
      replaceOrInsertIndentedLine(lines, "\thull ", `\thull ${Math.max(0, Math.round(Number(shipPatch.hull) || 0))}`);
    }
    if (shipPatch.system !== undefined) {
      replaceOrInsertIndentedLine(
        lines,
        "\tsystem ",
        shipPatch.system ? `\tsystem ${formatSaveToken(shipPatch.system)}` : null,
        ["\thull ", "\tparked"]
      );
    }
    if (shipPatch.planet !== undefined) {
      replaceOrInsertIndentedLine(
        lines,
        "\tplanet ",
        shipPatch.planet ? `\tplanet ${formatSaveToken(shipPatch.planet)}` : null,
        ["\tsystem "]
      );
    }
    if (shipPatch.parked !== undefined) {
      replaceOrInsertIndentedLine(
        lines,
        "\tparked",
        shipPatch.parked ? "\tparked" : null,
        ["\thull ", "\tplanet ", "\tsystem "]
      );
    }
    if (shipPatch.outfits !== undefined) {
      const outfitLines = Object.entries(shipPatch.outfits || {})
        .map(([name, count]) => [String(name).trim(), Math.max(0, Math.round(Number(count) || 0))])
        .filter(([name, count]) => name && count > 0)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, count]) => `\t\t${formatSaveToken(name)}${count === 1 ? "" : ` ${count}`}`);
      replaceIndentedSection(lines, "\toutfits", "\t\t", ["\toutfits", ...outfitLines]);
    }
    return lines;
  };

  if (Number.isInteger(saveIndex) && saveIndex >= 0) {
    return rewriteNthTopLevelBlock(
      raw,
      (header) => header.startsWith("ship "),
      saveIndex,
      updater
    );
  }

  if (!shipId && !originalName) {
    throw new Error("Ship identifier is required for ship edits.");
  }

  return rewriteTopLevelBlock(
    raw,
    (header, lines) =>
      header.startsWith("ship ") &&
      (!shipId || lines.some((line) => line.trim() === `uuid ${shipId}`)) &&
      (!originalName || lines.some((line) => line.trim() === `name ${originalName}`)),
    updater
  );
}

async function createSaveBackup(savePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.dirname(savePath);
  const parsed = path.parse(savePath);
  const backupPath = path.join(directory, `${parsed.name}~~codex-backup-${timestamp}${parsed.ext}`);
  const raw = await readFile(savePath, "utf8");
  await writeFile(backupPath, raw, "utf8");
  return backupPath;
}

export async function listSaveBackups(savePath, limit = 12) {
  const directory = path.dirname(savePath);
  const parsed = path.parse(savePath);
  const prefix = `${parsed.name}~~codex-backup-`;
  const names = await readdir(directory);
  const matches = [];
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(parsed.ext)) {
      continue;
    }
    const fullPath = path.join(directory, name);
    try {
      const info = await stat(fullPath);
      matches.push({
        name,
        path: fullPath,
        updatedAt: info.mtime.toISOString(),
        updatedAtMs: info.mtimeMs,
      });
    } catch {
    }
  }
  return matches
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, limit);
}

export async function applySaveEdits(savePath, payload) {
  const trackerOnlyTravelPatch =
    ["tracker", "planner"].includes(payload?.source) &&
    Array.isArray(payload?.travelPlan) &&
    payload?.credits === undefined &&
    payload?.currentSystem === undefined &&
    payload?.currentPlanet === undefined &&
    payload?.flagshipIndex === undefined &&
    !payload?.licenses &&
    !payload?.reputations &&
    !payload?.visitedSystems &&
    !payload?.visitedPlanets &&
    !payload?.ships &&
    !payload?.conditions &&
    !payload?.createBackup;

  if (!payload?.confirmGameClosed && !trackerOnlyTravelPatch) {
    throw new Error("Close Endless Sky before writing the save, then confirm it in the editor.");
  }

  const level = payload.level || "safe";
  let raw = await readFile(savePath, "utf8");
  let backupPath = null;
  if (payload.createBackup) {
    backupPath = await createSaveBackup(savePath);
  }

  const applied = [];

  if (payload.credits !== undefined) {
    raw = patchCreditsInSave(raw, payload.credits);
    applied.push("credits");
  }

  if (payload.travelDays > 0 && payload.currentDate) {
    raw = patchDateInSave(raw, payload.currentDate, payload.travelDays);
    applied.push("date");
  }

  if (
    payload.currentSystem !== undefined ||
    payload.currentPlanet !== undefined ||
    payload.flagshipIndex !== undefined
  ) {
    raw = patchPlayerLocationInSave(raw, payload);
    applied.push("location");
  }

  if (payload.licenses) {
    raw = patchLicensesInSave(raw, payload.licenses);
    applied.push("licenses");
  }

  if (payload.reputations && Object.keys(payload.reputations).length) {
    raw = patchReputationsInSave(raw, payload.reputations);
    applied.push("reputations");
  }

  if (payload.visitedSystems) {
    raw = patchRepeatedTopLevelLines(raw, "visited", payload.visitedSystems, ["planet ", "system "]);
    applied.push("visitedSystems");
  }

  if (payload.visitedPlanets) {
    raw = patchRepeatedTopLevelLines(raw, "visited planet", payload.visitedPlanets, ["visited "]);
    applied.push("visitedPlanets");
  }

  if (payload.travelPlan) {
    raw = patchRepeatedTopLevelLines(raw, "travel", payload.travelPlan, ["visited planet", "visited "]);
    applied.push("travelPlan");
  }

  if (Array.isArray(payload.ships) && payload.ships.length) {
    for (const shipPatch of payload.ships) {
      raw = patchShipBlock(raw, shipPatch);
    }
    applied.push("ships");
  }

  if (payload.conditions) {
    raw = patchConditionsInSave(raw, payload.conditions);
    applied.push("conditions");
  }

  await writeFile(savePath, raw, "utf8");
  return { level, backupPath, applied };
}

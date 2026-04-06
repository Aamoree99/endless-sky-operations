import { firstCopyLine } from "./text-utils.js";

function normalizeMissionLine(text) {
  const line = String(text || "").trim();
  if (!line) {
    return "";
  }
  if (/^[a-z]/.test(line) && /^to\s+/i.test(line)) {
    return `Travel ${line}.`;
  }
  if (!/[.!?]$/.test(line)) {
    return `${line}.`;
  }
  return line;
}

export function humanizeMissionSummary(mission) {
  const direct =
    firstCopyLine(mission.summary, mission.description) ||
    "";
  if (direct) {
    return normalizeMissionLine(direct);
  }

  const bits = [];
  if (mission.source && mission.destination) {
    bits.push(`Run from ${mission.source} to ${mission.destination}.`);
  } else if (mission.destination) {
    bits.push(`Destination: ${mission.destination}.`);
  }
  if (mission.cargoTons > 0) {
    bits.push(
      mission.cargoName
        ? `Carry ${mission.cargoTons} tons of ${mission.cargoName}.`
        : `Carry ${mission.cargoTons} tons of cargo.`
    );
  }
  if (mission.passengers > 0) {
    bits.push(`Transport ${mission.passengers} passengers.`);
  }
  if (mission.infiltrating || mission.stealth) {
    bits.push("Keep a low profile.");
  }
  if (mission.illegalFine > 0) {
    bits.push(`Failure or detection risks a ${mission.illegalFine} credit fine.`);
  }
  return bits.join(" ") || "Mission details are sparse in the current game data.";
}

export function humanizeWorldStateNotes(planet, base, override) {
  const notes = [];
  if (!override) {
    return notes;
  }

  if (override.shipyardClear) {
    notes.push("The local shipyard is no longer available.");
  }
  if (override.outfitterClear) {
    notes.push("The local outfitter is no longer available.");
  }
  if (
    override.requiredReputation !== null &&
    override.requiredReputation !== undefined &&
    override.requiredReputation !== (base?.requiredReputation ?? 0)
  ) {
    notes.push(`Landing now requires ${override.requiredReputation} reputation.`);
  }
  if (
    override.security !== null &&
    override.security !== undefined &&
    override.security !== (base?.security ?? 0)
  ) {
    notes.push("Security rules for this world have changed.");
  }
  if (override.descriptionsCount && override.descriptionsCount !== (base?.descriptions?.length || 0)) {
    notes.push("The local description now reflects a changed situation on this world.");
  }
  if (override.shipyardAdds?.length || override.outfitterAdds?.length) {
    notes.push("Save-state events changed which ship or outfit listings appear here.");
  }
  if (override.spaceportCount && override.spaceportCount !== (base?.spaceport?.length || 0)) {
    notes.push("The local spaceport text has been rewritten by story progress.");
  }
  if (!notes.length && override.descriptionsCount) {
    notes.push("The planet description has been replaced by story progress.");
  }
  return notes;
}

export function getMissionChainKey(mission) {
  const name = String(mission?.name || "").trim();
  const id = String(mission?.id || "").trim();
  const sourcePath = String(mission?.sourcePath || "").trim();
  const title = name || id;

  if (title.includes(":")) {
    const prefix = title.split(":")[0]?.trim();
    if (prefix) {
      return prefix;
    }
  }

  if (sourcePath) {
    const normalized = sourcePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const file = segments[segments.length - 1] || "";
    const stem = file.replace(/\.[^.]+$/, "").trim();
    if (stem) {
      return stem
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }

  return title || "Mission";
}

export function humanizeMissionChainSummary(chain) {
  const destinations = Array.from(new Set(chain.missions.map((mission) => mission.destination).filter(Boolean)));
  const jobs = chain.missions.filter((mission) => mission.job).length;
  const missions = chain.missions.length - jobs;
  const bits = [];

  if (chain.missions.length === 1 && chain.missions[0]?.shortCopy) {
    return chain.missions[0].shortCopy;
  }

  if (missions > 0) {
    bits.push(`${missions} mission${missions === 1 ? "" : "s"}`);
  }
  if (jobs > 0) {
    bits.push(`${jobs} job${jobs === 1 ? "" : "s"}`);
  }
  if (destinations.length === 1) {
    bits.push(`focused on ${destinations[0]}`);
  } else if (destinations.length > 1) {
    bits.push(`touching ${destinations.slice(0, 3).join(", ")}`);
  }

  return bits.length ? `${bits.join(" · ")}.` : "Active story beats in this chain.";
}

export function humanizeDiaryEntry(line) {
  const text = String(line || "").trim();
  if (!text) {
    return "";
  }
  return normalizeMissionLine(text);
}

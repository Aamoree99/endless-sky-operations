import { firstCopyLine } from "./text-utils.js";

export function humanizeMissionSummary(mission) {
  const direct =
    firstCopyLine(mission.summary, mission.description) ||
    "";
  if (direct) {
    return direct;
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

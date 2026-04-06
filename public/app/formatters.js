const numberFormatter = new Intl.NumberFormat("en-US");
const oneDecimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const twoDecimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

export function formatCredits(value) {
  return `${formatNumber(value)} cr`;
}

export function formatSignedNumber(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded >= 0 ? "+" : ""}${formatNumber(rounded)}`;
}

export function formatRemaining(value) {
  const rounded = Math.round(Number(value) || 0);
  return rounded >= 0 ? formatNumber(rounded) : `-${formatNumber(Math.abs(rounded))}`;
}

export function formatOneDecimal(value) {
  return oneDecimalFormatter.format(Number(value) || 0);
}

export function formatTwoDecimals(value) {
  return twoDecimalFormatter.format(Number(value) || 0);
}

export function formatDate(date) {
  if (!date) {
    return "Unknown";
  }
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "Stable";
  }
  if (seconds < 1) {
    return "<1 s";
  }
  if (seconds < 60) {
    return `${formatOneDecimal(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function formatRequirement(reputation) {
  if (reputation === null || reputation === undefined || Number.isNaN(Number(reputation))) {
    return "No recorded reputation gate";
  }
  return reputation > 0 ? `Requires ${reputation} reputation` : "No recorded reputation gate";
}

export function formatSaleLocation(location, options = {}) {
  const includeReputation = options.includeReputation ?? false;
  const bits = [`${location.system} / ${location.planet}`];
  if (includeReputation && location.requiredReputation > 0) {
    bits.push(`rep ${location.requiredReputation}`);
  }
  return bits.join(" · ");
}

export function cloneLoadout(loadout) {
  return Object.fromEntries(
    Object.entries(loadout || {}).filter(([, count]) => Number(count) > 0)
  );
}

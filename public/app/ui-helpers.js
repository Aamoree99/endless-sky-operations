import { escapeHtml } from "./formatters.js";

export function metricCard(label, value, detail = "") {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      ${detail ? `<div class="metric-detail">${detail}</div>` : ""}
    </article>
  `;
}

export function routeMeta(bits) {
  return `<div class="meta-row">${bits.map((bit) => `<span>${bit}</span>`).join("")}</div>`;
}

export function getRouteJumpCount(route) {
  if (!route || typeof route !== "object") {
    return 0;
  }
  if (typeof route.travelJumps === "number") {
    return route.travelJumps;
  }
  if (typeof route.totalJumps === "number") {
    return route.totalJumps + (route.repositionJumps || 0);
  }
  if (typeof route.jumps === "number") {
    return route.jumps;
  }
  return 0;
}

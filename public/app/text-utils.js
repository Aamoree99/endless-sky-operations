export function firstCopyLine(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const line = value.find((entry) => String(entry || "").trim());
      if (line) {
        return String(line).trim();
      }
      continue;
    }
    if (String(value || "").trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function clampCopy(text, limit = 180) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) {
    return "";
  }
  if (source.length <= limit) {
    return source;
  }
  return `${source.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function uniqueByName(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.name || seen.has(item.name)) {
      continue;
    }
    seen.add(item.name);
    result.push(item);
  }
  return result;
}

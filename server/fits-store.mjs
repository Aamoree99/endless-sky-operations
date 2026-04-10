import { readFile, writeFile } from "node:fs/promises";

export async function loadSavedFits({ cacheDir, fitsPath, ensureDir, fileExists }) {
  await ensureDir(cacheDir);
  if (!(await fileExists(fitsPath))) {
    return [];
  }
  try {
    const raw = await readFile(fitsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeSavedFits({ cacheDir, fitsPath, ensureDir }, fits) {
  await ensureDir(cacheDir);
  await writeFile(fitsPath, JSON.stringify(fits, null, 2), "utf8");
}

export async function upsertSavedFit(deps, payload) {
  const fits = await loadSavedFits(deps);
  const normalized = {
    id: payload.id || `fit-${Date.now()}`,
    kind: "user",
    shipName: payload.shipName,
    name: payload.name,
    role: payload.role || "Custom",
    note: payload.note || "",
    loadout: payload.loadout || {},
    updatedAt: new Date().toISOString(),
  };
  const index = fits.findIndex((fit) => fit.id === normalized.id);
  if (index >= 0) {
    fits[index] = normalized;
  } else {
    fits.push(normalized);
  }
  await writeSavedFits(deps, fits);
  return normalized;
}

export async function removeSavedFit(deps, id) {
  const fits = await loadSavedFits(deps);
  const next = fits.filter((fit) => fit.id !== id);
  await writeSavedFits(deps, next);
  return next;
}

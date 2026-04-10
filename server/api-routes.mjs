import path from "node:path";
import { exportAppConfig, fileExists, importAppConfig, openNativeSavePathPicker, resolveSaveSelection, writeAppConfig } from "./runtime-paths.mjs";
import { removeSavedFit, upsertSavedFit } from "./fits-store.mjs";
import { json, readJsonBody, serveGameAsset, serveStatic } from "./http-utils.mjs";

export async function handleApiRequest(deps, requestUrl, request, response) {
  const {
    APP_CONFIG_PATH,
    PUBLIC_DIR,
    applySaveEdits,
    buildBootstrap,
    buildStatus,
    resolveGameRootOverrideInput,
    ensureGameData,
    fitsStoreDeps,
    gameStateControl,
  } = deps;

  if (requestUrl.pathname === "/api/healthz" && request.method === "GET") {
    json(response, { ok: true }, 200);
    return true;
  }

  if (requestUrl.pathname === "/api/bootstrap" && request.method === "GET") {
    json(response, await buildBootstrap(deps));
    return true;
  }

  if (requestUrl.pathname === "/api/status" && request.method === "GET") {
    json(response, await buildStatus(deps));
    return true;
  }

  if (requestUrl.pathname === "/api/fits" && request.method === "POST") {
    const payload = await readJsonBody(request);
    if (!payload?.shipName || !payload?.name) {
      json(response, { error: "shipName and name are required" }, 400);
      return true;
    }
    const saved = await upsertSavedFit(fitsStoreDeps, payload);
    json(response, saved, 201);
    return true;
  }

  if (requestUrl.pathname === "/api/fits" && request.method === "DELETE") {
    const id = requestUrl.searchParams.get("id");
    if (!id) {
      json(response, { error: "id is required" }, 400);
      return true;
    }
    const fits = await removeSavedFit(fitsStoreDeps, id);
    json(response, { fits });
    return true;
  }

  if (requestUrl.pathname === "/api/save-config/browse" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const browseKind = String(payload?.kind || "").trim().toLowerCase();
    const kind = browseKind === "directory" || browseKind === "game-root" ? "directory" : "file";
    const pickedPath = await openNativeSavePathPicker(kind);
    json(response, { ok: Boolean(pickedPath), cancelled: !pickedPath, path: pickedPath ? path.normalize(pickedPath) : null }, 200);
    return true;
  }

  if (requestUrl.pathname === "/api/app-config/export" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const targetPath = String(payload?.path || "").trim();
    if (!targetPath) {
      json(response, { error: "A target path is required for config export." }, 400);
      return true;
    }
    const normalizedPath = path.normalize(targetPath);
    await exportAppConfig(APP_CONFIG_PATH, normalizedPath);
    json(response, { ok: true, path: normalizedPath }, 200);
    return true;
  }

  if (requestUrl.pathname === "/api/app-config/import" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const sourcePath = String(payload?.path || "").trim();
    if (!sourcePath) {
      json(response, { error: "A source path is required for config import." }, 400);
      return true;
    }
    const normalizedPath = path.normalize(sourcePath);
    if (!(await fileExists(normalizedPath))) {
      json(response, { error: "The selected config file was not found." }, 400);
      return true;
    }
    const config = await importAppConfig(APP_CONFIG_PATH, normalizedPath);
    json(response, { ok: true, path: normalizedPath, config }, 200);
    return true;
  }

  if (requestUrl.pathname === "/api/save-config" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const nextRecentPath = Object.prototype.hasOwnProperty.call(payload || {}, "recentPathOverride")
      ? String(payload?.recentPathOverride || "").trim()
      : null;
    const nextGameRoot = Object.prototype.hasOwnProperty.call(payload || {}, "gameRootOverride")
      ? String(payload?.gameRootOverride || "").trim()
      : null;
    const updates = {};

    if (nextRecentPath !== null) {
      if (!nextRecentPath) {
        updates.recentPathOverride = "";
      } else {
        const normalizedPath = path.normalize(nextRecentPath);
        const exists = await fileExists(normalizedPath);
        if (!exists || !/recent\.txt$/i.test(path.basename(normalizedPath))) {
          json(response, { error: "The provided recent.txt path was not found." }, 400);
          return true;
        }
        updates.recentPathOverride = normalizedPath;
      }
    }

    if (nextGameRoot !== null) {
      if (!nextGameRoot) {
        updates.gameRootOverride = "";
      } else {
        const resolvedGameRoot = await resolveGameRootOverrideInput(nextGameRoot);
        if (!resolvedGameRoot) {
          json(response, { error: "The provided Endless Sky game folder was not found." }, 400);
          return true;
        }
        updates.gameRootOverride = resolvedGameRoot;
      }
    }

    await writeAppConfig(APP_CONFIG_PATH, updates);
    if (Object.prototype.hasOwnProperty.call(updates, "gameRootOverride")) {
      gameStateControl.resetGameData();
    }
    json(
      response,
      {
        ok: true,
        recentPath: updates.recentPathOverride ?? null,
        gameRoot: updates.gameRootOverride ?? null,
        cleared: Object.values(updates).some((value) => value === ""),
      },
      200
    );
    return true;
  }

  if (requestUrl.pathname === "/api/save-editor" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const saveSelection = await resolveSaveSelection(APP_CONFIG_PATH);
    const targetSavePath = payload?.savePathOverride
      ? path.normalize(String(payload.savePathOverride))
      : saveSelection.selectedSavePath;
    const savesDirResolved = path.resolve(saveSelection.savesDir);
    const targetResolved = path.resolve(targetSavePath);
    if (!targetResolved.startsWith(savesDirResolved)) {
      json(response, { error: "savePathOverride must stay inside the save directory." }, 400);
      return true;
    }
    const result = await applySaveEdits(targetResolved, payload);
    json(response, result, 200);
    return true;
  }

  if (requestUrl.pathname.startsWith("/game-assets/")) {
    await serveGameAsset(requestUrl.pathname, response, ensureGameData);
    return true;
  }

  await serveStatic(requestUrl.pathname, response, PUBLIC_DIR);
  return true;
}

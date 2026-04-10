import { readFile } from "node:fs/promises";
import path from "node:path";

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[ext] || "application/octet-stream"
  );
}

export function json(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function serveStatic(requestPath, response, publicDir) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.join(publicDir, safePath);
  try {
    const data = await readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": getMimeType(fullPath),
      "Cache-Control": safePath.endsWith(".html") ? "no-store" : "public, max-age=300",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export async function serveGameAsset(requestPath, response, ensureGameData) {
  const game = await ensureGameData();
  const relative = decodeURIComponent(
    requestPath.replace(/^\/game-assets\//, "")
  ).replace(/^\/+/, "");
  const baseDir = path.join(game.gameRoot, "images");
  const fullPath = path.normalize(path.join(baseDir, relative));
  if (!fullPath.startsWith(baseDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  const altPath = fullPath.endsWith(".png")
    ? fullPath.slice(0, -4) + ".jpg"
    : fullPath.endsWith(".jpg")
      ? fullPath.slice(0, -4) + ".png"
      : null;

  for (const tryPath of [fullPath, altPath].filter(Boolean)) {
    try {
      const data = await readFile(tryPath);
      response.writeHead(200, {
        "Content-Type": getMimeType(tryPath),
        "Cache-Control": "public, max-age=3600",
      });
      response.end(data);
      return;
    } catch {
    }
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

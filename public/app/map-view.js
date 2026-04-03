export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function getAtlasMapProjection(systems, targetAspect = 1) {
  if (!systems.length) {
    return null;
  }

  const xs = systems.map((system) => system.x);
  const ys = systems.map((system) => system.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const aspect = clamp(targetAspect || 1, 0.55, 2.4);
  const base = 1800;
  const width = aspect >= 1 ? Math.round(base * aspect) : base;
  const height = aspect >= 1 ? base : Math.round(base / aspect);
  const padding = 170;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const contentWidth = spanX * scale;
  const contentHeight = spanY * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;

  return {
    width,
    height,
    padding,
    key: `${systems.length}:${minX}:${maxX}:${minY}:${maxY}:${width}:${height}`,
    project(system) {
      const x = offsetX + (system.x - minX) * scale;
      const y = offsetY + (system.y - minY) * scale;
      return [x, y];
    },
  };
}

export function fitViewBox(minX, minY, maxX, maxY, targetWidth, targetHeight, boundsWidth, boundsHeight) {
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const span = Math.max(spanX, spanY);
  const padding = Math.max(28, Math.min(72, span * 0.18));
  let left = minX - padding;
  let top = minY - padding;
  let width = Math.max(120, spanX + padding * 2);
  let height = Math.max(120, spanY + padding * 2);
  const targetRatio = targetWidth / targetHeight;
  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    const neededHeight = width / targetRatio;
    top -= (neededHeight - height) / 2;
    height = neededHeight;
  } else {
    const neededWidth = height * targetRatio;
    left -= (neededWidth - width) / 2;
    width = neededWidth;
  }

  if (left < 0) {
    left = 0;
  }
  if (top < 0) {
    top = 0;
  }
  if (left + width > boundsWidth) {
    left = Math.max(0, boundsWidth - width);
  }
  if (top + height > boundsHeight) {
    top = Math.max(0, boundsHeight - height);
  }

  return { x: left, y: top, width, height };
}

export function getDefaultAtlasView(projection) {
  return {
    x: 0,
    y: 0,
    width: projection.width,
    height: projection.height,
  };
}

export function clampAtlasView(view, projection, bounds = null, options = {}) {
  const minFactor = options.minFactor ?? 0.02;
  const maxFactor = options.maxFactor ?? 2;
  const minSize = projection.width * minFactor;
  const maxSize = bounds
    ? Math.max(
        projection.width * maxFactor,
        bounds.maxX - bounds.minX + projection.padding * 2,
        bounds.maxY - bounds.minY + projection.padding * 2
      )
    : projection.width * maxFactor;
  const width = clamp(view.width, minSize, maxSize);
  const height = clamp(view.height ?? width, minSize, maxSize);
  const overscanX = Math.min(projection.padding * 0.75, width * 0.14);
  const overscanY = Math.min(projection.padding * 0.75, height * 0.14);
  const panMinX = bounds ? Math.min(-overscanX, bounds.minX) : -overscanX;
  const panMinY = bounds ? Math.min(-overscanY, bounds.minY) : -overscanY;
  const panMaxX = bounds
    ? Math.max(projection.width - width + overscanX, bounds.maxX - width)
    : Math.max(-overscanX, projection.width - width + overscanX);
  const panMaxY = bounds
    ? Math.max(projection.height - height + overscanY, bounds.maxY - height)
    : Math.max(-overscanY, projection.height - height + overscanY);
  return {
    ...view,
    width,
    height,
    x: clamp(view.x, panMinX, Math.max(panMinX, panMaxX)),
    y: clamp(view.y, panMinY, Math.max(panMinY, panMaxY)),
  };
}

export function getAtlasFocusView(entry, projection, bounds = null, zoom = 0.22) {
  const size = clamp(projection.width * zoom, projection.width * 0.035, projection.width * 0.6);
  return clampAtlasView(
    {
      x: entry.x - size / 2,
      y: entry.y - size / 2,
      width: size,
      height: size,
    },
    projection,
    bounds
  );
}

export function getAtlasFocusViewForNames(names, projection, systemsMap, bounds, fallbackName = null, zoom = 0.22) {
  const entries = [...new Set(names)]
    .map((name) => systemsMap[name])
    .filter(Boolean)
    .map((system) => {
      const [x, y] = projection.project(system);
      return { x, y };
    });

  if (!entries.length) {
    if (fallbackName && systemsMap[fallbackName]) {
      const [x, y] = projection.project(systemsMap[fallbackName]);
      return getAtlasFocusView({ x, y }, projection, bounds, zoom);
    }
    return getDefaultAtlasView(projection);
  }

  if (entries.length === 1) {
    return getAtlasFocusView(entries[0], projection, bounds, zoom);
  }

  const xs = entries.map((entry) => entry.x);
  const ys = entries.map((entry) => entry.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, projection.width * 0.12);
  const padding = Math.max(48, span * 0.16);
  return clampAtlasView(
    {
      x: minX - padding,
      y: minY - padding,
      width: span + padding * 2,
      height: span + padding * 2,
    },
    projection,
    bounds
  );
}

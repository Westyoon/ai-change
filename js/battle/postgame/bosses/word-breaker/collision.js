function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeAabb(bounds = {}) {
  return {
    x: finite(bounds.x),
    y: finite(bounds.y),
    width: Math.max(0, finite(bounds.width)),
    height: Math.max(0, finite(bounds.height)),
  };
}

export function aabbIntersects(left, right) {
  const a = normalizeAabb(left);
  const b = normalizeAabb(right);
  return (
    a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y
  );
}

export function pointInAabb(point, bounds) {
  const box = normalizeAabb(bounds);
  const x = finite(point?.x, Number.NaN);
  const y = finite(point?.y, Number.NaN);
  return (
    Number.isFinite(x)
    && Number.isFinite(y)
    && x >= box.x
    && x <= box.x + box.width
    && y >= box.y
    && y <= box.y + box.height
  );
}

export function aabbCenter(bounds) {
  const box = normalizeAabb(bounds);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export function clampAabbToArena(bounds, arena) {
  const box = normalizeAabb(bounds);
  const world = normalizeAabb(arena);
  const width = Math.min(box.width, world.width);
  const height = Math.min(box.height, world.height);
  return {
    x: Math.max(world.x, Math.min(box.x, world.x + world.width - width)),
    y: Math.max(world.y, Math.min(box.y, world.y + world.height - height)),
    width,
    height,
  };
}

function segmentIntersectsAabb(start, end, bounds) {
  const box = normalizeAabb(bounds);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let entry = 0;
  let exit = 1;

  for (const [origin, delta, min, max] of [
    [start.x, deltaX, box.x, box.x + box.width],
    [start.y, deltaY, box.y, box.y + box.height],
  ]) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return false;
  }
  return true;
}

export function sweptAabbIntersects(previousBounds, nextBounds, targetBounds) {
  const previous = normalizeAabb(previousBounds);
  const next = normalizeAabb(nextBounds);
  const target = normalizeAabb(targetBounds);
  if (aabbIntersects(previous, target) || aabbIntersects(next, target)) return true;

  const halfWidth = Math.max(previous.width, next.width) / 2;
  const halfHeight = Math.max(previous.height, next.height) / 2;
  const expandedTarget = {
    x: target.x - halfWidth,
    y: target.y - halfHeight,
    width: target.width + halfWidth * 2,
    height: target.height + halfHeight * 2,
  };
  return segmentIntersectsAabb(aabbCenter(previous), aabbCenter(next), expandedTarget);
}

export function moveAabbToward(bounds, targetBounds, maxDistance) {
  const source = normalizeAabb(bounds);
  const sourceCenter = aabbCenter(source);
  const targetCenter = aabbCenter(targetBounds);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  const distance = Math.hypot(deltaX, deltaY);
  const travel = Math.max(0, finite(maxDistance));
  if (distance === 0 || travel >= distance) {
    return {
      ...source,
      x: targetCenter.x - source.width / 2,
      y: targetCenter.y - source.height / 2,
    };
  }
  const scale = travel / distance;
  return {
    ...source,
    x: source.x + deltaX * scale,
    y: source.y + deltaY * scale,
  };
}

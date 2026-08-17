function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeRect(rect = {}) {
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
  };
}

export function rectsOverlap(first, second) {
  const a = normalizeRect(first);
  const b = normalizeRect(second);
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function circleIntersectsRect(circle, rect) {
  const target = normalizeRect(rect);
  const radius = Math.max(0, finite(circle?.radius));
  const centerX = finite(circle?.x);
  const centerY = finite(circle?.y);
  const closestX = Math.max(target.x, Math.min(centerX, target.x + target.width));
  const closestY = Math.max(target.y, Math.min(centerY, target.y + target.height));
  const deltaX = centerX - closestX;
  const deltaY = centerY - closestY;
  return deltaX * deltaX + deltaY * deltaY <= radius * radius;
}

export function isWithinRadius(first, second, radius) {
  const deltaX = finite(first?.x) - finite(second?.x);
  const deltaY = finite(first?.y) - finite(second?.y);
  const safeRadius = Math.max(0, finite(radius));
  return deltaX * deltaX + deltaY * deltaY <= safeRadius * safeRadius;
}

function clampToBounds(position, size, bounds) {
  if (!bounds) {
    return position;
  }
  const normalized = normalizeRect(bounds);
  return {
    x: Math.max(normalized.x, Math.min(position.x, normalized.x + normalized.width - size.width)),
    y: Math.max(normalized.y, Math.min(position.y, normalized.y + normalized.height - size.height)),
  };
}

function collides(position, size, colliders) {
  const rect = { ...position, ...size };
  return colliders.some((collider) => rectsOverlap(rect, collider));
}

/** Resolves X and Y independently so a moving body can slide along obstacles. */
export function resolveMovement({ position, size, delta, colliders = [], bounds = null }) {
  const safePosition = { x: finite(position?.x), y: finite(position?.y) };
  const safeSize = {
    width: Math.max(0, finite(size?.width)),
    height: Math.max(0, finite(size?.height)),
  };
  const safeDelta = { x: finite(delta?.x), y: finite(delta?.y) };

  let next = clampToBounds(
    { x: safePosition.x + safeDelta.x, y: safePosition.y },
    safeSize,
    bounds,
  );
  if (collides(next, safeSize, colliders)) {
    next.x = safePosition.x;
  }

  next = clampToBounds(
    { x: next.x, y: safePosition.y + safeDelta.y },
    safeSize,
    bounds,
  );
  if (collides(next, safeSize, colliders)) {
    next.y = safePosition.y;
  }
  return next;
}

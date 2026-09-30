const DEFAULT_WORLD_SIZE = Object.freeze({ width: 1024, height: 640 });
const DEFAULT_ACTOR_SIZE = Object.freeze({ width: 42, height: 56 });

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positive(value, fallback) {
  return Math.max(1, finite(value, fallback));
}

export function normalizeStoryWorldSize(worldSize = {}) {
  return Object.freeze({
    width: positive(worldSize.width, DEFAULT_WORLD_SIZE.width),
    height: positive(worldSize.height, DEFAULT_WORLD_SIZE.height),
  });
}

export function clampStoryWorldPosition(position = {}, worldSize = DEFAULT_WORLD_SIZE, actorSize = DEFAULT_ACTOR_SIZE) {
  const world = normalizeStoryWorldSize(worldSize);
  const actor = {
    width: positive(actorSize.width, DEFAULT_ACTOR_SIZE.width),
    height: positive(actorSize.height, DEFAULT_ACTOR_SIZE.height),
  };
  return Object.freeze({
    x: Math.max(0, Math.min(world.width - actor.width, finite(position.x))),
    y: Math.max(0, Math.min(world.height - actor.height, finite(position.y))),
  });
}

export function resolveStoryWorldStartPosition(map, saveState = {}, actorSize = DEFAULT_ACTOR_SIZE) {
  const worldSize = normalizeStoryWorldSize(map?.worldSize);
  const savedPosition = saveState?.story?.lastMapId === map?.id
    ? saveState?.story?.lastPlayerPosition
    : null;
  const candidate = savedPosition
    && Number.isFinite(savedPosition.x)
    && Number.isFinite(savedPosition.y)
    ? savedPosition
    : map?.startPosition ?? { x: worldSize.width / 2, y: worldSize.height / 2 };
  return clampStoryWorldPosition(candidate, worldSize, actorSize);
}

function playerCenter(playerBounds = {}) {
  return {
    x: finite(playerBounds.x) + positive(playerBounds.width, DEFAULT_ACTOR_SIZE.width) / 2,
    y: finite(playerBounds.y) + positive(playerBounds.height, DEFAULT_ACTOR_SIZE.height) / 2,
  };
}

/** Returns only the closest target whose own interaction radius contains the player. */
export function findNearestStoryTarget(targets = [], playerBounds = {}) {
  const center = playerCenter(playerBounds);
  let nearest = null;
  for (const target of targets) {
    if (typeof target?.id !== "string" || target.id.length === 0) continue;
    const radius = Math.max(1, finite(target.interactionRadius, 64));
    const distance = Math.hypot(finite(target.x) - center.x, finite(target.y) - center.y);
    if (distance > radius || (nearest && distance >= nearest.distance)) continue;
    nearest = Object.freeze({ target, distance });
  }
  return nearest;
}

/**
 * Desktop fits the entire logical map. Portrait mobile deliberately uses a
 * cover scale and a clamped camera so the map is never stretched.
 */
export function calculateStoryWorldLayout({
  worldSize = DEFAULT_WORLD_SIZE,
  viewportSize = {},
  focusBounds = {},
  camera = false,
} = {}) {
  const world = normalizeStoryWorldSize(worldSize);
  const viewport = {
    width: positive(viewportSize.width, world.width),
    height: positive(viewportSize.height, world.height),
  };
  const fitScale = Math.min(viewport.width / world.width, viewport.height / world.height);
  const coverScale = Math.max(viewport.width / world.width, viewport.height / world.height);
  const scale = camera ? coverScale : fitScale;
  const surface = {
    width: world.width * scale,
    height: world.height * scale,
  };
  const center = playerCenter(focusBounds);
  const desiredX = viewport.width / 2 - center.x * scale;
  const desiredY = viewport.height / 2 - center.y * scale;
  const minX = Math.min(0, viewport.width - surface.width);
  const minY = Math.min(0, viewport.height - surface.height);
  const x = camera
    ? Math.max(minX, Math.min(0, desiredX))
    : (viewport.width - surface.width) / 2;
  const y = camera
    ? Math.max(minY, Math.min(0, desiredY))
    : (viewport.height - surface.height) / 2;
  return Object.freeze({
    camera: Boolean(camera),
    scale,
    x,
    y,
    width: surface.width,
    height: surface.height,
  });
}

export const STORY_WORLD_ACTOR_SIZE = DEFAULT_ACTOR_SIZE;
export const STORY_WORLD_SIZE = DEFAULT_WORLD_SIZE;

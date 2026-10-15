/** Camera coordinates are world pixels; viewport coordinates are CSS pixels. */
export function followCamera({ target, world, viewport, zoom = 2 }) {
  const scale = Math.max(1, zoom, viewport.width / world.width, viewport.height / world.height);
  const width = viewport.width / scale;
  const height = viewport.height / scale;
  return {
    x: Math.max(0, Math.min(world.width - width, target.x - width / 2)),
    y: Math.max(0, Math.min(world.height - height, target.y - height / 2)),
    width, height, zoom: scale,
  };
}

export function screenToWorld(point, camera) {
  return { x: point.x / camera.zoom + camera.x, y: point.y / camera.zoom + camera.y };
}

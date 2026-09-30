/** Visual-only hinge movement; gameplay still uses the existing OPEN/CLOSED state. */
export function advanceLidProgress(progress, open, deltaSeconds) {
  const target = open ? 1 : 0;
  const step = Math.max(0, deltaSeconds) / 0.18;
  return progress < target ? Math.min(target, progress + step) : Math.max(target, progress - step);
}

export function drawSortingLid(ctx, image, crop, scene, progress) {
  const width = scene.binWidth + 8;
  const height = crop ? width * crop.height / crop.width : 12;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(scene.binX - 4, scene.binY);
  ctx.rotate(-Math.PI * 0.55 * progress);
  if (image && crop && image.complete !== false && (image.naturalWidth ?? image.width) > 0) {
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, -height, width, height);
  } else {
    ctx.fillStyle = "#d82f76";
    ctx.fillRect(0, -height, width, height);
  }
  ctx.restore();
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

export function calculateFixedFrameScale({
  availableWidth,
  availableHeight,
  logicalWidth,
  logicalHeight,
  fitHeight = true,
  maxScale = 1,
} = {}) {
  const width = positiveFinite(availableWidth, "availableWidth");
  const height = positiveFinite(availableHeight, "availableHeight");
  const frameWidth = positiveFinite(logicalWidth, "logicalWidth");
  const frameHeight = positiveFinite(logicalHeight, "logicalHeight");
  const ceiling = positiveFinite(maxScale, "maxScale");
  const widthScale = width / frameWidth;
  const heightScale = fitHeight ? height / frameHeight : Number.POSITIVE_INFINITY;
  return Math.min(ceiling, widthScale, heightScale);
}

function measuredSize(element, axis, fallback) {
  const clientValue = Number(element?.[axis === "width" ? "clientWidth" : "clientHeight"]);
  if (clientValue > 0) return clientValue;
  const rectValue = Number(element?.getBoundingClientRect?.()?.[axis]);
  return rectValue > 0 ? rectValue : fallback;
}

export function attachFixedFrameScaler({
  container,
  viewport,
  frame,
  logicalWidth,
  logicalHeight,
  fitHeight = true,
  maxScale = 1,
} = {}) {
  positiveFinite(logicalWidth, "logicalWidth");
  positiveFinite(logicalHeight, "logicalHeight");
  positiveFinite(maxScale, "maxScale");
  if (!container?.style || !viewport?.style || !frame?.style) return () => {};

  viewport.style.position = "relative";
  viewport.style.flex = "0 0 auto";
  frame.style.position = "absolute";
  frame.style.inset = "0 auto auto 0";
  frame.style.width = `${logicalWidth}px`;
  frame.style.height = `${logicalHeight}px`;
  frame.style.transformOrigin = "top left";

  let disposed = false;
  let observer = null;
  const windowRef = container.ownerDocument?.defaultView ?? globalThis.window;

  const resize = () => {
    if (disposed) return;
    const availableWidth = measuredSize(container, "width", logicalWidth);
    const availableHeight = measuredSize(container, "height", logicalHeight);
    const scale = calculateFixedFrameScale({
      availableWidth,
      availableHeight,
      logicalWidth,
      logicalHeight,
      fitHeight,
      maxScale,
    });
    viewport.style.width = `${logicalWidth * scale}px`;
    viewport.style.height = `${logicalHeight * scale}px`;
    frame.style.transform = `scale(${scale})`;
    viewport.dataset.scale = String(scale);
  };

  const ResizeObserverRef = windowRef?.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverRef === "function") {
    observer = new ResizeObserverRef(resize);
    observer.observe(container);
  } else {
    windowRef?.addEventListener?.("resize", resize);
  }
  resize();

  return () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect?.();
    windowRef?.removeEventListener?.("resize", resize);
  };
}

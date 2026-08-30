function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function nonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function toggleClass(element, className, force) {
  if (!className || !element) return;
  if (typeof element.classList?.toggle === "function") {
    element.classList.toggle(className, force);
    return;
  }
  const classes = new Set(
    (typeof element.className === "string" ? element.className : "")
      .split(/\s+/u)
      .filter(Boolean),
  );
  if (force) classes.add(className);
  else classes.delete(className);
  element.className = [...classes].join(" ");
}

function normalizeFluidLayout(fluidLayout) {
  if (fluidLayout == null) return null;
  if (!fluidLayout || typeof fluidLayout !== "object" || Array.isArray(fluidLayout)) {
    throw new TypeError("fluidLayout must be an object when provided.");
  }
  const className = typeof fluidLayout.className === "string"
    ? fluidLayout.className.trim()
    : "";
  if (!className || /\s/u.test(className)) {
    throw new TypeError("fluidLayout.className must be one non-empty class name.");
  }
  return Object.freeze({
    minWidth: positiveFinite(fluidLayout.minWidth, "fluidLayout.minWidth"),
    minHeight: nonNegativeFinite(fluidLayout.minHeight ?? 0, "fluidLayout.minHeight"),
    className,
  });
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
  fluidLayout = null,
  onLayout = null,
} = {}) {
  positiveFinite(logicalWidth, "logicalWidth");
  positiveFinite(logicalHeight, "logicalHeight");
  positiveFinite(maxScale, "maxScale");
  const fluid = normalizeFluidLayout(fluidLayout);
  if (onLayout != null && typeof onLayout !== "function") {
    throw new TypeError("onLayout must be a function when provided.");
  }
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
    const fluidActive = Boolean(
      fluid
      && availableWidth >= fluid.minWidth
      && availableHeight >= fluid.minHeight,
    );

    toggleClass(container, fluid?.className, fluidActive);
    if (fluidActive) {
      viewport.style.position = "relative";
      viewport.style.flex = "1 1 auto";
      viewport.style.width = "100%";
      viewport.style.height = "100%";
      frame.style.position = "relative";
      frame.style.inset = "auto";
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "none";
      viewport.dataset.scale = "fluid";
      viewport.dataset.layout = "fluid";
      onLayout?.(Object.freeze({
        mode: "fluid",
        availableWidth,
        availableHeight,
        scale: 1,
      }));
      return;
    }

    viewport.style.position = "relative";
    viewport.style.flex = "0 0 auto";
    frame.style.position = "absolute";
    frame.style.inset = "0 auto auto 0";
    frame.style.width = `${logicalWidth}px`;
    frame.style.height = `${logicalHeight}px`;
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
    viewport.dataset.layout = "fixed";
    onLayout?.(Object.freeze({
      mode: "fixed",
      availableWidth,
      availableHeight,
      scale,
    }));
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
    toggleClass(container, fluid?.className, false);
  };
}

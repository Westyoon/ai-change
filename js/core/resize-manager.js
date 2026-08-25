export class ResizeManager {
  #observer = null;
  #listeners = new Set();
  #started = false;

  constructor({
    canvas = null,
    container = canvas?.parentElement ?? null,
    baseWidth = 1280,
    baseHeight = 720,
    maxDpr = 2,
    onResize,
  } = {}) {
    if (!(baseWidth > 0) || !(baseHeight > 0)) {
      throw new RangeError("ResizeManager base dimensions must be positive.");
    }
    this.canvas = canvas;
    this.container = container;
    this.baseWidth = baseWidth;
    this.baseHeight = baseHeight;
    this.maxDpr = Math.max(1, maxDpr);
    this.state = Object.freeze({
      baseWidth,
      baseHeight,
      cssWidth: baseWidth,
      cssHeight: baseHeight,
      pixelWidth: baseWidth,
      pixelHeight: baseHeight,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      dpr: 1,
    });
    if (typeof onResize === "function") {
      this.#listeners.add(onResize);
    }
    this.update = this.update.bind(this);
  }

  start() {
    if (this.#started) {
      return this.state;
    }
    globalThis.addEventListener?.("resize", this.update);
    globalThis.addEventListener?.("orientationchange", this.update);
    if (typeof ResizeObserver === "function" && this.container) {
      this.#observer = new ResizeObserver(this.update);
      this.#observer.observe(this.container);
    }
    this.#started = true;
    return this.update();
  }

  update() {
    const rect = this.container?.getBoundingClientRect?.();
    const availableWidth = Math.max(1, rect?.width ?? globalThis.innerWidth ?? this.baseWidth);
    const availableHeight = Math.max(1, rect?.height ?? globalThis.innerHeight ?? this.baseHeight);
    const scale = Math.min(availableWidth / this.baseWidth, availableHeight / this.baseHeight);
    const cssWidth = Math.max(1, Math.round(this.baseWidth * scale));
    const cssHeight = Math.max(1, Math.round(this.baseHeight * scale));
    const dpr = Math.min(this.maxDpr, Math.max(1, globalThis.devicePixelRatio ?? 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (this.canvas) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
    }

    this.state = Object.freeze({
      baseWidth: this.baseWidth,
      baseHeight: this.baseHeight,
      cssWidth,
      cssHeight,
      pixelWidth,
      pixelHeight,
      scale,
      offsetX: (availableWidth - cssWidth) / 2,
      offsetY: (availableHeight - cssHeight) / 2,
      dpr,
    });
    for (const listener of [...this.#listeners]) {
      listener(this.state);
    }
    return this.state;
  }

  onResize(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Resize listener must be a function.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas?.getBoundingClientRect?.();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: clientX, y: clientY };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * this.baseWidth,
      y: ((clientY - rect.top) / rect.height) * this.baseHeight,
    };
  }

  destroy() {
    if (!this.#started) {
      return;
    }
    globalThis.removeEventListener?.("resize", this.update);
    globalThis.removeEventListener?.("orientationchange", this.update);
    this.#observer?.disconnect();
    this.#observer = null;
    this.#listeners.clear();
    this.#started = false;
  }
}

export default ResizeManager;

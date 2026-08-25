function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function requestFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return { kind: "raf", id: globalThis.requestAnimationFrame(callback) };
  }
  return { kind: "timeout", id: globalThis.setTimeout(() => callback(now()), 16) };
}

function cancelFrame(handle) {
  if (!handle) {
    return;
  }
  if (handle.kind === "raf") {
    globalThis.cancelAnimationFrame?.(handle.id);
  } else {
    globalThis.clearTimeout(handle.id);
  }
}

export class GameLoop {
  #frame = null;
  #lastTime = null;
  #elapsedMs = 0;
  #running = false;
  #paused = false;
  #boundTick;

  constructor({ update = () => {}, render = () => {}, maxDeltaMs = 100 } = {}) {
    if (typeof update !== "function" || typeof render !== "function") {
      throw new TypeError("GameLoop update and render must be functions.");
    }
    this.update = update;
    this.render = render;
    this.maxDeltaMs = Math.max(1, maxDeltaMs);
    this.#boundTick = this.#tick.bind(this);
  }

  get running() {
    return this.#running;
  }

  get paused() {
    return this.#paused;
  }

  start() {
    if (this.#running && !this.#paused) {
      return;
    }
    if (!this.#running) {
      this.#elapsedMs = 0;
    }
    this.#running = true;
    this.#paused = false;
    this.#lastTime = null;
    this.#schedule();
  }

  pause() {
    if (!this.#running || this.#paused) {
      return;
    }
    this.#paused = true;
    cancelFrame(this.#frame);
    this.#frame = null;
    this.#lastTime = null;
  }

  resume() {
    if (!this.#running || !this.#paused) {
      return;
    }
    this.#paused = false;
    this.#lastTime = null;
    this.#schedule();
  }

  stop() {
    cancelFrame(this.#frame);
    this.#frame = null;
    this.#lastTime = null;
    this.#running = false;
    this.#paused = false;
  }

  step(timestamp = now()) {
    if (this.#lastTime == null) {
      this.#lastTime = timestamp;
    }
    const rawDeltaMs = Math.max(0, timestamp - this.#lastTime);
    const deltaMs = Math.min(this.maxDeltaMs, rawDeltaMs);
    this.#lastTime = timestamp;
    this.#elapsedMs += deltaMs;
    this.update(deltaMs, this.#elapsedMs, { rawDeltaMs });
    this.render(this.#elapsedMs);
    return { deltaMs, rawDeltaMs, elapsedMs: this.#elapsedMs };
  }

  destroy() {
    this.stop();
    this.update = () => {};
    this.render = () => {};
  }

  #schedule() {
    if (!this.#running || this.#paused || this.#frame) {
      return;
    }
    this.#frame = requestFrame(this.#boundTick);
  }

  #tick(timestamp) {
    this.#frame = null;
    if (!this.#running || this.#paused) {
      return;
    }
    this.step(timestamp);
    this.#schedule();
  }
}

export default GameLoop;

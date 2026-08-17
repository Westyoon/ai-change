function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class MiniGameClock {
  #now;
  #elapsedMs = 0;
  #lastStartedAt = null;
  #pauseReasons = new Set();
  #running = false;

  constructor({ now = defaultNow } = {}) {
    this.#now = now;
  }

  get running() {
    return this.#running;
  }

  get paused() {
    return this.#pauseReasons.size > 0;
  }

  get pauseReasons() {
    return new Set(this.#pauseReasons);
  }

  start() {
    this.#elapsedMs = 0;
    this.#pauseReasons.clear();
    this.#running = true;
    this.#lastStartedAt = this.#now();
    return this;
  }

  reset() {
    this.#elapsedMs = 0;
    this.#pauseReasons.clear();
    this.#lastStartedAt = this.#running ? this.#now() : null;
    return this;
  }

  pause(reason = "SYSTEM") {
    const wasPaused = this.paused;
    this.#pauseReasons.add(String(reason));
    if (this.#running && !wasPaused) {
      this.#commitElapsed();
      this.#lastStartedAt = null;
    }
  }

  resume(reason) {
    if (reason == null) {
      this.#pauseReasons.clear();
    } else {
      this.#pauseReasons.delete(String(reason));
    }

    if (this.#running && !this.paused && this.#lastStartedAt == null) {
      this.#lastStartedAt = this.#now();
    }
  }

  stop() {
    if (this.#running && !this.paused) {
      this.#commitElapsed();
    }
    this.#running = false;
    this.#lastStartedAt = null;
    this.#pauseReasons.clear();
    return this.#elapsedMs;
  }

  getElapsedMs() {
    if (!this.#running || this.paused || this.#lastStartedAt == null) {
      return this.#elapsedMs;
    }
    return this.#elapsedMs + Math.max(0, this.#now() - this.#lastStartedAt);
  }

  #commitElapsed() {
    if (this.#lastStartedAt != null) {
      this.#elapsedMs += Math.max(0, this.#now() - this.#lastStartedAt);
    }
  }
}

export default MiniGameClock;

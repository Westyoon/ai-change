export class InputLock {
  #reasons = new Set();
  #listeners = new Set();

  get locked() {
    return this.#reasons.size > 0;
  }

  get reasons() {
    return new Set(this.#reasons);
  }

  lock(reason = "UNKNOWN") {
    const before = this.locked;
    this.#reasons.add(String(reason));
    this.#notifyIfChanged(before);
    return () => this.unlock(reason);
  }

  unlock(reason = "UNKNOWN") {
    const before = this.locked;
    const removed = this.#reasons.delete(String(reason));
    this.#notifyIfChanged(before);
    return removed;
  }

  clear() {
    const before = this.locked;
    this.#reasons.clear();
    this.#notifyIfChanged(before);
  }

  onChange(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("InputLock listener must be a function.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async withLock(reason, task) {
    const release = this.lock(reason);
    try {
      return await task();
    } finally {
      release();
    }
  }

  #notifyIfChanged(previous) {
    if (previous === this.locked) {
      return;
    }
    for (const listener of [...this.#listeners]) {
      listener(this.locked, this.reasons);
    }
  }
}

export default InputLock;

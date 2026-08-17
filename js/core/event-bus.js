/**
 * Small synchronous event bus used by scenes and shared services.
 * Listeners are copied before emit so subscriptions may safely change while an
 * event is being delivered.
 */
export class EventBus {
  #listeners = new Map();

  on(type, listener, { once = false, signal } = {}) {
    if (typeof type !== "string" || type.length === 0) {
      throw new TypeError("Event type must be a non-empty string.");
    }

    if (typeof listener !== "function") {
      throw new TypeError("Event listener must be a function.");
    }

    if (signal?.aborted) {
      return () => false;
    }

    const record = { listener, once: Boolean(once), abortHandler: null, signal: signal ?? null };
    const records = this.#listeners.get(type) ?? new Set();
    records.add(record);
    this.#listeners.set(type, records);

    const unsubscribe = () => this.#removeRecord(type, record);

    if (signal) {
      record.abortHandler = unsubscribe;
      signal.addEventListener("abort", unsubscribe, { once: true });
    }

    return unsubscribe;
  }

  off(type, listener) {
    const records = this.#listeners.get(type);
    if (!records) {
      return false;
    }

    let removed = false;
    for (const record of [...records]) {
      if (record.listener === listener) {
        removed = this.#removeRecord(type, record) || removed;
      }
    }
    return removed;
  }

  emit(type, detail) {
    const records = this.#listeners.get(type);
    if (!records || records.size === 0) {
      return 0;
    }

    let delivered = 0;
    for (const record of [...records]) {
      if (!records.has(record)) {
        continue;
      }

      if (record.once) {
        this.#removeRecord(type, record);
      }

      record.listener(detail, type);
      delivered += 1;
    }
    return delivered;
  }

  clear(type) {
    if (typeof type === "string") {
      const records = this.#listeners.get(type);
      for (const record of [...(records ?? [])]) {
        this.#removeRecord(type, record);
      }
      return;
    }

    for (const eventType of [...this.#listeners.keys()]) {
      this.clear(eventType);
    }
  }

  #removeRecord(type, record) {
    const records = this.#listeners.get(type);
    if (!records?.delete(record)) {
      return false;
    }

    if (record.abortHandler) {
      record.signal?.removeEventListener("abort", record.abortHandler);
      record.abortHandler = null;
      record.signal = null;
    }

    if (records.size === 0) {
      this.#listeners.delete(type);
    }
    return true;
  }
}

export default EventBus;

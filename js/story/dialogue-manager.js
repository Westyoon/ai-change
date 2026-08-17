const ACTION_TYPES = new Set([
  "returnToMap",
  "openMiniGame",
  "openDialogue",
  "goToMenu",
  "none",
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function collectScripts(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectScripts(entry, output);
    return output;
  }
  if (!value || typeof value !== "object") {
    return output;
  }
  if (typeof value.id === "string" && Array.isArray(value.lines)) {
    output.push(value);
    return output;
  }
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || (nested && typeof nested === "object")) {
      collectScripts(nested, output);
    }
  }
  return output;
}

export class DialogueManager {
  #scripts = new Map();
  #active = null;
  #index = -1;

  constructor(scripts = [], { onLineChange, onComplete } = {}) {
    this.onLineChange = typeof onLineChange === "function" ? onLineChange : null;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.loadScripts(scripts);
  }

  loadScripts(scripts) {
    for (const script of collectScripts(scripts)) {
      this.register(script);
    }
    return this;
  }

  register(script) {
    if (typeof script?.id !== "string" || script.id.length === 0 || !Array.isArray(script.lines)) {
      throw new TypeError("Dialogue script requires an id and lines array.");
    }
    if (this.#scripts.has(script.id)) {
      throw new Error(`Dialogue script is already registered: ${script.id}`);
    }
    if (script.nextAction && !ACTION_TYPES.has(script.nextAction.type)) {
      throw new TypeError(`Dialogue ${script.id} has unsupported action ${String(script.nextAction.type)}.`);
    }
    this.#scripts.set(script.id, clone(script));
    return this;
  }

  has(scriptId) {
    return this.#scripts.has(scriptId);
  }

  getScript(scriptId) {
    return clone(this.#scripts.get(scriptId) ?? null);
  }

  start(scriptId) {
    const script = this.#scripts.get(scriptId);
    if (!script) {
      throw new Error(`Dialogue script was not found: ${String(scriptId)}`);
    }
    this.#active = script;
    this.#index = script.lines.length > 0 ? 0 : -1;
    if (this.#index < 0) {
      return this.#finish();
    }
    const state = this.getState();
    this.onLineChange?.(state.line, state);
    return state;
  }

  next() {
    if (!this.#active) {
      return { done: true, line: null, nextAction: null };
    }
    if (this.#index + 1 >= this.#active.lines.length) {
      return this.#finish();
    }
    this.#index += 1;
    const state = this.getState();
    this.onLineChange?.(state.line, state);
    return state;
  }

  previous() {
    if (!this.#active || this.#index <= 0) {
      return this.getState();
    }
    this.#index -= 1;
    const state = this.getState();
    this.onLineChange?.(state.line, state);
    return state;
  }

  skip() {
    if (!this.#active) {
      return { done: true, line: null, nextAction: null };
    }
    if (this.#active.skippable !== true) {
      return { ...this.getState(), skipped: false };
    }
    return { ...this.#finish(), skipped: true };
  }

  close() {
    this.#active = null;
    this.#index = -1;
  }

  getState() {
    if (!this.#active) {
      return Object.freeze({
        done: true,
        scriptId: null,
        index: -1,
        line: null,
        canGoBack: false,
        canSkip: false,
        nextAction: null,
      });
    }
    return Object.freeze({
      done: false,
      scriptId: this.#active.id,
      index: this.#index,
      line: clone(this.#active.lines[this.#index]),
      canGoBack: this.#index > 0,
      canSkip: this.#active.skippable === true,
      nextAction: null,
    });
  }

  #finish() {
    const script = this.#active;
    const nextAction = clone(script?.nextAction ?? { type: "none", target: null });
    const result = Object.freeze({
      done: true,
      scriptId: script?.id ?? null,
      index: script?.lines?.length ? script.lines.length - 1 : -1,
      line: null,
      canGoBack: false,
      canSkip: false,
      nextAction,
    });
    this.close();
    this.onComplete?.(result);
    return result;
  }
}

export default DialogueManager;

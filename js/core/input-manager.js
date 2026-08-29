export const INPUT_ACTIONS = Object.freeze({
  MOVE_UP: "MOVE_UP",
  MOVE_DOWN: "MOVE_DOWN",
  MOVE_LEFT: "MOVE_LEFT",
  MOVE_RIGHT: "MOVE_RIGHT",
  INTERACT: "INTERACT",
  ATTACK: "ATTACK",
  CONFIRM: "CONFIRM",
  CANCEL: "CANCEL",
  PAUSE: "PAUSE",
});

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  ArrowUp: INPUT_ACTIONS.MOVE_UP,
  KeyW: INPUT_ACTIONS.MOVE_UP,
  ArrowDown: INPUT_ACTIONS.MOVE_DOWN,
  KeyS: INPUT_ACTIONS.MOVE_DOWN,
  ArrowLeft: INPUT_ACTIONS.MOVE_LEFT,
  KeyA: INPUT_ACTIONS.MOVE_LEFT,
  ArrowRight: INPUT_ACTIONS.MOVE_RIGHT,
  KeyD: INPUT_ACTIONS.MOVE_RIGHT,
  KeyE: INPUT_ACTIONS.INTERACT,
  Enter: INPUT_ACTIONS.CONFIRM,
  Space: INPUT_ACTIONS.CONFIRM,
  Escape: INPUT_ACTIONS.PAUSE,
  KeyP: INPUT_ACTIONS.PAUSE,
});

export class InputManager {
  #pressed = new Set();
  #justPressed = new Set();
  #listeners = new Set();
  #activePointers = new Map();
  #started = false;
  #boundKeyDown;
  #boundKeyUp;
  #boundPointerDown;
  #boundPointerEnd;

  constructor({
    target = globalThis.window ?? null,
    root = globalThis.document ?? null,
    bindings = DEFAULT_KEY_BINDINGS,
    onAction,
    preventDefault = true,
  } = {}) {
    this.target = target;
    this.root = root;
    this.bindings = { ...bindings };
    this.preventDefault = preventDefault;
    this.enabled = true;
    if (typeof onAction === "function") {
      this.#listeners.add(onAction);
    }

    this.#boundKeyDown = this.#handleKeyDown.bind(this);
    this.#boundKeyUp = this.#handleKeyUp.bind(this);
    this.#boundPointerDown = this.#handlePointerDown.bind(this);
    this.#boundPointerEnd = this.#handlePointerEnd.bind(this);
  }

  start() {
    if (this.#started) {
      return this;
    }
    this.target?.addEventListener?.("keydown", this.#boundKeyDown);
    this.target?.addEventListener?.("keyup", this.#boundKeyUp);
    this.root?.addEventListener?.("pointerdown", this.#boundPointerDown);
    this.target?.addEventListener?.("pointerup", this.#boundPointerEnd);
    this.target?.addEventListener?.("pointercancel", this.#boundPointerEnd);
    this.target?.addEventListener?.("blur", this.#boundPointerEnd);
    this.#started = true;
    return this;
  }

  destroy() {
    if (!this.#started) {
      return;
    }
    this.target?.removeEventListener?.("keydown", this.#boundKeyDown);
    this.target?.removeEventListener?.("keyup", this.#boundKeyUp);
    this.root?.removeEventListener?.("pointerdown", this.#boundPointerDown);
    this.target?.removeEventListener?.("pointerup", this.#boundPointerEnd);
    this.target?.removeEventListener?.("pointercancel", this.#boundPointerEnd);
    this.target?.removeEventListener?.("blur", this.#boundPointerEnd);
    this.#started = false;
    this.clear();
    this.#listeners.clear();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.clear();
    }
  }

  onAction(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Input listener must be a function.");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  isPressed(action) {
    return this.#pressed.has(action);
  }

  consumePressed(action) {
    const present = this.#justPressed.has(action);
    this.#justPressed.delete(action);
    return present;
  }

  getMovementVector() {
    const x = Number(this.isPressed(INPUT_ACTIONS.MOVE_RIGHT)) - Number(this.isPressed(INPUT_ACTIONS.MOVE_LEFT));
    const y = Number(this.isPressed(INPUT_ACTIONS.MOVE_DOWN)) - Number(this.isPressed(INPUT_ACTIONS.MOVE_UP));
    if (x !== 0 && y !== 0) {
      const diagonal = Math.SQRT1_2;
      return { x: x * diagonal, y: y * diagonal };
    }
    return { x, y };
  }

  trigger(action, phase = "press", source = "programmatic") {
    if (!this.enabled || typeof action !== "string" || action.length === 0) {
      return false;
    }
    if (phase === "release") {
      this.#pressed.delete(action);
    } else {
      if (!this.#pressed.has(action)) {
        this.#justPressed.add(action);
      }
      this.#pressed.add(action);
    }
    this.#emit({ action, phase, source, originalEvent: null });
    return true;
  }

  clear() {
    this.#pressed.clear();
    this.#justPressed.clear();
    this.#activePointers.clear();
  }

  #handleKeyDown(event) {
    const action = this.bindings[event.code];
    if (
      !this.enabled ||
      !action ||
      (action !== INPUT_ACTIONS.PAUSE && this.#usesNativeKeyboardActivation(event.target))
    ) {
      return;
    }
    if (this.preventDefault) {
      event.preventDefault();
    }
    const wasPressed = this.#pressed.has(action);
    this.#pressed.add(action);
    if (!wasPressed) {
      this.#justPressed.add(action);
      this.#emit({ action, phase: "press", source: "keyboard", originalEvent: event });
    }
  }

  #handleKeyUp(event) {
    const action = this.bindings[event.code];
    if (
      !action ||
      (action !== INPUT_ACTIONS.PAUSE && this.#usesNativeKeyboardActivation(event.target))
    ) {
      return;
    }
    if (this.preventDefault) {
      event.preventDefault();
    }
    if (this.#pressed.delete(action)) {
      this.#emit({ action, phase: "release", source: "keyboard", originalEvent: event });
    }
  }

  #handlePointerDown(event) {
    if (!this.enabled) {
      return;
    }
    const element = event.target?.closest?.("[data-action]");
    const action = element?.dataset?.action;
    if (!action) {
      return;
    }
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    this.#activePointers.set(event.pointerId, action);
    const wasPressed = this.#pressed.has(action);
    this.#pressed.add(action);
    if (!wasPressed) {
      this.#justPressed.add(action);
    }
    this.#emit({ action, phase: "press", source: "pointer", originalEvent: event });
  }

  #handlePointerEnd(event) {
    if (event?.type === "blur") {
      for (const action of [...this.#pressed]) {
        this.#emit({ action, phase: "release", source: "system", originalEvent: event });
      }
      this.clear();
      return;
    }
    const action = this.#activePointers.get(event.pointerId);
    if (!action) {
      return;
    }
    this.#activePointers.delete(event.pointerId);
    if (![...this.#activePointers.values()].includes(action)) {
      this.#pressed.delete(action);
    }
    this.#emit({ action, phase: "release", source: "pointer", originalEvent: event });
  }

  #emit(event) {
    for (const listener of [...this.#listeners]) {
      listener(event);
    }
  }

  #usesNativeKeyboardActivation(target) {
    return Boolean(
      target?.closest?.(
        'button, a[href], input, select, textarea, summary, [contenteditable="true"], [role="button"]',
      ),
    );
  }
}

export default InputManager;

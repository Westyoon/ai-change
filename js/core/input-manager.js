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

const NATIVE_KEYBOARD_TARGET_SELECTOR =
  'button, a[href], input, select, textarea, summary, [contenteditable="true"], [role="button"]';

export class InputManager {
  #pressed = new Set();
  #justPressed = new Set();
  #activeKeyboardCodes = new Map();
  #listeners = new Set();
  #activePointers = new Map();
  #started = false;
  #boundKeyDown;
  #boundKeyUp;
  #boundPointerDown;
  #boundPointerEnd;
  #boundVisibilityChange;

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
    this.#boundVisibilityChange = this.#handleVisibilityChange.bind(this);
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
    this.target?.addEventListener?.("pagehide", this.#boundPointerEnd);
    this.root?.addEventListener?.("visibilitychange", this.#boundVisibilityChange);
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
    this.target?.removeEventListener?.("pagehide", this.#boundPointerEnd);
    this.root?.removeEventListener?.("visibilitychange", this.#boundVisibilityChange);
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
    this.#activeKeyboardCodes.clear();
    this.#activePointers.clear();
  }

  #handleKeyDown(event) {
    const action = this.bindings[event.code];
    if (
      !this.enabled ||
      !action ||
      this.#usesNativeKeyboardActivation(event.target, action)
    ) {
      return;
    }
    if (this.preventDefault) {
      event.preventDefault();
    }
    const wasPressed = this.#pressed.has(action);
    this.#activeKeyboardCodes.set(event.code, action);
    this.#pressed.add(action);
    if (!wasPressed) {
      this.#justPressed.add(action);
      this.#emit({ action, phase: "press", source: "keyboard", originalEvent: event });
    }
  }

  #handleKeyUp(event) {
    const action = this.#activeKeyboardCodes.get(event.code) ?? this.bindings[event.code];
    if (!action) return;

    const nativeTarget = this.#getNativeKeyboardTarget(event.target);
    if (this.preventDefault && !nativeTarget) {
      event.preventDefault();
    }
    this.#activeKeyboardCodes.delete(event.code);
    const remainsPressed = this.#hasKeyboardAction(action) || this.#hasPointerAction(action);
    if (!remainsPressed && this.#pressed.delete(action)) {
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
    if (event?.type === "blur" || event?.type === "pagehide") {
      this.#releaseAll(event);
      return;
    }
    const action = this.#activePointers.get(event.pointerId);
    if (!action) {
      return;
    }
    this.#activePointers.delete(event.pointerId);
    if (!this.#hasPointerAction(action) && !this.#hasKeyboardAction(action)) {
      this.#pressed.delete(action);
    }
    this.#emit({ action, phase: "release", source: "pointer", originalEvent: event });
  }

  #handleVisibilityChange(event) {
    if (this.root?.hidden) this.#releaseAll(event);
  }

  #releaseAll(originalEvent) {
    for (const action of [...this.#pressed]) {
      this.#emit({ action, phase: "release", source: "system", originalEvent });
    }
    this.clear();
  }

  #hasKeyboardAction(action) {
    return [...this.#activeKeyboardCodes.values()].includes(action);
  }

  #hasPointerAction(action) {
    return [...this.#activePointers.values()].includes(action);
  }

  #emit(event) {
    for (const listener of [...this.#listeners]) {
      listener(event);
    }
  }

  #usesNativeKeyboardActivation(target, action) {
    const nativeTarget = this.#getNativeKeyboardTarget(target);
    if (!nativeTarget || action === INPUT_ACTIONS.PAUSE) return false;

    const tagName = String(nativeTarget.tagName ?? "").toLowerCase();
    const editable = ["input", "select", "textarea"].includes(tagName)
      || nativeTarget.isContentEditable === true
      || nativeTarget.getAttribute?.("contenteditable") === "true";
    if (editable) return true;

    return action === INPUT_ACTIONS.CONFIRM
      || action === INPUT_ACTIONS.INTERACT
      || action === INPUT_ACTIONS.ATTACK;
  }

  #getNativeKeyboardTarget(target) {
    return target?.closest?.(NATIVE_KEYBOARD_TARGET_SELECTOR) ?? null;
  }
}

export default InputManager;

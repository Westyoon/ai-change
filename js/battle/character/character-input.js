import { INPUT_ACTIONS } from "../../core/input-manager.js";

function normalize(vector = {}) {
  const x = Number.isFinite(vector.x) ? vector.x : 0;
  const y = Number.isFinite(vector.y) ? vector.y : 0;
  const length = Math.hypot(x, y);
  if (length > 1) return { x: x / length, y: y / length };
  return { x, y };
}

/** Normalizes keyboard and touch controls into movement and attack commands. */
export class CharacterInput {
  #unsubscribe = null;
  #attackQueue = [];
  #heldAttackSources = new Set();
  #joystickVector = { x: 0, y: 0 };
  #buttonCleanups = new Set();

  constructor({ inputManager = null } = {}) {
    this.inputManager = inputManager;
  }

  start() {
    if (!this.#unsubscribe && this.inputManager?.onAction) {
      this.#unsubscribe = this.inputManager.onAction((event) => this.#handleAction(event));
    }
    return this;
  }

  getMovementVector() {
    const keyboard = this.inputManager?.getMovementVector?.() ?? { x: 0, y: 0 };
    return normalize({
      x: (Number.isFinite(keyboard.x) ? keyboard.x : 0) + this.#joystickVector.x,
      y: (Number.isFinite(keyboard.y) ? keyboard.y : 0) + this.#joystickVector.y,
    });
  }

  setJoystickVector(vector) {
    this.#joystickVector = normalize(vector);
    return { ...this.#joystickVector };
  }

  queueAttack(source = "programmatic") {
    this.#attackQueue.push(String(source));
  }

  consumeAttack() {
    const source = this.#attackQueue.shift();
    return source === undefined ? null : Object.freeze({ source });
  }

  /**
   * Pointer input is handled by InputManager through data-action=ATTACK.
   * A detail=0 click is keyboard/assistive activation and needs an explicit
   * command because native buttons are intentionally ignored by InputManager.
   */
  attachAttackButton(button) {
    if (!button?.addEventListener) return () => false;
    button.dataset.action = INPUT_ACTIONS.ATTACK;
    const handleClick = (event) => {
      if (event.detail === 0) this.queueAttack("accessible-button");
    };
    button.addEventListener("click", handleClick);
    const cleanup = () => {
      button.removeEventListener("click", handleClick);
      return this.#buttonCleanups.delete(cleanup);
    };
    this.#buttonCleanups.add(cleanup);
    return cleanup;
  }

  clearCommands() {
    this.#attackQueue.length = 0;
    this.#heldAttackSources.clear();
    this.#joystickVector = { x: 0, y: 0 };
  }

  clear() {
    this.clearCommands();
  }

  destroy() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    for (const cleanup of [...this.#buttonCleanups]) cleanup();
    this.#buttonCleanups.clear();
    this.clearCommands();
  }

  #handleAction(event = {}) {
    const mobileAttack = event.action === INPUT_ACTIONS.ATTACK;
    const keyboardSpace =
      event.action === INPUT_ACTIONS.CONFIRM &&
      event.source === "keyboard" &&
      event.originalEvent?.code === "Space";
    if (!mobileAttack && !keyboardSpace) return;
    const heldKey = mobileAttack ? "attack-action" : "keyboard-space";
    if (event.phase === "release") {
      this.#heldAttackSources.delete(heldKey);
      return;
    }
    if (event.phase !== "press" || this.#heldAttackSources.has(heldKey)) return;
    this.#heldAttackSources.add(heldKey);
    this.queueAttack(mobileAttack ? event.source ?? "attack-action" : "keyboard");
  }
}

export default CharacterInput;

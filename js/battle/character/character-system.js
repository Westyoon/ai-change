import { Character } from "./character.js";
import { CharacterController } from "./character-controller.js";
import { CharacterInput } from "./character-input.js";

/**
 * Reusable field/battle facade. Content modules provide the world geometry and
 * resolved damage; this system owns only character state and input plumbing.
 */
export class CharacterSystem {
  #started = false;
  #destroyed = false;

  constructor({ events = null, inputManager = null, character = {}, world = {}, input = null } = {}) {
    this.events = events;
    this.ownsInput = input == null;
    this.input = input ?? new CharacterInput({ inputManager });
    this.character = character instanceof Character
      ? character
      : new Character({ ...character, events });
    this.controller = new CharacterController({
      character: this.character,
      input: this.input,
      events,
      world,
    });
  }

  start() {
    if (this.#destroyed) throw new Error("Destroyed CharacterSystem cannot be started.");
    if (!this.#started) {
      this.input.start?.();
      this.#started = true;
    }
    return this;
  }

  update(deltaMs) {
    if (this.#destroyed) return this.character.snapshot();
    return this.controller.update(deltaMs);
  }

  setWorld(world) {
    this.controller.setWorld(world);
    return this;
  }

  setJoystickVector(vector) {
    return this.input.setJoystickVector?.(vector) ?? { x: 0, y: 0 };
  }

  queueAttack(source = "programmatic") {
    this.input.queueAttack?.(source);
  }

  setControlLocked(locked, reason = "character-control") {
    const result = this.character.setControlLocked(locked, reason);
    this.input.clearCommands?.();
    return result;
  }

  setAccountStats(stats) {
    return this.character.setAccountStats(stats);
  }

  setAppearance(appearance) {
    return this.character.setAppearance(appearance);
  }

  applyResolvedDamage(amount, metadata) {
    return this.character.applyResolvedDamage(amount, metadata);
  }

  getSnapshot() {
    return this.character.snapshot();
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#started = false;
    this.controller.destroy();
    if (this.ownsInput) this.input.destroy?.();
  }
}

export function createCharacterSystem(options) {
  return new CharacterSystem(options);
}

export default CharacterSystem;

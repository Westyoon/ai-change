import { rectsOverlap } from "../../map/collision.js";
import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_EVENTS,
} from "./constants.js";

function normalizeRect(rect = {}) {
  return Object.freeze({
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width: Math.max(0, Number.isFinite(rect.width) ? rect.width : 0),
    height: Math.max(0, Number.isFinite(rect.height) ? rect.height : 0),
  });
}

function normalizeTrigger(trigger, index) {
  const id = typeof trigger?.id === "string" && trigger.id ? trigger.id : `trigger-${index + 1}`;
  return Object.freeze({
    id,
    kind: typeof trigger?.kind === "string" ? trigger.kind : "generic",
    bounds: normalizeRect(trigger?.bounds ?? trigger),
    metadata: trigger?.metadata ?? null,
  });
}

export class CharacterController {
  #contacts = new Set();

  constructor({ character, input = null, events = null, world = {} } = {}) {
    if (!character?.updateMovement || !character?.attack) {
      throw new Error("CharacterController requires a Character instance.");
    }
    this.character = character;
    this.input = input;
    this.events = events;
    this.setWorld(world);
  }

  setWorld({ bounds = null, colliders = [], triggers = [] } = {}) {
    for (const id of this.#contacts) {
      const trigger = this.triggers?.find((candidate) => candidate.id === id);
      if (trigger) this.#emitContact(trigger, CHARACTER_CONTACT_PHASES.EXIT);
    }
    this.bounds = bounds ? normalizeRect(bounds) : null;
    this.colliders = colliders.map((collider) => normalizeRect(collider?.bounds ?? collider));
    this.triggers = triggers.map(normalizeTrigger);
    this.#contacts.clear();
    return this;
  }

  update(deltaMs) {
    const vector = this.input?.getMovementVector?.() ?? { x: 0, y: 0 };
    this.character.updateMovement(vector, deltaMs, {
      bounds: this.bounds,
      colliders: this.colliders,
    });

    const attack = this.input?.consumeAttack?.();
    if (attack) {
      this.character.attack({ source: attack.source });
    }
    this.#updateContacts();
    return this.character.snapshot();
  }

  destroy() {
    for (const id of [...this.#contacts]) {
      const trigger = this.triggers.find((candidate) => candidate.id === id);
      if (trigger) this.#emitContact(trigger, CHARACTER_CONTACT_PHASES.EXIT);
    }
    this.#contacts.clear();
    this.input = null;
  }

  #updateContacts() {
    const nextContacts = new Set();
    for (const trigger of this.triggers) {
      if (!rectsOverlap(this.character.bounds, trigger.bounds)) continue;
      nextContacts.add(trigger.id);
      this.#emitContact(
        trigger,
        this.#contacts.has(trigger.id)
          ? CHARACTER_CONTACT_PHASES.STAY
          : CHARACTER_CONTACT_PHASES.ENTER,
      );
    }
    for (const id of this.#contacts) {
      if (nextContacts.has(id)) continue;
      const trigger = this.triggers.find((candidate) => candidate.id === id);
      if (trigger) this.#emitContact(trigger, CHARACTER_CONTACT_PHASES.EXIT);
    }
    this.#contacts = nextContacts;
  }

  #emitContact(trigger, phase) {
    this.events?.emit?.(
      CHARACTER_EVENTS.CONTACT,
      Object.freeze({
        characterId: this.character.id,
        phase,
        triggerId: trigger.id,
        kind: trigger.kind,
        metadata: trigger.metadata,
      }),
    );
  }
}

export default CharacterController;

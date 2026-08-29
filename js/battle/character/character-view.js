import {
  CHARACTER_DIRECTIONS,
  CHARACTER_DIRECTION_VALUES,
  CHARACTER_STATES,
} from "./constants.js";

const STATE_LABELS = Object.freeze({
  [CHARACTER_STATES.IDLE]: "대기",
  [CHARACTER_STATES.MOVING]: "이동",
  [CHARACTER_STATES.ATTACKING]: "공격 명령",
  [CHARACTER_STATES.HIT]: "피격",
  [CHARACTER_STATES.DEAD]: "사망",
  [CHARACTER_STATES.CONTROL_LOCKED]: "조작 제한",
});

const DIRECTION_LABELS = Object.freeze({
  [CHARACTER_DIRECTIONS.UP]: "위",
  [CHARACTER_DIRECTIONS.DOWN]: "아래",
  [CHARACTER_DIRECTIONS.LEFT]: "왼쪽",
  [CHARACTER_DIRECTIONS.RIGHT]: "오른쪽",
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function percent(value, total) {
  return `${(finite(value) / Math.max(1, finite(total, 1))) * 100}%`;
}

function safeDirection(direction) {
  return CHARACTER_DIRECTION_VALUES.includes(direction) ? direction : CHARACTER_DIRECTIONS.DOWN;
}

function actorState(snapshot = {}) {
  if (snapshot.dead || snapshot.currentHealth === 0) return CHARACTER_STATES.DEAD;
  if (snapshot.state) return snapshot.state;
  if (snapshot.attacking) return CHARACTER_STATES.ATTACKING;
  return snapshot.moving ? CHARACTER_STATES.MOVING : CHARACTER_STATES.IDLE;
}

function spriteUrl(appearance, state, direction) {
  const motion = state === CHARACTER_STATES.MOVING ? "walk" : "idle";
  return appearance?.sprites?.[motion]?.[direction] ?? null;
}

function applyAppearance(element, sprite, appearance = {}, state, direction) {
  const label = element.querySelector(".character-actor__name");
  if (label) label.textContent = String(appearance.label ?? appearance.id ?? "PLAYER");
  if (typeof appearance.color === "string") {
    element.style.setProperty("--character-color", appearance.color);
  }
  if (typeof appearance.accentColor === "string") {
    element.style.setProperty("--character-accent", appearance.accentColor);
  }
  const url = spriteUrl(appearance, state, direction);
  if (url) {
    sprite.style.backgroundImage = `url(${JSON.stringify(String(url))})`;
    sprite.dataset.hasSprite = "true";
  } else {
    sprite.style.removeProperty("background-image");
    delete sprite.dataset.hasSprite;
  }
}

function updateActor(element, snapshot, worldSize) {
  const direction = safeDirection(snapshot.direction);
  const state = actorState(snapshot);
  const width = Math.max(1, finite(snapshot.width, 32));
  const height = Math.max(1, finite(snapshot.height, 40));
  element.style.left = percent(snapshot.x, worldSize.width);
  element.style.top = percent(snapshot.y, worldSize.height);
  element.style.width = percent(width, worldSize.width);
  element.style.height = percent(height, worldSize.height);
  element.style.zIndex = String(1000 + Math.round(finite(snapshot.footY, finite(snapshot.y) + height)));
  element.dataset.direction = direction;
  element.dataset.state = state;
  element.dataset.motion = state === CHARACTER_STATES.MOVING ? "walk" : "idle";
  const sprite = element.querySelector(".character-actor__sprite");
  if (sprite) applyAppearance(element, sprite, snapshot.appearance, state, direction);
  const remoteHealth = element.querySelector(".character-actor__remote-health");
  if (remoteHealth) {
    const maxHealth = Math.max(1, finite(snapshot.maxHealth, 1));
    const currentHealth = Math.max(0, Math.min(maxHealth, finite(snapshot.currentHealth, maxHealth)));
    remoteHealth.firstElementChild.style.width = `${(currentHealth / maxHealth) * 100}%`;
    element.dataset.health = `${currentHealth}/${maxHealth}`;
  }
  return { direction, state };
}

export function createCharacterActorElement({ document: documentRef = globalThis.document, local = false } = {}) {
  const element = documentRef.createElement("div");
  element.className = `character-actor ${local ? "character-actor--local" : "character-actor--remote"}`;
  element.setAttribute("role", "img");
  const name = documentRef.createElement("span");
  name.className = "character-actor__name";
  const sprite = documentRef.createElement("span");
  sprite.className = "character-actor__sprite";
  sprite.setAttribute("aria-hidden", "true");
  element.append(name, sprite);
  if (!local) {
    const health = documentRef.createElement("span");
    health.className = "character-actor__remote-health";
    health.setAttribute("aria-hidden", "true");
    const fill = documentRef.createElement("span");
    health.append(fill);
    element.append(health);
  }
  return element;
}

export class CharacterView {
  #lastAriaLabel = null;

  constructor({ element, worldSize, healthTrack = null, healthFill = null, healthText = null, stateText = null } = {}) {
    if (!element) throw new Error("CharacterView requires an actor element.");
    this.element = element;
    this.worldSize = {
      width: Math.max(1, finite(worldSize?.width, 1)),
      height: Math.max(1, finite(worldSize?.height, 1)),
    };
    this.healthTrack = healthTrack;
    this.healthFill = healthFill;
    this.healthText = healthText;
    this.stateText = stateText;
  }

  render(snapshot) {
    const { direction, state } = updateActor(this.element, snapshot, this.worldSize);
    const health = Math.max(0, finite(snapshot.currentHealth));
    const maxHealth = Math.max(1, finite(snapshot.maxHealth, 1));
    const ratio = Math.max(0, Math.min(1, health / maxHealth));
    if (this.healthTrack) {
      this.healthTrack.setAttribute("aria-valuemax", String(maxHealth));
      this.healthTrack.setAttribute("aria-valuenow", String(health));
      this.healthTrack.dataset.low = String(ratio <= 0.25);
    }
    if (this.healthFill) this.healthFill.style.width = `${ratio * 100}%`;
    if (this.healthText) this.healthText.textContent = `${health} / ${maxHealth}`;
    if (this.stateText) {
      this.stateText.textContent = `${STATE_LABELS[state] ?? state} · ${DIRECTION_LABELS[direction]}`;
    }
    const ariaLabel = `내 캐릭터, ${DIRECTION_LABELS[direction]} 방향, ${STATE_LABELS[state] ?? state}`;
    if (ariaLabel !== this.#lastAriaLabel) {
      this.element.setAttribute("aria-label", ariaLabel);
      this.#lastAriaLabel = ariaLabel;
    }
  }
}

export class RemoteCharacterView {
  #actors = new Map();

  constructor({ root, worldSize, document: documentRef = globalThis.document } = {}) {
    if (!root) throw new Error("RemoteCharacterView requires a root element.");
    this.root = root;
    this.worldSize = {
      width: Math.max(1, finite(worldSize?.width, 1)),
      height: Math.max(1, finite(worldSize?.height, 1)),
    };
    this.document = documentRef;
  }

  update(remoteCharacters = []) {
    const active = new Set();
    for (const snapshot of remoteCharacters) {
      if (typeof snapshot?.id !== "string" || snapshot.id.length === 0) continue;
      active.add(snapshot.id);
      let actor = this.#actors.get(snapshot.id);
      if (!actor) {
        actor = createCharacterActorElement({ document: this.document, local: false });
        actor.dataset.characterId = snapshot.id;
        this.root.append(actor);
        this.#actors.set(snapshot.id, actor);
      }
      const normalized = {
        ...snapshot,
        width: finite(snapshot.width, 32),
        height: finite(snapshot.height, 40),
        footY: finite(snapshot.footY, finite(snapshot.y) + finite(snapshot.height, 40)),
      };
      const { direction, state } = updateActor(actor, normalized, this.worldSize);
      actor.setAttribute(
        "aria-label",
        `${snapshot.appearance?.label ?? snapshot.id}, ${DIRECTION_LABELS[direction]} 방향, ${STATE_LABELS[state] ?? state}, 체력 ${actor.dataset.health ?? "미수신"}`,
      );
    }
    for (const [id, actor] of this.#actors) {
      if (active.has(id)) continue;
      actor.remove();
      this.#actors.delete(id);
    }
  }

  destroy() {
    for (const actor of this.#actors.values()) actor.remove();
    this.#actors.clear();
  }
}

export { DIRECTION_LABELS, STATE_LABELS };

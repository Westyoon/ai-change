import { resolveContinuousMovement } from "../../map/collision.js";
import {
  CHARACTER_DIRECTIONS,
  CHARACTER_DIRECTION_VALUES,
  CHARACTER_EVENTS,
  CHARACTER_STATES,
} from "./constants.js";

const ACCOUNT_STAT_KEYS = Object.freeze(["attack", "defense", "health"]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback, label) {
  const normalized = finite(value, fallback);
  if (normalized <= 0) {
    throw new RangeError(`${label} must be greater than zero.`);
  }
  return normalized;
}

function freezeObject(value = {}) {
  return Object.freeze({ ...value });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeAppearance(appearance = {}) {
  try {
    const serialized = JSON.stringify(appearance ?? {});
    const parsed = serialized === undefined ? {} : JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Character appearance must be an object.");
    }
    return deepFreeze(parsed);
  } catch (error) {
    if (error instanceof TypeError && error.message === "Character appearance must be an object.") {
      throw error;
    }
    throw new TypeError("Character appearance must be JSON-serializable.", { cause: error });
  }
}

function normalizeVector(vector = {}) {
  const x = finite(vector.x);
  const y = finite(vector.y);
  const length = Math.hypot(x, y);
  if (length > 1) {
    return { x: x / length, y: y / length };
  }
  return { x, y };
}

function normalizeStats(stats = {}) {
  const normalized = {};
  for (const key of ACCOUNT_STAT_KEYS) {
    const value = key === "health" && !Number.isFinite(stats?.health) ? stats?.hp : stats?.[key];
    normalized[key] = Number.isFinite(value) ? value : null;
  }
  return Object.freeze(normalized);
}

function normalizeDirection(direction) {
  return CHARACTER_DIRECTION_VALUES.includes(direction) ? direction : CHARACTER_DIRECTIONS.DOWN;
}

export class Character {
  #events;
  #attackSequence = 0;
  #deathEmitted = false;
  #controlLocks = new Set();

  constructor({
    id = "local-player",
    x = 0,
    y = 0,
    width = 32,
    height = 40,
    speed = 180,
    direction = CHARACTER_DIRECTIONS.DOWN,
    maxHealth = 1,
    currentHealth = maxHealth,
    stats = {},
    appearance = {},
    events = null,
  } = {}) {
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError("Character id must be a non-empty string.");
    }
    this.id = id;
    this.x = finite(x);
    this.y = finite(y);
    this.width = positive(width, 32, "Character width");
    this.height = positive(height, 40, "Character height");
    this.speed = positive(speed, 180, "Character speed");
    this.direction = normalizeDirection(direction);
    this.maxHealth = positive(maxHealth, 1, "Character maxHealth");
    this.currentHealth = Math.max(0, Math.min(this.maxHealth, finite(currentHealth, this.maxHealth)));
    this.stats = normalizeStats(stats);
    this.appearance = normalizeAppearance(appearance);
    this.moving = false;
    this.controlLocked = false;
    this.controlLockReason = null;
    this.dead = this.currentHealth === 0;
    this.state = this.dead ? CHARACTER_STATES.DEAD : CHARACTER_STATES.IDLE;
    this.#deathEmitted = this.dead;
    this.#events = events;
  }

  get bounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  get center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  get footY() {
    return this.y + this.height;
  }

  setPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("Character position must be finite.");
    }
    this.x = x;
    this.y = y;
    return this.snapshot();
  }

  setAppearance(appearance = {}) {
    this.appearance = normalizeAppearance(appearance);
    return this.snapshot();
  }

  /** Stores account-owned values without applying any battle formula. */
  setAccountStats(stats = {}) {
    this.stats = normalizeStats(stats);
    const snapshot = this.snapshot();
    this.#emit(CHARACTER_EVENTS.STATS_CHANGE, { characterId: this.id, stats: snapshot.stats });
    return snapshot.stats;
  }

  setControlLocked(locked, reason = "character-control") {
    const lockReason = reason == null ? "character-control" : String(reason);
    const previousLocked = this.controlLocked;
    const previousReasons = [...this.#controlLocks];
    if (locked) this.#controlLocks.add(lockReason);
    else this.#controlLocks.delete(lockReason);
    this.controlLocked = this.#controlLocks.size > 0;
    this.controlLockReason = this.#controlLocks.values().next().value ?? null;
    const changed =
      previousLocked !== this.controlLocked ||
      previousReasons.length !== this.#controlLocks.size ||
      previousReasons.some((value) => !this.#controlLocks.has(value));
    if (this.controlLocked) {
      this.moving = false;
    }
    this.#setState(this.#baseState());
    if (changed) {
      this.#emit(CHARACTER_EVENTS.CONTROL_LOCK_CHANGE, {
        characterId: this.id,
        locked: this.controlLocked,
        reason: lockReason,
        reasons: Object.freeze([...this.#controlLocks]),
      });
    }
    return this.controlLocked;
  }

  updateMovement(vector, deltaMs, { bounds = null, colliders = [] } = {}) {
    const requested = this.controlLocked || this.dead ? { x: 0, y: 0 } : normalizeVector(vector);
    this.#updateDirection(requested);

    const seconds = Math.max(0, Math.min(100, finite(deltaMs))) / 1000;
    const previous = { x: this.x, y: this.y };
    const next = resolveContinuousMovement({
      position: previous,
      size: this,
      delta: { x: requested.x * this.speed * seconds, y: requested.y * this.speed * seconds },
      colliders,
      bounds,
    });
    this.x = next.x;
    this.y = next.y;
    this.moving = this.x !== previous.x || this.y !== previous.y;
    this.#setState(this.#baseState());

    if (this.moving) {
      this.#emit(CHARACTER_EVENTS.MOVE, {
        characterId: this.id,
        from: freezeObject(previous),
        to: freezeObject({ x: this.x, y: this.y }),
        direction: this.direction,
      });
    }
    return this.snapshot();
  }

  /**
   * Emits an attack command only. Targeting, range, cooldown and damage are
   * deliberately left to the battle implementation that receives the event.
   */
  attack({ source = "programmatic", metadata = null } = {}) {
    if (this.controlLocked || this.dead) {
      return null;
    }
    const sequence = ++this.#attackSequence;
    this.#setState(CHARACTER_STATES.ATTACKING);
    const command = Object.freeze({
      characterId: this.id,
      attackSequence: sequence,
      facingDirection: this.direction,
      stats: this.stats,
      source,
      metadata,
    });
    this.#emit(CHARACTER_EVENTS.ATTACK, command);
    this.#setState(this.#baseState());
    return command;
  }

  /** Applies damage already resolved by a boss, trap or authoritative server. */
  applyResolvedDamage(amount, { sourceId = null, metadata = null } = {}) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError("Resolved damage must be a finite non-negative number.");
    }
    if (this.dead || amount === 0) {
      return this.snapshot();
    }

    const previousHealth = this.currentHealth;
    this.#setState(CHARACTER_STATES.HIT);
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.dead = this.currentHealth === 0;
    this.moving = this.dead ? false : this.moving;

    const detail = Object.freeze({
      characterId: this.id,
      amount,
      previousHealth,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      sourceId,
      metadata,
    });
    this.#emit(CHARACTER_EVENTS.DAMAGE, detail);
    this.#emit(CHARACTER_EVENTS.HEALTH_CHANGE, detail);

    if (this.dead) {
      this.#setState(CHARACTER_STATES.DEAD);
      if (!this.#deathEmitted) {
        this.#deathEmitted = true;
        this.#emit(CHARACTER_EVENTS.DEATH, detail);
      }
    } else {
      this.#setState(this.#baseState());
    }
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      id: this.id,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      footY: this.footY,
      direction: this.direction,
      state: this.state,
      moving: this.moving,
      attacking: this.state === CHARACTER_STATES.ATTACKING,
      attackSequence: this.#attackSequence,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      stats: this.stats,
      appearance: this.appearance,
      dead: this.dead,
      controlLocked: this.controlLocked,
      controlLockReason: this.controlLockReason,
      controlLockReasons: Object.freeze([...this.#controlLocks]),
    });
  }

  #baseState() {
    if (this.dead) return CHARACTER_STATES.DEAD;
    if (this.controlLocked) return CHARACTER_STATES.CONTROL_LOCKED;
    return this.moving ? CHARACTER_STATES.MOVING : CHARACTER_STATES.IDLE;
  }

  #updateDirection(vector) {
    if (Math.abs(vector.x) > Math.abs(vector.y)) {
      this.direction = vector.x < 0 ? CHARACTER_DIRECTIONS.LEFT : CHARACTER_DIRECTIONS.RIGHT;
    } else if (vector.y !== 0) {
      this.direction = vector.y < 0 ? CHARACTER_DIRECTIONS.UP : CHARACTER_DIRECTIONS.DOWN;
    }
  }

  #setState(state) {
    if (this.state === state) return;
    const previousState = this.state;
    this.state = state;
    this.#emit(CHARACTER_EVENTS.STATE_CHANGE, {
      characterId: this.id,
      previousState,
      state,
      direction: this.direction,
    });
  }

  #emit(type, detail) {
    this.#events?.emit?.(type, detail);
  }
}

export default Character;

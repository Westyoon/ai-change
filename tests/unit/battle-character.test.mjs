import assert from "node:assert/strict";
import test from "node:test";
import { Character } from "../../js/battle/character/character.js";
import { CharacterController } from "../../js/battle/character/character-controller.js";
import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_DIRECTIONS,
  CHARACTER_EVENTS,
  CHARACTER_STATES,
} from "../../js/battle/character/constants.js";
import { EventBus } from "../../js/core/event-bus.js";

function assertClose(actual, expected, message = "values should be close") {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

function stationaryInput() {
  return {
    getMovementVector: () => ({ x: 0, y: 0 }),
    consumeAttack: () => null,
  };
}

test("character movement normalizes diagonals, selects one of four directions, and returns to idle", () => {
  const character = new Character({
    x: 5,
    y: 5,
    width: 10,
    height: 10,
    speed: 100,
  });

  let snapshot = character.updateMovement({ x: 1, y: 1 }, 100);
  const diagonalStep = 10 * Math.SQRT1_2;
  assertClose(snapshot.x, 5 + diagonalStep, "diagonal x movement");
  assertClose(snapshot.y, 5 + diagonalStep, "diagonal y movement");
  assert.equal(snapshot.direction, CHARACTER_DIRECTIONS.DOWN);
  assert.equal(snapshot.state, CHARACTER_STATES.MOVING);
  assert.equal(snapshot.moving, true);

  snapshot = character.updateMovement({ x: 0, y: 0 }, 100);
  assertClose(snapshot.x, 5 + diagonalStep);
  assertClose(snapshot.y, 5 + diagonalStep);
  assert.equal(snapshot.direction, CHARACTER_DIRECTIONS.DOWN);
  assert.equal(snapshot.state, CHARACTER_STATES.IDLE);
  assert.equal(snapshot.moving, false);

  snapshot = character.updateMovement({ x: -1, y: 0 }, 100);
  assert.equal(snapshot.direction, CHARACTER_DIRECTIONS.LEFT);
  snapshot = character.updateMovement({ x: 0, y: 0 }, 100);
  assert.equal(snapshot.direction, CHARACTER_DIRECTIONS.LEFT, "idle keeps the last movement direction");
});

test("movement remains inside world bounds and cannot tunnel through a thin wall", () => {
  const bounded = new Character({
    x: 85,
    y: 85,
    width: 10,
    height: 10,
    speed: 200,
  });
  const boundedSnapshot = bounded.updateMovement({ x: 1, y: 1 }, 100, {
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  });
  assert.deepEqual(
    { x: boundedSnapshot.x, y: boundedSnapshot.y },
    { x: 90, y: 90 },
  );

  const runner = new Character({
    x: 0,
    y: 10,
    width: 10,
    height: 10,
    speed: 1000,
  });
  const stopped = runner.updateMovement({ x: 1, y: 0 }, 100, {
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    colliders: [{ x: 50, y: 0, width: 1, height: 100 }],
  });
  assert.equal(stopped.x, 40, "the body stops flush with a one-pixel wall");
  assert.equal(stopped.y, 10);
});

test("axis-separated collision resolution lets a character slide along a wall", () => {
  const character = new Character({
    x: 40,
    y: 10,
    width: 10,
    height: 10,
    speed: 100,
  });
  const snapshot = character.updateMovement({ x: 1, y: 1 }, 100, {
    bounds: { x: 0, y: 0, width: 200, height: 200 },
    colliders: [{ x: 50, y: 0, width: 2, height: 100 }],
  });

  assert.equal(snapshot.x, 40, "blocked axis does not enter the wall");
  assertClose(snapshot.y, 10 + 10 * Math.SQRT1_2, "unblocked axis keeps moving");
  assert.equal(snapshot.state, CHARACTER_STATES.MOVING);
});

test("control lock and death both suppress movement and attack commands", () => {
  const character = new Character({
    x: 10,
    y: 20,
    width: 10,
    height: 10,
    speed: 100,
    maxHealth: 5,
  });

  character.setControlLocked(true, "dialogue");
  let snapshot = character.updateMovement({ x: 1, y: 0 }, 100);
  assert.equal(snapshot.x, 10);
  assert.equal(snapshot.y, 20);
  assert.equal(snapshot.state, CHARACTER_STATES.CONTROL_LOCKED);
  assert.equal(snapshot.controlLockReason, "dialogue");
  assert.equal(character.attack(), null);

  character.setControlLocked(true, "pause");
  character.setControlLocked(false, "dialogue");
  assert.equal(character.snapshot().controlLocked, true, "one owner cannot release another lock");
  assert.deepEqual(character.snapshot().controlLockReasons, ["pause"]);
  character.setControlLocked(false, "pause");
  snapshot = character.updateMovement({ x: 1, y: 0 }, 100);
  assert.equal(snapshot.x, 20);
  assert.equal(snapshot.state, CHARACTER_STATES.MOVING);

  snapshot = character.applyResolvedDamage(5, { sourceId: "resolved-hit" });
  assert.equal(snapshot.dead, true);
  assert.equal(snapshot.state, CHARACTER_STATES.DEAD);
  const deadPosition = { x: snapshot.x, y: snapshot.y };
  snapshot = character.updateMovement({ x: -1, y: 1 }, 100);
  assert.deepEqual({ x: snapshot.x, y: snapshot.y }, deadPosition);
  assert.equal(snapshot.moving, false);
  assert.equal(character.attack(), null);
});

test("attack emits a transport-safe command without inventing targeting or damage rules", () => {
  const events = new EventBus();
  const attacks = [];
  const attackSnapshots = [];
  let character;
  events.on(CHARACTER_EVENTS.ATTACK, (detail) => {
    attacks.push(detail);
    attackSnapshots.push(character.snapshot());
  });
  character = new Character({
    id: "player-7",
    x: 12,
    y: 30,
    width: 20,
    height: 40,
    direction: CHARACTER_DIRECTIONS.RIGHT,
    maxHealth: 30,
    currentHealth: 17,
    stats: { attack: 8, defense: 3, health: 21 },
    events,
  });

  const command = character.attack({
    source: "keyboard",
    metadata: { encounterId: "preview" },
  });

  assert.equal(attacks.length, 1);
  assert.strictEqual(attacks[0], command);
  assert.deepEqual(command, {
    characterId: "player-7",
    attackSequence: 1,
    facingDirection: CHARACTER_DIRECTIONS.RIGHT,
    stats: { attack: 8, defense: 3, health: 21 },
    source: "keyboard",
    metadata: { encounterId: "preview" },
  });
  for (const unresolvedRule of ["damage", "range", "targetId", "cooldown", "attackRate", "direction", "origin"]) {
    assert.equal(unresolvedRule in command, false, `${unresolvedRule} remains battle-owned`);
  }
  assert.equal(character.currentHealth, 17, "issuing an attack does not mutate health");
  assert.equal(attackSnapshots[0].attacking, true, "event-time snapshot can be sent to remote views");
  assert.equal(character.snapshot().attacking, false);
  assert.equal(character.state, CHARACTER_STATES.IDLE);
  assert.doesNotThrow(() => JSON.stringify(command));
});

test("resolved hits stack immediately, clamp health at zero, and emit death once", () => {
  const events = new EventBus();
  const damages = [];
  const deaths = [];
  events.on(CHARACTER_EVENTS.DAMAGE, (detail) => damages.push(detail));
  events.on(CHARACTER_EVENTS.DEATH, (detail) => deaths.push(detail));
  const character = new Character({ maxHealth: 10, events });

  character.applyResolvedDamage(3, { sourceId: "hit-1" });
  character.applyResolvedDamage(3, { sourceId: "hit-2" });
  assert.equal(character.currentHealth, 4, "there is no character-owned invulnerability window");
  assert.equal(damages.length, 2);

  character.applyResolvedDamage(99, { sourceId: "finisher" });
  character.applyResolvedDamage(1, { sourceId: "late-hit" });
  assert.equal(character.currentHealth, 0);
  assert.equal(character.dead, true);
  assert.equal(damages.length, 3, "hits after death do not create another damage event");
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].previousHealth, 4);
  assert.equal(deaths[0].currentHealth, 0);
});

test("account stats are stored as integration data without changing health by formula", () => {
  const character = new Character({
    maxHealth: 40,
    currentHealth: 24,
    stats: { attack: 1, defense: 2, health: 3 },
  });

  const stats = character.setAccountStats({
    attack: 13,
    defense: 21,
    hp: 34,
    rank: 999,
  });
  assert.deepEqual(stats, { attack: 13, defense: 21, health: 34 });
  assert.equal(character.maxHealth, 40);
  assert.equal(character.currentHealth, 24);
  assert.deepEqual(character.snapshot().stats, stats);
});

test("trigger contacts emit enter, stay, and exit phases with JSON-safe payloads", () => {
  const events = new EventBus();
  const contacts = [];
  events.on(CHARACTER_EVENTS.CONTACT, (detail) => contacts.push(detail));
  const character = new Character({
    id: "contact-player",
    x: 10,
    y: 10,
    width: 10,
    height: 10,
  });
  const controller = new CharacterController({
    character,
    input: stationaryInput(),
    events,
    world: {
      triggers: [{
        id: "boss-gate",
        kind: "battle-entrance",
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        metadata: { battleId: "pending-battle" },
      }],
    },
  });

  controller.update(0);
  controller.update(0);
  character.setPosition(100, 100);
  controller.update(0);
  character.setPosition(10, 10);
  controller.update(0);
  controller.setWorld({ triggers: [] });
  controller.destroy();

  assert.deepEqual(contacts.map((contact) => contact.phase), [
    CHARACTER_CONTACT_PHASES.ENTER,
    CHARACTER_CONTACT_PHASES.STAY,
    CHARACTER_CONTACT_PHASES.EXIT,
    CHARACTER_CONTACT_PHASES.ENTER,
    CHARACTER_CONTACT_PHASES.EXIT,
  ]);
  for (const contact of contacts) {
    assert.equal(contact.characterId, "contact-player");
    assert.equal(contact.triggerId, "boss-gate");
    assert.equal(contact.kind, "battle-entrance");
    assert.deepEqual(contact.metadata, { battleId: "pending-battle" });
    assert.doesNotThrow(() => JSON.stringify(contact));
  }
});

test("character snapshots contain only JSON-serializable presentation state", () => {
  const character = new Character({
    id: "remote-ready",
    x: 12.5,
    y: 9.25,
    maxHealth: 12,
    currentHealth: 7,
    appearance: { palette: "emerald", accessory: "ribbon" },
    stats: { attack: 2, defense: 4, health: 6 },
  });
  character.updateMovement({ x: 1, y: 0 }, 16);
  const snapshot = character.snapshot();
  const parsed = JSON.parse(JSON.stringify(snapshot));

  assert.deepEqual(parsed, snapshot);
  assert.equal(parsed.direction, CHARACTER_DIRECTIONS.RIGHT);
  assert.equal(typeof parsed.x, "number");
  assert.equal(typeof parsed.currentHealth, "number");
  assert.deepEqual(parsed.appearance, { palette: "emerald", accessory: "ribbon" });
});

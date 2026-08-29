import assert from "node:assert/strict";
import test from "node:test";
import { CharacterInput } from "../../js/battle/character/character-input.js";
import {
  DEFAULT_KEY_BINDINGS,
  InputManager,
  INPUT_ACTIONS,
} from "../../js/core/input-manager.js";

function createInputHarness() {
  const handlers = new Map();
  const target = {
    addEventListener(type, listener) {
      handlers.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (handlers.get(type) === listener) handlers.delete(type);
    },
  };
  const root = {
    addEventListener() {},
    removeEventListener() {},
  };
  const manager = new InputManager({ target, root });
  manager.start();
  return { handlers, manager };
}

function keyboardEvent(code) {
  return {
    code,
    target: { closest: () => null },
    preventDefault() {},
  };
}

test("character input normalizes Space and ATTACK while leaving Enter as confirmation", () => {
  assert.equal(DEFAULT_KEY_BINDINGS.Space, INPUT_ACTIONS.CONFIRM);
  assert.equal(DEFAULT_KEY_BINDINGS.Enter, INPUT_ACTIONS.CONFIRM);
  assert.equal(INPUT_ACTIONS.ATTACK, "ATTACK");

  const { handlers, manager } = createInputHarness();
  const input = new CharacterInput({ inputManager: manager }).start();

  handlers.get("keydown")(keyboardEvent("Space"));
  assert.deepEqual(input.consumeAttack(), { source: "keyboard" });
  handlers.get("keyup")(keyboardEvent("Space"));

  handlers.get("keydown")(keyboardEvent("Enter"));
  assert.equal(input.consumeAttack(), null, "Enter remains a UI confirm action, not an attack");
  handlers.get("keyup")(keyboardEvent("Enter"));

  manager.trigger(INPUT_ACTIONS.ATTACK, "press", "pointer");
  manager.trigger(INPUT_ACTIONS.ATTACK, "press", "second-pointer");
  assert.deepEqual(input.consumeAttack(), { source: "pointer" });
  assert.equal(input.consumeAttack(), null, "held attack sources do not repeat commands");
  manager.trigger(INPUT_ACTIONS.ATTACK, "release", "pointer");
  manager.trigger(INPUT_ACTIONS.ATTACK, "press", "pointer");
  assert.deepEqual(input.consumeAttack(), { source: "pointer" }, "release enables the next command");
  manager.trigger(INPUT_ACTIONS.ATTACK, "release", "pointer");
  assert.equal(input.consumeAttack(), null);

  input.destroy();
  manager.destroy();
});

test("keyboard and joystick movement share one normalized vector", () => {
  const manager = {
    vector: { x: 1, y: 0 },
    onAction() {
      return () => {};
    },
    getMovementVector() {
      return this.vector;
    },
  };
  const input = new CharacterInput({ inputManager: manager }).start();

  input.setJoystickVector({ x: 0, y: 1 });
  let vector = input.getMovementVector();
  assert.ok(Math.abs(vector.x - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(vector.y - Math.SQRT1_2) < 1e-9);

  manager.vector = { x: 0, y: 0 };
  assert.deepEqual(input.setJoystickVector({ x: 3, y: 4 }), { x: 0.6, y: 0.8 });
  vector = input.getMovementVector();
  assert.deepEqual(vector, { x: 0.6, y: 0.8 });

  input.destroy();
});

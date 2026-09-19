import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_EVENTS,
} from "../../js/battle/character/index.js";
import { EventBus } from "../../js/core/event-bus.js";
import { createBattleScene } from "../../js/scenes/battle-scene.js";

const battles = JSON.parse(
  await readFile(new URL("../../data/battles.json", import.meta.url), "utf8"),
);

const requiredMiniGameIds = battles[0].unlockCondition.miniGameIds;
const expectedBossIds = new Set(["data-sphinx", "stat-boss", "control-boss"]);

class FakeStyle {
  setProperty(name, value) {
    this[name] = String(value);
  }

  removeProperty(name) {
    delete this[name];
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return this.element.className.split(/\s+/u).filter(Boolean);
  }

  contains(name) {
    return this.values().includes(name);
  }
}

class FakeNode {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      if (child == null) continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  get firstElementChild() {
    return this.children.find((child) => child instanceof FakeElement) ?? null;
  }
}

class FakeTextNode extends FakeNode {
  constructor(text, ownerDocument) {
    super(ownerDocument);
    this.textContent = String(text);
  }
}

class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument) {
    super(ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.type = "";
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target ??= this;
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener.call(this, event);
    return true;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const tagName = className ? null : selector.toUpperCase();
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (
          child instanceof FakeElement
          && (className ? child.classList.contains(className) : child.tagName === tagName)
        ) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  getBoundingClientRect() {
    if (this.classList.contains("battle-field-world")) {
      return { left: 0, top: 0, width: 720, height: 420 };
    }
    return { left: 0, top: 0, width: 104, height: 104 };
  }

  get clientWidth() {
    return this.getBoundingClientRect().width;
  }

  get clientHeight() {
    return this.getBoundingClientRect().height;
  }

  setPointerCapture() {}
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.abortCleanups = new Map();
  }

  addEventListener(type, listener, options = {}) {
    if (options?.signal?.aborted) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    if (options?.signal) {
      const cleanup = () => this.removeEventListener(type, listener);
      this.abortCleanups.set(listener, { signal: options.signal, cleanup });
      options.signal.addEventListener("abort", cleanup, { once: true });
    }
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    const record = this.abortCleanups.get(listener);
    if (record) {
      record.signal.removeEventListener("abort", record.cleanup);
      this.abortCleanups.delete(listener);
    }
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeInput {
  constructor() {
    this.listeners = new Set();
    this.vector = { x: 0, y: 0 };
  }

  onAction(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getMovementVector() {
    return this.vector;
  }

  setVector(vector) {
    this.vector = vector;
  }

  listenerCount() {
    return this.listeners.size;
  }
}

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

function installEnvironment() {
  const previous = {
    Node: globalThis.Node,
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: globalThis.ResizeObserver,
    random: Math.random,
  };
  const windowRef = new FakeEventTarget();
  const documentRef = new FakeEventTarget();
  documentRef.hidden = false;
  documentRef.defaultView = windowRef;
  documentRef.createElement = (tagName) => new FakeElement(tagName, documentRef);
  documentRef.createTextNode = (text) => new FakeTextNode(text, documentRef);
  windowRef.document = documentRef;
  windowRef.ResizeObserver = undefined;

  let nextFrameId = 0;
  const frames = new Map();
  globalThis.Node = FakeNode;
  globalThis.document = documentRef;
  globalThis.window = windowRef;
  delete globalThis.ResizeObserver;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  Math.random = () => 0;

  return {
    document: documentRef,
    window: windowRef,
    scheduledFrameCount: () => frames.size,
    step(timestamp) {
      const callbacks = [...frames.values()];
      frames.clear();
      assert.ok(callbacks.length > 0, "field GameLoop should have a scheduled frame");
      for (const callback of callbacks) callback(timestamp);
    },
    restore() {
      restoreGlobal("Node", previous.Node);
      restoreGlobal("document", previous.document);
      restoreGlobal("window", previous.window);
      restoreGlobal("requestAnimationFrame", previous.requestAnimationFrame);
      restoreGlobal("cancelAnimationFrame", previous.cancelAnimationFrame);
      restoreGlobal("ResizeObserver", previous.ResizeObserver);
      Math.random = previous.random;
    },
  };
}

function createContext(documentRef, {
  completedIds = requiredMiniGameIds,
  worldState = null,
} = {}) {
  const events = new EventBus();
  const input = new FakeInput();
  const navigations = [];
  const completedMinigames = Object.fromEntries(
    requiredMiniGameIds.map((id) => [id, { completed: completedIds.includes(id) }]),
  );
  return {
    context: {
      config: { features: { battleContent: true } },
      content: {
        battles,
        minigames: requiredMiniGameIds.map((id) => ({ id, title: id })),
      },
      services: {
        account: {
          getState: () => ({
            status: "ready",
            authenticated: false,
            completedGameIds: [],
          }),
          refreshSession: async () => {},
        },
        save: { getState: () => ({ minigames: completedMinigames }) },
        events,
        input,
      },
      router: {
        navigate(sceneId, params) {
          navigations.push({ sceneId, params });
          return Promise.resolve(true);
        },
      },
      state: worldState ? { aftergameWorldState: worldState } : {},
      toastRoot: documentRef.createElement("div"),
    },
    events,
    input,
    navigations,
  };
}

async function mountEntryScene({
  params = {},
  completedIds = requiredMiniGameIds,
  worldState = null,
} = {}) {
  const environment = installEnvironment();
  const setup = createContext(environment.document, { completedIds, worldState });
  const controller = new AbortController();
  const root = environment.document.createElement("main");
  const scene = createBattleScene(setup.context);
  try {
    await scene.mount(root, params, { signal: controller.signal });
  } catch (error) {
    environment.restore();
    throw error;
  }
  return {
    ...setup,
    controller,
    environment,
    root,
    scene,
    cleanup() {
      controller.abort();
      scene.unmount();
      environment.restore();
    },
  };
}

function driveFrames(mounted, vector, count) {
  mounted.input.setVector(vector);
  if (!Number.isFinite(mounted.testTimestamp)) {
    mounted.testTimestamp = 0;
    mounted.environment.step(mounted.testTimestamp);
  }
  for (let frame = 0; frame < count; frame += 1) {
    if (mounted.environment.scheduledFrameCount() === 0) break;
    mounted.testTimestamp += 100;
    mounted.environment.step(mounted.testTimestamp);
  }
}

function driveUntilEncounter(mounted) {
  const currentX = mounted.context.state.aftergameWorldState?.position?.x ?? 0.5;
  const direction = currentX < 0.5 ? 1 : -1;
  driveFrames(mounted, { x: direction, y: 0 }, 15);
  for (let frame = 0; frame < 15; frame += 1) {
    if (mounted.root.querySelector(".battle-field-encounter")) break;
    driveFrames(mounted, { x: -direction, y: 0 }, 1);
  }
  return mounted.root.querySelector(".battle-field-encounter");
}

test("입장 필드 서쪽과 중심 광장 동쪽은 실제 이동으로 새로고침 없이 왕복한다", async () => {
  const mounted = await mountEntryScene();
  try {
    const world = mounted.root.querySelector(".aftergame-world");
    assert.equal(world.dataset.zoneId, "entry-field");
    assert.equal(mounted.root.querySelectorAll(".aftergame-world__boss-door").length, 3);
    assert.deepEqual(
      new Set(mounted.root.querySelectorAll(".aftergame-world__boss-door").map((button) => button.dataset.battleId)),
      expectedBossIds,
    );
    assert.equal(
      mounted.root.querySelectorAll("button").some((button) => button.dataset.battleId === "word-breaker"),
      false,
    );

    driveFrames(mounted, { x: -1, y: 0 }, 34);
    assert.equal(world.dataset.zoneId, "plaza");
    assert.equal(mounted.context.state.aftergameWorldState.zoneId, "plaza");
    assert.equal(mounted.navigations.length, 0, "내부 구역 이동은 router를 사용하지 않는다");

    driveFrames(mounted, { x: 1, y: 0 }, 22);
    assert.equal(world.dataset.zoneId, "entry-field");
    assert.equal(mounted.context.state.aftergameWorldState.zoneId, "entry-field");
    assert.equal(mounted.navigations.length, 0);

    driveFrames(mounted, { x: 0, y: 0 }, 2);
    assert.equal(world.dataset.zoneId, "entry-field", "복귀 직후 반대 구역으로 튕기지 않아야 한다");
  } finally {
    mounted.cleanup();
  }
});

test("중심 광장 북쪽의 세 문은 걸어서 닿은 보스맵으로 각각 한 번만 연결한다", async () => {
  const doorCenters = new Map([
    ["data-sphinx", 0.14],
    ["stat-boss", 0.5],
    ["control-boss", 0.86],
  ]);

  for (const [expectedBattleId, x] of doorCenters) {
    const position = { x, y: 0.42 };
    const mounted = await mountEntryScene({
      worldState: {
        zoneId: "plaza",
        position,
        positions: { plaza: position },
        direction: "up",
      },
    });
    try {
      assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "plaza");
      driveFrames(mounted, { x: 0, y: -1 }, 14);
      assert.deepEqual(mounted.navigations, [{
        sceneId: "battle",
        params: { battleId: expectedBattleId },
      }]);
      assert.equal(mounted.context.state.aftergameWorldState.zoneId, "plaza");
      assert.equal(mounted.context.state.aftergameWorldState.direction, "down");
      assert.ok(mounted.context.state.aftergameWorldState.position.y > 0.12);

      const savedState = mounted.context.state.aftergameWorldState;
      const returned = await mountEntryScene({ worldState: savedState });
      try {
        driveFrames(returned, { x: 0, y: 0 }, 2);
        assert.equal(returned.root.querySelector(".aftergame-world").dataset.zoneId, "plaza");
        assert.equal(returned.navigations.length, 0, "보스 복귀점에서 즉시 재입장하지 않아야 한다");
      } finally {
        returned.cleanup();
      }
    } finally {
      mounted.cleanup();
    }
  }
});

test("필드 이동 중 marker 하나만 출현하고 click/contact는 단일 랜덤 Battle route를 공유한다", async () => {
  const mounted = await mountEntryScene();
  try {
    assert.equal(mounted.root.querySelectorAll(".battle-field-encounter").length, 0);
    const marker = driveUntilEncounter(mounted);
    assert.ok(marker, "actual movement should produce a random encounter marker");
    assert.equal(mounted.root.querySelectorAll(".battle-field-encounter").length, 1);

    marker.dispatchEvent({ type: "click", detail: 1 });
    marker.dispatchEvent({ type: "click", detail: 1 });
    mounted.events.emit(CHARACTER_EVENTS.CONTACT, {
      characterId: "aftergame-field-player",
      triggerId: "field-random-encounter",
      phase: CHARACTER_CONTACT_PHASES.ENTER,
    });
    assert.deepEqual(mounted.navigations, [{
      sceneId: "battle",
      params: { battleId: "xr-egg-trials" },
    }]);
    assert.equal(Object.hasOwn(mounted.navigations[0].params, "trialId"), false);
  } finally {
    mounted.cleanup();
  }
});

test("랜덤 인카운터는 광장에서는 멈추고 입장 필드에서만 출현한다", async () => {
  const position = { x: 0.5, y: 0.62 };
  const mounted = await mountEntryScene({
    worldState: {
      zoneId: "plaza",
      position,
      positions: { plaza: position },
      direction: "left",
    },
  });
  try {
    driveFrames(mounted, { x: -1, y: 0 }, 18);
    driveFrames(mounted, { x: 1, y: 0 }, 18);
    assert.equal(mounted.root.querySelector(".battle-field-encounter"), null);
    assert.equal(mounted.navigations.length, 0);

    const fieldGate = mounted.root.querySelector(".aftergame-world__edge-gate--east");
    fieldGate.dispatchEvent({ type: "click", detail: 1 });
    assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "entry-field");
    assert.equal(mounted.navigations.length, 0);
    assert.ok(driveUntilEncounter(mounted));
  } finally {
    mounted.cleanup();
  }
});

test("모바일 조이스틱 이동도 필드 서쪽 출구를 통해 중심 광장으로 전환한다", async () => {
  const mounted = await mountEntryScene();
  try {
    const joystick = mounted.root.querySelector(".battle-field-joystick");
    const preventDefault = () => {};
    joystick.dispatchEvent({
      type: "pointerdown",
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 52,
      clientY: 52,
      preventDefault,
    });
    joystick.dispatchEvent({
      type: "pointermove",
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 0,
      clientY: 52,
      preventDefault,
    });
    driveFrames(mounted, { x: 0, y: 0 }, 34);
    assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "plaza");
    assert.equal(mounted.navigations.length, 0);

    joystick.dispatchEvent({
      type: "pointerup",
      pointerId: 1,
      pointerType: "touch",
      clientX: 0,
      clientY: 52,
      preventDefault,
    });
    assert.equal(mounted.root.querySelector(".character-joystick__knob").style.transform, "translate(0px, 0px)");
  } finally {
    mounted.cleanup();
  }
});

test("잠긴 최종전 직접 접근은 전투를 시작하지 않고 사후 맵 안내로 돌아온다", async () => {
  const mounted = await mountEntryScene({
    params: { battleId: "word-breaker" },
    completedIds: requiredMiniGameIds.slice(0, 4),
  });
  try {
    assert.equal(mounted.root.querySelector(".word-breaker-stage"), null);
    assert.ok(mounted.root.querySelector(".battle-notice"));
    assert.equal(
      mounted.root.querySelectorAll("button")
        .some((button) => button.dataset.battleId === "word-breaker"),
      false,
    );
  } finally {
    mounted.cleanup();
  }
});

test("실제 router 순서의 abort/unmount는 RAF와 입력·접촉·resize listener를 모두 정리한다", async () => {
  const mounted = await mountEntryScene();
  const joystick = mounted.root.querySelector(".battle-field-joystick");
  assert.equal(mounted.environment.scheduledFrameCount(), 1);
  assert.equal(mounted.input.listenerCount(), 1);
  assert.equal(mounted.environment.window.listenerCount("resize"), 1);
  assert.equal(mounted.environment.document.listenerCount("visibilitychange"), 1);
  assert.equal(joystick.listenerCount("pointerdown"), 1);
  assert.equal(mounted.events.emit(CHARACTER_EVENTS.CONTACT, {}), 1);

  mounted.controller.abort();
  mounted.scene.unmount();

  assert.equal(mounted.environment.scheduledFrameCount(), 0);
  assert.equal(mounted.input.listenerCount(), 0);
  assert.equal(mounted.environment.window.listenerCount("resize"), 0);
  assert.equal(mounted.environment.document.listenerCount("visibilitychange"), 0);
  assert.equal(joystick.listenerCount("pointerdown"), 0);
  assert.equal(mounted.events.emit(CHARACTER_EVENTS.CONTACT, {}), 0);
  mounted.environment.restore();
});

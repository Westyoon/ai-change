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

class FakeRealtime {
  constructor() {
    this.state = Object.freeze({
      status: "connected",
      connected: true,
      self: Object.freeze({ id: "self-online", name: "나" }),
      selfId: "self-online",
      players: Object.freeze([]),
      rooms: Object.freeze([]),
      currentRoomId: null,
      currentRoom: null,
      error: null,
    });
    this.listeners = new Set();
    this.eventListeners = new Set();
    this.commands = [];
    this.connected = 0;
    this.disconnected = 0;
  }

  getState() { return this.state; }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  subscribeEvents(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  connect() { this.connected += 1; }
  disconnect() { this.disconnected += 1; }
  updatePresence(payload) { this.commands.push({ type: "presence.update", ...payload }); return true; }
  createRoom(battleId, capacity) { this.commands.push({ type: "room.create", battleId, capacity }); return true; }
  joinRoom(roomId) { this.commands.push({ type: "room.join", roomId }); return true; }
  leaveRoom() { this.commands.push({ type: "room.leave" }); return true; }
  startRoom() { this.commands.push({ type: "room.start" }); return true; }

  setState(patch) {
    this.state = Object.freeze({ ...this.state, ...patch });
    for (const listener of this.listeners) listener(this.state);
  }

  emit(event) {
    for (const listener of this.eventListeners) listener(Object.freeze(event));
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
  realtime = null,
  authenticated = false,
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
            authenticated,
            user: authenticated ? { name: "테스트 유저" } : null,
            completedGameIds: [],
          }),
          refreshSession: async () => {},
        },
        ...(realtime ? { postgameRealtime: realtime } : {}),
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
  realtime = null,
  authenticated = false,
} = {}) {
  const environment = installEnvironment();
  const setup = createContext(environment.document, {
    completedIds,
    worldState,
    realtime,
    authenticated,
  });
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

test("로그인한 사후 월드는 다른 사용자를 그리고 보스 문에서 1~5인 온라인 방을 시작한다", async () => {
  const realtime = new FakeRealtime();
  const position = { x: 0.5, y: 0.62 };
  const mounted = await mountEntryScene({
    authenticated: true,
    realtime,
    worldState: {
      zoneId: "plaza",
      position,
      positions: { plaza: position },
      direction: "up",
    },
  });
  try {
    assert.equal(realtime.connected, 1);
    assert.ok(realtime.commands.some((command) => command.type === "presence.update"));

    realtime.setState({
      players: Object.freeze([{
        id: "other-online",
        name: "다른 유저",
        zone: "plaza",
        x: 0.28,
        y: 0.55,
        direction: "left",
        moving: true,
      }]),
    });
    const remoteActor = mounted.root.querySelector(".character-actor--remote");
    assert.ok(remoteActor, "same-zone remote user should be rendered");
    assert.equal(remoteActor.querySelector(".character-actor__name").textContent, "다른 유저");

    const statDoor = mounted.root.querySelectorAll(".aftergame-world__boss-door")
      .find((button) => button.dataset.battleId === "stat-boss");
    statDoor.dispatchEvent({ type: "click", detail: 1 });
    assert.equal(mounted.navigations.length, 0, "authenticated boss entry opens a lobby first");
    assert.equal(mounted.root.querySelector(".postgame-room-lobby").dataset.open, "true");

    const createButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "방 만들기");
    createButton.dispatchEvent({ type: "click", detail: 1 });
    assert.ok(realtime.commands.some((command) => (
      command.type === "room.create" && command.battleId === "stat-boss" && command.capacity === 5
    )));

    const room = Object.freeze({
      id: "ROOM123456",
      battleId: "stat-boss",
      capacity: 5,
      hostId: "self-online",
      memberCount: 1,
      members: Object.freeze([{ id: "self-online", name: "나" }]),
      status: "waiting",
    });
    realtime.setState({
      rooms: Object.freeze([room]),
      currentRoomId: room.id,
      currentRoom: room,
    });
    const startButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "전투 시작");
    assert.equal(startButton.disabled, false, "one player satisfies the minimum room size");
    startButton.dispatchEvent({ type: "click", detail: 1 });
    assert.ok(realtime.commands.some((command) => command.type === "room.start"));

    realtime.emit({
      type: "room.started",
      roomId: room.id,
      battleId: "stat-boss",
      roster: room.members,
      seed: "shared-seed",
      startedAt: 1234,
    });
    assert.deepEqual(mounted.navigations, [{
      sceneId: "battle",
      params: {
        battleId: "stat-boss",
        party: {
          roomId: room.id,
          selfId: "self-online",
          roster: room.members,
          seed: "shared-seed",
          startedAt: 1234,
        },
      },
    }]);
  } finally {
    mounted.cleanup();
    assert.equal(realtime.disconnected, 1);
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

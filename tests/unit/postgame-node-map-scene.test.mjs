import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_EVENTS,
} from "../../js/battle/character/index.js";
import { EventBus } from "../../js/core/event-bus.js";
import { PostgameRealtimeService } from "../../js/core/postgame-realtime-service.js";
import {
  createBattleScene,
  createSharedBattleSession,
  getBattleResultIllustration,
  getXEggRewardNotice,
  getBattlePlayerHealth,
  getPartyMemberHealthView,
  getOtherPartyMembers,
  getSharedDefeatMessage,
  getResumedPartyHealth,
  isSharedPartyReady,
  releaseSharedBattleSession,
  runBattleRetryAction,
  shouldOfferBattleRetry,
} from "../../js/scenes/battle-scene.js";

const battles = JSON.parse(
  await readFile(new URL("../../data/battles.json", import.meta.url), "utf8"),
);

const requiredMiniGameIds = battles[0].unlockCondition.miniGameIds;
const expectedBossIds = new Set(["data-sphinx", "stat-boss", "control-boss"]);

test("X egg experience is announced only for a confirmed new award", () => {
  assert.equal(getXEggRewardNotice({ submitted: true, awarded: true, duplicate: false, experienceAwarded: 170 }), "경험치 +170 획득");
  for (const submission of [null, { submitted: false }, { submitted: true, awarded: false }, { submitted: true, awarded: true, duplicate: true }, { submitted: false, reason: "guest" }]) {
    assert.doesNotMatch(getXEggRewardNotice(submission), /\+20/u);
  }
});

test("party HUD excludes self regardless of roster order and waits for identity", () => {
  const self = { id: "self", hp: 200 };
  const other = { id: "other", hp: 0 };
  assert.deepEqual(getOtherPartyMembers([self], "self"), []);
  assert.deepEqual(getOtherPartyMembers([other, self], "self"), [other]);
  assert.deepEqual(getOtherPartyMembers([self, other], null), []);
});

test("spectator instructions require a different living connected party member", () => {
  const self = { id: "self", hp: 200, connected: true, alive: true };
  const message = (others) => getSharedDefeatMessage({ roster: [self, ...others] }, "self");
  assert.doesNotMatch(message([]), /관전/u, "our own stale server HP is not a survivor");
  assert.match(message([{ id: "other", hp: 20, connected: true, alive: true }]), /관전/u);
  assert.doesNotMatch(message([{ id: "other", hp: 0, connected: true }]), /관전/u);
  assert.doesNotMatch(message([{ id: "other", hp: 20, connected: false }]), /관전/u);
});

test("X알 전투 결과는 실패 시 X알, 클리어 시 마음의 알 이미지를 사용한다", () => {
  assert.equal(
    getBattleResultIllustration("xr-egg-trials", "FAIL")?.src,
    "./assets/images/story-eggs/xr-egg.png",
  );
  assert.equal(
    getBattleResultIllustration("xr-egg-trials", "CLEAR")?.src,
    "./assets/images/story-eggs/heart-egg.png",
  );
  assert.equal(getBattleResultIllustration("stat-boss", "CLEAR"), null);
});

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
      battle: null,
      leavingBattleRoomId: null,
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
  createRoom(battleId, capacity, roomName) {
    this.commands.push({ type: "room.create", battleId, capacity, roomName });
    return true;
  }
  joinRoom(roomId) { this.commands.push({ type: "room.join", roomId }); return true; }
  leaveRoom() { this.commands.push({ type: "room.leave" }); return true; }
  startRoom() { this.commands.push({ type: "room.start" }); return true; }
  sendBattleReady(roomId) { this.commands.push({ type: "battle.ready", roomId }); return true; }
  sendBattleHealth(payload) { this.commands.push({ type: "battle.health", ...payload }); return true; }
  sendBattleHit(payload) { this.commands.push({ type: "battle.hit", ...payload }); return true; }
  sendBattleLeave(roomId) {
    this.commands.push({ type: "battle.leave", roomId });
    this.setState({ leavingBattleRoomId: roomId });
    return this.state.connected;
  }

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
  authenticated = true,
  sessionSequence = null,
  guestBattleTesting = false,
} = {}) {
  const events = new EventBus();
  const input = new FakeInput();
  const navigations = [];
  let currentAuthenticated = authenticated;
  let refreshCount = 0;
  const completedMinigames = Object.fromEntries(
    requiredMiniGameIds.map((id) => [id, { completed: completedIds.includes(id) }]),
  );
  return {
    context: {
      config: { features: { battleContent: true, guestBattleTesting } },
      content: {
        battles,
        minigames: requiredMiniGameIds.map((id) => ({ id, title: id })),
      },
      services: {
        account: {
          getState: () => ({
            status: "ready",
            authenticated: currentAuthenticated,
            user: currentAuthenticated ? { name: "테스트 유저" } : null,
            completedGameIds: [],
          }),
          refreshSession: async () => {
            if (Array.isArray(sessionSequence) && refreshCount < sessionSequence.length) {
              currentAuthenticated = sessionSequence[refreshCount] === true;
            }
            refreshCount += 1;
          },
        },
        ...(realtime ? { postgameRealtime: realtime } : {}),
        save: { getState: () => ({ minigames: completedMinigames, story: { seenStoryIds: ["festival-open"] } }) },
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
    accountRefreshCount: () => refreshCount,
  };
}

async function mountEntryScene({
  params = {},
  completedIds = requiredMiniGameIds,
  worldState = null,
  realtime = null,
  authenticated = true,
  sessionSequence = null,
  guestBattleTesting = false,
} = {}) {
  const environment = installEnvironment();
  const setup = createContext(environment.document, {
    completedIds,
    worldState,
    realtime,
    authenticated,
    sessionSequence,
    guestBattleTesting,
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

test("authenticated world stays mounted through real presence throttling and reconnect", async () => {
  let socket;
  let nextTimer = 0;
  const timers = new Map();
  class BrowserSocket {
    constructor() { socket = this; this.readyState = 0; this.sent = []; }
    send(payload) { this.sent.push(JSON.parse(payload)); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const realtime = new PostgameRealtimeService({
    WebSocketImpl: BrowserSocket,
    location: { href: "https://game.example.test/" },
    now: () => 1000,
    setTimeoutImpl: function (callback) {
      assert.equal(this, globalThis, "browser timer receiver must not be the service");
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeoutImpl: function (id) {
      assert.equal(this, globalThis);
      timers.delete(id);
    },
  });
  const mounted = await mountEntryScene({ authenticated: true, realtime });
  try {
    socket.readyState = 1;
    socket.onopen();
    driveFrames(mounted, { x: 1, y: 0 }, 3);
    assert.ok(socket.sent.some((message) => message.type === "presence.update"));
    assert.equal(timers.size, 1, "movement queues a trailing presence timer");
    socket.close(1006);
    assert.equal(realtime.getState().status, "reconnecting");
    assert.equal(timers.size, 1, "presence timer is replaced with reconnect timer");
    driveFrames(mounted, { x: -1, y: 0 }, 2);
    assert.equal(mounted.navigations.length, 0, "connection loss must not leave the map");
  } finally {
    mounted.cleanup();
  }
  assert.equal(timers.size, 0, "unmount cancels browser timers without throwing");
});

test("shared battle session re-readies once for each reconnected running snapshot", () => {
  const realtime = new FakeRealtime();
  const shared = createSharedBattleSession({
    realtimeService: realtime,
    roomId: "ROOM-SHARED-1",
    battleId: "stat-boss",
  });
  const snapshots = [];
  const unsubscribe = shared.subscribe((snapshot) => snapshots.push(snapshot));
  const running = Object.freeze({
    roomId: "ROOM-SHARED-1",
    battleId: "stat-boss",
    status: "running",
    bossHp: 1_000,
    bossMaxHp: 1_000,
    revision: 1,
    roster: Object.freeze([
      Object.freeze({ id: "self-online", name: "나", ready: false, connected: true }),
    ]),
  });

  realtime.setState({ battle: running });
  realtime.setState({ battle: running });
  assert.equal(
    realtime.commands.filter((command) => command.type === "battle.ready").length,
    0,
    "a restored snapshot cannot mark the player ready before the module starts",
  );
  assert.equal(shared.ready(), true);
  assert.equal(
    realtime.commands.filter((command) => command.type === "battle.ready").length,
    1,
    "the same connection does not loop battle.ready",
  );

  realtime.setState({ connected: false, status: "reconnecting" });
  realtime.setState({ connected: true, status: "connected" });
  realtime.setState({
    battle: Object.freeze({
      ...running,
      roster: Object.freeze([
        Object.freeze({ id: "self-online", name: "나", ready: false, connected: true }),
      ]),
    }),
  });
  assert.equal(
    realtime.commands.filter((command) => command.type === "battle.ready").length,
    2,
    "a fresh post-reconnect snapshot re-arms this player exactly once",
  );
  assert.equal(snapshots.length, 2);

  unsubscribe();
  shared.destroy();
  realtime.setState({ battle: Object.freeze({ ...running, revision: 2 }) });
  assert.equal(snapshots.length, 2, "destroy detaches state listeners");
});

test("shared battle map handoff sends leave without closing the reusable socket", () => {
  const realtime = new FakeRealtime();
  const shared = createSharedBattleSession({
    realtimeService: realtime,
    roomId: "ROOM-SHARED-2",
    battleId: "control-boss",
  });
  const released = releaseSharedBattleSession({
    sharedBattle: shared,
    realtimeService: realtime,
    preserveRealtime: true,
  });

  assert.deepEqual(released, { leaveSent: true, disconnected: false });
  assert.deepEqual(realtime.commands.at(-1), {
    type: "battle.leave",
    roomId: "ROOM-SHARED-2",
  });
  assert.equal(realtime.disconnected, 0);
});

test("shared battle retry returns to party flow and never restarts a local boss", () => {
  let sharedNavigations = 0;
  let localRestarts = 0;
  const mode = runBattleRetryAction({
    sharedBattle: { roomId: "ROOM-SHARED-3" },
    onSharedBattle: () => { sharedNavigations += 1; },
    onSolo: () => { localRestarts += 1; },
  });

  assert.equal(mode, "shared-map");
  assert.equal(sharedNavigations, 1);
  assert.equal(localRestarts, 0);
});

test("random X-egg mini-games omit retry while boss Battle results retain it", () => {
  assert.equal(shouldOfferBattleRetry("xr-egg-trials"), false);
  assert.equal(shouldOfferBattleRetry("data-sphinx"), true);
  assert.equal(shouldOfferBattleRetry("stat-boss"), true);
  assert.equal(shouldOfferBattleRetry("control-boss"), true);
  assert.equal(shouldOfferBattleRetry("word-breaker"), true);
});

test("shared battles publish each boss module's local health without auto-revival", () => {
  assert.deepEqual(
    getBattlePlayerHealth("data-sphinx", { playerHealth: 72.2, playerMaxHealth: 100 }),
    { hp: 72.2, maxHp: 100 },
  );
  assert.deepEqual(
    getBattlePlayerHealth("control-boss", { playerHp: 0, playerMaxHp: 140 }),
    { hp: 0, maxHp: 140 },
  );
  assert.deepEqual(
    getBattlePlayerHealth("stat-boss", {
      players: { "player-1": { hp: 88, maxHp: 120 } },
    }, "player-1"),
    { hp: 88, maxHp: 120 },
  );

  const realtime = new FakeRealtime();
  const shared = createSharedBattleSession({
    realtimeService: realtime,
    roomId: "ROOM-SHARED-HP",
    battleId: "stat-boss",
  });
  assert.equal(shared.health({ hp: 0, maxHp: 120 }), true);
  assert.deepEqual(realtime.commands.at(-1), {
    type: "battle.health",
    roomId: "ROOM-SHARED-HP",
    hp: 0,
    maxHp: 120,
  });
  shared.destroy();
});

test("a resumed shared battle restores only the current public player's authoritative health", () => {
  const snapshot = {
    roster: [
      { id: "self", hp: 37, maxHp: 120 },
      { id: "party", hp: 90, maxHp: 100 },
    ],
  };
  assert.deepEqual(getResumedPartyHealth(snapshot, "self"), { hp: 37, maxHp: 120 });
  assert.deepEqual(getResumedPartyHealth(snapshot, "party"), { hp: 90, maxHp: 100 });
  assert.equal(getResumedPartyHealth(snapshot, "missing"), null);
  assert.equal(getResumedPartyHealth({ roster: [{ id: "self", hp: null, maxHp: null }] }, "self"), null);
  assert.equal(getResumedPartyHealth({ roster: [{ id: "self", hp: 101, maxHp: 100 }] }, "self"), null);
});

test("shared party readiness follows the authoritative barrier with a roster fallback", () => {
  assert.equal(isSharedPartyReady({ status: "running", allReady: false, roster: [] }), false);
  assert.equal(isSharedPartyReady({ status: "running", allReady: true, roster: [] }), true);
  assert.equal(isSharedPartyReady({
    status: "running",
    roster: [
      { id: "self", ready: true, connected: true },
      { id: "offline", ready: false, connected: false },
    ],
  }), true);
  assert.equal(isSharedPartyReady({
    status: "running",
    roster: [{ id: "self", ready: false, connected: true }],
  }), false);
  assert.equal(isSharedPartyReady({ status: "finished", allReady: false }), true);
  assert.deepEqual(
    getPartyMemberHealthView({ hp: 0, maxHp: 100, alive: false, connected: true }),
    { hp: 0, maxHp: 100, dead: true, ratio: 0, label: "전투 불능" },
  );
  assert.deepEqual(
    getPartyMemberHealthView({ hp: 75, maxHp: 100, alive: true, connected: true }),
    { hp: 75, maxHp: 100, dead: false, ratio: 0.75, label: "75/100" },
  );
});

test("guest Battle entry is blocked and opens the Google login flow", async () => {
  const mounted = await mountEntryScene({ authenticated: false });
  try {
    assert.ok(mounted.root.querySelector(".battle-login-required"));
    assert.equal(mounted.root.querySelector(".aftergame-world"), null);
    const loginButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "Google 로그인");
    loginButton.dispatchEvent({ type: "click", detail: 1 });
    assert.deepEqual(mounted.navigations, [{
      sceneId: "account",
      params: {
        notice: "보스 배틀을 시작하려면 Google 로그인이 필요합니다.",
        noticeTone: "info",
      },
    }]);
  } finally {
    mounted.cleanup();
  }
});

test("guest test mode opens the world and starts a boss only after creating a local room", async () => {
  const mounted = await mountEntryScene({
    authenticated: false,
    guestBattleTesting: true,
  });
  try {
    assert.equal(mounted.root.querySelector(".battle-login-required"), null);
    assert.ok(mounted.root.querySelector(".aftergame-world"));
    assert.equal(
      mounted.root.querySelector(".aftergame-world__network-badge"),
      null,
    );

    const statDoor = mounted.root.querySelectorAll(".aftergame-world__boss-door")
      .find((button) => button.dataset.battleId === "stat-boss");
    statDoor.dispatchEvent({ type: "click", detail: 1 });
    const lobby = mounted.root.querySelector(".postgame-room-lobby");
    assert.equal(lobby.dataset.open, "true");
    assert.equal(
      lobby.querySelector(".postgame-room-lobby__connection").textContent,
      "",
    );

    const openCreate = lobby.querySelectorAll("button")
      .find((button) => button.textContent === "방 만들기");
    openCreate.dispatchEvent({ type: "click", detail: 1 });
    const nameInput = lobby.querySelector(".postgame-room-lobby__name");
    nameInput.value = "스탯 보스 테스트";
    nameInput.dispatchEvent({ type: "input" });
    const createRoom = lobby.querySelectorAll("button")
      .find((button) => button.textContent === "방 생성");
    createRoom.dispatchEvent({ type: "click", detail: 1 });

    assert.equal(mounted.navigations.length, 0, "creating a room must not auto-start the boss");
    const startBattle = lobby.querySelectorAll("button")
      .find((button) => button.textContent === "전투 시작");
    assert.ok(startBattle);
    startBattle.dispatchEvent({ type: "click", detail: 1 });

    assert.equal(mounted.navigations.length, 1);
    assert.equal(mounted.navigations[0].sceneId, "battle");
    assert.equal(mounted.navigations[0].params.battleId, "stat-boss");
    assert.equal(mounted.navigations[0].params.party.localTest, true);
    assert.equal(mounted.navigations[0].params.party.roster.length, 1);
  } finally {
    mounted.cleanup();
  }
});

test("guest Story finale bypasses the post-game login gate", async () => {
  const mounted = await mountEntryScene({
    authenticated: false,
    params: { battleId: "word-breaker" },
    completedIds: requiredMiniGameIds.slice(0, 4),
  });
  try {
    assert.equal(mounted.accountRefreshCount(), 0);
    assert.equal(mounted.root.querySelector(".battle-login-required"), null);
    assert.ok(mounted.root.querySelector(".battle-notice"));
  } finally {
    mounted.cleanup();
  }
});

test("Story finale waits without simulation until explicitly started, including guest entry", async () => {
  const environment = installEnvironment();
  const { context } = createContext(environment.document, { authenticated: false });
  const config = JSON.parse(await readFile(new URL("../../data/battle/word-breaker.json", import.meta.url), "utf8"));
  context.services.assets = { loadGroup: async () => {}, get: () => config };
  const scene = createBattleScene(context);
  const root = environment.document.createElement("main");
  const controller = new AbortController();
  try {
    await scene.mount(root, { battleId: "word-breaker" }, { signal: controller.signal });
    const guide = root.querySelector(".battle-start-guide");
    const game = root.querySelector(".word-breaker-stage");
    assert.ok(guide);
    assert.equal(game.hidden, true);
    assert.equal(environment.scheduledFrameCount(), 0, "no clock or attacks run during reading");
    const start = guide.querySelector("button");
    assert.equal(start.textContent, "게임 시작");
    start.dispatchEvent({ type: "click" });
    assert.equal(root.querySelector(".battle-start-guide"), null);
    assert.equal(game.hidden, false);
    assert.equal(game.dataset.state, "READY", "the opening dialogue must finish before combat starts");
    const intro = root.querySelector(".eiai-battle-intro").querySelector(".story-dialogue-scene");
    assert.ok(intro);
    assert.ok(intro.querySelector(".story-dialogue__eiai").getAttribute("src").endsWith("/assets/images/story-eggs/xr-egg.png"), "inside the auditorium Eiai is still the dark X egg");
    for (let line = 0; line < 4; line++) intro.dispatchEvent({ type: "click", detail: 1 });
    assert.equal(game.dataset.state, "RUNNING");
    assert.equal(environment.scheduledFrameCount(), 1);
    start.dispatchEvent({ type: "click" });
    assert.equal(environment.scheduledFrameCount(), 1, "duplicate clicks cannot restart the game");
    environment.step(0);
    environment.step(1000);
    scene.unmount();
    assert.equal(environment.scheduledFrameCount(), 0);
    start.dispatchEvent({ type: "click" });
    assert.equal(environment.scheduledFrameCount(), 0, "detached buttons cannot resurrect the scene");
  } finally {
    scene.unmount();
    controller.abort();
    environment.restore();
  }
});

test("each boss door refreshes the login session and redirects an expired player", async () => {
  const realtime = new FakeRealtime();
  const mounted = await mountEntryScene({
    authenticated: true,
    sessionSequence: [true, false],
    realtime,
  });
  try {
    const statDoor = mounted.root.querySelectorAll(".aftergame-world__boss-door")
      .find((button) => button.dataset.battleId === "stat-boss");
    statDoor.dispatchEvent({ type: "click", detail: 1 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(mounted.accountRefreshCount(), 2, "mount and door entry both verify the session");
    assert.deepEqual(mounted.navigations, [{
      sceneId: "account",
      params: {
        notice: "보스 배틀은 로그인 후 이용할 수 있습니다. Google로 로그인해 주세요.",
        noticeTone: "info",
      },
    }]);
    assert.equal(realtime.disconnected, 1);
    assert.equal(mounted.root.querySelector(".postgame-room-lobby").dataset.open, "false");
  } finally {
    mounted.cleanup();
  }
});

test("중심 광장 동쪽과 랜덤 필드 서쪽은 실제 이동으로 새로고침 없이 왕복한다", async () => {
  const mounted = await mountEntryScene();
  try {
    const world = mounted.root.querySelector(".aftergame-world");
    assert.equal(world.dataset.zoneId, "plaza");
    assert.equal(mounted.root.dataset.sceneLayout, "aftergame-world");
    assert.equal(mounted.root.querySelector(".aftergame-world__help"), null);
    assert.equal(mounted.root.querySelector(".battle-unlock-source"), null);
    assert.equal(mounted.root.querySelector(".aftergame-world__status").textContent, "");
    assert.equal(mounted.root.querySelectorAll(".aftergame-world__boss-door").length, 3);
    assert.deepEqual(
      new Set(mounted.root.querySelectorAll(".aftergame-world__boss-door").map((button) => button.dataset.battleId)),
      expectedBossIds,
    );
    assert.equal(
      mounted.root.querySelectorAll("button").some((button) => button.dataset.battleId === "word-breaker"),
      false,
    );

    driveFrames(mounted, { x: 1, y: 0 }, 34);
    assert.equal(world.dataset.zoneId, "entry-field");
    assert.equal(mounted.context.state.aftergameWorldState.zoneId, "entry-field");
    assert.equal(mounted.navigations.length, 0, "내부 구역 이동은 router를 사용하지 않는다");

    driveFrames(mounted, { x: -1, y: 0 }, 34);
    assert.equal(world.dataset.zoneId, "plaza");
    assert.equal(mounted.context.state.aftergameWorldState.zoneId, "plaza");
    assert.equal(mounted.navigations.length, 0);

    driveFrames(mounted, { x: 0, y: 0 }, 2);
    assert.equal(world.dataset.zoneId, "plaza", "복귀 직후 반대 구역으로 튕기지 않아야 한다");
  } finally {
    mounted.cleanup();
  }
});

test("중심 광장 북쪽의 세 문은 직접 전투를 시작하지 않고 해당 보스 대기실을 연다", async () => {
  const doorCenters = new Map([
    ["data-sphinx", 0.14],
    ["stat-boss", 0.5],
    ["control-boss", 0.86],
  ]);

  for (const [expectedBattleId, x] of doorCenters) {
    const position = { x, y: 0.42 };
    const realtime = new FakeRealtime();
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
      assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "plaza");
      driveFrames(mounted, { x: 0, y: -1 }, 14);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(mounted.navigations.length, 0, "문 접촉만으로 솔로 전투를 시작하면 안 된다");
      const lobby = mounted.root.querySelector(".postgame-room-lobby");
      assert.equal(lobby.dataset.open, "true");
      assert.equal(lobby.querySelector(".postgame-room-lobby__title"), null);
      assert.equal(lobby.querySelector(".postgame-room-lobby__subtitle"), null);
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
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(mounted.navigations.length, 0, "authenticated boss entry opens a lobby first");
    assert.equal(mounted.root.querySelector(".postgame-room-lobby").dataset.open, "true");

    const openCreateButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "방 만들기");
    openCreateButton.dispatchEvent({ type: "click", detail: 1 });
    const createButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "방 생성");
    const roomNameInput = mounted.root.querySelector(".postgame-room-lobby__name");
    assert.equal(createButton.disabled, true, "a room name is required before creation");
    roomNameInput.value = "스탯 보스 원정대";
    roomNameInput.dispatchEvent({ type: "input" });
    createButton.dispatchEvent({ type: "click", detail: 1 });
    assert.ok(realtime.commands.some((command) => (
      command.type === "room.create"
      && command.battleId === "stat-boss"
      && command.capacity === 5
      && command.roomName === "스탯 보스 원정대"
    )));

    const room = Object.freeze({
      id: "ROOM123456",
      roomName: "스탯 보스 원정대",
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
    assert.equal(mounted.navigations.length, 1);
    const navigation = mounted.navigations[0];
    assert.equal(navigation.sceneId, "battle");
    assert.equal(navigation.params.battleId, "stat-boss");
    assert.equal(navigation.params.party.roomId, room.id);
    assert.equal(navigation.params.party.selfId, "self-online");
    assert.deepEqual(navigation.params.party.roster, room.members);
    assert.equal(navigation.params.party.seed, "shared-seed");
    assert.equal(navigation.params.party.startedAt, 1234);
    assert.equal(navigation.params.party.realtimeService, realtime);
    assert.equal(navigation.params.party.sharedBattle.roomId, room.id);
    assert.equal(navigation.params.party.sharedBattle.battleId, "stat-boss");

    navigation.params.party.sharedBattle.ready();
    navigation.params.party.sharedBattle.hit({ kind: "counter-hit", actionId: "counter:1" });
    assert.deepEqual(realtime.commands.slice(-2), [
      { type: "battle.ready", roomId: room.id },
      {
        type: "battle.hit",
        roomId: room.id,
        kind: "counter-hit",
        actionId: "counter:1",
      },
    ]);
  } finally {
    mounted.cleanup();
    assert.equal(realtime.disconnected, 0, "room-to-battle handoff keeps the same socket alive");
  }
});

test("X egg completion waits for reward confirmation and its only button returns to the field", async () => {
  const environment = installEnvironment();
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = FakeElement;
  const { context, navigations } = createContext(environment.document);
  const config = JSON.parse(await readFile(new URL("../../data/battle/xr-egg-trials.json", import.meta.url), "utf8"));
  Object.assign(config, { selectionMode: "fixed", fixedTrialId: "mash", mash: { targetPresses: 1, timeLimitMs: 10000 } });
  context.services.assets = { loadGroup: async () => {}, get: () => config };
  let resolveReward;
  let submissions = 0;
  context.services.account.recordPostgameClear = () => {
    submissions += 1;
    return new Promise(resolve => { resolveReward = resolve; });
  };
  const scene = createBattleScene(context);
  const root = environment.document.createElement("main");
  const controller = new AbortController();
  try {
    await scene.mount(root, { battleId: "xr-egg-trials" }, { signal: controller.signal });
    root.querySelector(".xr-trials__mash-button").dispatchEvent({ type: "click" });
    const card = root.querySelector(".result-card");
    const notice = card.querySelector(".result-card__notice");
    assert.equal(notice.textContent, "경험치 지급 확인 중…");
    assert.equal(submissions, 1);
    resolveReward({ submitted: true, awarded: true, duplicate: false, experienceAwarded: 130 });
    await Promise.resolve();
    assert.equal(notice.textContent, "경험치 +130 획득");
    assert.equal(card.querySelector(".result-metrics"), null);
    const buttons = card.querySelectorAll("button");
    assert.deepEqual(buttons.map(button => button.textContent), ["확인"]);
    buttons[0].dispatchEvent({ type: "click" });
    buttons[0].dispatchEvent({ type: "click" });
    assert.deepEqual(navigations, [{ sceneId: "battle", params: undefined }]);
    assert.equal(context.state.aftergameWorldState.zoneId, "entry-field");
  } finally {
    scene.unmount();
    controller.abort();
    environment.restore();
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previousHTMLElement;
  }
});

for (const battleId of ["stat-boss", "control-boss", "data-sphinx"]) {
  test(`${battleId} renders one local HP meter and a separate teammates-only panel`, async () => {
    const environment = installEnvironment();
    const realtime = new FakeRealtime();
    const self = { id: "self-online", name: "나", hp: 100, maxHp: 100, alive: true, ready: true, connected: true };
    const snapshot = {
      roomId: "ROOMHUD001", battleId, status: "running", bossHp: 100, bossMaxHp: 100,
      revision: 1, allReady: true, roster: [self],
    };
    realtime.setState({ battle: snapshot });
    const { context } = createContext(environment.document, { realtime });
    const config = JSON.parse(await readFile(new URL(`../../data/battle/${battleId}.json`, import.meta.url), "utf8"));
    context.services.assets = { loadGroup: async () => {}, get: () => config };
    const scene = createBattleScene(context);
    const root = environment.document.createElement("main");
    const controller = new AbortController();
    try {
      await scene.mount(root, { battleId, party: { roomId: snapshot.roomId, roster: [self] } }, { signal: controller.signal });
      const panel = root.querySelector(".battle-party-hud");
      const playArea = root.querySelector(".battle-play-area");
      const stage = root.querySelector(".battle-stage");
      const localMeter = battleId === "control-boss" ? ".control-boss-player-hp-track" : ".character-health__track";
      assert.equal(stage.querySelectorAll(localMeter).length, 1);
      assert.equal(panel.hidden, true);
      assert.equal(panel.querySelectorAll(".battle-party-hud__member").length, 0);
      assert.equal(playArea.dataset.hasParty, "false");
      const teammates = Array.from({ length: 4 }, (_, index) => ({ ...self, id: `other-${index}`, name: `동료${index}`, hp: index === 0 ? 0 : 50, alive: index !== 0 }));
      realtime.setState({ battle: { ...snapshot, revision: 2, roster: [...teammates.slice(0, 2), self, ...teammates.slice(2)] }, players: [
        { id: "other-1", name: "Friend", hairColor: "brown", zone: `battle:${battleId}`, x: .25, y: .75, moving: true, direction: "left" },
        { id: "outsider", name: "Outsider", zone: `battle:${battleId}`, x: .5, y: .5 },
      ] });
      const remoteActors = stage.querySelectorAll(".character-actor--remote");
      assert.equal(remoteActors.length, 4, "all roster teammates are rendered even before their first position packet");
      const movingRemote = remoteActors.find(actor => actor.dataset.characterId === "other-1");
      assert.ok(movingRemote);
      assert.equal(movingRemote.querySelector(".character-actor__name").textContent, "Friend \u00b7 50 / 100");
      assert.equal(movingRemote.dataset.motion, "walk");
      assert.equal(remoteActors.find(actor => actor.dataset.characterId === "other-0").dataset.state, "dead");
      assert.ok(realtime.commands.some(command => command.type === "presence.update" && command.zone === `battle:${battleId}`));
      assert.equal(panel.hidden, false);
      assert.equal(playArea.dataset.hasParty, "true");
      assert.equal(panel.parentNode, playArea);
      assert.equal(playArea.children[0], panel, "party is a sibling before the stage, never an overlay inside it");
      assert.equal(stage.querySelector(".battle-party-hud"), null);
      const rows = panel.querySelectorAll(".battle-party-hud__member");
      assert.equal(rows.length, 4);
      assert.deepEqual(rows.map(row => row.querySelector("strong").textContent), teammates.map(member => member.name));
      assert.equal(rows[0].dataset.dead, "true");
      assert.equal(rows[1].querySelector(".battle-party-hud__fill").getAttribute("style"), "width:50%");
      assert.equal(stage.querySelectorAll(localMeter).length, 1);
      realtime.setState({ battle: { ...snapshot, revision: 3 } });
      assert.equal(panel.hidden, true);
      assert.equal(playArea.dataset.hasParty, "false");
    } finally {
      scene.unmount();
      controller.abort();
      environment.restore();
    }
  });
}

test("solo Control Boss synchronizes damage, rejects stale HUD refill, and shows the server defeat result", async (t) => {
  const environment = installEnvironment();
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = FakeElement;
  environment.window.setTimeout = () => 0;
  let healthPoll = null;
  t.mock.method(globalThis, "setInterval", callback => { healthPoll = callback; return 123; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const realtime = new FakeRealtime();
  const snapshot = {
    roomId: "ROOMSOLO01", battleId: "control-boss", status: "running",
    bossHp: 1000, bossMaxHp: 1000, revision: 1, allReady: true,
    roster: [{ id: "self-online", name: "나", hp: 200, maxHp: 200, alive: true, ready: true, connected: true }],
  };
  realtime.setState({ battle: snapshot });
  const { context, input } = createContext(environment.document, { realtime });
  const config = JSON.parse(await readFile(new URL("../../data/battle/control-boss.json", import.meta.url), "utf8"));
  config.boss = { ...config.boss, maxShield: 1, phase2CastSec: 0, phase1FirstAttackDelaySec: 0, attackIntervalSec: 100 };
  config.player.startPosition = { x: 209, y: 121 };
  context.services.assets = { loadGroup: async () => {}, get: () => config };
  const scene = createBattleScene(context);
  const root = environment.document.createElement("main");
  const controller = new AbortController();
  try {
    await scene.mount(root, { battleId: "control-boss", party: { roomId: snapshot.roomId, roster: snapshot.roster } }, { signal: controller.signal });
    environment.step(0);
    environment.step(100);
    await Promise.resolve();
    const damaged = realtime.commands.filter(command => command.type === "battle.health").at(-1);
    assert.ok(damaged.hp > 0 && damaged.hp < 200, "actual bullet collision sends reduced HP");
    const expectedWidth = `${damaged.hp / 200 * 100}%`;
    assert.equal(root.querySelector(".battle-party-hud").hidden, true);
    assert.equal(root.querySelectorAll(".battle-party-hud__member").length, 0);
    assert.equal(root.querySelector(".control-boss-bar__fill--player").style.width, expectedWidth);
    healthPoll();
    realtime.setState({ battle: { ...snapshot, revision: 2 } });
    assert.equal(root.querySelector(".control-boss-bar__fill--player").style.width, expectedWidth, "old full-HP snapshot cannot refill local HP");

    for (const listener of input.listeners) listener({ action: "CONFIRM", phase: "press", source: "keyboard", originalEvent: { code: "Space" } });
    environment.step(200);
    await Promise.resolve();
    healthPoll();
    assert.equal(realtime.commands.filter(command => command.type === "battle.health").at(-1).hp, 0);
    assert.equal(root.querySelectorAll(".battle-party-hud__member").length, 0);
    assert.equal(root.querySelector(".control-boss-bar__fill--player").style.width, "0%");
    assert.doesNotMatch(context.toastRoot.children.map(child => child.textContent).join(" "), /관전/u);
    assert.equal(context.state.lastResult, undefined, "only the server may finalize an online result");
    realtime.setState({ battle: {
      ...snapshot, revision: 3, status: "finished", result: { outcome: "defeat", reason: "party-defeated" },
      roster: [{ ...snapshot.roster[0], hp: 0, alive: false, ready: false }],
    } });
    assert.equal(context.state.lastResult.status, "FAIL");
    assert.ok(root.querySelector(".result-card"));
  } finally {
    scene.unmount();
    controller.abort();
    environment.restore();
    restoreGlobal("HTMLElement", previousHTMLElement);
  }
});

test("running battle snapshot asks whether to continue instead of auto-entering", async () => {
  const createRunningSnapshot = () => Object.freeze({
    roomId: "ROOMRSM001",
    battleId: "stat-boss",
    status: "running",
    bossHp: 730,
    bossMaxHp: 1_000,
    revision: 8,
    roster: Object.freeze([
      Object.freeze({ id: "self-online", name: "나", ready: true, connected: true }),
      Object.freeze({ id: "other-online", name: "동료", ready: true, connected: true }),
    ]),
    seed: "seed:ROOMRSM001",
    allReady: true,
    startedAt: 9_876,
  });

  for (const snapshotBeforeMount of [true, false]) {
    const realtime = new FakeRealtime();
    if (snapshotBeforeMount) realtime.setState({ battle: createRunningSnapshot() });
    const mounted = await mountEntryScene({ authenticated: true, realtime });
    let sharedBattle = null;
    try {
      if (!snapshotBeforeMount) {
        realtime.setState({
          battle: Object.freeze({
            roomId: "IGNORED001",
            battleId: "unpublished-boss",
            status: "running",
            bossHp: 1,
            bossMaxHp: 1,
            revision: 1,
            roster: Object.freeze([]),
          }),
        });
        assert.equal(mounted.navigations.length, 0, "an unknown battle definition is ignored");
        realtime.setState({
          battle: createRunningSnapshot(),
          leavingBattleRoomId: "ROOMRSM001",
        });
        assert.equal(mounted.navigations.length, 0, "a pending leave snapshot never auto-resumes");
        realtime.setState({
          battle: Object.freeze({ ...createRunningSnapshot(), revision: 9 }),
          leavingBattleRoomId: null,
        });
      }

      assert.equal(mounted.navigations.length, 0, "an existing battle must not auto-navigate");
      const recovery = mounted.root.querySelector(".battle-recovery");
      assert.equal(recovery.dataset.open, "true");
      assert.match(recovery.querySelector(".battle-recovery__summary").textContent, /730\/1000/u);
      const continueButton = mounted.root.querySelectorAll("button")
        .find((button) => button.textContent === "이어하기");
      continueButton.dispatchEvent({ type: "click", detail: 1 });

      assert.equal(mounted.navigations.length, 1);
      const navigation = mounted.navigations[0];
      assert.equal(navigation.sceneId, "battle");
      assert.equal(navigation.params.battleId, "stat-boss");
      assert.equal(navigation.params.party.roomId, "ROOMRSM001");
      assert.equal(navigation.params.party.startedAt, 9_876);
      assert.equal(navigation.params.party.seed, "seed:ROOMRSM001");
      assert.equal(navigation.params.party.roster.length, 2);
      assert.equal(navigation.params.party.realtimeService, realtime);
      sharedBattle = navigation.params.party.sharedBattle;
      assert.equal(sharedBattle.getSnapshot().bossHp, 730);
      assert.equal(mounted.context.state.aftergameWorldState.zoneId, "plaza");

      realtime.emit({
        type: "room.started",
        roomId: "ROOMRSM001",
        battleId: "stat-boss",
        roster: createRunningSnapshot().roster,
        startedAt: 9_876,
      });
      realtime.setState({ battle: Object.freeze({ ...createRunningSnapshot(), revision: 10 }) });
      assert.equal(mounted.navigations.length, 1, "room.started and later updates cannot double-navigate");
    } finally {
      mounted.cleanup();
      sharedBattle?.destroy();
      assert.equal(realtime.disconnected, 0, "the recovered battle owns the existing socket");
    }
  }
});

test("running battle recovery waits for leave acknowledgement before closing", async () => {
  const realtime = new FakeRealtime();
  const mounted = await mountEntryScene({ authenticated: true, realtime });
  try {
    realtime.setState({
      battle: Object.freeze({
        roomId: "ROOMLEAVE1",
        battleId: "control-boss",
        status: "running",
        bossHp: 640,
        bossMaxHp: 1_000,
        revision: 3,
        roster: Object.freeze([
          Object.freeze({ id: "self-online", name: "나", ready: false, connected: false }),
        ]),
        seed: "seed:ROOMLEAVE1",
        allReady: false,
        startedAt: 123,
      }),
    });
    const recovery = mounted.root.querySelector(".battle-recovery");
    assert.equal(recovery.dataset.open, "true");
    const leaveButton = mounted.root.querySelectorAll("button")
      .find((button) => button.textContent === "전투 나가기");
    leaveButton.dispatchEvent({ type: "click", detail: 1 });
    assert.deepEqual(realtime.commands.at(-1), { type: "battle.leave", roomId: "ROOMLEAVE1" });
    assert.equal(recovery.dataset.open, "true");
    assert.equal(recovery.dataset.leaving, "true");

    realtime.setState({ battle: null, leavingBattleRoomId: null });
    assert.equal(recovery.dataset.open, "false");
    assert.equal(mounted.navigations.length, 0);
  } finally {
    mounted.cleanup();
  }
});

test("finished battle snapshot stays on the map and releases stale server membership once", async () => {
  const realtime = new FakeRealtime();
  const mounted = await mountEntryScene({ authenticated: true, realtime });
  try {
    const finished = Object.freeze({
      roomId: "ROOMDONE01",
      battleId: "control-boss",
      status: "finished",
      bossHp: 0,
      bossMaxHp: 500,
      revision: 12,
      roster: Object.freeze([
        Object.freeze({ id: "self-online", name: "나", ready: true, connected: true }),
      ]),
      result: Object.freeze({ outcome: "victory", reason: "boss-defeated" }),
      startedAt: 1_000,
      finishedAt: 2_000,
    });
    realtime.setState({ battle: finished });
    realtime.setState({ battle: Object.freeze({ ...finished, revision: 13 }) });

    assert.equal(mounted.navigations.length, 0);
    assert.equal(
      realtime.commands.filter((command) => command.type === "battle.leave").length,
      1,
    );
    assert.equal(realtime.getState().leavingBattleRoomId, "ROOMDONE01");
    assert.equal(mounted.root.querySelector(".aftergame-world__status").textContent, "전투가 종료되었습니다.");
  } finally {
    mounted.cleanup();
    assert.equal(realtime.disconnected, 1);
  }
});

test("필드 이동 중 marker 하나만 출현하고 click/contact는 단일 랜덤 Battle route를 공유한다", async () => {
  const mounted = await mountEntryScene();
  try {
    assert.equal(mounted.root.querySelectorAll(".battle-field-encounter").length, 0);
    mounted.root.querySelector(".aftergame-world__edge-gate--east")
      .dispatchEvent({ type: "click", detail: 1 });
    assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "entry-field");
    const marker = driveUntilEncounter(mounted);
    assert.ok(marker, "actual movement should produce a random encounter marker");
    assert.equal(mounted.root.querySelectorAll(".battle-field-encounter").length, 1);
    const eggArt = marker.querySelector(".battle-field-encounter__egg");
    assert.equal(eggArt?.tagName, "IMG");
    assert.equal(eggArt?.getAttribute("src"), "./assets/images/story-eggs/xr-egg.png");
    assert.equal(eggArt?.getAttribute("alt"), "");

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

test("모바일 조이스틱 이동도 중심 광장 동쪽 출구를 통해 랜덤 필드로 전환한다", async () => {
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
      clientX: 104,
      clientY: 52,
      preventDefault,
    });
    driveFrames(mounted, { x: 0, y: 0 }, 34);
    assert.equal(mounted.root.querySelector(".aftergame-world").dataset.zoneId, "entry-field");
    assert.equal(mounted.navigations.length, 0);

    joystick.dispatchEvent({
      type: "pointerup",
      pointerId: 1,
      pointerType: "touch",
      clientX: 104,
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

test("a direct boss route cannot auto-start without joining a room", async () => {
  const mounted = await mountEntryScene({
    authenticated: true,
    params: { battleId: "stat-boss" },
  });
  try {
    assert.ok(mounted.root.querySelector(".aftergame-world"));
    assert.match(mounted.root.querySelector(".battle-notice").textContent, /방을 만들거나 참가/u);
    assert.equal(mounted.navigations.length, 0);
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

  assert.equal(mounted.root.dataset.sceneLayout, undefined);
  assert.equal(mounted.environment.scheduledFrameCount(), 0);
  assert.equal(mounted.input.listenerCount(), 0);
  assert.equal(mounted.environment.window.listenerCount("resize"), 0);
  assert.equal(mounted.environment.document.listenerCount("visibilitychange"), 0);
  assert.equal(joystick.listenerCount("pointerdown"), 0);
  assert.equal(mounted.events.emit(CHARACTER_EVENTS.CONTACT, {}), 0);
  mounted.environment.restore();
});

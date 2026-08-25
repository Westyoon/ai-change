import assert from "node:assert/strict";
import test from "node:test";
import { EventBus } from "../../js/core/event-bus.js";
import { GameLoop } from "../../js/core/game-loop.js";
import { DEFAULT_KEY_BINDINGS, InputManager, INPUT_ACTIONS } from "../../js/core/input-manager.js";
import { SaveManager } from "../../js/core/save-manager.js";
import {
  compareRecords,
  defineRecordPolicy,
  getRecordPolicy,
  projectRecord
} from "../../js/core/record-policies.js";
import { InputLock } from "../../js/minigames/shared/input-lock.js";
import { MiniGameClock } from "../../js/minigames/shared/minigame-clock.js";
import {
  assertCandidateFieldAllowlist,
  buildClearCandidate,
  buildMiniGameCandidate
} from "../../js/minigames/shared/result-builder.js";

test("EventBus supports once, unsubscribe and AbortSignal cleanup", () => {
  const bus = new EventBus();
  const abortController = new AbortController();
  const received = [];

  bus.on("game", (detail) => received.push(`persistent:${detail}`), {
    signal: abortController.signal
  });
  bus.on("game", (detail) => received.push(`once:${detail}`), { once: true });

  assert.equal(bus.emit("game", 1), 2);
  assert.equal(bus.emit("game", 2), 1);
  abortController.abort();
  assert.equal(bus.emit("game", 3), 0);
  assert.deepEqual(received, ["persistent:1", "once:1", "persistent:2"]);
});

test("GameLoop binds its frame callback and keeps step deltas bounded", () => {
  const updates = [];
  const loop = new GameLoop({
    maxDeltaMs: 50,
    update: (deltaMs, elapsedMs, meta) => updates.push({ deltaMs, elapsedMs, raw: meta.rawDeltaMs }),
  });
  loop.step(100);
  loop.step(220);
  assert.deepEqual(updates, [
    { deltaMs: 0, elapsedMs: 0, raw: 0 },
    { deltaMs: 50, elapsedMs: 50, raw: 120 },
  ]);
  loop.destroy();
});

test("InputManager maps Escape to pause and preserves native button activation", () => {
  const handlers = new Map();
  const target = {
    addEventListener(type, listener) {
      handlers.set(type, listener);
    },
    removeEventListener() {},
  };
  const root = { addEventListener() {}, removeEventListener() {} };
  const received = [];
  const input = new InputManager({ target, root, onAction: (event) => received.push(event.action) });
  input.start();

  let prevented = false;
  handlers.get("keydown")({
    code: "Space",
    target: { closest: () => ({ tagName: "BUTTON" }) },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, false);
  assert.deepEqual(received, []);

  handlers.get("keydown")({
    code: "Escape",
    target: { closest: () => ({ tagName: "BUTTON" }) },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(DEFAULT_KEY_BINDINGS.Escape, INPUT_ACTIONS.PAUSE);
  assert.equal(prevented, true);
  assert.deepEqual(received, [INPUT_ACTIONS.PAUSE]);
  input.destroy();
});

test("SaveManager persists game and NPC completion in one write and keeps QUIT as no-op", () => {
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes += 1;
      values.set(key, value);
    },
  };
  const save = new SaveManager({
    appId: "ai-change",
    storageChannel: "test",
    miniGameIds: ["data-number-baseball"],
    storage,
  });
  save.load();
  save.applyResult("data-number-baseball", { status: "CLEAR" }, { completedNpcIds: ["npc-ds"] });

  const state = save.getState();
  assert.equal(writes, 1);
  assert.equal(state.revision, 1);
  assert.equal(state.minigames["data-number-baseball"].completed, true);
  assert.equal(state.minigames["data-number-baseball"].playCount, 1);
  assert.deepEqual(state.story.completedNpcIds, ["npc-ds"]);

  save.applyResult("data-number-baseball", { status: "QUIT" });
  assert.equal(writes, 1);
  assert.equal(save.getState().revision, 1);
});

test("InputLock remains locked until every independent reason is released", async () => {
  const lock = new InputLock();
  const changes = [];
  lock.onChange((locked, reasons) => changes.push([locked, [...reasons]]));

  const releaseManual = lock.lock("MANUAL");
  lock.lock("SYSTEM");
  releaseManual();
  assert.equal(lock.locked, true);
  assert.deepEqual([...lock.reasons], ["SYSTEM"]);

  const value = await lock.withLock("ANIMATION", async () => "done");
  assert.equal(value, "done");
  assert.equal(lock.locked, true);

  lock.unlock("SYSTEM");
  assert.equal(lock.locked, false);
  assert.deepEqual(changes, [
    [true, ["MANUAL"]],
    [false, []]
  ]);
});

test("MiniGameClock excludes overlapping pause reasons from active elapsed time", () => {
  let now = 0;
  const clock = new MiniGameClock({ now: () => now });

  clock.start();
  now = 100;
  clock.pause("MANUAL");
  now = 300;
  clock.pause("SYSTEM");
  now = 500;
  clock.resume("MANUAL");
  assert.equal(clock.paused, true);
  assert.equal(clock.getElapsedMs(), 100);

  clock.resume("SYSTEM");
  now = 650;
  assert.equal(clock.stop(), 250);
  assert.equal(clock.running, false);
});

test("result candidates enforce the status discriminator and host-field boundary", () => {
  const candidate = buildClearCandidate({ correctCount: 3 });
  assert.deepEqual(candidate, {
    status: "CLEAR",
    score: null,
    failureReason: null,
    metrics: { correctCount: 3 },
    reward: null
  });
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(assertCandidateFieldAllowlist(candidate), true);

  assert.throws(
    () => assertCandidateFieldAllowlist({ ...candidate, sessionId: "host-owned" }),
    /host-owned or unknown fields/u
  );
  assert.throws(
    () => buildMiniGameCandidate({ status: "ERROR", failureReason: "RUNTIME", metrics: { leaked: true } }),
    /metrics must be empty/u
  );
});

test("record policies project only eligible statuses and preserve comparator outcomes", () => {
  const key = "test-lower-duration";
  defineRecordPolicy(key, {
    eligibleStatuses: ["CLEAR"],
    project: (result) => ({ durationMs: result.durationMs }),
    compare: (next, current) => {
      if (next.durationMs === current.durationMs) return "EQUAL";
      return next.durationMs < current.durationMs ? "BETTER" : "WORSE";
    },
    tieBreak: "KEEP_EXISTING"
  });

  assert.equal(getRecordPolicy(key)?.tieBreak, "KEEP_EXISTING");
  assert.deepEqual(projectRecord(key, { status: "CLEAR", durationMs: 250 }), { durationMs: 250 });
  assert.equal(projectRecord(key, { status: "FAIL", durationMs: 100 }), null);
  assert.equal(compareRecords(key, { durationMs: 200 }, { durationMs: 250 }), "BETTER");
  assert.equal(compareRecords(key, { durationMs: 250 }, { durationMs: 250 }), "EQUAL");
  assert.equal(compareRecords(key, { durationMs: 300 }, { durationMs: 250 }), "WORSE");
});

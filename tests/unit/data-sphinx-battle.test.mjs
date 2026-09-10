import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DATA_SPHINX_SELECTIONS,
  DataSphinxEncounter,
  createBattle,
  getDataSphinxSelection,
  normalizeDataSphinxConfig,
} from "../../js/battle/postgame/bosses/data-sphinx/index.js";

function oneQuizConfig(overrides = {}) {
  return normalizeDataSphinxConfig({
    battleId: "data-sphinx",
    arena: { width: 100, height: 60 },
    player: {
      spawn: { x: 50, y: 30 },
      width: 10,
      height: 10,
      speed: 10,
      maxHealth: 100,
    },
    timeLimitMs: 100,
    resolutionDelayMs: 0,
    deathDelayMs: 0,
    bossMaxHealth: 10,
    damagePerCorrect: 10,
    playerDamagePerWrong: 20,
    quizList: [{ id: "q1", question: "테스트 문제", answer: "O" }],
    ...overrides,
  });
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentNode = null;
    this.className = "";
    this.textContent = "";
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
      removeProperty(name) {
        delete this[name];
      },
    };
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    for (const child of this.children) {
      if (child.className.split(/\s+/u).includes(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createRoot() {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  return new FakeElement("div", ownerDocument);
}

function createInput() {
  const listeners = new Set();
  let vector = { x: 0, y: 0 };
  return {
    getMovementVector: () => vector,
    onAction(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setVector(next) {
      vector = next;
    },
    listenerCount: () => listeners.size,
  };
}

function installFrameHarness() {
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map();
  let nextId = 0;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  return {
    frame(timestamp) {
      const entry = callbacks.entries().next().value;
      assert.ok(entry, "a game-loop frame should be scheduled");
      const [id, callback] = entry;
      callbacks.delete(id);
      callback(timestamp);
    },
    scheduledCount: () => callbacks.size,
    restore() {
      if (previousRequest === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previousRequest;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

test("checked-in Data Sphinx config preserves the ten-question fixed-damage formula", async () => {
  const document = JSON.parse(await readFile(
    new URL("../../data/battle/data-sphinx.json", import.meta.url),
    "utf8",
  ));
  const config = normalizeDataSphinxConfig(document);

  assert.equal(config.quizList.length, 10);
  assert.equal(config.timeLimitMs, 3_000);
  assert.equal(config.bossMaxHealth, 100);
  assert.equal(config.damagePerCorrect, 10);
  assert.equal(config.player.maxHealth, 100);
  assert.equal(config.playerDamagePerWrong, 20);
  assert.throws(
    () => normalizeDataSphinxConfig({
      ...document,
      bossMaxHealth: 110,
    }),
    /at least 11 quizzes/u,
  );
});

test("selection uses the visible actor center and leaves the exact divider neutral", () => {
  const arena = { width: 100, height: 60 };
  assert.equal(
    getDataSphinxSelection({ x: 45, width: 10 }, arena),
    DATA_SPHINX_SELECTIONS.NEUTRAL,
  );
  assert.equal(getDataSphinxSelection({ x: 44.9, width: 10 }, arena), DATA_SPHINX_SELECTIONS.O);
  assert.equal(getDataSphinxSelection({ x: 45.1, width: 10 }, arena), DATA_SPHINX_SELECTIONS.X);
});

test("encounter freezes while paused and emits one allowlisted result per attempt", () => {
  const completions = [];
  const encounter = new DataSphinxEncounter({
    config: oneQuizConfig(),
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "data-sphinx:pure" });
  encounter.tick(40);
  assert.equal(encounter.getSnapshot().timeRemainingMs, 60);

  assert.equal(encounter.pause(), true);
  assert.equal(encounter.tick(1_000), false);
  assert.equal(encounter.getSnapshot().timeRemainingMs, 60);
  assert.equal(encounter.resume(), true);

  encounter.setPlayerLocation(DATA_SPHINX_SELECTIONS.O);
  encounter.tick(60);
  assert.equal(encounter.getSnapshot().bossHealth, 0);
  encounter.tick(0);
  encounter.tick(1_000);

  assert.deepEqual(completions, [{
    attemptId: "data-sphinx:pure",
    candidate: {
      status: "CLEAR",
      score: null,
      failureReason: null,
      metrics: { correctCount: 1, wrongCount: 0, timeoutCount: 0 },
      reward: null,
    },
  }]);
  assert.deepEqual(
    Object.keys(completions[0].candidate).sort(),
    ["failureReason", "metrics", "reward", "score", "status"],
  );
});

test("battle owns its loop, cleans up on retry/destroy, and never reveals an answer after a miss", async () => {
  const frames = installFrameHarness();
  const root = createRoot();
  const input = createInput();
  const completions = [];
  const battle = createBattle({
    root,
    input,
    events: { emit() {} },
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });

  try {
    await battle.init(oneQuizConfig());
    assert.equal(root.children.length, 1);
    assert.equal(input.listenerCount(), 1);
    assert.equal(battle.getState().state, "READY");

    input.setVector({ x: -1, y: 0 });
    battle.start({ attemptId: "data-sphinx:adapter-1" });
    frames.frame(0);
    frames.frame(100);
    assert.equal(battle.getState().phase, "RESOLVING");
    assert.equal(battle.pause("MANUAL"), true);
    assert.equal(frames.scheduledCount(), 0);
    assert.equal(battle.resume(), true);
    frames.frame(200);
    assert.equal(battle.getState().state, "COMPLETED");
    assert.equal(completions.length, 1);
    assert.equal(completions[0].candidate.status, "CLEAR");

    input.setVector({ x: 1, y: 0 });
    assert.equal(battle.restart({ attemptId: "data-sphinx:adapter-2" }), true);
    assert.equal(root.children.length, 1);
    assert.equal(input.listenerCount(), 1);
    frames.frame(400);
    frames.frame(500);
    const feedback = root.querySelector(".data-sphinx-feedback");
    assert.match(feedback.textContent, /오답입니다/u);
    assert.doesNotMatch(feedback.textContent, /정답은/u);
    frames.frame(600);
    assert.equal(completions.length, 2);
    assert.deepEqual(completions[1], {
      attemptId: "data-sphinx:adapter-2",
      candidate: {
        status: "FAIL",
        score: null,
        failureReason: "OUT_OF_QUESTIONS",
        metrics: { correctCount: 0, wrongCount: 1, timeoutCount: 0 },
        reward: null,
      },
    });

    assert.equal(battle.destroy(), true);
    assert.equal(battle.destroy(), false);
    assert.equal(root.children.length, 0);
    assert.equal(input.listenerCount(), 0);
    assert.deepEqual(battle.getState(), { state: "DESTROYED", disposed: true });
  } finally {
    battle.destroy();
    frames.restore();
  }
});

test("an init aborted at the async boundary mounts nothing and disposes idempotently", async () => {
  const root = createRoot();
  const controller = new AbortController();
  const battle = createBattle({ root, events: { emit() {} } });
  const initialization = battle.init(oneQuizConfig(), { signal: controller.signal });
  controller.abort();

  await assert.rejects(initialization, (error) => error?.name === "AbortError");
  assert.equal(root.children.length, 0);
  assert.deepEqual(battle.getState(), { state: "DESTROYED", disposed: true });
  assert.equal(battle.destroy(), false);
});

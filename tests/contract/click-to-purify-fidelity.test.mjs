import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMiniGame,
  hasInternalStartGate,
} from "../../js/minigames/CS/index.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentNode = null;
    this.style = {};
    this.className = "";
    this.disabled = false;
    this.hidden = false;
    this.id = "";
    this.textContent = "";
    this.type = "";
    this.focusCount = 0;
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

  dispatchEvent(type) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ currentTarget: this, target: this, type });
    }
  }

  focus() {
    this.focusCount += 1;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createFakeUiRoot() {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  return new FakeElement("div", ownerDocument);
}

function hasClass(element, className) {
  return element.className.split(/\s+/u).includes(className);
}

function findAllByClass(root, className, matches = []) {
  if (hasClass(root, className)) matches.push(root);
  for (const child of root.children) findAllByClass(child, className, matches);
  return matches;
}

function findByClass(root, className) {
  return findAllByClass(root, className)[0] ?? null;
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return null;
}

function collectText(root) {
  return [root.textContent, ...root.children.map(collectText)].join(" ");
}

function createRecordingContext() {
  const calls = [];
  return {
    calls,
    clearRect(...args) { calls.push(["clearRect", ...args]); },
    beginPath(...args) { calls.push(["beginPath", ...args]); },
    arc(...args) { calls.push(["arc", ...args]); },
    fill(...args) { calls.push(["fill", ...args]); },
    stroke(...args) { calls.push(["stroke", ...args]); },
    fillText(...args) { calls.push(["fillText", ...args]); },
    moveTo(...args) { calls.push(["moveTo", ...args]); },
    lineTo(...args) { calls.push(["lineTo", ...args]); },
  };
}

function createCanvasEnvironment() {
  const stage = { className: "minigame-stage" };
  const context = createRecordingContext();
  const canvas = {
    width: 960,
    height: 540,
    className: "minigame-canvas",
    parentElement: stage,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
  const uiRoot = createFakeUiRoot();
  uiRoot.className = "minigame-ui-root";
  return { canvas, context, stage, uiRoot };
}

async function readConfig() {
  return JSON.parse(await readFile(
    new URL("../../data/minigames/click-to-purify.json", import.meta.url),
    "utf8",
  ));
}

function installAnimationFrameStub() {
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let queuedCallback = null;
  let nextId = 0;
  globalThis.requestAnimationFrame = (callback) => {
    queuedCallback = callback;
    nextId += 1;
    return nextId;
  };
  globalThis.cancelAnimationFrame = () => {
    queuedCallback = null;
  };
  return {
    runNext() {
      const callback = queuedCallback;
      assert.equal(typeof callback, "function", "an animation frame must be queued");
      queuedCallback = null;
      callback();
    },
    get queued() {
      return queuedCallback;
    },
    restore() {
      if (previousRequest === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previousRequest;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

test("CS restores the original 480px canvas, HUD, four-type intro, and START gate", async () => {
  const animation = installAnimationFrameStub();
  const config = await readConfig();
  const { canvas, context, stage, uiRoot } = createCanvasEnvironment();
  const gameplayStarts = [];
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onGameplayStart(attemptId) {
      gameplayStarts.push(attemptId);
    },
  });

  try {
    await instance.init(config);

    assert.equal(hasInternalStartGate, true);
    assert.equal(canvas.width, 480);
    assert.equal(canvas.height, 480);
    assert.match(canvas.className, /\bclick-to-purify-canvas\b/u);
    assert.match(stage.className, /\bclick-to-purify-stage\b/u);
    assert.match(uiRoot.className, /\bclick-to-purify-ui-root\b/u);
    for (const className of [
      "click-to-purify--original",
      "click-to-purify__intro",
      "click-to-purify__intro-box",
      "intro-legend",
      "ctp-intro-close",
      "ctp-start-btn",
      "ctp-gauge-shell",
      "ctp-gauge",
      "ctp-miss",
      "ctp-click-btn",
    ]) {
      assert.ok(findByClass(uiRoot, className), className);
    }
    assert.equal(findAllByClass(uiRoot, "intro-dot").length, 4);
    assert.equal(findById(uiRoot, "result-modal"), null);
    const copy = collectText(uiRoot);
    for (const expected of [
      "🛡️ 몰려드는 악성코드로부터 CORE를 지켜라!",
      "❌ MISS 3회 = 방어 실패",
      "TROJAN — 위장 중엔 못 눌러요, 정체 드러나면 CLICK!",
      "WORM — 놓치면 2마리로 분열!",
      "RANSOM — 놓치면 코어 입력 잠김!",
      "SPYWARE — 그림자 속에 숨어 접근... 가까워질수록 실체를 드러낸다",
    ]) {
      assert.match(copy, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    }

    instance.start({ attemptId: "cs:fidelity" });
    assert.equal(instance.getState().state, "RUNNING");
    assert.equal(instance.getState().gameplayStarted, false);
    assert.equal(instance.getState().spawnedWaves, 0);
    assert.deepEqual(gameplayStarts, []);
    now = 5_000;
    assert.equal(instance.getState().elapsedMs, 0);
    assert.equal(animation.queued, null);

    const intro = findByClass(uiRoot, "click-to-purify__intro");
    const introCloseButton = findByClass(uiRoot, "ctp-intro-close");
    const startButton = findByClass(uiRoot, "ctp-start-btn");
    const clickButton = findByClass(uiRoot, "ctp-click-btn");
    assert.equal(intro.hidden, false);
    assert.equal(introCloseButton.textContent, "✕");
    assert.equal(introCloseButton.disabled, false);
    assert.equal(startButton.hidden, true);
    assert.equal(startButton.disabled, true);
    assert.equal(clickButton.disabled, true);
    introCloseButton.dispatchEvent("click");

    assert.equal(instance.getState().gameplayStarted, false);
    assert.equal(instance.getState().introDismissed, true);
    assert.equal(instance.getState().spawnedWaves, 0);
    assert.equal(intro.hidden, true);
    assert.equal(startButton.hidden, false);
    assert.equal(startButton.disabled, false);
    assert.equal(animation.queued, null);
    assert.deepEqual(gameplayStarts, []);
    startButton.dispatchEvent("click");

    assert.equal(instance.getState().gameplayStarted, true);
    assert.equal(instance.getState().spawnedWaves, 1);
    assert.equal(intro.hidden, true);
    assert.equal(clickButton.disabled, false);
    assert.deepEqual(gameplayStarts, ["cs:fidelity"]);
    startButton.dispatchEvent("click");
    assert.deepEqual(gameplayStarts, ["cs:fidelity"]);
    assert.equal(typeof animation.queued, "function");
    assert.ok(context.calls.some((call) =>
      call[0] === "clearRect" && call[1] === 0 && call[2] === 0 && call[3] === 480 && call[4] === 480));
    assert.ok(context.calls.some((call) =>
      call[0] === "arc" && call[1] === 240 && call[2] === 240 && call[3] === 40));
    assert.ok(context.calls.some((call) =>
      call[0] === "arc" && call[1] === 240 && call[2] === 240 && call[3] === 90));

    assert.equal(instance.completeForDevelopment("CLEAR", "cs:fidelity"), true);
    instance.restart({ attemptId: "cs:fidelity-restart" });
    assert.equal(instance.getState().gameplayStarted, true);
    assert.equal(intro.hidden, true);
    assert.equal(startButton.hidden, true);
    assert.deepEqual(gameplayStarts, ["cs:fidelity", "cs:fidelity-restart"]);

    instance.destroy();
    assert.equal(canvas.width, 960);
    assert.equal(canvas.height, 540);
    assert.equal(canvas.className, "minigame-canvas");
    assert.equal(stage.className, "minigame-stage");
    assert.equal(uiRoot.className, "minigame-ui-root");
    assert.equal(uiRoot.children.length, 0);
    assert.equal(animation.queued, null);
    assert.equal(startButton.listeners.get("click")?.size, 0);
    assert.equal(introCloseButton.listeners.get("click")?.size, 0);
    assert.equal(clickButton.listeners.get("click")?.size, 0);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS counts both WORM split-child misses toward the normal MISS limit", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  const completions = [];
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete(attemptId, candidate) {
      completions.push({ attemptId, candidate });
    },
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    learningWaveCount: 1,
    learningOrder: ["WORM"],
    learningIntervalMs: 0,
    learningApproachDurationMs: 0,
    approachDurationMs: 0,
    perfectWindowMs: 0,
    goodWindowMs: 0,
    missLimit: 3,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:worm-misses" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    now = 1;
    animation.runNext();
    assert.equal(instance.getState().missCount, 1);
    assert.equal(instance.getState().splitChildMissCount, 0);
    assert.equal(instance.getState().activeThreatCount, 2);

    now = 2;
    animation.runNext();
    assert.equal(instance.getState().missCount, 2);
    assert.equal(instance.getState().splitChildMissCount, 1);

    now = 152;
    animation.runNext();
    assert.equal(instance.getState().state, "COMPLETED");
    assert.equal(completions.length, 1);
    assert.equal(completions[0].attemptId, "cs:worm-misses");
    assert.equal(completions[0].candidate.status, "FAIL");
    assert.equal(completions[0].candidate.failureReason, "MISS_LIMIT");
    assert.equal(completions[0].candidate.metrics.missCount, 3);
    assert.equal(completions[0].candidate.metrics.splitChildMissCount, 2);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS dedicated stylesheet preserves the original pair with responsive wrapping", async () => {
  const [documentText, stylesheet, config] = await Promise.all([
    readFile(new URL("../../index.html", import.meta.url), "utf8"),
    readFile(new URL("../../css/click-to-purify.css", import.meta.url), "utf8"),
    readConfig(),
  ]);

  assert.match(documentText, /href="\.\/css\/click-to-purify\.css"/u);
  assert.match(stylesheet, /display:\s*flex/u);
  assert.match(stylesheet, /flex-wrap:\s*wrap/u);
  assert.match(stylesheet, /flex:\s*8 1 480px/u);
  assert.match(stylesheet, /max-width:\s*600px/u);
  assert.match(stylesheet, /flex:\s*5 1 300px/u);
  assert.match(stylesheet, /max-width:\s*375px/u);
  assert.match(stylesheet, /aspect-ratio:\s*1 \/ 1/u);
  assert.match(stylesheet, /@media \(max-width: 600px\)/u);
  assert.match(stylesheet, /orientation:\s*landscape/u);
  assert.match(stylesheet, /max-width:\s*min\(420px, calc\(100dvh - 220px\)\)/u);
  assert.match(stylesheet, /flex:\s*5 1 240px/u);
  assert.match(stylesheet, /@media \(min-width: 900px\) and \(min-height: 760px\)/u);
  assert.match(stylesheet, /--ctp-canvas-size:\s*min\(/u);
  assert.match(stylesheet, /720px/u);
  assert.match(stylesheet, /calc\(\(100cqw - 78px\) \* 8 \/ 13\)/u);
  assert.match(stylesheet, /calc\(100dvh - 220px\)/u);
  assert.match(stylesheet, /--ctp-panel-size:\s*calc\(var\(--ctp-canvas-size\) \* 5 \/ 8\)/u);
  assert.match(stylesheet, /flex-wrap:\s*nowrap/u);
  assert.match(stylesheet, /flex:\s*0 0 var\(--ctp-canvas-size\)/u);
  assert.match(stylesheet, /flex:\s*0 0 var\(--ctp-panel-size\)/u);
  assert.match(stylesheet, /font-size:\s*calc\(var\(--ctp-canvas-size\) \* 16 \/ 480\)/u);
  assert.equal(config.goodScoreWeight, 0.7);
  assert.deepEqual(config.resultPresentation, {
    clear: {
      title: "🎉 정화 성공!",
      description: "정화도: {score}%",
      retryLabel: "RESTART",
    },
    fail: {
      title: "💥 방어 실패",
      description: "MISS {missCount}회로 시스템이 뚫렸습니다",
      retryLabel: "RESTART",
    },
  });
});

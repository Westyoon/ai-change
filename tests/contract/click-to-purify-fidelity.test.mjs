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
      "WORM — 등장하자마자 무조건 2마리로 분열!",
      "RANSOM — 코어에 닿으면 무조건 감염! 연타로 해제하세요",
      "SPYWARE — 짧게 몇 번 깜빡이며 드러나요, 깜빡이는 순간에 CLICK!",
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
    // CLICK 버튼은 스파이웨어 홀드를 지원하려고 click 대신 pointerdown/up/cancel을 씀
    assert.equal(clickButton.listeners.get("pointerdown")?.size, 0);
    assert.equal(clickButton.listeners.get("pointerup")?.size, 0);
    assert.equal(clickButton.listeners.get("pointercancel")?.size, 0);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS worm splits are guaranteed (not miss-triggered), and split-child misses still count toward the shared MISS limit", async () => {
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
    totalWaves: 2,
    mixedTypes: ["WORM"],
    mixedIntervalStartMs: 0,
    mixedIntervalEndMs: 0,
    approachDurationMs: 300,
    wormSplitProgress: 0.5,
    perfectWindowMs: 0,
    goodWindowMs: 0,
    missLimit: 3,
    ransomAmbushCount: 0,
    // 이 테스트는 웜 2마리가 정확히 동시에 등장하는 상황을 의도적으로 재현해요(분열/미스 집계
    // 로직 검증용) — buildWavePlan의 웜 최소 간격(wormMinGapMs) 기본값이 이걸 막아버리니 0으로 꺼둬요.
    wormMinGapMs: 0,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:worm-splits" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    // 웜 2마리가 동시에 등장, 아직 분열 지점(진행률 0.5 = 150ms) 전이라 그대로
    assert.equal(instance.getState().activeThreatCount, 2);

    now = 200; // 150ms 지점을 지나 두 웜 모두 무조건 분열 (미스 아님)
    animation.runNext();
    assert.equal(instance.getState().missCount, 0);
    assert.equal(instance.getState().splitChildMissCount, 0);
    assert.equal(instance.getState().activeThreatCount, 4); // 2마리 -> 자식 4마리

    // 자식들은 새로 시간을 받는 게 아니라 부모의 원래 targetAt(300)을 그대로 물려받아요
    // (분열 지점에서 이어서 다가오는 것이지, 처음부터 다시 시작하는 게 아니니까요)
    now = 301; // 부모의 원래 targetAt(300)을 지나 자식 4마리가 한꺼번에 자동 미스 -> missLimit(3) 초과
    animation.runNext();
    assert.equal(instance.getState().state, "COMPLETED");
    assert.equal(completions.length, 1);
    assert.equal(completions[0].attemptId, "cs:worm-splits");
    assert.equal(completions[0].candidate.status, "FAIL");
    assert.equal(completions[0].candidate.failureReason, "MISS_LIMIT");
    assert.equal(completions[0].candidate.metrics.missCount, 4);
    // splitChildMissCount는 결과 화면에 더 이상 노출하지 않는 내부용 수치라 getState()로 확인해요.
    assert.equal(instance.getState().splitChildMissCount, 4);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS worm defense purification: a caught split child is worth half the wave, both children together are worth the full wave", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete() {},
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    mixedTypes: ["WORM"],
    approachDurationMs: 300,
    wormSplitProgress: 0,
    perfectWindowMs: 200,
    goodWindowMs: 500,
    missLimit: 5,
    ransomAmbushCount: 0,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:worm-purification" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    // 스폰되자마자(진행률 0) 바로 분열해서 자식 2마리 — 둘 다 부모의 targetAt(300)을 그대로 물려받아요
    assert.equal(instance.getState().activeThreatCount, 2);
    assert.equal(instance.getState().purification, 0);

    const clickButton = findByClass(uiRoot, "ctp-click-btn");

    // 자식 하나만 정확한 타이밍(300)에 잡음 -> 웜 한 마리 몫(전체의 1/1칸) 중 절반만 인정 -> 50%
    now = 300;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 1);
    assert.equal(instance.getState().activeThreatCount, 1);
    assert.equal(instance.getState().purification, 50);

    // 남은 자식도 잡음 -> 둘 다 잡았으니 웜 한 마리 몫을 온전히 인정 -> 100%
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 2);
    assert.equal(instance.getState().activeThreatCount, 0);
    assert.equal(instance.getState().purification, 100);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS press efficiency penalty: mashing far more than needed drags purification down even when the final press lands PERFECT", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete() {},
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    mixedTypes: ["SPYWARE"],
    approachDurationMs: 2_000,
    spywareFlickerCount: 1,
    spywareFlickerOnMs: 100, // 깜빡임 구간 [1900,2100] (targetAt 2000 중심)
    perfectWindowMs: 100,
    goodWindowMs: 250,
    missLimit: 5,
    ransomAmbushCount: 0,
    pressEfficiencyAllowance: 1.5, // 이번 판 기대 시도 횟수(1) * 1.5 = 1.5회까지는 페널티 없음
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:press-efficiency" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    const clickButton = findByClass(uiRoot, "ctp-click-btn");

    // 판정 범위 안이지만 하필 깜빡이지 않는 순간에 세 번 연속으로 눌러요(타이밍 안 읽고 마구 누르는 상황)
    for (const t of [1_800, 1_850, 1_880]) {
      now = t;
      clickButton.dispatchEvent("pointerdown");
    }
    assert.equal(instance.getState().missCount, 0); // 꺼져있을 때 누른 거라 미스는 아님
    assert.equal(instance.getState().attemptCount, 3);

    // 마지막엔 깜빡이는 순간(1950)에 정확히 눌러서 PERFECT로 잡음
    now = 1_950;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 1);
    assert.equal(instance.getState().attemptCount, 4);
    assert.equal(instance.getState().expectedAttempts, 1);

    // 원래대로면(딱 한 번에 PERFECT) 정화도 100%가 맞지만, 필요한 것보다 4배(허용치 1.5회 대비)나
    // 시도했으니 그만큼 깎여요: 100 * (1.5/4) = 37.5 -> 반올림 38%
    assert.equal(instance.getState().purification, 38);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS narrow judgment window: a well-timed double click clears both split children back-to-back, but a lazily-timed press outside the window is ignored", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete() {},
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    mixedTypes: ["WORM"],
    approachDurationMs: 300,
    wormSplitProgress: 0,
    perfectWindowMs: 100,
    goodWindowMs: 250,
    missLimit: 5,
    ransomAmbushCount: 0,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:narrow-window" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    // 스폰되자마자 바로 분열해서 자식 2마리, 둘 다 targetAt(300)을 공유해요
    assert.equal(instance.getState().activeThreatCount, 2);

    const clickButton = findByClass(uiRoot, "ctp-click-btn");

    // 쿨다운 같은 건 없어요 — 같은 순간에 연속으로 두 번 눌러도 둘 다 그대로 성공해요
    // (좁아진 판정 구간 안에서 정확히 두 번 눌러야 하니, 이게 오히려 실력을 요구하는 지점이에요)
    now = 300;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 1);
    assert.equal(instance.getState().activeThreatCount, 1);
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 2);
    assert.equal(instance.getState().activeThreatCount, 0);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS narrow judgment window: a press well outside the tightened good window still does nothing", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete() {},
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    mixedTypes: ["WORM"],
    approachDurationMs: 1_000,
    wormSplitProgress: 1, // 도착 직전까지 분열 안 함 — 이 테스트에선 그냥 단일 목표로 남아있게
    perfectWindowMs: 100,
    goodWindowMs: 250,
    missLimit: 5,
    ransomAmbushCount: 0,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:narrow-window-far" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    const clickButton = findByClass(uiRoot, "ctp-click-btn");

    // targetAt(1000)에서 400ms 떨어짐 — 예전 goodWindowMs(500)라면 판정까지 됐겠지만, 좁아진
    // goodWindowMs(250)에서는 아예 범위 밖이라 클릭이 무시돼요(미스도 아님, 그냥 아무 일도 안 일어남)
    now = 600;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().missCount, 0);
    assert.equal(instance.getState().perfectCount, 0);
    assert.equal(instance.getState().activeThreatCount, 1);
  } finally {
    instance.destroy();
    animation.restore();
  }
});

test("CS spyware: far press and close-but-not-flickering presses are both ignored (not a MISS), a press during a flicker scores", async () => {
  const animation = installAnimationFrameStub();
  const baseConfig = await readConfig();
  const { canvas, uiRoot } = createCanvasEnvironment();
  let now = 0;
  const instance = createMiniGame({
    canvas,
    uiRoot,
    clock: { now: () => now },
    onComplete() {},
  });
  const config = {
    ...baseConfig,
    totalWaves: 1,
    mixedTypes: ["SPYWARE"],
    approachDurationMs: 2_000,
    perfectWindowMs: 200,
    goodWindowMs: 500,
    spywareFlickerCount: 2,
    spywareFlickerOnMs: 100,
    missLimit: 5,
    ransomAmbushCount: 0,
  };

  try {
    await instance.init(config);
    instance.start({ attemptId: "cs:spyware-flicker" });
    findByClass(uiRoot, "ctp-intro-close").dispatchEvent("click");
    // wave1(spawnedAt 0, targetAt 2000) 등장 — 깜빡임 구간은 [900,1000]과 [1900,2100]
    // (마지막은 targetAt을 중심으로 앞뒤에 걸쳐 있어요 — 코어에 닿은 직후에 눌러도 클릭이 먹게)
    findByClass(uiRoot, "ctp-start-btn").dispatchEvent("click");

    const clickButton = findByClass(uiRoot, "ctp-click-btn");

    // 1) 목표 타이밍(2000)에서 1500ms나 떨어진 시점(=goodWindowMs 500보다 멀리)에 누르면 아무 일도 안 일어남
    now = 500;
    clickButton.dispatchEvent("pointerdown");
    clickButton.dispatchEvent("pointerup");
    assert.equal(instance.getState().missCount, 0);
    assert.equal(instance.getState().perfectCount, 0);
    assert.equal(instance.getState().activeThreatCount, 1); // 미스도 아니고 그대로 남아있음

    // 2) 판정 링 근처(errorMs 300, goodWindowMs 이내)지만 하필 깜빡이는 구간이 아닌 1700ms에 누름
    //    -> MISS가 아니라 그냥 클릭이 안 먹은 걸로 처리됨: 미스도 안 늘고, 위협도 그대로 살아있어서 다시 노릴 수 있음
    now = 1_700;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().missCount, 0);
    assert.equal(instance.getState().perfectCount, 0);
    assert.equal(instance.getState().activeThreatCount, 1);

    // 3) 코어에 막 닿은 직후(targetAt 2000에서 50ms 지난 2050ms)에 눌러도 여전히 깜빡이는 중이라 PERFECT.
    //    (예전엔 마지막 깜빡임이 targetAt에서 딱 끊겨서, 닿는 걸 보고 반응해 누르면 클릭이 안 먹는 버그가 있었어요)
    now = 2_050;
    clickButton.dispatchEvent("pointerdown");
    assert.equal(instance.getState().perfectCount, 1);
    assert.equal(instance.getState().missCount, 0); // 앞선 무시된 클릭들은 미스로 안 남음
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
      reasonDescriptions: {
        MISS_LIMIT: "MISS {missCount}회로 시스템이 뚫렸습니다",
        LOW_PURIFICATION: "위협은 다 막았지만 정화도가 부족해요 (정화도 {score}%)",
      },
    },
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG } from "../../js/minigames/AIDS/config.js";
import {
  AIDS_LOGICAL_HEIGHT,
  AIDS_LOGICAL_WIDTH,
} from "../../js/minigames/AIDS/dom-builder.js";
import { createMiniGame } from "../../js/minigames/AIDS/index.js";
import { finalizeRelease } from "../../js/minigames/AIDS/eggs.js";
import { stepFrame } from "../../js/minigames/AIDS/game-loop.js";
import {
  AIDS_BASE_FIELD_HEIGHT,
  AIDS_BASE_FIELD_WIDTH,
  createFieldLayout,
  layoutPlatforms,
  platformOuterDimensions,
  relayoutPlatforms,
} from "../../js/minigames/AIDS/platforms.js";
import {
  platformRestingY,
  stepFalling,
  stepRolling,
} from "../../js/minigames/AIDS/physics.js";

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return this.element.className.split(/\s+/u).filter(Boolean);
  }

  contains(className) {
    return this.values().includes(className);
  }

  add(...classNames) {
    this.element.className = [...new Set([...this.values(), ...classNames])].join(" ");
  }

  remove(...classNames) {
    const removed = new Set(classNames);
    this.element.className = this.values().filter((name) => !removed.has(name)).join(" ");
  }

  toggle(className, force) {
    const next = force ?? !this.contains(className);
    if (next) this.add(className);
    else this.remove(className);
    return next;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.textContent = "";
    this.type = "";
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
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

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight };
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createDom({ width, height }) {
  const observers = [];
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const ownerDocument = {
    defaultView: { ResizeObserver: FakeResizeObserver },
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
    getElementById() {
      return null;
    },
  };
  ownerDocument.head = new FakeElement("head", ownerDocument);
  const uiRoot = new FakeElement("div", ownerDocument);
  uiRoot.className = "minigame-ui-root";
  uiRoot.clientWidth = width;
  uiRoot.clientHeight = height;
  const stage = new FakeElement("div", ownerDocument);
  stage.className = "minigame-stage";
  stage.append(uiRoot);
  const frameHost = new FakeElement("section", ownerDocument);
  frameHost.className = "scene minigame-frame";
  frameHost.append(stage);
  return { frameHost, observers, ownerDocument, stage, uiRoot };
}

test("AIDS mounts a 390x740 logical frame, keeps short-host controls usable, and cleans up", async () => {
  const { frameHost, observers, ownerDocument, stage, uiRoot } = createDom({ width: 195, height: 370 });
  const instance = createMiniGame({ uiRoot });

  await instance.init(DEFAULT_CONFIG);

  assert.equal(AIDS_LOGICAL_WIDTH, 390);
  assert.equal(AIDS_LOGICAL_HEIGHT, 740);
  assert.equal(uiRoot.className, "minigame-ui-root aids-ui-root");
  assert.equal(stage.className, "minigame-stage aids-stage");
  assert.equal(frameHost.className, "scene minigame-frame aids-frame-host");
  assert.equal(uiRoot.children.length, 1);

  const viewport = uiRoot.children[0];
  const frame = viewport.children[0];
  const root = frame.children[0];
  assert.equal(viewport.className, "aids-frame-viewport");
  assert.equal(frame.className, "aids-logical-frame");
  assert.equal(root.className, "aids-root");
  assert.match(
    ownerDocument.head.children[0].textContent,
    /\.aids-ui-root\s*\{[^}]*overflow-y:auto[^}]*align-items:safe center/su,
  );
  assert.equal(frame.style.width, "390px");
  assert.equal(frame.style.height, "740px");
  assert.equal(frame.style.transform, "scale(0.5)");
  assert.equal(viewport.style.width, "195px");
  assert.equal(viewport.style.height, "370px");
  assert.equal(viewport.dataset.scale, "0.5");

  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].observed, [uiRoot]);

  uiRoot.clientWidth = 568;
  uiRoot.clientHeight = 190;
  observers[0].callback();
  assert.equal(frame.style.transform, "scale(0.7)");
  assert.equal(viewport.style.width, "273px");
  assert.equal(viewport.style.height, "518px");
  assert.equal(viewport.dataset.layout, "fixed");

  uiRoot.clientWidth = 526.5;
  uiRoot.clientHeight = 999;
  observers[0].callback();
  assert.equal(frame.style.transform, "scale(1.35)");
  assert.equal(viewport.style.width, "526.5px");
  assert.ok(Math.abs(Number.parseFloat(viewport.style.height) - 999) < 1e-9);

  uiRoot.clientWidth = 1_200;
  uiRoot.clientHeight = 700;
  observers[0].callback();
  assert.equal(uiRoot.classList.contains("aids-desktop-layout"), true);
  assert.equal(frame.style.width, "100%");
  assert.equal(frame.style.height, "100%");
  assert.equal(frame.style.transform, "none");
  assert.equal(viewport.style.width, "100%");
  assert.equal(viewport.style.height, "100%");
  assert.equal(viewport.dataset.scale, "fluid");
  assert.equal(viewport.dataset.layout, "fluid");

  instance.destroy();

  assert.equal(observers[0].disconnected, true);
  assert.equal(uiRoot.className, "minigame-ui-root");
  assert.equal(stage.className, "minigame-stage");
  assert.equal(frameHost.className, "scene minigame-frame");
  assert.equal(uiRoot.children.length, 0);
  assert.equal(ownerDocument.head.children.length, 0);

  uiRoot.clientWidth = 195;
  uiRoot.clientHeight = 370;
  observers[0].callback();
  assert.equal(frame.style.transform, "none");
});

test("AIDS mobile field keeps the original dimensions and physics values", () => {
  assert.equal(AIDS_BASE_FIELD_WIDTH, 362);
  assert.equal(AIDS_BASE_FIELD_HEIGHT, 490);

  const layout = createFieldLayout(
    DEFAULT_CONFIG,
    AIDS_BASE_FIELD_WIDTH,
    AIDS_BASE_FIELD_HEIGHT,
  );
  assert.equal(layout.horizontalScale, 1);
  assert.equal(layout.verticalScale, 1);
  assert.equal(layout.physics.platformHalfLen, DEFAULT_CONFIG.physics.platformHalfLen);
  assert.equal(layout.physics.gravity, DEFAULT_CONFIG.physics.gravity);
  assert.equal(layout.physics.releaseSpeedThreshold, 60);
  assert.equal(layout.physics.releaseSpeed, 120);
  assert.equal(layout.physics.missMargin, 60);
});

test("AIDS desktop platform visual and rolling collision use the same responsive edge", () => {
  assert.deepEqual(platformOuterDimensions(DEFAULT_CONFIG.physics.platformHalfLen), {
    width: 84,
    marginLeft: -42,
  });

  const layout = createFieldLayout(
    DEFAULT_CONFIG,
    AIDS_BASE_FIELD_WIDTH * 2,
    AIDS_BASE_FIELD_HEIGHT * 2,
  );
  assert.equal(layout.physics.platformHalfLen, 80);
  assert.equal(layout.physics.rollAccel, DEFAULT_CONFIG.physics.rollAccel * 2);
  assert.equal(layout.physics.maxRollSpeed, DEFAULT_CONFIG.physics.maxRollSpeed * 2);
  assert.equal(layout.physics.fallSteerAccel, DEFAULT_CONFIG.physics.fallSteerAccel * 2);
  assert.equal(layout.physics.maxFallSteerSpeed, DEFAULT_CONFIG.physics.maxFallSteerSpeed * 2);
  assert.equal(layout.physics.releaseSpeedThreshold, 120);
  assert.equal(layout.physics.releaseSpeed, 240);
  assert.equal(layout.physics.missMargin, 120);
  assert.deepEqual(platformOuterDimensions(layout.physics.platformHalfLen), {
    width: 164,
    marginLeft: -82,
  });

  const makeEgg = (x) => ({
    x,
    y: 0,
    vx: 0,
    rollTime: 0,
    platform: { x: 0, y: 100 },
  });
  assert.equal(stepRolling(makeEgg(79.99), 0, DEFAULT_CONFIG, "right", layout.physics), null);
  assert.equal(stepRolling(makeEgg(80), 0, DEFAULT_CONFIG, "right", layout.physics), "right");

  const releasingEgg = {
    phase: "rolling",
    platform: { rowIndex: DEFAULT_CONFIG.platformRows.length - 1, lane: "center" },
    vx: 0,
    vy: 5,
  };
  finalizeRelease({ tilt: "right" }, releasingEgg, "right", DEFAULT_CONFIG, layout.physics);
  assert.equal(releasingEgg.vx, 240);
  assert.equal(releasingEgg.target, "box");
  assert.throws(() => platformOuterDimensions(0), /platformHalfLen/u);
});

test("AIDS live desktop relayout preserves platform and active egg references", () => {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  const field = new FakeElement("div", ownerDocument);
  field.clientWidth = AIDS_BASE_FIELD_WIDTH;
  field.clientHeight = AIDS_BASE_FIELD_HEIGHT;
  const platformsContainer = new FakeElement("div", ownerDocument);
  const refs = { field, platformsContainer };
  const state = { tilt: "right", platforms: [], eggs: [] };

  layoutPlatforms(refs, DEFAULT_CONFIG, state);
  const platform = state.platforms[0];
  const originalXPct = platform.xPct;
  const eggElement = new FakeElement("div", ownerDocument);
  const egg = {
    done: false,
    phase: "falling",
    x: 100,
    y: 200,
    vx: 60,
    vy: 100,
    el: eggElement,
    platform,
    targetPlatform: platform,
  };
  state.eggs.push(egg);
  const rollingEggElement = new FakeElement("div", ownerDocument);
  const rollingEgg = {
    done: false,
    phase: "rolling",
    x: platform.x,
    y: platformRestingY(platform, platform.x, DEFAULT_CONFIG, state.tilt),
    vx: 20,
    vy: 0,
    el: rollingEggElement,
    platform,
    targetPlatform: platform,
  };
  state.eggs.push(rollingEgg);

  field.clientWidth = AIDS_BASE_FIELD_WIDTH * 2;
  field.clientHeight = AIDS_BASE_FIELD_HEIGHT * 1.5;
  assert.equal(relayoutPlatforms(refs, DEFAULT_CONFIG, state), true);

  assert.equal(state.platforms[0], platform);
  assert.equal(platform.xPct, originalXPct);
  assert.equal(egg.platform, platform);
  assert.equal(egg.targetPlatform, platform);
  assert.equal(egg.x, 200);
  assert.equal(egg.y, 300);
  assert.equal(egg.vx, 120);
  assert.equal(egg.vy, 150);
  assert.equal(
    rollingEgg.y,
    platformRestingY(
      platform,
      rollingEgg.x,
      DEFAULT_CONFIG,
      state.tilt,
      state.fieldLayout.physics,
    ),
  );
  assert.equal(state.fieldLayout.physics.platformHalfLen, 80);
  assert.equal(platform.el.style.width, "164px");
  assert.equal(platform.el.style.marginLeft, "-82px");
});

test("AIDS rolling stays radius-correct on both downhill platform surfaces", () => {
  const platform = { x: 100, y: 200 };
  const angle = (DEFAULT_CONFIG.physics.tiltAngleDeg * Math.PI) / 180;

  for (const [tilt, direction] of [["left", -1], ["right", 1]]) {
    const startY = platformRestingY(platform, platform.x, DEFAULT_CONFIG, tilt);
    assert.equal(
      startY,
      platform.y - DEFAULT_CONFIG.physics.surfaceOffset - DEFAULT_CONFIG.physics.eggRadius,
    );

    const egg = {
      x: platform.x,
      y: startY,
      vx: 0,
      vy: 0,
      rollTime: 0,
      platform,
    };

    assert.equal(stepRolling(egg, 0, DEFAULT_CONFIG, tilt), null);
    assert.equal(egg.y, startY, `${tilt} must not jump on its first rolling frame`);

    assert.equal(stepRolling(egg, 0.1, DEFAULT_CONFIG, tilt), null);
    assert.equal(Math.sign(egg.x - platform.x), direction);
    assert.ok(egg.y > startY, `${tilt} must travel downhill`);
    const expectedY = platform.y
      - DEFAULT_CONFIG.physics.surfaceOffset
      - DEFAULT_CONFIG.physics.eggRadius
      + (egg.x - platform.x) * Math.tan(direction * angle);
    assert.ok(Math.abs(egg.y - expectedY) < 1e-9);
    assert.ok(Math.abs(egg.vy - egg.vx * Math.tan(direction * angle)) < 1e-9);
  }
});

test("AIDS falling preserves horizontal momentum while its projected landing is safe", () => {
  const egg = {
    x: 80,
    y: 0,
    vx: 20,
    vy: 0,
    target: "platform",
    targetPlatform: { x: 100, y: 200 },
  };
  const dt = 0.016;

  stepFalling(egg, dt, DEFAULT_CONFIG, 362, 490);

  assert.ok(Math.abs(egg.vx - 20) < 1e-9);
  assert.ok(Math.abs(egg.x - 80.32) < 1e-9);
  assert.ok(Math.abs(egg.vy - DEFAULT_CONFIG.physics.gravity * dt) < 1e-9);
  assert.ok(Math.abs(egg.y - DEFAULT_CONFIG.physics.gravity * dt * dt) < 1e-9);
});

test("AIDS keeps downward velocity when an egg passes a platform edge", () => {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  const field = new FakeElement("div", ownerDocument);
  field.clientWidth = 400;
  field.clientHeight = 300;
  const timerEl = new FakeElement("div", ownerDocument);
  const missedPlatform = { rowIndex: 0, lane: "center", x: 100, y: 100 };
  const nextPlatform = { rowIndex: 1, lane: "right", x: 280, y: 180 };
  const eggElement = new FakeElement("div", ownerDocument);
  const egg = {
    type: "de",
    el: eggElement,
    x: 150,
    y: 80,
    vx: 50,
    vy: 100,
    phase: "falling",
    target: "platform",
    targetPlatform: missedPlatform,
    platform: null,
    rollTime: 0,
    finalDir: null,
    done: false,
  };
  const state = {
    tilt: "right",
    life: DEFAULT_CONFIG.initialLives,
    eggs: [egg],
    platforms: [missedPlatform, nextPlatform],
    nextSpawnAtSec: Number.POSITIVE_INFINITY,
    lastElapsedMs: 0,
  };

  stepFrame({ state, config: DEFAULT_CONFIG, refs: { field, timerEl }, elapsedMs: 32 });

  assert.equal(egg.phase, "falling");
  assert.equal(egg.platform, missedPlatform);
  assert.equal(egg.targetPlatform, nextPlatform);
  assert.equal(egg.target, "platform");
  assert.equal(egg.vx, 50);
  assert.ok(Math.abs(egg.vy - 116) < 1e-9);
  assert.ok(egg.y > 80);
});

test("AIDS third-row outward releases route to their directional result", () => {
  for (const [lane, exitSide, velocity] of [
    ["left", "left", -100],
    ["right", "right", 100],
  ]) {
    const egg = {
      phase: "rolling",
      platform: { rowIndex: 2, lane },
      targetPlatform: { rowIndex: 3, lane: "center" },
      vx: velocity,
      vy: 0,
    };

    finalizeRelease({ tilt: exitSide, platforms: [] }, egg, exitSide, DEFAULT_CONFIG);

    assert.equal(egg.phase, "falling");
    assert.equal(egg.finalDir, exitSide);
    assert.equal(egg.target, "box");
    assert.equal(egg.targetPlatform, null);
    assert.equal(egg.vx, velocity);
    assert.ok(egg.vy > 0, `${exitSide} release must continue downhill before gravity`);
  }
});

test("AIDS crossing either field edge classifies by side without requiring box overlap", () => {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  const field = new FakeElement("div", ownerDocument);
  field.clientWidth = 400;
  field.clientHeight = 300;
  const boxLeft = new FakeElement("div", ownerDocument);
  const boxRight = new FakeElement("div", ownerDocument);
  const heartsEl = new FakeElement("div", ownerDocument);
  for (let index = 0; index < DEFAULT_CONFIG.initialLives; index += 1) {
    heartsEl.appendChild(new FakeElement("div", ownerDocument));
  }
  const timerEl = new FakeElement("div", ownerDocument);
  const refs = { field, boxLeft, boxRight, heartsEl, timerEl };
  const edgeEgg = (type, x) => {
    const el = new FakeElement("div", ownerDocument);
    field.appendChild(el);
    return {
      type,
      el,
      x,
      y: 80,
      vx: 0,
      vy: 0,
      phase: "falling",
      target: "box",
      targetPlatform: null,
      platform: null,
      rollTime: 0,
      finalDir: null,
      done: false,
    };
  };
  const state = {
    life: DEFAULT_CONFIG.initialLives,
    eggs: [
      edgeEgg("in", 0),
      edgeEgg("de", field.clientWidth),
      edgeEgg("de", 0),
      edgeEgg("in", field.clientWidth),
    ],
    nextSpawnAtSec: Number.POSITIVE_INFINITY,
    lastElapsedMs: 0,
    correctCount: 0,
    wrongCount: 0,
    lostCount: 0,
  };

  assert.deepEqual(
    stepFrame({ state, config: DEFAULT_CONFIG, refs, elapsedMs: 0 }),
    { terminal: null },
  );
  assert.equal(state.correctCount, 2);
  assert.equal(state.wrongCount, 2);
  assert.equal(state.lostCount, 0);
  assert.equal(state.life, DEFAULT_CONFIG.initialLives - 2);
  assert.deepEqual(state.eggs, []);
});

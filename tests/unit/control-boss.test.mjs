import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EventBus } from "../../js/core/event-bus.js";
import { INPUT_ACTIONS } from "../../js/core/input-manager.js";
import { validateMiniGameCandidate } from "../../js/core/config-validator.js";
import {
  CONTROL_BOSS_BULLET_RADIUS,
  CONTROL_BOSS_FAILURES,
  CONTROL_BOSS_PHASES,
  CONTROL_BOSS_STATES,
  ControlBossEncounter,
  ControlBossView,
  calcControlBossAttackDamage,
  calcControlBossIncomingDamage,
  calcControlBossMaxHp,
  createBattle,
  resolveControlBossConfig,
} from "../../js/battle/postgame/bosses/control-boss/index.js";

const projectRoot = new URL("../../", import.meta.url);
const configSource = JSON.parse(await readFile(new URL("data/battle/control-boss.json", projectRoot), "utf8"));
const config = resolveControlBossConfig(configSource);

function nearBossBounds() {
  return { x: 209, y: 121, width: config.player.width, height: config.player.height };
}

test("Control Boss config preserves the prototype constants and explicit account-stat formulas", () => {
  assert.deepEqual(config.world.bounds, { x: 0, y: 0, width: 450, height: 800 });
  assert.equal(config.boss.maxHp, 1000);
  assert.equal(config.boss.maxShield, 500);
  assert.equal(config.boss.phase2CastSec, 3);
  assert.equal(config.boss.phase3DurationSec, 30);
  assert.equal(config.boss.groggyDurationSec, 10);
  assert.equal(config.boss.groggyDirectDamageRate, 0.2);
  assert.equal(config.boss.attackIntervalSec, 1.3);
  assert.equal(config.boss.bulletSpeed, 240);
  assert.equal(config.boss.bulletDamage, 15);
  assert.equal(config.gimmick.collapsedTileCount, 2);
  assert.equal(config.gimmick.sequenceLength, 4);

  assert.equal(calcControlBossAttackDamage(1, config.player), 40);
  assert.equal(calcControlBossAttackDamage(3, config.player), 44);
  assert.equal(calcControlBossMaxHp(1, config.player), 100);
  assert.equal(calcControlBossMaxHp(3, config.player), 120);
  assert.equal(calcControlBossIncomingDamage(15, 1, config.player), 15);
  assert.equal(calcControlBossIncomingDamage(15, 3, config.player), 13);
  assert.throws(
    () => resolveControlBossConfig({ gimmick: { collapsedTileCount: 8, sequenceLength: 4 } }),
    /enough tiles/u,
  );

  const mutableControls = { pc: { attack: ["Space"] } };
  const isolated = resolveControlBossConfig({ controls: mutableControls });
  assert.notEqual(isolated.controls, mutableControls);
  assert.equal(Object.isFrozen(mutableControls), false, "resolving config must not freeze the caller's object graph");
  mutableControls.pc.attack.push("Enter");
  assert.deepEqual(isolated.controls.pc.attack, ["Space"]);
});

test("Control Boss keeps the four-phase shield, cover, altar and groggy rules", () => {
  const completions = [];
  const encounter = new ControlBossEncounter({
    config,
    random: () => 0.5,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "control-boss:phase-run" });
  encounter.setPlayerBounds(nearBossBounds());

  for (let index = 0; index < 13; index += 1) encounter.attack();
  let snapshot = encounter.getSnapshot();
  assert.equal(snapshot.currentShield, 0);
  assert.equal(snapshot.phase, CONTROL_BOSS_PHASES.INSTANT_KILL);

  encounter.setPlayerBounds(config.world.coverZone);
  encounter.tick(config.boss.phase2CastSec * 1000);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, CONTROL_BOSS_PHASES.ALTAR);
  assert.equal(snapshot.collapsedTileIds.length, 2);
  assert.equal(snapshot.platesSequence.length, 4);
  assert.equal(new Set([...snapshot.collapsedTileIds, ...snapshot.platesSequence]).size, 6);

  for (const tileId of snapshot.platesSequence) encounter.activatePlate(tileId);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, CONTROL_BOSS_PHASES.GROGGY);
  assert.equal(snapshot.currentHp, 800, "altar success removes 20% of max boss HP");

  encounter.setPlayerBounds(nearBossBounds());
  for (let index = 0; index < 20; index += 1) encounter.attack();
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.state, CONTROL_BOSS_STATES.COMPLETED);
  assert.equal(snapshot.currentHp, 0);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].attemptId, "control-boss:phase-run");
  assert.equal(completions[0].candidate.status, "CLEAR");
  assert.equal(completions[0].candidate.failureReason, null);
  assert.equal(validateMiniGameCandidate(completions[0].candidate).valid, true);
  assert.equal(encounter.attack(), false);
  encounter.tick(10_000);
  assert.equal(completions.length, 1, "one attempt completes exactly once");
});

test("Control Boss failure, pause, restart, fall-hole and stun paths are attempt scoped", () => {
  const completions = [];
  const encounter = new ControlBossEncounter({
    config,
    random: () => 0.25,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "control-boss:fail-cover" });
  encounter.enterPhase2();
  encounter.setPlayerBounds({ x: 0, y: 700, width: 32, height: 42 });
  encounter.tick(3000);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.failureReason, CONTROL_BOSS_FAILURES.INSTANT_KILL);
  assert.equal(validateMiniGameCandidate(completions[0].candidate).valid, true);

  encounter.restart({ attemptId: "control-boss:stun" });
  encounter.enterPhase3();
  let snapshot = encounter.getSnapshot();
  const firstPlate = snapshot.platesSequence[0];
  const wrongPlate = snapshot.platesSequence[2];
  assert.equal(encounter.activatePlate(firstPlate), true);
  assert.equal(encounter.getSnapshot().tiles.find((tile) => tile.id === firstPlate).cleared, true);
  assert.equal(encounter.activatePlate(wrongPlate), false);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.isStunned, true);
  assert.equal(snapshot.currentPlateStep, 0);
  assert.equal(
    snapshot.tiles.some((tile) => tile.cleared),
    false,
    "a wrong plate resets both the rule step and every cleared tile marker",
  );
  assert.equal(encounter.pause(), true);
  encounter.tick(1000);
  assert.equal(encounter.getSnapshot().stunRemainingMs, 1000, "paused encounters do not consume timers");
  assert.equal(encounter.resume(), true);
  encounter.tick(1000);
  assert.equal(encounter.getSnapshot().isStunned, false);

  snapshot = encounter.getSnapshot();
  const hole = snapshot.tiles.find((tile) => tile.id === snapshot.collapsedTileIds[0]);
  encounter.setPlayerBounds(hole.bounds);
  encounter.tick(0);
  assert.equal(completions.length, 2);
  assert.equal(completions[1].attemptId, "control-boss:stun");
  assert.equal(completions[1].candidate.failureReason, CONTROL_BOSS_FAILURES.FALL_HOLE);
  encounter.destroy();
  encounter.destroy();
  assert.equal(encounter.getSnapshot().state, CONTROL_BOSS_STATES.DESTROYED);
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

  add(...names) {
    this.element.className = [...new Set([...this.values(), ...names])].join(" ");
  }

  remove(...names) {
    const removed = new Set(names);
    this.element.className = this.values().filter((name) => !removed.has(name)).join(" ");
  }

  contains(name) {
    return this.values().includes(name);
  }

  toggle(name, force) {
    const active = force ?? !this.contains(name);
    if (active) this.add(name);
    else this.remove(name);
    return active;
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      if (child == null) continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
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
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return true;
  }

  setPointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 96, height: 96 };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const visit = (node) => {
      for (const child of node.children) {
        if (className ? child.classList.contains(className) : child.tagName.toLowerCase() === selector) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  get firstElementChild() {
    return this.children[0] ?? null;
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

  emit(event) {
    for (const listener of [...this.listeners]) listener(event);
  }
}

function installFrameHarness() {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let nextId = 0;
  const callbacks = new Map();
  const documentRef = {
    hidden: false,
    createElement(tagName) {
      const node = new FakeElement(tagName);
      node.ownerDocument = documentRef;
      return node;
    },
  };
  globalThis.document = undefined;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  return {
    callbacks,
    document: documentRef,
    step(timestamp) {
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) callback(timestamp);
    },
    restore() {
      globalThis.document = previous.document;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    },
  };
}

test("Control Boss hazards share one logical size between collision and responsive rendering", () => {
  const hazardConfig = resolveControlBossConfig({
    ...configSource,
    boss: {
      ...configSource.boss,
      phase1FirstAttackDelaySec: 0,
      shockwaveInitialDelaySec: 0,
    },
  });

  const edgeHit = new ControlBossEncounter({ config: hazardConfig });
  edgeHit.init();
  edgeHit.start({ attemptId: "control-boss:bullet-edge" });
  edgeHit.setPlayerBounds({ x: 231, y: 115, width: 32, height: 42 });
  const edgeSnapshot = edgeHit.tick(0);
  assert.equal(
    edgeSnapshot.playerHp,
    edgeSnapshot.playerMaxHp - hazardConfig.boss.bulletDamage,
    "a visible projectile touching the player at its logical radius is a hit",
  );

  const outsideMiss = new ControlBossEncounter({ config: hazardConfig });
  outsideMiss.init();
  outsideMiss.start({ attemptId: "control-boss:bullet-outside" });
  outsideMiss.setPlayerBounds({ x: 232, y: 115, width: 32, height: 42 });
  const outsideSnapshot = outsideMiss.tick(0);
  assert.equal(
    outsideSnapshot.playerHp,
    outsideSnapshot.playerMaxHp,
    "a projectile one logical pixel beyond its visible radius is not a hit",
  );

  const encounter = new ControlBossEncounter({ config: hazardConfig });
  encounter.init();
  encounter.start({ attemptId: "control-boss:hazard-render" });
  let snapshot = encounter.tick(0);
  assert.equal(snapshot.bullets.length, 1);
  assert.equal(snapshot.bullets[0].radius, CONTROL_BOSS_BULLET_RADIUS);

  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const view = new ControlBossView({ config: hazardConfig, document: frames.document });
    view.mount(root);
    view.render(snapshot);

    const bullet = root.querySelector(".control-boss-bullet");
    assert.ok(bullet);
    assert.equal(
      bullet.style.width,
      `${(CONTROL_BOSS_BULLET_RADIUS * 2 / hazardConfig.world.bounds.width) * 100}%`,
    );
    assert.equal(
      bullet.style.height,
      `${(CONTROL_BOSS_BULLET_RADIUS * 2 / hazardConfig.world.bounds.height) * 100}%`,
    );

    encounter.enterPhase3();
    encounter.setPlayerBounds({ x: 10, y: 700, width: 32, height: 42 });
    encounter.tick(0);
    snapshot = encounter.tick(100);
    view.render(snapshot);
    const shockwave = root.querySelector(".control-boss-shockwave");
    assert.ok(shockwave);

    const wave = snapshot.shockwaves[0];
    const thickness = hazardConfig.boss.shockwaveThickness;
    const outerRadius = wave.radius + thickness;
    assert.equal(shockwave.style.width, `${(outerRadius * 2 / hazardConfig.world.bounds.width) * 100}%`);
    assert.equal(shockwave.style.height, `${(outerRadius * 2 / hazardConfig.world.bounds.height) * 100}%`);
    assert.equal(
      shockwave.style["--control-boss-shockwave-inner"],
      `${(Math.max(0, wave.radius - thickness) / outerRadius) * 100}%`,
      "the rendered band spans the same radius +/- thickness used by collision",
    );

    view.destroy();
    assert.equal(root.children.length, 0);
  } finally {
    encounter.destroy();
    edgeHit.destroy();
    outsideMiss.destroy();
    frames.restore();
  }
});

test("Control Boss shockwave gradient measures stops from the visible circle radius", async () => {
  const stylesheet = await readFile(
    new URL("../../css/control-boss.css", import.meta.url),
    "utf8",
  );
  const rule = stylesheet.match(
    /(?:^|\})\s*\.control-boss-shockwave\s*\{([^}]*)\}/u,
  )?.[1] ?? "";
  assert.match(
    rule,
    /radial-gradient\(\s*(?:circle closest-side|closest-side circle),/u,
  );
});

test("createBattle satisfies lifecycle, PC/mobile input and complete cleanup without an internal result modal", async () => {
  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const events = new EventBus();
    const input = new FakeInput();
    const battle = createBattle({ root, events, input });
    await battle.init(configSource);
    assert.equal(root.children.length, 1);
    assert.ok(root.querySelector(".control-boss-world"));
    assert.ok(root.querySelector(".control-boss-joystick"));
    assert.ok(root.querySelector(".control-boss-attack"));
    assert.equal(root.querySelector(".control-boss-modal"), null);

    battle.start({ attemptId: "control-boss:lifecycle-1" });
    frames.step(0);
    const initialX = battle.getState().playerBounds.x;
    input.vector = { x: 1, y: 0 };
    frames.step(100);
    assert.ok(battle.getState().playerBounds.x > initialX, "injected PC movement reaches CharacterSystem");
    input.vector = { x: 0, y: 0 };

    input.emit({
      action: INPUT_ACTIONS.CONFIRM,
      phase: "press",
      source: "keyboard",
      originalEvent: { code: "Space" },
    });
    frames.step(200);
    input.emit({
      action: INPUT_ACTIONS.CONFIRM,
      phase: "release",
      source: "keyboard",
      originalEvent: { code: "Space" },
    });
    const afterKeyboard = battle.getState().metrics.attacks;
    assert.equal(afterKeyboard, 1, "Space produces one attack command");

    root.querySelector(".control-boss-attack").dispatchEvent({ type: "click", detail: 0 });
    frames.step(300);
    assert.equal(battle.getState().metrics.attacks, 2, "accessible/mobile attack button produces one command");

    assert.equal(battle.pause("MANUAL"), true);
    assert.equal(battle.getState().state, CONTROL_BOSS_STATES.PAUSED);
    assert.equal(battle.resume(), true);
    assert.equal(battle.getState().state, CONTROL_BOSS_STATES.RUNNING);
    assert.equal(battle.restart({ attemptId: "control-boss:lifecycle-2" }), true);
    assert.equal(battle.getState().attemptId, "control-boss:lifecycle-2");
    assert.equal(root.children.length, 1, "restart replaces rather than duplicates the isolated view");

    battle.destroy();
    battle.destroy();
    assert.equal(battle.getState().state, CONTROL_BOSS_STATES.DESTROYED);
    assert.equal(battle.getState().disposed, true);
    assert.equal(root.children.length, 0);
    assert.equal(frames.callbacks.size, 0, "destroy cancels the shared GameLoop frame");
    assert.equal(input.listeners.size, 0, "destroy removes the injected input subscription");
  } finally {
    frames.restore();
  }
});

test("an aborted Control Boss init never mounts UI and remains safely destroyable", async () => {
  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const battle = createBattle({ root, events: new EventBus(), input: new FakeInput() });
    const controller = new AbortController();
    const initialization = battle.init(configSource, { signal: controller.signal });
    controller.abort();
    await assert.rejects(initialization, (error) => error?.name === "AbortError");
    assert.equal(root.children.length, 0);
    battle.destroy();
    battle.destroy();
    assert.equal(battle.getState().state, CONTROL_BOSS_STATES.DESTROYED);
    assert.equal(frames.callbacks.size, 0);
  } finally {
    frames.restore();
  }
});

test("the isolated runtime has no global input, private RAF, timeout, innerHTML or result modal", async () => {
  const [battleSource, encounterSource, viewSource, cssSource] = await Promise.all([
    readFile(new URL("js/battle/postgame/bosses/control-boss/battle.js", projectRoot), "utf8"),
    readFile(new URL("js/battle/postgame/bosses/control-boss/encounter.js", projectRoot), "utf8"),
    readFile(new URL("js/battle/postgame/bosses/control-boss/view.js", projectRoot), "utf8"),
    readFile(new URL("css/control-boss.css", projectRoot), "utf8"),
  ]);
  const runtimeSource = `${battleSource}\n${encounterSource}\n${viewSource}`;
  assert.doesNotMatch(runtimeSource, /window\.addEventListener|document\.addEventListener/u);
  assert.doesNotMatch(viewSource, /\bdocument\.createElement/u);
  assert.doesNotMatch(runtimeSource, /requestAnimationFrame|setTimeout|setInterval/u);
  assert.doesNotMatch(runtimeSource, /innerHTML/u);
  assert.doesNotMatch(`${runtimeSource}\n${cssSource}`, /result[-_ ]?modal|modal-backdrop|acb-modal/iu);
  assert.match(runtimeSource, /new GameLoop/u);
  assert.match(runtimeSource, /new VirtualJoystick/u);
});

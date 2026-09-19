import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EventBus } from "../../js/core/event-bus.js";
import {
  WORD_BREAKER_PHASES,
  WORD_BREAKER_STATES,
  WordBreakerView,
  createBattle,
  normalizeWordBreakerConfig,
} from "../../js/battle/postgame/bosses/word-breaker/index.js";

const projectRoot = new URL("../../", import.meta.url);
const configSource = JSON.parse(await readFile(new URL("data/battle/word-breaker.json", projectRoot), "utf8"));
const config = normalizeWordBreakerConfig(configSource);

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

function treeText(node) {
  if (!node) return "";
  return [node.textContent, ...node.children.map(treeText)].filter(Boolean).join(" ");
}

function relativePercent(value, total) {
  return `${(value / total) * 100}%`;
}

test("Word Breaker view renders glyph AABBs and an uninterrupted visual recovery flow", () => {
  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const view = new WordBreakerView({ config, document: frames.document });
    view.mount(root);

    const phrase = {
      id: "phrase-1",
      x: 44,
      y: 116,
      width: 102,
      height: 28,
      hp: 1,
      maxHp: 2,
      tone: "negative",
      reframe: "나는 다시 해낼 수 있어",
      glyphs: [
        {
          id: "glyph-target",
          text: "못",
          x: 50,
          y: 120,
          width: 20,
          height: 24,
          collidable: true,
          isTarget: true,
          broken: false,
          hp: 1,
          maxHp: 2,
        },
        {
          id: "glyph-space",
          text: " ",
          x: 70,
          y: 120,
          width: 10,
          height: 24,
          collidable: false,
          isTarget: false,
          broken: false,
          hp: 0,
          maxHp: 0,
        },
        {
          id: "glyph-broken",
          text: "해",
          x: 80,
          y: 120,
          width: 20,
          height: 24,
          collidable: true,
          isTarget: true,
          broken: true,
          hp: 0,
          maxHp: 2,
        },
      ],
    };
    const overloadGlyphs = [
      ["lane-rain", 20, true],
      ["firewall-gates", 70, false],
      ["recursive-fork", 120, false],
      ["prediction-lock", 170, false],
      ["convergence-ring", 220, false],
    ].map(([pattern, x, telegraphing], index) => ({
      id: `overload-${index}`,
      text: String.fromCodePoint(0xAC00 + index),
      x,
      y: 180 + index * 12,
      width: 18,
      height: 22,
      pattern,
      waveIndex: index,
      stage: index % 4,
      variant: ["outlier", "trojan", "stack-overflow", "confidence-lock", "feedback-loop"][index],
      badge: index === 0 ? "OUT" : "",
      color: "#d82f76",
      telegraphing,
      surge: false,
      contacted: false,
    }));
    const characterSnapshot = {
      id: "player-1",
      x: 210,
      y: 680,
      width: 30,
      height: 40,
      footY: 720,
      direction: "down",
      state: "idle",
      currentHealth: 1,
      maxHealth: 1,
      appearance: { label: "YOU" },
      controlLocked: false,
    };
    const snapshot = {
      state: WORD_BREAKER_STATES.RUNNING,
      phase: WORD_BREAKER_PHASES.OVERLOAD,
      roundIndex: 0,
      roundRemainingMs: 0,
      controlLocked: false,
      invulnerableRemainingMs: 0,
      collectedGuardians: [],
      metrics: { purifiedCount: 0, hitCount: 0 },
      status: { text: "overload", tone: "warning" },
      overload: {
        type: "lane-rain",
        elapsedMs: 120,
        escalationAtMs: 1_000,
        escalationElapsedMs: 0,
        escalated: false,
        surgeIndex: 0,
        telegraphMs: 200,
        waveIndex: 4,
        contactCount: 0,
        armed: false,
      },
      phrases: [phrase],
      overloadGlyphs,
      shots: [],
      guardian: null,
    };

    view.render(snapshot, characterSnapshot);

    assert.equal(root.children.length, 1);
    assert.ok(root.querySelector(".word-breaker-world"));
    assert.ok(root.querySelector(".word-breaker-joystick"));
    assert.equal(root.querySelectorAll(".word-breaker-guardian-chip").length, 5);
    assert.equal(root.querySelector(".word-breaker-modal"), null);
    assert.equal(root.querySelector(".result-modal"), null);

    const phraseGlyphs = root.querySelectorAll(".word-breaker-glyph");
    assert.equal(phraseGlyphs.length, phrase.glyphs.length);
    assert.equal(
      phraseGlyphs.map((node) => node.textContent).join(""),
      phrase.glyphs.map(({ text }) => text).join(""),
      "the rendered round sentence preserves its original graphemes",
    );
    assert.equal(
      phraseGlyphs[0].style.left,
      relativePercent(phrase.glyphs[0].x - config.arena.x, config.arena.width),
      "each visible glyph uses its logical collision AABB",
    );
    assert.equal(
      phraseGlyphs[0].style.top,
      relativePercent(phrase.glyphs[0].y - config.arena.y, config.arena.height),
    );
    assert.equal(
      phraseGlyphs[0].style.width,
      relativePercent(phrase.glyphs[0].width, config.arena.width),
    );
    assert.equal(
      phraseGlyphs[0].style.height,
      relativePercent(phrase.glyphs[0].height, config.arena.height),
    );
    assert.equal(phraseGlyphs[0].dataset.target, "true");
    assert.equal(phraseGlyphs[0].dataset.damaged, "true");
    assert.equal(phraseGlyphs[1].textContent, " ", "whitespace remains layout-safe in the DOM");
    assert.equal(phraseGlyphs[1].dataset.collidable, "false");
    assert.equal(phraseGlyphs[2].dataset.broken, "true");
    assert.equal(root.querySelector(".word-breaker-world").dataset.overloadPattern, "lane-rain");
    const damagedTargetNode = phraseGlyphs[0];
    const fullHealthPhrase = {
      ...phrase,
      glyphs: phrase.glyphs.map((glyph, index) => index === 0
        ? { ...glyph, hp: glyph.maxHp, broken: false }
        : glyph),
    };
    view.render({ ...snapshot, phrases: [fullHealthPhrase] }, characterSnapshot);
    assert.equal(root.querySelectorAll(".word-breaker-glyph")[0], damagedTargetNode);
    assert.equal(damagedTargetNode.dataset.target, "true");
    assert.equal(damagedTargetNode.dataset.damaged, "false");
    view.render(snapshot, characterSnapshot);
    assert.equal(root.querySelectorAll(".word-breaker-glyph")[0], damagedTargetNode);
    assert.equal(damagedTargetNode.dataset.damaged, "true");
    assert.equal(damagedTargetNode.dataset.broken, "false");
    assert.equal(root.querySelector(".word-breaker-phrase"), null);
    assert.equal(root.querySelector(".word-breaker-phrase__target"), null);
    assert.equal(root.querySelector(".word-breaker-phrase__hp"), null);

    const overloadNodes = root.querySelectorAll(".word-breaker-overload-glyph");
    assert.equal(overloadNodes.length, overloadGlyphs.length);
    assert.equal(overloadNodes[0].style.left, relativePercent(overloadGlyphs[0].x, config.arena.width));
    assert.equal(overloadNodes[0].dataset.pattern, "lane-rain");
    assert.equal(overloadNodes[0].dataset.telegraphing, "true");
    assert.equal(overloadNodes[0].dataset.variant, "outlier");
    assert.equal(overloadNodes[0].dataset.stage, "0");
    assert.equal(overloadNodes[0].dataset.badge, "OUT");
    assert.equal(overloadNodes[0].dataset.active, "false", "telegraphs are warnings, not active hazards");
    assert.equal(overloadNodes[1].dataset.active, "true");
    assert.deepEqual(
      overloadNodes.map((node) => node.dataset.pattern),
      ["lane-rain", "firewall-gates", "recursive-fork", "prediction-lock", "convergence-ring"],
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /ROUND 1\/5/u);
    assert.equal(
      root.querySelector(".word-breaker-world").dataset.phase,
      "PLAY",
      "the unarmed overload transition stays visually inside the current round",
    );
    assert.equal(root.querySelector(".word-breaker-world").dataset.overloadArmed, "false");
    assert.equal(root.querySelector(".word-breaker-world").dataset.overloadStage, "rising");
    assert.equal(root.querySelector(".word-breaker-world").dataset.collapseBurst, "false");
    assert.equal(root.querySelector(".word-breaker-eiai").dataset.burstText, "");

    view.render(
      {
        ...snapshot,
        overload: { ...snapshot.overload, armed: true, attacking: false },
      },
      characterSnapshot,
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /ROUND 1\/5/u);
    assert.equal(
      root.querySelector(".word-breaker-world").dataset.phase,
      "PLAY",
      "the one-shot shake remains inside the current round until a collapse glyph activates",
    );
    assert.equal(root.querySelector(".word-breaker-world").dataset.overloadStage, "locking");
    assert.equal(root.querySelector(".word-breaker-world").dataset.collapseBurst, "true");
    assert.equal(
      root.querySelector(".word-breaker-eiai").dataset.burstText,
      config.rounds[0].phrases[3].negative,
      "the collapse shake carries one current-round negative phrase out of Eiai",
    );

    view.render(
      {
        ...snapshot,
        overload: { ...snapshot.overload, armed: true, attacking: true },
      },
      characterSnapshot,
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /OVERLOAD/u);
    assert.equal(root.querySelector(".word-breaker-world").dataset.phase, "OVERLOAD");
    assert.equal(root.querySelector(".word-breaker-world").dataset.overloadStage, "impact");
    assert.equal(root.querySelector(".word-breaker-world").dataset.collapseBurst, "false");
    assert.equal(root.querySelector(".word-breaker-eiai").dataset.burstText, "");

    assert.equal(root.querySelector(".word-breaker-recovery"), null, "narration overlays stay out of gameplay");
    const player = root.querySelector(".character-actor--local");
    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.OMEN,
        omenRemainingMs: 2_000,
        overload: null,
        overloadGlyphs: [],
        status: { text: "omen", tone: "omen" },
      },
      characterSnapshot,
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /ROUND 1\/5/u);
    assert.equal(
      root.querySelector(".word-breaker-world").dataset.phase,
      "PLAY",
      "the omen remains an internal phase instead of exposing a separate visual screen",
    );

    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.KNOCKED_OUT,
        controlLocked: true,
        status: { text: "knocked out", tone: "danger" },
      },
      { ...characterSnapshot, controlLocked: true },
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /DOWN/u);
    assert.equal(player.dataset.knockedOut, "true");
    assert.equal(player.dataset.controlLocked, "true");

    const guardian = {
      ...config.rounds[0].guardian,
      x: 110,
      y: 100,
      width: config.guardian.width,
      height: config.guardian.height,
      roundIndex: 0,
    };
    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.GUARDIAN_REVEAL,
        overload: null,
        overloadGlyphs: [],
        guardian,
        guardianRevealRemainingMs: 2_000,
        controlLocked: true,
        status: { text: "guardian", tone: "guardian" },
      },
      { ...characterSnapshot, controlLocked: true },
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /GUARDIAN/u);
    assert.equal(player.dataset.knockedOut, "true");
    assert.ok(root.querySelector(".word-breaker-guardian"));

    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.RECOVERING,
        overload: null,
        overloadGlyphs: [],
        guardian,
        controlLocked: false,
        status: { text: "recovering", tone: "recovery" },
      },
      characterSnapshot,
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /RECOVERY/u);
    assert.equal(player.dataset.knockedOut, "false", "the KO treatment ends as recovery begins");
    assert.equal(player.dataset.controlLocked, "false");
    assert.equal(player.dataset.recovering, "true");
    assert.equal(player.dataset.revived, "false");
    assert.equal(root.querySelectorAll(".word-breaker-overload-glyph").length, 0);
    assert.equal(root.querySelector(".word-breaker-world").dataset.phase, "RECOVERING");
    const recoveringGuardianNode = root.querySelector(".word-breaker-guardian");
    const guardianCheer = root.querySelector(".word-breaker-guardian-cheer");
    assert.ok(recoveringGuardianNode);
    assert.ok(guardianCheer);
    assert.equal(guardianCheer.dataset.visible, "false", "the encouragement waits until the egg is collected");
    assert.equal(guardianCheer.textContent, "");

    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.REVIVED,
        overload: null,
        overloadGlyphs: [],
        guardian,
        collectedGuardians: [guardian],
        recoveryHoldRemainingMs: 1_500,
        controlLocked: true,
        status: { text: config.rounds[0].recoveryMessage, tone: "success" },
      },
      { ...characterSnapshot, controlLocked: true },
    );
    assert.match(treeText(root.querySelector(".word-breaker-phase")), /RECOVERED/u);
    assert.equal(root.querySelector(".word-breaker-world").dataset.phase, "REVIVED");
    assert.equal(root.querySelector(".word-breaker-guardian"), recoveringGuardianNode);
    assert.equal(player.dataset.recovering, "false");
    assert.equal(player.dataset.revived, "true");
    assert.equal(guardianCheer.dataset.visible, "true");
    assert.equal(
      guardianCheer.textContent,
      `${guardian.code} · “${config.rounds[0].recoveryMessage}”`,
    );
    assert.equal(guardianCheer.style["--guardian-color"], guardian.color);
    assert.equal(root.querySelector(".word-breaker-recovery"), null);

    view.render(
      {
        ...snapshot,
        phase: WORD_BREAKER_PHASES.PLAY,
        guardian: null,
        status: { text: "next round", tone: "info" },
      },
      characterSnapshot,
    );
    assert.equal(guardianCheer.dataset.visible, "false", "the encouragement leaves with the recovery hold");
    assert.equal(guardianCheer.textContent, "");

    view.destroy();
    assert.equal(root.children.length, 0);
  } finally {
    frames.restore();
  }
});

test("Word Breaker adapter keeps pause, knockout, recovery, and terminal locks independent", async () => {
  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const events = new EventBus();
    const input = new FakeInput();
    const fastConfig = {
      ...configSource,
      roundDurationMs: 20,
      omenDurationMs: 2,
      overloadGraceMs: 3,
      overloadAttackLeadMs: 1,
      collapseImpactMs: 100,
      guardianRevealMs: 100,
      simulationStepMs: 1,
      magnetDelayMs: 60_000,
      recoveryFailsafeMs: 120_000,
      recoveryHoldMs: 5,
      rounds: configSource.rounds.map((round, index) => index === 0
        ? {
          ...round,
          gimmick: {
            ...round.gimmick,
            telegraphMs: 1,
            forceAtMs: 8,
            spawnIntervalMs: 1_000,
            glyphSpeed: 5_000,
          },
        }
        : round),
      random: () => 0.5,
    };
    const battle = createBattle({ root, events, input });
    await battle.init(fastConfig);

    battle.start({ attemptId: "word-breaker:lifecycle-1" });
    frames.step(0);
    const initialState = battle.getState();
    const initialX = initialState.playerBounds.x;
    assert.ok(root.querySelectorAll(".word-breaker-glyph").length > 0);

    input.vector = { x: 1, y: 0 };
    frames.step(20);
    input.vector = { x: 0, y: 0 };
    assert.ok(battle.getState().playerBounds.x > initialX, "injected movement reaches CharacterSystem");
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.OMEN);

    frames.step(22);
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.OVERLOAD);
    assert.ok(root.querySelectorAll(".word-breaker-overload-glyph").length > 0);
    frames.step(30);
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.OVERLOAD);
    assert.equal(battle.getState().overload.escalated, true);
    assert.equal(battle.getState().metrics.knockoutCount, 0);

    let frameTime = 30;
    for (let index = 0; index < 200 && battle.getState().phase !== WORD_BREAKER_PHASES.KNOCKED_OUT; index += 1) {
      frameTime += 16;
      frames.step(frameTime);
    }
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.KNOCKED_OUT);
    const player = root.querySelector(".character-actor--local");
    assert.equal(player.dataset.knockedOut, "true");
    assert.equal(player.dataset.controlLocked, "true");

    assert.equal(battle.pause("MANUAL"), true);
    assert.equal(battle.getState().state, WORD_BREAKER_STATES.PAUSED);
    assert.equal(player.dataset.controlLocked, "true");
    assert.equal(battle.resume(), true);
    assert.equal(battle.getState().state, WORD_BREAKER_STATES.RUNNING);
    assert.equal(player.dataset.controlLocked, "true", "resuming does not clear the knockout lock");

    let transitionFrameTime = frameTime;
    for (let index = 0; index < 20 && battle.getState().phase === WORD_BREAKER_PHASES.KNOCKED_OUT; index += 1) {
      transitionFrameTime += 16;
      frames.step(transitionFrameTime);
    }
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.GUARDIAN_REVEAL);
    assert.equal(player.dataset.knockedOut, "true");
    assert.equal(player.dataset.controlLocked, "true", "guardian reveal keeps the knockout lock");
    for (let index = 0; index < 20 && battle.getState().phase === WORD_BREAKER_PHASES.GUARDIAN_REVEAL; index += 1) {
      transitionFrameTime += 16;
      frames.step(transitionFrameTime);
    }
    assert.equal(battle.getState().phase, WORD_BREAKER_PHASES.RECOVERING);
    assert.equal(player.dataset.knockedOut, "false");
    assert.equal(player.dataset.controlLocked, "false", "recovery start clears only the knockout lock");

    assert.equal(battle.pause("MANUAL"), true);
    assert.equal(player.dataset.controlLocked, "true", "pause remains an independent lock during recovery");
    assert.equal(battle.resume(), true);
    assert.equal(player.dataset.controlLocked, "false");

    const firstStage = root.firstElementChild;
    assert.equal(battle.restart({ attemptId: "word-breaker:lifecycle-2" }), true);
    assert.equal(battle.getState().attemptId, "word-breaker:lifecycle-2");
    assert.equal(root.children.length, 1, "restart replaces rather than duplicates the isolated view");
    assert.notEqual(root.firstElementChild, firstStage);
    assert.equal(firstStage.parentNode, null);
    assert.equal(root.querySelectorAll(".word-breaker-guardian-chip").length, 5);

    battle.destroy();
    battle.destroy();
    assert.equal(battle.getState().state, WORD_BREAKER_STATES.DESTROYED);
    assert.equal(battle.getState().disposed, true);
    assert.equal(root.children.length, 0);
    assert.equal(frames.callbacks.size, 0, "destroy cancels the shared GameLoop frame");
    assert.equal(input.listeners.size, 0, "destroy removes the injected input subscription");
  } finally {
    frames.restore();
  }
});

test("Word Breaker runtime delegates shared loop/input and contains no private modal or unsafe DOM path", async () => {
  const [battleSource, encounterSource, viewSource, cssSource] = await Promise.all([
    readFile(new URL("js/battle/postgame/bosses/word-breaker/battle.js", projectRoot), "utf8"),
    readFile(new URL("js/battle/postgame/bosses/word-breaker/encounter.js", projectRoot), "utf8"),
    readFile(new URL("js/battle/postgame/bosses/word-breaker/view.js", projectRoot), "utf8"),
    readFile(new URL("css/word-breaker.css", projectRoot), "utf8"),
  ]);
  const runtimeSource = `${battleSource}\n${encounterSource}\n${viewSource}`;

  assert.match(battleSource, /new GameLoop/u);
  assert.match(battleSource, /new VirtualJoystick/u);
  assert.doesNotMatch(runtimeSource, /window\.addEventListener|document\.addEventListener/u);
  assert.doesNotMatch(viewSource, /\bdocument\.createElement/u);
  assert.doesNotMatch(runtimeSource, /requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval/u);
  assert.doesNotMatch(runtimeSource, /innerHTML/u);
  assert.doesNotMatch(`${runtimeSource}\n${cssSource}`, /result[-_ ]?modal|modal-backdrop|word-breaker-modal/iu);
  assert.match(encounterSource, /overload-escalated/u);
  assert.match(viewSource, /escalationAtMs/u);
  assert.doesNotMatch(`${encounterSource}\n${viewSource}\n${cssSource}`, /overload-deadline|data-deadline/u);
  assert.match(viewSource, /config\.finalPhrase\.negative/u);
  assert.doesNotMatch(
    `${viewSource}\n${cssSource}`,
    /word-breaker-recovery/u,
    "gameplay must not mount a phase-by-phase narration panel",
  );
  assert.doesNotMatch(viewSource, /recoveryStep|collapseText|recoveryText/u);
  assert.match(viewSource, /phrase\.glyphs/u);
  assert.match(viewSource, /snapshot\.overloadGlyphs/u);
  assert.match(viewSource, /word-breaker-overload-glyph/u);
  assert.match(viewSource, /word-breaker-glyph/u);
  assert.doesNotMatch(viewSource, /word-breaker-phrase__(?:before|target|after|hp)/u);
  assert.doesNotMatch(`${viewSource}\n${cssSource}`, /--word-breaker-target-(?:left|top|width|height)/u);
  for (const pattern of [
    "lane-rain",
    "firewall-gates",
    "recursive-fork",
    "prediction-lock",
    "convergence-ring",
  ]) {
    assert.ok(viewSource.includes(pattern));
    assert.ok(cssSource.includes(pattern));
  }
  assert.match(cssSource, /data-telegraphing="true"/u);
  assert.match(cssSource, /data-variant=/u);
  assert.match(cssSource, /data-badge/u);
  assert.doesNotMatch(
    cssSource,
    /data-phase="OMEN"/u,
    "the internal omen must not introduce a separate visual phase",
  );
  assert.match(cssSource, /data-phase="GUARDIAN_REVEAL"/u);
  assert.match(cssSource, /data-phase="REVIVED"/u);
  assert.doesNotMatch(
    cssSource,
    /data-overload-armed="false"/u,
    "the concealed overload lead must not fade or restyle the active normal attack",
  );
  assert.match(cssSource, /data-collidable="false"/u);
  assert.match(cssSource, /data-target="true"/u);
  assert.doesNotMatch(viewSource, /--word-breaker-glyph-health/u);
  const glyphRule = cssSource.match(/\.word-breaker-glyph\s*\{(?<body>[^}]*)\}/u);
  assert.ok(glyphRule?.groups?.body, "the base glyph has an explicit visibility rule");
  assert.match(glyphRule.groups.body, /\bopacity\s*:\s*1\s*;/u);
  assert.match(glyphRule.groups.body, /\bcolor\s*:\s*#fff8f2\s*;/u);
  assert.doesNotMatch(glyphRule.groups.body, /word-breaker-glyph-health/u);
  const targetRule = cssSource.match(/\.word-breaker-glyph\[data-target="true"\]\s*\{(?<body>[^}]*)\}/u);
  assert.ok(targetRule?.groups?.body, "the target glyph has an explicit color-only rule");
  assert.match(targetRule.groups.body, /\bcolor\s*:\s*#fff45c\s*;/u);
  assert.doesNotMatch(
    targetRule.groups.body,
    /text-decoration|font-weight|border|background|box-shadow|filter|transform/u,
    "target emphasis must only change the glyph color",
  );
  assert.doesNotMatch(
    cssSource,
    /\.word-breaker-glyph\[data-target="true"\]::(?:before|after)/u,
    "target glyphs must not render a symbol above the sentence",
  );
  const hitKeyframeStart = cssSource.indexOf("@keyframes word-breaker-glyph-hit");
  const hitKeyframeEnd = cssSource.indexOf("@keyframes", hitKeyframeStart + 1);
  assert.ok(hitKeyframeStart >= 0 && hitKeyframeEnd > hitKeyframeStart);
  assert.doesNotMatch(
    cssSource.slice(hitKeyframeStart, hitKeyframeEnd),
    /\bopacity\s*:/u,
    "a non-broken target never dims when it is hit",
  );
  assert.doesNotMatch(
    cssSource,
    /\.word-breaker-world\[data-overload-pattern="[^"]+"\]\s+\.word-breaker-glyph\[data-tone="negative"\][^{]*\{/u,
    "normal non-target glyphs keep one bright base color in every department",
  );
  const shakeRule = cssSource.match(
    /\.word-breaker-world\[data-collapse-burst="true"\]\s*\{(?<body>[^}]*)\}/u,
  );
  const releaseRule = cssSource.match(
    /\.word-breaker-world\[data-collapse-burst="true"\] \.word-breaker-eiai\s*\{(?<body>[^}]*)\}/u,
  );
  const wordsRule = cssSource.match(
    /\.word-breaker-world\[data-collapse-burst="true"\] \.word-breaker-eiai::after\s*\{(?<body>[^}]*)\}/u,
  );
  assert.match(shakeRule?.groups?.body ?? "", /word-breaker-collapse-entry-shake[^;]*\b1\s*;/u);
  assert.match(releaseRule?.groups?.body ?? "", /word-breaker-eiai-release[^;]*\b1\s*;/u);
  assert.match(wordsRule?.groups?.body ?? "", /word-breaker-eiai-words[^;]*\b1\s*;/u);
  assert.match(cssSource, /@keyframes word-breaker-collapse-entry-shake/u);
  assert.match(cssSource, /@keyframes word-breaker-eiai-release/u);
  assert.match(cssSource, /@keyframes word-breaker-eiai-words/u);
  const statsValueRule = cssSource.match(/\.word-breaker-stats dd\s*\{(?<body>[^}]*)\}/u);
  const statsCardRule = cssSource.match(/\.word-breaker-stats > div\s*\{(?<body>[^}]*)\}/u);
  const statusRule = cssSource.match(/\.word-breaker-status\s*\{(?<body>[^}]*)\}/u);
  assert.match(statsValueRule?.groups?.body ?? "", /white-space\s*:\s*nowrap/u);
  assert.match(statsCardRule?.groups?.body ?? "", /height\s*:\s*48px/u);
  assert.match(statsCardRule?.groups?.body ?? "", /max-height\s*:\s*48px/u);
  assert.match(statusRule?.groups?.body ?? "", /height\s*:\s*50px/u);
  assert.match(statusRule?.groups?.body ?? "", /max-height\s*:\s*50px/u);
  assert.doesNotMatch(
    cssSource,
    /\.word-breaker-title\s*\{[^}]*white-space\s*:\s*normal/gu,
    "desktop phase labels cannot make the title wrap and resize the HUD",
  );
  assert.match(
    cssSource,
    /\.word-breaker-hud\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/u,
    "the desktop HUD uses one stable content column",
  );
  assert.match(cssSource, /data-broken="true"/u);
  assert.match(cssSource, /prefers-reduced-motion:\s*reduce/u);
  const reducedMotionCss = cssSource.slice(cssSource.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const selector of [
    '.word-breaker-glyph[data-damaged="true"]',
    '.word-breaker-glyph[data-broken="true"]',
    '.word-breaker-world > .character-actor[data-recovering="true"]',
    '.word-breaker-world > .character-actor[data-revived="true"]',
    '.word-breaker-world[data-phase="GUARDIAN_REVEAL"] .word-breaker-guardian',
    '.word-breaker-world[data-phase="REVIVED"] .word-breaker-guardian',
    '.word-breaker-world[data-collapse-burst="true"]',
    '.word-breaker-world[data-collapse-burst="true"] .word-breaker-eiai',
    '.word-breaker-world[data-collapse-burst="true"] .word-breaker-eiai::after',
  ]) {
    assert.ok(reducedMotionCss.includes(selector), `reduced-motion must cover the exact selector: ${selector}`);
  }
  assert.match(cssSource, /max-width:\s*720px/u);
  assert.match(battleSource, /word-breaker-knockout/u);
  assert.match(battleSource, /word-breaker-transition/u);
  assert.match(battleSource, /player-knockout/u);
  assert.match(battleSource, /recovery-start/u);
  assert.match(battleSource, /guardian-collected/u);
  assert.match(battleSource, /word-breaker-finale/u);
  assert.match(battleSource, /word-breaker-terminal/u);
  assert.match(battleSource, /word-breaker-pause/u);
});

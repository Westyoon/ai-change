import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EventBus } from "../../js/core/event-bus.js";
import {
  WORD_BREAKER_PHASES,
  WORD_BREAKER_STATES,
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

test("Word Breaker adapter mounts the deathless five-guardian UI and satisfies its lifecycle", async () => {
  const frames = installFrameHarness();
  try {
    const root = frames.document.createElement("div");
    const events = new EventBus();
    const input = new FakeInput();
    const fastConfig = {
      ...configSource,
      roundDurationMs: 100,
      magnetDelayMs: 60_000,
      random: () => 0.5,
    };
    const battle = createBattle({ root, events, input });
    await battle.init(fastConfig);

    assert.equal(root.children.length, 1);
    assert.ok(root.querySelector(".word-breaker-world"));
    assert.ok(root.querySelector(".word-breaker-joystick"));
    assert.equal(root.querySelectorAll(".word-breaker-guardian-chip").length, 5);
    assert.equal(configSource.controls.pc.length, 4);
    assert.equal(configSource.resultPresentation.clear.title, "마음의 말 정화 완료");
    assert.equal(root.querySelector(".word-breaker-modal"), null);
    assert.equal(root.querySelector(".result-modal"), null);

    const finale = root.querySelector(".word-breaker-finale");
    assert.match(treeText(finale), new RegExp(config.finalPhrase.negative, "u"));
    assert.match(treeText(finale), new RegExp(config.finalPhrase.reframe, "u"));

    battle.start({ attemptId: "word-breaker:lifecycle-1" });
    frames.step(0);
    const initialState = battle.getState();
    const initialX = initialState.playerBounds.x;
    const phrase = initialState.phrases[0];
    const phraseNode = root.querySelector(".word-breaker-phrase");
    assert.ok(phraseNode, "the initial falling phrase is rendered");
    assert.ok(phraseNode.querySelector(".word-breaker-phrase__before"));
    assert.ok(phraseNode.querySelector(".word-breaker-phrase__target"));
    assert.ok(phraseNode.querySelector(".word-breaker-phrase__after"));
    assert.equal(
      phraseNode.style["--word-breaker-target-left"],
      relativePercent(phrase.targetBounds.x - phrase.x, phrase.width),
      "the visible target starts at the collision target's horizontal position",
    );
    assert.equal(
      phraseNode.style["--word-breaker-target-top"],
      relativePercent(phrase.targetBounds.y - phrase.y, phrase.height),
      "the visible target starts at the collision target's vertical position",
    );
    assert.equal(
      phraseNode.style["--word-breaker-target-width"],
      relativePercent(phrase.targetBounds.width, phrase.width),
      "the visible target width matches the collision target",
    );
    assert.equal(
      phraseNode.style["--word-breaker-target-height"],
      relativePercent(phrase.targetBounds.height, phrase.height),
      "the visible target height matches the collision target",
    );
    input.vector = { x: 1, y: 0 };
    frames.step(100);
    assert.ok(battle.getState().playerBounds.x > initialX, "injected PC movement reaches CharacterSystem");
    input.vector = { x: 0, y: 0 };

    const collapsed = battle.getState();
    assert.equal(collapsed.state, WORD_BREAKER_STATES.RUNNING);
    assert.equal(collapsed.phase, WORD_BREAKER_PHASES.RECOVERING);
    const recovery = root.querySelector(".word-breaker-recovery");
    assert.equal(recovery.dataset.visible, "true");
    assert.match(treeText(recovery), new RegExp(config.rounds[0].collapseMessage, "u"));
    assert.match(treeText(recovery), new RegExp(config.rounds[0].recoveryMessage, "u"));

    assert.equal(battle.pause("MANUAL"), true);
    assert.equal(battle.getState().state, WORD_BREAKER_STATES.PAUSED);
    assert.equal(battle.resume(), true);
    assert.equal(battle.getState().state, WORD_BREAKER_STATES.RUNNING);

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
  assert.match(viewSource, /config\.finalPhrase\.negative/u);
  assert.match(viewSource, /round\?\.collapseMessage/u);
  assert.match(viewSource, /round\?\.recoveryMessage/u);
  for (const variable of [
    "--word-breaker-target-left",
    "--word-breaker-target-top",
    "--word-breaker-target-width",
    "--word-breaker-target-height",
  ]) {
    assert.ok(viewSource.includes(variable));
    assert.match(cssSource, new RegExp(`var\\(${variable}\\)`, "u"));
  }
});

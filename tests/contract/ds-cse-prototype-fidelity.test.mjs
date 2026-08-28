import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMiniGame as createCseMiniGame } from "../../js/minigames/CSE/index.js";
import { createMiniGame as createDsMiniGame } from "../../js/minigames/DS/index.js";

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
    this.inert = false;
    this.textContent = "";
    this.type = "";
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.offsetWidth = 0;
    this.scrollHeight = 0;
    this.scrollTop = 0;
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

  dispatchEvent(type, overrides = {}) {
    const event = {
      currentTarget: this,
      target: this,
      type,
      preventDefault() {},
      ...overrides,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  focus() {}

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createFakeEnvironment({ width = 440, height = 600 } = {}) {
  const observers = [];
  const windowListeners = new Map();

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(target) {
      this.observed.push(target);
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const defaultView = {
    ResizeObserver: FakeResizeObserver,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
  };
  const ownerDocument = {
    defaultView,
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  const uiRoot = new FakeElement("div", ownerDocument);
  uiRoot.clientWidth = width;
  uiRoot.clientHeight = height;
  return { observers, uiRoot };
}

function hasClass(element, className) {
  return element.className.split(/\s+/u).includes(className);
}

function findAllByClass(root, className, output = []) {
  if (hasClass(root, className)) output.push(root);
  for (const child of root.children) {
    findAllByClass(child, className, output);
  }
  return output;
}

function findByClass(root, className) {
  return findAllByClass(root, className)[0] ?? null;
}

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

test("CSE mounts the original 440x920 frame with width-only scaling and cleans it up", async () => {
  const config = await readJson("../../data/minigames/code-heart.json");
  const { observers, uiRoot } = createFakeEnvironment({ width: 400, height: 480 });
  uiRoot.className = "minigame-ui-root host-class";
  const instance = createCseMiniGame({ uiRoot });

  await instance.init(config);

  assert.equal(uiRoot.children.length, 1);
  assert.match(uiRoot.className, /\bcse-ui-root\b/u);
  const viewport = findByClass(uiRoot, "cse-fixed-frame-viewport");
  const frame = findByClass(uiRoot, "code-heart-game");
  assert.ok(viewport);
  assert.ok(frame);
  assert.equal(frame.parentNode, viewport);
  assert.equal(frame.style.width, "440px");
  assert.equal(frame.style.height, "920px");
  assert.equal(frame.style.transform, `scale(${400 / 440})`);
  assert.equal(viewport.style.width, "400px");
  assert.equal(Number(viewport.dataset.scale), 400 / 440);
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].observed, [uiRoot]);

  instance.destroy();
  instance.destroy();
  assert.equal(observers[0].disconnected, true);
  assert.equal(uiRoot.className, "minigame-ui-root host-class");
  assert.equal(uiRoot.children.length, 0);
});

test("CSE restores prototype material, recipe, button, and shake markup without an internal result modal", async () => {
  const config = await readJson("../../data/minigames/code-heart.json");
  const stylesheet = await readFile(new URL("../../css/minigames.css", import.meta.url), "utf8");
  const { observers, uiRoot } = createFakeEnvironment();
  let nextFrameId = 0;
  const instance = createCseMiniGame({
    uiRoot,
    clock: { now: () => 0 },
    requestAnimationFrame: () => ++nextFrameId,
    cancelAnimationFrame() {},
  });

  await instance.init(config);

  const materials = findAllByClass(uiRoot, "ch-btn-material");
  assert.equal(materials.length, 12);
  assert.deepEqual(
    materials.map((button) => [button.dataset.itemId, button.dataset.cat]),
    config.items.map((item) => [item.id, item.category]),
  );

  const recipeButton = findByClass(uiRoot, "ch-btn-recipe-trigger");
  assert.ok(findByClass(recipeButton, "ch-book-icon"));
  assert.equal(findByClass(recipeButton, "ch-book-text")?.textContent, "레시피");

  const unlockButton = findByClass(uiRoot, "ch-btn-unlock");
  assert.deepEqual(unlockButton.children.map((child) => child.tagName), ["SPAN", "SMALL"]);
  assert.deepEqual(unlockButton.children.map((child) => child.textContent), ["★ UNLOCK", "git push"]);

  const recipeBackdrop = findByClass(uiRoot, "ch-modal-backdrop");
  const closeRecipeButton = findByClass(uiRoot, "ch-btn-close");
  assert.equal(recipeBackdrop.hidden, true);
  assert.match(
    stylesheet,
    /\.code-heart-game\s+\.ch-modal-backdrop\[hidden\]\s*\{[^}]*display:\s*none\s*!important/u,
  );
  assert.match(
    stylesheet,
    /\.code-heart-game\s+\.ch-modal-card\s*\{[^}]*color:\s*#333/u,
  );
  assert.equal(findByClass(uiRoot, "ch-modal-title")?.textContent, "📖 개발 레시피북");
  const recipeRows = findAllByClass(uiRoot, "ch-recipe-row");
  assert.equal(recipeRows.length, 4);
  assert.equal(recipeRows[0].children[0].tagName, "STRONG");
  assert.match(recipeRows[0].children[0].textContent, /3D 액션 게임/u);
  assert.match(recipeRows[0].children[1].textContent, /^언어: cpp \| 엔진: unity$/u);
  assert.match(recipeRows[0].children[2].textContent, /^라이브러리: directx \| 도구: git$/u);
  assert.equal(findByClass(uiRoot, "ch-result-card"), null);

  instance.start({ attemptId: "cse:fidelity" });
  recipeButton.dispatchEvent("click");
  assert.equal(recipeBackdrop.hidden, false);
  closeRecipeButton.dispatchEvent("click");
  assert.equal(recipeBackdrop.hidden, true);
  for (const itemId of ["cpp", "fastapi", "mysql", "docker"]) {
    materials.find((button) => button.dataset.itemId === itemId).dispatchEvent("click");
  }
  unlockButton.dispatchEvent("click");

  const feedback = findByClass(uiRoot, "ch-feedback");
  assert.match(feedback.className, /\berror\b/u);
  assert.match(feedback.className, /\bch-shake\b/u);
  assert.equal(feedback.textContent, "✖ [빌드 에러] 구성 불일치! (-5초 페널티)");
  assert.equal(instance.getState().buildErrorCount, 1);

  instance.destroy();
  assert.equal(observers[0].disconnected, true);
});

test("DS history renders Fit, Shift, and Outlier as the original separate color spans", async () => {
  const config = await readJson("../../data/minigames/number-baseball.json");
  const { uiRoot } = createFakeEnvironment();
  const completions = [];
  const instance = createDsMiniGame({
    uiRoot,
    random: () => 0,
    onComplete(attemptId, candidate) {
      completions.push({ attemptId, candidate });
    },
  });

  await instance.init(config);
  instance.start({ attemptId: "ds:fidelity" });
  const keys = findAllByClass(uiRoot, "nb-key");
  for (const digit of [0, 1, 2]) {
    keys.find((button) => button.textContent === String(digit)).dispatchEvent("click");
  }
  findByClass(uiRoot, "nb-btn-submit").dispatchEvent("click");

  const result = findByClass(uiRoot, "nb-history-result");
  assert.ok(result);
  assert.deepEqual(
    result.children.map((child) => child.className),
    [
      "nb-history-fit",
      "nb-history-separator",
      "nb-history-shift",
      "nb-history-separator",
      "nb-history-outlier",
    ],
  );
  assert.deepEqual(
    result.children.map((child) => child.textContent),
    ["3 Fit", " / ", "0 Shift", " / ", "0 Outlier"],
  );
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");

  instance.destroy();
});

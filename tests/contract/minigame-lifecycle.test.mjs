import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getPublishedBattles,
  hasBattleModule,
  listBattleModuleKeys,
  loadBattleModule
} from "../../js/battle/registry.js";
import {
  hasMiniGameModule,
  listMiniGameModuleKeys,
  loadMiniGameModule
} from "../../js/minigames/registry.js";
import { assertCandidateFieldAllowlist } from "../../js/minigames/shared/result-builder.js";

const EXPECTED_MODULE_KEYS = [
  "data-number-baseball",
  "cyber-click-to-purify",
  "computer-code-heart",
  "ai-ball-classification",
  "ai-data-egg-sort"
];

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
    this.disabled = false;
    this.textContent = "";
    this.type = "";
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
    }
  };
  return new FakeElement("div", ownerDocument);
}

function findByClass(root, className) {
  if (root.className.split(/\s+/u).includes(className)) return root;
  for (const child of root.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

async function loadGameConfigs() {
  const [registryDocument, manifestDocument] = await Promise.all([
    readJson("../../data/minigames.json"),
    readJson("../../data/asset-manifest.json")
  ]);
  const assets = new Map(manifestDocument.assets.map((asset) => [asset.id, asset]));
  const configs = new Map();

  for (const game of registryDocument.minigames) {
    const asset = assets.get(game.configAssetId);
    assert.ok(asset, `${game.id} config asset`);
    const relativePath = asset.src.replace(/^\.\//u, "");
    configs.set(game.id, await readJson(`../../${relativePath}`));
  }
  return configs;
}

test("registry exposes exactly five static loader keys and rejects unknown keys", async () => {
  assert.deepEqual(listMiniGameModuleKeys(), EXPECTED_MODULE_KEYS);
  for (const key of EXPECTED_MODULE_KEYS) {
    assert.equal(hasMiniGameModule(key), true);
    assert.equal(typeof (await loadMiniGameModule(key)).createMiniGame, "function");
  }
  assert.equal(hasMiniGameModule("../../../arbitrary-module"), false);
  await assert.rejects(() => loadMiniGameModule("../../../arbitrary-module"), /not registered/u);
});

test("all five registered mini-games are integrated MVPs rather than scaffolds", async () => {
  const [registryDocument, configs] = await Promise.all([
    readJson("../../data/minigames.json"),
    loadGameConfigs(),
  ]);

  assert.equal(registryDocument.minigames.length, 5);
  assert.ok(registryDocument.minigames.every((game) => game.scaffold === false));
  assert.deepEqual(
    [...configs.entries()].map(([gameId, config]) => [gameId, config.implementationStatus]),
    EXPECTED_MODULE_KEYS.map((gameId) => [gameId, "MVP"]),
  );
});

test("the independent empty Battle registry keeps MVP content in Coming Soon state", async () => {
  assert.deepEqual(listBattleModuleKeys(), []);
  assert.equal(hasBattleModule("future-battle"), false);
  assert.deepEqual(
    getPublishedBattles([
      { id: "coming-soon", status: "coming-soon", module: null },
      { id: "unregistered", status: "published", module: "future-battle" }
    ]),
    []
  );
  await assert.rejects(() => loadBattleModule("future-battle"), /not registered/u);
});

test("all five modules satisfy init/start/pause/resume/restart/destroy with once-per-attempt completion", async () => {
  const configs = await loadGameConfigs();

  for (const moduleKey of EXPECTED_MODULE_KEYS) {
    const module = await loadMiniGameModule(moduleKey);
    const uiRoot = createFakeUiRoot();
    const completions = [];
    const instance = module.createMiniGame({
      uiRoot,
      onComplete(attemptId, candidate) {
        assert.equal(assertCandidateFieldAllowlist(candidate), true);
        completions.push({ attemptId, candidate });
      },
      onError(attemptId, error) {
        assert.fail(`Unexpected ${moduleKey} error for ${attemptId}: ${error}`);
      }
    });

    for (const method of ["init", "start", "pause", "resume", "restart", "destroy"]) {
      assert.equal(typeof instance[method], "function", `${moduleKey}.${method}`);
    }

    await instance.init(configs.get(moduleKey), { signal: new AbortController().signal });
    assert.equal(instance.getState().state, "READY", moduleKey);
    assert.equal(uiRoot.children.length, 1, moduleKey);

    instance.start({ attemptId: `${moduleKey}:attempt-1` });
    assert.equal(instance.getState().state, "RUNNING", moduleKey);
    assert.equal(instance.pause("MANUAL"), true, moduleKey);
    assert.equal(instance.getState().state, "PAUSED", moduleKey);
    assert.equal(instance.resume(), true, moduleKey);
    assert.equal(instance.getState().state, "RUNNING", moduleKey);

    assert.equal(instance.completeForDevelopment("CLEAR", `${moduleKey}:stale`), false, moduleKey);
    assert.equal(instance.completeForDevelopment("CLEAR", `${moduleKey}:attempt-1`), true, moduleKey);
    assert.equal(instance.completeForDevelopment("CLEAR", `${moduleKey}:attempt-1`), false, moduleKey);
    assert.equal(completions.length, 1, moduleKey);
    assert.equal(completions[0].candidate.status, "CLEAR", moduleKey);

    instance.restart({ attemptId: `${moduleKey}:attempt-2` });
    assert.equal(instance.getState().state, "RUNNING", moduleKey);
    assert.equal(instance.completeForDevelopment("FAIL", `${moduleKey}:attempt-2`), true, moduleKey);
    assert.equal(completions.length, 2, moduleKey);
    assert.equal(completions[1].candidate.status, "FAIL", moduleKey);
    assert.equal(typeof completions[1].candidate.failureReason, "string", moduleKey);

    instance.destroy();
    instance.destroy();
    assert.equal(instance.getState().state, "DESTROYED", moduleKey);
    assert.equal(instance.getState().disposed, true, moduleKey);
    assert.equal(uiRoot.children.length, 0, moduleKey);
  }
});

test("an init aborted at its async boundary never mounts UI and can be destroyed idempotently", async () => {
  const module = await loadMiniGameModule("data-number-baseball");
  const configs = await loadGameConfigs();
  const uiRoot = createFakeUiRoot();
  const instance = module.createMiniGame({ uiRoot });
  const controller = new AbortController();

  const initialization = instance.init(configs.get("data-number-baseball"), {
    signal: controller.signal
  });
  controller.abort();

  await assert.rejects(initialization, (error) => error?.name === "AbortError");
  assert.equal(uiRoot.children.length, 0);
  instance.destroy();
  instance.destroy();
  assert.equal(instance.getState().state, "DESTROYED");
});

test("AI canvas failures become one attempt-scoped host error", async () => {
  const module = await loadMiniGameModule("ai-ball-classification");
  const configs = await loadGameConfigs();
  const expectedError = new Error("canvas failed");
  const errors = [];
  const instance = module.createMiniGame({
    canvas: {
      width: 960,
      height: 540,
      getContext() {
        return {
          clearRect() {
            throw expectedError;
          },
        };
      },
    },
    uiRoot: createFakeUiRoot(),
    onComplete() {
      assert.fail("A canvas failure must not complete the attempt.");
    },
    onError(attemptId, error) {
      errors.push({ attemptId, error });
    },
  });

  await instance.init(configs.get("ai-ball-classification"));
  instance.start({ attemptId: "ai-ball-classification:canvas-error" });

  assert.equal(instance.getState().state, "ERROR");
  assert.equal(instance.getState().terminal, true);
  assert.deepEqual(errors, [{
    attemptId: "ai-ball-classification:canvas-error",
    error: expectedError,
  }]);
  instance.destroy();
});

test("AI mounts the prototype shell and restores the shared host shell on destroy", async () => {
  const module = await loadMiniGameModule("ai-ball-classification");
  const configs = await loadGameConfigs();
  const stage = { className: "minigame-stage" };
  const canvas = {
    width: 960,
    height: 540,
    className: "minigame-canvas",
    parentElement: stage,
    getContext() {
      return {};
    },
  };
  const uiRoot = createFakeUiRoot();
  uiRoot.className = "minigame-ui-root";
  const instance = module.createMiniGame({ canvas, uiRoot });

  await instance.init(configs.get("ai-ball-classification"));

  assert.equal(canvas.width, 480);
  assert.equal(canvas.height, 460);
  assert.match(canvas.className, /\bai-ball-classification-canvas\b/u);
  assert.match(stage.className, /\bai-ball-classification-stage\b/u);
  assert.match(uiRoot.className, /\bai-ball-classification-ui-root\b/u);
  for (const className of [
    "ai-ball-classification",
    "top-area",
    "target-box",
    "target-badge",
    "progress-box",
    "countdown-card",
    "target-preview-box",
    "bottom-area",
    "control-info",
    "btn-lid",
  ]) {
    assert.ok(findByClass(uiRoot, className), className);
  }

  instance.destroy();
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 540);
  assert.equal(canvas.className, "minigame-canvas");
  assert.equal(stage.className, "minigame-stage");
  assert.equal(uiRoot.className, "minigame-ui-root");
});

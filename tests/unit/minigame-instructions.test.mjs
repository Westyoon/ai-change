import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getMiniGameInstructions } from "../../js/scenes/minigame-instructions.js";
import { createHowToScene } from "../../js/scenes/how-to-scene.js";

const CONFIG_PATHS = Object.freeze([
  "../../data/minigames/number-baseball.json",
  "../../data/minigames/click-to-purify.json",
  "../../data/minigames/code-heart.json",
  "../../data/minigames/ai-ball-classification.json",
  "../../data/minigames/ai-data-egg-sort.json",
]);

class FakeNode {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (
          child instanceof FakeElement
          && className
          && child.className.split(/\s+/u).includes(className)
        ) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

function installFakeDom() {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (value) => Object.assign(new FakeNode(), { textContent: String(value) }),
  };
  return () => {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
}

test("every published pre-game exposes a visible goal and controls for PC and mobile", async () => {
  for (const relativePath of CONFIG_PATHS) {
    const config = JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
    const instructions = getMiniGameInstructions(config);

    assert.ok(instructions.goal.length > 0, `${config.gameId} goal`);
    assert.ok(instructions.pc.length > 0, `${config.gameId} PC controls`);
    assert.ok(instructions.mobile.length > 0, `${config.gameId} mobile controls`);
    assert.ok(instructions.pc.every((item) => item.trim().length > 0));
    assert.ok(instructions.mobile.every((item) => item.trim().length > 0));
  }
});

test("the game-method menu renders instructions for all five published pre-games", async () => {
  const restoreDom = installFakeDom();
  const registry = JSON.parse(
    await readFile(new URL("../../data/minigames.json", import.meta.url), "utf8"),
  );
  const configs = new Map();
  for (let index = 0; index < CONFIG_PATHS.length; index += 1) {
    configs.set(
      registry.minigames[index].configAssetId,
      JSON.parse(await readFile(new URL(CONFIG_PATHS[index], import.meta.url), "utf8")),
    );
  }
  const root = new FakeElement("main");
  const scene = createHowToScene({
    content: { minigames: registry.minigames },
    services: { assets: { load: async (assetId) => configs.get(assetId) } },
    router: { navigate() {} },
  });

  try {
    await scene.mount(root, {}, { signal: new AbortController().signal });
    assert.equal(root.querySelectorAll(".how-to-card").length, 5);
    assert.equal(root.querySelectorAll(".how-to-card__section").length, 15);
    assert.equal(root.querySelectorAll(".control-list").length, 15);
  } finally {
    restoreDom();
  }
});

test("instruction normalization supports legacy content and never renders blank help", () => {
  assert.deepEqual(getMiniGameInstructions({
    objective: " 목표 ",
    pcControls: [" 키보드 ", ""],
    mobileControls: [" 터치 "],
  }), {
    goal: "목표",
    pc: ["키보드"],
    mobile: ["터치"],
  });

  const fallback = getMiniGameInstructions({});
  assert.ok(fallback.goal.length > 0);
  assert.ok(fallback.pc.length > 0);
  assert.ok(fallback.mobile.length > 0);
});

test("pre-game entries ship no placeholder thumbnails and use one 70 percent title scale", async () => {
  const [
    sceneSource,
    minigameStyles,
    commonStyles,
    responsiveStyles,
    registry,
    manifest,
  ] = await Promise.all([
    readFile(new URL("../../js/scenes/minigame-intro-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../css/minigames.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/common.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../../data/minigames.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../data/asset-manifest.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.doesNotMatch(sceneSource, /thumbnailAssetId|minigame-thumbnail/u);
  assert.doesNotMatch(minigameStyles, /\.minigame-thumbnail/u);
  assert.ok(registry.minigames.every((game) => !("thumbnailAssetId" in game)));
  assert.ok(manifest.assets.every((asset) => !String(asset.src).endsWith("/thumbnail.svg")));
  assert.ok(manifest.assets.some((asset) => asset.id === "app-logo"));
  assert.ok(manifest.assets.some((asset) => asset.id === "player-walk-sprite"));
  assert.ok(manifest.assets.some((asset) => asset.id === "ai-ball-classification-sample"));

  const titleSelector = String.raw`\.scene-root\[data-scene="minigame-intro"\]\s*>\s*\.scene\s*>\s*h1`;
  const commonTitleRule = commonStyles.match(new RegExp(`${titleSelector}\\s*\\{(?<body>[^}]*)\\}`, "u"));
  const landscapeTitleRule = responsiveStyles.match(new RegExp(`${titleSelector}\\s*\\{(?<body>[^}]*)\\}`, "u"));
  assert.match(
    commonTitleRule?.groups?.body ?? "",
    /font-size:\s*clamp\(1\.61rem,\s*4\.9vw,\s*3\.78rem\)/u,
  );
  assert.match(
    landscapeTitleRule?.groups?.body ?? "",
    /font-size:\s*clamp\(1\.4rem,\s*6\.3vh,\s*2\.24rem\)/u,
  );
});

test("top bar and active scene consume one responsive width token", async () => {
  const [stylesheet, battleStylesheet, dialogueStylesheet] = await Promise.all([
    readFile(new URL("../../css/common.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/battle.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/dialogue.css", import.meta.url), "utf8"),
  ]);

  assert.match(stylesheet, /\.app-shell\s*\{[^}]*--app-active-frame-width:\s*1120px;/su);
  assert.match(stylesheet, /\.top-bar\s*\{[^}]*width:\s*min\(var\(--app-active-frame-width\),\s*100%\);/su);
  assert.match(stylesheet, /\.scene-root\s*\{[^}]*width:\s*min\(var\(--app-active-frame-width\),\s*100%\);/su);
  assert.match(stylesheet, /\.scene--panel\s*\{[^}]*max-width:\s*920px;/su);
  assert.match(stylesheet, /scene-layout="story-dialogue"[^}]*--app-active-frame-width:\s*1280px;/su);
  assert.match(stylesheet, /scene-layout="aftergame-world"[^}]*--app-active-frame-width:\s*1480px;/su);
  assert.match(dialogueStylesheet, /scene-layout="story-dialogue"[^}]*width:\s*min\(1280px,\s*100%\);/su);
  assert.match(battleStylesheet, /scene-layout="aftergame-world"[^}]*width:\s*min\(1480px,\s*100%\);/su);
  assert.match(battleStylesheet, /\.battle-entry\s*\{[^}]*width:\s*100%;/su);
});

test("menu panels omit internal implementation copy while keeping playable help", async () => {
  const [settings, account, howTo] = await Promise.all([
    readFile(new URL("../../js/scenes/settings-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../js/scenes/account-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../js/scenes/how-to-scene.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(settings, /저장 채널/u);
  assert.doesNotMatch(account, /기본 전투 스탯을 확인합니다/u);
  assert.doesNotMatch(account, /내 계정과 전투 스탯/u);
  assert.match(account, /className: "visually-hidden",\s*text: "내 계정"/u);
  assert.match(account, /account-scene__header--actions-only/u);
  assert.match(howTo, /게임 방법/u);
  assert.match(howTo, /instructionBlock\("PC"/u);
  assert.match(howTo, /instructionBlock\("모바일"/u);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDialogueScene,
  getDialogueDestination,
} from "../../js/scenes/dialogue-scene.js";
import {
  createStoryIntroScene,
  MAIN_STORY_INTRO_ID,
} from "../../js/scenes/story-intro-scene.js";
import { getPendingGuardianClearFlow } from "../../js/scenes/minigame-scene.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

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
    this.disabled = false;
    this.type = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    return event;
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
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
  };
  return () => {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
}

function findOne(root, className) {
  const matches = root.querySelectorAll(`.${className}`);
  assert.equal(matches.length, 1, `expected one .${className}`);
  return matches[0];
}

test("the main Story prototype contains only the 15 spoken intro lines", async () => {
  const dialogueDocument = await readJson("../../data/scripts/npc-dialogues.json");
  const intro = dialogueDocument.scripts.find(({ id }) => id === MAIN_STORY_INTRO_ID);

  assert.ok(intro);
  assert.equal(intro.lines.length, 15);
  assert.equal(intro.lines[0].speaker, "독백");
  assert.equal(intro.lines[0].text, "누구나 마음속에 알을 가지고 있다.");
  assert.equal(intro.lines.at(-1).text, "모두의 꿈을 모으면, 이아이에게 닿을 수 있을 거야.");
  assert.ok(intro.lines.every((line) => (
    typeof line.speaker === "string"
    && typeof line.text === "string"
    && !line.text.startsWith("[")
  )));
  assert.deepEqual(intro.nextAction, { type: "returnToMap" });
});

test("the intro dialogue progresses, persists completion once, and enters the map once", async () => {
  const restoreDom = installFakeDom();
  const dialogueDocument = await readJson("../../data/scripts/npc-dialogues.json");
  const navigations = [];
  let introSeenCalls = 0;
  const context = {
    content: { scripts: dialogueDocument.scripts },
    services: {
      save: {
        markIntroSeen() {
          introSeenCalls += 1;
        },
      },
    },
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  };
  const root = new FakeElement("main");
  const scene = createStoryIntroScene(context);

  try {
    scene.mount(root);
    const stage = findOne(root, "story-dialogue-scene");
    const speaker = findOne(root, "dialogue-speaker");
    const copy = findOne(root, "dialogue-text");
    const progress = findOne(root, "dialogue-progress");

    assert.equal(root.dataset.sceneLayout, "story-dialogue");
    assert.equal(root.querySelectorAll(".dialogue-shell").length, 1);
    assert.equal(root.querySelectorAll(".department-map").length, 0);
    assert.equal(root.querySelectorAll(".button--primary").length, 0);
    assert.equal(root.querySelectorAll(".button--ghost").length, 0);
    assert.equal(root.querySelectorAll(".dialogue-portrait").length, 0);
    assert.equal(root.querySelectorAll(".eyebrow").length, 0);
    assert.equal(stage.attributes.get("role"), "region");
    assert.equal(stage.attributes.get("tabindex"), "0");
    assert.equal(speaker.hidden, true);
    assert.equal(speaker.textContent, "");
    assert.equal(copy.textContent, "누구나 마음속에 알을 가지고 있다.");
    assert.equal(copy.attributes.get("role"), "status");
    assert.equal(copy.attributes.get("aria-live"), "polite");
    assert.equal(copy.attributes.get("aria-label"), "누구나 마음속에 알을 가지고 있다.");
    assert.equal(progress.textContent, "1 / 15");

    for (let index = 1; index < 15; index += 1) stage.dispatch("click");
    assert.equal(progress.textContent, "15 / 15");
    assert.equal(stage.dataset.lastLine, "true");
    assert.equal(introSeenCalls, 0);

    stage.dispatch("click");
    stage.dispatch("click");
    assert.equal(introSeenCalls, 1);
    assert.deepEqual(navigations, [{ sceneId: "map", params: undefined }]);
  } finally {
    restoreDom();
  }
});

test("unmounting the intro prevents a stale dialogue control from navigating", async () => {
  const restoreDom = installFakeDom();
  const dialogueDocument = await readJson("../../data/scripts/npc-dialogues.json");
  let introSeenCalls = 0;
  const navigations = [];
  const context = {
    content: { scripts: dialogueDocument.scripts },
    services: { save: { markIntroSeen: () => { introSeenCalls += 1; } } },
    router: {
      navigate(sceneId) {
        navigations.push(sceneId);
        return Promise.resolve(true);
      },
    },
  };
  const root = new FakeElement("main");
  const scene = createStoryIntroScene(context);

  try {
    scene.mount(root);
    const stage = findOne(root, "story-dialogue-scene");
    scene.unmount();
    stage.dispatch("click");
    root.dispatch("keyup", { key: "Enter" });
    assert.equal(root.dataset.sceneLayout, undefined);
    assert.equal(stage.listeners.get("click")?.length ?? 0, 0);
    assert.equal(root.listeners.get("keydown")?.length ?? 0, 0);
    assert.equal(root.listeners.get("keyup")?.length ?? 0, 0);
    assert.equal(root.listeners.get("blur")?.length ?? 0, 0);
    assert.equal(introSeenCalls, 0);
    assert.deepEqual(navigations, []);
  } finally {
    restoreDom();
  }
});

test("a department story is recorded once and opens its game-method screen", async () => {
  const restoreDom = installFakeDom();
  const [mapDocument, departmentsDocument, minigamesDocument, dialogueDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
  ]);
  const navigations = [];
  const seenStoryIds = [];
  const completedNpcIds = [];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: {
      maps: mapDocument.maps,
      departments: departmentsDocument.departments,
      minigames: minigamesDocument.minigames,
      scripts: dialogueDocument.scripts,
    },
    services: {
      save: {
        getState: () => ({ story: { seenStoryIds, completedNpcIds } }),
        markStorySeen(storyId) {
          if (!seenStoryIds.includes(storyId)) seenStoryIds.push(storyId);
        },
      },
    },
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  };
  const root = new FakeElement("main");
  const scene = createDialogueScene(context);

  try {
    scene.mount(root, { npcId: "npc-cse", scriptId: "cse-npc-first" });
    const stage = findOne(root, "story-dialogue-scene");
    const speaker = findOne(root, "dialogue-speaker");
    const copy = findOne(root, "dialogue-text");
    const progress = findOne(root, "dialogue-progress");

    assert.equal(progress.textContent, "1 / 3");
    assert.equal(speaker.textContent, "학생");
    assert.equal(speaker.hidden, false);
    assert.equal(root.querySelectorAll(".dialogue-portrait").length, 0);
    assert.equal(root.querySelectorAll(".button").length, 0);
    assert.equal(root.querySelectorAll(".eyebrow").length, 0);
    assert.doesNotMatch(speaker.textContent, /CSE|컴퓨터|학과/u);
    assert.equal(copy.attributes.get("aria-live"), "polite");

    const entryKeyup = root.dispatch("keyup", { key: "Enter" });
    assert.equal(entryKeyup.defaultPrevented, true);
    assert.equal(progress.textContent, "1 / 3", "the key release that opened the scene must not skip line one");

    const keydown = root.dispatch("keydown", { key: "ArrowRight", repeat: false });
    assert.equal(keydown.defaultPrevented, true);
    assert.equal(progress.textContent, "1 / 3", "keydown alone must not advance into gameplay");
    const keyup = root.dispatch("keyup", { key: "ArrowRight" });
    assert.equal(keyup.defaultPrevented, true);
    assert.equal(progress.textContent, "2 / 3");

    const ignored = root.dispatch("keyup", { key: "Escape" });
    assert.equal(ignored.defaultPrevented, false);
    assert.equal(progress.textContent, "2 / 3");

    stage.dispatch("click");
    assert.equal(progress.textContent, "3 / 3");

    stage.dispatch("click");
    stage.dispatch("click");
    assert.deepEqual(navigations, [{
      sceneId: "minigame-intro",
      params: { miniGameId: "computer-code-heart" },
    }]);
    assert.deepEqual(seenStoryIds, ["npc-cse"]);
    assert.deepEqual(completedNpcIds, [], "reading a story must not mark its game as cleared");
  } finally {
    restoreDom();
  }
});

test("the first CLEAR continues through the full after-story and guardian reward", async () => {
  const restoreDom = installFakeDom();
  const [mapDocument, minigamesDocument, introDocument, outroDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json"),
  ]);
  const seenStoryIds = [];
  const navigations = [];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: {
      maps: mapDocument.maps,
      minigames: minigamesDocument.minigames,
      scripts: [...introDocument.scripts, ...outroDocument.scripts],
    },
    services: {
      save: {
        getState: () => ({ story: { seenStoryIds } }),
        markStorySeen(storyId) {
          if (!seenStoryIds.includes(storyId)) seenStoryIds.push(storyId);
        },
      },
    },
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  };
  const flow = getPendingGuardianClearFlow(context, "computer-code-heart");
  assert.deepEqual(flow, {
    npcId: "npc-cse",
    storyId: "afterstory:cse",
    scriptId: "cse-npc-clear",
    guardianEggId: "guardian-cse",
  });

  const root = new FakeElement("main");
  const scene = createDialogueScene(context);
  try {
    scene.mount(root, { npcId: flow.npcId, scriptId: flow.scriptId });
    const stage = findOne(root, "story-dialogue-scene");
    const progress = findOne(root, "dialogue-progress");
    const copy = findOne(root, "dialogue-text");
    assert.equal(progress.textContent, "1 / 3");
    assert.equal(copy.textContent, "…내가 만든 게 처음 움직였을 때, 정말 신났었는데.");

    stage.dispatch("click");
    stage.dispatch("click");
    assert.deepEqual(seenStoryIds, [], "the reward is not owned before the last line closes");
    stage.dispatch("click");

    assert.deepEqual(seenStoryIds, ["afterstory:cse"]);
    assert.deepEqual(navigations, [{
      sceneId: "guardian-reward",
      params: { npcId: "npc-cse", guardianEggId: "guardian-cse" },
    }]);
    assert.equal(
      getPendingGuardianClearFlow(context, "computer-code-heart"),
      null,
      "a re-clear must not force the after-story or acquisition scene again",
    );
  } finally {
    restoreDom();
  }
});

test("all five Story NPCs map one mini-game to a distinct after-story and guardian egg", async () => {
  const [mapDocument, introDocument, outroDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json"),
  ]);
  const scripts = [...introDocument.scripts, ...outroDocument.scripts];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: { maps: mapDocument.maps, scripts },
    services: { save: { getState: () => ({ story: { seenStoryIds: [] } }) } },
  };
  const flows = mapDocument.maps[0].npcs.map(({ miniGameId }) => (
    getPendingGuardianClearFlow(context, miniGameId)
  ));

  assert.equal(flows.length, 5);
  assert.equal(new Set(flows.map(({ storyId }) => storyId)).size, 5);
  assert.equal(new Set(flows.map(({ scriptId }) => scriptId)).size, 5);
  assert.equal(new Set(flows.map(({ guardianEggId }) => guardianEggId)).size, 5);
  assert.ok(flows.every(Boolean));
});

test("an interrupted post-CLEAR visit resumes the unseen after-story without replaying the game", async () => {
  const restoreDom = installFakeDom();
  const [mapDocument, minigamesDocument, introDocument, outroDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json"),
  ]);
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: {
      maps: mapDocument.maps,
      minigames: minigamesDocument.minigames,
      scripts: [...introDocument.scripts, ...outroDocument.scripts],
    },
    services: {
      save: {
        getState: () => ({
          story: { completedNpcIds: ["npc-ai"], seenStoryIds: [] },
        }),
      },
    },
    router: { navigate: () => Promise.resolve(true) },
  };
  const root = new FakeElement("main");
  const scene = createDialogueScene(context);
  try {
    scene.mount(root, { npcId: "npc-ai" });
    assert.equal(
      findOne(root, "dialogue-text").textContent,
      "처음엔 ‘이런 것도 만들 수 있을까?’ 궁금해서 시작했어.",
    );
  } finally {
    scene.unmount();
    restoreDom();
  }
});

test("dialogue actions resolve to stable scene destinations", () => {
  assert.deepEqual(
    getDialogueDestination({ type: "openMiniGame", target: "ai-ball-classification" }),
    { sceneId: "minigame-intro", params: { miniGameId: "ai-ball-classification" } },
  );
  assert.deepEqual(
    getDialogueDestination({ type: "openDialogue", target: "follow-up" }, { npcId: "npc-ai" }),
    { sceneId: "dialogue", params: { npcId: "npc-ai", scriptId: "follow-up" } },
  );
  assert.deepEqual(
    getDialogueDestination({ type: "returnToMap" }),
    { sceneId: "map", params: {} },
  );
});

test("dialogue styling provides a black fallback and a rising bottom gradient", async () => {
  const stylesheet = await readFile(new URL("../../css/dialogue.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.scene\.story-dialogue-scene\s*\{/u);
  assert.match(stylesheet, /\.scene\.story-dialogue-scene\s*\{[\s\S]*padding:\s*0;/u);
  assert.match(stylesheet, /background-color:\s*#000;/u);
  assert.match(stylesheet, /\.dialogue-shell\s*\{[\s\S]*linear-gradient/u);
  assert.match(stylesheet, /animation:\s*dialogue-panel-rise/u);
  assert.match(stylesheet, /@keyframes\s+dialogue-panel-rise/u);
  assert.doesNotMatch(stylesheet, /\.dialogue-portrait/u);
});

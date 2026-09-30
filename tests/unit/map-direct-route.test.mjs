import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GUARDIAN_EGGS } from "../../js/core/guardian-inventory.js";
import {
  createMapDestinationNavigator,
  createMapGameNavigator,
  createMapScene,
  getFinalBattleDestination,
  getMapCardDestination,
  getMiniGameStoryDestination,
  getStoryNpcProgressPresentation,
  isStoryWorldInteractAction,
  resolveUnlockedFinalBattle,
} from "../../js/scenes/map-scene.js";
import { createMiniGameIntroScene } from "../../js/scenes/minigame-intro-scene.js";

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

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
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

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this });
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

test("every department map card opens its registered guardian story first", async () => {
  const [mapDocument, registryDocument, dialogueDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
  ]);
  const registeredIds = new Set(registryDocument.minigames.map((game) => game.id));
  const scriptsById = new Map(dialogueDocument.scripts.map((script) => [script.id, script]));
  const npcs = mapDocument.maps.flatMap((map) => map.npcs ?? []);

  assert.equal(npcs.length, 5);
  for (const npc of npcs) {
    assert.ok(registeredIds.has(npc.miniGameId), `${npc.id} mini-game registration`);
    const firstScript = scriptsById.get(npc.firstScript);
    assert.ok(firstScript, `${npc.id} guardian story registration`);
    assert.equal(firstScript.lines.length, 3, `${npc.id} guardian story line count`);
    assert.deepEqual(firstScript.nextAction, {
      type: "openMiniGame",
      target: npc.miniGameId,
    });
    assert.deepEqual(getMapCardDestination(npc), {
      sceneId: "dialogue",
      params: { npcId: npc.id, scriptId: npc.firstScript },
    });
    assert.deepEqual(getMapCardDestination(npc, { storySeen: true }), {
      sceneId: "minigame-intro",
      params: { miniGameId: npc.miniGameId },
    });
    assert.deepEqual(getMapCardDestination(npc, {
      storySeen: true,
      clearStoryPending: true,
    }), {
      sceneId: "dialogue",
      params: { npcId: npc.id, scriptId: npc.clearScriptId },
    });
    assert.deepEqual(getMapCardDestination(npc, { storySeen: true, replay: true }), {
      sceneId: "dialogue",
      params: { npcId: npc.id, scriptId: npc.firstScript },
    });
  }
});

test("a map card without its complete story binding cannot create a route", () => {
  assert.throws(
    () => getMapCardDestination({ id: "broken-card", miniGameId: "some-game" }),
    /id, firstScript, and miniGameId/u,
  );
});

test("every mini-game launch helper resolves the same first story used by its map card", async () => {
  const mapDocument = await readJson("../../data/map-data.json");
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: { maps: mapDocument.maps },
  };
  const npcs = mapDocument.maps.flatMap((map) => map.npcs ?? []);

  for (const npc of npcs) {
    assert.deepEqual(
      getMiniGameStoryDestination(context, npc.miniGameId),
      getMapCardDestination(npc),
    );
  }
  assert.throws(
    () => getMiniGameStoryDestination(context, "missing-game"),
    /학과 스토리 진입점을 찾을 수 없습니다/u,
  );
});

test("a seen department story opens game instructions and remains explicitly replayable", async () => {
  const mapDocument = await readJson("../../data/map-data.json");
  const npc = mapDocument.maps.flatMap((map) => map.npcs ?? [])[0];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: { maps: mapDocument.maps },
    services: {
      save: {
        getState: () => ({
          story: { seenStoryIds: [npc.id], completedNpcIds: [] },
        }),
      },
      account: { getState: () => ({ seenStoryIds: [], completedGameIds: [] }) },
    },
  };

  assert.deepEqual(getMiniGameStoryDestination(context, npc.miniGameId), {
    sceneId: "minigame-intro",
    params: { miniGameId: npc.miniGameId },
  });
  assert.deepEqual(getMiniGameStoryDestination(context, npc.miniGameId, { replay: true }), {
    sceneId: "dialogue",
    params: { npcId: npc.id, scriptId: npc.firstScript },
  });
});

test("the game-method screen starts the selected mini-game without replaying its story", async () => {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  const previousImageElement = globalThis.HTMLImageElement;
  globalThis.Node = FakeNode;
  globalThis.HTMLImageElement = class FakeImageElement {};
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
  };

  const [mapDocument, departmentsDocument, minigamesDocument, dialogueDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
  ]);
  const navigations = [];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: {
      maps: mapDocument.maps,
      departments: departmentsDocument.departments,
      minigames: minigamesDocument.minigames,
      scripts: dialogueDocument.scripts,
    },
    services: {
      assets: {
        acquireGroup: async () => ({ release() {} }),
        get: (assetId) => assetId.endsWith("-config") ? {} : null,
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
  const scene = createMiniGameIntroScene(context);

  try {
    await scene.mount(
      root,
      { miniGameId: "ai-ball-classification" },
      { signal: new AbortController().signal },
    );
    const launchButtons = root.querySelectorAll(".button--primary");
    const howToTitles = root.querySelectorAll(".minigame-how-to__title");
    const controlLists = root.querySelectorAll(".control-list");
    assert.equal(howToTitles.length, 1);
    assert.equal(howToTitles[0].textContent, "게임 방법");
    assert.equal(controlLists.length, 2);
    assert.equal(launchButtons.length, 1);
    launchButtons[0].dispatch("click");
    assert.deepEqual(navigations, [{
      sceneId: "minigame",
      params: { miniGameId: "ai-ball-classification" },
    }]);
  } finally {
    scene.unmount();
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImageElement === undefined) delete globalThis.HTMLImageElement;
    else globalThis.HTMLImageElement = previousImageElement;
  }
});

test("rapid repeated map selections launch only the first department story", () => {
  const navigations = [];
  const launch = createMapGameNavigator({
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  });

  assert.equal(launch({
    id: "npc-cs",
    firstScript: "cs-npc-first",
    miniGameId: "cyber-click-to-purify",
  }), true);
  assert.equal(launch({
    id: "npc-ai",
    firstScript: "ai-npc-first",
    miniGameId: "ai-ball-classification",
  }), false);
  assert.deepEqual(navigations, [{
    sceneId: "dialogue",
    params: { npcId: "npc-cs", scriptId: "cs-npc-first" },
  }]);
});

test("the final battle opens only after five distinct clears and five guardian after-stories", async () => {
  const battleDefinitions = await readJson("../../data/battles.json");
  const finalBattle = battleDefinitions.find((battle) => battle.id === "word-breaker");
  const requiredIds = finalBattle.unlockCondition.miniGameIds;
  const localCompletedIds = requiredIds.slice(0, 4);
  const localSave = {
    minigames: Object.fromEntries(requiredIds.map((id) => [
      id,
      { completed: localCompletedIds.includes(id) },
    ])),
    story: {
      seenStoryIds: GUARDIAN_EGGS
        .filter(({ miniGameId }) => localCompletedIds.includes(miniGameId))
        .map(({ storyId }) => storyId),
    },
  };

  assert.equal(
    resolveUnlockedFinalBattle(
      battleDefinitions,
      localSave,
      { completedGameIds: [], stats: { clears: 99 } },
    ),
    null,
  );
  assert.equal(
    resolveUnlockedFinalBattle(
      battleDefinitions,
      localSave,
      {
        completedGameIds: [requiredIds[0], requiredIds[0]],
        seenStoryIds: [GUARDIAN_EGGS[0].storyId],
      },
    ),
    null,
  );

  const entry = resolveUnlockedFinalBattle(
    battleDefinitions,
    localSave,
    {
      completedGameIds: [requiredIds.at(-1)],
      seenStoryIds: [GUARDIAN_EGGS.find(({ miniGameId }) => miniGameId === requiredIds.at(-1)).storyId],
    },
  );
  assert.equal(entry.battle.id, "word-breaker");
  assert.deepEqual(entry.destination, {
    sceneId: "battle",
    params: { battleId: "word-breaker" },
  });
  assert.deepEqual(getFinalBattleDestination(finalBattle), entry.destination);
});

test("pre-game and final cards share one pending navigation guard", () => {
  const navigations = [];
  const navigate = createMapDestinationNavigator({
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  });

  assert.equal(navigate(getMapCardDestination({
    id: "npc-ds",
    firstScript: "ds-npc-first",
    miniGameId: "data-number-baseball",
  })), true);
  assert.equal(navigate({ sceneId: "battle", params: { battleId: "word-breaker" } }), false);
  assert.deepEqual(navigations, [{
    sceneId: "dialogue",
    params: { npcId: "npc-ds", scriptId: "ds-npc-first" },
  }]);
});

test("the Story world accepts E, Space, and Enter only on their initial press", () => {
  assert.equal(isStoryWorldInteractAction({ action: "INTERACT", phase: "press" }), true);
  assert.equal(isStoryWorldInteractAction({ action: "CONFIRM", phase: "press" }), true);
  assert.equal(isStoryWorldInteractAction({ action: "CONFIRM", phase: "release" }), false);
  assert.equal(isStoryWorldInteractAction({ action: "ATTACK", phase: "press" }), false);
});

test("the Story world reserves Space for interaction instead of character attacks", async () => {
  const source = await readFile(new URL("../../js/scenes/map-scene.js", import.meta.url), "utf8");
  assert.match(source, /inputOptions:\s*\{\s*attackEnabled:\s*false\s*\}/u);
});

test("a cleared NPC waiting for its after-story keeps a reward indicator", () => {
  assert.deepEqual(getStoryNpcProgressPresentation({
    completed: true,
    storySeen: true,
    clearStoryPending: true,
  }), {
    progress: "reward-pending",
    indicator: "!",
  });
  assert.deepEqual(getStoryNpcProgressPresentation({ completed: true }), {
    progress: "complete",
    indicator: "✓",
  });
});

test("the Story world renders five NPCs and unlocks its final portal after five earned eggs", async () => {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
  };

  const [mapDocument, departmentsDocument, minigamesDocument, battleDefinitions] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/battles.json"),
  ]);
  const requiredIds = battleDefinitions.find((battle) => battle.id === "word-breaker")
    .unlockCondition.miniGameIds;
  const localIds = requiredIds.slice(0, 4);
  let accountState = { completedGameIds: [] };
  const accountListeners = new Set();
  const navigations = [];
  const context = {
    config: { mainMapId: "festival-main-map", features: { battleContent: true } },
    content: {
      maps: mapDocument.maps,
      departments: departmentsDocument.departments,
      minigames: minigamesDocument.minigames,
      battles: battleDefinitions,
    },
    services: {
      save: {
        getState: () => ({
          story: {
            completedNpcIds: [],
            seenStoryIds: GUARDIAN_EGGS
              .filter(({ miniGameId }) => localIds.includes(miniGameId))
              .map(({ storyId }) => storyId),
          },
          minigames: Object.fromEntries(requiredIds.map((id) => [
            id,
            { completed: localIds.includes(id) },
          ])),
        }),
      },
      account: {
        getState: () => accountState,
        subscribe(listener) {
          accountListeners.add(listener);
          listener(accountState);
          return () => accountListeners.delete(listener);
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
  const scene = createMapScene(context);

  try {
    scene.mount(root);
    assert.equal(root.querySelectorAll(".story-world__npc").length, 5);
    assert.equal(root.querySelectorAll(".story-world__viewport").length, 1);
    assert.equal(root.querySelectorAll(".story-world__inventory-slot").length, 1);
    const finalPortals = root.querySelectorAll(".story-world__final-portal");
    assert.equal(finalPortals.length, 1);
    assert.equal(finalPortals[0].dataset.locked, "true");

    accountState = {
      completedGameIds: [requiredIds.at(-1)],
      seenStoryIds: [GUARDIAN_EGGS.find(({ miniGameId }) => miniGameId === requiredIds.at(-1)).storyId],
    };
    for (const listener of accountListeners) listener(accountState);
    assert.equal(finalPortals[0].dataset.locked, "false");
    assert.deepEqual(navigations, []);

    scene.unmount();
    assert.equal(accountListeners.size, 0);
  } finally {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

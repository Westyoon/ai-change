import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMapDestinationNavigator,
  createMapGameNavigator,
  createMapScene,
  getFinalBattleDestination,
  getMapCardDestination,
  resolveUnlockedFinalBattle,
} from "../../js/scenes/map-scene.js";

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

test("every department map card launches its registered mini-game directly", async () => {
  const [mapDocument, registryDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/minigames.json"),
  ]);
  const registeredIds = new Set(registryDocument.minigames.map((game) => game.id));
  const npcs = mapDocument.maps.flatMap((map) => map.npcs ?? []);

  assert.equal(npcs.length, 5);
  for (const npc of npcs) {
    assert.ok(registeredIds.has(npc.miniGameId), `${npc.id} mini-game registration`);
    assert.deepEqual(getMapCardDestination(npc), {
      sceneId: "minigame",
      params: { miniGameId: npc.miniGameId },
    });
  }
});

test("a map card without a mini-game cannot create a direct route", () => {
  assert.throws(() => getMapCardDestination({ id: "broken-card" }), /miniGameId/u);
});

test("rapid repeated map selections launch only the first department game", () => {
  const navigations = [];
  const launch = createMapGameNavigator({
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  });

  assert.equal(launch({ miniGameId: "cyber-click-to-purify" }), true);
  assert.equal(launch({ miniGameId: "ai-ball-classification" }), false);
  assert.deepEqual(navigations, [{
    sceneId: "minigame",
    params: { miniGameId: "cyber-click-to-purify" },
  }]);
});

test("the final battle is added to the pre-game list only after five distinct clears", async () => {
  const battleDefinitions = await readJson("../../data/battles.json");
  const finalBattle = battleDefinitions.find((battle) => battle.id === "word-breaker");
  const requiredIds = finalBattle.unlockCondition.miniGameIds;
  const localCompletedIds = requiredIds.slice(0, 4);
  const localSave = {
    minigames: Object.fromEntries(requiredIds.map((id) => [
      id,
      { completed: localCompletedIds.includes(id) },
    ])),
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
      { completedGameIds: [requiredIds[0], requiredIds[0]] },
    ),
    null,
  );

  const entry = resolveUnlockedFinalBattle(
    battleDefinitions,
    localSave,
    { completedGameIds: [requiredIds.at(-1)] },
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

  assert.equal(navigate(getMapCardDestination({ miniGameId: "data-number-baseball" })), true);
  assert.equal(navigate({ sceneId: "battle", params: { battleId: "word-breaker" } }), false);
  assert.deepEqual(navigations, [{
    sceneId: "minigame",
    params: { miniGameId: "data-number-baseball" },
  }]);
});

test("the Story map renders the sixth final card only when account and local clears total five", async () => {
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
          story: { completedNpcIds: [] },
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
    assert.equal(root.querySelectorAll(".npc-card").length, 5);
    assert.equal(root.querySelectorAll(".npc-card--final").length, 0);

    accountState = { completedGameIds: [requiredIds.at(-1)] };
    for (const listener of accountListeners) listener(accountState);
    const finalCards = root.querySelectorAll(".npc-card--final");
    assert.equal(finalCards.length, 1);
    assert.equal(root.querySelectorAll(".npc-card").length, 6);

    finalCards[0].dispatch("click");
    finalCards[0].dispatch("click");
    assert.deepEqual(navigations, [{
      sceneId: "battle",
      params: { battleId: "word-breaker" },
    }]);

    scene.unmount();
    assert.equal(accountListeners.size, 0);
  } finally {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

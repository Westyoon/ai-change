import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMapGameNavigator,
  getMapCardDestination,
} from "../../js/scenes/map-scene.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
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

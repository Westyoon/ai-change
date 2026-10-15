import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createStoryMenuNavigator,
  resolveBattleMenuAccess,
} from "../../js/scenes/main-menu-scene.js";

const REQUIRED_IDS = ["ds", "cs", "cse", "ai", "aids"];
const BATTLES = [{
  unlockCondition: {
    type: "ALL_MINIGAMES_CLEAR",
    miniGameIds: REQUIRED_IDS,
  },
}];

function save(completedIds = [], seenEggCodes = completedIds) {
  return {
    minigames: Object.fromEntries(REQUIRED_IDS.map((id) => [
      id,
      { completed: completedIds.includes(id) },
    ])),
    story: {
      seenStoryIds: [...seenEggCodes.map((code) => `afterstory:${code}`), "festival-open"],
    },
  };
}

test("Battle stays disabled until all five guardian eggs are collected", () => {
  assert.deepEqual(
    resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS.slice(0, 4)), { completedGameIds: [] }),
    { unlocked: false, badge: "수호알 4/5" },
  );
  assert.deepEqual(
    resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS.slice(0, 4)), {
      completedGameIds: ["aids"],
      seenStoryIds: ["afterstory:aids"],
    }),
    { unlocked: true, badge: "OPEN" },
  );
  assert.deepEqual(
    resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS, []), { completedGameIds: [] }),
    { unlocked: false, badge: "수호알 0/5" },
    "five clears do not bypass the five guardian after-stories",
  );
  assert.deepEqual(
    resolveBattleMenuAccess([], save(REQUIRED_IDS), { completedGameIds: [] }),
    { unlocked: false, badge: "COMING SOON" },
  );
});

test("one playable published Battle keeps the Battle entry available", () => {
  const laterBattle = {
    unlockCondition: {
      type: "ALL_MINIGAMES_CLEAR",
      miniGameIds: [...REQUIRED_IDS, "future-guardian"],
    },
  };
  assert.deepEqual(
    resolveBattleMenuAccess([...BATTLES, laterBattle], save(REQUIRED_IDS), { completedGameIds: [] }),
    { unlocked: true, badge: "OPEN" },
  );
});

test("the menu routes Story through the one-time dialogue intro and exposes no removed cards", async () => {
  const [menuSource, appSource, config] = await Promise.all([
    readFile(new URL("../../js/scenes/main-menu-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../../data/app-config.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.match(menuSource, /replay\s*\|\|\s*!introSeen\s*\?\s*"story-intro"\s*:\s*"map"/u);
  assert.match(menuSource, /menuCard\("Story",\s*openStory\)/u);
  assert.match(menuSource, /menuCard\("Battle"[\s\S]*?disabled:\s*!battleAccess\.unlocked/u);
  assert.doesNotMatch(menuSource, /menuCard\("(?:스토리 시작|게임 방법|내 계정|설정)"/u);
  assert.match(appSource, /import\s*\{\s*createStoryIntroScene\s*\}/u);
  assert.match(appSource, /["']story-intro["']:\s*createStoryIntroScene/u);
  assert.equal(config.features.guestBattleTesting, true);
  assert.match(menuSource, /account\?\.authenticated\s*\|\|\s*guestBattleTesting/u);
});

test("OPEN disappears after the first Battle selection and remains hidden across restored local or account progress", () => {
  const local = save(REQUIRED_IDS);
  assert.deepEqual(resolveBattleMenuAccess(BATTLES, local, {}), { unlocked: true, badge: "OPEN" });
  local.story.seenStoryIds.push("postgame-entry-seen");
  assert.deepEqual(resolveBattleMenuAccess(BATTLES, structuredClone(local), {}), { unlocked: true, badge: null });
  assert.deepEqual(resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS), { seenStoryIds: ["postgame-entry-seen"] }), { unlocked: true, badge: null });
  assert.equal(resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS.slice(0, 4)), { seenStoryIds: ["postgame-entry-seen"] }).unlocked, false);
});

test("rapid repeated Story selections enqueue the intro only once", async () => {
  let resolveNavigation;
  const navigation = new Promise((resolve) => {
    resolveNavigation = resolve;
  });
  const navigations = [];
  const openStory = createStoryMenuNavigator({
    router: {
      navigate(sceneId) {
        navigations.push(sceneId);
        return navigation;
      },
    },
  });

  assert.equal(openStory(), true);
  assert.equal(openStory(), false);
  assert.deepEqual(navigations, ["story-intro"]);

  resolveNavigation(true);
  await navigation;
});

test("a rejected Story transition can be retried", async () => {
  const navigations = [];
  const openStory = createStoryMenuNavigator({
    router: {
      navigate(sceneId) {
        navigations.push(sceneId);
        return Promise.resolve(false);
      },
    },
  });

  assert.equal(openStory(), true);
  assert.equal(openStory(), false);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(openStory(), true);
  assert.deepEqual(navigations, ["story-intro", "story-intro"]);
});

test("Story enters the map after its one-time intro while replay still opens the intro", () => {
  const navigations = [];
  const context = {
    services: {
      save: {
        getState: () => ({
          story: { introSeen: true, seenStoryIds: ["main-story-intro"] },
        }),
      },
      account: { getState: () => ({ seenStoryIds: [] }) },
    },
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
        return Promise.resolve(true);
      },
    },
  };

  assert.equal(createStoryMenuNavigator(context)(), true);
  assert.equal(createStoryMenuNavigator(context, { replay: true })(), true);
  assert.deepEqual(navigations, [
    { sceneId: "map", params: {} },
    { sceneId: "story-intro", params: { replay: true } },
  ]);
});

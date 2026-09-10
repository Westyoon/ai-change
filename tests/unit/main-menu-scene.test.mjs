import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveBattleMenuAccess } from "../../js/scenes/main-menu-scene.js";

const REQUIRED_IDS = ["ds", "cs", "cse", "ai", "aids"];
const BATTLES = [{
  unlockCondition: {
    type: "ALL_MINIGAMES_CLEAR",
    miniGameIds: REQUIRED_IDS,
  },
}];

function save(completedIds = []) {
  return {
    minigames: Object.fromEntries(REQUIRED_IDS.map((id) => [
      id,
      { completed: completedIds.includes(id) },
    ])),
  };
}

test("Battle stays disabled until all five guardian eggs are collected", () => {
  assert.deepEqual(
    resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS.slice(0, 4)), { completedGameIds: [] }),
    { unlocked: false, badge: "수호알 4/5" },
  );
  assert.deepEqual(
    resolveBattleMenuAccess(BATTLES, save(REQUIRED_IDS.slice(0, 4)), { completedGameIds: ["aids"] }),
    { unlocked: true, badge: "OPEN" },
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

test("the simplified menu routes Story straight to the map and exposes no removed cards", async () => {
  const [menuSource, appSource] = await Promise.all([
    readFile(new URL("../../js/scenes/main-menu-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(menuSource, /menuCard\("Story"[\s\S]*?navigate\("map"\)/u);
  assert.match(menuSource, /menuCard\("Battle"[\s\S]*?disabled:\s*!battleAccess\.unlocked/u);
  assert.doesNotMatch(menuSource, /menuCard\("(?:스토리 시작|게임 방법|내 계정|설정)"/u);
  assert.doesNotMatch(appSource, /createStoryIntroScene|["']story-intro["']/u);
});

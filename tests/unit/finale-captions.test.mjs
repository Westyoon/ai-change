import assert from "node:assert/strict";
import test from "node:test";
import { BattleCaptionDeck, EIAI_BATTLE_CAPTIONS } from "../../js/core/finale-story.js";
import { resolveBattleMenuAccess } from "../../js/scenes/main-menu-scene.js";
import { isFestivalOpen } from "../../js/core/story-progress.js";

test("combat captions show every 8–12 seconds, disappear after five seconds, and never repeat", () => {
  const captions = [];
  const deck = new BattleCaptionDeck({ random: () => .5, onCaption: (text) => captions.push(text) });
  deck.update(9999); assert.deepEqual(captions, []);
  for (let i = 0; i < 10; i++) {
    deck.update(i === 0 ? 1 : 5000);
    assert.ok(captions.at(-1));
    deck.update(4999); assert.ok(captions.at(-1));
    deck.update(1); assert.equal(captions.at(-1), "");
  }
  const spoken = captions.filter(Boolean);
  assert.equal(new Set(spoken).size, 10);
  assert.deepEqual([...spoken].sort(), [...EIAI_BATTLE_CAPTIONS].sort());
  deck.stop(); deck.update(1e6); assert.equal(captions.at(-1), "");
  assert.equal(captions.filter(Boolean).length, 10);
  deck.reset(); deck.update(10000); assert.equal(captions.filter(Boolean).length, 11);
});

test("all eggs and a cleared battle do not open postgame before the festival button", () => {
  const ids = ["data-number-baseball", "cyber-click-to-purify", "computer-code-heart", "ai-ball-classification", "ai-data-egg-sort"];
  const save = { minigames: Object.fromEntries(ids.map((id) => [id, { completed: true }])),
    story: { seenStoryIds: ["afterstory:ds", "afterstory:cs", "afterstory:cse", "afterstory:ai", "afterstory:aids", "main-story-outro"] } };
  const battles = [{ unlockCondition: { type: "ALL_MINIGAMES_CLEAR", miniGameIds: ids } }];
  assert.equal(resolveBattleMenuAccess(battles, save, {}).unlocked, false);
  assert.equal(isFestivalOpen({ services: { save: { getState: () => save } } }), false);
  save.story.seenStoryIds.push("festival-open");
  assert.equal(resolveBattleMenuAccess(battles, save, {}).unlocked, true);
  assert.equal(isFestivalOpen({ services: { save: { getState: () => save } } }), true);
});

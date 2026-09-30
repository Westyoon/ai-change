import assert from "node:assert/strict";
import test from "node:test";

import {
  GUARDIAN_EGGS,
  findGuardianEgg,
  getGuardianEggCatalog,
  getGuardianEggCount,
  getGuardianInventory,
  hasGuardianEgg,
} from "../../js/core/guardian-inventory.js";

function context({ local = [], account = [], catalog = null } = {}) {
  return {
    content: { guardianEggs: catalog ?? GUARDIAN_EGGS },
    services: {
      save: {
        getState: () => ({
          story: { seenStoryIds: local },
        }),
      },
      account: {
        getState: () => ({ seenStoryIds: account }),
      },
    },
  };
}

test("guardian egg catalog keeps five stable department mappings", () => {
  assert.deepEqual(GUARDIAN_EGGS.map(({ id }) => id), [
    "guardian-ds",
    "guardian-cs",
    "guardian-cse",
    "guardian-ai",
    "guardian-aids",
  ]);
  assert.deepEqual(GUARDIAN_EGGS.map(({ storyId }) => storyId), [
    "afterstory:ds",
    "afterstory:cs",
    "afterstory:cse",
    "afterstory:ai",
    "afterstory:aids",
  ]);
  assert.equal(new Set(GUARDIAN_EGGS.map(({ miniGameId }) => miniGameId)).size, 5);
  assert.ok(GUARDIAN_EGGS.every(({ color }) => /^#[0-9a-f]{6}$/iu.test(color)));
  assert.ok(GUARDIAN_EGGS.every(({ inkColor }) => /^#[0-9a-f]{6}$/iu.test(inkColor)));
  assert.deepEqual(GUARDIAN_EGGS.map(({ imageSrc }) => imageSrc), [
    "./assets/images/guardian-eggs/guardian-ds.png",
    "./assets/images/guardian-eggs/guardian-cs.png",
    "./assets/images/guardian-eggs/guardian-cse.png",
    "./assets/images/guardian-eggs/guardian-ai.png",
    "./assets/images/guardian-eggs/guardian-aids.png",
  ]);
  assert.deepEqual(GUARDIAN_EGGS.map(({ color, inkColor }) => [color, inkColor]), [
    ["#fcb5dd", "#501060"],
    ["#a2c05e", "#304010"],
    ["#ac51fa", "#301040"],
    ["#0e7ffd", "#0010a0"],
    ["#fdd044", "#703000"],
  ]);
});

test("acquisition is derived from locally or remotely completed guardian after-stories", () => {
  const state = context({
    local: ["afterstory:ds", "afterstory:cse"],
    account: ["afterstory:cse", "afterstory:ai"],
  });
  const inventory = getGuardianInventory(state);

  assert.deepEqual(
    inventory.filter(({ acquired }) => acquired).map(({ id }) => id),
    ["guardian-ds", "guardian-cse", "guardian-ai"],
  );
  assert.deepEqual(getGuardianEggCount(state), { acquired: 3, total: 5 });
  assert.equal(findGuardianEgg(state, "guardian-cse")?.acquiredLocally, true);
  assert.equal(findGuardianEgg(state, "guardian-cse")?.acquiredFromAccount, true);
  assert.equal(hasGuardianEgg(state, "guardian-ai"), true);
  assert.equal(hasGuardianEgg(state, "guardian-cs"), false);
  assert.equal(findGuardianEgg(state, "missing"), null);
});

test("a mini-game clear alone does not grant its guardian egg before the after-story", () => {
  const state = context();
  state.services.save.getState = () => ({
    minigames: { "data-number-baseball": { completed: true } },
    story: { seenStoryIds: [] },
  });
  state.services.account.getState = () => ({
    completedGameIds: ["data-number-baseball"],
    seenStoryIds: [],
  });

  assert.equal(hasGuardianEgg(state, "guardian-ds"), false);
  assert.deepEqual(getGuardianEggCount(state), { acquired: 0, total: 5 });
});

test("an invalid loaded catalog safely falls back to the fixed five eggs", () => {
  const invalid = GUARDIAN_EGGS.map((egg, index) => ({
    ...egg,
    id: index === 1 ? GUARDIAN_EGGS[0].id : egg.id,
  }));
  assert.equal(getGuardianEggCatalog(context({ catalog: invalid })), GUARDIAN_EGGS);
});

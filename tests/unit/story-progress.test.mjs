import assert from "node:assert/strict";
import test from "node:test";
import {
  FINAL_BATTLE_UNLOCK_STORY_ID,
  MAIN_STORY_ID,
  OUTRO_STORY_ID,
  STORY_MEMORIES,
  DEPARTMENT_AFTERSTORY_IDS,
  findStoryMemory,
  getStoryMemoryChapters,
  hasSeenStory,
  hasSeenStoryMemory,
  markStorySeen,
} from "../../js/core/story-progress.js";

test("the shared memory shelf has the requested fixed order and stable story ids", () => {
  assert.deepEqual(
    STORY_MEMORIES.map(({ label }) => label),
    [
      "intro",
      "데이터사이언스",
      "사이버보안",
      "컴퓨터공학",
      "인공지능",
      "인공지능데이터사이언스",
      "outro",
    ],
  );
  assert.equal(findStoryMemory(MAIN_STORY_ID)?.scriptId, MAIN_STORY_ID);
  assert.equal(findStoryMemory(OUTRO_STORY_ID)?.scriptId, OUTRO_STORY_ID);
  assert.deepEqual(
    getStoryMemoryChapters(findStoryMemory("npc-ds")).map(({ id }) => id),
    ["npc-ds", DEPARTMENT_AFTERSTORY_IDS.DS],
  );
  assert.equal(
    findStoryMemory(DEPARTMENT_AFTERSTORY_IDS.DS)?.scriptId,
    "ds-npc-clear",
  );
  assert.equal(findStoryMemory("missing-memory"), null);
});

test("memory availability combines local, account, and legacy completion without unlocking unseen stories", () => {
  const context = {
    services: {
      save: {
        getState: () => ({
          story: {
            introSeen: true,
            seenStoryIds: ["npc-ds"],
            completedNpcIds: ["npc-cse"],
          },
        }),
      },
      account: {
        getState: () => ({
          seenStoryIds: ["npc-cs"],
          completedGameIds: ["ai-ball-classification"],
        }),
      },
    },
  };
  const availability = Object.fromEntries(
    STORY_MEMORIES.map((memory) => [memory.id, hasSeenStoryMemory(context, memory)]),
  );

  assert.equal(availability[MAIN_STORY_ID], true);
  assert.equal(availability["npc-ds"], true);
  assert.equal(availability["npc-cs"], true);
  assert.equal(availability["npc-cse"], true);
  assert.equal(availability["npc-ai"], true);
  assert.equal(availability["npc-aids"], false);
  assert.equal(availability[OUTRO_STORY_ID], false);
  assert.equal(
    hasSeenStoryMemory(context, findStoryMemory(DEPARTMENT_AFTERSTORY_IDS.AI)),
    false,
    "a clear alone must not claim that the afterstory was already viewed",
  );
});

test("story visibility combines account progress with legacy local completion", () => {
  const context = {
    services: {
      save: {
        getState: () => ({
          story: {
            introSeen: true,
            seenStoryIds: [],
            completedNpcIds: ["npc-ds"],
          },
        }),
      },
      account: {
        getState: () => ({
          seenStoryIds: [FINAL_BATTLE_UNLOCK_STORY_ID],
          completedGameIds: ["ai-ball-classification"],
        }),
      },
    },
  };

  assert.equal(hasSeenStory(context, MAIN_STORY_ID, { legacyIntro: true }), true);
  assert.equal(hasSeenStory(context, "npc-ds", { legacyNpcId: "npc-ds" }), true);
  assert.equal(hasSeenStory(context, FINAL_BATTLE_UNLOCK_STORY_ID), true);
  assert.equal(hasSeenStory(context, "npc-ai", {
    completedMiniGameId: "ai-ball-classification",
  }), true);
  assert.equal(hasSeenStory(context, "npc-cse"), false);
});

test("markStorySeen records locally and syncs an authenticated account", async () => {
  const local = [];
  const completedNpcIds = [];
  const remote = [];
  const context = {
    services: {
      save: {
        markStorySeen: (storyId) => local.push(storyId),
        markNpcCompleted: (npcId) => completedNpcIds.push(npcId),
      },
      account: {
        getState: () => ({ authenticated: true }),
        markStorySeen: async (storyId) => remote.push(storyId),
      },
    },
  };

  markStorySeen(context, FINAL_BATTLE_UNLOCK_STORY_ID);
  await Promise.resolve();
  assert.deepEqual(local, [FINAL_BATTLE_UNLOCK_STORY_ID]);
  assert.deepEqual(remote, [FINAL_BATTLE_UNLOCK_STORY_ID]);
  assert.deepEqual(completedNpcIds, []);
});

test("reading a department story never marks its mini-game as completed", async () => {
  const seenStoryIds = [];
  const completedNpcIds = [];
  const context = {
    services: {
      save: {
        markStorySeen: (storyId) => seenStoryIds.push(storyId),
        markNpcCompleted: (npcId) => completedNpcIds.push(npcId),
      },
      account: { getState: () => ({ authenticated: false }) },
    },
  };

  markStorySeen(context, "npc-ai", { npcId: "npc-ai" });
  assert.deepEqual(seenStoryIds, ["npc-ai"]);
  assert.deepEqual(completedNpcIds, []);
});

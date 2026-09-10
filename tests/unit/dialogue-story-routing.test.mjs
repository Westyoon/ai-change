import assert from "node:assert/strict";
import test from "node:test";
import {
  getDialogueCompletionLabel,
  isNpcStoryCompleted,
} from "../../js/scenes/dialogue-scene.js";

function context({ localNpcIds = [], localGameIds = [], accountGameIds = [] } = {}) {
  const minigames = Object.fromEntries(localGameIds.map((id) => [id, { completed: true }]));
  return {
    services: {
      save: { getState: () => ({ story: { completedNpcIds: localNpcIds }, minigames }) },
      account: { getState: () => ({ completedGameIds: accountGameIds }) },
    },
  };
}

test("NPC story completion accepts either local or signed-in account progress", () => {
  const npc = { id: "npc-ai", miniGameId: "ai-ball-classification" };
  assert.equal(isNpcStoryCompleted(context(), npc), false);
  assert.equal(isNpcStoryCompleted(context({ localNpcIds: [npc.id] }), npc), true);
  assert.equal(isNpcStoryCompleted(context({ localGameIds: [npc.miniGameId] }), npc), true);
  assert.equal(isNpcStoryCompleted(context({ accountGameIds: [npc.miniGameId] }), npc), true);
});

test("the final dialogue button follows the script action", () => {
  assert.equal(getDialogueCompletionLabel({ type: "openMiniGame" }, true), "게임 방법 보기");
  assert.equal(getDialogueCompletionLabel({ type: "returnToMap" }, true), "다음 꿈을 찾으러 가기");
  assert.equal(getDialogueCompletionLabel({ type: "openDialogue" }), "다음 이야기");
  assert.equal(getDialogueCompletionLabel({ type: "goToMenu" }), "메뉴로");
});

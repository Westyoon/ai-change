import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { INTRO_VISUAL_STATES } from "../../js/scenes/story-intro-scene.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

async function source(relativeUrl) {
  return readFile(new URL(relativeUrl, import.meta.url), "utf8");
}

test("the game start card opens a twelve-beat cinematic intro and then the map", async () => {
  const [story, menuSource, introSource, dialogueCss] = await Promise.all([
    readJson("../../data/scripts/main-story.json"),
    source("../../js/scenes/main-menu-scene.js"),
    source("../../js/scenes/story-intro-scene.js"),
    source("../../css/dialogue.css"),
  ]);
  const intro = story.scripts.find((script) => script.id === "main-story-intro");

  assert.equal(intro?.lines.length, 12);
  assert.deepEqual(intro?.nextAction, { type: "returnToMap" });
  assert.ok(intro.lines.every((line) => typeof line.speaker === "string" && line.speaker.length > 0));
  assert.ok(intro.lines.every((line) => typeof line.text === "string" && line.text.length > 0));
  assert.ok(intro.lines.every((line) => typeof line.stageDirection === "string" && line.stageDirection.length > 0));
  assert.ok(intro.lines.every((line) => INTRO_VISUAL_STATES.includes(line.visual)));
  assert.match(menuSource, /menuCard\("게임 시작"[\s\S]*?navigate\("story-intro"\)/u);
  assert.match(introSource, /new DialogueManager/u);
  assert.match(introSource, /markIntroSeen/u);
  assert.match(introSource, /navigate\("map"\)/u);
  assert.match(dialogueCss, /body\[data-scene="story-intro"\] \.top-bar/u);
  assert.match(dialogueCss, /prefers-reduced-motion/u);
  assert.match(dialogueCss, /orientation: landscape/u);
});

test("all five departments have three pre-game lines and a connected guardian-egg clear story", async () => {
  const [npcDocument, outroDocument, mapDocument, miniGameScene] = await Promise.all([
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json"),
    readJson("../../data/map-data.json"),
    source("../../js/scenes/minigame-scene.js"),
  ]);
  const scripts = new Map([
    ...npcDocument.scripts,
    ...outroDocument.scripts,
  ].map((script) => [script.id, script]));
  const clearScriptIds = {
    "ai-ball-classification": "ai-ball-classification-clear",
    "data-number-baseball": "data-number-baseball-clear",
    "computer-code-heart": "computer-code-heart-clear",
    "cyber-click-to-purify": "cyber-click-to-purify-clear",
    "ai-data-egg-sort": "ai-data-egg-sort-clear",
  };

  for (const npc of mapDocument.maps[0].npcs) {
    const first = scripts.get(npc.firstScript);
    const clear = scripts.get(clearScriptIds[npc.miniGameId]);
    assert.equal(first?.lines.length, 3, `${npc.id} pre-game story`);
    assert.deepEqual(first?.nextAction, { type: "openMiniGame", target: npc.miniGameId });
    assert.equal(clear?.lines.length, 4, `${npc.id} clear story plus guardian egg`);
    assert.ok(clear.lines.slice(0, 3).every((line) => line.speaker !== "수호알"));
    assert.equal(clear.lines[3].speaker, "수호알");
    assert.match(clear.lines[3].text, /수호알 획득/u);
    assert.deepEqual(clear.nextAction, { type: "returnToMap" });
  }

  assert.match(miniGameScene, /scriptId:\s*outroScriptId/u);
  assert.match(miniGameScene, /mapActionLabel:\s*hasClearStory\s*\?\s*"이야기 보고 맵으로"/u);
  assert.ok(
    miniGameScene.indexOf("save?.applyResult") < miniGameScene.indexOf("overlay = createResultOverlay"),
    "CLEAR progress must be saved before the clear-story result route is shown",
  );
});

test("the finale manuscript is structured without pretending its staged runtime is already complete", async () => {
  const [story, mapSource] = await Promise.all([
    readJson("../../data/scripts/main-story.json"),
    source("../../js/scenes/map-scene.js"),
  ]);
  const scripts = new Map(story.scripts.map((script) => [script.id, script]));
  const subtitles = scripts.get("iai-battle-subtitles");
  const outro = scripts.get("main-story-outro");

  assert.equal(scripts.get("iai-battle-intro")?.implementationStatus, "NARRATIVE_READY");
  assert.equal(subtitles?.lines.length, 10);
  assert.deepEqual(subtitles?.playback, {
    intervalMinMs: 8000,
    intervalMaxMs: 12000,
    displayDurationMs: 5000,
    uniquePerBattle: true,
    stopOnBattleEnd: true,
  });
  assert.equal(outro?.lines.at(-1)?.text, "우리의 꿈은, 여기서 다시 시작된다.");
  assert.equal(outro?.wishPrompt?.submitLabel, "엠브리오에게 소원 전하기");
  assert.match(mapSource, /이아이 최종 이야기는 준비 중입니다/u);
  assert.match(mapSource, /사후게임 목록 보기/u);
  assert.doesNotMatch(mapSource, /createButton\("이아이를 찾으러 가기"/u);
});

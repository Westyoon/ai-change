import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEPARTMENT_DISPLAY_NAMES,
  SCAFFOLD_MINI_GAME_DEPARTMENTS,
  validateMiniGameCandidate,
  validateScaffoldContent
} from "../../js/core/config-validator.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

test("runtime config validator accepts the checked-in runtime data graph", async () => {
  const [appConfig, departments, minigames, battles, manifest, mapData, ...scripts] = await Promise.all([
    readJson("../../data/app-config.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/battles.json"),
    readJson("../../data/asset-manifest.json"),
    readJson("../../data/map-data.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json")
  ]);

  const result = validateScaffoldContent({
    appConfig,
    departments,
    minigames,
    battles,
    manifest,
    mapData,
    scripts,
    htmlContentVersion: 1
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 5);

  const wordBreaker = battles.find((battle) => battle.id === "word-breaker");
  assert.ok(wordBreaker);
  assert.equal(wordBreaker.status, "published");
  assert.equal(wordBreaker.usesAccountStats, false);
  assert.equal(wordBreaker.configAssetId, "word-breaker-config");
  assert.equal(wordBreaker.assetGroup, "word-breaker");
  assert.deepEqual(wordBreaker.unlockCondition.miniGameIds, [
    "data-number-baseball",
    "cyber-click-to-purify",
    "computer-code-heart",
    "ai-ball-classification",
    "ai-data-egg-sort",
  ]);
  assert.deepEqual(
    manifest.assets.find((asset) => asset.id === "word-breaker-config"),
    {
      id: "word-breaker-config",
      group: "word-breaker",
      type: "json",
      src: "./data/battle/word-breaker.json",
      required: true,
      alt: null,
      sourceRef: "CONTENT-BATTLE-005",
    },
  );

  const wordBreakerConfig = await readJson("../../data/battle/word-breaker.json");
  const roundPhrases = wordBreakerConfig.rounds.flatMap((round) => round.phrases);
  assert.equal(wordBreakerConfig.implementationStatus, "MVP");
  assert.equal(wordBreakerConfig.finalPhrase.maxHp, 5);
  assert.equal(wordBreakerConfig.collapseImpactMs, 520);
  assert.equal(wordBreakerConfig.controls.pc.length, 4);
  assert.equal(wordBreakerConfig.controls.mobile.length, 2);
  assert.equal(wordBreakerConfig.resultPresentation.clear.title, "마음의 말 정화 완료");
  assert.equal(roundPhrases.length >= 25, true);
  assert.deepEqual(
    wordBreakerConfig.rounds.map(({ guardian }) => [guardian.code, guardian.color]),
    [
      ["DS", "#d82f76"],
      ["CS", "#363367"],
      ["CSE", "#e333bb"],
      ["AI", "#2ab5e4"],
      ["AIDS", "#fac804"],
    ],
  );
  for (const phrase of [...roundPhrases, wordBreakerConfig.finalPhrase]) {
    assert.equal(phrase.negative.split(phrase.target).length - 1, 1, phrase.id);
  }
});

test("runtime config validator rejects an unregistered or invalidly unlocked published Battle", async () => {
  const [appConfig, departments, minigames, battles, manifest, mapData, ...scripts] = await Promise.all([
    readJson("../../data/app-config.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/battles.json"),
    readJson("../../data/asset-manifest.json"),
    readJson("../../data/map-data.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json")
  ]);
  // Isolate one invalid published entry so no other valid Battle keeps the
  // feature runnable and masks the feature-presence assertion under test.
  battles.splice(1);
  battles[0].module = "unregistered-battle";
  battles[0].unlockCondition.miniGameIds.push("missing-game", "missing-game");

  const result = validateScaffoldContent({
    appConfig,
    departments,
    minigames,
    battles,
    manifest,
    mapData,
    scripts,
  });

  assert.ok(result.errors.some((error) => error.includes("module is not registered")));
  assert.ok(result.errors.some((error) => error.includes("duplicate miniGameIds")));
  assert.ok(result.errors.some((error) => error.includes("all five mini-games")));
  assert.ok(result.errors.some((error) => error.includes("missing mini-game")));
  assert.ok(result.errors.some((error) => error.includes("runnable published Battle")));
});

test("runtime department constants preserve all user-approved abbreviations", () => {
  assert.deepEqual(DEPARTMENT_DISPLAY_NAMES, {
    AI: "인공지능학부",
    DS: "데이터사이언스전공",
    CSE: "컴퓨터공학과",
    CS: "사이버보안학과",
    AIDS: "인공지능데이터사이언스학부"
  });
  assert.deepEqual(SCAFFOLD_MINI_GAME_DEPARTMENTS, {
    "data-number-baseball": "DS",
    "cyber-click-to-purify": "CS",
    "computer-code-heart": "CSE",
    "ai-ball-classification": "AI",
    "ai-data-egg-sort": "AIDS"
  });
});

test("runtime candidate validation rejects host-owned fields and invalid ERROR metrics", () => {
  const candidate = {
    status: "ERROR",
    score: null,
    failureReason: "RUNTIME_ERROR",
    metrics: { shouldBeEmpty: true },
    reward: null,
    sessionId: "host-owned"
  };
  const result = validateMiniGameCandidate(candidate);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("host-owned")));
  assert.ok(result.errors.some((error) => error.includes("metrics must be empty")));
});

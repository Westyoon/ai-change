import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEPARTMENT_DISPLAY_NAMES,
  SCAFFOLD_MINI_GAME_DEPARTMENTS,
  validateMiniGameCandidate,
  validateScaffoldContent
} from "../../js/core/config-validator.js";
import { normalizeWordBreakerConfig } from "../../js/battle/postgame/bosses/word-breaker/config.js";

const WORD_BREAKER_GIMMICK_TYPES = [
  "lane-rain",
  "firewall-gates",
  "recursive-fork",
  "prediction-lock",
  "convergence-ring",
];

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
  const normalizedWordBreaker = normalizeWordBreakerConfig(wordBreakerConfig);
  const normalizedRoundPhrases = normalizedWordBreaker.rounds.flatMap((round) => round.phrases);
  assert.equal(wordBreakerConfig.implementationStatus, "MVP");
  assert.equal(wordBreakerConfig.phrase.maxHp, 100);
  assert.equal(wordBreakerConfig.finalPhrase.maxHp, 5);
  assert.equal(normalizedWordBreaker.finalPhrase.maxHp, 5);
  assert.equal(wordBreakerConfig.roundDurationMs, 13500);
  assert.equal(wordBreakerConfig.omenDurationMs, 2400);
  assert.equal(wordBreakerConfig.overloadGraceMs, 4200);
  assert.equal(wordBreakerConfig.overloadAttackLeadMs, 600);
  assert.equal(wordBreakerConfig.collapseImpactMs, 1800);
  assert.equal(wordBreakerConfig.guardianRevealMs, 3000);
  assert.equal(wordBreakerConfig.magnetDelayMs, 1100);
  assert.equal(wordBreakerConfig.recoveryFailsafeMs, 6500);
  assert.equal(wordBreakerConfig.recoveryHoldMs, 1500);
  assert.equal(wordBreakerConfig.finaleDurationMs, 3200);
  assert.equal(wordBreakerConfig.guardian.speed, 300);
  assert.equal(wordBreakerConfig.controls.pc.length, 4);
  assert.equal(wordBreakerConfig.controls.mobile.length, 2);
  assert.equal(wordBreakerConfig.resultPresentation.clear.title, "마음의 말 정화 완료");
  assert.deepEqual(wordBreakerConfig.rounds.map(({ phrases }) => phrases.length), [11, 11, 11, 11, 11]);
  assert.equal(roundPhrases.length, 55);
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
  assert.deepEqual(
    wordBreakerConfig.rounds.map(({ gimmick }) => gimmick.type),
    WORD_BREAKER_GIMMICK_TYPES,
  );
  assert.deepEqual(
    wordBreakerConfig.rounds.map(({ gimmick }) => gimmick.name),
    [
      "결측치·이상치 폭주",
      "악성 패킷·포트 스캔",
      "무한 재귀·스택 오버플로",
      "오분류·신뢰도 락온",
      "데이터↔AI 피드백 폭주",
    ],
  );
  assert.equal(new Set(wordBreakerConfig.rounds.map(({ gimmick }) => gimmick.type)).size, 5);
  for (const { gimmick } of wordBreakerConfig.rounds) {
    assert.ok(typeof gimmick.name === "string" && gimmick.name.length > 0);
    assert.ok(typeof gimmick.cue === "string" && gimmick.cue.length > 0);
    assert.ok(Number.isFinite(gimmick.telegraphMs) && gimmick.telegraphMs >= 0);
    assert.ok(Number.isFinite(gimmick.forceAtMs) && gimmick.forceAtMs > gimmick.telegraphMs);
    assert.ok(Number.isFinite(gimmick.spawnIntervalMs) && gimmick.spawnIntervalMs > 0);
    assert.ok(Number.isFinite(gimmick.glyphSpeed) && gimmick.glyphSpeed > 0);
    assert.ok(Number.isInteger(gimmick.maxGlyphs) && gimmick.maxGlyphs >= 1 && gimmick.maxGlyphs <= 64);
    assert.ok(Number.isInteger(gimmick.contactThreshold) && gimmick.contactThreshold >= 1 && gimmick.contactThreshold <= 8);
    assert.ok(Number.isInteger(gimmick.laneCount) && gimmick.laneCount >= 3 && gimmick.laneCount <= 16);
    assert.ok(
      gimmick.forceAtMs
        > wordBreakerConfig.overloadGraceMs + wordBreakerConfig.overloadAttackLeadMs,
    );
  }
  assert.equal(wordBreakerConfig.rounds.every((round) => (
    typeof round.omenMessage === "string"
    && round.omenMessage.length > 0
    && typeof round.guardianMessage === "string"
    && round.guardianMessage.length > 0
  )), true);
  assert.equal(normalizedRoundPhrases.length, roundPhrases.length);
  const normalizedPhraseById = new Map(normalizedRoundPhrases.map((phrase) => [phrase.id, phrase]));
  for (const phrase of normalizedRoundPhrases) {
    assert.ok(phrase.targetHits >= 5 && phrase.targetHits <= 6, `${phrase.id}: ${phrase.targetHits} hits`);
    assert.equal(phrase.maxHp, phrase.targetHits * normalizedWordBreaker.shot.damage, phrase.id);
  }
  for (const phrase of roundPhrases) {
    assert.equal(phrase.maxHp, normalizedPhraseById.get(phrase.id)?.maxHp, `${phrase.id}: raw/effective maxHp`);
  }
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

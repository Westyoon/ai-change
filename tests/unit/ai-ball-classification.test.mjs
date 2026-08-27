import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  advanceBall,
  classifyBallResolution,
  createBallQueue,
  getBallMotionProfile,
} from "../../js/minigames/AI/queue.js";

test("AI ball queue contains the prototype's five targets and twenty-five distractors using the same sample", () => {
  const sampleImage = { src: "sample.png" };
  const queue = createBallQueue({
    targetCount: 5,
    nonTargetCount: 25,
    targetImage: sampleImage,
    nonTargetImage: sampleImage,
    random: () => 0.25,
  });

  assert.equal(queue.length, 30);
  assert.equal(queue.filter((ball) => ball.isTarget).length, 5);
  assert.equal(queue.filter((ball) => !ball.isTarget).length, 25);
  assert.equal(new Set(queue.map((ball) => ball.id)).size, 30);
  assert.ok(queue.every((ball) => ball.image === sampleImage));
});

test("AI ball motion matches the prototype's 480 by 460 canvas timing", () => {
  const motion = getBallMotionProfile(480, 460);

  assert.deepEqual(motion, {
    horizontalSpeed: 384,
    fallSpeed: 920,
    travelTime: 1.25,
    spawnInterval: 0.625,
  });
  assert.ok(Object.isFrozen(motion));
});

test("AI ball resolution maps capture and pass decisions to stable outcomes", () => {
  assert.equal(
    classifyBallResolution({ isTarget: true, captured: true }),
    "TARGET_COLLECTED",
  );
  assert.equal(
    classifyBallResolution({ isTarget: false, captured: true }),
    "WRONG_BALL",
  );
  assert.equal(
    classifyBallResolution({ isTarget: true, captured: false }),
    "MISSED_TARGET",
  );
  assert.equal(
    classifyBallResolution({ isTarget: false, captured: false }),
    "NON_TARGET_PASSED",
  );
});

test("AI balls advance horizontally before capture and vertically after capture", () => {
  const horizontal = { x: 10, y: 20, falling: false };
  advanceBall(horizontal, 0.5, { horizontalSpeed: 80, fallSpeed: 120 });
  assert.deepEqual(horizontal, { x: 50, y: 20, falling: false });

  const falling = { x: 10, y: 20, falling: true };
  advanceBall(falling, 0.5, { horizontalSpeed: 80, fallSpeed: 120 });
  assert.deepEqual(falling, { x: 10, y: 80, falling: true });
});

test("AI queue validates counts and random source", () => {
  assert.throws(
    () => createBallQueue({ targetCount: -1, nonTargetCount: 25 }),
    /targetCount/u,
  );
  assert.throws(
    () => createBallQueue({ targetCount: 5, nonTargetCount: 25, random: null }),
    /random/u,
  );
  assert.throws(
    () => createBallQueue({ targetCount: 1, nonTargetCount: 1, random: () => Number.NaN }),
    /finite number/u,
  );
  assert.throws(
    () => createBallQueue({ targetCount: 1, nonTargetCount: 1, random: () => 1 }),
    /exclusive/u,
  );
});

test("AI runtime config preserves the prototype counts, timing, asset, and UI copy", async () => {
  const configUrl = new URL("../../data/minigames/ai-ball-classification.json", import.meta.url);
  const config = JSON.parse(await readFile(configUrl, "utf8"));

  assert.equal(config.targetCount, 5);
  assert.equal(config.nonTargetCount, 25);
  assert.equal(config.countdownSeconds, 3);
  assert.equal(config.ballSpeed, 0.8);
  assert.equal(config.spawnIntervalSeconds, 0.625);
  assert.equal(config.initialLidState, "CLOSED");
  assert.equal(config.targetAssetId, "ai-ball-classification-sample");
  assert.equal(config.nonTargetAssetId, config.targetAssetId);
  assert.equal(
    config.uiText.ruleExplanation,
    "굴러오는 공 중 상단 목표와 같은 [DATA 공]만 뚜껑을 열어 통에 담으세요!",
  );
  assert.equal(config.uiText.startButton, "게임 시작");
  assert.equal(config.uiText.lidOpen, "OPEN (뚜껑 열림)");
  assert.equal(config.uiText.lidClose, "CLOSE (뚜껑 닫힘)");
  assert.equal(config.uiText.clearTitle, "SUCCESS!");
  assert.equal(config.uiText.clearButton, "수호알 획득하기");
  assert.equal(config.uiText.failTitle, "GAME OVER");
  assert.equal(config.uiText.failButton, "처음부터 다시하기");
});

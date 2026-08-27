import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceBall,
  classifyBallResolution,
  createBallQueue,
} from "../../js/minigames/AI/queue.js";

test("AI ball queue contains exactly five targets and twenty-five distinct distractors", () => {
  const targetImage = { src: "target.png" };
  const queue = createBallQueue({
    targetCount: 5,
    nonTargetCount: 25,
    targetImage,
    random: () => 0.25,
  });

  assert.equal(queue.length, 30);
  assert.equal(queue.filter((ball) => ball.isTarget).length, 5);
  assert.equal(queue.filter((ball) => !ball.isTarget).length, 25);
  assert.equal(new Set(queue.map((ball) => ball.id)).size, 30);
  assert.ok(queue.filter((ball) => ball.isTarget).every((ball) => ball.image === targetImage));
  assert.ok(queue.filter((ball) => !ball.isTarget).every((ball) => ball.image === null));
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

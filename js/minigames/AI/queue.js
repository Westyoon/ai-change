const DEFAULT_RANDOM = Math.random;

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function createBallQueue({
  targetCount,
  nonTargetCount,
  targetImage = null,
  nonTargetImage = null,
  random = DEFAULT_RANDOM,
} = {}) {
  positiveInteger(targetCount, "targetCount");
  positiveInteger(nonTargetCount, "nonTargetCount");
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }

  const queue = [
    ...Array.from({ length: targetCount }, (_, index) => ({
      id: `target-${index}`,
      isTarget: true,
      image: targetImage,
      variant: index,
    })),
    ...Array.from({ length: nonTargetCount }, (_, index) => ({
      id: `non-target-${index}`,
      isTarget: false,
      image: nonTargetImage,
      variant: index,
    })),
  ];

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
      throw new TypeError("random must return a finite number from 0 (inclusive) to 1 (exclusive).");
    }
    const target = Math.floor(roll * (index + 1));
    [queue[index], queue[target]] = [queue[target], queue[index]];
  }
  return queue;
}

export function getBallMotionProfile(width, height) {
  if (!Number.isFinite(width) || width <= 0) {
    throw new TypeError("width must be a positive finite number.");
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new TypeError("height must be a positive finite number.");
  }

  // Keep the prototype branch's movement exactly: one screen in 1.25 seconds,
  // with a new ball introduced halfway through that travel time.
  const horizontalSpeed = width * 0.8;
  const fallSpeed = height * 2;
  const travelTime = width / horizontalSpeed;
  return Object.freeze({
    horizontalSpeed,
    fallSpeed,
    travelTime,
    spawnInterval: travelTime / 2,
  });
}

export function advanceBall(ball, deltaSeconds, { horizontalSpeed, fallSpeed } = {}) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new TypeError("deltaSeconds must be a non-negative finite number.");
  }
  if (ball.falling) {
    ball.y += Number(fallSpeed) * deltaSeconds;
  } else {
    ball.x += Number(horizontalSpeed) * deltaSeconds;
  }
  return ball;
}

export function classifyBallResolution({ isTarget, captured } = {}) {
  if (captured) return isTarget ? "TARGET_COLLECTED" : "WRONG_BALL";
  return isTarget ? "MISSED_TARGET" : "NON_TARGET_PASSED";
}

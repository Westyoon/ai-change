import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePurification,
  judgeTiming,
  pickTarget,
  resolveTerminalState,
} from "../../js/minigames/CS/judge.js";
import { createThreat } from "../../js/minigames/CS/malware.js";
import { spawnIntervalFor, stepFrame } from "../../js/minigames/AIDS/game-loop.js";
import { stepFalling } from "../../js/minigames/AIDS/physics.js";

test("CS prototype timing and purification preserve the integrated branch boundaries", () => {
  const config = { perfectWindowMs: 200, goodWindowMs: 500 };

  assert.equal(judgeTiming(1_200, 1_000, config), "PERFECT");
  assert.equal(judgeTiming(1_500, 1_000, config), "GOOD");
  assert.equal(judgeTiming(1_501, 1_000, config), "MISS");
  assert.equal(judgeTiming(1_200, 1_000, { perfectwindowMs: 200, goodWindowMs: 500 }), "PERFECT");
  assert.equal(calculatePurification(2, 2, 4), 75);
  assert.equal(calculatePurification(2, 2, 0), 0);
});

test("CS target selection handles empty and disguised candidates and keeps miss priority", () => {
  const config = { approachDurationMs: 1_000, missLimit: 3 };
  const hiddenTrojan = createThreat("TROJAN", 0, config);
  const worm = createThreat("WORM", 200, config);
  const spyware = createThreat("SPYWARE", 500, config);

  assert.equal(pickTarget([], 1_000), null);
  assert.equal(pickTarget([hiddenTrojan], 1_000), null);
  assert.equal(pickTarget([hiddenTrojan, worm, spyware], 1_400), spyware);
  assert.deepEqual(
    resolveTerminalState({
      missCount: 3,
      allWavesSpawned: true,
      activeThreats: [],
      purification: 75,
      config,
    }),
    { status: "FAIL", failureReason: "MISS_LIMIT", purification: 75 },
  );
});

test("AIDS latest balance switches spawn cadence at 10 and 25 seconds", () => {
  const config = {
    spawnIntervals: [
      { maxElapsedSec: 10, intervalMs: 4_500 },
      { maxElapsedSec: 25, intervalMs: 3_500 },
      { maxElapsedSec: null, intervalMs: 2_500 },
    ],
  };

  assert.equal(spawnIntervalFor(config, 0), 4_500);
  assert.equal(spawnIntervalFor(config, 9.999), 4_500);
  assert.equal(spawnIntervalFor(config, 10), 3_500);
  assert.equal(spawnIntervalFor(config, 25), 2_500);
});

test("AIDS time-to-go guidance accelerates toward a platform without exceeding its clamp", () => {
  const config = {
    boxes: { leftPct: 22, rightPct: 78 },
    physics: {
      gravity: 500,
      surfaceOffset: 9,
      fallSteerAccel: 600,
      maxFallSteerSpeed: 320,
    },
  };
  const egg = {
    x: 20,
    y: 0,
    vx: 0,
    vy: 0,
    target: "platform",
    targetPlatform: { x: 100, y: 120 },
  };

  stepFalling(egg, 0.016, config, 400, 300);

  assert.ok(egg.x > 20);
  assert.ok(egg.y > 0);
  assert.ok(egg.vx > 0);
  assert.ok(egg.vx <= config.physics.fallSteerAccel * 0.016);
  assert.ok(egg.vx <= config.physics.maxFallSteerSpeed);
});

test("AIDS life depletion wins when life and timer expire on the same frame", () => {
  const state = {
    life: 0,
    eggs: [],
    nextSpawnAtSec: Number.POSITIVE_INFINITY,
    lastElapsedMs: 0,
  };
  const refs = {
    field: { clientWidth: 400, clientHeight: 300 },
    timerEl: {
      textContent: "",
      classList: { toggle() {} },
    },
  };
  const config = {
    totalTimeSec: 0,
    warningThresholdSec: 10,
    spawnIntervals: [{ maxElapsedSec: null, intervalMs: 1_000 }],
    physics: { eggRadius: 20 },
  };

  assert.deepEqual(stepFrame({ state, config, refs, elapsedMs: 0 }), { terminal: "FAIL" });
});

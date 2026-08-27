import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePurification,
  judgeTiming,
  pickTarget,
  resolveTerminalState,
} from "../../js/minigames/CS/judge.js";
import {
  createThreat,
  createWormChildren,
  updateThreatPresentation,
} from "../../js/minigames/CS/malware.js";
import {
  buildWavePlan,
  estimateWavePlanEndMs,
} from "../../js/minigames/CS/wave.js";
import { spawnIntervalFor, stepFrame } from "../../js/minigames/AIDS/game-loop.js";
import { stepFalling } from "../../js/minigames/AIDS/physics.js";

test("CS MVP timing and purification preserve the approved integrated boundaries", () => {
  const config = { perfectWindowMs: 200, goodWindowMs: 500 };

  assert.equal(judgeTiming(1_200, 1_000, config), "PERFECT");
  assert.equal(judgeTiming(1_500, 1_000, config), "GOOD");
  assert.equal(judgeTiming(1_501, 1_000, config), "MISS");
  assert.equal(judgeTiming(1_200, 1_000, { perfectwindowMs: 200, goodWindowMs: 500 }), "PERFECT");
  assert.equal(calculatePurification(2, 2, 4), 85);
  assert.equal(calculatePurification(2, 2, 4, 0.5), 75);
  assert.equal(calculatePurification(2, 2, 0), 0);
});

test("CS MVP builds all 22 waves with the learning order and late ransomware slots", () => {
  const config = {
    totalWaves: 22,
    learningWaveCount: 4,
    learningOrder: ["TROJAN", "WORM", "RANSOM", "SPYWARE"],
    learningIntervalMs: 2_600,
    learningApproachDurationMs: 1_800,
    mixedIntervalStartMs: 1_300,
    mixedIntervalEndMs: 750,
    approachDurationMs: 1_400,
    goodWindowMs: 500,
    ransomMinCount: 2,
    ransomMaxCount: 3,
  };
  const plan = buildWavePlan(config, { random: () => 0 });

  assert.equal(plan.length, 22);
  assert.deepEqual(plan.slice(0, 4).map((wave) => wave.type), config.learningOrder);
  assert.ok(plan.slice(4).every((wave, index, mixed) =>
    index === 0 || wave.spawnAtMs > mixed[index - 1].spawnAtMs));
  const mixedRansomIndexes = plan
    .map((wave, index) => ({ wave, index }))
    .filter(({ wave, index }) => index >= 4 && wave.type === "RANSOM")
    .map(({ index }) => index);
  assert.equal(mixedRansomIndexes.length, 2);
  assert.ok(mixedRansomIndexes.every((index) => index >= 13));
  assert.ok(estimateWavePlanEndMs(plan, config.goodWindowMs) > 18_000);
});

test("CS malware effects reveal trojans, fade in spyware, and split worms once", () => {
  const config = { approachDurationMs: 1_000, trojanRevealLeadMs: 400 };
  const trojan = createThreat("TROJAN", 0, config);
  const spyware = createThreat("SPYWARE", 0, config);
  const worm = createThreat("WORM", 0, config, { angle: 1 });

  updateThreatPresentation(trojan, 599, config);
  assert.equal(trojan.revealed, false);
  updateThreatPresentation(trojan, 600, config);
  assert.equal(trojan.revealed, true);
  updateThreatPresentation(spyware, 500, config);
  assert.equal(spyware.opacity, 0.35);

  const children = createWormChildren(worm, 1_000, config);
  assert.equal(children.length, 2);
  assert.ok(children.every((child) => child.isSplitChild && child.splitDepth === 1));
  assert.deepEqual(createWormChildren(children[0], 2_000, config), []);
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

test("AIDS latest balance keeps timer clear priority when life and timer expire together", () => {
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

  assert.deepEqual(stepFrame({ state, config, refs, elapsedMs: 0 }), { terminal: "CLEAR" });
});

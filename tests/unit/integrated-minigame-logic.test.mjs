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
  avoidRansomArrivalCollisions,
  buildRansomAmbushSchedule,
  buildWavePlan,
  estimateWavePlanEndMs,
} from "../../js/minigames/CS/wave.js";
import { spawnIntervalFor, stepFrame } from "../../js/minigames/AIDS/game-loop.js";
import { stepFalling, stepRolling } from "../../js/minigames/AIDS/physics.js";

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

test("CS builds 22 mixed waves with no learning phase, and schedules ransom ambushes separately", () => {
  const config = {
    totalWaves: 22,
    mixedIntervalStartMs: 1_100,
    mixedIntervalEndMs: 650,
    approachDurationMs: 1_400,
    goodWindowMs: 500,
    ransomAmbushCount: 3,
  };
  const plan = buildWavePlan(config, { random: () => 0 });

  assert.equal(plan.length, 22);
  // 더 이상 학습구간이 없으니 처음부터 TROJAN/WORM/SPYWARE만 섞여 나오고, RANSOM은 아예 없음
  assert.ok(plan.every((wave) => ["TROJAN", "WORM", "SPYWARE"].includes(wave.type)));
  assert.equal(plan[0].spawnAtMs, 0);
  assert.ok(plan.every((wave, index, all) =>
    index === 0 || wave.spawnAtMs > all[index - 1].spawnAtMs));

  const totalDurationMs = estimateWavePlanEndMs(plan, config.goodWindowMs);
  assert.ok(totalDurationMs > 0);

  const ransomSchedule = buildRansomAmbushSchedule(config, totalDurationMs, { random: () => 0 });
  assert.equal(ransomSchedule.length, 3);
  assert.ok(ransomSchedule.every((ms) => ms > 0 && ms < totalDurationMs));
  assert.ok(ransomSchedule.every((ms, index, all) => index === 0 || ms >= all[index - 1]));
});

test("CS ransom ambush schedule enforces a minimum gap so ambushes can't land back-to-back", () => {
  // 랜덤 슬롯 폭(250ms)이 최소 간격(400ms)보다 좁게 만들어서, 간격 보정이 실제로 개입하는지 확인해요.
  const config = { ransomAmbushCount: 3, ransomMinGapMs: 400 };
  const schedule = buildRansomAmbushSchedule(config, 1_000, { random: () => 0 });

  assert.deepEqual(schedule, [150, 550, 950]);
  for (let index = 1; index < schedule.length; index += 1) {
    assert.ok(schedule[index] - schedule[index - 1] >= 400);
  }
});

test("CS avoidRansomArrivalCollisions pushes colliding waves past the ransom's arrival and staggers them from each other instead of stacking them on the same spot", () => {
  const config = { ransomApproachDurationMs: 900, ransomArrivalGapMs: 600 };
  const ransomSchedule = [1_000]; // 랜섬 도착 시점 = 1000 + 900 = 1900
  const wavePlan = [
    // 원래 도착 시점 1900 — 랜섬과 정확히 겹침
    { type: "TROJAN", spawnAtMs: 500, approachDurationMs: 1_400, section: "MIXED" },
    // 원래 도착 시점 1920 — 랜섬과도 겹치고, 밀리기 전엔 위 웨이브와도 거의 같은 자리
    { type: "WORM", spawnAtMs: 520, approachDurationMs: 1_400, section: "MIXED" },
    // 원래 도착 시점 6400 — 랜섬과 한참 떨어져 있어 손대지 않아야 함
    { type: "SPYWARE", spawnAtMs: 5_000, approachDurationMs: 1_400, section: "MIXED" },
  ];

  const adjusted = avoidRansomArrivalCollisions(wavePlan, ransomSchedule, config);
  const targetAtOf = (wave) => wave.spawnAtMs + wave.approachDurationMs;

  // 랜섬 도착(1900) 이후로 최소 600ms는 떨어지도록 밀림
  assert.equal(targetAtOf(adjusted[0]), 2_500);
  // 버그였던 부분: 두 번째 웨이브도 그냥 같은 지점(2500)으로 밀리면 서로 다시 겹쳐버려요 —
  // 이번엔 직전에 밀린 웨이브(2500)와도 최소 600ms 떨어진 3100으로 한 번 더 밀려야 해요.
  assert.equal(targetAtOf(adjusted[1]), 3_100);
  // 랜섬과 멀리 떨어진 웨이브는 그대로 유지
  assert.equal(adjusted[2].spawnAtMs, 5_000);
});

test("CS malware effects reveal trojans on a lead timer and flicker spyware in scheduled windows", () => {
  const config = { approachDurationMs: 1_000, trojanRevealLeadMs: 400 };
  const trojan = createThreat("TROJAN", 0, config);

  updateThreatPresentation(trojan, 599, config);
  assert.equal(trojan.revealed, false);
  updateThreatPresentation(trojan, 600, config);
  assert.equal(trojan.revealed, true);

  // 스파이웨어: 900ms 동안 접근, 3번 깜빡이고(spywareFlickerOnMs 100ms). 마지막 깜빡임은 targetAt(900)을
  // 중심으로 앞뒤에 걸쳐 있어요(800~1000) — 코어에 닿는 순간이나 닿은 직후에 눌러도 클릭이 먹게 하려고요.
  const spywareConfig = { approachDurationMs: 900, spywareFlickerCount: 3, spywareFlickerOnMs: 100 };
  const spyware = createThreat("SPYWARE", 0, spywareConfig);
  assert.deepEqual(spyware.flickerWindows, [
    { startMs: 200, endMs: 300 },
    { startMs: 500, endMs: 600 },
    { startMs: 800, endMs: 1000 },
  ]);

  // 깜빡임 구간 밖이면 항상 은신 상태(0.1)
  updateThreatPresentation(spyware, 150, spywareConfig);
  assert.equal(spyware.opacity, 0.1);

  // 첫 번째 깜빡임 구간 안이면 드러남(1)
  updateThreatPresentation(spyware, 250, spywareConfig);
  assert.equal(spyware.opacity, 1);

  // 깜빡임이 끝나면(구간 사이) 다시 은신 상태로 돌아감 — 더 이상 누적되어 유지되지 않음
  updateThreatPresentation(spyware, 400, spywareConfig);
  assert.equal(spyware.opacity, 0.1);

  updateThreatPresentation(spyware, 550, spywareConfig);
  assert.equal(spyware.opacity, 1);

  // targetAt(900)에 정확히 닿는 순간에도 드러나 있고, 닿은 직후(1000까지)에도 계속 드러나 있어요
  updateThreatPresentation(spyware, 900, spywareConfig);
  assert.equal(spyware.opacity, 1);
  updateThreatPresentation(spyware, 1000, spywareConfig);
  assert.equal(spyware.opacity, 1);

  updateThreatPresentation(spyware, 1050, spywareConfig);
  assert.equal(spyware.opacity, 0.1);
});

test("CS worm children are tagged as split children and never split again themselves", () => {
  const config = { approachDurationMs: 1_000 };
  const worm = createThreat("WORM", 0, config, { angle: 1 });

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

test("CS requires purification to clear a threshold before it counts as CLEAR, even with no misses", () => {
  const config = { missLimit: 3, clearPurificationThreshold: 60 };

  // 미스 제한엔 안 걸렸고 남은 위협도 없지만, 정화도가 기준치(60%) 미만이면 클리어가 아니라 실패
  assert.deepEqual(
    resolveTerminalState({
      missCount: 0,
      allWavesSpawned: true,
      activeThreats: [],
      purification: 49,
      config,
    }),
    { status: "FAIL", failureReason: "LOW_PURIFICATION", purification: 49 },
  );

  // 기준치 이상이면 정상적으로 클리어
  assert.deepEqual(
    resolveTerminalState({
      missCount: 0,
      allWavesSpawned: true,
      activeThreats: [],
      purification: 60,
      config,
    }),
    { status: "CLEAR", failureReason: null, purification: 60 },
  );

  // clearPurificationThreshold를 아예 설정 안 하면(레거시 config) 기존처럼 0% 기준(항상 통과)으로 동작
  assert.deepEqual(
    resolveTerminalState({
      missCount: 0,
      allWavesSpawned: true,
      activeThreats: [],
      purification: 10,
      config: { missLimit: 3 },
    }),
    { status: "CLEAR", failureReason: null, purification: 10 },
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

test("AIDS rolling exits at the same 40px half length used by the visible platform surface", () => {
  const config = {
    physics: {
      rollAccel: 70,
      maxRollSpeed: 150,
      tiltAngleDeg: 16,
      surfaceOffset: 9,
      platformHalfLen: 40,
      maxRollTimeSec: 2.5,
    },
  };
  const makeEgg = (x) => ({
    x,
    y: 0,
    vx: 0,
    rollTime: 0,
    platform: { x: 0, y: 100 },
  });

  assert.equal(stepRolling(makeEgg(39.99), 0, config, "right"), null);
  assert.equal(stepRolling(makeEgg(40), 0, config, "right"), "right");
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

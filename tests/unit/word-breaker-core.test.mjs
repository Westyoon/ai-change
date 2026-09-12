import assert from "node:assert/strict";
import test from "node:test";
import {
  aabbIntersects,
  moveAabbToward,
  pointInAabb,
  sweptAabbIntersects,
} from "../../js/battle/postgame/bosses/word-breaker/collision.js";
import {
  DEFAULT_WORD_BREAKER_CONFIG,
  normalizeWordBreakerConfig,
} from "../../js/battle/postgame/bosses/word-breaker/config.js";
import {
  WORD_BREAKER_PHASES,
  WORD_BREAKER_STATES,
  WordBreakerEncounter,
} from "../../js/battle/postgame/bosses/word-breaker/encounter.js";
import {
  assertCandidateFieldAllowlist,
} from "../../js/minigames/shared/result-builder.js";
import { validateMiniGameCandidate } from "../../js/core/config-validator.js";

function rounds({ maxHp = 20 } = {}) {
  return ["DS", "CS", "CSE", "AI", "AIDS"].map((code, index) => ({
    id: `round-${index + 1}`,
    label: `Round ${index + 1}`,
    collapseMessage: `${code} collapse`,
    recoveryMessage: `${code} recovery`,
    guardian: {
      id: `guardian-${code.toLowerCase()}`,
      code,
      label: `${code} guardian`,
      color: `#${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}${index + 1}`,
    },
    phrases: [{
      id: `phrase-${index + 1}`,
      negative: `bad ${index + 1}`,
      target: "bad",
      reframe: `better ${index + 1}`,
      maxHp,
    }],
  }));
}

function compactConfig(overrides = {}) {
  return {
    arena: { width: 100, height: 120 },
    roundDurationMs: 20,
    collapseImpactMs: 5,
    magnetDelayMs: 10,
    finaleDurationMs: 25,
    simulationStepMs: 5,
    maxActivePhrases: 3,
    player: {
      width: 10,
      height: 10,
      speed: 100,
      invulnerableMs: 20,
      startPosition: { x: 45, y: 100 },
    },
    shot: { width: 2, height: 4, speed: 500, intervalMs: 10, damage: 20 },
    phrase: {
      width: 40,
      height: 10,
      targetHeight: 8,
      speed: 10,
      spawnIntervalMs: 10,
      maxHp: 20,
      reframeDurationMs: 5,
      horizontalPadding: 0,
    },
    guardian: { width: 10, height: 10, speed: 5_000, spawnY: 30 },
    scoring: { phraseBase: 100, comboStep: 10, guardianBonus: 25, finaleBonus: 50 },
    rounds: rounds(),
    finalPhrase: {
      id: "final-phrase",
      negative: "still bad",
      target: "bad",
      reframe: "getting better",
      maxHp: 5,
    },
    ...overrides,
  };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let sample = value;
    sample = Math.imul(sample ^ (sample >>> 15), sample | 1);
    sample ^= sample + Math.imul(sample ^ (sample >>> 7), sample | 61);
    return ((sample ^ (sample >>> 14)) >>> 0) / 0x100000000;
  };
}

test("config supplies a frozen 450x800 five-round game and validates phrase targets", () => {
  const config = normalizeWordBreakerConfig();
  assert.deepEqual(config.arena, { x: 0, y: 0, width: 450, height: 800 });
  assert.equal(config.rounds.length, 5);
  assert.deepEqual(config.rounds.map(({ guardian }) => guardian.code), ["DS", "CS", "CSE", "AI", "AIDS"]);
  assert.equal(config.player.speed, 220);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.rounds[0].phrases[0]), true);
  assert.equal(DEFAULT_WORD_BREAKER_CONFIG.arena.width, 450);

  assert.throws(
    () => normalizeWordBreakerConfig({ rounds: rounds().slice(0, 4) }),
    /exactly 5 rounds/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ finalPhrase: { maxHp: 4 } }),
    /guardian recovery steps/u,
  );
  const duplicateTargetRounds = rounds();
  duplicateTargetRounds[0].phrases[0] = {
    ...duplicateTargetRounds[0].phrases[0],
    negative: "bad and bad",
  };
  assert.throws(
    () => normalizeWordBreakerConfig({ rounds: duplicateTargetRounds }),
    /exactly once/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ roundDurationMs: Number.NaN }),
    /finite number/u,
  );
});

test("collision helpers include edge contact, point checks and swept fast shots", () => {
  const phrase = { x: 10, y: 10, width: 30, height: 10 };
  const target = { x: 28, y: 10, width: 12, height: 10 };
  const decorativeShot = { x: 12, y: 12, width: 2, height: 2 };
  assert.equal(aabbIntersects(decorativeShot, phrase), true);
  assert.equal(aabbIntersects(decorativeShot, target), false, "decorative text is not a target hit");
  assert.equal(aabbIntersects({ x: 40, y: 12, width: 2, height: 2 }, target), true, "touching edges count");
  assert.equal(pointInAabb({ x: 28, y: 15 }, target), true);
  assert.equal(pointInAabb({ x: 27.9, y: 15 }, target), false);
  assert.equal(sweptAabbIntersects(
    { x: 31, y: 30, width: 2, height: 2 },
    { x: 31, y: 0, width: 2, height: 2 },
    target,
  ), true, "a fast shot cannot tunnel through the target");
  assert.deepEqual(
    moveAabbToward({ x: 0, y: 0, width: 2, height: 2 }, { x: 9, y: 0, width: 2, height: 2 }, 50),
    { x: 9, y: 0, width: 2, height: 2 },
  );
});

test("injected random and the same tick stream produce identical encounters", () => {
  const first = new WordBreakerEncounter({ config: compactConfig(), random: mulberry32(42) });
  const second = new WordBreakerEncounter({ config: compactConfig(), random: mulberry32(42) });
  first.init();
  second.init();
  first.start({ attemptId: "word-breaker:deterministic" });
  second.start({ attemptId: "word-breaker:deterministic" });

  for (const delta of [1, 4, 5, 7]) {
    first.tick(delta);
    second.tick(delta);
  }
  assert.deepEqual(first.getSnapshot(), second.getSnapshot());

  assert.throws(
    () => {
      const invalid = new WordBreakerEncounter({ config: compactConfig(), random: () => 1 });
      invalid.init();
      invalid.start({ attemptId: "word-breaker:bad-random" });
    },
    /\[0, 1\)/u,
  );
});

test("pause freezes timers, objects and random consumption", () => {
  let samples = 0;
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ roundDurationMs: 100 }),
    random: () => {
      samples += 1;
      return 0.5;
    },
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:pause" });
  const beforePause = encounter.getSnapshot();
  const samplesBeforePause = samples;
  assert.equal(encounter.pause(), true);
  encounter.tick(10_000);
  const paused = encounter.getSnapshot();
  assert.equal(paused.state, WORD_BREAKER_STATES.PAUSED);
  assert.deepEqual(paused.phrases, beforePause.phrases);
  assert.deepEqual(paused.shots, beforePause.shots);
  assert.equal(paused.roundRemainingMs, beforePause.roundRemainingMs);
  assert.equal(paused.metrics.elapsedMs, beforePause.metrics.elapsedMs);
  assert.equal(samples, samplesBeforePause);
  assert.equal(encounter.resume(), true);
  encounter.tick(5);
  assert.equal(encounter.getSnapshot().roundRemainingMs, 95);
});

test("each collapse yields its colored guardian and the fifth collection runs one CLEAR finale", () => {
  const events = [];
  const completions = [];
  const encounter = new WordBreakerEncounter({
    config: compactConfig(),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:five-rounds" });

  for (let roundIndex = 0; roundIndex < 5; roundIndex += 1) {
    encounter.setPlayerBounds({ x: 45, y: 100, width: 10, height: 10 });
    encounter.tick(20);
    const recovering = encounter.getSnapshot();
    assert.equal(recovering.phase, WORD_BREAKER_PHASES.RECOVERING);
    assert.equal(recovering.roundIndex, roundIndex);
    assert.equal(recovering.phrases.length, 1);
    assert.equal(recovering.phrases[0].tone, "collapse");
    assert.equal(aabbIntersects(recovering.phrases[0], recovering.playerBounds), true);
    assert.equal(recovering.metrics.forcedHitCount, roundIndex + 1);
    assert.equal(recovering.shots.length, 0);
    assert.equal(recovering.guardian.code, ["DS", "CS", "CSE", "AI", "AIDS"][roundIndex]);

    encounter.setPlayerBounds(recovering.guardian);
    assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.RECOVERING);
    encounter.tick(5);
    const collected = encounter.getSnapshot();
    assert.equal(collected.collectedGuardians.length, roundIndex + 1);
    if (roundIndex < 4) assert.equal(collected.phase, WORD_BREAKER_PHASES.PLAY);
  }

  const finale = encounter.getSnapshot();
  assert.equal(finale.phase, WORD_BREAKER_PHASES.FINALE);
  assert.equal(finale.phrases.length, 1);
  assert.equal(finale.phrases[0].hp, 5);
  encounter.tick(10);
  assert.equal(encounter.getSnapshot().phrases[0].hp, 3);
  encounter.tick(15);
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.COMPLETED);
  encounter.tick(1_000);

  assert.equal(events.filter(({ type }) => type === "collapse").length, 5);
  assert.equal(events.filter(({ type }) => type === "guardian-collected").length, 5);
  assert.equal(events.filter(({ type }) => type === "finale").length, 1);
  assert.equal(events.filter(({ type }) => type === "complete").length, 1);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].attemptId, "word-breaker:five-rounds");
  assert.deepEqual(Object.keys(completions[0].candidate).sort(), [
    "failureReason",
    "metrics",
    "reward",
    "score",
    "status",
  ]);
  assert.equal(completions[0].candidate.status, "CLEAR");
  assert.equal(typeof completions[0].candidate.score, "number");
  assert.equal(completions[0].candidate.failureReason, null);
  assert.equal(completions[0].candidate.reward, null);
  assert.equal(completions[0].candidate.metrics.roundsCollapsed, 5);
  assert.equal(completions[0].candidate.metrics.forcedHitCount, 5);
  assert.equal(completions[0].candidate.metrics.guardiansCollected, 5);
  assert.equal(assertCandidateFieldAllowlist(completions[0].candidate), true);
  assert.equal(validateMiniGameCandidate(completions[0].candidate).valid, true);
  assert.throws(
    () => encounter.restart({ attemptId: "word-breaker:five-rounds" }),
    /already completed/u,
  );
});

test("one large tick carries leftover time through recovery and the finale", () => {
  const completions = [];
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ magnetDelayMs: 0 }),
    random: () => 0.5,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:large-tick" });
  encounter.tick(1_000);
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.COMPLETED);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
});

test("phrase contact never ends the game, resets combo and respects invulnerability", () => {
  const contactConfig = compactConfig({
    roundDurationMs: 500,
    player: {
      width: 10,
      height: 10,
      speed: 100,
      invulnerableMs: 40,
      startPosition: { x: 45, y: 90 },
    },
    shot: { width: 4, height: 8, speed: 2_000, intervalMs: 5, damage: 20 },
    phrase: {
      width: 100,
      height: 10,
      targetHeight: 10,
      speed: 1,
      spawnIntervalMs: 10,
      maxHp: 20,
      reframeDurationMs: 5,
      horizontalPadding: 0,
    },
    rounds: rounds({ maxHp: 20 }),
  });
  const encounter = new WordBreakerEncounter({ config: contactConfig, random: () => 0.5 });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:contact" });

  encounter.tick(60);
  assert.ok(encounter.getSnapshot().metrics.purifiedCount > 0);
  assert.ok(encounter.getSnapshot().metrics.combo > 0);

  encounter.setPlayerBounds({ x: 90, y: 0, width: 10, height: 10 });
  for (let step = 0; step < 20 && encounter.getSnapshot().metrics.hitCount === 0; step += 1) {
    encounter.tick(5);
  }
  const firstHit = encounter.getSnapshot();
  assert.equal(firstHit.state, WORD_BREAKER_STATES.RUNNING);
  assert.equal(firstHit.metrics.hitCount, 1);
  assert.equal(firstHit.metrics.combo, 0);
  assert.ok(firstHit.invulnerableRemainingMs > 0);

  encounter.tick(20);
  assert.equal(encounter.getSnapshot().metrics.hitCount, 1, "overlapping phrases cannot multi-hit during immunity");
  encounter.tick(30);
  assert.ok(encounter.getSnapshot().metrics.hitCount >= 2, "contact can count again after immunity expires");
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.RUNNING);
});

test("restart resets runtime with a new attempt and destroy is terminal and idempotent", () => {
  const encounter = new WordBreakerEncounter({ config: compactConfig(), random: () => 0.5 });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:first" });
  encounter.tick(5);
  assert.equal(encounter.restart({ attemptId: "word-breaker:second" }), true);
  const restarted = encounter.getSnapshot();
  assert.equal(restarted.attemptId, "word-breaker:second");
  assert.equal(restarted.state, WORD_BREAKER_STATES.RUNNING);
  assert.equal(restarted.roundIndex, 0);
  assert.equal(restarted.metrics.elapsedMs, 0);
  assert.equal(restarted.metrics.guardiansCollected, 0);
  assert.equal(encounter.destroy(), true);
  assert.equal(encounter.destroy(), false);
  assert.equal(encounter.setPlayerBounds({ x: 0, y: 0, width: 1, height: 1 }), false);
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.DESTROYED);
  assert.equal(encounter.getSnapshot().disposed, true);
});

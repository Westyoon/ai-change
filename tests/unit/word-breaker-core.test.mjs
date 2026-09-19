import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aabbCenter,
  aabbIntersects,
  clampAabbToArena,
  moveAabbToward,
  pointInAabb,
  sweptAabbIntersects,
} from "../../js/battle/postgame/bosses/word-breaker/collision.js";
import {
  DEFAULT_WORD_BREAKER_CONFIG,
  WORD_BREAKER_GIMMICK_TYPES,
  normalizeWordBreakerConfig,
} from "../../js/battle/postgame/bosses/word-breaker/config.js";
import {
  WORD_BREAKER_PHASES,
  WORD_BREAKER_STATES,
  WordBreakerEncounter,
} from "../../js/battle/postgame/bosses/word-breaker/encounter.js";
import {
  createWordBreakerOverloadWave,
  createWordBreakerOverloadSurge,
  createWordBreakerPhrase,
  movePhraseDown,
  moveWordBreakerOverloadGlyph,
} from "../../js/battle/postgame/bosses/word-breaker/patterns.js";
import { validateMiniGameCandidate } from "../../js/core/config-validator.js";
import { assertCandidateFieldAllowlist } from "../../js/minigames/shared/result-builder.js";

const GUARDIAN_CODES = Object.freeze(["DS", "CS", "CSE", "AI", "AIDS"]);
const GIMMICK_LANES = Object.freeze([5, 7, 8, 5, 12]);

function gimmick(index, overrides = {}) {
  return {
    type: WORD_BREAKER_GIMMICK_TYPES[index],
    telegraphMs: 5,
    forceAtMs: 30,
    spawnIntervalMs: 5,
    glyphSpeed: 10,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: GIMMICK_LANES[index],
    ...overrides,
  };
}

function rounds({
  negative = "가나다라마",
  target = "가나다라마",
  targetHits = 5,
} = {}) {
  return GUARDIAN_CODES.map((code, index) => ({
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
    gimmick: gimmick(index),
    phrases: [{
      id: `phrase-${index + 1}`,
      negative: `${negative} ${index + 1}`,
      target,
      reframe: `better ${index + 1}`,
      targetHits,
    }],
  }));
}

function compactConfig(overrides = {}) {
  return {
    arena: { width: 100, height: 120 },
    roundDurationMs: 20,
    omenDurationMs: 5,
    overloadGraceMs: 10,
    overloadAttackLeadMs: 2,
    collapseImpactMs: 5,
    guardianRevealMs: 7,
    magnetDelayMs: 10,
    recoveryFailsafeMs: 20,
    recoveryHoldMs: 5,
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
      width: 80,
      height: 10,
      targetHeight: 8,
      speed: 10,
      spawnIntervalMs: 10,
      maxHp: 100,
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

function advanceUntil(encounter, predicate, { stepMs = 1, maxTicks = 10_000 } = {}) {
  for (let index = 0; index < maxTicks; index += 1) {
    const snapshot = encounter.getSnapshot();
    if (predicate(snapshot)) return snapshot;
    encounter.tick(stepMs);
  }
  assert.fail(`condition was not reached; last phase=${encounter.getSnapshot().phase}`);
}

function productionConfig() {
  const source = JSON.parse(readFileSync(
    new URL("../../data/battle/word-breaker.json", import.meta.url),
    "utf8",
  ));
  return normalizeWordBreakerConfig(source);
}

test("config freezes five ordered gimmicks and production targets require five or six hits", () => {
  const config = productionConfig();
  assert.deepEqual(config.arena, { x: 0, y: 0, width: 450, height: 800 });
  assert.deepEqual(config.rounds.map(({ guardian }) => guardian.code), GUARDIAN_CODES);
  assert.deepEqual(config.rounds.map(({ gimmick: item }) => item.type), WORD_BREAKER_GIMMICK_TYPES);
  assert.equal(config.player.speed, 220);
  assert.equal(config.roundDurationMs, 13_500);
  assert.equal(config.omenDurationMs, 2_400);
  assert.equal(config.overloadGraceMs, 4_200);
  assert.deepEqual(config.rounds.map(({ gimmick: roundGimmick }) => roundGimmick.forceAtMs), [
    6_400,
    6_800,
    6_600,
    6_400,
    7_000,
  ]);
  assert.equal(config.overloadAttackLeadMs, 600);
  assert.equal(config.rounds[1].gimmick.spawnIntervalMs, 1_500);
  assert.deepEqual(
    config.rounds.map(({ gimmick: roundGimmick }) => (
      roundGimmick.forceAtMs - config.overloadGraceMs - config.overloadAttackLeadMs
    )),
    [1_600, 2_000, 1_800, 1_600, 2_200],
    "each escalation starts only after a readable active-hazard interval",
  );
  assert.equal(config.collapseImpactMs, 1_800);
  assert.equal(config.guardianRevealMs, 3_000);
  assert.equal(config.magnetDelayMs, 1_100);
  assert.equal(config.recoveryFailsafeMs, 6_500);
  assert.equal(config.recoveryHoldMs, 1_500);
  assert.equal(config.finaleDurationMs, 3_200);
  assert.equal(config.guardian.speed, 300);
  assert.equal(config.phrase.letterSpacing, 1.5);
  assert.equal(config.phrase.wobbleAmplitudeX, 4);
  assert.equal(config.phrase.wobbleAmplitudeY, 3);
  assert.equal(config.phrase.wobbleWavelength, 96);
  assert.equal(config.rounds.every(({ omenMessage, guardianMessage }) => omenMessage && guardianMessage), true);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.rounds[0].gimmick), true);
  assert.equal(DEFAULT_WORD_BREAKER_CONFIG.arena.width, 450);
  assert.deepEqual(normalizeWordBreakerConfig(config), config, "normalization must be idempotent");

  const targetHits = config.rounds.flatMap((round) => round.phrases.map((phrase) => phrase.targetHits));
  assert.ok(targetHits.length > 0);
  assert.equal(targetHits.every((hits) => hits === 5 || hits === 6), true);
  assert.equal(targetHits.some((hits) => hits === 6), true);

  assert.throws(
    () => normalizeWordBreakerConfig({ rounds: rounds().slice(0, 4) }),
    /exactly 5 rounds/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ finalPhrase: { maxHp: 4 } }),
    /guardian recovery steps/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ overloadGraceMs: 6_800 }),
    /overloadGraceMs/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ magnetDelayMs: 8_000, recoveryFailsafeMs: 8_000 }),
    /recoveryFailsafeMs/u,
  );
  assert.throws(
    () => normalizeWordBreakerConfig({ phrase: { letterSpacing: -1 } }),
    /phrase\.letterSpacing/u,
  );
  const wrongPattern = rounds();
  wrongPattern[0].gimmick = gimmick(1);
  assert.throws(
    () => normalizeWordBreakerConfig({ rounds: wrongPattern }),
    /gimmick|unique/u,
  );
  const duplicateTargetRounds = rounds();
  duplicateTargetRounds[0].phrases[0] = {
    ...duplicateTargetRounds[0].phrases[0],
    negative: "가나다라마 그리고 가나다라마",
  };
  assert.throws(
    () => normalizeWordBreakerConfig({ rounds: duplicateTargetRounds }),
    /exactly once/u,
  );
});

test("Korean graphemes own individual geometry and spaces remain transparent", () => {
  const phrase = createWordBreakerPhrase({
    definition: {
      id: "korean-phrase",
      negative: "나는 못 해",
      target: "못 해",
      reframe: "다시 해 볼 수 있어",
      targetHits: 5,
      maxHp: 100,
    },
    arena: { x: 0, y: 0, width: 120, height: 120 },
    phraseConfig: {
      width: 90,
      height: 12,
      targetHeight: 10,
      horizontalPadding: 10,
      letterSpacing: 1.5,
      wobbleAmplitudeX: 4,
      wobbleAmplitudeY: 1,
      wobbleWavelength: 96,
      speed: 1,
    },
    shotDamage: 20,
    roundIndex: 0,
    sequence: 1,
    random: () => 0,
  });

  assert.equal(phrase.glyphs.map(({ text }) => text).join(""), "나는 못 해");
  assert.deepEqual(
    phrase.glyphs.filter(({ isTarget }) => isTarget).map(({ text }) => text),
    ["못", "해"],
  );
  assert.equal(
    phrase.glyphs.filter(({ isTarget }) => isTarget).reduce((sum, glyph) => sum + glyph.maxHp, 0),
    100,
  );
  const spaces = phrase.glyphs.filter(({ text }) => text === " ");
  assert.ok(spaces.length > 0);
  assert.equal(spaces.every(({ collidable }) => collidable === false), true);
  const transparentPoint = {
    x: spaces[0].x + spaces[0].width / 2,
    y: spaces[0].y + spaces[0].height / 2,
    width: 0.5,
    height: 0.5,
  };
  assert.equal(aabbIntersects(transparentPoint, phrase), true, "point is inside the legacy parent rectangle");
  assert.equal(
    phrase.glyphs.some((glyph) => glyph.collidable && aabbIntersects(transparentPoint, glyph)),
    false,
    "the transparent space owns no collision geometry",
  );
  const centers = phrase.glyphs.map(({ x, width }) => x + width / 2);
  const naturalSlotWidth = (phrase.width - 20) / phrase.glyphs.length;
  assert.equal(
    centers.slice(1).every((center, index) => center - centers[index] > naturalSlotWidth),
    true,
    "logical glyph centers include the configured tracking",
  );
  assert.ok(
    new Set(phrase.glyphs.map(({ y }) => y.toFixed(4))).size > 1,
    "letters begin on a gentle wave instead of one rigid baseline",
  );
  const oldPhraseY = phrase.y;
  const oldGlyphX = phrase.glyphs.map(({ x }) => x);
  const oldGlyphY = phrase.glyphs.map(({ y }) => y);
  movePhraseDown(phrase, 13);
  assert.equal(phrase.y - oldPhraseY, 13, "the sentence baseline keeps its original fall speed");
  assert.equal(
    phrase.glyphs.some(({ x }, index) => Math.abs(x - oldGlyphX[index]) > 0.01),
    true,
    "the sentence sways horizontally while descending",
  );
  assert.equal(
    phrase.glyphs.some(({ y }, index) => Math.abs(y - oldGlyphY[index] - 13) > 0.01),
    true,
    "individual letters continue their vertical wave while descending",
  );
  const targets = phrase.glyphs.filter(({ isTarget }) => isTarget);
  const left = Math.min(...targets.map(({ x }) => x));
  const top = Math.min(...targets.map(({ y }) => y));
  const right = Math.max(...targets.map(({ x, width }) => x + width));
  const bottom = Math.max(...targets.map(({ y, height }) => y + height));
  assert.deepEqual(phrase.targetBounds, {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, "the visible target glyphs and collision envelope stay synchronized");
});

test("phrase wobble is deterministic across movement splits", () => {
  const options = {
    definition: {
      id: "wave-split",
      negative: "천천히 흔들려",
      target: "흔들려",
      reframe: "차분히 이어가",
      targetHits: 5,
      maxHp: 100,
    },
    arena: { x: 0, y: 0, width: 450, height: 800 },
    phraseConfig: {
      width: 310,
      height: 58,
      targetHeight: 24,
      horizontalPadding: 24,
      letterSpacing: 1.5,
      wobbleAmplitudeX: 4,
      wobbleAmplitudeY: 3,
      wobbleWavelength: 96,
      speed: 58,
    },
    shotDamage: 20,
    roundIndex: 2,
    sequence: 7,
    random: () => 0.5,
  };
  const oneStep = createWordBreakerPhrase(options);
  const splitStep = createWordBreakerPhrase(options);

  movePhraseDown(oneStep, 37);
  movePhraseDown(splitStep, 10);
  movePhraseDown(splitStep, 27);

  assert.deepEqual(
    oneStep.glyphs.map(({ x, y }) => ({ x, y })),
    splitStep.glyphs.map(({ x, y }) => ({ x, y })),
  );
  assert.deepEqual(oneStep.targetBounds, splitStep.targetBounds);
});

test("tracked production phrases keep every wobbling glyph inside the arena width", () => {
  const config = productionConfig();
  for (const [roundIndex, round] of config.rounds.entries()) {
    for (const definition of round.phrases) {
      for (const random of [() => 0, () => 0.999_999]) {
        const phrase = createWordBreakerPhrase({
          definition,
          arena: config.arena,
          phraseConfig: config.phrase,
          shotDamage: config.shot.damage,
          roundIndex,
          sequence: 3,
          random,
        });
        for (let step = 0; step < 5; step += 1) {
          assert.equal(phrase.glyphs.every(({ x, width }) => (
            x >= config.arena.x - 1e-9
            && x + width <= config.arena.x + config.arena.width + 1e-9
          )), true, `${definition.id}: wave step ${step}`);
          movePhraseDown(phrase, config.phrase.wobbleWavelength / 4);
        }
      }
    }
  }
});

test("collision helpers retain edge and swept-shot behavior", () => {
  const glyph = { x: 28, y: 10, width: 12, height: 10 };
  assert.equal(aabbIntersects({ x: 40, y: 12, width: 2, height: 2 }, glyph), true);
  assert.equal(pointInAabb({ x: 28, y: 15 }, glyph), true);
  assert.equal(pointInAabb({ x: 27.9, y: 15 }, glyph), false);
  assert.equal(sweptAabbIntersects(
    { x: 31, y: 30, width: 2, height: 2 },
    { x: 31, y: 0, width: 2, height: 2 },
    glyph,
  ), true);
  assert.deepEqual(
    moveAabbToward({ x: 0, y: 0, width: 2, height: 2 }, { x: 9, y: 0, width: 2, height: 2 }, 50),
    { x: 9, y: 0, width: 2, height: 2 },
  );
});

test("shots break every target glyph before one phrase purification", () => {
  const events = [];
  const config = compactConfig({
    roundDurationMs: 1_000,
    player: {
      width: 100,
      height: 10,
      speed: 100,
      invulnerableMs: 20,
      startPosition: { x: 0, y: 100 },
    },
    shot: { width: 100, height: 4, speed: 1_000, intervalMs: 15, damage: 20 },
    phrase: {
      width: 80,
      height: 10,
      targetHeight: 8,
      speed: 1,
      spawnIntervalMs: 1_000,
      maxHp: 100,
      reframeDurationMs: 650,
      horizontalPadding: 0,
    },
  });
  const encounter = new WordBreakerEncounter({ config, random: () => 0, onEvent: (event) => events.push(event) });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:glyph-hits" });
  encounter.tick(250);

  const snapshot = encounter.getSnapshot();
  const phrase = snapshot.phrases[0];
  assert.equal(phrase.tone, "reframed");
  assert.equal(phrase.glyphs.filter(({ isTarget }) => isTarget).length, 5);
  assert.equal(phrase.glyphs.filter(({ isTarget }) => isTarget).every(({ broken }) => broken), true);
  assert.equal(snapshot.metrics.glyphsBroken, 5);
  assert.equal(snapshot.metrics.purifiedCount, 1);
  const brokenIndices = events
    .map((event, index) => event.type === "glyph-broken" ? index : -1)
    .filter((index) => index >= 0);
  const purifiedIndex = events.findIndex(({ type }) => type === "phrase-purified");
  assert.equal(brokenIndices.length, 5);
  assert.ok(purifiedIndex > Math.max(...brokenIndices), "purification follows the last broken target glyph");
});

test("shots and the player pass through a transparent parent gap", () => {
  function gapEncounter(playerX) {
    const gapRounds = rounds({ negative: "가 나", target: "가", targetHits: 5 });
    const encounter = new WordBreakerEncounter({
      config: compactConfig({
        roundDurationMs: 1_000,
        player: {
          width: 5,
          height: 10,
          speed: 100,
          invulnerableMs: 20,
          startPosition: { x: playerX, y: 100 },
        },
        shot: { width: 2, height: 4, speed: 1, intervalMs: 1_000, damage: 20 },
        phrase: {
          width: 90,
          height: 10,
          targetHeight: 8,
          speed: 300,
          spawnIntervalMs: 1_000,
          maxHp: 100,
          reframeDurationMs: 5,
          horizontalPadding: 0,
        },
        rounds: gapRounds,
      }),
      random: () => 0,
    });
    encounter.init();
    encounter.start({ attemptId: `word-breaker:gap-${playerX}` });
    encounter.tick(400);
    return encounter.getSnapshot();
  }

  const gap = gapEncounter(23);
  assert.equal(gap.metrics.hitCount, 0);
  assert.equal(gap.metrics.glyphsBroken, 0);
  assert.equal(gap.metrics.purifiedCount, 0);
  const solid = gapEncounter(5);
  assert.equal(solid.metrics.hitCount, 1, "the same parent path hits when the player overlaps a real glyph");
  assert.equal(solid.state, WORD_BREAKER_STATES.RUNNING);
});

test("five allowlisted overload factories have ordered, distinct deterministic shapes", () => {
  const config = normalizeWordBreakerConfig();
  const waveIndices = [4, 0, 3, 4, 0];
  const expectedCounts = [6, 11, 8, 5, 5];
  const waves = config.rounds.map((round, roundIndex) => createWordBreakerOverloadWave({
    round,
    arena: config.arena,
    playerBounds: config.player.startPosition.width
      ? config.player.startPosition
      : { ...config.player.startPosition, width: config.player.width, height: config.player.height },
    gimmick: round.gimmick,
    roundIndex,
    waveIndex: waveIndices[roundIndex],
    random: () => 0.5,
  }));

  assert.deepEqual(waves.map((wave) => wave[0].pattern), WORD_BREAKER_GIMMICK_TYPES);
  assert.deepEqual(waves.map((wave) => wave.length), expectedCounts);
  assert.equal(new Set(waves.map((wave) => wave.map(({ x }) => Math.round(x)).join(","))).size, 5);
  assert.equal(waves[3].every(({ delayRemainingMs }) => delayRemainingMs > 0), true);

  const player = {
    ...config.player.startPosition,
    width: config.player.width,
    height: config.player.height,
  };
  const wave = (roundIndex, waveIndex) => createWordBreakerOverloadWave({
    round: config.rounds[roundIndex],
    arena: config.arena,
    playerBounds: player,
    gimmick: config.rounds[roundIndex].gimmick,
    roundIndex,
    waveIndex,
    random: () => 0.5,
  });

  const dsCrossfire = wave(0, 0);
  assert.equal(dsCrossfire.length, 4);
  assert.deepEqual(
    dsCrossfire.map(({ vx, vy }) => [Math.sign(vx), Math.sign(vy)]),
    [[0, 1], [-1, 0], [0, -1], [1, 0]],
    "the first DS wave enters from top, right, bottom, and left",
  );
  const dsOutlier = wave(0, 5).find(({ variant }) => variant === "outlier");
  assert.ok(dsOutlier);
  assert.ok(
    Math.hypot(dsOutlier.vx, dsOutlier.vy) > config.rounds[0].gimmick.glyphSpeed,
    "DS outliers cross the four-way stream faster than ordinary samples",
  );

  const firewallForward = wave(1, 0);
  const firewallReverse = wave(1, 1);
  assert.equal(firewallForward.length, 11);
  assert.equal(firewallReverse.length, 11);
  assert.ok(firewallForward.every(({ delayRemainingMs }) => delayRemainingMs === 420));
  assert.equal(
    firewallForward.filter(({ badge }) => badge === "PORT").length,
    1,
    "one packet beside the rotating gap marks the escape port",
  );
  assert.notDeepEqual(
    firewallForward.map(({ x, y }) => [Math.round(x), Math.round(y)]),
    firewallReverse.map(({ x, y }) => [Math.round(x), Math.round(y)]),
    "the single open port rotates between firewall rings",
  );
  assert.ok(firewallForward.every(({ variant }) => ["trojan", "worm", "spyware"].includes(variant)));
  const firewallTarget = { x: firewallForward[0].targetX, y: firewallForward[0].targetY };
  const firewallAngles = firewallForward
    .map((glyph) => Math.atan2(
      glyph.y + glyph.height / 2 - firewallTarget.y,
      glyph.x + glyph.width / 2 - firewallTarget.x,
    ))
    .toSorted((left, right) => left - right);
  const firewallGaps = firewallAngles.map((angle, index) => {
    const next = firewallAngles[(index + 1) % firewallAngles.length]
      + (index === firewallAngles.length - 1 ? Math.PI * 2 : 0);
    return next - angle;
  }).toSorted((left, right) => right - left);
  assert.ok(
    firewallGaps[0] > firewallGaps[1] * 3.5,
    "one contiguous three-slot opening remains as a playable escape port",
  );
  const firewallGlyph = { ...firewallForward[0] };
  const firewallDistance = (glyph) => Math.hypot(
    glyph.x + glyph.width / 2 - glyph.targetX,
    glyph.y + glyph.height / 2 - glyph.targetY,
  );
  const firewallBefore = firewallDistance(firewallGlyph);
  moveWordBreakerOverloadGlyph(
    firewallGlyph,
    firewallGlyph.delayRemainingMs + 100,
    player,
  );
  assert.ok(firewallDistance(firewallGlyph) < firewallBefore, "the open firewall ring closes inward");

  const closedFirewall = createWordBreakerOverloadSurge({
    round: config.rounds[1],
    arena: config.arena,
    playerBounds: player,
    gimmick: config.rounds[1].gimmick,
    roundIndex: 1,
    surgeIndex: 0,
  });
  assert.equal(closedFirewall.length, config.rounds[1].gimmick.maxGlyphs);
  assert.ok(closedFirewall.every(({ surge, variant }) => surge && variant === "ransomware"));
  const closedCenter = aabbCenter(player);
  const closedAngles = closedFirewall
    .map((glyph) => Math.atan2(
      glyph.y + glyph.height / 2 - closedCenter.y,
      glyph.x + glyph.width / 2 - closedCenter.x,
    ))
    .toSorted((left, right) => left - right);
  const closedGaps = closedAngles.map((angle, index) => {
    const next = closedAngles[(index + 1) % closedAngles.length]
      + (index === closedAngles.length - 1 ? Math.PI * 2 : 0);
    return next - angle;
  });
  assert.ok(
    Math.max(...closedGaps) < firewallGaps[0] * 0.6,
    "the CS surge closes the final escape port",
  );

  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => wave(2, index).length),
    [1, 2, 4, 8, 1, 2, 4, 8],
  );
  assert.equal(wave(2, 3)[0].variant, "stack-overflow");

  const predictionSpans = Array.from({ length: 4 }, (_, stage) => {
    const hypotheses = wave(3, stage);
    return Math.max(...hypotheses.map(({ x }) => x)) - Math.min(...hypotheses.map(({ x }) => x));
  });
  assert.ok(predictionSpans.every((span, index) => index === 0 || span < predictionSpans[index - 1]));
  assert.equal(wave(3, 3).find(({ badge }) => badge === "99%")?.variant, "confidence-lock");

  const pipeline = [wave(4, 0), wave(4, 1), wave(4, 2)];
  assert.deepEqual(pipeline.map((items) => items.length), [5, 3, 8]);
  assert.deepEqual(
    pipeline.map((items) => new Set(items.map(({ variant }) => variant)).values().next().value),
    ["data-input", "model-output", "feedback-loop"],
  );
  const feedbackGlyph = pipeline[2][0];
  const distanceToFixedTarget = (glyph) => Math.hypot(
    glyph.x + glyph.width / 2 - glyph.targetX,
    glyph.y + glyph.height / 2 - glyph.targetY,
  );
  const before = distanceToFixedTarget(feedbackGlyph);
  moveWordBreakerOverloadGlyph(
    feedbackGlyph,
    feedbackGlyph.delayRemainingMs + 100,
    { x: 0, y: 0, width: player.width, height: player.height },
  );
  assert.ok(distanceToFixedTarget(feedbackGlyph) < before, "pipeline feedback keeps its spawn-time target");
});

test("surge glyph AABBs start inside the arena and cover its full width without gaps", () => {
  const config = productionConfig();
  const arena = { x: 13, y: 17, width: 451, height: 800 };
  const delayMs = 650;
  const glyphs = createWordBreakerOverloadSurge({
    round: config.rounds[0],
    arena,
    gimmick: config.rounds[0].gimmick,
    roundIndex: 0,
    surgeIndex: 2,
    delayMs,
    travelMs: 2_400,
  }).toSorted((left, right) => left.x - right.x);

  assert.ok(glyphs.length > 1);
  assert.equal(glyphs.every(({ surge }) => surge === true), true);
  assert.equal(glyphs.every(({ delayRemainingMs }) => delayRemainingMs === delayMs), true);
  assert.equal(glyphs.every(({ y }) => y >= arena.y && y < arena.y + arena.height), true);

  let coveredUntil = arena.x;
  for (const glyph of glyphs) {
    assert.ok(
      glyph.x <= coveredUntil + Number.EPSILON,
      `surge gap before ${glyph.id}: ${coveredUntil} -> ${glyph.x}`,
    );
    coveredUntil = Math.max(coveredUntil, glyph.x + glyph.width);
  }
  assert.ok(glyphs[0].x <= arena.x);
  assert.ok(coveredUntil >= arena.x + arena.width);
});

test("every cyber-security opening is wide enough to escape before its ring closes", () => {
  const config = productionConfig();
  const round = config.rounds[1];
  const stepMs = config.simulationStepMs;
  const starts = [
    config.player.startPosition,
    { x: config.arena.x, y: config.arena.y },
    { x: config.arena.x + config.arena.width - config.player.width, y: config.arena.y },
    { x: config.arena.x, y: config.arena.y + config.arena.height - config.player.height },
    {
      x: config.arena.x + config.arena.width - config.player.width,
      y: config.arena.y + config.arena.height - config.player.height,
    },
  ];

  for (const [startIndex, start] of starts.entries()) {
    for (let waveIndex = 0; waveIndex < 5; waveIndex += 1) {
      let player = {
        ...start,
        width: config.player.width,
        height: config.player.height,
      };
      const ring = createWordBreakerOverloadWave({
        round,
        arena: config.arena,
        playerBounds: player,
        gimmick: round.gimmick,
        roundIndex: 1,
        waveIndex,
        random: () => 0.5,
      });
      const center = { x: ring[0].targetX, y: ring[0].targetY };
      const angles = ring
        .map((glyph) => {
          const angle = Math.atan2(
            glyph.y + glyph.height / 2 - center.y,
            glyph.x + glyph.width / 2 - center.x,
          );
          return angle < 0 ? angle + Math.PI * 2 : angle;
        })
        .toSorted((left, right) => left - right);
      let openingStart = 0;
      let openingSize = 0;
      for (let index = 0; index < angles.length; index += 1) {
        const next = angles[(index + 1) % angles.length]
          + (index === angles.length - 1 ? Math.PI * 2 : 0);
        if (next - angles[index] > openingSize) {
          openingStart = angles[index];
          openingSize = next - angles[index];
        }
      }
      const openingAngle = openingStart + openingSize / 2;
      const direction = { x: Math.cos(openingAngle), y: Math.sin(openingAngle) };
      let contacted = false;

      for (
        let elapsedMs = 0;
        elapsedMs < 1_400 && ring.some(({ expired }) => !expired);
        elapsedMs += stepMs
      ) {
        player = clampAabbToArena({
          ...player,
          x: player.x + direction.x * config.player.speed * (stepMs / 1000),
          y: player.y + direction.y * config.player.speed * (stepMs / 1000),
        }, config.arena);
        for (const glyph of ring) {
          if (glyph.expired) continue;
          const previous = { ...glyph };
          moveWordBreakerOverloadGlyph(glyph, stepMs, player);
          if (
            glyph.delayRemainingMs <= 0
            && (aabbIntersects(player, glyph) || sweptAabbIntersects(previous, glyph, player))
          ) {
            contacted = true;
          }
        }
      }

      assert.equal(
        contacted,
        false,
        `start ${startIndex + 1}, wave ${waveIndex + 1} can escape through its position-aware opening`,
      );
      assert.equal(ring.every(({ expired }) => expired), true, "a safely passed firewall retires at its center");
    }
  }
});

test("cyber-security waves replace whole rings instead of truncating them at max capacity", () => {
  const events = [];
  const ringRounds = rounds();
  ringRounds[1].gimmick = gimmick(1, {
    telegraphMs: 1,
    forceAtMs: 500,
    spawnIntervalMs: 5,
    glyphSpeed: 1,
    maxGlyphs: 28,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({
      simulationStepMs: 1,
      magnetDelayMs: 0,
      recoveryFailsafeMs: 1,
      rounds: ringRounds,
    }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:atomic-firewall-rings" });
  advanceUntil(
    encounter,
    (snapshot) => snapshot.roundIndex === 1 && snapshot.phase === WORD_BREAKER_PHASES.PLAY,
    { stepMs: 1 },
  );
  events.length = 0;
  advanceUntil(
    encounter,
    (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.OVERLOAD && snapshot.overload.armed,
    { stepMs: 1 },
  );
  encounter.tick(20);

  const ringEvents = events.filter(({ type, roundIndex }) => type === "overload-wave" && roundIndex === 1);
  assert.ok(ringEvents.length >= 4);
  assert.equal(
    ringEvents.every(({ glyphs }) => glyphs.length === 11),
    true,
    "every emitted event contains one complete ring with one contiguous opening",
  );
  const activeRing = encounter.getSnapshot().overloadGlyphs.filter(({ surge }) => !surge);
  assert.equal(activeRing.length, 11);
  assert.equal(new Set(activeRing.map(({ waveIndex }) => waveIndex)).size, 1);
});

test("forceAt starts one bounded escalation without an immediate virtual knockout", () => {
  const events = [];
  const cappedRounds = rounds();
  cappedRounds[0].gimmick = gimmick(0, {
    forceAtMs: 30,
    glyphSpeed: 1,
    maxGlyphs: 4,
    contactThreshold: 8,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ rounds: cappedRounds }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:deadline-ko" });
  encounter.tick(25);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(events.filter(({ type }) => type === "collapse").length, 0);
  const firstWave = encounter.getSnapshot();
  assert.ok(firstWave.overloadGlyphs.length > 0);
  const movingId = firstWave.overloadGlyphs[0].id;
  const firstY = firstWave.overloadGlyphs[0].y;
  encounter.tick(5);
  const moved = encounter.getSnapshot().overloadGlyphs.find(({ id }) => id === movingId);
  assert.ok(moved.y > firstY);
  encounter.tick(5);
  assert.equal(encounter.getSnapshot().overload.armed, true);
  assert.equal(encounter.getSnapshot().metrics.knockoutCount, 0, "preview hazards are cleared before activation");

  encounter.tick(20);
  let escalated = encounter.getSnapshot();
  assert.equal(escalated.overload.elapsedMs, 30);
  assert.equal(escalated.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(escalated.overload.escalated, true);
  assert.equal(escalated.metrics.knockoutCount, 0);
  assert.ok(escalated.overloadGlyphs.some(({ surge }) => surge), "forceAt adds a visible surge wave");

  for (let index = 0; index < 2_000; index += 1) {
    escalated = encounter.tick(5);
    assert.equal(escalated.phase, WORD_BREAKER_PHASES.OVERLOAD);
    assert.ok(escalated.overloadGlyphs.length <= 4, "escalation must honor maxGlyphs indefinitely");
  }
  assert.equal(events.filter(({ type }) => type === "overload-escalated").length, 1);
  assert.ok(events.filter(({ type }) => type === "overload-surge").length >= 3);
  assert.ok(events.filter(({ type }) => type === "overload-contact").length < 8);
  assert.equal(events.filter(({ type }) => type === "collapse").length, 0);
  assert.equal(events.filter(({ type }) => type === "player-knockout").length, 0);
  assert.equal(encounter.getSnapshot().metrics.knockoutCount, 0);
});

test("a visible active surge glyph must actually overlap the player before knockout", () => {
  const events = [];
  const surgeRounds = rounds();
  surgeRounds[0].gimmick = gimmick(0, {
    telegraphMs: 1,
    forceAtMs: 30,
    spawnIntervalMs: 1_000,
    glyphSpeed: 1_000,
    maxGlyphs: 1,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ rounds: surgeRounds }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:surge-contact" });

  const escalated = advanceUntil(encounter, (snapshot) => snapshot.overload.escalated === true);
  assert.equal(escalated.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(escalated.overload.elapsedMs, surgeRounds[0].gimmick.forceAtMs);
  assert.equal(escalated.metrics.knockoutCount, 0);
  assert.equal(events.filter(({ type }) => type === "overload-escalated").length, 1);
  const telegraphedSurge = escalated.overloadGlyphs.findLast(({ surge }) => surge);
  assert.ok(telegraphedSurge);
  assert.equal(telegraphedSurge.telegraphing, true);
  assert.ok(telegraphedSurge.y >= 0 && telegraphedSurge.y < 120);
  encounter.setPlayerBounds(telegraphedSurge);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(encounter.getSnapshot().metrics.knockoutCount, 0);
  encounter.tick(telegraphedSurge.delayRemainingMs - 1);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(encounter.getSnapshot().metrics.knockoutCount, 0);
  const knockedOut = encounter.tick(1);
  assert.equal(knockedOut.phase, WORD_BREAKER_PHASES.KNOCKED_OUT);
  const knockoutEvent = events.find(({ type }) => type === "player-knockout");
  assert.equal(knockoutEvent?.reason, "surge-contact");
  assert.equal(knockoutEvent?.glyph?.surge, true);
  assert.equal(knockoutEvent?.glyph?.telegraphing, false);
  assert.ok(aabbIntersects(knockedOut.playerBounds, knockoutEvent.glyph));
  assert.ok(knockedOut.overloadGlyphs.some(({ id }) => id === knockoutEvent.glyph.id));
  assert.equal(knockedOut.metrics.overloadContacts, 1);
  assert.equal(knockedOut.metrics.knockoutCount, 1);
});

test("round pacing keeps normal attacks flowing through omen and overload lead boundaries", () => {
  const events = [];
  const pacingRounds = rounds();
  pacingRounds[0].gimmick = gimmick(0, {
    telegraphMs: 1,
    forceAtMs: 30,
    spawnIntervalMs: 1_000,
    glyphSpeed: 1_000,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ simulationStepMs: 1, rounds: pacingRounds }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:story-boundaries" });

  encounter.tick(19);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.PLAY);
  encounter.tick(1);
  let snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OMEN);
  assert.equal(snapshot.omenRemainingMs, 5);
  const normalSpawnsAtOmen = snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired;
  encounter.tick(4);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OMEN);
  assert.ok(
    snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired > normalSpawnsAtOmen,
    "normal attack spawning continues while the omen is internally active",
  );
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(snapshot.overload.elapsedMs, 0);
  assert.equal(snapshot.overload.armed, false);
  assert.ok(snapshot.overloadGlyphs.length > 0, "a sparse preview wave starts the surge");

  const normalSpawnsAtOverload = snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired;
  encounter.tick(9);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(snapshot.overload.armed, false);
  assert.ok(
    snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired > normalSpawnsAtOverload,
    "normal attacks keep spawning during the concealed overload grace",
  );
  assert.equal(snapshot.metrics.knockoutCount, 0, "preview glyphs cannot knock out the player during grace");
  encounter.setPlayerBounds(snapshot.overloadGlyphs[0]);
  assert.equal(encounter.getSnapshot().metrics.knockoutCount, 0);
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(snapshot.overload.armed, true);
  assert.equal(snapshot.overload.attacking, false);
  assert.equal(snapshot.metrics.knockoutCount, 0, "the preview is replaced instead of hitting on the arm boundary");
  assert.ok(
    snapshot.phrases.length + snapshot.shots.length > 0,
    "existing normal attacks bridge the armed telegraph instead of disappearing abruptly",
  );
  const normalSpawnsAtArm = snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired;
  encounter.setPlayerBounds({ x: 45, y: 100, width: 10, height: 10 });
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.overload.attacking, false);
  assert.ok(snapshot.phrases.length + snapshot.shots.length > 0);
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.overload.attacking, true);
  assert.equal(snapshot.metrics.knockoutCount, 0);
  assert.equal(snapshot.phrases.length + snapshot.shots.length, 0);
  assert.equal(
    snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired,
    normalSpawnsAtArm,
    "normal spawning stops at arm while the existing attacks drain through the lead",
  );
  encounter.tick(17);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.OVERLOAD);
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.OVERLOAD);
  assert.equal(snapshot.overload.escalated, true);
  assert.equal(snapshot.metrics.knockoutCount, 0, "forceAt starts escalation instead of virtual contact");
  assert.equal(events.filter(({ type }) => type === "overload-escalated").length, 1);

  snapshot = advanceUntil(
    encounter,
    (candidate) => candidate.phase === WORD_BREAKER_PHASES.KNOCKED_OUT,
    { stepMs: 1, maxTicks: 2_000 },
  );
  const knockoutEvent = events.find(({ type }) => type === "player-knockout");
  assert.equal(snapshot.metrics.knockoutCount, 1);
  assert.equal(snapshot.guardian, null);
  assert.equal(knockoutEvent?.reason, "surge-contact");
  assert.equal(knockoutEvent?.glyph?.surge, true);
  assert.equal(knockoutEvent?.glyph?.telegraphing, false);
  assert.ok(aabbIntersects(snapshot.playerBounds, knockoutEvent.glyph));

  encounter.tick(4);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.KNOCKED_OUT);
  assert.equal(encounter.getSnapshot().guardian, null);
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.GUARDIAN_REVEAL);
  assert.equal(snapshot.guardian.code, "DS");
  assert.match(snapshot.status.text, /DS guardian/u);
  encounter.setPlayerBounds(snapshot.guardian);
  assert.equal(encounter.getSnapshot().metrics.guardiansCollected, 0, "the egg cannot be skipped during its reveal");
  encounter.tick(6);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.GUARDIAN_REVEAL);

  encounter.setPlayerBounds({ x: 0, y: 100, width: 10, height: 10 });
  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.RECOVERING);
  assert.equal(snapshot.controlLocked, false);
  encounter.setPlayerBounds(snapshot.guardian);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.phase, WORD_BREAKER_PHASES.REVIVED);
  assert.equal(snapshot.roundIndex, 0);
  assert.equal(snapshot.status.text, pacingRounds[0].recoveryMessage);
  assert.equal(snapshot.guardian.code, "DS", "the collected egg remains visible through the recovery hold");
  const collectedEvent = events.find(({ type }) => type === "guardian-collected");
  assert.equal(collectedEvent?.message, pacingRounds[0].recoveryMessage);
  assert.equal(collectedEvent?.guardian?.code, "DS");
  encounter.tick(4);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.REVIVED);
  assert.equal(encounter.getSnapshot().roundIndex, 0);
  assert.equal(encounter.getSnapshot().guardian.code, "DS");
  encounter.tick(1);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.PLAY);
  assert.equal(encounter.getSnapshot().roundIndex, 1);
  assert.equal(encounter.getSnapshot().guardian, null);

  const order = events.map(({ type }) => type);
  for (const [before, after] of [
    ["round-start", "omen-start"],
    ["omen-start", "overload-start"],
    ["overload-start", "overload-armed"],
    ["overload-armed", "overload-escalated"],
    ["overload-escalated", "overload-contact"],
    ["overload-contact", "collapse"],
    ["collapse", "player-knockout"],
    ["player-knockout", "guardian-reveal"],
    ["guardian-reveal", "recovery-start"],
    ["recovery-start", "guardian-collected"],
  ]) {
    assert.ok(order.indexOf(before) < order.indexOf(after), `${before} must precede ${after}`);
  }
});

test("AI pattern-specific telegraphing keeps normal attacks alive until the first glyph activates", () => {
  const delayedRounds = rounds();
  delayedRounds[3].gimmick = gimmick(3, {
    telegraphMs: 5,
    forceAtMs: 2_000,
    spawnIntervalMs: 1_000,
    glyphSpeed: 10,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({
      simulationStepMs: 1,
      magnetDelayMs: 0,
      recoveryFailsafeMs: 1,
      rounds: delayedRounds,
    }),
    random: () => 0.5,
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:ai-delayed-handoff" });

  advanceUntil(
    encounter,
    (candidate) => candidate.roundIndex === 3 && candidate.phase === WORD_BREAKER_PHASES.PLAY,
    { stepMs: 1 },
  );

  let snapshot = advanceUntil(
    encounter,
    (candidate) => (
      candidate.roundIndex === 3
      && candidate.phase === WORD_BREAKER_PHASES.OVERLOAD
      && candidate.overload.armed
    ),
    { stepMs: 1 },
  );
  const firstActivationMs = Math.min(
    ...snapshot.overloadGlyphs.map(({ delayRemainingMs }) => delayRemainingMs),
  );
  const normalSpawnsAtArm = snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired;
  assert.ok(firstActivationMs > 2, "AI prediction glyphs add their own readable delay after the global lead");
  assert.equal(snapshot.overload.attacking, false);
  assert.ok(snapshot.phrases.length + snapshot.shots.length > 0);

  encounter.tick(firstActivationMs - 1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.overload.attacking, false);
  assert.ok(
    snapshot.phrases.length + snapshot.shots.length > 0,
    "the old phrase stream remains visible while every AI glyph is still telegraphing",
  );
  assert.ok(
    snapshot.metrics.phrasesSpawned + snapshot.metrics.shotsFired > normalSpawnsAtArm,
    "normal attacks keep spawning so a long department telegraph cannot create an empty interval",
  );

  encounter.tick(1);
  snapshot = encounter.getSnapshot();
  assert.equal(snapshot.overload.attacking, true);
  assert.ok(snapshot.overloadGlyphs.some(({ telegraphing }) => !telegraphing));
  assert.equal(
    snapshot.phrases.length + snapshot.shots.length,
    0,
    "normal attacks retire on the exact simulation step that the first AI glyph becomes active",
  );
});

test("a fast active overload glyph can cause contact knockout before escalation", () => {
  const events = [];
  const contactRounds = rounds();
  contactRounds[0].gimmick = gimmick(0, {
    telegraphMs: 1,
    forceAtMs: 100,
    spawnIntervalMs: 50,
    glyphSpeed: 5_000,
    maxGlyphs: 8,
  });
  const encounter = new WordBreakerEncounter({
    config: compactConfig({
      roundDurationMs: 5,
      player: {
        width: 10,
        height: 10,
        speed: 100,
        invulnerableMs: 20,
        startPosition: { x: 5, y: 100 },
      },
      rounds: contactRounds,
    }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:contact-ko" });
  const knockout = advanceUntil(encounter, (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.KNOCKED_OUT);
  assert.equal(knockout.metrics.overloadContacts, 1);
  assert.equal(knockout.metrics.knockoutCount, 1);
  assert.equal(events.filter(({ type }) => type === "overload-escalated").length, 0);
  const knockoutEvent = events.find(({ type }) => type === "player-knockout");
  assert.equal(knockoutEvent.reason, "contact");
  assert.equal(knockoutEvent.glyph.surge, false);
  assert.equal(knockoutEvent.glyph.telegraphing, false);
  assert.ok(aabbIntersects(knockout.playerBounds, knockoutEvent.glyph));
});

test("production overloads give every department a visible lead and eventually hit a stationary player", () => {
  const config = productionConfig();
  const events = [];
  const encounter = new WordBreakerEncounter({
    config,
    random: () => 0.5,
    onEvent: (event) => events.push(event),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:production-arm-lead" });
  const armedAt = [];
  const knockedOutAt = [];
  const knockedOutSnapshots = [];
  let previous = encounter.getSnapshot();

  for (let index = 0; index < 30_000 && knockedOutAt.length < config.rounds.length; index += 1) {
    if (previous.phase === WORD_BREAKER_PHASES.RECOVERING && previous.guardian) {
      encounter.setPlayerBounds(previous.guardian);
    }
    const snapshot = encounter.tick(config.simulationStepMs);
    if (snapshot.overload.armed && !previous.overload.armed) {
      armedAt[snapshot.roundIndex] = snapshot.metrics.elapsedMs;
      assert.equal(snapshot.metrics.overloadContacts, knockedOutAt.length);
    }
    if (
      snapshot.phase === WORD_BREAKER_PHASES.KNOCKED_OUT
      && previous.phase === WORD_BREAKER_PHASES.OVERLOAD
    ) {
      knockedOutAt[snapshot.roundIndex] = snapshot.metrics.elapsedMs;
      knockedOutSnapshots[snapshot.roundIndex] = snapshot;
    }
    previous = snapshot;
  }

  assert.equal(armedAt.filter(Number.isFinite).length, config.rounds.length);
  assert.equal(knockedOutAt.filter(Number.isFinite).length, config.rounds.length);
  for (let index = 0; index < config.rounds.length; index += 1) {
    assert.ok(
      knockedOutAt[index] - armedAt[index] >= config.overloadAttackLeadMs,
      `${config.rounds[index].guardian.code} must show its active pattern before knockout`,
    );
  }
  const knockoutEvents = events.filter(({ type }) => type === "player-knockout");
  assert.equal(knockoutEvents.length, config.rounds.length);
  for (const event of knockoutEvents) {
    assert.ok(["contact", "surge-contact"].includes(event.reason));
    assert.equal(event.glyph.telegraphing, false, "telegraph-only glyphs cannot knock out the player");
    assert.equal(Object.hasOwn(event.glyph, "deadline"), false);
    assert.equal(event.glyph.surge, event.reason === "surge-contact");
    assert.ok(aabbIntersects(knockedOutSnapshots[event.roundIndex].playerBounds, event.glyph));
  }
});

test("five knockout recoveries stay RUNNING until one deathless CLEAR finale", () => {
  const events = [];
  const completions = [];
  const encounter = new WordBreakerEncounter({
    config: compactConfig(),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:five-recoveries" });

  for (let roundIndex = 0; roundIndex < 5; roundIndex += 1) {
    encounter.setPlayerBounds({ x: 45, y: 100, width: 10, height: 10 });
    advanceUntil(encounter, (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.OVERLOAD);
    assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.RUNNING);
    const knockedOut = advanceUntil(
      encounter,
      (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.KNOCKED_OUT,
    );
    assert.equal(knockedOut.metrics.knockoutCount, roundIndex + 1);
    assert.equal(knockedOut.state, WORD_BREAKER_STATES.RUNNING);
    assert.equal(completions.length, 0);
    const recovering = advanceUntil(
      encounter,
      (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.RECOVERING,
    );
    assert.equal(recovering.guardian.code, GUARDIAN_CODES[roundIndex]);
    encounter.setPlayerBounds(recovering.guardian);
    const collected = encounter.getSnapshot();
    assert.equal(collected.metrics.guardiansCollected, roundIndex + 1);
    assert.equal(collected.phase, WORD_BREAKER_PHASES.REVIVED);
    assert.equal(collected.status.text, `${GUARDIAN_CODES[roundIndex]} recovery`);
    assert.equal(collected.guardian.code, GUARDIAN_CODES[roundIndex]);
    if (roundIndex < 4) {
      advanceUntil(encounter, (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.PLAY);
    }
  }

  advanceUntil(encounter, (snapshot) => snapshot.phase === WORD_BREAKER_PHASES.FINALE);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.FINALE);
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.RUNNING);
  encounter.tick(25);
  const completed = encounter.getSnapshot();
  assert.equal(completed.state, WORD_BREAKER_STATES.COMPLETED);
  assert.equal(completed.metrics.knockoutCount, 5);
  assert.equal(completed.metrics.roundsCollapsed, 5);
  assert.equal(completed.metrics.guardiansCollected, 5);
  assert.equal(events.some(({ type }) => type === "fail"), false);
  assert.equal(events.filter(({ type }) => type === "collapse").length, 5);
  assert.equal(events.filter(({ type }) => type === "player-knockout").length, 5);
  assert.equal(events.filter(({ type }) => type === "player-knockout").every(({ reason, glyph }) => (
    ["contact", "surge-contact"].includes(reason)
    && glyph?.telegraphing === false
  )), true);
  assert.equal(events.filter(({ type }) => type === "omen-start").length, 5);
  assert.equal(events.filter(({ type }) => type === "guardian-reveal").length, 5);
  assert.equal(events.filter(({ type }) => type === "recovery-start").length, 5);
  const guardianCollectedEvents = events.filter(({ type }) => type === "guardian-collected");
  assert.equal(guardianCollectedEvents.length, 5);
  assert.deepEqual(
    guardianCollectedEvents.map(({ message }) => message),
    GUARDIAN_CODES.map((code) => `${code} recovery`),
  );
  assert.equal(events.filter(({ type }) => type === "complete").length, 1);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
  assert.equal(completions[0].candidate.failureReason, null);
  assert.equal(assertCandidateFieldAllowlist(completions[0].candidate), true);
  assert.equal(validateMiniGameCandidate(completions[0].candidate).valid, true);
  assert.throws(
    () => encounter.restart({ attemptId: "word-breaker:five-recoveries" }),
    /already completed/u,
  );
});

test("one large tick carries visible surge contacts through recovery and the finale", () => {
  const events = [];
  const completions = [];
  const encounter = new WordBreakerEncounter({
    config: compactConfig({ magnetDelayMs: 0 }),
    random: () => 0.5,
    onEvent: (event) => events.push(event),
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:large-tick" });
  encounter.tick(30_000);
  const completed = encounter.getSnapshot();
  assert.equal(completed.state, WORD_BREAKER_STATES.COMPLETED);
  assert.equal(completed.metrics.knockoutCount, 5);
  assert.equal(completed.metrics.guardiansCollected, 5);
  assert.equal(events.filter(({ type }) => type === "overload-escalated").length, 5);
  assert.equal(events.filter(({ type }) => type === "player-knockout").every(({ reason, glyph }) => (
    ["contact", "surge-contact"].includes(reason)
    && glyph?.surge === (reason === "surge-contact")
    && glyph.telegraphing === false
  )), true);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
});

test("pause freezes overload state and restart/destroy remain terminal-safe", () => {
  let samples = 0;
  const encounter = new WordBreakerEncounter({
    config: compactConfig(),
    random: () => {
      samples += 1;
      return 0.5;
    },
  });
  encounter.init();
  encounter.start({ attemptId: "word-breaker:pause" });
  encounter.tick(25);
  assert.equal(encounter.getSnapshot().phase, WORD_BREAKER_PHASES.OVERLOAD);
  const beforePause = encounter.getSnapshot();
  const samplesBeforePause = samples;
  assert.equal(encounter.pause(), true);
  encounter.tick(10_000);
  const paused = encounter.getSnapshot();
  assert.equal(paused.state, WORD_BREAKER_STATES.PAUSED);
  assert.deepEqual(paused.overloadGlyphs, beforePause.overloadGlyphs);
  assert.deepEqual(paused.overload, beforePause.overload);
  assert.equal(paused.metrics.elapsedMs, beforePause.metrics.elapsedMs);
  assert.equal(samples, samplesBeforePause);
  assert.equal(encounter.resume(), true);
  encounter.tick(5);
  assert.ok(encounter.getSnapshot().overload.elapsedMs > beforePause.overload.elapsedMs);

  assert.equal(encounter.restart({ attemptId: "word-breaker:restart" }), true);
  const restarted = encounter.getSnapshot();
  assert.equal(restarted.attemptId, "word-breaker:restart");
  assert.equal(restarted.state, WORD_BREAKER_STATES.RUNNING);
  assert.equal(restarted.phase, WORD_BREAKER_PHASES.PLAY);
  assert.equal(restarted.metrics.elapsedMs, 0);
  assert.equal(restarted.metrics.knockoutCount, 0);
  assert.equal(restarted.metrics.guardiansCollected, 0);
  assert.equal(encounter.destroy(), true);
  assert.equal(encounter.destroy(), false);
  assert.equal(encounter.setPlayerBounds({ x: 0, y: 0, width: 1, height: 1 }), false);
  assert.equal(encounter.getSnapshot().state, WORD_BREAKER_STATES.DESTROYED);
  assert.equal(encounter.getSnapshot().disposed, true);
});

test("partial deltas accumulate and different frame splits produce identical outcomes", () => {
  const partial = new WordBreakerEncounter({ config: compactConfig(), random: () => 0.5 });
  partial.init();
  partial.start({ attemptId: "word-breaker:partial-step" });
  const before = partial.getSnapshot();
  partial.tick(4);
  assert.deepEqual(partial.getSnapshot(), before, "a sub-step delta waits in the accumulator");
  partial.tick(1);
  assert.equal(partial.getSnapshot().metrics.elapsedMs, 5);

  const run = (stepMs, count) => {
    const events = [];
    const encounter = new WordBreakerEncounter({
      config: productionConfig(),
      random: () => 0.37,
      onEvent: (event) => events.push(event),
    });
    encounter.init();
    encounter.start({ attemptId: "word-breaker:frame-split" });
    for (let index = 0; index < count; index += 1) encounter.tick(stepMs);
    return { snapshot: encounter.getSnapshot(), events };
  };

  const sixteenMsFrames = run(16, 2_000);
  const fortyMsFrames = run(40, 800);
  assert.deepEqual(
    sixteenMsFrames,
    fortyMsFrames,
    "the same 32 seconds must not change escalation, surge, collisions, score, or events by frame rate",
  );
  assert.ok(sixteenMsFrames.events.some(({ type }) => type === "overload-wave"));
  assert.ok(sixteenMsFrames.events.some(({ type }) => type === "player-knockout"));
});

test("injected random and the same tick stream remain deterministic", () => {
  const first = new WordBreakerEncounter({ config: compactConfig(), random: mulberry32(42) });
  const second = new WordBreakerEncounter({ config: compactConfig(), random: mulberry32(42) });
  first.init();
  second.init();
  first.start({ attemptId: "word-breaker:deterministic" });
  second.start({ attemptId: "word-breaker:deterministic" });
  for (const delta of [1, 4, 5, 7, 20, 35, 80]) {
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

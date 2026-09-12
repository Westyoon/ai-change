import { aabbCenter } from "./collision.js";

function sample(random) {
  if (typeof random !== "function") throw new TypeError("Word Breaker random must be a function.");
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Word Breaker random must return a finite value in [0, 1).");
  }
  return value;
}

function between(random, minimum, maximum) {
  if (maximum <= minimum) return minimum;
  return minimum + sample(random) * (maximum - minimum);
}

function targetBoundsForPhrase(phrase, definition, phraseConfig) {
  const contentX = phrase.x + phraseConfig.horizontalPadding;
  const contentWidth = Math.max(1, phrase.width - phraseConfig.horizontalPadding * 2);
  const targetIndex = definition.negative.indexOf(definition.target);
  const characterCount = Math.max(1, definition.negative.length);
  const naturalX = contentX + contentWidth * (targetIndex / characterCount);
  const naturalWidth = contentWidth * (definition.target.length / characterCount);
  const width = Math.min(contentWidth, Math.max(28, naturalWidth));
  return {
    x: Math.min(contentX + contentWidth - width, naturalX),
    y: phrase.y + (phrase.height - phraseConfig.targetHeight) / 2,
    width,
    height: phraseConfig.targetHeight,
  };
}

export function chooseRoundPhrase(round, random) {
  const index = Math.floor(sample(random) * round.phrases.length);
  return round.phrases[index];
}

export function createWordBreakerPhrase({
  definition,
  arena,
  phraseConfig,
  roundIndex,
  sequence,
  random,
}) {
  const margin = Math.min(
    phraseConfig.horizontalPadding,
    Math.max(0, (arena.width - phraseConfig.width) / 2),
  );
  const minimumX = arena.x + margin;
  const maximumX = arena.x + arena.width - phraseConfig.width - margin;
  const phrase = {
    id: `phrase-${roundIndex + 1}-${sequence}`,
    definitionId: definition.id,
    x: between(random, minimumX, maximumX),
    y: arena.y - phraseConfig.height,
    width: phraseConfig.width,
    height: phraseConfig.height,
    negative: definition.negative,
    target: definition.target,
    reframe: definition.reframe,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    tone: "negative",
    speed: phraseConfig.speed,
    reframeRemainingMs: 0,
  };
  phrase.targetBounds = targetBoundsForPhrase(phrase, definition, phraseConfig);
  return phrase;
}

export function createWordBreakerCollapsePhrase({
  definition,
  arena,
  phraseConfig,
  playerBounds,
  roundIndex,
}) {
  const height = phraseConfig.height;
  const centeredY = playerBounds.y + (playerBounds.height - height) / 2;
  const phrase = {
    id: `phrase-collapse-${roundIndex + 1}`,
    definitionId: definition.id,
    x: arena.x,
    y: Math.min(
      arena.y + arena.height - height,
      Math.max(arena.y, centeredY),
    ),
    width: arena.width,
    height,
    negative: definition.negative,
    target: definition.target,
    reframe: definition.reframe,
    hp: 0,
    maxHp: definition.maxHp,
    tone: "collapse",
    speed: 0,
    reframeRemainingMs: 0,
  };
  phrase.targetBounds = targetBoundsForPhrase(phrase, definition, phraseConfig);
  return phrase;
}

export function createWordBreakerShot({ playerBounds, shotConfig, sequence }) {
  const playerCenter = aabbCenter(playerBounds);
  return {
    id: `shot-${sequence}`,
    x: playerCenter.x - shotConfig.width / 2,
    y: playerBounds.y - shotConfig.height,
    width: shotConfig.width,
    height: shotConfig.height,
  };
}

export function createWordBreakerGuardian({ round, arena, guardianConfig, roundIndex, random }) {
  const horizontalPadding = Math.min(24, Math.max(0, (arena.width - guardianConfig.width) / 2));
  const minimumX = arena.x + horizontalPadding;
  const maximumX = arena.x + arena.width - guardianConfig.width - horizontalPadding;
  return {
    id: round.guardian.id,
    code: round.guardian.code,
    label: round.guardian.label,
    color: round.guardian.color,
    x: between(random, minimumX, maximumX),
    y: Math.max(arena.y, Math.min(
      guardianConfig.spawnY,
      arena.y + arena.height - guardianConfig.height,
    )),
    width: guardianConfig.width,
    height: guardianConfig.height,
    roundIndex,
  };
}

export function createWordBreakerFinalePhrase({ definition, arena, phraseConfig }) {
  const width = Math.min(
    phraseConfig.width,
    Math.max(1, arena.width - phraseConfig.horizontalPadding * 2),
  );
  const phrase = {
    id: `phrase-finale-${definition.id}`,
    definitionId: definition.id,
    x: arena.x + (arena.width - width) / 2,
    y: arena.y + Math.max(90, arena.height * 0.2),
    width,
    height: phraseConfig.height,
    negative: definition.negative,
    target: definition.target,
    reframe: definition.reframe,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    tone: "finale",
    speed: 0,
    reframeRemainingMs: 0,
  };
  phrase.targetBounds = targetBoundsForPhrase(phrase, definition, phraseConfig);
  return phrase;
}

export function movePhraseDown(phrase, distance) {
  const traveled = Math.max(0, Number.isFinite(distance) ? distance : 0);
  phrase.y += traveled;
  phrase.targetBounds.y += traveled;
  return phrase;
}

export function moveShotUp(shot, distance) {
  shot.y -= Math.max(0, Number.isFinite(distance) ? distance : 0);
  return shot;
}

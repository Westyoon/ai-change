import { aabbCenter, moveAabbToward } from "./collision.js";

const GLYPH_WIDTH = 26;
const GLYPH_HEIGHT = 30;
const FULL_TURN = Math.PI * 2;
const GLYPH_WAVE_PHASE_STEP = 0.62;

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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function segmentGraphemes(value) {
  const text = String(value ?? "");
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment, index }) => ({ text: segment, index }));
  }
  let index = 0;
  return Array.from(text, (grapheme) => {
    const part = { text: grapheme, index };
    index += grapheme.length;
    return part;
  });
}

function visibleGraphemes(value) {
  return segmentGraphemes(value).filter(({ text }) => text.trim().length > 0);
}

function unionBounds(items, fallback) {
  if (!items.length) return { ...fallback };
  const left = Math.min(...items.map(({ x }) => x));
  const top = Math.min(...items.map(({ y }) => y));
  const right = Math.max(...items.map(({ x, width }) => x + width));
  const bottom = Math.max(...items.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function trackedLetterSpacing({ phrase, segments, contentX, slotWidth, glyphWidth, requested }) {
  if (segments.length <= 1 || requested <= 0) return 0;
  const firstX = contentX + (slotWidth - glyphWidth) / 2;
  const lastRight = contentX + (segments.length - 1) * slotWidth
    + (slotWidth - glyphWidth) / 2
    + glyphWidth;
  const edgeRoom = Math.max(0, Math.min(
    firstX - phrase.x,
    phrase.x + phrase.width - lastRight,
  ));
  return Math.min(requested, edgeRoom * 2 / (segments.length - 1));
}

function refreshTargetBounds(phrase) {
  const targets = (phrase.glyphs ?? []).filter(({ isTarget }) => isTarget);
  phrase.targetBounds = unionBounds(targets, phrase.targetBounds ?? {
    x: phrase.x,
    y: phrase.y,
    width: phrase.width,
    height: phrase.height,
  });
}

function applyPhraseWave(phrase) {
  const motion = phrase.motion;
  if (!motion) return phrase;
  const phase = motion.initialPhase
    + (motion.fallDistance / motion.wavelength) * FULL_TURN;
  const swayX = Math.sin(phase) * motion.amplitudeX;
  for (const glyph of phrase.glyphs ?? []) {
    glyph.x = phrase.x + glyph.anchorX + swayX;
    glyph.y = phrase.y + glyph.anchorY
      + Math.sin(phase + glyph.waveIndex * GLYPH_WAVE_PHASE_STEP) * motion.amplitudeY;
  }
  refreshTargetBounds(phrase);
  return phrase;
}

function createPhraseGlyphs(phrase, definition, phraseConfig, shotDamage) {
  const segments = segmentGraphemes(definition.negative);
  const targetStart = definition.negative.indexOf(definition.target);
  const targetEnd = targetStart + definition.target.length;
  const contentX = phrase.x + phraseConfig.horizontalPadding;
  const contentWidth = Math.max(1, phrase.width - phraseConfig.horizontalPadding * 2);
  const slotWidth = contentWidth / Math.max(1, segments.length);
  const glyphWidth = Math.max(5, slotWidth * 0.88);
  const letterSpacing = trackedLetterSpacing({
    phrase,
    segments,
    contentX,
    slotWidth,
    glyphWidth,
    requested: nonNegative(phraseConfig.letterSpacing),
  });
  const glyphHeight = Math.min(phrase.height, phraseConfig.targetHeight);
  const glyphY = phrase.y + (phrase.height - glyphHeight) / 2;
  const glyphs = segments.map((segment, index) => {
    const collidable = segment.text.trim().length > 0;
    const isTarget = collidable && segment.index >= targetStart && segment.index < targetEnd;
    const trackingOffset = (index - (segments.length - 1) / 2) * letterSpacing;
    const x = contentX + index * slotWidth + (slotWidth - glyphWidth) / 2 + trackingOffset;
    return {
      id: `${phrase.id}-glyph-${index + 1}`,
      text: segment.text,
      x,
      y: glyphY,
      width: glyphWidth,
      height: glyphHeight,
      anchorX: x - phrase.x,
      anchorY: glyphY - phrase.y,
      waveIndex: index,
      collidable,
      isTarget,
      broken: false,
      hp: 0,
      maxHp: 0,
    };
  });
  const targets = glyphs.filter(({ isTarget }) => isTarget);
  const requestedHits = Math.max(
    targets.length,
    Number.isFinite(definition.targetHits)
      ? Math.trunc(definition.targetHits)
      : Math.ceil(definition.maxHp / shotDamage),
  );
  const baseHits = targets.length ? Math.floor(requestedHits / targets.length) : 0;
  let extraHits = targets.length ? requestedHits % targets.length : 0;
  for (const glyph of targets) {
    const hits = baseHits + (extraHits > 0 ? 1 : 0);
    extraHits = Math.max(0, extraHits - 1);
    glyph.maxHp = Math.max(1, hits) * shotDamage;
    glyph.hp = glyph.maxHp;
  }
  return glyphs;
}

function attachPhraseGlyphs(phrase, definition, phraseConfig, shotDamage) {
  phrase.glyphs = createPhraseGlyphs(phrase, definition, phraseConfig, shotDamage);
  const targets = phrase.glyphs.filter(({ isTarget }) => isTarget);
  phrase.targetBounds = unionBounds(targets, {
    x: phrase.x + phraseConfig.horizontalPadding,
    y: phrase.y + (phrase.height - phraseConfig.targetHeight) / 2,
    width: Math.max(1, phrase.width - phraseConfig.horizontalPadding * 2),
    height: phraseConfig.targetHeight,
  });
  phrase.maxHp = targets.reduce((total, glyph) => total + glyph.maxHp, 0) || definition.maxHp;
  phrase.hp = phrase.maxHp;
  return phrase;
}

export function chooseRoundPhrase(round, random) {
  const index = Math.floor(sample(random) * round.phrases.length);
  return round.phrases[index];
}

export function createWordBreakerPhrase({
  definition,
  arena,
  phraseConfig,
  shotDamage = 20,
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
  attachPhraseGlyphs(phrase, definition, phraseConfig, shotDamage);
  const edgeRoom = Math.max(0, Math.min(
    phrase.x - arena.x,
    arena.x + arena.width - phrase.x - phrase.width,
  ));
  phrase.motion = {
    fallDistance: 0,
    initialPhase: ((roundIndex + 1) * 0.83 + sequence * 2.399) % FULL_TURN,
    amplitudeX: Math.min(nonNegative(phraseConfig.wobbleAmplitudeX), edgeRoom),
    amplitudeY: Math.min(
      nonNegative(phraseConfig.wobbleAmplitudeY),
      Math.max(0, (phrase.height - (phrase.glyphs[0]?.height ?? phrase.height)) / 2),
    ),
    wavelength: Math.max(1, Number.isFinite(phraseConfig.wobbleWavelength)
      ? phraseConfig.wobbleWavelength
      : 1),
  };
  return applyPhraseWave(phrase);
}

// Compatibility helper for callers/tests that need a single impact phrase.
// The live encounter now builds a moving overload field instead.
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
    y: clamp(centeredY, arena.y, arena.y + arena.height - height),
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
  attachPhraseGlyphs(phrase, definition, phraseConfig, 20);
  phrase.hp = 0;
  for (const glyph of phrase.glyphs) {
    if (glyph.isTarget) {
      glyph.hp = 0;
      glyph.broken = true;
    }
  }
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
  attachPhraseGlyphs(phrase, definition, phraseConfig, 1);
  phrase.maxHp = definition.maxHp;
  phrase.hp = definition.maxHp;
  return phrase;
}

export function movePhraseDown(phrase, distance) {
  const traveled = Math.max(0, Number.isFinite(distance) ? distance : 0);
  phrase.y += traveled;
  if (phrase.motion) {
    phrase.motion.fallDistance += traveled;
    applyPhraseWave(phrase);
  } else {
    phrase.targetBounds.y += traveled;
    for (const glyph of phrase.glyphs ?? []) glyph.y += traveled;
  }
  return phrase;
}

export function moveShotUp(shot, distance) {
  shot.y -= Math.max(0, Number.isFinite(distance) ? distance : 0);
  return shot;
}

function overloadGlyph({
  id,
  text,
  x,
  y,
  pattern,
  waveIndex,
  color,
  vx = 0,
  vy = 0,
  delayMs = 0,
  surge = false,
  width = GLYPH_WIDTH,
  height = GLYPH_HEIGHT,
  variant = "default",
  stage = 0,
  badge = "",
  targetX = null,
  targetY = null,
  spin = 0,
}) {
  return {
    id,
    text,
    x,
    y,
    width,
    height,
    pattern,
    waveIndex,
    color,
    vx,
    vy,
    delayRemainingMs: delayMs,
    surge,
    variant,
    stage,
    badge,
    targetX,
    targetY,
    spin,
    contacted: false,
  };
}

function glyphText(round, waveIndex, glyphIndex) {
  const source = visibleGraphemes(round.phrases[waveIndex % round.phrases.length].negative);
  return source[(waveIndex * 3 + glyphIndex) % Math.max(1, source.length)]?.text ?? "말";
}

function laneCenter(arena, lane, laneCount, width = GLYPH_WIDTH) {
  const laneWidth = arena.width / laneCount;
  return arena.x + laneWidth * (lane + 0.5) - width / 2;
}

function verticalLaneCenter(arena, lane, laneCount, height = GLYPH_HEIGHT) {
  const laneHeight = arena.height / laneCount;
  return arena.y + laneHeight * (lane + 0.5) - height / 2;
}

function ringPoint(center, radius, angle, width = GLYPH_WIDTH, height = GLYPH_HEIGHT) {
  return {
    x: center.x + Math.cos(angle) * radius - width / 2,
    y: center.y + Math.sin(angle) * radius - height / 2,
  };
}

function movementClearance(arena, playerBounds, angle) {
  const center = aabbCenter(playerBounds);
  const minX = arena.x + playerBounds.width / 2;
  const maxX = arena.x + arena.width - playerBounds.width / 2;
  const minY = arena.y + playerBounds.height / 2;
  const maxY = arena.y + arena.height - playerBounds.height / 2;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const clearanceX = Math.abs(directionX) <= Number.EPSILON
    ? Number.POSITIVE_INFINITY
    : directionX > 0
      ? (maxX - center.x) / directionX
      : (minX - center.x) / directionX;
  const clearanceY = Math.abs(directionY) <= Number.EPSILON
    ? Number.POSITIVE_INFINITY
    : directionY > 0
      ? (maxY - center.y) / directionY
      : (minY - center.y) / directionY;
  return Math.max(0, Math.min(clearanceX, clearanceY));
}

function chooseFirewallGapSlot({ arena, playerBounds, radius, slots, roundIndex, waveIndex }) {
  const candidates = Array.from({ length: slots }, (_, slot) => {
    const angle = -Math.PI / 2 + (slot / slots) * FULL_TURN;
    return { slot, clearance: movementClearance(arena, playerBounds, angle) };
  });
  const maximumClearance = Math.max(...candidates.map(({ clearance }) => clearance));
  const minimumPlayableClearance = Math.min(maximumClearance, radius * 0.9);
  const playable = candidates.filter(({ clearance }) => clearance >= minimumPlayableClearance);
  return playable[(waveIndex + roundIndex) % playable.length].slot;
}

function makeLaneRain({ round, arena, gimmick, roundIndex, waveIndex }) {
  const count = Math.min(gimmick.maxGlyphs, 4 + Math.floor(waveIndex / 2));
  return Array.from({ length: count }, (_, index) => {
    const side = (waveIndex + index) % 4;
    const lane = (waveIndex + index * 2) % gimmick.laneCount;
    const isOutlier = waveIndex >= 2
      && waveIndex % 3 === 2
      && index === waveIndex % count;
    const isMissingValue = !isOutlier && (waveIndex + index) % 4 === 0;
    const speed = gimmick.glyphSpeed * (isOutlier ? 1.3 : 0.94 + index * 0.025);
    const drift = isOutlier ? (waveIndex % 2 === 0 ? -64 : 64) : 0;
    let x;
    let y;
    let vx;
    let vy;
    if (side === 0) {
      x = laneCenter(arena, lane, gimmick.laneCount);
      y = arena.y - GLYPH_HEIGHT;
      vx = drift;
      vy = speed;
    } else if (side === 1) {
      x = arena.x + arena.width;
      y = verticalLaneCenter(arena, lane, gimmick.laneCount);
      vx = -speed;
      vy = drift;
    } else if (side === 2) {
      x = laneCenter(arena, lane, gimmick.laneCount);
      y = arena.y + arena.height;
      vx = drift;
      vy = -speed;
    } else {
      x = arena.x - GLYPH_WIDTH;
      y = verticalLaneCenter(arena, lane, gimmick.laneCount);
      vx = speed;
      vy = drift;
    }
    return overloadGlyph({
      id: `overload-${roundIndex + 1}-${waveIndex + 1}-${index + 1}`,
      text: glyphText(round, waveIndex, index),
      x,
      y,
      pattern: gimmick.type,
      waveIndex,
      color: round.guardian.color,
      vx,
      vy,
      variant: isOutlier ? "outlier" : isMissingValue ? "missing-value" : "sample",
      stage: Math.min(3, Math.floor(waveIndex / 2)),
      badge: isOutlier ? "OUT" : isMissingValue ? "NULL" : "",
    });
  });
}

function makeFirewall({ round, arena, playerBounds, gimmick, roundIndex, waveIndex }) {
  const playerCenter = aabbCenter(playerBounds);
  const slots = Math.max(12, gimmick.laneCount * 2);
  const radius = Math.min(arena.width * 0.38, arena.height * 0.215);
  const gapSlot = chooseFirewallGapSlot({
    arena,
    playerBounds,
    radius,
    slots,
    roundIndex,
    waveIndex,
  });
  const openSlots = new Set([
    (gapSlot - 1 + slots) % slots,
    gapSlot,
    (gapSlot + 1) % slots,
  ]);
  const packetKinds = ["trojan", "worm", "spyware"];
  const glyphs = [];
  for (let slot = 0; slot < slots; slot += 1) {
    if (openSlots.has(slot)) continue;
    const angle = -Math.PI / 2 + (slot / slots) * FULL_TURN;
    const position = ringPoint(playerCenter, radius, angle);
    const glyphCenter = {
      x: position.x + GLYPH_WIDTH / 2,
      y: position.y + GLYPH_HEIGHT / 2,
    };
    const toCenterX = playerCenter.x - glyphCenter.x;
    const toCenterY = playerCenter.y - glyphCenter.y;
    const toCenterLength = Math.max(1, Math.hypot(toCenterX, toCenterY));
    glyphs.push(overloadGlyph({
      id: `overload-${roundIndex + 1}-${waveIndex + 1}-${slot + 1}`,
      text: glyphText(round, waveIndex, slot),
      x: position.x,
      y: position.y,
      pattern: gimmick.type,
      waveIndex,
      color: round.guardian.color,
      vx: (toCenterX / toCenterLength) * gimmick.glyphSpeed,
      vy: (toCenterY / toCenterLength) * gimmick.glyphSpeed,
      delayMs: 420,
      variant: packetKinds[waveIndex % packetKinds.length],
      stage: Math.min(2, Math.floor(waveIndex / 3)),
      badge: slot === (gapSlot + 2) % slots ? "PORT" : "",
      targetX: playerCenter.x,
      targetY: playerCenter.y,
    }));
  }
  return glyphs;
}

function makeClosedFirewallSurge({
  round,
  arena,
  playerBounds,
  gimmick,
  roundIndex,
  surgeIndex,
  delayMs,
  travelMs,
}) {
  const center = playerBounds
    ? aabbCenter(playerBounds)
    : { x: arena.x + arena.width / 2, y: arena.y + arena.height * 0.9 };
  const radius = Math.min(arena.width * 0.26, arena.height * 0.145);
  const idealCount = Math.ceil((FULL_TURN * radius) / (GLYPH_WIDTH * 0.9));
  const count = Math.max(1, Math.min(Math.max(12, idealCount), gimmick.maxGlyphs));
  const speedForClosure = (radius + GLYPH_HEIGHT)
    / (Math.max(1, travelMs) / 1000);
  const speed = Math.max(gimmick.glyphSpeed, speedForClosure);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * FULL_TURN;
    const position = ringPoint(center, radius, angle);
    return overloadGlyph({
      id: `overload-${roundIndex + 1}-surge-${surgeIndex + 1}-${index + 1}`,
      text: glyphText(round, surgeIndex + gimmick.laneCount, index),
      x: position.x,
      y: position.y,
      pattern: gimmick.type,
      waveIndex: surgeIndex,
      color: round.guardian.color,
      vy: speed,
      delayMs,
      surge: true,
      variant: "ransomware",
      stage: 4,
      badge: index === 0 ? "LOCK" : "",
      targetX: null,
      targetY: null,
    });
  });
}

function makeRecursiveFork({ round, arena, gimmick, roundIndex, waveIndex }) {
  const depth = waveIndex % 4;
  const branchCount = Math.min(gimmick.laneCount, 2 ** depth);
  return Array.from({ length: branchCount }, (_, index) => overloadGlyph({
    id: `overload-${roundIndex + 1}-${waveIndex + 1}-${index + 1}`,
    text: glyphText(round, waveIndex, index),
    x: laneCenter(arena, index, branchCount),
    y: arena.y - GLYPH_HEIGHT - depth * 8,
    pattern: gimmick.type,
    waveIndex,
    color: round.guardian.color,
    vx: (index - (branchCount - 1) / 2) * (10 + depth * 2),
    vy: gimmick.glyphSpeed + depth * 45,
    delayMs: index * 35,
    variant: depth === 3 ? "stack-overflow" : depth === 0 ? "function-call" : "stack-frame",
    stage: depth,
    badge: index === 0 ? (depth === 3 ? "STACK" : depth === 0 ? "CALL" : "") : "",
  }));
}

function makePredictionLock({ round, arena, playerBounds, gimmick, roundIndex, waveIndex }) {
  const playerCenter = aabbCenter(playerBounds);
  const stage = waveIndex % 4;
  const spread = [76, 54, 34, 18][stage];
  const bias = [40, -26, 12, 0][stage];
  const confidence = [52, 68, 84, 99][stage];
  const hypotheses = [-2, -1, 0, 1, 2];
  return hypotheses.map((hypothesis, index) => overloadGlyph({
    id: `overload-${roundIndex + 1}-${waveIndex + 1}-${index + 1}`,
    text: glyphText(round, waveIndex, index),
    x: clamp(
      playerCenter.x + bias + hypothesis * spread - GLYPH_WIDTH / 2,
      arena.x,
      arena.x + arena.width - GLYPH_WIDTH,
    ),
    y: arena.y + 8,
    pattern: gimmick.type,
    waveIndex,
    color: round.guardian.color,
    vy: gimmick.glyphSpeed,
    delayMs: 280 + Math.abs(hypothesis) * 70 + (3 - stage) * 30,
    variant: stage === 3 && hypothesis === 0 ? "confidence-lock" : "hypothesis",
    stage,
    badge: hypothesis === 0 ? `${confidence}%` : "",
  }));
}

function makeConvergenceRing({ round, arena, playerBounds, gimmick, roundIndex, waveIndex }) {
  const stage = waveIndex % 3;
  const playerCenter = aabbCenter(playerBounds);
  const hub = {
    x: arena.x + arena.width / 2,
    y: arena.y + arena.height * 0.34,
  };
  const counts = [5, 3, 8];
  const count = counts[stage];
  return Array.from({ length: count }, (_, index) => {
    let x;
    let y;
    let targetX = playerCenter.x;
    let targetY = playerCenter.y;
    let color = "#2ab5e4";
    let variant = "model-output";
    let spin = 0;

    if (stage === 0) {
      x = laneCenter(arena, index, count);
      y = arena.y - GLYPH_HEIGHT;
      targetX = hub.x;
      targetY = hub.y;
      color = "#d82f76";
      variant = "data-input";
    } else if (stage === 1) {
      x = clamp(hub.x + (index - 1) * 70 - GLYPH_WIDTH / 2, arena.x, arena.x + arena.width - GLYPH_WIDTH);
      y = hub.y - GLYPH_HEIGHT / 2;
    } else {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      x = side < 0 ? arena.x - GLYPH_WIDTH : arena.x + arena.width;
      y = arena.y + arena.height * (0.18 + row * 0.12);
      color = "#fac804";
      variant = "feedback-loop";
      spin = side;
    }

    return overloadGlyph({
      id: `overload-${roundIndex + 1}-${waveIndex + 1}-${index + 1}`,
      text: glyphText(round, waveIndex, index),
      x,
      y,
      pattern: gimmick.type,
      waveIndex,
      color,
      vy: gimmick.glyphSpeed,
      delayMs: index * 45,
      variant,
      stage,
      badge: index === 0 ? (stage === 0 ? "DATA" : stage === 1 ? "MODEL" : "LOOP") : "",
      targetX,
      targetY,
      spin,
    });
  });
}

const OVERLOAD_FACTORIES = Object.freeze({
  "lane-rain": makeLaneRain,
  "firewall-gates": makeFirewall,
  "recursive-fork": makeRecursiveFork,
  "prediction-lock": makePredictionLock,
  "convergence-ring": makeConvergenceRing,
});

export function createWordBreakerOverloadWave(options) {
  const factory = OVERLOAD_FACTORIES[options?.gimmick?.type];
  if (!factory) throw new RangeError(`Unsupported Word Breaker gimmick: ${options?.gimmick?.type}.`);
  return factory(options);
}

export function createWordBreakerOverloadSurge({
  round,
  arena,
  playerBounds = null,
  gimmick,
  roundIndex,
  surgeIndex,
  delayMs = 600,
  travelMs = 2_400,
}) {
  if (gimmick.type === "firewall-gates") {
    return makeClosedFirewallSurge({
      round,
      arena,
      playerBounds,
      gimmick,
      roundIndex,
      surgeIndex,
      delayMs,
      travelMs,
    });
  }
  const idealCount = Math.max(1, Math.ceil(arena.width / GLYPH_WIDTH));
  const count = Math.max(1, Math.min(idealCount, gimmick.maxGlyphs));
  const cellWidth = arena.width / count;
  const glyphWidth = cellWidth + Math.max(1, Math.min(2, cellWidth * 0.08));
  const speedForFullPass = (arena.height + GLYPH_HEIGHT * 2)
    / (Math.max(1, travelMs) / 1000);
  const speed = Math.max(gimmick.glyphSpeed, speedForFullPass);

  return Array.from({ length: count }, (_, index) => overloadGlyph({
    id: `overload-${roundIndex + 1}-surge-${surgeIndex + 1}-${index + 1}`,
    text: glyphText(round, surgeIndex + gimmick.laneCount, index),
    x: arena.x + cellWidth * index - (glyphWidth - cellWidth) / 2,
    y: arena.y + 2,
    width: glyphWidth,
    height: GLYPH_HEIGHT,
    pattern: gimmick.type,
    waveIndex: surgeIndex,
    color: round.guardian.color,
    vy: speed,
    delayMs,
    surge: true,
    variant: "surge",
    stage: 4,
  }));
}

export function moveWordBreakerOverloadGlyph(glyph, stepMs, playerBounds) {
  let activeMs = Math.max(0, Number.isFinite(stepMs) ? stepMs : 0);
  if (glyph.delayRemainingMs > 0) {
    const waitingMs = Math.min(activeMs, glyph.delayRemainingMs);
    glyph.delayRemainingMs -= waitingMs;
    activeMs -= waitingMs;
  }
  if (activeMs <= 0) return glyph;
  if (glyph.pattern === "convergence-ring" || glyph.pattern === "firewall-gates") {
    const targetCenter = {
      x: Number.isFinite(glyph.targetX) ? glyph.targetX : aabbCenter(playerBounds).x,
      y: Number.isFinite(glyph.targetY) ? glyph.targetY : aabbCenter(playerBounds).y,
    };
    const target = {
      x: targetCenter.x - glyph.width / 2,
      y: targetCenter.y - glyph.height / 2,
      width: glyph.width,
      height: glyph.height,
    };
    const speed = glyph.pattern === "firewall-gates" && !glyph.surge
      ? Math.hypot(glyph.vx, glyph.vy)
      : glyph.vy;
    const distance = speed * (activeMs / 1000);
    const distanceBeforeMove = Math.hypot(glyph.x - target.x, glyph.y - target.y);
    const moved = moveAabbToward(glyph, target, distance);
    glyph.x = moved.x;
    glyph.y = moved.y;
    if (
      glyph.pattern === "firewall-gates"
      && !glyph.surge
      && distanceBeforeMove <= distance + Number.EPSILON
    ) {
      glyph.expired = true;
    }
    if (glyph.spin) {
      const center = aabbCenter(glyph);
      const dx = targetCenter.x - center.x;
      const dy = targetCenter.y - center.y;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        const tangentDistance = distance * 0.28 * glyph.spin;
        glyph.x += (-dy / length) * tangentDistance;
        glyph.y += (dx / length) * tangentDistance;
      }
    }
    return glyph;
  }
  glyph.x += glyph.vx * (activeMs / 1000);
  glyph.y += glyph.vy * (activeMs / 1000);
  return glyph;
}

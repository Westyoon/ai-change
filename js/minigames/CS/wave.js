export const THREAT_TYPES = Object.freeze(["TROJAN", "WORM", "RANSOM", "SPYWARE"]);

const DEFAULT_LEARNING_ORDER = THREAT_TYPES;
const DEFAULT_MIXED_TYPES = Object.freeze(["TROJAN", "WORM", "SPYWARE"]);

function finiteAtLeast(value, minimum, fallback) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function integerBetween(value, minimum, maximum, fallback) {
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999999, Math.max(0, value));
}

export function lerp(start, end, progress) {
  const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  return start + (end - start) * safeProgress;
}

export function shuffleCopy(values, random = Math.random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit(random) * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

/**
 * Builds the mixed section without mutating the caller's config or arrays.
 * Supplying `random` makes the plan deterministic for tests and replays.
 */
export function buildMixedTypeSequence(count, config = {}, { random = Math.random } = {}) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount === 0) return Object.freeze([]);

  const minimumRansom = integerBetween(config.ransomMinCount, 0, safeCount, 2);
  const maximumRansom = integerBetween(
    config.ransomMaxCount,
    minimumRansom,
    safeCount,
    Math.max(minimumRansom, 3),
  );
  const ransomCount = minimumRansom + Math.floor(
    randomUnit(random) * (maximumRansom - minimumRansom + 1),
  );

  const otherTypes = Array.isArray(config.mixedTypes) && config.mixedTypes.length > 0
    ? config.mixedTypes
        .map((type) => String(type).toUpperCase())
        .filter((type) => THREAT_TYPES.includes(type) && type !== "RANSOM")
    : DEFAULT_MIXED_TYPES;
  const usableTypes = otherTypes.length > 0 ? otherTypes : DEFAULT_MIXED_TYPES;
  const sequence = Array.from(
    { length: safeCount },
    (_, index) => usableTypes[index % usableTypes.length],
  );
  const shuffled = shuffleCopy(sequence, random);

  // Ransomware is deliberately introduced in the latter half. Unique slots
  // guarantee the configured count instead of occasionally overwriting one.
  const lateStart = Math.floor(safeCount / 2);
  const lateSlots = Array.from({ length: safeCount - lateStart }, (_, index) => lateStart + index);
  const earlySlots = Array.from({ length: lateStart }, (_, index) => index);
  const candidateSlots = [
    ...shuffleCopy(lateSlots, random),
    ...shuffleCopy(earlySlots, random),
  ];
  for (const index of candidateSlots.slice(0, ransomCount)) {
    shuffled[index] = "RANSOM";
  }

  return Object.freeze(shuffled);
}

/**
 * Produces the complete 22-wave MVP timeline. The first section teaches one
 * malware type at a time; the mixed section accelerates toward the finale.
 */
export function buildWavePlan(config = {}, { random = Math.random } = {}) {
  const totalWaves = Math.max(1, Math.floor(Number(config.totalWaves) || 22));
  const configuredOrder = Array.isArray(config.learningOrder)
    ? config.learningOrder
        .map((type) => String(type).toUpperCase())
        .filter((type) => THREAT_TYPES.includes(type))
    : [];
  const learningOrder = configuredOrder.length > 0 ? configuredOrder : DEFAULT_LEARNING_ORDER;
  const learningWaveCount = integerBetween(
    config.learningWaveCount,
    0,
    totalWaves,
    Math.min(learningOrder.length, totalWaves),
  );
  const learningIntervalMs = finiteAtLeast(config.learningIntervalMs, 0, 2_600);
  const learningApproachDurationMs = finiteAtLeast(
    config.learningApproachDurationMs,
    0,
    1_800,
  );
  const approachDurationMs = finiteAtLeast(config.approachDurationMs, 0, 1_400);
  const mixedIntervalStartMs = finiteAtLeast(config.mixedIntervalStartMs, 0, 1_300);
  const mixedIntervalEndMs = finiteAtLeast(config.mixedIntervalEndMs, 0, 750);
  const plan = [];
  let cursor = 0;

  for (let index = 0; index < learningWaveCount; index += 1) {
    plan.push(Object.freeze({
      type: learningOrder[index % learningOrder.length],
      spawnAtMs: Math.round(cursor),
      approachDurationMs: learningApproachDurationMs,
      section: "LEARNING",
    }));
    cursor += learningIntervalMs;
  }

  const mixedCount = totalWaves - learningWaveCount;
  const mixedTypes = buildMixedTypeSequence(mixedCount, config, { random });
  for (let index = 0; index < mixedCount; index += 1) {
    plan.push(Object.freeze({
      type: mixedTypes[index],
      spawnAtMs: Math.round(cursor),
      approachDurationMs,
      section: "MIXED",
    }));
    const progress = mixedCount <= 1 ? 1 : index / (mixedCount - 1);
    cursor += lerp(mixedIntervalStartMs, mixedIntervalEndMs, progress);
  }

  return Object.freeze(plan);
}

export function estimateWavePlanEndMs(plan, goodWindowMs = 0) {
  if (!Array.isArray(plan) || plan.length === 0) return 0;
  return plan.reduce(
    (latest, wave) => Math.max(
      latest,
      (Number(wave.spawnAtMs) || 0) +
        (Number(wave.approachDurationMs) || 0) +
        Math.max(0, Number(goodWindowMs) || 0),
    ),
    0,
  );
}

export default buildWavePlan;

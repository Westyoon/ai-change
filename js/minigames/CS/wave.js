export const THREAT_TYPES = Object.freeze(["TROJAN", "WORM", "RANSOM", "SPYWARE"]);

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
 * RANSOM is deliberately excluded here — it no longer spawns as part of the
 * regular wave rotation. See buildRansomAmbushSchedule() below.
 */
export function buildMixedTypeSequence(count, config = {}, { random = Math.random } = {}) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount === 0) return Object.freeze([]);

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

  return Object.freeze(shuffleCopy(sequence, random));
}

/**
 * Produces the wave timeline: no learning phase, TROJAN/WORM/SPYWARE mixed
 * together from wave 0, with the spawn interval tightening toward the end.
 */
export function buildWavePlan(config = {}, { random = Math.random } = {}) {
  const totalWaves = Math.max(1, Math.floor(Number(config.totalWaves) || 22));
  const approachDurationMs = finiteAtLeast(config.approachDurationMs, 0, 1_400);
  const mixedIntervalStartMs = finiteAtLeast(config.mixedIntervalStartMs, 0, 1_100);
  const mixedIntervalEndMs = finiteAtLeast(config.mixedIntervalEndMs, 0, 650);
  // 셔플이 순전히 무작위라 웜이 연달아 여러 번 뽑히는 경우를 막지 않았어요 — 그러면 간격이
  // 좁아지는 후반부에선 웜 여러 마리가 거의 동시에 등장해서(각자 바로 분열까지 하니 실제로는
  // 그 두 배 숫자가) 한꺼번에 몰려나오는 문제가 있었습니다. 이전 웜이 코어까지 다 접근하기 전엔
  // 다음 웜이 못 나오도록, 웜 등장 시각 사이에 최소 간격(기본값 = 접근 시간 전체)을 강제해요.
  const wormMinGapMs = finiteAtLeast(config.wormMinGapMs, 0, approachDurationMs);
  const types = buildMixedTypeSequence(totalWaves, config, { random });
  const plan = [];
  let cursor = 0;
  let lastWormSpawnAtMs = -Infinity;

  for (let index = 0; index < totalWaves; index += 1) {
    let spawnAtMs = Math.round(cursor);
    if (types[index] === "WORM" && spawnAtMs - lastWormSpawnAtMs < wormMinGapMs) {
      spawnAtMs = Math.round(lastWormSpawnAtMs + wormMinGapMs);
    }
    plan.push(Object.freeze({
      type: types[index],
      spawnAtMs,
      approachDurationMs,
      section: "MIXED",
    }));
    if (types[index] === "WORM") lastWormSpawnAtMs = spawnAtMs;
    const progress = totalWaves <= 1 ? 1 : index / (totalWaves - 1);
    // 다음 웨이브의 기준 시각도 (밀렸을 수 있는) 실제 spawnAtMs부터 이어가요 — 안 그러면 웜을
    // 미룬 만큼 바로 뒤 웨이브와 다시 겹쳐버려요.
    cursor = spawnAtMs + lerp(mixedIntervalStartMs, mixedIntervalEndMs, progress);
  }

  return Object.freeze(plan);
}

/**
 * RANSOM no longer takes a normal wave slot. Instead it ambushes the core
 * `ransomAmbushCount` times at random points between 15%~90% of the run,
 * spaced into roughly equal slots so two ambushes can't land on top of
 * each other.
 */
export function buildRansomAmbushSchedule(config = {}, totalDurationMs = 0, { random = Math.random } = {}) {
  const count = integerBetween(config.ransomAmbushCount, 0, 999, 3);
  const safeDurationMs = finiteAtLeast(totalDurationMs, 0, 0);
  if (count === 0 || safeDurationMs <= 0) return Object.freeze([]);

  const earliestMs = safeDurationMs * 0.15;
  const latestMs = safeDurationMs * 0.9;
  const slotMs = Math.max(1, (latestMs - earliestMs) / count);
  // 코어가 잠긴 채로 다음 랜섬이 바로 또 들이닥치지 않도록, 등장 사이에 최소 간격을 둬요
  // (연타로 해제하는 데 걸리는 시간 + 다음 랜섬이 접근하는 시간을 감안한 여유예요).
  const minGapMs = finiteAtLeast(config.ransomMinGapMs, 0, 3_500);

  const schedule = [];
  for (let index = 0; index < count; index += 1) {
    const slotStart = earliestMs + slotMs * index;
    let candidate = Math.round(slotStart + randomUnit(random) * slotMs);
    if (schedule.length > 0) {
      candidate = Math.max(candidate, schedule[schedule.length - 1] + minGapMs);
    }
    schedule.push(candidate);
  }
  return Object.freeze(schedule);
}

/**
 * 랜섬 기습이 등장한 뒤엔(buildRansomAmbushSchedule) 일반 웨이브 계획(buildWavePlan)과
 * 따로 놀던 두 스케줄을 여기서 맞춰봐요. "같이 등장하는 건 괜찮지만, 코어에 닿는(targetAt)
 * 순간이 랜섬의 도착 순간과 겹치면(=둘 다 그 찰나에 판정을 받아야 하는데 클릭은 한 번에
 * 하나씩만 가능하니 하나는 놓칠 수밖에 없음) 그건 막아야 한다"는 요청을 반영한 거예요.
 * 등장(spawnAtMs) 시점이 아니라 도착(targetAt) 시점 기준으로 겹치는지 보고, 겹치면 그
 * 웨이브만 랜섬 도착 시점 이후로 최소 `ransomArrivalGapMs`만큼 뒤로 밀어요(항상 뒤로만
 * 밀어서 순서가 꼬이지 않게 해요 — 이미 확보돼 있던 웜 간 최소 간격 등도 그대로 유지됨).
 */
export function avoidRansomArrivalCollisions(wavePlan, ransomSchedule, config = {}) {
  if (!Array.isArray(wavePlan) || wavePlan.length === 0) return Object.freeze([]);
  if (!Array.isArray(ransomSchedule) || ransomSchedule.length === 0) {
    return Object.freeze(wavePlan.map((wave) => Object.freeze({ ...wave })));
  }

  const gapMs = finiteAtLeast(config.ransomArrivalGapMs, 0, 600);
  const ransomApproachMs = finiteAtLeast(config.ransomApproachDurationMs, 0, 900);
  const ransomTargetTimes = ransomSchedule.map((spawnAtMs) => spawnAtMs + ransomApproachMs);

  const adjusted = [];
  let floorSpawnAtMs = 0;
  // 버그 수정(1차): 처음엔 겹치는 웨이브를 전부 "랜섬 도착 시점 + gapMs"라는 같은 한 지점으로만
  // 밀어서, 서로 그 한 지점에 다시 몰리는 문제가 있었습니다.
  // 버그 수정(2차): "직전에 밀린 지점과도 gapMs 이상 떨어뜨리기"를 추가했지만, 그 판단을 여전히
  // "이 웨이브의 도착 시점이 랜섬과 gapMs *미만*으로 가깝냐"로만 했어요 — 그런데 앞 웨이브가 밀려서
  // spawnAtMs 하한선(floorSpawnAtMs)이 확 올라가면, 뒤 웨이브의 도착 시점이 (하한선 때문에) 정확히
  // "랜섬 + gapMs" 지점에 딱 맞아떨어지는 경우가 생겨요 — 이건 랜섬과의 거리 조건(< gapMs)은
  // 통과해버리지만(정확히 gapMs만큼 떨어져 있으니 "가깝다"고 안 잡힘), 정작 앞서 밀린 웨이브랑은
  // 완전히 같은 지점이라 또 겹칩니다. 그래서 "랜섬과 가까운가"뿐 아니라 "지금 밀려난 구간(danger
  // zone) 안에 들어와 있는가"도 함께 봐서, 그 구간 안이면 무조건 한 칸 더 뒤로 미루도록 고쳤어요.
  let dangerZoneNextSafeTargetAt = -Infinity;
  for (const wave of wavePlan) {
    let spawnAtMs = Math.max(Number(wave.spawnAtMs) || 0, floorSpawnAtMs);
    const approachDurationMs = Number(wave.approachDurationMs) || 0;
    const naturalTargetAt = spawnAtMs + approachDurationMs;

    const collidingRansomTargetAt = ransomTargetTimes.reduce(
      (found, ransomTargetAt) => (Math.abs(naturalTargetAt - ransomTargetAt) < gapMs
        ? Math.max(found ?? -Infinity, ransomTargetAt)
        : found),
      null,
    );
    const needsPush = collidingRansomTargetAt !== null || naturalTargetAt < dangerZoneNextSafeTargetAt;

    let targetAt = naturalTargetAt;
    if (needsPush) {
      const afterRansom = collidingRansomTargetAt !== null ? collidingRansomTargetAt + gapMs : naturalTargetAt;
      targetAt = Math.max(afterRansom, dangerZoneNextSafeTargetAt);
      spawnAtMs = targetAt - approachDurationMs;
      dangerZoneNextSafeTargetAt = targetAt + gapMs;
    }

    spawnAtMs = Math.round(Math.max(spawnAtMs, floorSpawnAtMs));
    adjusted.push(Object.freeze({ ...wave, spawnAtMs }));
    floorSpawnAtMs = spawnAtMs;
  }
  return Object.freeze(adjusted);
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

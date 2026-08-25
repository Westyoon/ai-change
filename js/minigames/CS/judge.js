import { isClickable } from "./malware.js";

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function judgeTiming(now, targetAt, config = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(targetAt)) return "MISS";

  // `perfectwindowMs` remains a compatibility alias for the feature branch.
  const perfectWindowMs = nonNegativeNumber(
    config.perfectWindowMs ?? config.perfectwindowMs,
    200,
  );
  const goodWindowMs = Math.max(
    perfectWindowMs,
    nonNegativeNumber(config.goodWindowMs, 500),
  );
  const errorMs = Math.abs(now - targetAt);

  if (errorMs <= perfectWindowMs) return "PERFECT";
  if (errorMs <= goodWindowMs) return "GOOD";
  return "MISS";
}

export function calculatePurification(perfectCount, goodCount, totalWaves) {
  const denominator = Number.isFinite(totalWaves) ? Math.floor(totalWaves) : 0;
  if (denominator <= 0) return 0;

  const safePerfectCount = nonNegativeNumber(perfectCount, 0);
  const safeGoodCount = nonNegativeNumber(goodCount, 0);
  const earned = safePerfectCount + safeGoodCount * 0.5;
  return Math.min(100, Math.max(0, Math.round((earned / denominator) * 100)));
}

export function pickTarget(threats, now) {
  if (!Array.isArray(threats) || !Number.isFinite(now)) return null;

  const candidates = threats.filter((threat) => !threat?.resolved && isClickable(threat));
  if (candidates.length === 0) return null;

  return candidates.reduce((closest, current) => {
    const closestDiff = Math.abs(closest.targetAt - now);
    const currentDiff = Math.abs(current.targetAt - now);
    return currentDiff < closestDiff ? current : closest;
  });
}

export function resolveTerminalState({
  missCount,
  allWavesSpawned,
  activeThreats,
  purification,
  config = {},
} = {}) {
  const missLimit = Number.isFinite(config.missLimit) ? Math.max(1, config.missLimit) : 3;
  if (Number(missCount) >= missLimit) {
    return { status: "FAIL", failureReason: "MISS_LIMIT", purification };
  }

  if (allWavesSpawned && Array.isArray(activeThreats) && activeThreats.length === 0) {
    return { status: "CLEAR", failureReason: null, purification };
  }

  return null;
}

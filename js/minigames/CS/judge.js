import { isClickable } from "./malware.js";

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function judgeTiming(now, targetAt, config = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(targetAt)) return "MISS";
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

export function calculatePurification(
  perfectCount,
  goodCount,
  totalWaves,
  goodScoreWeight = 0.7,
) {
  const denominator = Number.isFinite(totalWaves) ? Math.floor(totalWaves) : 0;
  if (denominator <= 0) return 0;
  const goodWeight = nonNegativeNumber(goodScoreWeight, 0.7);
  const earned = nonNegativeNumber(perfectCount, 0) + nonNegativeNumber(goodCount, 0) * goodWeight;
  return Math.min(100, Math.max(0, Math.round((earned / denominator) * 100)));
}

export function pickTarget(threats, now) {
  if (!Array.isArray(threats) || !Number.isFinite(now)) return null;
  const candidates = threats.filter(
    (threat) => !threat?.resolved && Number.isFinite(threat.targetAt) && isClickable(threat),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, current) =>
    Math.abs(current.targetAt - now) < Math.abs(closest.targetAt - now) ? current : closest,
  );
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
    // 미스 제한에 안 걸렸다고 무조건 클리어는 아니에요 — 정화도가 기준치를 넘어야 진짜 클리어예요.
    const clearThreshold = Number.isFinite(config.clearPurificationThreshold)
      ? Math.min(100, Math.max(0, config.clearPurificationThreshold))
      : 0;
    if (Number(purification) >= clearThreshold) {
      return { status: "CLEAR", failureReason: null, purification };
    }
    return { status: "FAIL", failureReason: "LOW_PURIFICATION", purification };
  }
  return null;
}

// difficulty.js
//
// v3 최종 명세서 3-3절(시간 기반 난이도, 페이즈 없음) + 3-5절(인원별 보스 체력 배율).
// 페이즈 개념 자체가 없기 때문에, "지금 몇 초 지났는지"만 보고 예고시간/등장패턴을 정한다.

/**
 * 시간 구간별 설정. untilSec는 "이 시간 미만이면 이 구간"이라는 뜻.
 * (예: 15 -> 0~15초 미만)
 */
const DIFFICULTY_TIERS = [
  { untilSec: 15, telegraphMs: 1500, patternIds: ["single-snipe"] },
  { untilSec: 40, telegraphMs: 1200, patternIds: ["single-snipe", "area-burst", "column-sweep"] },
  {
    untilSec: Infinity,
    telegraphMs: 800,
    patternIds: ["single-snipe", "area-burst", "column-sweep", "multi-lockon", "combo-strike"],
  },
];

const MIN_TELEGRAPH_MS = 500; // 40초 이후에도 예고 시간이 이 아래로는 안 줄어든다 (v3 3-3절 하한)

/**
 * 지금 경과 시간(초)에 맞는 예고 시간과 등장 가능 패턴 id 목록을 반환한다.
 * @param {number} elapsedSec - 보스전 시작 후 지난 시간(초)
 * @returns {{ telegraphMs: number, patternIds: string[] }}
 */
export function getDifficultyTier(elapsedSec) {
  const tier =
    DIFFICULTY_TIERS.find((t) => elapsedSec < t.untilSec) ??
    DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1];

  return {
    telegraphMs: Math.max(MIN_TELEGRAPH_MS, tier.telegraphMs),
    patternIds: tier.patternIds,
  };
}

/**
 * 인원수에 따른 보스 체력 배율. (v3 3-5절, 예시 수치 - 플레이테스트 후 조정 대상)
 */
const HP_MULTIPLIER_BY_PARTY_SIZE = {
  1: 1.0,
  2: 1.2,
  3: 1.4,
  4: 1.6,
  5: 1.8,
};

/**
 * @param {number} playerCount - 참여 인원 (1~5인 전제)
 * @returns {number} 보스 체력에 곱할 배율. 정의 안 된 인원수가 들어오면 1~5 범위로 보정한다.
 */
export function getBossHpMultiplier(playerCount) {
  const clamped = Math.min(5, Math.max(1, playerCount));
  return HP_MULTIPLIER_BY_PARTY_SIZE[clamped];
}

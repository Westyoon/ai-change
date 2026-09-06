// stats.js
//
// v3 최종 명세서 3-1절 "스탯 연동" 공식을 그대로 구현.
// 계수(damageCoefficient 등)는 v3 문서에도 "밸런싱 대상"이라고 명시되어 있어서
// 기본값만 넣어두고, 언제든 balance 객체를 바꿔 끼울 수 있게 인자로 받는다.
//
// [발견한 것 / 확인 필요]
// 사후게임_기획안.md 6.3절(전체 보스 공통 가설)에는 방어력이 "포인트당 피해 3% 감소"로
// 되어 있는데(퍼센트 감산), v3 스탯보스 명세서 3-1절에는 "보스 공격력 - 방어력"으로
// 되어 있음(고정값 감산). 서로 다른 방식이라, 스탯보스는 v3(더 최신·더 구체적인 문서)
// 기준인 고정값 감산으로 구현함. 다른 보스랑 방어력 체감이 다르게 느껴질 수 있어서
// 팀에 한 번 확인해보면 좋을 듯.

const DEFAULT_BALANCE = {
  damageCoefficient: 0.05, // 공격력 1당 데미지 5% 증가 (사후게임_기획안.md 6.3 가설 수치와 일치)
  baseDamage: 10, // 반격 1회의 기본 데미지 (예시, 밸런싱 대상)
  baseHp: 100, // 체력 스탯 0일 때 최대 HP (예시)
  hpPerPoint: 10, // 체력 포인트당 최대 HP 증가량 (사후게임_기획안.md 6.3과 일치)
};

/**
 * 플레이어가 보스에게 주는 데미지.
 * 데미지 = 기본값 × (1 + 공격력 × 계수)
 */
export function calcPlayerDamage(attackStat, balance = DEFAULT_BALANCE) {
  return balance.baseDamage * (1 + attackStat * balance.damageCoefficient);
}

/**
 * 보스 공격을 맞았을 때(회피 실패 시) 플레이어가 실제로 받는 피해.
 * 피격 데미지 = 보스 공격력 - 방어력 (최소 1 보정 - 방어력이 아무리 높아도 0데미지는 안 되게)
 */
export function calcIncomingDamage(bossAttack, defenseStat) {
  return Math.max(1, bossAttack - defenseStat);
}

/**
 * 체력 스탯 기반 최대 HP. (v3: "레벨 없이 스탯제로만 운영")
 */
export function calcMaxHp(healthStat, balance = DEFAULT_BALANCE) {
  return balance.baseHp + healthStat * balance.hpPerPoint;
}

export { DEFAULT_BALANCE };

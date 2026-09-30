// stats.js
//
// v3 최종 명세서 3-1절 "스탯 연동" 공식을 그대로 구현.
// 계수(damageCoefficient 등)는 v3 문서에도 "밸런싱 대상"이라고 명시되어 있어서
// 기본값만 넣어두고, 언제든 balance 객체를 바꿔 끼울 수 있게 인자로 받는다.
//
const DEFAULT_BALANCE = {
  damageCoefficient: 0.05, // 투자 공격 1포인트마다 현재 공격력의 5%를 복리로 증가
  defenseReductionPerPoint: 0.02, // 투자 방어 1포인트마다 받는 피해 2% 감소
  maxDefenseReduction: 0.5, // 방어 피해 감소율 상한 50%
  baseDamage: 10, // 반격 1회의 기본 공격력
  baseHp: 100, // 체력 투자가 없을 때 최대 HP
  hpPerPoint: 100, // 체력 투자 1포인트당 최대 HP 증가량
};

const COMBAT_VALUE_SCALE = 1_000_000;

function roundCombatValue(value) {
  if (Math.abs(value) >= Number.MAX_SAFE_INTEGER / COMBAT_VALUE_SCALE) return value;
  return Math.round((value + Number.EPSILON) * COMBAT_VALUE_SCALE) / COMBAT_VALUE_SCALE;
}

// 2026-09-06: "1레벨 = 각 스탯 1(보너스 없는 시작값), 2레벨부터 스탯 포인트가
// 붙으면서 그때부터 보너스가 늘어난다"는 모델로 확정 (0825 회의 "기본적으로 공격력1
// 체력1 방어력1" 논의와 일치). 그래서 세 공식 전부 "스탯값 - 1"을 보너스 계산에 쓴다
// (1 이하는 전부 보너스 0으로 클램프 - 0을 넣는 기존 테스트/호출부와도 호환됨).
function bonusPoints(stat) {
  const normalized = Number.isFinite(Number(stat)) ? Math.trunc(Number(stat)) : 1;
  return Math.max(0, normalized - 1);
}

/**
 * 플레이어가 보스에게 주는 데미지.
 * 데미지 = 기본값 × (1 + 계수)^(공격력-1)
 * ※ 공격력 1은 투자 0포인트이므로 데미지 = 기본값
 */
export function calcPlayerDamage(attackStat, balance = DEFAULT_BALANCE) {
  const damage = balance.baseDamage
    * ((1 + balance.damageCoefficient) ** bonusPoints(attackStat));
  return roundCombatValue(Math.min(Number.MAX_SAFE_INTEGER, damage));
}

/** 투자 방어 포인트로 얻는 피해 감소율(0~50%). */
export function calcDefenseReduction(defenseStat, balance = DEFAULT_BALANCE) {
  return Math.max(0, Math.min(
    bonusPoints(defenseStat) * balance.defenseReductionPerPoint,
    balance.maxDefenseReduction,
  ));
}

/**
 * 보스 공격을 맞았을 때(회피 실패 시) 플레이어가 실제로 받는 피해.
 * 피격 데미지 = 보스 공격력 × (1 - min((방어력-1) × 포인트당 감소율, 감소율 상한))
 * ※ 방어력 1은 투자 0포인트이므로 보스 공격력을 그대로 받는다.
 */
export function calcIncomingDamage(bossAttack, defenseStat, balance = DEFAULT_BALANCE) {
  const reduction = calcDefenseReduction(defenseStat, balance);
  return roundCombatValue(Math.max(0, bossAttack) * (1 - reduction));
}

/**
 * 체력 스탯 기반 최대 HP. (v3: "레벨 없이 스탯제로만 운영")
 * 최대HP = 기본체력 + (체력-1) × 포인트당증가량  ※ 체력 1일 때 보너스 0 -> 최대HP = 기본체력
 */
export function calcMaxHp(healthStat, balance = DEFAULT_BALANCE) {
  return balance.baseHp + bonusPoints(healthStat) * balance.hpPerPoint;
}

export { DEFAULT_BALANCE };

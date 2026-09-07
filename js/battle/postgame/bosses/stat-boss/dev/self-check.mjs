// self-check.mjs
//
// 테스트 프레임워크 없이 node로 바로 돌려볼 수 있는 간단 점검 스크립트.
// 터미널에서 이 파일이 있는 폴더로 이동한 뒤:
//
//   node self-check.mjs
//
// 전부 통과하면 초록불(✅)만 쭉 뜨고, 실패한 게 있으면 ❌로 표시되면서
// 기대값/실제값을 같이 보여준다. 1단계 함수 하나를 고칠 때마다 이거 한 번씩 돌려보면
// 다른 함수를 실수로 망가뜨렸는지 바로 알 수 있다.

import {
  GRID,
  positionToCell,
  row,
  column,
  block,
  inverse,
  allCells,
  isCellInSet,
} from "../grid.js";
import { getPatternById, getAvailablePatterns } from "../patterns.js";
import { calcPlayerDamage, calcIncomingDamage, calcMaxHp } from "../stats.js";
import { getDifficultyTier, getBossHpMultiplier } from "../difficulty.js";
import { judgeDodge, isCounterValid } from "../judge.js";
import { createRandom } from "../random.js";
import { STATE, canTransition } from "../state.js";
import { StatBossEncounter } from "../encounter.js";

let passCount = 0;
let failCount = 0;

function check(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  ✅ ${description}`);
  } else {
    failCount++;
    console.log(`  ❌ ${description}`);
    console.log(`     기대값: ${JSON.stringify(expected)}`);
    console.log(`     실제값: ${JSON.stringify(actual)}`);
  }
}

console.log("\n[grid.js]");
check("7x5 격자 크기", [GRID.columns, GRID.rows], [7, 5]);
check(
  "좌표(200,130)는 아레나 960x600에서 col1/row1 칸",
  positionToCell(200, 130, { width: 960, height: 600 }),
  { row: 1, col: 1 }
);
check("row(1)은 7칸 반환 (열 수만큼)", row(1).length, 7);
check("column(2)는 5칸 반환 (행 수만큼)", column(2).length, 5);
check("block(0,0,2,2)는 4칸 반환", block(0, 0, 2, 2).length, 4);
check(
  "inverse([{row:0,col:0}])는 전체 칸 수 - 1",
  inverse([{ row: 0, col: 0 }]).length,
  GRID.columns * GRID.rows - 1
);
check("isCellInSet: 포함된 경우 true", isCellInSet({ row: 1, col: 1 }, row(1)), true);
check("isCellInSet: 포함 안 된 경우 false", isCellInSet({ row: 2, col: 1 }, row(1)), false);

console.log("\n[stats.js]");
check("공격력 0이면 기본 데미지 그대로(10)", calcPlayerDamage(0), 10);
check("공격력 10 (스탯1=보너스0 기준, 보너스 9포인트 x 0.05)면 데미지 14.5", calcPlayerDamage(10), 14.5);
check("방어력이 보스공격보다 높아도 최소 1데미지는 들어감", calcIncomingDamage(5, 100), 1);
check("체력 스탯 8 (스탯1=보너스0 기준, 보너스 7포인트)이면 최대HP 170 (100 + 7*10)", calcMaxHp(8), 170);

console.log("\n[difficulty.js]");
check("10초 시점엔 단일 저격만 등장", getDifficultyTier(10).patternIds, ["single-snipe"]);
check("10초 시점 예고시간 1500ms", getDifficultyTier(10).telegraphMs, 1500);
check("50초 이후 5종 패턴 전부 등장", getDifficultyTier(50).patternIds.length, 5);
check("1인 파티 체력 배율 1.0", getBossHpMultiplier(1), 1.0);
check("5인 파티 체력 배율 1.8", getBossHpMultiplier(5), 1.8);
check("정의 안 된 인원수(10명)는 5인 배율로 보정", getBossHpMultiplier(10), 1.8);

console.log("\n[patterns.js]");
check(
  "1인일 땐 다중 락온이 후보에서 자동 제외됨",
  getAvailablePatterns(["single-snipe", "multi-lockon"], 1).map((p) => p.id),
  ["single-snipe"]
);
check(
  "2인이면 다중 락온도 후보에 포함됨",
  getAvailablePatterns(["single-snipe", "multi-lockon"], 2).map((p) => p.id),
  ["single-snipe", "multi-lockon"]
);

const rng = createRandom(42); // 시드 고정 - 매번 같은 결과가 나와야 이 점검이 의미가 있음
const comboSteps = getPatternById("combo-strike").getSteps({
  players: [{ id: "p1", cell: { row: 0, col: 0 } }],
  random: rng,
});
check("연속 콤보는 step이 2개 = 회피 2회 요구", comboSteps.length, 2);

console.log("\n[judge.js]");
check(
  "위험 칸 밖에 있으면 회피 성공",
  judgeDodge({ x: 900, y: 550 }, [{ row: 0, col: 0 }], { width: 960, height: 600 }),
  true
);
check(
  "위험 칸 안에 있으면 회피 실패",
  judgeDodge({ x: 50, y: 50 }, [{ row: 0, col: 0 }], { width: 960, height: 600 }),
  false
);
check("경직 시작 직후엔 반격 유효", isCounterValid(1000, 1100, 1200), true);
check("경직 시간이 지나면 반격 무효", isCounterValid(1000, 2500, 1200), false);

console.log("\n[state.js]");
check("READY -> RUNNING은 허용됨", canTransition(STATE.READY, STATE.RUNNING), true);
check("READY -> PAUSED는 허용 안 됨(RUNNING을 거쳐야 함)", canTransition(STATE.READY, STATE.PAUSED), false);
check("COMPLETED -> READY는 허용됨 (restart용)", canTransition(STATE.COMPLETED, STATE.READY), true);
check("COMPLETED -> RUNNING은 허용 안 됨", canTransition(STATE.COMPLETED, STATE.RUNNING), false);

console.log("\n[encounter.js] - 2단계: 웨이브 진행 · 게임 상태 흐름");

// 아레나는 1단계 테스트와 동일하게 960x600을 기준으로 쓴다.
const ARENA = { width: 960, height: 600 };

// --- 시나리오 1: 1인 플레이, 패턴을 단일 저격 하나로 고정해서 예고->회피실패(피격)
//     ->경직->반격->다음 패턴까지 한 사이클을 전부 확인한다. ---
const p1Cell = { row: 2, col: 3 };
// positionToCell이 그 칸으로 판정하도록, 칸 한가운데 좌표를 넣는다 (960/7≈137, 600/5=120 기준).
const p1Position = { x: 137 * p1Cell.col + 68, y: 120 * p1Cell.row + 60 };

let lastCandidate1 = null;
const enc1 = new StatBossEncounter({
  arena: ARENA,
  players: [{ id: "p1", attackStat: 10, defenseStat: 0, healthStat: 0, position: p1Position }],
  bossAttack: 20,
  bossBaseHp: 1000,
  staggerDurationMs: 1200,
  patternIds: ["single-snipe"], // 항상 단일 저격만 나오게 고정 (결과를 예측 가능하게)
  seed: 42,
});

enc1.init();
check("init() 직후 상태는 READY", enc1.state, STATE.READY);
check("1인 기준 보스 체력 배율(1.0) 적용됨", enc1.boss.maxHp, 1000);
check("체력 스탯 0인 플레이어 최대 HP는 100", enc1.players.get("p1").maxHp, 100);

enc1.start();
check("start() 후 상태는 RUNNING", enc1.state, STATE.RUNNING);
check("시작하면 바로 TELEGRAPH phase", enc1.phase, "TELEGRAPH");
check("0~15초 구간 예고시간 1500ms로 시작", enc1.phaseRemainingMs, 1500);
// 플레이어가 유일하므로 단일 저격의 타겟은 항상 이 플레이어의 칸이 된다 (안 움직였다는 전제).
check("단일 저격 위험 칸이 플레이어가 서 있는 칸과 일치", enc1.currentDangerCells, [p1Cell]);

enc1.tick(1500); // 예고 종료 -> 판정. 플레이어가 안 움직였으므로 회피 실패(피격).
check("예고 종료 후 경직(STAGGER) phase로 전환", enc1.phase, "STAGGER");
check(
  "피격 데미지(보스공격20-방어0=20) 만큼 HP 감소 (100 -> 80)",
  enc1.players.get("p1").hp,
  80
);
check("경직 지속시간 1200ms 적용", enc1.phaseRemainingMs, 1200);

const counterResult = enc1.attemptCounter("p1"); // 경직 시작 직후 반격 -> 유효해야 함
check("경직 시작 직후 반격은 명중", counterResult.hit, true);
check(
  "반격 데미지(공격력10 -> 스탯1까지는 보너스 없음, 기본10*(1+(10-1)*0.05)=14.5) 만큼 보스 HP 감소",
  enc1.boss.hp,
  985.5
);

enc1.tick(1200); // 경직 종료 -> 다음 패턴으로
check("경직이 끝나면 다시 TELEGRAPH phase (다음 패턴)", enc1.phase, "TELEGRAPH");
check("패턴 1회 완료 카운트 반영", enc1.metrics.patternsResolved, 1);

const missResult = enc1.attemptCounter("p1"); // 지금은 TELEGRAPH 중이라 반격 무효
check("경직 중이 아닐 때 반격 시도는 실패 처리", missResult.hit, false);

enc1.pause();
const elapsedBeforePause = enc1.elapsedMs;
enc1.tick(5000); // PAUSED 동안은 아무리 tick해도 시간이 안 흘러야 함
check("일시정지 중에는 tick()해도 시간이 안 흐름", enc1.elapsedMs, elapsedBeforePause);
enc1.resume();
check("resume() 후 다시 RUNNING", enc1.state, STATE.RUNNING);

// --- 시나리오 2: 반복 피격으로 팀 전멸 -> 실패 처리 + failureReason 확인 ---
let lastCandidate2 = null;
const enc2 = new StatBossEncounter({
  arena: ARENA,
  players: [{ id: "p1", attackStat: 0, defenseStat: 0, healthStat: 0, position: p1Position }], // 최대HP 100
  bossAttack: 20, // 방어0 -> 매번 20씩 감소, 5방이면 사망
  bossBaseHp: 1000,
  patternIds: ["single-snipe"],
  seed: 1,
  onComplete: (attemptId, candidate) => {
    lastCandidate2 = candidate;
  },
});
enc2.init();
enc2.start();
for (let i = 0; i < 5 && enc2.state === STATE.RUNNING; i++) {
  enc2.tick(1500); // 예고 종료 -> 피격
  if (enc2.state !== STATE.RUNNING) break;
  enc2.tick(1200); // 경직 종료 -> 다음 패턴
}
check("전멸하면 상태가 COMPLETED로 전환됨", enc2.state, STATE.COMPLETED);
check("실패 결과 status는 'FAIL' (팀 공용 결과 계약)", lastCandidate2?.status, "FAIL");
check("실패 사유는 'defeated' (전멸)", lastCandidate2?.failureReason, "defeated");
check(
  "성공이든 실패든 failureReason 필드 자체는 항상 존재함 (undefined 아님)",
  lastCandidate2 && "failureReason" in lastCandidate2,
  true
);

// --- 시나리오 3: 보스 HP를 낮게 잡아서 반격 한 방에 승리 -> 성공 처리 확인 ---
let lastCandidate3 = null;
const enc3 = new StatBossEncounter({
  arena: ARENA,
  players: [{ id: "p1", attackStat: 10, defenseStat: 100, healthStat: 10, position: p1Position }], // 방어 높여서 안 죽게
  bossAttack: 20,
  bossBaseHp: 10, // 반격 한 방(15데미지)이면 죽는 체력
  patternIds: ["single-snipe"],
  seed: 7,
  onComplete: (attemptId, candidate) => {
    lastCandidate3 = candidate;
  },
});
enc3.init();
enc3.start();
enc3.tick(1500); // 예고 종료 (방어 100이라 최소 데미지 1만 받음, 안 죽음) -> 경직 시작
enc3.attemptCounter("p1"); // 반격 15데미지 -> 보스 체력 10 -> 0 이하로 즉시 승리 처리
check("보스 체력이 0 이하가 되면 바로 COMPLETED", enc3.state, STATE.COMPLETED);
check("성공 결과 status는 'CLEAR' (팀 공용 결과 계약)", lastCandidate3?.status, "CLEAR");
check("성공해도 failureReason은 null (필드는 존재)", lastCandidate3?.failureReason, null);

// --- 시나리오 4: 인원수에 따른 보스 체력 배율이 encounter에도 반영되는지 ---
const enc4 = new StatBossEncounter({
  arena: ARENA,
  players: [
    { id: "p1", attackStat: 0, defenseStat: 0, healthStat: 0, position: { x: 100, y: 100 } },
    { id: "p2", attackStat: 0, defenseStat: 0, healthStat: 0, position: { x: 200, y: 100 } },
  ],
  bossBaseHp: 1000,
  patternIds: ["single-snipe"],
});
enc4.init();
check("2인 파티면 보스 체력에 1.2배 적용 (1000 -> 1200)", enc4.boss.maxHp, 1200);

// --- 시나리오 5: destroy() 이후에는 더 이상 상태 전이가 안 됨 ---
enc4.destroy();
check("destroy() 후 상태는 DESTROYED", enc4.state, STATE.DESTROYED);
let threwOnRestartAfterDestroy = false;
try {
  enc4.restart();
} catch (e) {
  threwOnRestartAfterDestroy = true;
}
check("DESTROYED 이후 restart()는 에러를 던짐 (허용 안 된 전이)", threwOnRestartAfterDestroy, true);

console.log(`\n총 ${passCount + failCount}개 중 ${passCount}개 통과, ${failCount}개 실패\n`);
if (failCount > 0) process.exitCode = 1;

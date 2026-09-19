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
check("9x6 격자 크기", [GRID.columns, GRID.rows], [9, 6]);
check(
  "좌표(200,130)는 아레나 960x600에서 col1/row1 칸",
  positionToCell(200, 130, { width: 960, height: 600 }),
  { row: 1, col: 1 }
);
check("row(1)은 9칸 반환 (열 수만큼)", row(1).length, 9);
check("column(2)는 6칸 반환 (행 수만큼)", column(2).length, 6);
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
check("5인 파티도 총 체력 배율 1.0", getBossHpMultiplier(5), 1.0);
check("정의 밖 인원수도 총 체력 배율 1.0", getBossHpMultiplier(10), 1.0);

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

// 2026-09-16 버그 수정: 광역 확산(area-burst)이 "안전 칸"으로 골라주는 칸이 이미
// 영구 위험 칸(누적형 단일 저격이 쌓아온 accumulatedHazardCells)과 겹치면 안 된다 -
// 겹치면 화면엔 안전해 보여도 실제로는 맞는다("안 닿았는데 왜 죽었지" 버그 리포트로 발견).
// 반경 1칸(REACH_RADIUS_CELLS) 안이 전부 이미 위험 칸인 극단적인 경우(폴백 경로)까지
// 확인한다.
{
  const hazardBlock = block(1, 1, 3, 3); // 플레이어(2,2) 기준 반경 1칸 전부를 미리 위험 칸으로 채움
  const rng2 = createRandom(11);
  const steps = getPatternById("area-burst").getSteps({
    players: [{ id: "p1", cell: { row: 2, col: 2 } }],
    random: rng2,
    accumulatedHazardCells: hazardBlock,
  });
  const dangerCells = steps[0].dangerCells;
  const safeCells = allCells().filter((c) => !isCellInSet(c, dangerCells));
  const safeOverlapsHazard = safeCells.some((c) => isCellInSet(c, hazardBlock));
  check("반경 내가 전부 이미 위험 칸이어도(폴백 경로) 안전 칸은 위험 칸과 안 겹침", safeOverlapsHazard, false);
  check("그래도 안전 칸이 최소 1개는 남음", safeCells.length >= 1, true);

  // 2026-09-16 버그 수정 2탄: "안전 칸이 있긴 한데 예고시간 안에 도달할 시간이 안
  // 된다"는 리포트로 발견 - 반경1이 전부 막히면 곧장 격자 전체(먼 칸 포함)에서
  // 뽑던 걸, 반경을 한 칸씩만 넓혀서 "가장 가까운" non-hazard 칸을 찾도록 고쳤다.
  // 이 시나리오(반경1 = 3x3 블록 전체가 hazard)에서는 반경2(체비셰프 거리 2)까지만
  // 넓히면 non-hazard 칸이 있으므로, 뽑힌 안전 칸이 딱 그 범위 안에 있어야 한다 -
  // 반대편 구석처럼 먼 칸이 뽑히면 안 됨.
  const allWithinRadius2 = safeCells.every(
    (c) => Math.max(Math.abs(c.row - 2), Math.abs(c.col - 2)) <= 2
  );
  check("반경1이 막히면 그 다음으로 가까운 반경2 안에서만 안전 칸을 찾음(먼 칸으로 안 건너뜀)", allWithinRadius2, true);
}

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

// 2026-09-16: 격자 크기가 바뀌어도(9x6, 나중에 또 바뀌어도) 테스트가 안 깨지게,
// 좌표를 하드코딩하지 않고 GRID 기준으로 "그 칸의 한가운데" 좌표를 계산하는 헬퍼를 쓴다.
const CELL_W = ARENA.width / GRID.columns;
const CELL_H = ARENA.height / GRID.rows;
function cellCenter(cellRow, cellCol) {
  return { x: CELL_W * cellCol + CELL_W / 2, y: CELL_H * cellRow + CELL_H / 2 };
}

// --- 시나리오 1: 1인 플레이, 패턴을 단일 저격 하나로 고정해서 예고->회피실패(피격)
//     ->경직->반격->다음 패턴까지 한 사이클을 전부 확인한다. ---
const p1Cell = { row: 2, col: 3 };
// positionToCell이 그 칸으로 판정하도록, 칸 한가운데 좌표를 넣는다.
const p1Position = cellCenter(p1Cell.row, p1Cell.col);

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

// --- 시나리오 4: 참여 인원과 무관하게 보스 총 체력이 유지되는지 ---
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
check("2인 파티도 보스 총 체력 1000 유지", enc4.boss.maxHp, 1000);

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

// --- 시나리오 6: 누적형 위험 칸(단일 저격 accumulates) - 2026-09-16 추가.
//     예전에 판정된 칸이, 지금 패턴의 타겟이 아니어도 계속 위험하게 남는지 확인한다. ---
const cellA = { row: 0, col: 0 };
const cellB = { row: 1, col: 1 };
const enc5 = new StatBossEncounter({
  arena: ARENA,
  players: [
    { id: "p1", attackStat: 0, defenseStat: 100, healthStat: 10, position: cellCenter(cellA.row, cellA.col) },
  ],
  bossAttack: 20,
  bossBaseHp: 100000, // 반격을 안 해서 중간에 클리어되지 않도록 크게 잡음
  staggerDurationMs: 1200,
  patternIds: ["single-snipe"],
  seed: 3,
});
enc5.init();
enc5.start();

enc5.tick(1500); // 1차 예고 종료 -> cellA에서 맞음 (방어100이라 최소 1데미지)
check("1차 피격 후 누적 위험 칸에 cellA 포함", isCellInSet(cellA, enc5.accumulatedHazardCells), true);

enc5.setPlayerPosition("p1", cellCenter(cellB.row, cellB.col).x, cellCenter(cellB.row, cellB.col).y);
enc5.tick(1200); // 경직 종료 -> 다음 패턴 시작, 이 시점 위치(cellB)가 타겟으로 잡힘
check("이동한 cellB가 다음 패턴 타겟으로 잡힘", enc5.currentDangerCells, [cellB]);

const hpBeforeReturn = enc5.players.get("p1").hp;
// 지금 타겟(cellB)은 피하지만, 예전에 쌓인 위험 칸(cellA)으로 돌아간다.
enc5.setPlayerPosition("p1", cellCenter(cellA.row, cellA.col).x, cellCenter(cellA.row, cellA.col).y);
enc5.tick(1500); // 이번 예고 종료
check(
  "현재 타겟(cellB)은 피해도 누적 위험 칸(cellA) 위에 있으면 맞는다",
  enc5.players.get("p1").hp,
  hpBeforeReturn - 1 // 방어100 vs 보스공격20 -> 최소 데미지 1
);
check(
  "누적 위험 칸에 cellA, cellB 둘 다 남아있음",
  [isCellInSet(cellA, enc5.accumulatedHazardCells), isCellInSet(cellB, enc5.accumulatedHazardCells)],
  [true, true]
);

// --- 시나리오 7: 패턴 셔플 백(다양성) - 2026-09-16 추가 (윤서 피드백: "공격 패턴이
//     단조롭다"). 40초 이후(5종 패턴 전부 후보인 구간)부터, 같은 패턴이 연달아
//     나오지 않고 5종이 골고루 나오는지 확인한다. 데미지는 0으로 고정해서 팀 전멸로
//     조기 종료되지 않고 오래 돌려볼 수 있게 한다(패턴이 뭘로 뽑히는지만 보는 테스트). ---
const patternPickLog = []; // { id, atMs }
const enc6 = new StatBossEncounter({
  arena: ARENA,
  players: [
    { id: "p1", attackStat: 0, defenseStat: 0, healthStat: 0, position: cellCenter(0, 0) },
    { id: "p2", attackStat: 0, defenseStat: 0, healthStat: 0, position: cellCenter(0, 1) },
  ],
  bossAttack: 0,
  staggerDurationMs: 100,
  seed: 99,
  onEvent(event) {
    if (event.type === "telegraph-start" && event.stepIndex === 0) {
      patternPickLog.push({ id: event.patternId, atMs: enc6.elapsedMs });
    }
  },
});
enc6.init();
enc6.start();
for (let i = 0; i < 6000 && enc6.state === STATE.RUNNING; i++) enc6.tick(50);

// 40초 이후(5종 전부 후보인 구간)만 뽑아서 검사한다 - 그 전 구간은 후보 자체가 적어서
// (예: 0~15초는 단일 저격 하나뿐) 이 테스트의 관심사가 아니다.
const fullPoolPicks = patternPickLog.filter((p) => p.atMs >= 40000).map((p) => p.id);

let hasConsecutiveRepeat = false;
for (let i = 1; i < fullPoolPicks.length; i++) {
  if (fullPoolPicks[i] === fullPoolPicks[i - 1]) hasConsecutiveRepeat = true;
}
check("40초 이후 구간엔 같은 패턴이 두 번 연달아 나오지 않음(셔플 백)", hasConsecutiveRepeat, false);

const pickCounts = {};
for (const id of fullPoolPicks) pickCounts[id] = (pickCounts[id] ?? 0) + 1;
const pickCountValues = Object.values(pickCounts);
const countSpreadOk =
  fullPoolPicks.length >= 20 &&
  Object.keys(pickCounts).length === 5 &&
  Math.max(...pickCountValues) - Math.min(...pickCountValues) <= 1;
check("5종 패턴이 전부 등장하고, 등장 횟수가 서로 최대 1개 차이로 고르게 분배됨", countSpreadOk, true);

// --- 시나리오 8: 연속 콤보 2번째 step 최소 예고시간 - 2026-09-16 버그 리포트
//     ("대각선 끝나자마자 인지도 못 할 만큼 짧게 네모 공격이 겹쳐서 나온다") 수정. ---
{
  const stepTelegraphs = [];
  const enc7 = new StatBossEncounter({
    arena: ARENA,
    players: [{ id: "p1", attackStat: 0, defenseStat: 0, healthStat: 0, position: cellCenter(0, 0) }],
    bossAttack: 0,
    patternIds: ["combo-strike"],
    seed: 5,
    onEvent(event) {
      if (event.type === "telegraph-start") stepTelegraphs.push(event.telegraphMs);
    },
  });
  enc7.init();
  enc7.elapsedMs = 40000; // 40초 이후(연속 콤보가 후보에 포함되는) 구간으로 미리 이동
  enc7.start();
  enc7.tick(800); // 1번째 step(대각선) 예고 종료 -> 2번째 step(블록) 예고 시작
  check("연속 콤보 1번째 step(대각선)은 그 구간 기본 예고시간(800ms)", stepTelegraphs[0], 800);
  check(
    "연속 콤보 2번째 step(사각 블록)은 최소 700ms 이상 (고치기 전엔 400ms였음)",
    stepTelegraphs[1] >= 700,
    true
  );
}

console.log(`\n총 ${passCount + failCount}개 중 ${passCount}개 통과, ${failCount}개 실패\n`);
if (failCount > 0) process.exitCode = 1;

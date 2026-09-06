// patterns.js
//
// v3 최종 명세서(스탯보스전_기능명세서_v3최종.docx) 3-2절 공격 패턴 5종을
// grid.js의 shape 프리미티브로 표현한 것.
//
// 모든 패턴은 getSteps(ctx)를 통해 "순서대로 실행되는 단계(step) 배열"을 반환한다.
//   - 대부분 패턴은 step이 1개 -> 예고 한 번, 회피 한 번으로 끝난다.
//   - ③ 좌우 스윕은 여러 개(칸 수만큼), ⑤ 연속 콤보는 2개다.
//   - "회피를 몇 번 해야 하는지"는 steps.length로 자동 결정된다.
//     (v3 스펙에 "⑤는 회피 2회 요구"라고 되어 있는데, 따로 필드를 안 만들어도
//      steps 배열 길이가 2면 자연스럽게 회피 2회가 된다.)
//
// ctx로 넘어오는 값 (2단계 웨이브 진행 로직에서 채워서 호출할 예정):
//   - players: [{ id, cell: {row, col} }, ...] 지금 참여 중인 플레이어들의 위치(칸 기준)
//   - random: random.js의 createRandom()으로 만든 난수 생성기

import { cell, column, diagonal, block, inverse, allCells, GRID } from "./grid.js";

export const PATTERNS = [
  {
    id: "single-snipe",
    name: "단일 저격",
    minPlayers: 1,
    getSteps(ctx) {
      // 플레이어 중 한 명을 골라 그 칸 하나만 위험하게 만든다 (기본 패턴, 좁은 범위).
      const target = ctx.random.pick(ctx.players);
      return [{ dangerCells: cell(target.cell.row, target.cell.col) }];
    },
  },

  {
    id: "area-burst",
    name: "광역 확산",
    minPlayers: 1,
    getSteps(ctx) {
      // 전체 격자가 위험해지고, 랜덤한 안전 칸 1~2개만 남는다.
      // (v3: "범위 밖 이동 필요" -> 안전 칸으로 이동해야 하는 형태로 구현)
      //
      // 2026-09-06: 안전 칸을 격자 전체(35칸)에서 완전 무작위로 뽑았더니, 플레이어
      // 이동속도(character.js 기본값 180px/s)로는 이 패턴의 예고시간(15~40초 구간
      // 1200ms, 40초~ 구간 800ms) 안에 절대 못 닿는 먼 칸이 뽑히는 경우가 있어서
      // "사실상 회피 불가"가 됨 - 플레이 테스트로 발견(초현). 180px/s * 0.8~1.2s ≈
      // 144~216px ≈ 셀 1~1.8칸 이동 가능하다는 계산에 따라, 안전 칸 후보를
      // "적어도 한 명의 플레이어가 현재 칸 기준 REACH_RADIUS_CELLS 칸 이내로
      // 이동하면 닿을 수 있는 칸"으로 좁혀서 그 안에서만 뽑도록 수정.
      // REACH_RADIUS_CELLS=1은 위 계산에서 나온 보수적인(타이트한 쪽) 값 - 밸런싱 대상.
      const REACH_RADIUS_CELLS = 1;
      const reachable = allCells().filter((c) =>
        ctx.players.some(
          (p) =>
            Math.abs(c.row - p.cell.row) <= REACH_RADIUS_CELLS &&
            Math.abs(c.col - p.cell.col) <= REACH_RADIUS_CELLS,
        ),
      );
      // reachable엔 항상 각 플레이어 자기 칸 자체가 포함되므로 비는 일은 이론상 없지만,
      // 만약을 대비해 비었을 때는(설정 오류 등) 기존처럼 전체 격자에서 뽑는다.
      const pool = reachable.length > 0 ? reachable : allCells();
      const safeCount = ctx.random.int(1, 2);
      const safeCells = ctx.random.sample(pool, Math.min(safeCount, pool.length));
      return [{ dangerCells: inverse(safeCells) }];
    },
  },

  {
    id: "column-sweep",
    name: "좌우 스윕",
    minPlayers: 1,
    getSteps() {
      // 균열이 왼쪽 열부터 오른쪽 열까지 한 칸씩 훑고 지나간다 (타이밍형 회피).
      // step 하나 = 열(column) 하나. step별 예고 시간을 기본 예고시간보다
      // 짧게 나눠 쓰는 부분은 2단계(웨이브 진행 스케줄러)에서 처리한다.
      const steps = [];
      for (let col = 0; col < GRID.columns; col++) {
        steps.push({ dangerCells: column(col) });
      }
      return steps;
    },
  },

  {
    id: "multi-lockon",
    name: "다중 락온",
    minPlayers: 2, // v3 3-2절: 2인 이상일 때만 등장
    getSteps(ctx) {
      // 락온 대상 수는 참여 인원과 무관하게 2~3명으로 고정한다 (v3 3-2절 비고).
      const lockonCount = Math.min(ctx.players.length, ctx.random.int(2, 3));
      const targets = ctx.random.sample(ctx.players, lockonCount);
      const dangerCells = targets.map((p) => ({ row: p.cell.row, col: p.cell.col }));
      return [{ dangerCells }];
    },
  },

  {
    id: "combo-strike",
    name: "연속 콤보",
    minPlayers: 1,
    getSteps(ctx) {
      // 이중 균열이 짧은 간격으로 발생 -> 서로 다른 모양으로 2번, 회피 2회 요구.
      const dir = ctx.random.pick(["main", "anti"]);
      const blockStart = {
        row: ctx.random.int(0, GRID.rows - 2),
        col: ctx.random.int(0, GRID.columns - 2),
      };
      return [
        { dangerCells: diagonal(dir) },
        { dangerCells: block(blockStart.row, blockStart.col, 2, 2) },
      ];
    },
  },
];

/** id로 패턴 정의를 찾는다. 없으면 undefined. */
export function getPatternById(id) {
  return PATTERNS.find((p) => p.id === id);
}

/**
 * 지금 인원수로 실제 등장 가능한 패턴만 걸러낸다.
 * (④ 다중 락온은 1인 플레이면 여기서 자동으로 후보에서 빠진다 -
 *  Day 0-1 히스토리에 남겨뒀던 "궁금한 점"의 답)
 *
 * @param {string[]} patternIds - 지금 난이도 구간에서 등장 가능한 패턴 id 목록 (difficulty.js 참고)
 * @param {number} playerCount - 현재 참여 인원
 */
export function getAvailablePatterns(patternIds, playerCount) {
  return patternIds
    .map(getPatternById)
    .filter((p) => p && p.minPlayers <= playerCount);
}

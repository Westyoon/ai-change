// judge.js
//
// v3 최종 명세서 3-4절 "전투 판정 흐름" 중, 실제 판정 부분만 순수 함수로 뽑아놓은 것.
//   예고 -> 회피판정 -> 경직 -> 반격 -> (다음 예고로 복귀)
// 이 순서 자체를 시간에 맞춰 진행시키는 상태 머신(게임 루프)은 2단계에서 만든다.
// 여기 있는 함수들은 전부 "지금 이 상황이면 결과가 뭐냐"만 계산하는 순수 함수라
// 화면 없이 콘솔에서 바로 테스트할 수 있다.

import { positionToCell, isCellInSet } from "./grid.js";

/**
 * 회피 판정. 예고가 끝나는 시점에 딱 한 번 호출한다.
 * 플레이어가 위험 칸 목록 밖에 있으면 회피 성공.
 *
 * @param {{x:number, y:number}} playerPosition - 판정 시점의 플레이어 좌표 (연속 좌표, 자유이동 그대로)
 * @param {{row:number, col:number}[]} dangerCells - 이번 step에서 위험한 칸들 (patterns.js의 getSteps 결과)
 * @param {{width:number, height:number}} arena
 * @returns {boolean} true = 회피 성공
 */
export function judgeDodge(playerPosition, dangerCells, arena) {
  const cell = positionToCell(playerPosition.x, playerPosition.y, arena);
  return !isCellInSet(cell, dangerCells);
}

/**
 * 여러 플레이어가 동시에 있을 때, 각자 회피 성공했는지 한 번에 판정한다.
 * (② 광역 확산처럼 전원이 같은 위험 범위를 판정받는 경우에 쓰기 좋음)
 *
 * @param {{id:string, position:{x:number,y:number}}[]} players
 * @returns {{playerId:string, dodged:boolean}[]}
 */
export function judgeDodgeForAll(players, dangerCells, arena) {
  return players.map((player) => ({
    playerId: player.id,
    dodged: judgeDodge(player.position, dangerCells, arena),
  }));
}

/**
 * 경직 시간 동안에만 반격이 유효하다.
 * @param {number} staggerStartedAt - 경직이 시작된 시각 (ms 단위 타임스탬프)
 * @param {number} now - 반격을 시도한 시각 (ms)
 * @param {number} staggerDurationMs - 경직 지속 시간 (예: 1200ms, v3 3-4절 예시)
 * @returns {boolean} true면 지금 반격이 유효하게 들어간다
 */
export function isCounterValid(staggerStartedAt, now, staggerDurationMs) {
  const elapsed = now - staggerStartedAt;
  return elapsed >= 0 && elapsed <= staggerDurationMs;
}

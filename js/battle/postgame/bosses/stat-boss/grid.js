// grid.js
// 격자 좌표 관련 유틸리티

/**
 * 격자 크기. 실제 화면 비율/밸런싱이 확정되면 조정될 예시 수치.
 * columns: 가로 칸 수 (열, col 인덱스: 0 ~ columns-1)
 * rows: 세로 칸 수 (행, row 인덱스: 0 ~ rows-1)
 */
export const GRID = {
  columns: 7,
  rows: 5,
};

/**
 * 연속 좌표(x, y)를 타일 인덱스 {row, col}로 바꾼다.
 * 화면 밖으로 살짝 나간 좌표가 들어와도 에러 없이 가장 가까운 가장자리 칸으로 보정(clamp)한다.
 *
 * @param {number} x - 아레나 기준 x 좌표
 * @param {number} y - 아레나 기준 y 좌표
 * @param {{width: number, height: number}} arena - 아레나(전투 화면) 전체 크기
 * @returns {{row: number, col: number}}
 */
export function positionToCell(x, y, arena) {
  const cellWidth = arena.width / GRID.columns;
  const cellHeight = arena.height / GRID.rows;

  const col = clamp(Math.floor(x / cellWidth), 0, GRID.columns - 1);
  const row = clamp(Math.floor(y / cellHeight), 0, GRID.rows - 1);

  return { row, col };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 두 칸이 같은 칸인지 비교 (매번 새 객체라서 ===로는 비교가 안 됨) */
export function isSameCell(a, b) {
  return a.row === b.row && a.col === b.col;
}

/**
 * 회피 판정의 핵심 함수: 특정 칸이 "위험 칸 목록" 안에 있는지 확인한다.
 * @param {{row:number, col:number}} cell
 * @param {{row:number, col:number}[]} cellSet
 */
export function isCellInSet(cell, cellSet) {
  return cellSet.some((c) => isSameCell(c, cell));
}

// ---------------------------------------------------------------------------
// shape 프리미티브
// 패턴 하나하나가 "위험한 칸이 어디어디인지"를 매번 좌표로 나열하지 않고,
// 아래 함수들의 조합으로 표현하기 위한 것. 전부 {row, col} 배열을 반환한다.
// ---------------------------------------------------------------------------

/** 단일 칸 하나. (① 단일 저격, ④ 다중 락온에서 사용) */
export function cell(row, col) {
  return [{ row, col }];
}

/** 가로 한 줄 전체 (row 고정, 모든 col). */
export function row(rowIndex) {
  const cells = [];
  for (let col = 0; col < GRID.columns; col++) cells.push({ row: rowIndex, col });
  return cells;
}

/** 세로 한 줄 전체 (col 고정, 모든 row). (③ 좌우 스윕: 이 col이 왼쪽->오른쪽으로 이동) */
export function column(colIndex) {
  const cells = [];
  for (let r = 0; r < GRID.rows; r++) cells.push({ row: r, col: colIndex });
  return cells;
}

/**
 * 대각선 한 줄. dir: "main"(왼쪽위->오른쪽아래) | "anti"(오른쪽위->왼쪽아래)
 * 격자가 정사각형이 아니어도(5x3 등) 최대한 자연스럽게 지나가도록 비율로 계산한다.
 */
export function diagonal(dir = "main") {
  const cells = [];
  const steps = Math.max(GRID.columns, GRID.rows);
  for (let i = 0; i < steps; i++) {
    const col = Math.min(GRID.columns - 1, Math.floor((i / steps) * GRID.columns));
    const rowIndex = Math.min(GRID.rows - 1, Math.floor((i / steps) * GRID.rows));
    const r = dir === "anti" ? GRID.rows - 1 - rowIndex : rowIndex;
    cells.push({ row: r, col });
  }
  return dedupe(cells);
}

/** 사각 범위(블록). (startRow, startCol)에서 시작해서 가로 width칸 x 세로 height칸. */
export function block(startRow, startCol, width, height) {
  const cells = [];
  for (let r = startRow; r < startRow + height && r < GRID.rows; r++) {
    for (let c = startCol; c < startCol + width && c < GRID.columns; c++) {
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** 격자 전체 칸 목록 (block으로 전체 크기를 요청한 것과 같음). */
export function allCells() {
  return block(0, 0, GRID.columns, GRID.rows);
}

/**
 * "지정한 안전 칸만 빼고 전부 위험"으로 만든다. (② 광역 확산에서 사용)
 * @param {{row:number, col:number}[]} safeCells - 위험하지 않게 남겨둘 칸들
 */
export function inverse(safeCells) {
  return allCells().filter((c) => !isCellInSet(c, safeCells));
}

function dedupe(cells) {
  const seen = new Set();
  return cells.filter((c) => {
    const key = `${c.row},${c.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

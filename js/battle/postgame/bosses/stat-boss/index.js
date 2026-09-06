// index.js
//
// 1단계(판정 로직 · 데이터 구조) + 2단계(웨이브 진행 · 게임 상태 흐름) +
// 3단계(화면 렌더링 · 입력 연결) 모듈들을 한 번에 가져다 쓰기 위한 barrel 파일.
//
//   import { createBattle } from "./stat-boss/index.js";
//   const battle = createBattle({ root, input, events, onComplete });
//   await battle.init({ arena, players });
//   battle.start({ attemptId: "..." });
//
// 개별 로직/그림 조각만 필요하면 아래 export들을 그대로 가져다 써도 된다
// (judgeDodgeForAll, StatBossEncounter, StatBossView 등).

export * from "./grid.js";
export * from "./patterns.js";
export * from "./stats.js";
export * from "./difficulty.js";
export * from "./judge.js";
export * from "./random.js";
export * from "./state.js";
export * from "./encounter.js";
export * from "./view.js";
export * from "./battle.js";

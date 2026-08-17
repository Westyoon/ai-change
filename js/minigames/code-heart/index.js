import { createScaffoldMiniGame } from "../shared/scaffold-game.js";

const DEFINITION = Object.freeze({
  id: "computer-code-heart",
  departmentCode: "CSE",
  department: "컴퓨터공학과",
  title: "Code Heart: Unlock!",
  goal: "주문에 맞는 개발 재료를 올바른 순서로 조합해 마음의 코드를 정화합니다.",
  failureReason: "ORDER_GOAL_NOT_MET",
  createMetrics(_status, config) {
    return {
      ordersCompleted: 0,
      ordersFailed: 0,
      buildErrorCount: 0,
      remainingTimeMs: Number.isFinite(config.timeLimitMs) ? config.timeLimitMs : 0,
    };
  },
});

export function createMiniGame(context) {
  return createScaffoldMiniGame(context, DEFINITION);
}

export default createMiniGame;

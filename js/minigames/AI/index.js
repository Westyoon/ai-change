import { createScaffoldMiniGame } from "../shared/scaffold-game.js";

const DEFINITION = Object.freeze({
  id: "ai-ball-classification",
  departmentCode: "AI",
  department: "인공지능학부",
  title: "AI Ball Classification Game",
  goal: "목표 이미지와 같은 공만 분류통에 담고 다른 공은 통과시킵니다.",
  failureReason: "CLASSIFICATION_FAILED",
  createMetrics(status) {
    return {
      targetCollected: status === "CLEAR" ? 5 : 0,
      targetMissed: 0,
      wrongCollected: 0,
      ballsResolved: status === "CLEAR" ? 30 : 0,
    };
  },
});

export function createMiniGame(context) {
  return createScaffoldMiniGame(context, DEFINITION);
}

export default createMiniGame;

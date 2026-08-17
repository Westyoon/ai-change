import { createScaffoldMiniGame } from "../shared/scaffold-game.js";

const DEFINITION = Object.freeze({
  id: "cyber-click-to-purify",
  departmentCode: "CS",
  department: "사이버보안학과",
  title: "CLICK to PURIFY",
  goal: "악성코드를 판별하고 정확한 타이밍에 정화해 SECURITY CORE를 지킵니다.",
  failureReason: "CORE_COMPROMISED",
  createMetrics() {
    return {
      wavesResolved: 0,
      purification: 0,
      perfectCount: 0,
      goodCount: 0,
      missCount: 0,
    };
  },
});

export function createMiniGame(context) {
  return createScaffoldMiniGame(context, DEFINITION);
}

export default createMiniGame;

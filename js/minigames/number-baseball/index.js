import { createScaffoldMiniGame } from "../shared/scaffold-game.js";

const DEFINITION = Object.freeze({
  id: "data-number-baseball",
  departmentCode: "DS",
  department: "데이터사이언스전공",
  title: "숫자 야구",
  goal: "9 Epoch 안에 서로 다른 세 자리 숫자를 추론합니다.",
  failureReason: "EPOCH_LIMIT_REACHED",
  createMetrics(status, config) {
    return {
      epochsUsed: 0,
      history: [],
      fit: status === "CLEAR" ? 3 : 0,
      shift: 0,
      outlier: status === "CLEAR" ? 0 : 3,
      ...(status === "FAIL" ? { answer: Array.isArray(config.answer) ? [...config.answer] : [] } : {}),
    };
  },
});

export function createMiniGame(context) {
  return createScaffoldMiniGame(context, DEFINITION);
}

export default createMiniGame;

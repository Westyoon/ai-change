import assert from "node:assert/strict";
import test from "node:test";
import { resolveResultPresentation } from "../../js/ui/result-overlay.js";

test("result presentation keeps the common contract while applying game-specific copy", () => {
  const resolved = resolveResultPresentation({
    result: {
      status: "FAIL",
      failureReason: "MISS_LIMIT",
      score: 42,
      metrics: { missCount: 3, purification: 42 },
    },
    outroText: "공통 실패 문구",
    presentation: {
      fail: {
        title: "💥 방어 실패",
        description: "정화도 {purification}%",
        reasonDescriptions: {
          MISS_LIMIT: "MISS {missCount}회로 시스템이 뚫렸습니다.",
        },
        retryLabel: "RESTART",
      },
    },
  });

  assert.deepEqual(resolved, {
    title: "💥 방어 실패",
    description: "MISS 3회로 시스템이 뚫렸습니다.",
    retryLabel: "RESTART",
    mapLabel: "맵으로",
    menuLabel: "메뉴로",
  });
  assert.ok(Object.isFrozen(resolved));
});

test("result presentation falls back to the existing outro copy", () => {
  assert.equal(resolveResultPresentation({
    result: { status: "CLEAR", score: 100, metrics: {} },
    outroText: "원래 공통 완료 문구",
  }).description, "원래 공통 완료 문구");
});

test("result presentation joins array metrics when restoring prototype copy", () => {
  assert.equal(resolveResultPresentation({
    result: {
      status: "FAIL",
      score: null,
      metrics: { answer: [4, 0, 7] },
    },
    presentation: {
      fail: { description: "정답은 {answer} 이었습니다." },
    },
  }).description, "정답은 407 이었습니다.");
});

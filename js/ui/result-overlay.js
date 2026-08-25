import { createButton, createElement } from "../scenes/scene-utils.js";

const METRIC_LABELS = Object.freeze({
  epochsUsed: "사용 Epoch",
  fit: "Fit",
  shift: "Shift",
  outlier: "Outlier",
  answer: "정답",
  wavesResolved: "처리한 Wave",
  purification: "정화도",
  perfectCount: "PERFECT",
  goodCount: "GOOD",
  missCount: "MISS",
  ordersCompleted: "완료 주문",
  ordersFailed: "실패 주문",
  buildErrorCount: "빌드 오류",
  remainingTimeMs: "남은 시간",
  correctCount: "정답",
  wrongCount: "오답",
  lostCount: "이탈",
  remainingLives: "남은 생명",
  targetCollected: "목표 수집",
  targetMissed: "목표 누락",
  wrongCollected: "오분류",
  ballsResolved: "처리한 공",
});

function formatMetric(key, value) {
  if (key.endsWith("TimeMs") && Number.isFinite(value)) {
    return `${(value / 1000).toFixed(1)}초`;
  }
  if (key === "purification" && Number.isFinite(value)) {
    return `${value}%`;
  }
  if (Array.isArray(value) && value.every((item) => ["number", "string"].includes(typeof item))) {
    return value.join("");
  }
  return String(value);
}

export function createResultOverlay({
  result,
  departmentCode,
  outroText,
  onRetry,
  onMap,
  onMenu,
  backgroundElements = [],
}) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backgroundState = backgroundElements.filter(Boolean).map((element) => ({
    element,
    inert: element.inert,
    ariaHidden: element.getAttribute("aria-hidden"),
  }));
  for (const { element } of backgroundState) {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  }

  const backdrop = createElement("div", {
    className: "result-backdrop",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "result-title",
    },
  });
  const card = createElement("section", {
    className: "result-card",
    dataset: { status: result.status },
  });
  const title = createElement("h2", {
    text: result.status === "CLEAR" ? "미니게임 클리어" : "미니게임 실패",
    attributes: { id: "result-title" },
  });
  const copy = createElement("p", {
    className: "muted",
    text: outroText ?? (
      result.status === "CLEAR"
        ? "학과 미니게임을 성공적으로 완료했습니다."
        : "이번 도전은 완료하지 못했습니다. 다시 도전하거나 맵으로 돌아갈 수 있습니다."
    ),
  });
  const meta = createElement("p", {
    text: `학과 ${departmentCode ?? "-"} · 플레이 ${(result.durationMs / 1000).toFixed(1)}초`,
  });
  const metrics = createElement("dl", { className: "result-metrics" });
  const metricEntries = [
    ...(result.score === null ? [] : [["score", result.score]]),
    ...Object.entries(result.metrics ?? {}).filter(
      ([key, value]) =>
        key !== "history" &&
        value !== null &&
        value !== undefined &&
        (["number", "string", "boolean"].includes(typeof value) || Array.isArray(value)),
    ),
  ];
  for (const [key, value] of metricEntries) {
    metrics.append(
      createElement("dt", { text: key === "score" ? "점수" : METRIC_LABELS[key] ?? key }),
      createElement("dd", { text: formatMetric(key, value) }),
    );
  }
  let actionLocked = false;
  let actions;
  const runOnce = (action) => () => {
    if (actionLocked) return;
    actionLocked = true;
    for (const button of actions.querySelectorAll("button")) button.disabled = true;
    action?.();
  };
  const retryButton = createButton("다시 하기", runOnce(onRetry), "primary");
  const mapButton = createButton("맵으로", runOnce(onMap));
  const menuButton = createButton("메뉴로", runOnce(onMenu), "ghost");
  actions = createElement("div", { className: "button-row" }, [retryButton, mapButton, menuButton]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      mapButton.click();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...actions.querySelectorAll("button:not(:disabled)")];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  backdrop.addEventListener("keydown", handleKeyDown);

  card.append(title, copy, meta);
  if (metricEntries.length > 0) card.append(metrics);
  card.append(actions);
  backdrop.append(card);
  const focusFrame = requestAnimationFrame(() => retryButton.focus());

  return {
    element: backdrop,
    destroy() {
      cancelAnimationFrame(focusFrame);
      backdrop.removeEventListener("keydown", handleKeyDown);
      backdrop.remove();
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };
}

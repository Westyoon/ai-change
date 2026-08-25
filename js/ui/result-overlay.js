import { createButton, createElement } from "../scenes/scene-utils.js";

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
    text: result.status === "CLEAR" ? "스캐폴드 성공 흐름" : "스캐폴드 실패 흐름",
    attributes: { id: "result-title" },
  });
  const copy = createElement("p", {
    className: "muted",
    text: outroText ?? (
      result.status === "CLEAR"
        ? "공통 CLEAR 결과 계약과 저장 연결을 확인했습니다. 실제 게임 규칙은 다음 구현 단계에서 추가합니다."
        : "공통 FAIL 결과 계약과 재도전 흐름을 확인했습니다. 현재는 개발용 판정 버튼입니다."
    ),
  });
  const meta = createElement("p", {
    text: `학과 ${departmentCode ?? "-"} · ${Math.round(result.durationMs)}ms`,
  });
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

  card.append(title, copy, meta, actions);
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

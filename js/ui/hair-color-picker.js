import { HAIR_COLOR_OPTIONS, createPlayerAppearance } from "../battle/player-config.js";
import { resolveSpriteSheetPresentation } from "../battle/character/character-view.js";
import { createButton, createElement } from "../scenes/scene-utils.js";

export function createHairColorChoices({ selected = "purple", disabled = false, onSelect } = {}) {
  return createElement("div", { className: "hair-color-choices", attributes: { role: "group", "aria-label": "머리색" } },
    HAIR_COLOR_OPTIONS.map((option) => {
      const preview = createElement("span", { className: "hair-color-choice__preview", attributes: { "aria-hidden": "true" } });
      const sheet = resolveSpriteSheetPresentation(createPlayerAppearance(option.id), "down", "idle");
      preview.style.backgroundPosition = `${sheet.frameStartX}% ${sheet.directionY}%`;
      preview.style.backgroundSize = `${sheet.backgroundSizeX}% ${sheet.backgroundSizeY}%`;
      preview.style.aspectRatio = sheet.aspectRatio;
      const button = createElement("button", {
        className: "hair-color-choice", type: "button", disabled,
        dataset: { hairColor: option.id },
        attributes: { "aria-pressed": String(option.id === selected) },
      }, [preview, createElement("span", { text: option.label })]);
      button.addEventListener("click", () => onSelect?.(option.id));
      return button;
    }));
}

export function promptForHairColor(root, accountService, { signal } = {}) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let selected = accountService.getState().user?.hairColor ?? "purple";
    let busy = false;
    let disposed = false;
    const previousFocus = document.activeElement;
    const overlay = createElement("div", {
      className: "hair-color-picker-backdrop",
      attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "hair-color-picker-title" },
    });
    const card = createElement("section", { className: "hair-color-picker" }, [
      createElement("h2", { text: "머리색을 골라주세요", attributes: { id: "hair-color-picker-title" } }),
    ]);
    const choices = createHairColorChoices({ selected, onSelect(hairColor) {
      if (busy) return;
      selected = hairColor;
      for (const button of choices.querySelectorAll("button")) {
        button.setAttribute("aria-pressed", String(button.dataset.hairColor === selected));
      }
    } });
    const error = createElement("p", { className: "hair-color-picker__error", attributes: { role: "alert" } });
    const finish = (success) => {
      if (disposed) return;
      disposed = true;
      signal?.removeEventListener("abort", onAbort);
      overlay.remove();
      previousFocus?.focus?.();
      resolve(success);
    };
    const onAbort = () => finish(false);
    const start = createButton("이 캐릭터로 시작", async () => {
      if (busy) return;
      busy = true;
      for (const button of card.querySelectorAll("button")) button.disabled = true;
      try {
        await accountService.updateHairColor(selected);
        if (!accountService.getState().authenticated) throw new Error("Session ended");
        finish(true);
      } catch {
        if (disposed) return;
        busy = false;
        error.textContent = "저장하지 못했습니다. 다시 시도해 주세요.";
        for (const button of card.querySelectorAll("button")) button.disabled = false;
      }
    }, "primary");
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const buttons = [...card.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    card.append(choices, error, start);
    overlay.append(card);
    root.append(overlay);
    signal?.addEventListener("abort", onAbort, { once: true });
    start.focus();
  });
}

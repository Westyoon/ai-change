import {
  getGuardianEggCount,
  getGuardianInventory,
} from "../core/guardian-inventory.js";
import { createElement } from "../scenes/scene-utils.js";

let inventorySequence = 0;

function createEggItem(egg) {
  const item = createElement("li", {
    className: `story-inventory__egg${egg.acquired ? " is-acquired" : " is-locked"}`,
    dataset: {
      guardianEggId: egg.id,
      acquired: String(egg.acquired),
    },
  });
  item.style?.setProperty?.("--guardian-egg-color", egg.acquired ? egg.color : "#211923");
  item.style?.setProperty?.("--guardian-egg-ink", egg.acquired ? egg.inkColor : "#c4b5c2");

  const icon = createElement("span", {
    className: "story-inventory__egg-icon",
    attributes: { "aria-hidden": "true" },
  });
  if (egg.acquired) {
    icon.append(createElement("img", {
      className: "story-inventory__egg-art",
      attributes: {
        src: egg.imageSrc,
        alt: "",
        width: "1254",
        height: "1254",
        loading: "lazy",
        decoding: "async",
        draggable: "false",
      },
    }));
  }
  const copy = createElement("div", { className: "story-inventory__egg-copy" }, [
    createElement("strong", {
      text: egg.acquired ? egg.name : "???",
    }),
    createElement("span", {
      className: "story-inventory__egg-department",
      text: egg.acquired ? egg.departmentName : "아직 만나지 못한 수호알",
    }),
    createElement("p", {
      text: egg.acquired
        ? egg.description
        : "학과 이야기를 완료하면 이 수호알의 기억이 열립니다.",
    }),
  ]);
  item.append(icon, copy);
  return item;
}

/**
 * Story 맵에 부착하는 독립형 수호알 인벤토리입니다.
 *
 * @param {object} options
 * @param {object} options.context 애플리케이션 context
 * @param {Function} [options.onOpen] 패널이 열려 맵 입력을 잠글 때 호출
 * @param {Function} [options.onClose] 패널이 닫혀 맵 입력을 풀 때 호출
 * @param {Function} [options.onOpenMemories] 우리의 기억 진입을 대체하는 callback
 */
export function createStoryInventory({
  context,
  onOpen = null,
  onClose = null,
  onOpenMemories = null,
} = {}) {
  if (!context || typeof context !== "object") {
    throw new TypeError("createStoryInventory requires the application context.");
  }

  const panelId = `story-inventory-panel-${++inventorySequence}`;
  let opened = false;
  let destroyed = false;
  let unsubscribeAccount = null;

  const root = createElement("div", {
    className: "story-inventory",
    dataset: { open: "false" },
  });
  const triggerLabel = createElement("span", {
    className: "story-inventory__trigger-label",
    text: "수호알 0/5",
  });
  const trigger = createElement("button", {
    className: "story-inventory__trigger",
    type: "button",
    attributes: {
      "aria-controls": panelId,
      "aria-expanded": "false",
      "aria-label": "수호알 인벤토리 열기",
    },
  }, [
    createElement("span", {
      className: "story-inventory__trigger-icon",
      text: "◆",
      attributes: { "aria-hidden": "true" },
    }),
    triggerLabel,
  ]);
  const backdrop = createElement("div", {
    className: "story-inventory__backdrop",
    attributes: { "aria-hidden": "true" },
  });
  const list = createElement("ul", {
    className: "story-inventory__egg-list list-reset",
    attributes: { "aria-label": "획득한 수호알", tabindex: "0" },
  });
  const summary = createElement("p", { className: "story-inventory__summary" });
  const memoriesButton = createElement("button", {
    className: "story-inventory__memories",
    type: "button",
  }, [
    createElement("span", { text: "우리의 기억" }),
    createElement("small", { text: "지금까지 만난 이야기를 다시 봅니다." }),
  ]);
  const closeButton = createElement("button", {
    className: "story-inventory__close",
    text: "닫기",
    type: "button",
    attributes: { "aria-label": "수호알 인벤토리 닫기" },
  });
  const panel = createElement("aside", {
    className: "story-inventory__panel",
    attributes: {
      id: panelId,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": `${panelId}-title`,
    },
  }, [
    createElement("header", { className: "story-inventory__header" }, [
      createElement("div", {}, [
        createElement("p", { className: "eyebrow", text: "GUARDIAN EGGS" }),
        createElement("h2", { text: "수호알 인벤토리", attributes: { id: `${panelId}-title` } }),
      ]),
      closeButton,
    ]),
    summary,
    list,
    createElement("footer", { className: "story-inventory__footer" }, [memoriesButton]),
  ]);
  const overlay = createElement("div", { className: "story-inventory__overlay" }, [backdrop, panel]);
  overlay.hidden = true;
  panel.hidden = true;
  backdrop.hidden = true;
  root.append(trigger, overlay);

  const render = () => {
    if (destroyed) return;
    const inventory = getGuardianInventory(context);
    const count = getGuardianEggCount(context);
    triggerLabel.textContent = `수호알 ${count.acquired}/${count.total}`;
    trigger.setAttribute(
      "aria-label",
      `수호알 인벤토리 열기 · ${count.acquired}개 획득, 전체 ${count.total}개`,
    );
    summary.textContent = count.acquired === count.total
      ? "다섯 수호알이 모두 모였습니다."
      : `${count.total - count.acquired}개의 수호알이 아직 기다리고 있습니다.`;
    const items = inventory.map(createEggItem);
    if (typeof list.replaceChildren === "function") {
      list.replaceChildren(...items);
    } else {
      // Tiny DOM doubles used by the map regression suite intentionally expose
      // only append(). Keep the widget progressively compatible with them.
      if (Array.isArray(list.children)) list.children.length = 0;
      list.append(...items);
    }
  };

  const open = () => {
    if (destroyed || opened) return false;
    render();
    opened = true;
    root.dataset.open = "true";
    // Escape the scene's clipping/animation containing block. The inventory
    // must be sized against the viewport, not the map or its toolbar.
    (globalThis.document?.body ?? root).append(overlay);
    overlay.hidden = false;
    panel.hidden = false;
    backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    onOpen?.();
    globalThis.requestAnimationFrame?.(() => {
      if (opened && !destroyed) closeButton.focus?.({ preventScroll: true });
    });
    return true;
  };

  const close = () => {
    if (destroyed || !opened) return false;
    opened = false;
    root.dataset.open = "false";
    overlay.hidden = true;
    panel.hidden = true;
    backdrop.hidden = true;
    root.append(overlay);
    trigger.setAttribute("aria-expanded", "false");
    onClose?.();
    trigger.focus?.({ preventScroll: true });
    return true;
  };

  const toggle = () => (opened ? close() : open());
  const handleKeydown = (event) => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panel.querySelectorAll?.(
      "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const active = globalThis.document?.activeElement;
    const first = focusable[0];
    const last = focusable.at(-1);
    const inside = typeof panel.contains === "function"
      ? panel.contains(active)
      : focusable.includes(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus?.();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus?.();
    }
  };

  trigger.addEventListener("click", toggle);
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  memoriesButton.addEventListener("click", () => {
    close();
    if (typeof onOpenMemories === "function") {
      onOpenMemories();
    } else {
      void context.router?.navigate?.("story-memories");
    }
  });
  globalThis.document?.addEventListener?.("keydown", handleKeydown);
  if (typeof context.services?.account?.subscribe === "function") {
    unsubscribeAccount = context.services.account.subscribe(render);
  }
  render();

  return Object.freeze({
    element: root,
    trigger,
    panel,
    open,
    close,
    toggle,
    render,
    get isOpen() {
      return opened;
    },
    destroy() {
      if (destroyed) return;
      if (opened) {
        opened = false;
        onClose?.();
      }
      destroyed = true;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      globalThis.document?.removeEventListener?.("keydown", handleKeydown);
      overlay.remove?.();
      root.remove?.();
    },
  });
}

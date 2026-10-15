import { normalizeWishText } from "../core/wish-service.js";
import { WISH_DEPARTMENTS, getWishDepartment } from "../core/wish-departments.js";
import { createButton, createElement } from "../scenes/scene-utils.js";

export function createWishComposer({ service, signal, onSent = null, boardMode = false } = {}) {
  let busy = false, disposed = false, requestId = null, pendingText = null, pendingDepartment = null;
  const form = createElement("form", { className: "wish-composer" });
  const title = createElement(boardMode ? "h2" : "h1", { text: boardMode ? "새로운 소원 말하기" : "당신이 이루고 싶은 꿈은 무엇인가요?" });
  const label = createElement("label", { className: "visually-hidden", text: "나의 소원", attributes: { for: "wish-text" } });
  const input = createElement("textarea", { className: "wish-composer__input", attributes: {
    id: "wish-text", rows: "4", maxlength: "600", required: "", placeholder: "이번 학기엔 나에게 조금 더 다정해지고 싶어.",
    "aria-describedby": "wish-hint",
  } });
  const hint = createElement("p", { text: "아주 작은 바람도 괜찮아요. 지금 떠오르는 마음을 적어주세요.", attributes: { id: "wish-hint" } });
  const department = createElement("select", { className: "wish-department-select", attributes: { id: "wish-department", required: "" } }, [
    createElement("option", { text: "학과를 골라주세요", attributes: { value: "" } }),
    ...WISH_DEPARTMENTS.map((item) => createElement("option", { text: item.name, attributes: { value: item.code } })),
  ]);
  const departmentField = createElement("div", { className: "wish-department-field" }, [
    createElement("label", { text: "학과", attributes: { for: "wish-department" } }), department,
  ]);
  const status = createElement("p", { className: "wish-composer__status", attributes: { role: "status", "aria-live": "polite" } });
  const button = createElement("button", { className: "button button--primary", type: "submit", text: boardMode ? "메모지 붙이기" : "엠브리오에게 소원 전하기", disabled: true });
  input.addEventListener("input", () => {
    const valid = normalizeWishText(input.value);
    button.disabled = busy || !valid || !getWishDepartment(department.value);
    status.textContent = input.value.trim() && !valid ? "소원을 조금 짧게 적어 주세요." : "";
  });
  department.addEventListener("change", () => {
    const selected = getWishDepartment(department.value);
    form.dataset.department = selected?.code ?? "";
    if (selected) form.style.setProperty("--note-color", selected.color);
    else form.style.removeProperty("--note-color");
    button.disabled = busy || !normalizeWishText(input.value) || !selected;
  });
  const result = { element: form, onSent, destroy() { disposed = true; } };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = normalizeWishText(input.value);
    const selected = getWishDepartment(department.value);
    if (busy || disposed || !text || !selected) return;
    busy = true; button.disabled = true; input.disabled = true; department.disabled = true; status.textContent = "";
    if (pendingText !== text || pendingDepartment !== selected.code) {
      pendingText = text; pendingDepartment = selected.code; requestId = globalThis.crypto.randomUUID();
    }
    try {
      const wish = await service.submit(text, { requestId, department: selected.code, signal });
      if (disposed || signal?.aborted) return;
      input.value = ""; requestId = null; pendingText = null; pendingDepartment = null;
      status.textContent = boardMode ? "소원을 게시판에 붙였어요." : "소원이 엠브리오에게 닿았어요.";
      result.onSent?.(wish);
    } catch (error) {
      if (!disposed && !signal?.aborted) status.textContent = error.message || "다시 시도해 주세요.";
    } finally {
      busy = false;
      if (!disposed) { input.disabled = false; department.disabled = false; button.disabled = !normalizeWishText(input.value) || !getWishDepartment(department.value); }
    }
  });
  form.append(title, hint, departmentField, label, input, button, status);
  return result;
}

export function wishCard(wish) {
  const department = getWishDepartment(wish.department);
  const card = createElement("article", { className: "wish-card", dataset: { wishId: wish.id, department: department?.code ?? "" } }, [
    createElement("span", { className: "wish-card__department", text: department?.name ?? "소원" }),
    createElement("p", { className: "wish-card__text", text: wish.text }),
    createElement("span", { className: "wish-card__name", text: wish.nickname }),
  ]);
  card.style.setProperty("--note-color", department?.color ?? "#fff2c5");
  return card;
}

export function createWishList({ service, signal } = {}) {
  let disposed = false, busy = false, cursor = null, generation = 0;
  const seen = new Set();
  const submitted = new Map();
  const element = createElement("section", { className: "wish-board", attributes: { "aria-label": "모두의 소원" } });
  const grid = createElement("div", { className: "wish-board__grid" });
  const status = createElement("p", { className: "wish-board__status", attributes: { role: "status" } });
  const more = createButton("소원 더 보기", () => void load(false)); more.hidden = true;
  const filter = createElement("select", { className: "wish-department-select", attributes: { id: "wish-board-department" } }, [
    createElement("option", { text: "전체 학과", attributes: { value: "" } }),
    ...WISH_DEPARTMENTS.map((item) => createElement("option", { text: item.name, attributes: { value: item.code } })),
  ]);
  filter.addEventListener("change", () => void load(true));
  const append = (wish, first = false) => {
    if (seen.has(wish.id) || (filter.value && wish.department !== filter.value)) return;
    seen.add(wish.id); const node = wishCard(wish); first ? grid.prepend(node) : grid.append(node);
  };
  const load = async (reset) => {
    if ((busy && !reset) || disposed) return;
    busy = true; more.disabled = true;
    const version = ++generation;
    status.textContent = "소원을 모으고 있어요…";
    try {
      const page = await service.list({ after: reset ? null : cursor, department: filter.value || null, signal });
      if (disposed || signal?.aborted || version !== generation) return;
      if (reset) { grid.replaceChildren(); seen.clear(); }
      for (const wish of page.wishes) append(wish);
      for (const wish of submitted.values()) append(wish, true);
      cursor = page.nextCursor; more.hidden = !cursor;
      status.textContent = seen.size ? "" : "첫 번째 소원을 들려주세요.";
    } catch {
      if (!disposed && !signal?.aborted && version === generation) status.textContent = "소원을 불러오지 못했습니다. 다시 확인해 주세요.";
    } finally { if (version === generation) { busy = false; more.disabled = false; } }
  };
  element.append(createElement("div", { className: "wish-board__heading" }, [createElement("h2", { text: "모두의 소원" })]),
    createElement("div", { className: "wish-board__filter" }, [createElement("label", { text: "학과별 소원", attributes: { for: "wish-board-department" } }), filter]), grid, status, more);
  void load(true);
  return { element, prepend(wish) { if (!disposed) { submitted.set(wish.id, wish); append(wish, true); status.textContent = ""; } }, destroy() { disposed = true; generation++; } };
}

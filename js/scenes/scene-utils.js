export function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = String(options.text);
  }
  if (options.type) {
    element.type = options.type;
  }
  if (options.disabled !== undefined) {
    element.disabled = Boolean(options.disabled);
  }

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    if (value !== null && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    element.dataset[name] = String(value);
  }
  for (const [eventName, listener] of Object.entries(options.on ?? {})) {
    element.addEventListener(eventName, listener);
  }

  const normalizedChildren = Array.isArray(children) ? children : [children];
  for (const child of normalizedChildren) {
    if (child === null || child === undefined) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return element;
}

export function createButton(label, onClick, variant = "") {
  return createElement("button", {
    className: `button${variant ? ` button--${variant}` : ""}`,
    text: label,
    type: "button",
    on: { click: onClick },
  });
}

export function createScene({ className = "", eyebrow, title, description } = {}) {
  const section = createElement("section", {
    className: `scene ${className}`.trim(),
  });
  if (eyebrow) section.append(createElement("p", { className: "eyebrow", text: eyebrow }));
  if (title) section.append(createElement("h1", { text: title }));
  if (description) section.append(createElement("p", { className: "muted", text: description }));
  return section;
}

export function findDepartment(context, code) {
  return context.content?.departments?.find((department) => department.code === code) ?? null;
}

export function findMiniGame(context, id) {
  return context.content?.minigames?.find((game) => game.id === id) ?? null;
}

export function findMap(context, id = context.config.mainMapId) {
  return context.content?.maps?.find((map) => map.id === id) ?? null;
}

export function findScript(context, id) {
  return context.content?.scripts?.find((script) => script.id === id) ?? null;
}

export function showToast(context, message, durationMs = 2800) {
  const root = context.toastRoot;
  if (!root) return;
  const toast = createElement("div", { className: "toast", text: message, attributes: { role: "status" } });
  root.append(toast);
  window.setTimeout(() => toast.remove(), durationMs);
}

export function createBackButton(context, fallbackScene = "main-menu") {
  return createButton("뒤로", () => context.router.navigate(fallbackScene), "ghost");
}

const FALLBACK_GOAL = "화면에 표시되는 목표를 완료하세요.";
const FALLBACK_CONTROLS = Object.freeze({
  pc: Object.freeze(["화면 버튼 또는 안내된 키를 사용하세요."]),
  mobile: Object.freeze(["화면 버튼을 터치해 조작하세요."]),
});

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeControlItems(config, key) {
  const direct = config?.controls?.[key];
  const legacy = key === "pc" ? config?.pcControls : config?.mobileControls;
  const source = Array.isArray(direct) ? direct : (Array.isArray(legacy) ? legacy : []);
  const items = source.map(nonEmptyText).filter(Boolean);
  return Object.freeze(items.length > 0 ? items : [...FALLBACK_CONTROLS[key]]);
}

export function getMiniGameInstructions(config = {}) {
  return Object.freeze({
    goal: nonEmptyText(config?.goal)
      ?? nonEmptyText(config?.objective)
      ?? nonEmptyText(config?.scaffold?.objective)
      ?? FALLBACK_GOAL,
    pc: normalizeControlItems(config, "pc"),
    mobile: normalizeControlItems(config, "mobile"),
  });
}

const MODULE_LOADERS = Object.freeze({
  "data-number-baseball": () => import("./number-baseball/index.js"),
  "cyber-click-to-purify": () => import("./click-to-purify/index.js"),
  "computer-code-heart": () => import("./code-heart/index.js"),
  "ai-ball-classification": () => import("./ai-ball-classification/index.js"),
  "ai-data-egg-sort": () => import("./ai-data-egg-sort/index.js"),
});

export function hasMiniGameModule(moduleKey) {
  return Object.hasOwn(MODULE_LOADERS, moduleKey);
}

export async function loadMiniGameModule(moduleKey) {
  if (!hasMiniGameModule(moduleKey)) {
    throw new Error(`Mini-game module is not registered: ${String(moduleKey)}`);
  }
  const module = await MODULE_LOADERS[moduleKey]();
  if (typeof module.createMiniGame !== "function") {
    throw new TypeError(`Mini-game module ${moduleKey} does not export createMiniGame(context).`);
  }
  return module;
}

export function listMiniGameModuleKeys() {
  return Object.keys(MODULE_LOADERS);
}

export default MODULE_LOADERS;

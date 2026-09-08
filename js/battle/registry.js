// Keep Battle imports in a static allowlist. Content data may select a key,
// but it can never turn an arbitrary path into executable code.
const BATTLE_MODULE_LOADERS = Object.freeze({
  "control-boss": () => import("./postgame/bosses/control-boss/index.js"),
  "data-sphinx": () => import("./postgame/bosses/data-sphinx/index.js"),
  "stat-boss": () => import("./postgame/bosses/stat-boss/index.js"),
  "xr-egg-trials": () => import("./postgame/challenges/xr-egg-trials/index.js"),
});

export function hasBattleModule(moduleKey) {
  return Object.hasOwn(BATTLE_MODULE_LOADERS, moduleKey);
}

export async function loadBattleModule(moduleKey) {
  if (!hasBattleModule(moduleKey)) {
    throw new Error(`Battle module is not registered: ${String(moduleKey)}`);
  }
  const module = await BATTLE_MODULE_LOADERS[moduleKey]();
  if (typeof module.createBattle !== "function") {
    throw new TypeError(`Battle module ${moduleKey} does not export createBattle(context).`);
  }
  return module;
}

export function listBattleModuleKeys() {
  return Object.keys(BATTLE_MODULE_LOADERS);
}

export function getPublishedBattles(definitions = []) {
  if (!Array.isArray(definitions)) {
    throw new TypeError("Battle definitions must be an array.");
  }
  return definitions.filter(
    (definition) =>
      definition?.status === "published" &&
      typeof definition.module === "string" &&
      hasBattleModule(definition.module),
  );
}

export default BATTLE_MODULE_LOADERS;

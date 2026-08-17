// Battle content is intentionally empty for the MVP. Keeping this allowlist
// separate from the story mini-game registry lets future battle modules be
// added without changing story routing.
const BATTLE_MODULE_LOADERS = Object.freeze({});

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

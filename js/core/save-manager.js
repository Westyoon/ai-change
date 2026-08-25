import { CONTENT_VERSION } from "./version.js";

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeKnown(base, value) {
  if (!isObject(base) || !isObject(value)) {
    return value === undefined ? clone(base) : clone(value);
  }
  const merged = {};
  for (const [key, defaultValue] of Object.entries(base)) {
    merged[key] = Object.hasOwn(value, key)
      ? mergeKnown(defaultValue, value[key])
      : clone(defaultValue);
  }
  return merged;
}

function createDefaultState(miniGameIds, defaults) {
  const gameDefaults = Object.fromEntries(
    miniGameIds.map((id) => [
      id,
      {
        completed: false,
        playCount: 0,
        bestScore: null,
        bestMetrics: null,
      },
    ]),
  );

  const base = {
    version: CONTENT_VERSION,
    revision: 0,
    updatedAt: null,
    story: {
      introSeen: false,
      completedNpcIds: [],
      lastMapId: null,
      lastPlayerPosition: null,
    },
    minigames: gameDefaults,
    settings: {
      masterVolume: 1,
      bgmVolume: 0.7,
      sfxVolume: 0.8,
      muted: false,
    },
  };

  const provided = isObject(defaults) ? defaults : {};
  const result = mergeKnown(base, { ...base, ...provided });
  result.version = CONTENT_VERSION;
  result.revision = 0;
  result.updatedAt = null;
  result.minigames = Object.fromEntries(
    miniGameIds.map((id) => [
      id,
      mergeKnown(gameDefaults[id], provided.minigames?.[id] ?? gameDefaults[id]),
    ]),
  );
  return result;
}

export class SaveManager {
  #defaults;
  #miniGameIds;
  #state;
  #storage = null;
  #readOnly = false;
  #persistedRevision = 0;

  constructor({ appId, storageChannel, miniGameIds, defaults = {}, storage } = {}) {
    if (typeof appId !== "string" || appId.length === 0) {
      throw new TypeError("SaveManager requires appId.");
    }
    if (typeof storageChannel !== "string" || storageChannel.length === 0) {
      throw new TypeError("SaveManager requires storageChannel.");
    }
    if (!Array.isArray(miniGameIds) || new Set(miniGameIds).size !== miniGameIds.length) {
      throw new TypeError("SaveManager requires unique miniGameIds.");
    }

    this.appId = appId;
    this.storageChannel = storageChannel;
    this.key = `${appId}:${storageChannel}:save:v${CONTENT_VERSION}`;
    this.#miniGameIds = [...miniGameIds];
    this.#defaults = createDefaultState(this.#miniGameIds, defaults);
    this.#state = clone(this.#defaults);
    this.lastError = null;

    try {
      this.#storage = storage ?? globalThis.localStorage ?? null;
    } catch (error) {
      this.lastError = error;
      this.#storage = null;
    }
  }

  get persistenceAvailable() {
    return this.#storage !== null && !this.#readOnly;
  }

  get readOnly() {
    return this.#readOnly;
  }

  load() {
    this.lastError = null;
    if (!this.#storage) {
      this.#state = clone(this.#defaults);
      return this.getState();
    }

    let raw;
    try {
      raw = this.#storage.getItem(this.key);
    } catch (error) {
      this.lastError = error;
      this.#storage = null;
      return this.getState();
    }

    if (raw == null) {
      this.#state = clone(this.#defaults);
      this.#persistedRevision = 0;
      return this.getState();
    }

    try {
      const stored = JSON.parse(raw);
      if (!isObject(stored) || !Number.isInteger(stored.version)) {
        throw new TypeError("Save data has no valid version.");
      }
      if (stored.version > CONTENT_VERSION) {
        this.#readOnly = true;
        this.lastError = new Error("Save data was created by a newer content version.");
        return this.getState();
      }
      if (stored.version !== CONTENT_VERSION || !Number.isInteger(stored.revision)) {
        throw new TypeError("Save data version is unsupported.");
      }

      this.#state = this.#normalizeStored(stored);
      this.#persistedRevision = stored.revision;
      return this.getState();
    } catch (error) {
      this.lastError = error;
      this.#backupCorrupt(raw);
      this.#state = clone(this.#defaults);
      this.#persistedRevision = 0;
      return this.getState();
    }
  }

  getState() {
    return clone(this.#state);
  }

  save() {
    this.lastError = null;
    if (!this.#storage || this.#readOnly) {
      return false;
    }

    try {
      const currentRaw = this.#storage.getItem(this.key);
      if (currentRaw != null) {
        const current = JSON.parse(currentRaw);
        if (current.revision !== this.#persistedRevision) {
          this.#readOnly = true;
          this.lastError = new Error("Save data changed in another browser tab.");
          return false;
        }
      } else if (this.#persistedRevision !== 0) {
        this.#readOnly = true;
        this.lastError = new Error("Save data was reset in another browser tab.");
        return false;
      }

      const next = clone(this.#state);
      next.revision = this.#persistedRevision + 1;
      next.updatedAt = new Date().toISOString();
      this.#storage.setItem(this.key, JSON.stringify(next));
      this.#state = next;
      this.#persistedRevision = next.revision;
      return true;
    } catch (error) {
      this.lastError = error;
      return false;
    }
  }

  applyResult(miniGameId, result, { completedNpcIds = [] } = {}) {
    if (!this.#miniGameIds.includes(miniGameId)) {
      throw new Error(`Unknown mini-game id: ${String(miniGameId)}`);
    }
    const status = result?.status;
    if (status === "QUIT" || status === "ERROR") {
      return this.getState();
    }
    if (status !== "CLEAR" && status !== "FAIL") {
      throw new TypeError(`Invalid persisted result status: ${String(status)}`);
    }
    if (!Array.isArray(completedNpcIds) || completedNpcIds.some((id) => typeof id !== "string" || id.length === 0)) {
      throw new TypeError("completedNpcIds must contain non-empty string ids.");
    }

    const record = this.#state.minigames[miniGameId];
    record.playCount += 1;
    if (status === "CLEAR") {
      record.completed = true;
    }
    for (const npcId of completedNpcIds) {
      if (!this.#state.story.completedNpcIds.includes(npcId)) {
        this.#state.story.completedNpcIds.push(npcId);
      }
    }
    this.save();
    return this.getState();
  }

  markIntroSeen() {
    if (this.#state.story.introSeen) {
      return this.getState();
    }
    this.#state.story.introSeen = true;
    this.save();
    return this.getState();
  }

  markNpcCompleted(npcId) {
    if (typeof npcId !== "string" || npcId.length === 0) {
      throw new TypeError("NPC id must be a non-empty string.");
    }
    if (this.#state.story.completedNpcIds.includes(npcId)) {
      return this.getState();
    }
    this.#state.story.completedNpcIds.push(npcId);
    this.save();
    return this.getState();
  }

  updateMapPosition(mapId, position) {
    if (typeof mapId !== "string" || mapId.length === 0) {
      throw new TypeError("Map id must be a non-empty string.");
    }
    if (
      position !== null &&
      (!isObject(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y))
    ) {
      throw new TypeError("Map position must contain finite x/y coordinates or be null.");
    }
    this.#state.story.lastMapId = mapId;
    this.#state.story.lastPlayerPosition = position === null ? null : { x: position.x, y: position.y };
    this.save();
    return this.getState();
  }

  updateSettings(partial = {}) {
    if (!isObject(partial)) {
      throw new TypeError("Settings update must be an object.");
    }
    let changed = false;
    for (const key of ["masterVolume", "bgmVolume", "sfxVolume"]) {
      if (!Object.hasOwn(partial, key)) {
        continue;
      }
      const value = partial[key];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${key} must be a finite number from 0 to 1.`);
      }
      if (this.#state.settings[key] !== value) {
        this.#state.settings[key] = value;
        changed = true;
      }
    }
    if (Object.hasOwn(partial, "muted")) {
      if (typeof partial.muted !== "boolean") {
        throw new TypeError("muted must be boolean.");
      }
      if (this.#state.settings.muted !== partial.muted) {
        this.#state.settings.muted = partial.muted;
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
    return this.getState();
  }

  resetProgress({ includeSettings = false } = {}) {
    const settings = includeSettings
      ? clone(this.#defaults.settings)
      : clone(this.#state.settings);
    this.#state.story = clone(this.#defaults.story);
    this.#state.minigames = clone(this.#defaults.minigames);
    this.#state.settings = settings;
    this.save();
    return this.getState();
  }

  #normalizeStored(stored) {
    const normalized = clone(this.#defaults);
    normalized.revision = stored.revision;
    normalized.updatedAt = typeof stored.updatedAt === "string" ? stored.updatedAt : null;

    if (isObject(stored.story)) {
      normalized.story.introSeen = stored.story.introSeen === true;
      normalized.story.completedNpcIds = Array.isArray(stored.story.completedNpcIds)
        ? [...new Set(stored.story.completedNpcIds.filter((id) => typeof id === "string"))]
        : [];
      normalized.story.lastMapId =
        typeof stored.story.lastMapId === "string" ? stored.story.lastMapId : normalized.story.lastMapId;
      const position = stored.story.lastPlayerPosition;
      normalized.story.lastPlayerPosition =
        isObject(position) && Number.isFinite(position.x) && Number.isFinite(position.y)
          ? { x: position.x, y: position.y }
          : null;
    }

    for (const id of this.#miniGameIds) {
      const storedGame = stored.minigames?.[id];
      if (!isObject(storedGame)) {
        continue;
      }
      normalized.minigames[id].completed = storedGame.completed === true;
      normalized.minigames[id].playCount = Number.isInteger(storedGame.playCount)
        ? Math.max(0, storedGame.playCount)
        : 0;
      normalized.minigames[id].bestScore = Number.isFinite(storedGame.bestScore)
        ? storedGame.bestScore
        : null;
      normalized.minigames[id].bestMetrics = isObject(storedGame.bestMetrics)
        ? clone(storedGame.bestMetrics)
        : null;
    }

    if (isObject(stored.settings)) {
      for (const key of ["masterVolume", "bgmVolume", "sfxVolume"]) {
        const value = stored.settings[key];
        if (Number.isFinite(value) && value >= 0 && value <= 1) {
          normalized.settings[key] = value;
        }
      }
      if (typeof stored.settings.muted === "boolean") {
        normalized.settings.muted = stored.settings.muted;
      }
    }
    return normalized;
  }

  #backupCorrupt(raw) {
    if (!this.#storage) {
      return;
    }
    try {
      const limited = raw.slice(0, 64 * 1024);
      this.#storage.setItem(`${this.key}:corrupt-latest`, limited);
    } catch {
      // Recovery must continue even when a backup cannot be written.
    }
  }
}

export default SaveManager;

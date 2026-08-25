const SUPPORTED_TYPES = new Set(["json", "image"]);

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The asset load was aborted.", "AbortError");
  }
  const error = new Error("The asset load was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }
}

function resolveBaseUrl(manifest) {
  const fallback = globalThis.document?.baseURI ?? globalThis.location?.href ?? import.meta.url;
  return new URL(manifest?.baseUrl ?? "./", fallback);
}

export class AssetLoader {
  #assets = new Map();
  #cache = new Map();
  #groupRefs = new Map();
  #baseUrl;

  constructor(manifest) {
    if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.assets)) {
      throw new TypeError("AssetLoader requires a manifest with an assets array.");
    }

    this.manifest = manifest;
    this.#baseUrl = resolveBaseUrl(manifest);
    for (const asset of manifest.assets) {
      if (!asset || typeof asset.id !== "string" || asset.id.length === 0) {
        throw new TypeError("Every manifest asset requires a non-empty id.");
      }
      if (this.#assets.has(asset.id)) {
        throw new Error(`Duplicate asset id: ${asset.id}`);
      }
      if (!SUPPORTED_TYPES.has(asset.type)) {
        throw new TypeError(`Unsupported asset type for ${asset.id}: ${String(asset.type)}`);
      }
      if (typeof asset.src !== "string" || asset.src.length === 0) {
        throw new TypeError(`Asset ${asset.id} requires a source path.`);
      }
      this.#assets.set(asset.id, Object.freeze({ ...asset }));
    }
  }

  has(id) {
    return this.#assets.has(id);
  }

  get(id) {
    const entry = this.#cache.get(id);
    return entry?.state === "ready" ? entry.value : undefined;
  }

  async load(id, { signal } = {}) {
    throwIfAborted(signal);
    const asset = this.#assets.get(id);
    if (!asset) {
      throw new Error(`Unknown asset id: ${String(id)}`);
    }

    const cached = this.#cache.get(id);
    if (cached?.state === "ready") {
      return cached.value;
    }
    if (cached?.state === "pending") {
      return this.#waitFor(cached.promise, signal);
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason ?? createAbortError());
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const promise = this.#loadAsset(asset, controller.signal)
      .then((loaded) => {
        if (this.#cache.get(id)?.promise === promise) {
          this.#cache.set(id, {
            state: "ready",
            value: loaded.value,
            objectUrl: loaded.objectUrl ?? null,
          });
        }
        return loaded.value;
      })
      .catch((error) => {
        // Failed or aborted promises must never poison a later retry.
        if (this.#cache.get(id)?.promise === promise) {
          this.#cache.delete(id);
        }
        throw error;
      })
      .finally(() => {
        signal?.removeEventListener("abort", forwardAbort);
      });

    this.#cache.set(id, { state: "pending", promise, controller });
    return promise;
  }

  async loadGroup(group, { signal, onProgress } = {}) {
    if (typeof group !== "string" || group.length === 0) {
      throw new TypeError("Asset group must be a non-empty string.");
    }
    throwIfAborted(signal);

    const definitions = [...this.#assets.values()].filter((asset) => asset.group === group);
    if (definitions.length === 0) {
      throw new Error(`Unknown or empty asset group: ${group}`);
    }

    const loaded = new Map();
    let completed = 0;
    await Promise.all(
      definitions.map(async (asset) => {
        try {
          const value = await this.load(asset.id, { signal });
          loaded.set(asset.id, value);
          completed += 1;
          onProgress?.({
            group,
            id: asset.id,
            loaded: completed,
            total: definitions.length,
            ratio: completed / definitions.length,
            status: "loaded",
          });
        } catch (error) {
          onProgress?.({
            group,
            id: asset.id,
            loaded: completed,
            total: definitions.length,
            ratio: completed / definitions.length,
            status: "failed",
            error,
          });
          throw error;
        }
      }),
    );
    return loaded;
  }

  async acquireGroup(group, options = {}) {
    const assets = await this.loadGroup(group, options);
    this.#groupRefs.set(group, (this.#groupRefs.get(group) ?? 0) + 1);

    let released = false;
    return Object.freeze({
      group,
      assets,
      release: () => {
        if (released) {
          return false;
        }
        released = true;
        return this.releaseGroup(group);
      },
    });
  }

  releaseGroup(group) {
    const references = this.#groupRefs.get(group) ?? 0;
    if (references === 0) {
      return false;
    }
    if (references > 1) {
      this.#groupRefs.set(group, references - 1);
      return true;
    }

    this.#groupRefs.delete(group);
    for (const asset of this.#assets.values()) {
      if (asset.group === group) {
        this.#evict(asset.id);
      }
    }
    return true;
  }

  dispose() {
    for (const id of [...this.#cache.keys()]) {
      this.#evict(id);
    }
    this.#groupRefs.clear();
  }

  async #loadAsset(asset, signal) {
    if (typeof fetch !== "function") {
      throw new Error("This environment does not provide fetch().");
    }
    const url = new URL(asset.src, this.#baseUrl);
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to load asset ${asset.id}: HTTP ${response.status}`);
    }

    if (asset.type === "json") {
      return { value: await response.json() };
    }
    return this.#decodeImage(asset, await response.blob(), signal);
  }

  async #decodeImage(asset, blob, signal) {
    throwIfAborted(signal);
    if (typeof Image !== "function" || !globalThis.URL?.createObjectURL) {
      throw new Error(`Image decoding is unavailable for asset ${asset.id}.`);
    }

    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.alt = asset.alt ?? "";

    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          image.onload = null;
          image.onerror = null;
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          cleanup();
          image.src = "";
          reject(signal.reason ?? createAbortError());
        };
        image.onload = () => {
          cleanup();
          resolve();
        };
        image.onerror = () => {
          cleanup();
          reject(new Error(`Failed to decode image asset ${asset.id}.`));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        image.src = objectUrl;
      });
      throwIfAborted(signal);
      return { value: image, objectUrl };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  #waitFor(promise, signal) {
    if (!signal) {
      return promise;
    }
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? createAbortError());
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  #evict(id) {
    const entry = this.#cache.get(id);
    if (!entry) {
      return;
    }
    if (entry.state === "pending") {
      entry.controller?.abort(createAbortError());
    }
    if (entry.state === "ready") {
      if (
        typeof globalThis.HTMLImageElement === "function" &&
        entry.value instanceof globalThis.HTMLImageElement
      ) {
        entry.value.src = "";
      }
      if (entry.objectUrl && globalThis.URL?.revokeObjectURL) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    }
    this.#cache.delete(id);
  }
}

export default AssetLoader;

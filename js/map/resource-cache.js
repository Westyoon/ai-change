function abortError(signal) {
  return signal?.reason ?? new DOMException("Map preparation aborted.", "AbortError");
}

// Cancel only this consumer: another map or background preload may share the work.
export function waitForResource(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(abortError(signal)); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export class CampusResourceCache {
  constructor({ fetch: fetchResource = (...args) => globalThis.fetch(...args), createImage = () => new Image() } = {}) {
    this.fetch = fetchResource;
    this.createImage = createImage;
    this.jsonEntries = new Map();
    this.imageEntries = new Map();
  }
  load(entries, src, loader, signal) {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    let promise = entries.get(src);
    if (!promise) {
      promise = Promise.resolve().then(loader).catch(error => {
        if (entries.get(src) === promise) entries.delete(src);
        throw error;
      });
      entries.set(src, promise);
    }
    return waitForResource(promise, signal);
  }
  json(src, { signal } = {}) {
    return this.load(this.jsonEntries, src, async () => {
      const response = await this.fetch(src);
      if (!response.ok) throw new Error(`맵 정보를 불러오지 못했습니다: ${src}`);
      return response.json();
    }, signal);
  }
  image(src, { signal } = {}) {
    return this.load(this.imageEntries, src, async () => {
      const image = this.createImage();
      image.decoding = "async";
      image.src = src;
      await image.decode();
      return image;
    }, signal);
  }
}

// Hold decoded images as well as pending promises for the lifetime of this page.
export const campusResources = new CampusResourceCache();

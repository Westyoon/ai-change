import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AudioManager } from "../../js/core/audio-manager.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ type });
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

function nextTask() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("looping BGM retries on the first gesture without restarting or leaking listeners", async () => {
  const originalAudio = globalThis.Audio;
  const instances = [];

  globalThis.Audio = class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 12;
      this.loop = false;
      this.preload = "";
      this.muted = false;
      this.volume = 1;
      this.playCalls = 0;
      this.pauseCalls = 0;
      instances.push(this);
    }

    play() {
      this.playCalls += 1;
      return this.playCalls === 1
        ? Promise.reject(Object.assign(new Error("autoplay blocked"), { name: "NotAllowedError" }))
        : Promise.resolve();
    }

    pause() {
      this.pauseCalls += 1;
    }
  };

  try {
    const events = new FakeEventTarget();
    const audio = new AudioManager({ masterVolume: 0.5, bgmVolume: 0.8 });
    const element = audio.register("main-theme", "./assets/bgm/main-theme.mp3", {
      kind: "bgm",
      loop: true,
      volume: 0.5,
    });

    assert.equal(element, instances[0]);
    assert.equal(element.loop, true);
    assert.equal(element.preload, "auto");
    assert.equal(element.volume, 0.2);

    audio.playWhenAllowed("main-theme", { restart: false, eventTarget: events });
    await nextTask();
    assert.equal(element.playCalls, 1);
    assert.equal(events.listenerCount(), 3);

    events.dispatch("pointerdown");
    await nextTask();
    assert.equal(element.playCalls, 2);
    assert.equal(element.currentTime, 12);
    assert.equal(events.listenerCount(), 0);

    audio.setMuted(true);
    assert.equal(element.muted, true);
    audio.stopAll();
    assert.equal(element.pauseCalls, 1);
    assert.equal(element.currentTime, 0);
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test("loading registers the provided main theme as persistent BGM", async () => {
  const source = await readFile(new URL("../../js/scenes/loading-scene.js", import.meta.url), "utf8");

  assert.match(source, /MAIN_THEME_SOURCE\s*=\s*["']\.\/assets\/bgm\/main-theme\.mp3["']/u);
  assert.match(source, /register\(MAIN_THEME_TRACK_ID,\s*MAIN_THEME_SOURCE,[\s\S]*?kind:\s*["']bgm["'][\s\S]*?loop:\s*true/u);
  assert.match(source, /playWhenAllowed\?\.\(MAIN_THEME_TRACK_ID,\s*\{\s*restart:\s*false\s*\}\)/u);
});

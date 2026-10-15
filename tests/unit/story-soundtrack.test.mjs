import assert from "node:assert/strict";
import test from "node:test";
import { StorySoundtrack } from "../../js/core/story-soundtrack.js";

test("suspended autoplay never piles up notes and mute/unmount stop the score", () => {
  const previous = { AudioContext: globalThis.AudioContext, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let notes = 0, nextId = 0; const timers = new Map();
  class Context {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createOscillator() { return { frequency: {}, connect() {}, start() { notes++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  globalThis.AudioContext = Context;
  globalThis.setTimeout = (fn) => { timers.set(++nextId, fn); return nextId; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const step = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); };
  const audio = { settings: { muted: false, masterVolume: 1, bgmVolume: .5 } };
  const score = new StorySoundtrack(audio);
  try {
    score.play("festival"); for (let i = 0; i < 8; i++) step();
    assert.equal(notes, 0, "no scheduled voice burst before a browser gesture");
    score.context.state = "running"; step(); assert.equal(notes, 2);
    audio.settings.muted = true; step(); assert.equal(notes, 2);
    score.destroy(); assert.equal(timers.size, 0);
  } finally {
    score.destroy();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

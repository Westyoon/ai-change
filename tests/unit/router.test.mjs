import assert from "node:assert/strict";
import test from "node:test";

import { SceneRouter } from "../../js/router.js";

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createRoot() {
  return {
    dataset: {},
    focusCalls: [],
    replaceChildren() {},
    removeAttribute() {},
    focus(options) {
      this.focusCalls.push(options);
    },
  };
}

function installBrowserGlobals() {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    scrollTo: globalThis.scrollTo,
  };
  const frames = [];
  const scrollCalls = [];
  globalThis.document = { body: { dataset: {} } };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.scrollTo = (...args) => scrollCalls.push(args);
  return {
    frames,
    scrollCalls,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}

test("SceneRouter resets page scroll only after the latest scene mounts successfully", async () => {
  const browser = installBrowserGlobals();
  try {
    const root = createRoot();
    const context = { state: {} };
    const router = new SceneRouter({
      root,
      context,
      routes: {
        ready: () => ({ async mount() {} }),
      },
    });

    assert.equal(await router.navigate("ready"), true);
    assert.deepEqual(browser.scrollCalls, [[0, 0]]);
    assert.equal(root.focusCalls.length, 0);
    browser.frames.shift()();
    assert.deepEqual(root.focusCalls, [{ preventScroll: true }]);
    router.destroy();
  } finally {
    browser.restore();
  }
});

test("SceneRouter does not reset scroll for a scene invalidated during mount", async () => {
  const browser = installBrowserGlobals();
  try {
    const root = createRoot();
    const mountGate = deferred();
    const router = new SceneRouter({
      root,
      context: { state: {} },
      routes: {
        slow: () => ({ mount: () => mountGate.promise }),
      },
    });

    const navigation = router.navigate("slow");
    router.destroy();
    mountGate.resolve();
    assert.equal(await navigation, false);
    assert.deepEqual(browser.scrollCalls, []);
    assert.deepEqual(browser.frames, []);
  } finally {
    browser.restore();
  }
});

test("SceneRouter keeps a mounted scene when a patched scroll API throws", async () => {
  const browser = installBrowserGlobals();
  try {
    const root = createRoot();
    globalThis.scrollTo = () => {
      throw new Error("scroll unavailable");
    };
    const router = new SceneRouter({
      root,
      context: { state: {} },
      routes: {
        ready: () => ({ async mount() {} }),
      },
    });

    assert.equal(await router.navigate("ready"), true);
    assert.equal(browser.frames.length, 1);
    router.destroy();
  } finally {
    browser.restore();
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { SceneRouter } from "../../js/router.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
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

test("SceneRouter clears shared held input before every accepted scene transition", async () => {
  const browser = installBrowserGlobals();
  try {
    const root = createRoot();
    const events = [];
    const context = {
      state: {},
      services: {
        input: {
          clear() {
            events.push("clear");
          },
        },
      },
    };
    const router = new SceneRouter({
      root,
      context,
      routes: {
        first: () => ({
          async mount() {
            events.push("mount:first");
          },
          async unmount() {
            events.push("unmount:first");
          },
        }),
        second: () => ({
          async mount() {
            events.push("mount:second");
          },
        }),
      },
    });

    await router.navigate("first");
    await router.navigate("second");

    assert.deepEqual(events, [
      "clear",
      "mount:first",
      "clear",
      "unmount:first",
      "mount:second",
    ]);
    router.destroy();
  } finally {
    browser.restore();
  }
});

test("SceneRouter keeps the old view and lifecycle alive until detached preparation is ready",async()=>{
  const browser=installBrowserGlobals();
  try {
    const events=[],gate=deferred();let oldSignal;
    const root={...createRoot(),replaceChildren(){events.push("replace");}};
    const router=new SceneRouter({root,context:{state:{}},routes:{
      old:()=>({mount(_root,_params,{signal}){oldSignal=signal;},unmount(){events.push("unmount");}}),
      next:()=>({async prepare(){events.push("prepare");await gate.promise;events.push("ready");},mount(){events.push("mount");}}),
    }});
    await router.navigate("old");events.length=0;
    const transition=router.navigate("next");await Promise.resolve();
    assert.deepEqual(events,["prepare"]);assert.equal(oldSignal.aborted,false);assert.equal(root.dataset.scene,"old");
    gate.resolve();assert.equal(await transition,true);
    assert.deepEqual(events,["prepare","ready","unmount","replace","mount"]);assert.equal(oldSignal.aborted,true);
    router.destroy();
  } finally {browser.restore();}
});

test("destroy during map preparation aborts it without mounting the prepared scene",async()=>{
  const browser=installBrowserGlobals();
  try {
    const gate=deferred();let signal,mounts=0;
    const router=new SceneRouter({root:createRoot(),context:{state:{}},routes:{
      next:()=>({prepare(_params,lifecycle){signal=lifecycle.signal;return gate.promise;},mount(){mounts++;}}),
    }});
    const pending=router.navigate("next");router.destroy();assert.equal(signal.aborted,true);
    gate.resolve();assert.equal(await pending,false);assert.equal(mounts,0);
  } finally {browser.restore();}
});

test("cancelled preparation leaves the existing scene usable",async()=>{
  const browser=installBrowserGlobals();
  try {
    const gate=deferred();let oldSignal,unmounts=0;
    const root=createRoot(),context={state:{}};
    const router=new SceneRouter({root,context,routes:{
      old:()=>({mount(_root,_params,{signal}){oldSignal=signal;},unmount(){unmounts++;}}),
      next:()=>({prepare(){return gate.promise;},mount(){throw Error("must not mount");}}),
    }});
    await router.navigate("old");const pending=router.navigate("next");
    gate.reject(new DOMException("cancelled","AbortError"));assert.equal(await pending,false);
    assert.equal(root.dataset.scene,"old");assert.equal(oldSignal.aborted,false);assert.equal(unmounts,0);
    assert.equal(context.state.transitioning,false);router.destroy();
  } finally {browser.restore();}
});

test("a newer route cancels slow preparation without clearing the old screen first",async()=>{
  const browser=installBrowserGlobals();
  try {
    let aborted=false,unmounts=0;
    const root=createRoot(),router=new SceneRouter({root,context:{state:{}},routes:{
      old:()=>({mount(){},unmount(){unmounts++;}}),
      slow:()=>({prepare(_params,{signal}){return new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>{aborted=true;reject(signal.reason);},{once:true}));},mount(){throw Error("stale scene mounted");}}),
      latest:()=>({mount(){}}),
    }});
    await router.navigate("old");const slow=router.navigate("slow");
    assert.equal(await router.navigate("latest"),false);assert.equal(root.dataset.scene,"old");assert.equal(unmounts,0);
    assert.equal(await slow,false);for(let i=0;i<5;i++)await Promise.resolve();
    assert.equal(aborted,true);assert.equal(root.dataset.scene,"latest");assert.equal(unmounts,1);router.destroy();
  } finally {browser.restore();}
});

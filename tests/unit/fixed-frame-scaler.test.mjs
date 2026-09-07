import assert from "node:assert/strict";
import test from "node:test";
import {
  attachFixedFrameScaler,
  calculateFixedFrameScale,
} from "../../js/minigames/shared/fixed-frame-scaler.js";

test("fixed frame scale contains a logical game without enlarging its original design", () => {
  assert.equal(calculateFixedFrameScale({
    availableWidth: 1120,
    availableHeight: 600,
    logicalWidth: 390,
    logicalHeight: 740,
  }), 600 / 740);
  assert.equal(calculateFixedFrameScale({
    availableWidth: 900,
    availableHeight: 1200,
    logicalWidth: 390,
    logicalHeight: 740,
  }), 1);
  assert.equal(calculateFixedFrameScale({
    availableWidth: 900,
    availableHeight: 1200,
    logicalWidth: 390,
    logicalHeight: 740,
    maxScale: 1.35,
  }), 1.35);
  assert.equal(calculateFixedFrameScale({
    availableWidth: 360,
    availableHeight: 400,
    logicalWidth: 440,
    logicalHeight: 920,
    fitHeight: false,
  }), 360 / 440);
});

test("fixed frame scaler sizes only the viewport and transforms the logical frame", () => {
  let observer = null;
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observer = this;
    }

    observe(target) {
      this.target = target;
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const windowRef = { ResizeObserver: FakeResizeObserver };
  const container = {
    style: {},
    clientWidth: 360,
    clientHeight: 800,
    ownerDocument: { defaultView: windowRef },
  };
  const viewport = { style: {}, dataset: {} };
  const frame = { style: {} };
  const detach = attachFixedFrameScaler({
    container,
    viewport,
    frame,
    logicalWidth: 440,
    logicalHeight: 920,
    fitHeight: false,
  });

  assert.equal(observer.target, container);
  assert.equal(viewport.style.width, "360px");
  assert.equal(viewport.style.height, `${920 * (360 / 440)}px`);
  assert.equal(frame.style.width, "440px");
  assert.equal(frame.style.height, "920px");
  assert.equal(frame.style.transform, `scale(${360 / 440})`);

  container.clientWidth = 800;
  observer.callback();
  assert.equal(viewport.style.width, "440px");
  assert.equal(viewport.style.height, "920px");
  assert.equal(frame.style.transform, "scale(1)");

  detach();
  assert.equal(observer.disconnected, true);
});

test("fixed frame scaler switches to a scoped fluid desktop layout and back", () => {
  let observer = null;
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }

    observe() {}
    disconnect() {}
  }

  const activeClasses = new Set();
  const layouts = [];
  const container = {
    style: {},
    classList: {
      toggle(className, force) {
        if (force) activeClasses.add(className);
        else activeClasses.delete(className);
      },
    },
    clientWidth: 980,
    clientHeight: 680,
    ownerDocument: { defaultView: { ResizeObserver: FakeResizeObserver } },
  };
  const viewport = { style: {}, dataset: {} };
  const frame = { style: {} };
  const detach = attachFixedFrameScaler({
    container,
    viewport,
    frame,
    logicalWidth: 440,
    logicalHeight: 920,
    fitHeight: false,
    maxScale: 1.25,
    fluidLayout: {
      minWidth: 760,
      minHeight: 540,
      className: "desktop-layout",
    },
    onLayout: (layout) => layouts.push(layout),
  });

  assert.equal(activeClasses.has("desktop-layout"), true);
  assert.equal(viewport.style.width, "100%");
  assert.equal(viewport.style.height, "100%");
  assert.equal(viewport.style.flex, "1 1 auto");
  assert.equal(frame.style.position, "relative");
  assert.equal(frame.style.width, "100%");
  assert.equal(frame.style.height, "100%");
  assert.equal(frame.style.transform, "none");
  assert.equal(viewport.dataset.scale, "fluid");
  assert.equal(viewport.dataset.layout, "fluid");
  assert.equal(layouts.at(-1).mode, "fluid");

  container.clientWidth = 520;
  observer.callback();
  assert.equal(activeClasses.has("desktop-layout"), false);
  assert.equal(frame.style.position, "absolute");
  assert.equal(frame.style.width, "440px");
  assert.equal(frame.style.height, "920px");
  assert.equal(viewport.dataset.layout, "fixed");
  assert.equal(layouts.at(-1).mode, "fixed");

  detach();
  assert.equal(activeClasses.has("desktop-layout"), false);
});

test("fixed frame scale rejects unusable dimensions", () => {
  assert.throws(() => calculateFixedFrameScale({
    availableWidth: 0,
    availableHeight: 740,
    logicalWidth: 390,
    logicalHeight: 740,
  }), /availableWidth/u);
});

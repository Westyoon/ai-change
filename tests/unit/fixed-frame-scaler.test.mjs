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
  detach();
  assert.equal(observer.disconnected, true);
});

test("fixed frame scale rejects unusable dimensions", () => {
  assert.throws(() => calculateFixedFrameScale({
    availableWidth: 0,
    availableHeight: 740,
    logicalWidth: 390,
    logicalHeight: 740,
  }), /availableWidth/u);
});

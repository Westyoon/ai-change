import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG } from "../../js/minigames/AIDS/config.js";
import {
  AIDS_LOGICAL_HEIGHT,
  AIDS_LOGICAL_WIDTH,
} from "../../js/minigames/AIDS/dom-builder.js";
import { createMiniGame } from "../../js/minigames/AIDS/index.js";

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return this.element.className.split(/\s+/u).filter(Boolean);
  }

  contains(className) {
    return this.values().includes(className);
  }

  add(...classNames) {
    this.element.className = [...new Set([...this.values(), ...classNames])].join(" ");
  }

  remove(...classNames) {
    const removed = new Set(classNames);
    this.element.className = this.values().filter((name) => !removed.has(name)).join(" ");
  }

  toggle(className, force) {
    const next = force ?? !this.contains(className);
    if (next) this.add(className);
    else this.remove(className);
    return next;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.textContent = "";
    this.type = "";
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight };
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createDom({ width, height }) {
  const observers = [];
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const ownerDocument = {
    defaultView: { ResizeObserver: FakeResizeObserver },
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
    getElementById() {
      return null;
    },
  };
  ownerDocument.head = new FakeElement("head", ownerDocument);
  const uiRoot = new FakeElement("div", ownerDocument);
  uiRoot.className = "minigame-ui-root";
  uiRoot.clientWidth = width;
  uiRoot.clientHeight = height;
  return { observers, ownerDocument, uiRoot };
}

test("AIDS mounts a 390x740 logical frame, contain-scales it, and disconnects resize cleanup", async () => {
  const { observers, ownerDocument, uiRoot } = createDom({ width: 195, height: 370 });
  const instance = createMiniGame({ uiRoot });

  await instance.init(DEFAULT_CONFIG);

  assert.equal(AIDS_LOGICAL_WIDTH, 390);
  assert.equal(AIDS_LOGICAL_HEIGHT, 740);
  assert.equal(uiRoot.className, "minigame-ui-root aids-ui-root");
  assert.equal(uiRoot.children.length, 1);

  const viewport = uiRoot.children[0];
  const frame = viewport.children[0];
  const root = frame.children[0];
  assert.equal(viewport.className, "aids-frame-viewport");
  assert.equal(frame.className, "aids-logical-frame");
  assert.equal(root.className, "aids-root");
  assert.equal(frame.style.width, "390px");
  assert.equal(frame.style.height, "740px");
  assert.equal(frame.style.transform, "scale(0.5)");
  assert.equal(viewport.style.width, "195px");
  assert.equal(viewport.style.height, "370px");
  assert.equal(viewport.dataset.scale, "0.5");

  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].observed, [uiRoot]);
  uiRoot.clientWidth = 780;
  uiRoot.clientHeight = 1_480;
  observers[0].callback();
  assert.equal(frame.style.transform, "scale(1)");
  assert.equal(viewport.style.width, "390px");
  assert.equal(viewport.style.height, "740px");

  instance.destroy();

  assert.equal(observers[0].disconnected, true);
  assert.equal(uiRoot.className, "minigame-ui-root");
  assert.equal(uiRoot.children.length, 0);
  assert.equal(ownerDocument.head.children.length, 0);

  uiRoot.clientWidth = 195;
  uiRoot.clientHeight = 370;
  observers[0].callback();
  assert.equal(frame.style.transform, "scale(1)");
});

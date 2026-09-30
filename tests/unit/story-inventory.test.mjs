import assert from "node:assert/strict";
import test from "node:test";

import { createStoryInventory } from "../../js/ui/story-inventory.js";

class FakeNode {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.style = { setProperty() {} };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this });
  }

  focus() {}

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child instanceof FakeElement && child.className.split(/\s+/u).includes(className)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

test("story inventory shows locally and remotely earned eggs and opens Our Memories", () => {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  const navigations = [];
  const documentListeners = new Map();
  globalThis.Node = FakeNode;
  globalThis.document = {
    body: new FakeElement("body"),
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
    addEventListener: (type, listener) => documentListeners.set(type, listener),
    removeEventListener: (type) => documentListeners.delete(type),
  };

  const context = {
    content: { guardianEggs: [] },
    services: {
      save: {
        getState: () => ({
          story: { seenStoryIds: ["afterstory:ds"] },
        }),
      },
      account: {
        getState: () => ({ seenStoryIds: ["afterstory:ai"] }),
        subscribe: () => () => {},
      },
    },
    router: { navigate: (sceneId) => navigations.push(sceneId) },
  };

  try {
    const inventory = createStoryInventory({ context });
    const eggs = inventory.element.querySelectorAll(".story-inventory__egg");
    assert.equal(eggs.length, 5);
    assert.equal(eggs.filter(({ dataset }) => dataset.acquired === "true").length, 2);
    assert.equal(inventory.element.querySelectorAll(".story-inventory__egg-art").length, 2);
    assert.match(
      inventory.element.querySelectorAll(".story-inventory__trigger-label")[0].textContent,
      /2\/5/u,
    );

    inventory.trigger.dispatch("click");
    assert.equal(inventory.isOpen, true);
    assert.equal(inventory.panel.hidden, false);
    const overlay = inventory.panel.parentNode;
    assert.equal(overlay.parentNode, document.body, "dialog escapes map clipping");
    assert.equal(overlay.hidden, false);
    assert.equal(inventory.element.dataset.open, "true");
    const memories = inventory.panel.querySelectorAll(".story-inventory__memories")[0];
    assert.equal(memories.parentNode.className, "story-inventory__footer");
    assert.equal(memories.parentNode.parentNode, inventory.panel, "footer is outside the scrolling egg list");
    assert.equal(inventory.panel.querySelectorAll(".story-inventory__egg-list")[0].attributes.get("tabindex"), "0");
    memories.dispatch("click");
    assert.deepEqual(navigations, ["story-memories"]);
    assert.equal(inventory.isOpen, false);
    assert.equal(overlay.parentNode, inventory.element);
    assert.equal(overlay.hidden, true);
    assert.equal(document.body.children.length, 0);
    assert.equal(inventory.element.dataset.open, "false");
    inventory.open();
    inventory.close();
    inventory.open();
    assert.equal(document.body.children.length, 1, "reopening does not duplicate overlays");
    inventory.destroy();
    assert.equal(document.body.children.length, 0, "unmount removes a portaled open dialog");
    assert.equal(documentListeners.size, 0);
  } finally {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

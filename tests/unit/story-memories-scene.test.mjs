import assert from "node:assert/strict";
import test from "node:test";

import { createStoryMemoriesScene } from "../../js/scenes/story-memories-scene.js";

class FakeNode {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
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
    this.disabled = false;
    this.type = "";
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

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (
          child instanceof FakeElement
          && className
          && child.className.split(/\s+/u).includes(className)
        ) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

test("Our Memories disables unseen entries and replays only a seen entry", () => {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
  };
  const navigations = [];
  const context = {
    services: {
      save: {
        getState: () => ({
          story: {
            introSeen: true,
            seenStoryIds: ["main-story-intro", "npc-ds"],
            completedNpcIds: [],
          },
        }),
      },
      account: {
        getState: () => ({ seenStoryIds: ["npc-cs"], completedGameIds: [] }),
        subscribe: () => () => {},
      },
    },
    router: {
      navigate(sceneId, params) {
        navigations.push({ sceneId, params });
      },
    },
  };
  const root = new FakeElement("main");
  const scene = createStoryMemoriesScene(context);

  try {
    scene.mount(root);
    const cards = root.querySelectorAll(".story-memory-card");
    assert.equal(cards.length, 7);
    assert.deepEqual(cards.map(({ textContent, children }) => (
      textContent || children.find((child) => child.className === "npc-card__name")?.textContent
    )), [
      "intro",
      "데이터사이언스",
      "사이버보안",
      "컴퓨터공학",
      "인공지능",
      "인공지능데이터사이언스",
      "outro",
    ]);
    assert.deepEqual(
      cards.map(({ attributes }) => attributes.get("aria-disabled")),
      ["false", "false", "false", "true", "true", "true", "true"],
    );

    const chapters = root.querySelectorAll(".story-memory-chapter");
    assert.equal(chapters.length, 12);
    const lockedAfterstory = chapters.find(({ dataset }) => dataset.memoryId === "afterstory:ds");
    const dsFirst = chapters.find(({ dataset }) => dataset.memoryId === "npc-ds");
    lockedAfterstory.dispatch("click");
    assert.deepEqual(navigations, [], "a locked memory must have no click handler");
    dsFirst.dispatch("click");
    assert.deepEqual(navigations, [{
      sceneId: "story-memory",
      params: { memoryId: "npc-ds" },
    }]);
  } finally {
    scene.unmount();
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

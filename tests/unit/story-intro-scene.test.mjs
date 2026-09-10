import assert from "node:assert/strict";
import test from "node:test";
import storyDocument from "../../data/scripts/main-story.json" with { type: "json" };
import { createStoryIntroScene } from "../../js/scenes/story-intro-scene.js";

class FakeNode {}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.textContent = text;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.disabled = false;
    this.hidden = false;
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, init = {}) {
    const event = {
      key: init.key,
      target: this,
      currentTarget: this,
      preventDefault() {},
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName),
  createTextNode: (text) => new FakeText(text),
};

function findByClass(root, className) {
  if (root.className?.split(/\s+/u).includes(className)) return root;
  for (const child of root.children ?? []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findByText(root, text) {
  if (root.textContent === text) return root;
  for (const child of root.children ?? []) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function createContext() {
  const events = { introSeen: 0, navigations: [] };
  return {
    events,
    context: {
      content: { scripts: storyDocument.scripts },
      services: {
        save: { markIntroSeen: () => { events.introSeen += 1; } },
      },
      router: {
        navigate(sceneId, params) {
          events.navigations.push({ sceneId, params });
          return Promise.resolve(true);
        },
      },
    },
  };
}

test("intro scene advances every visual beat and completes exactly once", () => {
  const { context, events } = createContext();
  const root = new FakeElement("main");
  const scene = createStoryIntroScene(context);
  scene.mount(root);

  const stage = findByClass(root, "story-intro__stage");
  const speaker = findByClass(root, "dialogue-speaker");
  const next = findByText(root, "다음");
  assert.equal(stage.dataset.visual, "egg-outline");
  assert.equal(speaker.textContent, "독백");

  for (let index = 0; index < 11; index += 1) next.dispatch("click");
  assert.equal(stage.dataset.visual, "locks");
  assert.equal(next.textContent, "학과 지도로");
  next.dispatch("click");
  next.dispatch("click");

  assert.equal(events.introSeen, 1);
  assert.deepEqual(events.navigations, [{ sceneId: "map", params: undefined }]);
  scene.unmount();
});

test("intro skip uses the same one-time map completion path", () => {
  const { context, events } = createContext();
  const root = new FakeElement("main");
  createStoryIntroScene(context).mount(root);

  findByText(root, "인트로 건너뛰고 학과 지도로").dispatch("click");
  assert.equal(events.introSeen, 1);
  assert.deepEqual(events.navigations, [{ sceneId: "map", params: undefined }]);
});

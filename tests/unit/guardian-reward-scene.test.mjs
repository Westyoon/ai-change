import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createGuardianRewardScene } from "../../js/scenes/guardian-reward-scene.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

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
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { setProperty() {} };
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

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  dispatch(type, init = {}) {
    const event = {
      key: null,
      preventDefault() {},
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  querySelector(selector) {
    const tagName = selector.toUpperCase();
    const visit = (node) => {
      for (const child of node.children) {
        if (child.tagName === tagName) return child;
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this);
  }

  focus() {}
}

function installFakeDom() {
  const previousNode = globalThis.Node;
  const previousDocument = globalThis.document;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => Object.assign(new FakeNode(), { textContent: String(text) }),
  };
  return () => {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
}

function allText(node) {
  return [node.textContent, ...node.children.flatMap((child) => allText(child))].join(" ");
}

test("guardian reward presents the acquired egg and returns to the Story map once", async () => {
  const restoreDom = installFakeDom();
  const [mapDocument, guardianDocument] = await Promise.all([
    readJson("../../data/map-data.json"),
    readJson("../../data/guardian-eggs.json"),
  ]);
  const navigations = [];
  const context = {
    config: { mainMapId: "festival-main-map" },
    content: {
      maps: mapDocument.maps,
      guardianEggs: guardianDocument.guardianEggs,
    },
    services: {
      save: {
        getState: () => ({
          minigames: { "computer-code-heart": { completed: true } },
        }),
      },
    },
    router: {
      navigate(sceneId) {
        navigations.push(sceneId);
        return Promise.resolve(true);
      },
    },
  };
  const root = new FakeElement("main");
  const scene = createGuardianRewardScene(context);

  try {
    scene.mount(root, { npcId: "npc-cse", guardianEggId: "guardian-cse" });
    assert.equal(root.dataset.sceneLayout, "guardian-reward");
    assert.match(allText(root), /창조의 수호알 획득!/u);
    assert.match(allText(root), /컴퓨터공학의 수호캐릭터가 함께합니다/u);
    const eggImage = root.querySelector("img");
    assert.equal(
      eggImage?.attributes.get("src"),
      "./assets/images/guardian-eggs/guardian-cse.png",
    );
    assert.equal(eggImage?.attributes.get("alt"), "");

    root.dispatch("keyup", { key: "Enter" });
    root.dispatch("keyup", { key: "Enter" });
    assert.deepEqual(navigations, ["map"]);
  } finally {
    scene.unmount();
    assert.equal(root.dataset.sceneLayout, undefined);
    restoreDom();
  }
});

test("guardian reward names use the requested 70 percent scale without splitting Korean words", async () => {
  const css = await readFile(new URL("../../css/dialogue.css", import.meta.url), "utf8");
  const titleRule = css.match(
    /\.scene\.guardian-reward-scene \.guardian-reward__copy h1\s*\{(?<body>[^}]*)\}/u,
  );
  const sharedCopyRule = css.match(
    /\.guardian-reward__copy h1,\s*\.guardian-reward__copy p\s*\{(?<body>[^}]*)\}/u,
  );

  assert.match(titleRule?.groups?.body ?? "", /font-size:\s*clamp\(0\.98rem,\s*2\.45vw,\s*2\.058rem\)/u);
  assert.match(titleRule?.groups?.body ?? "", /line-height:\s*1\.1/u);
  assert.match(sharedCopyRule?.groups?.body ?? "", /word-break:\s*keep-all/u);
  assert.match(sharedCopyRule?.groups?.body ?? "", /overflow-wrap:\s*normal/u);
  assert.match(css, /\.guardian-reward__egg\s*\{[^}]*object-fit:\s*contain;[^}]*image-rendering:\s*pixelated;/su);
});

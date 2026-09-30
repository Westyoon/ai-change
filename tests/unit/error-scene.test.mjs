import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createErrorScene } from "../../js/scenes/error-scene.js";

class FakeNode {
  constructor() {
    this.children = [];
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.listeners = new Map();
  }

  setAttribute() {}

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
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

test("error screen hides internal error codes and exception details", () => {
  const restoreDom = installFakeDom();
  const root = new FakeElement("main");
  const scene = createErrorScene({
    router: { navigate() {} },
  });

  try {
    scene.mount(root, {
      code: "UNHANDLED_RUNTIME_ERROR",
      message: "예상하지 못한 오류가 발생했습니다.",
      detail: "Illegal invocation",
    });
    const text = allText(root);
    assert.match(text, /잠시 멈췄어요/u);
    assert.match(text, /예상하지 못한 오류가 발생했습니다/u);
    assert.doesNotMatch(text, /UNHANDLED_RUNTIME_ERROR|APP_ERROR|Illegal invocation/u);
    assert.match(text, /다시 시도/u);
    assert.match(text, /메뉴로/u);
    assert.match(text, /페이지 새로고침/u);
  } finally {
    restoreDom();
  }
});

test("bootstrap failure copy does not expose the original exception message", async () => {
  const source = await readFile(new URL("../../js/app.js", import.meta.url), "utf8");
  assert.match(
    source,
    /copy\.textContent\s*=\s*"앱을 불러오지 못했습니다\. 페이지를 다시 불러와 주세요\."/u,
  );
  assert.doesNotMatch(
    source,
    /copy\.textContent\s*=\s*error\s+instanceof\s+Error\s*\?\s*error\.message/u,
  );
});

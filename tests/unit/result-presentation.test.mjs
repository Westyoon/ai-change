import assert from "node:assert/strict";
import test from "node:test";
import {
  createResultOverlay,
  formatResultMetric,
  resolveResultPresentation,
} from "../../js/ui/result-overlay.js";

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.disabled = false;
    this.parentNode = null;
    this.inert = false;
    this.isConnected = true;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener() {}

  removeEventListener() {}

  querySelectorAll(selector) {
    const buttons = [];
    const visit = (node) => {
      if (node.tagName === "BUTTON" && (!selector.includes(":not(:disabled)") || !node.disabled)) {
        buttons.push(node);
      }
      for (const child of node.children) visit(child);
    };
    visit(this);
    return buttons;
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
    this.isConnected = false;
  }
}

function withFakeDocument(run) {
  const previous = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const documentRef = {
    activeElement: null,
    createElement: (tagName) => new FakeNode(tagName),
    createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: text }),
  };
  globalThis.document = documentRef;
  globalThis.HTMLElement = FakeNode;
  globalThis.Node = FakeNode;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test("result presentation keeps the common contract while applying game-specific copy", () => {
  const resolved = resolveResultPresentation({
    result: {
      status: "FAIL",
      failureReason: "MISS_LIMIT",
      score: 42,
      metrics: { missCount: 3, purification: 42 },
    },
    outroText: "공통 실패 문구",
    presentation: {
      fail: {
        title: "💥 방어 실패",
        description: "정화도 {purification}%",
        reasonDescriptions: {
          MISS_LIMIT: "MISS {missCount}회로 시스템이 뚫렸습니다.",
        },
        retryLabel: "RESTART",
      },
    },
  });

  assert.deepEqual(resolved, {
    title: "💥 방어 실패",
    description: "MISS 3회로 시스템이 뚫렸습니다.",
    retryLabel: "RESTART",
    mapLabel: "맵으로",
    menuLabel: "메뉴로",
  });
  assert.ok(Object.isFrozen(resolved));
});

test("result presentation falls back to the existing outro copy", () => {
  assert.equal(resolveResultPresentation({
    result: { status: "CLEAR", score: 100, metrics: {} },
    outroText: "원래 공통 완료 문구",
  }).description, "원래 공통 완료 문구");
});

test("result presentation joins array metrics when restoring prototype copy", () => {
  assert.equal(resolveResultPresentation({
    result: {
      status: "FAIL",
      score: null,
      metrics: { answer: [4, 0, 7] },
    },
    presentation: {
      fail: { description: "정답은 {answer} 이었습니다." },
    },
  }).description, "정답은 407 이었습니다.");
});

test("Battle metrics translate trial values and format every millisecond field", () => {
  assert.equal(formatResultMetric("trial", "card-match"), "카드 짝맞추기");
  assert.equal(formatResultMetric("playerHand", "rock"), "바위");
  assert.equal(formatResultMetric("phaseReached", 4), "Phase 4");
  assert.equal(formatResultMetric("elapsedBattleMs", 12_345), "12.3초");
  assert.equal(formatResultMetric("remainingMs", 950), "0.9초");
});

test("result overlay omits retry when the host does not provide a retry action", () => {
  withFakeDocument(() => {
    const overlay = createResultOverlay({
      result: { status: "CLEAR", score: null, durationMs: 1_000, metrics: {} },
      onMap() {},
      onMenu() {},
    });
    const buttons = overlay.element.querySelectorAll("button");

    assert.deepEqual(buttons.map((button) => button.textContent), ["맵으로", "메뉴로"]);
    assert.match(buttons[0].className, /button--primary/u);
    overlay.destroy();
  });
});

test("result overlay retains retry for Battle hosts that provide the action", () => {
  withFakeDocument(() => {
    const overlay = createResultOverlay({
      result: { status: "FAIL", score: null, durationMs: 1_000, metrics: {} },
      onRetry() {},
      onMap() {},
      onMenu() {},
    });
    const buttons = overlay.element.querySelectorAll("button");

    assert.deepEqual(buttons.map((button) => button.textContent), ["다시 하기", "맵으로", "메뉴로"]);
    assert.match(buttons[0].className, /button--primary/u);
    overlay.destroy();
  });
});

test("result overlay renders optional egg artwork without changing the common result contract", () => {
  withFakeDocument(() => {
    const overlay = createResultOverlay({
      result: { status: "CLEAR", score: 100, durationMs: 1_000, metrics: {} },
      illustration: {
        src: "./assets/images/story-eggs/heart-egg.png",
        alt: "하얀 마음의 알",
        width: 1254,
        height: 1254,
      },
      onMap() {},
      onMenu() {},
    });
    const card = overlay.element.children[0];
    const artwork = card.children[0];

    assert.equal(artwork.tagName, "IMG");
    assert.equal(artwork.className, "result-card__illustration");
    assert.equal(artwork.getAttribute("src"), "./assets/images/story-eggs/heart-egg.png");
    assert.equal(artwork.getAttribute("alt"), "하얀 마음의 알");
    assert.equal(artwork.getAttribute("width"), "1254");
    assert.equal(artwork.getAttribute("height"), "1254");
    overlay.destroy();
  });
});

test("a first guardian CLEAR keeps only the after-story action until the egg is acquired", () => {
  withFakeDocument(() => {
    const overlay = createResultOverlay({
      result: { status: "CLEAR", score: null, durationMs: 1_000, metrics: {} },
      onMap() {},
      onMenu() {},
      primaryOnly: true,
      primaryAction: {
        label: "이야기 이어보기",
        onClick() {},
      },
    });
    const buttons = overlay.element.querySelectorAll("button");

    assert.deepEqual(buttons.map((button) => button.textContent), ["이야기 이어보기"]);
    assert.match(buttons[0].className, /button--primary/u);
    overlay.destroy();
  });
});

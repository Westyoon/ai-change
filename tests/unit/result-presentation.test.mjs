import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
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

test("X egg success and failure show only artwork, outcome and navigation, without deleting result data", async () => {
  const config = JSON.parse(await readFile(new URL("../../data/battle/xr-egg-trials.json", import.meta.url), "utf8"));
  const battles = JSON.parse(await readFile(new URL("../../data/battles.json", import.meta.url), "utf8"));
  assert.equal(battles.find(battle => battle.id === "xr-egg-trials").title, "X알의 폭주");
  for (const status of ["CLEAR", "FAIL"]) {
    withFakeDocument(() => {
      const result = { battleId: "xr-egg-trials", status, score: 400, durationMs: 7700, metrics: { trial: "mash", presses: 40, remainingMs: 2300 } };
      const original = structuredClone(result);
      const overlay = createResultOverlay({
        result,
        presentation: config.resultPresentation,
        contextLabel: "BATTLE · X알의 폭주",
        illustration: { src: `./assets/images/story-eggs/${status === "CLEAR" ? "heart" : "xr"}-egg.png` },
        onMap() {}, onMenu() {},
      });
      const card = overlay.element.children[0];
      assert.equal(card.dataset.compact, "true");
      assert.deepEqual(card.children.map(child => child.tagName), ["IMG", "H2", "DIV"]);
      assert.equal(card.children[1].textContent, status === "CLEAR" ? "X알 정화 성공" : "X알 정화 실패");
      assert.deepEqual(overlay.element.querySelectorAll("button").map(button => button.textContent), ["확인"]);
      assert.deepEqual(result, original, "scores and metrics remain available for saving and rewards");
      overlay.destroy();
    });
  }
});

test("reward notice updates accessibly without reintroducing metrics, and ignores updates after destroy", () => {
  withFakeDocument(() => {
    const overlay = createResultOverlay({
      result: { battleId: "xr-egg-trials", status: "CLEAR", score: 400, durationMs: 1000, metrics: { presses: 40 } },
      notice: "경험치 지급 확인 중…", onMap() {}, onMenu() {},
    });
    const card = overlay.element.children[0];
    const notice = card.children.find(child => child.className === "result-card__notice");
    assert.equal(notice.getAttribute("role"), "status");
    assert.equal(overlay.setNotice("경험치 +100 획득"), true);
    assert.equal(notice.textContent, "경험치 +100 획득");
    assert.equal(card.children.some(child => child.tagName === "DL"), false);
    overlay.destroy();
    assert.equal(overlay.setNotice("late response"), false);
    assert.equal(notice.textContent, "경험치 +100 획득");
  });
});

test("result egg CSS overrides intrinsic HTML height and keeps a compact short-screen layout", async () => {
  const css = await readFile(new URL("../../css/minigames.css", import.meta.url), "utf8");
  assert.match(css, /\.result-card__illustration\s*\{[^}]*height:\s*auto;/su);
  assert.match(css, /\.result-card\[data-compact="true"\] \.result-card__illustration\s*\{[^}]*width:\s*clamp\(80px, 20svh, 144px\);[^}]*height:\s*auto;/su);
  assert.match(css, /@media \(max-height: 500px\) and \(min-width: 480px\)/u);
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

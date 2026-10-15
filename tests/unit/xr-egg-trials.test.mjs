import assert from "node:assert/strict";
import test from "node:test";
import { INPUT_ACTIONS } from "../../js/core/input-manager.js";
import {
  calculateTrialScore,
  createBattle,
  judgeRps,
  shuffledCards,
} from "../../js/battle/postgame/challenges/xr-egg-trials/index.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentNode = null;
    this.className = "";
    this.disabled = false;
    this.textContent = "";
    this.type = "";
    this.style = {};
  }

  get firstChild() {
    return this.children[0] ?? null;
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

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ currentTarget: this, target: this, type });
    }
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

function createRoot() {
  const ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName, ownerDocument);
    },
  };
  return new FakeElement("div", ownerDocument);
}

function visit(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const match = visit(child, predicate);
    if (match) return match;
  }
  return null;
}

function createInput() {
  const listeners = new Set();
  return {
    onAction(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test("X알 규칙은 기존 가위바위보·카드·점수 공식을 보존한다", () => {
  assert.equal(judgeRps("rock", "scissors"), "win");
  assert.equal(judgeRps("paper", "paper"), "draw");
  assert.equal(judgeRps("scissors", "rock"), "lose");
  assert.throws(() => judgeRps("invalid", "rock"), /rock\/scissors\/paper/u);

  const deck = shuffledCards(["A", "B", "C"], () => 0);
  assert.equal(deck.length, 6);
  assert.deepEqual(
    Object.fromEntries(["A", "B", "C"].map((symbol) => [symbol, deck.filter((card) => card.symbol === symbol).length])),
    { A: 2, B: 2, C: 2 },
  );
  assert.equal(calculateTrialScore("rps", { outcome: "win" }), 100);
  assert.equal(calculateTrialScore("card-match", { matchedPairs: 3, livesRemaining: 4 }), 340);
  assert.equal(calculateTrialScore("mash", { presses: 40 }), 400);
});

test("X알 Battle은 lifecycle과 attempt당 한 번의 결과 계약을 지킨다", async () => {
  const root = createRoot();
  const input = createInput();
  const completions = [];
  const battle = createBattle({
    root,
    input,
    random: () => 0,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  await battle.init({
    selectionMode: "fixed",
    fixedTrialId: "rps",
    trialIds: ["rps"],
  });

  assert.equal(root.children.length, 1);
  assert.equal(battle.getState().state, "READY");
  battle.start({ attemptId: "xr:1" });
  assert.equal(battle.getState().state, "RUNNING");
  assert.equal(battle.pause("MANUAL"), true);
  assert.equal(battle.getState().state, "PAUSED");
  assert.equal(battle.resume(), true);

  const paper = visit(root, (element) => element.dataset.hand === "paper");
  assert.ok(paper);
  paper.dispatch("click");
  paper.dispatch("click");
  assert.equal(battle.getState().state, "RUNNING");
  assert.equal(completions.length, 0, "the result screen must not cover the revealed hands");
  const confirm = visit(root, (element) => element.className.includes("xr-trials__rps-confirm"));
  assert.equal(confirm.hidden, false);
  assert.equal(paper.disabled, true);
  confirm.dispatch("click");
  confirm.dispatch("click");
  assert.equal(battle.getState().state, "COMPLETED");
  assert.deepEqual(completions, [{
    attemptId: "xr:1",
    candidate: {
      status: "CLEAR",
      score: 100,
      failureReason: null,
      metrics: { trial: "rps", playerHand: "paper", opponentHand: "rock", outcome: "win" },
      reward: null,
    },
  }]);

  battle.restart({ attemptId: "xr:2" });
  const rock = visit(root, (element) => element.dataset.hand === "rock");
  rock.dispatch("click");
  assert.equal(completions.length, 1);
  visit(root, (element) => element.className.includes("xr-trials__rps-confirm")).dispatch("click");
  assert.equal(completions.length, 2);
  assert.equal(completions[1].candidate.status, "FAIL");
  assert.equal(completions[1].candidate.failureReason, "RPS_DRAW");

  battle.destroy();
  battle.destroy();
  assert.equal(input.listenerCount(), 0);
  assert.equal(root.children.length, 0);
  assert.equal(battle.getState().state, "DESTROYED");
});

test("RPS reveals both hands for win/draw/loss and preserves the choice across pause", async () => {
  for (const [hand, outcome, result] of [["paper", "win", "CLEAR"], ["rock", "draw", "FAIL"], ["scissors", "lose", "FAIL"]]) {
    const root = createRoot();
    const completions = [];
    let rolls = 0;
    const battle = createBattle({ root, random: () => { rolls++; return 0; }, onComplete: (_, value) => completions.push(value) });
    await battle.init({ selectionMode: "fixed", fixedTrialId: "rps" });
    battle.start({ attemptId: `reveal:${outcome}` });
    const confirm = visit(root, node => node.className.includes("xr-trials__rps-confirm"));
    assert.equal(confirm.hidden, true);
    confirm.dispatch("click");
    assert.equal(completions.length, 0);
    const choice = visit(root, node => node.dataset.hand === hand);
    choice.dispatch("click");
    const opponent = visit(root, node => node.attributes.get("aria-label") === "컴퓨터 선택: 바위");
    assert.equal(visit(opponent, node => node.dataset.handImage === "rock").className, "xr-trials__hand-image");
    assert.deepEqual(battle.getState().metrics, { playerHand: hand, opponentHand: "rock", outcome });
    assert.equal(completions.length, 0);
    battle.pause();
    confirm.dispatch("click");
    assert.equal(completions.length, 0);
    battle.resume();
    assert.equal(choice.disabled, true);
    assert.equal(confirm.disabled, false);
    choice.dispatch("click");
    assert.equal(rolls, 1, "revealing a hand must lock the round, including after resume");
    assert.match(visit(root, node => node.className === "xr-trials__status").textContent, /컴퓨터: 바위/u);
    confirm.dispatch("click");
    assert.equal(completions[0].status, result);
    battle.destroy();
  }
});

test("leaving or restarting an unconfirmed RPS round never submits its stale result", async () => {
  const root = createRoot();
  const completions = [];
  const battle = createBattle({ root, random: () => 0, onComplete: (...args) => completions.push(args) });
  await battle.init({ selectionMode: "fixed", fixedTrialId: "rps" });
  battle.start({ attemptId: "old" });
  visit(root, node => node.dataset.hand === "paper").dispatch("click");
  battle.restart({ attemptId: "new" });
  assert.deepEqual(battle.getState().metrics, {});
  const confirm = visit(root, node => node.className.includes("xr-trials__rps-confirm"));
  assert.equal(confirm.hidden, true);
  visit(root, node => node.dataset.hand === "rock").dispatch("click");
  battle.destroy();
  confirm.dispatch("click");
  assert.equal(completions.length, 0);
});

test("연타 시험은 공용 CONFIRM 입력과 모바일 버튼을 같은 판정으로 처리한다", async () => {
  const root = createRoot();
  const input = createInput();
  const completions = [];
  const battle = createBattle({
    root,
    input,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  await battle.init({
    selectionMode: "fixed",
    fixedTrialId: "mash",
    trialIds: ["mash"],
    mash: { targetPresses: 2, timeLimitMs: 5_000 },
  });
  battle.start({ attemptId: "xr:mash" });

  input.emit({ action: INPUT_ACTIONS.CONFIRM, phase: "press" });
  const button = visit(root, (element) => element.className === "xr-trials__mash-button");
  button.dispatch("click");

  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
  assert.equal(completions[0].candidate.metrics.presses, 2);
  battle.destroy();
});

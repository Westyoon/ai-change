import { INPUT_ACTIONS } from "../../../../core/input-manager.js";
import {
  RPS_HANDS,
  TRIAL_IDS,
  calculateTrialScore,
  clampWholeNumber,
  judgeRps,
  selectRandomItem,
  shuffledCards,
} from "./rules.js";

const STATE = Object.freeze({
  IDLE: "IDLE",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  DESTROYED: "DESTROYED",
});

const HAND_META = Object.freeze({
  rock: Object.freeze({ label: "바위", emoji: "✊" }),
  scissors: Object.freeze({ label: "가위", emoji: "✌️" }),
  paper: Object.freeze({ label: "보", emoji: "✋" }),
});

const TRIAL_META = Object.freeze({
  rps: Object.freeze({ title: "가위바위보", eyebrow: "ONE CHANCE" }),
  "card-match": Object.freeze({ title: "카드 짝맞추기", eyebrow: "MEMORY" }),
  mash: Object.freeze({ title: "연타 챌린지", eyebrow: "SPEED" }),
});

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createElement(documentRef, tagName, { className = "", text, type, attributes = {}, dataset = {} } = {}, children = []) {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  if (type) element.type = type;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const [name, value] of Object.entries(dataset)) element.dataset[name] = String(value);
  for (const child of children) element.append(child);
  return element;
}

class PausableTimeout {
  constructor() {
    this.id = null;
    this.callback = null;
    this.remainingMs = 0;
    this.startedAt = 0;
  }

  set(callback, delayMs) {
    this.clear();
    this.callback = callback;
    this.remainingMs = Math.max(0, Number(delayMs) || 0);
    this.#arm();
  }

  pause() {
    if (this.id === null) return;
    globalThis.clearTimeout(this.id);
    this.id = null;
    this.remainingMs = Math.max(0, this.remainingMs - (now() - this.startedAt));
  }

  resume() {
    if (this.id !== null || !this.callback) return;
    this.#arm();
  }

  clear() {
    if (this.id !== null) globalThis.clearTimeout(this.id);
    this.id = null;
    this.callback = null;
    this.remainingMs = 0;
  }

  #arm() {
    this.startedAt = now();
    this.id = globalThis.setTimeout(() => {
      const callback = this.callback;
      this.id = null;
      this.callback = null;
      this.remainingMs = 0;
      callback?.();
    }, this.remainingMs);
  }
}

function normalizeConfig(config = {}) {
  const trials = Array.isArray(config.trialIds)
    ? config.trialIds.filter((id) => TRIAL_IDS.includes(id))
    : [...TRIAL_IDS];
  if (trials.length === 0) throw new TypeError("X알 챌린지 trialIds가 비어 있습니다.");

  const card = config.cardMatch ?? {};
  const configuredSymbols = Array.isArray(card.symbols) ? [...new Set(card.symbols.map(String))] : [];
  const symbols = configuredSymbols.length >= 2
    ? configuredSymbols
    : ["🌙", "⭐", "💎", "🌸", "🗝️"];
  const pairsToClear = Math.min(symbols.length, clampWholeNumber(card.pairsToClear, 1, 3));

  return Object.freeze({
    trialIds: Object.freeze([...new Set(trials)]),
    selectionMode: config.selectionMode === "fixed" ? "fixed" : "random",
    fixedTrialId: TRIAL_IDS.includes(config.fixedTrialId) ? config.fixedTrialId : null,
    cardMatch: Object.freeze({
      symbols: Object.freeze(symbols),
      totalLives: clampWholeNumber(card.totalLives, 1, 5),
      pairsToClear,
      previewMs: clampWholeNumber(card.previewMs, 0, 1_000),
      mismatchDelayMs: clampWholeNumber(card.mismatchDelayMs, 0, 700),
    }),
    mash: Object.freeze({
      targetPresses: clampWholeNumber(config.mash?.targetPresses, 1, 40),
      timeLimitMs: clampWholeNumber(config.mash?.timeLimitMs, 250, 10_000),
    }),
  });
}

export function createBattle({ root, input = null, onComplete = null, random = Math.random } = {}) {
  if (!root) throw new Error("createBattle(context.root)가 필요합니다.");
  const documentRef = root.ownerDocument ?? globalThis.document;
  if (!documentRef?.createElement) throw new Error("X알 챌린지를 표시할 document가 필요합니다.");

  let state = STATE.IDLE;
  let config = null;
  let shell = null;
  let content = null;
  let status = null;
  let activeButtons = [];
  let activeTrialId = null;
  let attemptId = null;
  let completedAttemptId = null;
  let unsubscribeInput = null;
  let abortCleanup = null;
  let trialRuntime = null;
  let trialSnapshot = {};
  let mashInterval = null;
  const delay = new PausableTimeout();

  function setButtonsDisabled(disabled) {
    for (const button of activeButtons) button.disabled = Boolean(disabled);
  }

  function stopMashClock() {
    if (mashInterval !== null) globalThis.clearInterval(mashInterval);
    mashInterval = null;
  }

  function clearTrial() {
    stopMashClock();
    delay.clear();
    trialRuntime?.destroy?.();
    trialRuntime = null;
    activeButtons = [];
    if (content) {
      while (content.firstChild) content.firstChild.remove();
      if (Array.isArray(content.children)) {
        for (const child of [...content.children]) child.remove?.();
      }
    }
  }

  function complete(statusValue, failureReason, metrics) {
    if (state !== STATE.RUNNING || !attemptId || completedAttemptId === attemptId) return false;
    completedAttemptId = attemptId;
    state = STATE.COMPLETED;
    stopMashClock();
    delay.clear();
    setButtonsDisabled(true);
    const frozenMetrics = Object.freeze({ trial: activeTrialId, ...metrics });
    trialSnapshot = frozenMetrics;
    onComplete?.(attemptId, Object.freeze({
      status: statusValue,
      score: calculateTrialScore(activeTrialId, frozenMetrics),
      failureReason: failureReason ?? null,
      metrics: frozenMetrics,
      reward: null,
    }));
    return true;
  }

  function mountHeading(trialId, instruction) {
    const meta = TRIAL_META[trialId];
    content.append(
      createElement(documentRef, "p", { className: "xr-trials__eyebrow", text: meta.eyebrow }),
      createElement(documentRef, "h2", { className: "xr-trials__title", text: meta.title }),
      createElement(documentRef, "p", { className: "xr-trials__instruction", text: instruction }),
    );
  }

  function startRps() {
    mountHeading("rps", "기회는 한 번입니다. 비기거나 지면 실패합니다.");
    const arena = createElement(documentRef, "div", { className: "xr-trials__rps-arena" });
    const playerOutput = createElement(documentRef, "output", {
      className: "xr-trials__rps-slot",
      text: "?",
      attributes: { "aria-label": "내 선택" },
    });
    const opponentOutput = createElement(documentRef, "output", {
      className: "xr-trials__rps-slot",
      text: "?",
      attributes: { "aria-label": "상대 선택" },
    });
    arena.append(playerOutput, createElement(documentRef, "strong", { text: "VS" }), opponentOutput);
    const choices = createElement(documentRef, "div", { className: "xr-trials__choices" });
    for (const hand of RPS_HANDS) {
      const meta = HAND_META[hand];
      const button = createElement(documentRef, "button", {
        className: "xr-trials__choice",
        text: `${meta.emoji} ${meta.label}`,
        type: "button",
        dataset: { hand },
        attributes: { "aria-label": meta.label },
      });
      button.addEventListener("click", () => {
        if (state !== STATE.RUNNING) return;
        const opponentHand = selectRandomItem(RPS_HANDS, random);
        const outcome = judgeRps(hand, opponentHand);
        playerOutput.textContent = HAND_META[hand].emoji;
        opponentOutput.textContent = HAND_META[opponentHand].emoji;
        status.textContent = outcome === "win" ? "승리!" : outcome === "draw" ? "무승부" : "패배";
        status.dataset.tone = outcome === "win" ? "success" : "danger";
        complete(outcome === "win" ? "CLEAR" : "FAIL", outcome === "draw" ? "RPS_DRAW" : outcome === "lose" ? "RPS_LOSS" : null, {
          playerHand: hand,
          opponentHand,
          outcome,
        });
      });
      activeButtons.push(button);
      choices.append(button);
    }
    content.append(arena, choices);
  }

  function startCardMatch() {
    const settings = config.cardMatch;
    mountHeading("card-match", `${settings.pairsToClear}쌍을 맞추세요. 틀릴 때마다 기회가 하나 줄어듭니다.`);
    const deck = shuffledCards(settings.symbols, random);
    const matched = new Set();
    let faceUp = new Set(deck.map((_, index) => index));
    let picked = [];
    let lives = settings.totalLives;
    let locked = true;
    const summary = createElement(documentRef, "p", { className: "xr-trials__summary" });
    const grid = createElement(documentRef, "div", { className: "xr-trials__card-grid" });

    const update = () => {
      summary.textContent = `완성 ${matched.size / 2}/${settings.pairsToClear} · 기회 ${lives}/${settings.totalLives}`;
      activeButtons.forEach((button, index) => {
        const visible = faceUp.has(index) || matched.has(index);
        button.textContent = visible ? deck[index].symbol : "?";
        button.dataset.faceUp = String(visible);
        button.dataset.matched = String(matched.has(index));
        button.disabled = state !== STATE.RUNNING || locked || matched.has(index) || faceUp.has(index);
      });
      trialSnapshot = { matchedPairs: matched.size / 2, livesRemaining: lives };
    };

    deck.forEach((card, index) => {
      const button = createElement(documentRef, "button", {
        className: "xr-trials__card",
        text: card.symbol,
        type: "button",
        attributes: { "aria-label": `카드 ${index + 1}` },
      });
      button.addEventListener("click", () => {
        if (state !== STATE.RUNNING || locked || faceUp.has(index) || matched.has(index)) return;
        faceUp.add(index);
        picked.push(index);
        update();
        if (picked.length < 2) return;

        const [first, second] = picked;
        locked = true;
        if (deck[first].symbol === deck[second].symbol) {
          matched.add(first);
          matched.add(second);
          picked = [];
          locked = false;
          update();
          const matchedPairs = matched.size / 2;
          if (matchedPairs >= settings.pairsToClear) {
            status.textContent = "필요한 짝을 모두 찾았습니다.";
            status.dataset.tone = "success";
            complete("CLEAR", null, { matchedPairs, livesRemaining: lives });
          }
          return;
        }

        lives -= 1;
        update();
        if (lives <= 0) {
          status.textContent = "기회를 모두 사용했습니다.";
          status.dataset.tone = "danger";
          complete("FAIL", "CARD_LIVES_EXHAUSTED", { matchedPairs: matched.size / 2, livesRemaining: 0 });
          return;
        }
        delay.set(() => {
          faceUp.delete(first);
          faceUp.delete(second);
          picked = [];
          locked = false;
          update();
        }, settings.mismatchDelayMs);
      });
      activeButtons.push(button);
      grid.append(button);
    });
    content.append(summary, grid);
    trialRuntime = { refresh: update };
    update();
    delay.set(() => {
      faceUp = new Set();
      locked = false;
      status.textContent = "카드를 선택하세요.";
      update();
    }, settings.previewMs);
  }

  function startMash() {
    const settings = config.mash;
    mountHeading("mash", `${Math.ceil(settings.timeLimitMs / 1000)}초 안에 ${settings.targetPresses}번 누르세요.`);
    let presses = 0;
    let remainingMs = settings.timeLimitMs;
    let lastTick = now();
    const count = createElement(documentRef, "output", {
      className: "xr-trials__mash-count",
      text: `0 / ${settings.targetPresses}`,
      attributes: { "aria-live": "polite" },
    });
    const timer = createElement(documentRef, "output", { className: "xr-trials__timer" });
    const bar = createElement(documentRef, "span", { className: "xr-trials__timer-fill" });
    const track = createElement(documentRef, "span", {
      className: "xr-trials__timer-track",
      attributes: { role: "progressbar", "aria-label": "남은 시간" },
    }, [bar]);
    const button = createElement(documentRef, "button", {
      className: "xr-trials__mash-button",
      text: "연타!",
      type: "button",
    });

    const render = () => {
      count.textContent = `${presses} / ${settings.targetPresses}`;
      timer.textContent = `${(remainingMs / 1_000).toFixed(1)}초`;
      bar.style.width = `${Math.max(0, Math.min(100, remainingMs / settings.timeLimitMs * 100))}%`;
      track.setAttribute("aria-valuenow", String(Math.ceil(remainingMs)));
      track.setAttribute("aria-valuemax", String(settings.timeLimitMs));
      trialSnapshot = { presses, targetPresses: settings.targetPresses, remainingMs: Math.ceil(remainingMs) };
    };

    const finishTick = () => {
      if (state !== STATE.RUNNING) return;
      const timestamp = now();
      remainingMs = Math.max(0, remainingMs - (timestamp - lastTick));
      lastTick = timestamp;
      render();
      if (remainingMs <= 0) {
        status.textContent = "시간이 끝났습니다.";
        status.dataset.tone = "danger";
        complete("FAIL", "MASH_TIMEOUT", { presses, targetPresses: settings.targetPresses, remainingMs: 0 });
      }
    };

    const armClock = () => {
      stopMashClock();
      lastTick = now();
      mashInterval = globalThis.setInterval(finishTick, 50);
    };

    const press = () => {
      if (state !== STATE.RUNNING) return;
      finishTick();
      if (state !== STATE.RUNNING) return;
      presses += 1;
      render();
      if (presses >= settings.targetPresses) {
        status.textContent = "목표 횟수를 달성했습니다.";
        status.dataset.tone = "success";
        complete("CLEAR", null, { presses, targetPresses: settings.targetPresses, remainingMs: Math.ceil(remainingMs) });
      }
    };

    button.addEventListener("click", press);
    activeButtons.push(button);
    content.append(count, timer, track, button);
    render();
    armClock();
    trialRuntime = {
      destroy: stopMashClock,
      pause() {
      finishTick();
      stopMashClock();
      },
      resume: armClock,
      press,
    };
  }

  function chooseTrial() {
    if (config.selectionMode === "fixed" && config.fixedTrialId && config.trialIds.includes(config.fixedTrialId)) {
      return config.fixedTrialId;
    }
    return selectRandomItem(config.trialIds, random);
  }

  function begin(nextAttemptId) {
    if (state !== STATE.READY && state !== STATE.COMPLETED) return false;
    if (typeof nextAttemptId !== "string" || nextAttemptId.length === 0) {
      throw new TypeError("start({ attemptId })에 비어 있지 않은 attemptId가 필요합니다.");
    }
    clearTrial();
    attemptId = nextAttemptId;
    completedAttemptId = null;
    activeTrialId = chooseTrial();
    trialSnapshot = {};
    state = STATE.RUNNING;
    shell.dataset.trial = activeTrialId;
    shell.dataset.state = state;
    status.textContent = "도전 진행 중";
    status.dataset.tone = "neutral";
    if (activeTrialId === "rps") startRps();
    else if (activeTrialId === "card-match") startCardMatch();
    else startMash();
    return true;
  }

  function destroy() {
    if (state === STATE.DESTROYED) return;
    state = STATE.DESTROYED;
    clearTrial();
    unsubscribeInput?.();
    unsubscribeInput = null;
    abortCleanup?.();
    abortCleanup = null;
    shell?.remove();
    shell = null;
    content = null;
    status = null;
  }

  return {
    async init(rawConfig = {}, { signal } = {}) {
      if (state !== STATE.IDLE) throw new Error("X알 챌린지는 한 번만 init할 수 있습니다.");
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      config = normalizeConfig(rawConfig);
      content = createElement(documentRef, "div", { className: "xr-trials__content" });
      status = createElement(documentRef, "p", {
        className: "xr-trials__status",
        text: "도전 준비 완료",
        attributes: { role: "status", "aria-live": "polite" },
      });
      shell = createElement(documentRef, "section", {
        className: "xr-trials",
        attributes: { "aria-label": "X알 무작위 챌린지" },
        dataset: { state: STATE.READY },
      }, [content, status]);
      root.append(shell);
      state = STATE.READY;
      unsubscribeInput = input?.onAction?.((event) => {
        if (event.action === INPUT_ACTIONS.CONFIRM && event.phase === "press" && activeTrialId === "mash") {
          trialRuntime?.press?.();
        }
      }) ?? null;
      if (signal) {
        const onAbort = () => destroy();
        signal.addEventListener("abort", onAbort, { once: true });
        abortCleanup = () => signal.removeEventListener("abort", onAbort);
      }
    },

    start({ attemptId: nextAttemptId } = {}) {
      return begin(nextAttemptId);
    },

    pause(_reason) {
      if (state !== STATE.RUNNING) return false;
      trialRuntime?.pause?.();
      if (state !== STATE.RUNNING) return false;
      delay.pause();
      state = STATE.PAUSED;
      shell.dataset.state = state;
      setButtonsDisabled(true);
      status.textContent = "일시정지됨";
      status.dataset.tone = "neutral";
      return true;
    },

    resume() {
      if (state !== STATE.PAUSED) return false;
      state = STATE.RUNNING;
      shell.dataset.state = state;
      setButtonsDisabled(false);
      delay.resume();
      trialRuntime?.resume?.();
      trialRuntime?.refresh?.();
      status.textContent = "도전 진행 중";
      return true;
    },

    restart({ attemptId: nextAttemptId } = {}) {
      if (state === STATE.DESTROYED || state === STATE.IDLE) return false;
      state = STATE.READY;
      return begin(nextAttemptId);
    },

    destroy,

    getState() {
      return Object.freeze({
        state,
        terminal: state === STATE.COMPLETED,
        disposed: state === STATE.DESTROYED,
        attemptId,
        trialId: activeTrialId,
        metrics: Object.freeze({ ...trialSnapshot }),
      });
    },
  };
}

export { STATE as XR_TRIAL_STATE };
export * from "./rules.js";
export default createBattle;

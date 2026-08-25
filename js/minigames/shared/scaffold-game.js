import { InputLock } from "./input-lock.js";
import { MiniGameClock } from "./minigame-clock.js";
import { buildMiniGameCandidate } from "./result-builder.js";

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Mini-game initialization was aborted.", "AbortError");
  }
  const error = new Error("Mini-game initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }
  if (disposed()) {
    throw createAbortError();
  }
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new TypeError("Mini-game attemptId must be a non-empty string.");
  }
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function buildScaffoldUi(uiRoot, definition) {
  const documentRef = uiRoot?.ownerDocument ?? globalThis.document;
  if (!uiRoot?.append || !documentRef?.createElement) {
    return { root: null, stateLabel: null, clearButton: null, failButton: null };
  }

  const root = documentRef.createElement("section");
  root.className = "minigame-scaffold";
  root.dataset.miniGameId = definition.id;
  root.dataset.departmentCode = definition.departmentCode;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", `${definition.department} ${definition.title}`);

  const badge = documentRef.createElement("span");
  badge.className = "minigame-scaffold__department";
  badge.textContent = definition.departmentCode;

  const heading = documentRef.createElement("h2");
  heading.textContent = definition.title;

  const department = documentRef.createElement("p");
  department.className = "minigame-scaffold__department-name";
  department.textContent = definition.department;

  const goal = documentRef.createElement("p");
  goal.className = "minigame-scaffold__goal";
  goal.textContent = definition.goal;

  const notice = documentRef.createElement("p");
  notice.className = "minigame-scaffold__notice";
  notice.textContent = "구현 전 스캐폴드 — 아래 버튼은 공통 결과 계약 확인용입니다.";

  const stateLabel = documentRef.createElement("p");
  stateLabel.className = "minigame-scaffold__state";
  stateLabel.setAttribute("aria-live", "polite");
  stateLabel.textContent = "초기화 중";

  const controls = documentRef.createElement("div");
  controls.className = "minigame-scaffold__debug-controls";

  const clearButton = documentRef.createElement("button");
  clearButton.type = "button";
  clearButton.dataset.scaffoldResult = "CLEAR";
  clearButton.textContent = "개발용 CLEAR";
  clearButton.disabled = true;

  const failButton = documentRef.createElement("button");
  failButton.type = "button";
  failButton.dataset.scaffoldResult = "FAIL";
  failButton.textContent = "개발용 FAIL";
  failButton.disabled = true;

  controls.append(clearButton, failButton);
  root.append(badge, heading, department, goal, notice, stateLabel, controls);
  uiRoot.append(root);
  return { root, stateLabel, clearButton, failButton };
}

/**
 * Creates a development-only mini-game implementation that obeys the common
 * host lifecycle while real game mechanics are built independently.
 */
export function createScaffoldMiniGame(context = {}, definition = {}) {
  for (const field of ["id", "departmentCode", "department", "title", "goal"] ) {
    if (typeof definition[field] !== "string" || definition[field].length === 0) {
      throw new TypeError(`Scaffold mini-game definition requires ${field}.`);
    }
  }
  if (typeof definition.createMetrics !== "function") {
    throw new TypeError("Scaffold mini-game definition requires createMetrics(status, config).");
  }

  const inputLock = new InputLock();
  const injectedClock = context.clock;
  const clock =
    injectedClock && typeof injectedClock.start === "function"
      ? injectedClock
      : new MiniGameClock({
          now: typeof injectedClock?.now === "function" ? injectedClock.now : undefined,
        });
  const removers = [];
  let config = null;
  let ui = { root: null, stateLabel: null, clearButton: null, failButton: null };
  let state = "CREATED";
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;

  function setState(nextState) {
    state = nextState;
    setText(ui.stateLabel, `상태: ${nextState}`);
    const interactive = nextState === "RUNNING" && !inputLock.locked;
    if (ui.clearButton) ui.clearButton.disabled = !interactive;
    if (ui.failButton) ui.failButton.disabled = !interactive;
  }

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    currentAttemptId = attemptId;
    terminal = false;
    inputLock.clear();
    if (typeof clock.start === "function") {
      clock.start();
    } else {
      clock.reset?.();
    }
    setState("RUNNING");
  }

  function complete(status, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (state !== "RUNNING" && state !== "PAUSED")
    ) {
      return false;
    }
    if (status !== "CLEAR" && status !== "FAIL") {
      throw new TypeError("Scaffold modules may only complete with CLEAR or FAIL.");
    }

    terminal = true;
    setState("RESOLVING");
    inputLock.lock("TERMINAL");
    clock.stop?.();

    let candidate;
    try {
      const metrics = definition.createMetrics(status, config);
      candidate = buildMiniGameCandidate({
        status,
        score: null,
        failureReason: status === "FAIL" ? definition.failureReason ?? "SCAFFOLD_FAIL" : null,
        metrics,
        reward: null,
      });
    } catch (error) {
      setState("ERROR");
      context.onError?.(attemptId, error);
      return true;
    }

    setState("COMPLETED");
    context.onComplete?.(attemptId, candidate);
    return true;
  }

  return Object.freeze({
    async init(nextConfig = {}, { signal } = {}) {
      if (disposed || state !== "CREATED") {
        throw new Error(`Cannot initialize mini-game from state ${state}.`);
      }
      setState("INITIALIZING");
      throwIfUnavailable(signal, () => disposed);
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
        throw new TypeError("Mini-game config must be an object.");
      }
      definition.validateConfig?.(nextConfig);
      config = nextConfig;

      // Preserve a real asynchronous cancellation boundary for route contract tests.
      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);

      ui = buildScaffoldUi(context.uiRoot, {
        ...definition,
        goal: typeof config.goal === "string" && config.goal.length > 0 ? config.goal : definition.goal,
      });
      addListener(ui.clearButton, "click", () => {
        const attemptId = currentAttemptId;
        complete("CLEAR", attemptId);
      });
      addListener(ui.failButton, "click", () => {
        const attemptId = currentAttemptId;
        complete("FAIL", attemptId);
      });
      setState("READY");
    },

    start({ attemptId } = {}) {
      if (disposed || state !== "READY") {
        throw new Error(`Cannot start mini-game from state ${state}.`);
      }
      beginAttempt(attemptId);
    },

    pause(reason = "SYSTEM") {
      if (disposed || state !== "RUNNING") {
        return false;
      }
      inputLock.lock(reason);
      clock.pause?.(reason);
      setState("PAUSED");
      return true;
    },

    resume() {
      if (disposed || state !== "PAUSED") {
        return false;
      }
      inputLock.clear();
      clock.resume?.();
      setState("RUNNING");
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || state !== "COMPLETED") {
        throw new Error(`Cannot restart mini-game from state ${state}.`);
      }
      beginAttempt(attemptId);
    },

    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      terminal = true;
      currentAttemptId = null;
      inputLock.clear();
      clock.stop?.();
      for (const remove of removers.splice(0)) {
        remove();
      }
      ui.root?.remove?.();
      ui = { root: null, stateLabel: null, clearButton: null, failButton: null };
      state = "DESTROYED";
    },

    // Exposed for dependency-free contract tests; production UI never calls it.
    completeForDevelopment(status, attemptId) {
      return complete(status, attemptId);
    },

    getState() {
      return Object.freeze({
        state,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        elapsedMs: clock.getElapsedMs?.() ?? 0,
      });
    },
  });
}

export default createScaffoldMiniGame;

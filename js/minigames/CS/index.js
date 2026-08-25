import { INPUT_ACTIONS } from "../../core/input-manager.js";
import { MiniGameClock } from "../shared/minigame-clock.js";
import { buildMiniGameCandidate } from "../shared/result-builder.js";
import {
  calculatePurification,
  judgeTiming,
  pickTarget,
  resolveTerminalState,
} from "./judge.js";
import { createThreat } from "./malware.js";
import { createRunState, STATE, transitionState } from "./state.js";

const THREAT_TYPES = Object.freeze(["TROJAN", "WORM", "RANSOM", "SPYWARE"]);

// These values make the imported core loop playable, but remain prototype
// defaults until the team's D-04/D-05 balance decisions are approved.
const PROTOTYPE_DEFAULTS = Object.freeze({
  totalWaves: 6,
  spawnIntervalMs: 1_300,
  approachDurationMs: 1_400,
  perfectWindowMs: 200,
  goodWindowMs: 500,
  trojanRevealLeadMs: 500,
  missLimit: 3,
  timeLimitMs: 18_000,
  tickIntervalMs: 50,
});

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("CLICK to PURIFY initialization was aborted.", "AbortError");
  }
  const error = new Error("CLICK to PURIFY initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted) throw signal.reason ?? createAbortError();
  if (disposed()) throw createAbortError();
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new TypeError("CLICK to PURIFY attemptId must be a non-empty string.");
  }
}

function finiteAtLeast(value, minimum, fallback) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function normalizeConfig(source = {}) {
  const balance = source.balance && typeof source.balance === "object" ? source.balance : {};
  const perfectWindowMs = finiteAtLeast(
    firstFinite(
      source.perfectWindowMs,
      source.perfectwindowMs,
      balance.perfectWindowMs,
      balance.perfectwindowMs,
    ),
    0,
    PROTOTYPE_DEFAULTS.perfectWindowMs,
  );
  const goodWindowMs = Math.max(
    perfectWindowMs,
    finiteAtLeast(
      firstFinite(source.goodWindowMs, balance.goodWindowMs),
      0,
      PROTOTYPE_DEFAULTS.goodWindowMs,
    ),
  );
  const timeLimitFromSeconds = firstFinite(source.timeLimitSec, balance.timeLimitSec);
  const configuredTimeLimitMs = firstFinite(
    source.timeLimitMs,
    source.totalTimeLimitMs,
    balance.timeLimitMs,
    balance.totalTimeLimitMs,
    Number.isFinite(timeLimitFromSeconds) ? timeLimitFromSeconds * 1_000 : undefined,
  );

  return Object.freeze({
    totalWaves: Math.floor(
      finiteAtLeast(
        firstFinite(source.totalWaves, balance.totalWaves),
        1,
        PROTOTYPE_DEFAULTS.totalWaves,
      ),
    ),
    spawnIntervalMs: finiteAtLeast(
      firstFinite(source.spawnIntervalMs, balance.spawnIntervalMs),
      100,
      PROTOTYPE_DEFAULTS.spawnIntervalMs,
    ),
    approachDurationMs: finiteAtLeast(
      firstFinite(source.approachDurationMs, balance.approachDurationMs),
      0,
      PROTOTYPE_DEFAULTS.approachDurationMs,
    ),
    perfectWindowMs,
    goodWindowMs,
    trojanRevealLeadMs: finiteAtLeast(
      firstFinite(source.trojanRevealLeadMs, balance.trojanRevealLeadMs),
      0,
      PROTOTYPE_DEFAULTS.trojanRevealLeadMs,
    ),
    missLimit: Math.floor(
      finiteAtLeast(
        firstFinite(source.missLimit, balance.missLimit),
        1,
        PROTOTYPE_DEFAULTS.missLimit,
      ),
    ),
    timeLimitMs: finiteAtLeast(
      configuredTimeLimitMs,
      1_000,
      PROTOTYPE_DEFAULTS.timeLimitMs,
    ),
    tickIntervalMs: finiteAtLeast(
      firstFinite(source.tickIntervalMs, balance.tickIntervalMs),
      16,
      PROTOTYPE_DEFAULTS.tickIntervalMs,
    ),
  });
}

function emptyUi() {
  return {
    root: null,
    stateLabel: null,
    progressLabel: null,
    threatLabel: null,
    feedbackLabel: null,
    actionButton: null,
  };
}

// Build by retaining direct element references. This works in browsers and in
// the dependency-free FakeElement used by the common lifecycle contract test.
function buildUi(uiRoot) {
  const documentRef = uiRoot?.ownerDocument;
  if (!uiRoot?.append || !documentRef?.createElement) return emptyUi();

  const root = documentRef.createElement("section");
  root.className = "click-to-purify";
  root.dataset.miniGameId = "cyber-click-to-purify";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "CLICK to PURIFY prototype");

  const title = documentRef.createElement("h2");
  title.textContent = "CLICK to PURIFY";

  const prototypeNotice = documentRef.createElement("p");
  prototypeNotice.className = "click-to-purify__notice";
  prototypeNotice.textContent = "Prototype timing rules - balance is subject to team decisions.";

  const stateLabel = documentRef.createElement("p");
  stateLabel.className = "click-to-purify__state";
  stateLabel.setAttribute("aria-live", "polite");

  const progressLabel = documentRef.createElement("p");
  progressLabel.className = "click-to-purify__progress";

  const threatLabel = documentRef.createElement("p");
  threatLabel.className = "click-to-purify__threat";

  const actionButton = documentRef.createElement("button");
  actionButton.type = "button";
  actionButton.className = "click-to-purify__action";
  actionButton.textContent = "PURIFY";
  actionButton.disabled = true;

  const feedbackLabel = documentRef.createElement("p");
  feedbackLabel.className = "click-to-purify__feedback";
  feedbackLabel.setAttribute("aria-live", "assertive");

  root.append(
    title,
    prototypeNotice,
    stateLabel,
    progressLabel,
    threatLabel,
    actionButton,
    feedbackLabel,
  );
  uiRoot.append(root);

  return { root, stateLabel, progressLabel, threatLabel, feedbackLabel, actionButton };
}

export function createMiniGame(context = {}) {
  const injectedNow = context.clock?.now;
  const clock = new MiniGameClock({
    now: typeof injectedNow === "function" ? injectedNow : undefined,
  });
  const removers = [];
  let lifecycleState = STATE.CREATED;
  let runState = createRunState();
  let config = PROTOTYPE_DEFAULTS;
  let ui = emptyUi();
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;
  let loopHandle = null;

  function setLifecycleState(nextState) {
    lifecycleState = transitionState(lifecycleState, nextState);
    render();
  }

  function emit(eventName, payload = {}) {
    context.events?.emit?.(eventName, payload);
  }

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function stopLoop() {
    if (loopHandle != null) {
      globalThis.clearInterval?.(loopHandle);
      loopHandle = null;
    }
  }

  function metrics() {
    return {
      wavesResolved: runState.wavesResolved,
      purification: runState.purification,
      perfectCount: runState.perfectCount,
      goodCount: runState.goodCount,
      missCount: runState.missCount,
    };
  }

  function render() {
    if (ui.stateLabel) ui.stateLabel.textContent = `State: ${lifecycleState}`;
    if (ui.progressLabel) {
      ui.progressLabel.textContent = `Waves ${runState.wavesResolved}/${config.totalWaves} | Purification ${runState.purification}% | Miss ${runState.missCount}/${config.missLimit}`;
    }
    if (ui.feedbackLabel) ui.feedbackLabel.textContent = runState.lastJudgement;
    if (ui.actionButton) ui.actionButton.disabled = lifecycleState !== STATE.RUNNING || terminal;

    if (!ui.threatLabel) return;
    const elapsedMs = clock.getElapsedMs();
    const unresolved = runState.activeThreats.filter((threat) => !threat.resolved);
    if (unresolved.length === 0) {
      ui.threatLabel.textContent = runState.wavesSpawned < config.totalWaves
        ? "Scanning for the next threat..."
        : "All prototype waves resolved.";
      return;
    }

    const target = unresolved.reduce((closest, threat) => {
      if (!closest) return threat;
      return Math.abs(threat.targetAt - elapsedMs) < Math.abs(closest.targetAt - elapsedMs)
        ? threat
        : closest;
    }, null);
    const timing = Math.round(target.targetAt - elapsedMs);
    const visibility = target.type === "TROJAN" && !target.revealed ? "DISGUISED" : "VISIBLE";
    ui.threatLabel.textContent = `${target.type} | ${visibility} | target ${timing >= 0 ? "+" : ""}${timing}ms`;
  }

  function complete(status, attemptId = currentAttemptId, failureReason) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== STATE.RUNNING && lifecycleState !== STATE.PAUSED)
    ) {
      return false;
    }
    if (status !== "CLEAR" && status !== "FAIL") {
      throw new TypeError("CLICK to PURIFY can only complete with CLEAR or FAIL.");
    }

    terminal = true;
    stopLoop();
    clock.stop();
    setLifecycleState(STATE.RESOLVING);

    let candidate;
    try {
      candidate = buildMiniGameCandidate({
        status,
        score: null,
        failureReason: status === "FAIL" ? failureReason ?? "CORE_COMPROMISED" : null,
        metrics: metrics(),
        reward: null,
      });
    } catch (error) {
      setLifecycleState(STATE.ERROR);
      context.onError?.(attemptId, error);
      return true;
    }

    setLifecycleState(STATE.COMPLETED);
    runState.lastJudgement = status === "CLEAR" ? "PROTOTYPE CLEAR" : "PROTOTYPE FAIL";
    render();
    context.onComplete?.(attemptId, candidate);
    return true;
  }

  function runtimeError(error) {
    if (disposed || terminal) return;
    terminal = true;
    stopLoop();
    clock.stop();
    if (lifecycleState === STATE.RUNNING || lifecycleState === STATE.PAUSED) {
      setLifecycleState(STATE.ERROR);
    }
    context.onError?.(currentAttemptId, error);
  }

  function resolveThreat(threat, judgement) {
    if (!threat || threat.resolved || terminal) return;
    threat.resolved = true;
    runState.wavesResolved += 1;
    if (judgement === "PERFECT") runState.perfectCount += 1;
    else if (judgement === "GOOD") runState.goodCount += 1;
    else runState.missCount += 1;

    runState.purification = calculatePurification(
      runState.perfectCount,
      runState.goodCount,
      config.totalWaves,
    );
    runState.lastJudgement = judgement;
    runState.activeThreats = runState.activeThreats.filter((item) => !item.resolved);
    emit(`OnJudge${judgement[0]}${judgement.slice(1).toLowerCase()}`, {
      threatId: threat.id,
      type: threat.type,
      judgement,
    });
  }

  function addLooseMiss(message) {
    runState.missCount += 1;
    runState.lastJudgement = message;
    emit("OnJudgeMiss", { threatId: null, type: null, judgement: "MISS" });
  }

  function evaluateTerminal(elapsedMs) {
    const terminalResult = resolveTerminalState({
      missCount: runState.missCount,
      allWavesSpawned: runState.wavesSpawned >= config.totalWaves,
      activeThreats: runState.activeThreats,
      purification: runState.purification,
      config,
    });
    if (terminalResult) {
      emit(terminalResult.status === "CLEAR" ? "OnGameClear" : "OnGameOver", metrics());
      complete(terminalResult.status, currentAttemptId, terminalResult.failureReason);
      return true;
    }
    if (elapsedMs >= config.timeLimitMs) {
      emit("OnGameOver", metrics());
      complete("FAIL", currentAttemptId, "TIME_LIMIT");
      return true;
    }
    return false;
  }

  function spawnThreat(elapsedMs) {
    const type = THREAT_TYPES[runState.wavesSpawned % THREAT_TYPES.length];
    const threat = createThreat(type, elapsedMs, config);
    runState.activeThreats.push(threat);
    runState.wavesSpawned += 1;
    runState.nextSpawnAt = elapsedMs + config.spawnIntervalMs;
    emit("OnWaveSpawn", { wave: runState.wavesSpawned, threatId: threat.id, type });
  }

  function tick() {
    if (disposed || terminal || lifecycleState !== STATE.RUNNING) return;
    const elapsedMs = clock.getElapsedMs();

    if (runState.wavesSpawned < config.totalWaves && elapsedMs >= runState.nextSpawnAt) {
      spawnThreat(elapsedMs);
    }

    for (const threat of runState.activeThreats) {
      if (
        threat.type === "TROJAN" &&
        !threat.revealed &&
        elapsedMs >= threat.targetAt - config.trojanRevealLeadMs
      ) {
        threat.revealed = true;
        emit("OnTrojanReveal", { threatId: threat.id });
      }
    }

    const expiredThreats = runState.activeThreats.filter(
      (threat) => !threat.resolved && elapsedMs > threat.targetAt + config.goodWindowMs,
    );
    for (const threat of expiredThreats) {
      resolveThreat(threat, "MISS");
      if (runState.missCount >= config.missLimit) break;
    }

    if (!evaluateTerminal(elapsedMs)) render();
  }

  function startLoop() {
    stopLoop();
    try {
      tick();
      if (!terminal && lifecycleState === STATE.RUNNING) {
        loopHandle = globalThis.setInterval?.(() => {
          try {
            tick();
          } catch (error) {
            runtimeError(error);
          }
        }, config.tickIntervalMs) ?? null;
      }
    } catch (error) {
      runtimeError(error);
    }
  }

  function handlePurify() {
    if (disposed || terminal || lifecycleState !== STATE.RUNNING) return false;
    const elapsedMs = clock.getElapsedMs();
    const target = pickTarget(runState.activeThreats, elapsedMs);
    if (!target) {
      const hasDisguisedTrojan = runState.activeThreats.some(
        (threat) => !threat.resolved && threat.type === "TROJAN" && !threat.revealed,
      );
      if (hasDisguisedTrojan) {
        runState.lastJudgement = "NO-OP: TROJAN DISGUISED";
      } else {
        addLooseMiss("MISS: NO TARGET");
      }
    } else {
      resolveThreat(target, judgeTiming(elapsedMs, target.targetAt, config));
    }
    if (!evaluateTerminal(elapsedMs)) render();
    return true;
  }

  function resetAttempt() {
    runState = createRunState();
    terminal = false;
    render();
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    currentAttemptId = attemptId;
    resetAttempt();
    clock.start();
    setLifecycleState(STATE.RUNNING);
    startLoop();
  }

  return Object.freeze({
    async init(nextConfig = {}, { signal } = {}) {
      if (disposed || lifecycleState !== STATE.CREATED) {
        throw new Error(`Cannot initialize CLICK to PURIFY from state ${lifecycleState}.`);
      }
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
        throw new TypeError("CLICK to PURIFY config must be an object.");
      }

      setLifecycleState(STATE.INITIALIZING);
      throwIfUnavailable(signal, () => disposed);
      config = normalizeConfig(nextConfig);

      // Keep an asynchronous boundary so route cancellation can win safely.
      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);

      ui = buildUi(context.uiRoot);
      addListener(ui.actionButton, "click", handlePurify);
      const unsubscribeInput = context.input?.onAction?.((event) => {
        if (
          event?.phase === "press" &&
          (event.action === INPUT_ACTIONS.CONFIRM || event.action === INPUT_ACTIONS.INTERACT)
        ) {
          handlePurify();
        }
      });
      if (typeof unsubscribeInput === "function") removers.push(unsubscribeInput);
      setLifecycleState(STATE.READY);
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== STATE.READY) {
        throw new Error(`Cannot start CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    pause(reason = "SYSTEM") {
      if (disposed || lifecycleState !== STATE.RUNNING) return false;
      stopLoop();
      clock.pause(reason);
      setLifecycleState(STATE.PAUSED);
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== STATE.PAUSED) return false;
      clock.resume();
      setLifecycleState(STATE.RUNNING);
      startLoop();
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== STATE.COMPLETED) {
        throw new Error(`Cannot restart CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      currentAttemptId = null;
      stopLoop();
      clock.stop();
      for (const remove of removers.splice(0)) remove();
      ui.root?.remove?.();
      ui = emptyUi();
      runState.activeThreats = [];
      lifecycleState = transitionState(lifecycleState, STATE.DESTROYED);
    },

    completeForDevelopment(status, attemptId) {
      return complete(
        status,
        attemptId,
        status === "FAIL" ? "CORE_COMPROMISED" : null,
      );
    },

    getState() {
      return Object.freeze({
        state: lifecycleState,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        elapsedMs: clock.getElapsedMs(),
        wavesSpawned: runState.wavesSpawned,
        activeThreatCount: runState.activeThreats.length,
        ...metrics(),
      });
    },
  });
}

export default createMiniGame;

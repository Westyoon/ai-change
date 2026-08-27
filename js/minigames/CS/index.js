import { INPUT_ACTIONS } from "../../core/input-manager.js";
import { InputLock } from "../shared/input-lock.js";
import { MiniGameClock } from "../shared/minigame-clock.js";
import { buildMiniGameCandidate } from "../shared/result-builder.js";
import {
  calculatePurification,
  judgeTiming,
  pickTarget,
  resolveTerminalState,
} from "./judge.js";
import {
  createThreat,
  createWormChildren,
  updateThreatPresentation,
} from "./malware.js";
import { buildWavePlan, estimateWavePlanEndMs } from "./wave.js";

const MINI_GAME_ID = "cyber-click-to-purify";
const TYPE_COLORS = Object.freeze({
  TROJAN: "#ff8c37",
  WORM: "#2ed477",
  RANSOM: "#a85cff",
  SPYWARE: "#75a7ca",
});
const DISGUISE_COLOR = "#697386";

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

function buildUi(uiRoot) {
  const documentRef = uiRoot?.ownerDocument ?? globalThis.document;
  if (!uiRoot?.append || !documentRef?.createElement) {
    return {
      root: null,
      stateLabel: null,
      progressLabel: null,
      feedback: null,
      actionButton: null,
      lockLabel: null,
    };
  }

  const root = documentRef.createElement("section");
  root.className = "click-to-purify click-to-purify--mvp";
  root.dataset.miniGameId = MINI_GAME_ID;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "CLICK to PURIFY");

  const hud = documentRef.createElement("div");
  hud.className = "click-to-purify__hud";

  const heading = documentRef.createElement("h2");
  heading.textContent = "CLICK to PURIFY";

  const stateLabel = documentRef.createElement("p");
  stateLabel.className = "click-to-purify__state";

  const progressLabel = documentRef.createElement("p");
  progressLabel.className = "click-to-purify__progress";
  progressLabel.setAttribute("aria-live", "polite");

  const lockLabel = documentRef.createElement("p");
  lockLabel.className = "click-to-purify__lock";

  const feedback = documentRef.createElement("p");
  feedback.className = "click-to-purify__feedback";
  feedback.setAttribute("aria-live", "polite");

  const actionButton = documentRef.createElement("button");
  actionButton.type = "button";
  actionButton.className = "click-to-purify__action";
  actionButton.textContent = "PURIFY";
  actionButton.disabled = true;

  hud.append(heading, stateLabel, progressLabel, lockLabel);
  root.append(hud, feedback, actionButton);
  uiRoot.append(root);
  return { root, stateLabel, progressLabel, feedback, actionButton, lockLabel };
}

function requestFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout?.(() => callback(globalThis.performance?.now?.() ?? Date.now()), 16);
}

function cancelFrame(handle) {
  if (handle == null) return;
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout?.(handle);
  }
}

export function createMiniGame(context = {}) {
  const inputLock = new InputLock();
  const clock = new MiniGameClock({
    now: typeof context.clock?.now === "function" ? context.clock.now : undefined,
  });
  const removers = [];
  const canvas = context.canvas ?? null;
  const canvasContext = canvas?.getContext?.("2d") ?? null;

  let config = null;
  let ui = buildUi(null);
  let lifecycleState = "CREATED";
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;
  let frameHandle = null;
  let wavePlan = [];
  let nextWaveIndex = 0;
  let activeThreats = [];
  let perfectCount = 0;
  let goodCount = 0;
  let missCount = 0;
  let splitChildMissCount = 0;
  let inputLockedUntilMs = 0;
  let coreFlashUntilMs = 0;
  let lastJudgement = "READY";
  let judgementEffects = [];

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function setState(nextState) {
    lifecycleState = nextState;
    if (ui.stateLabel) ui.stateLabel.textContent = `상태: ${nextState}`;
    updateHud();
  }

  function purification() {
    return calculatePurification(perfectCount, goodCount, wavePlan.length);
  }

  function updateHud(elapsedMs = clock.getElapsedMs()) {
    if (ui.progressLabel) {
      ui.progressLabel.textContent =
        `정화도 ${purification()}% · ${nextWaveIndex}/${wavePlan.length} WAVE · MISS ${missCount}/${config?.missLimit ?? 3}`;
    }
    const ransomLocked = elapsedMs < inputLockedUntilMs;
    if (ui.lockLabel) {
      ui.lockLabel.textContent = ransomLocked
        ? `🔒 RANSOM LOCK ${(Math.max(0, inputLockedUntilMs - elapsedMs) / 1000).toFixed(1)}초`
        : "";
    }
    if (ui.feedback) ui.feedback.textContent = lastJudgement;
    if (ui.actionButton) {
      ui.actionButton.disabled = lifecycleState !== "RUNNING" || inputLock.locked || ransomLocked;
    }
  }

  function resetRunState() {
    wavePlan = buildWavePlan(config);
    nextWaveIndex = 0;
    activeThreats = [];
    perfectCount = 0;
    goodCount = 0;
    missCount = 0;
    splitChildMissCount = 0;
    inputLockedUntilMs = 0;
    coreFlashUntilMs = 0;
    lastJudgement = "코어를 향해 오는 위협을 판정 링에서 정화하세요.";
    judgementEffects = [];
    inputLock.clear();
  }

  function addEffect(text, elapsedMs, color = "#ffe17a") {
    judgementEffects.push({ text, startedAt: elapsedMs, durationMs: 700, color });
  }

  function spawnDueWaves(elapsedMs) {
    while (nextWaveIndex < wavePlan.length && wavePlan[nextWaveIndex].spawnAtMs <= elapsedMs) {
      const wave = wavePlan[nextWaveIndex];
      const angle = Math.random() * Math.PI * 2;
      activeThreats.push(createThreat(wave.type, wave.spawnAtMs, config, {
        angle,
        approachDurationMs: wave.approachDurationMs,
      }));
      nextWaveIndex += 1;
    }
  }

  function missThreat(threat, elapsedMs) {
    if (!threat || threat.resolved) return;
    threat.resolved = true;
    if (threat.isSplitChild) splitChildMissCount += 1;
    else missCount += 1;
    lastJudgement = threat.isSplitChild ? "분열체가 코어에 충돌했습니다." : `MISS · ${threat.type}`;
    addEffect("MISS!", elapsedMs, "#ff647c");
    coreFlashUntilMs = elapsedMs + 260;

    if (threat.type === "WORM" && !threat.isSplitChild) {
      activeThreats.push(...createWormChildren(threat, elapsedMs + 180, config));
      lastJudgement = "MISS · WORM이 두 개의 분열체로 나뉘었습니다.";
    }
    if (threat.type === "RANSOM") {
      inputLockedUntilMs = Math.max(
        inputLockedUntilMs,
        elapsedMs + finiteAtLeast(config.ransomLockMs, 0, 1_500),
      );
      inputLock.lock("RANSOM");
      lastJudgement = "MISS · RANSOM이 정화 입력을 잠갔습니다.";
    }
  }

  function finish(status, failureReason = null, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== "RUNNING" && lifecycleState !== "PAUSED")
    ) {
      return false;
    }
    if (status !== "CLEAR" && status !== "FAIL") {
      throw new TypeError("CLICK to PURIFY can only complete with CLEAR or FAIL.");
    }

    terminal = true;
    cancelFrame(frameHandle);
    frameHandle = null;
    inputLock.lock("TERMINAL");
    clock.stop();
    setState("RESOLVING");

    try {
      const candidate = buildMiniGameCandidate({
        status,
        score: purification(),
        failureReason: status === "FAIL" ? failureReason ?? "MISS_LIMIT" : null,
        metrics: {
          perfectCount,
          goodCount,
          missCount,
          splitChildMissCount,
          totalWaves: wavePlan.length,
          spawnedWaves: nextWaveIndex,
          purification: purification(),
        },
        reward: null,
      });
      setState("COMPLETED");
      context.onComplete?.(attemptId, candidate);
    } catch (error) {
      setState("ERROR");
      context.onError?.(attemptId, error);
    }
    return true;
  }

  function evaluateTerminal() {
    const unresolved = activeThreats.filter((threat) => !threat.resolved);
    const result = resolveTerminalState({
      missCount,
      allWavesSpawned: nextWaveIndex >= wavePlan.length,
      activeThreats: unresolved,
      purification: purification(),
      config,
    });
    if (result) finish(result.status, result.failureReason);
  }

  function update(elapsedMs) {
    if (lifecycleState !== "RUNNING" || terminal) return;
    spawnDueWaves(elapsedMs);

    if (inputLockedUntilMs > 0 && elapsedMs >= inputLockedUntilMs) {
      inputLockedUntilMs = 0;
      inputLock.unlock("RANSOM");
      lastJudgement = "RANSOM LOCK 해제";
    }

    for (const threat of activeThreats) {
      if (threat.resolved || elapsedMs < threat.spawnedAt) continue;
      updateThreatPresentation(threat, elapsedMs, config);
      if (elapsedMs > threat.targetAt + finiteAtLeast(config.goodWindowMs, 0, 500)) {
        missThreat(threat, elapsedMs);
      }
    }
    activeThreats = activeThreats.filter((threat) => !threat.resolved);
    judgementEffects = judgementEffects.filter(
      (effect) => elapsedMs - effect.startedAt < effect.durationMs,
    );

    const hardEndMs = estimateWavePlanEndMs(wavePlan, config.goodWindowMs) +
      finiteAtLeast(config.completionGraceMs, 0, 1_000);
    if (elapsedMs > hardEndMs && nextWaveIndex >= wavePlan.length) {
      for (const threat of activeThreats) missThreat(threat, elapsedMs);
      activeThreats = activeThreats.filter((threat) => !threat.resolved);
    }
    updateHud(elapsedMs);
    evaluateTerminal();
  }

  function purify() {
    if (lifecycleState !== "RUNNING" || terminal || inputLock.locked) return false;
    const elapsedMs = clock.getElapsedMs();
    const target = pickTarget(activeThreats, elapsedMs);
    if (!target) {
      lastJudgement = "판정 가능한 위협이 없습니다.";
      updateHud(elapsedMs);
      return false;
    }

    const judgement = judgeTiming(elapsedMs, target.targetAt, config);
    const errorMs = Math.abs(elapsedMs - target.targetAt);
    if (judgement === "MISS" && errorMs > finiteAtLeast(config.clickIgnoreMs, 0, 900)) {
      lastJudgement = "타이밍이 너무 멉니다.";
      updateHud(elapsedMs);
      return false;
    }

    if (judgement === "MISS") {
      missThreat(target, elapsedMs);
    } else {
      target.resolved = true;
      if (!target.isSplitChild) {
        if (judgement === "PERFECT") perfectCount += 1;
        else goodCount += 1;
      }
      lastJudgement = target.isSplitChild
        ? `분열체 제거 · ${judgement}`
        : `${judgement} · ${target.type}`;
      addEffect(`${judgement}!`, elapsedMs, judgement === "PERFECT" ? "#74fff2" : "#ffe17a");
    }
    activeThreats = activeThreats.filter((threat) => !threat.resolved);
    updateHud(elapsedMs);
    evaluateTerminal();
    return true;
  }

  function render(elapsedMs) {
    if (!canvasContext || !canvas) return;
    const width = Math.max(1, Number(canvas.width) || 960);
    const height = Math.max(1, Number(canvas.height) || 540);
    const unit = Math.min(width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const coreRadius = unit * 0.075;
    const ringRadius = unit * 0.19;
    const startRadius = unit * 0.46;

    canvasContext.clearRect(0, 0, width, height);
    const background = canvasContext.createRadialGradient?.(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      unit * 0.7,
    );
    if (background) {
      background.addColorStop(0, "#161c39");
      background.addColorStop(1, "#050811");
      canvasContext.fillStyle = background;
    } else {
      canvasContext.fillStyle = "#050811";
    }
    canvasContext.fillRect(0, 0, width, height);

    canvasContext.strokeStyle = "rgba(116,255,242,.75)";
    canvasContext.lineWidth = Math.max(2, unit * 0.005);
    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    canvasContext.stroke();

    canvasContext.fillStyle = elapsedMs < coreFlashUntilMs ? "#ff405e" : "#3b5ef5";
    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    canvasContext.fill();
    canvasContext.fillStyle = "#fff";
    canvasContext.font = `bold ${Math.max(12, unit * 0.026)}px monospace`;
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "middle";
    canvasContext.fillText("CORE", centerX, centerY);

    for (const threat of activeThreats) {
      if (elapsedMs < threat.spawnedAt) continue;
      const duration = Math.max(1, threat.targetAt - threat.spawnedAt);
      const progress = Math.min(1.25, Math.max(0, (elapsedMs - threat.spawnedAt) / duration));
      const radius = startRadius + (ringRadius - startRadius) * progress;
      const x = centerX + Math.cos(threat.angle) * radius;
      const y = centerY + Math.sin(threat.angle) * radius;
      const bodyRadius = Math.max(10, unit * (threat.isSplitChild ? 0.018 : 0.025));
      const color = threat.type === "TROJAN" && !threat.revealed
        ? DISGUISE_COLOR
        : TYPE_COLORS[threat.type] ?? "#fff";

      canvasContext.globalAlpha = threat.type === "SPYWARE" ? threat.opacity : 1;
      canvasContext.fillStyle = color;
      canvasContext.beginPath();
      canvasContext.arc(x, y, bodyRadius, 0, Math.PI * 2);
      canvasContext.fill();
      canvasContext.globalAlpha = 1;

      if (Math.abs(elapsedMs - threat.targetAt) <= finiteAtLeast(config.goodWindowMs, 0, 500)) {
        canvasContext.strokeStyle = "#ff526e";
        canvasContext.lineWidth = 2;
        canvasContext.beginPath();
        canvasContext.arc(x, y, bodyRadius * 1.55, 0, Math.PI * 2);
        canvasContext.stroke();
      }

      canvasContext.fillStyle = "#fff";
      canvasContext.font = `bold ${Math.max(9, unit * 0.018)}px monospace`;
      canvasContext.fillText(threat.isSplitChild ? "WORM·SPLIT" : threat.type, x, y - bodyRadius * 2);
    }

    for (const effect of judgementEffects) {
      const progress = Math.min(1, (elapsedMs - effect.startedAt) / effect.durationMs);
      canvasContext.globalAlpha = 1 - progress;
      canvasContext.fillStyle = effect.color;
      canvasContext.font = `bold ${Math.max(18, unit * 0.045)}px monospace`;
      canvasContext.fillText(effect.text, centerX, centerY - ringRadius - progress * 30);
      canvasContext.globalAlpha = 1;
    }

    if (elapsedMs < inputLockedUntilMs) {
      canvasContext.fillStyle = "rgba(7,8,18,.62)";
      canvasContext.fillRect(0, 0, width, height);
      canvasContext.fillStyle = "#f1c0ff";
      canvasContext.font = `bold ${Math.max(22, unit * 0.06)}px monospace`;
      canvasContext.fillText("🔒 RANSOM LOCK", centerX, centerY);
    }
  }

  function frame() {
    frameHandle = null;
    if (disposed || terminal || lifecycleState !== "RUNNING") return;
    const elapsedMs = clock.getElapsedMs();
    update(elapsedMs);
    render(elapsedMs);
    if (!terminal && lifecycleState === "RUNNING") frameHandle = requestFrame(frame);
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    cancelFrame(frameHandle);
    frameHandle = null;
    currentAttemptId = attemptId;
    terminal = false;
    resetRunState();
    clock.start();
    setState("RUNNING");
    update(0);
    render(0);
    if (canvasContext) frameHandle = requestFrame(frame);
  }

  return Object.freeze({
    async init(nextConfig = {}, { signal } = {}) {
      if (disposed || lifecycleState !== "CREATED") {
        throw new Error(`Cannot initialize CLICK to PURIFY from state ${lifecycleState}.`);
      }
      setState("INITIALIZING");
      throwIfUnavailable(signal, () => disposed);
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
        throw new TypeError("CLICK to PURIFY config must be an object.");
      }
      config = nextConfig;
      buildWavePlan(config);

      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);

      ui = buildUi(context.uiRoot);
      addListener(ui.actionButton, "click", purify);
      addListener(canvas, "pointerdown", purify);
      const unsubscribeInput = context.input?.onAction?.((event) => {
        if (
          event?.phase === "press" &&
          (event.action === INPUT_ACTIONS.CONFIRM || event.action === INPUT_ACTIONS.INTERACT)
        ) {
          purify();
        }
      });
      if (typeof unsubscribeInput === "function") removers.push(unsubscribeInput);
      setState("READY");
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== "READY") {
        throw new Error(`Cannot start CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    pause(reason = "SYSTEM") {
      if (disposed || lifecycleState !== "RUNNING" || terminal) return false;
      cancelFrame(frameHandle);
      frameHandle = null;
      inputLock.lock(reason);
      clock.pause(reason);
      setState("PAUSED");
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== "PAUSED" || terminal) return false;
      clock.resume();
      inputLock.clear();
      const elapsedMs = clock.getElapsedMs();
      if (elapsedMs < inputLockedUntilMs) inputLock.lock("RANSOM");
      setState("RUNNING");
      render(elapsedMs);
      if (canvasContext) frameHandle = requestFrame(frame);
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== "COMPLETED") {
        throw new Error(`Cannot restart CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      cancelFrame(frameHandle);
      frameHandle = null;
      clock.stop();
      inputLock.clear();
      currentAttemptId = null;
      activeThreats = [];
      judgementEffects = [];
      for (const remove of removers.splice(0)) remove();
      ui.root?.remove?.();
      ui = buildUi(null);
      lifecycleState = "DESTROYED";
    },

    completeForDevelopment(status, attemptId) {
      return finish(
        status,
        status === "FAIL" ? "DEVELOPMENT_FAIL" : null,
        attemptId,
      );
    },

    getState() {
      return Object.freeze({
        state: lifecycleState,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        elapsedMs: clock.getElapsedMs(),
        waveCount: wavePlan.length,
        spawnedWaves: nextWaveIndex,
        activeThreatCount: activeThreats.length,
        perfectCount,
        goodCount,
        missCount,
        splitChildMissCount,
        purification: purification(),
        inputLockedUntilMs,
      });
    },
  });
}

export default createMiniGame;

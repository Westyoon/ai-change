import { INPUT_ACTIONS } from "../../core/input-manager.js";
import { InputLock } from "../shared/input-lock.js";
import { MiniGameClock } from "../shared/minigame-clock.js";
import { buildMiniGameCandidate } from "../shared/result-builder.js";
import {
  advanceBall,
  classifyBallResolution,
  createBallQueue,
} from "./queue.js";

const MINI_GAME_ID = "ai-ball-classification";

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("AI Ball Classification initialization was aborted.", "AbortError");
  }
  const error = new Error("AI Ball Classification initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted) throw signal.reason ?? createAbortError();
  if (disposed()) throw createAbortError();
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new TypeError("AI Ball Classification attemptId must be a non-empty string.");
  }
}

function finiteAtLeast(value, minimum, fallback) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function integerAtLeast(value, minimum, fallback) {
  return Number.isInteger(value) ? Math.max(minimum, value) : fallback;
}

function buildUi(uiRoot) {
  const documentRef = uiRoot?.ownerDocument ?? globalThis.document;
  if (!uiRoot?.append || !documentRef?.createElement) {
    return {
      root: null,
      progress: null,
      countdown: null,
      feedback: null,
      lidButton: null,
      targetImage: null,
      state: null,
    };
  }

  const root = documentRef.createElement("section");
  root.className = "ai-ball-classification";
  root.dataset.miniGameId = MINI_GAME_ID;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "AI 공 분류 게임");

  const hud = documentRef.createElement("header");
  hud.className = "ai-ball-classification__hud";

  const targetCard = documentRef.createElement("div");
  targetCard.className = "ai-ball-classification__target";
  const targetLabel = documentRef.createElement("strong");
  targetLabel.textContent = "TARGET · DATA";
  const targetImage = documentRef.createElement("img");
  targetImage.className = "ai-ball-classification__target-image";
  targetImage.alt = "분류할 목표 공";
  targetCard.append(targetLabel, targetImage);

  const statusGroup = documentRef.createElement("div");
  statusGroup.className = "ai-ball-classification__status";
  const state = documentRef.createElement("span");
  const progress = documentRef.createElement("strong");
  progress.setAttribute("aria-live", "polite");
  statusGroup.append(state, progress);
  hud.append(targetCard, statusGroup);

  const countdown = documentRef.createElement("p");
  countdown.className = "ai-ball-classification__countdown";
  countdown.setAttribute("aria-live", "polite");

  const feedback = documentRef.createElement("p");
  feedback.className = "ai-ball-classification__feedback";
  feedback.setAttribute("aria-live", "polite");

  const lidButton = documentRef.createElement("button");
  lidButton.type = "button";
  lidButton.className = "ai-ball-classification__lid is-closed";
  lidButton.textContent = "CLOSE · 뚜껑 닫힘";
  lidButton.disabled = true;

  root.append(hud, countdown, feedback, lidButton);
  uiRoot.append(root);
  return { root, progress, countdown, feedback, lidButton, targetImage, state };
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
  let lastElapsedMs = 0;
  let countdownRemaining = 0;
  let spawnAccumulator = 0;
  let ballQueue = [];
  let activeBalls = [];
  let lidState = "CLOSED";
  let collectedTargets = 0;
  let targetMissed = 0;
  let wrongCollected = 0;
  let nonTargetsPassed = 0;
  let ballsResolved = 0;
  let failureReason = null;
  let targetImage = null;
  let feedbackText = "목표 공만 분류통에 담으세요.";

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function setState(nextState) {
    lifecycleState = nextState;
    if (ui.state) ui.state.textContent = `상태: ${nextState}`;
    updateUi();
  }

  function updateUi() {
    if (ui.progress) {
      ui.progress.textContent = `수집 ${collectedTargets}/${config?.targetCount ?? 5}`;
    }
    if (ui.countdown) {
      ui.countdown.textContent = countdownRemaining > 0
        ? String(Math.max(1, Math.ceil(countdownRemaining)))
        : "";
    }
    if (ui.feedback) ui.feedback.textContent = feedbackText;
    if (ui.lidButton) {
      const isOpen = lidState === "OPEN";
      ui.lidButton.textContent = isOpen
        ? config?.uiText?.lidOpen ?? "OPEN · 뚜껑 열림"
        : config?.uiText?.lidClose ?? "CLOSE · 뚜껑 닫힘";
      ui.lidButton.className = `ai-ball-classification__lid ${isOpen ? "is-open" : "is-closed"}`;
      ui.lidButton.disabled = lifecycleState !== "RUNNING" || inputLock.locked || countdownRemaining > 0;
    }
  }

  function resetRunState() {
    targetImage = context.assets?.get?.(config.targetAssetId) ?? null;
    ballQueue = createBallQueue({
      targetCount: config.targetCount,
      nonTargetCount: config.nonTargetCount,
      targetImage,
    });
    activeBalls = [];
    lidState = config.initialLidState === "OPEN" ? "OPEN" : "CLOSED";
    countdownRemaining = finiteAtLeast(config.countdownSeconds, 0, 3);
    spawnAccumulator = 0;
    collectedTargets = 0;
    targetMissed = 0;
    wrongCollected = 0;
    nonTargetsPassed = 0;
    ballsResolved = 0;
    failureReason = null;
    feedbackText = config.uiText?.ruleExplanation ?? "목표 공만 분류통에 담으세요.";
    lastElapsedMs = 0;
    inputLock.clear();
    if (ui.targetImage) {
      if (targetImage?.src) ui.targetImage.src = targetImage.src;
      else ui.targetImage.removeAttribute?.("src");
    }
  }

  function resultMetrics() {
    return {
      collectedTargets,
      totalTargetCount: config.targetCount,
      targetMissed,
      wrongCollected,
      nonTargetsPassed,
      ballsResolved,
      totalBallCount: config.targetCount + config.nonTargetCount,
    };
  }

  function reportRuntimeError(error) {
    if (
      disposed ||
      terminal ||
      currentAttemptId == null ||
      (lifecycleState !== "RUNNING" && lifecycleState !== "PAUSED")
    ) {
      return false;
    }
    terminal = true;
    failureReason = error?.code ?? "MINIGAME_RUNTIME_ERROR";
    cancelFrame(frameHandle);
    frameHandle = null;
    inputLock.lock("TERMINAL");
    clock.stop();
    setState("ERROR");
    context.onError?.(currentAttemptId, error);
    return true;
  }

  function finish(status, reason = null, attemptId = currentAttemptId) {
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
      throw new TypeError("AI Ball Classification can only complete with CLEAR or FAIL.");
    }

    terminal = true;
    failureReason = status === "FAIL" ? reason ?? "CLASSIFICATION_FAILED" : null;
    cancelFrame(frameHandle);
    frameHandle = null;
    inputLock.lock("TERMINAL");
    clock.stop();
    setState("RESOLVING");

    let candidate;
    try {
      const score = status === "CLEAR"
        ? 100
        : Math.max(0, Math.floor((collectedTargets / Math.max(1, config.targetCount)) * 100));
      candidate = buildMiniGameCandidate({
        status,
        score,
        failureReason,
        metrics: resultMetrics(),
        reward: null,
      });
    } catch (error) {
      setState("ERROR");
      context.onError?.(attemptId, error);
      return true;
    }

    setState("COMPLETED");
    try {
      context.onComplete?.(attemptId, candidate);
    } catch (error) {
      // A host callback failure must not be reclassified as a second game result.
      globalThis.console?.error?.("AI Ball Classification host completion callback failed.", error);
    }
    return true;
  }

  function toggleLid() {
    if (lifecycleState !== "RUNNING" || terminal || inputLock.locked || countdownRemaining > 0) {
      return false;
    }
    lidState = lidState === "OPEN" ? "CLOSED" : "OPEN";
    feedbackText = lidState === "OPEN" ? "분류통을 열었습니다." : "분류통을 닫았습니다.";
    updateUi();
    return true;
  }

  function spawnBall(width, trackY) {
    const next = ballQueue.shift();
    if (!next) return;
    const radius = Math.min(34, Math.max(14, width * 0.035));
    activeBalls.push({
      ...next,
      x: -radius,
      y: trackY - radius,
      radius,
      falling: false,
    });
  }

  function resolveBall(ball, captured) {
    const resolution = classifyBallResolution({ isTarget: ball.isTarget, captured });
    ballsResolved += 1;
    if (resolution === "TARGET_COLLECTED") {
      collectedTargets += 1;
      feedbackText = `목표 공 수집 · ${collectedTargets}/${config.targetCount}`;
      if (collectedTargets >= config.targetCount) finish("CLEAR");
    } else if (resolution === "WRONG_BALL") {
      wrongCollected += 1;
      feedbackText = config.uiText?.failReasons?.WRONG_BALL ?? "오답 공을 담았습니다.";
      finish("FAIL", "WRONG_BALL");
    } else if (resolution === "MISSED_TARGET") {
      targetMissed += 1;
      feedbackText = config.uiText?.failReasons?.MISSED_TARGET ?? "목표 공을 놓쳤습니다.";
      finish("FAIL", "MISSED_TARGET");
    } else {
      nonTargetsPassed += 1;
      feedbackText = "방해 공을 통과시켰습니다.";
    }
  }

  function update(deltaSeconds) {
    if (lifecycleState !== "RUNNING" || terminal) return;
    if (countdownRemaining > 0) {
      countdownRemaining = Math.max(0, countdownRemaining - deltaSeconds);
      if (countdownRemaining === 0) feedbackText = "분류 시작!";
      updateUi();
      return;
    }

    const width = Math.max(1, Number(canvas?.width) || 960);
    const height = Math.max(1, Number(canvas?.height) || 540);
    const trackY = height * 0.58;
    const binX = width * 0.65;
    const binY = height * 0.72;
    const binWidth = width * 0.2;
    const horizontalSpeed = width * finiteAtLeast(config.ballSpeed, 0.05, 0.8);
    const fallSpeed = height * 2;
    const spawnInterval = finiteAtLeast(config.spawnIntervalSeconds, 0.15, 0.9);

    spawnAccumulator += deltaSeconds;
    while (spawnAccumulator >= spawnInterval && ballQueue.length > 0) {
      spawnAccumulator -= spawnInterval;
      spawnBall(width, trackY);
    }

    for (let index = activeBalls.length - 1; index >= 0; index -= 1) {
      const ball = activeBalls[index];
      advanceBall(ball, deltaSeconds, { horizontalSpeed, fallSpeed });
      if (ball.falling) {
        if (ball.y > binY + 40) {
          activeBalls.splice(index, 1);
          resolveBall(ball, true);
          if (terminal) {
            updateUi();
            return;
          }
        }
        continue;
      }

      const inBinZone = ball.x >= binX + 15 && ball.x <= binX + binWidth - 15;
      if (inBinZone && lidState === "OPEN") ball.falling = true;
      if (ball.x > binX + binWidth + ball.radius) {
        activeBalls.splice(index, 1);
        resolveBall(ball, false);
        if (terminal) {
          updateUi();
          return;
        }
      }
    }
    updateUi();
  }

  function render() {
    if (!canvasContext || !canvas) return;
    const width = Math.max(1, Number(canvas.width) || 960);
    const height = Math.max(1, Number(canvas.height) || 540);
    const trackY = height * 0.58;
    const binX = width * 0.65;
    const binY = height * 0.72;
    const binWidth = width * 0.2;
    const binHeight = height * 0.22;

    canvasContext.clearRect(0, 0, width, height);
    canvasContext.fillStyle = "#20222f";
    canvasContext.fillRect(0, 0, width, height);

    canvasContext.fillStyle = "#3a3d52";
    canvasContext.fillRect(0, trackY, width, Math.max(8, height * 0.018));

    canvasContext.fillStyle = "#4a4d66";
    canvasContext.fillRect(binX, binY, binWidth, binHeight);
    canvasContext.strokeStyle = "#00cec9";
    canvasContext.lineWidth = Math.max(2, width * 0.003);
    canvasContext.strokeRect(binX, binY, binWidth, binHeight);

    if (lidState === "CLOSED") {
      canvasContext.fillStyle = "#ff7675";
      canvasContext.fillRect(binX - 5, binY - 8, binWidth + 10, 10);
    } else {
      canvasContext.fillStyle = "#55efc4";
      canvasContext.fillRect(binX - 5, binY, 10, binHeight - 10);
    }

    for (const ball of activeBalls) {
      canvasContext.save();
      canvasContext.beginPath();
      canvasContext.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      canvasContext.closePath();
      canvasContext.fillStyle = ball.isTarget ? "#6c5ce7" : "#fdcb6e";
      canvasContext.fill();
      canvasContext.lineWidth = 4;
      canvasContext.strokeStyle = ball.isTarget ? "#c7bfff" : "#5c4812";
      canvasContext.stroke();
      if (ball.isTarget && ball.image) {
        canvasContext.clip();
        canvasContext.drawImage(
          ball.image,
          ball.x - ball.radius,
          ball.y - ball.radius,
          ball.radius * 2,
          ball.radius * 2,
        );
      }
      canvasContext.restore();
    }

    if (countdownRemaining > 0) {
      canvasContext.fillStyle = "rgba(12,14,28,.48)";
      canvasContext.fillRect(0, 0, width, height);
    }
  }

  function frame() {
    frameHandle = null;
    if (disposed || terminal || lifecycleState !== "RUNNING") return;
    try {
      const elapsedMs = clock.getElapsedMs();
      const deltaSeconds = Math.min(0.1, Math.max(0, (elapsedMs - lastElapsedMs) / 1000));
      lastElapsedMs = elapsedMs;
      update(deltaSeconds);
      render();
    } catch (error) {
      reportRuntimeError(error);
      return;
    }
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
    try {
      render();
      if (canvasContext) frameHandle = requestFrame(frame);
    } catch (error) {
      reportRuntimeError(error);
    }
  }

  return Object.freeze({
    async init(nextConfig = {}, { signal } = {}) {
      if (disposed || lifecycleState !== "CREATED") {
        throw new Error(`Cannot initialize AI Ball Classification from state ${lifecycleState}.`);
      }
      setState("INITIALIZING");
      throwIfUnavailable(signal, () => disposed);
      if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
        throw new TypeError("AI Ball Classification config must be an object.");
      }
      if (canvas && !canvasContext) {
        throw new Error("AI Ball Classification requires a working 2D canvas context.");
      }
      const targetCount = integerAtLeast(nextConfig.targetCount, 1, 5);
      const nonTargetCount = integerAtLeast(nextConfig.nonTargetCount, 0, 25);
      config = { ...nextConfig, targetCount, nonTargetCount };

      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);

      ui = buildUi(context.uiRoot);
      addListener(ui.lidButton, "click", toggleLid);
      const unsubscribeInput = context.input?.onAction?.((event) => {
        if (event?.phase === "press" && event.action === INPUT_ACTIONS.CONFIRM) toggleLid();
      });
      if (typeof unsubscribeInput === "function") removers.push(unsubscribeInput);
      setState("READY");
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== "READY") {
        throw new Error(`Cannot start AI Ball Classification from state ${lifecycleState}.`);
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
      lastElapsedMs = clock.getElapsedMs();
      setState("RUNNING");
      if (canvasContext) frameHandle = requestFrame(frame);
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== "COMPLETED") {
        throw new Error(`Cannot restart AI Ball Classification from state ${lifecycleState}.`);
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
      activeBalls = [];
      ballQueue = [];
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
        lidState,
        countdownRemaining,
        queuedBalls: ballQueue.length,
        activeBalls: activeBalls.length,
        collectedTargets,
        targetMissed,
        wrongCollected,
        nonTargetsPassed,
        ballsResolved,
        failureReason,
      });
    },
  });
}

export default createMiniGame;

import { INPUT_ACTIONS } from "../../core/input-manager.js";
import { InputLock } from "../shared/input-lock.js";
import { MiniGameClock } from "../shared/minigame-clock.js";
import { buildMiniGameCandidate } from "../shared/result-builder.js";
import {
  advanceBall,
  classifyBallResolution,
  createBallQueue,
  getBallMotionProfile,
} from "./queue.js";

const MINI_GAME_ID = "ai-ball-classification";
const PROTOTYPE_CANVAS_WIDTH = 480;
const PROTOTYPE_CANVAS_HEIGHT = 460;

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

function addClassName(target, className) {
  if (!target) return;
  const current = typeof target.className === "string" ? target.className : "";
  const names = new Set(current.split(/\s+/u).filter(Boolean));
  names.add(className);
  target.className = [...names].join(" ");
}

function emptyUi() {
  return {
    root: null,
    progress: null,
    progressTotal: null,
    countdownOverlay: null,
    countdownText: null,
    countdownImage: null,
    status: null,
    lidButton: null,
  };
}

function buildUi(uiRoot) {
  const documentRef = uiRoot?.ownerDocument ?? globalThis.document;
  if (!uiRoot?.append || !documentRef?.createElement) return emptyUi();

  const root = documentRef.createElement("section");
  root.className = "ai-ball-classification";
  root.dataset.miniGameId = MINI_GAME_ID;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "AI 공 분류 게임");

  const topArea = documentRef.createElement("header");
  topArea.className = "top-area";
  const targetBox = documentRef.createElement("div");
  targetBox.className = "target-box";
  const targetLabel = documentRef.createElement("span");
  targetLabel.textContent = "목표:";
  const targetBadge = documentRef.createElement("span");
  targetBadge.className = "target-badge";
  targetBadge.textContent = "DATA 공 (보라색)";
  targetBox.append(targetLabel, targetBadge);

  const progressBox = documentRef.createElement("div");
  progressBox.className = "progress-box";
  const progressLabel = documentRef.createElement("span");
  progressLabel.textContent = "수집: ";
  const progress = documentRef.createElement("span");
  progress.textContent = "0";
  progress.setAttribute("aria-live", "polite");
  const progressDivider = documentRef.createElement("span");
  progressDivider.textContent = " / ";
  const progressTotal = documentRef.createElement("span");
  progressTotal.textContent = "5";
  progressBox.append(progressLabel, progress, progressDivider, progressTotal);
  topArea.append(targetBox, progressBox);

  const countdownOverlay = documentRef.createElement("div");
  countdownOverlay.className = "overlay countdown-overlay hidden";
  const countdownCard = documentRef.createElement("div");
  countdownCard.className = "countdown-card";
  const countdownHeading = documentRef.createElement("h3");
  countdownHeading.textContent = "수집할 공 이미지";
  const targetPreviewBox = documentRef.createElement("div");
  targetPreviewBox.className = "target-preview-box";
  const countdownImage = documentRef.createElement("img");
  countdownImage.className = "countdown-target-img";
  countdownImage.alt = "목표 공 이미지";
  targetPreviewBox.append(countdownImage);
  const countdownText = documentRef.createElement("div");
  countdownText.className = "countdown-text";
  countdownText.setAttribute("aria-live", "assertive");
  countdownCard.append(countdownHeading, targetPreviewBox, countdownText);
  countdownOverlay.append(countdownCard);

  const status = documentRef.createElement("p");
  status.className = "ai-ball-classification-status";
  status.setAttribute("aria-live", "polite");

  const bottomArea = documentRef.createElement("footer");
  bottomArea.className = "bottom-area";
  const controlInfo = documentRef.createElement("div");
  controlInfo.className = "control-info";
  controlInfo.textContent = "분류통 뚜껑 조작";
  const lidButton = documentRef.createElement("button");
  lidButton.type = "button";
  lidButton.className = "btn-lid closed";
  lidButton.textContent = "CLOSE (뚜껑 닫힘)";
  lidButton.disabled = true;
  bottomArea.append(controlInfo, lidButton);

  root.append(topArea, countdownOverlay, status, bottomArea);
  uiRoot.append(root);
  return {
    root,
    progress,
    progressTotal,
    countdownOverlay,
    countdownText,
    countdownImage,
    status,
    lidButton,
  };
}

function requestFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout?.(
    () => callback(globalThis.performance?.now?.() ?? Date.now()),
    16,
  );
}

function cancelFrame(handle) {
  if (handle == null) return;
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout?.(handle);
  }
}

function canDrawImage(image) {
  if (!image || image.complete === false) return false;
  if (Number.isFinite(image.naturalWidth) && image.naturalWidth <= 0) return false;
  return true;
}

export function createMiniGame(context = {}) {
  const inputLock = new InputLock();
  const clock = new MiniGameClock({
    now: typeof context.clock?.now === "function" ? context.clock.now : undefined,
  });
  const removers = [];
  const canvas = context.canvas ?? null;
  const canvasContext = canvas?.getContext?.("2d") ?? null;
  const stage = canvas?.parentElement ?? null;
  const originalCanvasClassName = typeof canvas?.className === "string" ? canvas.className : "";
  const originalStageClassName = typeof stage?.className === "string" ? stage.className : "";
  const originalUiRootClassName = typeof context.uiRoot?.className === "string"
    ? context.uiRoot.className
    : "";
  const originalCanvasWidth = canvas?.width;
  const originalCanvasHeight = canvas?.height;

  let config = null;
  let ui = emptyUi();
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
  let sampleImage = null;
  let feedbackText = "굴러오는 공 중 목표 공만 분류통에 담으세요!";

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function applyPrototypeShell() {
    addClassName(canvas, "ai-ball-classification-canvas");
    addClassName(stage, "ai-ball-classification-stage");
    addClassName(context.uiRoot, "ai-ball-classification-ui-root");
    if (canvas) {
      canvas.width = PROTOTYPE_CANVAS_WIDTH;
      canvas.height = PROTOTYPE_CANVAS_HEIGHT;
    }
  }

  function restorePrototypeShell() {
    if (canvas) {
      canvas.className = originalCanvasClassName;
      if (originalCanvasWidth != null) canvas.width = originalCanvasWidth;
      if (originalCanvasHeight != null) canvas.height = originalCanvasHeight;
    }
    if (stage) stage.className = originalStageClassName;
    if (context.uiRoot) context.uiRoot.className = originalUiRootClassName;
  }

  function updateUi() {
    if (ui.progress) ui.progress.textContent = String(collectedTargets);
    if (ui.progressTotal) ui.progressTotal.textContent = String(config?.targetCount ?? 5);
    if (ui.countdownText) {
      ui.countdownText.textContent = countdownRemaining > 0
        ? String(Math.max(1, Math.ceil(countdownRemaining)))
        : "";
    }
    if (ui.countdownOverlay) {
      const countingDown = lifecycleState === "RUNNING" && countdownRemaining > 0;
      ui.countdownOverlay.className = countingDown
        ? "overlay countdown-overlay"
        : "overlay countdown-overlay hidden";
      ui.countdownOverlay.setAttribute("aria-hidden", countingDown ? "false" : "true");
    }
    if (ui.status) ui.status.textContent = feedbackText;
    if (ui.lidButton) {
      const isOpen = lidState === "OPEN";
      ui.lidButton.textContent = isOpen
        ? config?.uiText?.lidOpen ?? "OPEN (뚜껑 열림)"
        : config?.uiText?.lidClose ?? "CLOSE (뚜껑 닫힘)";
      ui.lidButton.className = `btn-lid ${isOpen ? "open" : "closed"}`;
      ui.lidButton.disabled =
        lifecycleState !== "RUNNING" || inputLock.locked || countdownRemaining > 0;
    }
  }

  function setState(nextState) {
    lifecycleState = nextState;
    updateUi();
  }

  function setPreviewImage() {
    if (!ui.countdownImage) return;
    if (sampleImage?.src) ui.countdownImage.src = sampleImage.src;
    else ui.countdownImage.removeAttribute?.("src");
  }

  function resetRunState() {
    sampleImage = context.assets?.get?.(config.targetAssetId) ?? null;
    ballQueue = createBallQueue({
      targetCount: config.targetCount,
      nonTargetCount: config.nonTargetCount,
      targetImage: sampleImage,
      nonTargetImage: sampleImage,
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
    feedbackText = config.uiText?.ruleExplanation
      ?? "굴러오는 공 중 목표 공만 분류통에 담으세요!";
    lastElapsedMs = 0;
    inputLock.clear();
    setPreviewImage();
    updateUi();
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
      disposed
      || terminal
      || currentAttemptId == null
      || (lifecycleState !== "RUNNING" && lifecycleState !== "PAUSED")
    ) {
      return false;
    }
    terminal = true;
    failureReason = error?.code ?? "MINIGAME_RUNTIME_ERROR";
    cancelFrame(frameHandle);
    frameHandle = null;
    inputLock.lock("TERMINAL");
    clock.stop();
    feedbackText = "게임을 계속 실행할 수 없습니다.";
    setState("ERROR");
    context.onError?.(currentAttemptId, error);
    return true;
  }

  function finish(status, reason = null, attemptId = currentAttemptId) {
    if (
      disposed
      || terminal
      || attemptId == null
      || attemptId !== currentAttemptId
      || (lifecycleState !== "RUNNING" && lifecycleState !== "PAUSED")
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
    feedbackText = status === "CLEAR" ? "목표 공을 모두 수집했습니다!" : feedbackText;
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
      globalThis.console?.error?.("AI Ball Classification host completion callback failed.", error);
    }
    return true;
  }

  function toggleLid() {
    if (lifecycleState !== "RUNNING" || terminal || inputLock.locked || countdownRemaining > 0) {
      return false;
    }
    lidState = lidState === "CLOSED" ? "OPEN" : "CLOSED";
    feedbackText = lidState === "OPEN" ? "분류통을 열었습니다." : "분류통을 닫았습니다.";
    updateUi();
    return true;
  }

  function spawnBall(width, trackY) {
    const nextBall = ballQueue.shift();
    if (!nextBall) return;
    const radius = width * 0.035;
    activeBalls.push({
      ...nextBall,
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
      feedbackText = config.uiText?.failReasons?.WRONG_BALL ?? "오답 공이 통에 들어갔습니다!";
      finish("FAIL", "WRONG_BALL");
    } else if (resolution === "MISSED_TARGET") {
      targetMissed += 1;
      feedbackText = config.uiText?.failReasons?.MISSED_TARGET ?? "정답 공을 놓쳤습니다!";
      finish("FAIL", "MISSED_TARGET");
    } else {
      nonTargetsPassed += 1;
      feedbackText = "방해 공을 통과시켰습니다.";
    }
  }

  function layout() {
    const width = Math.max(1, Number(canvas?.width) || PROTOTYPE_CANVAS_WIDTH);
    const height = Math.max(1, Number(canvas?.height) || PROTOTYPE_CANVAS_HEIGHT);
    return {
      width,
      height,
      trackY: height * 0.6,
      binX: width * 0.65,
      binY: height * 0.72,
      binWidth: width * 0.2,
      binHeight: height * 0.22,
      ...getBallMotionProfile(width, height),
    };
  }

  function update(deltaSeconds) {
    if (lifecycleState !== "RUNNING" || terminal) return;
    if (countdownRemaining > 0) {
      countdownRemaining = Math.max(0, countdownRemaining - deltaSeconds);
      if (countdownRemaining === 0) feedbackText = "분류 시작!";
      updateUi();
      return;
    }

    const scene = layout();
    spawnAccumulator += deltaSeconds;
    if (spawnAccumulator >= scene.spawnInterval && ballQueue.length > 0) {
      spawnAccumulator = 0;
      spawnBall(scene.width, scene.trackY);
    }

    for (let index = activeBalls.length - 1; index >= 0; index -= 1) {
      const ball = activeBalls[index];
      advanceBall(ball, deltaSeconds, scene);
      if (ball.falling) {
        if (ball.y > scene.binY + 40) {
          activeBalls.splice(index, 1);
          resolveBall(ball, true);
          if (terminal) {
            updateUi();
            return;
          }
        }
        continue;
      }

      const inBinZone =
        ball.x >= scene.binX + 15
        && ball.x <= scene.binX + scene.binWidth - 15;
      if (inBinZone && lidState === "OPEN") ball.falling = true;
      if (ball.x > scene.binX + scene.binWidth + 20) {
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

  function renderTargetPreview(scene) {
    const centerX = scene.width / 2;
    const startY = 15;
    const maxBoxSize = Math.min(scene.width * 0.16, 110);
    const panelWidth = Math.max(maxBoxSize + 40, 150);
    const panelHeight = maxBoxSize + 35;
    canvasContext.save();
    canvasContext.fillStyle = "rgba(0, 0, 0, 0.65)";
    canvasContext.beginPath();
    if (typeof canvasContext.roundRect === "function") {
      canvasContext.roundRect(centerX - panelWidth / 2, startY, panelWidth, panelHeight, 12);
    } else {
      canvasContext.rect(centerX - panelWidth / 2, startY, panelWidth, panelHeight);
    }
    canvasContext.fill();
    canvasContext.fillStyle = "#a29bfe";
    canvasContext.font = "bold 13px sans-serif";
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "alphabetic";
    canvasContext.fillText("TARGET", centerX, startY + 18);

    if (canDrawImage(sampleImage)) {
      const imageWidth = finiteAtLeast(sampleImage.naturalWidth, 1, maxBoxSize);
      const imageHeight = finiteAtLeast(sampleImage.naturalHeight, 1, maxBoxSize);
      const scale = Math.min(maxBoxSize / imageWidth, maxBoxSize / imageHeight);
      const drawWidth = imageWidth * scale;
      const drawHeight = imageHeight * scale;
      canvasContext.drawImage(
        sampleImage,
        centerX - drawWidth / 2,
        startY + 25 + (maxBoxSize - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    } else {
      canvasContext.fillStyle = "#ffffff";
      canvasContext.font = "12px sans-serif";
      canvasContext.fillText("Loading...", centerX, startY + 45);
    }
    canvasContext.restore();
  }

  function render() {
    if (!canvasContext || !canvas) return;
    const scene = layout();
    canvasContext.clearRect(0, 0, scene.width, scene.height);
    canvasContext.fillStyle = "#3a3d52";
    canvasContext.fillRect(0, scene.trackY, scene.width, 10);
    canvasContext.fillStyle = "#4a4d66";
    canvasContext.fillRect(scene.binX, scene.binY, scene.binWidth, scene.binHeight);
    canvasContext.strokeStyle = "#00cec9";
    canvasContext.lineWidth = 3;
    canvasContext.strokeRect(scene.binX, scene.binY, scene.binWidth, scene.binHeight);
    canvasContext.save();
    if (lidState === "CLOSED") {
      canvasContext.fillStyle = "#ff7675";
      canvasContext.fillRect(scene.binX - 5, scene.binY - 8, scene.binWidth + 10, 10);
    } else {
      canvasContext.fillStyle = "#55efc4";
      canvasContext.fillRect(scene.binX - 5, scene.binY, 10, scene.binHeight - 10);
    }
    canvasContext.restore();

    for (const ball of activeBalls) {
      canvasContext.save();
      canvasContext.beginPath();
      canvasContext.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      canvasContext.closePath();
      canvasContext.lineWidth = 3;
      canvasContext.strokeStyle = ball.isTarget ? "#6c5ce7" : "#fdcb6e";
      canvasContext.stroke();
      canvasContext.clip();
      if (canDrawImage(ball.image)) {
        canvasContext.drawImage(
          ball.image,
          ball.x - ball.radius,
          ball.y - ball.radius,
          ball.radius * 2,
          ball.radius * 2,
        );
      } else {
        canvasContext.fillStyle = ball.isTarget ? "#6c5ce7" : "#fdcb6e";
        canvasContext.fill();
      }
      canvasContext.restore();
    }
    renderTargetPreview(scene);
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
      applyPrototypeShell();
      ui = buildUi(context.uiRoot);
      setPreviewImage();
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
      ui = emptyUi();
      restorePrototypeShell();
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

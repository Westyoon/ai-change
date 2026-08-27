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
import { buildWavePlan } from "./wave.js";

const MINI_GAME_ID = "cyber-click-to-purify";
const CANVAS_SIZE = 480;
const CENTER = 240;
const CORE_RADIUS = 40;
const RING_RADIUS = 90;
const START_RADIUS = 210;
const IMPACT_DURATION = 150;
const CORE_FLASH_DURATION = 250;
const SPLIT_EFFECT_DURATION = 300;

export const hasInternalStartGate = true;

const TYPE_COLORS = Object.freeze({
  TROJAN: "#ff8c37",
  WORM: "#2e8b57",
  RANSOM: "#8b3fd1",
  SPYWARE: "#5a7a9c",
});
const DISGUISE_COLOR = "#6b7280";

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

function addClassName(target, className) {
  if (!target) return;
  const current = typeof target.className === "string" ? target.className : "";
  const names = new Set(current.split(/\s+/u).filter(Boolean));
  names.add(className);
  target.className = [...names].join(" ");
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

function emptyUi() {
  return {
    root: null,
    intro: null,
    introCloseButton: null,
    startButton: null,
    gauge: null,
    gaugeLabel: null,
    gaugeShell: null,
    miss: null,
    lockStatus: null,
    feedback: null,
    actionButton: null,
  };
}

function buildLegendItem(documentRef, type, modifier, text) {
  const item = documentRef.createElement("li");
  const dot = documentRef.createElement("span");
  dot.className = `intro-dot intro-dot--${modifier}`;
  dot.setAttribute("aria-hidden", "true");
  const label = documentRef.createElement("span");
  label.textContent = `${type} — ${text}`;
  item.append(dot, label);
  return item;
}

function buildUi(uiRoot) {
  const documentRef = uiRoot?.ownerDocument ?? globalThis.document;
  if (!uiRoot?.append || !documentRef?.createElement) return emptyUi();

  const root = documentRef.createElement("section");
  root.className = "click-to-purify click-to-purify--original";
  root.dataset.miniGameId = MINI_GAME_ID;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "CLICK to PURIFY");

  const intro = documentRef.createElement("div");
  intro.className = "click-to-purify__intro";
  intro.setAttribute("role", "dialog");
  intro.setAttribute("aria-modal", "true");
  intro.setAttribute("aria-labelledby", "ctp-intro-title");

  const introBox = documentRef.createElement("div");
  introBox.className = "click-to-purify__intro-box";
  const introCloseButton = documentRef.createElement("button");
  introCloseButton.id = "intro-close";
  introCloseButton.type = "button";
  introCloseButton.className = "ctp-intro-close";
  introCloseButton.textContent = "✕";
  introCloseButton.setAttribute("aria-label", "게임 설명 닫기");
  introCloseButton.disabled = true;
  const introTitle = documentRef.createElement("h2");
  introTitle.id = "ctp-intro-title";
  introTitle.textContent = "CLICK to PURIFY";
  const coreRule = documentRef.createElement("p");
  coreRule.className = "intro-rule";
  coreRule.textContent = "🛡️ 몰려드는 악성코드로부터 CORE를 지켜라!";
  const missRule = documentRef.createElement("p");
  missRule.className = "intro-rule";
  missRule.textContent = "❌ MISS 3회 = 방어 실패";
  const legend = documentRef.createElement("ul");
  legend.className = "intro-legend";
  legend.append(
    buildLegendItem(documentRef, "TROJAN", "trojan", "위장 중엔 못 눌러요, 정체 드러나면 CLICK!"),
    buildLegendItem(documentRef, "WORM", "worm", "놓치면 2마리로 분열!"),
    buildLegendItem(documentRef, "RANSOM", "ransom", "놓치면 코어 입력 잠김!"),
    buildLegendItem(documentRef, "SPYWARE", "spyware", "그림자 속에 숨어 접근... 가까워질수록 실체를 드러낸다"),
  );
  const startButton = documentRef.createElement("button");
  startButton.id = "btn-start";
  startButton.type = "button";
  startButton.className = "ctp-start-btn";
  startButton.textContent = "START";
  startButton.disabled = true;
  startButton.hidden = true;
  introBox.append(introCloseButton, introTitle, coreRule, missRule, legend);
  intro.append(introBox);

  const gaugeShell = documentRef.createElement("div");
  gaugeShell.className = "ctp-gauge-shell";
  gaugeShell.setAttribute("role", "progressbar");
  gaugeShell.setAttribute("aria-label", "정화도");
  gaugeShell.setAttribute("aria-valuemin", "0");
  gaugeShell.setAttribute("aria-valuemax", "100");
  const gauge = documentRef.createElement("div");
  gauge.id = "ctp-gauge";
  gauge.className = "ctp-gauge";
  const gaugeLabel = documentRef.createElement("span");
  gaugeLabel.id = "ctp-gauge-label";
  gaugeLabel.className = "ctp-gauge-label";
  gaugeLabel.textContent = "0%";
  gaugeShell.append(gauge, gaugeLabel);

  const miss = documentRef.createElement("div");
  miss.id = "ctp-miss";
  miss.className = "ctp-miss";
  miss.textContent = "MISS: 0";

  const lockStatus = documentRef.createElement("p");
  lockStatus.className = "ctp-lock-status visually-hidden";
  lockStatus.setAttribute("aria-live", "assertive");
  const feedback = documentRef.createElement("p");
  feedback.className = "ctp-feedback visually-hidden";
  feedback.setAttribute("aria-live", "polite");

  const actionButton = documentRef.createElement("button");
  actionButton.id = "ctp-click-btn";
  actionButton.type = "button";
  actionButton.className = "ctp-click-btn";
  actionButton.textContent = "CLICK";
  actionButton.disabled = true;

  root.append(intro, startButton, gaugeShell, miss, lockStatus, feedback, actionButton);
  uiRoot.append(root);
  return {
    root,
    intro,
    introCloseButton,
    startButton,
    gauge,
    gaugeLabel,
    gaugeShell,
    miss,
    lockStatus,
    feedback,
    actionButton,
  };
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
  let pausedReason = null;
  let gameplayStarted = false;
  let introDismissed = false;
  let gameplayStartNotified = false;
  let wavePlan = [];
  let nextWaveIndex = 0;
  let activeThreats = [];
  let perfectCount = 0;
  let goodCount = 0;
  let missCount = 0;
  let splitChildMissCount = 0;
  let inputLockedUntilMs = 0;
  let coreFlashUntilMs = 0;
  let lastJudgement = "";
  let impactEffects = [];
  let splitEffects = [];
  let judgeTexts = [];

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function applyOriginalShell() {
    addClassName(canvas, "click-to-purify-canvas");
    addClassName(stage, "click-to-purify-stage");
    addClassName(context.uiRoot, "click-to-purify-ui-root");
    if (canvas) {
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
    }
  }

  function restoreOriginalShell() {
    if (canvas) {
      canvas.className = originalCanvasClassName;
      if (originalCanvasWidth != null) canvas.width = originalCanvasWidth;
      if (originalCanvasHeight != null) canvas.height = originalCanvasHeight;
    }
    if (stage) stage.className = originalStageClassName;
    if (context.uiRoot) context.uiRoot.className = originalUiRootClassName;
  }

  function purification() {
    return calculatePurification(
      perfectCount,
      goodCount,
      wavePlan.length,
      config?.goodScoreWeight,
    );
  }

  function setIntroVisible(visible) {
    if (!ui.intro) return;
    ui.intro.hidden = !visible;
    ui.intro.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setStartVisible(visible) {
    if (!ui.startButton) return;
    ui.startButton.hidden = !visible;
    ui.startButton.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function updateUi(elapsedMs = clock.getElapsedMs()) {
    const score = purification();
    if (ui.gauge?.style) ui.gauge.style.width = `${score}%`;
    if (ui.gaugeLabel) ui.gaugeLabel.textContent = `${score}%`;
    if (ui.gaugeShell) ui.gaugeShell.setAttribute("aria-valuenow", String(score));
    if (ui.miss) ui.miss.textContent = `MISS: ${missCount} / ${config?.missLimit ?? 3}`;
    if (ui.feedback) ui.feedback.textContent = lastJudgement;
    const ransomLocked = gameplayStarted && elapsedMs < inputLockedUntilMs;
    if (ui.lockStatus) {
      ui.lockStatus.textContent = ransomLocked
        ? `코어 입력 잠금 ${(Math.max(0, inputLockedUntilMs - elapsedMs) / 1000).toFixed(1)}초`
        : "";
    }
    if (ui.actionButton) {
      ui.actionButton.disabled = lifecycleState !== "RUNNING" || terminal || !gameplayStarted;
    }
    if (ui.introCloseButton) {
      ui.introCloseButton.disabled =
        lifecycleState !== "RUNNING" || terminal || gameplayStarted || introDismissed;
    }
    if (ui.startButton) {
      ui.startButton.disabled =
        lifecycleState !== "RUNNING" || terminal || gameplayStarted || !introDismissed;
    }
    if (ui.root) ui.root.dataset.state = lifecycleState;
  }

  function setState(nextState) {
    lifecycleState = nextState;
    updateUi();
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
    lastJudgement = "";
    impactEffects = [];
    splitEffects = [];
    judgeTexts = [];
    gameplayStarted = false;
    introDismissed = false;
    gameplayStartNotified = false;
    pausedReason = null;
    inputLock.clear();
  }

  function threatPosition(threat, elapsedMs) {
    const duration = Math.max(1, threat.targetAt - threat.spawnedAt);
    const progress = Math.min(1, Math.max(0, (elapsedMs - threat.spawnedAt) / duration));
    const radius = START_RADIUS + (RING_RADIUS - START_RADIUS) * progress;
    return {
      progress,
      radius,
      x: CENTER + Math.cos(threat.angle) * radius,
      y: CENTER + Math.sin(threat.angle) * radius,
    };
  }

  function addJudgeText(text, x, y, elapsedMs, color, duration = 600) {
    judgeTexts.push({ text, x, y, startedAt: elapsedMs, duration, color });
  }

  function triggerImpactEffect(threat, elapsedMs) {
    if (!Number.isFinite(threat?.angle)) return;
    const { x, y } = threatPosition(threat, elapsedMs);
    impactEffects.push({ startX: x, startY: y, startedAt: elapsedMs });
  }

  function handleMissEffect(threat, elapsedMs) {
    if (threat.type === "WORM" && !threat.isSplitChild && threat.splitDepth < 1) {
      const { x: missX, y: missY } = threatPosition(threat, elapsedMs);
      addJudgeText("웜 분열 발생!", missX, missY, elapsedMs, TYPE_COLORS.WORM);

      const children = createWormChildren(threat, elapsedMs, config);
      children.forEach((child, index) => {
        const endX = CENTER + Math.cos(child.angle) * START_RADIUS;
        const endY = CENTER + Math.sin(child.angle) * START_RADIUS;
        splitEffects.push({
          startX: missX,
          startY: missY,
          endX,
          endY,
          startedAt: elapsedMs + index * 50,
        });
      });
      activeThreats.push(...children);
      lastJudgement = "웜 분열 발생! 2개로 나뉨";
    }

    if (threat.type === "RANSOM") {
      inputLockedUntilMs = Math.max(
        inputLockedUntilMs,
        elapsedMs + finiteAtLeast(config?.ransomLockMs, 0, 1_500),
      );
      inputLock.lock("RANSOM");
      addJudgeText("🔒 코어 잠금!", CENTER, CENTER - 60, elapsedMs, "#c9a6ff", 1_000);
      lastJudgement = "랜섬웨어가 코어 입력을 잠갔습니다.";
    }
  }

  function missThreat(threat, elapsedMs, { showJudgement = false } = {}) {
    if (!threat || threat.resolved) return;
    const { x, y } = threatPosition(threat, elapsedMs);
    threat.resolved = true;
    missCount += 1;
    if (threat.isSplitChild) splitChildMissCount += 1;
    lastJudgement = `MISS · ${threat.type}`;
    handleMissEffect(threat, elapsedMs);
    triggerImpactEffect(threat, elapsedMs);
    if (showJudgement) addJudgeText("MISS!", x, y, elapsedMs, "#ff3b3b");
  }

  function spawnDueWaves(elapsedMs) {
    while (nextWaveIndex < wavePlan.length && wavePlan[nextWaveIndex].spawnAtMs <= elapsedMs) {
      const wave = wavePlan[nextWaveIndex];
      activeThreats.push(createThreat(wave.type, wave.spawnAtMs, config, {
        angle: Math.random() * Math.PI * 2,
        approachDurationMs: wave.approachDurationMs,
      }));
      nextWaveIndex += 1;
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
    setIntroVisible(false);
    setStartVisible(false);
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

  function failRuntime(error) {
    if (disposed || terminal) return false;
    terminal = true;
    cancelFrame(frameHandle);
    frameHandle = null;
    inputLock.lock("ERROR");
    clock.stop();
    setIntroVisible(false);
    setStartVisible(false);
    setState("ERROR");
    context.onError?.(currentAttemptId, error);
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
    if (lifecycleState !== "RUNNING" || terminal || !gameplayStarted) return;
    spawnDueWaves(elapsedMs);

    if (inputLockedUntilMs > 0 && elapsedMs >= inputLockedUntilMs) {
      inputLockedUntilMs = 0;
      inputLock.unlock("RANSOM");
      lastJudgement = "코어 잠금 해제";
    }

    for (const threat of activeThreats) {
      if (threat.resolved || elapsedMs < threat.spawnedAt) continue;
      updateThreatPresentation(threat, elapsedMs, config);
      if (elapsedMs > threat.targetAt + finiteAtLeast(config?.goodWindowMs, 0, 500)) {
        missThreat(threat, elapsedMs);
      }
    }
    activeThreats = activeThreats.filter((threat) => !threat.resolved);
    updateUi(elapsedMs);
    evaluateTerminal();
  }

  function purify() {
    if (
      lifecycleState !== "RUNNING" ||
      terminal ||
      !gameplayStarted ||
      inputLock.locked
    ) {
      return false;
    }
    const elapsedMs = clock.getElapsedMs();
    const target = pickTarget(activeThreats, elapsedMs);
    if (!target) return false;

    const judgement = judgeTiming(elapsedMs, target.targetAt, config);
    const errorMs = Math.round(Math.abs(elapsedMs - target.targetAt));
    if (judgement === "MISS" && errorMs > finiteAtLeast(config?.clickIgnoreMs, 0, 900)) {
      return false;
    }

    const { x, y } = threatPosition(target, elapsedMs);
    if (judgement === "MISS") {
      missThreat(target, elapsedMs, { showJudgement: true });
    } else {
      target.resolved = true;
      if (!target.isSplitChild) {
        if (judgement === "PERFECT") perfectCount += 1;
        else goodCount += 1;
      }
      lastJudgement = target.isSplitChild
        ? `분열체 제거 · ${judgement}`
        : `${judgement} · ${target.type}`;
      addJudgeText(
        `${judgement}!`,
        x,
        y,
        elapsedMs,
        judgement === "PERFECT" ? "#37e6ff" : "#8cff6a",
      );
    }
    activeThreats = activeThreats.filter((threat) => !threat.resolved);
    updateUi(elapsedMs);
    evaluateTerminal();
    return true;
  }

  function renderFrame(elapsedMs) {
    if (!canvasContext || !canvas) return;
    canvasContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const coreHit = elapsedMs < coreFlashUntilMs;
    const ransomLocked = gameplayStarted && elapsedMs < inputLockedUntilMs;
    canvasContext.beginPath();
    canvasContext.arc(CENTER, CENTER, CORE_RADIUS, 0, Math.PI * 2);
    canvasContext.fillStyle = coreHit ? "#ff3b3b" : ransomLocked ? "#3a2a4d" : "#111827";
    canvasContext.fill();
    canvasContext.strokeStyle = coreHit ? "#ff8080" : ransomLocked ? "#8b3fd1" : "#37e6ff";
    canvasContext.lineWidth = 3;
    canvasContext.stroke();

    canvasContext.fillStyle = coreHit ? "#fff" : ransomLocked ? "#c9a6ff" : "#37e6ff";
    canvasContext.textAlign = "center";
    if (ransomLocked) {
      canvasContext.font = "bold 20px monospace";
      canvasContext.fillText("🔒", CENTER, CENTER + 7);
    } else {
      canvasContext.font = "bold 11px monospace";
      canvasContext.fillText("CORE", CENTER, CENTER + 4);
    }

    canvasContext.beginPath();
    canvasContext.arc(CENTER, CENTER, RING_RADIUS, 0, Math.PI * 2);
    canvasContext.strokeStyle = "#374151";
    canvasContext.lineWidth = 2;
    canvasContext.stroke();

    for (const threat of activeThreats) {
      if (threat.resolved) continue;
      const { progress, x, y } = threatPosition(threat, elapsedMs);
      const color = threat.type === "TROJAN" && !threat.revealed
        ? DISGUISE_COLOR
        : TYPE_COLORS[threat.type] ?? "#fff";
      canvasContext.globalAlpha = threat.type === "SPYWARE"
        ? 0.1 + progress * 0.5
        : 1;
      canvasContext.beginPath();
      canvasContext.arc(x, y, 14, 0, Math.PI * 2);
      canvasContext.fillStyle = color;
      canvasContext.fill();
      canvasContext.globalAlpha = 1;

      if (Math.abs(elapsedMs - threat.targetAt) <= finiteAtLeast(config?.goodWindowMs, 0, 500)) {
        canvasContext.strokeStyle = "#ff3b3b";
        canvasContext.lineWidth = 2;
        canvasContext.beginPath();
        canvasContext.arc(x, y, 22, 0, Math.PI * 2);
        canvasContext.stroke();
        canvasContext.beginPath();
        canvasContext.moveTo(x - 30, y);
        canvasContext.lineTo(x - 26, y);
        canvasContext.moveTo(x + 26, y);
        canvasContext.lineTo(x + 30, y);
        canvasContext.moveTo(x, y - 30);
        canvasContext.lineTo(x, y - 26);
        canvasContext.moveTo(x, y + 26);
        canvasContext.lineTo(x, y + 30);
        canvasContext.stroke();
      }

      canvasContext.fillStyle = "#fff";
      canvasContext.font = "bold 9px monospace";
      canvasContext.fillText(threat.type, x, y - 32);
    }

    impactEffects = impactEffects.filter((effect) => {
      const elapsed = elapsedMs - effect.startedAt;
      if (elapsed >= IMPACT_DURATION) {
        coreFlashUntilMs = elapsedMs + CORE_FLASH_DURATION;
        return false;
      }
      const progress = Math.max(0, elapsed / IMPACT_DURATION);
      const x = effect.startX + (CENTER - effect.startX) * progress;
      const y = effect.startY + (CENTER - effect.startY) * progress;
      canvasContext.beginPath();
      canvasContext.arc(x, y, 10, 0, Math.PI * 2);
      canvasContext.fillStyle = "#ff3b3b";
      canvasContext.fill();
      return true;
    });

    splitEffects = splitEffects.filter((effect) => {
      const elapsed = elapsedMs - effect.startedAt;
      if (elapsed < 0) return true;
      if (elapsed >= SPLIT_EFFECT_DURATION) return false;
      const progress = elapsed / SPLIT_EFFECT_DURATION;
      const x = effect.startX + (effect.endX - effect.startX) * progress;
      const y = effect.startY + (effect.endY - effect.startY) * progress;
      canvasContext.beginPath();
      canvasContext.arc(x, y, 8, 0, Math.PI * 2);
      canvasContext.fillStyle = TYPE_COLORS.WORM;
      canvasContext.fill();
      return true;
    });

    judgeTexts = judgeTexts.filter((effect) => {
      const elapsed = elapsedMs - effect.startedAt;
      if (elapsed >= effect.duration) return false;
      const progress = Math.max(0, elapsed / effect.duration);
      canvasContext.globalAlpha = 1 - progress;
      canvasContext.fillStyle = effect.color;
      canvasContext.font = "bold 14px monospace";
      canvasContext.textAlign = "center";
      canvasContext.fillText(effect.text, effect.x, effect.y - 40 - progress * 20);
      canvasContext.globalAlpha = 1;
      return true;
    });
  }

  function frame() {
    frameHandle = null;
    if (disposed || terminal || lifecycleState !== "RUNNING" || !gameplayStarted) return;
    try {
      const elapsedMs = clock.getElapsedMs();
      update(elapsedMs);
      renderFrame(elapsedMs);
      if (!terminal && lifecycleState === "RUNNING") frameHandle = requestFrame(frame);
    } catch (error) {
      failRuntime(error);
    }
  }

  function activateGameplay() {
    if (
      disposed ||
      terminal ||
      lifecycleState !== "RUNNING" ||
      gameplayStarted ||
      !introDismissed
    ) {
      return false;
    }
    gameplayStarted = true;
    clock.resume("START_GATE");
    inputLock.unlock("START_GATE");
    setIntroVisible(false);
    setStartVisible(false);
    updateUi(0);
    try {
      if (!gameplayStartNotified) {
        gameplayStartNotified = true;
        context.onGameplayStart?.(currentAttemptId);
      }
      const elapsedMs = clock.getElapsedMs();
      update(elapsedMs);
      renderFrame(elapsedMs);
      if (!terminal && canvasContext) frameHandle = requestFrame(frame);
      ui.actionButton?.focus?.();
      return true;
    } catch (error) {
      failRuntime(error);
      return false;
    }
  }

  function dismissIntro() {
    if (
      disposed ||
      terminal ||
      lifecycleState !== "RUNNING" ||
      gameplayStarted ||
      introDismissed
    ) {
      return false;
    }
    introDismissed = true;
    setIntroVisible(false);
    setStartVisible(true);
    updateUi(0);
    ui.startButton?.focus?.();
    return true;
  }

  function beginAttempt(attemptId, { showIntro }) {
    requireAttemptId(attemptId);
    cancelFrame(frameHandle);
    frameHandle = null;
    currentAttemptId = attemptId;
    terminal = false;
    resetRunState();
    clock.start();
    setState("RUNNING");

    if (showIntro) {
      clock.pause("START_GATE");
      inputLock.lock("START_GATE");
      setIntroVisible(true);
      setStartVisible(false);
      updateUi(0);
      try {
        renderFrame(0);
        ui.introCloseButton?.focus?.();
      } catch (error) {
        failRuntime(error);
      }
      return;
    }

    gameplayStarted = true;
    introDismissed = true;
    setIntroVisible(false);
    setStartVisible(false);
    updateUi(0);
    try {
      if (!gameplayStartNotified) {
        gameplayStartNotified = true;
        context.onGameplayStart?.(currentAttemptId);
      }
      update(0);
      renderFrame(0);
      if (!terminal && canvasContext) frameHandle = requestFrame(frame);
      ui.actionButton?.focus?.();
    } catch (error) {
      failRuntime(error);
    }
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

      applyOriginalShell();
      ui = buildUi(context.uiRoot);
      addListener(ui.introCloseButton, "click", dismissIntro);
      addListener(ui.startButton, "click", activateGameplay);
      addListener(ui.actionButton, "click", purify);
      const unsubscribeInput = context.input?.onAction?.((event) => {
        if (
          event?.phase !== "press" ||
          (event.action !== INPUT_ACTIONS.CONFIRM && event.action !== INPUT_ACTIONS.INTERACT)
        ) {
          return;
        }
        if (!gameplayStarted && lifecycleState === "RUNNING" && !introDismissed) dismissIntro();
        else if (!gameplayStarted && lifecycleState === "RUNNING") activateGameplay();
        else purify();
      });
      if (typeof unsubscribeInput === "function") removers.push(unsubscribeInput);
      setIntroVisible(true);
      setStartVisible(false);
      setState("READY");
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== "READY") {
        throw new Error(`Cannot start CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId, { showIntro: true });
    },

    pause(reason = "SYSTEM") {
      if (disposed || lifecycleState !== "RUNNING" || terminal) return false;
      cancelFrame(frameHandle);
      frameHandle = null;
      pausedReason = String(reason);
      inputLock.lock(pausedReason);
      clock.pause(pausedReason);
      setState("PAUSED");
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== "PAUSED" || terminal) return false;
      const reason = pausedReason;
      pausedReason = null;
      if (reason != null) {
        clock.resume(reason);
        inputLock.unlock(reason);
      }
      setState("RUNNING");
      const elapsedMs = clock.getElapsedMs();
      if (!gameplayStarted) {
        clock.pause("START_GATE");
        inputLock.lock("START_GATE");
        setIntroVisible(!introDismissed);
        setStartVisible(introDismissed);
        updateUi(elapsedMs);
        return true;
      }
      if (elapsedMs < inputLockedUntilMs) inputLock.lock("RANSOM");
      try {
        renderFrame(elapsedMs);
        if (canvasContext) frameHandle = requestFrame(frame);
      } catch (error) {
        failRuntime(error);
      }
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== "COMPLETED") {
        throw new Error(`Cannot restart CLICK to PURIFY from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId, { showIntro: false });
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
      impactEffects = [];
      splitEffects = [];
      judgeTexts = [];
      for (const remove of removers.splice(0)) remove();
      ui.root?.remove?.();
      ui = emptyUi();
      restoreOriginalShell();
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
        gameplayStarted,
        introDismissed,
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
        impactEffectCount: impactEffects.length,
        splitEffectCount: splitEffects.length,
        judgeTextCount: judgeTexts.length,
      });
    },
  });
}

export default createMiniGame;

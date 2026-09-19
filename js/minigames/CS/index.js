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
import {
  avoidRansomArrivalCollisions,
  buildRansomAmbushSchedule,
  buildWavePlan,
  estimateWavePlanEndMs,
} from "./wave.js";

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
    efficiencyWarning: null,
    lockStatus: null,
    mashGaugeShell: null,
    mashGauge: null,
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
    buildLegendItem(documentRef, "WORM", "worm", "등장하자마자 무조건 2마리로 분열!"),
    buildLegendItem(documentRef, "RANSOM", "ransom", "코어에 닿으면 무조건 감염! 연타로 해제하세요"),
    buildLegendItem(documentRef, "SPYWARE", "spyware", "짧게 몇 번 깜빡이며 드러나요, 깜빡이는 순간에 CLICK!"),
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

  // 광클(시도 효율 페널티) 경고 — 판정 구간이 좁아도 마구 눌러대면 결국 정화도가 깎이는데,
  // 그걸 결과 화면에서만 보여주면 플레이어가 이유를 알 방법이 없어서 플레이 중에도 바로 보이게 해요.
  // lockStatus/mashGaugeShell과 같은 이유로, hidden 대신 visibility로만 켜고 꺼서 항상 자리를
  // 차지하게 해요(레이아웃이 밀리는 버그를 또 만들지 않으려고).
  const efficiencyWarning = documentRef.createElement("p");
  efficiencyWarning.className = "ctp-efficiency-warning";
  efficiencyWarning.setAttribute("role", "status");
  efficiencyWarning.setAttribute("aria-live", "polite");
  if (efficiencyWarning.style) efficiencyWarning.style.visibility = "hidden";

  const lockStatus = documentRef.createElement("p");
  lockStatus.className = "ctp-lock-status visually-hidden";
  lockStatus.setAttribute("aria-live", "assertive");

  // 코어 잠금 해제(연타) 진행도를 보여주는 게이지 — 잠겨있을 때만 보여요
  const mashGaugeShell = documentRef.createElement("div");
  mashGaugeShell.className = "ctp-mash-gauge-shell";
  // display:none 대신 visibility로만 숨겨요 — 켜졌다 꺼졌다 할 때 이 박스의 높이가 있다 없다 하면서
  // 아래 CLICK 버튼이 위아래로 밀리는 걸 막으려고, 잠금 여부와 상관없이 항상 공간을 차지하게 해요.
  if (mashGaugeShell.style) mashGaugeShell.style.visibility = "hidden";
  mashGaugeShell.setAttribute("role", "progressbar");
  mashGaugeShell.setAttribute("aria-label", "코어 잠금 해제 진행도");
  mashGaugeShell.setAttribute("aria-valuemin", "0");
  mashGaugeShell.setAttribute("aria-valuemax", "100");
  const mashGauge = documentRef.createElement("div");
  mashGauge.id = "ctp-mash-gauge";
  mashGauge.className = "ctp-mash-gauge";
  mashGaugeShell.append(mashGauge);

  const feedback = documentRef.createElement("p");
  feedback.className = "ctp-feedback visually-hidden";
  feedback.setAttribute("aria-live", "polite");

  const actionButton = documentRef.createElement("button");
  actionButton.id = "ctp-click-btn";
  actionButton.type = "button";
  actionButton.className = "ctp-click-btn";
  actionButton.textContent = "CLICK";
  actionButton.disabled = true;

  root.append(
    intro,
    startButton,
    gaugeShell,
    miss,
    efficiencyWarning,
    lockStatus,
    mashGaugeShell,
    feedback,
    actionButton,
  );
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
    efficiencyWarning,
    lockStatus,
    mashGaugeShell,
    mashGauge,
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
  let ransomSchedule = []; // 랜섬웨어 기습 타이밍(ms) 목록 — 일반 웨이브와 별도로 관리
  let nextRansomIndex = 0;
  let activeThreats = [];
  let perfectCount = 0;
  let goodCount = 0;
  let purificationCredit = 0; // 정화도 계산 전용 누적치(가중치+분열체 반타 배분 적용됨) — 표시용 perfect/goodCount와는 별개
  let expectedAttempts = 0; // 이번 판에서 이상적으로 필요한 "진짜 시도" 횟수(웜은 2, 나머지는 1) — resetRunState에서 계산
  let realAttemptCount = 0; // 판정 범위 안에서 실제로 시도한 횟수(성공/스파이웨어 미점등 무시 포함, 랜섬 연타는 제외)
  let missCount = 0;
  let splitChildMissCount = 0;
  let mashRemaining = 0; // 랜섬웨어가 코어를 감염시켰을 때, 해제까지 남은 연타 횟수 (0이면 잠금 없음)
  let mashTotal = 0; // 이번 잠금을 풀기 위해 원래 필요했던 총 연타 횟수 (게이지 % 계산용)
  let lastUpdateElapsedMs = 0; // 직전 update() 호출 시각 (코어 잠금 중 슬로우 효과의 delta 계산용)
  let lockedDurationMs = 0; // 지금까지 코어가 잠겨있었던 누적 시간 — 잠긴 동안엔 새 웨이브/랜섬 스폰 시계를 멈추는 데 씀
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

  function attemptAllowance() {
    // 이번 판에서 "이 정도까지는 헛스윙해도 봐준다"는 시도 횟수 상한이에요. purification()의
    // 페널티 계산과, 플레이 중 경고 표시 여부 판단(updateUi)이 이 값을 함께 써요.
    const allowanceFactor = finiteAtLeast(config?.pressEfficiencyAllowance, 1, 1.5);
    return Math.max(1, expectedAttempts) * allowanceFactor;
  }

  function purification() {
    // purificationCredit은 이미 PERFECT/GOOD 가중치와 분열체 반타(半打) 배분까지 다 적용된
    // 값이라, calculatePurification엔 그대로 "perfectCount" 자리에 넣고 goodCount는 0으로 둬요
    // (분모/반올림/0~100 클램프 로직만 재사용하는 거예요).
    const raw = calculatePurification(purificationCredit, 0, wavePlan.length);

    // 판정 구간을 좁혀도(500ms->250ms 등) 타이밍을 아예 안 읽고 마구 눌러도 웬만하면 걸리는 문제는
    // 여전해요 — 판정 범위 밖 클릭은 공짜지만, 계속 눌러대면 결국 열린 판정 구간 어딘가엔 걸리거든요.
    // 그래서 "이상적으로 필요한 시도 횟수"보다 훨씬 많이 시도했으면(=타이밍 안 읽고 난사) 정화도를
    // 그만큼 깎아요. 여유분(pressEfficiencyAllowance, 기본 1.5배)까지는 페널티가 전혀 없어서,
    // 가끔 헛스윙하는 정상적인 플레이는 전혀 영향받지 않아요.
    const allowance = attemptAllowance();
    if (realAttemptCount <= allowance) return raw;
    const efficiency = allowance / realAttemptCount;
    return Math.min(100, Math.max(0, Math.round(raw * efficiency)));
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
    // 시도 효율 페널티가 결과 화면에서만 드러나면 "왜 정화도가 깎였지?"를 플레이 중엔 전혀
    // 알 수 없어서, 허용치를 넘긴 순간부터 바로 경고 문구를 보여줘요(purification()의 페널티
    // 발동 조건과 완전히 같은 기준 — attemptAllowance()).
    const overAllowance = gameplayStarted && realAttemptCount > attemptAllowance();
    if (ui.efficiencyWarning) {
      if (ui.efficiencyWarning.style) {
        ui.efficiencyWarning.style.visibility = overAllowance ? "visible" : "hidden";
      }
      ui.efficiencyWarning.textContent = overAllowance
        ? "⚠ 너무 많이 눌러서 정화도가 깎이고 있어요! 타이밍 맞춰 정확히 클릭하세요"
        : "";
    }
    if (ui.feedback) ui.feedback.textContent = lastJudgement;
    const ransomLocked = gameplayStarted && mashRemaining > 0;
    if (ui.lockStatus) {
      ui.lockStatus.textContent = ransomLocked
        ? `🔒 코어 감염! 연타로 해제 (${mashRemaining}번 더)`
        : "";
    }
    const mashPct = ransomLocked && mashTotal > 0
      ? Math.round(((mashTotal - mashRemaining) / mashTotal) * 100)
      : 0;
    if (ui.mashGaugeShell) {
      // 여기서도 hidden 대신 visibility만 바꿔요 — 박스 높이는 항상 유지해서 레이아웃이 안 흔들리게.
      if (ui.mashGaugeShell.style) {
        ui.mashGaugeShell.style.visibility = ransomLocked ? "visible" : "hidden";
      }
      ui.mashGaugeShell.setAttribute("aria-valuenow", String(mashPct));
    }
    if (ui.mashGauge?.style) ui.mashGauge.style.width = `${mashPct}%`;
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
    // 랜섬웨어 기습 타이밍은 이번 웨이브 플랜의 전체 길이를 기준으로 다시 뽑아요 (매번 랜덤)
    const totalDurationMs = estimateWavePlanEndMs(wavePlan, config?.goodWindowMs);
    ransomSchedule = buildRansomAmbushSchedule(config, totalDurationMs);
    // "랜섬이랑 같이 등장하는 건 괜찮지만, 코어에 닿는(targetAt) 순간이 랜섬 도착 순간과
    // 겹치면 안 된다"는 요청으로, 등장 시점이 아니라 도착 시점 기준으로 랜섬과 충돌하는
    // 웨이브만 뒤로 밀어요. (이전의 "잠기기 직전엔 웜만 등장 보류" 방식은 이걸로 대체했어요.)
    wavePlan = avoidRansomArrivalCollisions(wavePlan, ransomSchedule, config);
    // 이번 판에서 "이상적으로" 필요한 진짜 시도 횟수예요(웜은 자식 2마리라 2회, 나머지는 1회) —
    // 판정 구간 안에서의 실제 시도 횟수가 이걸 너무 많이 넘으면(=타이밍 안 읽고 마구 눌렀다는 뜻)
    // 정화도에 페널티를 줘요. purification()에서 씀.
    expectedAttempts = wavePlan.reduce((sum, wave) => sum + (wave.type === "WORM" ? 2 : 1), 0);
    realAttemptCount = 0;
    nextWaveIndex = 0;
    nextRansomIndex = 0;
    activeThreats = [];
    perfectCount = 0;
    goodCount = 0;
    purificationCredit = 0;
    missCount = 0;
    splitChildMissCount = 0;
    mashRemaining = 0;
    mashTotal = 0;
    lastUpdateElapsedMs = 0;
    lockedDurationMs = 0;
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
    // 웜은 다른 위협들처럼 그냥 일직선으로 다가오면 밋밋하다는 의견으로 지그재그로 흔들리며
    // 접근하게 해봤어요. 코어(판정 링)에 가까워질수록(progress → 1) 흔들림을 줄여서, 원래
    // 목표 각도(threat.angle) 그대로 정확한 자리에 도착하게 했습니다. 판정 자체는 시간
    // 기준이라(elapsedMs vs targetAt) 흔들림 여부와 무관하게 전혀 영향 없어요 — 순수하게
    // 보여지는 움직임만 바꾼 거예요.
    const zigzagAmplitude = threat.type === "WORM"
      ? finiteAtLeast(config?.wormZigzagAmplitude, 0, 0.32)
      : 0;
    const zigzagCycles = finiteAtLeast(config?.wormZigzagCycles, 0, 2.5);
    // zigzagSign(malware.js에서 웜마다 +1/-1로 미리 정해둠)을 곱해서, 웜 두 마리가 같이 있을 때
    // 다 같은 방향으로 흔들려서 마치 하나처럼 보이던 걸 서로 반대 방향으로 흔들리게 해요
    // (분열한 자식 둘은 항상 반대가 되도록 확정돼 있고, 그 외엔 id 기반으로 랜덤하게 갈려요).
    const zigzagSign = Number.isFinite(threat.zigzagSign) ? threat.zigzagSign : 1;
    const wiggle = zigzagAmplitude > 0
      ? Math.sin(progress * zigzagCycles * Math.PI * 2) * zigzagAmplitude * (1 - progress) * zigzagSign
      : 0;
    const angle = threat.angle + wiggle;
    return {
      progress,
      radius,
      x: CENTER + Math.cos(angle) * radius,
      y: CENTER + Math.sin(angle) * radius,
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

  // 웜이 코어까지 가는 길의 wormSplitProgress(기본 1/3) 지점에 도달하면
  // 미스 여부와 상관없이 무조건 분열시켜요. 원본은 소멸(miss도 hit도 아님)하고
  // 그 자리에서 2마리(자식)가 이어서 접근해요.
  function maybeSplitWorm(threat, elapsedMs) {
    if (threat.type !== "WORM" || threat.isSplitChild || threat.splitDepth >= 1) return;
    const { x, y, progress, radius } = threatPosition(threat, elapsedMs);
    // 주의: `Number(config?.wormSplitProgress) || 0.33`처럼 쓰면 wormSplitProgress를 0(등장하자마자
    // 분열)으로 명시해도 0이 falsy라서 기본값 0.33으로 되돌아가버려요 — 실제로 이 버그 때문에
    // 설정상 0인데도 웜이 33% 지점까지 가서야 분열하고 있었어요. finiteAtLeast로 "값이 있는지"를
    // 0 자체와 구분해서 판단하도록 고쳤어요.
    const splitProgress = Math.min(1, finiteAtLeast(config?.wormSplitProgress, 0, 0.33));
    if (progress < splitProgress) return;

    threat.resolved = true;
    addJudgeText("웜 분열 발생!", x, y, elapsedMs, TYPE_COLORS.WORM);

    const children = createWormChildren(threat, elapsedMs, config);
    children.forEach((child) => {
      // 자식이 START_RADIUS(맨 바깥)부터 다시 시작하면 분열 지점에서 뒤로 되돌아갔다 오는 것처럼 보여요.
      // 그래서 부모가 가지고 있던 원래 출발/도착 시각을 그대로 물려받아, 분열된 바로 그 자리에서
      // 이어서 코어를 향해 다가오도록(같은 타임라인을 그대로 이어받도록) 덮어써요.
      child.spawnedAt = threat.spawnedAt;
      child.targetAt = threat.targetAt;

      // 분열 이펙트는 실제 이동 경로가 아니라, 갈라지는 순간을 보여주는 짧은 '펑' 하는 장식이에요.
      const sparkRadius = radius + 18;
      const endX = CENTER + Math.cos(child.angle) * sparkRadius;
      const endY = CENTER + Math.sin(child.angle) * sparkRadius;
      splitEffects.push({ startX: x, startY: y, endX, endY, startedAt: elapsedMs });
    });
    activeThreats.push(...children);
    lastJudgement = "웜 분열 발생! 2개로 나뉨";
  }

  // 랜섬웨어가 코어에 도달하면(판정 없이) 무조건 코어를 감염시키고 잠가요.
  // 해제는 CLICK 버튼을 ransomMashRequired번 연타해야 하고, 시간제한은 없어요.
  // 대신 잠긴 동안은 다른 위협을 클릭할 수 없어서 자동으로 MISS가 쌓일 수 있어요.
  function triggerRansomLock(threat, elapsedMs) {
    if (!threat || threat.resolved) return;
    threat.resolved = true;
    // 이미 코어가 잠겨있는 중이면(이전 랜섬을 아직 연타로 해제 못 했으면) 새 랜섬은 그냥 흡수만 하고
    // 잠금을 다시 걸거나 연타 수를 리셋하지 않아요 — 잠금이 연속으로 겹쳐서 계속 갱신되는 걸 막아요.
    if (mashRemaining > 0) return;
    mashRemaining = Math.max(1, Math.floor(Number(config?.ransomMashRequired) || 10));
    mashTotal = mashRemaining;
    inputLock.lock("RANSOM");
    coreFlashUntilMs = elapsedMs + CORE_FLASH_DURATION;
    addJudgeText("🔒 코어 감염! 연타로 해제하세요", CENTER, CENTER - 60, elapsedMs, "#c9a6ff", 1_500);
    lastJudgement = "랜섬웨어가 코어를 감염시켰습니다. 연타로 해제하세요!";
  }

  function missThreat(threat, elapsedMs, { showJudgement = false } = {}) {
    if (!threat || threat.resolved) return;
    const { x, y } = threatPosition(threat, elapsedMs);
    threat.resolved = true;
    missCount += 1;
    if (threat.isSplitChild) splitChildMissCount += 1;
    lastJudgement = `MISS · ${threat.type}`;
    triggerImpactEffect(threat, elapsedMs);
    if (showJudgement) addJudgeText("MISS!", x, y, elapsedMs, "#ff3b3b");
  }

  // scheduleElapsedMs: 웨이브 플랜과 비교해서 "지금 등장할 차례인지" 판단하는 기준 시각이에요
  // (코어가 잠긴 동안엔 이 시계가 늦춰져서, 잠긴 동안 예정된 웨이브들의 등장도 함께 늦춰져요).
  // lockedOffsetMs: 지금까지 잠겨서 늦춰진 누적 시간 — 새로 등장하는 위협의 spawnedAt에 그대로
  // 더해줘서, 원래 예정 시각(wave.spawnAtMs)을 실제 지연된 시각으로 옮겨요. 이렇게 해야 늦게 풀려난
  // 위협이 이미 절반쯤 다가온 것처럼 나타나지 않고, 등장하는 순간부터 온전한 접근 시간을 갖게 돼요.
  // (예전엔 여기서 "잠기기 직전엔 웜만 등장 보류"하는 로직이 있었는데, 랜섬과 도착 시점이
  // 겹치는 웨이브를 애초에 계획 단계(resetRunState의 avoidRansomArrivalCollisions)에서
  // 뒤로 미뤄두는 방식으로 대체해서, 여기선 다시 순서대로 그냥 등장시키기만 하면 돼요.)
  function spawnDueWaves(scheduleElapsedMs, lockedOffsetMs) {
    while (nextWaveIndex < wavePlan.length && wavePlan[nextWaveIndex].spawnAtMs <= scheduleElapsedMs) {
      const wave = wavePlan[nextWaveIndex];
      nextWaveIndex += 1;
      activeThreats.push(createThreat(wave.type, wave.spawnAtMs + lockedOffsetMs, config, {
        angle: Math.random() * Math.PI * 2,
        approachDurationMs: wave.approachDurationMs,
      }));
    }
  }

  function spawnDueRansomAmbushes(scheduleElapsedMs, lockedOffsetMs) {
    while (nextRansomIndex < ransomSchedule.length && ransomSchedule[nextRansomIndex] <= scheduleElapsedMs) {
      const spawnAtMs = ransomSchedule[nextRansomIndex];
      activeThreats.push(createThreat("RANSOM", spawnAtMs + lockedOffsetMs, config, {
        angle: Math.random() * Math.PI * 2,
        approachDurationMs: config?.ransomApproachDurationMs,
      }));
      nextRansomIndex += 1;
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
        // 결과 화면엔 플레이어에게 실제로 의미 있는 것만 보여줘요(PERFECT/GOOD/MISS 개수, 정화도).
        // splitChildMissCount·totalWaves·spawnedWaves·attemptCount·expectedAttempts 같은 내부용
        // 수치는 공용 결과 화면이 한글 라벨 없이 그냥 필드 이름 그대로("attemptCount" 등) 띄워버려서
        // 오히려 정보가 많아 보이고 헷갈리기만 해요 — 필요하면 getState()로 여전히 확인할 수 있어요.
        metrics: {
          perfectCount,
          goodCount,
          missCount,
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
      allWavesSpawned: nextWaveIndex >= wavePlan.length && nextRansomIndex >= ransomSchedule.length,
      activeThreats: unresolved,
      purification: purification(),
      config,
    });
    if (!result) return;
    // 코어가 랜섬웨어에 감염되어 잠겨있는 동안엔 "클리어" 판정만 보류해요 (연타로 풀 때까지 대기).
    // 미스 제한 초과로 인한 FAIL은 잠금 여부와 상관없이 즉시 게임을 끝내야 해요.
    if (result.status === "CLEAR" && mashRemaining > 0) return;
    finish(result.status, result.failureReason);
  }

  function update(elapsedMs) {
    if (lifecycleState !== "RUNNING" || terminal || !gameplayStarted) return;
    const deltaMs = Math.max(0, elapsedMs - lastUpdateElapsedMs);
    lastUpdateElapsedMs = elapsedMs;

    // 코어가 잠겨있는 동안엔 새 웨이브/랜섬 기습이 등장하는 "스폰 시계"를 절반 속도로 늦춰요 — 아예
    // 멈추진 않지만, 안 그래도 연타로 정신없는 잠금 중에 다른 위협이 평소처럼 쏟아지진 않게 하려고요.
    // 이미 등장해서 다가오던 위협들은 기존처럼 그냥 느려지기만 해요(별도 배율).
    if (mashRemaining > 0 && deltaMs > 0) {
      const spawnFactor = Math.min(1, Math.max(0, Number(config?.ransomLockSpawnFactor) ?? 0.5));
      lockedDurationMs += deltaMs * (1 - spawnFactor);
    }
    const spawnClockMs = Math.max(0, elapsedMs - lockedDurationMs);

    // 랜섬과 다른 웨이브가 같이 등장하는 건 괜찮되, 코어에 닿는(targetAt) 순간이 서로 겹치지
    // 않도록 하는 건 이제 resetRunState()에서 avoidRansomArrivalCollisions()로 계획 단계에서
    // 미리 처리해요(등장 시점 기준으로 그때그때 막는 대신, 도착 시점 기준으로 애초에 스케줄을
    // 조정). 그래서 여기선 그냥 순서대로 등장시키기만 하면 돼요.
    spawnDueWaves(spawnClockMs, lockedDurationMs);
    spawnDueRansomAmbushes(spawnClockMs, lockedDurationMs);

    // 버그 수정: 코어가 잠긴 동안 다른 위협들을 "살짝 느려지게만"(기존 0.4배 속도) 뒀더니, 연타를
    // 아무리 빨리 해도 락이 풀리기 전에 그 위협의 targetAt을 지나쳐버려서 반응할 방법이 아예 없는
    // 채로 강제 MISS가 나는 경우가 있었습니다(느려지긴 해도 결국 계속 다가오고 있었으니까요).
    // 완전히 멈추는 것도 시도해봤는데 "그건 너무 심심하다"는 의견으로, 이번엔 아주 느리게만
    // (기본 0.15배 속도) 계속 다가오도록 절충했어요 — 여전히 아주 긴 락이면 드물게 targetAt을
    // 지나칠 수는 있지만, 0.4배였을 때보다 훨씬 느려서 그런 상황이 훨씬 드물어져요.
    if (mashRemaining > 0 && deltaMs > 0) {
      const slowFactor = Math.min(1, Math.max(0, Number(config?.ransomLockSlowFactor) ?? 0.15));
      const extraMs = deltaMs * (1 - slowFactor);
      for (const threat of activeThreats) {
        if (threat.resolved || threat.type === "RANSOM") continue;
        threat.targetAt += extraMs;
      }
    }

    for (const threat of activeThreats) {
      if (threat.resolved || elapsedMs < threat.spawnedAt) continue;

      if (threat.type === "RANSOM") {
        if (elapsedMs >= threat.targetAt) triggerRansomLock(threat, elapsedMs);
        continue; // 랜섬웨어는 일반 판정/자동미스 대상이 아님
      }

      maybeSplitWorm(threat, elapsedMs);
      if (threat.resolved) continue; // 방금 분열로 소멸했으면 더 처리할 것 없음

      updateThreatPresentation(threat, elapsedMs, config);
      if (elapsedMs > threat.targetAt + finiteAtLeast(config?.goodWindowMs, 0, 500)) {
        missThreat(threat, elapsedMs);
      }
    }
    activeThreats = activeThreats.filter((threat) => !threat.resolved);
    updateUi(elapsedMs);
    evaluateTerminal();
  }

  // 판정(PERFECT/GOOD/MISS)을 계산해서 카운트/이펙트에 반영하는 공통 함수
  // (즉시 판정하는 트로이/웜과, 손 뗄 때 판정하는 스파이웨어가 공유해서 씀)
  function resolveJudgement(target, elapsedMs) {
    let judgement = judgeTiming(elapsedMs, target.targetAt, config);
    // 목표 타이밍(targetAt)이 되기 전에 눌러서 MISS로 판정됐다면 — 너무 일찍 누른 거니까
    // 없었던 일로 침(카운트 안 함). 목표 타이밍을 이미 지나서 놓친 것만 진짜 MISS예요.
    if (judgement === "MISS" && elapsedMs <= target.targetAt) {
      return false;
    }

    // 스파이웨어는 타이밍이 맞아도(=가까이 왔어도) 지금 이 순간 깜빡여서 드러난 상태여야만 눌린 걸로 쳐요.
    // 꺼져있을 때 누르면 MISS가 아니라 그냥 클릭 자체가 안 먹은 걸로 처리해요(위협은 그대로 남아있고,
    // 다음 깜빡임에 다시 시도할 수 있어요) — 너무 일찍 누른 경우와 같은 취급이에요.
    // (렌더링용 opacity는 프레임마다만 갱신되니, 판정은 프레임 타이밍에 기대지 않도록 여기서
    // flickerWindows를 이 순간(elapsedMs) 기준으로 직접 다시 확인해요.)
    if (target.type === "SPYWARE" && judgement !== "MISS") {
      const windows = Array.isArray(target.flickerWindows) ? target.flickerWindows : [];
      const flickering = windows.some((window) => elapsedMs >= window.startMs && elapsedMs <= window.endMs);
      if (!flickering) return false;
    }

    const { x, y } = threatPosition(target, elapsedMs);
    if (judgement === "MISS") {
      missThreat(target, elapsedMs, { showJudgement: true });
    } else {
      target.resolved = true;
      // 표시용 카운트는 분열체 포함 실제로 성공시킨 횟수를 그대로 세요(미스 카운트가 분열체도
      // 포함해서 세는 것과 맞춰요). 정화도 계산용 가중치는 따로(purificationCredit) 챙겨요 —
      // 웜 한 마리 몫의 점수를 자식 2마리가 반씩(0.5) 나눠 갖고, 둘 다 잡아야 웜 1마리 만점이에요.
      if (judgement === "PERFECT") perfectCount += 1;
      else goodCount += 1;
      const weight = judgement === "PERFECT" ? 1 : finiteAtLeast(config?.goodScoreWeight, 0, 0.7);
      purificationCredit += target.isSplitChild ? weight * 0.5 : weight;
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

  // CLICK 버튼을 누르는 순간(pointerdown/keydown) 호출돼요.
  function onActionPress() {
    if (lifecycleState !== "RUNNING" || terminal || !gameplayStarted) return false;
    const elapsedMs = clock.getElapsedMs();

    // 코어가 랜섬웨어에 감염되어 잠긴 상태면, 이 입력은 판정이 아니라 '연타 1회'예요.
    if (mashRemaining > 0) {
      mashRemaining -= 1;
      if (mashRemaining <= 0) {
        mashRemaining = 0;
        inputLock.unlock("RANSOM");
        addJudgeText("잠금 해제!", CENTER, CENTER - 60, elapsedMs, "#8cff6a", 800);
        lastJudgement = "코어 잠금 해제!";
      }
      updateUi(elapsedMs);
      return true;
    }

    if (inputLock.locked) return false; // START_GATE 등 다른 사유로 잠겨있으면 무시

    const target = pickTarget(activeThreats, elapsedMs);
    if (!target) return false;

    // 가장 임박한 위협이라도, 아직 판정 링에 닿을 만큼 가까이 온 게 아니면(=good 타이밍 구간 밖이면)
    // 누르는 시점에 아예 아무 일도 안 일어나게 해요(홀드도 시작 안 하고, 판정도 안 함).
    // "링에 닿았을 때부터만 클릭이 먹어야 한다"는 기준 — good 판정 구간과 정확히 같은 범위예요.
    const attentionMs = finiteAtLeast(config?.goodWindowMs, 0, 500);
    if (Math.abs(elapsedMs - target.targetAt) > attentionMs) {
      return false;
    }

    // 여기부터는 "진짜 시도"예요(판정 범위 안의 대상을 골랐음) — 성공/실패와 상관없이 세어둬요.
    // 이상적으로 필요한 시도 횟수(expectedAttempts)보다 훨씬 많이 시도했다면, 타이밍을 안 읽고
    // 그냥 마구 누른 거나 마찬가지니까 정화도에서 그만큼 깎여요(purification() 참고).
    realAttemptCount += 1;

    // 스파이웨어도 더 이상 홀드가 필요 없어요 — 깜빡이는 순간에 누르면 그 자리에서 바로 판정돼요
    // (지금 깜빡이는 중인지는 resolveJudgement의 flickerWindows 체크가 가려줘요).
    return resolveJudgement(target, elapsedMs);
  }

  // CLICK 버튼에서 손을 떼는 순간(pointerup/keyup)이에요. 지금은 모든 위협이 누르는 즉시 판정되고
  // 홀드하는 위협이 없어서 딱히 할 일이 없어요 — 입력 소스(pointerup/pointercancel/keyup) 쪽 계약만
  // 그대로 유지하려고 함수는 남겨뒀어요.
  function onActionRelease() {
    return false;
  }

  function renderFrame(elapsedMs) {
    if (!canvasContext || !canvas) return;
    canvasContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const coreHit = elapsedMs < coreFlashUntilMs;
    const ransomLocked = gameplayStarted && mashRemaining > 0;
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
      canvasContext.font = "bold 20px Galmuri11, monospace";
      canvasContext.fillText("🔒", CENTER, CENTER + 7);
    } else {
      canvasContext.font = "bold 11px Galmuri11, monospace";
      canvasContext.fillText("CORE", CENTER, CENTER + 4);
    }

    canvasContext.beginPath();
    canvasContext.arc(CENTER, CENTER, RING_RADIUS, 0, Math.PI * 2);
    canvasContext.strokeStyle = "#374151";
    canvasContext.lineWidth = 2;
    canvasContext.stroke();

    for (const threat of activeThreats) {
      if (threat.resolved) continue;
      const { x, y } = threatPosition(threat, elapsedMs);
      const color = threat.type === "TROJAN" && !threat.revealed
        ? DISGUISE_COLOR
        : TYPE_COLORS[threat.type] ?? "#fff";
      // 스파이웨어는 updateThreatPresentation()이 깜빡임 구간에 맞춰 계산해둔 opacity를 그대로 써요
      // (진행률에 비례해서 서서히 밝아지는 게 아니라, 정해진 순간에만 짧게 켜졌다 꺼져요)
      canvasContext.globalAlpha = threat.type === "SPYWARE"
        ? Math.min(1, Math.max(0.1, Number(threat.opacity) || 0.1))
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
      canvasContext.font = "bold 9px Galmuri11, monospace";
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
      canvasContext.font = "bold 14px Galmuri11, monospace";
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
      // click 대신 pointerdown/pointerup을 따로 감지해요(랜섬웨어 연타 등에서 down 시점이 필요해서).
      // 지금은 모든 위협이 pointerdown(누르는 즉시)에 판정되고, up/cancel은 별다른 동작이 없어요.
      addListener(ui.actionButton, "pointerdown", (event) => {
        event?.preventDefault?.();
        onActionPress();
      });
      addListener(ui.actionButton, "pointerup", (event) => {
        event?.preventDefault?.();
        onActionRelease();
      });
      addListener(ui.actionButton, "pointercancel", () => {});
      const unsubscribeInput = context.input?.onAction?.((event) => {
        if (event.action !== INPUT_ACTIONS.CONFIRM && event.action !== INPUT_ACTIONS.INTERACT) return;

        if (event.phase === "press") {
          if (!gameplayStarted && lifecycleState === "RUNNING" && !introDismissed) dismissIntro();
          else if (!gameplayStarted && lifecycleState === "RUNNING") activateGameplay();
          else onActionPress();
        } else if (event.phase === "release") {
          onActionRelease();
        }
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
      if (mashRemaining > 0) inputLock.lock("RANSOM");
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
        attemptCount: realAttemptCount,
        expectedAttempts,
        mashRemaining,
        impactEffectCount: impactEffects.length,
        splitEffectCount: splitEffects.length,
        judgeTextCount: judgeTexts.length,
      });
    },
  });
}

export default createMiniGame;

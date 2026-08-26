// index.js
// CLICK to PURIFY 미니게임의 핵심 로직. 계획서 9.1 라이프사이클 계약(init/start/pause/resume/restart/destroy)을 구현.

import { buildWavePlan } from "./wave.js";
import { createThreat } from "./malware.js";
import { resolveTerminalState, calculatePurification, judgeTiming, pickTarget } from "./judge.js";

const MINI_GAME_ID = "click-to-purify"; // 결과 전달 시 이 미니게임을 식별하는 고유 ID

// 화면 그리기용 상수
const CENTER = 240;        // 캔버스 중심 좌표 (480x480 기준)
const CORE_RADIUS = 40;    // SECURITY CORE 원 크기
const RING_RADIUS = 90;   // 판정 링 반지름
const START_RADIUS = 210;  // 위협이 처음 등장하는 반지름(바깥쪽)
const IMPACT_DURATION = 150;      // 미스난 위협이 코어까지 돌진하는 시간
const CORE_FLASH_DURATION = 250;  // 코어가 빨갛게 빛나는 시간
const SPLIT_EFFECT_DURATION = 300; // 웜 분열 연출 시간

const TYPE_COLORS = {
  TROJAN: "#ff8c37",
  WORM: "#2e8b57",
  RANSOM: "#8b3fd1",
  SPYWARE: "#5a7a9c",
};
const DISGUISE_COLOR = "#6b7280"; // 트로이목마 위장 중일 때 색

// 게임이 가질 수 있는 상태들
const STATE = {
  CREATED: "CREATED",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  DESTROYED: "DESTROYED", // 완전히 정리된 상태 (재사용 불가)
};

export function createMiniGame(context) {
  // ---- 상태 변수들 ----
  let state = STATE.CREATED;
  let wavePlan = [];       // buildWavePlan으로 만든 웨이브 목록
  let gameConfig = null;   // init 때 받은 설정값

  let activeThreats = [];  // 화면에 떠 있는(판정 안 끝난 포함) 위협들
  let timers = [];         // 예약된 setTimeout id들 (위협 등장 예약)
  let tickTimer = null;    // 0.1초마다 도는 반복 타이머

  let spawnedCount = 0;    // 지금까지 실제로 등장한 위협 개수
  let missCount = 0;       // 놓친(MISS) 횟수
  let perfectCount = 0;    // Perfect 판정 횟수 (3단계에서 클릭 연결하면 증가)
  let goodCount = 0;       // Good 판정 횟수 (마찬가지)

  let canvasEl = null; // <canvas> 엘리먼트
  let ctx = null;      // 2D 그리기 컨텍스트
  let uiRoot = null;    // HUD를 넣을 DOM 엘리먼트
  let hudEls = {};      // HUD 안의 개별 엘리먼트들 저장
  let inputLockedUntil = 0; // 이 시각까지는 클릭 무시 (랜섬웨어 잠금용)
  let impactEffects = [];  // 미스난 위협이 코어로 돌진하는 연출용 배열
  let coreFlashUntil = 0;  // 이 시각까지 코어를 빨갛게 표시 (피격 연출)
  let judgeTexts = []; // 화면에 뜨는 PERFECT!/GOOD!/MISS! 텍스트 연출용
  let splitEffects = []; // 웜 분열(갈라지는) 연출용 배열
  let startedAt = 0; // start() 호출 시각 (durationMs 계산용)

  // ---- 라이프사이클 함수들 ----

  function init(config) {
    if (state !== STATE.CREATED) return;
    wavePlan = buildWavePlan(config);
    gameConfig = config;

    canvasEl = context.canvas;
    ctx = canvasEl ? canvasEl.getContext("2d") : null;
    createHud();

    state = STATE.READY;
    console.log("게임 초기화 완료, 상태:", state, "웨이브 개수:", wavePlan.length);
  }

  function start() {
    if (state !== STATE.READY) return;
    state = STATE.RUNNING;
    console.log("게임 시작, 상태:", state);

    // 웨이브 계획대로 위협들을 시간 맞춰 등장시킴
    wavePlan.forEach((wave) => {
      const timerId = setTimeout(() => {
        const spawnedAt = performance.now();
        const threat = createThreat(wave.type, spawnedAt, { ...gameConfig, approachDurationMs: wave.approachDurationMs }); // 웨이브별 속도 적용 
        activeThreats.push(threat);
        spawnedCount += 1;
        console.log("위협 등장:", threat.type, threat);
      }, wave.spawnAtMs);
      timers.push(timerId);
    });

    tickTimer = setInterval(tick, 100); // 0.1초마다 상태 확인
    requestAnimationFrame(renderLoop); // 화면 그리기 루프 시작 (이 줄 새로 추가)
  }

  function pause() {
    if (state !== STATE.RUNNING) return;
    state = STATE.PAUSED;
    console.log("일시정지, 상태:", state);
  }

  function resume() {
    if (state !== STATE.PAUSED) return;
    state = STATE.RUNNING;
    console.log("재개, 상태:", state);
  }

  function destroy() {
    clearInterval(tickTimer);      // 반복 확인 타이머 정지
    timers.forEach(clearTimeout);  // 아직 안 울린 등장 예약들 전부 취소
    timers = [];
    activeThreats = [];
    state = STATE.DESTROYED;
    console.log("게임 정리 완료, 상태:", state);
  }

  function restart() {
    if (state === STATE.CREATED || state === STATE.DESTROYED) return; // 초기화 전이거나 이미 파괴됐으면 무시

    // 실행 중이던 타이머 전부 정리
    clearInterval(tickTimer);
    timers.forEach(clearTimeout);
    timers = [];

    // 진행 상태 전부 초기화
    activeThreats = [];
    impactEffects = [];
    splitEffects = [];
    judgeTexts = [];
    spawnedCount = 0;
    missCount = 0;
    perfectCount = 0;
    goodCount = 0;
    inputLockedUntil = 0;
    coreFlashUntil = 0;

    wavePlan = buildWavePlan(gameConfig); // 혼합 구간은 랜덤이라 매번 새로 생성됨
    state = STATE.READY;
    start(); // 초기화 끝나고 바로 재시작
  }

  // ---- 내부 동작 함수들 ----

  function tick() {
    updateTrojanReveal();
    checkAutoMiss();
    checkGameOver();
    updateHud(); 
  }

  // 판정 기한(targetAt + goodWindowMs)을 넘긴 위협을 자동 MISS 처리
  function checkAutoMiss() {
    const now = performance.now();
    activeThreats.forEach((threat) => {
      if (threat.resolved) return;
      const missDeadline = threat.targetAt + gameConfig.goodWindowMs;
      if (now > missDeadline) {
        threat.resolved = true;
        missCount += 1;
        handleMissEffect(threat);
        triggerImpactEffect(threat, now);
        console.log("MISS (자동):", threat.type, "현재 미스:", missCount);
      }
    });
  }

  // 게임이 끝났는지(클리어/실패) 확인하고, 끝났으면 마무리 처리
  function checkGameOver() {
    const unresolved = activeThreats.filter((t) => !t.resolved);
    const allWavesSpawned = spawnedCount === wavePlan.length;
    const purification = calculatePurification(perfectCount, goodCount, wavePlan.length);

    const result = resolveTerminalState({
      missCount,
      allWavesSpawned,
      activeThreats: unresolved,
      purification,
      config: gameConfig,
    });

    if (result) {
      state = STATE.COMPLETED;
      clearInterval(tickTimer);
      timers.forEach(clearTimeout);

      // 계획서 9.1의 MiniGameResult 형식에 맞춰 결과 구성
      const miniGameResult = {
        miniGameId: MINI_GAME_ID,
        status: result.status,                              // "CLEAR" | "FAIL"
        score: result.purification,                          // 0~100 (정화도)
        durationMs: Math.round(performance.now() - startedAt),
        failureReason: result.failureReason ?? null,
        metrics: { perfectCount, goodCount, missCount, totalWaves: wavePlan.length },
        reward: null, // 보상 체계는 메인 앱 쪽에서 결정 (TBD)
      };

      console.log("게임 종료:", miniGameResult);
      if (context.onComplete) context.onComplete(miniGameResult);
    }
  }

  // CLICK 버튼을 눌렀을 때 실행되는 함수
  function onClickButton() {
    if (state !== STATE.RUNNING) return;

    const now = performance.now();
    if (now < inputLockedUntil) {
      console.log("입력 잠김 (랜섬웨어)");
      return;
    }

    const unresolved = activeThreats.filter((t) => !t.resolved);
    const target = pickTarget(unresolved, now);
    if (!target) return;

    const judgement = judgeTiming(now, target.targetAt, gameConfig);
    const errorMs = Math.round(Math.abs(now - target.targetAt));

    // 너무 이르거나 너무 늦은 클릭은 미스로도 치지 않고 그냥 무시함
    if (judgement === "MISS" && errorMs > gameConfig.clickIgnoreMs) {
      console.log("클릭 무시 (타이밍 너무 멂):", target.type, "오차:", errorMs);
      return;
    }

    target.resolved = true;

    if (judgement === "PERFECT" && !target.isSplitChild) perfectCount += 1;
    if (judgement === "GOOD" && !target.isSplitChild) goodCount += 1;
    if (judgement === "MISS") {
      missCount += 1;
      handleMissEffect(target);
      triggerImpactEffect(target, now);
    }

    console.log(
      "클릭 판정:", target.type, judgement,
      "| 오차(ms):", errorMs
    );

    // 판정 결과를 화면에 텍스트로 띄우기 위한 위치/색상 계산
    if (target.angle !== undefined) {
      const progress = Math.min(1, Math.max(0, (now - target.spawnedAt) / (target.targetAt - target.spawnedAt)));
      const radius = START_RADIUS + (RING_RADIUS - START_RADIUS) * progress;
      const tx = CENTER + Math.cos(target.angle) * radius;
      const ty = CENTER + Math.sin(target.angle) * radius;
      const text = judgement === "PERFECT" ? "PERFECT!" : judgement === "GOOD" ? "GOOD!" : "MISS!";
      const color = judgement === "PERFECT" ? "#37e6ff" : judgement === "GOOD" ? "#8cff6a" : "#ff3b3b";
      judgeTexts.push({ text, x: tx, y: ty, startAt: now, color });
    }
    updateHud();
  }

  // 미스가 났을 때 타입별 특수 효과를 처리
  function handleMissEffect(threat) {
    if (threat.type === "WORM" && threat.splitDepth < 1) {
      const now = performance.now();
      const baseAngle = threat.angle !== undefined ? threat.angle : Math.random() * Math.PI * 2;

      // 놓친 위치(판정 링 근처) 계산
      const missProgress = Math.min(1, Math.max(0, (now - threat.spawnedAt) / (threat.targetAt - threat.spawnedAt)));
      const missRadius = START_RADIUS + (RING_RADIUS - START_RADIUS) * missProgress;
      const missX = CENTER + Math.cos(baseAngle) * missRadius;
      const missY = CENTER + Math.sin(baseAngle) * missRadius;

      // 화면에 "웜 분열 발생!" 텍스트 띄우기 (판정 텍스트랑 같은 방식 재사용)
      judgeTexts.push({ text: "웜 분열 발생!", x: missX, y: missY, startAt: now, color: TYPE_COLORS.WORM });

      // 놓친 방향 근처(양옆으로 살짝 벌어진 각도) 두 곳으로 분열
      const angleOffsets = [-0.3, 0.3];
      angleOffsets.forEach((offset, i) => {
        const childAngle = baseAngle + offset;
        const endX = CENTER + Math.cos(childAngle) * START_RADIUS; // 분열된 웜이 안착할 가장자리 위치
        const endY = CENTER + Math.sin(childAngle) * START_RADIUS;

        // 놓친 위치 -> 안착 위치로 날아가는 연출
        splitEffects.push({ startX: missX, startY: missY, endX, endY, startAt: now + i * 50 });

        const child = createThreat("WORM", now + i * 150, gameConfig);
        child.splitDepth = threat.splitDepth + 1;
        child.isSplitChild = true;
        child.angle = childAngle; // 랜덤이 아니라 놓친 방향 근처로 고정
        activeThreats.push(child);
      });

      console.log("웜 분열 발생! 2개로 나뉨 (정화도 기여 없음)");
    }


    if (threat.type === "RANSOM") {
      inputLockedUntil = performance.now() + gameConfig.ransomLockMs;
      judgeTexts.push({
        text: "🔒 코어 잠금!",
        x: CENTER, y: CENTER - 60,
        startAt: performance.now(),
        color: "#c9a6ff", // 랜섬웨어 계열 보라색
        duration: 1000,
      });
      console.log("랜섬웨어 미스 -> 입력 잠금", gameConfig.ransomLockMs, "ms");
    }
  }

  // 놓친 위협의 마지막 위치를 기억해서, 코어로 돌진하는 연출을 시작
  function triggerImpactEffect(threat, now) {
    if (threat.angle === undefined) return; // 화면에 그려진 적 없으면 위치가 없어서 건너뜀
    const progress = Math.min(1, Math.max(0, (now - threat.spawnedAt) / (threat.targetAt - threat.spawnedAt)));
    const radius = START_RADIUS + (RING_RADIUS - START_RADIUS) * progress;
    const x = CENTER + Math.cos(threat.angle) * radius;
    const y = CENTER + Math.sin(threat.angle) * radius;
    impactEffects.push({ startX: x, startY: y, startAt: now });
  }

  // 트로이목마가 일정 시간 지나면 위장을 풀고 클릭 가능해지게 함
  function updateTrojanReveal() {
    const now = performance.now();
    activeThreats.forEach((threat) => {
      if (threat.type === "TROJAN" && !threat.revealed && !threat.resolved) {
        if (now >= threat.targetAt - gameConfig.goodWindowMs) { // Good 판정 가능해지는 시점에 맞춰 위장 해제
          threat.revealed = true;
        }
      }
    });
  }
  

  // 매 프레임 화면을 그림
  function renderFrame() {
    if (!ctx) return;
    const now = performance.now();

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // SECURITY CORE (중앙)
    const coreHit = now < coreFlashUntil;       // 방금 피격당했으면 true
    const isLocked = now < inputLockedUntil;    // 랜섬웨어 미스로 잠긴 상태면 true

    ctx.beginPath();
    ctx.arc(CENTER, CENTER, CORE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = coreHit ? "#ff3b3b" : isLocked ? "#3a2a4d" : "#111827";
    ctx.fill();
    ctx.strokeStyle = coreHit ? "#ff8080" : isLocked ? "#8b3fd1" : "#37e6ff"; // 잠금 중엔 랜섬웨어 색(보라)
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = coreHit ? "#fff" : isLocked ? "#c9a6ff" : "#37e6ff";
    ctx.textAlign = "center";
    if (isLocked) {
      ctx.font = "bold 20px monospace";
      ctx.fillText("🔒", CENTER, CENTER + 7); // 잠긴 동안엔 자물쇠 아이콘
    } else {
      ctx.font = "bold 11px monospace";
      ctx.fillText("CORE", CENTER, CENTER + 4);
    }

    // 판정 링
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RING_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 위협들 그리기
    activeThreats.forEach((threat) => {
      if (threat.resolved) return;
      if (threat.angle === undefined) threat.angle = Math.random() * Math.PI * 2; // 첫 프레임에 각도 하나 고정

      const progress = Math.min(1, Math.max(0, (now - threat.spawnedAt) / (threat.targetAt - threat.spawnedAt)));
      const radius = START_RADIUS + (RING_RADIUS - START_RADIUS) * progress; // 점점 중앙(판정 링)으로 이동

      const x = CENTER + Math.cos(threat.angle) * radius;
      const y = CENTER + Math.sin(threat.angle) * radius;

      let color = TYPE_COLORS[threat.type];
      if (threat.type === "TROJAN" && !threat.revealed) color = DISGUISE_COLOR;

      ctx.globalAlpha = threat.type === "SPYWARE" ? 0.1 + progress * 0.5 : 1; // 처음엔 거의 안 보이다가 다가올수록 또렷해짐

      // 위협 본체 원
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.globalAlpha = 1;

      // 지금이 판정 가능한(Good 이내) 타이밍이면 빨간 조준선(크로스헤어) 표시
      const withinGoodWindow = Math.abs(now - threat.targetAt) <= gameConfig.goodWindowMs;
      if (withinGoodWindow) {
        ctx.strokeStyle = "#ff3b3b";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2); // 조준 원
        ctx.stroke();

        ctx.beginPath(); // 십자선(조준 표시) 네 방향
        ctx.moveTo(x - 30, y); ctx.lineTo(x - 26, y);
        ctx.moveTo(x + 26, y); ctx.lineTo(x + 30, y);
        ctx.moveTo(x, y - 30); ctx.lineTo(x, y - 26);
        ctx.moveTo(x, y + 26); ctx.lineTo(x, y + 30);
        ctx.stroke();
      }

      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px monospace";
      ctx.fillText(threat.type, x, y - 32);
    });

    // 미스난 위협이 코어로 돌진하는 연출
    impactEffects = impactEffects.filter((effect) => {
      const elapsed = now - effect.startAt;
      if (elapsed >= IMPACT_DURATION) {
        coreFlashUntil = now + CORE_FLASH_DURATION; // 도착 순간 코어 피격 시작
        return false; // 연출 끝났으니 배열에서 제거
      }
      const t = elapsed / IMPACT_DURATION;
      const x = effect.startX + (CENTER - effect.startX) * t;
      const y = effect.startY + (CENTER - effect.startY) * t;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#ff3b3b";
      ctx.fill();
      return true; // 아직 진행 중이니 유지
    });

    // 웜 분열 연출: 놓친 위치에서 분열된 웜이 등장할 가장자리로 날아감
    splitEffects = splitEffects.filter((effect) => {
      const elapsed = now - effect.startAt;
      if (elapsed < 0) return true;              // 아직 시작 전이면 대기
      if (elapsed >= SPLIT_EFFECT_DURATION) return false; // 다 날아갔으면 제거

      const t = elapsed / SPLIT_EFFECT_DURATION;
      const x = effect.startX + (effect.endX - effect.startX) * t;
      const y = effect.startY + (effect.endY - effect.startY) * t;

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLORS.WORM;
      ctx.fill();
      return true;
    });

    // 판정 텍스트(PERFECT!/GOOD!/MISS!/기타 안내) 연출 — 위로 떠오르며 서서히 사라짐
    judgeTexts = judgeTexts.filter((jt) => {
      const duration = jt.duration || 600; // duration 지정 없으면 기본 0.6초
      const elapsed = now - jt.startAt;
      if (elapsed >= duration) return false;
      const t = elapsed / duration;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = jt.color;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(jt.text, jt.x, jt.y - 40 - t * 20);
      ctx.globalAlpha = 1;
      return true;
    });
}

// requestAnimationFrame으로 계속 반복되는 렌더링 루프
function renderLoop() {
  renderFrame();
  if (state === STATE.RUNNING) requestAnimationFrame(renderLoop); // RUNNING일 때만 계속 반복
}

// HUD(정화도 게이지, 미스 카운트, CLICK 버튼) DOM을 만듦
function createHud() {
  uiRoot = context.uiRoot;
  if (!uiRoot) return;
  uiRoot.innerHTML = `
    <div style="height:18px;background:#222;border:1px solid #556;border-radius:4px;overflow:hidden;margin-bottom:8px;position:relative;">
      <div id="ctp-gauge" style="height:100%;width:0%;background:#37e6ff;"></div>
      <span id="ctp-gauge-label" style="position:absolute;right:6px;top:1px;font-size:11px;color:#fff;">0%</span>
    </div>
    <div id="ctp-miss" style="margin-bottom:8px;color:#e6483c;font:12px monospace;">MISS: 0</div>
    <button id="ctp-click-btn" style="width:100%;padding:14px;font:bold 16px monospace;color:#fff;background:#3a3f4a;border:2px solid #37e6ff;border-radius:6px;">CLICK</button>
  `;
  hudEls.gauge = uiRoot.querySelector("#ctp-gauge");
  hudEls.gaugeLabel = uiRoot.querySelector("#ctp-gauge-label");
  hudEls.miss = uiRoot.querySelector("#ctp-miss");
  hudEls.clickBtn = uiRoot.querySelector("#ctp-click-btn");
  hudEls.clickBtn.addEventListener("click", onClickButton); // CLICK 버튼 누르면 onClickButton 실행
}

// HUD 표시 값을 최신 상태로 갱신
function updateHud() {
  if (!hudEls.gauge) return;
  const purification = calculatePurification(perfectCount, goodCount, wavePlan.length);
  hudEls.gauge.style.width = purification + "%";
  hudEls.gaugeLabel.textContent = purification + "%";
  hudEls.miss.textContent = "MISS: " + missCount + " / " + gameConfig.missLimit;
}

  // 바깥에서 game.init(), game.start() 이렇게 쓸 수 있게 반환
  return { init, start, pause, resume, restart, destroy };
}
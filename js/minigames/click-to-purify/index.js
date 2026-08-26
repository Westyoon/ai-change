// index.js
// CLICK to PURIFY 미니게임의 핵심 로직. 계획서 9.1 라이프사이클 계약(init/start/pause/resume/restart/destroy)을 구현.

import { buildWavePlan } from "./wave.js";
import { createThreat } from "./malware.js";
import { resolveTerminalState, calculatePurification } from "./judge.js";

// 화면 그리기용 상수
const CENTER = 240;        // 캔버스 중심 좌표 (480x480 기준)
const CORE_RADIUS = 40;    // SECURITY CORE 원 크기
const RING_RADIUS = 110;   // 판정 링 반지름
const START_RADIUS = 210;  // 위협이 처음 등장하는 반지름(바깥쪽)

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
        const threat = createThreat(wave.type, spawnedAt, gameConfig);
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

  // ---- 내부 동작 함수들 ----

  function tick() {
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
      console.log("게임 종료:", result);
      if (context.onComplete) context.onComplete(result);
    }
  }

  // 매 프레임 화면을 그림
function renderFrame() {
  if (!ctx) return;
  const now = performance.now();

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // SECURITY CORE (중앙)
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.strokeStyle = "#37e6ff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#37e6ff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CORE", CENTER, CENTER + 4);

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
    if (threat.type === "TROJAN" && !threat.revealed) color = DISGUISE_COLOR; // 위장 중이면 회색

    ctx.globalAlpha = threat.type === "SPYWARE" ? 1 - progress * 0.6 : 1; // 스파이웨어는 다가올수록 흐려짐

    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px monospace";
    ctx.fillText(threat.type, x, y - 18);
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
  return { init, start, pause, resume, destroy };
}
// index.js
import {buildWavePlan} from "./wave.js";
import {createThreat} from "./malware.js";

// 이 미니게임이 가질 수 있는 상태들 (계획서 9.1 라이프사이클 계약 기준)
const STATE = {
  CREATED: "CREATED",           // 막 만들어졌지만 아직 초기화 안 됨
  READY: "READY",               // 초기화 끝나서 시작 대기 중
  RUNNING: "RUNNING",           // 게임 진행 중
  PAUSED: "PAUSED",             // 일시정지 중
  COMPLETED: "COMPLETED",       // 클리어/실패로 끝남
};


// 미니게임 하나를 만드는 함수. 호출하면 게임을 조작할 수 있는 함수 묶음을 돌려줌
export function createMiniGame(context) {
  let state = STATE.CREATED; // 지금 상태를 기억하는 변수 (처음엔 CREATED)
  let wavePlan = []; // buildWavePlan으로 만든 웨이브 목록을 저장할 곳
  let gameConfig = null; // init 때 받은 config를 저장할 곳
  let activeTreats = []; // 지금 화면에 떠 있는(아직 판정 안 된) 위협들을 담는 배열
  let timers = []; // 예약해둔 setTimeout id들 (나중에 게임 끝날 때 정리하려고 저장)

  function init(config) {
    if (state !== STATE.CREATED) return; // 이미 초기화했으면 다시 안 함

    wavePlan = buildWavePlan(config); // 웨이브 등장 계획을 미리 만들어서 저장
    gameConfig = config; // 다른 함수에서도 config 쓸 수 있게 저장

    state = STATE.READY;
    console.log("게임 초기화 완료, 상태:", state, "웨이브 개수:", wavePlan.length);
  }

  function start() {
    if (state !== STATE.READY) return; // READY 상태일 때만 시작 가능
    state = STATE.RUNNING;
    console.log("게임 시작, 상태:", state);

    // 웨이브 계획에 있는 각 위협마다, spawnAtMs 시점에 맞춰 실제로 등장시킴
    wavePlan.forEach((wave)=> {
      const timerId = setTimeout(() => {
        const spawnedAt = performance.now(); // 지금 이 순간을 "실제 등장 시각"으로 기록
        const threat = createThreat(wave.type, spawnedAt, gameConfig); // 위협 데이터 생성
        activeThreats.push(threat); // 화면에 떠 있는 위협 목록에 추가
        console.log("위협 등장:", threat.type, threat);
      }, wave.spawnAtMs); // wave.spqwnAtMs 만큼 기다렸다가 실행됨

      timers.push(timerId); // 나중에 취소할 수 있게 타이머 id 저장
    });
  }

  function pause() {
    if (state !== STATE.RUNNING) return; // 진행 중일 때만 일시정지 가능
    state = STATE.PAUSED;
    console.log("일시정지, 상태:", state);
  }

  function resume() {
    if (state !== STATE.PAUSED) return; // 일시정지 상태일 때만 재개 가능
    state = STATE.RUNNING;
    console.log("재개, 상태:", state);
  }

  // 바깥에서 game.init(), game.start() 이런 식으로 쓸 수 있게 함수들을 묶어서 반환
  return { init, start, pause, resume };
}
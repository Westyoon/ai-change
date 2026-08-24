// index.js

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

  function init(config) {
    if (state !== STATE.CREATED) return; // 이미 초기화했으면 다시 안 함
    state = STATE.READY;
    console.log("게임 초기화 완료, 상태:", state);
  }

  function start() {
    if (state !== STATE.READY) return; // READY 상태일 때만 시작 가능
    state = STATE.RUNNING;
    console.log("게임 시작, 상태:", state);
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
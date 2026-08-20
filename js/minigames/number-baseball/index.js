export function createMiniGame(context) {
  // 객체 선언
  let state = {
    answer: [],           // 중복 없는 3자리 정답 배열
    currentInput: [],     // 사용자의 현재 입력 배열
    history: [],          // 과거 입력 및 판정 결과 누적
    epoch: 0,             // 현재 시도 횟수
    maxEpochs: 9,         // 최대 시도 횟수
    phase: "INPUT",       // 현재 상태 (예: READY, INPUT, RESOLVING, COMPLETED 등)
    inputLocked: false    // 입력 잠금 여부 (판정 애니메이션 중 중복 입력 방지 등)
  };

  // 메서드 정의

  // 초기화
  function init(config) {
    console.log("Number Baseball: init", config);
  }

  // 게임 시작
  function start() {
    console.log("Number Baseball: start");
  }

  // 일시정지 - 클럭, 애니메이션, 입력, 오디오 등 정지
  function pause(reason) {
    console.log("Number Baseball: pause", reason);
    state.inputLocked = true;
  }

  // 재개
  function resume() {
    console.log("Number Baseball: resume");
    if (state.phase === "INPUT") {
      state.inputLocked = false;
    }
  }

  // 재시작
  function restart() {
    console.log("Number Baseball: restart");
    
    // 상태 초기화
    state = {
      answer: [],
      currentInput: [],
      history: [],
      epoch: 0,
      maxEpochs: 9,
      phase: "INPUT",
      inputLocked: false
    };
  }

  // 삭제 - Scene 이탈 시
  function destroy() {
    console.log("Number Baseball: destroy");
  }

  // 공통 라이프사이클 메서드 반환
  return {
    init,
    start,
    pause,
    resume,
    restart,
    destroy
  };
}
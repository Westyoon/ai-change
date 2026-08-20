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

  // DOM 요소를 참조하기 위한 객체 추가
  const dom = {
    epochText: null,
    progressBar: null,
    inputSlots: [],
    historyContainer: null,
    keypad: null,
    actionButtons: null
  };

  // 메서드 정의

  // 초기화
  function init(config) {
    console.log("Number Baseball: init", config);
    
    // 컨테이너
    const container = document.createElement("div");
    container.className = "nb-container";

    // 상단 - EPOCH, 프로그레스바
    const header = document.createElement("div");
    header.className = "nb-header";
    
    dom.epochText = document.createElement("div");
    dom.epochText.className = "nb-epoch-text";
    dom.epochText.textContent = `EPOCH 0/9`;
    
    const progressWrapper = document.createElement("div");
    progressWrapper.className = "nb-progress-wrapper";
    dom.progressBar = document.createElement("div");
    dom.progressBar.className = "nb-progress-bar";
    
    progressWrapper.appendChild(dom.progressBar);
    header.appendChild(dom.epochText);
    header.appendChild(progressWrapper);

    // 중앙 상단 - 입력 슬롯*3
    const slotsContainer = document.createElement("div");
    slotsContainer.className = "nb-slots";
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement("div");
      slot.className = "nb-slot";
      dom.inputSlots.push(slot);
      slotsContainer.appendChild(slot);
    }

    // 중앙: 과거 입력을 누적할 히스토리 영역
    dom.historyContainer = document.createElement("div");
    dom.historyContainer.className = "nb-history";

    // 하단: 0~9 키패드, 버튼
    const controls = document.createElement("div");
    controls.className = "nb-controls";
    
    dom.keypad = document.createElement("div");
    dom.keypad.className = "nb-keypad";
    for (let i = 0; i <= 9; i++) {
      const key = document.createElement("button");
      key.className = "nb-key";
      key.textContent = i;
      dom.keypad.appendChild(key);
    }

    dom.actionButtons = document.createElement("div");
    dom.actionButtons.className = "nb-actions";
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "nb-btn-delete";
    deleteBtn.textContent = "지우기";
    
    const submitBtn = document.createElement("button");
    submitBtn.className = "nb-btn-submit";
    submitBtn.textContent = "검증";
    
    dom.actionButtons.appendChild(deleteBtn);
    dom.actionButtons.appendChild(submitBtn);

    controls.appendChild(dom.keypad);
    controls.appendChild(dom.actionButtons);

    // uiRoot에 부착
    container.appendChild(header);
    container.appendChild(slotsContainer);
    container.appendChild(dom.historyContainer);
    container.appendChild(controls);
    
    context.uiRoot.appendChild(container);
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
    if (context && context.uiRoot) {
      context.uiRoot.innerHTML = "";
    }
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
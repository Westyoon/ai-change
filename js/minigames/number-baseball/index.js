export function createMiniGame(context) {
  let state = {
    answer: [],
    currentInput: [],
    history: [],
    epoch: 0,
    maxEpochs: 9,
    phase: "INPUT",
    inputLocked: false
  };

  const dom = {
    epochText: null,
    progressBar: null,
    inputSlots: [],
    historyContainer: null,
    keypad: null,
    actionButtons: null
  };

  function updateInputSlots() {
    dom.inputSlots.forEach((slot, index) => {
      slot.textContent = state.currentInput[index] !== undefined ? state.currentInput[index] : "";
    });
  }

  function handleNumberInput(num) {
    if (state.inputLocked || state.phase !== "INPUT") return;
    if (state.currentInput.length >= 3) return;
    if (state.currentInput.includes(num)) return;
    
    state.currentInput.push(num);
    updateInputSlots();
  }

  function handleDelete() {
    if (state.inputLocked || state.phase !== "INPUT") return;
    if (state.currentInput.length > 0) {
      state.currentInput.pop();
      updateInputSlots();
    }
  }

  function generateAnswer() {
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = [];
    for (let i = 0; i < 3; i++) {
      const randomIndex = Math.floor(Math.random() * numbers.length);
      result.push(numbers.splice(randomIndex, 1)[0]);
    }
    return result;
  }

  // --- 🌟 새롭게 추가/수정된 검증 및 종료 로직 시작 --- //

  // 히스토리를 화면에 그려주는 함수
  function appendHistoryUI(record) {
    const row = document.createElement("div");
    row.className = "nb-history-row";
    // MVP 테스트용 인라인 스타일 (추후 CSS 파일로 분리 가능)
    row.style.display = "flex";
    row.style.gap = "15px";
    row.style.marginBottom = "5px";
    row.style.padding = "5px";
    row.style.borderBottom = "1px solid #555";

    const guessText = document.createElement("span");
    guessText.style.fontWeight = "bold";
    guessText.style.color = "#0ff"; // 네온 블루 느낌
    guessText.textContent = `[ ${record.guess.join(" ")} ]`;
    
    const resultText = document.createElement("span");
    resultText.innerHTML = `<span style="color:#0f0">${record.fit} Fit</span> / 
                            <span style="color:#ff0">${record.shift} Shift</span> / 
                            <span style="color:#f0f">${record.outlier} Outlier</span>`;
    
    row.appendChild(guessText);
    row.appendChild(resultText);
    
    dom.historyContainer.appendChild(row);
    // 스크롤 맨 아래로 이동
    dom.historyContainer.scrollTop = dom.historyContainer.scrollHeight;
  }

  // 게임 종료 처리 함수
  function endGame(status, fit, shift, outlier) {
    state.phase = status;
    state.inputLocked = true;
    
    if (status === "FAIL") {
      alert(`게임 오버! 정답은 ${state.answer.join("")} 였습니다.`);
    } else {
      alert(`클리어! ${state.epoch}번 만에 맞혔습니다.`);
    }

    // 개발 계획서에 명시된 MiniGameResult 스키마에 맞춰 상위 라우터로 결과 반환[cite: 1]
    if (context && context.onComplete) {
      context.onComplete({
        miniGameId: "data-number-baseball",
        status: status,
        score: null,
        durationMs: 0, // 실제로는 performance.now()로 계산 필요
        failureReason: status === "FAIL" ? "MAX_EPOCH_REACHED" : null,
        metrics: {
          epochsUsed: state.epoch,
          fit: fit,
          shift: shift,
          outlier: outlier
        }
      });
    }
  }

  // 검증(제출) 버튼 클릭 시 실행되는 함수
  function handleSubmit() {
    console.log("검증 버튼 클릭됨! 현재 상태:", state.phase, "입력된 숫자:", state.currentInput);

    if (state.inputLocked || state.phase !== "INPUT") return;
    
    // 3자리 미만이면 알림을 띄우고 종료 (Epoch 미차감)
    if (state.currentInput.length < 3) {
      alert("숫자 3자리를 모두 채워주세요!");
      return;
    }

    // 1. 상태 업데이트
    state.epoch++;
    dom.epochText.textContent = `EPOCH ${state.epoch}/9`;

    // 2. Fit, Shift, Outlier 판정 로직
    const guess = state.currentInput;
    const answer = state.answer;
    
    const fit = guess.filter((digit, index) => digit === answer[index]).length;
    const shift = guess.filter(
      (digit, index) => digit !== answer[index] && answer.includes(digit)
    ).length;
    const outlier = 3 - fit - shift;

    // 3. 기록(History) 업데이트
    const record = { guess: [...guess], fit, shift, outlier };
    state.history.push(record);
    appendHistoryUI(record);

    // 4. 승패 및 게임 진행 조건 체크
    if (fit === 3) {
      endGame("CLEAR", fit, shift, outlier);
    } else if (state.epoch >= state.maxEpochs) {
      endGame("FAIL", fit, shift, outlier);
    } else {
      // 다음 턴을 위해 입력 초기화
      state.currentInput = [];
      updateInputSlots();
    }
  }

  // --- 🌟 검증 및 종료 로직 끝 --- //

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
    // 스크롤이 가능하도록 임시 높이 지정
    dom.historyContainer.style.height = "150px"; 
    dom.historyContainer.style.overflowY = "auto";

    // 하단: 0~9 키패드, 버튼
    const controls = document.createElement("div");
    controls.className = "nb-controls";

    dom.keypad = document.createElement("div");
    dom.keypad.className = "nb-keypad";
    for (let i = 0; i <= 9; i++) {
      const key = document.createElement("button");
      key.className = "nb-key";
      key.textContent = i;
      // 이벤트 리스너 연결 (숫자 입력)
      key.addEventListener("click", () => handleNumberInput(i));
      dom.keypad.appendChild(key);
    }

    dom.actionButtons = document.createElement("div");
    dom.actionButtons.className = "nb-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "nb-btn-delete";
    deleteBtn.textContent = "지우기";
    // 이벤트 리스너 연결 (지우기)
    deleteBtn.addEventListener("click", handleDelete);

    const submitBtn = document.createElement("button");
    submitBtn.className = "nb-btn-submit";
    submitBtn.textContent = "검증";
    // 이벤트 리스너 연결 (검증)
    submitBtn.addEventListener("click", handleSubmit);

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
    
    // 정답 생성 및 입력 상태 활성화
    state.answer = generateAnswer();
    state.phase = "INPUT";
    state.inputLocked = false;
    
    console.log("Secret Answer (For Dev):", state.answer); // 개발 확인용, 출시 전 삭제 권장
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
      answer: generateAnswer(), // 재시작 시 새로운 정답 생성
      currentInput: [],
      history: [],
      epoch: 0,
      maxEpochs: 9,
      phase: "INPUT",
      inputLocked: false
    };
    
    // UI 초기화 로직
    updateInputSlots();
    dom.historyContainer.innerHTML = "";
    dom.epochText.textContent = `EPOCH 0/9`;
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
import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "../../character/index.js"; // 공용 모듈 불러오기[cite: 6]

export function createDataSphinxBoss(context, battleState, account, mapConfig) {
  // 본 게임 기획에 맞춰 15초 제한, 10문제 기준으로 확장할 준비
  const quizList = [
    { id: 1, question: "이화여자대학교의 상징색은 '이화 그린'이다.", answer: "O" },
    { id: 2, question: "C++에서 동적 할당된 메모리를 해제하는 키워드는 delete이다.", answer: "O" },
    { id: 3, question: "ECC는 Ewha Campus Complex의 약자이다.", answer: "O" },
    { id: 4, question: "배열의 첫 번째 인덱스는 1부터 시작한다.", answer: "X" },
    { id: 5, question: "이화여대 후문 근처에는 공과대학 건물이 있다.", answer: "O" }
    // TODO: 10문제까지 데이터 추가 필요
  ];

  let state = {
    currentQuizIndex: 0,
    timeLimitMs: 15000, // 제한시간 15초로 변경
    timeRemainingMs: 0,
    playerLocation: "NEUTRAL", 
    phase: "INIT" 
  };

  // UI 요소들을 담을 객체 추가[cite: 5]
  const dom = {
    container: null,
    questionText: null,
    timerText: null
  };

  let system = null;

  async function init(config, { signal }) {
    console.log("데이터 스핑크스: init");

    // --- 🌟 DOM 기반 HUD 생성 ---[cite: 5]
    dom.container = document.createElement("div");
    // 테스트용 인라인 스타일 (추후 css/battle.css 로 분리)
    Object.assign(dom.container.style, {
      position: "absolute",
      top: "40px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      border: "3px solid #0ff",
      borderRadius: "12px",
      padding: "20px 40px",
      textAlign: "center",
      zIndex: "2000",
      minWidth: "600px",
      boxShadow: "0 0 15px rgba(0, 255, 255, 0.5)"
    });

    dom.questionText = document.createElement("div");
    Object.assign(dom.questionText.style, {
      fontSize: "24px",
      fontWeight: "bold",
      marginBottom: "15px",
      lineHeight: "1.4"
    });

    dom.timerText = document.createElement("div");
    Object.assign(dom.timerText.style, {
      fontSize: "40px",
      fontWeight: "900",
      color: "yellow",
      fontFamily: "monospace"
    });

    dom.container.appendChild(dom.questionText);
    dom.container.appendChild(dom.timerText);
    context.uiRoot.appendChild(dom.container); // uiRoot에 부착[cite: 5]
    // ---------------------------------

    const worldBounds = { x: 0, y: 0, width: 1600, height: 720 };
    const triggers = [
      { id: "zone-o", kind: "QUIZ_ZONE", bounds: { x: 0, y: 0, width: 800, height: 720 }, metadata: { zoneValue: "O" } },
      { id: "zone-x", kind: "QUIZ_ZONE", bounds: { x: 800, y: 0, width: 800, height: 720 }, metadata: { zoneValue: "X" } }
    ];

    system = new CharacterSystem({
      events: context.events,
      inputManager: context.input,
      character: {
        id: account?.id || "player-1",
        x: 800, y: 360, width: 34, height: 44, speed: 500, 
        maxHealth: battleState?.maxHealth || 100,
        currentHealth: battleState?.currentHealth || 100,
        stats: { attack: account?.attack || 10, defense: account?.defense || 0, health: account?.hp || 100 },
        appearance: account?.appearance,
      },
      world: { bounds: worldBounds, colliders: [], triggers: triggers },
    });

    context.events.on(CHARACTER_EVENTS.CONTACT, handleContact);
  }

  function handleContact(contact) {
    if (contact.kind === "QUIZ_ZONE") {
      if (contact.phase === "enter" || contact.phase === "stay") {
        state.playerLocation = contact.metadata.zoneValue;
      } else if (contact.phase === "exit") {
        state.playerLocation = "NEUTRAL";
      }
    }
  }

  function loadQuiz(index) {
    if (index >= quizList.length) {
      dom.questionText.textContent = "모든 퀴즈 완료! 보스전 클리어!";
      dom.timerText.textContent = "CLEAR!";
      dom.timerText.style.color = "#0f0";
      state.phase = "END";
      return;
    }
    
    state.currentQuizIndex = index;
    state.timeRemainingMs = state.timeLimitMs;
    state.phase = "PLAYING";
    
    system.setControlLocked(false, "quiz-resolving"); 
    
    // UI 업데이트
    const currentQuiz = quizList[index];
    dom.questionText.textContent = `[문제 ${index + 1}] ${currentQuiz.question}`;
    dom.timerText.textContent = (state.timeLimitMs / 1000).toFixed(1);
    dom.timerText.style.color = "yellow";
  }

  function resolveQuiz() {
    state.phase = "RESOLVING";
    system.setControlLocked(true, "quiz-resolving"); 

    const currentQuiz = quizList[state.currentQuizIndex];
    const isCorrect = state.playerLocation === currentQuiz.answer;

    if (state.playerLocation === "NEUTRAL") {
      dom.timerText.textContent = "시간 초과!";
      dom.timerText.style.color = "red";
      system.applyResolvedDamage(20, { sourceId: "sphinx-timeout" }); 
    } else if (isCorrect) {
      dom.timerText.textContent = "정답입니다!";
      dom.timerText.style.color = "#0f0";
      // TODO: 보스 체력 차감 로직 추가
    } else {
      dom.timerText.textContent = "오답입니다!";
      dom.timerText.style.color = "red";
      system.applyResolvedDamage(20, { sourceId: "sphinx-wrong" }); 
    }

    setTimeout(() => {
      if (state.phase !== "END") { // 끝난 게 아니라면 다음 문제
        loadQuiz(state.currentQuizIndex + 1);
      }
    }, 2000);
  }

  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    system.start(); 
    loadQuiz(0); 
  }

  function pause(reason) {}
  function resume() {}
  function restart({ attemptId }) {}
  
  function destroy() {
    console.log("데이터 스핑크스: destroy");
    // UI 청소[cite: 5]
    if (dom.container && dom.container.parentNode) {
      dom.container.parentNode.removeChild(dom.container);
    }
  }

  function update(deltaMs) {
    if (system) system.update(deltaMs);

    if (state.phase === "PLAYING") {
      state.timeRemainingMs -= deltaMs;
      
      // 타이머 텍스트 실시간 업데이트 (소수점 1자리까지 표시)
      dom.timerText.textContent = Math.max(0, state.timeRemainingMs / 1000).toFixed(1);

      // 남은 시간이 3초 이하일 때 빨간색으로 경고
      if (state.timeRemainingMs <= 3000) {
        dom.timerText.style.color = "red";
      }
      
      if (state.timeRemainingMs <= 0) {
        state.timeRemainingMs = 0;
        resolveQuiz(); 
      }
    }
  }

  return { init, start, pause, resume, restart, destroy, update };
}
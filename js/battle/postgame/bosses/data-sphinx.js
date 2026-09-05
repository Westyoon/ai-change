import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "../../character/index.js";

export function createDataSphinxBoss(context, battleState, account, mapConfig) {
  const quizList = [
    { id: 1, question: "이화여자대학교의 상징색은 '이화 그린'이다.", answer: "O" },
    { id: 2, question: "C++에서 동적 할당된 메모리를 해제하는 키워드는 delete이다.", answer: "O" },
    { id: 3, question: "ECC는 Ewha Campus Complex의 약자이다.", answer: "O" },
    { id: 4, question: "배열의 첫 번째 인덱스는 1부터 시작한다.", answer: "X" },
    { id: 5, question: "이화여대 후문 근처에는 공과대학 건물이 있다.", answer: "O" },
    { id: 6, question: "HTML은 프로그래밍 언어이다.", answer: "X" },
    { id: 7, question: "대강당에서는 매주 채플이 진행된다.", answer: "O" },
    { id: 8, question: "HTTP 상태 코드 404는 '서버 내부 오류'를 의미한다.", answer: "X" },
    { id: 9, question: "이화여대의 마스코트는 '화연이'이다.", answer: "X" },
    { id: 10, question: "이진 탐색(Binary Search)은 정렬된 배열에서만 사용할 수 있다.", answer: "O" }
  ];

  let state = {
    currentQuizIndex: 0,
    timeLimitMs: 15000, 
    timeRemainingMs: 0,
    delayTimerMs: 0, // setTimeout을 대체할 딜레이 타이머
    playerLocation: "NEUTRAL", 
    phase: "INIT",
    isPaused: false, // 일시정지 상태 플래그
    currentAttemptId: null,
    bossHealth: 100, 
    metrics: { correctCount: 0, wrongCount: 0, timeoutCount: 0 }
  };

  const dom = {
    container: null,
    questionText: null,
    timerText: null,
    bossHealthText: null
  };

  let system = null;

  async function init(config, { signal }) {
    console.log("데이터 스핑크스: init");

    dom.container = document.createElement("div");
    Object.assign(dom.container.style, {
      position: "absolute", top: "40px", left: "50%", transform: "translateX(-50%)",
      backgroundColor: "rgba(0, 0, 0, 0.85)", border: "3px solid #0ff",
      borderRadius: "12px", padding: "20px 40px", textAlign: "center",
      zIndex: "2000", minWidth: "600px", boxShadow: "0 0 15px rgba(0, 255, 255, 0.5)"
    });

    dom.bossHealthText = document.createElement("div");
    Object.assign(dom.bossHealthText.style, {
      fontSize: "18px", color: "#ff00ff", marginBottom: "10px", fontWeight: "bold"
    });

    dom.questionText = document.createElement("div");
    Object.assign(dom.questionText.style, {
      fontSize: "24px", fontWeight: "bold", marginBottom: "15px", lineHeight: "1.4"
    });

    dom.timerText = document.createElement("div");
    Object.assign(dom.timerText.style, {
      fontSize: "40px", fontWeight: "900", color: "yellow", fontFamily: "monospace"
    });

    dom.container.appendChild(dom.bossHealthText);
    dom.container.appendChild(dom.questionText);
    dom.container.appendChild(dom.timerText);
    context.uiRoot.appendChild(dom.container);

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

  function updateBossUI() {
    dom.bossHealthText.textContent = `데이터 스핑크스 체력: ${state.bossHealth} / 100`;
  }

  function endGame(status, failureReason = null) {
    if (state.phase === "END") return;
    state.phase = "END";
    system.setControlLocked(true, "quiz-end");

    if (status === "CLEAR") {
      dom.questionText.textContent = "스핑크스의 코드를 모두 해석했습니다!";
      dom.timerText.textContent = "CLEAR!";
      dom.timerText.style.color = "#0f0";
    } else {
      dom.questionText.textContent = "스핑크스를 쓰러뜨리지 못했습니다...";
      dom.timerText.textContent = "FAIL!";
      dom.timerText.style.color = "red";
    }

    if (context.onComplete) {
      context.onComplete(state.currentAttemptId, {
        status: status,
        score: null,
        failureReason: failureReason,
        metrics: state.metrics,
        reward: null
      });
    }
  }

  function loadQuiz(index) {
    if (state.bossHealth <= 0) {
      endGame("CLEAR", null);
      return;
    }
    
    if (index >= quizList.length) {
      endGame("FAIL", "OUT_OF_QUESTIONS");
      return;
    }
    
    state.currentQuizIndex = index;
    state.timeRemainingMs = state.timeLimitMs;
    state.phase = "PLAYING";
    
    system.setControlLocked(false, "quiz-resolving"); 
    
    const currentQuiz = quizList[index];
    updateBossUI();
    dom.questionText.textContent = `[문제 ${index + 1}/10] ${currentQuiz.question}`;
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
      state.metrics.timeoutCount++;
    } else if (isCorrect) {
      dom.timerText.textContent = "정답입니다!";
      dom.timerText.style.color = "#0f0";
      state.bossHealth = Math.max(0, state.bossHealth - 10);
      state.metrics.correctCount++;
      updateBossUI();
    } else {
      dom.timerText.textContent = "오답입니다!";
      dom.timerText.style.color = "red";
      system.applyResolvedDamage(20, { sourceId: "sphinx-wrong" });
      state.metrics.wrongCount++;
    }

    // setTimeout 대신 딜레이 타이머(2초) 설정
    state.delayTimerMs = 2000;
  }

  // --- 🌟 라이프사이클 메서드 완성 ---
  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    state.currentAttemptId = attemptId;
    system.start(); 
    loadQuiz(0); 
  }

  function pause(reason) {
    console.log("데이터 스핑크스: pause", reason);
    state.isPaused = true;
    if (system) system.setControlLocked(true, "game-paused");
  }

  function resume() {
    console.log("데이터 스핑크스: resume");
    state.isPaused = false;
    if (state.phase === "PLAYING" && system) {
      system.setControlLocked(false, "game-paused");
    }
  }

  function restart({ attemptId }) {
    console.log("데이터 스핑크스: restart, attemptId:", attemptId);
    
    // 상태 및 맵트릭스 완전 초기화
    state.currentAttemptId = attemptId;
    state.currentQuizIndex = 0;
    state.bossHealth = 100;
    state.timeRemainingMs = 0;
    state.delayTimerMs = 0;
    state.playerLocation = "NEUTRAL";
    state.phase = "INIT";
    state.isPaused = false;
    state.metrics = { correctCount: 0, wrongCount: 0, timeoutCount: 0 };
    
    // 캐릭터 체력 및 위치 복구
    if (system) {
      system.character.currentHealth = system.character.maxHealth;
      system.character.dead = false;
      system.character.setPosition(800, 360);
      
      // 걸려있던 모든 Lock 해제
      system.setControlLocked(false, "quiz-end");
      system.setControlLocked(false, "game-paused");
      system.setControlLocked(false, "quiz-resolving");
    }

    loadQuiz(0); 
  }
  
  function destroy() {
    console.log("데이터 스핑크스: destroy");
    // 메모리 누수 방지를 위한 이벤트 리스너 해제
    if (context.events.off) {
      context.events.off(CHARACTER_EVENTS.CONTACT, handleContact);
    }
    
    if (system) {
      system.destroy();
      system = null;
    }
    
    if (dom.container && dom.container.parentNode) {
      dom.container.parentNode.removeChild(dom.container);
    }
  }

  // 게임 루프
  function update(deltaMs) {
    // 일시정지 중이면 타이머 및 캐릭터 업데이트 완전 중단
    if (state.isPaused) return;

    if (system) system.update(deltaMs);

    if (state.phase === "PLAYING") {
      state.timeRemainingMs -= deltaMs;
      dom.timerText.textContent = Math.max(0, state.timeRemainingMs / 1000).toFixed(1);

      if (state.timeRemainingMs <= 3000) {
        dom.timerText.style.color = "red";
      }
      
      if (state.timeRemainingMs <= 0) {
        state.timeRemainingMs = 0;
        resolveQuiz(); 
      }
    } else if (state.phase === "RESOLVING") {
      // setTimeout을 대체하는 안전한 딜레이 카운트다운
      state.delayTimerMs -= deltaMs;
      if (state.delayTimerMs <= 0) {
        const playerSnapshot = system.getSnapshot();
        if (playerSnapshot.currentHealth <= 0) {
          endGame("FAIL", "PLAYER_DEAD");
        } else if (state.phase !== "END") {
          loadQuiz(state.currentQuizIndex + 1);
        }
      }
    }
  }

  return { init, start, pause, resume, restart, destroy, update };
}
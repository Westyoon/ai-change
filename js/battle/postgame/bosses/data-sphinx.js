import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "../../character/index.js";

export function createDataSphinxBoss(context, battleState, account, mapConfig) {
  let quizList = []; // config에서 불러올 빈 배열로 초기화

  let state = {
    currentQuizIndex: 0,
    timeLimitMs: 15000, 
    timeRemainingMs: 0,
    delayTimerMs: 0, 
    playerLocation: "NEUTRAL", 
    phase: "INIT",
    isPaused: false, 
    currentAttemptId: null,
    bossHealth: 100, 
    bossMaxHealth: 100,
    damagePerCorrect: 10,
    playerDamagePerWrong: 20,
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

    // --- 🌟 JSON(config) 데이터 연동 ---
    quizList = config?.quizList || [];
    state.timeLimitMs = config?.timeLimitMs || 15000;
    state.bossMaxHealth = config?.bossMaxHealth || 100;
    state.bossHealth = state.bossMaxHealth;
    state.damagePerCorrect = config?.damagePerCorrect || 10;
    state.playerDamagePerWrong = config?.playerDamagePerWrong || 20;

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
    dom.bossHealthText.textContent = `데이터 스핑크스 체력: ${state.bossHealth} / ${state.bossMaxHealth}`;
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
    dom.questionText.textContent = `[문제 ${index + 1}/${quizList.length}] ${currentQuiz.question}`;
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
      system.applyResolvedDamage(state.playerDamagePerWrong, { sourceId: "sphinx-timeout" });
      state.metrics.timeoutCount++;
    } else if (isCorrect) {
      dom.timerText.textContent = "정답입니다!";
      dom.timerText.style.color = "#0f0";
      state.bossHealth = Math.max(0, state.bossHealth - state.damagePerCorrect);
      state.metrics.correctCount++;
      updateBossUI();
    } else {
      dom.timerText.textContent = "오답입니다!";
      dom.timerText.style.color = "red";
      system.applyResolvedDamage(state.playerDamagePerWrong, { sourceId: "sphinx-wrong" });
      state.metrics.wrongCount++;
    }

    const playerSnapshot = system.getSnapshot();
    if (playerSnapshot.currentHealth <= 0) {
      setTimeout(() => endGame("FAIL", "PLAYER_DEAD"), 1000);
      return;
    }

    state.delayTimerMs = 2000;
  }

  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    state.currentAttemptId = attemptId;
    system.start(); 
    loadQuiz(0); 
  }

  function pause(reason) {
    state.isPaused = true;
    if (system) system.setControlLocked(true, "game-paused");
  }

  function resume() {
    state.isPaused = false;
    if (state.phase === "PLAYING" && system) {
      system.setControlLocked(false, "game-paused");
    }
  }

  function restart({ attemptId }) {
    console.log("데이터 스핑크스: restart, attemptId:", attemptId);
    
    state.currentAttemptId = attemptId;
    state.currentQuizIndex = 0;
    state.bossHealth = state.bossMaxHealth;
    state.timeRemainingMs = 0;
    state.delayTimerMs = 0;
    state.playerLocation = "NEUTRAL";
    state.phase = "INIT";
    state.isPaused = false;
    state.metrics = { correctCount: 0, wrongCount: 0, timeoutCount: 0 };
    
    if (system) {
      system.character.currentHealth = system.character.maxHealth;
      system.character.dead = false;
      system.character.setPosition(800, 360);
      
      system.setControlLocked(false, "quiz-end");
      system.setControlLocked(false, "game-paused");
      system.setControlLocked(false, "quiz-resolving");
    }

    loadQuiz(0); 
  }
  
  function destroy() {
    console.log("데이터 스핑크스: destroy");
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

  function update(deltaMs) {
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
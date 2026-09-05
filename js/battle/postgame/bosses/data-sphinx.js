import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "../../character/index.js"; // 공용 모듈 불러오기[cite: 6]

export function createDataSphinxBoss(context, battleState, account, mapConfig) {
  const quizList = [
    { id: 1, question: "이화여자대학교의 상징색은 '이화 그린'이다.", answer: "O" },
    { id: 2, question: "C++에서 동적 할당된 메모리를 해제하는 키워드는 delete이다.", answer: "O" },
    { id: 3, question: "ECC는 Ewha Campus Complex의 약자이다.", answer: "O" },
    { id: 4, question: "배열의 첫 번째 인덱스는 1부터 시작한다.", answer: "X" },
    { id: 5, question: "이화여대 후문 근처에는 공과대학 건물이 있다.", answer: "O" }
  ];

  let state = {
    currentQuizIndex: 0,
    timeLimitMs: 10000, // 문제당 10초 제한
    timeRemainingMs: 0,
    playerLocation: "NEUTRAL", 
    phase: "INIT" // INIT, PLAYING, RESOLVING, END
  };

  let system = null;

  async function init(config, { signal }) {
    console.log("데이터 스핑크스: init");

    const worldBounds = { x: 0, y: 0, width: 1600, height: 720 };
    
    // O/X 영역 정확히 반반(800px) 분할[cite: 6]
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

  // --- 🌟 새롭게 추가된 퀴즈 진행 로직 ---
  function loadQuiz(index) {
    if (index >= quizList.length) {
      console.log("모든 퀴즈 완료! 보스전 클리어!");
      state.phase = "END";
      return;
    }
    
    state.currentQuizIndex = index;
    state.timeRemainingMs = state.timeLimitMs;
    state.phase = "PLAYING";
    
    // 조작 잠금 해제 (다시 움직일 수 있게 함)[cite: 6]
    system.setControlLocked(false, "quiz-resolving"); 
    
    console.log(`\n=================================`);
    console.log(`[문제 ${index + 1}] ${quizList[index].question}`);
    console.log(`10초 안에 O 또는 X 구역으로 이동하세요!`);
    console.log(`=================================`);
  }

  function resolveQuiz() {
    state.phase = "RESOLVING";
    // 시간 초과 시 움직임 강제 정지[cite: 6]
    system.setControlLocked(true, "quiz-resolving"); 

    const currentQuiz = quizList[state.currentQuizIndex];
    const isCorrect = state.playerLocation === currentQuiz.answer;

    if (state.playerLocation === "NEUTRAL") {
      console.log(`❌ 시간 초과! (선택하지 않음, 정답: ${currentQuiz.answer})`);
      system.applyResolvedDamage(20, { sourceId: "sphinx-timeout" }); // 체력 20 차감[cite: 6]
    } else if (isCorrect) {
      console.log(`✅ 정답입니다! (선택: ${state.playerLocation})`);
      // TODO: 추후 보스 체력 차감 로직 추가
    } else {
      console.log(`❌ 오답입니다! (선택: ${state.playerLocation}, 정답: ${currentQuiz.answer})`);
      system.applyResolvedDamage(20, { sourceId: "sphinx-wrong" }); // 체력 20 차감[cite: 6]
    }

    // 2초 대기 후 다음 문제 출제
    setTimeout(() => {
      loadQuiz(state.currentQuizIndex + 1);
    }, 2000);
  }
  // ----------------------------------------

  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    system.start(); 
    loadQuiz(0); // 첫 번째 문제 시작
  }

  function pause(reason) {}
  function resume() {}
  function restart({ attemptId }) {}
  function destroy() {}

  // 게임 루프: 시간 깎기 로직 추가
  function update(deltaMs) {
    if (system) system.update(deltaMs);

    if (state.phase === "PLAYING") {
      state.timeRemainingMs -= deltaMs;
      
      if (state.timeRemainingMs <= 0) {
        state.timeRemainingMs = 0;
        resolveQuiz(); // 시간이 0이 되면 판정 시작
      }
    }
  }

  return { init, start, pause, resume, restart, destroy, update };
}
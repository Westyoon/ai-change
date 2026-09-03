import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "../../character/index.js"; // 공용 캐릭터 시스템[cite: 6]

export function createDataSphinxBoss(context, battleState, account, mapConfig) {
  // 1. 샘플 퀴즈 데이터 (총 5문제)
  const quizList = [
    { id: 1, question: "이화여자대학교의 상징색은 '이화 그린'이다.", answer: "O" },
    { id: 2, question: "C++에서 동적 할당된 메모리를 해제하는 키워드는 delete이다.", answer: "O" },
    { id: 3, question: "ECC는 Ewha Campus Complex의 약자이다.", answer: "O" },
    { id: 4, question: "배열의 첫 번째 인덱스는 1부터 시작한다.", answer: "X" },
    { id: 5, question: "이화여대 후문 근처에는 공과대학 건물이 있다.", answer: "O" }
  ];

  let state = {
    currentQuizIndex: 0,
    timeRemainingMs: 0,
    playerLocation: "NEUTRAL", // "O", "X", "NEUTRAL"
    isResolving: false
  };

  let system = null;

  // 2. 초기화 (맵, 트리거, 캐릭터 생성)[cite: 6]
  async function init(config, { signal }) {
    console.log("데이터 스핑크스: init");

    // 16:9 ~ 20:9 지원을 위한 넉넉한 맵 사이즈 설정[cite: 7]
    const worldBounds = { x: 0, y: 0, width: 1600, height: 720 };
    
    // O/X 판정 영역 (트리거) 설정[cite: 6]
    const triggers = [
      {
        id: "zone-o",
        kind: "QUIZ_ZONE", // 임의의 커스텀 종류
        bounds: { x: 0, y: 0, width: 600, height: 720 }, // 왼쪽 영역
        metadata: { zoneValue: "O" }
      },
      {
        id: "zone-x",
        kind: "QUIZ_ZONE",
        bounds: { x: 1000, y: 0, width: 600, height: 720 }, // 오른쪽 영역
        metadata: { zoneValue: "X" }
      }
      // 가운데 (600~1000)는 중립 구역
    ];

    // 캐릭터 시스템 초기화[cite: 6]
    system = new CharacterSystem({
      events: context.events,
      inputManager: context.input,
      character: {
        id: account?.id || "player-1",
        x: 800, // 정중앙 스폰
        y: 360,
        width: 34,
        height: 44,
        speed: 300, // 임시 이동 속도
        maxHealth: battleState?.maxHealth || 100,
        currentHealth: battleState?.currentHealth || 100,
        stats: {
          attack: account?.attack || 10,
          defense: account?.defense || 0,
          health: account?.hp || 100,
        },
        appearance: account?.appearance,
      },
      world: {
        bounds: worldBounds,
        colliders: [], // 장애물 없음
        triggers: triggers,
      },
    });

    // 트리거 접촉 이벤트 연결[cite: 6]
    context.events.on(CHARACTER_EVENTS.CONTACT, handleContact);
  }

  // 3. 트리거 접촉 처리 (현재 어느 구역에 있는지 추적)
  function handleContact(contact) {
    if (contact.kind === "QUIZ_ZONE") {
      if (contact.phase === "enter" || contact.phase === "stay") {
        state.playerLocation = contact.metadata.zoneValue;
      } else if (contact.phase === "exit") {
        state.playerLocation = "NEUTRAL";
      }
    }
  }

  // 4. 게임 시작
  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    system.start(); // 캐릭터 코어 가동[cite: 6]
    
    // 첫 번째 퀴즈 출제 시작 (로직은 다음 커밋에서 구체화)
    console.log(`문제 1: ${quizList[0].question}`);
  }

  function pause(reason) {
    // (임시 생략)
  }

  function resume() {
    // (임시 생략)
  }

  function restart({ attemptId }) {
    // (임시 생략)
  }

  function destroy() {
    console.log("데이터 스핑크스: destroy");
    // (임시 생략)
  }

  // 게임 루프 업데이트용 (상위 host에서 호출)[cite: 6]
  function update(deltaMs) {
    if (system) system.update(deltaMs);
  }

  return { init, start, pause, resume, restart, destroy, update };
}
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
    timeRemainingMs: 0,
    playerLocation: "NEUTRAL", 
    isResolving: false
  };

  let system = null;

  async function init(config, { signal }) {
    console.log("데이터 스핑크스: init");

    const worldBounds = { x: 0, y: 0, width: 1600, height: 720 };
    
    // O/X 영역 정확히 반반(800px) 분할[cite: 6]
    const triggers = [
      {
        id: "zone-o",
        kind: "QUIZ_ZONE",
        bounds: { x: 0, y: 0, width: 800, height: 720 }, // 0 ~ 800
        metadata: { zoneValue: "O" }
      },
      {
        id: "zone-x",
        kind: "QUIZ_ZONE",
        bounds: { x: 800, y: 0, width: 800, height: 720 }, // 800 ~ 1600
        metadata: { zoneValue: "X" }
      }
    ];

    system = new CharacterSystem({
      events: context.events,
      inputManager: context.input,
      character: {
        id: account?.id || "player-1",
        x: 800, 
        y: 360,
        width: 34,
        height: 44,
        speed: 500, // 테스트를 위해 이동 속도를 조금 올렸습니다.
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
        colliders: [], 
        triggers: triggers,
      },
    });

    context.events.on(CHARACTER_EVENTS.CONTACT, handleContact);
  }

  function handleContact(contact) {
    if (contact.kind === "QUIZ_ZONE") {
      if (contact.phase === "enter" || contact.phase === "stay") {
        state.playerLocation = contact.metadata.zoneValue;
      }
    }
  }

  function start({ attemptId }) {
    console.log("데이터 스핑크스: start, attemptId:", attemptId);
    system.start(); 
    console.log(`문제 1: ${quizList[0].question}`);
  }

  function pause(reason) {}
  function resume() {}
  function restart({ attemptId }) {}
  function destroy() {}

  function update(deltaMs) {
    if (system) system.update(deltaMs);
  }

  return { init, start, pause, resume, restart, destroy, update };
}
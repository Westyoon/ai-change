// battle.js
//
// 3단계: encounter.js(판정) + view.js(그림) + 공용 캐릭터 시스템(이동·입력)을
// 실제로 하나의 "전투"로 묶는 조립부.
//
// createBattle(context)는 사후게임_기획안.md 14.4에 정의된 Battle lifecycle 계약을
// 그대로 구현한다:
//   init(config, {signal}) / start({attemptId}) / pause(reason) / resume() /
//   restart({attemptId}) / destroy() / getState()
// onComplete(attemptId, candidate)는 정확히 한 번만 호출된다 (encounter.js가
// COMPLETED 전이 시 한 번만 부르도록 이미 보장하고 있음 - 2단계에서 확인됨).
//
// [지금 범위] registry.js / data/battles.json 등록(14.2절 "route·메뉴 연결")은
// 팀 공동 작업이라 여기 포함하지 않았다. 대신 dev/dev-harness.html에서 이 함수를
// 직접 불러서 브라우저로 바로 확인할 수 있다 (다른 미니게임들의 dev-harness.html과
// 같은 방식).
//
// createBattle(context)의 context는 다른 미니게임의 createMiniGame({...})과 같은
// 패턴이다: DOM/입출력 관련 host 자원(root/input/events)은 factory 시점에 받고,
// 실제 게임 데이터(players/arena 등)는 init(config)에서 받는다.
//   context.root        - 이 battle의 DOM을 붙일 부모 element
//   context.input       - 공용 InputManager 인스턴스
//   context.events      - 공용 EventBus 인스턴스 (캐릭터 이벤트 연결에 반드시 필요)
//   context.onComplete  - (attemptId, candidate) => void
//
// config.players는 아직 계정 시스템이 안 붙어 있어서 생략하면 임시 fixture
// 1명으로 시작한다. 나중에 계정 스탯이 연결되면 config.players를 그 값으로
// 채워서 넘기면 된다 (encounter.js는 이미 여러 명을 받을 수 있음 - 2단계 시나리오4).

import { GameLoop } from "../../../../core/game-loop.js";
import { CharacterSystem, VirtualJoystick, CHARACTER_EVENTS } from "../../../character/index.js";
import { StatBossEncounter } from "./encounter.js";
import { STATE } from "./state.js";
import { StatBossView } from "./view.js";

const DEFAULT_ARENA = Object.freeze({ width: 960, height: 600 });
// self-check.mjs가 검증한 좌표계(960x600, 7x5)와 반드시 같은 값을 써야 한다.
// view.js도 이 값을 그대로 받아서 격자를 그리기 때문에, 여기서만 바꾸면 화면도
// 판정도 같이 맞는다.

function defaultPlayers(arena) {
  // 계정 시스템이 아직 안 붙어 있을 때 쓰는 fixture. 격자 아래쪽 중앙에서 시작.
  //
  // 2026-09-06: "1레벨 = 각 스탯 1(화면에 ATK1/DEF1로 표시), 2레벨부터 포인트가
  // 붙으면서 그때부터 증가" 모델로 확정. stats.js 공식이 이제 "스탯 1 = 보너스 0"
  // 기준으로 바뀌어서, 여기 1/1/1을 넣어도 최대HP100/반격데미지10(순수 기본값)이
  // 그대로 나온다 - 화면 표시(ATK1/DEF1/HP100)와 실제 수치 계산이 둘 다 맞음.
  return [
    {
      id: "player-1",
      attackStat: 1,
      defenseStat: 1,
      healthStat: 1,
      position: { x: arena.width / 2, y: arena.height * 0.8 },
    },
  ];
}

export function createBattle({ root, input = null, events = null, onComplete = null } = {}) {
  if (!root) throw new Error("createBattle(context.root)가 필요합니다 (DOM을 붙일 부모 element).");
  if (!events) {
    // events 없이도 동작은 하지만, 캐릭터의 공격 명령(character:attack)을 받을
    // 방법이 없어져서 반격이 영원히 안 나간다 - 조용히 넘어가면 나중에 "공격을
    // 눌러도 반응이 없다"는 원인 파악하기 어려운 버그가 되므로 여기서 바로 알린다.
    throw new Error("createBattle(context.events)가 필요합니다 (공용 EventBus 인스턴스).");
  }

  let arena = DEFAULT_ARENA;
  let encounter = null;
  let view = null;
  let system = null;
  let joystick = null;
  let loop = null;
  let unsubscribeAttack = null;
  let destroyed = false;
  let localPlayerId = null;
  let lastConfig = null;
  let lastSignal = null;

  function handleEncounterEvent(event) {
    if (event.type === "dodge-result") view?.flashImpact(event.dangerCells);
    else if (event.type === "counter-hit") view?.flashCounter({ hit: true, damage: event.damage });
    else if (event.type === "counter-miss") view?.flashCounter({ hit: false });
    else if (event.type === "complete") loop?.pause(); // 승패가 갈리면 화면을 그 자리에서 멈춘다
  }

  /** 로컬 플레이어를 제외한 나머지(encounter가 알고 있는) 플레이어들을 view에 넘긴다.
   *  지금은 실제 멀티플레이 네트워킹이 없어서 config.players에 1명뿐이면 매번 빈
   *  배열이 되지만, 나중에 계정/파티 시스템이 여러 명을 채워주면 자동으로 동작한다. */
  function renderRemotePlayers() {
    const players = encounter.getSnapshot().players ?? {};
    const others = Object.values(players)
      .filter((p) => p.id !== localPlayerId)
      .map((p) => ({
        id: p.id,
        x: p.position?.x ?? 0,
        y: p.position?.y ?? 0,
        currentHealth: p.hp,
        maxHealth: p.maxHp,
      }));
    view.renderRemotePlayers(others);
  }

  function tick(deltaMs) {
    const characterSnapshot = system.update(deltaMs);
    // 캐릭터 시스템(픽셀 좌표) -> encounter(칸 판정)로 위치를 매 프레임 밀어준다.
    // "이동은 자유이동, 판정은 그 순간의 좌표만 본다"는 1단계 설계 그대로.
    encounter.setPlayerPosition(localPlayerId, characterSnapshot.x, characterSnapshot.y);
    encounter.tick(deltaMs);

    // encounter가 계산한 플레이어 HP(판정 결과)를 캐릭터 시스템에 "이미 계산된
    // 피해"로 그대로 전달한다. after-character-system.md: "보스가 피해량을 계산한
    // 다음 캐릭터에는 계산 완료된 값만 전달한다. defense 값을 캐릭터가 보관하더라도
    // applyResolvedDamage() 내부에서 방어 계산을 다시 하지 않는다." - 그래서
    // 방어력 반영은 encounter.js(calcIncomingDamage)에서 이미 끝난 값을 받는다.
    const playerState = encounter.getSnapshot().players?.[localPlayerId];
    if (playerState) {
      const alreadyShown = system.getSnapshot().currentHealth;
      const dropped = alreadyShown - playerState.hp;
      if (dropped > 0) system.applyResolvedDamage(dropped, { sourceId: "stat-boss-encounter" });
    }

    view.render(encounter.getSnapshot());
    view.renderPlayer(system.getSnapshot());
    renderRemotePlayers();
  }

  /** init()과 restart()가 공유하는 "DOM/시스템 준비" 부분. 실제 시작(encounter.start
   *  /loop.start)은 여기서 하지 않는다 - Battle lifecycle 계약상 init과 start는 별개. */
  function setup(config, { signal } = {}) {
    arena = config.arena ?? DEFAULT_ARENA;
    const players = config.players ?? defaultPlayers(arena);
    localPlayerId = players[0]?.id ?? "player-1";
    const localPlayer = players[0];

    view = new StatBossView({ arena, localPlayerId });
    view.mount(root);

    encounter = new StatBossEncounter({
      ...config,
      arena,
      players,
      onEvent: handleEncounterEvent,
      onComplete: (attemptId, candidate) => onComplete?.(attemptId, candidate),
    });
    encounter.init();
    const initialMaxHp = encounter.getSnapshot().players[localPlayerId].maxHp;

    system = new CharacterSystem({
      events,
      inputManager: input,
      character: {
        id: localPlayerId,
        x: localPlayer.position.x,
        y: localPlayer.position.y,
        width: 34,
        height: 44,
        speed: 180,
        maxHealth: initialMaxHp,
        currentHealth: initialMaxHp,
        appearance: { id: "placeholder", label: "YOU", color: "#78f0c1", accentColor: "#28c99a" },
      },
      // colliders/triggers 없음: 격자 바닥은 뻥 뚫린 평지라 장애물이 없다.
      world: { bounds: { x: 0, y: 0, width: arena.width, height: arena.height } },
    }).start();
    system.input.attachAttackButton(view.attackButton);

    joystick = new VirtualJoystick({
      element: view.joystickBase,
      knob: view.joystickKnob,
      onChange: (vector) => system?.setJoystickVector(vector),
    });

    // 공격 명령 -> STAGGER phase일 때만 반격으로 이어진다. TELEGRAPH 중에 눌러도
    // encounter.attemptCounter()가 알아서 무효 처리하니 여기선 phase를 안 가린다.
    unsubscribeAttack = events.on(
      CHARACTER_EVENTS.ATTACK,
      (detail) => {
        if (detail.characterId !== localPlayerId || destroyed) return;
        encounter.attemptCounter(localPlayerId);
      },
      { signal },
    );

    loop = new GameLoop({ update: tick, render: () => {} });
    view.render(encounter.getSnapshot());
    view.renderPlayer(system.getSnapshot());
    renderRemotePlayers();
  }

  function teardownRuntime() {
    // destroy()와 restart() 둘 다 쓰는 "지금 떠 있는 화면/시스템 정리".
    // system.destroy()가 내부적으로 CharacterInput.destroy()를 불러서 attachAttackButton()의
    // 리스너까지 같이 정리해주므로 별도로 버튼 cleanup을 들고 있을 필요는 없다.
    loop?.destroy();
    joystick?.destroy();
    unsubscribeAttack?.();
    system?.destroy();
    encounter?.destroy();
    view?.destroy();
    loop = null;
    joystick = null;
    system = null;
    encounter = null;
    view = null;
    unsubscribeAttack = null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    teardownRuntime();
  }

  return {
    async init(config = {}, { signal } = {}) {
      lastConfig = config;
      lastSignal = signal;
      setup(config, { signal });
      signal?.addEventListener("abort", destroy, { once: true });
    },

    start({ attemptId } = {}) {
      encounter.start({ attemptId });
      loop.start();
    },

    pause(_reason) {
      if (!encounter || encounter.state !== STATE.RUNNING) return false;
      encounter.pause();
      loop.pause();
      return true;
    },

    resume() {
      if (!encounter || encounter.state !== STATE.PAUSED) return false;
      encounter.resume();
      loop.resume();
      return true;
    },

    /** 재도전: 판정·캐릭터·화면을 전부 새로 만들어서(HP·위치 포함) 처음 상태로
     *  되돌린 다음 곧바로 시작한다. encounter.js의 restart()는 READY까지만 가므로
     *  여기서 이어서 start()까지 불러줘서, 밖에서 보기엔 "한 번의 재도전"이 되게 한다. */
    restart({ attemptId } = {}) {
      if (!lastConfig) return;
      destroyed = false;
      teardownRuntime();
      setup(lastConfig, { signal: lastSignal });
      encounter.start({ attemptId });
      loop.start();
    },

    destroy,

    getState() {
      return encounter?.getSnapshot() ?? null;
    },
  };
}

export default createBattle;

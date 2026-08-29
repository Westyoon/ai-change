import { GameLoop } from "../core/game-loop.js";
import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
  CharacterView,
  RemoteCharacterView,
  VirtualJoystick,
  createCharacterActorElement,
} from "../battle/character/index.js";
import { createButton, createElement } from "./scene-utils.js";

const WORLD_SIZE = Object.freeze({ width: 720, height: 400 });
const WORLD_BOUNDS = Object.freeze({ x: 10, y: 10, width: 700, height: 380 });

const SCENERY = Object.freeze([
  Object.freeze({
    id: "depth-object",
    label: "깊이·충돌 테스트",
    visual: Object.freeze({ x: 286, y: 112, width: 142, height: 142 }),
    collider: Object.freeze({ x: 286, y: 216, width: 142, height: 38 }),
    depthY: 254,
  }),
  Object.freeze({
    id: "solid-wall",
    label: "통과 불가",
    visual: Object.freeze({ x: 508, y: 84, width: 42, height: 142 }),
    collider: Object.freeze({ x: 508, y: 84, width: 42, height: 142 }),
    depthY: 226,
  }),
]);

const TRIGGERS = Object.freeze([
  Object.freeze({ id: "egg-hook", kind: CHARACTER_TRIGGER_KINDS.EGG, bounds: { x: 48, y: 54, width: 82, height: 58 }, metadata: { label: "X알 접점" } }),
  Object.freeze({ id: "minigame-hook", kind: CHARACTER_TRIGGER_KINDS.FIELD_MINIGAME, bounds: { x: 158, y: 54, width: 100, height: 58 }, metadata: { label: "미니게임 접점" } }),
  Object.freeze({ id: "battle-hook", kind: CHARACTER_TRIGGER_KINDS.BATTLE_ENTRANCE, bounds: { x: 604, y: 50, width: 74, height: 70 }, metadata: { label: "전투 입장 접점" } }),
  Object.freeze({ id: "safe-hook", kind: CHARACTER_TRIGGER_KINDS.SAFE_ZONE, bounds: { x: 46, y: 296, width: 110, height: 64 }, metadata: { label: "회피 구역 접점" } }),
  Object.freeze({ id: "trap-hook", kind: CHARACTER_TRIGGER_KINDS.TRAP, bounds: { x: 388, y: 310, width: 86, height: 48 }, metadata: { label: "함정 접점" } }),
  Object.freeze({ id: "attack-pad-hook", kind: CHARACTER_TRIGGER_KINDS.ATTACK_PAD, bounds: { x: 540, y: 304, width: 114, height: 58 }, metadata: { label: "공격 발판 접점" } }),
]);

function place(element, bounds, { depthY = null } = {}) {
  element.style.left = `${(bounds.x / WORLD_SIZE.width) * 100}%`;
  element.style.top = `${(bounds.y / WORLD_SIZE.height) * 100}%`;
  element.style.width = `${(bounds.width / WORLD_SIZE.width) * 100}%`;
  element.style.height = `${(bounds.height / WORLD_SIZE.height) * 100}%`;
  if (Number.isFinite(depthY)) element.style.zIndex = String(1000 + Math.round(depthY));
  return element;
}

function createWorldObject(definition) {
  const element = createElement("div", {
    className: "character-scenery",
    dataset: { objectId: definition.id },
  }, [createElement("span", { text: definition.label })]);
  return place(element, definition.visual, { depthY: definition.depthY });
}

function createTriggerMarker(trigger) {
  const element = createElement("div", {
    className: "character-trigger",
    dataset: { kind: trigger.kind, triggerId: trigger.id },
  }, [createElement("span", { text: trigger.metadata.label })]);
  return place(element, trigger.bounds);
}

function createDiagnosticRow(term, value = "-") {
  const dt = createElement("dt", { text: term });
  const dd = createElement("dd", { text: value });
  return { nodes: [dt, dd], value: dd };
}

export function createCharacterPreviewScene(context) {
  let loop = null;
  let system = null;
  let joystick = null;
  let remoteView = null;
  let mounted = false;
  let unsubscribeAccount = null;

  return {
    mount(root, _params, { signal }) {
      mounted = true;
      const scene = createElement("section", {
        className: "scene character-lab",
        attributes: { "aria-labelledby": "character-lab-title" },
      });
      const headerCopy = createElement("div", { className: "character-lab__copy" }, [
        createElement("p", { className: "eyebrow", text: "AFTER GAME · CHARACTER CORE" }),
        createElement("h2", { text: "캐릭터 시스템 연습장", attributes: { id: "character-lab-title" } }),
        createElement("p", {
          className: "muted character-lab__help",
          text: "WASD 이동 · Space 공격 명령 · 모바일은 왼쪽 조이스틱과 오른쪽 공격 버튼",
          attributes: { id: "character-lab-help" },
        }),
      ]);
      const menuButton = createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost");
      const header = createElement("header", { className: "character-lab__header" }, [
        headerCopy,
        createElement("div", { className: "button-row" }, [menuButton]),
      ]);

      const healthFill = createElement("span", { className: "character-health__fill" });
      const healthTrack = createElement("span", {
        className: "character-health__track",
        attributes: {
          role: "progressbar",
          "aria-label": "내 캐릭터 체력",
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": "100",
        },
      }, [healthFill]);
      const healthText = createElement("output", { className: "character-health__text", text: "100 / 100" });
      const stateText = createElement("output", {
        className: "character-state-badge",
        text: "대기 · 아래",
      });
      const hud = createElement("div", { className: "character-hud" }, [
        createElement("div", { className: "character-health" }, [
          createElement("strong", { text: "HP" }),
          healthTrack,
          healthText,
        ]),
        stateText,
      ]);

      const world = createElement("div", {
        className: "character-world",
        attributes: {
          role: "application",
          "aria-label": "캐릭터 이동과 접촉 연결을 검증하는 연습 영역",
          "aria-describedby": "character-lab-help",
        },
      });
      world.append(createElement("div", { className: "character-world__grid", attributes: { "aria-hidden": "true" } }));
      for (const trigger of TRIGGERS) world.append(createTriggerMarker(trigger));
      for (const object of SCENERY) world.append(createWorldObject(object));

      const localActor = createCharacterActorElement({ local: true });
      localActor.dataset.characterId = "local-preview";
      world.append(localActor);

      const joystickKnob = createElement("span", { className: "character-joystick__knob", attributes: { "aria-hidden": "true" } });
      const joystickBase = createElement("div", {
        className: "character-joystick",
        attributes: { role: "group", "aria-label": "이동 조이스틱" },
      }, [joystickKnob, createElement("span", { className: "character-joystick__label", text: "MOVE" })]);
      const attackButton = createElement("button", {
        className: "character-attack-button",
        text: "공격",
        type: "button",
        attributes: { "aria-label": "공격 명령" },
      });
      const touchControls = createElement("div", {
        className: "character-touch-controls",
        attributes: { "aria-label": "모바일 캐릭터 조작" },
      }, [joystickBase, attackButton]);
      const stage = createElement("section", {
        className: "character-stage",
        attributes: { "aria-label": "캐릭터 시스템 실행 화면" },
      }, [hud, world, touchControls]);

      const stateRow = createDiagnosticRow("상태", "대기");
      const directionRow = createDiagnosticRow("방향", "아래");
      const positionRow = createDiagnosticRow("위치", "206, 302");
      const contactRow = createDiagnosticRow("접촉", "없음");
      const statsRow = createDiagnosticRow("계정 원본 스탯", "로그인 상태 확인 중");
      const remoteRow = createDiagnosticRow("다른 캐릭터", "원격 snapshot 예시 1명");
      const diagnosticList = createElement("dl", { className: "character-diagnostics__list" }, [
        ...stateRow.nodes,
        ...directionRow.nodes,
        ...positionRow.nodes,
        ...contactRow.nodes,
        ...statsRow.nodes,
        ...remoteRow.nodes,
      ]);
      const damageButton = createButton("피격 API 테스트 · 10", () => {
        if (!system?.getSnapshot().dead) {
          system.applyResolvedDamage(10, { sourceId: "preview-fixture" });
        }
      }, "danger");
      const lockButton = createButton("조작 잠금", () => {
        const next = !system?.getSnapshot().controlLocked;
        system?.setControlLocked(next, "preview-overlay");
        lockButton.textContent = next ? "조작 재개" : "조작 잠금";
      }, "ghost");
      const eventLog = createElement("ol", {
        className: "character-event-log",
        attributes: { "aria-live": "polite", "aria-relevant": "additions" },
      });
      const diagnostics = createElement("aside", {
        className: "character-diagnostics",
        attributes: { "aria-label": "캐릭터 시스템 연동 상태" },
      }, [
        createElement("h3", { text: "연동 상태" }),
        diagnosticList,
        createElement("div", { className: "character-diagnostics__actions" }, [damageButton, lockButton]),
        createElement("p", {
          className: "muted character-diagnostics__note",
          text: "체력 100과 피격 10은 API 확인용 fixture입니다. 공격 범위·피해·방어 계산·쿨다운은 구현하지 않았습니다.",
        }),
        createElement("h3", { text: "이벤트" }),
        eventLog,
      ]);

      const layout = createElement("div", { className: "character-lab__layout" }, [stage, diagnostics]);
      scene.append(header, layout);
      root.append(scene);

      const appendEvent = (message, tone = "") => {
        if (!mounted) return;
        const item = createElement("li", {
          className: tone ? `character-event-log__item character-event-log__item--${tone}` : "character-event-log__item",
          text: message,
        });
        eventLog.prepend(item);
        while (eventLog.children.length > 6) eventLog.lastElementChild.remove();
      };

      system = new CharacterSystem({
        events: context.services.events,
        inputManager: context.services.input,
        character: {
          id: "local-preview",
          x: 206,
          y: 302,
          width: 34,
          height: 44,
          speed: 180,
          maxHealth: 100,
          currentHealth: 100,
          appearance: { id: "placeholder", label: "YOU", color: "#78f0c1", accentColor: "#28c99a" },
        },
        world: {
          bounds: WORLD_BOUNDS,
          colliders: SCENERY.map((object) => object.collider),
          triggers: TRIGGERS,
        },
      }).start();
      system.input.attachAttackButton(attackButton);
      unsubscribeAccount = context.services.account.subscribe((account) => {
        if (!mounted || !system) return;
        if (account.authenticated) {
          const { attack, hp, defense } = account.stats;
          system.setAccountStats({ attack, hp, defense });
          statsRow.value.textContent = `공격 ${attack} · HP ${hp} · 방어 ${defense}`;
          return;
        }
        statsRow.value.textContent = account.available
          ? "게스트 · 로그인 후 연동"
          : "게스트 · 계정 서버 연결 안 됨";
      });
      joystick = new VirtualJoystick({
        element: joystickBase,
        knob: joystickKnob,
        onChange: (vector) => system?.setJoystickVector(vector),
      });

      const view = new CharacterView({
        element: localActor,
        worldSize: WORLD_SIZE,
        healthTrack,
        healthFill,
        healthText,
        stateText,
      });
      remoteView = new RemoteCharacterView({ root: world, worldSize: WORLD_SIZE });
      remoteView.update([
        {
          id: "remote-preview",
          x: 626,
          y: 166,
          width: 34,
          height: 44,
          direction: "left",
          moving: false,
          attacking: false,
          currentHealth: 72,
          maxHealth: 100,
          dead: false,
          appearance: { id: "remote-placeholder", label: "REMOTE", color: "#bca7ff", accentColor: "#7867c7" },
        },
      ]);

      context.services.events.on(CHARACTER_EVENTS.ATTACK, (detail) => {
        if (detail.characterId !== "local-preview") return;
        appendEvent(`공격 명령 #${detail.attackSequence} 전달 · 바라봄 ${detail.facingDirection}`, "attack");
      }, { signal });
      context.services.events.on(CHARACTER_EVENTS.CONTACT, (detail) => {
        if (detail.characterId !== "local-preview" || detail.phase === CHARACTER_CONTACT_PHASES.STAY) return;
        const label = detail.metadata?.label ?? detail.kind;
        contactRow.value.textContent = detail.phase === CHARACTER_CONTACT_PHASES.ENTER ? label : "없음";
        appendEvent(`${label} ${detail.phase === CHARACTER_CONTACT_PHASES.ENTER ? "진입" : "이탈"}`);
      }, { signal });
      context.services.events.on(CHARACTER_EVENTS.DAMAGE, (detail) => {
        if (detail.characterId !== "local-preview") return;
        appendEvent(`피격 API 수신 · ${detail.previousHealth} → ${detail.currentHealth}`, "damage");
      }, { signal });
      context.services.events.on(CHARACTER_EVENTS.DEATH, (detail) => {
        if (detail.characterId !== "local-preview") return;
        damageButton.disabled = true;
        appendEvent("체력 0 · 사망 상태 전환", "damage");
      }, { signal });

      let latest = system.getSnapshot();
      const render = () => {
        view.render(latest);
        stateRow.value.textContent = latest.state;
        directionRow.value.textContent = latest.direction;
        positionRow.value.textContent = `${Math.round(latest.x)}, ${Math.round(latest.y)}`;
      };
      render();
      appendEvent("캐릭터 공용 시스템 준비 완료", "ready");

      loop = new GameLoop({
        update(deltaMs) {
          latest = system.update(deltaMs);
        },
        render,
      });
      loop.start();

      const handleVisibility = () => {
        if (document.hidden) loop?.pause();
        else loop?.resume();
      };
      document.addEventListener("visibilitychange", handleVisibility, { signal });
    },
    unmount() {
      mounted = false;
      loop?.destroy();
      loop = null;
      joystick?.destroy();
      joystick = null;
      remoteView?.destroy();
      remoteView = null;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      system?.destroy();
      system = null;
    },
  };
}

export default createCharacterPreviewScene;

import { FINAL_BATTLE_ID, getPublishedBattles, loadBattleModule } from "../battle/registry.js";
import {
  AFTERGAME_WORLD_LAYOUT,
  AFTERGAME_ZONE_IDS,
  FieldEncounterScheduler,
  chooseFieldEncounterSpawn,
  createAftergameNodeMap,
  scaleAftergameRect,
} from "../battle/node-map.js";
import {
  CHARACTER_CONTACT_PHASES,
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
  CharacterView,
  VirtualJoystick,
  createCharacterActorElement,
} from "../battle/character/index.js";
import { DEFAULT_PLAYER_APPEARANCE, createBattlePlayer } from "../battle/player-config.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { validateMiniGameCandidate } from "../core/config-validator.js";
import { GameLoop } from "../core/game-loop.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { rectsOverlap } from "../map/collision.js";
import { createResultOverlay } from "../ui/result-overlay.js";
import { createBattleComingSoonScene } from "./battle-coming-soon-scene.js";
import { createButton, createElement, createScene, showToast } from "./scene-utils.js";

const DEFAULT_ARENA = Object.freeze({ width: 960, height: 600 });
const FIELD_CHARACTER_ID = "aftergame-field-player";
const FIELD_CHARACTER_SIZE = Object.freeze({ width: 48, height: 60 });
const FIELD_MARKER_SIZE = Object.freeze({ width: 72, height: 84 });
const FALLBACK_FIELD_SIZE = Object.freeze({ width: 720, height: 420 });

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function measureFieldWorld(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = Number(rect?.width) || Number(element?.clientWidth) || FALLBACK_FIELD_SIZE.width;
  const height = Number(rect?.height) || Number(element?.clientHeight) || FALLBACK_FIELD_SIZE.height;
  return Object.freeze({ width: Math.max(1, width), height: Math.max(1, height) });
}

function placeFieldElement(element, bounds, worldSize) {
  element.style.left = `${(bounds.x / worldSize.width) * 100}%`;
  element.style.top = `${(bounds.y / worldSize.height) * 100}%`;
  element.style.width = `${(bounds.width / worldSize.width) * 100}%`;
  element.style.height = `${(bounds.height / worldSize.height) * 100}%`;
}

function attemptId(battleId) {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${battleId}:${suffix}`;
}

function publishedBattles(context) {
  if (context.config.features?.battleContent !== true) return [];
  return getPublishedBattles(context.content.battles);
}

function findBattle(context, battleId) {
  return publishedBattles(context).find((battle) => battle.id === battleId) ?? null;
}

function createBattleControls(controls) {
  const groups = [
    ["pc", "PC 조작"],
    ["mobile", "모바일 조작"],
  ].flatMap(([key, label]) => {
    const items = Array.isArray(controls?.[key])
      ? controls[key].filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];
    if (items.length === 0) return [];
    return [createElement("section", { className: `battle-controls__group battle-controls__group--${key}` }, [
      createElement("strong", { className: "battle-controls__label", text: label }),
      createElement("ul", { className: "battle-controls__list" },
        items.map((item) => createElement("li", { text: item }))),
    ])];
  });
  if (groups.length === 0) return null;
  return createElement("aside", {
    className: "battle-controls",
    attributes: { "aria-label": "배틀 조작 방법" },
  }, groups);
}

export function finalizeBattleCandidate({ battleId, id, durationMs, candidate }) {
  const validation = validateMiniGameCandidate(candidate);
  if (!validation.valid) {
    throw new Error(`BattleCandidateResult 오류: ${validation.errors.join(" / ")}`);
  }
  if (candidate.status !== "CLEAR" && candidate.status !== "FAIL") {
    throw new Error(`Battle module은 CLEAR 또는 FAIL candidate만 반환할 수 있습니다: ${candidate.status}`);
  }
  return Object.freeze({
    sessionId: id,
    battleId,
    status: candidate.status,
    score: candidate.score ?? null,
    durationMs: Math.max(0, durationMs),
    failureReason: candidate.failureReason ?? null,
    metrics: candidate.metrics ?? {},
    reward: null,
  });
}

export function getBattleReturnDestination(battle) {
  const returnsToPreGameMap = battle?.id === FINAL_BATTLE_ID;
  return Object.freeze({
    sceneId: returnsToPreGameMap ? "map" : "battle",
    label: returnsToPreGameMap ? "사전게임 맵으로" : "구역 맵으로",
  });
}

function createBattleEntryScene(context, { notice = null } = {}) {
  let loop = null;
  let system = null;
  let view = null;
  let joystick = null;
  let scheduler = null;
  let resizeObserver = null;
  let unsubscribeResize = null;
  let markerElement = null;
  let mounted = false;

  return {
    async mount(root, _params, { signal }) {
      const service = context.services.account;
      if (["idle", "loading"].includes(service.getState().status)) {
        await service.refreshSession();
      }
      if (signal.aborted) return;

      const definitions = publishedBattles(context);
      const saveState = context.services.save?.getState?.() ?? {};
      const accountState = service.getState();
      const nodeMap = createAftergameNodeMap(definitions);
      const unlockFor = (battle) => getBattleUnlockStatus(battle, saveState, accountState);
      const fieldUnlock = unlockFor(nodeMap.field.battle);
      const bossRoomByBattleId = new Map(
        nodeMap.bossRooms.map((room) => [room.battle.id, room]),
      );
      const validZoneIds = new Set(Object.values(AFTERGAME_ZONE_IDS));
      const savedWorldState = context.state?.aftergameWorldState;
      let activeZoneId = validZoneIds.has(savedWorldState?.zoneId)
        ? savedWorldState.zoneId
        : nodeMap.initialZoneId;
      let navigationStarted = false;
      let pendingContactAction = null;
      let activeEncounter = null;
      let worldSize = FALLBACK_FIELD_SIZE;
      let latestSnapshot = null;

      const scene = createScene({
        className: "scene--panel battle-entry battle-node-map-scene",
        eyebrow: "AFTER GAME · WALKABLE WORLD",
        title: "사후게임 월드",
        description: "캐릭터로 필드와 중심 광장을 오가고, 광장 위쪽의 세 문으로 각 보스맵에 입장하세요.",
      });
      if (notice) {
        scene.append(createElement("p", {
          className: "battle-notice",
          text: notice,
          attributes: { role: "status" },
        }));
      }

      const zoneKicker = createElement("span", {
        className: "aftergame-world__zone-kicker",
      });
      const zoneTitle = createElement("h2", {
        className: "aftergame-world__zone-title",
        attributes: { id: "aftergame-world-title" },
      });
      const zoneBadge = createElement("span", {
        className: "aftergame-world__zone-badge",
      });
      const zoneHelp = createElement("p", {
        className: "aftergame-world__help",
        attributes: { id: "aftergame-world-help" },
      });
      const worldStatus = createElement("p", {
        className: "battle-field-status aftergame-world__status",
        attributes: { role: "status", "aria-live": "polite" },
        dataset: { active: "false" },
      });

      const worldElement = createElement("div", {
        className: "character-world battle-field-world aftergame-world",
        attributes: {
          role: "application",
          tabindex: "0",
          "aria-labelledby": "aftergame-world-title",
          "aria-describedby": "aftergame-world-help",
        },
        dataset: {
          unlocked: String(fieldUnlock.unlocked),
          zoneId: activeZoneId,
        },
      }, [
        createElement("div", {
          className: "character-world__grid battle-field-world__grid",
          attributes: { "aria-hidden": "true" },
        }),
      ]);

      const positionNormalizedElement = (element, bounds) => {
        element.style.left = String(bounds.x * 100) + "%";
        element.style.top = String(bounds.y * 100) + "%";
        element.style.width = String(bounds.width * 100) + "%";
        element.style.height = String(bounds.height * 100) + "%";
      };

      const fieldScenery = createElement("div", {
        className: "aftergame-world__zone aftergame-world__zone--field",
        dataset: { zoneId: AFTERGAME_ZONE_IDS.FIELD },
        attributes: { "aria-hidden": "true" },
      }, [
        createElement("span", { className: "aftergame-world__field-sign", text: "입장 필드" }),
        createElement("span", { className: "aftergame-world__field-path", attributes: { "aria-hidden": "true" } }),
        createElement("span", { className: "aftergame-world__field-spark aftergame-world__field-spark--one", attributes: { "aria-hidden": "true" } }),
        createElement("span", { className: "aftergame-world__field-spark aftergame-world__field-spark--two", attributes: { "aria-hidden": "true" } }),
        createElement("span", { className: "aftergame-world__field-spark aftergame-world__field-spark--three", attributes: { "aria-hidden": "true" } }),
      ]);
      const fieldExit = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.FIELD].exits[0];
      const fieldExitButton = createElement("button", {
        className: "aftergame-world__edge-gate aftergame-world__edge-gate--west",
        type: "button",
        disabled: !fieldUnlock.unlocked,
        attributes: { "aria-label": "왼쪽 출구로 중심 광장 이동" },
        dataset: {
          triggerId: fieldExit.id,
          targetZoneId: fieldExit.targetZoneId,
        },
      }, [
        createElement("span", { text: "◀" }),
        createElement("strong", { text: "광장" }),
      ]);
      positionNormalizedElement(fieldExitButton, fieldExit.bounds);
      fieldScenery.append(fieldExitButton);

      const plazaScenery = createElement("div", {
        className: "aftergame-world__zone aftergame-world__zone--plaza",
        dataset: { zoneId: AFTERGAME_ZONE_IDS.PLAZA },
        attributes: { "aria-hidden": "true" },
      }, [
        createElement("span", {
          className: "aftergame-world__plaza-emblem",
          text: "PLAZA",
          attributes: { "aria-hidden": "true" },
        }),
        createElement("span", {
          className: "aftergame-world__plaza-path aftergame-world__plaza-path--north",
          attributes: { "aria-hidden": "true" },
        }),
        createElement("span", {
          className: "aftergame-world__plaza-path aftergame-world__plaza-path--east",
          attributes: { "aria-hidden": "true" },
        }),
      ]);
      const plazaExit = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].exits[0];
      const plazaExitButton = createElement("button", {
        className: "aftergame-world__edge-gate aftergame-world__edge-gate--east",
        type: "button",
        disabled: !fieldUnlock.unlocked,
        attributes: { "aria-label": "오른쪽 출구로 입장 필드 이동" },
        dataset: {
          triggerId: plazaExit.id,
          targetZoneId: plazaExit.targetZoneId,
        },
      }, [
        createElement("strong", { text: "필드" }),
        createElement("span", { text: "▶" }),
      ]);
      positionNormalizedElement(plazaExitButton, plazaExit.bounds);
      plazaScenery.append(plazaExitButton);

      const bossDoorElements = new Map();
      for (const door of AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].bossDoors) {
        const room = bossRoomByBattleId.get(door.battleId);
        if (!room) continue;
        const unlock = unlockFor(room.battle);
        const doorButton = createElement("button", {
          className: "aftergame-world__boss-door",
          type: "button",
          disabled: !unlock.unlocked,
          attributes: {
            "aria-label": room.battle.title + (unlock.unlocked ? " 보스맵 입장" : " 잠김"),
          },
          dataset: {
            triggerId: door.id,
            battleId: room.battle.id,
            unlocked: String(unlock.unlocked),
          },
        }, [
          createElement("span", { className: "aftergame-world__boss-door-type", text: "BOSS ROOM" }),
          createElement("strong", { className: "aftergame-world__boss-door-title", text: room.battle.title }),
          createElement("span", {
            className: "aftergame-world__boss-door-arrow",
            text: unlock.unlocked ? "▲ 입장" : "잠김",
          }),
        ]);
        positionNormalizedElement(doorButton, door.bounds);
        bossDoorElements.set(door.battleId, doorButton);
        plazaScenery.append(doorButton);
      }

      const localActor = createCharacterActorElement({ local: true });
      localActor.dataset.characterId = FIELD_CHARACTER_ID;
      worldElement.append(fieldScenery, plazaScenery, localActor);

      const joystickKnob = createElement("span", {
        className: "character-joystick__knob",
        attributes: { "aria-hidden": "true" },
      });
      const joystickBase = createElement("div", {
        className: "character-joystick battle-field-joystick",
        attributes: {
          role: "group",
          "aria-label": "사후게임 월드 이동 조이스틱",
          "aria-disabled": String(!fieldUnlock.unlocked),
        },
      }, [
        joystickKnob,
        createElement("span", { className: "character-joystick__label", text: "MOVE" }),
      ]);
      const touchControls = createElement("div", {
        className: "character-touch-controls battle-field-touch-controls",
        attributes: { "aria-label": "모바일 월드 조작" },
      }, [joystickBase]);
      const worldStage = createElement("div", {
        className: "character-stage battle-field-stage aftergame-world-stage",
      }, [worldElement, touchControls]);

      const worldShell = createElement("section", {
        className: "battle-node-map aftergame-world-shell",
        attributes: { "aria-labelledby": "aftergame-world-title" },
        dataset: { zoneId: activeZoneId, encounterActive: "false" },
      }, [
        createElement("header", { className: "aftergame-world__header" }, [
          createElement("div", { className: "aftergame-world__heading" }, [zoneKicker, zoneTitle]),
          zoneBadge,
        ]),
        zoneHelp,
        worldStage,
        worldStatus,
        createElement("div", { className: "aftergame-world__actions" }, [
          createButton("Story 맵", () => enterRoute({ sceneId: "map", params: {} }), "ghost"),
          createButton("메뉴", () => enterRoute({ sceneId: "main-menu", params: {} }), "ghost"),
        ]),
      ]);

      const nodeBattles = [
        ...nodeMap.bossRooms.map((room) => room.battle),
        nodeMap.field.battle,
      ];
      const locked = nodeBattles.map((battle) => unlockFor(battle)).find((unlock) => !unlock.unlocked);
      if (locked) {
        const missingTitles = locked.missingMiniGameIds
          .map((id) => context.content.minigames.find((game) => game.id === id)?.title ?? id);
        scene.append(createElement("p", {
          className: "battle-progress",
          text: "남은 사전게임: " + missingTitles.join(" · "),
        }));
      }

      const sourceText = accountState.authenticated
        ? "로그인 계정의 고유 클리어 기록과 이 브라우저의 로컬 기록을 함께 확인했습니다."
        : "현재 브라우저의 로컬 클리어 기록을 기준으로 확인했습니다.";
      scene.append(
        worldShell,
        createElement("p", { className: "muted battle-unlock-source", text: sourceText }),
      );
      root.append(scene);

      mounted = true;
      worldSize = measureFieldWorld(worldElement);

      const normalizePoint = (point, fallback) => ({
        x: Number.isFinite(point?.x) ? clamp(point.x, 0, 1) : fallback.x,
        y: Number.isFinite(point?.y) ? clamp(point.y, 0, 1) : fallback.y,
        direction: typeof point?.direction === "string"
          ? point.direction
          : typeof savedWorldState?.direction === "string"
            ? savedWorldState.direction
            : fallback.direction,
      });
      const getInitialSpawn = () => {
        const fallback = AFTERGAME_WORLD_LAYOUT[activeZoneId].defaultSpawn;
        const savedPosition = savedWorldState?.positions?.[activeZoneId]
          ?? (savedWorldState?.zoneId === activeZoneId ? savedWorldState.position : null)
          ?? (activeZoneId === AFTERGAME_ZONE_IDS.FIELD
            ? context.state?.aftergameFieldPosition
            : null);
        return normalizePoint(savedPosition, fallback);
      };
      const spawnToTopLeft = (spawn) => ({
        x: clamp(
          spawn.x * worldSize.width - FIELD_CHARACTER_SIZE.width / 2,
          0,
          Math.max(0, worldSize.width - FIELD_CHARACTER_SIZE.width),
        ),
        y: clamp(
          spawn.y * worldSize.height - FIELD_CHARACTER_SIZE.height / 2,
          0,
          Math.max(0, worldSize.height - FIELD_CHARACTER_SIZE.height),
        ),
      });
      const initialSpawn = getInitialSpawn();
      const initialPosition = spawnToTopLeft(initialSpawn);

      const rememberWorldState = ({
        zoneId = activeZoneId,
        position = null,
        direction = null,
      } = {}) => {
        const snapshot = system?.getSnapshot?.() ?? latestSnapshot;
        if (!snapshot || !context.state) return null;
        const normalizedPosition = Object.freeze(position
          ? {
              x: clamp(position.x, 0, 1),
              y: clamp(position.y, 0, 1),
            }
          : {
              x: clamp((snapshot.x + snapshot.width / 2) / worldSize.width, 0, 1),
              y: clamp((snapshot.y + snapshot.height / 2) / worldSize.height, 0, 1),
            });
        const positions = {
          ...(context.state.aftergameWorldState?.positions ?? {}),
          [zoneId]: normalizedPosition,
        };
        const nextState = Object.freeze({
          zoneId,
          position: normalizedPosition,
          positions: Object.freeze(positions),
          direction: direction ?? snapshot.direction,
        });
        context.state.aftergameWorldState = nextState;
        if (zoneId === AFTERGAME_ZONE_IDS.FIELD) {
          context.state.aftergameFieldPosition = normalizedPosition;
        }
        return nextState;
      };

      const createZoneWorld = () => {
        const triggers = [];
        const layout = AFTERGAME_WORLD_LAYOUT[activeZoneId];
        for (const exit of layout.exits) {
          triggers.push({
            id: exit.id,
            kind: CHARACTER_TRIGGER_KINDS.ZONE_EXIT,
            bounds: scaleAftergameRect(exit.bounds, worldSize),
            metadata: {
              sourceZoneId: activeZoneId,
              targetZoneId: exit.targetZoneId,
              targetSpawn: exit.targetSpawn,
            },
          });
        }
        if (activeZoneId === AFTERGAME_ZONE_IDS.PLAZA) {
          for (const door of layout.bossDoors) {
            triggers.push({
              id: door.id,
              kind: CHARACTER_TRIGGER_KINDS.BATTLE_ENTRANCE,
              bounds: scaleAftergameRect(door.bounds, worldSize),
              metadata: {
                sourceZoneId: activeZoneId,
                battleId: door.battleId,
                returnSpawn: door.returnSpawn,
              },
            });
          }
        }
        if (activeZoneId === AFTERGAME_ZONE_IDS.FIELD && activeEncounter) {
          triggers.push({
            id: "field-random-encounter",
            kind: CHARACTER_TRIGGER_KINDS.FIELD_MINIGAME,
            bounds: activeEncounter,
            metadata: { battleId: nodeMap.field.battle.id },
          });
        }
        return {
          bounds: { x: 0, y: 0, width: worldSize.width, height: worldSize.height },
          colliders: [],
          triggers,
        };
      };

      const clearEncounter = ({ resetScheduler = true } = {}) => {
        markerElement?.remove();
        markerElement = null;
        activeEncounter = null;
        worldShell.dataset.encounterActive = "false";
        if (resetScheduler) scheduler?.reset();
      };

      const setBaseStatus = () => {
        worldStatus.dataset.active = "false";
        if (!fieldUnlock.unlocked) {
          worldStatus.textContent = "사전게임 5종을 모두 완료하면 사후게임 월드를 이동할 수 있습니다.";
          return;
        }
        worldStatus.textContent = activeZoneId === AFTERGAME_ZONE_IDS.FIELD
          ? "왼쪽 출구는 중심 광장으로 이어집니다. 걷는 동안 X알 미니게임이 랜덤으로 출현합니다."
          : "위쪽 세 문은 각각 독립된 보스맵입니다. 오른쪽 출구는 입장 필드로 이어집니다.";
      };

      const applyZonePresentation = () => {
        const inField = activeZoneId === AFTERGAME_ZONE_IDS.FIELD;
        fieldScenery.hidden = !inField;
        plazaScenery.hidden = inField;
        fieldScenery.setAttribute("aria-hidden", String(!inField));
        plazaScenery.setAttribute("aria-hidden", String(inField));
        worldElement.dataset.zoneId = activeZoneId;
        worldShell.dataset.zoneId = activeZoneId;
        zoneKicker.textContent = inField ? "ENTRY · RANDOM FIELD" : "CENTRAL · PLAZA";
        zoneTitle.textContent = inField ? "미니게임 입장 필드" : "중심 광장";
        zoneBadge.textContent = inField ? "ROAMING" : "3 BOSS GATES";
        zoneHelp.textContent = inField
          ? "PC는 WASD·방향키, 모바일은 아래 조이스틱으로 이동하세요. 왼쪽 끝으로 가면 광장으로 넘어갑니다."
          : "위쪽의 세 문 중 원하는 문으로 걸어가세요. 오른쪽 끝으로 가면 입장 필드로 넘어갑니다.";
        worldElement.setAttribute(
          "aria-label",
          inField
            ? "캐릭터로 이동하는 사후게임 입장 필드"
            : "캐릭터로 이동하며 세 보스맵을 선택하는 중심 광장",
        );
        setBaseStatus();
      };

      const enterRoute = (route, {
        encounter = false,
        returnSpawn = null,
      } = {}) => {
        if (navigationStarted) return false;
        navigationStarted = true;
        if (returnSpawn) {
          rememberWorldState({
            zoneId: activeZoneId,
            position: returnSpawn,
            direction: returnSpawn.direction,
          });
        } else {
          rememberWorldState();
        }
        system?.setControlLocked(
          true,
          encounter ? "field-random-encounter" : "aftergame-navigation",
        );
        if (encounter) {
          worldStatus.textContent = "랜덤 미니게임에 입장합니다.";
          worldStatus.dataset.active = "true";
        }
        loop?.pause();
        void context.router.navigate(route.sceneId, route.params);
        return true;
      };

      const switchZone = (targetZoneId, targetSpawn) => {
        if (navigationStarted || !validZoneIds.has(targetZoneId) || targetZoneId === activeZoneId) {
          return false;
        }
        rememberWorldState();
        const leavingField = activeZoneId === AFTERGAME_ZONE_IDS.FIELD;
        if (leavingField) clearEncounter();
        activeZoneId = targetZoneId;
        pendingContactAction = null;
        const fallback = AFTERGAME_WORLD_LAYOUT[targetZoneId].defaultSpawn;
        const spawn = normalizePoint(targetSpawn, fallback);
        const position = spawnToTopLeft(spawn);
        system.character.direction = spawn.direction;
        latestSnapshot = system.character.setPosition(position.x, position.y);
        system.setWorld(createZoneWorld());
        applyZonePresentation();
        view.render(latestSnapshot);
        rememberWorldState();
        worldElement.focus?.({ preventScroll: true });
        return true;
      };

      const enterBossRoom = (battleId, returnSpawn = null) => {
        if (activeZoneId !== AFTERGAME_ZONE_IDS.PLAZA || navigationStarted) return false;
        const room = bossRoomByBattleId.get(battleId);
        if (!room) return false;
        const unlock = unlockFor(room.battle);
        if (!unlock.unlocked) {
          worldStatus.textContent = "아직 잠긴 보스맵입니다. 사전게임 진행을 먼저 완료해 주세요.";
          worldStatus.dataset.active = "true";
          return false;
        }
        const door = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].bossDoors
          .find((candidate) => candidate.battleId === battleId);
        return enterRoute(room.route, {
          returnSpawn: returnSpawn ?? door?.returnSpawn ?? null,
        });
      };

      fieldExitButton.addEventListener("click", () => {
        switchZone(fieldExit.targetZoneId, fieldExit.targetSpawn);
      });
      plazaExitButton.addEventListener("click", () => {
        switchZone(plazaExit.targetZoneId, plazaExit.targetSpawn);
      });
      for (const [battleId, button] of bossDoorElements) {
        button.addEventListener("click", () => enterBossRoom(battleId));
      }

      system = new CharacterSystem({
        events: context.services.events,
        inputManager: context.services.input,
        character: {
          id: FIELD_CHARACTER_ID,
          x: initialPosition.x,
          y: initialPosition.y,
          width: FIELD_CHARACTER_SIZE.width,
          height: FIELD_CHARACTER_SIZE.height,
          speed: 180,
          direction: initialSpawn.direction,
          maxHealth: 1,
          currentHealth: 1,
          appearance: DEFAULT_PLAYER_APPEARANCE,
        },
        world: createZoneWorld(),
      }).start();
      if (!fieldUnlock.unlocked) system.setControlLocked(true, "aftergame-world-locked");

      view = new CharacterView({ element: localActor, worldSize });
      latestSnapshot = system.getSnapshot();
      view.render(latestSnapshot);
      scheduler = new FieldEncounterScheduler();
      joystick = new VirtualJoystick({
        element: joystickBase,
        knob: joystickKnob,
        onChange: (vector) => system?.setJoystickVector(vector),
      });
      applyZonePresentation();
      rememberWorldState();

      const enterFieldEncounter = () => {
        if (
          activeZoneId !== AFTERGAME_ZONE_IDS.FIELD
          || !fieldUnlock.unlocked
          || !activeEncounter
        ) {
          return false;
        }
        return enterRoute(nodeMap.field.route, { encounter: true });
      };
      const spawnEncounter = () => {
        if (activeZoneId !== AFTERGAME_ZONE_IDS.FIELD || activeEncounter || navigationStarted) {
          return false;
        }
        const spawn = chooseFieldEncounterSpawn({
          worldSize,
          player: latestSnapshot,
          markerSize: FIELD_MARKER_SIZE,
        });
        if (rectsOverlap(latestSnapshot, spawn)) {
          scheduler.reset();
          return false;
        }
        activeEncounter = { ...spawn };
        markerElement = createElement("button", {
          className: "battle-field-encounter",
          type: "button",
          dataset: {
            nodeType: "encounter",
            spawnPoint: spawn.id,
            battleId: nodeMap.field.battle.id,
          },
          attributes: { "aria-label": "랜덤 미니게임 발견 · 입장" },
          on: { click: enterFieldEncounter },
        }, [
          createElement("span", {
            className: "battle-field-encounter__egg",
            text: "X",
            attributes: { "aria-hidden": "true" },
          }),
          createElement("strong", {
            className: "battle-field-encounter__label",
            text: "랜덤 미니게임",
          }),
        ]);
        placeFieldElement(markerElement, activeEncounter, worldSize);
        worldElement.append(markerElement);
        worldShell.dataset.encounterActive = "true";
        worldStatus.textContent = "X알 미니게임이 출현했습니다. 가까이 가거나 X알을 눌러 입장하세요.";
        worldStatus.dataset.active = "true";
        system.setWorld(createZoneWorld());
        return true;
      };

      context.services.events.on(CHARACTER_EVENTS.CONTACT, (detail) => {
        if (
          detail.characterId !== FIELD_CHARACTER_ID
          || detail.phase !== CHARACTER_CONTACT_PHASES.ENTER
          || navigationStarted
          || pendingContactAction
        ) {
          return;
        }
        if (detail.kind === CHARACTER_TRIGGER_KINDS.ZONE_EXIT) {
          pendingContactAction = {
            type: "zone",
            sourceZoneId: detail.metadata?.sourceZoneId,
            targetZoneId: detail.metadata?.targetZoneId,
            targetSpawn: detail.metadata?.targetSpawn,
          };
        } else if (detail.kind === CHARACTER_TRIGGER_KINDS.BATTLE_ENTRANCE) {
          pendingContactAction = {
            type: "boss",
            sourceZoneId: detail.metadata?.sourceZoneId,
            battleId: detail.metadata?.battleId,
            returnSpawn: detail.metadata?.returnSpawn,
          };
        } else if (detail.kind === CHARACTER_TRIGGER_KINDS.FIELD_MINIGAME) {
          pendingContactAction = { type: "encounter", sourceZoneId: activeZoneId };
        }
      }, { signal });

      loop = new GameLoop({
        update(deltaMs) {
          const previous = latestSnapshot;
          latestSnapshot = system.update(deltaMs);

          if (pendingContactAction && !navigationStarted) {
            const action = pendingContactAction;
            pendingContactAction = null;
            if (action.sourceZoneId === activeZoneId) {
              if (action.type === "zone") {
                if (switchZone(action.targetZoneId, action.targetSpawn)) return;
              } else if (action.type === "boss") {
                if (enterBossRoom(action.battleId, action.returnSpawn)) return;
              } else if (action.type === "encounter") {
                if (enterFieldEncounter()) return;
              }
            }
          }

          if (
            activeZoneId === AFTERGAME_ZONE_IDS.FIELD
            && !activeEncounter
            && scheduler.observe(previous, latestSnapshot, {
              eligible: fieldUnlock.unlocked && !navigationStarted,
            })
          ) {
            spawnEncounter();
          }
          if (
            activeZoneId === AFTERGAME_ZONE_IDS.FIELD
            && activeEncounter
            && !navigationStarted
            && rectsOverlap(latestSnapshot, activeEncounter)
          ) {
            enterFieldEncounter();
          }
        },
        render() {
          view.render(latestSnapshot);
        },
      });
      loop.start();

      const resizeWorld = () => {
        if (!mounted || !system || !view) return;
        const nextSize = measureFieldWorld(worldElement);
        if (nextSize.width === worldSize.width && nextSize.height === worldSize.height) return;

        const previousSize = worldSize;
        const snapshot = system.getSnapshot();
        const centerRatioX = (snapshot.x + snapshot.width / 2) / previousSize.width;
        const centerRatioY = (snapshot.y + snapshot.height / 2) / previousSize.height;
        const nextX = clamp(
          centerRatioX * nextSize.width - snapshot.width / 2,
          0,
          Math.max(0, nextSize.width - snapshot.width),
        );
        const nextY = clamp(
          centerRatioY * nextSize.height - snapshot.height / 2,
          0,
          Math.max(0, nextSize.height - snapshot.height),
        );

        if (activeEncounter) {
          const markerCenterRatioX = (activeEncounter.x + activeEncounter.width / 2) / previousSize.width;
          const markerCenterRatioY = (activeEncounter.y + activeEncounter.height / 2) / previousSize.height;
          const width = Math.min(FIELD_MARKER_SIZE.width, nextSize.width);
          const height = Math.min(FIELD_MARKER_SIZE.height, nextSize.height);
          activeEncounter = {
            ...activeEncounter,
            x: clamp(markerCenterRatioX * nextSize.width - width / 2, 0, Math.max(0, nextSize.width - width)),
            y: clamp(markerCenterRatioY * nextSize.height - height / 2, 0, Math.max(0, nextSize.height - height)),
            width,
            height,
          };
        }

        worldSize = nextSize;
        latestSnapshot = system.character.setPosition(nextX, nextY);
        view.worldSize = { ...worldSize };
        system.setWorld(createZoneWorld());
        if (markerElement && activeEncounter) {
          placeFieldElement(markerElement, activeEncounter, worldSize);
        }
        view.render(latestSnapshot);
        rememberWorldState();
      };

      const documentRef = worldElement.ownerDocument ?? globalThis.document;
      const windowRef = documentRef?.defaultView ?? globalThis.window;
      const ResizeObserverClass = windowRef?.ResizeObserver ?? globalThis.ResizeObserver;
      if (typeof ResizeObserverClass === "function") {
        resizeObserver = new ResizeObserverClass(resizeWorld);
        resizeObserver.observe(worldElement);
      } else if (typeof windowRef?.addEventListener === "function") {
        windowRef.addEventListener("resize", resizeWorld);
        unsubscribeResize = () => windowRef.removeEventListener("resize", resizeWorld);
      }

      const handleVisibility = () => {
        if (documentRef?.hidden) loop?.pause();
        else if (!navigationStarted) loop?.resume();
      };
      documentRef?.addEventListener?.("visibilitychange", handleVisibility, { signal });
      if (documentRef?.hidden) loop.pause();
    },

    unmount() {
      mounted = false;
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      unsubscribeResize?.();
      unsubscribeResize = null;
      loop?.destroy();
      loop = null;
      joystick?.destroy();
      joystick = null;
      scheduler?.destroy();
      scheduler = null;
      system?.destroy();
      system = null;
      markerElement = null;
      view = null;
    },
  };
}

function createBattlePlayScene(context, battle) {
  let instance = null;
  let assetLease = null;
  let overlay = null;
  let currentAttemptId = null;
  let startedAt = null;
  let pauseStartedAt = null;
  let accumulatedPauseMs = 0;
  let terminal = false;
  let destroyed = false;
  let unsubscribeInput = null;
  let unsubscribeVisibility = null;
  const pauseReasons = new Set();
  const returnDestination = getBattleReturnDestination(battle);

  return {
    async mount(root, _params, { signal }) {
      const accountService = context.services.account;
      if (["idle", "loading"].includes(accountService.getState().status)) {
        await accountService.refreshSession();
      }
      if (signal.aborted) return;

      const unlock = getBattleUnlockStatus(
        battle,
        context.services.save?.getState?.() ?? {},
        accountService.getState(),
      );
      if (!unlock.unlocked) throw new Error("아직 배틀 해금 조건을 충족하지 않았습니다.");

      assetLease = context.services.assets.acquireGroup
        ? await context.services.assets.acquireGroup(battle.assetGroup, { signal })
        : null;
      if (!assetLease) await context.services.assets.loadGroup(battle.assetGroup, { signal });
      if (signal.aborted) return;

      const config = context.services.assets.get(battle.configAssetId);
      const arena = config?.arena ?? DEFAULT_ARENA;

      const frame = createElement("section", { className: "scene minigame-frame battle-frame" });
      const title = createElement("strong", { text: `BATTLE · ${battle.title}` });
      let pauseButton;
      const activeDurationMs = () => {
        if (startedAt === null) return 0;
        const currentPauseMs = pauseStartedAt === null
          ? 0
          : Math.max(0, performance.now() - pauseStartedAt);
        return Math.max(0, performance.now() - startedAt - accumulatedPauseMs - currentPauseMs);
      };
      const updatePauseButton = () => {
        pauseButton.textContent = pauseReasons.has("MANUAL") ? "재개" : "일시정지";
      };
      const requestPause = (reason) => {
        if (!instance || terminal || pauseReasons.has(reason)) return false;
        const wasRunning = pauseReasons.size === 0;
        pauseReasons.add(reason);
        if (wasRunning) {
          const accepted = instance.pause?.(reason);
          if (accepted === false) {
            pauseReasons.delete(reason);
            return false;
          }
          pauseStartedAt = performance.now();
        }
        updatePauseButton();
        return true;
      };
      const releasePause = (reason) => {
        if (!instance || terminal || !pauseReasons.has(reason)) return false;
        pauseReasons.delete(reason);
        if (pauseReasons.size === 0) {
          const accepted = instance.resume?.();
          if (accepted === false) {
            pauseReasons.add(reason);
            return false;
          }
          if (pauseStartedAt !== null) {
            accumulatedPauseMs += Math.max(0, performance.now() - pauseStartedAt);
            pauseStartedAt = null;
          }
        }
        updatePauseButton();
        return true;
      };
      const togglePause = () => {
        const manuallyPaused = pauseReasons.has("MANUAL");
        const changed = manuallyPaused ? releasePause("MANUAL") : requestPause("MANUAL");
        if (changed) showToast(context, manuallyPaused ? "전투를 재개했습니다." : "전투를 일시정지했습니다.");
      };

      pauseButton = createButton("일시정지", togglePause, "ghost");
      const quitButton = createButton(
        returnDestination.label,
        () => context.router.navigate(returnDestination.sceneId),
        "ghost",
      );
      const toolbar = createElement("header", { className: "minigame-toolbar" }, [
        title,
        createElement("div", { className: "button-row" }, [pauseButton, quitButton]),
      ]);
      const stage = createElement("div", { className: "minigame-stage battle-stage" });
      const controls = createBattleControls(config?.controls);
      frame.append(toolbar);
      if (controls) frame.append(controls);
      frame.append(stage);
      root.append(frame);

      const module = await loadBattleModule(battle.module);
      if (signal.aborted) return;

      const onComplete = (callbackAttemptId, candidate) => {
        if (destroyed || terminal || callbackAttemptId !== currentAttemptId) return;
        terminal = true;
        const result = finalizeBattleCandidate({
          battleId: battle.id,
          id: currentAttemptId,
          durationMs: activeDurationMs(),
          candidate,
        });
        context.state.lastResult = result;
        overlay = createResultOverlay({
          result,
          contextLabel: `BATTLE · ${battle.title}`,
          presentation: config?.resultPresentation,
          onRetry: () => {
            if (destroyed) return;
            overlay?.destroy();
            overlay = null;
            terminal = false;
            pauseReasons.clear();
            pauseStartedAt = null;
            accumulatedPauseMs = 0;
            updatePauseButton();
            currentAttemptId = attemptId(battle.id);
            startedAt = performance.now();
            instance.restart?.({ attemptId: currentAttemptId });
            if (globalThis.document?.hidden) requestPause("VISIBILITY");
          },
          onMap: () => context.router.navigate(returnDestination.sceneId),
          onMenu: () => context.router.navigate("main-menu"),
          backgroundElements: [toolbar, stage.firstElementChild],
        });
        stage.append(overlay.element);
      };

      instance = module.createBattle({
        root: stage,
        input: context.services.input,
        events: context.services.events,
        onComplete,
      });
      const player = createBattlePlayer(accountService.getState(), arena, {
        useAccountStats: battle.usesAccountStats !== false,
      });
      await instance.init({ ...config, arena, players: [player] }, { signal });
      if (signal.aborted) return;
      currentAttemptId = attemptId(battle.id);
      startedAt = performance.now();
      instance.start({ attemptId: currentAttemptId });

      unsubscribeInput = context.services.input.onAction?.((event) => {
        if (event.action === INPUT_ACTIONS.PAUSE && event.phase === "press") togglePause();
      });
      const documentRef = globalThis.document;
      if (typeof documentRef?.addEventListener === "function") {
        const handleVisibilityChange = () => {
          if (documentRef.hidden) requestPause("VISIBILITY");
          else releasePause("VISIBILITY");
        };
        documentRef.addEventListener("visibilitychange", handleVisibilityChange);
        unsubscribeVisibility = () => documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
        if (documentRef.hidden) requestPause("VISIBILITY");
      }
    },

    unmount() {
      destroyed = true;
      overlay?.destroy();
      overlay = null;
      instance?.destroy?.();
      instance = null;
      unsubscribeInput?.();
      unsubscribeInput = null;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      assetLease?.release?.();
      assetLease = null;
    },
  };
}

export function createBattleScene(context) {
  let activeScene = null;
  return {
    async mount(root, params = {}, lifecycle) {
      const definitions = publishedBattles(context);
      if (definitions.length === 0) {
        activeScene = createBattleComingSoonScene(context);
      } else if (!params.battleId) {
        activeScene = createBattleEntryScene(context);
      } else {
        const battle = findBattle(context, params.battleId);
        if (!battle) throw new Error(`배틀을 찾을 수 없습니다: ${params.battleId}`);
        const unlock = getBattleUnlockStatus(
          battle,
          context.services.save?.getState?.() ?? {},
          context.services.account.getState(),
        );
        activeScene = unlock.unlocked
          ? createBattlePlayScene(context, battle)
          : createBattleEntryScene(context, { notice: "잠긴 배틀에는 바로 입장할 수 없습니다." });
      }
      return activeScene.mount(root, params, lifecycle);
    },
    unmount() {
      return activeScene?.unmount?.();
    },
  };
}

export default createBattleScene;

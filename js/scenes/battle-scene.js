import { FINAL_BATTLE_ID, getPublishedBattles, loadBattleModule } from "../battle/registry.js";
import { createCampusScene } from "./campus-scene.js";
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
  RemoteCharacterView,
  VirtualJoystick,
  createCharacterActorElement,
} from "../battle/character/index.js";
import {
  createPostgameRoomLobby,
  currentRoomFromState,
} from "../battle/postgame/room-lobby.js";
import { createBattleRecoveryPrompt } from "../battle/postgame/battle-recovery-prompt.js";
import { bindBattlePresence } from "../battle/postgame/battle-presence.js";
import { createGuestTestRoomSession } from "../battle/postgame/guest-test-room-session.js";
import { DEFAULT_PLAYER_APPEARANCE, createBattlePlayer, createPlayerAppearance } from "../battle/player-config.js";
import { promptForHairColor } from "../ui/hair-color-picker.js";
import { formatCombatValue } from "../battle/combat-display.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { validateMiniGameCandidate } from "../core/config-validator.js";
import { GameLoop } from "../core/game-loop.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { OUTRO_STORY_ID, isFestivalOpen, markStorySeen } from "../core/story-progress.js";
import { EIAI_BATTLE_INTRO } from "../core/finale-story.js";
import { createStoryDialogueView } from "../ui/story-dialogue-view.js";
import { rectsOverlap } from "../map/collision.js";
import { createResultOverlay } from "../ui/result-overlay.js";
import { createBattleComingSoonScene } from "./battle-coming-soon-scene.js";
import { createButton, createElement, createScene, showToast } from "./scene-utils.js";

const DEFAULT_ARENA = Object.freeze({ width: 960, height: 600 });
const FIELD_CHARACTER_ID = "aftergame-field-player";
const FIELD_CHARACTER_SIZE = Object.freeze({ width: 48, height: 60 });
const FIELD_MARKER_SIZE = Object.freeze({ width: 72, height: 84 });
const FALLBACK_FIELD_SIZE = Object.freeze({ width: 720, height: 420 });
const SHARED_BOSS_IDS = new Set(["data-sphinx", "stat-boss", "control-boss"]);
const RANDOM_FIELD_MINIGAME_ID = "xr-egg-trials";
const XR_EGG_IMAGE_SRC = "./assets/images/story-eggs/xr-egg.png";
const HEART_EGG_IMAGE_SRC = "./assets/images/story-eggs/heart-egg.png";
const COMBAT_VALUE_SCALE = 1_000_000;

export function getXEggRewardNotice(submission) {
  if (submission?.submitted && !submission.duplicate && submission.awarded) {
    return Number.isInteger(submission.experienceAwarded) && submission.experienceAwarded > 0
      ? `경험치 +${submission.experienceAwarded} 획득`
      : "경험치 획득";
  }
  if (submission?.reason === "guest") return "획득 경험치 0 · 로그인 후 획득할 수 있어요";
  if (submission?.duplicate) return "이미 지급된 경험치입니다";
  return "획득 경험치 0";
}

export function getBattleResultIllustration(battleId, status) {
  if (battleId !== RANDOM_FIELD_MINIGAME_ID) return null;
  const cleared = status === "CLEAR";
  return Object.freeze({
    src: cleared ? HEART_EGG_IMAGE_SRC : XR_EGG_IMAGE_SRC,
    alt: cleared
      ? "금색 하트와 날개 문양이 새겨진 하얀 마음의 알"
      : "흰 X 문양이 새겨진 검은 X알",
    width: 1254,
    height: 1254,
  });
}

function roundCombatValue(value) {
  if (Math.abs(value) >= Number.MAX_SAFE_INTEGER / COMBAT_VALUE_SCALE) return value;
  return Math.round((value + Number.EPSILON) * COMBAT_VALUE_SCALE) / COMBAT_VALUE_SCALE;
}

export function sharedBattleSeed(value) {
  if (Number.isFinite(value)) return (Math.trunc(value) >>> 0) || 1;
  if (typeof value !== "string" || value.length === 0) return null;
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) || 1;
}

export function requiresAuthenticatedBattleSession(
  battleId = null,
  { guestBattleTesting = false } = {},
) {
  if (guestBattleTesting) return false;
  return battleId !== FINAL_BATTLE_ID;
}

export function shouldOfferBattleRetry(battleId) {
  return battleId !== RANDOM_FIELD_MINIGAME_ID;
}

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
    label: returnsToPreGameMap ? "돌아가기" : "구역 맵으로",
  });
}

export function createSharedBattleSession({ realtimeService, roomId, battleId }) {
  if (!realtimeService || typeof realtimeService.subscribe !== "function") return null;
  if (typeof roomId !== "string" || !roomId.trim()) return null;
  if (typeof battleId !== "string" || !battleId.trim()) return null;

  const normalizedRoomId = roomId.trim();
  const normalizedBattleId = battleId.trim();
  const listeners = new Set();
  let destroyed = false;
  let left = false;
  let snapshot = null;
  let readyRequested = false;
  let readySentForConnection = false;

  const ready = () => {
    readyRequested = true;
    if (
      destroyed
      || typeof realtimeService.sendBattleReady !== "function"
      || realtimeService.sendBattleReady(normalizedRoomId) === false
    ) {
      return false;
    }
    readySentForConnection = true;
    return true;
  };

  const acceptSnapshot = (candidate) => {
    if (
      !candidate
      || candidate.roomId !== normalizedRoomId
      || candidate.battleId !== normalizedBattleId
      || candidate === snapshot
    ) {
      return false;
    }
    snapshot = candidate;
    for (const listener of [...listeners]) listener(snapshot);
    return true;
  };
  const unsubscribeRealtime = realtimeService.subscribe((state) => {
    if (state?.connected !== true) readySentForConnection = false;
    const receivedSnapshot = acceptSnapshot(state?.battle);
    const self = snapshot?.roster?.find((member) => member.id === state?.selfId);
    if (
      state?.connected === true
      && receivedSnapshot
      && readyRequested
      && snapshot?.status === "running"
      && self?.ready === false
      && !readySentForConnection
    ) {
      ready();
    }
  }, { emitCurrent: true });

  const hit = ({ kind, actionId } = {}) => (
    !destroyed
    && typeof realtimeService.sendBattleHit === "function"
    && realtimeService.sendBattleHit({
      roomId: normalizedRoomId,
      kind,
      actionId,
    }) !== false
  );
  const health = ({ hp, maxHp } = {}) => (
    !destroyed
    && typeof realtimeService.sendBattleHealth === "function"
    && realtimeService.sendBattleHealth({
      roomId: normalizedRoomId,
      hp,
      maxHp,
    }) !== false
  );
  const leave = () => {
    if (destroyed || left) return false;
    if (typeof realtimeService.sendBattleLeave !== "function") return false;
    const sent = realtimeService.sendBattleLeave(normalizedRoomId);
    if (sent !== false) left = true;
    return sent !== false;
  };

  return Object.freeze({
    online: true,
    roomId: normalizedRoomId,
    battleId: normalizedBattleId,
    realtimeService,
    getSnapshot: () => snapshot,
    getState: () => snapshot,
    ready,
    sendReady: ready,
    hit,
    sendHit: hit,
    health,
    sendHealth: health,
    leave,
    subscribe(listener, { emitCurrent = true } = {}) {
      if (typeof listener !== "function") throw new TypeError("Shared battle subscriber must be a function.");
      if (destroyed) return () => {};
      listeners.add(listener);
      if (emitCurrent && snapshot) listener(snapshot);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      unsubscribeRealtime?.();
    },
  });
}

export function releaseSharedBattleSession({
  sharedBattle,
  realtimeService,
  preserveRealtime = false,
} = {}) {
  const roomId = sharedBattle?.roomId ?? null;
  const leaveSent = sharedBattle?.leave?.() === true;
  const leavePending = Boolean(
    roomId && realtimeService?.getState?.()?.leavingBattleRoomId === roomId,
  );
  sharedBattle?.destroy?.();
  if (preserveRealtime) return Object.freeze({ leaveSent, disconnected: false });
  if (
    (leaveSent || leavePending)
    && roomId
    && typeof realtimeService?.disconnectAfterBattleLeave === "function"
  ) {
    realtimeService.disconnectAfterBattleLeave(roomId);
    return Object.freeze({ leaveSent, disconnected: "deferred" });
  }
  realtimeService?.disconnect?.();
  return Object.freeze({ leaveSent, disconnected: true });
}

export function runBattleRetryAction({ sharedBattle, onSharedBattle, onSolo } = {}) {
  if (sharedBattle) {
    onSharedBattle?.();
    return "shared-map";
  }
  onSolo?.();
  return "solo-restart";
}

export function isSharedPartyReady(snapshot) {
  if (snapshot?.status === "finished") return true;
  if (typeof snapshot?.allReady === "boolean") return snapshot.allReady;
  const connectedRoster = Array.isArray(snapshot?.roster)
    ? snapshot.roster.filter((member) => member?.connected !== false)
    : [];
  return connectedRoster.length > 0
    && connectedRoster.every((member) => member?.ready === true);
}

export function getBattlePlayerHealth(battleId, snapshot, playerId = "player-1") {
  if (!snapshot || typeof snapshot !== "object") return null;
  let hp;
  let maxHp;
  if (battleId === "data-sphinx") {
    hp = snapshot.playerHealth;
    maxHp = snapshot.playerMaxHealth;
  } else if (battleId === "control-boss") {
    hp = snapshot.playerHp;
    maxHp = snapshot.playerMaxHp;
  } else if (battleId === "stat-boss") {
    const player = snapshot.players?.[playerId]
      ?? Object.values(snapshot.players ?? {}).find((candidate) => candidate && typeof candidate === "object");
    hp = player?.hp;
    maxHp = player?.maxHp;
  } else {
    return null;
  }
  const normalizedMaxHp = Math.max(1, Math.ceil(Number(maxHp) || 0));
  const normalizedHp = roundCombatValue(Math.min(
    normalizedMaxHp,
    Math.max(0, Number(hp) || 0),
  ));
  if (!Number.isFinite(Number(hp)) || !Number.isFinite(Number(maxHp)) || Number(maxHp) <= 0) {
    return null;
  }
  return Object.freeze({ hp: normalizedHp, maxHp: normalizedMaxHp });
}

export function getOtherPartyMembers(roster, selfId) {
  // Each boss already owns the local player's health meter. Until our public
  // identity is known, do not accidentally render it again as a teammate.
  if (!selfId || !Array.isArray(roster)) return [];
  return roster.filter(member => member?.id && member.id !== selfId).slice(0, 4);
}

export function getPartyMemberHealthView(member) {
  const maxHp = Number.isFinite(Number(member?.maxHp)) && Number(member.maxHp) > 0
    ? Math.max(1, Math.trunc(Number(member.maxHp)))
    : null;
  const hp = maxHp === null
    ? null
    : Math.min(maxHp, Math.max(0, roundCombatValue(Number(member?.hp) || 0)));
  const dead = member?.alive === false || hp === 0;
  return Object.freeze({
    hp,
    maxHp,
    dead,
    ratio: maxHp === null ? 1 : hp / maxHp,
    label: dead
      ? "전투 불능"
      : member?.connected === false
        ? "연결 끊김"
        : hp === null
          ? "준비 중"
          : `${formatCombatValue(hp)}/${formatCombatValue(maxHp)}`,
  });
}

export function getSharedDefeatMessage(snapshot, selfId) {
  const hasSurvivor = Boolean(selfId) && (snapshot?.roster ?? []).some((member) => (
    member.id !== selfId && member.connected !== false && member.alive !== false && member.hp > 0
  ));
  return hasSurvivor
    ? "전투 불능 상태입니다. 남은 파티원의 전투를 관전합니다."
    : "전투가 끝났습니다. 전투 결과를 확인하고 있습니다.";
}

export function getResumedPartyHealth(snapshot, selfId) {
  if (!snapshot || typeof snapshot !== "object" || typeof selfId !== "string" || !selfId) {
    return null;
  }
  const member = Array.isArray(snapshot.roster)
    ? snapshot.roster.find((candidate) => candidate?.id === selfId)
    : null;
  if (
    !Number.isFinite(member?.hp)
    || !Number.isSafeInteger(member?.maxHp)
    || member.hp < 0
    || member.maxHp < 1
    || member.hp > member.maxHp
  ) {
    return null;
  }
  return Object.freeze({ hp: member.hp, maxHp: member.maxHp });
}

function createBattleEntryScene(context, { notice = null } = {}) {
  let loop = null;
  let system = null;
  let view = null;
  let remoteView = null;
  let joystick = null;
  let scheduler = null;
  let resizeObserver = null;
  let unsubscribeResize = null;
  let markerElement = null;
  let realtimeService = null;
  let roomLobby = null;
  let recoveryPrompt = null;
  let unsubscribeRealtime = null;
  let unsubscribeRealtimeEvents = null;
  let preserveRealtimeOnUnmount = false;
  let layoutRoot = null;
  let mounted = false;

  return {
    async mount(root, _params, { signal }) {
      const service = context.services.account;
      const guestBattleTesting = context.config.features?.guestBattleTesting === true;
      if (!guestBattleTesting && ["idle", "loading"].includes(service.getState().status)) {
        await service.refreshSession();
      }
      if (signal.aborted) return;

      const definitions = publishedBattles(context);
      if (!isFestivalOpen(context)) {
        root.append(createElement("section", { className: "scene scene--centered" }, [
          createElement("h1", { text: "이아이와 함께 축제를 열어 주세요" }),
          createButton("이야기로 돌아가기", () => context.router.navigate("map"), "primary"),
        ]));
        return;
      }
      const saveState = context.services.save?.getState?.() ?? {};
      let accountState = service.getState();
      if (accountState.authenticated && !accountState.user?.hairColor && typeof service.updateHairColor === "function") {
        if (!await promptForHairColor(root, service, { signal })) return;
        accountState = service.getState();
      }
      const guestTestMode = guestBattleTesting && !accountState.authenticated;
      const guestTestRoomSession = guestTestMode
        ? createGuestTestRoomSession()
        : null;
      realtimeService = context.services.postgameRealtime ?? null;
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
      let bossSessionPending = false;
      let handledLeaveFailureEvent = null;
      const handledFinishedBattleRooms = new Set();
      let worldSize = FALLBACK_FIELD_SIZE;
      let latestSnapshot = null;

      const scene = createScene({
        className: "scene--panel battle-entry battle-node-map-scene",
        eyebrow: "AFTER GAME · WALKABLE WORLD",
        title: "사후게임 월드",
      });
      root.dataset.sceneLayout = "aftergame-world";
      layoutRoot = root;
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
        createElement("span", { className: "aftergame-world__field-sign", text: "X알의 폭주 필드" }),
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
        attributes: { "aria-label": "오른쪽 출구로 X알의 폭주 필드 이동" },
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
        ]),
        worldStage,
        worldStatus,
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

      scene.append(worldShell);
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
        worldStatus.textContent = "";
      };

      const applyZonePresentation = () => {
        const inField = activeZoneId === AFTERGAME_ZONE_IDS.FIELD;
        fieldScenery.hidden = !inField;
        plazaScenery.hidden = inField;
        fieldScenery.setAttribute("aria-hidden", String(!inField));
        plazaScenery.setAttribute("aria-hidden", String(inField));
        worldElement.dataset.zoneId = activeZoneId;
        worldShell.dataset.zoneId = activeZoneId;
        zoneKicker.textContent = inField ? "RANDOM · FIELD" : "CENTRAL · PLAZA";
        zoneTitle.textContent = inField ? "X알의 폭주 필드" : "중심 광장";
        zoneBadge.textContent = inField ? "ROAMING" : "3 BOSS GATES";
        worldElement.setAttribute(
          "aria-label",
          inField
            ? "캐릭터로 이동하며 X알을 만나는 X알의 폭주 필드"
            : "캐릭터로 이동하며 세 보스맵을 선택하는 중심 광장",
        );
        setBaseStatus();
      };

      const enterRoute = (route, {
        encounter = false,
        returnSpawn = null,
        returnZoneId = activeZoneId,
      } = {}) => {
        if (navigationStarted) return false;
        navigationStarted = true;
        if (returnSpawn) {
          rememberWorldState({
            zoneId: validZoneIds.has(returnZoneId) ? returnZoneId : activeZoneId,
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
          worldStatus.textContent = "X알의 폭주에 입장합니다.";
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
        remoteView?.update([]);
        publishPresence?.();
        worldElement.focus?.({ preventScroll: true });
        return true;
      };

      const runRealtimeCommand = (command, fallbackMessage) => {
        try {
          const sent = command?.();
          if (sent === false) showToast(context, fallbackMessage);
          return sent !== false;
        } catch (error) {
          showToast(context, fallbackMessage);
          return false;
        }
      };

      roomLobby = createPostgameRoomLobby({
        getSelfAppearance: () => createPlayerAppearance(service.getState().user?.hairColor),
        onRefresh: () => {
          if (!guestTestRoomSession) realtimeService?.connect();
          roomLobby?.render(guestTestRoomSession?.getState() ?? realtimeService?.getState());
        },
        onCreate: (battleId, capacity, roomName) => runRealtimeCommand(
          () => {
            const created = guestTestRoomSession
              ? guestTestRoomSession.createRoom(battleId, capacity, roomName)
              : realtimeService?.createRoom(battleId, capacity, roomName);
            if (guestTestRoomSession) roomLobby?.render(guestTestRoomSession.getState());
            return created;
          },
          guestTestMode
            ? "게스트 테스트 방을 만들지 못했습니다."
            : "실시간 서버가 연결된 뒤 다시 시도해 주세요.",
        ),
        onJoin: (roomId) => runRealtimeCommand(
          () => guestTestRoomSession
            ? guestTestRoomSession.joinRoom(roomId)
            : realtimeService?.joinRoom(roomId),
          "방에 참가하지 못했습니다.",
        ),
        onLeave: () => runRealtimeCommand(
          () => {
            const left = guestTestRoomSession
              ? guestTestRoomSession.leaveRoom()
              : realtimeService?.leaveRoom();
            if (guestTestRoomSession) roomLobby?.render(guestTestRoomSession.getState());
            return left;
          },
          "방에서 나가지 못했습니다.",
        ),
        onStart: () => runRealtimeCommand(
          () => {
            if (!guestTestRoomSession) return realtimeService?.startRoom();
            const started = guestTestRoomSession.startRoom();
            roomLobby?.render(guestTestRoomSession.getState());
            if (!started) return false;
            const selectedRoom = bossRoomByBattleId.get(started.battleId);
            if (!selectedRoom) return false;
            return enterRoute({
              sceneId: selectedRoom.route.sceneId,
              params: {
                ...selectedRoom.route.params,
                party: {
                  roomId: started.roomId,
                  selfId: started.selfId,
                  roster: started.roster,
                  seed: null,
                  startedAt: Date.now(),
                  realtimeService: null,
                  sharedBattle: null,
                  localTest: true,
                },
              },
            }, {
              returnSpawn: roomLobby?.getReturnSpawn?.() ?? null,
              returnZoneId: AFTERGAME_ZONE_IDS.PLAZA,
            });
          },
          "전투를 시작하지 못했습니다.",
        ),
        onClose: () => {
          if (_params?.openBossId && context.config.features?.campusMap) {
            void context.router.navigate("battle");
            return;
          }
          system?.setControlLocked(false, "boss-room-lobby");
          worldElement.focus?.({ preventScroll: true });
        },
      });
      worldShell.append(roomLobby.element);

      const enterSharedBattle = ({
        roomId,
        battleId,
        roster = [],
        seed = null,
        startedAt = null,
        returnSpawn = null,
      } = {}) => {
        if (navigationStarted || !roomId || !battleId) return false;
        const selectedRoom = bossRoomByBattleId.get(battleId);
        if (!selectedRoom) return false;
        const door = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].bossDoors
          .find((candidate) => candidate.battleId === battleId);
        const sharedBattle = createSharedBattleSession({
          realtimeService,
          roomId,
          battleId,
        });
        if (!sharedBattle) return false;
        preserveRealtimeOnUnmount = true;
        recoveryPrompt?.close();
        roomLobby.close();
        const entered = enterRoute({
          sceneId: selectedRoom.route.sceneId,
          params: {
            ...selectedRoom.route.params,
            party: {
              roomId,
              selfId: realtimeService.getState().selfId,
              roster: Array.isArray(roster) ? roster.slice(0, 5) : [],
              seed,
              startedAt,
              realtimeService,
              sharedBattle,
            },
          },
        }, {
          returnSpawn: returnSpawn ?? door?.returnSpawn ?? null,
          returnZoneId: AFTERGAME_ZONE_IDS.PLAZA,
        });
        if (!entered) {
          preserveRealtimeOnUnmount = false;
          sharedBattle.destroy();
        }
        return entered;
      };

      recoveryPrompt = createBattleRecoveryPrompt({
        onContinue: (battleSnapshot) => {
          enterSharedBattle({
            roomId: battleSnapshot.roomId,
            battleId: battleSnapshot.battleId,
            roster: battleSnapshot.roster,
            seed: battleSnapshot.seed,
            startedAt: battleSnapshot.startedAt,
          });
        },
        onLeave: (battleSnapshot) => {
          recoveryPrompt?.setLeaving(true);
          const sent = realtimeService?.sendBattleLeave?.(battleSnapshot.roomId);
          if (sent === false && realtimeService?.getState?.()?.leavingBattleRoomId !== battleSnapshot.roomId) {
            recoveryPrompt?.setLeaving(false);
            showToast(context, "전투에서 나가지 못했습니다. 연결 상태를 확인해 주세요.");
          }
        },
      });
      worldShell.append(recoveryPrompt.element);

      const recoverSharedBattle = (realtimeState) => {
        const battleSnapshot = realtimeState?.battle;
        const openedSnapshot = recoveryPrompt?.getSnapshot?.();
        if (!battleSnapshot) {
          if (openedSnapshot) {
            recoveryPrompt.close();
            system?.setControlLocked(false, "battle-recovery");
            worldElement.focus?.({ preventScroll: true });
          }
          return false;
        }
        if (
          navigationStarted
          || !bossRoomByBattleId.has(battleSnapshot.battleId)
        ) {
          return false;
        }
        const leaveFailure = realtimeState?.lastEvent;
        if (
          leaveFailure?.type === "battle.leave.failed"
          && leaveFailure.roomId === battleSnapshot.roomId
          && leaveFailure !== handledLeaveFailureEvent
        ) {
          handledLeaveFailureEvent = leaveFailure;
          recoveryPrompt?.setLeaving(false);
          showToast(
            context,
            leaveFailure.error?.message ?? "전투에서 나가지 못했습니다. 다시 시도해 주세요.",
          );
        }
        if (realtimeState?.leavingBattleRoomId === battleSnapshot.roomId) {
          if (openedSnapshot?.roomId === battleSnapshot.roomId) recoveryPrompt.setLeaving(true);
          return false;
        }
        if (battleSnapshot.status === "finished") {
          recoveryPrompt?.close();
          system?.setControlLocked(false, "battle-recovery");
          if (handledFinishedBattleRooms.has(battleSnapshot.roomId)) return false;
          const sent = runRealtimeCommand(
            () => realtimeService?.sendBattleLeave(battleSnapshot.roomId),
            "종료된 공동 전투를 정리하지 못했습니다. 연결 상태를 확인해 주세요.",
          );
          if (!sent) return false;
          handledFinishedBattleRooms.add(battleSnapshot.roomId);
          worldStatus.textContent = "전투가 종료되었습니다.";
          worldStatus.dataset.active = "true";
          return true;
        }
        if (battleSnapshot.status !== "running") return false;
        const selectedRoom = bossRoomByBattleId.get(battleSnapshot.battleId);
        roomLobby?.close();
        system?.setControlLocked(true, "battle-recovery");
        if (openedSnapshot?.roomId === battleSnapshot.roomId) {
          recoveryPrompt.update(battleSnapshot);
          return true;
        }
        return recoveryPrompt.open(battleSnapshot, { title: selectedRoom?.battle?.title ?? "보스" });
      };

      const enterBossRoom = (battleId, returnSpawn = null) => {
        if (activeZoneId !== AFTERGAME_ZONE_IDS.PLAZA || navigationStarted || bossSessionPending) {
          return false;
        }
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
        if (guestTestRoomSession) {
          system?.setControlLocked(true, "boss-room-lobby");
          const opened = roomLobby?.open({
            battle: room.battle,
            spawn: returnSpawn ?? door?.returnSpawn ?? null,
          });
          if (!opened) {
            system?.setControlLocked(false, "boss-room-lobby");
            return false;
          }
          roomLobby.render(guestTestRoomSession.getState());
          return true;
        }
        bossSessionPending = true;
        system?.setControlLocked(true, "boss-session-check");
        void (async () => {
          try {
            await service.refreshSession();
          } catch {
            // AccountService exposes the user-facing failure through its state.
          }
          if (!mounted || navigationStarted) return;
          accountState = service.getState();
          if (!accountState.authenticated) {
            realtimeService?.disconnect?.();
            rememberWorldState({
              zoneId: AFTERGAME_ZONE_IDS.PLAZA,
              position: returnSpawn ?? door?.returnSpawn ?? null,
              direction: returnSpawn?.direction ?? door?.returnSpawn?.direction ?? "down",
            });
            navigationStarted = true;
            loop?.pause();
            await context.router.navigate("account", {
              notice: "보스 배틀은 로그인 후 이용할 수 있습니다. Google로 로그인해 주세요.",
              noticeTone: "info",
            });
            return;
          }
          if (!realtimeService || !roomLobby) {
            worldStatus.textContent = "온라인 보스 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
            worldStatus.dataset.active = "true";
            return;
          }
          const currentBattle = realtimeService.getState()?.battle;
          if (currentBattle?.status === "running") {
            recoverSharedBattle(realtimeService.getState());
            return;
          }
          const realtimeState = realtimeService.getState();
          const activeRoom = currentRoomFromState(realtimeState);
          const activeBossRoom = activeRoom?.battleId
            ? bossRoomByBattleId.get(activeRoom.battleId)
            : null;
          const lobbyRoom = activeBossRoom ?? room;
          const lobbyDoor = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].bossDoors
            .find((candidate) => candidate.battleId === lobbyRoom.battle.id);
          if (activeRoom?.battleId && activeRoom.battleId !== battleId) {
            showToast(
              context,
              `이미 ${lobbyRoom.battle.title} 방에 참가 중이라 기존 대기실을 열었습니다.`,
            );
          }
          system?.setControlLocked(true, "boss-room-lobby");
          realtimeService.connect();
          const opened = roomLobby.open({
            battle: lobbyRoom.battle,
            spawn: activeBossRoom
              ? lobbyDoor?.returnSpawn ?? null
              : returnSpawn ?? door?.returnSpawn ?? null,
          });
          if (!opened) {
            system?.setControlLocked(false, "boss-room-lobby");
            return;
          }
          roomLobby.render(realtimeService.getState());
        })().finally(() => {
          bossSessionPending = false;
          system?.setControlLocked(false, "boss-session-check");
        });
        return true;
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
          appearance: accountState.authenticated
            ? createPlayerAppearance(accountState.user?.hairColor, accountState.user?.nickname ?? accountState.user?.name ?? "플레이어")
            : DEFAULT_PLAYER_APPEARANCE,
        },
        world: createZoneWorld(),
      }).start();
      if (!fieldUnlock.unlocked) system.setControlLocked(true, "aftergame-world-locked");

      view = new CharacterView({ element: localActor, worldSize });
      remoteView = new RemoteCharacterView({ root: worldElement, worldSize });
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

      const publishPresence = () => {
        if (!realtimeService || !accountState.authenticated || !latestSnapshot) return;
        realtimeService.updatePresence({
          zone: activeZoneId,
          x: clamp((latestSnapshot.x + latestSnapshot.width / 2) / worldSize.width, 0, 1),
          y: clamp((latestSnapshot.y + latestSnapshot.height / 2) / worldSize.height, 0, 1),
          direction: latestSnapshot.direction,
          moving: latestSnapshot.moving === true,
        });
      };

      const renderRealtimeState = (realtimeState) => {
        roomLobby?.render(realtimeState);
        if (realtimeState?.mode === "local-test") {
          remoteView?.update([]);
          return;
        }
        const width = Math.min(FIELD_CHARACTER_SIZE.width, worldSize.width);
        const height = Math.min(FIELD_CHARACTER_SIZE.height, worldSize.height);
        const remoteCharacters = (realtimeState?.players ?? [])
          .filter((player) => player.zone === activeZoneId)
          .map((player) => ({
            id: player.id,
            x: clamp(player.x * worldSize.width - width / 2, 0, Math.max(0, worldSize.width - width)),
            y: clamp(player.y * worldSize.height - height / 2, 0, Math.max(0, worldSize.height - height)),
            width,
            height,
            direction: player.direction,
            moving: player.moving,
            currentHealth: 1,
            maxHealth: 1,
            appearance: {
              ...createPlayerAppearance(player.hairColor, player.name),
              id: `remote-${player.id}`,
              label: player.name,
              color: "#2ab5e4",
            },
          }));
        remoteView?.update(remoteCharacters);
      };

      if (realtimeService && accountState.authenticated) {
        unsubscribeRealtime = realtimeService.subscribe((realtimeState) => {
          renderRealtimeState(realtimeState);
          recoverSharedBattle(realtimeState);
        });
        unsubscribeRealtimeEvents = realtimeService.subscribeEvents((event) => {
          if (event?.type !== "room.started" || navigationStarted) return;
          const selectedBattle = roomLobby?.getBattle();
          if (!selectedBattle || selectedBattle.id !== event.battleId) return;
          const selectedRoom = bossRoomByBattleId.get(event.battleId);
          if (!selectedRoom) return;
          const returnSpawn = roomLobby.getReturnSpawn();
          enterSharedBattle({
            roomId: event.roomId,
            battleId: event.battleId,
            roster: event.roster ?? event.room?.members ?? [],
            seed: event.seed ?? null,
            startedAt: event.startedAt ?? null,
            returnSpawn,
          });
        });
        publishPresence();
        realtimeService.connect();
      } else {
        renderRealtimeState(guestTestRoomSession?.getState?.() ?? {
          status: "offline",
          players: [],
          rooms: [],
        });
      }

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
          attributes: { "aria-label": "X알의 폭주 발견 · 입장" },
          on: { click: enterFieldEncounter },
        }, [
          createElement("img", {
            className: "battle-field-encounter__egg",
            attributes: {
              src: XR_EGG_IMAGE_SRC,
              alt: "",
              width: "1254",
              height: "1254",
              decoding: "async",
              draggable: "false",
              "aria-hidden": "true",
            },
          }),
          createElement("strong", {
            className: "battle-field-encounter__label",
            text: "X알의 폭주",
          }),
        ]);
        placeFieldElement(markerElement, activeEncounter, worldSize);
        worldElement.append(markerElement);
        worldShell.dataset.encounterActive = "true";
        worldStatus.textContent = "폭주한 X알이 출현했습니다. 가까이 가거나 X알을 눌러 입장하세요.";
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
          publishPresence();

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

      if (_params?.openBossId) enterBossRoom(_params.openBossId);

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
        if (remoteView) remoteView.worldSize = { ...worldSize };
        system.setWorld(createZoneWorld());
        if (markerElement && activeEncounter) {
          placeFieldElement(markerElement, activeEncounter, worldSize);
        }
        view.render(latestSnapshot);
        if (realtimeService && accountState.authenticated) {
          renderRealtimeState(realtimeService.getState());
          publishPresence();
        }
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
      if (layoutRoot?.dataset.sceneLayout === "aftergame-world") {
        delete layoutRoot.dataset.sceneLayout;
      }
      layoutRoot = null;
      unsubscribeRealtimeEvents?.();
      unsubscribeRealtimeEvents = null;
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
      if (!preserveRealtimeOnUnmount) realtimeService?.disconnect?.();
      realtimeService = null;
      roomLobby = null;
      recoveryPrompt?.destroy?.();
      recoveryPrompt = null;
      remoteView?.destroy?.();
      remoteView = null;
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
  let battlePresence = null;
  let introDialogue = null;
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
  let unsubscribeSharedBattleUi = null;
  let unsubscribeHealthChange = null;
  let realtimeService = null;
  let sharedBattle = null;
  let preserveRealtimeOnUnmount = false;
  let sharedDefeatAttemptId = null;
  let healthSyncTimer = null;
  let lastHealthSignature = null;
  let lastHealthAttemptSignature = null;
  let lastHealthAttemptAt = 0;
  let forcedDefeatedHealth = null;
  let localPlayerId = "player-1";
  let syncLocalHealth = () => null;
  const pauseReasons = new Set();
  const returnDestination = getBattleReturnDestination(battle);
  const contextLabel = battle.id === FINAL_BATTLE_ID
    ? `STORY FINALE · ${battle.title}`
    : `BATTLE · ${battle.title}`;

  return {
    async mount(root, params, { signal }) {
      const accountService = context.services.account;
      const guestBattleTesting = context.config.features?.guestBattleTesting === true;
      if (
        requiresAuthenticatedBattleSession(battle.id, { guestBattleTesting })
        && ["idle", "loading"].includes(accountService.getState().status)
      ) {
        await accountService.refreshSession();
      }
      if (signal.aborted) return;

      const party = params?.party ?? null;
      const localTest = party?.localTest === true && guestBattleTesting;
      realtimeService = localTest
        ? null
        : party?.realtimeService ?? context.services.postgameRealtime ?? null;
      sharedBattle = localTest
        ? null
        : party?.sharedBattle ?? (
          party?.roomId && realtimeService
          ? createSharedBattleSession({
              realtimeService,
              roomId: party.roomId,
              battleId: battle.id,
            })
          : null
        );
      if (sharedBattle) realtimeService?.connect?.();

      const unlock = getBattleUnlockStatus(
        battle,
        context.services.save?.getState?.() ?? {},
        accountService.getState(),
      );
      if (!unlock.unlocked) throw new Error("아직 배틀 해금 조건을 충족하지 않았습니다.");
      if (battle.id !== FINAL_BATTLE_ID && !isFestivalOpen(context)) {
        root.append(createElement("section", { className: "scene scene--centered" }, [
          createElement("h1", { text: "이아이와 함께 축제를 열어 주세요" }),
          createButton("이야기로 돌아가기", () => context.router.navigate("map"), "primary"),
        ]));
        return;
      }

      assetLease = context.services.assets.acquireGroup
        ? await context.services.assets.acquireGroup(battle.assetGroup, { signal })
        : null;
      if (!assetLease) await context.services.assets.loadGroup(battle.assetGroup, { signal });
      if (signal.aborted) return;

      const config = context.services.assets.get(battle.configAssetId);
      const arena = config?.arena ?? DEFAULT_ARENA;

      const frame = createElement("section", { className: "scene minigame-frame battle-frame" });
      const title = createElement("h1", { className: "game-title", text: battle.title });
      const partyRoster = Array.isArray(party?.roster)
        ? party.roster.slice(0, 5)
        : [];
      const titleGroup = createElement("div", { className: "battle-toolbar__title-group" }, [title]);
      let partyBadge = null;
      let latestSharedSnapshot = sharedBattle?.getSnapshot?.() ?? null;
      if (partyRoster.length > 0) {
        partyBadge = createElement("span", {
          className: "battle-party-badge",
          text: `${localTest ? "게스트 테스트 방" : "온라인 방"} · ${partyRoster.length}명`,
          attributes: {
            title: partyRoster.map((member) => member?.name ?? "플레이어").join(" · "),
          },
        });
      }
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
        if (!instance || startedAt === null || terminal || pauseReasons.has(reason)) return false;
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
        () => {
          if (sharedBattle) preserveRealtimeOnUnmount = true;
          return context.router.navigate(returnDestination.sceneId);
        },
        "ghost",
      );
      const toolbar = createElement("header", { className: "minigame-toolbar" }, [
        titleGroup,
        createElement("div", { className: "button-row" }, [pauseButton, quitButton]),
      ]);
      const stage = createElement("div", { className: "minigame-stage battle-stage" });
      const partyHud = sharedBattle
        ? createElement("aside", {
            className: "battle-party-hud",
            attributes: { "aria-label": "파티원 생명" },
          }, [
            createElement("strong", { className: "battle-party-hud__title", text: "PARTY" }),
            createElement("ul", { className: "battle-party-hud__list" }),
          ])
        : null;
      const playArea = createElement("div", { className: "battle-play-area" }, [
        partyHud,
        stage,
      ]);
      const controls = ["stat-boss", "word-breaker"].includes(battle.id) ? null : createBattleControls(config?.controls);
      frame.dataset.hasControls = String(Boolean(controls));
      frame.append(toolbar);
      if (controls) frame.append(controls);
      frame.append(playArea);
      root.append(frame);

      const renderPartyHud = (roster = latestSharedSnapshot?.roster ?? partyRoster) => {
        const list = partyHud?.querySelector?.(".battle-party-hud__list");
        if (!list) return;
        const publicSelfId = realtimeService?.getState?.()?.selfId ?? party?.selfId;
        const teammates = getOtherPartyMembers(roster, publicSelfId);
        partyHud.hidden = teammates.length === 0;
        playArea.dataset.hasParty = String(teammates.length > 0);
        const rows = teammates.map((member) => {
          const health = getPartyMemberHealthView(member);
          return createElement("li", {
            className: "battle-party-hud__member",
            dataset: {
              dead: String(health.dead),
              connected: String(member?.connected !== false),
            },
          }, [
            createElement("div", { className: "battle-party-hud__label" }, [
              createElement("strong", {
                text: member?.name || "플레이어",
              }),
              createElement("span", { text: health.label }),
            ]),
            createElement("span", { className: "battle-party-hud__track" }, [
              createElement("span", {
                className: "battle-party-hud__fill",
                attributes: { style: `width:${Math.max(0, Math.min(1, health.ratio)) * 100}%` },
              }),
            ]),
          ]);
        });
        if (typeof list.replaceChildren === "function") list.replaceChildren(...rows);
        else {
          for (const child of [...(list.children ?? [])]) child.remove?.();
          list.append(...rows);
        }
      };
      renderPartyHud(partyRoster);

      const renderSharedBattleState = (snapshot) => {
        latestSharedSnapshot = snapshot ?? latestSharedSnapshot;
        if (!partyBadge) {
          partyBadge = createElement("span", { className: "battle-party-badge" });
          }
        const roster = Array.isArray(snapshot?.roster) ? snapshot.roster : partyRoster;
        const publicSelfId = realtimeService?.getState?.()?.selfId ?? party?.selfId;
        const selfMember = roster.find((member) => member?.id === publicSelfId);
        if (
          Number.isFinite(selfMember?.hp)
          && Number.isInteger(selfMember?.maxHp)
          && selfMember.maxHp > 0
        ) {
          lastHealthSignature = `${selfMember.hp}/${selfMember.maxHp}`;
          if (lastHealthAttemptSignature === lastHealthSignature) {
            lastHealthAttemptSignature = null;
            lastHealthAttemptAt = 0;
          }
        }
        const connectedCount = roster.filter((member) => member?.connected !== false).length;
        const readyCount = roster.filter((member) => (
          member?.connected !== false && member?.ready === true
        )).length;
        partyBadge.textContent = isSharedPartyReady(snapshot)
          ? `온라인 방 · ${connectedCount}/${roster.length || partyRoster.length || 1}명`
          : `파티 준비 중 · ${readyCount}/${connectedCount || 1}명`;
        partyBadge.setAttribute(
          "title",
          roster.map((member) => member?.name ?? "플레이어").join(" · "),
        );
        renderPartyHud(roster);
        if (!instance || terminal) return;
        if (isSharedPartyReady(snapshot)) releasePause("PARTY_READY");
        else requestPause("PARTY_READY");
      };
      if (sharedBattle) {
        unsubscribeSharedBattleUi = sharedBattle.subscribe(renderSharedBattleState);
      }

      const module = await loadBattleModule(battle.module);
      if (signal.aborted) return;

      const onComplete = (callbackAttemptId, candidate) => {
        if (destroyed || terminal || callbackAttemptId !== currentAttemptId) return;
        if (sharedBattle && sharedBattle.getSnapshot()?.status !== "finished") {
          syncLocalHealth();
          if (candidate?.status === "FAIL" && sharedDefeatAttemptId !== callbackAttemptId) {
            sharedDefeatAttemptId = callbackAttemptId;
            const health = getBattlePlayerHealth(battle.id, instance?.getState?.(), localPlayerId);
            const maxHp = health?.maxHp ?? 100;
            forcedDefeatedHealth = Object.freeze({ hp: 0, maxHp });
            syncLocalHealth();
            showToast(context, getSharedDefeatMessage(
              sharedBattle.getSnapshot(), realtimeService?.getState?.()?.selfId ?? party?.selfId,
            ));
          }
          return;
        }
        terminal = true;
        const result = finalizeBattleCandidate({
          battleId: battle.id,
          id: currentAttemptId,
          durationMs: activeDurationMs(),
          candidate,
        });
        context.state.lastResult = result;
        if (sharedBattle && result.status === "CLEAR") {
          // The Durable Object has already committed the server-authoritative
          // boss reward before broadcasting battle.finished.
          void accountService.refreshSession();
        }
        const completedFinalStory = battle.id === FINAL_BATTLE_ID && result.status === "CLEAR";
        if (completedFinalStory) {
          markStorySeen(context, OUTRO_STORY_ID);
          void context.router.navigate("story-ending");
          return;
        }
        const resultIllustration = getBattleResultIllustration(battle.id, result.status);
        overlay = createResultOverlay({
          result,
          contextLabel,
          illustration: resultIllustration,
          notice: battle.id === RANDOM_FIELD_MINIGAME_ID
            ? (result.status === "CLEAR" ? "경험치 지급 확인 중…" : "획득 경험치 0")
            : null,
          presentation: sharedBattle
            ? {
                ...config?.resultPresentation,
                clear: {
                  ...config?.resultPresentation?.clear,
                  retryLabel: "새 파티 만들기",
                },
                fail: {
                  ...config?.resultPresentation?.fail,
                  retryLabel: "새 파티 만들기",
                },
              }
            : config?.resultPresentation,
          onRetry: shouldOfferBattleRetry(battle.id)
            ? () => {
                if (destroyed) return;
                runBattleRetryAction({
                  sharedBattle,
                  onSharedBattle: () => {
                    preserveRealtimeOnUnmount = true;
                    void context.router.navigate(returnDestination.sceneId);
                  },
                  onSolo: () => {
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
                });
              }
            : undefined,
          onMap: () => {
            if (sharedBattle) preserveRealtimeOnUnmount = true;
            if (battle.id === RANDOM_FIELD_MINIGAME_ID) {
              context.state.aftergameWorldState = {
                ...context.state.aftergameWorldState,
                zoneId: AFTERGAME_ZONE_IDS.FIELD,
              };
            }
            return context.router.navigate(returnDestination.sceneId);
          },
          onMenu: () => context.router.navigate("main-menu"),
          backgroundElements: [toolbar, stage.firstElementChild],
        });
        stage.append(overlay.element);
        if (battle.id === RANDOM_FIELD_MINIGAME_ID && result.status === "CLEAR") {
          const resultOverlay = overlay;
          void accountService.recordPostgameClear({
            attemptId: result.sessionId,
            battleId: battle.id,
            status: result.status,
            score: result.score,
          }).then((submission) => {
            if (destroyed || overlay !== resultOverlay) return;
            resultOverlay.setNotice(getXEggRewardNotice(submission));
          }).catch(() => {
            if (destroyed || overlay !== resultOverlay) return;
            resultOverlay.setNotice("경험치 저장을 확인하지 못했습니다");
          });
        }
      };

      instance = module.createBattle({
        root: stage,
        input: context.services.input,
        events: context.services.events,
        onComplete,
        audio: context.services.audio,
      });
      const player = createBattlePlayer(accountService.getState(), arena, {
        useAccountStats: battle.usesAccountStats !== false,
        useAccountAppearance: battle.id !== FINAL_BATTLE_ID,
      });
      localPlayerId = player.id;
      const publicSelfId = realtimeService?.getState?.()?.selfId ?? party?.selfId;
      const initialPlayerHealth = getResumedPartyHealth(latestSharedSnapshot, publicSelfId);
      if (initialPlayerHealth?.hp === 0) {
        forcedDefeatedHealth = initialPlayerHealth;
      }
      const sharedSeed = party?.seed ?? latestSharedSnapshot?.seed ?? null;
      await instance.init({
        ...config,
        arena,
        players: [player],
        sharedBattle,
        sharedSeed,
        ...(sharedSeed !== null ? { seed: sharedBattleSeed(sharedSeed) } : {}),
        initialPlayerHealth,
      }, { signal });
      if (signal.aborted) return;
      currentAttemptId = attemptId(battle.id);
      if (sharedBattle && realtimeService && instance.getPresenceRuntime) {
        battlePresence = bindBattlePresence({
          realtime: realtimeService, roomId: party.roomId, battleId: battle.id,
          getRuntime: () => instance?.getPresenceRuntime(),
          getRoster: () => sharedBattle?.getSnapshot()?.roster,
        });
      }
      const startBattle = () => {
        if (destroyed || signal.aborted || startedAt !== null) return;
        context.services.input.clear?.();
        startedAt = performance.now();
        instance.start({ attemptId: currentAttemptId });
        pauseButton.disabled = false;
        if (globalThis.document?.hidden) requestPause("VISIBILITY");
      };
      if (battle.id === FINAL_BATTLE_ID) {
        stage.dataset.showingGuide = "true";
        pauseButton.disabled = true;
        const gameView = stage.firstElementChild;
        gameView.hidden = true;
        if (controls) controls.hidden = true;
        frame.dataset.hasControls = "false";
        const instructions = createElement("section", {
          className: "battle-start-guide",
          attributes: { "aria-label": "마음의 말 부수기 게임 방법" },
        }, [
          createElement("h2", { text: "게임 방법" }),
          createElement("p", { text: "이아이의 말 사이를 움직이며, 노란색으로 표시된 말을 부숴 주세요." }),
          createElement("p", { text: "수호알이 깨어나면 전투가 잠시 멈춰요. 벗의 응원을 읽고 버튼이나 스페이스바로 이어가 주세요." }),
          createElement("ol", {}, [
            createElement("li", { text: "PC는 WASD·방향키, 휴대폰은 왼쪽 아래 조이스틱으로 이동합니다." }),
            createElement("li", { text: "빛은 위쪽으로 자동 발사됩니다. 노란색 글자 아래로 이동해 여러 번 맞히세요." }),
            createElement("li", { text: "다가오는 글자는 피하거나 부술 수 있습니다. 글자에 맞으면 생명이 줄어듭니다." }),
          ]),
        ]);
        const startButton = createButton("게임 시작", () => {
          if (destroyed || signal.aborted || startedAt !== null) return;
          instructions.remove();
          delete stage.dataset.showingGuide;
          stage.dataset.showingDialogue = "true";
          gameView.hidden = false;
          const introRoot = createElement("div", { className: "eiai-battle-intro" });
          stage.append(introRoot);
          introDialogue = createStoryDialogueView({ root: introRoot, lines: EIAI_BATTLE_INTRO, onComplete: () => {
            introDialogue?.destroy(); introDialogue = null; introRoot.remove();
            if (destroyed || signal.aborted) return;
            delete stage.dataset.showingDialogue;
            if (controls) controls.hidden = false;
            frame.dataset.hasControls = String(Boolean(controls));
            startBattle();
          } });
        }, "primary");
        instructions.append(startButton);
        stage.append(instructions);
      } else {
        startBattle();
      }
      if (initialPlayerHealth?.hp === 0) {
        sharedDefeatAttemptId = currentAttemptId;
        requestPause("PLAYER_DEFEATED");
        showToast(context, getSharedDefeatMessage(latestSharedSnapshot, publicSelfId));
      }
      if (sharedBattle) {
        syncLocalHealth = () => {
          if (destroyed || terminal || sharedBattle.getSnapshot?.()?.status === "finished") return null;
          const health = forcedDefeatedHealth
            ?? getBattlePlayerHealth(battle.id, instance?.getState?.(), localPlayerId);
          if (!health || (sharedDefeatAttemptId && health.hp > 0)) return health;
          const signature = `${health.hp}/${health.maxHp}`;
          if (signature === lastHealthSignature) return health;
          const now = globalThis.performance?.now?.() ?? Date.now();
          if (
            signature === lastHealthAttemptSignature
            && now - lastHealthAttemptAt < 1_000
          ) {
            return health;
          }
          if (sharedBattle.health?.(health) !== false) {
            lastHealthAttemptSignature = signature;
            lastHealthAttemptAt = now;
          }
          return health;
        };
        renderSharedBattleState(latestSharedSnapshot);
        syncLocalHealth();
        unsubscribeHealthChange = context.services.events.on(CHARACTER_EVENTS.HEALTH_CHANGE, (detail) => {
          if (detail?.characterId !== localPlayerId) return;
          // Allow the encounter to finish applying damage before reading it.
          queueMicrotask(() => syncLocalHealth());
        });
        if (typeof globalThis.setInterval === "function") {
          healthSyncTimer = globalThis.setInterval(syncLocalHealth, 250);
          healthSyncTimer?.unref?.();
        }
      }

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
      introDialogue?.destroy(); introDialogue = null;
      battlePresence?.destroy(); battlePresence = null;
      overlay?.destroy();
      overlay = null;
      instance?.destroy?.();
      instance = null;
      unsubscribeInput?.();
      unsubscribeInput = null;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      unsubscribeSharedBattleUi?.();
      unsubscribeSharedBattleUi = null;
      unsubscribeHealthChange?.();
      unsubscribeHealthChange = null;
      if (healthSyncTimer !== null) globalThis.clearInterval?.(healthSyncTimer);
      healthSyncTimer = null;
      releaseSharedBattleSession({
        sharedBattle,
        realtimeService,
        preserveRealtime: preserveRealtimeOnUnmount,
      });
      sharedBattle = null;
      realtimeService = null;
      assetLease?.release?.();
      assetLease = null;
    },
  };
}

function createBattleLoginRequiredScene(context) {
  return {
    mount(root) {
      const scene = createScene({
        className: "scene--centered battle-login-required",
        eyebrow: "BATTLE · LOGIN REQUIRED",
        title: "배틀은 로그인 후 이용할 수 있어요",
        description: "Google 계정으로 로그인하면 보스방을 만들거나 참가하고, 파티 전투를 이어갈 수 있습니다.",
      });
      scene.append(createElement("div", { className: "button-row" }, [
        createButton("Google 로그인", () => context.router.navigate("account", {
          notice: "보스 배틀을 시작하려면 Google 로그인이 필요합니다.",
          noticeTone: "info",
        }), "primary"),
        createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
      ]));
      root.append(scene);
    },
    unmount() {},
  };
}

export function createBattleScene(context) {
  let activeScene = null;
  let preparedCampus = null;
  let sessionPrepared = false;
  async function prepareSession(params) {
    if (requiresAuthenticatedBattleSession(params.battleId, {
      guestBattleTesting: context.config.features?.guestBattleTesting === true,
    })) {
      try { await context.services.account.refreshSession(); }
      catch { /* Keep the existing account error for the login screen. */ }
    }
    sessionPrepared = true;
  }
  return {
    async prepare(params = {}, lifecycle) {
      await prepareSession(params);
      if(lifecycle?.signal?.aborted) return;
      if (!params.battleId && !params.legacyWorld && context.config.features?.campusMap === true
        && publishedBattles(context).length > 0
        && (context.services.account.getState().authenticated || context.config.features?.guestBattleTesting === true)) {
        preparedCampus = createCampusScene(context, { mode: "after" });
        await preparedCampus.prepare(params,lifecycle);
      }
    },
    async mount(root, params = {}, lifecycle) {
      const guestBattleTesting = context.config.features?.guestBattleTesting === true;
      const loginRequired = requiresAuthenticatedBattleSession(params.battleId, {
        guestBattleTesting,
      });
      if (!sessionPrepared) await prepareSession(params);
      if (lifecycle?.signal?.aborted) return;
      if (loginRequired && !context.services.account.getState().authenticated) {
        context.services.postgameRealtime?.disconnect?.();
        activeScene = createBattleLoginRequiredScene(context);
        return activeScene.mount(root, params, lifecycle);
      }
      const definitions = publishedBattles(context);
      if (definitions.length === 0) {
        activeScene = createBattleComingSoonScene(context);
      } else if (!params.battleId) {
        activeScene = context.config.features?.campusMap === true && !params.legacyWorld
          ? preparedCampus ?? createCampusScene(context, { mode: "after" })
          : createBattleEntryScene(context);
      } else {
        const battle = findBattle(context, params.battleId);
        if (!battle) throw new Error(`배틀을 찾을 수 없습니다: ${params.battleId}`);
        const unlock = getBattleUnlockStatus(
          battle,
          context.services.save?.getState?.() ?? {},
          context.services.account.getState(),
        );
        const missingSharedRoom = SHARED_BOSS_IDS.has(battle.id) && !params?.party?.roomId;
        activeScene = unlock.unlocked && !missingSharedRoom
          ? createBattlePlayScene(context, battle)
          : createBattleEntryScene(context, {
              notice: missingSharedRoom
                ? "보스 전투는 광장의 보스 문에서 방을 만들거나 참가한 뒤 시작해 주세요."
                : "잠긴 배틀에는 바로 입장할 수 없습니다.",
            });
      }
      return activeScene.mount(root, params, lifecycle);
    },
    unmount() {
      return activeScene?.unmount?.();
    },
  };
}

export default createBattleScene;

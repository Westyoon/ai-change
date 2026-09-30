import { FINAL_BATTLE_ID, getPublishedBattles } from "../battle/registry.js";
import {
  CharacterSystem,
  CharacterView,
  VirtualJoystick,
  createCharacterActorElement,
} from "../battle/character/index.js";
import { DEFAULT_PLAYER_APPEARANCE } from "../battle/player-config.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import {
  getGuardianEggCatalog,
  getGuardianEggProgressFromState,
} from "../core/guardian-inventory.js";
import { GameLoop } from "../core/game-loop.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import {
  FINAL_BATTLE_UNLOCK_STORY_ID,
  hasSeenStory,
  markStorySeen,
} from "../core/story-progress.js";
import { createButton, createElement, createScene, findDepartment, findMap } from "./scene-utils.js";
import {
  STORY_WORLD_ACTOR_SIZE,
  calculateStoryWorldLayout,
  findNearestStoryTarget,
  normalizeStoryWorldSize,
  resolveStoryWorldStartPosition,
} from "./story-world-runtime.js";
import { createStoryInventory } from "../ui/story-inventory.js";

export const STORY_INVENTORY_SLOT_SELECTOR = "[data-story-inventory-slot]";

const FINAL_PORTAL_TARGET_ID = "story-final-portal";
const STORY_CHARACTER_ID = "story-map-player";

function saveState(context) {
  return context.services?.save?.getState?.() ?? context.services?.save?.state ?? {};
}

function setWorldPlacement(element, point, worldSize, { width = 56, height = 72 } = {}) {
  if (!element?.style) return element;
  element.style.left = `${(Number(point?.x ?? 0) / worldSize.width) * 100}%`;
  element.style.top = `${(Number(point?.y ?? 0) / worldSize.height) * 100}%`;
  element.style.width = `${(width / worldSize.width) * 100}%`;
  element.style.height = `${(height / worldSize.height) * 100}%`;
  element.style.zIndex = String(1000 + Math.round(Number(point?.y ?? 0)));
  return element;
}

function mapObstacles(map) {
  return (map?.obstacles ?? []).map((obstacle) => obstacle?.bounds ?? obstacle);
}

function storyNpcState(context, npc, completedGameIds) {
  const localState = saveState(context);
  const completed = Boolean(localState.story?.completedNpcIds?.includes(npc.id)
    || localState.minigames?.[npc.miniGameId]?.completed === true
    || completedGameIds.has(npc.miniGameId));
  const storySeen = hasSeenStory(context, npc.id, {
    legacyNpcId: npc.id,
    completedMiniGameId: npc.miniGameId,
  });
  const clearStoryPending = Boolean(
    completed
    && typeof npc.clearStoryId === "string"
    && npc.clearStoryId.length > 0
    && typeof npc.clearScriptId === "string"
    && npc.clearScriptId.length > 0
    && !hasSeenStory(context, npc.clearStoryId),
  );
  return Object.freeze({ completed, storySeen, clearStoryPending });
}

export function getMapCardDestination(
  npc,
  { storySeen = false, replay = false, clearStoryPending = false } = {},
) {
  if (
    typeof npc?.id !== "string"
    || npc.id.length === 0
    || typeof npc?.miniGameId !== "string"
    || npc.miniGameId.length === 0
    || typeof npc?.firstScript !== "string"
    || npc.firstScript.length === 0
  ) {
    throw new TypeError("Map NPC requires id, firstScript, and miniGameId for story play.");
  }
  if (!replay && clearStoryPending) {
    if (typeof npc.clearScriptId !== "string" || npc.clearScriptId.length === 0) {
      throw new TypeError("A pending guardian after-story requires clearScriptId.");
    }
    return Object.freeze({
      sceneId: "dialogue",
      params: Object.freeze({ npcId: npc.id, scriptId: npc.clearScriptId }),
    });
  }
  return replay || !storySeen
    ? Object.freeze({
        sceneId: "dialogue",
        params: Object.freeze({ npcId: npc.id, scriptId: npc.firstScript }),
      })
    : Object.freeze({
        sceneId: "minigame-intro",
        params: Object.freeze({ miniGameId: npc.miniGameId }),
      });
}

export function getMiniGameStoryDestination(context, miniGameId, { replay = false } = {}) {
  if (typeof miniGameId !== "string" || miniGameId.length === 0) {
    throw new TypeError("Mini-game story routing requires a miniGameId.");
  }
  const map = findMap(context);
  const npc = map?.npcs?.find((candidate) => candidate.miniGameId === miniGameId);
  if (!npc) {
    throw new Error(`학과 스토리 진입점을 찾을 수 없습니다: ${miniGameId}`);
  }
  const accountCompleted = new Set(
    context.services?.account?.getState?.()?.completedGameIds ?? [],
  );
  const state = storyNpcState(context, npc, accountCompleted);
  return getMapCardDestination(npc, { replay, ...state });
}

export function getFinalBattleDestination(battle) {
  if (battle?.id !== FINAL_BATTLE_ID) {
    throw new TypeError(`Final Battle requires ${FINAL_BATTLE_ID}.`);
  }
  return Object.freeze({
    sceneId: "battle",
    params: Object.freeze({ battleId: FINAL_BATTLE_ID }),
  });
}

export function resolveUnlockedFinalBattle(
  definitions,
  localSaveState,
  accountState,
  guardianEggCatalog,
) {
  const battle = getPublishedBattles(definitions).find(({ id }) => id === FINAL_BATTLE_ID);
  if (!battle) return null;
  const unlock = getBattleUnlockStatus(battle, localSaveState, accountState);
  const guardianProgress = getGuardianEggProgressFromState(
    localSaveState,
    accountState,
    guardianEggCatalog,
  );
  if (!unlock.unlocked || guardianProgress.acquired !== guardianProgress.total) return null;
  return Object.freeze({
    battle,
    destination: getFinalBattleDestination(battle),
  });
}

export function createMapDestinationNavigator(context) {
  let selectionPending = false;
  return (destination) => {
    if (selectionPending) return false;
    if (typeof destination?.sceneId !== "string" || destination.sceneId.length === 0) {
      throw new TypeError("Map destination requires a sceneId.");
    }
    selectionPending = true;
    void context.router.navigate(destination.sceneId, destination.params ?? {});
    return true;
  };
}

export function createMapGameNavigator(context) {
  const navigate = createMapDestinationNavigator(context);
  return (npc, { replay = false } = {}) => {
    const accountCompleted = new Set(
      context.services?.account?.getState?.()?.completedGameIds ?? [],
    );
    return navigate(getMapCardDestination(npc, {
      replay,
      ...storyNpcState(context, npc, accountCompleted),
    }));
  };
}

export function isStoryWorldInteractAction(event = {}) {
  return event.phase === "press"
    && (event.action === INPUT_ACTIONS.INTERACT || event.action === INPUT_ACTIONS.CONFIRM);
}

export function getStoryNpcProgressPresentation({
  completed = false,
  storySeen = false,
  clearStoryPending = false,
} = {}) {
  if (clearStoryPending) {
    return Object.freeze({ progress: "reward-pending", indicator: "!" });
  }
  if (completed) {
    return Object.freeze({ progress: "complete", indicator: "✓" });
  }
  if (storySeen) {
    return Object.freeze({ progress: "seen", indicator: "…" });
  }
  return Object.freeze({ progress: "new", indicator: "!" });
}

export function createMapScene(context) {
  let mounted = false;
  let loop = null;
  let system = null;
  let joystick = null;
  let resizeObserver = null;
  let unsubscribeInput = null;
  let unsubscribeAccount = null;
  let removeWindowResize = null;
  let inventory = null;
  let latestSnapshot = null;
  let navigationPending = false;
  let positionDirty = false;

  return {
    mount(root, _params = {}, { signal } = {}) {
      mounted = true;
      const map = findMap(context);
      if (!map) throw new Error(`맵을 찾을 수 없습니다: ${context.config.mainMapId}`);
      const worldSize = normalizeStoryWorldSize(map.worldSize);
      const localSaveState = saveState(context);
      const accountState = context.services?.account?.getState?.() ?? {};
      const scene = createScene({ className: "map-scene story-world-scene" });
      const inventorySlot = createElement("div", {
        className: "story-world__inventory-slot",
        dataset: { storyInventorySlot: "true" },
        attributes: { "aria-label": "수호알 인벤토리 영역" },
      });
      const toolbarActions = createElement("div", { className: "story-world__toolbar-actions" });
      const toolbar = createElement("header", { className: "story-world__toolbar" }, [
        createElement("div", { className: "story-world__heading" }, [
          createElement("p", { className: "eyebrow", text: "STORY · FESTIVAL WORLD" }),
          createElement("h2", { text: "수호알 광장" }),
        ]),
        createElement("div", { className: "story-world__toolbar-right" }, [inventorySlot, toolbarActions]),
      ]);

      const viewport = createElement("section", {
        className: "story-world__viewport",
        attributes: {
          role: "application",
          "aria-label": "캐릭터로 이동해 수호자와 대화하는 축제 맵",
          "aria-describedby": "story-world-controls",
        },
      });
      const surface = createElement("div", {
        className: "story-world__surface",
        dataset: { mapId: map.id },
        attributes: { "aria-hidden": "false" },
      }, [
        createElement("div", { className: "story-world__grid", attributes: { "aria-hidden": "true" } }),
        createElement("div", { className: "story-world__plaza-mark story-world__plaza-mark--one", attributes: { "aria-hidden": "true" } }),
        createElement("div", { className: "story-world__plaza-mark story-world__plaza-mark--two", attributes: { "aria-hidden": "true" } }),
      ]);

      const npcElements = new Map();
      for (const npc of map.npcs ?? []) {
        const department = findDepartment(context, npc.departmentCode);
        const indicator = createElement("span", {
          className: "story-world__npc-indicator",
          text: "!",
          attributes: { "aria-hidden": "true" },
        });
        const npcElement = createElement("div", {
          className: "story-world__npc",
          dataset: { npcId: npc.id, departmentCode: npc.departmentCode },
          attributes: {
            role: "img",
            "aria-label": `${department?.displayName ?? npc.departmentCode} 수호자`,
          },
        }, [
          indicator,
          createElement("span", { className: "story-world__npc-sprite", attributes: { "aria-hidden": "true" } }),
        ]);
        setWorldPlacement(npcElement, npc, worldSize);
        npcElements.set(npc.id, { element: npcElement, indicator });
        surface.append(npcElement);
      }

      const finalPortalPoint = Object.freeze({
        id: FINAL_PORTAL_TARGET_ID,
        kind: "final",
        x: worldSize.width / 2,
        y: 82,
        interactionRadius: 76,
      });
      const finalPortal = createElement("div", {
        className: "story-world__final-portal",
        dataset: { locked: "true", battleId: FINAL_BATTLE_ID },
        attributes: {
          role: "img",
          "aria-label": "수호알 다섯 개를 모으면 열리는 마지막 이야기 입구",
        },
      }, [
        createElement("span", { className: "story-world__final-portal-icon", text: "◇", attributes: { "aria-hidden": "true" } }),
        createElement("span", { className: "story-world__final-portal-label", text: "아직 잠겨 있어요" }),
      ]);
      setWorldPlacement(finalPortal, finalPortalPoint, worldSize, { width: 78, height: 92 });
      surface.append(finalPortal);

      const localActor = createCharacterActorElement({ local: true });
      localActor.dataset.characterId = STORY_CHARACTER_ID;
      surface.append(localActor);
      const prompt = createElement("div", {
        className: "story-world__prompt",
        text: "수호자에게 가까이 가 보세요",
        attributes: { role: "status", "aria-live": "polite" },
      });
      prompt.hidden = true;

      const joystickKnob = createElement("span", {
        className: "character-joystick__knob",
        attributes: { "aria-hidden": "true" },
      });
      const joystickBase = createElement("div", {
        className: "character-joystick story-world__joystick",
        attributes: { role: "group", "aria-label": "이동 조이스틱" },
      }, [
        joystickKnob,
        createElement("span", { className: "character-joystick__label", text: "MOVE" }),
      ]);
      const interactButton = createElement("button", {
        className: "character-attack-button story-world__interact-button",
        text: "대화",
        type: "button",
        disabled: true,
        dataset: { action: INPUT_ACTIONS.INTERACT },
        attributes: { "aria-label": "가까운 수호자와 대화" },
      });
      const touchControls = createElement("div", {
        className: "character-touch-controls story-world__touch-controls",
        attributes: { "aria-label": "모바일 스토리 맵 조작" },
      }, [joystickBase, interactButton]);
      viewport.append(surface, prompt, touchControls);

      const controls = createElement("p", {
        className: "story-world__controls muted",
        text: "WASD·방향키 이동 · 수호자 가까이에서 Space / Enter / E로 대화",
        attributes: { id: "story-world-controls" },
      });
      scene.append(toolbar, viewport, controls);
      root.append(scene);

      const guardedNavigate = createMapDestinationNavigator(context);
      let finalEntry = null;
      let nearest = null;

      const persistPosition = () => {
        if (!system || typeof context.services?.save?.updateMapPosition !== "function") return;
        const snapshot = system.getSnapshot();
        context.services.save.updateMapPosition(map.id, { x: snapshot.x, y: snapshot.y });
        positionDirty = false;
      };

      const leaveMap = (destination) => {
        if (navigationPending) return false;
        persistPosition();
        system?.setControlLocked(true, "story-map-navigation");
        joystick?.reset();
        context.services?.input?.clear?.();
        const accepted = guardedNavigate(destination);
        navigationPending = accepted;
        if (!accepted) system?.setControlLocked(false, "story-map-navigation");
        return accepted;
      };

      toolbarActions.append(
        createButton("메뉴", () => leaveMap({ sceneId: "main-menu" }), "ghost"),
      );

      const updateNpcProgress = (currentAccountState = {}) => {
        const accountCompleted = new Set(currentAccountState.completedGameIds ?? []);
        for (const npc of map.npcs ?? []) {
          const view = npcElements.get(npc.id);
          if (!view) continue;
          const state = storyNpcState(context, npc, accountCompleted);
          const presentation = getStoryNpcProgressPresentation(state);
          view.element.dataset.progress = presentation.progress;
          view.indicator.textContent = presentation.indicator;
        }
      };

      const renderFinalPortal = (currentAccountState = {}) => {
        const definitions = context.config.features?.battleContent === true
          ? context.content.battles
          : [];
        finalEntry = resolveUnlockedFinalBattle(
          definitions,
          saveState(context),
          currentAccountState,
          getGuardianEggCatalog(context),
        );
        finalPortal.dataset.locked = String(!finalEntry);
        finalPortal.querySelector?.(".story-world__final-portal-label")?.replaceChildren?.(
          document.createTextNode(finalEntry ? "마지막 이야기" : "아직 잠겨 있어요"),
        );
        finalPortal.setAttribute(
          "aria-label",
          finalEntry
            ? `${finalEntry.battle.title}, 가까이에서 상호작용해 입장`
            : "수호알 다섯 개를 모으면 열리는 마지막 이야기 입구",
        );
      };

      const updateAccountState = (currentAccountState = {}) => {
        if (!mounted) return;
        updateNpcProgress(currentAccountState);
        renderFinalPortal(currentAccountState);
      };
      updateAccountState(accountState);

      const getInteractionTargets = () => [
        ...(map.npcs ?? []).map((npc) => ({ ...npc, kind: "npc" })),
        ...(finalEntry ? [finalPortalPoint] : []),
      ];

      const updateNearest = (snapshot) => {
        const next = findNearestStoryTarget(getInteractionTargets(), snapshot);
        const previousId = nearest?.target?.id ?? null;
        const nextId = next?.target?.id ?? null;
        if (previousId === nextId) return;
        if (previousId && npcElements.has(previousId)) {
          delete npcElements.get(previousId).element.dataset.nearby;
        }
        nearest = next;
        if (nextId && npcElements.has(nextId)) {
          npcElements.get(nextId).element.dataset.nearby = "true";
        }
        finalPortal.dataset.nearby = String(nextId === FINAL_PORTAL_TARGET_ID);
        prompt.hidden = !next;
        interactButton.disabled = !next;
        if (!next) return;
        const isFinal = next.target.id === FINAL_PORTAL_TARGET_ID;
        prompt.textContent = isFinal
          ? "Space / Enter / E · 마지막 이야기로 들어가기"
          : "Space / Enter / E · 이야기 나누기";
        interactButton.textContent = isFinal ? "입장" : "대화";
        interactButton.setAttribute("aria-label", isFinal ? "마지막 이야기 입장" : "가까운 수호자와 대화");
      };

      const interact = () => {
        if (navigationPending || inventory?.isOpen || !system) return false;
        updateNearest(system.getSnapshot());
        const target = nearest?.target;
        if (!target) return false;
        if (target.id === FINAL_PORTAL_TARGET_ID) {
          if (!finalEntry) return false;
          markStorySeen(context, FINAL_BATTLE_UNLOCK_STORY_ID);
          return leaveMap(finalEntry.destination);
        }
        const npc = (map.npcs ?? []).find((candidate) => candidate.id === target.id);
        if (!npc) return false;
        const accountCompleted = new Set(
          context.services?.account?.getState?.()?.completedGameIds ?? [],
        );
        const destination = getMapCardDestination(
          npc,
          storyNpcState(context, npc, accountCompleted),
        );
        return leaveMap(destination);
      };

      const startPosition = resolveStoryWorldStartPosition(map, localSaveState, STORY_WORLD_ACTOR_SIZE);
      system = new CharacterSystem({
        events: context.services?.events,
        inputManager: context.services?.input,
        inputOptions: { attackEnabled: false },
        character: {
          id: STORY_CHARACTER_ID,
          ...startPosition,
          ...STORY_WORLD_ACTOR_SIZE,
          speed: 190,
          maxHealth: 1,
          currentHealth: 1,
          appearance: DEFAULT_PLAYER_APPEARANCE,
        },
        world: {
          bounds: { x: 0, y: 0, width: worldSize.width, height: worldSize.height },
          colliders: mapObstacles(map),
        },
      }).start();
      latestSnapshot = system.getSnapshot();

      inventory = createStoryInventory({
        context,
        onOpen: () => {
          system?.setControlLocked(true, "story-inventory");
          joystick?.reset();
          context.services?.input?.clear?.();
          viewport.inert = true;
          toolbarActions.inert = true;
        },
        onClose: () => {
          system?.setControlLocked(false, "story-inventory");
          context.services?.input?.clear?.();
          viewport.inert = false;
          toolbarActions.inert = false;
        },
        onOpenMemories: () => leaveMap({ sceneId: "story-memories" }),
      });
      inventorySlot.append(inventory.element);

      const canRenderActor = Boolean(localActor?.style && typeof localActor.querySelector === "function");
      const view = canRenderActor
        ? new CharacterView({ element: localActor, worldSize })
        : null;
      const isPortraitCamera = () => {
        const rect = viewport.getBoundingClientRect?.();
        const width = Number(rect?.width ?? viewport.clientWidth ?? 0);
        const height = Number(rect?.height ?? viewport.clientHeight ?? 0);
        return width > 0 && height > width && width <= 760;
      };
      const layoutWorld = () => {
        if (!surface.style || !viewport.getBoundingClientRect) return;
        const rect = viewport.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return;
        const layout = calculateStoryWorldLayout({
          worldSize,
          viewportSize: rect,
          focusBounds: latestSnapshot,
          camera: isPortraitCamera(),
        });
        surface.style.width = `${layout.width}px`;
        surface.style.height = `${layout.height}px`;
        surface.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0)`;
        viewport.dataset.camera = layout.camera ? "follow" : "full-map";
      };
      const render = () => {
        view?.render(latestSnapshot);
        updateNearest(latestSnapshot);
        layoutWorld();
      };
      render();

      if (
        joystickBase?.style
        && joystickKnob?.style
        && typeof joystickBase.removeEventListener === "function"
      ) {
        joystick = new VirtualJoystick({
          element: joystickBase,
          knob: joystickKnob,
          onChange: (vector) => system?.setJoystickVector(vector),
        });
      }

      unsubscribeInput = context.services?.input?.onAction?.((event) => {
        if (isStoryWorldInteractAction(event)) interact();
      }) ?? null;
      interactButton.addEventListener("click", (event) => {
        if (event.detail === 0) interact();
      });

      loop = new GameLoop({
        update(deltaMs) {
          const previousX = latestSnapshot.x;
          const previousY = latestSnapshot.y;
          latestSnapshot = system.update(deltaMs);
          if (latestSnapshot.x !== previousX || latestSnapshot.y !== previousY) positionDirty = true;
        },
        render,
      });
      loop.start();

      if (typeof ResizeObserver === "function" && viewport?.style) {
        resizeObserver = new ResizeObserver(layoutWorld);
        resizeObserver.observe(viewport);
      } else if (globalThis.addEventListener) {
        globalThis.addEventListener("resize", layoutWorld);
        removeWindowResize = () => globalThis.removeEventListener?.("resize", layoutWorld);
      }
      const handleVisibility = () => {
        if (document.hidden) loop?.pause();
        else loop?.resume();
      };
      document.addEventListener?.("visibilitychange", handleVisibility, signal ? { signal } : undefined);
      globalThis.addEventListener?.("pagehide", persistPosition, signal ? { signal } : undefined);

      if (typeof context.services?.account?.subscribe === "function") {
        unsubscribeAccount = context.services.account.subscribe(updateAccountState);
      }

    },
    unmount() {
      if (positionDirty && !navigationPending) {
        const state = system?.getSnapshot();
        if (state && typeof context.services?.save?.updateMapPosition === "function") {
          context.services.save.updateMapPosition(
            context.config.mainMapId,
            { x: state.x, y: state.y },
          );
        }
      }
      mounted = false;
      loop?.destroy();
      loop = null;
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      removeWindowResize?.();
      removeWindowResize = null;
      unsubscribeInput?.();
      unsubscribeInput = null;
      joystick?.destroy();
      joystick = null;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      inventory?.destroy();
      inventory = null;
      system?.destroy();
      system = null;
      latestSnapshot = null;
      navigationPending = false;
      positionDirty = false;
    },
  };
}

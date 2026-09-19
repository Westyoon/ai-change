import { FINAL_BATTLE_ID, getPublishedBattles } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { createButton, createElement, createScene, findDepartment, findMap, findMiniGame } from "./scene-utils.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
}

export function getMapCardDestination(npc) {
  if (typeof npc?.miniGameId !== "string" || npc.miniGameId.length === 0) {
    throw new TypeError("Map NPC requires a miniGameId for direct play.");
  }
  return Object.freeze({
    sceneId: "minigame",
    params: Object.freeze({ miniGameId: npc.miniGameId }),
  });
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

export function resolveUnlockedFinalBattle(definitions, localSaveState, accountState) {
  const battle = getPublishedBattles(definitions).find(({ id }) => id === FINAL_BATTLE_ID);
  if (!battle) return null;
  const unlock = getBattleUnlockStatus(battle, localSaveState, accountState);
  if (!unlock.unlocked) return null;
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
  return (npc) => navigate(getMapCardDestination(npc));
}

export function createMapScene(context) {
  let mounted = false;
  let unsubscribeAccount = null;

  return {
    mount(root) {
      mounted = true;
      const map = findMap(context);
      if (!map) throw new Error(`맵을 찾을 수 없습니다: ${context.config.mainMapId}`);
      const localSaveState = saveState(context);
      const completedNpcIds = new Set(localSaveState.story?.completedNpcIds ?? []);
      const accountState = context.services.account.getState();
      const completedGameIds = new Set(accountState.completedGameIds ?? []);
      const scene = createScene({ className: "map-scene" });
      const header = createElement("header", { className: "map-header" });
      const titleGroup = createElement("div", {}, [
        createElement("p", { className: "eyebrow", text: "FESTIVAL MAIN MAP · DIRECT PLAY" }),
        createElement("h2", { text: "학과별 미니게임" }),
        createElement("p", {
          className: "muted",
          text: "학과 카드를 선택하면 해당 미니게임이 시작됩니다. 다섯 게임을 모두 완료하면 최종전이 이 목록에 추가됩니다.",
        }),
      ]);
      const nav = createElement("div", { className: "button-row" }, [
        createButton("게임 방법", () => context.router.navigate("how-to"), "ghost"),
        createButton("메뉴", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      header.append(titleGroup, nav);

      const mapGrid = createElement("section", { className: "department-map", attributes: { "aria-label": "학과별 미니게임 목록" } });
      const navigate = createMapDestinationNavigator(context);
      for (const npc of map.npcs ?? []) {
        const game = findMiniGame(context, npc.miniGameId);
        const department = findDepartment(context, npc.departmentCode);
        const completed = completedNpcIds.has(npc.id) || completedGameIds.has(npc.miniGameId);
        const card = createElement("button", {
          className: "npc-card",
          type: "button",
          dataset: { departmentCode: npc.departmentCode, npcId: npc.id },
          attributes: {
            "aria-label": `${department?.displayName ?? npc.departmentCode} · ${game?.title ?? "미니게임"} 바로 실행 · ${completed ? "완료" : "미완료"}`,
          },
          on: {
            click: () => navigate(getMapCardDestination(npc)),
          },
        }, [
          createElement("span", { className: "npc-indicator", text: completed ? "✓" : "!", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "npc-card__code", text: npc.departmentCode }),
          createElement("span", { className: "npc-card__name", text: department?.displayName ?? npc.departmentCode }),
          createElement("span", { className: "npc-card__game", text: `${game?.title ?? "미니게임"} · 바로 플레이` }),
        ]);
        mapGrid.append(card);
      }

      let finalBattleCard = null;
      const renderFinalBattle = (currentAccountState) => {
        if (!mounted) return;
        const definitions = context.config.features?.battleContent === true
          ? context.content.battles
          : [];
        const entry = resolveUnlockedFinalBattle(
          definitions,
          saveState(context),
          currentAccountState,
        );
        if (!entry) {
          finalBattleCard?.remove();
          finalBattleCard = null;
          return;
        }
        if (finalBattleCard) return;
        finalBattleCard = createElement("button", {
          className: "npc-card npc-card--final",
          type: "button",
          dataset: {
            nodeType: "final",
            battleId: entry.battle.id,
          },
          attributes: {
            "aria-label": `최종전 · ${entry.battle.title} · 해금됨 · 바로 실행`,
          },
          on: {
            click: () => navigate(entry.destination),
          },
        }, [
          createElement("span", { className: "npc-indicator", text: "★", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "npc-card__code", text: "FINAL BATTLE" }),
          createElement("span", { className: "npc-card__name", text: entry.battle.title }),
          createElement("span", { className: "npc-card__game", text: "수호알 5개 완성 · 최종전 시작" }),
        ]);
        mapGrid.append(finalBattleCard);
      };

      scene.append(header, mapGrid);
      root.append(scene);
      if (typeof context.services.account.subscribe === "function") {
        unsubscribeAccount = context.services.account.subscribe(renderFinalBattle);
      } else {
        renderFinalBattle(accountState);
      }
    },
    unmount() {
      mounted = false;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
    },
  };
}

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

export function createMapGameNavigator(context) {
  let selectionPending = false;
  return (npc) => {
    if (selectionPending) return false;
    const destination = getMapCardDestination(npc);
    selectionPending = true;
    void context.router.navigate(destination.sceneId, destination.params);
    return true;
  };
}

export function createMapScene(context) {
  return {
    mount(root) {
      const map = findMap(context);
      if (!map) throw new Error(`맵을 찾을 수 없습니다: ${context.config.mainMapId}`);
      const completedNpcIds = new Set(saveState(context).story?.completedNpcIds ?? []);
      const scene = createScene({ className: "map-scene" });
      const header = createElement("header", { className: "map-header" });
      const titleGroup = createElement("div", {}, [
        createElement("p", { className: "eyebrow", text: "FESTIVAL MAIN MAP · DIRECT PLAY" }),
        createElement("h2", { text: "학과별 미니게임" }),
        createElement("p", { className: "muted", text: "학과 카드를 선택하면 해당 미니게임이 바로 시작됩니다." }),
      ]);
      const nav = createElement("div", { className: "button-row" }, [
        createButton("게임 방법", () => context.router.navigate("how-to"), "ghost"),
        createButton("메뉴", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      header.append(titleGroup, nav);

      const mapGrid = createElement("section", { className: "department-map", attributes: { "aria-label": "학과별 미니게임 목록" } });
      const launchGame = createMapGameNavigator(context);
      for (const npc of map.npcs ?? []) {
        const game = findMiniGame(context, npc.miniGameId);
        const department = findDepartment(context, npc.departmentCode);
        const completed = completedNpcIds.has(npc.id);
        const card = createElement("button", {
          className: "npc-card",
          type: "button",
          dataset: { departmentCode: npc.departmentCode, npcId: npc.id },
          attributes: {
            "aria-label": `${department?.displayName ?? npc.departmentCode} · ${game?.title ?? "미니게임"} 바로 실행 · ${completed ? "완료" : "미완료"}`,
          },
          on: {
            click: () => launchGame(npc),
          },
        }, [
          createElement("span", { className: "npc-indicator", text: completed ? "✓" : "!", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "npc-card__code", text: npc.departmentCode }),
          createElement("span", { className: "npc-card__name", text: department?.displayName ?? npc.departmentCode }),
          createElement("span", { className: "npc-card__game", text: `${game?.title ?? "미니게임"} · 바로 플레이` }),
        ]);
        mapGrid.append(card);
      }

      scene.append(header, mapGrid);
      root.append(scene);
    },
  };
}

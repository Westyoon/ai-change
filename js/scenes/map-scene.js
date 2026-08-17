import { createButton, createElement, createScene, findDepartment, findMap, findMiniGame } from "./scene-utils.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
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
        createElement("p", { className: "eyebrow", text: "FESTIVAL MAIN MAP · SCAFFOLD" }),
        createElement("h2", { text: "학과 NPC 연결 맵" }),
        createElement("p", { className: "muted", text: "현재는 이동·충돌 구현 전 단계로, 학과 카드를 NPC 상호작용 지점으로 사용합니다." }),
      ]);
      const nav = createElement("div", { className: "button-row" }, [
        createButton("게임 방법", () => context.router.navigate("how-to"), "ghost"),
        createButton("메뉴", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      header.append(titleGroup, nav);

      const mapGrid = createElement("section", { className: "department-map", attributes: { "aria-label": "학과 NPC 목록" } });
      for (const npc of map.npcs ?? []) {
        const game = findMiniGame(context, npc.miniGameId);
        const department = findDepartment(context, npc.departmentCode);
        const completed = completedNpcIds.has(npc.id);
        const card = createElement("button", {
          className: "npc-card",
          type: "button",
          dataset: { departmentCode: npc.departmentCode, npcId: npc.id },
          attributes: {
            "aria-label": `${department?.displayName ?? npc.departmentCode} NPC와 대화하기 · ${completed ? "완료" : "미완료"}`,
          },
          on: {
            click: () => {
              context.state.pendingNpcId = npc.id;
              void context.router.navigate("dialogue", { npcId: npc.id });
            },
          },
        }, [
          createElement("span", { className: "npc-indicator", text: completed ? "✓" : "!", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "npc-card__code", text: npc.departmentCode }),
          createElement("span", { className: "npc-card__name", text: department?.displayName ?? npc.departmentCode }),
          createElement("span", { className: "npc-card__game", text: game?.title ?? "스토리 콘텐츠" }),
        ]);
        mapGrid.append(card);
      }

      scene.append(header, mapGrid);
      root.append(scene);
    },
  };
}

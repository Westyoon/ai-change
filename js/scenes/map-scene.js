import { getCompletedMiniGameIds } from "../battle/unlock.js";
import { createButton, createElement, createScene, findDepartment, findMap, findMiniGame } from "./scene-utils.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
}

export function getMapCardDestination(npc) {
  if (typeof npc?.id !== "string" || npc.id.length === 0) {
    throw new TypeError("Map NPC requires an id for its story dialogue.");
  }
  return Object.freeze({
    sceneId: "dialogue",
    params: Object.freeze({ npcId: npc.id }),
  });
}

export function createMapGameNavigator(context) {
  let selectionPending = false;
  return (npc) => {
    if (selectionPending) return false;
    const destination = getMapCardDestination(npc);
    selectionPending = true;
    if (context.state) context.state.pendingNpcId = npc.id;
    void context.router.navigate(destination.sceneId, destination.params);
    return true;
  };
}

export function createMapScene(context) {
  return {
    mount(root) {
      const map = findMap(context);
      if (!map) throw new Error(`맵을 찾을 수 없습니다: ${context.config.mainMapId}`);
      const currentSave = saveState(context);
      const accountState = context.services.account.getState();
      const completedNpcIds = new Set(currentSave.story?.completedNpcIds ?? []);
      const completedGameIds = getCompletedMiniGameIds(currentSave, accountState);
      const mapMiniGameIds = [...new Set((map.npcs ?? []).map((npc) => npc.miniGameId).filter(Boolean))];
      const completedCount = mapMiniGameIds.filter((id) => completedGameIds.has(id)).length;
      const allComplete = mapMiniGameIds.length > 0 && completedCount === mapMiniGameIds.length;
      const scene = createScene({ className: "map-scene" });
      const header = createElement("header", { className: "map-header" });
      const titleGroup = createElement("div", {}, [
        createElement("p", { className: "eyebrow", text: "FESTIVAL STORY MAP" }),
        createElement("h2", { text: "다섯 학과의 수호알" }),
        createElement("p", { className: "muted", text: "느낌표가 있는 학과 캐릭터를 만나 고민을 듣고 미니게임에 도전하세요." }),
      ]);
      const nav = createElement("div", { className: "button-row" }, [
        createButton("게임 방법", () => context.router.navigate("how-to"), "ghost"),
        createButton("메뉴", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      header.append(titleGroup, nav);

      const petals = createElement(
        "span",
        { className: "mission-progress__petals", attributes: { "aria-hidden": "true" } },
        mapMiniGameIds.map((id) => createElement("span", {
          className: completedGameIds.has(id) ? "is-complete" : "",
          text: "◇",
        })),
      );
      const mission = createElement("section", {
        className: "mission-progress",
        dataset: { complete: String(allComplete) },
        attributes: { "aria-label": `수호알 미션 ${completedCount}/${mapMiniGameIds.length}` },
      }, [
        createElement("div", {}, [
          createElement("strong", { text: "다섯 학과의 수호알을 찾아주세요." }),
          createElement("output", { text: `${completedCount} / ${mapMiniGameIds.length}` }),
        ]),
        petals,
      ]);
      if (allComplete) {
        mission.append(
          createElement("p", { text: "다섯 수호알을 모두 찾았습니다. 이아이 최종 이야기는 준비 중입니다." }),
          createButton("사후게임 목록 보기", () => context.router.navigate("battle"), "primary"),
        );
      }

      const mapGrid = createElement("section", { className: "department-map", attributes: { "aria-label": "학과별 이야기와 미니게임 목록" } });
      const launchGame = createMapGameNavigator(context);
      for (const npc of map.npcs ?? []) {
        const game = findMiniGame(context, npc.miniGameId);
        const department = findDepartment(context, npc.departmentCode);
        const completed = completedNpcIds.has(npc.id) || completedGameIds.has(npc.miniGameId);
        const card = createElement("button", {
          className: "npc-card",
          type: "button",
          dataset: { departmentCode: npc.departmentCode, npcId: npc.id },
          attributes: {
            "aria-label": `${department?.displayName ?? npc.departmentCode} · ${game?.title ?? "미니게임"} · ${completed ? "수호알 획득 완료, 다시 만나기" : "이야기 듣기"}`,
          },
          on: { click: () => launchGame(npc) },
        }, [
          createElement("span", { className: "npc-indicator", text: completed ? "✓" : "!", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "npc-card__code", text: npc.departmentCode }),
          createElement("span", { className: "npc-card__name", text: department?.displayName ?? npc.departmentCode }),
          createElement("span", { className: "npc-card__game", text: `${game?.title ?? "미니게임"} · ${completed ? "다시 만나기" : "이야기 듣기"}` }),
        ]);
        mapGrid.append(card);
      }

      scene.append(header, mission, mapGrid);
      root.append(scene);
    },
  };
}

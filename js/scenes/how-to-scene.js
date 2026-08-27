import { createBackButton, createElement, createScene } from "./scene-utils.js";

export function createHowToScene(context) {
  return {
    async mount(root, _params, { signal }) {
      const scene = createScene({
        className: "scene--panel",
        eyebrow: "HOW TO PLAY",
        title: "게임 방법",
        description: "맵의 학과 카드를 선택하면 해당 미니게임이 바로 시작됩니다.",
      });
      const common = createElement("section", { className: "info-card" }, [
        createElement("strong", { text: "공통 조작" }),
        createElement("span", { text: "PC: Tab으로 학과 카드 선택, Enter·Space로 실행, Esc로 일시정지 · 모바일: 학과 카드와 화면 버튼 터치" }),
      ]);
      const grid = createElement("div", { className: "card-grid" }, [common]);

      const configs = new Map(await Promise.all(context.content.minigames.map(async (game) => [
        game.id,
        await context.services.assets.load(game.configAssetId, { signal }),
      ])));
      if (signal.aborted) return;

      for (const game of context.content.minigames) {
        const config = configs.get(game.id);
        const pcControls = Array.isArray(config?.controls?.pc) ? config.controls.pc : [];
        const mobileControls = Array.isArray(config?.controls?.mobile) ? config.controls.mobile : [];
        const card = createElement("section", {
          className: "info-card",
          dataset: { departmentCode: game.departmentCode },
        }, [
          createElement("span", { className: "department-code", text: game.departmentCode }),
          createElement("strong", { text: game.title }),
          createElement("span", { text: game.department }),
          createElement("span", { text: config?.goal ?? "게임 목표 준비 중" }),
          createElement("span", { text: `PC · ${pcControls.join(" / ") || "조작 안내 준비 중"}` }),
          createElement("span", { text: `모바일 · ${mobileControls.join(" / ") || "조작 안내 준비 중"}` }),
          createButton("상세 안내", () => context.router.navigate("minigame-intro", { miniGameId: game.id }), "ghost"),
        ]);
        grid.append(card);
      }

      scene.append(grid, createElement("div", { className: "button-row" }, [createBackButton(context)]));
      root.append(scene);
    },
  };
}

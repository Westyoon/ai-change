import { createBackButton, createButton, createElement, createScene } from "./scene-utils.js";
import { getMiniGameInstructions } from "./minigame-instructions.js";

function instructionBlock(label, items) {
  return createElement("div", { className: "how-to-card__section" }, [
    createElement("strong", { className: "how-to-card__label", text: label }),
    createElement(
      "ul",
      { className: "control-list" },
      items.map((item) => createElement("li", { text: item })),
    ),
  ]);
}

export function createHowToScene(context) {
  return {
    async mount(root, _params, { signal }) {
      const scene = createScene({
        className: "scene--panel",
        eyebrow: "HOW TO PLAY",
        title: "게임 방법",
      });
      const common = createElement("section", { className: "info-card" }, [
        createElement("strong", { text: "공통 조작" }),
        createElement("span", { text: "PC: Tab으로 학과 카드 선택, Enter·Space로 실행, Esc로 일시정지 · 모바일: 학과 카드와 화면 버튼 터치" }),
      ]);
      const grid = createElement("div", { className: "card-grid how-to-grid" }, [common]);

      const configs = new Map(await Promise.all(context.content.minigames.map(async (game) => [
        game.id,
        await context.services.assets.load(game.configAssetId, { signal }),
      ])));
      if (signal.aborted) return;

      for (const game of context.content.minigames) {
        const config = configs.get(game.id);
        const instructions = getMiniGameInstructions(config);
        const card = createElement("section", {
          className: "info-card how-to-card",
          dataset: { departmentCode: game.departmentCode },
          attributes: { "aria-label": `${game.title} 게임 방법` },
        }, [
          createElement("span", { className: "department-code", text: game.departmentCode }),
          createElement("strong", { text: game.title }),
          createElement("span", { text: game.department }),
          instructionBlock("목표", [instructions.goal]),
          instructionBlock("PC", instructions.pc),
          instructionBlock("모바일", instructions.mobile),
          createButton("이 게임 방법 보기", () => context.router.navigate("minigame-intro", { miniGameId: game.id }), "ghost"),
        ]);
        grid.append(card);
      }

      scene.append(grid, createElement("div", { className: "button-row" }, [createBackButton(context)]));
      root.append(scene);
    },
  };
}

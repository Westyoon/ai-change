import {
  createButton,
  createElement,
  createScene,
  findDepartment,
  findMiniGame,
} from "./scene-utils.js";
import { getMiniGameInstructions } from "./minigame-instructions.js";

export function createMiniGameIntroScene(context) {
  let assetLease = null;

  return {
    async mount(root, { miniGameId }, { signal }) {
      const game = findMiniGame(context, miniGameId);
      if (!game) throw new Error(`미니게임을 찾을 수 없습니다: ${miniGameId}`);
      const department = findDepartment(context, game.departmentCode);
      assetLease = context.services.assets.acquireGroup
        ? await context.services.assets.acquireGroup(game.assetGroup, { signal })
        : null;
      if (!assetLease) {
        await context.services.assets.loadGroup(game.assetGroup, { signal });
      }
      if (signal.aborted) return;
      const config = context.services.assets.get(game.configAssetId);
      const instructions = getMiniGameInstructions(config);

      const scene = createScene({
        className: "scene--panel",
        eyebrow: `${game.departmentCode} · ${department?.displayName ?? game.department}`,
        title: game.title,
      });

      const howToTitle = `${miniGameId}-how-to-title`;
      const columns = createElement("section", {
        className: "card-grid minigame-how-to",
        attributes: { "aria-labelledby": howToTitle },
      });
      columns.append(createElement("h2", {
        className: "minigame-how-to__title",
        text: "게임 방법",
        attributes: { id: howToTitle },
      }));
      columns.append(createElement("section", { className: "info-card minigame-how-to__goal" }, [
        createElement("strong", { text: "게임 목표" }),
        createElement("span", { text: instructions.goal }),
      ]));
      for (const [label, key] of [["PC 조작", "pc"], ["모바일 조작", "mobile"]]) {
        const list = createElement("ul", { className: "control-list" },
          instructions[key].map((item) => createElement("li", { text: item })),
        );
        columns.append(createElement("section", { className: "info-card" }, [createElement("strong", { text: label }), list]));
      }

      scene.append(columns);
      scene.append(
        createElement("div", { className: "button-row" }, [
          createButton(
            "게임 시작",
            () => context.router.navigate("minigame", { miniGameId }),
            "primary",
          ),
          createButton("맵으로", () => context.router.navigate("map"), "ghost"),
        ]),
      );
      root.append(scene);
    },
    unmount() {
      assetLease?.release?.();
      assetLease = null;
    },
  };
}

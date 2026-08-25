import { createBackButton, createElement, createScene } from "./scene-utils.js";

export function createBattleComingSoonScene(context) {
  return {
    mount(root) {
      const published = context.content.battles.filter((battle) => battle.status === "published");
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "BATTLE REGISTRY",
        title: published.length ? "배틀 콘텐츠" : "Coming Soon",
        description: published.length
          ? "등록된 배틀 콘텐츠가 있습니다. 실제 route는 다음 범위에서 연결합니다."
          : "Story registry와 분리된 Battle 확장 지점만 준비했습니다.",
      });
      scene.append(
        createElement("p", { className: "status-badge", text: `PUBLISHED ${published.length}` }),
        createElement("div", { className: "button-row" }, [createBackButton(context)]),
      );
      root.append(scene);
    },
  };
}

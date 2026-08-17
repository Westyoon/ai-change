import { createButton, createElement, createScene } from "./scene-utils.js";

export function createErrorScene(context) {
  return {
    mount(root, params = {}) {
      const scene = createScene({
        className: "scene--centered",
        eyebrow: params.code ?? "APP_ERROR",
        title: "잠시 멈췄어요",
        description: params.message ?? "화면을 준비하지 못했습니다.",
      });
      if (params.detail) {
        scene.append(createElement("p", { className: "muted", text: params.detail }));
      }
      const actions = createElement("div", { className: "button-row" }, [
        createButton("다시 시도", () => context.router.navigate(params.retryScene ?? "main-menu", params.retryParams ?? {}), "primary"),
        createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
        createButton("페이지 새로고침", () => location.reload(), "ghost"),
      ]);
      scene.append(actions);
      root.append(scene);
    },
  };
}

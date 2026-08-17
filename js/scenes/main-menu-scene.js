import { createElement, createScene } from "./scene-utils.js";

function menuCard(title, description, onClick, badge = null) {
  const card = createElement("button", {
    className: "menu-card",
    type: "button",
    on: { click: onClick },
  });
  if (badge) card.append(createElement("span", { className: "status-badge", text: badge }));
  card.append(createElement("strong", { text: title }), createElement("span", { text: description }));
  return card;
}

export function createMainMenuScene(context) {
  return {
    mount(root) {
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "EWHA AI COLLEGE FESTIVAL",
        title: "ai-change",
        description: "학과를 만나고, 대화하고, 미니게임 구조를 연결하는 개발 스캐폴드입니다.",
      });
      const logo = context.services.assets.get("app-logo");
      if (logo instanceof HTMLImageElement) {
        const image = logo.cloneNode(true);
        image.width = 112;
        image.height = 112;
        image.alt = "ai-change 스캐폴드 로고";
        scene.insertBefore(image, scene.querySelector("h1"));
      }

      const codes = context.content.departments.map((department) => department.code).join(" · ");
      scene.append(createElement("p", { className: "department-code", text: codes }));
      const grid = createElement("div", { className: "menu-grid" }, [
        menuCard("스토리 시작", "인트로에서 학과 맵과 5개 모듈 연결을 확인합니다.", () => context.router.navigate("story-intro")),
        menuCard("배틀", "독립 registry 연결 지점만 준비되어 있습니다.", () => context.router.navigate("battle"), "COMING SOON"),
        menuCard("게임 방법", "공통 조작과 학과별 스캐폴드 상태를 확인합니다.", () => context.router.navigate("how-to")),
        menuCard("설정", "음량·음소거와 로컬 진행 초기화 UI를 확인합니다.", () => context.router.navigate("settings")),
      ]);
      scene.append(grid);
      root.append(scene);
    },
  };
}

import { getPublishedBattles } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
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
  let mounted = false;
  let unsubscribeAccount = null;

  return {
    mount(root) {
      mounted = true;
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "EWHA AI COLLEGE FESTIVAL",
        description: "다섯 학과 미니게임을 체험하고 사후 콘텐츠에 도전하세요.",
      });
      const logo = context.services.assets.get("app-logo");
      if (logo instanceof HTMLImageElement) {
        const image = logo.cloneNode(true);
        image.className = "scene-brand-logo";
        image.removeAttribute("width");
        image.removeAttribute("height");
        image.alt = "";
        const accessibleTitle = createElement("h1", {
          className: "visually-hidden",
          text: "인지사전게임",
        });
        scene.querySelector(".muted")?.before(image, accessibleTitle);
      }

      const codes = context.content.departments.map((department) => department.code).join(" · ");
      scene.append(createElement("p", { className: "department-code", text: codes }));
      const grid = createElement("div", { className: "menu-grid" });
      scene.append(grid);
      root.append(scene);

      const renderCards = (account) => {
        if (!mounted) return;
        const accountDescription = account.authenticated
          ? `${account.user?.name ?? "플레이어"}님의 전투 스탯과 미사용 포인트를 확인합니다.`
          : "로그인하고 클리어 기록과 사후게임 전투 스탯을 연결합니다.";
        const publishedBattles = context.config.features?.battleContent === true
          ? getPublishedBattles(context.content.battles)
          : [];
        const saveState = context.services.save?.getState?.() ?? {};
        const battleUnlocks = publishedBattles.map((battle) =>
          getBattleUnlockStatus(battle, saveState, account));
        const openBattle = battleUnlocks.find((status) => status.unlocked);
        const battleProgress = battleUnlocks[0];
        const battleBadge = publishedBattles.length === 0
          ? "COMING SOON"
          : openBattle
            ? "OPEN"
            : `LOCKED ${battleProgress?.completed ?? 0}/${battleProgress?.total ?? 0}`;
        const battleDescription = publishedBattles.length === 0
          ? "공개 준비 중인 사후게임입니다."
          : openBattle
            ? `해금된 사후 콘텐츠 ${publishedBattles.length}종에 도전합니다.`
            : "학과 미니게임 5종을 모두 클리어하면 열립니다.";
        const cards = [
          menuCard("스토리 시작", "인트로에서 학과 맵과 5개 모듈 연결을 확인합니다.", () => context.router.navigate("story-intro")),
          menuCard("배틀", battleDescription, () => context.router.navigate("battle"), battleBadge),
          menuCard("내 계정", accountDescription, () => context.router.navigate("account"), account.authenticated ? "SIGNED IN" : "LOGIN"),
          menuCard("랭킹보드", "최고 점수와 누적 클리어 순위를 확인합니다.", () => context.router.navigate("ranking")),
          menuCard("게임 방법", "공통 조작과 학과별 게임 방법을 확인합니다.", () => context.router.navigate("how-to")),
          menuCard("설정", "음량·음소거와 로컬 진행 초기화 UI를 확인합니다.", () => context.router.navigate("settings")),
        ];
        if (publishedBattles.length === 0) {
          cards.splice(2, 0, menuCard(
            "캐릭터 시스템",
            "사후게임 공용 이동·공격 명령·피격 연결을 연습장에서 확인합니다.",
            () => context.router.navigate("character-preview"),
            "DEV PREVIEW",
          ));
        }
        grid.replaceChildren(...cards);
      };

      unsubscribeAccount = context.services.account.subscribe(renderCards);
    },
    unmount() {
      mounted = false;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
    },
  };
}

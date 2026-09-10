import { getPublishedBattles } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { createElement, createScene } from "./scene-utils.js";

function menuCard(title, onClick, { badge = null, disabled = false } = {}) {
  const card = createElement("button", {
    className: "menu-card",
    type: "button",
    disabled,
    attributes: {
      "aria-label": badge ? `${title} · ${badge}` : title,
    },
    on: disabled ? {} : { click: onClick },
  });
  if (badge) card.append(createElement("span", { className: "status-badge", text: badge }));
  card.append(createElement("strong", { text: title }));
  return card;
}

export function resolveBattleMenuAccess(publishedBattles, saveState, accountState) {
  if (publishedBattles.length === 0) {
    return Object.freeze({ unlocked: false, badge: "COMING SOON" });
  }
  const unlocks = publishedBattles.map((battle) =>
    getBattleUnlockStatus(battle, saveState, accountState));
  const progress = unlocks.reduce(
    (best, current) => current.completed > best.completed ? current : best,
    unlocks[0],
  );
  const unlocked = unlocks.some((status) => status.unlocked);
  return Object.freeze({
    unlocked,
    badge: unlocked ? "OPEN" : `수호알 ${progress.completed}/${progress.total || 5}`,
  });
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
        scene.append(image, accessibleTitle);
      }

      const codes = context.content.departments.map((department) => department.code).join(" · ");
      scene.append(createElement("p", { className: "department-code", text: codes }));
      const grid = createElement("div", { className: "menu-grid" });
      scene.append(grid);
      root.append(scene);

      const renderCards = (account) => {
        if (!mounted) return;
        const publishedBattles = context.config.features?.battleContent === true
          ? getPublishedBattles(context.content.battles)
          : [];
        const saveState = context.services.save?.getState?.() ?? {};
        const battleAccess = resolveBattleMenuAccess(publishedBattles, saveState, account);
        const cards = [
          menuCard("Story", () => context.router.navigate("map")),
          menuCard("Battle", () => context.router.navigate("battle"), {
            badge: battleAccess.badge,
            disabled: !battleAccess.unlocked,
          }),
          menuCard("랭킹보드", () => context.router.navigate("ranking")),
        ];
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

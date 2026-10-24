import { getPublishedBattles } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import {
  GUARDIAN_EGGS,
  getGuardianEggProgressFromState,
} from "../core/guardian-inventory.js";
import {
  FINAL_BATTLE_UNLOCK_STORY_ID,
  MAIN_STORY_ID,
  hasSeenStory,
  markStorySeen,
  FESTIVAL_STORY_ID,
  isFestivalOpen,
  OUTRO_STORY_ID,
  POSTGAME_ENTRY_STORY_ID,
} from "../core/story-progress.js";
import { createEiaiArt, createFestivalLights } from "../ui/festival-art.js";
import { StorySoundtrack } from "../core/story-soundtrack.js";
import { createButton, createElement, createScene } from "./scene-utils.js";

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

export function createStoryMenuNavigator(context, { replay = false } = {}) {
  let navigationPending = false;
  return () => {
    if (navigationPending) return false;
    navigationPending = true;
    let navigation;
    try {
      const introSeen = hasSeenStory(context, MAIN_STORY_ID, { legacyIntro: true });
      navigation = context.router.navigate(
        replay || !introSeen ? "story-intro" : "map",
        replay ? { replay: true } : {},
      );
    } catch (error) {
      navigationPending = false;
      throw error;
    }
    void Promise.resolve(navigation).then(
      (accepted) => {
        if (accepted === false) navigationPending = false;
      },
      () => {
        navigationPending = false;
      },
    );
    return true;
  };
}

export function resolveBattleMenuAccess(
  publishedBattles,
  saveState,
  accountState,
  guardianEggCatalog = GUARDIAN_EGGS,
) {
  if (publishedBattles.length === 0) {
    return Object.freeze({ unlocked: false, badge: "COMING SOON" });
  }
  const unlocks = publishedBattles.map((battle) =>
    getBattleUnlockStatus(battle, saveState, accountState));
  const progress = unlocks.reduce(
    (best, current) => current.completed > best.completed ? current : best,
    unlocks[0],
  );
  const guardianProgress = getGuardianEggProgressFromState(
    saveState,
    accountState,
    guardianEggCatalog,
  );
  const eggsReady = unlocks.some((status) => status.unlocked)
    && guardianProgress.acquired === guardianProgress.total;
  const festivalOpen = [...(saveState?.story?.seenStoryIds ?? []), ...(accountState?.seenStoryIds ?? [])].includes(FESTIVAL_STORY_ID);
  const entrySeen = [...(saveState?.story?.seenStoryIds ?? []), ...(accountState?.seenStoryIds ?? [])].includes(POSTGAME_ENTRY_STORY_ID);
  const unlocked = eggsReady && festivalOpen;
  return Object.freeze({
    unlocked,
    badge: unlocked
      ? (entrySeen ? null : "OPEN")
      : eggsReady ? "이아이 이야기" : `수호알 ${guardianProgress.acquired}/${guardianProgress.total || progress.total || 5}`,
  });
}

export function createMainMenuScene(context) {
  let mounted = false;
  let unsubscribeAccount = null;
  let unsubscribeSave = null;
  let festivalDecorated = false;
  let festivalLights = null, festivalCampus = null;
  const soundtrack = new StorySoundtrack(context.services.audio);

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
      const wishShortcut = createElement("div", { className: "festival-menu__actions" }, [
        createButton("소원 게시판", () => context.router.navigate("story-ending"), "ghost"),
      ]);
      wishShortcut.hidden = true;
      scene.append(wishShortcut);
      root.append(scene);
      const openStory = createStoryMenuNavigator(context);

      const renderCards = (account) => {
        if (!mounted) return;
        const festivalOpen = isFestivalOpen(context);
        wishShortcut.hidden = !festivalOpen;
        if (festivalOpen && !festivalDecorated) {
          festivalDecorated = true;
          scene.classList.add("festival-menu");
          festivalLights=createFestivalLights();
          festivalCampus=createElement("div", { className: "festival-menu__campus" }, [createEiaiArt({ wandering: true })]);
          scene.prepend(festivalLights);
          scene.append(festivalCampus);
          soundtrack.play("festival");
        }
        if (!festivalOpen && festivalDecorated) {
          festivalDecorated=false;
          scene.classList.remove("festival-menu");
          festivalLights?.remove();festivalCampus?.remove();
          festivalLights=null;festivalCampus=null;
          soundtrack.stop();
        }
        const publishedBattles = context.config.features?.battleContent === true
          ? getPublishedBattles(context.content.battles)
          : [];
        const guestBattleTesting = context.config.features?.guestBattleTesting === true;
        const saveState = context.services.save?.getState?.() ?? {};
        const battleAccess = resolveBattleMenuAccess(
          publishedBattles,
          saveState,
          account,
          context.content.guardianEggs,
        );
        const openBattle = () => {
          markStorySeen(context, POSTGAME_ENTRY_STORY_ID);
          renderCards(context.services.account.getState());
          if (account?.authenticated || guestBattleTesting) {
            markStorySeen(context, FINAL_BATTLE_UNLOCK_STORY_ID);
            return context.router.navigate("battle");
          }
          return context.router.navigate("account", {
              notice: "배틀은 Google 로그인 후 이용할 수 있습니다.",
              noticeTone: "info",
            });
        };
        const cards = [
          menuCard("Story", openStory),
          menuCard("Battle", openBattle, {
            badge: battleAccess.unlocked && !account?.authenticated && !guestBattleTesting
              ? "LOGIN"
              : battleAccess.badge,
            disabled: !battleAccess.unlocked,
          }),
          menuCard("랭킹보드", () => context.router.navigate("ranking")),
        ];
        if (!festivalOpen && hasSeenStory(context, OUTRO_STORY_ID)) cards.push(menuCard(
          "엠브리오에게 소원 전하기",
          () => context.router.navigate("story-ending"),
        ));
        grid.replaceChildren(...cards);
      };

      unsubscribeAccount = context.services.account.subscribe(renderCards);
      unsubscribeSave=context.services.save?.subscribe?.(()=>renderCards(context.services.account.getState()),{emitCurrent:false});
    },
    unmount() {
      mounted = false;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      unsubscribeSave?.();unsubscribeSave=null;
      soundtrack.destroy();
    },
  };
}

import { OUTRO_STORY_ID, FESTIVAL_STORY_ID, hasSeenStory, isFestivalOpen, markStorySeen } from "../core/story-progress.js";
import { EIAI_RECOVERY } from "../core/finale-story.js";
import { StorySoundtrack } from "../core/story-soundtrack.js";
import { createStoryDialogueView } from "../ui/story-dialogue-view.js";
import { createWishComposer, createWishList } from "../ui/wish-board.js";
import { createButton, createElement, findScript } from "./scene-utils.js";
import { createEiaiArt, createFestivalLights } from "../ui/festival-art.js";

export function createEmbryoArt() {
  return createElement("div", { className: "embryo-art", attributes: { role: "img", "aria-label": "빛나는 엠브리오" } }, [
    createElement("span", { className: "embryo-art__halo", attributes: { "aria-hidden": "true" } }),
    createElement("img", { className: "embryo-art__egg", attributes: { src: "./assets/images/embryo-pixel.png", alt: "", "aria-hidden": "true", draggable: "false" } }),
  ]);
}

export function createStoryEndingScene(context) {
  let mounted = false, dialogue = null, timer = null, composer = null, board = null;
  const soundtrack = new StorySoundtrack(context.services.audio);
  return {
    mount(root, _params, { signal } = {}) {
      mounted = true;
      if (!hasSeenStory(context, OUTRO_STORY_ID)) {
        const locked = createElement("section", { className: "scene scene--centered" }, [
          createElement("h1", { text: "이아이의 이야기를 먼저 만나 주세요" }),
          createButton("이야기로 돌아가기", () => context.router.navigate("map"), "primary"),
        ]);
        root.append(locked); return;
      }
      if (isFestivalOpen(context)) {
        const page = createElement("section", { className: "scene wish-board-scene" });
        const panel = createElement("section", { className: "wish-board-scene__composer", attributes: { id: "new-wish-panel", "aria-label": "새로운 소원 말하기" } });
        panel.hidden = true;
        const status = createElement("p", { className: "wish-board-scene__status", attributes: { role: "status", "aria-live": "polite" } });
        const closeComposer = () => {
          panel.hidden = true;
          writeButton.setAttribute("aria-expanded", "false");
          writeButton.focus?.({ preventScroll: true });
        };
        const writeButton = createButton("새로운 소원 말하기", () => {
          panel.hidden = !panel.hidden;
          writeButton.setAttribute("aria-expanded", String(!panel.hidden));
          if (!panel.hidden) composer.element.querySelector("select")?.focus?.({ preventScroll: true });
        }, "primary");
        writeButton.setAttribute("aria-controls", "new-wish-panel");
        writeButton.setAttribute("aria-expanded", "false");
        board = createWishList({ service: context.services.wishes, signal });
        composer = createWishComposer({ service: context.services.wishes, signal, boardMode: true, onSent(wish) {
          board.prepend(wish); status.textContent = "소원을 게시판에 붙였어요."; closeComposer();
        } });
        panel.append(createButton("닫기", closeComposer), composer.element);
        page.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); closeComposer(); }
        });
        page.append(createElement("header", { className: "wish-board-scene__header" }, [
          createElement("h1", { text: "소원 게시판" }), writeButton,
          createButton("돌아가기", () => context.router.navigate("main-menu")),
        ]), panel, status, board.element);
        root.append(page); soundtrack.play("festival"); return;
      }
      const script = findScript(context, OUTRO_STORY_ID);
      const outro = script?.lines ?? [];
      const scene = createElement("section", { className: "scene story-ending", dataset: { phase: "recovery" } });
      const sky = createElement("div", { className: "story-ending__sky", attributes: { "aria-hidden": "true" } });
      const hero = createElement("div", { className: "story-ending__hero" }, [createEmbryoArt()]);
      const eiai = createEiaiArt();
      const xegg = createElement("img", { className: "story-ending__xegg", attributes: { src: "./assets/images/story-eggs/xr-egg.png", alt: "검은 불꽃 속의 X알" } });
      const player = createElement("span", { className: "story-ending__player", attributes: { role: "img", "aria-label": "플레이어" } });
      const guardians = createElement("div", { className: "story-ending__guardians", attributes: { "aria-label": "다섯 수호알" } },
        ["ds", "cs", "cse", "ai", "aids"].map((code) => createElement("img", { attributes: { src: `./assets/images/guardian-eggs/guardian-${code}.png`, alt: "수호알" } })));
      const locks = createElement("div", { className: "story-ending__locks", attributes: { "aria-hidden": "true" } },
        [createElement("img", {
          className: "story-ending__lock", attributes: { src: "./assets/images/flower-lock.png", alt: "" },
        })]);
      const content = createElement("div", { className: "story-ending__content" });
      const companions = createElement("div", { className: "story-ending__companions" }, [player, eiai]);
      hero.append(xegg, guardians, companions);
      scene.append(sky, createFestivalLights(), hero, locks, content); root.append(scene);
      const speak = (lines, next) => {
        if (!mounted) return;
        dialogue?.destroy(); content.replaceChildren();
        dialogue = createStoryDialogueView({ root: content, lines, showEiaiPortrait: false, onComplete: () => {
          dialogue?.destroy(); dialogue?.scene.remove(); dialogue = null; if (mounted) next();
        }, speakerForLine: (line) => line.speaker === "독백" ? "" : line.speaker });
      };
      const finalScreen = () => {
        scene.dataset.phase = "festival";
        soundtrack.celebrate();
        content.replaceChildren();
        dialogue = createStoryDialogueView({
          root: content,
          lines: [{ speaker: "독백", text: "우리의 꿈은, 여기서 다시 시작된다." }],
          speakerForLine: () => "",
          onComplete: () => {},
        });
        dialogue.scene.dataset.finalMonologue = "true";
        timer = globalThis.setTimeout(() => {
          if (!mounted || signal?.aborted) return;
          scene.dataset.returningToFestival = "true";
          timer = globalThis.setTimeout(() => {
            if (!mounted || signal?.aborted) return;
            markStorySeen(context, FESTIVAL_STORY_ID);
            context.router.navigate("main-menu");
          }, 900);
        }, 2600);
      };
      const afterWish = () => {
        if (!mounted) return;
        composer?.destroy();
        scene.dataset.phase = "wish-sent";
        soundtrack.chime(); soundtrack.play("festival");
        timer = globalThis.setTimeout(() => {
          if (!mounted) return;
          scene.dataset.phase = "festival";
          speak(outro.slice(5, -1), finalScreen);
        }, 1100);
      };
      const showWishes = () => {
        scene.dataset.phase = "wish"; content.replaceChildren();
        composer = createWishComposer({ service: context.services.wishes, signal, onSent: afterWish });
        content.append(composer.element);
        composer.element.querySelector("textarea")?.focus?.({ preventScroll: true });
      };
      soundtrack.play("ending");
      speak(EIAI_RECOVERY, () => {
        scene.dataset.phase = "unlocking";
        soundtrack.chime();
        timer = globalThis.setTimeout(() => {
          if (!mounted) return;
          scene.dataset.phase = "restored";
          speak(outro.slice(0, 3), () => {
            scene.dataset.phase = "embryo";
            soundtrack.chime();
            speak(outro.slice(3, 5), () => showWishes());
          });
        }, 2800);
      });
    },
    unmount() {
      mounted = false; globalThis.clearTimeout(timer);
      dialogue?.destroy(); composer?.destroy(); board?.destroy(); soundtrack.destroy();
    },
  };
}

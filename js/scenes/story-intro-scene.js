import { DialogueManager } from "../story/dialogue-manager.js";
import { createButton, createElement, createScene, findScript } from "./scene-utils.js";

export const INTRO_VISUAL_STATES = Object.freeze([
  "egg-outline",
  "egg-glow",
  "students",
  "fog",
  "iai-flame",
  "iai-fade",
  "x-egg",
  "amu",
  "locks",
]);

function createCinematicVisual() {
  const campus = createElement("div", { className: "story-visual__campus", attributes: { "aria-hidden": "true" } }, [
    createElement("span", { className: "story-visual__sun" }),
    createElement("span", { className: "story-visual__building story-visual__building--one" }),
    createElement("span", { className: "story-visual__building story-visual__building--two" }),
    createElement("span", { className: "story-visual__building story-visual__building--three" }),
    createElement("strong", { className: "story-visual__ecc", text: "ECC · 해 질 무렵" }),
  ]);
  const students = createElement("div", { className: "story-visual__students", attributes: { "aria-hidden": "true" } }, [
    createElement("span", { text: "성적" }),
    createElement("span", { text: "휴학" }),
    createElement("span", { text: "등록금" }),
  ]);
  const egg = createElement("div", { className: "story-visual__egg", attributes: { "aria-hidden": "true" } }, [
    createElement("span", { className: "story-visual__x", text: "×" }),
  ]);
  const iai = createElement("div", { className: "story-visual__iai", attributes: { "aria-hidden": "true" } }, [
    createElement("span", { className: "story-visual__flame" }),
    createElement("span", { className: "story-visual__name", text: "이아이" }),
  ]);
  const amu = createElement("div", { className: "story-visual__amu", attributes: { "aria-hidden": "true" } }, [
    createElement("span", { className: "story-visual__amu-mark", text: "A" }),
    createElement("span", { className: "story-visual__name", text: "아무" }),
  ]);
  const locks = createElement(
    "div",
    { className: "story-visual__locks", attributes: { "aria-hidden": "true" } },
    Array.from({ length: 5 }, () => createElement("span", { text: "◇" })),
  );
  return createElement("div", { className: "story-visual" }, [
    campus,
    students,
    createElement("div", { className: "story-visual__fog", attributes: { "aria-hidden": "true" } }),
    egg,
    iai,
    amu,
    locks,
  ]);
}

export function createStoryIntroScene(context) {
  let manager = null;
  let finished = false;

  return {
    mount(root) {
      const script = findScript(context, "main-story-intro")
        ?? context.content.scripts.find((item) => item.type === "intro");
      if (!script?.lines?.length) {
        throw new Error("메인 스토리 인트로 원고를 찾을 수 없습니다.");
      }

      const scene = createScene({
        className: "story-intro",
        eyebrow: "마음의 알 · PROLOGUE",
      });
      const title = createElement("h1", {
        className: "visually-hidden",
        text: "마음의 알 이야기",
      });
      const stageCaption = createElement("p", {
        className: "story-intro__stage-caption",
        attributes: { "aria-hidden": "true" },
      });
      const stage = createElement("div", {
        className: "story-intro__stage",
        attributes: { "aria-hidden": "true" },
      }, [createCinematicVisual(), stageCaption]);
      const shell = createElement("div", { className: "dialogue-shell story-intro__dialogue" });
      const portrait = createElement("div", {
        className: "dialogue-portrait story-intro__portrait",
        attributes: { "aria-hidden": "true" },
      });
      const copy = createElement("div", {
        className: "dialogue-copy",
      });
      const announcement = createElement("div", {
        className: "story-intro__announcement",
        attributes: { "aria-live": "polite", "aria-atomic": "true" },
      });
      const accessibleDirection = createElement("p", { className: "visually-hidden" });
      const speaker = createElement("p", { className: "dialogue-speaker" });
      const text = createElement("p", { className: "dialogue-text" });
      const counter = createElement("span", { className: "muted" });

      const complete = ({ nextAction } = {}) => {
        if (finished) return;
        finished = true;
        context.services.save?.markIntroSeen?.();
        if (nextAction?.type === "goToMenu") void context.router.navigate("main-menu");
        else void context.router.navigate("map");
      };
      manager = new DialogueManager([script], {
        onLineChange(line, state) {
          const visual = INTRO_VISUAL_STATES.includes(line.visual) ? line.visual : "egg-outline";
          stage.dataset.visual = visual;
          shell.dataset.visual = visual;
          stageCaption.textContent = line.stageDirection ?? "";
          accessibleDirection.textContent = line.stageDirection ?? "";
          speaker.textContent = line.speaker ?? "독백";
          text.textContent = line.text ?? "";
          portrait.textContent = line.portraitLabel ?? "◇";
          counter.textContent = `${script.lines.length}개 중 ${state.index + 1}번째`;
          previous.disabled = !state.canGoBack;
          next.textContent = state.index === script.lines.length - 1 ? "학과 지도로" : "다음";
        },
        onComplete: complete,
      });

      const advance = () => manager?.next();
      const previous = createButton("이전", () => manager?.previous(), "ghost");
      const next = createButton("다음", advance, "primary");
      const skip = script.skippable === true
        ? createButton("인트로 건너뛰고 학과 지도로", () => manager?.skip(), "ghost")
        : null;
      const actions = createElement(
        "div",
        { className: "button-row story-intro__actions" },
        [previous, next, skip].filter(Boolean),
      );

      announcement.append(accessibleDirection, speaker, text, counter);
      copy.append(announcement, actions);
      shell.append(portrait, copy);
      scene.append(title, stage, shell);
      root.append(scene);
      manager.start(script.id);
    },
    unmount() {
      finished = true;
      manager?.close();
      manager = null;
    },
  };
}

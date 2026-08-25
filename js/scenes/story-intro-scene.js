import { createButton, createElement, createScene, findScript } from "./scene-utils.js";

export function createStoryIntroScene(context) {
  let index = 0;
  let finished = false;

  return {
    mount(root) {
      const script = findScript(context, "main-story-intro") ?? context.content.scripts.find((item) => item.type === "intro");
      const lines = script?.lines?.length
        ? script.lines
        : [{ speaker: "SYSTEM", text: "스토리 원고가 연결되면 이 자리에서 인트로가 시작됩니다." }];
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "STORY INTRO",
        title: "축제 맵으로",
        description: "인트로 텍스트는 data/scripts에서 불러옵니다.",
      });
      const shell = createElement("div", { className: "dialogue-shell" });
      const portrait = createElement("div", { className: "dialogue-portrait", text: "AI" });
      const copy = createElement("div", { className: "dialogue-copy" });
      const speaker = createElement("p", { className: "dialogue-speaker" });
      const text = createElement("p", { className: "dialogue-text" });
      const counter = createElement("span", { className: "muted" });

      const finish = () => {
        if (finished) return;
        finished = true;
        context.services.save?.markIntroSeen?.();
        void context.router.navigate("map");
      };
      const previous = createButton("이전", () => {
        index = Math.max(0, index - 1);
        render();
      }, "ghost");
      const next = createButton("다음", () => {
        if (index >= lines.length - 1) finish();
        else {
          index += 1;
          render();
        }
      }, "primary");
      const skip = createButton("건너뛰기", finish, "ghost");
      const actions = createElement("div", { className: "button-row" }, [previous, next, skip]);

      function render() {
        const line = lines[index];
        speaker.textContent = line.speaker ?? "SYSTEM";
        text.textContent = line.text ?? "";
        counter.textContent = `${index + 1} / ${lines.length}`;
        previous.disabled = index === 0;
        next.textContent = index === lines.length - 1 ? "맵으로" : "다음";
      }

      copy.append(speaker, text, counter, actions);
      shell.append(portrait, copy);
      scene.append(shell);
      root.append(scene);
      render();
    },
  };
}

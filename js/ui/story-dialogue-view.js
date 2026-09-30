import { createElement } from "../scenes/scene-utils.js";

const ADVANCE_KEYS = new Set(["Enter", " ", "ArrowRight"]);

export function createStoryDialogueView({
  root,
  lines,
  onComplete,
  speakerForLine = (line) => line?.speaker ?? "",
} = {}) {
  if (!root || !Array.isArray(lines) || lines.length === 0) {
    throw new TypeError("Story dialogue requires a root and at least one line.");
  }

  let index = 0;
  let destroyed = false;
  let completing = false;
  const armedKeys = new Set();

  const scene = createElement("section", {
    className: "scene story-dialogue-scene",
    attributes: {
      "aria-label": "스토리 대화 · 화면 클릭·터치 또는 Enter·Space·오른쪽 방향키로 계속",
      role: "region",
      tabindex: "0",
    },
  });
  const accessibleTitle = createElement("h1", {
    className: "visually-hidden",
    text: "스토리 대화",
  });
  const shell = createElement("div", { className: "dialogue-shell" });
  const copy = createElement("div", { className: "dialogue-copy" });
  const speaker = createElement("p", { className: "dialogue-speaker" });
  const text = createElement("p", {
    className: "dialogue-text",
    attributes: {
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
  });
  const progress = createElement("span", {
    className: "visually-hidden dialogue-progress",
  });
  const advanceCue = createElement("span", {
    className: "dialogue-advance-cue",
    text: "▼",
    attributes: { "aria-hidden": "true" },
  });

  const render = () => {
    const line = lines[index] ?? {};
    const speakerName = String(speakerForLine(line, index) ?? "").trim();
    speaker.textContent = speakerName;
    speaker.hidden = speakerName.length === 0;
    text.textContent = line.text ?? "";
    text.setAttribute(
      "aria-label",
      speakerName ? `${speakerName}: ${text.textContent}` : text.textContent,
    );
    progress.textContent = `${index + 1} / ${lines.length}`;
    scene.dataset.line = String(index + 1);
    scene.dataset.lastLine = String(index === lines.length - 1);
  };

  const advance = () => {
    if (destroyed || completing) return false;
    if (index >= lines.length - 1) {
      completing = true;
      onComplete?.();
      return true;
    }
    index += 1;
    render();
    return true;
  };

  const handleClick = (event) => {
    if (event?.defaultPrevented) return;
    advance();
  };
  const handleKeydown = (event) => {
    if (!ADVANCE_KEYS.has(event?.key)) return;
    event.preventDefault?.();
    if (!event?.repeat) armedKeys.add(event.key);
  };
  const handleKeyup = (event) => {
    if (!ADVANCE_KEYS.has(event?.key)) return;
    event.preventDefault?.();
    if (!armedKeys.delete(event.key)) return;
    advance();
  };
  const handleBlur = () => armedKeys.clear();

  scene.addEventListener("click", handleClick);
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("keyup", handleKeyup);
  root.addEventListener("blur", handleBlur);
  copy.append(speaker, text, progress, advanceCue);
  shell.append(copy);
  scene.append(accessibleTitle, shell);
  root.dataset.sceneLayout = "story-dialogue";
  root.append(scene);
  render();

  return Object.freeze({
    scene,
    advance,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scene.removeEventListener("click", handleClick);
      root.removeEventListener("keydown", handleKeydown);
      root.removeEventListener("keyup", handleKeyup);
      root.removeEventListener("blur", handleBlur);
      armedKeys.clear();
      if (root.dataset.sceneLayout === "story-dialogue") {
        delete root.dataset.sceneLayout;
      }
    },
  });
}

export default createStoryDialogueView;

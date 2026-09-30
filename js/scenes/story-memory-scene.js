import {
  findStoryMemory,
  hasSeenStoryMemory,
} from "../core/story-progress.js";
import { createStoryDialogueView } from "../ui/story-dialogue-view.js";
import { findScript } from "./scene-utils.js";

function visibleStorySpeaker(line) {
  const speaker = String(line?.speaker ?? "").trim();
  if (!speaker || speaker === "독백") return "";
  if (["아무", "이아이", "플레이어"].includes(speaker) || speaker.startsWith("학생 실루엣")) {
    return speaker;
  }
  return "학생";
}

export function createStoryMemoryScene(context) {
  let closed = false;
  let view = null;

  return {
    mount(root, { memoryId } = {}) {
      const memory = findStoryMemory(memoryId);
      if (!memory) throw new Error(`기억을 찾을 수 없습니다: ${String(memoryId)}`);
      if (!hasSeenStoryMemory(context, memory)) {
        throw new Error("아직 열리지 않은 기억입니다.");
      }
      const script = findScript(context, memory.scriptId);
      if (!script?.lines?.length) {
        throw new Error(`기억 원고를 찾을 수 없습니다: ${memory.scriptId}`);
      }

      const finish = () => {
        if (closed) return;
        closed = true;
        void context.router.navigate("story-memories");
      };
      view = createStoryDialogueView({
        root,
        lines: script.lines,
        onComplete: finish,
        speakerForLine: visibleStorySpeaker,
      });
    },
    unmount() {
      closed = true;
      view?.destroy();
      view = null;
    },
  };
}

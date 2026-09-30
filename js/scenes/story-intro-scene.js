import { findScript } from "./scene-utils.js";
import { createStoryDialogueView } from "../ui/story-dialogue-view.js";
import { MAIN_STORY_ID, markStorySeen } from "../core/story-progress.js";

export const MAIN_STORY_INTRO_ID = MAIN_STORY_ID;

export function createStoryIntroScene(context) {
  let finished = false;
  let view = null;

  return {
    mount(root) {
      const script = findScript(context, MAIN_STORY_INTRO_ID);
      if (!script?.lines?.length) {
        throw new Error("메인 스토리 인트로 원고를 찾을 수 없습니다.");
      }
      const lines = script.lines;

      const finish = () => {
        if (finished) return;
        finished = true;
        markStorySeen(context, MAIN_STORY_INTRO_ID, { intro: true });
        void context.router.navigate("map");
      };
      view = createStoryDialogueView({
        root,
        lines,
        onComplete: finish,
        speakerForLine: (line) => line?.speaker === "독백" ? "" : line?.speaker,
      });
    },
    unmount() {
      finished = true;
      view?.destroy();
      view = null;
    },
  };
}

import { findMap, findMiniGame, findScript } from "./scene-utils.js";
import { hasSeenStory, markStorySeen } from "../core/story-progress.js";
import { createStoryDialogueView } from "../ui/story-dialogue-view.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
}

function visibleStorySpeaker(line) {
  const speaker = String(line?.speaker ?? "").trim();
  if (!speaker || speaker === "독백") return "";
  if (["아무", "이아이", "플레이어"].includes(speaker) || speaker.startsWith("학생 실루엣")) {
    return speaker;
  }
  return "학생";
}

export function getDialogueDestination(action, { npcId = null, fallbackMiniGameId = null } = {}) {
  const resolved = action ?? (fallbackMiniGameId
    ? { type: "openMiniGame", target: fallbackMiniGameId }
    : { type: "returnToMap" });
  if (resolved.type === "openMiniGame") {
    return Object.freeze({
      sceneId: "minigame-intro",
      params: Object.freeze({ miniGameId: resolved.target }),
    });
  }
  if (resolved.type === "goToMenu") {
    return Object.freeze({ sceneId: "main-menu", params: Object.freeze({}) });
  }
  if (resolved.type === "openDialogue") {
    return Object.freeze({
      sceneId: "dialogue",
      params: Object.freeze({ npcId, scriptId: resolved.target }),
    });
  }
  return Object.freeze({ sceneId: "map", params: Object.freeze({}) });
}

export function createDialogueScene(context) {
  let closed = false;
  let view = null;

  return {
    mount(root, { npcId, scriptId: requestedScriptId }) {
      const map = findMap(context);
      const npc = map?.npcs?.find((item) => item.id === npcId);
      if (!npc) throw new Error(`NPC를 찾을 수 없습니다: ${npcId}`);
      const completed = new Set(saveState(context).story?.completedNpcIds ?? []).has(npc.id);
      const pendingGuardianStory = (
        completed
        && typeof npc.clearStoryId === "string"
        && typeof npc.clearScriptId === "string"
        && !hasSeenStory(context, npc.clearStoryId)
      );
      const scriptId = requestedScriptId
        ?? (pendingGuardianStory ? npc.clearScriptId : completed ? npc.revisitScript : npc.firstScript);
      const script = findScript(context, scriptId);
      const lines = script?.lines?.length
        ? script.lines
        : [{ speaker: npc.departmentCode, text: "대화 데이터가 아직 준비되지 않았습니다." }];
      const game = findMiniGame(context, npc.miniGameId);
      const action = script?.nextAction ?? (game
        ? { type: "openMiniGame", target: game.id }
        : { type: "returnToMap" });
      const isGuardianClearStory = (
        scriptId === npc.clearScriptId
        && typeof npc.clearStoryId === "string"
        && typeof npc.guardianEggId === "string"
      );
      const complete = () => {
        if (closed) return;
        closed = true;
        if (scriptId === npc.firstScript) {
          markStorySeen(context, npc.id);
        }
        if (isGuardianClearStory) {
          // CLEAR itself has already been persisted by the mini-game host. The
          // after-story becomes the durable ownership signal only after the
          // player reaches its final line, so an interrupted scene can resume.
          markStorySeen(context, npc.clearStoryId);
          void context.router.navigate("guardian-reward", {
            npcId: npc.id,
            guardianEggId: npc.guardianEggId,
          });
          return;
        }
        const destination = getDialogueDestination(action, {
          npcId,
          fallbackMiniGameId: game?.id ?? null,
        });
        void context.router.navigate(destination.sceneId, destination.params);
      };
      view = createStoryDialogueView({
        root,
        lines,
        onComplete: complete,
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

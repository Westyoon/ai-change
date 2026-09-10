import { getCompletedMiniGameIds } from "../battle/unlock.js";
import { createButton, createElement, createScene, findDepartment, findMap, findMiniGame, findScript } from "./scene-utils.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
}

export function isNpcStoryCompleted(context, npc) {
  const localState = saveState(context);
  const accountState = context.services.account?.getState?.() ?? {};
  const compatibilityNpcCompleted = new Set(
    localState.story?.completedNpcIds ?? [],
  ).has(npc.id);
  return compatibilityNpcCompleted
    || getCompletedMiniGameIds(localState, accountState).has(npc.miniGameId);
}

export function getDialogueCompletionLabel(action, hasGame = false) {
  if (action?.type === "openMiniGame") return "게임 방법 보기";
  if (action?.type === "openDialogue") return "다음 이야기";
  if (action?.type === "goToMenu") return "메뉴로";
  if (action?.type === "returnToMap") return "다음 꿈을 찾으러 가기";
  return hasGame ? "게임 방법 보기" : "대화 마치기";
}

export function createDialogueScene(context) {
  let closed = false;

  return {
    mount(root, { npcId, scriptId: requestedScriptId }) {
      const map = findMap(context);
      const npc = map?.npcs?.find((item) => item.id === npcId);
      if (!npc) throw new Error(`NPC를 찾을 수 없습니다: ${npcId}`);
      const completed = isNpcStoryCompleted(context, npc);
      const scriptId = requestedScriptId ?? (completed ? npc.revisitScript : npc.firstScript);
      const script = findScript(context, scriptId);
      const lines = script?.lines?.length
        ? script.lines
        : [{ speaker: npc.departmentCode, text: "대화 데이터가 아직 준비되지 않았습니다." }];
      const department = findDepartment(context, npc.departmentCode);
      const game = findMiniGame(context, npc.miniGameId);
      const action = script?.nextAction
        ?? (game ? { type: "openMiniGame", target: game.id } : { type: "returnToMap" });
      let index = 0;

      const scene = createScene({
        className: "scene--centered department-dialogue",
        eyebrow: `${npc.departmentCode} · 마음의 알`,
        title: department?.displayName ?? npc.departmentCode,
      });
      const shell = createElement("div", { className: "dialogue-shell" });
      const portrait = createElement("div", {
        className: "dialogue-portrait",
        text: npc.departmentCode,
        attributes: { "aria-hidden": "true" },
      });
      const copy = createElement("div", { className: "dialogue-copy" });
      const lineGroup = createElement("div", {
        className: "dialogue-line",
        attributes: { "aria-live": "polite", "aria-atomic": "true" },
      });
      const direction = createElement("p", { className: "dialogue-direction" });
      const speaker = createElement("p", { className: "dialogue-speaker" });
      const text = createElement("p", { className: "dialogue-text" });
      const counter = createElement("span", { className: "muted" });

      const complete = () => {
        if (closed) return;
        closed = true;
        if (action.type === "openMiniGame") void context.router.navigate("minigame-intro", { miniGameId: action.target });
        else if (action.type === "goToMenu") void context.router.navigate("main-menu");
        else if (action.type === "openDialogue") void context.router.navigate("dialogue", { npcId, scriptId: action.target });
        else void context.router.navigate("map");
      };
      const next = createButton("다음", () => {
        if (index >= lines.length - 1) complete();
        else {
          index += 1;
          render();
        }
      }, "primary");
      const leave = createButton("지도로", () => context.router.navigate("map"), "ghost");
      const skip = script?.skippable === true
        ? createButton("이야기 건너뛰기", complete, "ghost")
        : null;
      const actions = createElement("div", { className: "button-row" }, [next, leave, skip].filter(Boolean));

      function render() {
        const line = lines[index];
        shell.dataset.visual = line.visual ?? "department";
        portrait.textContent = line.portraitLabel ?? npc.departmentCode;
        direction.textContent = line.stageDirection ?? "";
        direction.hidden = !line.stageDirection;
        speaker.textContent = line.speaker ?? department?.shortName ?? npc.departmentCode;
        text.textContent = line.text ?? "";
        counter.textContent = `${lines.length}개 중 ${index + 1}번째`;
        next.textContent = index === lines.length - 1
          ? getDialogueCompletionLabel(action, Boolean(game))
          : "다음";
      }

      lineGroup.append(direction, speaker, text, counter);
      copy.append(lineGroup, actions);
      shell.append(portrait, copy);
      scene.append(shell);
      root.append(scene);
      render();
    },
    unmount() {
      closed = true;
    },
  };
}

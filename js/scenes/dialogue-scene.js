import { createButton, createElement, createScene, findDepartment, findMap, findMiniGame, findScript } from "./scene-utils.js";

function saveState(context) {
  return context.services.save?.getState?.() ?? context.services.save?.state ?? {};
}

export function createDialogueScene(context) {
  let closed = false;

  return {
    mount(root, { npcId, scriptId: requestedScriptId }) {
      const map = findMap(context);
      const npc = map?.npcs?.find((item) => item.id === npcId);
      if (!npc) throw new Error(`NPC를 찾을 수 없습니다: ${npcId}`);
      const completed = new Set(saveState(context).story?.completedNpcIds ?? []).has(npc.id);
      const scriptId = requestedScriptId ?? (completed ? npc.revisitScript : npc.firstScript);
      const script = findScript(context, scriptId);
      const lines = script?.lines?.length
        ? script.lines
        : [{ speaker: npc.departmentCode, text: "대화 데이터가 아직 준비되지 않았습니다." }];
      const department = findDepartment(context, npc.departmentCode);
      const game = findMiniGame(context, npc.miniGameId);
      let index = 0;

      const scene = createScene({
        className: "scene--centered",
        eyebrow: `${npc.departmentCode} · NPC DIALOGUE`,
        title: department?.displayName ?? npc.departmentCode,
      });
      const shell = createElement("div", { className: "dialogue-shell" });
      const portrait = createElement("div", { className: "dialogue-portrait", text: npc.departmentCode });
      const copy = createElement("div", { className: "dialogue-copy" });
      const speaker = createElement("p", { className: "dialogue-speaker" });
      const text = createElement("p", { className: "dialogue-text" });
      const counter = createElement("span", { className: "muted" });

      const complete = () => {
        if (closed) return;
        closed = true;
        const action = script?.nextAction ?? (game ? { type: "openMiniGame", target: game.id } : { type: "returnToMap" });
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
      const leave = createButton("맵으로", () => context.router.navigate("map"), "ghost");
      const actions = createElement("div", { className: "button-row" }, [next, leave]);

      function render() {
        const line = lines[index];
        speaker.textContent = line.speaker ?? department?.shortName ?? npc.departmentCode;
        text.textContent = line.text ?? "";
        counter.textContent = `${index + 1} / ${lines.length}`;
        next.textContent = index === lines.length - 1 ? (game ? "미니게임 안내" : "대화 종료") : "다음";
      }

      copy.append(speaker, text, counter, actions);
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

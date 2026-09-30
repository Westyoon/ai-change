import { findGuardianEgg } from "../core/guardian-inventory.js";
import { createButton, createElement, findMap } from "./scene-utils.js";

function matchingNpc(context, npcId, guardianEggId) {
  return (findMap(context)?.npcs ?? []).find((npc) => (
    npc.id === npcId && npc.guardianEggId === guardianEggId
  )) ?? null;
}

export function createGuardianRewardScene(context) {
  let closed = false;
  let rootElement = null;
  let handleKeyUp = null;

  return {
    mount(root, { npcId, guardianEggId } = {}) {
      const npc = matchingNpc(context, npcId, guardianEggId);
      const guardian = findGuardianEgg(context, guardianEggId);
      if (!npc || !guardian) {
        throw new Error("획득할 수호알 정보를 찾을 수 없습니다.");
      }

      const finish = () => {
        if (closed) return;
        closed = true;
        void context.router.navigate("map");
      };
      const scene = createElement("section", {
        className: "scene guardian-reward-scene",
        attributes: {
          role: "region",
          "aria-labelledby": "guardian-reward-title",
        },
      });
      scene.style.setProperty("--guardian-color", guardian.color);
      scene.style.setProperty("--guardian-ink-color", guardian.inkColor);
      const glow = createElement("div", {
        className: "guardian-reward__glow",
        attributes: { "aria-hidden": "true" },
      });
      glow.style.setProperty("--guardian-color", guardian.color);
      glow.style.setProperty("--guardian-ink-color", guardian.inkColor);
      const egg = createElement("img", {
        className: "guardian-reward__egg",
        attributes: {
          src: guardian.imageSrc,
          alt: "",
          width: "1254",
          height: "1254",
          decoding: "async",
          fetchpriority: "high",
          draggable: "false",
        },
      });
      const spark = createElement("span", {
        className: "guardian-reward__spark",
        attributes: { "aria-hidden": "true" },
      });
      glow.append(egg, spark);
      const copy = createElement("div", { className: "guardian-reward__copy" }, [
        createElement("p", { className: "eyebrow", text: "GUARDIAN EGG ACQUIRED" }),
        createElement("h1", {
          text: `${guardian.name} 획득!`,
          attributes: { id: "guardian-reward-title" },
        }),
        createElement("p", {
          className: "guardian-reward__department",
          text: `${guardian.departmentName}의 수호캐릭터가 함께합니다.`,
        }),
        createElement("p", {
          className: "muted guardian-reward__description",
          text: guardian.description,
        }),
        createButton("다음 꿈을 찾으러 가기", finish, "primary"),
      ]);
      scene.append(glow, copy);
      root.append(scene);
      root.dataset.sceneLayout = "guardian-reward";
      rootElement = root;

      handleKeyUp = (event) => {
        if (!event || !["Enter", " ", "Spacebar"].includes(event.key)) return;
        event.preventDefault?.();
        finish();
      };
      root.addEventListener("keyup", handleKeyUp);
      scene.querySelector?.("button")?.focus?.();
    },

    unmount() {
      closed = true;
      if (rootElement && handleKeyUp) {
        rootElement.removeEventListener("keyup", handleKeyUp);
      }
      if (rootElement?.dataset.sceneLayout === "guardian-reward") {
        delete rootElement.dataset.sceneLayout;
      }
      rootElement = null;
      handleKeyUp = null;
    },
  };
}

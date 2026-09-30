import {
  STORY_MEMORIES,
  getStoryMemoryChapters,
  hasSeenStoryMemory,
} from "../core/story-progress.js";
import { createButton, createElement, createScene } from "./scene-utils.js";

export function createStoryMemoriesScene(context) {
  let mounted = false;
  let unsubscribeAccount = null;

  return {
    mount(root) {
      mounted = true;
      const scene = createScene({ className: "map-scene story-memories-scene" });
      const header = createElement("header", { className: "map-header" }, [
        createElement("div", {}, [
          createElement("p", { className: "eyebrow", text: "OUR MEMORIES" }),
          createElement("h1", { text: "우리의 기억" }),
        ]),
        createButton("스토리 맵으로", () => context.router.navigate("map"), "ghost"),
      ]);
      const grid = createElement("section", {
        className: "department-map story-memory-grid",
        attributes: { "aria-label": "다시 볼 수 있는 이야기" },
      });

      const render = () => {
        if (!mounted) return;
        const cards = STORY_MEMORIES.map((memory, index) => {
          const chapters = getStoryMemoryChapters(memory);
          const seen = chapters.some((chapter) => hasSeenStoryMemory(context, chapter));
          const chapterButtons = chapters.map((chapter) => {
            const chapterSeen = hasSeenStoryMemory(context, chapter);
            const chapterLabel = chapters.length === 1 ? "기억 다시 보기" : chapter.label;
            return createElement("button", {
              className: "story-memory-chapter",
              type: "button",
              disabled: !chapterSeen,
              dataset: {
                memoryId: chapter.id,
                memoryState: chapterSeen ? "seen" : "locked",
              },
              attributes: {
                "aria-label": chapterSeen
                  ? `${memory.label} · ${chapterLabel}`
                  : `${memory.label} · ${chapterLabel} · 아직 보지 않음`,
                "aria-disabled": String(!chapterSeen),
              },
              on: chapterSeen ? {
                click: () => context.router.navigate("story-memory", { memoryId: chapter.id }),
              } : {},
            }, [
              createElement("span", { text: chapterSeen ? chapterLabel : `${chapterLabel} · 잠김` }),
              createElement("small", { text: chapterSeen ? "다시 보기" : "아직 보지 않은 이야기" }),
            ]);
          });
          return createElement("article", {
            className: "npc-card story-memory-card",
            dataset: {
              memoryId: memory.id,
              memoryState: seen ? "seen" : "locked",
            },
            attributes: {
              "aria-label": seen
                ? `${memory.label} 기억 모음`
                : `${memory.label} 기억 · 아직 보지 않음`,
              "aria-disabled": String(!seen),
            },
          }, [
            createElement("span", {
              className: "npc-indicator",
              text: seen ? "✓" : "×",
              attributes: { "aria-hidden": "true" },
            }),
            createElement("span", {
              className: "npc-card__code",
              text: String(index + 1).padStart(2, "0"),
            }),
            createElement("span", { className: "npc-card__name", text: memory.label }),
            createElement("div", { className: "story-memory-chapters" }, chapterButtons),
          ]);
        });
        grid.replaceChildren(...cards);
      };

      scene.append(header, grid);
      root.append(scene);
      render();
      if (typeof context.services.account?.subscribe === "function") {
        unsubscribeAccount = context.services.account.subscribe(render);
      }
    },
    unmount() {
      mounted = false;
      unsubscribeAccount?.();
      unsubscribeAccount = null;
    },
  };
}

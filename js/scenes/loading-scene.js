import { SaveManager } from "../core/save-manager.js";
import { validateScaffoldContent } from "../core/config-validator.js";
import { createElement, createScene } from "./scene-utils.js";

const COMMON_CONTENT_IDS = [
  "departments-data",
  "minigames-data",
  "battles-data",
  "map-data",
  "main-story-data",
  "npc-dialogues-data",
  "minigame-outros-data",
  "app-logo",
];

function collection(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function progressPercent(progress) {
  if (typeof progress === "number") return Math.max(0, Math.min(100, progress * 100));
  if (progress?.total > 0) return (progress.loaded / progress.total) * 100;
  if (typeof progress?.ratio === "number") return progress.ratio * 100;
  return 0;
}

export function createLoadingScene(context) {
  let mounted = false;

  return {
    async mount(root, _params, { signal }) {
      mounted = true;
      root.setAttribute("aria-busy", "true");
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "BOOTING AI COLLEGE",
        title: "ai-change",
        description: "공통 데이터와 화면 구조를 확인하고 있습니다.",
      });
      const track = createElement("div", {
        className: "loading-track",
        attributes: { role: "progressbar", "aria-label": "콘텐츠 로딩", "aria-valuemin": "0", "aria-valuemax": "100" },
      });
      const bar = createElement("div", { className: "loading-bar" });
      const status = createElement("p", { className: "muted", text: "0% · manifest 확인" });
      track.append(bar);
      scene.append(track, status);
      root.append(scene);

      await context.services.assets.loadGroup("common", {
        signal,
        onProgress(progress) {
          const percent = Math.round(progressPercent(progress));
          bar.style.width = `${percent}%`;
          track.setAttribute("aria-valuenow", String(percent));
          status.textContent = `${percent}% · 공통 콘텐츠 로딩`;
        },
      });

      if (signal.aborted || !mounted) return;
      for (const id of COMMON_CONTENT_IDS) {
        if (context.services.assets.get(id) === undefined) {
          throw new Error(`공통 asset이 manifest에서 준비되지 않았습니다: ${id}`);
        }
      }

      const departmentsData = context.services.assets.get("departments-data");
      const miniGamesData = context.services.assets.get("minigames-data");
      const battlesData = context.services.assets.get("battles-data");
      const mapData = context.services.assets.get("map-data");
      const scriptGroups = [
        context.services.assets.get("main-story-data"),
        context.services.assets.get("npc-dialogues-data"),
        context.services.assets.get("minigame-outros-data"),
      ];

      context.content.departments = collection(departmentsData, "departments");
      context.content.minigames = collection(miniGamesData, "minigames");
      context.content.battles = collection(battlesData, "battles");
      context.content.maps = collection(mapData, "maps");
      context.content.scripts = scriptGroups.flatMap((group) => collection(group, "scripts"));

      const validation = validateScaffoldContent({
        appConfig: context.config,
        manifest: context.manifest,
        departments: context.content.departments,
        minigames: context.content.minigames,
        battles: context.content.battles,
        maps: context.content.maps,
        scripts: context.content.scripts,
      });
      if (validation.errors.length > 0) {
        throw new Error(validation.errors.join(" / "));
      }
      for (const warning of validation.warnings) {
        console.warn(`[ai-change scaffold] ${warning}`);
      }

      context.services.save = new SaveManager({
        appId: context.config.appId,
        storageChannel: context.config.storageChannel,
        miniGameIds: context.content.minigames.map((game) => game.id),
        defaults: { settings: context.config.audio },
      });
      const saveState = context.services.save.load();
      context.services.audio.applySettings?.(saveState.settings);

      bar.style.width = "100%";
      track.setAttribute("aria-valuenow", "100");
      status.textContent = "100% · 스캐폴드 준비 완료";
      await context.router.navigate("main-menu");
    },
    unmount() {
      mounted = false;
    },
  };
}

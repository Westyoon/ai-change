import { AudioManager } from "./core/audio-manager.js";
import { AccountService } from "./core/account-service.js";
import { AssetLoader } from "./core/asset-loader.js";
import { EventBus } from "./core/event-bus.js";
import { InputManager } from "./core/input-manager.js";
import { PostgameRealtimeService } from "./core/postgame-realtime-service.js";
import { WishService } from "./core/wish-service.js";
import { CONTENT_VERSION } from "./core/version.js";
import { SceneRouter } from "./router.js";
import { createBattleScene } from "./scenes/battle-scene.js";
import { createAccountScene } from "./scenes/account-scene.js";
import { createCharacterPreviewScene } from "./scenes/character-preview-scene.js";
import { createDialogueScene } from "./scenes/dialogue-scene.js";
import { createErrorScene } from "./scenes/error-scene.js";
import { createHowToScene } from "./scenes/how-to-scene.js";
import { createGuardianRewardScene } from "./scenes/guardian-reward-scene.js";
import { createLoadingScene } from "./scenes/loading-scene.js";
import { createMainMenuScene } from "./scenes/main-menu-scene.js";
import { createMapScene } from "./scenes/map-scene.js";
import { createMiniGameIntroScene } from "./scenes/minigame-intro-scene.js";
import { createMiniGameScene } from "./scenes/minigame-scene.js";
import { createRankingScene } from "./scenes/ranking-scene.js";
import { createSettingsScene } from "./scenes/settings-scene.js";
import { createStoryIntroScene } from "./scenes/story-intro-scene.js";
import { createStoryMemoriesScene } from "./scenes/story-memories-scene.js";
import { createStoryMemoryScene } from "./scenes/story-memory-scene.js";
import { createStoryEndingScene } from "./scenes/story-ending-scene.js";
import { bindTopNavigation } from "./ui/top-navigation.js";

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} 요청 실패 (${response.status})`);
  }
  return response.json();
}

function assertBootstrapVersion(config, manifest) {
  const htmlVersion = Number(
    document.querySelector('meta[name="ai-change-content-version"]')?.content,
  );
  const versions = [htmlVersion, config.contentVersion, manifest.contentVersion, CONTENT_VERSION];
  if (versions.some((version) => version !== CONTENT_VERSION)) {
    throw new Error(`콘텐츠 버전이 일치하지 않습니다: ${versions.join(", ")}`);
  }
}

function installGlobalBoundary(context) {
  const handleError = (error) => {
    console.error(error);
    if (context.state.scene !== "error") {
      void context.router.navigate("error", {
        code: "UNHANDLED_RUNTIME_ERROR",
        message: "예상하지 못한 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
        retryScene: "main-menu",
      });
    }
  };

  window.addEventListener("error", (event) => handleError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => handleError(event.reason));
}

async function bootstrap() {
  const root = document.querySelector("#app");
  const toastRoot = document.querySelector("#toast-root");

  try {
    const [config, manifest] = await Promise.all([
      fetchJson("./data/app-config.json"),
      fetchJson("./data/asset-manifest.json"),
    ]);
    assertBootstrapVersion(config, manifest);

    const context = {
      config,
      manifest,
      root,
      toastRoot,
      content: {
        departments: [],
        minigames: [],
        battles: [],
        maps: [],
        guardianEggs: [],
        scripts: [],
      },
      state: {
        scene: null,
        previousScene: null,
        transitioning: false,
        activeMiniGameId: null,
        pendingNpcId: null,
        lastResult: null,
      },
      services: {
        account: new AccountService(),
        assets: new AssetLoader(manifest),
        audio: new AudioManager(config.audio),
        events: new EventBus(),
        input: new InputManager(),
        postgameRealtime: new PostgameRealtimeService(),
        wishes: new WishService(),
        save: null,
      },
      router: null,
    };

    const routes = {
      loading: createLoadingScene,
      "main-menu": createMainMenuScene,
      "how-to": createHowToScene,
      settings: createSettingsScene,
      "story-intro": createStoryIntroScene,
      "story-memories": createStoryMemoriesScene,
      "story-memory": createStoryMemoryScene,
      "story-ending": createStoryEndingScene,
      map: createMapScene,
      dialogue: createDialogueScene,
      "guardian-reward": createGuardianRewardScene,
      "minigame-intro": createMiniGameIntroScene,
      minigame: createMiniGameScene,
      battle: createBattleScene,
      "character-preview": createCharacterPreviewScene,
      account: createAccountScene,
      ranking: createRankingScene,
      error: createErrorScene,
    };

    context.router = new SceneRouter({ root, routes, context });
    const topNavigation = bindTopNavigation(document, context.router);
    context.services.input.start?.();
    installGlobalBoundary(context);

    const started = await context.router.start(config.initialScene);
    if (started && context.services.save) topNavigation.enable();
  } catch (error) {
    console.error(error);
    root.replaceChildren();
    const section = document.createElement("section");
    section.className = "scene scene--centered";
    const title = document.createElement("h1");
    title.textContent = "시작할 수 없습니다";
    const copy = document.createElement("p");
    copy.textContent = "앱을 불러오지 못했습니다. 페이지를 다시 불러와 주세요.";
    const retry = document.createElement("button");
    retry.className = "button button--primary";
    retry.type = "button";
    retry.textContent = "페이지 다시 불러오기";
    retry.addEventListener("click", () => location.reload());
    section.append(title, copy, retry);
    root.append(section);
  }
}

void bootstrap();

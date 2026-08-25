import { loadMiniGameModule } from "../minigames/registry.js";
import { validateMiniGameCandidate } from "../core/config-validator.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { createResultOverlay } from "../ui/result-overlay.js";
import { createButton, createElement, findMap, findMiniGame, findScript, showToast } from "./scene-utils.js";

function attemptId(miniGameId) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${miniGameId}:${suffix}`;
}

function finalizeCandidate({ miniGameId, id, startedAt, candidate }) {
  const validation = validateMiniGameCandidate(candidate);
  if (!validation.valid) {
    throw new Error(`MiniGameCandidateResult 오류: ${validation.errors.join(" / ")}`);
  }
  if (candidate.status !== "CLEAR" && candidate.status !== "FAIL") {
    throw new Error(`Scaffold module은 CLEAR 또는 FAIL candidate만 반환할 수 있습니다: ${candidate.status}`);
  }
  return Object.freeze({
    sessionId: id,
    miniGameId,
    status: candidate.status,
    score: candidate.score ?? null,
    durationMs: Math.max(0, performance.now() - startedAt),
    failureReason: candidate.failureReason ?? null,
    metrics: candidate.metrics ?? {},
    reward: candidate.reward ?? null,
  });
}

export function createMiniGameScene(context) {
  let instance = null;
  let currentAttemptId = null;
  let startedAt = 0;
  let terminal = false;
  let destroyed = false;
  let paused = false;
  let overlay = null;
  let leaseHeld = false;
  let miniGameId = null;
  let unsubscribeInput = null;
  let restartInProgress = false;

  return {
    async mount(root, params, { signal }) {
      miniGameId = params.miniGameId;
      const game = findMiniGame(context, miniGameId);
      if (!game) throw new Error(`미니게임을 찾을 수 없습니다: ${miniGameId}`);
      context.state.activeMiniGameId = miniGameId;

      if (context.services.assets.acquireGroup) {
        await context.services.assets.acquireGroup(game.assetGroup, { signal });
        leaseHeld = true;
      } else {
        await context.services.assets.loadGroup(game.assetGroup, { signal });
      }
      if (signal.aborted) return;

      const frame = createElement("section", { className: "scene minigame-frame" });
      const title = createElement("strong", { text: `${game.departmentCode} · ${game.title}` });
      let pauseButton;
      const togglePause = () => {
        if (!instance || terminal) return;
        paused = !paused;
        if (paused) instance.pause?.("MANUAL");
        else instance.resume?.();
        pauseButton.textContent = paused ? "재개" : "일시정지";
        showToast(context, paused ? "게임을 일시정지했습니다." : "게임을 재개했습니다.");
      };
      pauseButton = createButton("일시정지", togglePause, "ghost");
      unsubscribeInput = context.services.input.onAction?.((event) => {
        if (event.action === INPUT_ACTIONS.PAUSE && event.phase === "press") togglePause();
      });
      const quitButton = createButton("맵으로", () => context.router.navigate("map"), "ghost");
      const toolbar = createElement("header", { className: "minigame-toolbar" }, [
        title,
        createElement("div", { className: "button-row" }, [pauseButton, quitButton]),
      ]);
      const stage = createElement("div", { className: "minigame-stage" });
      const canvas = createElement("canvas", {
        className: "minigame-canvas",
        attributes: { width: "960", height: "540", "aria-hidden": "true" },
      });
      const uiRoot = createElement("div", { className: "minigame-ui-root" });
      stage.append(canvas, uiRoot);
      frame.append(toolbar, stage);
      root.append(frame);

      const module = await loadMiniGameModule(game.module);
      if (signal.aborted) return;
      const config = context.services.assets.get(game.configAssetId);

      const onComplete = async (callbackAttemptId, candidate) => {
        if (destroyed || terminal || callbackAttemptId !== currentAttemptId) return;
        terminal = true;
        const result = finalizeCandidate({ miniGameId, id: currentAttemptId, startedAt, candidate });
        context.state.lastResult = result;
        const completedNpcIds = result.status === "CLEAR"
          ? (findMap(context)?.npcs ?? [])
              .filter((npc) => npc.miniGameId === miniGameId && npc.completionRule?.type === "MINIGAME_CLEAR")
              .map((npc) => npc.id)
          : [];
        context.services.save?.applyResult?.(miniGameId, result, { completedNpcIds });
        const outroScriptId = result.status === "CLEAR" ? game.clearOutroScript : game.failOutroScript;
        const outroText = findScript(context, outroScriptId)?.lines?.[0]?.text;
        overlay = createResultOverlay({
          result,
          departmentCode: game.departmentCode,
          outroText,
          onRetry: () => {
            if (restartInProgress || destroyed) return;
            restartInProgress = true;
            overlay?.destroy();
            overlay = null;
            terminal = false;
            paused = false;
            pauseButton.textContent = "일시정지";
            currentAttemptId = attemptId(miniGameId);
            startedAt = performance.now();
            try {
              instance.restart?.({ attemptId: currentAttemptId });
              requestAnimationFrame(() => uiRoot.querySelector("button, [tabindex]:not([tabindex='-1'])")?.focus());
            } finally {
              restartInProgress = false;
            }
          },
          onMap: () => context.router.navigate("map"),
          onMenu: () => context.router.navigate("main-menu"),
          backgroundElements: [toolbar, canvas, uiRoot],
        });
        stage.append(overlay.element);
      };

      const onError = (callbackAttemptId, error) => {
        if (destroyed || terminal || callbackAttemptId !== currentAttemptId) return;
        terminal = true;
        void context.router.navigate("error", {
          code: error?.code ?? "MINIGAME_RUNTIME_ERROR",
          message: error?.userMessage ?? "미니게임 스캐폴드를 계속 실행할 수 없습니다.",
          detail: error instanceof Error ? error.message : undefined,
          retryScene: error?.recoverable === false ? "map" : "minigame",
          retryParams: { miniGameId },
        });
      };

      instance = module.createMiniGame({
        canvas,
        uiRoot,
        input: context.services.input,
        clock: { now: () => performance.now() },
        assets: context.services.assets,
        audio: context.services.audio,
        events: context.services.events,
        onComplete,
        onError,
      });
      await instance.init(config, { signal });
      if (signal.aborted) return;
      currentAttemptId = attemptId(miniGameId);
      startedAt = performance.now();
      instance.start({ attemptId: currentAttemptId });
    },

    unmount() {
      destroyed = true;
      overlay?.destroy();
      overlay = null;
      instance?.destroy?.();
      instance = null;
      unsubscribeInput?.();
      unsubscribeInput = null;
      if (leaseHeld && miniGameId) {
        const game = findMiniGame(context, miniGameId);
        context.services.assets.releaseGroup?.(game?.assetGroup);
      }
      context.state.activeMiniGameId = null;
    },
  };
}

import { loadMiniGameModule } from "../minigames/registry.js";
import { validateMiniGameCandidate } from "../core/config-validator.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { createResultOverlay } from "../ui/result-overlay.js";
import { createButton, createElement, findMap, findMiniGame, findScript, showToast } from "./scene-utils.js";

function attemptId(miniGameId) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${miniGameId}:${suffix}`;
}

function finalizeCandidate({ miniGameId, id, durationMs, candidate }) {
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
    durationMs: Math.max(0, durationMs),
    failureReason: candidate.failureReason ?? null,
    metrics: candidate.metrics ?? {},
    reward: candidate.reward ?? null,
  });
}

function finalizeHostResult({ miniGameId, id, status, durationMs, failureReason = null }) {
  return Object.freeze({
    sessionId: id,
    miniGameId,
    status,
    score: null,
    durationMs: Math.max(0, durationMs),
    failureReason,
    metrics: Object.freeze({}),
    reward: null,
  });
}

export function createMiniGameScene(context) {
  let instance = null;
  let currentAttemptId = null;
  let startedAt = null;
  let terminal = false;
  let destroyed = false;
  const pauseReasons = new Set();
  let pauseStartedAt = null;
  let accumulatedPauseMs = 0;
  let overlay = null;
  let leaseHeld = false;
  let miniGameId = null;
  let unsubscribeInput = null;
  let unsubscribeVisibility = null;
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
      const activeDurationMs = () => {
        if (startedAt === null) return 0;
        const currentPauseMs =
          pauseStartedAt === null ? 0 : Math.max(0, performance.now() - pauseStartedAt);
        return Math.max(0, performance.now() - startedAt - accumulatedPauseMs - currentPauseMs);
      };
      const updatePauseButton = () => {
        pauseButton.textContent = pauseReasons.has("MANUAL") ? "재개" : "일시정지";
      };
      const requestPause = (reason) => {
        if (!instance || terminal || pauseReasons.has(reason)) return false;
        const wasRunning = pauseReasons.size === 0;
        pauseReasons.add(reason);
        if (wasRunning) {
          const accepted = instance.pause?.(reason);
          if (accepted === false) {
            pauseReasons.delete(reason);
            return false;
          }
          pauseStartedAt = performance.now();
        }
        updatePauseButton();
        return true;
      };
      const releasePause = (reason) => {
        if (!instance || terminal || !pauseReasons.has(reason)) return false;
        pauseReasons.delete(reason);
        if (pauseReasons.size === 0) {
          const accepted = instance.resume?.();
          if (accepted === false) {
            pauseReasons.add(reason);
            return false;
          }
          if (pauseStartedAt !== null) {
            accumulatedPauseMs += Math.max(0, performance.now() - pauseStartedAt);
            pauseStartedAt = null;
          }
        }
        updatePauseButton();
        return true;
      };
      const togglePause = () => {
        if (!instance || terminal) return;
        const manuallyPaused = pauseReasons.has("MANUAL");
        const changed = manuallyPaused ? releasePause("MANUAL") : requestPause("MANUAL");
        if (!changed) return;
        showToast(
          context,
          manuallyPaused ? "게임을 재개했습니다." : "게임을 일시정지했습니다.",
        );
      };
      pauseButton = createButton("일시정지", togglePause, "ghost");
      unsubscribeInput = context.services.input.onAction?.((event) => {
        if (event.action === INPUT_ACTIONS.PAUSE && event.phase === "press") togglePause();
      });
      const quitButton = createButton("맵으로", () => {
        if (!terminal && currentAttemptId) {
          terminal = true;
          const result = finalizeHostResult({
            miniGameId,
            id: currentAttemptId,
            status: "QUIT",
            durationMs: activeDurationMs(),
          });
          context.state.lastResult = result;
          context.services.save?.applyResult?.(miniGameId, result);
        }
        void context.router.navigate("map");
      }, "ghost");
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
        const result = finalizeCandidate({
          miniGameId,
          id: currentAttemptId,
          durationMs: activeDurationMs(),
          candidate,
        });
        context.state.lastResult = result;
        const persistsProgress =
          game.scaffold !== true && config?.implementationStatus !== "PROTOTYPE";
        const completedNpcIds = result.status === "CLEAR" && persistsProgress
          ? (findMap(context)?.npcs ?? [])
              .filter((npc) => npc.miniGameId === miniGameId && npc.completionRule?.type === "MINIGAME_CLEAR")
              .map((npc) => npc.id)
          : [];
        if (persistsProgress) {
          context.services.save?.applyResult?.(miniGameId, result, { completedNpcIds });
        }
        const outroScriptId = result.status === "CLEAR" ? game.clearOutroScript : game.failOutroScript;
        const outroText = findScript(context, outroScriptId)?.lines?.[0]?.text;
        overlay = createResultOverlay({
          result,
          miniGameId,
          departmentCode: game.departmentCode,
          outroText,
          presentation: config?.resultPresentation,
          onRetry: () => {
            if (restartInProgress || destroyed) return;
            restartInProgress = true;
            overlay?.destroy();
            overlay = null;
            terminal = false;
            pauseReasons.clear();
            pauseStartedAt = null;
            accumulatedPauseMs = 0;
            updatePauseButton();
            currentAttemptId = attemptId(miniGameId);
            startedAt = module.hasInternalStartGate === true ? null : performance.now();
            try {
              instance.restart?.({ attemptId: currentAttemptId });
              if (globalThis.document?.hidden) requestPause("VISIBILITY");
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
        const failureReason = error?.code ?? "MINIGAME_RUNTIME_ERROR";
        const result = finalizeHostResult({
          miniGameId,
          id: currentAttemptId,
          status: "ERROR",
          durationMs: activeDurationMs(),
          failureReason,
        });
        context.state.lastResult = result;
        context.services.save?.applyResult?.(miniGameId, result);
        void context.router.navigate("error", {
          code: failureReason,
          message: error?.userMessage ?? "미니게임을 계속 실행할 수 없습니다.",
          detail: error instanceof Error ? error.message : undefined,
          retryScene: error?.recoverable === false ? "map" : "minigame",
          retryParams: { miniGameId },
        });
      };

      const onGameplayStart = (callbackAttemptId) => {
        if (
          destroyed
          || terminal
          || callbackAttemptId !== currentAttemptId
          || startedAt !== null
        ) {
          return false;
        }
        startedAt = performance.now();
        accumulatedPauseMs = 0;
        pauseStartedAt = null;
        return true;
      };

      instance = module.createMiniGame({
        canvas,
        uiRoot,
        input: context.services.input,
        clock: { now: () => performance.now() },
        assets: context.services.assets,
        audio: context.services.audio,
        events: context.services.events,
        onGameplayStart,
        onComplete,
        onError,
      });
      await instance.init(config, { signal });
      if (signal.aborted) return;
      currentAttemptId = attemptId(miniGameId);
      startedAt = module.hasInternalStartGate === true ? null : performance.now();
      instance.start({ attemptId: currentAttemptId });
      const documentRef = globalThis.document;
      if (typeof documentRef?.addEventListener === "function") {
        const handleVisibilityChange = () => {
          if (documentRef.hidden) requestPause("VISIBILITY");
          else releasePause("VISIBILITY");
        };
        documentRef.addEventListener("visibilitychange", handleVisibilityChange);
        unsubscribeVisibility = () =>
          documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
        if (documentRef.hidden) requestPause("VISIBILITY");
      }
    },

    unmount() {
      destroyed = true;
      overlay?.destroy();
      overlay = null;
      instance?.destroy?.();
      instance = null;
      unsubscribeInput?.();
      unsubscribeInput = null;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      if (leaseHeld && miniGameId) {
        const game = findMiniGame(context, miniGameId);
        context.services.assets.releaseGroup?.(game?.assetGroup);
      }
      context.state.activeMiniGameId = null;
    },
  };
}

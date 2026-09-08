import { getPublishedBattles, loadBattleModule } from "../battle/registry.js";
import { createStatBossPlayer } from "../battle/player-config.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { validateMiniGameCandidate } from "../core/config-validator.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { createResultOverlay } from "../ui/result-overlay.js";
import { createBattleComingSoonScene } from "./battle-coming-soon-scene.js";
import { createButton, createElement, createScene, showToast } from "./scene-utils.js";

const DEFAULT_ARENA = Object.freeze({ width: 960, height: 600 });

function attemptId(battleId) {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${battleId}:${suffix}`;
}

function publishedBattles(context) {
  if (context.config.features?.battleContent !== true) return [];
  return getPublishedBattles(context.content.battles);
}

function findBattle(context, battleId) {
  return publishedBattles(context).find((battle) => battle.id === battleId) ?? null;
}

function createBattleControls(controls) {
  const groups = [
    ["pc", "PC 조작"],
    ["mobile", "모바일 조작"],
  ].flatMap(([key, label]) => {
    const items = Array.isArray(controls?.[key])
      ? controls[key].filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];
    if (items.length === 0) return [];
    return [createElement("section", { className: `battle-controls__group battle-controls__group--${key}` }, [
      createElement("strong", { className: "battle-controls__label", text: label }),
      createElement("ul", { className: "battle-controls__list" },
        items.map((item) => createElement("li", { text: item }))),
    ])];
  });
  if (groups.length === 0) return null;
  return createElement("aside", {
    className: "battle-controls",
    attributes: { "aria-label": "배틀 조작 방법" },
  }, groups);
}

export function finalizeBattleCandidate({ battleId, id, durationMs, candidate }) {
  const validation = validateMiniGameCandidate(candidate);
  if (!validation.valid) {
    throw new Error(`BattleCandidateResult 오류: ${validation.errors.join(" / ")}`);
  }
  if (candidate.status !== "CLEAR" && candidate.status !== "FAIL") {
    throw new Error(`Battle module은 CLEAR 또는 FAIL candidate만 반환할 수 있습니다: ${candidate.status}`);
  }
  return Object.freeze({
    sessionId: id,
    battleId,
    status: candidate.status,
    score: candidate.score ?? null,
    durationMs: Math.max(0, durationMs),
    failureReason: candidate.failureReason ?? null,
    metrics: candidate.metrics ?? {},
    reward: null,
  });
}

function createBattleEntryScene(context, { notice = null } = {}) {
  return {
    async mount(root, _params, { signal }) {
      const service = context.services.account;
      if (["idle", "loading"].includes(service.getState().status)) {
        await service.refreshSession();
      }
      if (signal.aborted) return;

      const definitions = publishedBattles(context);
      const saveState = context.services.save?.getState?.() ?? {};
      const accountState = service.getState();
      const scene = createScene({
        className: "scene--panel battle-entry",
        eyebrow: "AFTER GAME · BATTLE",
        title: "사후게임 배틀",
        description: "학과 미니게임 5종을 모두 클리어하면 보스전에 입장할 수 있습니다.",
      });
      if (notice) {
        scene.append(createElement("p", {
          className: "battle-notice",
          text: notice,
          attributes: { role: "status" },
        }));
      }

      const list = createElement("div", { className: "battle-list" });
      for (const battle of definitions) {
        const unlock = getBattleUnlockStatus(battle, saveState, accountState);
        const missingTitles = unlock.missingMiniGameIds
          .map((id) => context.content.minigames.find((game) => game.id === id)?.title ?? id);
        const badge = unlock.unlocked ? "OPEN" : `LOCKED · ${unlock.completed}/${unlock.total}`;
        const card = createElement("article", {
          className: "battle-card",
          dataset: { unlocked: String(unlock.unlocked) },
        }, [
          createElement("span", { className: "status-badge", text: badge }),
          createElement("h2", { text: battle.title }),
          createElement("p", { className: "muted", text: battle.description }),
          createElement("p", {
            className: "battle-progress",
            text: unlock.unlocked
              ? "해금 완료 · 계정 스탯 또는 게스트 기본 스탯으로 도전합니다."
              : `남은 미니게임: ${missingTitles.join(" · ")}`,
          }),
        ]);
        const start = createButton(
          unlock.unlocked ? "보스전 시작" : "아직 잠겨 있습니다",
          () => context.router.navigate("battle", { battleId: battle.id }),
          unlock.unlocked ? "primary" : "ghost",
        );
        start.disabled = !unlock.unlocked;
        card.append(createElement("div", { className: "button-row" }, [start]));
        list.append(card);
      }

      const sourceText = accountState.authenticated
        ? "로그인 계정의 고유 클리어 기록과 이 브라우저의 로컬 기록을 함께 확인했습니다."
        : "현재 브라우저의 로컬 클리어 기록을 기준으로 확인했습니다.";
      scene.append(
        list,
        createElement("p", { className: "muted battle-unlock-source", text: sourceText }),
        createElement("div", { className: "button-row" }, [
          createButton("스토리 맵으로", () => context.router.navigate("map")),
          createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
        ]),
      );
      root.append(scene);
    },
  };
}

function createBattlePlayScene(context, battle) {
  let instance = null;
  let assetLease = null;
  let overlay = null;
  let currentAttemptId = null;
  let startedAt = null;
  let pauseStartedAt = null;
  let accumulatedPauseMs = 0;
  let terminal = false;
  let destroyed = false;
  let unsubscribeInput = null;
  let unsubscribeVisibility = null;
  const pauseReasons = new Set();

  return {
    async mount(root, _params, { signal }) {
      const accountService = context.services.account;
      if (["idle", "loading"].includes(accountService.getState().status)) {
        await accountService.refreshSession();
      }
      if (signal.aborted) return;

      const unlock = getBattleUnlockStatus(
        battle,
        context.services.save?.getState?.() ?? {},
        accountService.getState(),
      );
      if (!unlock.unlocked) throw new Error("아직 배틀 해금 조건을 충족하지 않았습니다.");

      assetLease = context.services.assets.acquireGroup
        ? await context.services.assets.acquireGroup(battle.assetGroup, { signal })
        : null;
      if (!assetLease) await context.services.assets.loadGroup(battle.assetGroup, { signal });
      if (signal.aborted) return;

      const config = context.services.assets.get(battle.configAssetId);
      const arena = config?.arena ?? DEFAULT_ARENA;

      const frame = createElement("section", { className: "scene minigame-frame battle-frame" });
      const title = createElement("strong", { text: `BATTLE · ${battle.title}` });
      let pauseButton;
      const activeDurationMs = () => {
        if (startedAt === null) return 0;
        const currentPauseMs = pauseStartedAt === null
          ? 0
          : Math.max(0, performance.now() - pauseStartedAt);
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
        const manuallyPaused = pauseReasons.has("MANUAL");
        const changed = manuallyPaused ? releasePause("MANUAL") : requestPause("MANUAL");
        if (changed) showToast(context, manuallyPaused ? "전투를 재개했습니다." : "전투를 일시정지했습니다.");
      };

      pauseButton = createButton("일시정지", togglePause, "ghost");
      const quitButton = createButton("배틀 목록으로", () => context.router.navigate("battle"), "ghost");
      const toolbar = createElement("header", { className: "minigame-toolbar" }, [
        title,
        createElement("div", { className: "button-row" }, [pauseButton, quitButton]),
      ]);
      const stage = createElement("div", { className: "minigame-stage battle-stage" });
      const controls = createBattleControls(config?.controls);
      frame.append(toolbar);
      if (controls) frame.append(controls);
      frame.append(stage);
      root.append(frame);

      const module = await loadBattleModule(battle.module);
      if (signal.aborted) return;

      const onComplete = (callbackAttemptId, candidate) => {
        if (destroyed || terminal || callbackAttemptId !== currentAttemptId) return;
        terminal = true;
        const result = finalizeBattleCandidate({
          battleId: battle.id,
          id: currentAttemptId,
          durationMs: activeDurationMs(),
          candidate,
        });
        context.state.lastResult = result;
        overlay = createResultOverlay({
          result,
          contextLabel: `BATTLE · ${battle.title}`,
          presentation: config?.resultPresentation,
          onRetry: () => {
            if (destroyed) return;
            overlay?.destroy();
            overlay = null;
            terminal = false;
            pauseReasons.clear();
            pauseStartedAt = null;
            accumulatedPauseMs = 0;
            updatePauseButton();
            currentAttemptId = attemptId(battle.id);
            startedAt = performance.now();
            instance.restart?.({ attemptId: currentAttemptId });
            if (globalThis.document?.hidden) requestPause("VISIBILITY");
          },
          onMap: () => context.router.navigate("battle"),
          onMenu: () => context.router.navigate("main-menu"),
          backgroundElements: [toolbar, stage.firstElementChild],
        });
        stage.append(overlay.element);
      };

      instance = module.createBattle({
        root: stage,
        input: context.services.input,
        events: context.services.events,
        onComplete,
      });
      const player = createStatBossPlayer(accountService.getState(), arena);
      await instance.init({ ...config, arena, players: [player] }, { signal });
      if (signal.aborted) return;
      currentAttemptId = attemptId(battle.id);
      startedAt = performance.now();
      instance.start({ attemptId: currentAttemptId });

      unsubscribeInput = context.services.input.onAction?.((event) => {
        if (event.action === INPUT_ACTIONS.PAUSE && event.phase === "press") togglePause();
      });
      const documentRef = globalThis.document;
      if (typeof documentRef?.addEventListener === "function") {
        const handleVisibilityChange = () => {
          if (documentRef.hidden) requestPause("VISIBILITY");
          else releasePause("VISIBILITY");
        };
        documentRef.addEventListener("visibilitychange", handleVisibilityChange);
        unsubscribeVisibility = () => documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
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
      assetLease?.release?.();
      assetLease = null;
    },
  };
}

export function createBattleScene(context) {
  let activeScene = null;
  return {
    async mount(root, params = {}, lifecycle) {
      const definitions = publishedBattles(context);
      if (definitions.length === 0) {
        activeScene = createBattleComingSoonScene(context);
      } else if (!params.battleId) {
        activeScene = createBattleEntryScene(context);
      } else {
        const battle = findBattle(context, params.battleId);
        if (!battle) throw new Error(`배틀을 찾을 수 없습니다: ${params.battleId}`);
        const unlock = getBattleUnlockStatus(
          battle,
          context.services.save?.getState?.() ?? {},
          context.services.account.getState(),
        );
        activeScene = unlock.unlocked
          ? createBattlePlayScene(context, battle)
          : createBattleEntryScene(context, { notice: "잠긴 배틀에는 바로 입장할 수 없습니다." });
      }
      return activeScene.mount(root, params, lifecycle);
    },
    unmount() {
      return activeScene?.unmount?.();
    },
  };
}

export default createBattleScene;

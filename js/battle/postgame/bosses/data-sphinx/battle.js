import { GameLoop } from "../../../../core/game-loop.js";
import { CharacterSystem, VirtualJoystick } from "../../../character/index.js";
import {
  DATA_SPHINX_SELECTIONS,
  getDataSphinxSelection,
  normalizeDataSphinxConfig,
} from "./config.js";
import { DataSphinxEncounter, DATA_SPHINX_STATES } from "./encounter.js";
import { DataSphinxView } from "./view.js";
import {
  bindSharedBossBattle,
  createSharedActionId,
  isSharedBattleOnline,
} from "../shared-battle.js";

function abortError(signal) {
  if (signal?.reason) return signal.reason;
  if (typeof DOMException === "function") return new DOMException("Data Sphinx initialization was aborted.", "AbortError");
  const error = new Error("Data Sphinx initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function assertAttemptId(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Data Sphinx requires a non-empty attemptId.");
  }
  return value;
}

function spawnTopLeft(config) {
  const { arena, player } = config;
  return {
    x: Math.max(0, Math.min(arena.width - player.width, player.spawn.x - player.width / 2)),
    y: Math.max(0, Math.min(arena.height - player.height, player.spawn.y - player.height / 2)),
  };
}

export function createBattle({
  root,
  input = null,
  events = null,
  onComplete = null,
  sharedBattle: factorySharedBattle = null,
} = {}) {
  if (!root?.append) throw new Error("Data Sphinx createBattle requires a root element.");
  if (!events) throw new Error("Data Sphinx createBattle requires the shared EventBus.");

  let lifecycleState = DATA_SPHINX_STATES.CREATED;
  let config = null;
  let encounter = null;
  let system = null;
  let view = null;
  let joystick = null;
  let loop = null;
  let destroyed = false;
  let abortSignal = null;
  let abortHandler = null;
  let sharedBattleSource = null;
  let sharedBinding = null;
  let sharedMode = false;
  let serverFinished = false;
  let activeAttemptId = null;
  let sharedActionSequence = 0;
  let latestSharedSnapshot = null;
  const completedAttemptIds = new Set();
  const forwardedSharedFailAttemptIds = new Set();

  function render() {
    view?.render(encounter?.getSnapshot(), system?.getSnapshot());
  }

  function forwardCompletion(attemptId, candidate) {
    if (destroyed) return false;
    const sharedLocalFail = sharedMode && !serverFinished && candidate?.status === "FAIL";
    if (sharedLocalFail) {
      if (forwardedSharedFailAttemptIds.has(attemptId)) return false;
      forwardedSharedFailAttemptIds.add(attemptId);
      lifecycleState = DATA_SPHINX_STATES.COMPLETED;
      onComplete?.(attemptId, candidate);
      return true;
    }
    if (completedAttemptIds.has(attemptId)) return false;
    if (sharedMode && !serverFinished) return false;
    completedAttemptIds.add(attemptId);
    lifecycleState = DATA_SPHINX_STATES.COMPLETED;
    onComplete?.(attemptId, candidate);
    return true;
  }

  function handleEncounterEvent(event) {
    if (event.type === "quiz-start") {
      system?.setControlLocked(false, "quiz-resolving");
      view?.showFeedback("제한 시간이 끝나기 전에 O 또는 X 영역으로 이동하세요.", "info");
    } else if (event.type === "quiz-resolved") {
      system?.setControlLocked(true, "quiz-resolving");
      if (event.damageToPlayer > 0) {
        system?.applyResolvedDamage(event.damageToPlayer, {
          sourceId: event.outcome === "TIMEOUT" ? "sphinx-timeout" : "sphinx-wrong",
        });
      }
      if (event.outcome === "CORRECT") {
        view?.showFeedback(`정답입니다! 스핑크스에게 ${event.damageToBoss} 피해`, "correct");
        if (sharedBinding && activeAttemptId) {
          sharedActionSequence += 1;
          sharedBinding.hit({
            kind: "correct-answer",
            actionId: createSharedActionId(activeAttemptId, "answer", sharedActionSequence),
          });
        }
      } else if (event.outcome === "TIMEOUT") {
        view?.showFeedback(`시간 초과! 플레이어가 ${event.damageToPlayer} 피해`, "wrong");
      } else {
        view?.showFeedback(`오답입니다! 플레이어가 ${event.damageToPlayer} 피해`, "wrong");
      }
    } else if (event.type === "complete") {
      system?.setControlLocked(true, "quiz-end");
      loop?.pause();
      view?.showFeedback(
        event.candidate.status === "CLEAR"
          ? "스핑크스의 코드를 모두 해석했습니다!"
          : "스핑크스를 쓰러뜨리지 못했습니다.",
        event.candidate.status === "CLEAR" ? "correct" : "wrong",
      );
    }
  }

  function tick(deltaMs) {
    if (!encounter || encounter.state !== DATA_SPHINX_STATES.RUNNING) return;
    const playerSnapshot = system.update(deltaMs);
    encounter.setPlayerLocation(getDataSphinxSelection(playerSnapshot, config.arena));
    encounter.tick(deltaMs);
    render();
  }

  function setupRuntime(runtimeConfig) {
    const position = spawnTopLeft(runtimeConfig);
    view = new DataSphinxView({
      arena: runtimeConfig.arena,
      documentRef: root.ownerDocument ?? globalThis.document,
    });
    view.mount(root);

    system = new CharacterSystem({
      events,
      inputManager: input,
      character: {
        id: runtimeConfig.player.id,
        x: position.x,
        y: position.y,
        width: runtimeConfig.player.width,
        height: runtimeConfig.player.height,
        speed: runtimeConfig.player.speed,
        maxHealth: runtimeConfig.player.maxHealth,
        currentHealth: runtimeConfig.player.maxHealth,
        stats: runtimeConfig.player.accountStats,
        appearance: runtimeConfig.player.appearance,
      },
      world: {
        bounds: { x: 0, y: 0, width: runtimeConfig.arena.width, height: runtimeConfig.arena.height },
        colliders: [],
        triggers: [],
      },
    }).start();

    joystick = new VirtualJoystick({
      element: view.joystickBase,
      knob: view.joystickKnob,
      onChange: (vector) => system?.setJoystickVector(vector),
    });
    encounter = new DataSphinxEncounter({
      config: runtimeConfig,
      onEvent: handleEncounterEvent,
      onComplete: forwardCompletion,
      sharedBossAuthority: sharedMode,
    });
    encounter.init();
    sharedBinding = bindSharedBossBattle({
      sharedBattle: sharedBattleSource,
      battleId: "data-sphinx",
      onSnapshot: (snapshot) => {
        latestSharedSnapshot = snapshot;
        encounter?.syncSharedBossHealth(snapshot);
        render();
      },
      onFinished: (snapshot) => {
        latestSharedSnapshot = snapshot;
        if (!activeAttemptId) return;
        serverFinished = true;
        encounter?.completeSharedBattle(snapshot);
        loop?.pause();
        render();
      },
    });
    loop = new GameLoop({ update: tick, render: () => {} });
    lifecycleState = DATA_SPHINX_STATES.READY;
    render();
  }

  function teardownRuntime() {
    loop?.destroy();
    joystick?.destroy();
    system?.destroy();
    sharedBinding?.destroy();
    encounter?.destroy();
    view?.destroy();
    loop = null;
    joystick = null;
    system = null;
    encounter = null;
    view = null;
    sharedBinding = null;
    activeAttemptId = null;
  }

  function removeAbortListener() {
    if (abortSignal && abortHandler) abortSignal.removeEventListener("abort", abortHandler);
    abortSignal = null;
    abortHandler = null;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    lifecycleState = DATA_SPHINX_STATES.DESTROYED;
    removeAbortListener();
    teardownRuntime();
    return true;
  }

  return {
    async init(candidateConfig = {}, { signal } = {}) {
      if (destroyed || lifecycleState !== DATA_SPHINX_STATES.CREATED) {
        throw new Error(`Data Sphinx cannot init from ${lifecycleState}.`);
      }
      throwIfAborted(signal);
      lifecycleState = "INITIALIZING";
      abortSignal = signal ?? null;
      abortHandler = destroy;
      signal?.addEventListener("abort", abortHandler, { once: true });

      try {
        await Promise.resolve();
        throwIfAborted(signal);
        sharedBattleSource = candidateConfig.sharedBattle ?? factorySharedBattle;
        sharedMode = isSharedBattleOnline(sharedBattleSource, "data-sphinx");
        serverFinished = false;
        sharedActionSequence = 0;
        latestSharedSnapshot = null;
        config = normalizeDataSphinxConfig(candidateConfig);
        setupRuntime(config);
      } catch (error) {
        destroy();
        throw error;
      }
    },

    start({ attemptId } = {}) {
      if (destroyed || !encounter) return false;
      const id = assertAttemptId(attemptId);
      if (completedAttemptIds.has(id)) {
        throw new Error(`Data Sphinx attemptId was already completed: ${id}.`);
      }
      activeAttemptId = id;
      encounter.start({ attemptId: id });
      lifecycleState = DATA_SPHINX_STATES.RUNNING;
      loop.start();
      sharedBinding?.ready();
      sharedBinding?.refresh();
      if (latestSharedSnapshot?.status === "finished") {
        serverFinished = true;
        encounter.completeSharedBattle(latestSharedSnapshot);
        loop.pause();
      }
      render();
      return true;
    },

    pause(_reason) {
      if (destroyed || !encounter?.pause()) return false;
      system?.setControlLocked(true, "game-paused");
      loop?.pause();
      lifecycleState = DATA_SPHINX_STATES.PAUSED;
      render();
      return true;
    },

    resume() {
      if (destroyed || !encounter?.resume()) return false;
      system?.setControlLocked(false, "game-paused");
      loop?.resume();
      lifecycleState = DATA_SPHINX_STATES.RUNNING;
      render();
      return true;
    },

    restart({ attemptId } = {}) {
      if (destroyed || !config || encounter?.state !== DATA_SPHINX_STATES.COMPLETED) return false;
      const id = assertAttemptId(attemptId);
      if (completedAttemptIds.has(id)) {
        throw new Error(`Data Sphinx attemptId was already completed: ${id}.`);
      }
      teardownRuntime();
      try {
        setupRuntime(config);
        activeAttemptId = id;
        encounter.start({ attemptId: id });
        lifecycleState = DATA_SPHINX_STATES.RUNNING;
        loop.start();
        sharedBinding?.ready();
        sharedBinding?.refresh();
        if (latestSharedSnapshot?.status === "finished") {
          serverFinished = true;
          encounter.completeSharedBattle(latestSharedSnapshot);
          loop.pause();
        }
        render();
        return true;
      } catch (error) {
        destroy();
        throw error;
      }
    },

    destroy,

    getState() {
      if (!encounter) {
        return Object.freeze({ state: lifecycleState, disposed: destroyed });
      }
      return Object.freeze({ ...encounter.getSnapshot(), disposed: false });
    },
  };
}

export { DATA_SPHINX_SELECTIONS };
export default createBattle;

import { INPUT_ACTIONS } from '../../core/input-manager.js';
import { InputLock } from '../shared/input-lock.js';
import { MiniGameClock } from '../shared/minigame-clock.js';
import { buildMiniGameCandidate } from '../shared/result-builder.js';
import { DEFINITION } from './definition.js';
import { mergeConfig, validateConfig } from './config.js';
import { injectStyles, removeStyles } from './styles.js';
import { buildGameDom } from './dom-builder.js';
import { buildHearts, updateHearts } from './hud.js';
import { layoutPlatforms, setTilt } from './platforms.js';
import { stepFrame } from './game-loop.js';

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Mini-game initialization was aborted.', 'AbortError');
  }
  const error = new Error('Mini-game initialization was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }
  if (disposed()) {
    throw createAbortError();
  }
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    throw new TypeError('Mini-game attemptId must be a non-empty string.');
  }
}

export function createMiniGame(context = {}) {
  const inputLock = new InputLock();
  const injectedClock = context.clock;
  const clock =
    injectedClock && typeof injectedClock.start === 'function'
      ? injectedClock
      : new MiniGameClock({
        now: typeof injectedClock?.now === 'function' ? injectedClock.now : undefined,
      });

  const removers = [];
  let config = null;
  let refs = null;
  let gameState = null;
  let rafId = null;
  let lifecycleState = 'CREATED';
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function createFreshGameState() {
    return {
      life: config.initialLives,
      tilt: config.initialTilt,
      eggs: [],
      platforms: [],
      correctCount: 0,
      wrongCount: 0,
      lostCount: 0,
      nextSpawnAtSec: 0,
      lastElapsedMs: 0,
    };
  }

  function updateTiltButtons() {
    refs.btnLeft.classList.toggle('aids-active', gameState.tilt === 'left');
    refs.btnRight.classList.toggle('aids-active', gameState.tilt === 'right');
  }

  function handleTilt(dir) {
    if (lifecycleState !== 'RUNNING' || inputLock.locked) return;
    setTilt(gameState, dir);
    updateTiltButtons();
  }

  function bindControls() {
    const press = (dir) => (event) => {
      event.preventDefault();
      handleTilt(dir);
    };
    // 모바일
    addListener(refs.btnLeft, 'pointerdown', press('left'));
    addListener(refs.btnRight, 'pointerdown', press('right'));

    // PC: InputManager SELECT_LEFT/SELECT_RIGHT action을 구독
    const unsubscribeInput = context.input?.onAction?.((event) => {
      if (event?.phase !== 'press') return;
      if (event.action === INPUT_ACTIONS?.SELECT_LEFT) handleTilt('left');
      else if (event.action === INPUT_ACTIONS?.SELECT_RIGHT) handleTilt('right');
    });
    if (typeof unsubscribeInput === 'function') {
      removers.push(unsubscribeInput);
    }
  }

  function resetForAttempt() {
    gameState = createFreshGameState();
    buildHearts(refs.heartsEl, config.initialLives);
    updateHearts(refs.heartsEl, gameState.life);
    layoutPlatforms(refs, config, gameState);
    updateTiltButtons();
  }

  function runLoop(ts) {
    if (lifecycleState !== 'RUNNING') return;
    const elapsedMs = typeof clock.getElapsedMs === 'function' ? clock.getElapsedMs() : ts;
    const result = stepFrame({ state: gameState, config, refs, elapsedMs });
    if (result.terminal) {
      complete(result.terminal, currentAttemptId);
      return;
    }
    rafId = requestAnimationFrame(runLoop);
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    currentAttemptId = attemptId;
    terminal = false;
    inputLock.clear();
    resetForAttempt();
    if (typeof clock.start === 'function') {
      clock.start();
    } else {
      clock.reset?.();
    }
    lifecycleState = 'RUNNING';
    rafId = requestAnimationFrame(runLoop);
  }

  function complete(status, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== 'RUNNING' && lifecycleState !== 'PAUSED')
    ) {
      return false;
    }
    if (status !== 'CLEAR' && status !== 'FAIL') {
      throw new TypeError(`${DEFINITION.id} may only complete with CLEAR or FAIL.`);
    }

    terminal = true;
    lifecycleState = 'RESOLVING';
    inputLock.lock('TERMINAL');
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    clock.stop?.();

    let candidate;
    try {
      const metrics = {
        correctCount: gameState.correctCount,
        wrongCount: gameState.wrongCount,
        lostCount: gameState.lostCount,
        remainingLives: Math.max(gameState.life, 0),
      };
      candidate = buildMiniGameCandidate({
        status,
        score: null,
        failureReason: status === 'FAIL' ? DEFINITION.failureReason : null,
        metrics,
        reward: null,
      });
    } catch (error) {
      lifecycleState = 'ERROR';
      context.onError?.(attemptId, error);
      return true;
    }

    lifecycleState = 'COMPLETED';
    context.onComplete?.(attemptId, candidate);
    return true;
  }

  return Object.freeze({
    async init(nextConfig = {}, { signal } = {}) {
      if (disposed || lifecycleState !== 'CREATED') {
        throw new Error(`Cannot initialize mini-game from state ${lifecycleState}.`);
      }
      lifecycleState = 'INITIALIZING';
      throwIfUnavailable(signal, () => disposed);

      if (!nextConfig || typeof nextConfig !== 'object' || Array.isArray(nextConfig)) {
        throw new TypeError('Mini-game config must be an object.');
      }
      if (typeof nextConfig.gameId === 'string' && nextConfig.gameId !== DEFINITION.id) {
        console.warn(
          `[${DEFINITION.id}] config.gameId("${nextConfig.gameId}")가 DEFINITION.id("${DEFINITION.id}")와 다릅니다.`
        );
      }
      config = mergeConfig(nextConfig);
      validateConfig(config);

      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);

      injectStyles(context.uiRoot);
      refs = buildGameDom(context.uiRoot, config);
      bindControls();

      lifecycleState = 'READY';
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== 'READY') {
        throw new Error(`Cannot start mini-game from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    pause(reason = 'SYSTEM') {
      if (disposed || lifecycleState !== 'RUNNING') {
        return false;
      }
      inputLock.lock(reason);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      clock.pause?.(reason);
      lifecycleState = 'PAUSED';
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== 'PAUSED') {
        return false;
      }
      inputLock.clear();
      clock.resume?.();
      lifecycleState = 'RUNNING';
      rafId = requestAnimationFrame(runLoop);
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== 'COMPLETED') {
        throw new Error(`Cannot restart mini-game from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      currentAttemptId = null;
      inputLock.clear();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      clock.stop?.();
      for (const remove of removers.splice(0)) remove();
      refs?.root?.remove?.();
      removeStyles(context.uiRoot);
      refs = null;
      gameState = null;
      lifecycleState = 'DESTROYED';
    },

    getState() {
      return Object.freeze({
        state: lifecycleState,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        elapsedMs: clock.getElapsedMs?.() ?? 0,
      });
    },
  });
}

export default createMiniGame;
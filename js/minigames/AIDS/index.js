import { INPUT_ACTIONS } from '../../core/input-manager.js';
import { InputLock } from '../shared/input-lock.js';
import { MiniGameClock } from '../shared/minigame-clock.js';
import { buildMiniGameCandidate } from '../shared/result-builder.js';
import { attachFixedFrameScaler } from '../shared/fixed-frame-scaler.js';
import { DEFINITION } from './definition.js';
import { mergeConfig, validateConfig } from './config.js';
import { injectStyles, removeStyles } from './styles.js';
import {
  AIDS_LOGICAL_HEIGHT,
  AIDS_LOGICAL_WIDTH,
  buildGameDom,
} from './dom-builder.js';
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

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function toggleClass(element, className, force) {
  if (typeof element?.classList?.toggle === 'function') {
    element.classList.toggle(className, force);
    return;
  }
  if (!element || typeof element.className !== 'string') return;
  const classes = new Set(element.className.split(/\s+/u).filter(Boolean));
  if (force) classes.add(className);
  else classes.delete(className);
  element.className = [...classes].join(' ');
}

function hasClass(element, className) {
  if (typeof element?.classList?.contains === 'function') {
    return element.classList.contains(className);
  }
  return typeof element?.className === 'string'
    && element.className.split(/\s+/u).includes(className);
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

  const requestFrame =
    typeof context.requestAnimationFrame === 'function'
      ? (callback) => context.requestAnimationFrame(callback)
      : typeof globalThis.requestAnimationFrame === 'function'
        ? (callback) => globalThis.requestAnimationFrame(callback)
        : (callback) => {
          const handle = globalThis.setTimeout?.(() => callback(defaultNow()), 16) ?? null;
          handle?.unref?.();
          return handle;
        };
  const cancelFrame =
    typeof context.cancelAnimationFrame === 'function'
      ? (handle) => context.cancelAnimationFrame(handle)
      : typeof globalThis.cancelAnimationFrame === 'function'
        ? (handle) => globalThis.cancelAnimationFrame(handle)
        : (handle) => globalThis.clearTimeout?.(handle);

  const removers = [];
  let config = null;
  let refs = null;
  let injectedStyle = null;
  let gameState = null;
  let rafId = null;
  let lifecycleState = 'CREATED';
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;
  let hostLayoutClassAdded = false;

  function addListener(target, type, listener) {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function cancelScheduledFrame() {
    if (rafId === null) return;
    cancelFrame(rafId);
    rafId = null;
  }

  function scheduleFrame() {
    if (lifecycleState !== 'RUNNING' || !refs?.supportsGameplay) return;
    rafId = requestFrame(runLoop) ?? null;
  }

  function enableHostLayout() {
    if (!context.uiRoot || hasClass(context.uiRoot, 'aids-ui-root')) return;
    toggleClass(context.uiRoot, 'aids-ui-root', true);
    hostLayoutClassAdded = true;
  }

  function restoreHostLayout() {
    if (!hostLayoutClassAdded) return;
    toggleClass(context.uiRoot, 'aids-ui-root', false);
    hostLayoutClassAdded = false;
  }

  function removeMountedDom() {
    const mountNode = refs?.viewport ?? refs?.root;
    mountNode?.remove?.();
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
    toggleClass(refs?.btnLeft, 'aids-active', gameState?.tilt === 'left');
    toggleClass(refs?.btnRight, 'aids-active', gameState?.tilt === 'right');
  }

  function handleTilt(dir) {
    if (lifecycleState !== 'RUNNING' || inputLock.locked) return;
    setTilt(gameState, dir);
    updateTiltButtons();
  }

  function bindControls() {
    if (!refs?.supportsGameplay) return;
    const press = (dir) => (event) => {
      event?.preventDefault?.();
      handleTilt(dir);
    };
    // 모바일
    addListener(refs.btnLeft, 'click', press('left'));
    addListener(refs.btnRight, 'click', press('right'));

    // PC: scaffold InputManager의 공통 이동 action을 미니게임 좌우 선택으로 사용
    const unsubscribeInput = context.input?.onAction?.((event) => {
      if (event?.phase !== 'press') return;
      if (event.action === INPUT_ACTIONS.MOVE_LEFT) handleTilt('left');
      else if (event.action === INPUT_ACTIONS.MOVE_RIGHT) handleTilt('right');
    });
    if (typeof unsubscribeInput === 'function') {
      removers.push(unsubscribeInput);
    }
  }

  function resetForAttempt() {
    for (const egg of gameState?.eggs ?? []) {
      egg.el?.remove?.();
    }
    for (const node of refs?.root?.querySelectorAll?.(
      '.aids-egg, .aids-miss-marker, .aids-float-text',
    ) ?? []) {
      node.remove?.();
    }
    gameState = createFreshGameState();
    if (!refs?.supportsGameplay) return;
    buildHearts(refs.heartsEl, config.initialLives);
    updateHearts(refs.heartsEl, gameState.life);
    layoutPlatforms(refs, config, gameState);
    updateTiltButtons();
  }

  function runLoop(ts) {
    if (lifecycleState !== 'RUNNING') return;
    rafId = null;
    try {
      const elapsedMs = typeof clock.getElapsedMs === 'function' ? clock.getElapsedMs() : ts;
      const result = stepFrame({ state: gameState, config, refs, elapsedMs });
      if (result.terminal) {
        complete(result.terminal, currentAttemptId);
        return;
      }
    } catch (error) {
      failAttempt(error, currentAttemptId);
      return;
    }
    scheduleFrame();
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
    scheduleFrame();
  }

  function failAttempt(error, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== 'RUNNING' && lifecycleState !== 'PAUSED')
    ) {
      return false;
    }
    terminal = true;
    lifecycleState = 'ERROR';
    inputLock.lock('TERMINAL');
    cancelScheduledFrame();
    clock.stop?.();
    context.onError?.(attemptId, error);
    return true;
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
    cancelScheduledFrame();
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

      try {
        enableHostLayout();
        injectedStyle = injectStyles(context.uiRoot);
        refs = buildGameDom(context.uiRoot, config);
        throwIfUnavailable(signal, () => disposed);
        if (refs.supportsGameplay) {
          removers.push(attachFixedFrameScaler({
            container: context.uiRoot,
            viewport: refs.viewport,
            frame: refs.frame,
            logicalWidth: AIDS_LOGICAL_WIDTH,
            logicalHeight: AIDS_LOGICAL_HEIGHT,
            fitHeight: true,
            maxScale: 1,
          }));
        }
        bindControls();
        lifecycleState = 'READY';
      } catch (error) {
        for (const remove of removers.splice(0)) {
          try {
            remove();
          } catch {
            // Initialization cleanup is best-effort; preserve the original error.
          }
        }
        removeMountedDom();
        refs = null;
        removeStyles(context.uiRoot, injectedStyle);
        injectedStyle = null;
        restoreHostLayout();
        if (!disposed) lifecycleState = 'ERROR';
        throw error;
      }
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
      cancelScheduledFrame();
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
      scheduleFrame();
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
      cancelScheduledFrame();
      clock.stop?.();
      for (const remove of removers.splice(0)) {
        try {
          remove();
        } catch {
          // Keep destroy idempotent even when a host listener rejects cleanup.
        }
      }
      removeMountedDom();
      removeStyles(context.uiRoot, injectedStyle);
      injectedStyle = null;
      restoreHostLayout();
      refs = null;
      gameState = null;
      lifecycleState = 'DESTROYED';
    },

    // Dependency-free contract tests use this seam; production UI never calls it.
    completeForDevelopment(status, attemptId) {
      return complete(status, attemptId);
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

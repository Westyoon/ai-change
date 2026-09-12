import { GameLoop } from "../../../../core/game-loop.js";
import { CharacterSystem, VirtualJoystick } from "../../../character/index.js";
import { DEFAULT_PLAYER_APPEARANCE } from "../../../player-config.js";
import { normalizeWordBreakerConfig } from "./config.js";
import { WordBreakerEncounter, WORD_BREAKER_STATES } from "./encounter.js";
import { WordBreakerView } from "./view.js";

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Word Breaker initialization was aborted.", "AbortError");
  }
  const error = new Error("Word Breaker initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? createAbortError();
}

function defaultPlayer() {
  return Object.freeze({
    id: "player-1",
    attackStat: 1,
    defenseStat: 1,
    healthStat: 1,
    accountStats: Object.freeze({ attack: 0, hp: 0, defense: 0 }),
    appearance: DEFAULT_PLAYER_APPEARANCE,
  });
}

function startPosition(config) {
  const configured = config.player?.startPosition ?? config.player?.spawn ?? {};
  return {
    x: Number.isFinite(configured.x)
      ? configured.x
      : (config.arena.width - config.player.width) / 2,
    y: Number.isFinite(configured.y)
      ? configured.y
      : config.arena.height - config.player.height - 54,
  };
}

export function createBattle({ root, input = null, events = null, onComplete = null } = {}) {
  if (!root?.append) throw new Error("Word Breaker createBattle requires a root element.");
  if (!events?.on) throw new Error("Word Breaker createBattle requires the shared EventBus.");

  let config = null;
  let lastConfigSource = null;
  let lastSignal = null;
  let encounter = null;
  let view = null;
  let system = null;
  let joystick = null;
  let loop = null;
  let removeAbortListener = null;
  let localPlayerId = "player-1";
  let initialized = false;
  let destroyed = false;
  let lastState = Object.freeze({ state: WORD_BREAKER_STATES.CREATED, disposed: false });

  function render() {
    if (!encounter || !view || !system) return;
    const snapshot = encounter.getSnapshot();
    lastState = snapshot;
    view.render(snapshot, system.getSnapshot());
  }

  function handleEncounterEvent(event) {
    if (event.type === "finale") {
      system?.setControlLocked(true, "word-breaker-finale");
    } else if (event.type === "complete") {
      loop?.pause();
      system?.setControlLocked(true, "word-breaker-terminal");
    }
  }

  function tick(deltaMs) {
    if (!encounter || !system) return;
    const character = system.update(deltaMs);
    encounter.setPlayerBounds(character);
    encounter.tick(deltaMs);
    render();
  }

  function setup(source) {
    config = normalizeWordBreakerConfig(source);
    const player = Array.isArray(source?.players) && source.players.length > 0
      ? source.players[0]
      : defaultPlayer();
    localPlayerId = typeof player?.id === "string" && player.id ? player.id : "player-1";
    const start = startPosition(config);

    view = new WordBreakerView({
      config,
      localPlayerId,
      document: root.ownerDocument ?? globalThis.document,
    });
    view.mount(root);
    encounter = new WordBreakerEncounter({
      config,
      random: source?.random,
      onEvent: handleEncounterEvent,
      onComplete: (attemptId, candidate) => onComplete?.(attemptId, candidate),
    });
    encounter.init();

    system = new CharacterSystem({
      events,
      inputManager: input,
      character: {
        id: localPlayerId,
        x: start.x,
        y: start.y,
        width: config.player.width,
        height: config.player.height,
        speed: config.player.speed,
        maxHealth: 1,
        currentHealth: 1,
        stats: player.accountStats,
        appearance: player.appearance ?? DEFAULT_PLAYER_APPEARANCE,
      },
      world: {
        bounds: { x: 0, y: 0, width: config.arena.width, height: config.arena.height },
        colliders: [],
        triggers: [],
      },
    }).start();
    encounter.setPlayerBounds(system.getSnapshot());
    joystick = new VirtualJoystick({
      element: view.joystickBase,
      knob: view.joystickKnob,
      onChange: (vector) => system?.setJoystickVector(vector),
    });
    loop = new GameLoop({ update: tick, render: () => {} });
    initialized = true;
    render();
  }

  function teardownRuntime() {
    loop?.destroy();
    joystick?.destroy();
    system?.destroy();
    if (encounter) {
      encounter.destroy();
      lastState = encounter.getSnapshot();
    }
    view?.destroy();
    loop = null;
    joystick = null;
    system = null;
    encounter = null;
    view = null;
    initialized = false;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    removeAbortListener?.();
    removeAbortListener = null;
    teardownRuntime();
    lastState = Object.freeze({ ...lastState, state: WORD_BREAKER_STATES.DESTROYED, disposed: true });
    return true;
  }

  return {
    async init(source = {}, { signal } = {}) {
      if (destroyed) throw new Error("Destroyed Word Breaker cannot be initialized.");
      if (initialized) throw new Error("Word Breaker is already initialized.");
      lastConfigSource = source;
      lastSignal = signal ?? null;
      await Promise.resolve();
      try {
        throwIfAborted(signal);
        setup(source);
        throwIfAborted(signal);
        if (signal) {
          const handleAbort = () => destroy();
          signal.addEventListener("abort", handleAbort, { once: true });
          removeAbortListener = () => signal.removeEventListener("abort", handleAbort);
        }
      } catch (error) {
        teardownRuntime();
        if (signal?.aborted || error?.name === "AbortError") {
          destroyed = true;
          lastState = Object.freeze({ state: WORD_BREAKER_STATES.DESTROYED, disposed: true });
          throw signal?.reason ?? error ?? createAbortError();
        }
        throw error;
      }
    },

    start({ attemptId } = {}) {
      if (!encounter) throw new Error("Word Breaker must be initialized before start().");
      encounter.start({ attemptId });
      loop.start();
      render();
    },

    pause(_reason) {
      if (!encounter?.pause()) return false;
      system?.setControlLocked(true, "word-breaker-pause");
      loop?.pause();
      render();
      return true;
    },

    resume() {
      if (!encounter?.resume()) return false;
      system?.setControlLocked(false, "word-breaker-pause");
      loop?.resume();
      render();
      return true;
    },

    restart({ attemptId } = {}) {
      if (destroyed || !lastConfigSource || lastSignal?.aborted) return false;
      teardownRuntime();
      setup(lastConfigSource);
      encounter.start({ attemptId });
      loop.start();
      render();
      return true;
    },

    destroy,

    getState() {
      return encounter?.getSnapshot() ?? lastState;
    },
  };
}

export default createBattle;

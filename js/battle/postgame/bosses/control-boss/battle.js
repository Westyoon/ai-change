import { GameLoop } from "../../../../core/game-loop.js";
import { CharacterSystem, VirtualJoystick, CHARACTER_EVENTS } from "../../../character/index.js";
import { resolveControlBossConfig } from "./config.js";
import { ControlBossEncounter, CONTROL_BOSS_STATES } from "./encounter.js";
import { ControlBossView } from "./view.js";

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Control Boss initialization was aborted.", "AbortError");
  }
  const error = new Error("Control Boss initialization was aborted.");
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
    accountStats: Object.freeze({ attack: 0, hp: 100, defense: 0 }),
    appearance: Object.freeze({
      id: "control-boss-player",
      label: "YOU",
      color: "#2e7d32",
      accentColor: "#69db7c",
    }),
  });
}

export function createBattle({ root, input = null, events = null, onComplete = null } = {}) {
  if (!root?.append) throw new Error("createBattle(context.root)가 필요합니다.");
  if (!events?.on) throw new Error("createBattle(context.events)가 필요합니다.");

  let config = null;
  let lastConfigSource = null;
  let lastSignal = null;
  let encounter = null;
  let view = null;
  let system = null;
  let joystick = null;
  let loop = null;
  let unsubscribeAttack = null;
  let removeAbortListener = null;
  let localPlayerId = "player-1";
  let pendingAttacks = 0;
  let stunLockActive = false;
  let destroyed = false;
  let initialized = false;
  let lastState = Object.freeze({ state: CONTROL_BOSS_STATES.CREATED, disposed: false });

  function render() {
    if (!encounter || !view || !system) return;
    const snapshot = encounter.getSnapshot();
    lastState = snapshot;
    view.render(snapshot, system.getSnapshot());
  }

  function syncStunLock(snapshot) {
    if (!system || snapshot.isStunned === stunLockActive) return;
    stunLockActive = snapshot.isStunned;
    system.setControlLocked(stunLockActive, "control-boss-stun");
  }

  function handleEncounterEvent(event) {
    if (event.type === "player-damage" && event.amount > 0) {
      system?.applyResolvedDamage(event.amount, {
        sourceId: "control-boss",
        metadata: { attack: event.source, lethal: event.lethal === true },
      });
    }
    if (event.type === "complete") {
      loop?.pause();
      system?.setControlLocked(true, "control-boss-terminal");
    }
  }

  function tick(deltaMs) {
    if (!encounter || !system) return;
    const character = system.update(deltaMs);
    encounter.setPlayerBounds(character);
    while (pendingAttacks > 0 && encounter.state === CONTROL_BOSS_STATES.RUNNING) {
      pendingAttacks -= 1;
      encounter.attack();
    }
    pendingAttacks = 0;
    const snapshot = encounter.tick(deltaMs);
    syncStunLock(snapshot);
    render();
  }

  function setup(source) {
    config = resolveControlBossConfig(source);
    const player = Array.isArray(source?.players) && source.players.length > 0
      ? source.players[0]
      : defaultPlayer();
    localPlayerId = typeof player?.id === "string" && player.id ? player.id : "player-1";
    const start = config.player.startPosition;

    view = new ControlBossView({
      config,
      localPlayerId,
      document: root.ownerDocument ?? globalThis.document,
    });
    view.mount(root);
    encounter = new ControlBossEncounter({
      config,
      player,
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
        maxHealth: encounter.player.maxHp,
        currentHealth: encounter.player.maxHp,
        stats: player.accountStats,
        appearance: player.appearance ?? defaultPlayer().appearance,
      },
      world: {
        bounds: config.world.bounds,
        colliders: [config.world.bossZone],
        triggers: [],
      },
    }).start();
    system.input.attachAttackButton(view.attackButton);
    encounter.setPlayerBounds(system.getSnapshot());

    joystick = new VirtualJoystick({
      element: view.joystickBase,
      knob: view.joystickKnob,
      onChange: (vector) => system?.setJoystickVector(vector),
    });
    unsubscribeAttack = events.on(CHARACTER_EVENTS.ATTACK, (detail) => {
      if (destroyed || detail?.characterId !== localPlayerId) return;
      pendingAttacks += 1;
    });
    loop = new GameLoop({ update: tick, render: () => {} });
    stunLockActive = false;
    pendingAttacks = 0;
    initialized = true;
    render();
  }

  function teardownRuntime() {
    loop?.destroy();
    joystick?.destroy();
    unsubscribeAttack?.();
    system?.destroy();
    if (encounter) {
      encounter.destroy();
      lastState = encounter.getSnapshot();
    }
    view?.destroy();
    loop = null;
    joystick = null;
    unsubscribeAttack = null;
    system = null;
    encounter = null;
    view = null;
    pendingAttacks = 0;
    stunLockActive = false;
    initialized = false;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    removeAbortListener?.();
    removeAbortListener = null;
    teardownRuntime();
    lastState = Object.freeze({ ...lastState, state: CONTROL_BOSS_STATES.DESTROYED, disposed: true });
  }

  return {
    async init(source = {}, { signal } = {}) {
      if (destroyed) throw new Error("Destroyed Control Boss cannot be initialized.");
      if (initialized) throw new Error("Control Boss is already initialized.");
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
          lastState = Object.freeze({ state: CONTROL_BOSS_STATES.DESTROYED, disposed: true });
          throw signal?.reason ?? error ?? createAbortError();
        }
        throw error;
      }
    },

    start({ attemptId } = {}) {
      if (!encounter) throw new Error("Control Boss must be initialized before start().");
      encounter.start({ attemptId });
      loop.start();
      render();
    },

    pause(_reason) {
      if (!encounter?.pause()) return false;
      system?.setControlLocked(true, "control-boss-pause");
      loop?.pause();
      render();
      return true;
    },

    resume() {
      if (!encounter?.resume()) return false;
      system?.setControlLocked(false, "control-boss-pause");
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

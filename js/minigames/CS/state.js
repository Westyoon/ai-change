export const MINI_GAME_STATE = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  RESOLVING: "RESOLVING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  DESTROYED: "DESTROYED",
});

// Short alias for the state skeleton used by the feature branch.
export const STATE = MINI_GAME_STATE;

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATE.CREATED]: new Set([STATE.INITIALIZING]),
  [STATE.INITIALIZING]: new Set([STATE.READY, STATE.ERROR]),
  [STATE.READY]: new Set([STATE.RUNNING]),
  [STATE.RUNNING]: new Set([STATE.PAUSED, STATE.RESOLVING, STATE.ERROR]),
  [STATE.PAUSED]: new Set([STATE.RUNNING, STATE.RESOLVING, STATE.ERROR]),
  [STATE.RESOLVING]: new Set([STATE.COMPLETED, STATE.ERROR]),
  [STATE.COMPLETED]: new Set([STATE.RUNNING]),
  [STATE.ERROR]: new Set(),
  [STATE.DESTROYED]: new Set(),
});

export function canTransition(from, to) {
  if (from === to) return true;
  if (to === STATE.DESTROYED && from !== STATE.DESTROYED) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function transitionState(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid CLICK to PURIFY state transition: ${String(from)} -> ${String(to)}`);
  }
  return to;
}

export function createRunState() {
  return {
    wavesSpawned: 0,
    wavesResolved: 0,
    activeThreats: [],
    purification: 0,
    perfectCount: 0,
    goodCount: 0,
    missCount: 0,
    nextSpawnAt: 0,
    lastJudgement: "READY",
  };
}

export default MINI_GAME_STATE;

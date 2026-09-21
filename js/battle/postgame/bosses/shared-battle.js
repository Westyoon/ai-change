const MAX_ACTION_ID_LENGTH = 64;

function finiteHealth(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}
function readState(sharedBattle) {
  if (typeof sharedBattle?.getSnapshot === "function") return sharedBattle.getSnapshot();
  if (typeof sharedBattle?.getState === "function") return sharedBattle.getState();
  if (typeof sharedBattle?.state === "function") return sharedBattle.state();
  return sharedBattle?.state ?? null;
}

/**
 * Keep the boss modules independent from the websocket implementation.  The
 * realtime service owns transport/reconnect details; bosses only consume this
 * small room-scoped contract.
 */
export function isSharedBattleOnline(sharedBattle, battleId = null) {
  if (!sharedBattle || sharedBattle.online === false) return false;
  if (battleId && sharedBattle.battleId && sharedBattle.battleId !== battleId) return false;
  return Boolean(
    sharedBattle.roomId
    && typeof sharedBattle.subscribe === "function"
    && (typeof sharedBattle.hit === "function" || typeof sharedBattle.sendHit === "function"),
  );
}

export function normalizeSharedBossSnapshot(candidate, battleId = null, roomId = null) {
  if (!candidate || typeof candidate !== "object") return null;
  if (battleId && candidate.battleId && candidate.battleId !== battleId) return null;
  if (roomId && candidate.roomId && candidate.roomId !== roomId) return null;

  const bossHp = finiteHealth(candidate.bossHp);
  const bossMaxHp = finiteHealth(candidate.bossMaxHp);
  if (bossHp === null || bossMaxHp === null || bossMaxHp <= 0) return null;

  const status = candidate.status === "finished" ? "finished" : "running";
  return Object.freeze({
    ...candidate,
    status,
    bossHp: Math.min(bossHp, bossMaxHp),
    bossMaxHp,
    revision: Number.isFinite(Number(candidate.revision))
      ? Math.max(0, Math.trunc(Number(candidate.revision)))
      : 0,
  });
}

export function createSharedActionId(attemptId, kind, sequence) {
  const safeAttemptId = String(attemptId || "battle").replace(/[^A-Za-z0-9._:-]/gu, "-");
  const safeKind = String(kind || "hit").replace(/[^A-Za-z0-9._:-]/gu, "-");
  const suffix = `:${safeKind}:${Math.max(1, Math.trunc(Number(sequence) || 1))}`;
  return `${safeAttemptId.slice(0, Math.max(1, MAX_ACTION_ID_LENGTH - suffix.length))}${suffix}`;
}

function invokeWithoutUnhandledRejection(callback, payload) {
  if (typeof callback !== "function") return false;
  try {
    const result = callback(payload);
    if (result && typeof result.catch === "function") result.catch(() => {});
    return result !== false;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   sharedBattle: object,
 *   battleId: string,
 *   onSnapshot: (snapshot: object) => void,
 *   onFinished?: (snapshot: object) => void,
 * }} options
 */
export function bindSharedBossBattle({
  sharedBattle,
  battleId,
  onSnapshot,
  onFinished = null,
} = {}) {
  if (!isSharedBattleOnline(sharedBattle, battleId)) return null;

  const roomId = sharedBattle.roomId;
  let disposed = false;
  let lastRevision = -1;
  let finishedRevision = -1;

  const receive = (candidate) => {
    if (disposed) return false;
    const snapshot = normalizeSharedBossSnapshot(candidate, battleId, roomId);
    if (!snapshot || snapshot.revision < lastRevision) return false;
    lastRevision = snapshot.revision;
    onSnapshot?.(snapshot);
    if (snapshot.status === "finished" && snapshot.revision >= finishedRevision) {
      if (snapshot.revision > finishedRevision) onFinished?.(snapshot);
      finishedRevision = snapshot.revision;
    }
    return true;
  };

  const unsubscribe = sharedBattle.subscribe(receive);
  receive(readState(sharedBattle));

  return Object.freeze({
    get online() {
      return !disposed;
    },

    refresh() {
      return receive(readState(sharedBattle));
    },

    ready() {
      if (disposed) return false;
      const callback = typeof sharedBattle.ready === "function"
        ? sharedBattle.ready.bind(sharedBattle)
        : sharedBattle.sendReady?.bind(sharedBattle);
      return invokeWithoutUnhandledRejection(callback);
    },

    hit({ kind, actionId }) {
      if (disposed) return false;
      const callback = typeof sharedBattle.hit === "function"
        ? sharedBattle.hit.bind(sharedBattle)
        : sharedBattle.sendHit?.bind(sharedBattle);
      return invokeWithoutUnhandledRejection(callback, { kind, actionId });
    },

    destroy() {
      if (disposed) return false;
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
      return true;
    },
  });
}

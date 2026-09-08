const SUPPORTED_UNLOCK_TYPE = "ALL_MINIGAMES_CLEAR";

function completedIdsFromLocalSave(saveState) {
  return Object.entries(saveState?.minigames ?? {})
    .filter(([, record]) => record?.completed === true)
    .map(([id]) => id);
}

/**
 * Battle unlocks use distinct mini-game ids, never the aggregate clear count.
 * Replays can increase the server count, so they must not unlock missing games.
 */
export function getCompletedMiniGameIds(saveState, accountState) {
  return new Set([
    ...completedIdsFromLocalSave(saveState),
    ...(Array.isArray(accountState?.completedGameIds) ? accountState.completedGameIds : []),
  ]);
}

export function getBattleUnlockStatus(definition, saveState, accountState) {
  const condition = definition?.unlockCondition;
  if (condition == null) {
    return Object.freeze({ unlocked: true, completed: 0, total: 0, missingMiniGameIds: [] });
  }
  if (condition.type !== SUPPORTED_UNLOCK_TYPE || !Array.isArray(condition.miniGameIds)) {
    return Object.freeze({
      unlocked: false,
      completed: 0,
      total: 0,
      missingMiniGameIds: [],
      reason: "UNSUPPORTED_UNLOCK_CONDITION",
    });
  }

  const completedIds = getCompletedMiniGameIds(saveState, accountState);
  const requiredIds = [...new Set(condition.miniGameIds)];
  const missingMiniGameIds = requiredIds.filter((id) => !completedIds.has(id));
  return Object.freeze({
    unlocked: missingMiniGameIds.length === 0,
    completed: requiredIds.length - missingMiniGameIds.length,
    total: requiredIds.length,
    missingMiniGameIds: Object.freeze(missingMiniGameIds),
  });
}

export { SUPPORTED_UNLOCK_TYPE };

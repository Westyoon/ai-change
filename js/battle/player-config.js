function nonNegativeInteger(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

/**
 * D1 stores allocated attack/defense points from 0 and HP from a 100 baseline.
 * The stat-boss formulas use 1 as their no-bonus baseline, so this adapter is
 * the single explicit boundary between the two representations.
 */
export function createStatBossPlayer(accountState, arena = { width: 960, height: 600 }) {
  const raw = accountState?.authenticated ? accountState.stats ?? {} : {};
  const attack = nonNegativeInteger(raw.attack);
  const hp = nonNegativeInteger(raw.hp);
  const defense = nonNegativeInteger(raw.defense);

  return Object.freeze({
    id: "player-1",
    attackStat: attack + 1,
    defenseStat: defense + 1,
    healthStat: 1 + Math.max(0, hp - 100),
    accountStats: Object.freeze({ attack, hp, defense }),
    position: Object.freeze({ x: arena.width / 2, y: arena.height * 0.8 }),
  });
}

export default createStatBossPlayer;

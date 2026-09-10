function nonNegativeInteger(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

export const DEFAULT_PLAYER_APPEARANCE = Object.freeze({
  id: "festival-player",
  label: "YOU",
  color: "#d82f76",
  accentColor: "#363367",
  spriteSheet: Object.freeze({
    src: "./assets/images/character-walk.png",
    sourceWidth: 1402,
    sourceHeight: 1122,
    sourceX: 201,
    sourceY: 1,
    frameWidth: 250,
    frameHeight: 280,
    frameCount: 4,
    frameDurationMs: 130,
    directionRows: Object.freeze({ down: 0, left: 1, right: 2, up: 3 }),
  }),
});

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
    appearance: DEFAULT_PLAYER_APPEARANCE,
  });
}

/**
 * Every published Battle receives the same privacy-safe player shape. Individual
 * encounters may use only the fields their documented formula needs.
 */
export function createBattlePlayer(
  accountState,
  arena = { width: 960, height: 600 },
  { useAccountStats = true } = {},
) {
  return createStatBossPlayer(useAccountStats ? accountState : { authenticated: false }, arena);
}

export default createStatBossPlayer;

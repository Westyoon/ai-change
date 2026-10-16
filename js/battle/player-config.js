function nonNegativeInteger(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

export const HAIR_COLOR_OPTIONS = Object.freeze([
  Object.freeze({ id: "magenta", label: "자주색", row: 0, sourceY: 0, color: "#a73575" }),
  Object.freeze({ id: "purple", label: "보라색", row: 1, sourceY: 181, color: "#7468c4" }),
  Object.freeze({ id: "brown", label: "갈색", row: 2, sourceY: 362, color: "#765547" }),
  Object.freeze({ id: "blonde", label: "금발", row: 3, sourceY: 543, color: "#e6dd49" }),
]);

export function createPlayerAppearance(hairColor = "purple", label = "") {
  const option = HAIR_COLOR_OPTIONS.find((item) => item.id === hairColor) ?? HAIR_COLOR_OPTIONS[1];
  return Object.freeze({
    id: `festival-player-${option.id}`,
    label,
    hairColor: option.id,
    color: option.color,
    accentColor: "#363367",
    // Visible front-pose centers within the first 115 x 181 crop.
    portraitCenter: Object.freeze({
      x: option.id === "purple" || option.id === "brown" ? 69.5 : 70,
      y: { magenta: 90, purple: 83.5, brown: 81, blonde: 79.5 }[option.id],
    }),
    spriteSheet: Object.freeze({
      src: "./assets/images/character-hair-colors.png",
      sourceWidth: 2171, sourceHeight: 724,
      sourceX: 0, sourceY: option.sourceY,
      frameWidth: 115, frameHeight: 181,
      frameOffsets: Object.freeze([0, 115, 208, 302, 400, 502, 600, 698, 794, 888, 984, 1094, 1199, 1291, 1388, 1482, 1576, 1672, 1771, 1868, 1961, 2056]),
      frameWidths: Object.freeze([115, 93, 94, 98, 102, 98, 98, 96, 94, 96, 110, 105, 92, 97, 94, 94, 96, 99, 97, 93, 95, 115]),
      frameDurationMs: 180,
      idleFrames: Object.freeze({ down: [0], up: [18], right: [4], left: [10] }),
      directionFrames: Object.freeze({ down: [0, 1, 2, 3], up: [18, 19, 20, 21], right: [4, 5, 6, 7, 8, 9], left: [10, 11, 12, 13, 14, 15, 16, 17] }),
    }),
  });
}

export const DEFAULT_PLAYER_APPEARANCE = createPlayerAppearance();

/**
 * D1 stores allocated attack/defense points from 0 and the actual maximum HP
 * in 100-point units (100, 200, 300, ...).
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
    healthStat: 1 + Math.max(0, hp - 100) / 100,
    accountStats: Object.freeze({ attack, hp, defense }),
    position: Object.freeze({ x: arena.width / 2, y: arena.height * 0.8 }),
    appearance: accountState?.authenticated
      ? createPlayerAppearance(accountState.user?.hairColor, accountState.user?.nickname ?? accountState.user?.name ?? "플레이어")
      : DEFAULT_PLAYER_APPEARANCE,
  });
}

/**
 * Every published Battle receives the same privacy-safe player shape. Individual
 * encounters may use only the fields their documented formula needs.
 */
export function createBattlePlayer(
  accountState,
  arena = { width: 960, height: 600 },
  { useAccountStats = true, useAccountAppearance = useAccountStats } = {},
) {
  const player = createStatBossPlayer(useAccountStats ? accountState : { authenticated: false }, arena);
  return Object.freeze({
    ...player,
    appearance: useAccountAppearance && accountState?.authenticated
      ? createPlayerAppearance(accountState.user?.hairColor, accountState.user?.nickname ?? accountState.user?.name ?? "플레이어")
      : DEFAULT_PLAYER_APPEARANCE,
  });
}

export default createStatBossPlayer;

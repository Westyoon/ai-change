export const EXPERIENCE_PER_LEVEL = 100;

export function createPostgameReward(random = Math.random) {
  const EXPERIENCE_PER_POSTGAME_CLEAR = 100 + Math.floor(random() * 11) * 10;

// SQLite evaluates each assignment using the old row. Award points only when
// the new XP crosses a level boundary, preserving all existing progression.
  const POSTGAME_LEVEL_GAIN_SQL =
  `CASE WHEN COALESCE(experience, 0) + ${EXPERIENCE_PER_POSTGAME_CLEAR}
     >= COALESCE(level, 1) * (COALESCE(level, 1) + 1) * ${EXPERIENCE_PER_LEVEL} / 2
   THEN 1 ELSE 0 END`;
  return { EXPERIENCE_PER_POSTGAME_CLEAR, POSTGAME_LEVEL_GAIN_SQL };
}

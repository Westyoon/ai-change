export const DATA_SPHINX_BATTLE_ID = "data-sphinx";
export const DATA_SPHINX_SELECTIONS = Object.freeze({
  O: "O",
  X: "X",
  NEUTRAL: "NEUTRAL",
});

const DEFAULT_ARENA = Object.freeze({ width: 1600, height: 720 });
const DEFAULT_PLAYER = Object.freeze({
  width: 34,
  height: 44,
  speed: 500,
  maxHealth: 100,
});

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function positiveNumber(value, fallback, label) {
  const candidate = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return candidate;
}

function nonNegativeNumber(value, fallback, label) {
  const candidate = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
  return candidate;
}

function finitePoint(value, fallback, label) {
  const candidate = value ?? fallback;
  const x = Number(candidate?.x);
  const y = Number(candidate?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(`${label} requires finite x and y coordinates.`);
  }
  return Object.freeze({ x, y });
}

function normalizeQuizzes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("Data Sphinx quizList must contain at least one quiz.");
  }
  const ids = new Set();
  return Object.freeze(value.map((quiz, index) => {
    object(quiz, `Data Sphinx quiz ${index + 1}`);
    const id = typeof quiz.id === "string" || Number.isFinite(quiz.id)
      ? String(quiz.id)
      : `quiz-${index + 1}`;
    const question = typeof quiz.question === "string" ? quiz.question.trim() : "";
    if (!question) throw new TypeError(`Data Sphinx quiz ${id} requires a question.`);
    if (quiz.answer !== DATA_SPHINX_SELECTIONS.O && quiz.answer !== DATA_SPHINX_SELECTIONS.X) {
      throw new TypeError(`Data Sphinx quiz ${id} answer must be O or X.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate Data Sphinx quiz id: ${id}.`);
    ids.add(id);
    return Object.freeze({ id, question, answer: quiz.answer });
  }));
}

/**
 * Validates the checked-in content and adapts the optional host player without
 * changing the original O/X damage model. `player.spawn` is a center point;
 * CharacterSystem itself stores the actor's top-left corner.
 */
export function normalizeDataSphinxConfig(config = {}) {
  object(config, "Data Sphinx config");
  if (config.battleId != null && config.battleId !== DATA_SPHINX_BATTLE_ID) {
    throw new Error(`Data Sphinx battleId must be ${DATA_SPHINX_BATTLE_ID}.`);
  }

  const arenaInput = config.arena ?? DEFAULT_ARENA;
  object(arenaInput, "Data Sphinx arena");
  const arena = Object.freeze({
    width: positiveNumber(arenaInput.width, DEFAULT_ARENA.width, "Data Sphinx arena.width"),
    height: positiveNumber(arenaInput.height, DEFAULT_ARENA.height, "Data Sphinx arena.height"),
  });

  const playerInput = config.player ?? {};
  object(playerInput, "Data Sphinx player config");
  const hostPlayer = Array.isArray(config.players) ? config.players[0] : null;
  const width = positiveNumber(playerInput.width, DEFAULT_PLAYER.width, "Data Sphinx player.width");
  const height = positiveNumber(playerInput.height, DEFAULT_PLAYER.height, "Data Sphinx player.height");
  const configuredSpawn = playerInput.spawn ?? hostPlayer?.position;
  const spawn = finitePoint(
    configuredSpawn,
    { x: arena.width / 2, y: arena.height / 2 },
    "Data Sphinx player.spawn",
  );
  const id = typeof hostPlayer?.id === "string" && hostPlayer.id
    ? hostPlayer.id
    : "player-1";
  const player = Object.freeze({
    id,
    width,
    height,
    speed: positiveNumber(playerInput.speed, DEFAULT_PLAYER.speed, "Data Sphinx player.speed"),
    maxHealth: positiveNumber(
      playerInput.maxHealth,
      DEFAULT_PLAYER.maxHealth,
      "Data Sphinx player.maxHealth",
    ),
    spawn,
    accountStats: hostPlayer?.accountStats ?? playerInput.accountStats ?? {},
    appearance: hostPlayer?.appearance ?? playerInput.appearance ?? {},
  });

  const bossMaxHealth = positiveNumber(
    config.bossMaxHealth,
    100,
    "Data Sphinx bossMaxHealth",
  );
  const damagePerCorrect = positiveNumber(
    config.damagePerCorrect,
    10,
    "Data Sphinx damagePerCorrect",
  );
  const quizList = normalizeQuizzes(config.quizList);
  const requiredCorrectAnswers = Math.ceil(bossMaxHealth / damagePerCorrect);
  if (quizList.length < requiredCorrectAnswers) {
    throw new RangeError(
      `Data Sphinx requires at least ${requiredCorrectAnswers} quizzes to make CLEAR possible.`,
    );
  }

  return Object.freeze({
    battleId: DATA_SPHINX_BATTLE_ID,
    arena,
    player,
    timeLimitMs: positiveNumber(config.timeLimitMs, 3000, "Data Sphinx timeLimitMs"),
    resolutionDelayMs: nonNegativeNumber(
      config.resolutionDelayMs,
      2000,
      "Data Sphinx resolutionDelayMs",
    ),
    deathDelayMs: nonNegativeNumber(config.deathDelayMs, 1000, "Data Sphinx deathDelayMs"),
    bossMaxHealth,
    damagePerCorrect,
    playerDamagePerWrong: positiveNumber(
      config.playerDamagePerWrong,
      20,
      "Data Sphinx playerDamagePerWrong",
    ),
    quizList,
  });
}

/** The O/X choice is based on the visible actor's center, not its top-left. */
export function getDataSphinxSelection(characterSnapshot, arena) {
  if (!characterSnapshot || !arena) return DATA_SPHINX_SELECTIONS.NEUTRAL;
  const centerX = Number(characterSnapshot.x) + Number(characterSnapshot.width) / 2;
  const dividerX = Number(arena.width) / 2;
  if (!Number.isFinite(centerX) || !Number.isFinite(dividerX)) {
    return DATA_SPHINX_SELECTIONS.NEUTRAL;
  }
  const tolerance = Math.max(1e-7, Math.abs(dividerX) * Number.EPSILON * 4);
  if (Math.abs(centerX - dividerX) <= tolerance) return DATA_SPHINX_SELECTIONS.NEUTRAL;
  return centerX < dividerX ? DATA_SPHINX_SELECTIONS.O : DATA_SPHINX_SELECTIONS.X;
}

export default normalizeDataSphinxConfig;

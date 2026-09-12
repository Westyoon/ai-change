const REQUIRED_ROUND_COUNT = 5;

const DEFAULT_ARENA = Object.freeze({ x: 0, y: 0, width: 450, height: 800 });

const DEFAULT_PLAYER = Object.freeze({
  width: 34,
  height: 46,
  speed: 220,
  invulnerableMs: 700,
  startPosition: Object.freeze({ x: 208, y: 700 }),
});

const DEFAULT_SHOT = Object.freeze({
  width: 6,
  height: 14,
  speed: 520,
  intervalMs: 180,
  damage: 20,
});

const DEFAULT_PHRASE = Object.freeze({
  width: 310,
  height: 58,
  targetHeight: 24,
  speed: 58,
  spawnIntervalMs: 1_600,
  maxHp: 60,
  reframeDurationMs: 900,
  horizontalPadding: 24,
});

const DEFAULT_GUARDIAN = Object.freeze({
  width: 38,
  height: 38,
  speed: 150,
  spawnY: 90,
});

const DEFAULT_SCORING = Object.freeze({
  phraseBase: 100,
  comboStep: 20,
  guardianBonus: 500,
  finaleBonus: 1_500,
});

const DEFAULT_ROUNDS = Object.freeze([
  Object.freeze({
    id: "data-insight",
    label: "데이터사이언스",
    collapseMessage: "확신이 무너지며 데이터의 수호알이 나타났습니다.",
    recoveryMessage: "틀림도 다음 판단을 위한 데이터가 됩니다.",
    guardian: Object.freeze({ id: "guardian-ds", code: "DS", label: "데이터 수호알", color: "#d82f76" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "ds-fear-1",
        negative: "나는 또 답을 틀릴 거야",
        target: "틀릴 거야",
        reframe: "틀려도 다시 살펴볼 수 있어",
        maxHp: 60,
      }),
      Object.freeze({
        id: "ds-fear-2",
        negative: "숫자는 언제나 나를 속여",
        target: "속여",
        reframe: "근거를 확인하면 판단할 수 있어",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "security-courage",
    label: "사이버보안",
    collapseMessage: "불안이 무너지며 보안의 수호알이 나타났습니다.",
    recoveryMessage: "도움을 요청하는 것도 안전을 지키는 방법입니다.",
    guardian: Object.freeze({ id: "guardian-cs", code: "CS", label: "보안 수호알", color: "#363367" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "cs-fear-1",
        negative: "위협을 혼자 막을 수 없어",
        target: "없어",
        reframe: "함께 점검하면 더 안전해질 수 있어",
        maxHp: 60,
      }),
      Object.freeze({
        id: "cs-fear-2",
        negative: "한 번의 실수로 모두 끝날 거야",
        target: "끝날 거야",
        reframe: "복구하고 다시 대비할 수 있어",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "code-heart",
    label: "컴퓨터공학",
    collapseMessage: "막힌 생각이 무너지며 코드의 수호알이 나타났습니다.",
    recoveryMessage: "작은 단위부터 고치면 다시 이어갈 수 있습니다.",
    guardian: Object.freeze({ id: "guardian-cse", code: "CSE", label: "코드 수호알", color: "#e333bb" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "cse-fear-1",
        negative: "내 코드는 늘 엉망이야",
        target: "엉망이야",
        reframe: "한 줄씩 고치며 완성할 수 있어",
        maxHp: 60,
      }),
      Object.freeze({
        id: "cse-fear-2",
        negative: "이 오류는 절대 못 찾겠어",
        target: "절대 못 찾겠어",
        reframe: "조건을 나누면 원인을 찾을 수 있어",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "ai-focus",
    label: "인공지능",
    collapseMessage: "단정이 무너지며 인공지능의 수호알이 나타났습니다.",
    recoveryMessage: "모르는 것은 새로운 학습의 시작이 됩니다.",
    guardian: Object.freeze({ id: "guardian-ai", code: "AI", label: "학습 수호알", color: "#2ab5e4" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "ai-fear-1",
        negative: "나는 제대로 분류하지 못해",
        target: "못해",
        reframe: "기준을 배우며 더 나아질 수 있어",
        maxHp: 60,
      }),
      Object.freeze({
        id: "ai-fear-2",
        negative: "내 판단은 항상 틀렸어",
        target: "항상 틀렸어",
        reframe: "피드백으로 판단을 조정할 수 있어",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "flow-recovery",
    label: "AI융합학부",
    collapseMessage: "혼란이 무너지며 흐름의 수호알이 나타났습니다.",
    recoveryMessage: "흐름을 천천히 따라가면 패턴을 발견할 수 있습니다.",
    guardian: Object.freeze({ id: "guardian-aids", code: "AIDS", label: "흐름 수호알", color: "#fac804" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "aids-fear-1",
        negative: "데이터의 흐름을 이해할 수 없어",
        target: "없어",
        reframe: "작은 흐름부터 따라갈 수 있어",
        maxHp: 60,
      }),
      Object.freeze({
        id: "aids-fear-2",
        negative: "복잡한 패턴은 나와 맞지 않아",
        target: "맞지 않아",
        reframe: "차근차근 분류하면 패턴이 보여",
        maxHp: 60,
      }),
    ]),
  }),
]);

const DEFAULT_FINAL_PHRASE = Object.freeze({
  id: "final-heart",
  negative: "나는 아무것도 바꿀 수 없어",
  target: "바꿀 수 없어",
  reframe: "나는 작은 변화부터 시작할 수 있어",
  maxHp: REQUIRED_ROUND_COUNT,
});

export const DEFAULT_WORD_BREAKER_CONFIG = Object.freeze({
  battleId: "word-breaker",
  title: "마음의 말 깨부수기",
  implementationStatus: "MVP",
  arena: DEFAULT_ARENA,
  roundDurationMs: 14_000,
  collapseImpactMs: 520,
  magnetDelayMs: 1_200,
  finaleDurationMs: 4_000,
  simulationStepMs: 16,
  maxActivePhrases: 6,
  player: DEFAULT_PLAYER,
  shot: DEFAULT_SHOT,
  phrase: DEFAULT_PHRASE,
  guardian: DEFAULT_GUARDIAN,
  scoring: DEFAULT_SCORING,
  rounds: DEFAULT_ROUNDS,
  finalPhrase: DEFAULT_FINAL_PHRASE,
});

function finite(value, fallback, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value == null) return fallback;
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  const normalized = integer ? Math.trunc(value) : value;
  if (normalized < min || normalized > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return normalized;
}

function text(value, fallback, label) {
  if (value == null) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizePhrase(source, fallback, label, shotDamage, defaultMaxHp = fallback.maxHp) {
  const negative = text(source?.negative, fallback.negative, `${label}.negative`);
  const target = text(source?.target, fallback.target, `${label}.target`);
  const firstTargetIndex = negative.indexOf(target);
  if (firstTargetIndex < 0 || negative.indexOf(target, firstTargetIndex + target.length) >= 0) {
    throw new RangeError(`${label}.target must occur exactly once in negative.`);
  }
  const requestedHits = finite(source?.targetHits, null, `${label}.targetHits`, { min: 1, integer: true });
  const maxHp = finite(
    source?.maxHp,
    requestedHits == null ? defaultMaxHp : requestedHits * shotDamage,
    `${label}.maxHp`,
    { min: 1 },
  );
  return {
    id: text(source?.id, fallback.id, `${label}.id`),
    negative,
    target,
    reframe: text(source?.reframe, fallback.reframe, `${label}.reframe`),
    maxHp,
  };
}

function normalizeRound(source, fallback, index, shotDamage, defaultMaxHp) {
  const label = `rounds[${index}]`;
  const guardianSource = source?.guardian ?? {};
  const phraseSource = source?.phrases ?? fallback.phrases;
  if (!Array.isArray(phraseSource) || phraseSource.length === 0) {
    throw new RangeError(`${label}.phrases must contain at least one phrase.`);
  }
  return {
    id: text(source?.id, fallback.id, `${label}.id`),
    label: text(source?.label, fallback.label, `${label}.label`),
    collapseMessage: text(source?.collapseMessage, fallback.collapseMessage, `${label}.collapseMessage`),
    recoveryMessage: text(source?.recoveryMessage, fallback.recoveryMessage, `${label}.recoveryMessage`),
    guardian: {
      id: text(guardianSource.id, fallback.guardian.id, `${label}.guardian.id`),
      code: text(guardianSource.code, fallback.guardian.code, `${label}.guardian.code`),
      label: text(guardianSource.label, fallback.guardian.label, `${label}.guardian.label`),
      color: text(guardianSource.color, fallback.guardian.color, `${label}.guardian.color`),
    },
    phrases: phraseSource.map((phrase, phraseIndex) => normalizePhrase(
      phrase,
      fallback.phrases[phraseIndex % fallback.phrases.length],
      `${label}.phrases[${phraseIndex}]`,
      shotDamage,
      defaultMaxHp,
    )),
  };
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new RangeError(`${label} must be unique.`);
}

export function normalizeWordBreakerConfig(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Word Breaker config must be an object.");
  }
  const arenaSource = source.arena ?? {};
  const arena = {
    x: finite(arenaSource.x, DEFAULT_ARENA.x, "arena.x"),
    y: finite(arenaSource.y, DEFAULT_ARENA.y, "arena.y"),
    width: finite(arenaSource.width, DEFAULT_ARENA.width, "arena.width", { min: 1 }),
    height: finite(arenaSource.height, DEFAULT_ARENA.height, "arena.height", { min: 1 }),
  };
  const shotSource = source.shot ?? {};
  const shot = {
    width: finite(shotSource.width, DEFAULT_SHOT.width, "shot.width", { min: 1 }),
    height: finite(shotSource.height, DEFAULT_SHOT.height, "shot.height", { min: 1 }),
    speed: finite(shotSource.speed, DEFAULT_SHOT.speed, "shot.speed", { min: 1 }),
    intervalMs: finite(shotSource.intervalMs, DEFAULT_SHOT.intervalMs, "shot.intervalMs", { min: 1 }),
    damage: finite(shotSource.damage, DEFAULT_SHOT.damage, "shot.damage", { min: 1 }),
  };
  const playerSource = source.player ?? {};
  const startSource = playerSource.startPosition ?? {};
  const player = {
    width: finite(playerSource.width, DEFAULT_PLAYER.width, "player.width", { min: 1, max: arena.width }),
    height: finite(playerSource.height, DEFAULT_PLAYER.height, "player.height", { min: 1, max: arena.height }),
    speed: finite(playerSource.speed, DEFAULT_PLAYER.speed, "player.speed", { min: 1 }),
    invulnerableMs: finite(
      playerSource.invulnerableMs,
      DEFAULT_PLAYER.invulnerableMs,
      "player.invulnerableMs",
      { min: 0 },
    ),
    startPosition: {
      x: finite(startSource.x, DEFAULT_PLAYER.startPosition.x, "player.startPosition.x"),
      y: finite(startSource.y, DEFAULT_PLAYER.startPosition.y, "player.startPosition.y"),
    },
  };
  const phraseSource = source.phrase ?? {};
  const phrase = {
    width: finite(phraseSource.width, DEFAULT_PHRASE.width, "phrase.width", { min: 1, max: arena.width }),
    height: finite(phraseSource.height, DEFAULT_PHRASE.height, "phrase.height", { min: 1, max: arena.height }),
    targetHeight: finite(
      phraseSource.targetHeight,
      DEFAULT_PHRASE.targetHeight,
      "phrase.targetHeight",
      { min: 1 },
    ),
    speed: finite(phraseSource.speed, DEFAULT_PHRASE.speed, "phrase.speed", { min: 1 }),
    spawnIntervalMs: finite(
      phraseSource.spawnIntervalMs,
      DEFAULT_PHRASE.spawnIntervalMs,
      "phrase.spawnIntervalMs",
      { min: 1 },
    ),
    maxHp: finite(phraseSource.maxHp, DEFAULT_PHRASE.maxHp, "phrase.maxHp", { min: 1 }),
    reframeDurationMs: finite(
      phraseSource.reframeDurationMs,
      DEFAULT_PHRASE.reframeDurationMs,
      "phrase.reframeDurationMs",
      { min: 0 },
    ),
    horizontalPadding: finite(
      phraseSource.horizontalPadding,
      DEFAULT_PHRASE.horizontalPadding,
      "phrase.horizontalPadding",
      { min: 0, max: arena.width / 2 },
    ),
  };
  if (phrase.targetHeight > phrase.height) {
    throw new RangeError("phrase.targetHeight cannot exceed phrase.height.");
  }
  const guardianSource = source.guardian ?? {};
  const guardian = {
    width: finite(guardianSource.width, DEFAULT_GUARDIAN.width, "guardian.width", { min: 1, max: arena.width }),
    height: finite(guardianSource.height, DEFAULT_GUARDIAN.height, "guardian.height", { min: 1, max: arena.height }),
    speed: finite(guardianSource.speed, DEFAULT_GUARDIAN.speed, "guardian.speed", { min: 1 }),
    spawnY: finite(guardianSource.spawnY, DEFAULT_GUARDIAN.spawnY, "guardian.spawnY"),
  };
  const scoringSource = source.scoring ?? {};
  const scoring = {
    phraseBase: finite(scoringSource.phraseBase, DEFAULT_SCORING.phraseBase, "scoring.phraseBase", { min: 0 }),
    comboStep: finite(scoringSource.comboStep, DEFAULT_SCORING.comboStep, "scoring.comboStep", { min: 0 }),
    guardianBonus: finite(
      scoringSource.guardianBonus,
      DEFAULT_SCORING.guardianBonus,
      "scoring.guardianBonus",
      { min: 0 },
    ),
    finaleBonus: finite(scoringSource.finaleBonus, DEFAULT_SCORING.finaleBonus, "scoring.finaleBonus", { min: 0 }),
  };
  const roundsSource = source.rounds ?? DEFAULT_ROUNDS;
  if (!Array.isArray(roundsSource) || roundsSource.length !== REQUIRED_ROUND_COUNT) {
    throw new RangeError(`Word Breaker requires exactly ${REQUIRED_ROUND_COUNT} rounds.`);
  }
  const rounds = roundsSource.map((round, index) => normalizeRound(
    round,
    DEFAULT_ROUNDS[index],
    index,
    shot.damage,
    phrase.maxHp,
  ));
  const finalPhrase = normalizePhrase(
    source.finalPhrase,
    DEFAULT_FINAL_PHRASE,
    "finalPhrase",
    shot.damage,
    DEFAULT_FINAL_PHRASE.maxHp,
  );
  if (finalPhrase.maxHp !== rounds.length) {
    throw new RangeError(`finalPhrase.maxHp must equal the ${rounds.length} guardian recovery steps.`);
  }

  assertUnique(rounds.map(({ id }) => id), "round ids");
  assertUnique(rounds.map(({ guardian: item }) => item.id), "guardian ids");
  assertUnique(rounds.map(({ guardian: item }) => item.code), "guardian codes");
  assertUnique(
    [...rounds.flatMap(({ phrases }) => phrases.map(({ id }) => id)), finalPhrase.id],
    "phrase ids",
  );

  return deepFreeze({
    battleId: text(source.battleId, DEFAULT_WORD_BREAKER_CONFIG.battleId, "battleId"),
    title: text(source.title, DEFAULT_WORD_BREAKER_CONFIG.title, "title"),
    implementationStatus: text(
      source.implementationStatus,
      DEFAULT_WORD_BREAKER_CONFIG.implementationStatus,
      "implementationStatus",
    ),
    arena,
    roundDurationMs: finite(
      source.roundDurationMs,
      DEFAULT_WORD_BREAKER_CONFIG.roundDurationMs,
      "roundDurationMs",
      { min: 1 },
    ),
    collapseImpactMs: finite(
      source.collapseImpactMs,
      DEFAULT_WORD_BREAKER_CONFIG.collapseImpactMs,
      "collapseImpactMs",
      { min: 0 },
    ),
    magnetDelayMs: finite(
      source.magnetDelayMs,
      DEFAULT_WORD_BREAKER_CONFIG.magnetDelayMs,
      "magnetDelayMs",
      { min: 0 },
    ),
    finaleDurationMs: finite(
      source.finaleDurationMs,
      DEFAULT_WORD_BREAKER_CONFIG.finaleDurationMs,
      "finaleDurationMs",
      { min: 1 },
    ),
    simulationStepMs: finite(
      source.simulationStepMs,
      DEFAULT_WORD_BREAKER_CONFIG.simulationStepMs,
      "simulationStepMs",
      { min: 1, max: 100 },
    ),
    maxActivePhrases: finite(
      source.maxActivePhrases,
      DEFAULT_WORD_BREAKER_CONFIG.maxActivePhrases,
      "maxActivePhrases",
      { min: 1, integer: true },
    ),
    player,
    shot,
    phrase,
    guardian,
    scoring,
    rounds,
    finalPhrase,
  });
}

export default normalizeWordBreakerConfig;

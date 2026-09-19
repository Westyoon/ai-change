const REQUIRED_ROUND_COUNT = 5;

export const WORD_BREAKER_GIMMICK_TYPES = Object.freeze([
  "lane-rain",
  "firewall-gates",
  "recursive-fork",
  "prediction-lock",
  "convergence-ring",
]);

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
  maxHp: 100,
  reframeDurationMs: 650,
  horizontalPadding: 24,
  letterSpacing: 1.5,
  wobbleAmplitudeX: 4,
  wobbleAmplitudeY: 3,
  wobbleWavelength: 96,
});

const DEFAULT_GUARDIAN = Object.freeze({
  width: 38,
  height: 38,
  speed: 300,
  spawnY: 90,
});

const DEFAULT_GIMMICKS = Object.freeze([
  Object.freeze({
    type: "lane-rain",
    name: "결측치·이상치 폭주",
    cue: "결측값과 이상치 글자가 데이터 축의 상하좌우에서 교차해 날아옵니다.",
    telegraphMs: 1_600,
    forceAtMs: 6_400,
    spawnIntervalMs: 130,
    glyphSpeed: 360,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: 5,
  }),
  Object.freeze({
    type: "firewall-gates",
    name: "악성 패킷·포트 스캔",
    cue: "악성 패킷이 한 곳의 넓은 탈출구만 남긴 원형 방화벽으로 좁혀 오며, 폭주하면 열린 포트까지 닫힙니다.",
    telegraphMs: 1_800,
    forceAtMs: 6_800,
    spawnIntervalMs: 1_500,
    glyphSpeed: 380,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: 7,
  }),
  Object.freeze({
    type: "recursive-fork",
    name: "무한 재귀·스택 오버플로",
    cue: "하나의 오류 호출이 1→2→4→8개로 복제되며 스택을 반복해서 채웁니다.",
    telegraphMs: 1_600,
    forceAtMs: 6_600,
    spawnIntervalMs: 360,
    glyphSpeed: 300,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: 8,
  }),
  Object.freeze({
    type: "prediction-lock",
    name: "오분류·신뢰도 락온",
    cue: "여러 예측 후보가 점점 좁아지며 마지막에는 하나의 틀린 확신으로 고정됩니다.",
    telegraphMs: 1_800,
    forceAtMs: 6_400,
    spawnIntervalMs: 350,
    glyphSpeed: 520,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: 5,
  }),
  Object.freeze({
    type: "convergence-ring",
    name: "데이터↔AI 피드백 폭주",
    cue: "데이터 입력이 모델을 거쳐 예측이 되고, 되돌아온 피드백이 양쪽에서 증폭됩니다.",
    telegraphMs: 2_000,
    forceAtMs: 7_000,
    spawnIntervalMs: 850,
    glyphSpeed: 105,
    maxGlyphs: 28,
    contactThreshold: 1,
    laneCount: 12,
  }),
]);

const DEFAULT_SCORING = Object.freeze({
  phraseBase: 100,
  comboStep: 20,
  guardianBonus: 500,
  finaleBonus: 1_500,
});

const DEFAULT_ROUNDS = Object.freeze([
  Object.freeze({
    id: "data-insight",
    label: "데이터사이언스전공",
    omenMessage: "정렬돼 있던 기록 사이에 결측값과 이상치가 섞이기 시작합니다.",
    collapseMessage: "기준을 잃은 데이터가 열마다 뒤엉켰지만 여기서 끝난 것은 아닙니다.",
    guardianMessage: "데이터 수호알은 결측치와 이상치를 구분하고 판단의 근거를 다시 잇는 마음을 지켜 줍니다.",
    recoveryMessage: "완벽한 답 말고, 확인한 근거부터 챙기자. 같이 가.",
    guardian: Object.freeze({ id: "guardian-ds", code: "DS", label: "데이터 수호알", color: "#d82f76" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "ds-fear-1",
        negative: "전처리만 하다 오늘도 다 끝났네.",
        target: "다 끝났네",
        reframe: "일단 한 열만 정리해 보자.",
        maxHp: 60,
      }),
      Object.freeze({
        id: "ds-fear-2",
        negative: "졸업 뒤 진로가 너무 막연해.",
        target: "막연해",
        reframe: "관심 가는 역할 하나부터 찾아보자.",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "security-courage",
    label: "사이버보안학과",
    omenMessage: "정상 연결 사이로 위장한 악성 패킷이 열린 포트를 탐색합니다.",
    collapseMessage: "방화벽 규칙이 무너져도 위험한 연결은 다시 구분할 수 있습니다.",
    guardianMessage: "보안 수호알은 패킷을 확인하고 안전한 연결 규칙을 다시 세울 용기를 지켜 줍니다.",
    recoveryMessage: "혼자 다 막지 않아도 돼. 필요한 순간엔 같이 확인하자.",
    guardian: Object.freeze({ id: "guardian-cs", code: "CS", label: "보안 수호알", color: "#363367" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "cs-fear-1",
        negative: "CTF 문제를 열면 시작부터 막혀.",
        target: "막혀",
        reframe: "아는 유형부터 하나 풀어 보자.",
        maxHp: 60,
      }),
      Object.freeze({
        id: "cs-fear-2",
        negative: "실무 보안 생각만 하면 막막해.",
        target: "막막해",
        reframe: "실습 하나씩 해 보며 경험을 만들자.",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "code-heart",
    label: "컴퓨터공학과",
    omenMessage: "하나의 작은 오류가 재귀 호출을 따라 1개, 2개, 4개, 8개로 복제됩니다.",
    collapseMessage: "호출이 끝나지 않아 스택이 넘쳤지만 코드는 고쳐 다시 실행할 수 있습니다.",
    guardianMessage: "컴퓨터공학 수호알은 무한 재귀를 멈추고 큰 문제를 작은 호출 단위로 나누는 마음을 지켜 줍니다.",
    recoveryMessage: "오늘 안 풀려도 괜찮아. 막힌 한 줄부터 다시 보자.",
    guardian: Object.freeze({ id: "guardian-cse", code: "CSE", label: "컴퓨터공학 수호알", color: "#e333bb" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "cse-fear-1",
        negative: "에러 하나 고치면 두 개가 더 생겨.",
        target: "더 생겨",
        reframe: "바뀐 부분부터 다시 보면 돼.",
        maxHp: 60,
      }),
      Object.freeze({
        id: "cse-fear-2",
        negative: "개발자로 취업할 자신이 없어.",
        target: "자신이 없어",
        reframe: "지금 할 수 있는 걸 쌓으며 확인해 보자.",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "ai-focus",
    label: "인공지능학부",
    omenMessage: "여러 예측 후보가 하나의 오분류로 좁혀지며 틀린 확신이 굳어집니다.",
    collapseMessage: "신뢰도가 높아도 예측은 틀릴 수 있고 배움의 과정은 계속됩니다.",
    guardianMessage: "인공지능 수호알은 오분류와 과신을 다음 학습을 위한 피드백으로 바꾸는 마음을 지켜 줍니다.",
    recoveryMessage: "결과가 별로여도 네가 별로인 건 아니야. 하나만 바꿔 보자.",
    guardian: Object.freeze({ id: "guardian-ai", code: "AI", label: "인공지능 수호알", color: "#2ab5e4" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "ai-fear-1",
        negative: "논문 첫 장부터 무슨 말인지 모르겠어.",
        target: "모르겠어",
        reframe: "초록이랑 그림부터 먼저 보자.",
        maxHp: 60,
      }),
      Object.freeze({
        id: "ai-fear-2",
        negative: "AI가 너무 빨리 바뀌어서 따라가기 벅차.",
        target: "벅차",
        reframe: "기초 하나는 새 도구가 나와도 남아.",
        maxHp: 60,
      }),
    ]),
  }),
  Object.freeze({
    id: "flow-recovery",
    label: "인공지능데이터사이언스학부",
    omenMessage: "데이터 입력과 AI 예측이 피드백 고리 안에서 서로를 증폭하기 시작합니다.",
    collapseMessage: "뒤엉킨 파이프라인 앞에서 잠시 멈춰도 흐름은 다시 연결할 수 있습니다.",
    guardianMessage: "AI·데이터 수호알은 입력, 모델, 예측, 피드백을 차례로 연결해 나만의 흐름을 찾는 마음을 지켜 줍니다.",
    recoveryMessage: "아직 방향을 못 정해도 괜찮아. 해 본 것부터 이어 가자.",
    guardian: Object.freeze({ id: "guardian-aids", code: "AIDS", label: "AI·데이터 수호알", color: "#fac804" }),
    phrases: Object.freeze([
      Object.freeze({
        id: "aids-fear-1",
        negative: "AI도 데이터도 다 어설퍼 보여.",
        target: "어설퍼",
        reframe: "둘을 연결해 본 경험부터 내 것으로 만들자.",
        maxHp: 60,
      }),
      Object.freeze({
        id: "aids-fear-2",
        negative: "쉬는 날에도 밀린 공부 생각에 마음이 무거워.",
        target: "마음이 무거워",
        reframe: "오늘 쉴 시간을 먼저 정해 두자.",
        maxHp: 60,
      }),
    ]),
  }),
]);

const DEFAULT_FINAL_PHRASE = Object.freeze({
  id: "final-heart",
  negative: "이렇게 해도 달라지는 건 없을 것 같아.",
  target: "없을 것 같아",
  reframe: "당장 다르지 않아도 오늘 해낸 건 남아 있어.",
  maxHp: REQUIRED_ROUND_COUNT,
});

export const DEFAULT_WORD_BREAKER_CONFIG = Object.freeze({
  battleId: "word-breaker",
  title: "마음의 말 깨부수기",
  implementationStatus: "MVP",
  arena: DEFAULT_ARENA,
  roundDurationMs: 13_500,
  omenDurationMs: 2_400,
  overloadGraceMs: 4_200,
  overloadAttackLeadMs: 600,
  collapseImpactMs: 1_800,
  guardianRevealMs: 3_000,
  magnetDelayMs: 1_100,
  recoveryFailsafeMs: 6_500,
  recoveryHoldMs: 1_500,
  finaleDurationMs: 3_200,
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

function visibleGraphemeCount(value) {
  return Array.from(String(value ?? "")).filter((grapheme) => grapheme.trim().length > 0).length;
}

function normalizePhrase(
  source,
  fallback,
  label,
  shotDamage,
  defaultMaxHp = fallback.maxHp,
  { ensureGlyphCoverage = true } = {},
) {
  const negative = text(source?.negative, fallback.negative, `${label}.negative`);
  const target = text(source?.target, fallback.target, `${label}.target`);
  const firstTargetIndex = negative.indexOf(target);
  if (firstTargetIndex < 0 || negative.indexOf(target, firstTargetIndex + target.length) >= 0) {
    throw new RangeError(`${label}.target must occur exactly once in negative.`);
  }
  const requestedHits = finite(source?.targetHits, null, `${label}.targetHits`, { min: 1, integer: true });
  const legacyMaxHp = finite(source?.maxHp, defaultMaxHp, `${label}.maxHp`, { min: 1 });
  const legacyHits = Math.max(1, Math.ceil(legacyMaxHp / shotDamage));
  const defaultHits = Math.max(1, Math.ceil(defaultMaxHp / shotDamage));
  const targetHits = Math.max(
    requestedHits ?? legacyHits,
    ensureGlyphCoverage ? defaultHits : 1,
    ensureGlyphCoverage ? visibleGraphemeCount(target) : 1,
  );
  const maxHp = !ensureGlyphCoverage
    ? legacyMaxHp
    : targetHits * shotDamage;
  return {
    id: text(source?.id, fallback.id, `${label}.id`),
    negative,
    target,
    reframe: text(source?.reframe, fallback.reframe, `${label}.reframe`),
    targetHits,
    maxHp,
  };
}

function normalizeGimmick(source, fallback, label) {
  const type = text(source?.type, fallback.type, `${label}.type`);
  if (!WORD_BREAKER_GIMMICK_TYPES.includes(type)) {
    throw new RangeError(`${label}.type must be one of: ${WORD_BREAKER_GIMMICK_TYPES.join(", ")}.`);
  }
  const gimmick = {
    type,
    name: text(source?.name, fallback.name, `${label}.name`),
    cue: text(source?.cue, fallback.cue, `${label}.cue`),
    telegraphMs: finite(source?.telegraphMs, fallback.telegraphMs, `${label}.telegraphMs`, { min: 0 }),
    forceAtMs: finite(source?.forceAtMs, fallback.forceAtMs, `${label}.forceAtMs`, { min: 1 }),
    spawnIntervalMs: finite(
      source?.spawnIntervalMs,
      fallback.spawnIntervalMs,
      `${label}.spawnIntervalMs`,
      { min: 1 },
    ),
    glyphSpeed: finite(source?.glyphSpeed, fallback.glyphSpeed, `${label}.glyphSpeed`, { min: 1 }),
    maxGlyphs: finite(source?.maxGlyphs, fallback.maxGlyphs, `${label}.maxGlyphs`, {
      min: 1,
      max: 64,
      integer: true,
    }),
    contactThreshold: finite(
      source?.contactThreshold,
      fallback.contactThreshold,
      `${label}.contactThreshold`,
      { min: 1, max: 8, integer: true },
    ),
    laneCount: finite(source?.laneCount, fallback.laneCount, `${label}.laneCount`, {
      min: 3,
      max: 16,
      integer: true,
    }),
  };
  if (gimmick.forceAtMs <= gimmick.telegraphMs) {
    throw new RangeError(`${label}.forceAtMs must be greater than telegraphMs.`);
  }
  return gimmick;
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
    omenMessage: text(source?.omenMessage, fallback.omenMessage, `${label}.omenMessage`),
    collapseMessage: text(source?.collapseMessage, fallback.collapseMessage, `${label}.collapseMessage`),
    guardianMessage: text(source?.guardianMessage, fallback.guardianMessage, `${label}.guardianMessage`),
    recoveryMessage: text(source?.recoveryMessage, fallback.recoveryMessage, `${label}.recoveryMessage`),
    guardian: {
      id: text(guardianSource.id, fallback.guardian.id, `${label}.guardian.id`),
      code: text(guardianSource.code, fallback.guardian.code, `${label}.guardian.code`),
      label: text(guardianSource.label, fallback.guardian.label, `${label}.guardian.label`),
      color: text(guardianSource.color, fallback.guardian.color, `${label}.guardian.color`),
    },
    gimmick: normalizeGimmick(source?.gimmick, DEFAULT_GIMMICKS[index], `${label}.gimmick`),
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
    letterSpacing: finite(
      phraseSource.letterSpacing,
      DEFAULT_PHRASE.letterSpacing,
      "phrase.letterSpacing",
      { min: 0, max: arena.width },
    ),
    wobbleAmplitudeX: finite(
      phraseSource.wobbleAmplitudeX,
      DEFAULT_PHRASE.wobbleAmplitudeX,
      "phrase.wobbleAmplitudeX",
      { min: 0, max: arena.width },
    ),
    wobbleAmplitudeY: finite(
      phraseSource.wobbleAmplitudeY,
      DEFAULT_PHRASE.wobbleAmplitudeY,
      "phrase.wobbleAmplitudeY",
      { min: 0, max: arena.height },
    ),
    wobbleWavelength: finite(
      phraseSource.wobbleWavelength,
      DEFAULT_PHRASE.wobbleWavelength,
      "phrase.wobbleWavelength",
      { min: 1 },
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
  const roundDurationMs = finite(
    source.roundDurationMs,
    DEFAULT_WORD_BREAKER_CONFIG.roundDurationMs,
    "roundDurationMs",
    { min: 1 },
  );
  const omenDurationMs = finite(
    source.omenDurationMs,
    DEFAULT_WORD_BREAKER_CONFIG.omenDurationMs,
    "omenDurationMs",
    { min: 0 },
  );
  const overloadGraceMs = finite(
    source.overloadGraceMs,
    DEFAULT_WORD_BREAKER_CONFIG.overloadGraceMs,
    "overloadGraceMs",
    { min: 0 },
  );
  const overloadAttackLeadMs = finite(
    source.overloadAttackLeadMs,
    DEFAULT_WORD_BREAKER_CONFIG.overloadAttackLeadMs,
    "overloadAttackLeadMs",
    { min: 0 },
  );
  const collapseImpactMs = finite(
    source.collapseImpactMs,
    DEFAULT_WORD_BREAKER_CONFIG.collapseImpactMs,
    "collapseImpactMs",
    { min: 0 },
  );
  const guardianRevealMs = finite(
    source.guardianRevealMs,
    DEFAULT_WORD_BREAKER_CONFIG.guardianRevealMs,
    "guardianRevealMs",
    { min: 0 },
  );
  const magnetDelayMs = finite(
    source.magnetDelayMs,
    DEFAULT_WORD_BREAKER_CONFIG.magnetDelayMs,
    "magnetDelayMs",
    { min: 0 },
  );
  const recoveryFailsafeMs = finite(
    source.recoveryFailsafeMs,
    DEFAULT_WORD_BREAKER_CONFIG.recoveryFailsafeMs,
    "recoveryFailsafeMs",
    { min: 1 },
  );
  const recoveryHoldMs = finite(
    source.recoveryHoldMs,
    DEFAULT_WORD_BREAKER_CONFIG.recoveryHoldMs,
    "recoveryHoldMs",
    { min: 0 },
  );
  if (recoveryFailsafeMs <= magnetDelayMs) {
    throw new RangeError("recoveryFailsafeMs must be greater than magnetDelayMs.");
  }
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
  if (rounds.some(({ gimmick }) => overloadGraceMs + overloadAttackLeadMs >= gimmick.forceAtMs)) {
    throw new RangeError(
      "overloadGraceMs + overloadAttackLeadMs must be less than every rounds[].gimmick.forceAtMs.",
    );
  }
  const finalPhrase = normalizePhrase(
    source.finalPhrase,
    DEFAULT_FINAL_PHRASE,
    "finalPhrase",
    shot.damage,
    DEFAULT_FINAL_PHRASE.maxHp,
    { ensureGlyphCoverage: false },
  );
  if (finalPhrase.maxHp !== rounds.length) {
    throw new RangeError(`finalPhrase.maxHp must equal the ${rounds.length} guardian recovery steps.`);
  }

  assertUnique(rounds.map(({ id }) => id), "round ids");
  assertUnique(rounds.map(({ guardian: item }) => item.id), "guardian ids");
  assertUnique(rounds.map(({ guardian: item }) => item.code), "guardian codes");
  assertUnique(rounds.map(({ gimmick }) => gimmick.type), "round gimmick types");
  for (const [index, round] of rounds.entries()) {
    const requiredType = WORD_BREAKER_GIMMICK_TYPES[index];
    if (round.gimmick.type !== requiredType) {
      throw new RangeError(`rounds[${index}].gimmick.type must be ${requiredType}.`);
    }
  }
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
    roundDurationMs,
    omenDurationMs,
    overloadGraceMs,
    overloadAttackLeadMs,
    collapseImpactMs,
    guardianRevealMs,
    magnetDelayMs,
    recoveryFailsafeMs,
    recoveryHoldMs,
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

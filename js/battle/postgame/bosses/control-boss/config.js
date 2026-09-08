const DEFAULT_WORLD = Object.freeze({
  bounds: Object.freeze({ x: 0, y: 0, width: 450, height: 800 }),
  bossZone: Object.freeze({ x: 165, y: 40, width: 120, height: 80 }),
  coverZone: Object.freeze({ x: 175, y: 280, width: 100, height: 60 }),
  altarArea: Object.freeze({
    startX: 45,
    startY: 380,
    tileW: 100,
    tileH: 60,
    rows: 3,
    cols: 3,
    gapX: 18,
    gapY: 12,
  }),
});

const DEFAULT_BOSS = Object.freeze({
  maxHp: 1000,
  maxShield: 500,
  regenRatePerSec: 0.01,
  phase1FirstAttackDelaySec: 0.6,
  phase2CastSec: 3,
  phase3DurationSec: 30,
  groggyDurationSec: 10,
  groggyDirectDamageRate: 0.2,
  attackIntervalSec: 1.3,
  attackRange: 130,
  bulletSpeed: 240,
  bulletDamage: 15,
  shockwaveInitialDelaySec: 2,
  shockwaveIntervalSec: 4.5,
  shockwaveSpeed: 240,
  shockwaveMaxRadius: 650,
  shockwaveThickness: 30,
  shockwaveDamage: 25,
});

const DEFAULT_PLAYER = Object.freeze({
  width: 32,
  height: 42,
  speed: 200,
  baseHp: 100,
  hpPerPoint: 10,
  baseAttackDamage: 40,
  attackCoefficient: 0.05,
  defensePerPoint: 1,
  minimumIncomingDamage: 1,
  stunDurationMs: 1000,
  startPosition: Object.freeze({ x: 209, y: 529 }),
});

export const DEFAULT_CONTROL_BOSS_CONFIG = Object.freeze({
  battleId: "control-boss",
  title: "시련의 제단: 컨트롤 보스전",
  implementationStatus: "MVP",
  world: DEFAULT_WORLD,
  boss: DEFAULT_BOSS,
  player: DEFAULT_PLAYER,
  gimmick: Object.freeze({ collapsedTileCount: 2, sequenceLength: 4 }),
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

function rect(value, fallback, label) {
  return Object.freeze({
    x: finite(value?.x, fallback.x, `${label}.x`),
    y: finite(value?.y, fallback.y, `${label}.y`),
    width: finite(value?.width, fallback.width, `${label}.width`, { min: 1 }),
    height: finite(value?.height, fallback.height, `${label}.height`, { min: 1 }),
  });
}

function point(value, fallback, label) {
  return Object.freeze({
    x: finite(value?.x, fallback.x, `${label}.x`),
    y: finite(value?.y, fallback.y, `${label}.y`),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function cloneConfigValue(value) {
  if (Array.isArray(value)) return value.map(cloneConfigValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneConfigValue(nested)]));
  }
  return value;
}

export function resolveControlBossConfig(source = {}) {
  const worldSource = source.world ?? {};
  const bossSource = source.boss ?? {};
  const playerSource = source.player ?? {};
  const gimmickSource = source.gimmick ?? {};
  const bounds = rect(source.arena ?? worldSource.bounds, DEFAULT_WORLD.bounds, "world.bounds");
  const altarSource = worldSource.altarArea ?? {};
  const altarArea = Object.freeze({
    startX: finite(altarSource.startX, DEFAULT_WORLD.altarArea.startX, "world.altarArea.startX"),
    startY: finite(altarSource.startY, DEFAULT_WORLD.altarArea.startY, "world.altarArea.startY"),
    tileW: finite(altarSource.tileW, DEFAULT_WORLD.altarArea.tileW, "world.altarArea.tileW", { min: 1 }),
    tileH: finite(altarSource.tileH, DEFAULT_WORLD.altarArea.tileH, "world.altarArea.tileH", { min: 1 }),
    rows: finite(altarSource.rows, DEFAULT_WORLD.altarArea.rows, "world.altarArea.rows", { min: 1, integer: true }),
    cols: finite(altarSource.cols, DEFAULT_WORLD.altarArea.cols, "world.altarArea.cols", { min: 1, integer: true }),
    gapX: finite(altarSource.gapX, DEFAULT_WORLD.altarArea.gapX, "world.altarArea.gapX", { min: 0 }),
    gapY: finite(altarSource.gapY, DEFAULT_WORLD.altarArea.gapY, "world.altarArea.gapY", { min: 0 }),
  });
  const player = Object.freeze({
    width: finite(playerSource.width, DEFAULT_PLAYER.width, "player.width", { min: 1 }),
    height: finite(playerSource.height, DEFAULT_PLAYER.height, "player.height", { min: 1 }),
    speed: finite(playerSource.speed, DEFAULT_PLAYER.speed, "player.speed", { min: 1 }),
    baseHp: finite(playerSource.baseHp, DEFAULT_PLAYER.baseHp, "player.baseHp", { min: 1 }),
    hpPerPoint: finite(playerSource.hpPerPoint, DEFAULT_PLAYER.hpPerPoint, "player.hpPerPoint", { min: 0 }),
    baseAttackDamage: finite(
      playerSource.baseAttackDamage,
      DEFAULT_PLAYER.baseAttackDamage,
      "player.baseAttackDamage",
      { min: 1 },
    ),
    attackCoefficient: finite(
      playerSource.attackCoefficient,
      DEFAULT_PLAYER.attackCoefficient,
      "player.attackCoefficient",
      { min: 0 },
    ),
    defensePerPoint: finite(
      playerSource.defensePerPoint,
      DEFAULT_PLAYER.defensePerPoint,
      "player.defensePerPoint",
      { min: 0 },
    ),
    minimumIncomingDamage: finite(
      playerSource.minimumIncomingDamage,
      DEFAULT_PLAYER.minimumIncomingDamage,
      "player.minimumIncomingDamage",
      { min: 0 },
    ),
    stunDurationMs: finite(
      playerSource.stunDurationMs,
      DEFAULT_PLAYER.stunDurationMs,
      "player.stunDurationMs",
      { min: 0 },
    ),
    startPosition: point(playerSource.startPosition, DEFAULT_PLAYER.startPosition, "player.startPosition"),
  });
  const boss = Object.freeze({
    maxHp: finite(bossSource.maxHp, DEFAULT_BOSS.maxHp, "boss.maxHp", { min: 1 }),
    maxShield: finite(bossSource.maxShield, DEFAULT_BOSS.maxShield, "boss.maxShield", { min: 1 }),
    regenRatePerSec: finite(
      bossSource.regenRatePerSec,
      DEFAULT_BOSS.regenRatePerSec,
      "boss.regenRatePerSec",
      { min: 0 },
    ),
    phase1FirstAttackDelaySec: finite(
      bossSource.phase1FirstAttackDelaySec,
      DEFAULT_BOSS.phase1FirstAttackDelaySec,
      "boss.phase1FirstAttackDelaySec",
      { min: 0 },
    ),
    phase2CastSec: finite(bossSource.phase2CastSec, DEFAULT_BOSS.phase2CastSec, "boss.phase2CastSec", { min: 0 }),
    phase3DurationSec: finite(
      bossSource.phase3DurationSec,
      DEFAULT_BOSS.phase3DurationSec,
      "boss.phase3DurationSec",
      { min: 0 },
    ),
    groggyDurationSec: finite(
      bossSource.groggyDurationSec,
      DEFAULT_BOSS.groggyDurationSec,
      "boss.groggyDurationSec",
      { min: 0 },
    ),
    groggyDirectDamageRate: finite(
      bossSource.groggyDirectDamageRate,
      DEFAULT_BOSS.groggyDirectDamageRate,
      "boss.groggyDirectDamageRate",
      { min: 0, max: 1 },
    ),
    attackIntervalSec: finite(
      bossSource.attackIntervalSec,
      DEFAULT_BOSS.attackIntervalSec,
      "boss.attackIntervalSec",
      { min: 0.01 },
    ),
    attackRange: finite(bossSource.attackRange, DEFAULT_BOSS.attackRange, "boss.attackRange", { min: 1 }),
    bulletSpeed: finite(bossSource.bulletSpeed, DEFAULT_BOSS.bulletSpeed, "boss.bulletSpeed", { min: 1 }),
    bulletDamage: finite(bossSource.bulletDamage, DEFAULT_BOSS.bulletDamage, "boss.bulletDamage", { min: 0 }),
    shockwaveInitialDelaySec: finite(
      bossSource.shockwaveInitialDelaySec,
      DEFAULT_BOSS.shockwaveInitialDelaySec,
      "boss.shockwaveInitialDelaySec",
      { min: 0 },
    ),
    shockwaveIntervalSec: finite(
      bossSource.shockwaveIntervalSec,
      DEFAULT_BOSS.shockwaveIntervalSec,
      "boss.shockwaveIntervalSec",
      { min: 0.01 },
    ),
    shockwaveSpeed: finite(
      bossSource.shockwaveSpeed,
      DEFAULT_BOSS.shockwaveSpeed,
      "boss.shockwaveSpeed",
      { min: 1 },
    ),
    shockwaveMaxRadius: finite(
      bossSource.shockwaveMaxRadius,
      DEFAULT_BOSS.shockwaveMaxRadius,
      "boss.shockwaveMaxRadius",
      { min: 1 },
    ),
    shockwaveThickness: finite(
      bossSource.shockwaveThickness,
      DEFAULT_BOSS.shockwaveThickness,
      "boss.shockwaveThickness",
      { min: 1 },
    ),
    shockwaveDamage: finite(
      bossSource.shockwaveDamage,
      DEFAULT_BOSS.shockwaveDamage,
      "boss.shockwaveDamage",
      { min: 0 },
    ),
  });
  const gimmick = Object.freeze({
    collapsedTileCount: finite(
      gimmickSource.collapsedTileCount,
      DEFAULT_CONTROL_BOSS_CONFIG.gimmick.collapsedTileCount,
      "gimmick.collapsedTileCount",
      { min: 0, integer: true },
    ),
    sequenceLength: finite(
      gimmickSource.sequenceLength,
      DEFAULT_CONTROL_BOSS_CONFIG.gimmick.sequenceLength,
      "gimmick.sequenceLength",
      { min: 1, integer: true },
    ),
  });
  const tileCount = altarArea.rows * altarArea.cols;
  if (gimmick.collapsedTileCount + gimmick.sequenceLength > tileCount) {
    throw new RangeError("Control Boss altar needs enough tiles for holes and the ordered sequence.");
  }

  return deepFreeze({
    battleId: typeof source.battleId === "string" && source.battleId ? source.battleId : DEFAULT_CONTROL_BOSS_CONFIG.battleId,
    title: typeof source.title === "string" && source.title ? source.title : DEFAULT_CONTROL_BOSS_CONFIG.title,
    implementationStatus: source.implementationStatus ?? DEFAULT_CONTROL_BOSS_CONFIG.implementationStatus,
    arena: bounds,
    world: {
      bounds,
      bossZone: rect(worldSource.bossZone, DEFAULT_WORLD.bossZone, "world.bossZone"),
      coverZone: rect(worldSource.coverZone, DEFAULT_WORLD.coverZone, "world.coverZone"),
      altarArea,
    },
    boss,
    player,
    gimmick,
    controls: cloneConfigValue(source.controls ?? null),
    resultPresentation: cloneConfigValue(source.resultPresentation ?? null),
  });
}

function bonusPoints(stat) {
  return Math.max(0, Number.isFinite(stat) ? stat - 1 : 0);
}

/** 공격 피해 = 기본 40 × (1 + (공격력-1) × 0.05). */
export function calcControlBossAttackDamage(attackStat, playerConfig = DEFAULT_PLAYER) {
  return playerConfig.baseAttackDamage * (1 + bonusPoints(attackStat) * playerConfig.attackCoefficient);
}

/** 최대 HP = 기본 100 + (체력-1) × 10. */
export function calcControlBossMaxHp(healthStat, playerConfig = DEFAULT_PLAYER) {
  return playerConfig.baseHp + bonusPoints(healthStat) * playerConfig.hpPerPoint;
}

/** 최종 피격 = max(최소 피해, 원본 피해 - (방어력-1) × 포인트 계수). */
export function calcControlBossIncomingDamage(rawDamage, defenseStat, playerConfig = DEFAULT_PLAYER) {
  const incoming = Math.max(0, Number.isFinite(rawDamage) ? rawDamage : 0);
  return Math.max(
    playerConfig.minimumIncomingDamage,
    incoming - bonusPoints(defenseStat) * playerConfig.defensePerPoint,
  );
}

export function buildControlBossTiles(config) {
  const area = config.world.altarArea;
  const tiles = [];
  for (let row = 0; row < area.rows; row += 1) {
    for (let column = 0; column < area.cols; column += 1) {
      tiles.push(Object.freeze({
        id: `tile_${row}_${column}`,
        row,
        column,
        bounds: Object.freeze({
          x: area.startX + column * (area.tileW + area.gapX),
          y: area.startY + row * (area.tileH + area.gapY),
          width: area.tileW,
          height: area.tileH,
        }),
      }));
    }
  }
  return Object.freeze(tiles);
}

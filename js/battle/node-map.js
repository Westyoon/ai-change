export const BOSS_ROOM_IDS = Object.freeze([
  "data-sphinx",
  "stat-boss",
  "control-boss",
]);

export const AFTERGAME_ZONE_IDS = Object.freeze({
  FIELD: "entry-field",
  PLAZA: "plaza",
});

export const AFTERGAME_WORLD_LAYOUT = Object.freeze({
  [AFTERGAME_ZONE_IDS.FIELD]: Object.freeze({
    defaultSpawn: Object.freeze({ x: 0.72, y: 0.68, direction: "down" }),
    exits: Object.freeze([
      Object.freeze({
        id: "field-to-plaza",
        edge: "west",
        bounds: Object.freeze({ x: 0, y: 0.28, width: 0.09, height: 0.44 }),
        targetZoneId: AFTERGAME_ZONE_IDS.PLAZA,
        targetSpawn: Object.freeze({ x: 0.82, y: 0.5, direction: "left" }),
      }),
    ]),
  }),
  [AFTERGAME_ZONE_IDS.PLAZA]: Object.freeze({
    defaultSpawn: Object.freeze({ x: 0.5, y: 0.68, direction: "up" }),
    exits: Object.freeze([
      Object.freeze({
        id: "plaza-to-field",
        edge: "east",
        bounds: Object.freeze({ x: 0.91, y: 0.28, width: 0.09, height: 0.44 }),
        targetZoneId: AFTERGAME_ZONE_IDS.FIELD,
        targetSpawn: Object.freeze({ x: 0.18, y: 0.5, direction: "right" }),
      }),
    ]),
    bossDoors: Object.freeze([
      Object.freeze({
        id: "plaza-door-data-sphinx",
        battleId: "data-sphinx",
        bounds: Object.freeze({ x: 0.04, y: 0, width: 0.2, height: 0.12 }),
        returnSpawn: Object.freeze({ x: 0.18, y: 0.22, direction: "down" }),
      }),
      Object.freeze({
        id: "plaza-door-stat-boss",
        battleId: "stat-boss",
        bounds: Object.freeze({ x: 0.4, y: 0, width: 0.2, height: 0.12 }),
        returnSpawn: Object.freeze({ x: 0.5, y: 0.22, direction: "down" }),
      }),
      Object.freeze({
        id: "plaza-door-control-boss",
        battleId: "control-boss",
        bounds: Object.freeze({ x: 0.76, y: 0, width: 0.2, height: 0.12 }),
        returnSpawn: Object.freeze({ x: 0.82, y: 0.22, direction: "down" }),
      }),
    ]),
  }),
});

export const FIELD_BATTLE_ID = "xr-egg-trials";
export const FIELD_ENCOUNTER_ROUTE = Object.freeze({
  sceneId: "battle",
  params: Object.freeze({ battleId: FIELD_BATTLE_ID }),
});

export const FIELD_SPAWN_POINTS = Object.freeze([
  Object.freeze({ id: "north-west", x: 0.16, y: 0.2 }),
  Object.freeze({ id: "north", x: 0.48, y: 0.17 }),
  Object.freeze({ id: "north-east", x: 0.81, y: 0.22 }),
  Object.freeze({ id: "west", x: 0.18, y: 0.48 }),
  Object.freeze({ id: "east", x: 0.82, y: 0.49 }),
  Object.freeze({ id: "south-west", x: 0.27, y: 0.68 }),
  Object.freeze({ id: "south", x: 0.54, y: 0.72 }),
  Object.freeze({ id: "south-east", x: 0.79, y: 0.67 }),
]);

function createRoute(battleId) {
  return Object.freeze({
    sceneId: "battle",
    params: Object.freeze({ battleId }),
  });
}

function requireBattle(definitionsById, battleId) {
  const battle = definitionsById.get(battleId);
  if (!battle) throw new Error(`노드맵에 필요한 공개 Battle이 없습니다: ${battleId}`);
  return battle;
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("필드 random 함수는 0 이상 1 미만의 수를 반환해야 합니다.");
  }
  return value;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label}은 0보다 큰 수여야 합니다.`);
  }
  return number;
}

export function scaleAftergameRect(rect, worldSize) {
  const width = positiveNumber(worldSize?.width, "worldSize.width");
  const height = positiveNumber(worldSize?.height, "worldSize.height");
  const normalized = {
    x: Number(rect?.x),
    y: Number(rect?.y),
    width: Number(rect?.width),
    height: Number(rect?.height),
  };
  if (!Object.values(normalized).every(Number.isFinite)) {
    throw new TypeError("정규화된 사후게임 구역 사각형이 필요합니다.");
  }
  if (
    normalized.x < 0
    || normalized.y < 0
    || normalized.width < 0
    || normalized.height < 0
    || normalized.x + normalized.width > 1
    || normalized.y + normalized.height > 1
  ) {
    throw new RangeError("사후게임 구역 사각형은 0~1 범위 안에 있어야 합니다.");
  }
  return Object.freeze({
    x: normalized.x * width,
    y: normalized.y * height,
    width: normalized.width * width,
    height: normalized.height * height,
  });
}

export function createAftergameNodeMap(definitions) {
  if (!Array.isArray(definitions)) throw new TypeError("Battle definitions 배열이 필요합니다.");

  const definitionsById = new Map(definitions.map((battle) => [battle.id, battle]));
  const bossRooms = BOSS_ROOM_IDS.map((battleId) => Object.freeze({
    id: `boss-room-${battleId}`,
    battle: requireBattle(definitionsById, battleId),
    route: createRoute(battleId),
  }));

  return Object.freeze({
    initialZoneId: AFTERGAME_ZONE_IDS.FIELD,
    bossRooms: Object.freeze(bossRooms),
    field: Object.freeze({
      id: AFTERGAME_ZONE_IDS.FIELD,
      battle: requireBattle(definitionsById, FIELD_BATTLE_ID),
      route: FIELD_ENCOUNTER_ROUTE,
    }),
    plaza: Object.freeze({
      id: AFTERGAME_ZONE_IDS.PLAZA,
    }),
  });
}

/**
 * Decides only when a roaming encounter appears. The actual challenge remains
 * random inside xr-egg-trials, which is the single source of truth for its pool.
 */
export class FieldEncounterScheduler {
  constructor({
    random = Math.random,
    initialGraceDistance = 240,
    rollEveryDistance = 90,
    chance = 0.34,
    forceDistance = 620,
  } = {}) {
    if (typeof random !== "function") throw new TypeError("필드 random 함수가 필요합니다.");
    this.random = random;
    this.initialGraceDistance = positiveNumber(initialGraceDistance, "initialGraceDistance");
    this.rollEveryDistance = positiveNumber(rollEveryDistance, "rollEveryDistance");
    this.forceDistance = positiveNumber(forceDistance, "forceDistance");
    if (this.forceDistance < this.initialGraceDistance) {
      throw new RangeError("forceDistance는 initialGraceDistance 이상이어야 합니다.");
    }
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      throw new RangeError("chance는 0 이상 1 이하의 수여야 합니다.");
    }
    this.chance = chance;
    this.state = "ROAMING";
    this.distance = 0;
    this.nextRollDistance = this.initialGraceDistance;
  }

  observe(previous, next, { eligible = true } = {}) {
    if (this.state !== "ROAMING" || !eligible) return false;
    const previousX = Number(previous?.x);
    const previousY = Number(previous?.y);
    const nextX = Number(next?.x);
    const nextY = Number(next?.y);
    if (![previousX, previousY, nextX, nextY].every(Number.isFinite)) return false;

    const travelled = Math.hypot(nextX - previousX, nextY - previousY);
    if (travelled <= 0) return false;
    this.distance += travelled;

    const rollLimit = Math.min(this.distance, this.forceDistance);
    while (this.nextRollDistance <= rollLimit) {
      this.nextRollDistance += this.rollEveryDistance;
      if (randomUnit(this.random) < this.chance) {
        this.state = "TRIGGERED";
        return true;
      }
    }
    if (this.distance >= this.forceDistance) {
      this.state = "TRIGGERED";
      return true;
    }
    return false;
  }

  reset() {
    if (this.state === "DESTROYED") return false;
    this.state = "ROAMING";
    this.distance = 0;
    this.nextRollDistance = this.initialGraceDistance;
    return true;
  }

  destroy() {
    this.state = "DESTROYED";
  }
}

export function chooseFieldEncounterSpawn({
  random = Math.random,
  worldSize,
  player,
  markerSize = { width: 72, height: 84 },
  minimumPlayerDistance = 150,
  spawnPoints = FIELD_SPAWN_POINTS,
} = {}) {
  if (typeof random !== "function") throw new TypeError("필드 random 함수가 필요합니다.");
  const width = positiveNumber(worldSize?.width, "worldSize.width");
  const height = positiveNumber(worldSize?.height, "worldSize.height");
  const markerWidth = Math.min(width, positiveNumber(markerSize?.width, "markerSize.width"));
  const markerHeight = Math.min(height, positiveNumber(markerSize?.height, "markerSize.height"));
  if (!Array.isArray(spawnPoints) || spawnPoints.length === 0) {
    throw new TypeError("필드 spawnPoints가 비어 있습니다.");
  }

  const playerCenter = {
    x: Number(player?.x) + Number(player?.width ?? 0) / 2,
    y: Number(player?.y) + Number(player?.height ?? 0) / 2,
  };
  const candidates = spawnPoints.map((point) => {
    const centerX = Math.max(markerWidth / 2, Math.min(width - markerWidth / 2, Number(point.x) * width));
    const centerY = Math.max(markerHeight / 2, Math.min(height - markerHeight / 2, Number(point.y) * height));
    return {
      id: String(point.id),
      x: centerX - markerWidth / 2,
      y: centerY - markerHeight / 2,
      width: markerWidth,
      height: markerHeight,
      distance: Math.hypot(centerX - playerCenter.x, centerY - playerCenter.y),
    };
  });
  const safeCandidates = candidates.filter((candidate) => candidate.distance >= minimumPlayerDistance);
  const pool = safeCandidates.length > 0 ? safeCandidates : candidates;
  const chosen = pool[Math.floor(randomUnit(random) * pool.length)];
  return Object.freeze({
    id: chosen.id,
    x: chosen.x,
    y: chosen.y,
    width: chosen.width,
    height: chosen.height,
  });
}

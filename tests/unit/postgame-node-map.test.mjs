import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AFTERGAME_WORLD_LAYOUT,
  AFTERGAME_ZONE_IDS,
  BOSS_ROOM_IDS,
  FIELD_ENCOUNTER_ROUTE,
  FieldEncounterScheduler,
  chooseFieldEncounterSpawn,
  createAftergameNodeMap,
  scaleAftergameRect,
} from "../../js/battle/node-map.js";
import { rectsOverlap } from "../../js/map/collision.js";

const battles = JSON.parse(
  await readFile(new URL("../../data/battles.json", import.meta.url), "utf8"),
);

function sequenceRandom(values) {
  let index = 0;
  const random = () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
  random.calls = () => index;
  return random;
}

test("사후 월드는 입장 필드와 중심 광장을 잇고 광장 북쪽에 독립 보스문 3개를 둔다", () => {
  const aftergameBattles = battles.filter((battle) => battle.id !== "word-breaker");
  const map = createAftergameNodeMap(aftergameBattles);

  assert.equal(map.initialZoneId, AFTERGAME_ZONE_IDS.FIELD);
  assert.deepEqual(map.bossRooms.map((room) => room.battle.id), BOSS_ROOM_IDS);
  assert.deepEqual(
    map.bossRooms.map((room) => room.route),
    BOSS_ROOM_IDS.map((battleId) => ({ sceneId: "battle", params: { battleId } })),
  );
  for (const room of map.bossRooms) {
    assert.equal(Object.hasOwn(room, "prerequisiteBattleId"), false);
    assert.equal(Object.hasOwn(room, "previousBossClear"), false);
  }

  assert.deepEqual(map.field.route, FIELD_ENCOUNTER_ROUTE);
  assert.equal(map.field.id, AFTERGAME_ZONE_IDS.FIELD);
  assert.equal(Object.hasOwn(map.field.route.params, "trialId"), false);
  assert.equal(map.plaza.id, AFTERGAME_ZONE_IDS.PLAZA);
  assert.equal(Object.hasOwn(map.plaza, "battle"), false);
  assert.equal(Object.hasOwn(map.plaza, "route"), false);

  const fieldExit = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.FIELD].exits[0];
  const plazaExit = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].exits[0];
  assert.equal(fieldExit.edge, "west");
  assert.equal(fieldExit.targetZoneId, AFTERGAME_ZONE_IDS.PLAZA);
  assert.ok(fieldExit.targetSpawn.x > 0.5, "광장 동쪽 안전 위치로 들어와야 한다");
  assert.equal(plazaExit.edge, "east");
  assert.equal(plazaExit.targetZoneId, AFTERGAME_ZONE_IDS.FIELD);
  assert.ok(plazaExit.targetSpawn.x < 0.5, "필드 서쪽 안전 위치로 들어와야 한다");

  const bossDoors = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA].bossDoors;
  assert.deepEqual(bossDoors.map((door) => door.battleId), BOSS_ROOM_IDS);
  assert.ok(bossDoors.every((door) => door.bounds.y === 0));
  assert.ok(bossDoors.every((door) => door.bounds.height <= 0.12));
  for (let index = 1; index < bossDoors.length; index += 1) {
    const previousRight = bossDoors[index - 1].bounds.x + bossDoors[index - 1].bounds.width;
    assert.ok(previousRight < bossDoors[index].bounds.x, "북쪽 보스문은 서로 겹치지 않아야 한다");
  }

  const reachableBattleIds = new Set([
    ...map.bossRooms.map((room) => room.route.params.battleId),
    map.field.route.params.battleId,
  ]);
  assert.deepEqual(
    [...reachableBattleIds].sort(),
    aftergameBattles.map((battle) => battle.id).sort(),
  );
});

test("정규화된 출입구 판정은 화면 크기에 맞춰 같은 비율로 확대된다", () => {
  const fieldExit = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.FIELD].exits[0];
  assert.deepEqual(
    scaleAftergameRect(fieldExit.bounds, { width: 720, height: 420 }),
    { x: 0, y: 117.60000000000001, width: 64.8, height: 184.8 },
  );
  assert.throws(
    () => scaleAftergameRect({ x: 0.9, y: 0, width: 0.2, height: 1 }, { width: 720, height: 420 }),
    /0~1 범위/u,
  );
});

test("320px 모바일에서도 구역·보스 복귀점은 반대 출입구와 겹치지 않는다", () => {
  const characterSize = { width: 48, height: 60 };
  const worldSize = { width: 320, height: 430 };
  const actorAt = (spawn) => ({
    x: spawn.x * worldSize.width - characterSize.width / 2,
    y: spawn.y * worldSize.height - characterSize.height / 2,
    ...characterSize,
  });
  const fieldLayout = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.FIELD];
  const plazaLayout = AFTERGAME_WORLD_LAYOUT[AFTERGAME_ZONE_IDS.PLAZA];
  const fieldExit = scaleAftergameRect(fieldLayout.exits[0].bounds, worldSize);
  const plazaExit = scaleAftergameRect(plazaLayout.exits[0].bounds, worldSize);

  assert.equal(rectsOverlap(actorAt(fieldLayout.exits[0].targetSpawn), plazaExit), false);
  assert.equal(rectsOverlap(actorAt(plazaLayout.exits[0].targetSpawn), fieldExit), false);
  for (const door of plazaLayout.bossDoors) {
    assert.equal(rectsOverlap(actorAt(door.returnSpawn), scaleAftergameRect(door.bounds, worldSize)), false);
    assert.equal(rectsOverlap(actorAt(door.returnSpawn), plazaExit), false);
  }
  for (let index = 1; index < plazaLayout.bossDoors.length; index += 1) {
    const previous = plazaLayout.bossDoors[index - 1].bounds;
    const current = plazaLayout.bossDoors[index].bounds;
    assert.ok((current.x - (previous.x + previous.width)) * worldSize.width >= characterSize.width);
  }
});

test("필드 인카운터는 정지 중 난수를 소비하지 않고 이동 거리만 센다", () => {
  const random = sequenceRandom([0.9, 0.1]);
  const scheduler = new FieldEncounterScheduler({
    random,
    initialGraceDistance: 100,
    rollEveryDistance: 50,
    chance: 0.5,
    forceDistance: 500,
  });

  assert.equal(scheduler.observe({ x: 0, y: 0 }, { x: 0, y: 0 }), false);
  assert.equal(scheduler.observe({ x: 0, y: 0 }, { x: 99, y: 0 }), false);
  assert.equal(random.calls(), 0);
  assert.equal(scheduler.observe({ x: 99, y: 0 }, { x: 100, y: 0 }), false);
  assert.equal(random.calls(), 1);
  assert.equal(scheduler.observe({ x: 100, y: 0 }, { x: 150, y: 0 }), true);
  assert.equal(scheduler.state, "TRIGGERED");
  assert.equal(random.calls(), 2);
  assert.equal(scheduler.observe({ x: 150, y: 0 }, { x: 500, y: 0 }), false);
  assert.equal(random.calls(), 2);
});

test("필드 판정은 같은 이동거리를 프레임으로 나눠도 같은 결과를 낸다", () => {
  const createScheduler = (random) => new FieldEncounterScheduler({
    random,
    initialGraceDistance: 100,
    rollEveryDistance: 50,
    chance: 0.5,
    forceDistance: 500,
  });
  const oneStepRandom = sequenceRandom([0.9, 0.9, 0.1]);
  const splitRandom = sequenceRandom([0.9, 0.9, 0.1]);
  const oneStep = createScheduler(oneStepRandom);
  const split = createScheduler(splitRandom);

  assert.equal(oneStep.observe({ x: 0, y: 0 }, { x: 200, y: 0 }), true);
  assert.equal(split.observe({ x: 0, y: 0 }, { x: 50, y: 0 }), false);
  assert.equal(split.observe({ x: 50, y: 0 }, { x: 100, y: 0 }), false);
  assert.equal(split.observe({ x: 100, y: 0 }, { x: 150, y: 0 }), false);
  assert.equal(split.observe({ x: 150, y: 0 }, { x: 200, y: 0 }), true);
  assert.equal(oneStepRandom.calls(), 3);
  assert.equal(splitRandom.calls(), 3);
  assert.equal(oneStep.distance, split.distance);
});

test("확률이 빗나가도 보정 거리에서는 한 번만 출현하고 reset할 수 있다", () => {
  const random = sequenceRandom([0.99]);
  const scheduler = new FieldEncounterScheduler({
    random,
    initialGraceDistance: 100,
    rollEveryDistance: 100,
    chance: 0,
    forceDistance: 250,
  });

  assert.equal(scheduler.observe({ x: 0, y: 0 }, { x: 249, y: 0 }), false);
  assert.equal(scheduler.observe({ x: 249, y: 0 }, { x: 250, y: 0 }), true);
  assert.equal(scheduler.state, "TRIGGERED");
  assert.equal(scheduler.reset(), true);
  assert.equal(scheduler.state, "ROAMING");
  assert.equal(scheduler.distance, 0);
  scheduler.destroy();
  assert.equal(scheduler.observe({ x: 0, y: 0 }, { x: 1_000, y: 0 }), false);
  assert.equal(scheduler.reset(), false);
});

test("출현 위치는 캐릭터와 떨어진 안전 후보에서 결정된다", () => {
  const spawn = chooseFieldEncounterSpawn({
    random: () => 0,
    worldSize: { width: 720, height: 420 },
    player: { x: 320, y: 180, width: 48, height: 60 },
    minimumPlayerDistance: 150,
  });

  assert.ok(spawn.x >= 0);
  assert.ok(spawn.y >= 0);
  assert.ok(spawn.x + spawn.width <= 720);
  assert.ok(spawn.y + spawn.height <= 420);
  const spawnCenter = { x: spawn.x + spawn.width / 2, y: spawn.y + spawn.height / 2 };
  const playerCenter = { x: 344, y: 210 };
  assert.ok(Math.hypot(spawnCenter.x - playerCenter.x, spawnCenter.y - playerCenter.y) >= 150);
  assert.throws(
    () => chooseFieldEncounterSpawn({
      random: () => 1,
      worldSize: { width: 720, height: 420 },
      player: { x: 0, y: 0, width: 48, height: 60 },
    }),
    /0 이상 1 미만/u,
  );
});

test("사후 월드 UI는 카드 대시보드 없이 단일 이동 화면과 모바일 세로 조작을 유지한다", async () => {
  const [sceneSource, cssSource] = await Promise.all([
    readFile(new URL("../../js/scenes/battle-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../css/battle.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(sceneSource, /fieldNodes|6 NODES|battle-field-node/u);
  assert.doesNotMatch(sceneSource, /className: "battle-boss-room"/u);
  assert.match(sceneSource, /new CharacterSystem\(/u);
  assert.match(sceneSource, /scheduler\.observe\(previous, latestSnapshot/u);
  assert.match(sceneSource, /CHARACTER_CONTACT_PHASES\.ENTER/u);
  assert.match(sceneSource, /switchZone\(action\.targetZoneId, action\.targetSpawn\)/u);
  assert.match(sceneSource, /CHARACTER_TRIGGER_KINDS\.BATTLE_ENTRANCE/u);
  assert.doesNotMatch(cssSource, /grid-template-areas:\s*"bosses empty"/u);
  assert.match(
    cssSource,
    /\.battle-field-world\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*hidden;[^}]*touch-action:\s*none;/su,
  );
  assert.match(
    cssSource,
    /\.aftergame-world__zone\[hidden\]\s*\{[^}]*display:\s*none !important;/su,
  );
  assert.match(
    cssSource,
    /@media \(max-width: 720px\)\s*\{[\s\S]*?\.battle-field-world\s*\{[^}]*height:\s*clamp\(400px, 54dvh, 540px\);/u,
  );
  assert.match(
    cssSource,
    /\.aftergame-world__actions \.button\s*\{[^}]*min-height:\s*44px;/su,
  );
});

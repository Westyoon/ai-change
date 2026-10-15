import { PostgameRealtimeService } from "../../js/core/postgame-realtime-service.js";
import { bindBattlePresence } from "../../js/battle/postgame/battle-presence.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const coordinatorSource = await readFile(
  new URL("../../backend/src/postgame-coordinator.ts", import.meta.url),
  "utf8",
);
let PostgameCoordinator = null;
try {
  const { default: ts } = await import("../../backend/node_modules/typescript/lib/typescript.js");
  const progressionSource = await readFile(new URL("../../backend/src/progression.ts", import.meta.url), "utf8");
  const progressionUrl = `data:text/javascript;base64,${Buffer.from(progressionSource).toString("base64")}`;
  const coordinatorJavaScript = ts.transpileModule(coordinatorSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace('"./progression"', JSON.stringify(progressionUrl));
  ({ PostgameCoordinator } = await import(
    `data:text/javascript;base64,${Buffer.from(coordinatorJavaScript).toString("base64")}`
  ));
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
const requiresBackendInstall = { skip: PostgameCoordinator === null ? "backend dependencies are not installed" : false };

const ROOM_STORAGE_KEY = "postgame:rooms:v1";
const BATTLE_STORAGE_KEY = "postgame:battles:v1";
const ABANDONED_BATTLE_GRACE_MS = 15 * 60 * 1_000;
const FINISHED_BATTLE_RETENTION_MS = 5 * 60 * 1_000;

class FakeStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(structuredClone(initial)));
    this.alarmAt = null;
  }

  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(keyOrEntries, value) {
    if (typeof keyOrEntries === "string") {
      this.values.set(keyOrEntries, structuredClone(value));
      return;
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) {
      this.values.set(key, structuredClone(entry));
    }
  }

  async setAlarm(scheduledTime) {
    this.alarmAt = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
  }

  async getAlarm() {
    return this.alarmAt;
  }

  async deleteAlarm() {
    this.alarmAt = null;
  }
}

function createContext(initial) {
  const storage = new FakeStorage(initial);
  return {
    storage,
    state: {
      storage,
      blockConcurrencyWhile(callback) {
        return callback();
      },
      getWebSockets() {
        return [];
      },
    },
  };
}

function room(roomId, battleId = "stat-boss") {
  return {
    version: 1,
    roomId,
    roomName: "공동 보스방",
    battleId,
    capacity: 5,
    hostPlayerId: "public-a",
    memberPlayerIds: ["public-a"],
    createdAt: 1_000,
    status: "started",
  };
}

function battle(roomId, overrides = {}) {
  const startedAt = overrides.startedAt ?? 1_000;
  return {
    version: 1,
    roomId,
    battleId: "stat-boss",
    seed: `seed:${roomId}`,
    status: "running",
    bossHp: 1_000,
    bossMaxHp: 1_000,
    hitDamage: 10,
    hitCooldownMs: 1_000,
    revision: 1,
    startedAt,
    finishedAt: null,
    lastActivityAt: startedAt,
    allDisconnectedAt: null,
    members: [
      {
        playerKey: "private-a",
        publicId: "public-a",
        name: "플레이어",
        ready: false,
        connected: false,
        left: false,
        hp: null,
        maxHp: null,
        statBossAttackDamage: 10,
        lastHitAt: 0,
        recentActionIds: [],
      },
    ],
    ...overrides,
  };
}

async function createCoordinator(initial = {}) {
  const { state, storage } = createContext(initial);
  const coordinator = new PostgameCoordinator(state);
  await coordinator.ready;
  return { coordinator, storage };
}

test("bunched positions retain the latest state without errors and publish stop/zone changes", requiresBackendInstall, async (t) => {
  const { coordinator } = await createCoordinator();
  let timestamp = 1000;
  t.mock.method(Date, "now", () => timestamp);
  const attachment = { version: 1, playerId: "p1", playerKey: "key1", name: "Player", zone: "plaza", x: 0, y: 0, moving: true, direction: "right", lastPresenceAt: 0 };
  let stored;
  const socket = { serializeAttachment(value) { stored = structuredClone(value); } };
  const broadcasts = [];
  const transitions = [];
  coordinator.broadcastPresence = (_, message) => broadcasts.push(structuredClone(message));
  coordinator.broadcastToZone = zone => transitions.push(zone);
  coordinator.sendPresenceSnapshot = () => transitions.push("snapshot");
  const move = (x, extra = {}) => coordinator.updatePresence(socket, attachment, {
    type: "presence.update", zone: "plaza", x, y: 0.5, direction: "right", moving: true, ...extra,
  });
  move(0.1);
  timestamp += 1;
  move(0.2);
  timestamp += 1;
  move(0.3);
  assert.equal(broadcasts.length, 1);
  assert.equal(stored.x, 0.3, "new snapshots retain the latest suppressed position");
  assert.equal(stored.lastPresenceAt, 1000, "suppressed movement cannot extend the broadcast deadline");
  timestamp = 1040;
  move(0.4);
  assert.equal(broadcasts.length, 2);
  timestamp++;
  move(0.5, { moving: false });
  assert.equal(broadcasts.length, 3, "the final stop must reach observers even inside 40ms");
  assert.equal(broadcasts.at(-1).player.moving, false);
  timestamp++;
  move(0.6, { moving: false, zone: "entry-field" });
  assert.equal(broadcasts.length, 4);
  assert.deepEqual(transitions, ["plaza", "snapshot"]);
});

test("presence coalescing keeps the connection-wide anti-flood budget enforced", requiresBackendInstall, async (t) => {
  const { coordinator } = await createCoordinator();
  t.mock.method(Date, "now", () => 1000);
  const attachment = { playerId: "p1", playerKey: "key1", name: "Player", zone: "plaza", direction: "right", moving: true, lastPresenceAt: 0, rateWindowAt: 1000, rateCount: 0 };
  const errors = [];
  const closes = [];
  const socket = { serializeAttachment() {}, close(...args) { closes.push(args); } };
  coordinator.attachment = () => attachment;
  coordinator.broadcastPresence = () => {};
  coordinator.sendError = (_, code) => errors.push(code);
  const message = JSON.stringify({ type: "presence.update", zone: "plaza", x: 0.5, y: 0.5, direction: "right", moving: true });
  for (let i = 0; i < 30; i++) await coordinator.webSocketMessage(socket, message);
  assert.deepEqual(errors, []);
  assert.deepEqual(closes, []);
  await coordinator.webSocketMessage(socket, message);
  assert.deepEqual(errors, ["rate_limited"]);
  assert.equal(closes[0][0], 1008);
});

test("a restored legacy battle receives a full reconnect grace window", requiresBackendInstall, async () => {
  const roomId = "ROOMAAAA01";
  const legacyBattle = battle(roomId);
  delete legacyBattle.lastActivityAt;
  delete legacyBattle.allDisconnectedAt;
  delete legacyBattle.members[0].hp;
  delete legacyBattle.members[0].maxHp;

  const beforeRestore = Date.now();
  const { coordinator, storage } = await createCoordinator({
    [ROOM_STORAGE_KEY]: [room(roomId)],
    [BATTLE_STORAGE_KEY]: [legacyBattle],
  });

  const restored = coordinator.battles.get(roomId);
  assert.ok(restored, "legacy running battle should remain reconnectable");
  assert.equal(restored.members[0].hp, null);
  assert.equal(restored.members[0].maxHp, null);
  assert.ok(restored.allDisconnectedAt >= beforeRestore);
  assert.ok(storage.alarmAt >= beforeRestore + ABANDONED_BATTLE_GRACE_MS);
});

test("cleanup preserves a disconnected battle within grace and every active battle", requiresBackendInstall, async () => {
  const { coordinator, storage } = await createCoordinator();
  const now = 10_000_000;
  const reconnectableId = "ROOMBBBB02";
  const activeId = "ROOMCCCC03";
  const reconnectable = battle(reconnectableId, {
    lastActivityAt: now - ABANDONED_BATTLE_GRACE_MS + 100,
    allDisconnectedAt: now - ABANDONED_BATTLE_GRACE_MS + 100,
  });
  const active = battle(activeId, {
    lastActivityAt: now - ABANDONED_BATTLE_GRACE_MS * 2,
    allDisconnectedAt: now - ABANDONED_BATTLE_GRACE_MS * 2,
  });
  active.members[0].connected = true;
  coordinator.rooms.set(reconnectableId, room(reconnectableId));
  coordinator.rooms.set(activeId, room(activeId));
  coordinator.battles.set(reconnectableId, reconnectable);
  coordinator.battles.set(activeId, active);

  await coordinator.cleanupExpiredBattles(now);

  assert.equal(coordinator.battles.get(reconnectableId), reconnectable);
  assert.equal(coordinator.battles.get(activeId), active);
  assert.equal(coordinator.rooms.size, 2);
  assert.equal(storage.alarmAt, now + 100);
});

test("the Durable Object alarm removes stale abandoned and finished rooms only", requiresBackendInstall, async () => {
  const { coordinator, storage } = await createCoordinator();
  const now = Date.now();
  const abandonedId = "ROOMDDDD04";
  const finishedId = "ROOMEEEE05";
  const activeId = "ROOMFFFF06";
  const abandoned = battle(abandonedId, {
    lastActivityAt: now - ABANDONED_BATTLE_GRACE_MS - 1_000,
    allDisconnectedAt: now - ABANDONED_BATTLE_GRACE_MS - 1_000,
  });
  const finished = battle(finishedId, {
    status: "finished",
    bossHp: 0,
    finishedAt: now - FINISHED_BATTLE_RETENTION_MS - 1_000,
    lastActivityAt: now - FINISHED_BATTLE_RETENTION_MS - 1_000,
    rewardRecorded: true,
    rankingRecorded: true,
  });
  const active = battle(activeId, {
    lastActivityAt: now - ABANDONED_BATTLE_GRACE_MS * 2,
  });
  active.members[0].connected = true;

  for (const [roomId, record] of [
    [abandonedId, abandoned],
    [finishedId, finished],
    [activeId, active],
  ]) {
    coordinator.rooms.set(roomId, room(roomId));
    coordinator.battles.set(roomId, record);
  }

  await coordinator.alarm();

  assert.deepEqual([...coordinator.battles.keys()], [activeId]);
  assert.deepEqual([...coordinator.rooms.keys()], [activeId]);
  assert.deepEqual(storage.values.get(BATTLE_STORAGE_KEY).map(({ roomId }) => roomId), [activeId]);
  assert.deepEqual(storage.values.get(ROOM_STORAGE_KEY).map(({ roomId }) => roomId), [activeId]);
  assert.equal(storage.alarmAt, null, "active rooms do not need a cleanup alarm");
});

test("shared hits wait for every connected party member and expose one persisted seed", requiresBackendInstall, async () => {
  const { coordinator } = await createCoordinator();
  const roomId = "ROOMGGGG07";
  const sharedBattle = battle(roomId);
  sharedBattle.members[0].ready = true;
  sharedBattle.members[0].connected = true;
  sharedBattle.members.push({
    playerKey: "private-b",
    publicId: "public-b",
    name: "파티원",
    ready: false,
    connected: true,
    left: false,
    hp: 100,
    maxHp: 100,
    statBossAttackDamage: 10,
    lastHitAt: 0,
    recentActionIds: [],
  });
  coordinator.rooms.set(roomId, room(roomId));
  coordinator.battles.set(roomId, sharedBattle);
  const attachment = {
    roomId,
    playerKey: "private-a",
  };
  const sent = [];
  const socket = {
    readyState: 1,
    send(payload) {
      sent.push(JSON.parse(payload));
    },
  };

  const waitingSnapshot = coordinator.publicBattle(sharedBattle);
  assert.equal(waitingSnapshot.seed, `seed:${roomId}`);
  assert.equal(waitingSnapshot.allReady, false);
  await assert.rejects(
    coordinator.hitBattle(socket, attachment, roomId, "counter-hit", "action-a"),
    (error) => error?.code === "battle_party_not_ready",
  );
  assert.equal(sharedBattle.bossHp, 1_000);

  sharedBattle.members[1].ready = true;
  assert.equal(coordinator.publicBattle(sharedBattle).allReady, true);
  await coordinator.hitBattle(socket, attachment, roomId, "counter-hit", "action-b");
  assert.equal(sharedBattle.bossHp, 990);
  assert.equal(sharedBattle.seed, `seed:${roomId}`);
});

test("solo Control Boss death finishes the server battle and broadcasts zero HP", requiresBackendInstall, async () => {
  const { coordinator, storage } = await createCoordinator();
  const roomId = "ROOMSOLO01";
  const sharedBattle = battle(roomId, { battleId: "control-boss" });
  Object.assign(sharedBattle.members[0], { ready: true, connected: true, hp: 200, maxHp: 200 });
  coordinator.rooms.set(roomId, room(roomId, "control-boss"));
  coordinator.battles.set(roomId, sharedBattle);
  const messages = [];
  coordinator.broadcastBattleEvent = (_, type) => messages.push(type);
  await coordinator.updateBattleHealth({ send() {}, readyState: 1 }, { roomId, playerKey: "private-a" }, roomId, 0, 200);
  assert.equal(sharedBattle.status, "finished");
  assert.equal(coordinator.publicBattle(sharedBattle).roster[0].hp, 0);
  assert.equal(coordinator.publicBattle(sharedBattle).result.outcome, "defeat");
  assert.equal((await storage.get(BATTLE_STORAGE_KEY))[0].status, "finished");
  assert.ok(messages.includes("battle.finished"));
});

test("party health is persisted, exposed, and defeated members cannot attack or revive", requiresBackendInstall, async () => {
  const { coordinator } = await createCoordinator();
  const roomId = "ROOMHHHH08";
  const sharedBattle = battle(roomId);
  const member = sharedBattle.members[0];
  member.ready = true;
  member.connected = true;
  member.hp = null;
  member.maxHp = null;
  const survivingMember = {
    ...structuredClone(member),
    playerKey: "private-b",
    publicId: "public-b",
    name: "파티원",
    ready: true,
    connected: true,
    hp: 80,
    maxHp: 80,
  };
  sharedBattle.members.push(survivingMember);
  const sharedRoom = room(roomId);
  sharedRoom.memberPlayerIds.push("public-b");
  coordinator.rooms.set(roomId, sharedRoom);
  coordinator.battles.set(roomId, sharedBattle);
  const attachment = { roomId, playerKey: "private-a" };
  const socket = { readyState: 1, send() {} };

  await coordinator.updateBattleHealth(socket, attachment, roomId, 37, 120);
  assert.equal(member.hp, 37);
  assert.equal(member.maxHp, 120);
  assert.deepEqual(coordinator.publicBattle(sharedBattle).roster[0], {
    id: "public-a",
    name: "플레이어",
    ready: true,
    connected: true,
    hp: 37,
    maxHp: 120,
    alive: true,
    hairColor: "purple", presence: null,
  });

  await coordinator.updateBattleHealth(socket, attachment, roomId, 90, 120);
  assert.equal(member.hp, 37, "a refresh cannot heal the server-authoritative party HP");
  await assert.rejects(
    coordinator.updateBattleHealth(socket, attachment, roomId, 30, 121),
    (error) => error?.code === "battle_health_mismatch",
  );

  await coordinator.updateBattleHealth(socket, attachment, roomId, 0, 120);
  assert.equal(member.ready, false);
  assert.equal(coordinator.publicBattle(sharedBattle).roster[0].alive, false);
  await assert.rejects(
    coordinator.hitBattle(socket, attachment, roomId, "counter-hit", "dead-hit"),
    (error) => error?.code === "battle_member_defeated",
  );
  member.ready = true;
  await assert.rejects(
    coordinator.updateBattleHealth(socket, attachment, roomId, 1, 120),
    (error) => error?.code === "battle_member_defeated",
  );
  assert.equal(sharedBattle.status, "running", "a surviving party member keeps the battle active");

  await coordinator.updateBattleHealth(
    socket,
    { roomId, playerKey: "private-b" },
    roomId,
    0,
    80,
  );
  assert.equal(sharedBattle.status, "finished");
  assert.ok(sharedBattle.finishedAt > 0);
  assert.deepEqual(coordinator.publicBattle(sharedBattle).result, {
    outcome: "defeat",
    reason: "party-defeated",
  });
});

test("server-authoritative boss victory stores one team run using ready-to-finish duration", requiresBackendInstall, async () => {
  const { state } = createContext({
    [ROOM_STORAGE_KEY]: [],
    [BATTLE_STORAGE_KEY]: [],
  });
  const prepared = [];
  const batches = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          const [attemptId, contentId] = this.values;
          return {
            results: prepared
              .filter((entry) => (
                /INSERT INTO postgame_results/u.test(entry.sql)
                && entry.values[2] === attemptId
                && entry.values[3] === contentId
              ))
              .map((entry) => ({ user_id: entry.values[1] })),
          };
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  const coordinator = new PostgameCoordinator(state, { DB });
  await coordinator.ready;

  const roomId = "ROOMRANK01";
  coordinator.rooms.set(roomId, room(roomId, "stat-boss"));
  const completed = battle(roomId, {
    status: "finished",
    bossHp: 0,
    startedAt: 1_000,
    combatStartedAt: 4_000,
    finishedAt: 10_250,
    members: [
      {
        userId: "google-user-a",
        playerKey: "private-a",
        publicId: "public-a",
        name: "가람",
        ready: true,
        connected: true,
        left: false,
        hp: 100,
        maxHp: 100,
        statBossAttackDamage: 10,
        controlBossAttackDamage: 10,
        lastHitAt: 0,
        lastGimmickAt: 0,
        recentActionIds: [],
      },
      {
        userId: "google-user-b",
        playerKey: "private-b",
        publicId: "public-b",
        name: "나래",
        ready: true,
        connected: true,
        left: false,
        hp: 100,
        maxHp: 100,
        statBossAttackDamage: 10,
        controlBossAttackDamage: 10,
        lastHitAt: 0,
        lastGimmickAt: 0,
        recentActionIds: [],
      },
    ],
  });
  coordinator.battles.set(roomId, completed);

  assert.equal(await coordinator.persistBossVictory(completed), true);
  assert.equal(await coordinator.persistBossVictory(completed), false, "one room must not be submitted twice");
  assert.equal(batches.length, 1);
  assert.equal(prepared.length, 10, "batched writes are followed by one reward verification SELECT");
  const [rankingRun] = prepared.filter((entry) => /INSERT OR IGNORE INTO boss_runs/u.test(entry.sql));
  const rankingMembers = prepared.filter((entry) => /INSERT OR IGNORE INTO boss_run_members/u.test(entry.sql));
  const rewardRows = prepared.filter((entry) => /INSERT INTO postgame_results/u.test(entry.sql));
  const statAwards = prepared.filter((entry) => /UPDATE stats/u.test(entry.sql));
  const rewardFinalizers = prepared.filter((entry) => /UPDATE postgame_results/u.test(entry.sql));

  assert.ok(rankingRun);
  assert.deepEqual(rankingRun.values.slice(0, 3), ["boss-run:ROOMRANK01", roomId, "stat-boss"]);
  assert.equal(rankingRun.values[4], "공동 보스방");
  assert.equal(rankingRun.values[5], 2);
  assert.equal(rankingRun.values[6], 6_250, "lobby readiness time must not count");
  assert.deepEqual(rankingMembers.map((entry) => entry.values.slice(1, 4)), [
    ["google-user-a", "가람", 0],
    ["google-user-b", "나래", 1],
  ]);
  assert.deepEqual(rewardRows.map((entry) => entry.values.slice(1)), [
    ["google-user-a", "boss-run:ROOMRANK01", "stat-boss"],
    ["google-user-b", "boss-run:ROOMRANK01", "stat-boss"],
  ]);
  assert.equal(statAwards.length, 2);
  for (const statement of statAwards) {
    assert.match(statement.sql, /experience\s*=\s*COALESCE\(experience,\s*0\)\s*\+\s*(?:1[0-9]0|200)/u);
    assert.match(statement.sql, /level\s*=\s*COALESCE\(level,\s*1\)\s*\+\s*\(CASE/u);
    assert.match(statement.sql, /unspent_points\s*=\s*COALESCE\(unspent_points,\s*0\)\s*\+\s*\(CASE/u);
    assert.match(statement.sql, /awarded\s*=\s*0/u);
  }
  assert.equal(rewardFinalizers.length, 2);
  assert.equal(completed.rewardRecorded, true);
  assert.equal(completed.rankingRecorded, true);
});

test("all three shared bosses reward active authenticated members while only stat and control rank", requiresBackendInstall, async () => {
  const cases = [
    { battleId: "data-sphinx", roomId: "ROOMREWD01", ranked: false },
    { battleId: "stat-boss", roomId: "ROOMREWD02", ranked: true },
    { battleId: "control-boss", roomId: "ROOMREWD03", ranked: true },
  ];

  for (const { battleId, roomId, ranked } of cases) {
    const { state } = createContext({
      [ROOM_STORAGE_KEY]: [],
      [BATTLE_STORAGE_KEY]: [],
    });
    const prepared = [];
    const DB = {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) {
            this.values = values;
            return this;
          },
          async all() {
            const [attemptId, contentId] = this.values;
            return {
              results: prepared
                .filter((entry) => (
                  /INSERT INTO postgame_results/u.test(entry.sql)
                  && entry.values[2] === attemptId
                  && entry.values[3] === contentId
                ))
                .map((entry) => ({ user_id: entry.values[1] })),
            };
          },
        };
        prepared.push(statement);
        return statement;
      },
      async batch(statements) {
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      },
    };
    const coordinator = new PostgameCoordinator(state, { DB });
    await coordinator.ready;
    coordinator.rooms.set(roomId, room(roomId, battleId));
    const baseMember = battle(roomId).members[0];
    const completed = battle(roomId, {
      battleId,
      status: "finished",
      bossHp: 0,
      combatStartedAt: 2_000,
      finishedAt: 5_000,
      members: [
        {
          ...baseMember,
          userId: `active-user:${battleId}`,
          name: `${battleId} 생존자`,
          ready: true,
          connected: true,
          left: false,
          hp: 50,
          maxHp: 100,
        },
        {
          ...baseMember,
          userId: `left-user:${battleId}`,
          playerKey: `left-key:${battleId}`,
          publicId: `left-public:${battleId}`,
          name: `${battleId} 퇴장자`,
          ready: false,
          connected: false,
          left: true,
          hp: 100,
          maxHp: 100,
        },
      ],
    });

    assert.equal(await coordinator.persistBossVictory(completed), true, `${battleId} should persist`);
    assert.equal(await coordinator.persistBossVictory(completed), false, `${battleId} should be idempotent`);

    const rewardRows = prepared.filter((entry) => /INSERT INTO postgame_results/u.test(entry.sql));
    const statAwards = prepared.filter((entry) => /UPDATE stats/u.test(entry.sql));
    const rankingRuns = prepared.filter((entry) => /INSERT OR IGNORE INTO boss_runs/u.test(entry.sql));
    assert.equal(prepared.length, ranked ? 6 : 4, `${battleId} includes one verification SELECT`);
    assert.equal(rewardRows.length, 1, `${battleId} rewards only the active member`);
    assert.deepEqual(rewardRows[0].values.slice(1), [
      `active-user:${battleId}`,
      `boss-run:${roomId}`,
      battleId,
    ]);
    assert.equal(statAwards.length, 1, `${battleId} grants one progression update`);
    assert.equal(rankingRuns.length, ranked ? 1 : 0, `${battleId} ranking policy mismatch`);
    assert.equal(completed.rewardRecorded, true);
    assert.equal(completed.rankingRecorded === true, ranked);
  }
});

test("a failed boss reward write survives alarms, retries, then expires after retention", requiresBackendInstall, async () => {
  const { state, storage } = createContext({
    [ROOM_STORAGE_KEY]: [],
    [BATTLE_STORAGE_KEY]: [],
  });
  const rewardedUserId = "retry-user";
  let batchAttempts = 0;
  const DB = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          return { results: [{ user_id: rewardedUserId }] };
        },
      };
    },
    async batch(statements) {
      batchAttempts += 1;
      if (batchAttempts === 1) throw new Error("temporary D1 failure");
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  const coordinator = new PostgameCoordinator(state, { DB });
  await coordinator.ready;

  const roomId = "ROOMRETRY1";
  const initialNow = 10_000_000;
  const finishedAt = initialNow - 31_000;
  const completed = battle(roomId, {
    battleId: "data-sphinx",
    status: "finished",
    bossHp: 0,
    startedAt: finishedAt - 5_000,
    combatStartedAt: finishedAt - 4_000,
    finishedAt,
    lastActivityAt: finishedAt,
    rewardUserIds: [rewardedUserId],
    members: [{
      ...battle(roomId).members[0],
      userId: rewardedUserId,
      ready: true,
      connected: false,
      hp: 100,
      maxHp: 100,
    }],
  });
  coordinator.rooms.set(roomId, room(roomId, "data-sphinx"));
  coordinator.battles.set(roomId, completed);

  const originalNow = Date.now;
  const originalConsoleError = console.error;
  const loggedErrors = [];
  let now = initialNow;
  Date.now = () => now;
  console.error = (...args) => loggedErrors.push(args);
  try {
    await coordinator.alarm();
    assert.equal(batchAttempts, 1);
    assert.equal(coordinator.battles.get(roomId), completed, "failed persistence must retain the battle");
    assert.notEqual(completed.rewardRecorded, true);
    assert.equal(completed.lastActivityAt, initialNow);
    assert.equal(storage.alarmAt, initialNow + 30_000);
    assert.equal(loggedErrors.length, 1);

    now += 30_001;
    storage.alarmAt = null; // The platform consumes the scheduled alarm before invoking alarm().
    await coordinator.alarm();
    assert.equal(batchAttempts, 2);
    assert.equal(completed.rewardRecorded, true);
    assert.equal(coordinator.battles.get(roomId), completed, "successful retry still observes retention");
    assert.equal(storage.alarmAt, finishedAt + FINISHED_BATTLE_RETENTION_MS);

    now = finishedAt + FINISHED_BATTLE_RETENTION_MS + 1;
    storage.alarmAt = null;
    await coordinator.alarm();
    assert.equal(coordinator.battles.has(roomId), false);
    assert.equal(coordinator.rooms.has(roomId), false);
    assert.equal(storage.alarmAt, null);
  } finally {
    Date.now = originalNow;
    console.error = originalConsoleError;
  }
});


test("battle positions are room-scoped and outsiders cannot publish to an encounter", requiresBackendInstall, async () => {
 const { coordinator } = await createCoordinator();
 const sockets = [];
 function participant(id, roomId, zone = "battle:data-sphinx") {
  const attachment = { version: 1, playerId: id, playerKey: `key-${id}`, name: id, zone, roomId, x: .5, y: .5, direction: "down", moving: false, lastPresenceAt: 0 };
  const socket = { readyState: 1, messages: [], send(text) { this.messages.push(JSON.parse(text)); }, serializeAttachment(value) { this.attachment = value; } };
  sockets.push({ socket, attachment }); return { socket, attachment };
 }
 const first = participant("first", "ROOM000001");
 const friend = participant("friend", "ROOM000001");
 const otherRoom = participant("other", "ROOM000002");
 const field = participant("field", null, "plaza");
 coordinator.activeSockets = () => sockets;
 coordinator.battles.set("ROOM000001", { battleId: "data-sphinx" });
 coordinator.updatePresence(first.socket, first.attachment, { type: "presence.update", zone: "battle:data-sphinx", x: .75, y: .25, direction: "left", moving: true });
 assert.equal(friend.socket.messages.at(-1).player.x, .75);
 assert.equal(otherRoom.socket.messages.length, 0);
 assert.equal(field.socket.messages.length, 0);
 coordinator.sendPresenceSnapshot(friend.socket, friend.attachment);
 assert.deepEqual(friend.socket.messages.at(-1).players.map(player => player.id), ["first"]);
 assert.throws(() => coordinator.updatePresence(field.socket, field.attachment, { type: "presence.update", zone: "battle:data-sphinx", x: .5, y: .5, direction: "down", moving: false }), /position|\uC704\uCE58/);
});


test("two real realtime clients see each other and receive teammate HP through the coordinator", requiresBackendInstall, async () => {
 const { state } = createContext();
 const serverSockets = [], pending = [];
 state.getWebSockets = () => serverSockets;
 const coordinator = new PostgameCoordinator(state); await coordinator.ready;
 const roomId = "ROOMSYNC01";
 const shared = battle(roomId, { startedAt: Date.now(), lastActivityAt: Date.now(), members: ["first", "second"].map((id, index) => ({ playerKey: `key-${id}`, publicId: id, name: id, ready: true, connected: true, left: false, hp: 100, maxHp: 100, statBossAttackDamage: 10, lastHitAt: 0, recentActionIds: [] })) });
 coordinator.rooms.set(roomId, { ...room(roomId), memberPlayerIds: ["first", "second"] });
 coordinator.battles.set(roomId, shared);
 const bindings = [], services = [], rendered = [], ticks = [];
 async function settle() { while (pending.length) await Promise.all(pending.splice(0)); }
 try {
  for (const [index, id] of ["first", "second"].entries()) {
   let client;
   const attachment = { version: 1, playerId: id, playerKey: `key-${id}`, name: id, zone: "plaza", roomId, hairColor: index ? "brown" : "magenta", x: .5, y: .5, direction: "down", moving: false, rateWindowStartedAt: Date.now(), rateCount: 0, lastPresenceAt: 0, combatMaxHp: 100 };
   const server = { readyState: 1, saved: attachment, serializeAttachment(value) { this.saved = structuredClone(value); }, deserializeAttachment() { return this.saved; }, send(text) { client.onmessage?.({ data: text }); }, close() { throw new Error("unexpected server close"); } };
   serverSockets.push(server);
   class Socket {
    constructor() { client = this; this.readyState = 0; }
    send(text) { pending.push(coordinator.webSocketMessage(server, text)); }
    close() { this.readyState = 3; }
   }
   const service = new PostgameRealtimeService({ WebSocketImpl: Socket, location: { href: "https://test.local" }, now: () => Date.now() + 1000, presenceIntervalMs: 10 });
   services.push(service); service.connect(); client.readyState = 1; client.onopen({});
   server.send(JSON.stringify({ type: "ready", self: { id, name: id } }));
   coordinator.sendBattleEvent(server, "battle.snapshot", shared);
   bindings.push(bindBattlePresence({ realtime: service, roomId, battleId: "stat-boss",
    getRuntime: () => ({ root: {}, worldSize: { width: 1000, height: 600 }, snapshot: { x: index ? 700 : 200, y: 400, width: 40, height: 40, direction: "right", moving: true } }),
    getRoster: () => service.getState().battle?.roster,
    createView: () => ({ update(value) { rendered[index] = value; }, destroy() {} }),
    setInterval(fn) { ticks[index] = fn; return index; }, clearInterval() {},
   }));
   await settle();
  }
  ticks.forEach(tick => tick()); await settle();
  assert.equal(rendered[0][0].id, "second"); assert.equal(rendered[1][0].id, "first");
  assert.equal(rendered[0][0].x, 700); assert.equal(rendered[1][0].x, 200);
  assert.equal(rendered[0][0].appearance.hairColor, "brown");
  assert.equal(rendered[1][0].appearance.hairColor, "magenta");
  services[1].sendBattleHealth({ roomId, hp: 55, maxHp: 100 }); await settle();
  assert.equal(services[0].getState().battle.roster.find(member => member.id === "second").hp, 55);
  assert.equal(rendered[0][0].currentHealth, 55);
 } finally { bindings.forEach(binding => binding.destroy()); services.forEach(service => service.disconnect()); }
});

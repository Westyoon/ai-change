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
  const coordinatorJavaScript = ts.transpileModule(coordinatorSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
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
    hitCooldownMs: 250,
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

test("a restored legacy battle receives a full reconnect grace window", requiresBackendInstall, async () => {
  const roomId = "ROOMAAAA01";
  const legacyBattle = battle(roomId);
  delete legacyBattle.lastActivityAt;
  delete legacyBattle.allDisconnectedAt;

  const beforeRestore = Date.now();
  const { coordinator, storage } = await createCoordinator({
    [ROOM_STORAGE_KEY]: [room(roomId)],
    [BATTLE_STORAGE_KEY]: [legacyBattle],
  });

  const restored = coordinator.battles.get(roomId);
  assert.ok(restored, "legacy running battle should remain reconnectable");
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

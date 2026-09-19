import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgameRealtimeService,
  asWebSocketUrl,
} from "../../js/core/postgame-realtime-service.js";

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(payload) {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  send(payload) {
    if (this.readyState !== 1) throw new Error("socket is not open");
    this.sent.push(JSON.parse(payload));
  }

  close(code, reason) {
    this.closeArgs = [code, reason];
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function timerHarness() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  return {
    now: () => now,
    setTimeout(callback, delay) {
      const id = nextId++;
      tasks.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    advance(milliseconds) {
      now += milliseconds;
      while (true) {
        const ready = [...tasks.entries()]
          .filter(([, task]) => task.at <= now)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!ready) break;
        tasks.delete(ready[0]);
        ready[1].callback();
      }
    },
    count: () => tasks.size,
  };
}

function makeService(overrides = {}) {
  FakeWebSocket.instances.length = 0;
  const timers = timerHarness();
  const service = new PostgameRealtimeService({
    WebSocketImpl: FakeWebSocket,
    location: { href: "https://play.example.test/game?from=menu" },
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    now: timers.now,
    random: () => 0.5,
    presenceIntervalMs: 100,
    reconnectBaseMs: 500,
    reconnectMaxMs: 2_000,
    ...overrides,
  });
  return { service, timers };
}

test("same-origin HTTP endpoints become secure WebSocket URLs", () => {
  assert.equal(
    asWebSocketUrl("/api/postgame/socket", { href: "https://game.example/map" }),
    "wss://game.example/api/postgame/socket",
  );
  assert.equal(
    asWebSocketUrl("http://localhost:8787/socket", { href: "https://game.example/map" }),
    "ws://localhost:8787/socket",
  );
  assert.throws(
    () => asWebSocketUrl("file:///tmp/socket", { href: "https://game.example/map" }),
    /HTTP\(S\)/u,
  );
});

test("connect opens the authenticated endpoint and sends validated room commands", () => {
  const { service } = makeService();
  const observed = [];
  service.subscribe((state) => observed.push(state.status));

  service.connect();
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, "wss://play.example.test/api/postgame/socket");
  assert.equal(service.getState().status, "connecting");

  socket.open();
  assert.equal(service.getState().connected, true);
  assert.equal(service.createRoom("stat-boss", 5), true);
  assert.equal(service.joinRoom("room:abc-123"), true);
  assert.equal(service.startRoom(), true);
  assert.equal(service.leaveRoom(), true);
  assert.deepEqual(socket.sent, [
    { type: "room.create", battleId: "stat-boss", capacity: 5 },
    { type: "room.join", roomId: "room:abc-123" },
    { type: "room.start" },
    { type: "room.leave" },
  ]);
  assert.deepEqual(observed, ["idle", "connecting", "connected"]);
  assert.throws(() => service.createRoom("stat-boss", 0), /1 to 5/u);
  assert.throws(() => service.createRoom("bad room", 2), /battleId/u);
  assert.throws(() => service.joinRoom(""), /roomId/u);
});

test("presence is normalized, sent at most about 11Hz, and coalesces trailing movement", () => {
  const { service, timers } = makeService();
  service.updatePresence({ zone: "entry-field", x: -2, y: 2, direction: "right", moving: true });
  service.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.deepEqual(socket.sent, [{
    type: "presence.update",
    zone: "entry-field",
    x: 0,
    y: 1,
    direction: "right",
    moving: true,
  }]);

  timers.advance(10);
  service.updatePresence({ zone: "plaza", x: 0.3, y: 0.4, direction: "up", moving: true });
  service.updatePresence({ zone: "plaza", x: 0.8, y: 0.6, direction: "left", moving: false });
  assert.equal(socket.sent.length, 1);
  timers.advance(89);
  assert.equal(socket.sent.length, 1);
  timers.advance(1);
  assert.deepEqual(socket.sent[1], {
    type: "presence.update",
    zone: "plaza",
    x: 0.8,
    y: 0.6,
    direction: "left",
    moving: false,
  });

  service.updatePresence({ zone: "plaza", x: 0.8, y: 0.6, direction: "left", moving: false });
  timers.advance(100);
  assert.equal(socket.sent.length, 2, "identical positions are not sent again");
  assert.throws(() => service.updatePresence({ zone: "boss", x: 0, y: 0 }), /zone/u);
  assert.throws(
    () => service.updatePresence({ zone: "plaza", x: Number.NaN, y: 0 }),
    /finite/u,
  );
});

test("presence messages expose public fields only and snapshots exclude the current player", () => {
  const { service } = makeService();
  service.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "ready",
    self: { id: "me", name: "나", email: "secret@example.test", token: "hidden" },
  });
  socket.receive({
    type: "presence.snapshot",
    players: [
      { id: "me", name: "나", zone: "plaza", x: 0.1, y: 0.2 },
      {
        id: "other",
        displayName: "다른 유저",
        email: "never@example.test",
        googleId: "private",
        zone: "plaza",
        x: 0.25,
        y: 0.75,
        direction: "up",
        moving: true,
      },
    ],
  });

  const state = service.getState();
  assert.deepEqual(state.self, { id: "me", name: "나" });
  assert.equal(state.selfId, "me");
  assert.deepEqual(state.players, [{
    id: "other",
    name: "다른 유저",
    zone: "plaza",
    x: 0.25,
    y: 0.75,
    direction: "up",
    moving: true,
  }]);
  assert.equal(Object.hasOwn(state.self, "email"), false);
  assert.equal(Object.hasOwn(state.players[0], "googleId"), false);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.players), true);
  assert.equal(Object.isFrozen(state.players[0]), true);

  socket.receive({
    type: "presence.update",
    player: { id: "other", name: "새 이름", zone: "entry-field", x: 0.5, y: 0.6 },
  });
  assert.equal(service.getState().players.length, 1);
  assert.equal(service.getState().players[0].name, "새 이름");
  socket.receive({ type: "presence.leave", playerId: "other" });
  assert.deepEqual(service.getState().players, []);
});

test("room snapshots, membership, updates, starts, and removals form a small immutable API", () => {
  const { service } = makeService();
  const events = [];
  service.subscribeEvents((event) => events.push(event));
  service.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  const room = {
    id: "room-1",
    battleId: "control-boss",
    capacity: 5,
    hostId: "host",
    memberCount: 2,
    members: [
      { id: "host", name: "방장", email: "hidden@example.test" },
      { id: "guest", displayName: "참가자", token: "hidden" },
    ],
    status: "waiting",
    secret: "must disappear",
  };

  socket.receive({ type: "rooms.snapshot", rooms: [room] });
  socket.receive({ type: "room.joined", room });
  assert.equal(service.getState().currentRoomId, "room-1");
  assert.equal(service.getState().currentRoom.id, "room-1");
  assert.deepEqual(service.getState().rooms[0].members, [
    { id: "host", name: "방장" },
    { id: "guest", name: "참가자" },
  ]);
  assert.equal(Object.hasOwn(service.getState().rooms[0], "secret"), false);
  assert.equal(Object.isFrozen(service.getState().rooms[0].members), true);

  socket.receive({
    type: "room.started",
    room: { ...room, status: "started" },
  });
  assert.deepEqual(service.getState().lastEvent, {
    type: "room.started",
    roomId: "room-1",
    battleId: "control-boss",
    room: service.getState().rooms[0],
    roster: [
      { id: "host", name: "방장" },
      { id: "guest", name: "참가자" },
    ],
    seed: null,
    startedAt: null,
  });
  socket.receive({ type: "room.left", roomId: "room-1" });
  assert.equal(service.getState().currentRoomId, null);
  assert.equal(service.getState().currentRoom, null);
  socket.receive({ type: "room.removed", roomId: "room-1" });
  assert.deepEqual(service.getState().rooms, []);
  assert.deepEqual(events.map((event) => event.type), [
    "rooms.snapshot",
    "room.joined",
    "room.started",
    "room.left",
    "room.removed",
  ]);
});

test("invalid messages are ignored and server errors are safely bounded", () => {
  const { service } = makeService();
  service.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  const before = service.getState();
  socket.receive("not json");
  socket.receive({ nope: true });
  socket.onmessage({ data: new Uint8Array([1, 2, 3]) });
  assert.equal(service.getState(), before);

  socket.receive({
    type: "error",
    code: "ROOM_FULL",
    message: "방이 가득 찼습니다.",
    debug: "private server trace",
  });
  assert.deepEqual(service.getState().lastError, {
    code: "ROOM_FULL",
    message: "방이 가득 찼습니다.",
  });
  assert.equal(service.getState().error, "방이 가득 찼습니다.");
  assert.equal(Object.hasOwn(service.getState().lastError, "debug"), false);
});

test("unexpected disconnect reconnects with backoff and re-announces the latest presence", () => {
  const { service, timers } = makeService();
  service.connect();
  const first = FakeWebSocket.instances[0];
  first.open();
  service.updatePresence({ zone: "plaza", x: 0.4, y: 0.7, direction: "down", moving: false });
  assert.equal(first.sent.length, 1);

  first.serverClose(1006);
  assert.equal(service.getState().status, "reconnecting");
  assert.equal(service.getState().reconnectAttempt, 1);
  assert.equal(timers.count(), 1);
  timers.advance(499);
  assert.equal(FakeWebSocket.instances.length, 1);
  timers.advance(1);
  assert.equal(FakeWebSocket.instances.length, 2);

  const second = FakeWebSocket.instances[1];
  second.open();
  assert.equal(service.getState().reconnectAttempt, 0);
  assert.deepEqual(second.sent, [{
    type: "presence.update",
    zone: "plaza",
    x: 0.4,
    y: 0.7,
    direction: "down",
    moving: false,
  }]);
});

test("manual and authentication disconnects do not create reconnect loops", () => {
  const firstRun = makeService();
  firstRun.service.connect();
  const first = FakeWebSocket.instances[0];
  first.open();
  firstRun.service.disconnect();
  assert.deepEqual(first.closeArgs, [1000, "client disconnect"]);
  assert.equal(firstRun.service.getState().status, "disconnected");
  assert.equal(firstRun.timers.count(), 0);

  const secondRun = makeService();
  secondRun.service.connect();
  const second = FakeWebSocket.instances[0];
  second.open();
  second.serverClose(4401);
  assert.equal(secondRun.service.getState().status, "error");
  assert.equal(secondRun.service.getState().lastError.code, "AUTH_REQUIRED");
  assert.equal(secondRun.timers.count(), 0);
});

test("failed reconnects clear stale rooms and stop at a bounded fallback state", () => {
  const { service, timers } = makeService({ maxReconnectAttempts: 2 });
  service.connect();
  const first = FakeWebSocket.instances[0];
  first.open();
  first.receive({
    type: "room.joined",
    room: {
      id: "ROOMABCDE2",
      battleId: "stat-boss",
      capacity: 5,
      hostId: "self",
      members: [{ id: "self", name: "나" }],
      status: "waiting",
    },
  });
  assert.equal(service.getState().currentRoomId, "ROOMABCDE2");

  first.serverClose(1006);
  assert.equal(service.getState().currentRoomId, null);
  assert.deepEqual(service.getState().rooms, []);
  timers.advance(500);
  const second = FakeWebSocket.instances[1];
  second.serverClose(1006);
  timers.advance(1_000);
  const third = FakeWebSocket.instances[2];
  third.serverClose(1006);

  assert.equal(service.getState().status, "error");
  assert.equal(service.getState().lastError.code, "RECONNECT_EXHAUSTED");
  assert.equal(timers.count(), 0);
});

test("a successful room acknowledgement clears an earlier room error", () => {
  const { service } = makeService();
  service.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "error", code: "room_full", message: "방이 가득 찼습니다." });
  assert.equal(service.getState().error, "방이 가득 찼습니다.");
  socket.receive({
    type: "room.joined",
    room: {
      id: "ROOMABCDE3",
      battleId: "stat-boss",
      capacity: 1,
      hostId: "self",
      members: [{ id: "self", name: "나" }],
      status: "waiting",
    },
  });
  assert.equal(service.getState().error, null);
});

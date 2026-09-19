const DEFAULT_ENDPOINT = "/api/postgame/socket";
const DEFAULT_PRESENCE_INTERVAL_MS = 90;
const DEFAULT_RECONNECT_BASE_MS = 500;
const DEFAULT_RECONNECT_MAX_MS = 10_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;
const PUBLIC_ZONES = new Set(["entry-field", "plaza"]);
const DIRECTIONS = new Set(["up", "down", "left", "right"]);
const ROOM_STATUSES = new Set(["waiting", "started"]);
const NON_RETRYABLE_CLOSE_CODES = new Set([1000, 1008, 4001, 4401, 4403]);

function cleanText(value, { fallback = "", maxLength = 80 } = {}) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function normalizeRoomName(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function finiteNumber(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedCoordinate(value) {
  const number = finiteNumber(value, Number.NaN);
  if (!Number.isFinite(number)) throw new TypeError("Presence coordinates must be finite numbers.");
  return Math.min(1, Math.max(0, number));
}

function publicPlayer(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = cleanText(candidate.id ?? candidate.playerId ?? candidate.connectionId, { maxLength: 128 });
  if (!id) return null;
  const zone = PUBLIC_ZONES.has(candidate.zone) ? candidate.zone : "entry-field";
  const direction = DIRECTIONS.has(candidate.direction) ? candidate.direction : "down";
  return Object.freeze({
    id,
    name: cleanText(candidate.name ?? candidate.displayName, {
      fallback: "플레이어",
      maxLength: 40,
    }),
    zone,
    x: Math.min(1, Math.max(0, finiteNumber(candidate.x, 0.5))),
    y: Math.min(1, Math.max(0, finiteNumber(candidate.y, 0.5))),
    direction,
    moving: candidate.moving === true,
  });
}

function publicIdentity(candidate) {
  const player = publicPlayer(candidate);
  return player ? Object.freeze({ id: player.id, name: player.name }) : null;
}

function publicMember(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = cleanText(candidate.id ?? candidate.playerId ?? candidate.userId, { maxLength: 128 });
  if (!id) return null;
  return Object.freeze({
    id,
    name: cleanText(candidate.name ?? candidate.displayName, {
      fallback: "플레이어",
      maxLength: 40,
    }),
  });
}

function publicRoom(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = cleanText(candidate.id ?? candidate.roomId, { maxLength: 128 });
  const battleId = cleanText(candidate.battleId, { maxLength: 80 });
  if (!id || !battleId) return null;
  const members = Object.freeze(
    (Array.isArray(candidate.members)
      ? candidate.members
      : Array.isArray(candidate.players)
        ? candidate.players
        : [])
      .map(publicMember)
      .filter(Boolean)
      .slice(0, 5),
  );
  const capacity = Math.min(5, Math.max(1, Math.trunc(finiteNumber(candidate.capacity, 1))));
  const normalizedRoomName = normalizeRoomName(candidate.roomName ?? candidate.name);
  const explicitRoomName = [...normalizedRoomName].slice(0, 32).join("");
  return Object.freeze({
    id,
    battleId,
    roomName: explicitRoomName || `${members[0]?.name || "플레이어"}의 방`,
    capacity,
    hostId: cleanText(candidate.hostId ?? candidate.hostPlayerId, { maxLength: 128 }),
    memberCount: Math.min(capacity, Math.max(
      members.length,
      Math.trunc(finiteNumber(candidate.memberCount ?? candidate.playerCount, members.length)),
    )),
    members,
    status: ROOM_STATUSES.has(candidate.status) ? candidate.status : "waiting",
  });
}

function freezeEvent(type, details = {}) {
  return Object.freeze({ type, ...details });
}

function initialState() {
  return Object.freeze({
    status: "idle",
    connected: false,
    reconnectAttempt: 0,
    self: null,
    selfId: null,
    players: Object.freeze([]),
    rooms: Object.freeze([]),
    currentRoomId: null,
    currentRoom: null,
    lastError: null,
    error: null,
    lastEvent: null,
  });
}

function freezeState(candidate) {
  const rooms = Object.freeze([...candidate.rooms]);
  const currentRoom = rooms.find((room) => room.id === candidate.currentRoomId) ?? null;
  return Object.freeze({
    status: candidate.status,
    connected: candidate.connected === true,
    reconnectAttempt: Math.max(0, Math.trunc(finiteNumber(candidate.reconnectAttempt, 0))),
    self: candidate.self,
    selfId: candidate.self?.id ?? null,
    players: Object.freeze([...candidate.players]),
    rooms,
    currentRoomId: candidate.currentRoomId,
    currentRoom,
    lastError: candidate.lastError,
    error: candidate.lastError?.message ?? null,
    lastEvent: candidate.lastEvent,
  });
}

function asWebSocketUrl(endpoint, locationLike) {
  const baseHref = locationLike?.href
    ?? (locationLike?.origin ? `${locationLike.origin}/` : "http://localhost/");
  const url = new URL(endpoint, baseHref);
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new TypeError("Postgame realtime endpoint must use HTTP(S) or WebSocket protocol.");
  }
  return url.toString();
}

function validateIdentifier(value, label) {
  const normalized = cleanText(value, { maxLength: 80 });
  if (!normalized || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/u.test(normalized)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
}

function validateRoomName(value) {
  const normalized = normalizeRoomName(value);
  const length = [...normalized].length;
  if (length < 1 || length > 32) {
    throw new TypeError("roomName must contain 1 to 32 characters.");
  }
  return normalized;
}

export class PostgameRealtimeService {
  #WebSocket;
  #endpoint;
  #location;
  #setTimeout;
  #clearTimeout;
  #now;
  #random;
  #presenceIntervalMs;
  #reconnectBaseMs;
  #reconnectMaxMs;
  #maxReconnectAttempts;
  #listeners = new Set();
  #eventListeners = new Set();
  #state = initialState();
  #socket = null;
  #generation = 0;
  #manualDisconnect = false;
  #reconnectTimer = null;
  #presenceTimer = null;
  #latestPresence = null;
  #lastPresencePayload = null;
  #lastPresenceSentAt = Number.NEGATIVE_INFINITY;

  constructor({
    WebSocketImpl = globalThis.WebSocket,
    endpoint = DEFAULT_ENDPOINT,
    location = globalThis.location,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    now = Date.now,
    random = Math.random,
    presenceIntervalMs = DEFAULT_PRESENCE_INTERVAL_MS,
    reconnectBaseMs = DEFAULT_RECONNECT_BASE_MS,
    reconnectMaxMs = DEFAULT_RECONNECT_MAX_MS,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
  } = {}) {
    if (typeof WebSocketImpl !== "function") {
      throw new TypeError("PostgameRealtimeService requires WebSocket.");
    }
    if (typeof setTimeoutImpl !== "function" || typeof clearTimeoutImpl !== "function") {
      throw new TypeError("PostgameRealtimeService requires timer functions.");
    }
    this.#WebSocket = WebSocketImpl;
    this.#endpoint = endpoint;
    this.#location = location;
    this.#setTimeout = setTimeoutImpl;
    this.#clearTimeout = clearTimeoutImpl;
    this.#now = now;
    this.#random = random;
    this.#presenceIntervalMs = Math.max(50, finiteNumber(presenceIntervalMs, DEFAULT_PRESENCE_INTERVAL_MS));
    this.#reconnectBaseMs = Math.max(1, finiteNumber(reconnectBaseMs, DEFAULT_RECONNECT_BASE_MS));
    this.#reconnectMaxMs = Math.max(
      this.#reconnectBaseMs,
      finiteNumber(reconnectMaxMs, DEFAULT_RECONNECT_MAX_MS),
    );
    this.#maxReconnectAttempts = Math.max(
      1,
      Math.trunc(finiteNumber(maxReconnectAttempts, DEFAULT_MAX_RECONNECT_ATTEMPTS)),
    );
  }

  getState() {
    return this.#state;
  }

  subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== "function") throw new TypeError("Subscriber must be a function.");
    this.#listeners.add(listener);
    if (emitCurrent) listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  subscribeEvents(listener) {
    if (typeof listener !== "function") throw new TypeError("Event subscriber must be a function.");
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  connect() {
    this.#manualDisconnect = false;
    this.#cancelReconnect();
    if (this.#socket && (this.#socket.readyState === 0 || this.#socket.readyState === 1)) {
      return;
    }
    this.#openSocket(this.#state.reconnectAttempt > 0 ? "reconnecting" : "connecting");
  }

  disconnect() {
    this.#manualDisconnect = true;
    this.#generation += 1;
    this.#cancelReconnect();
    this.#cancelPresenceTimer();
    const socket = this.#socket;
    this.#socket = null;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      try {
        socket.close(1000, "client disconnect");
      } catch {
        // Some test doubles and already-closing browser sockets reject close().
      }
    }
    this.#setState({
      ...this.#state,
      status: "disconnected",
      connected: false,
      reconnectAttempt: 0,
      players: Object.freeze([]),
      rooms: Object.freeze([]),
      currentRoomId: null,
    });
  }

  updatePresence({ zone, x, y, direction = "down", moving = false } = {}) {
    if (!PUBLIC_ZONES.has(zone)) throw new RangeError(`Unsupported postgame zone: ${zone}`);
    if (!DIRECTIONS.has(direction)) throw new RangeError(`Unsupported direction: ${direction}`);
    this.#latestPresence = Object.freeze({
      type: "presence.update",
      zone,
      x: normalizedCoordinate(x),
      y: normalizedCoordinate(y),
      direction,
      moving: moving === true,
    });
    this.#queuePresence();
  }

  createRoom(battleId, capacity = 5, roomName) {
    const normalizedBattleId = validateIdentifier(battleId, "battleId");
    const normalizedCapacity = Number(capacity);
    if (!Number.isInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 5) {
      throw new RangeError("Room capacity must be an integer from 1 to 5.");
    }
    return this.#send({
      type: "room.create",
      battleId: normalizedBattleId,
      capacity: normalizedCapacity,
      roomName: validateRoomName(roomName),
    });
  }

  joinRoom(roomId) {
    return this.#send({ type: "room.join", roomId: validateIdentifier(roomId, "roomId") });
  }

  leaveRoom() {
    return this.#send({ type: "room.leave" });
  }

  startRoom() {
    return this.#send({ type: "room.start" });
  }

  #openSocket(status) {
    const generation = ++this.#generation;
    let socket;
    try {
      socket = new this.#WebSocket(asWebSocketUrl(this.#endpoint, this.#location));
    } catch (error) {
      this.#recordError("실시간 서버에 연결할 수 없습니다.", "CONNECT_FAILED");
      this.#scheduleReconnect(generation);
      return;
    }
    this.#socket = socket;
    this.#setState({ ...this.#state, status, connected: false, lastError: null });

    socket.onopen = () => {
      if (!this.#isCurrent(socket, generation)) return;
      this.#lastPresencePayload = null;
      this.#lastPresenceSentAt = Number.NEGATIVE_INFINITY;
      this.#setState({
        ...this.#state,
        status: "connected",
        connected: true,
        reconnectAttempt: 0,
        lastError: null,
      });
      this.#queuePresence();
    };

    socket.onmessage = (event) => {
      if (!this.#isCurrent(socket, generation)) return;
      this.#handleMessage(event?.data);
    };

    socket.onerror = () => {
      if (!this.#isCurrent(socket, generation)) return;
      this.#recordError("실시간 연결에 문제가 생겼습니다.", "SOCKET_ERROR");
    };

    socket.onclose = (event = {}) => {
      if (!this.#isCurrent(socket, generation)) return;
      this.#socket = null;
      this.#cancelPresenceTimer();
      const code = Math.trunc(finiteNumber(event.code, 1006));
      if (this.#manualDisconnect || NON_RETRYABLE_CLOSE_CODES.has(code)) {
        this.#setState({
          ...this.#state,
          status: code === 1000 ? "disconnected" : "error",
          connected: false,
          players: Object.freeze([]),
          rooms: Object.freeze([]),
          currentRoomId: null,
          lastError: code === 1000 ? this.#state.lastError : Object.freeze({
            code: code === 4401 ? "AUTH_REQUIRED" : "CONNECTION_CLOSED",
            message: code === 4401
              ? "로그인 후 사후게임 온라인 기능을 이용해 주세요."
              : "실시간 서버 연결이 종료되었습니다.",
          }),
        });
        return;
      }
      this.#scheduleReconnect(generation);
    };
  }

  #scheduleReconnect(generation) {
    if (this.#manualDisconnect || generation !== this.#generation || this.#reconnectTimer !== null) {
      return;
    }
    const attempt = this.#state.reconnectAttempt + 1;
    if (attempt > this.#maxReconnectAttempts) {
      this.#setState({
        ...this.#state,
        status: "error",
        connected: false,
        players: Object.freeze([]),
        rooms: Object.freeze([]),
        currentRoomId: null,
        lastError: Object.freeze({
          code: "RECONNECT_EXHAUSTED",
          message: "실시간 서버에 연결할 수 없습니다. 솔로 입장을 이용해 주세요.",
        }),
      });
      return;
    }
    const exponential = Math.min(
      this.#reconnectMaxMs,
      this.#reconnectBaseMs * (2 ** Math.min(attempt - 1, 10)),
    );
    const jitter = 0.8 + (Math.min(1, Math.max(0, finiteNumber(this.#random(), 0.5))) * 0.4);
    const delay = Math.round(exponential * jitter);
    this.#setState({
      ...this.#state,
      status: "reconnecting",
      connected: false,
      reconnectAttempt: attempt,
      players: Object.freeze([]),
      rooms: Object.freeze([]),
      currentRoomId: null,
    });
    this.#reconnectTimer = this.#setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#manualDisconnect || generation !== this.#generation) return;
      this.#openSocket("reconnecting");
    }, delay);
  }

  #cancelReconnect() {
    if (this.#reconnectTimer === null) return;
    this.#clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  #queuePresence() {
    if (!this.#latestPresence || !this.#isOpen()) return;
    const elapsed = this.#now() - this.#lastPresenceSentAt;
    if (elapsed >= this.#presenceIntervalMs) {
      this.#flushPresence();
      return;
    }
    if (this.#presenceTimer !== null) return;
    this.#presenceTimer = this.#setTimeout(() => {
      this.#presenceTimer = null;
      this.#flushPresence();
    }, Math.max(0, this.#presenceIntervalMs - elapsed));
  }

  #flushPresence() {
    if (!this.#latestPresence || !this.#isOpen()) return;
    const payload = JSON.stringify(this.#latestPresence);
    if (payload === this.#lastPresencePayload) return;
    if (this.#sendSerialized(payload)) {
      this.#lastPresencePayload = payload;
      this.#lastPresenceSentAt = this.#now();
    }
  }

  #cancelPresenceTimer() {
    if (this.#presenceTimer === null) return;
    this.#clearTimeout(this.#presenceTimer);
    this.#presenceTimer = null;
  }

  #send(payload) {
    return this.#sendSerialized(JSON.stringify(payload));
  }

  #sendSerialized(payload) {
    if (!this.#isOpen()) return false;
    try {
      this.#socket.send(payload);
      return true;
    } catch {
      this.#recordError("실시간 서버로 메시지를 보내지 못했습니다.", "SEND_FAILED");
      return false;
    }
  }

  #isOpen() {
    return this.#socket?.readyState === 1;
  }

  #isCurrent(socket, generation) {
    return this.#socket === socket && this.#generation === generation;
  }

  #handleMessage(raw) {
    if (typeof raw !== "string" || raw.length > 256_000) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;

    switch (message.type) {
      case "ready": {
        const self = publicIdentity(message.self ?? message.player ?? message.user);
        this.#setState({ ...this.#state, self, lastEvent: freezeEvent("ready", { self }) });
        break;
      }
      case "presence.snapshot": {
        const players = this.#cleanPlayers(message.players);
        this.#setState({
          ...this.#state,
          players,
          lastEvent: freezeEvent("presence.snapshot", { players }),
        });
        break;
      }
      case "presence.update": {
        const player = publicPlayer(message.player ?? message);
        if (!player || player.id === this.#state.self?.id) return;
        const players = this.#upsertById(this.#state.players, player);
        this.#setState({
          ...this.#state,
          players,
          lastEvent: freezeEvent("presence.update", { player }),
        });
        break;
      }
      case "presence.leave": {
        const playerId = cleanText(message.playerId ?? message.id, { maxLength: 128 });
        if (!playerId) return;
        this.#setState({
          ...this.#state,
          players: Object.freeze(this.#state.players.filter((player) => player.id !== playerId)),
          lastEvent: freezeEvent("presence.leave", { playerId }),
        });
        break;
      }
      case "rooms.snapshot": {
        const rooms = this.#cleanRooms(message.rooms);
        this.#setState({ ...this.#state, rooms, lastEvent: freezeEvent("rooms.snapshot", { rooms }) });
        break;
      }
      case "room.updated": {
        const room = publicRoom(message.room ?? message);
        if (!room) return;
        this.#setState({
          ...this.#state,
          rooms: this.#upsertById(this.#state.rooms, room),
          lastEvent: freezeEvent("room.updated", { room }),
        });
        break;
      }
      case "room.removed": {
        const roomId = cleanText(message.roomId ?? message.id, { maxLength: 128 });
        if (!roomId) return;
        this.#setState({
          ...this.#state,
          rooms: Object.freeze(this.#state.rooms.filter((room) => room.id !== roomId)),
          currentRoomId: this.#state.currentRoomId === roomId ? null : this.#state.currentRoomId,
          lastEvent: freezeEvent("room.removed", { roomId }),
        });
        break;
      }
      case "room.joined": {
        const room = publicRoom(message.room);
        const roomId = room?.id ?? cleanText(message.roomId, { maxLength: 128 });
        if (!roomId) return;
        this.#setState({
          ...this.#state,
          rooms: room ? this.#upsertById(this.#state.rooms, room) : this.#state.rooms,
          currentRoomId: roomId,
          lastError: null,
          lastEvent: freezeEvent("room.joined", { roomId, room }),
        });
        break;
      }
      case "room.left": {
        const roomId = cleanText(message.roomId, {
          fallback: this.#state.currentRoomId ?? "",
          maxLength: 128,
        });
        this.#setState({
          ...this.#state,
          currentRoomId: this.#state.currentRoomId === roomId ? null : this.#state.currentRoomId,
          lastError: null,
          lastEvent: freezeEvent("room.left", { roomId }),
        });
        break;
      }
      case "room.started": {
        const room = publicRoom(message.room);
        const roomId = room?.id
          ?? cleanText(message.roomId, { fallback: this.#state.currentRoomId ?? "", maxLength: 128 });
        const battleId = room?.battleId ?? cleanText(message.battleId, { maxLength: 80 });
        if (!roomId || !battleId) return;
        const roster = Object.freeze(
          (Array.isArray(message.roster) ? message.roster : room?.members ?? [])
            .map(publicMember)
            .filter(Boolean)
            .slice(0, 5),
        );
        const seed = cleanText(message.seed, { maxLength: 128 });
        const startedAt = Math.max(0, Math.trunc(finiteNumber(message.startedAt, 0)));
        this.#setState({
          ...this.#state,
          rooms: room ? this.#upsertById(this.#state.rooms, room) : this.#state.rooms,
          currentRoomId: roomId,
          lastError: null,
          lastEvent: freezeEvent("room.started", {
            roomId,
            battleId,
            room,
            roster,
            seed: seed || null,
            startedAt: startedAt || null,
          }),
        });
        break;
      }
      case "error": {
        const error = Object.freeze({
          code: cleanText(message.code, { fallback: "SERVER_ERROR", maxLength: 80 }),
          message: cleanText(message.message, {
            fallback: "실시간 서버 요청을 처리하지 못했습니다.",
            maxLength: 240,
          }),
        });
        this.#setState({ ...this.#state, lastError: error, lastEvent: freezeEvent("error", { error }) });
        break;
      }
      default:
        return;
    }
    const event = this.#state.lastEvent;
    for (const listener of [...this.#eventListeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error("Postgame realtime event subscriber failed", error);
      }
    }
  }

  #cleanPlayers(candidates) {
    const byId = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const player = publicPlayer(candidate);
      if (player && player.id !== this.#state.self?.id) byId.set(player.id, player);
    }
    return Object.freeze([...byId.values()]);
  }

  #cleanRooms(candidates) {
    const byId = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const room = publicRoom(candidate);
      if (room) byId.set(room.id, room);
    }
    return Object.freeze([...byId.values()]);
  }

  #upsertById(items, item) {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) return Object.freeze([...items, item]);
    const next = [...items];
    next[index] = item;
    return Object.freeze(next);
  }

  #recordError(message, code) {
    const error = Object.freeze({ code, message });
    this.#setState({ ...this.#state, lastError: error });
  }

  #setState(candidate) {
    this.#state = freezeState(candidate);
    for (const listener of [...this.#listeners]) {
      try {
        listener(this.#state);
      } catch (error) {
        console.error("Postgame realtime subscriber failed", error);
      }
    }
  }
}

export function createPostgameRealtimeService(options) {
  return new PostgameRealtimeService(options);
}

export {
  DEFAULT_ENDPOINT,
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_PRESENCE_INTERVAL_MS,
  PUBLIC_ZONES,
  asWebSocketUrl,
  normalizeRoomName,
};

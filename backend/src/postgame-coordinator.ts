const ROOM_STORAGE_KEY = "postgame:rooms:v1";
const MAX_MESSAGE_BYTES = 4_096;
const MAX_MESSAGES_PER_SECOND = 30;
const MIN_PRESENCE_INTERVAL_MS = 40;

const ZONES = ["entry-field", "plaza"] as const;
const DIRECTIONS = ["up", "down", "left", "right"] as const;
const BATTLE_IDS = ["data-sphinx", "stat-boss", "control-boss"] as const;

type Zone = (typeof ZONES)[number];
type Direction = (typeof DIRECTIONS)[number];
type BattleId = (typeof BATTLE_IDS)[number];

interface SocketAttachment {
  version: 1;
  playerKey: string;
  playerId: string;
  name: string;
  zone: Zone;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  roomId: string | null;
  rateWindowStartedAt: number;
  rateCount: number;
  lastPresenceAt: number;
  disconnected?: boolean;
}

interface RoomRecord {
  version: 1;
  roomId: string;
  battleId: BattleId;
  capacity: number;
  hostPlayerId: string;
  memberPlayerIds: string[];
  createdAt: number;
}

interface PublicPlayer {
  id: string;
  name: string;
  zone: Zone;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
}

interface PublicRoomPlayer {
  id: string;
  name: string;
}

interface PublicRoom {
  id: string;
  battleId: BattleId;
  capacity: number;
  memberCount: number;
  hostId: string;
  members: PublicRoomPlayer[];
  status: "waiting" | "started";
}

type ClientMessage =
  | {
      type: "presence.update";
      zone: Zone;
      x: number;
      y: number;
      direction: Direction;
      moving: boolean;
    }
  | { type: "room.create"; battleId: BattleId; capacity: number }
  | { type: "room.join"; roomId: string }
  | { type: "room.leave" }
  | { type: "room.start" };

class ProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function isUnitCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseClientMessage(raw: string): ClientMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError("invalid_json", "메시지를 읽을 수 없습니다.");
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new ProtocolError("invalid_message", "메시지 형식이 올바르지 않습니다.");
  }

  switch (parsed.type) {
    case "presence.update":
      if (
        !hasExactKeys(parsed, ["type", "zone", "x", "y", "direction", "moving"]) ||
        !isOneOf(parsed.zone, ZONES) ||
        !isUnitCoordinate(parsed.x) ||
        !isUnitCoordinate(parsed.y) ||
        !isOneOf(parsed.direction, DIRECTIONS) ||
        typeof parsed.moving !== "boolean"
      ) {
        throw new ProtocolError("invalid_presence", "위치 정보가 올바르지 않습니다.");
      }
      return {
        type: parsed.type,
        zone: parsed.zone,
        x: parsed.x,
        y: parsed.y,
        direction: parsed.direction,
        moving: parsed.moving,
      };

    case "room.create":
      if (
        !hasExactKeys(parsed, ["type", "battleId", "capacity"]) ||
        !isOneOf(parsed.battleId, BATTLE_IDS) ||
        typeof parsed.capacity !== "number" ||
        !Number.isInteger(parsed.capacity) ||
        parsed.capacity < 1 ||
        parsed.capacity > 5
      ) {
        throw new ProtocolError("invalid_room", "보스방은 1명부터 5명까지 만들 수 있습니다.");
      }
      return { type: parsed.type, battleId: parsed.battleId, capacity: parsed.capacity };

    case "room.join":
      if (
        !hasExactKeys(parsed, ["type", "roomId"]) ||
        typeof parsed.roomId !== "string" ||
        !/^[A-Z0-9]{10}$/.test(parsed.roomId)
      ) {
        throw new ProtocolError("invalid_room_id", "보스방 번호가 올바르지 않습니다.");
      }
      return { type: parsed.type, roomId: parsed.roomId };

    case "room.leave":
    case "room.start":
      if (!hasExactKeys(parsed, ["type"])) {
        throw new ProtocolError("invalid_message", "메시지 형식이 올바르지 않습니다.");
      }
      return { type: parsed.type };

    default:
      throw new ProtocolError("unknown_message", "지원하지 않는 요청입니다.");
  }
}

function normalizeName(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned || "플레이어").slice(0, 24).join("");
}

function isSocketAttachment(value: unknown): value is SocketAttachment {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.playerKey === "string" &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    isOneOf(value.zone, ZONES) &&
    isUnitCoordinate(value.x) &&
    isUnitCoordinate(value.y) &&
    isOneOf(value.direction, DIRECTIONS) &&
    typeof value.moving === "boolean" &&
    (value.roomId === null || typeof value.roomId === "string") &&
    typeof value.rateWindowStartedAt === "number" &&
    typeof value.rateCount === "number" &&
    typeof value.lastPresenceAt === "number"
  );
}

function sanitizeRoom(value: unknown): RoomRecord | null {
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    typeof value.roomId !== "string" ||
    !/^[A-Z0-9]{10}$/.test(value.roomId) ||
    !isOneOf(value.battleId, BATTLE_IDS) ||
    typeof value.capacity !== "number" ||
    !Number.isInteger(value.capacity) ||
    value.capacity < 1 ||
    value.capacity > 5 ||
    typeof value.hostPlayerId !== "string" ||
    !Array.isArray(value.memberPlayerIds) ||
    !value.memberPlayerIds.every((id) => typeof id === "string") ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt)
  ) {
    return null;
  }

  const memberPlayerIds = [...new Set(value.memberPlayerIds)].slice(0, value.capacity);
  if (memberPlayerIds.length === 0) return null;
  return {
    version: 1,
    roomId: value.roomId,
    battleId: value.battleId,
    capacity: value.capacity,
    hostPlayerId: memberPlayerIds.includes(value.hostPlayerId) ? value.hostPlayerId : memberPlayerIds[0],
    memberPlayerIds,
    createdAt: value.createdAt,
  };
}

/**
 * Coordinates the shared postgame world and boss lobbies. The outer Worker must
 * authenticate the request before forwarding it and must replace (not forward)
 * both x-ai-player-* headers.
 */
export class PostgameCoordinator {
  private rooms = new Map<string, RoomRecord>();
  private readonly ready: Promise<void>;
  private roomMutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: DurableObjectState) {
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<unknown>(ROOM_STORAGE_KEY);
      if (Array.isArray(stored)) {
        for (const value of stored) {
          const room = sanitizeRoom(value);
          if (room) this.rooms.set(room.roomId, room);
        }
      }
      await this.reconcileRestoredState();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }

    const playerKey = request.headers.get("x-ai-player-key")?.trim() ?? "";
    const encodedName = request.headers.get("x-ai-player-name") ?? "";
    if (!playerKey || playerKey.length > 256 || encodedName.length > 1_024) {
      return Response.json({ error: "Authenticated player headers required" }, { status: 401 });
    }
    let rawName: string;
    try {
      rawName = decodeURIComponent(encodedName);
    } catch {
      return Response.json({ error: "Invalid player name" }, { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment: SocketAttachment = {
      version: 1,
      playerKey,
      playerId: crypto.randomUUID(),
      name: normalizeName(rawName),
      zone: "entry-field",
      x: 0.5,
      y: 0.5,
      direction: "down",
      moving: false,
      roomId: null,
      rateWindowStartedAt: now,
      rateCount: 0,
      lastPresenceAt: 0,
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`zone:${attachment.zone}`]);

    this.send(server, {
      type: "ready",
      self: { id: attachment.playerId, name: attachment.name },
      serverTime: now,
    });
    this.sendPresenceSnapshot(server, attachment);
    await this.roomMutationQueue;
    this.send(server, { type: "rooms.snapshot", rooms: this.publicRooms() });
    this.broadcastPresence(attachment, { type: "presence.update", player: this.publicPlayer(attachment) });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready;
    const attachment = this.attachment(socket);
    if (!attachment || attachment.disconnected) {
      socket.close(1008, "Invalid connection state");
      return;
    }

    if (typeof message !== "string") {
      this.sendError(socket, "text_only", "텍스트 메시지만 전송할 수 있습니다.");
      socket.close(1003, "Text messages only");
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, "message_too_large", "메시지가 너무 큽니다.");
      socket.close(1009, "Message too large");
      return;
    }
    if (!this.consumeRateLimit(socket, attachment)) {
      this.sendError(socket, "rate_limited", "요청이 너무 빠릅니다.");
      socket.close(1008, "Rate limit exceeded");
      return;
    }

    try {
      const parsed = parseClientMessage(message);
      switch (parsed.type) {
        case "presence.update":
          this.updatePresence(socket, attachment, parsed);
          return;
        case "room.create":
          await this.enqueueRoomMutation(() => this.createRoom(socket, attachment, parsed.battleId, parsed.capacity));
          return;
        case "room.join":
          await this.enqueueRoomMutation(() => this.joinRoom(socket, attachment, parsed.roomId));
          return;
        case "room.leave":
          await this.enqueueRoomMutation(() => this.leaveRoom(socket, attachment, true));
          return;
        case "room.start":
          await this.enqueueRoomMutation(() => this.startRoom(socket, attachment));
          return;
      }
    } catch (error) {
      if (error instanceof ProtocolError) {
        this.sendError(socket, error.code, error.message);
        return;
      }
      console.error("postgame websocket message failed", error);
      this.sendError(socket, "server_error", "서버에서 요청을 처리하지 못했습니다.");
    }
  }

  async webSocketClose(
    socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.disconnect(socket);
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error("postgame websocket error", error);
    await this.disconnect(socket);
    try {
      socket.close(1011, "WebSocket error");
    } catch {
      // The runtime can report an error after the peer has already closed.
    }
  }

  private attachment(socket: WebSocket): SocketAttachment | null {
    const value = socket.deserializeAttachment();
    return isSocketAttachment(value) ? value : null;
  }

  private activeSockets(): Array<{ socket: WebSocket; attachment: SocketAttachment }> {
    const active: Array<{ socket: WebSocket; attachment: SocketAttachment }> = [];
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (attachment && !attachment.disconnected) active.push({ socket, attachment });
    }
    return active;
  }

  private socketByPlayerId(playerId: string): { socket: WebSocket; attachment: SocketAttachment } | null {
    return this.activeSockets().find(({ attachment }) => attachment.playerId === playerId) ?? null;
  }

  private consumeRateLimit(socket: WebSocket, attachment: SocketAttachment): boolean {
    const now = Date.now();
    if (now - attachment.rateWindowStartedAt >= 1_000) {
      attachment.rateWindowStartedAt = now;
      attachment.rateCount = 0;
    }
    attachment.rateCount += 1;
    socket.serializeAttachment(attachment);
    return attachment.rateCount <= MAX_MESSAGES_PER_SECOND;
  }

  private updatePresence(
    socket: WebSocket,
    attachment: SocketAttachment,
    update: Extract<ClientMessage, { type: "presence.update" }>,
  ): void {
    const now = Date.now();
    if (attachment.lastPresenceAt && now - attachment.lastPresenceAt < MIN_PRESENCE_INTERVAL_MS) {
      throw new ProtocolError("presence_rate_limited", "위치 갱신이 너무 빠릅니다.");
    }

    const previousZone = attachment.zone;
    attachment.zone = update.zone;
    attachment.x = update.x;
    attachment.y = update.y;
    attachment.direction = update.direction;
    attachment.moving = update.moving;
    attachment.lastPresenceAt = now;
    socket.serializeAttachment(attachment);

    if (previousZone !== attachment.zone) {
      this.broadcastToZone(
        previousZone,
        { type: "presence.leave", playerId: attachment.playerId, zone: previousZone },
        attachment.playerKey,
      );
      this.sendPresenceSnapshot(socket, attachment);
    }
    this.broadcastPresence(attachment, { type: "presence.update", player: this.publicPlayer(attachment) });
  }

  private async createRoom(
    socket: WebSocket,
    attachment: SocketAttachment,
    battleId: BattleId,
    capacity: number,
  ): Promise<void> {
    this.assertCanJoinRoom(attachment);
    let roomId = this.generateRoomId();
    while (this.rooms.has(roomId)) roomId = this.generateRoomId();

    const room: RoomRecord = {
      version: 1,
      roomId,
      battleId,
      capacity,
      hostPlayerId: attachment.playerId,
      memberPlayerIds: [attachment.playerId],
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    try {
      await this.persistRooms();
    } catch (error) {
      this.rooms.delete(roomId);
      throw error;
    }

    attachment.roomId = roomId;
    socket.serializeAttachment(attachment);
    const publicRoom = this.publicRoom(room);
    this.send(socket, { type: "room.joined", room: publicRoom });
    this.broadcast({ type: "room.updated", room: publicRoom });
  }

  private async joinRoom(socket: WebSocket, attachment: SocketAttachment, roomId: string): Promise<void> {
    this.assertCanJoinRoom(attachment);
    const room = this.rooms.get(roomId);
    if (!room) throw new ProtocolError("room_not_found", "이미 시작했거나 존재하지 않는 방입니다.");
    if (room.memberPlayerIds.length >= room.capacity) {
      throw new ProtocolError("room_full", "방의 최대 인원에 도달했습니다.");
    }

    room.memberPlayerIds.push(attachment.playerId);
    try {
      await this.persistRooms();
    } catch (error) {
      room.memberPlayerIds.pop();
      throw error;
    }

    attachment.roomId = roomId;
    socket.serializeAttachment(attachment);
    const publicRoom = this.publicRoom(room);
    this.send(socket, { type: "room.joined", room: publicRoom });
    this.broadcast({ type: "room.updated", room: publicRoom });
  }

  private async leaveRoom(socket: WebSocket, attachment: SocketAttachment, notifyLeaver: boolean): Promise<void> {
    const roomId = attachment.roomId;
    if (!roomId) {
      if (notifyLeaver) throw new ProtocolError("not_in_room", "참가 중인 방이 없습니다.");
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      attachment.roomId = null;
      try {
        socket.serializeAttachment(attachment);
      } catch (error) {
        if (notifyLeaver) throw error;
        console.error("postgame closed-room attachment update failed", error);
      }
      if (notifyLeaver) this.send(socket, { type: "room.left", roomId });
      return;
    }

    room.memberPlayerIds = room.memberPlayerIds.filter((id) => id !== attachment.playerId);
    if (room.memberPlayerIds.length === 0) {
      this.rooms.delete(roomId);
    } else if (room.hostPlayerId === attachment.playerId) {
      room.hostPlayerId = room.memberPlayerIds[0];
    }
    await this.persistRooms();

    attachment.roomId = null;
    try {
      socket.serializeAttachment(attachment);
    } catch (error) {
      // A close callback can run after the peer is already gone. The stored
      // room mutation and notifications must still complete for survivors.
      console.error("postgame room attachment update failed", error);
    }
    if (notifyLeaver) this.send(socket, { type: "room.left", roomId });
    if (this.rooms.has(roomId)) {
      this.broadcast({ type: "room.updated", room: this.publicRoom(room) });
    } else {
      this.broadcast({ type: "room.removed", roomId });
    }
  }

  private async startRoom(socket: WebSocket, attachment: SocketAttachment): Promise<void> {
    if (!attachment.roomId) throw new ProtocolError("not_in_room", "참가 중인 방이 없습니다.");
    const room = this.rooms.get(attachment.roomId);
    if (!room) throw new ProtocolError("room_not_found", "이미 시작했거나 존재하지 않는 방입니다.");
    if (room.hostPlayerId !== attachment.playerId) {
      throw new ProtocolError("host_only", "방장만 전투를 시작할 수 있습니다.");
    }
    // A one-player room is valid by design; capacity is only an upper bound.
    if (room.memberPlayerIds.length < 1) {
      throw new ProtocolError("not_enough_players", "전투를 시작할 참가자가 없습니다.");
    }

    const roomId = room.roomId;
    const participants = room.memberPlayerIds
      .map((playerId) => this.socketByPlayerId(playerId))
      .filter((value): value is { socket: WebSocket; attachment: SocketAttachment } => value !== null);
    if (participants.length === 0) {
      this.rooms.delete(roomId);
      await this.persistRooms();
      this.broadcast({ type: "room.removed", roomId });
      return;
    }

    const roster = participants.map(({ attachment: member }) => ({
      id: member.playerId,
      name: member.name,
    }));
    const startedAt = Date.now();
    const seed = crypto.randomUUID();
    const startedRoom: PublicRoom = {
      id: room.roomId,
      battleId: room.battleId,
      capacity: room.capacity,
      memberCount: roster.length,
      hostId: room.hostPlayerId,
      members: roster,
      status: "started",
    };

    this.rooms.delete(roomId);
    await this.persistRooms();
    for (const participant of participants) {
      participant.attachment.roomId = null;
      try {
        participant.socket.serializeAttachment(participant.attachment);
      } catch (error) {
        // A participant can disconnect while the host starts the room. Keep
        // notifying every surviving participant instead of aborting the loop.
        console.error("postgame started-room attachment update failed", error);
        continue;
      }
      this.send(participant.socket, {
        type: "room.started",
        roomId,
        battleId: room.battleId,
        room: startedRoom,
        roster,
        seed,
        startedAt,
      });
    }
    this.broadcast({ type: "room.removed", roomId });
  }

  private assertCanJoinRoom(attachment: SocketAttachment): void {
    if (attachment.roomId) throw new ProtocolError("already_in_room", "이미 다른 방에 참가 중입니다.");
    const sameAccountInRoom = this.activeSockets().some(
      ({ attachment: other }) =>
        other.playerId !== attachment.playerId && other.playerKey === attachment.playerKey && other.roomId !== null,
    );
    if (sameAccountInRoom) {
      throw new ProtocolError("account_already_in_room", "이 계정은 이미 다른 창에서 방에 참가 중입니다.");
    }
  }

  private publicPlayer(attachment: SocketAttachment): PublicPlayer {
    return {
      id: attachment.playerId,
      name: attachment.name,
      zone: attachment.zone,
      x: attachment.x,
      y: attachment.y,
      direction: attachment.direction,
      moving: attachment.moving,
    };
  }

  private publicRoom(room: RoomRecord): PublicRoom {
    const members = room.memberPlayerIds.flatMap((playerId): PublicRoomPlayer[] => {
      const participant = this.socketByPlayerId(playerId);
      if (!participant) return [];
      return [
        {
          id: playerId,
          name: participant.attachment.name,
        },
      ];
    });
    return {
      id: room.roomId,
      battleId: room.battleId,
      capacity: room.capacity,
      memberCount: members.length,
      hostId: room.hostPlayerId,
      members,
      status: "waiting",
    };
  }

  private publicRooms(): PublicRoom[] {
    return [...this.rooms.values()]
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((room) => this.publicRoom(room));
  }

  private sendPresenceSnapshot(socket: WebSocket, recipient: SocketAttachment): void {
    const players = this.activeSockets()
      .map(({ attachment }) => attachment)
      .filter(
        (player) =>
          player.playerId !== recipient.playerId &&
          player.playerKey !== recipient.playerKey &&
          player.zone === recipient.zone,
      )
      .map((player) => this.publicPlayer(player));
    this.send(socket, { type: "presence.snapshot", zone: recipient.zone, players });
  }

  private broadcastPresence(sender: SocketAttachment, payload: unknown): void {
    this.broadcastToZone(sender.zone, payload, sender.playerKey);
  }

  private broadcastToZone(zone: Zone, payload: unknown, excludedPlayerKey?: string): void {
    for (const { socket, attachment } of this.activeSockets()) {
      if (attachment.zone === zone && attachment.playerKey !== excludedPlayerKey) this.send(socket, payload);
    }
  }

  private broadcast(payload: unknown): void {
    for (const { socket } of this.activeSockets()) this.send(socket, payload);
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (error) {
      console.error("postgame websocket send failed", error);
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { type: "error", code, message });
  }

  private generateRoomId(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  private enqueueRoomMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.roomMutationQueue.then(mutation, mutation);
    this.roomMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async persistRooms(): Promise<void> {
    await this.ctx.storage.put(ROOM_STORAGE_KEY, [...this.rooms.values()]);
  }

  private async disconnect(socket: WebSocket): Promise<void> {
    await this.ready;
    const attachment = this.attachment(socket);
    if (!attachment || attachment.disconnected) return;

    attachment.disconnected = true;
    try {
      socket.serializeAttachment(attachment);
    } catch {
      // The connection can already be gone; room cleanup still must complete.
    }
    this.broadcastToZone(
      attachment.zone,
      { type: "presence.leave", playerId: attachment.playerId, zone: attachment.zone },
      attachment.playerKey,
    );
    await this.enqueueRoomMutation(() => this.leaveRoom(socket, attachment, false));
  }

  private async reconcileRestoredState(): Promise<void> {
    const sockets = this.activeSockets();
    const activePlayers = new Map(sockets.map(({ attachment }) => [attachment.playerId, attachment]));
    const claimedPlayers = new Set<string>();
    let changed = false;

    for (const [roomId, room] of this.rooms) {
      const members = room.memberPlayerIds.filter(
        (playerId) => activePlayers.has(playerId) && !claimedPlayers.has(playerId),
      );
      for (const playerId of members) claimedPlayers.add(playerId);
      if (members.length === 0) {
        this.rooms.delete(roomId);
        changed = true;
        continue;
      }
      if (
        members.length !== room.memberPlayerIds.length ||
        !members.includes(room.hostPlayerId)
      ) {
        room.memberPlayerIds = members;
        room.hostPlayerId = members.includes(room.hostPlayerId) ? room.hostPlayerId : members[0];
        changed = true;
      }
    }

    for (const { socket, attachment } of sockets) {
      const expectedRoomId = [...this.rooms.values()].find((room) =>
        room.memberPlayerIds.includes(attachment.playerId),
      )?.roomId;
      const normalizedRoomId = expectedRoomId ?? null;
      if (attachment.roomId !== normalizedRoomId) {
        attachment.roomId = normalizedRoomId;
        socket.serializeAttachment(attachment);
        changed = true;
      }
    }

    if (changed) await this.persistRooms();
  }
}

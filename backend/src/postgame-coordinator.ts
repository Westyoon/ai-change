const ROOM_STORAGE_KEY = "postgame:rooms:v1";
const BATTLE_STORAGE_KEY = "postgame:battles:v1";
const MAX_MESSAGE_BYTES = 4_096;
const MAX_MESSAGES_PER_SECOND = 30;
const MIN_PRESENCE_INTERVAL_MS = 40;
const MAX_ROOM_NAME_LENGTH = 32;
const DEFAULT_ROOM_NAME = "보스 대기실";

const ZONES = ["entry-field", "plaza", "campus-outdoor-v1", "campus-ecc-interior-v1", "campus-student-center-interior-v1", "campus-greenhouse-interior-v1", "battle:data-sphinx", "battle:stat-boss", "battle:control-boss"] as const;
const DIRECTIONS = ["up", "down", "left", "right"] as const;
const BATTLE_IDS = ["data-sphinx", "stat-boss", "control-boss"] as const;
const RANKED_BATTLE_IDS = ["stat-boss", "control-boss"] as const;
import { createPostgameReward } from "./progression";

type Zone = (typeof ZONES)[number];
type Direction = (typeof DIRECTIONS)[number];
type BattleId = (typeof BATTLE_IDS)[number];
type BattleStatus = "running" | "finished";

interface BattleRule {
  bossMaxHp: number;
  hitDamage: number;
  hitCooldownMs: number;
}

const BATTLE_RULES = {
  "data-sphinx": { bossMaxHp: 100, hitDamage: 10, hitCooldownMs: 500 },
  "stat-boss": { bossMaxHp: 1_000, hitDamage: 10, hitCooldownMs: 1_000 },
  "control-boss": { bossMaxHp: 1_000, hitDamage: 10, hitCooldownMs: 1_000 },
} as const satisfies Record<BattleId, BattleRule>;

const BATTLE_HIT_KINDS = {
  "data-sphinx": ["correct-answer"],
  "stat-boss": ["counter-hit"],
  "control-boss": ["control-attack", "control-gimmick"],
} as const satisfies Record<BattleId, readonly string[]>;

const MAX_ACTION_ID_LENGTH = 64;
const MAX_HIT_KIND_LENGTH = 32;
const MAX_RECENT_ACTION_IDS = 32;
const MAX_BATTLE_SEED_LENGTH = 128;
const MAX_PLAYER_HP = Number.MAX_SAFE_INTEGER;
const MAX_STAT_BOSS_DAMAGE = Number.MAX_SAFE_INTEGER;
const MAX_CONTROL_BOSS_DAMAGE = Number.MAX_SAFE_INTEGER;
const CONTROL_GIMMICK_COOLDOWN_MS = 10_000;
const COMBAT_VALUE_SCALE = 1_000_000;
const ABANDONED_BATTLE_GRACE_MS = 15 * 60 * 1_000;
const FINISHED_BATTLE_RETENTION_MS = 5 * 60 * 1_000;
const BOSS_PERSISTENCE_RETRY_MS = 30 * 1_000;

interface SocketAttachment {
  version: 1;
  /** Server-injected account id. It is never included in a public payload. */
  userId?: string;
  playerKey: string;
  playerId: string;
  name: string;
  zone: Zone;
  hairColor?: string;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  roomId: string | null;
  rateWindowStartedAt: number;
  rateCount: number;
  lastPresenceAt: number;
  combatMaxHp?: number;
  statBossAttackDamage?: number;
  controlBossAttackDamage?: number;
  disconnected?: boolean;
}

interface RoomRecord {
  version: 1;
  roomId: string;
  roomName: string;
  battleId: BattleId;
  capacity: number;
  hostPlayerId: string;
  memberPlayerIds: string[];
  createdAt: number;
  status: "waiting" | "started";
}

interface BattleMemberRecord {
  /** Null only for a battle restored from the pre-ranking schema. */
  userId: string | null;
  playerKey: string;
  publicId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  left: boolean;
  hp: number | null;
  maxHp: number | null;
  lastHitAt: number;
  lastGimmickAt: number;
  recentActionIds: string[];
  statBossAttackDamage: number;
  controlBossAttackDamage: number;
}

interface BattleRecord {
  version: 1;
  roomId: string;
  battleId: BattleId;
  seed: string;
  status: BattleStatus;
  bossHp: number;
  bossMaxHp: number;
  hitDamage: number;
  hitCooldownMs: number;
  revision: number;
  startedAt: number;
  /** First moment at which every connected member was ready. */
  combatStartedAt: number | null;
  finishedAt: number | null;
  lastActivityAt: number;
  allDisconnectedAt: number | null;
  /** Frozen authenticated roster at the exact server-authoritative victory. */
  rewardUserIds?: string[];
  rewardRecorded?: boolean;
  rankingRecorded?: boolean;
  members: BattleMemberRecord[];
}

interface PostgameEnv {
  DB?: D1Database;
}

interface AwardedPostgameResultRow {
  user_id: string;
}

interface PublicPlayer {
  id: string;
  name: string;
  hairColor: string;
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
  roomName: string;
  battleId: BattleId;
  capacity: number;
  memberCount: number;
  hostId: string;
  members: PublicRoomPlayer[];
  status: "waiting" | "started";
}

interface PublicBattlePlayer {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  hp: number | null;
  maxHp: number | null;
  alive: boolean;
  hairColor: string;
  presence: { x: number; y: number; direction: Direction; moving: boolean } | null;
}

interface PublicBattle {
  roomId: string;
  battleId: BattleId;
  seed: string;
  status: BattleStatus;
  bossHp: number;
  bossMaxHp: number;
  revision: number;
  allReady: boolean;
  roster: PublicBattlePlayer[];
  result?:
    | { outcome: "victory"; reason: "boss-defeated" }
    | { outcome: "defeat"; reason: "party-defeated" };
  startedAt: number;
  finishedAt?: number;
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
  | { type: "room.create"; battleId: BattleId; capacity: number; roomName: string }
  | { type: "room.join"; roomId: string }
  | { type: "room.leave" }
  | { type: "room.start" }
  | { type: "battle.ready"; roomId: string }
  | { type: "battle.health"; roomId: string; hp: number; maxHp: number }
  | { type: "battle.hit"; roomId: string; kind: string; actionId: string }
  | { type: "battle.leave"; roomId: string };

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

function isRoomId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);
}

function isProtocolIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function isInternalUserId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128;
}

function normalizeRoomName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isValidRoomName(value: string): boolean {
  const length = Array.from(value).length;
  return length >= 1 && length <= MAX_ROOM_NAME_LENGTH;
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
        !hasExactKeys(parsed, ["type", "battleId", "capacity", "roomName"]) ||
        !isOneOf(parsed.battleId, BATTLE_IDS) ||
        typeof parsed.capacity !== "number" ||
        !Number.isInteger(parsed.capacity) ||
        parsed.capacity < 1 ||
        parsed.capacity > 5 ||
        typeof parsed.roomName !== "string"
      ) {
        throw new ProtocolError("invalid_room", "보스방은 1명부터 5명까지 만들 수 있습니다.");
      }
      {
        const roomName = normalizeRoomName(parsed.roomName);
        if (!isValidRoomName(roomName)) {
          throw new ProtocolError("invalid_room_name", "방 이름은 1자부터 32자까지 입력해 주세요.");
        }
        return { type: parsed.type, battleId: parsed.battleId, capacity: parsed.capacity, roomName };
      }

    case "room.join":
      if (
        !hasExactKeys(parsed, ["type", "roomId"]) ||
        !isRoomId(parsed.roomId)
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

    case "battle.ready":
    case "battle.leave":
      if (!hasExactKeys(parsed, ["type", "roomId"]) || !isRoomId(parsed.roomId)) {
        throw new ProtocolError("invalid_battle", "전투 정보가 올바르지 않습니다.");
      }
      return { type: parsed.type, roomId: parsed.roomId };

    case "battle.health":
      if (
        !hasExactKeys(parsed, ["type", "roomId", "hp", "maxHp"]) ||
        !isRoomId(parsed.roomId) ||
        typeof parsed.hp !== "number" ||
        !Number.isFinite(parsed.hp) ||
        parsed.hp < 0 ||
        typeof parsed.maxHp !== "number" ||
        !Number.isInteger(parsed.maxHp) ||
        parsed.maxHp < 1 ||
        parsed.maxHp > MAX_PLAYER_HP ||
        parsed.hp > parsed.maxHp
      ) {
        throw new ProtocolError("invalid_battle_health", "플레이어 체력 정보가 올바르지 않습니다.");
      }
      return {
        type: parsed.type,
        roomId: parsed.roomId,
        hp: roundCombatValue(parsed.hp),
        maxHp: parsed.maxHp,
      };

    case "battle.hit":
      if (
        !hasExactKeys(parsed, ["type", "roomId", "kind", "actionId"]) ||
        !isRoomId(parsed.roomId) ||
        !isProtocolIdentifier(parsed.kind, MAX_HIT_KIND_LENGTH) ||
        !isProtocolIdentifier(parsed.actionId, MAX_ACTION_ID_LENGTH)
      ) {
        throw new ProtocolError("invalid_battle_hit", "공격 정보가 올바르지 않습니다.");
      }
      return {
        type: parsed.type,
        roomId: parsed.roomId,
        kind: parsed.kind,
        actionId: parsed.actionId,
      };

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
    (value.userId === undefined || isInternalUserId(value.userId)) &&
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
    typeof value.lastPresenceAt === "number" &&
    (
      value.combatMaxHp === undefined
      || (typeof value.combatMaxHp === "number"
        && Number.isSafeInteger(value.combatMaxHp)
        && value.combatMaxHp >= 1
        && value.combatMaxHp <= MAX_PLAYER_HP)
    ) && (
      value.statBossAttackDamage === undefined
      || (typeof value.statBossAttackDamage === "number"
        && Number.isFinite(value.statBossAttackDamage)
        && value.statBossAttackDamage > 0
        && value.statBossAttackDamage <= MAX_STAT_BOSS_DAMAGE)
    ) && (
      value.controlBossAttackDamage === undefined
      || (typeof value.controlBossAttackDamage === "number"
        && Number.isFinite(value.controlBossAttackDamage)
        && value.controlBossAttackDamage > 0
        && value.controlBossAttackDamage <= MAX_CONTROL_BOSS_DAMAGE)
    )
  );
}

function roundCombatValue(value: number): number {
  if (Math.abs(value) >= Number.MAX_SAFE_INTEGER / COMBAT_VALUE_SCALE) return value;
  return Math.round((value + Number.EPSILON) * COMBAT_VALUE_SCALE) / COMBAT_VALUE_SCALE;
}

function initialBattlePlayerMaxHp(battleId: BattleId, attachment: SocketAttachment): number {
  if (battleId === "data-sphinx") return 100;
  const combatMaxHp = Number(attachment.combatMaxHp);
  return Number.isSafeInteger(combatMaxHp) && combatMaxHp >= 1
    ? Math.min(MAX_PLAYER_HP, combatMaxHp)
    : 100;
}

function initialStatBossAttackDamage(attachment: SocketAttachment): number {
  const damage = Number(attachment.statBossAttackDamage);
  return Number.isFinite(damage) && damage > 0
    ? Math.min(MAX_STAT_BOSS_DAMAGE, roundCombatValue(damage))
    : BATTLE_RULES["stat-boss"].hitDamage;
}

function initialControlBossAttackDamage(attachment: SocketAttachment): number {
  const damage = Number(attachment.controlBossAttackDamage);
  return Number.isFinite(damage) && damage > 0
    ? Math.min(MAX_CONTROL_BOSS_DAMAGE, roundCombatValue(damage))
    : BATTLE_RULES["control-boss"].hitDamage;
}

function isAllowedBattleHitKind(battleId: BattleId, kind: string): boolean {
  return (BATTLE_HIT_KINDS[battleId] as readonly string[]).includes(kind);
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
  const storedRoomName = typeof value.roomName === "string" ? normalizeRoomName(value.roomName) : "";
  return {
    version: 1,
    roomId: value.roomId,
    roomName: isValidRoomName(storedRoomName) ? storedRoomName : DEFAULT_ROOM_NAME,
    battleId: value.battleId,
    capacity: value.capacity,
    hostPlayerId: memberPlayerIds.includes(value.hostPlayerId) ? value.hostPlayerId : memberPlayerIds[0],
    memberPlayerIds,
    createdAt: value.createdAt,
    status: value.status === "started" ? "started" : "waiting",
  };
}

function sanitizeBattleMember(value: unknown): BattleMemberRecord | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.playerKey !== "string" ||
    value.playerKey.length < 1 ||
    value.playerKey.length > 256 ||
    typeof value.publicId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.ready !== "boolean" ||
    typeof value.connected !== "boolean" ||
    typeof value.left !== "boolean" ||
    typeof value.lastHitAt !== "number" ||
    !Number.isFinite(value.lastHitAt) ||
    !Array.isArray(value.recentActionIds) ||
    !value.recentActionIds.every((actionId) => isProtocolIdentifier(actionId, MAX_ACTION_ID_LENGTH))
  ) {
    return null;
  }
  return {
    userId: isInternalUserId(value.userId) ? value.userId : null,
    playerKey: value.playerKey,
    publicId: value.publicId,
    name: normalizeName(value.name),
    ready: value.ready,
    connected: value.connected,
    left: value.left,
    hp: typeof value.hp === "number" && Number.isFinite(value.hp) && value.hp >= 0
      && typeof value.maxHp === "number" && Number.isSafeInteger(value.maxHp)
      && value.maxHp >= 1 && value.maxHp <= MAX_PLAYER_HP && value.hp <= value.maxHp
      ? roundCombatValue(value.hp)
      : null,
    maxHp: typeof value.hp === "number" && Number.isFinite(value.hp) && value.hp >= 0
      && typeof value.maxHp === "number" && Number.isSafeInteger(value.maxHp)
      && value.maxHp >= 1 && value.maxHp <= MAX_PLAYER_HP && value.hp <= value.maxHp
      ? value.maxHp
      : null,
    lastHitAt: Math.max(0, value.lastHitAt),
    lastGimmickAt:
      typeof value.lastGimmickAt === "number" && Number.isFinite(value.lastGimmickAt)
        ? Math.max(0, value.lastGimmickAt)
        : 0,
    recentActionIds: [...new Set(value.recentActionIds)].slice(-MAX_RECENT_ACTION_IDS),
    statBossAttackDamage:
      typeof value.statBossAttackDamage === "number"
      && Number.isFinite(value.statBossAttackDamage)
      && value.statBossAttackDamage > 0
        ? Math.min(MAX_STAT_BOSS_DAMAGE, roundCombatValue(value.statBossAttackDamage))
        : BATTLE_RULES["stat-boss"].hitDamage,
    controlBossAttackDamage:
      typeof value.controlBossAttackDamage === "number"
      && Number.isFinite(value.controlBossAttackDamage)
      && value.controlBossAttackDamage > 0
        ? Math.min(MAX_CONTROL_BOSS_DAMAGE, roundCombatValue(value.controlBossAttackDamage))
        : BATTLE_RULES["control-boss"].hitDamage,
  };
}

function sanitizeBattle(value: unknown): BattleRecord | null {
  if (!isRecord(value) || value.version !== 1 || !isRoomId(value.roomId) || !isOneOf(value.battleId, BATTLE_IDS)) {
    return null;
  }
  if (
    (value.status !== "running" && value.status !== "finished") ||
    typeof value.bossHp !== "number" ||
    !Number.isFinite(value.bossHp) ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    (value.finishedAt !== null && (typeof value.finishedAt !== "number" || !Number.isFinite(value.finishedAt))) ||
    !Array.isArray(value.members)
  ) {
    return null;
  }
  const members = value.members.flatMap((member): BattleMemberRecord[] => {
    const sanitized = sanitizeBattleMember(member);
    return sanitized ? [sanitized] : [];
  });
  const uniqueMembers = members.filter(
    (member, index) =>
      members.findIndex((candidate) => candidate.playerKey === member.playerKey) === index &&
      members.findIndex((candidate) => candidate.publicId === member.publicId) === index,
  ).slice(0, 5);
  if (uniqueMembers.length === 0) return null;

  const rule = BATTLE_RULES[value.battleId];
  const bossHp = Math.max(0, Math.min(rule.bossMaxHp, roundCombatValue(value.bossHp)));
  const status: BattleStatus = bossHp === 0 || value.status === "finished" ? "finished" : "running";
  const finishedAt = status === "finished" ? value.finishedAt ?? value.startedAt : null;
  const combatStartedAt =
    typeof value.combatStartedAt === "number"
    && Number.isFinite(value.combatStartedAt)
    && value.combatStartedAt >= value.startedAt
      ? value.combatStartedAt
      : null;
  const lastActivityAt =
    typeof value.lastActivityAt === "number" && Number.isFinite(value.lastActivityAt)
      ? Math.max(value.startedAt, value.lastActivityAt)
      : finishedAt ?? value.startedAt;
  const allDisconnectedAt =
    typeof value.allDisconnectedAt === "number" && Number.isFinite(value.allDisconnectedAt)
      ? Math.max(value.startedAt, value.allDisconnectedAt)
      : null;
  const seed = isProtocolIdentifier(value.seed, MAX_BATTLE_SEED_LENGTH)
    ? value.seed
    : `legacy:${value.roomId}:${Math.floor(value.startedAt)}`;
  const rewardUserIds = Array.isArray(value.rewardUserIds)
    ? [...new Set(value.rewardUserIds.filter(isInternalUserId))].slice(0, 5)
    : null;
  return {
    version: 1,
    roomId: value.roomId,
    battleId: value.battleId,
    seed,
    status,
    bossHp,
    bossMaxHp: rule.bossMaxHp,
    hitDamage: rule.hitDamage,
    hitCooldownMs: rule.hitCooldownMs,
    revision: value.revision,
    startedAt: value.startedAt,
    combatStartedAt,
    finishedAt,
    lastActivityAt,
    allDisconnectedAt: status === "running" ? allDisconnectedAt : null,
    ...(rewardUserIds ? { rewardUserIds } : {}),
    rewardRecorded: value.rewardRecorded === true,
    rankingRecorded: value.rankingRecorded === true,
    members: uniqueMembers,
  };
}

/**
 * Coordinates the shared postgame world and boss lobbies. The outer Worker must
 * authenticate the request before forwarding it and must replace (not forward)
 * all x-ai-player-* headers.
 */
export class PostgameCoordinator {
  private rooms = new Map<string, RoomRecord>();
  private battles = new Map<string, BattleRecord>();
  private scheduledCleanupAt: number | null = null;
  private readonly ready: Promise<void>;
  private roomMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: PostgameEnv = {},
  ) {
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const [storedRooms, storedBattles, storedAlarm] = await Promise.all([
        this.ctx.storage.get<unknown>(ROOM_STORAGE_KEY),
        this.ctx.storage.get<unknown>(BATTLE_STORAGE_KEY),
        this.ctx.storage.getAlarm(),
      ]);
      this.scheduledCleanupAt = storedAlarm;
      if (Array.isArray(storedRooms)) {
        for (const value of storedRooms) {
          const room = sanitizeRoom(value);
          if (room) this.rooms.set(room.roomId, room);
        }
      }
      if (Array.isArray(storedBattles)) {
        for (const value of storedBattles) {
          const battle = sanitizeBattle(value);
          if (battle) this.battles.set(battle.roomId, battle);
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
    const userId = request.headers.get("x-ai-player-user-id")?.trim() ?? "";
    const encodedName = request.headers.get("x-ai-player-name") ?? "";
    const combatMaxHp = Number(request.headers.get("x-ai-player-combat-max-hp"));
    const statBossAttackDamage = Number(request.headers.get("x-ai-player-stat-boss-damage"));
    const controlBossAttackDamage = Number(request.headers.get("x-ai-player-control-boss-damage"));
    if (
      !playerKey
      || !isInternalUserId(userId)
      || playerKey.length > 256
      || encodedName.length > 1_024
      || !Number.isSafeInteger(combatMaxHp)
      || combatMaxHp < 1
      || combatMaxHp > MAX_PLAYER_HP
      || !Number.isFinite(statBossAttackDamage)
      || statBossAttackDamage <= 0
      || statBossAttackDamage > MAX_STAT_BOSS_DAMAGE
      || !Number.isFinite(controlBossAttackDamage)
      || controlBossAttackDamage <= 0
      || controlBossAttackDamage > MAX_CONTROL_BOSS_DAMAGE
    ) {
      return Response.json({ error: "Authenticated player headers required" }, { status: 401 });
    }
    let rawName: string;
    try {
      rawName = decodeURIComponent(encodedName);
    } catch {
      return Response.json({ error: "Invalid player name" }, { status: 400 });
    }

    await this.enqueueRoomMutation(() => this.cleanupExpiredBattles(Date.now()));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment: SocketAttachment = {
      version: 1,
      userId,
      playerKey,
      playerId: crypto.randomUUID(),
      name: normalizeName(rawName),
      hairColor: ["magenta", "purple", "brown", "blonde"].includes(request.headers.get("x-ai-player-hair-color") ?? "")
        ? request.headers.get("x-ai-player-hair-color")! : "purple",
      zone: "entry-field",
      x: 0.5,
      y: 0.5,
      direction: "down",
      moving: false,
      roomId: null,
      rateWindowStartedAt: now,
      rateCount: 0,
      lastPresenceAt: 0,
      combatMaxHp,
      statBossAttackDamage: roundCombatValue(statBossAttackDamage),
      controlBossAttackDamage: roundCombatValue(controlBossAttackDamage),
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`zone:${attachment.zone}`]);

    const resumedBattle = await this.enqueueRoomMutation(() =>
      this.resumeBattleConnection(server, attachment),
    );

    this.send(server, {
      type: "ready",
      self: { id: attachment.playerId, name: attachment.name },
      serverTime: now,
    });
    this.sendPresenceSnapshot(server, attachment);
    await this.roomMutationQueue;
    this.send(server, { type: "rooms.snapshot", rooms: this.publicRooms() });
    if (resumedBattle) {
      this.sendBattleEvent(server, "battle.snapshot", resumedBattle);
      this.broadcastBattleEvent(resumedBattle, "battle.updated");
    }
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

    let requestType: ClientMessage["type"] | null = null;
    let requestRoomId: string | null = null;
    try {
      const parsed = parseClientMessage(message);
      requestType = parsed.type;
      requestRoomId = "roomId" in parsed ? parsed.roomId : null;
      if (parsed.type !== "presence.update") {
        await this.enqueueRoomMutation(() => this.cleanupExpiredBattles(Date.now()));
      }
      switch (parsed.type) {
        case "presence.update":
          this.updatePresence(socket, attachment, parsed);
          return;
        case "room.create":
          await this.enqueueRoomMutation(() =>
            this.createRoom(socket, attachment, parsed.battleId, parsed.capacity, parsed.roomName),
          );
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
        case "battle.ready":
          await this.enqueueRoomMutation(() => this.readyBattle(socket, attachment, parsed.roomId));
          return;
        case "battle.health":
          await this.enqueueRoomMutation(() =>
            this.updateBattleHealth(socket, attachment, parsed.roomId, parsed.hp, parsed.maxHp),
          );
          return;
        case "battle.hit":
          await this.enqueueRoomMutation(() =>
            this.hitBattle(socket, attachment, parsed.roomId, parsed.kind, parsed.actionId),
          );
          return;
        case "battle.leave":
          await this.enqueueRoomMutation(() => this.leaveBattle(socket, attachment, parsed.roomId, true));
          return;
      }
    } catch (error) {
      if (error instanceof ProtocolError) {
        this.sendError(socket, error.code, error.message, { requestType, roomId: requestRoomId });
        return;
      }
      console.error("postgame websocket message failed", error);
      this.sendError(socket, "server_error", "서버에서 요청을 처리하지 못했습니다.", {
        requestType,
        roomId: requestRoomId,
      });
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
    const previousZone = attachment.zone;
    if (update.zone.startsWith("battle:")) {
      const battle = attachment.roomId ? this.battles.get(attachment.roomId) : null;
      if (!battle || update.zone !== `battle:${battle.battleId}`) {
        throw new ProtocolError("invalid_presence", "참가 중인 전투의 위치만 보낼 수 있습니다.");
      }
    }
    const movementChanged = attachment.moving !== update.moving;
    const shouldBroadcast = previousZone !== update.zone
      || movementChanged
      || !attachment.lastPresenceAt
      || now - attachment.lastPresenceAt >= MIN_PRESENCE_INTERVAL_MS;
    // Network jitter can bunch otherwise well-spaced packets. Keep the newest
    // position for snapshots, but throttle redundant broadcasts without errors.
    // Always publish zone/movement transitions so the last stop cannot be lost.
    // The connection-wide message budget still rejects sustained flooding.
    attachment.zone = update.zone;
    attachment.x = update.x;
    attachment.y = update.y;
    attachment.direction = update.direction;
    attachment.moving = update.moving;
    if (shouldBroadcast) attachment.lastPresenceAt = now;
    socket.serializeAttachment(attachment);
    if (!shouldBroadcast) return;

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
    roomName: string,
  ): Promise<void> {
    this.assertCanJoinRoom(attachment);
    let roomId = this.generateRoomId();
    while (this.rooms.has(roomId)) roomId = this.generateRoomId();

    const room: RoomRecord = {
      version: 1,
      roomId,
      roomName,
      battleId,
      capacity,
      hostPlayerId: attachment.playerId,
      memberPlayerIds: [attachment.playerId],
      createdAt: Date.now(),
      status: "waiting",
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
    if (room.status !== "waiting") throw new ProtocolError("room_started", "이미 시작한 전투입니다.");
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
    if (room.status === "started") {
      if (notifyLeaver) {
        throw new ProtocolError("battle_in_progress", "진행 중인 전투에서는 전투 나가기를 사용해 주세요.");
      }
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
    if (room.status !== "waiting" || this.battles.has(room.roomId)) {
      throw new ProtocolError("room_started", "이미 시작한 전투입니다.");
    }
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

    const startedAt = Date.now();
    const seed = crypto.randomUUID();
    const rule = BATTLE_RULES[room.battleId];
    const battle: BattleRecord = {
      version: 1,
      roomId,
      battleId: room.battleId,
      seed,
      status: "running",
      bossHp: rule.bossMaxHp,
      bossMaxHp: rule.bossMaxHp,
      hitDamage: rule.hitDamage,
      hitCooldownMs: rule.hitCooldownMs,
      revision: 1,
      startedAt,
      combatStartedAt: null,
      finishedAt: null,
      lastActivityAt: startedAt,
      allDisconnectedAt: null,
      members: participants.map(({ attachment: member }) => {
        const maxHp = initialBattlePlayerMaxHp(room.battleId, member);
        return {
          userId: member.userId ?? null,
          playerKey: member.playerKey,
          publicId: member.playerId,
          name: member.name,
          ready: false,
          connected: true,
          left: false,
          hp: maxHp,
          maxHp,
          statBossAttackDamage: initialStatBossAttackDamage(member),
          controlBossAttackDamage: initialControlBossAttackDamage(member),
          lastHitAt: 0,
          lastGimmickAt: 0,
          recentActionIds: [],
        };
      }),
    };
    room.status = "started";
    room.memberPlayerIds = battle.members.map((member) => member.publicId);
    this.battles.set(roomId, battle);
    try {
      await this.persistState();
    } catch (error) {
      room.status = "waiting";
      this.battles.delete(roomId);
      throw error;
    }

    const roster = this.publicBattle(battle).roster.map((member) => ({ id: member.id, name: member.name }));
    const startedRoom = this.publicRoom(room);
    for (const participant of participants) {
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
      this.sendBattleEvent(participant.socket, "battle.snapshot", battle);
    }
    this.broadcast({ type: "room.updated", room: startedRoom });
  }

  private battleMembership(
    attachment: SocketAttachment,
    roomId: string,
  ): { battle: BattleRecord; member: BattleMemberRecord } {
    if (attachment.roomId !== roomId) {
      throw new ProtocolError("not_in_battle", "참가 중인 전투가 아닙니다.");
    }
    const battle = this.battles.get(roomId);
    if (!battle) throw new ProtocolError("battle_not_found", "존재하지 않는 전투입니다.");
    const member = battle.members.find(
      (candidate) => candidate.playerKey === attachment.playerKey && !candidate.left,
    );
    if (!member) throw new ProtocolError("not_battle_member", "이 전투의 참가자가 아닙니다.");
    return { battle, member };
  }

  private async readyBattle(socket: WebSocket, attachment: SocketAttachment, roomId: string): Promise<void> {
    const { battle, member } = this.battleMembership(attachment, roomId);
    if (battle.status === "finished") {
      this.sendBattleEvent(socket, "battle.snapshot", battle);
      return;
    }
    if (member.hp === 0) {
      this.sendBattleEvent(socket, "battle.snapshot", battle);
      return;
    }

    let changed = false;
    if (!member.ready || !member.connected || member.name !== attachment.name) {
      member.ready = true;
      member.connected = true;
      member.name = attachment.name;
      battle.revision += 1;
      this.touchBattle(battle);
      changed = true;
    }
    if (battle.combatStartedAt === null && this.battleAllReady(battle)) {
      battle.combatStartedAt = Date.now();
      battle.revision += 1;
      changed = true;
    }
    if (changed) await this.persistBattles();
    this.sendBattleEvent(socket, "battle.snapshot", battle);
    this.broadcastBattleEvent(battle, "battle.updated");
  }

  private async updateBattleHealth(
    socket: WebSocket,
    attachment: SocketAttachment,
    roomId: string,
    hp: number,
    maxHp: number,
  ): Promise<void> {
    const { battle, member } = this.battleMembership(attachment, roomId);
    if (battle.status !== "running") {
      this.sendBattleEvent(socket, "battle.snapshot", battle);
      return;
    }
    if (!member.ready || !member.connected) {
      throw new ProtocolError("battle_not_ready", "전투 준비가 완료되지 않았습니다.");
    }
    if (member.hp === 0 && hp > 0) {
      throw new ProtocolError("battle_member_defeated", "전투 중에는 쓰러진 파티원이 부활할 수 없습니다.");
    }
    if (member.maxHp !== null && member.maxHp !== maxHp) {
      throw new ProtocolError("battle_health_mismatch", "전투 중 최대 체력은 변경할 수 없습니다.");
    }
    const nextHp = member.hp === null ? hp : Math.min(member.hp, hp);
    const nextMaxHp = member.maxHp ?? maxHp;
    if (member.hp === nextHp && member.maxHp === nextMaxHp) {
      this.sendBattleEvent(socket, "battle.snapshot", battle);
      return;
    }

    member.hp = nextHp;
    member.maxHp = nextMaxHp;
    if (nextHp === 0) member.ready = false;
    battle.revision += 1;
    const now = Date.now();
    this.touchBattle(battle, now);
    const activeMembers = battle.members.filter((candidate) => !candidate.left);
    if (
      activeMembers.length > 0
      && activeMembers.every((candidate) => candidate.hp === 0)
    ) {
      battle.status = "finished";
      battle.finishedAt = now;
      battle.allDisconnectedAt = null;
    }
    await this.persistBattles();
    this.broadcastBattleEvent(battle, "battle.updated");
    if (battle.status === "finished") this.broadcastBattleEvent(battle, "battle.finished");
  }

  private async hitBattle(
    socket: WebSocket,
    attachment: SocketAttachment,
    roomId: string,
    kind: string,
    actionId: string,
  ): Promise<void> {
    const { battle, member } = this.battleMembership(attachment, roomId);
    if (battle.status !== "running") {
      throw new ProtocolError("battle_finished", "이미 종료된 전투입니다.");
    }
    if (member.hp === 0) {
      throw new ProtocolError("battle_member_defeated", "전투 불능 상태에서는 공격할 수 없습니다.");
    }
    if (!member.ready || !member.connected) {
      throw new ProtocolError("battle_not_ready", "전투 준비가 완료되지 않았습니다.");
    }
    if (!this.battleAllReady(battle)) {
      throw new ProtocolError("battle_party_not_ready", "모든 파티원이 전투 준비를 마칠 때까지 기다려 주세요.");
    }
    if (!isAllowedBattleHitKind(battle.battleId, kind)) {
      throw new ProtocolError("invalid_hit_kind", "이 보스에게 사용할 수 없는 공격입니다.");
    }
    if (member.recentActionIds.includes(actionId)) {
      this.sendBattleEvent(socket, "battle.snapshot", battle);
      return;
    }

    const now = Date.now();
    const isControlGimmick = battle.battleId === "control-boss" && kind === "control-gimmick";
    const previousHitAt = isControlGimmick ? member.lastGimmickAt : member.lastHitAt;
    const cooldownMs = isControlGimmick ? CONTROL_GIMMICK_COOLDOWN_MS : battle.hitCooldownMs;
    if (previousHitAt > 0 && now - previousHitAt < cooldownMs) {
      throw new ProtocolError("hit_cooldown", "공격 재사용 대기 중입니다.");
    }

    if (isControlGimmick) member.lastGimmickAt = now;
    else member.lastHitAt = now;
    member.recentActionIds.push(actionId);
    member.recentActionIds = member.recentActionIds.slice(-MAX_RECENT_ACTION_IDS);
    const hitDamage = battle.battleId === "stat-boss"
      ? member.statBossAttackDamage
      : battle.battleId === "control-boss"
        ? isControlGimmick
          ? battle.bossMaxHp * 0.2
          : member.controlBossAttackDamage
        : battle.hitDamage;
    battle.bossHp = Math.max(0, roundCombatValue(battle.bossHp - hitDamage));
    battle.revision += 1;
    battle.lastActivityAt = now;
    battle.allDisconnectedAt = null;
    if (battle.bossHp === 0) {
      battle.status = "finished";
      battle.finishedAt = now;
      battle.rewardUserIds = battle.members
        .filter((candidate): candidate is BattleMemberRecord & { userId: string } => (
          !candidate.left && isInternalUserId(candidate.userId)
        ))
        .map((candidate) => candidate.userId);
    }
    await this.persistBattles();

    if (battle.status === "finished" && battle.bossHp === 0) {
      try {
        if (await this.persistBossVictory(battle)) await this.persistBattles();
      } catch (error) {
        // Completion remains authoritative if D1 is temporarily unavailable.
        // Restored-state reconciliation retries this idempotent write.
        console.error("boss ranking persistence failed", error);
      }
    }

    this.broadcastBattleEvent(battle, "battle.updated");
    if (battle.status === "finished") this.broadcastBattleEvent(battle, "battle.finished");
  }

  private async leaveBattle(
    socket: WebSocket,
    attachment: SocketAttachment,
    roomId: string,
    notifyLeaver: boolean,
  ): Promise<void> {
    const { battle, member } = this.battleMembership(attachment, roomId);
    const room = this.rooms.get(roomId);
    const previousMember = {
      left: member.left,
      ready: member.ready,
      connected: member.connected,
    };
    const previousBattle = {
      revision: battle.revision,
      lastActivityAt: battle.lastActivityAt,
      allDisconnectedAt: battle.allDisconnectedAt,
    };
    const previousAttachmentRoomId = attachment.roomId;
    const previousRoom = room
      ? { memberPlayerIds: [...room.memberPlayerIds], hostPlayerId: room.hostPlayerId }
      : null;

    member.left = true;
    member.ready = false;
    member.connected = false;
    battle.revision += 1;
    this.touchBattle(battle);

    attachment.roomId = null;
    if (room) {
      room.memberPlayerIds = battle.members.filter((candidate) => !candidate.left).map((candidate) => candidate.publicId);
      if (room.hostPlayerId === member.publicId && room.memberPlayerIds.length > 0) {
        room.hostPlayerId = room.memberPlayerIds[0];
      }
    }

    const removedBattle = battle.members.every((candidate) => candidate.left);
    if (removedBattle) {
      this.battles.delete(roomId);
      this.rooms.delete(roomId);
    }

    try {
      socket.serializeAttachment(attachment);
      await this.persistState();
    } catch (error) {
      member.left = previousMember.left;
      member.ready = previousMember.ready;
      member.connected = previousMember.connected;
      battle.revision = previousBattle.revision;
      battle.lastActivityAt = previousBattle.lastActivityAt;
      battle.allDisconnectedAt = previousBattle.allDisconnectedAt;
      attachment.roomId = previousAttachmentRoomId;
      this.battles.set(roomId, battle);
      if (room) {
        room.memberPlayerIds = previousRoom?.memberPlayerIds ?? [];
        room.hostPlayerId = previousRoom?.hostPlayerId ?? room.hostPlayerId;
        this.rooms.set(roomId, room);
      }
      try {
        socket.serializeAttachment(attachment);
      } catch {
        // The socket may have closed while the durable state was rolling back.
      }
      if (!notifyLeaver) console.error("postgame battle leave rollback", error);
      throw error;
    }

    if (notifyLeaver) this.send(socket, { type: "battle.left", roomId });
    if (removedBattle) {
      this.broadcast({ type: "room.removed", roomId });
      return;
    }

    this.broadcastBattleEvent(battle, "battle.updated");
    if (room) this.broadcast({ type: "room.updated", room: this.publicRoom(room) });
  }

  private async resumeBattleConnection(
    socket: WebSocket,
    attachment: SocketAttachment,
  ): Promise<BattleRecord | null> {
    const battle = [...this.battles.values()]
      .sort((left, right) => right.startedAt - left.startedAt)
      .find((candidate) =>
        candidate.members.some((member) => member.playerKey === attachment.playerKey && !member.left),
      );
    if (!battle) return null;

    const supersededConnections = this.activeSockets().filter(
      ({ attachment: other }) =>
        other.playerId !== attachment.playerId &&
        other.playerKey === attachment.playerKey &&
        other.roomId === battle.roomId,
    );
    for (const superseded of supersededConnections) {
      superseded.attachment.disconnected = true;
      try {
        superseded.socket.serializeAttachment(superseded.attachment);
      } catch {
        // The old peer may already be gone; the new authenticated connection
        // still becomes the sole authoritative socket for this account.
      }
      this.broadcastToZone(
        superseded.attachment.zone,
        {
          type: "presence.leave",
          playerId: superseded.attachment.playerId,
          zone: superseded.attachment.zone,
        },
        superseded.attachment.playerKey,
      );
      try {
        superseded.socket.close(4001, "Battle resumed in another connection");
      } catch {
        // Closing an already-closed socket is harmless.
      }
    }

    const member = battle.members.find(
      (candidate) => candidate.playerKey === attachment.playerKey && !candidate.left,
    );
    if (!member) return null;

    attachment.roomId = battle.roomId;
    socket.serializeAttachment(attachment);
    if (
      member.connected ||
      member.ready ||
      member.userId !== (attachment.userId ?? null) ||
      member.name !== attachment.name ||
      member.publicId !== attachment.playerId
    ) {
      const previousPublicId = member.publicId;
      member.connected = false;
      member.ready = false;
      member.userId = attachment.userId ?? null;
      member.name = attachment.name;
      member.publicId = attachment.playerId;
      const room = this.rooms.get(battle.roomId);
      if (room) {
        room.memberPlayerIds = room.memberPlayerIds.map((playerId) =>
          playerId === previousPublicId ? attachment.playerId : playerId,
        );
        if (room.hostPlayerId === previousPublicId) room.hostPlayerId = attachment.playerId;
      }
      battle.revision += 1;
      this.touchBattle(battle);
      await this.persistState();
    }
    return battle;
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
      hairColor: attachment.hairColor ?? "purple",
      x: attachment.x,
      y: attachment.y,
      direction: attachment.direction,
      moving: attachment.moving,
    };
  }

  private publicRoom(room: RoomRecord): PublicRoom {
    const battle = room.status === "started" ? this.battles.get(room.roomId) : null;
    const members = battle
      ? this.publicBattle(battle).roster.map((member) => ({ id: member.id, name: member.name }))
      : room.memberPlayerIds.flatMap((playerId): PublicRoomPlayer[] => {
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
      roomName: room.roomName,
      battleId: room.battleId,
      capacity: room.capacity,
      memberCount: members.length,
      hostId: room.hostPlayerId,
      members,
      status: room.status,
    };
  }

  private publicBattle(battle: BattleRecord): PublicBattle {
    const publicBattle: PublicBattle = {
      roomId: battle.roomId,
      battleId: battle.battleId,
      seed: battle.seed,
      status: battle.status,
      bossHp: battle.bossHp,
      bossMaxHp: battle.bossMaxHp,
      revision: battle.revision,
      allReady: this.battleAllReady(battle),
      roster: battle.members
        .filter((member) => !member.left)
        .map((member) => {
          const participant = this.socketByPlayerId(member.publicId)?.attachment;
          return {
          id: member.publicId,
          name: member.name,
          ready: member.ready,
          connected: member.connected,
          hp: member.hp,
          maxHp: member.maxHp,
          alive: member.hp !== 0,
          hairColor: participant?.hairColor ?? "purple",
          presence: participant?.zone === `battle:${battle.battleId}` ? {
            x: participant.x, y: participant.y, direction: participant.direction, moving: participant.moving,
          } : null,
        }; }),
      startedAt: battle.startedAt,
    };
    if (battle.status === "finished" && battle.finishedAt !== null) {
      publicBattle.finishedAt = battle.finishedAt;
      publicBattle.result = battle.bossHp === 0
        ? { outcome: "victory", reason: "boss-defeated" }
        : { outcome: "defeat", reason: "party-defeated" };
    }
    return publicBattle;
  }

  private battleAllReady(battle: BattleRecord): boolean {
    const connectedMembers = battle.members.filter(
      (member) => !member.left && member.connected && member.hp !== 0,
    );
    return connectedMembers.length > 0 && connectedMembers.every((member) => member.ready);
  }

  private publicRooms(): PublicRoom[] {
    return [...this.rooms.values()]
      .filter((room) => room.status === "waiting")
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((room) => this.publicRoom(room));
  }

  private sendBattleEvent(
    socket: WebSocket,
    type: "battle.snapshot" | "battle.updated" | "battle.finished",
    battle: BattleRecord,
  ): void {
    this.send(socket, { type, ...this.publicBattle(battle) });
  }

  private broadcastBattleEvent(
    battle: BattleRecord,
    type: "battle.updated" | "battle.finished",
  ): void {
    const memberKeys = new Set(
      battle.members.filter((member) => !member.left).map((member) => member.playerKey),
    );
    for (const { socket, attachment } of this.activeSockets()) {
      if (attachment.roomId === battle.roomId && memberKeys.has(attachment.playerKey)) {
        this.sendBattleEvent(socket, type, battle);
      }
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    this.scheduledCleanupAt = null;
    await this.enqueueRoomMutation(() => this.cleanupExpiredBattles(Date.now()));
  }

  private sendPresenceSnapshot(socket: WebSocket, recipient: SocketAttachment): void {
    const players = this.activeSockets()
      .map(({ attachment }) => attachment)
      .filter(
        (player) =>
          player.playerId !== recipient.playerId &&
          player.playerKey !== recipient.playerKey &&
          player.zone === recipient.zone &&
          (!recipient.zone.startsWith("battle:") || player.roomId === recipient.roomId),
      )
      .map((player) => this.publicPlayer(player));
    this.send(socket, { type: "presence.snapshot", zone: recipient.zone, players });
  }

  private broadcastPresence(sender: SocketAttachment, payload: unknown): void {
    if (sender.zone.startsWith("battle:")) {
      for (const { socket, attachment } of this.activeSockets()) {
        if (attachment.zone === sender.zone && attachment.roomId === sender.roomId
          && attachment.playerKey !== sender.playerKey) this.send(socket, payload);
      }
      return;
    }
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

  private sendError(
    socket: WebSocket,
    code: string,
    message: string,
    context: { requestType?: string | null; roomId?: string | null } = {},
  ): void {
    this.send(socket, {
      type: "error",
      code,
      message,
      ...(context.requestType ? { requestType: context.requestType } : {}),
      ...(context.roomId ? { roomId: context.roomId } : {}),
    });
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

  private touchBattle(battle: BattleRecord, now = Date.now()): void {
    battle.lastActivityAt = now;
    const activeMembers = battle.members.filter((member) => !member.left);
    const allDisconnected =
      battle.status === "running" &&
      activeMembers.length > 0 &&
      activeMembers.every((member) => !member.connected);
    battle.allDisconnectedAt = allDisconnected ? battle.allDisconnectedAt ?? now : null;
  }

  /**
   * Persists one authoritative victory per Durable Object room. Every shared
   * boss grants postgame growth; only stat/control additionally feed rankings.
   * No browser supplied result, duration, team name, or roster is accepted.
   */
  private async persistBossVictory(battle: BattleRecord): Promise<boolean> {
    const ranked = (RANKED_BATTLE_IDS as readonly string[]).includes(battle.battleId);
    const needsReward = battle.rewardRecorded !== true;
    const needsRanking = ranked && battle.rankingRecorded !== true;
    if (
      (!needsReward && !needsRanking)
      || battle.status !== "finished"
      || battle.bossHp !== 0
      || battle.finishedAt === null
      || !this.env.DB
    ) {
      return false;
    }

    const frozenRewardUserIds = new Set(
      battle.rewardUserIds
      ?? battle.members
        .filter((member) => !member.left && isInternalUserId(member.userId))
        .map((member) => member.userId as string),
    );
    const members = battle.members.filter(
      (member): member is BattleMemberRecord & { userId: string } => (
        isInternalUserId(member.userId) && frozenRewardUserIds.has(member.userId)
      ),
    );
    if (
      members.length < 1
      || members.length !== frozenRewardUserIds.size
      || members.length > 5
    ) {
      console.error("boss ranking skipped because the authenticated roster is incomplete");
      return false;
    }

    const runId = `boss-run:${battle.roomId}`;
    const statements: D1PreparedStatement[] = [];

    if (needsRanking) {
      const room = this.rooms.get(battle.roomId);
      const normalizedTeamName = normalizeRoomName(room?.roomName ?? DEFAULT_ROOM_NAME);
      const teamName = isValidRoomName(normalizedTeamName) ? normalizedTeamName : DEFAULT_ROOM_NAME;
      const partyIdentity = [battle.battleId, ...members.map((member) => member.userId).sort()].join("\n");
      const partyDigest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(partyIdentity),
      );
      const partyKey = Array.from(
        new Uint8Array(partyDigest),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const clearTimeMs = Math.max(
        0,
        Math.trunc(battle.finishedAt - (battle.combatStartedAt ?? battle.startedAt)),
      );
      statements.push(this.env.DB.prepare(
        `INSERT OR IGNORE INTO boss_runs
           (id, room_id, boss_id, party_key, team_name, party_size, clear_time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        runId,
        battle.roomId,
        battle.battleId,
        partyKey,
        teamName,
        members.length,
        clearTimeMs,
      ));
      statements.push(...members.map((member, memberOrder) => this.env.DB!.prepare(
        `INSERT OR IGNORE INTO boss_run_members
           (run_id, user_id, nickname_snapshot, member_order)
         SELECT ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM boss_runs WHERE id = ? AND room_id = ?)`,
      ).bind(
        runId,
        member.userId,
        normalizeName(member.name),
        memberOrder,
        runId,
        battle.roomId,
      )));
    }

    if (needsReward) {
      for (const member of members) {
        const rewardId = crypto.randomUUID();
        const { EXPERIENCE_PER_POSTGAME_CLEAR, POSTGAME_LEVEL_GAIN_SQL } = createPostgameReward();
        statements.push(
          this.env.DB.prepare(
            `INSERT INTO postgame_results
               (id, user_id, attempt_id, content_id, source, status, score, awarded)
             VALUES (?, ?, ?, ?, 'boss', 'CLEAR', 0, 0)
             ON CONFLICT(user_id, attempt_id) DO NOTHING`,
          ).bind(rewardId, member.userId, runId, battle.battleId),
          this.env.DB.prepare(
            `UPDATE stats
                SET clears = COALESCE(clears, 0) + 1,
                    experience = COALESCE(experience, 0) + ${EXPERIENCE_PER_POSTGAME_CLEAR},
                    level = COALESCE(level, 1) + (${POSTGAME_LEVEL_GAIN_SQL}),
                    unspent_points = COALESCE(unspent_points, 0) + (${POSTGAME_LEVEL_GAIN_SQL}),
                    updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?
                AND EXISTS (
                  SELECT 1 FROM postgame_results
                   WHERE user_id = ? AND attempt_id = ? AND content_id = ? AND awarded = 0
                )`,
          ).bind(member.userId, member.userId, runId, battle.battleId),
          this.env.DB.prepare(
            `UPDATE postgame_results
                SET awarded = 1
              WHERE user_id = ? AND attempt_id = ? AND content_id = ? AND awarded = 0
                AND EXISTS (SELECT 1 FROM stats WHERE user_id = ?)`,
          ).bind(member.userId, runId, battle.battleId, member.userId),
        );
      }
    }

    await this.env.DB.batch(statements);
    if (needsReward) {
      const verification = await this.env.DB.prepare(
        `SELECT user_id
           FROM postgame_results
          WHERE attempt_id = ? AND content_id = ? AND source = 'boss' AND awarded = 1`,
      ).bind(runId, battle.battleId).all<AwardedPostgameResultRow>();
      const awardedUserIds = new Set(verification.results.map((row) => row.user_id));
      if (
        awardedUserIds.size !== frozenRewardUserIds.size
        || [...frozenRewardUserIds].some((userId) => !awardedUserIds.has(userId))
      ) {
        throw new Error("boss reward verification failed");
      }
    }
    if (needsRanking) battle.rankingRecorded = true;
    if (needsReward) battle.rewardRecorded = true;
    return true;
  }

  private bossPersistencePending(battle: BattleRecord): boolean {
    if (battle.status !== "finished" || battle.bossHp !== 0) return false;
    const rankingPending =
      (RANKED_BATTLE_IDS as readonly string[]).includes(battle.battleId)
      && battle.rankingRecorded !== true;
    return battle.rewardRecorded !== true || rankingPending;
  }

  private battleExpiresAt(battle: BattleRecord): number | null {
    if (battle.status === "finished") {
      if (this.bossPersistencePending(battle)) {
        return battle.lastActivityAt + BOSS_PERSISTENCE_RETRY_MS;
      }
      return battle.finishedAt === null ? null : battle.finishedAt + FINISHED_BATTLE_RETENTION_MS;
    }
    const activeMembers = battle.members.filter((member) => !member.left);
    if (activeMembers.length === 0) return battle.lastActivityAt;
    if (activeMembers.some((member) => member.connected)) return null;
    return (battle.allDisconnectedAt ?? battle.lastActivityAt) + ABANDONED_BATTLE_GRACE_MS;
  }

  private async scheduleNextCleanup(now = Date.now()): Promise<void> {
    const deadlines = [...this.battles.values()].flatMap((battle): number[] => {
      const deadline = this.battleExpiresAt(battle);
      return deadline === null ? [] : [deadline];
    });
    if (deadlines.length === 0) {
      if (this.scheduledCleanupAt === null) return;
      await this.ctx.storage.deleteAlarm();
      this.scheduledCleanupAt = null;
      return;
    }
    const nextCleanupAt = Math.max(now + 1, Math.min(...deadlines));
    if (this.scheduledCleanupAt === nextCleanupAt) return;
    await this.ctx.storage.setAlarm(nextCleanupAt);
    this.scheduledCleanupAt = nextCleanupAt;
  }

  private async cleanupExpiredBattles(now: number): Promise<void> {
    const removedRoomIds: string[] = [];
    let changed = false;
    for (const [roomId, battle] of this.battles) {
      let expiresAt = this.battleExpiresAt(battle);
      if (expiresAt === null || expiresAt > now) continue;
      if (this.bossPersistencePending(battle)) {
        try {
          if (await this.persistBossVictory(battle)) changed = true;
        } catch (error) {
          console.error("boss victory persistence retry failed", error);
        }
        if (this.bossPersistencePending(battle)) {
          battle.lastActivityAt = now;
          changed = true;
          continue;
        }
        expiresAt = this.battleExpiresAt(battle);
        if (expiresAt === null || expiresAt > now) continue;
      }
      this.battles.delete(roomId);
      this.rooms.delete(roomId);
      removedRoomIds.push(roomId);
    }

    if (removedRoomIds.length > 0) {
      const removed = new Set(removedRoomIds);
      for (const { socket, attachment } of this.activeSockets()) {
        if (!attachment.roomId || !removed.has(attachment.roomId)) continue;
        const roomId = attachment.roomId;
        attachment.roomId = null;
        try {
          socket.serializeAttachment(attachment);
        } catch {
          // The peer can close while an alarm is cleaning its finished battle.
        }
        this.send(socket, { type: "battle.left", roomId });
      }
      await this.persistState();
      for (const roomId of removedRoomIds) this.broadcast({ type: "room.removed", roomId });
      return;
    }

    if (changed) {
      await this.persistState();
      return;
    }
    await this.scheduleNextCleanup(now);
  }

  private async persistRooms(): Promise<void> {
    await this.ctx.storage.put(ROOM_STORAGE_KEY, [...this.rooms.values()]);
  }

  private async persistBattles(): Promise<void> {
    await this.ctx.storage.put(BATTLE_STORAGE_KEY, [...this.battles.values()]);
    await this.scheduleNextCleanup();
  }

  private async persistState(): Promise<void> {
    await this.ctx.storage.put({
      [ROOM_STORAGE_KEY]: [...this.rooms.values()],
      [BATTLE_STORAGE_KEY]: [...this.battles.values()],
    });
    await this.scheduleNextCleanup();
  }

  private async disconnectBattle(attachment: SocketAttachment): Promise<void> {
    if (!attachment.roomId) return;
    const battle = this.battles.get(attachment.roomId);
    if (!battle) return;
    const member = battle.members.find(
      (candidate) => candidate.playerKey === attachment.playerKey && !candidate.left,
    );
    if (!member || (!member.connected && !member.ready)) return;

    member.connected = false;
    member.ready = false;
    battle.revision += 1;
    this.touchBattle(battle);
    await this.persistBattles();
    this.broadcastBattleEvent(battle, "battle.updated");
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
    await this.enqueueRoomMutation(async () => {
      if (attachment.roomId && this.battles.has(attachment.roomId)) {
        await this.disconnectBattle(attachment);
      } else {
        await this.leaveRoom(socket, attachment, false);
      }
    });
  }

  private async reconcileRestoredState(): Promise<void> {
    const now = Date.now();
    const sockets = this.activeSockets();
    const activePlayers = new Map(sockets.map(({ attachment }) => [attachment.playerId, attachment]));
    const claimedPlayers = new Set<string>();
    const claimedBattleAccounts = new Set<string>();
    let changed = false;

    for (const [roomId, room] of this.rooms) {
      if (room.status === "started") {
        const battle = this.battles.get(roomId);
        if (!battle || battle.battleId !== room.battleId) {
          this.rooms.delete(roomId);
          changed = true;
        }
        continue;
      }
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

    for (const [roomId, battle] of this.battles) {
      const room = this.rooms.get(roomId);
      if (!room || room.status !== "started" || room.battleId !== battle.battleId) {
        this.battles.delete(roomId);
        changed = true;
        continue;
      }
      if (battle.members.every((member) => member.left)) {
        this.battles.delete(roomId);
        this.rooms.delete(roomId);
        changed = true;
        continue;
      }
      for (const member of battle.members) {
        if (!member.left && (member.connected || member.ready)) {
          member.connected = false;
          member.ready = false;
          changed = true;
        }
      }
    }

    for (const { socket, attachment } of sockets) {
      let expectedRoomId = [...this.rooms.values()].find(
        (room) => room.status === "waiting" && room.memberPlayerIds.includes(attachment.playerId),
      )?.roomId;
      if (!expectedRoomId) {
        const battle = [...this.battles.values()]
          .sort((left, right) => right.startedAt - left.startedAt)
          .find((candidate) => {
            const claimKey = `${candidate.roomId}:${attachment.playerKey}`;
            return (
              !claimedBattleAccounts.has(claimKey) &&
              candidate.members.some((member) => member.playerKey === attachment.playerKey && !member.left)
            );
          });
        if (battle) {
          expectedRoomId = battle.roomId;
          const claimKey = `${battle.roomId}:${attachment.playerKey}`;
          claimedBattleAccounts.add(claimKey);
          const member = battle.members.find(
            (candidate) => candidate.playerKey === attachment.playerKey && !candidate.left,
          );
          if (member) {
            const previousPublicId = member.publicId;
            if (
              !member.connected ||
              member.userId !== (attachment.userId ?? null) ||
              member.publicId !== attachment.playerId ||
              member.name !== attachment.name
            ) {
              member.connected = true;
              member.userId = attachment.userId ?? null;
              member.publicId = attachment.playerId;
              member.name = attachment.name;
              battle.revision += 1;
              const room = this.rooms.get(battle.roomId);
              if (room) {
                room.memberPlayerIds = room.memberPlayerIds.map((playerId) =>
                  playerId === previousPublicId ? attachment.playerId : playerId,
                );
                if (room.hostPlayerId === previousPublicId) room.hostPlayerId = attachment.playerId;
              }
              changed = true;
            }
          }
        }
      }
      const normalizedRoomId = expectedRoomId ?? null;
      if (attachment.roomId !== normalizedRoomId) {
        attachment.roomId = normalizedRoomId;
        socket.serializeAttachment(attachment);
        changed = true;
      }
    }

    for (const battle of this.battles.values()) {
      const previousDisconnectedAt = battle.allDisconnectedAt;
      const activeMembers = battle.members.filter((member) => !member.left);
      const allDisconnected =
        battle.status === "running" &&
        activeMembers.length > 0 &&
        activeMembers.every((member) => !member.connected);
      battle.allDisconnectedAt = allDisconnected ? battle.allDisconnectedAt ?? now : null;
      if (battle.allDisconnectedAt !== previousDisconnectedAt) changed = true;
      const rankingPending =
        (RANKED_BATTLE_IDS as readonly string[]).includes(battle.battleId)
        && battle.rankingRecorded !== true;
      if (
        battle.status === "finished"
        && battle.bossHp === 0
        && (battle.rewardRecorded !== true || rankingPending)
      ) {
        try {
          if (await this.persistBossVictory(battle)) changed = true;
        } catch (error) {
          console.error("restored boss ranking persistence failed", error);
        }
      }
    }

    if (changed) await this.persistState();
    await this.cleanupExpiredBattles(now);
  }
}

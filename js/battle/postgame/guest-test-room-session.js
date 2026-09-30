import { normalizeRoomName } from "../../core/postgame-realtime-service.js";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 5;
const DEFAULT_SELF_ID = "guest-test-player";

function clampCapacity(value) {
  const capacity = Math.trunc(Number(value));
  if (!Number.isFinite(capacity)) return MAX_CAPACITY;
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, capacity));
}

function freezeRoom(room) {
  if (!room) return null;
  return Object.freeze({
    ...room,
    members: Object.freeze(room.members.map((member) => Object.freeze({ ...member }))),
  });
}

export function createGuestTestRoomSession({
  playerName = "게스트 테스트",
  createId = () => `LOCAL-${Date.now().toString(36).toUpperCase()}`,
} = {}) {
  const selfId = DEFAULT_SELF_ID;
  const member = Object.freeze({ id: selfId, name: playerName });
  let currentRoom = null;
  let lastEvent = null;

  const getState = () => Object.freeze({
    status: "connected",
    connected: true,
    mode: "local-test",
    selfId,
    players: Object.freeze([]),
    rooms: Object.freeze(currentRoom ? [currentRoom] : []),
    currentRoom,
    battle: null,
    lastError: null,
    error: null,
    lastEvent,
  });

  const createRoom = (battleId, capacity, roomName) => {
    const normalizedBattleId = typeof battleId === "string" ? battleId.trim() : "";
    const normalizedName = normalizeRoomName(roomName);
    if (currentRoom || !normalizedBattleId || !normalizedName) return false;
    const roomId = String(createId()).trim();
    if (!roomId) return false;
    currentRoom = freezeRoom({
      id: roomId,
      roomName: normalizedName,
      battleId: normalizedBattleId,
      capacity: clampCapacity(capacity),
      hostId: selfId,
      status: "waiting",
      members: [member],
    });
    lastEvent = Object.freeze({ type: "room.created", roomId });
    return true;
  };

  const leaveRoom = () => {
    if (!currentRoom) return false;
    const roomId = currentRoom.id;
    currentRoom = null;
    lastEvent = Object.freeze({ type: "room.left", roomId });
    return true;
  };

  const startRoom = () => {
    if (!currentRoom || currentRoom.hostId !== selfId || currentRoom.status !== "waiting") {
      return null;
    }
    currentRoom = freezeRoom({ ...currentRoom, status: "started" });
    lastEvent = Object.freeze({ type: "room.started", roomId: currentRoom.id });
    return Object.freeze({
      roomId: currentRoom.id,
      battleId: currentRoom.battleId,
      selfId,
      roster: currentRoom.members,
    });
  };

  return Object.freeze({
    getState,
    createRoom,
    joinRoom: () => false,
    leaveRoom,
    startRoom,
  });
}

export default createGuestTestRoomSession;

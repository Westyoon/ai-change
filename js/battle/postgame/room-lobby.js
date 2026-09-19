import { createButton, createElement } from "../../scenes/scene-utils.js";

const MIN_ROOM_CAPACITY = 1;
const MAX_ROOM_CAPACITY = 5;

function clearChildren(element) {
  if (typeof element.replaceChildren === "function") {
    element.replaceChildren();
    return;
  }
  for (const child of [...(element.children ?? [])]) child.remove?.();
}

function roomMembers(room) {
  return Array.isArray(room?.members) ? room.members : [];
}

function roomCapacity(room) {
  const value = Math.trunc(Number(room?.capacity));
  if (!Number.isFinite(value)) return MAX_ROOM_CAPACITY;
  return Math.min(MAX_ROOM_CAPACITY, Math.max(MIN_ROOM_CAPACITY, value));
}

function roomId(room) {
  return typeof room?.id === "string" ? room.id : "";
}

function roomHostId(room) {
  return typeof room?.hostId === "string" ? room.hostId : "";
}

function currentRoomFromState(state) {
  if (state?.currentRoom && roomId(state.currentRoom)) return state.currentRoom;
  const selfId = typeof state?.selfId === "string" ? state.selfId : "";
  if (!selfId) return null;
  return (Array.isArray(state?.rooms) ? state.rooms : [])
    .find((room) => roomMembers(room).some((member) => member?.id === selfId)) ?? null;
}

function statusCopy(status) {
  if (status === "connected") return "서버 연결됨";
  if (status === "connecting" || status === "reconnecting") return "서버 연결 중…";
  if (status === "unavailable") return "로그인 후 온라인 방을 이용할 수 있습니다.";
  if (status === "error") return "서버 연결을 확인해 주세요.";
  return "온라인 대기실";
}

/**
 * Builds a small, host-scene-owned room lobby. The realtime service remains the
 * source of truth; this component only renders its latest immutable snapshot.
 */
export function createPostgameRoomLobby({
  onCreate,
  onJoin,
  onLeave,
  onStart,
  onSolo,
  onClose,
} = {}) {
  let selectedBattle = null;
  let returnSpawn = null;
  let latestState = Object.freeze({ status: "idle", rooms: [] });

  const title = createElement("h2", {
    className: "postgame-room-lobby__title",
    attributes: { id: "postgame-room-lobby-title" },
  });
  const subtitle = createElement("p", { className: "postgame-room-lobby__subtitle" });
  const connectionStatus = createElement("p", {
    className: "postgame-room-lobby__connection",
    attributes: { role: "status", "aria-live": "polite" },
  });
  const soloFallbackButton = createButton("서버 없이 혼자 입장", () => {
    if (!selectedBattle || currentRoomFromState(latestState)) return;
    element.hidden = true;
    element.dataset.open = "false";
    onSolo?.({ battle: selectedBattle, returnSpawn });
  }, "ghost");
  soloFallbackButton.className += " postgame-room-lobby__solo-fallback";
  soloFallbackButton.hidden = true;
  const roomList = createElement("div", {
    className: "postgame-room-lobby__rooms",
    attributes: { "aria-label": "참가할 수 있는 보스방" },
  });
  const membership = createElement("div", { className: "postgame-room-lobby__membership" });

  const capacitySelect = createElement("select", {
    className: "postgame-room-lobby__capacity",
    attributes: { "aria-label": "보스방 최대 인원" },
  });
  for (let capacity = MIN_ROOM_CAPACITY; capacity <= MAX_ROOM_CAPACITY; capacity += 1) {
    capacitySelect.append(createElement("option", {
      text: `${capacity}명`,
      attributes: { value: String(capacity) },
    }));
  }
  capacitySelect.value = String(MAX_ROOM_CAPACITY);

  const createRoomButton = createButton("방 만들기", () => {
    if (!selectedBattle || latestState.status !== "connected") return;
    const capacity = Math.min(
      MAX_ROOM_CAPACITY,
      Math.max(MIN_ROOM_CAPACITY, Math.trunc(Number(capacitySelect.value)) || MAX_ROOM_CAPACITY),
    );
    onCreate?.(selectedBattle.id, capacity);
  }, "primary");
  createRoomButton.className += " postgame-room-lobby__create";

  const closeButton = createButton("닫기", () => {
    if (currentRoomFromState(latestState)) onLeave?.();
    element.hidden = true;
    element.dataset.open = "false";
    onClose?.({ battle: selectedBattle, returnSpawn });
  }, "ghost");

  const element = createElement("section", {
    className: "postgame-room-lobby",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "postgame-room-lobby-title",
    },
    dataset: { open: "false" },
  }, [
    createElement("div", { className: "postgame-room-lobby__panel" }, [
      createElement("header", { className: "postgame-room-lobby__header" }, [
        createElement("div", {}, [title, subtitle]),
        closeButton,
      ]),
      connectionStatus,
      soloFallbackButton,
      createElement("div", { className: "postgame-room-lobby__create-row" }, [
        createElement("label", { text: "최대 인원" }),
        capacitySelect,
        createRoomButton,
      ]),
      membership,
      createElement("section", { className: "postgame-room-lobby__directory" }, [
        createElement("h3", { text: "공개 방" }),
        roomList,
      ]),
    ]),
  ]);
  element.hidden = true;

  function renderMembership(state) {
    clearChildren(membership);
    const currentRoom = currentRoomFromState(state);
    if (!currentRoom) {
      membership.hidden = true;
      return;
    }

    membership.hidden = false;
    const members = roomMembers(currentRoom);
    const isHost = roomHostId(currentRoom) === state.selfId;
    const memberList = createElement("ul", { className: "postgame-room-lobby__members" });
    for (const member of members) {
      memberList.append(createElement("li", {
        text: `${member?.name || "플레이어"}${member?.id === roomHostId(currentRoom) ? " · 방장" : ""}`,
      }));
    }

    const leaveButton = createButton("방 나가기", () => onLeave?.(), "ghost");
    const actions = [leaveButton];
    if (isHost) {
      const startButton = createButton("전투 시작", () => onStart?.(), "primary");
      startButton.disabled = members.length < MIN_ROOM_CAPACITY;
      actions.push(startButton);
    } else {
      actions.push(createElement("p", {
        className: "postgame-room-lobby__waiting",
        text: "방장이 전투를 시작하기를 기다리는 중…",
      }));
    }

    membership.append(
      createElement("div", { className: "postgame-room-lobby__membership-heading" }, [
        createElement("strong", { text: `현재 방 · ${members.length}/${roomCapacity(currentRoom)}명` }),
        createElement("span", { text: isHost ? "내가 방장" : "참가 중" }),
      ]),
      memberList,
      createElement("div", { className: "postgame-room-lobby__membership-actions" }, actions),
    );
  }

  function renderRooms(state) {
    clearChildren(roomList);
    const rooms = (Array.isArray(state?.rooms) ? state.rooms : [])
      .filter((room) => room?.battleId === selectedBattle?.id && room?.status !== "started");
    const currentRoom = currentRoomFromState(state);

    if (rooms.length === 0) {
      roomList.append(createElement("p", {
        className: "postgame-room-lobby__empty",
        text: "열린 방이 없습니다. 새 방을 만들어 보세요.",
      }));
      return;
    }

    for (const room of rooms) {
      const members = roomMembers(room);
      const capacity = roomCapacity(room);
      const full = members.length >= capacity;
      const joined = roomId(currentRoom) === roomId(room);
      const joinButton = createButton(
        joined ? "참가 중" : full ? "가득 참" : "참가",
        () => onJoin?.(roomId(room)),
        joined ? "primary" : "ghost",
      );
      joinButton.disabled = joined || full || Boolean(currentRoom) || state.status !== "connected";
      roomList.append(createElement("article", { className: "postgame-room-card" }, [
        createElement("div", {}, [
          createElement("strong", { text: `${members[0]?.name || "플레이어"}의 방` }),
          createElement("span", { text: `${members.length}/${capacity}명` }),
        ]),
        joinButton,
      ]));
    }
  }

  function render(state = {}) {
    latestState = state;
    connectionStatus.textContent = state.error || statusCopy(state.status);
    connectionStatus.dataset.status = state.status ?? "idle";
    const currentRoom = currentRoomFromState(state);
    capacitySelect.disabled = Boolean(currentRoom) || state.status !== "connected";
    createRoomButton.disabled = Boolean(currentRoom) || state.status !== "connected";
    soloFallbackButton.hidden = state.status === "connected" || Boolean(currentRoom);
    soloFallbackButton.disabled = Boolean(currentRoom);
    renderMembership(state);
    renderRooms(state);
  }

  return Object.freeze({
    element,
    open({ battle, spawn = null } = {}) {
      if (!battle?.id) return false;
      selectedBattle = battle;
      returnSpawn = spawn;
      title.textContent = `${battle.title} · 보스방`;
      subtitle.textContent = "1명부터 5명까지 함께 입장할 수 있습니다.";
      element.hidden = false;
      element.dataset.open = "true";
      render(latestState);
      return true;
    },
    close({ leave = false } = {}) {
      if (leave && currentRoomFromState(latestState)) onLeave?.();
      element.hidden = true;
      element.dataset.open = "false";
      return true;
    },
    render,
    isOpen: () => element.dataset.open === "true",
    getBattle: () => selectedBattle,
    getReturnSpawn: () => returnSpawn,
  });
}

export {
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
  currentRoomFromState,
  roomCapacity,
};

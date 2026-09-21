import { createButton, createElement } from "../../scenes/scene-utils.js";
import { normalizeRoomName } from "../../core/postgame-realtime-service.js";

const MIN_ROOM_CAPACITY = 1;
const MAX_ROOM_CAPACITY = 5;
const MAX_ROOM_NAME_LENGTH = 32;
const DEFAULT_PENDING_TIMEOUT_MS = 8_000;
const ROOM_LOBBY_VIEWS = Object.freeze({
  DIRECTORY: "directory",
  CREATE: "create",
  WAITING: "waiting",
});

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

function roomHost(room) {
  const hostId = roomHostId(room);
  return roomMembers(room).find((member) => member?.id === hostId) ?? roomMembers(room)[0] ?? null;
}

function validRoomName(value) {
  const length = [...normalizeRoomName(value)].length;
  return length >= 1 && length <= MAX_ROOM_NAME_LENGTH;
}

function roomName(room) {
  const explicitName = normalizeRoomName(room?.roomName ?? room?.name);
  if (explicitName) return [...explicitName].slice(0, MAX_ROOM_NAME_LENGTH).join("");
  return `${roomMembers(room)[0]?.name || "플레이어"}의 방`;
}

function currentRoomFromState(state) {
  if (state?.currentRoom && roomId(state.currentRoom)) return state.currentRoom;
  const selfId = typeof state?.selfId === "string" ? state.selfId : "";
  if (!selfId) return null;
  return (Array.isArray(state?.rooms) ? state.rooms : [])
    .find((room) => roomMembers(room).some((member) => member?.id === selfId)) ?? null;
}

function roomFingerprint(room) {
  if (!room) return null;
  return [
    roomId(room),
    room?.battleId ?? "",
    roomName(room),
    roomCapacity(room),
    roomHostId(room),
    room?.status ?? "",
    roomMembers(room).map((member) => [
      member?.id ?? "",
      member?.name ?? "",
    ]),
  ];
}

function lobbyStateSignature(state, battleId, pendingAction, pendingRoomId) {
  const relevantRooms = (Array.isArray(state?.rooms) ? state.rooms : [])
    .filter((room) => room?.battleId === battleId)
    .map(roomFingerprint);
  const currentRoom = currentRoomFromState(state);
  return JSON.stringify([
    state?.status ?? "idle",
    state?.error ?? null,
    state?.selfId ?? null,
    battleId ?? null,
    roomFingerprint(currentRoom),
    relevantRooms,
    pendingAction,
    pendingRoomId,
  ]);
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
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  pendingTimeoutMs = DEFAULT_PENDING_TIMEOUT_MS,
} = {}) {
  let selectedBattle = null;
  let returnSpawn = null;
  let latestState = Object.freeze({ status: "idle", rooms: [] });
  let requestedView = ROOM_LOBBY_VIEWS.DIRECTORY;
  let renderedStateSignature = "";
  let renderedView = "";
  let pendingAction = null;
  let pendingRoomId = null;
  let pendingBaseEvent = null;
  let pendingBaseError = null;
  let pendingTimer = null;
  let closeAfterLeave = false;
  let waitingHeading = null;
  let waitingLeaveButton = null;
  let waitingStartButton = null;

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
    attributes: { role: "list", "aria-label": "참가할 수 있는 보스방" },
  });
  const directorySummary = createElement("p", {
    className: "postgame-room-lobby__directory-summary",
    attributes: { "aria-live": "polite" },
  });
  const membership = createElement("section", {
    className: "postgame-room-lobby__membership postgame-room-lobby__view",
    attributes: { "aria-label": "보스방 대기실" },
  });
  const directoryHeading = createElement("h3", {
    text: "열린 보스방",
    attributes: { tabindex: "-1" },
  });

  const roomNameInput = createElement("input", {
    className: "postgame-room-lobby__name",
    type: "text",
    attributes: {
      id: "postgame-room-name",
      autocomplete: "off",
      placeholder: "예: 스탯 보스 같이 잡아요!",
      "aria-label": "보스방 이름",
      "aria-describedby": "postgame-room-name-hint",
    },
  });
  const roomNameHint = createElement("small", {
    className: "postgame-room-lobby__name-hint",
    text: `0/${MAX_ROOM_NAME_LENGTH}자`,
    attributes: { id: "postgame-room-name-hint", "aria-live": "polite" },
  });

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

  const submitCreateRoom = () => {
    if (pendingAction || !selectedBattle || latestState.status !== "connected") return false;
    const name = normalizeRoomName(roomNameInput.value);
    if (!validRoomName(name) || currentRoomFromState(latestState)) return false;
    const capacity = Math.min(
      MAX_ROOM_CAPACITY,
      Math.max(MIN_ROOM_CAPACITY, Math.trunc(Number(capacitySelect.value)) || MAX_ROOM_CAPACITY),
    );
    return runPendingAction("create", () => onCreate?.(selectedBattle.id, capacity, name));
  };
  const createRoomButton = createButton("방 생성", submitCreateRoom, "primary");
  createRoomButton.className += " postgame-room-lobby__create";

  const updateCreateControls = () => {
    const hasCurrentRoom = Boolean(currentRoomFromState(latestState));
    const connected = latestState.status === "connected";
    const normalizedLength = [...normalizeRoomName(roomNameInput.value)].length;
    roomNameHint.textContent = normalizedLength > MAX_ROOM_NAME_LENGTH
      ? `${MAX_ROOM_NAME_LENGTH}자 이하로 입력해 주세요.`
      : `${normalizedLength}/${MAX_ROOM_NAME_LENGTH}자`;
    roomNameHint.dataset.invalid = String(normalizedLength > MAX_ROOM_NAME_LENGTH);
    roomNameInput.disabled = Boolean(pendingAction) || hasCurrentRoom || !connected;
    capacitySelect.disabled = Boolean(pendingAction) || hasCurrentRoom || !connected;
    createRoomButton.disabled = (
      Boolean(pendingAction)
      || hasCurrentRoom
      || !connected
      || !validRoomName(roomNameInput.value)
    );
    createRoomButton.textContent = pendingAction === "create" ? "생성 중…" : "방 생성";
  };
  roomNameInput.addEventListener("input", updateCreateControls);
  roomNameInput.addEventListener("keydown", (event) => {
    if (event?.key !== "Enter" || createRoomButton.disabled) return;
    event.preventDefault?.();
    submitCreateRoom();
  });

  const createView = createElement("section", {
    className: "postgame-room-lobby__create-view postgame-room-lobby__view",
    attributes: { "aria-label": "새 보스방 만들기" },
  });
  const directoryView = createElement("section", {
    className: "postgame-room-lobby__directory postgame-room-lobby__view",
    attributes: { "aria-label": "보스방 목록" },
  });
  const createHeading = createElement("h3", {
    text: "새 보스방 만들기",
    attributes: { tabindex: "-1" },
  });

  const showView = (view) => {
    requestedView = Object.values(ROOM_LOBBY_VIEWS).includes(view)
      ? view
      : ROOM_LOBBY_VIEWS.DIRECTORY;
    renderViews();
  };

  const openCreateButton = createButton("새 방 만들기", () => {
    if (pendingAction || latestState.status !== "connected" || currentRoomFromState(latestState)) return;
    roomNameInput.value = "";
    capacitySelect.value = String(MAX_ROOM_CAPACITY);
    updateCreateControls();
    showView(ROOM_LOBBY_VIEWS.CREATE);
    roomNameInput.focus?.({ preventScroll: true });
  }, "primary");
  openCreateButton.className += " postgame-room-lobby__open-create";

  const createBackButton = createButton("목록으로", () => {
    if (pendingAction) return;
    showView(ROOM_LOBBY_VIEWS.DIRECTORY);
  }, "ghost");

  const closeButton = createButton("닫기", () => {
    if (pendingAction) return;
    const currentRoom = currentRoomFromState(latestState);
    if (currentRoom) {
      closeAfterLeave = true;
      if (!runPendingAction("leave", () => onLeave?.(), roomId(currentRoom))) {
        closeAfterLeave = false;
      }
      return;
    }
    finishClose();
  }, "ghost");

  function finishClose() {
    clearPendingAction();
    element.hidden = true;
    element.dataset.open = "false";
    requestedView = ROOM_LOBBY_VIEWS.DIRECTORY;
    renderedView = "";
    closeAfterLeave = false;
    onClose?.({ battle: selectedBattle, returnSpawn });
  }

  directoryView.append(
    createElement("div", { className: "postgame-room-lobby__directory-toolbar" }, [
      createElement("div", {}, [
        directoryHeading,
        directorySummary,
      ]),
      openCreateButton,
    ]),
    roomList,
  );

  createView.append(
    createElement("div", { className: "postgame-room-lobby__view-heading" }, [
      createElement("div", {}, [
        createElement("p", { className: "postgame-room-lobby__waiting-kicker", text: "CREATE ROOM" }),
        createHeading,
      ]),
      createBackButton,
    ]),
    createElement("div", { className: "postgame-room-lobby__create-card" }, [
      createElement("div", { className: "postgame-room-lobby__create-row" }, [
        createElement("label", { className: "postgame-room-lobby__field postgame-room-lobby__field--name" }, [
          createElement("span", { text: "방 이름" }),
          roomNameInput,
        ]),
        createElement("label", { className: "postgame-room-lobby__field" }, [
          createElement("span", { text: "최대 인원" }),
          capacitySelect,
        ]),
      ]),
      roomNameHint,
      createElement("div", { className: "postgame-room-lobby__create-actions" }, [
        createRoomButton,
      ]),
    ]),
  );

  const panel = createElement("div", { className: "postgame-room-lobby__panel" }, [
    createElement("header", { className: "postgame-room-lobby__header" }, [
      createElement("div", {}, [title, subtitle]),
      closeButton,
    ]),
    connectionStatus,
    soloFallbackButton,
    directoryView,
    createView,
    membership,
  ]);

  const element = createElement("section", {
    className: "postgame-room-lobby",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "postgame-room-lobby-title",
    },
    dataset: { open: "false" },
  }, [panel]);
  element.hidden = true;
  element.addEventListener("keydown", (event) => {
    if (event?.key !== "Tab" || element.hidden || typeof element.querySelectorAll !== "function") return;
    const focusable = [...element.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )].filter((node) => !node.hidden && !node.closest?.("[hidden]"));
    if (focusable.length === 0) return;
    const activeIndex = focusable.indexOf(globalThis.document?.activeElement);
    const movingBackward = event.shiftKey === true;
    if (movingBackward && activeIndex > 0) return;
    if (!movingBackward && activeIndex >= 0 && activeIndex < focusable.length - 1) return;
    event.preventDefault?.();
    focusable[movingBackward ? focusable.length - 1 : 0]?.focus?.({ preventScroll: true });
  });

  function focusActiveView(view = panel.dataset.view) {
    if (view === ROOM_LOBBY_VIEWS.CREATE) {
      createHeading.focus?.({ preventScroll: true });
      return;
    }
    if (view === ROOM_LOBBY_VIEWS.WAITING) {
      waitingHeading?.focus?.({ preventScroll: true });
      return;
    }
    directoryHeading.focus?.({ preventScroll: true });
  }

  function runPendingAction(action, callback, room = null) {
    if (pendingAction) return false;
    const sent = callback?.();
    if (sent === false) return false;
    pendingAction = action;
    pendingRoomId = room;
    pendingBaseEvent = latestState?.lastEvent ?? null;
    pendingBaseError = latestState?.lastError ?? latestState?.error ?? null;
    if (typeof setTimeoutImpl === "function") {
      const timeout = Math.max(
        1_000,
        Math.trunc(Number(pendingTimeoutMs)) || DEFAULT_PENDING_TIMEOUT_MS,
      );
      pendingTimer = setTimeoutImpl(() => {
        if (!pendingAction) return;
        closeAfterLeave = false;
        clearPendingAction();
        render(latestState);
      }, timeout);
      pendingTimer?.unref?.();
    }
    render(latestState);
    return true;
  }

  function clearPendingAction() {
    if (!pendingAction) return false;
    if (pendingTimer !== null && typeof clearTimeoutImpl === "function") {
      clearTimeoutImpl(pendingTimer);
    }
    pendingAction = null;
    pendingRoomId = null;
    pendingBaseEvent = null;
    pendingBaseError = null;
    pendingTimer = null;
    return true;
  }

  function syncPendingAction(state) {
    if (!pendingAction) return;
    const currentRoom = currentRoomFromState(state);
    const eventChanged = state?.lastEvent && state.lastEvent !== pendingBaseEvent;
    const currentError = state?.lastError ?? state?.error ?? null;
    const transportInterrupted = state?.status !== "connected";
    const transportErrorChanged = Boolean(currentError) && currentError !== pendingBaseError;
    const failed = (
      (eventChanged && state.lastEvent.type === "error")
      || transportInterrupted
      || transportErrorChanged
    );
    const completed = (
      ((pendingAction === "create" || pendingAction === "join") && Boolean(currentRoom))
      || (pendingAction === "leave" && !currentRoom)
      || (pendingAction === "start" && eventChanged && state.lastEvent.type === "room.started")
    );
    if (failed || completed) {
      const shouldClose = completed && pendingAction === "leave" && closeAfterLeave;
      clearPendingAction();
      if (failed) closeAfterLeave = false;
      if (shouldClose) finishClose();
    }
  }

  function renderViews() {
    const currentRoom = currentRoomFromState(latestState);
    const effectiveView = currentRoom
      ? ROOM_LOBBY_VIEWS.WAITING
      : requestedView === ROOM_LOBBY_VIEWS.WAITING
        ? ROOM_LOBBY_VIEWS.DIRECTORY
        : requestedView;
    if (!currentRoom && requestedView === ROOM_LOBBY_VIEWS.WAITING) {
      requestedView = ROOM_LOBBY_VIEWS.DIRECTORY;
    }
    panel.dataset.view = effectiveView;
    directoryView.hidden = effectiveView !== ROOM_LOBBY_VIEWS.DIRECTORY;
    createView.hidden = effectiveView !== ROOM_LOBBY_VIEWS.CREATE;
    membership.hidden = effectiveView !== ROOM_LOBBY_VIEWS.WAITING;
    soloFallbackButton.hidden = (
      effectiveView !== ROOM_LOBBY_VIEWS.DIRECTORY
      || latestState.status === "connected"
      || Boolean(currentRoom)
    );
    closeButton.disabled = Boolean(pendingAction);
    createBackButton.disabled = Boolean(pendingAction);
    if (renderedView !== effectiveView) {
      renderedView = effectiveView;
      if (element.dataset.open === "true") focusActiveView(effectiveView);
    }
  }

  function renderMembership(state) {
    const activeElement = globalThis.document?.activeElement;
    const restoreFocus = activeElement === waitingStartButton
      ? "start"
      : activeElement === waitingLeaveButton
        ? "leave"
        : activeElement === waitingHeading
          ? "heading"
          : null;
    clearChildren(membership);
    waitingHeading = null;
    waitingLeaveButton = null;
    waitingStartButton = null;
    const currentRoom = currentRoomFromState(state);
    if (!currentRoom) {
      return;
    }

    requestedView = ROOM_LOBBY_VIEWS.WAITING;
    const members = roomMembers(currentRoom);
    const isHost = roomHostId(currentRoom) === state.selfId;
    const capacity = roomCapacity(currentRoom);
    const memberList = createElement("ul", { className: "postgame-room-lobby__members" });
    for (let index = 0; index < capacity; index += 1) {
      const member = members[index] ?? null;
      const isRoomHost = member?.id === roomHostId(currentRoom);
      const isSelf = member?.id === state.selfId;
      const badges = [];
      if (isSelf) badges.push("나");
      if (isRoomHost) badges.push("방장");
      memberList.append(createElement("li", {
        className: "postgame-room-lobby__member-slot",
        dataset: { occupied: String(Boolean(member)) },
      }, [
        createElement("span", {
          className: "postgame-room-lobby__member-index",
          text: `PLAYER ${index + 1}`,
        }),
        createElement("strong", {
          className: "postgame-room-lobby__member-name",
          text: member?.name || "참가자를 기다리는 중",
        }),
        badges.length > 0
          ? createElement("span", {
            className: "postgame-room-lobby__member-badge",
            text: badges.join(" · "),
          })
          : null,
      ]));
    }

    const leaveButton = createButton(
      pendingAction === "leave" ? "나가는 중…" : "방 나가기",
      () => runPendingAction("leave", () => onLeave?.(), roomId(currentRoom)),
      "ghost",
    );
    waitingLeaveButton = leaveButton;
    leaveButton.disabled = Boolean(pendingAction);
    const actions = [leaveButton];
    if (isHost) {
      const startButton = createButton(
        pendingAction === "start" ? "시작 중…" : "전투 시작",
        () => runPendingAction("start", () => onStart?.(), roomId(currentRoom)),
        "primary",
      );
      waitingStartButton = startButton;
      startButton.disabled = Boolean(pendingAction) || members.length < MIN_ROOM_CAPACITY;
      actions.push(startButton);
    } else {
      actions.push(createElement("p", {
        className: "postgame-room-lobby__waiting",
        text: "방장이 전투를 시작하기를 기다리는 중…",
      }));
    }

    waitingHeading = createElement("h3", {
      text: roomName(currentRoom),
      attributes: { tabindex: "-1" },
    });
    membership.append(
      createElement("div", { className: "postgame-room-lobby__waiting-hero" }, [
        createElement("div", {}, [
          createElement("p", {
            className: "postgame-room-lobby__waiting-kicker",
            text: `${selectedBattle?.title || "보스"} PARTY`,
          }),
          waitingHeading,
          createElement("p", {
            className: "postgame-room-lobby__waiting-meta",
            text: `${members.length}/${capacity}명 · ${isHost ? "내가 방장" : `${roomHost(currentRoom)?.name || "플레이어"} 방장`}`,
          }),
        ]),
        createElement("span", {
          className: "postgame-room-lobby__room-id",
          text: `ROOM ${roomId(currentRoom)}`,
        }),
      ]),
      memberList,
      createElement("div", { className: "postgame-room-lobby__membership-actions" }, actions),
    );
    if (element.dataset.open === "true") {
      if (restoreFocus === "start") waitingStartButton?.focus?.({ preventScroll: true });
      else if (restoreFocus === "leave") waitingLeaveButton?.focus?.({ preventScroll: true });
      else if (restoreFocus === "heading") waitingHeading?.focus?.({ preventScroll: true });
    }
  }

  function renderRooms(state) {
    clearChildren(roomList);
    const rooms = (Array.isArray(state?.rooms) ? state.rooms : [])
      .filter((room) => room?.battleId === selectedBattle?.id && room?.status !== "started");
    const currentRoom = currentRoomFromState(state);
    directorySummary.textContent = rooms.length > 0
      ? `${selectedBattle?.title || "보스"} 대기방 ${rooms.length}개`
      : `${selectedBattle?.title || "보스"} 대기방이 아직 없습니다.`;

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
        joined
          ? "참가 중"
          : full
            ? "가득 참"
            : pendingAction === "join" && pendingRoomId === roomId(room)
              ? "입장 중…"
              : "참가",
        () => runPendingAction("join", () => onJoin?.(roomId(room)), roomId(room)),
        joined ? "primary" : "ghost",
      );
      joinButton.disabled = (
        Boolean(pendingAction)
        || joined
        || full
        || Boolean(currentRoom)
        || state.status !== "connected"
      );
      joinButton.setAttribute(
        "aria-label",
        joined
          ? `${roomName(room)} 방 참가 중`
          : full
            ? `${roomName(room)} 방 가득 참`
            : pendingAction === "join" && pendingRoomId === roomId(room)
              ? `${roomName(room)} 방 입장 중`
              : `${roomName(room)} 방 참가`,
      );
      roomList.append(createElement("article", {
        className: "postgame-room-card",
        attributes: { role: "listitem" },
        dataset: { status: full ? "full" : "open" },
      }, [
        createElement("div", { className: "postgame-room-card__main" }, [
          createElement("div", { className: "postgame-room-card__status" }, [
            createElement("span", { className: "postgame-room-card__status-dot" }),
            createElement("span", { text: full ? "가득 참" : "입장 가능" }),
          ]),
          createElement("strong", { text: roomName(room) }),
          createElement("span", {
            className: "postgame-room-card__host",
            text: `방장 ${roomHost(room)?.name || "플레이어"}`,
          }),
        ]),
        createElement("strong", {
          className: "postgame-room-card__count",
          text: `${members.length}/${capacity}`,
        }),
        joinButton,
      ]));
    }
  }

  function render(state = {}) {
    latestState = state;
    syncPendingAction(state);
    connectionStatus.textContent = state.error || statusCopy(state.status);
    connectionStatus.dataset.status = state.status ?? "idle";
    const currentRoom = currentRoomFromState(state);
    soloFallbackButton.disabled = Boolean(currentRoom);
    openCreateButton.disabled = Boolean(pendingAction) || state.status !== "connected" || Boolean(currentRoom);
    updateCreateControls();
    const nextSignature = lobbyStateSignature(
      state,
      selectedBattle?.id,
      pendingAction,
      pendingRoomId,
    );
    if (nextSignature !== renderedStateSignature) {
      renderedStateSignature = nextSignature;
      renderMembership(state);
      renderRooms(state);
    }
    renderViews();
  }

  return Object.freeze({
    element,
    open({ battle, spawn = null } = {}) {
      if (!battle?.id) return false;
      const currentRoom = currentRoomFromState(latestState);
      if (currentRoom?.battleId && currentRoom.battleId !== battle.id) return false;
      selectedBattle = battle;
      returnSpawn = spawn;
      if (!currentRoom) roomNameInput.value = "";
      requestedView = currentRoom ? ROOM_LOBBY_VIEWS.WAITING : ROOM_LOBBY_VIEWS.DIRECTORY;
      renderedStateSignature = "";
      renderedView = "";
      closeAfterLeave = false;
      title.textContent = `${battle.title} · 보스방`;
      subtitle.textContent = "같은 보스를 함께 상대할 파티를 만들거나 열린 방에 참가하세요.";
      element.hidden = false;
      element.dataset.open = "true";
      render(latestState);
      focusActiveView();
      return true;
    },
    close({ leave = false } = {}) {
      if (leave && currentRoomFromState(latestState)) onLeave?.();
      finishClose();
      return true;
    },
    render,
    isOpen: () => element.dataset.open === "true",
    getBattle: () => selectedBattle,
    getReturnSpawn: () => returnSpawn,
    getView: () => panel.dataset.view,
  });
}

export {
  MAX_ROOM_CAPACITY,
  MAX_ROOM_NAME_LENGTH,
  MIN_ROOM_CAPACITY,
  ROOM_LOBBY_VIEWS,
  currentRoomFromState,
  normalizeRoomName,
  roomCapacity,
  roomName,
};

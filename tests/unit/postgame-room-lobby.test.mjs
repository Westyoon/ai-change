import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ROOM_CAPACITY,
  MAX_ROOM_NAME_LENGTH,
  MIN_ROOM_CAPACITY,
  ROOM_LOBBY_VIEWS,
  createPostgameRoomLobby,
  currentRoomFromState,
  normalizeRoomName,
  roomCapacity,
  roomName,
} from "../../js/battle/postgame/room-lobby.js";
import { createGuestTestRoomSession } from "../../js/battle/postgame/guest-test-room-session.js";

test("guest test rooms require an explicit room creation and host start", () => {
  const session = createGuestTestRoomSession({
    playerName: "테스트 게스트",
    createId: () => "LOCAL-TEST-1",
  });

  assert.equal(session.startRoom(), null);
  assert.equal(session.createRoom("stat-boss", 9, "  게스트 점검방  "), true);
  assert.equal(session.createRoom("control-boss", 1, "두 번째 방"), false);
  assert.deepEqual(session.getState().currentRoom, {
    id: "LOCAL-TEST-1",
    roomName: "게스트 점검방",
    battleId: "stat-boss",
    capacity: 5,
    hostId: "guest-test-player",
    status: "waiting",
    members: [{ id: "guest-test-player", name: "테스트 게스트" }],
  });

  assert.deepEqual(session.startRoom(), {
    roomId: "LOCAL-TEST-1",
    battleId: "stat-boss",
    selfId: "guest-test-player",
    roster: [{ id: "guest-test-player", name: "테스트 게스트" }],
  });
  assert.equal(session.getState().currentRoom.status, "started");
  assert.equal(session.leaveRoom(), true);
  assert.equal(session.getState().currentRoom, null);
});

class FakeNode {
  constructor() {
    this.parentNode = null;
    this.children = [];
    this.textContent = "";
  }

  append(...children) {
    for (const child of children) {
      if (child == null) continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

class FakeTextNode extends FakeNode {
  constructor(text) {
    super();
    this.textContent = String(text);
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = String(tagName).toUpperCase();
    this.className = "";
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.hidden = false;
    this.type = "";
    this.value = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    if (this.disabled) return;
    for (const listener of this.listeners.get("click") ?? []) {
      listener.call(this, { type: "click", target: this, currentTarget: this });
    }
  }

  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget ??= this;
    for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event);
    return true;
  }
}

function descendants(root, predicate) {
  const matches = [];
  const visit = (node) => {
    for (const child of node.children ?? []) {
      if (predicate(child)) matches.push(child);
      visit(child);
    }
  };
  visit(root);
  return matches;
}

function byClass(root, className) {
  return descendants(root, (node) => (
    node instanceof FakeElement
    && node.className.split(/\s+/u).includes(className)
  ));
}

function button(root, label) {
  return descendants(root, (node) => (
    node instanceof FakeElement
    && node.tagName === "BUTTON"
    && node.textContent === label
  ))[0] ?? null;
}

function installFakeDom() {
  const previous = {
    Node: globalThis.Node,
    document: globalThis.document,
  };
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => new FakeTextNode(text),
  };
  return () => {
    if (previous.Node === undefined) delete globalThis.Node;
    else globalThis.Node = previous.Node;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
  };
}

function room({
  id,
  roomName = "테스트 원정대",
  battleId = "stat-boss",
  capacity = 5,
  hostId = "host",
  members = [{ id: hostId, name: "방장" }],
  status = "waiting",
} = {}) {
  return { id, roomName, battleId, capacity, hostId, members, status };
}

test("solo button creates a one-player room and waits for confirmation before starting once", () => {
  const restore = installFakeDom();
  let lobby;
  try {
    const created = [];
    let starts = 0;
    lobby = createPostgameRoomLobby({
      onCreate: (...args) => { created.push(args); return true; },
      onStart: () => { starts++; return true; },
    });
    lobby.open({ battle: { id: "stat-boss", title: "Stat" } });
    const connected = { status: "connected", selfId: "self", rooms: [] };
    lobby.render(connected);
    const solo = button(lobby.element, "혼자 도전하기");
    assert.equal(solo.hidden, false);
    solo.click();
    assert.deepEqual(created, [["stat-boss", 1, "혼자 도전하기"]]);
    assert.equal(starts, 0);
    const joined = { ...connected, rooms: [room({ id: "solo", capacity: 1, hostId: "self", members: [{ id: "self", name: "Self" }] })] };
    lobby.render(joined);
    assert.equal(starts, 1);
    assert.equal(solo.hidden, true);
    lobby.render(joined);
    assert.equal(starts, 1);
  } finally {
    lobby?.close();
    restore();
  }
});

test("room capacity accepts 1-5 and defaults missing or invalid values to 5", () => {
  assert.equal(MIN_ROOM_CAPACITY, 1);
  assert.equal(MAX_ROOM_CAPACITY, 5);
  assert.equal(roomCapacity({}), 5);
  assert.equal(roomCapacity({ capacity: "not-a-number" }), 5);
  assert.equal(roomCapacity({ capacity: 0 }), 1);
  assert.equal(roomCapacity({ capacity: -4 }), 1);
  assert.equal(roomCapacity({ capacity: 3.9 }), 3);
  assert.equal(roomCapacity({ capacity: 99 }), 5);
});

test("room creation requires a title, defaults to five players, and clamps UI submissions to 1-5", () => {
  const restore = installFakeDom();
  try {
    const created = [];
    const lobby = createPostgameRoomLobby({
      onCreate: (battleId, capacity, roomName) => created.push({ battleId, capacity, roomName }),
    });
    assert.equal(lobby.open({ battle: null }), false);
    assert.equal(lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } }), true);
    lobby.render({ status: "connected", selfId: "self", rooms: [] });
    assert.equal(lobby.getView(), ROOM_LOBBY_VIEWS.DIRECTORY);
    assert.equal(byClass(lobby.element, "postgame-room-lobby__directory")[0].hidden, false);
    assert.equal(button(lobby.element, "새로 고침").hidden, false);
    assert.equal(button(lobby.element, "목록으로").hidden, true);
    button(lobby.element, "방 만들기").click();
    assert.equal(button(lobby.element, "새로 고침").hidden, true);
    assert.equal(button(lobby.element, "방 만들기").hidden, true);
    assert.equal(button(lobby.element, "목록으로").hidden, false);
    assert.equal(lobby.getView(), ROOM_LOBBY_VIEWS.CREATE);
    assert.equal(byClass(lobby.element, "postgame-room-lobby__directory")[0].hidden, true);
    assert.equal(byClass(lobby.element, "postgame-room-lobby__create-view")[0].hidden, false);

    const capacity = byClass(lobby.element, "postgame-room-lobby__capacity")[0];
    const name = byClass(lobby.element, "postgame-room-lobby__name")[0];
    const nameHint = byClass(lobby.element, "postgame-room-lobby__name-hint")[0];
    let create = button(lobby.element, "방 생성");
    assert.equal(capacity.value, "5");
    assert.equal(capacity.disabled, false);
    assert.equal(name.value, "");
    assert.equal(create.disabled, true, "blank room names cannot be submitted");

    name.value = "  스탯 보스 같이 잡아요!  ";
    name.dispatchEvent({ type: "input" });
    assert.equal(create.disabled, false);
    let prevented = false;
    name.dispatchEvent({
      type: "keydown",
      key: "Enter",
      preventDefault: () => { prevented = true; },
    });
    assert.equal(prevented, true, "Enter submits the completed room form");
    assert.equal(created.length, 1);
    assert.equal(button(lobby.element, "생성 중…").disabled, true);
    create.click();
    assert.equal(created.length, 1, "a detached double click cannot send a second create request");

    let errorSequence = 0;
    const rejectPendingCreate = () => {
      errorSequence += 1;
      lobby.render({
        status: "connected",
        selfId: "self",
        rooms: [],
        error: "테스트 요청 거부",
        lastEvent: { type: "error", sequence: errorSequence },
      });
      create = button(lobby.element, "방 생성");
    };
    rejectPendingCreate();
    capacity.value = "1";
    create.click();
    rejectPendingCreate();
    capacity.value = "99";
    create.click();
    rejectPendingCreate();
    capacity.value = "invalid";
    create.click();
    assert.deepEqual(created, [
      { battleId: "stat-boss", capacity: 5, roomName: "스탯 보스 같이 잡아요!" },
      { battleId: "stat-boss", capacity: 1, roomName: "스탯 보스 같이 잡아요!" },
      { battleId: "stat-boss", capacity: 5, roomName: "스탯 보스 같이 잡아요!" },
      { battleId: "stat-boss", capacity: 5, roomName: "스탯 보스 같이 잡아요!" },
    ]);
    rejectPendingCreate();

    name.value = "가".repeat(33);
    name.dispatchEvent({ type: "input" });
    assert.equal(create.disabled, true, "more than 32 Unicode characters cannot be submitted");
    assert.equal(nameHint.dataset.invalid, "true");
    assert.equal(nameHint.textContent, "32자 이하로 입력해 주세요.");

    lobby.render({ status: "reconnecting", selfId: "self", rooms: [] });
    assert.equal(capacity.disabled, true);
    assert.equal(name.disabled, true);
    assert.equal(create.disabled, true);
    create.click();
    assert.equal(created.length, 4);

    button(lobby.element, "목록으로").click();
    assert.equal(lobby.getView(), ROOM_LOBBY_VIEWS.DIRECTORY);
  } finally {
    restore();
  }
});

test("room names normalize safely, cap display text, and retain a legacy fallback", () => {
  assert.equal(MAX_ROOM_NAME_LENGTH, 32);
  assert.equal(normalizeRoomName("  같이   가요\t\n  "), "같이 가요");
  assert.equal(normalizeRoomName("Ａ\u0000 방\u200b"), "A 방");
  assert.equal(normalizeRoomName("가".repeat(33)), "가".repeat(33));
  assert.equal([...normalizeRoomName("😀".repeat(40))].length, 40);
  assert.equal(normalizeRoomName("   "), "");
  assert.equal(roomName({ roomName: "  공개 원정대 " }), "공개 원정대");
  assert.equal([...roomName({ roomName: "😀".repeat(40) })].length, 32);
  assert.equal(roomName({ members: [{ name: "이화" }] }), "이화의 방");
});

test("directory filters by battle and marks full, joined, and current-room states", () => {
  const restore = installFakeDom();
  try {
    const joinedRoomIds = [];
    const lobby = createPostgameRoomLobby({ onJoin: (id) => joinedRoomIds.push(id) });
    lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } });

    const available = room({ id: "available", roomName: "스탯 초행 환영", capacity: undefined });
    const full = room({
      id: "full",
      capacity: 2,
      members: [{ id: "host", name: "방장" }, { id: "guest", name: "참가자" }],
    });
    const another = room({ id: "another", hostId: "other", members: [{ id: "other", name: "다른 방장" }] });
    const started = room({ id: "started", status: "started" });
    const otherBattle = room({ id: "control", battleId: "control-boss" });
    const baseState = {
      status: "connected",
      selfId: "self",
      rooms: [available, full, another, started, otherBattle],
    };
    lobby.render(baseState);

    let cards = byClass(lobby.element, "postgame-room-card");
    assert.equal(cards.length, 3, "started and other-battle rooms stay out of this directory");
    assert.ok(descendants(cards[0], (node) => node.textContent === "스탯 초행 환영").length > 0);
    assert.equal(button(cards[0], "참가").disabled, false);
    assert.equal(button(cards[1], "가득 참").disabled, true);
    assert.equal(
      button(cards[1], "가득 참").attributes.get("aria-label"),
      "테스트 원정대 방 가득 참",
    );
    assert.equal(button(cards[2], "참가").disabled, false);
    assert.ok(descendants(cards[0], (node) => node.textContent === "방장 방장").length > 0);
    assert.ok(descendants(cards[0], (node) => node.textContent === "1/5").length > 0);

    button(cards[0], "참가").click();
    button(cards[1], "가득 참").click();
    assert.deepEqual(joinedRoomIds, ["available"]);

    const joined = {
      ...available,
      hostId: "self",
      members: [{ id: "self", name: "나", hairColor: "brown" }],
    };
    lobby.render({ ...baseState, currentRoom: joined, rooms: [joined, full, another] });
    cards = byClass(lobby.element, "postgame-room-card");
    assert.equal(button(cards[0], "참가 중").disabled, true);
    assert.equal(button(cards[2], "참가").disabled, true, "joining another room is blocked");
    assert.equal(byClass(lobby.element, "postgame-room-lobby__membership")[0].hidden, false);
    assert.equal(lobby.getView(), ROOM_LOBBY_VIEWS.WAITING);
    assert.ok(descendants(
      byClass(lobby.element, "postgame-room-lobby__membership")[0],
      (node) => node.textContent === "스탯 초행 환영",
    ).length > 0);
    assert.ok(descendants(
      byClass(lobby.element, "postgame-room-lobby__membership")[0],
      (node) => node.textContent === "1/5명 · 내가 방장",
    ).length > 0);
    const slots = byClass(lobby.element, "postgame-room-lobby__member-slot");
    assert.equal(slots.length, 5);
    assert.equal(slots[0].dataset.occupied, "true");
    const portrait = byClass(slots[0], "postgame-room-lobby__member-character")[0];
    assert.equal(portrait.dataset.hairColor, "brown");
    assert.ok(portrait.style.backgroundImage.includes("character-hair-colors.png"));
    assert.equal(byClass(slots[0], "postgame-room-lobby__member-name")[0].textContent, "나");
    assert.equal(slots[4].dataset.occupied, "false");
    assert.equal(byClass(lobby.element, "postgame-room-lobby__capacity")[0].disabled, true);
    assert.equal(button(lobby.element, "방 생성").disabled, true);

    assert.equal(currentRoomFromState({ currentRoom: joined, selfId: "self", rooms: [] }), joined);
    assert.equal(currentRoomFromState({ selfId: "self", rooms: [full, joined] }), joined);
  } finally {
    restore();
  }
});

test("a host can start alone while non-hosts only receive the waiting state", () => {
  const restore = installFakeDom();
  try {
    let starts = 0;
    let leaves = 0;
    const lobby = createPostgameRoomLobby({
      onStart: () => { starts += 1; },
      onLeave: () => { leaves += 1; },
    });
    lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } });

    const soloRoom = room({
      id: "solo",
      hostId: "self",
      members: [{ id: "self", name: "나" }],
    });
    lobby.render({ status: "connected", selfId: "self", rooms: [soloRoom], currentRoom: soloRoom });
    const start = button(lobby.element, "전투 시작");
    assert.ok(start);
    assert.equal(start.disabled, false, "one host satisfies the minimum player count");
    start.click();
    assert.equal(button(lobby.element, "시작 중…").disabled, true);
    assert.equal(button(lobby.element, "방 나가기").disabled, true);
    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [soloRoom],
      currentRoom: soloRoom,
      error: "테스트 시작 거부",
      lastEvent: { type: "error", sequence: 1 },
    });
    button(lobby.element, "방 나가기").click();
    assert.equal(starts, 1);
    assert.equal(leaves, 1);
    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [],
      currentRoom: null,
      lastEvent: { type: "room.left", sequence: 2 },
    });

    const emptyHostRoom = room({ id: "empty", hostId: "self", members: [] });
    lobby.render({ status: "connected", selfId: "self", rooms: [emptyHostRoom], currentRoom: emptyHostRoom });
    assert.equal(button(lobby.element, "전투 시작").disabled, true);

    const guestRoom = room({
      id: "guest-room",
      hostId: "host",
      members: [{ id: "host", name: "방장" }, { id: "self", name: "나" }],
    });
    lobby.render({ status: "connected", selfId: "self", rooms: [guestRoom], currentRoom: guestRoom });
    assert.equal(button(lobby.element, "전투 시작"), null);
    assert.equal(byClass(lobby.element, "postgame-room-lobby__waiting")[0].textContent, "방장이 전투를 시작하기를 기다리는 중…");
    assert.equal(starts, 1);
  } finally {
    restore();
  }
});

test("close and leave controls call their callbacks without losing return context", () => {
  const restore = installFakeDom();
  try {
    let leaves = 0;
    const closes = [];
    const battle = { id: "stat-boss", title: "스탯 보스" };
    const spawn = { zone: "plaza", x: 0.5, y: 0.75 };
    const lobby = createPostgameRoomLobby({
      onLeave: () => { leaves += 1; },
      onClose: (context) => closes.push(context),
    });
    lobby.open({ battle, spawn });
    const joined = room({
      id: "joined",
      hostId: "self",
      members: [{ id: "self", name: "나" }],
    });
    lobby.render({ status: "connected", selfId: "self", rooms: [joined], currentRoom: joined });

    button(lobby.element, "닫기").click();
    assert.equal(leaves, 1);
    assert.equal(lobby.isOpen(), true, "close waits for the authoritative room leave acknowledgement");
    assert.equal(button(lobby.element, "닫기").disabled, true);
    assert.deepEqual(closes, []);
    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [],
      currentRoom: null,
      lastEvent: { type: "room.left", sequence: 1 },
    });
    assert.deepEqual(closes, [{ battle, returnSpawn: spawn }]);
    assert.equal(lobby.element.hidden, true);
    assert.equal(lobby.isOpen(), false);
    assert.equal(lobby.getBattle(), battle);
    assert.equal(lobby.getReturnSpawn(), spawn);

    lobby.open({ battle, spawn });
    lobby.render({ status: "connected", selfId: "self", rooms: [joined], currentRoom: joined });
    lobby.close({ leave: true });
    assert.equal(leaves, 2);
    assert.equal(lobby.isOpen(), false);
  } finally {
    restore();
  }
});

test("a failed close-leave send keeps the lobby usable and does not close later", () => {
  const restore = installFakeDom();
  try {
    const closes = [];
    const joined = room({
      id: "joined-room",
      hostId: "self",
      members: [{ id: "self", name: "나" }],
    });
    const lobby = createPostgameRoomLobby({
      onLeave: () => false,
      onClose: (details) => closes.push(details),
    });
    lobby.render({ status: "connected", selfId: "self", rooms: [joined], currentRoom: joined });
    lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } });

    button(lobby.element, "닫기").click();
    assert.equal(lobby.isOpen(), true);
    assert.equal(button(lobby.element, "닫기").disabled, false);

    lobby.render({ status: "connected", selfId: "self", rooms: [], currentRoom: null });
    assert.equal(lobby.isOpen(), true, "a later unrelated room disappearance must not finish the failed close");
    assert.deepEqual(closes, []);
  } finally {
    restore();
  }
});

test("pending room requests unlock after transport interruption or timeout", () => {
  const restore = installFakeDom();
  try {
    let timeoutCallback = null;
    const clearedTimers = [];
    const lobby = createPostgameRoomLobby({
      onCreate: () => true,
      setTimeoutImpl: (callback) => {
        timeoutCallback = callback;
        return 17;
      },
      clearTimeoutImpl: (timer) => clearedTimers.push(timer),
      pendingTimeoutMs: 1_000,
    });
    lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } });
    lobby.render({ status: "connected", selfId: "self", rooms: [] });
    button(lobby.element, "방 만들기").click();
    const name = byClass(lobby.element, "postgame-room-lobby__name")[0];
    name.value = "연결 복구 테스트";
    name.dispatchEvent({ type: "input" });
    button(lobby.element, "방 생성").click();
    assert.equal(button(lobby.element, "생성 중…").disabled, true);

    lobby.render({
      status: "reconnecting",
      selfId: "self",
      rooms: [],
      lastEvent: { type: "presence.update" },
    });
    assert.equal(button(lobby.element, "방 생성").textContent, "방 생성");
    assert.equal(clearedTimers.includes(17), true);

    lobby.render({ status: "connected", selfId: "self", rooms: [] });
    button(lobby.element, "방 생성").click();
    assert.equal(button(lobby.element, "생성 중…").disabled, true);
    timeoutCallback();
    assert.equal(button(lobby.element, "방 생성").disabled, false);
  } finally {
    restore();
  }
});

test("presence-only updates preserve room card DOM identity and accessible join names", () => {
  const restore = installFakeDom();
  try {
    const lobby = createPostgameRoomLobby();
    lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } });
    const available = room({ id: "stable", roomName: "DOM 보존방" });
    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [available],
      players: [],
      lastEvent: { type: "rooms.snapshot" },
    });
    const firstCard = byClass(lobby.element, "postgame-room-card")[0];
    assert.equal(button(firstCard, "참가").attributes.get("aria-label"), "DOM 보존방 방 참가");

    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [available],
      players: [{ id: "moving-user", x: 0.4, y: 0.2 }],
      lastEvent: { type: "presence.updated" },
    });
    assert.equal(byClass(lobby.element, "postgame-room-card")[0], firstCard);
  } finally {
    restore();
  }
});

test("a lobby never labels another boss room as the selected boss", () => {
  const restore = installFakeDom();
  try {
    const lobby = createPostgameRoomLobby();
    const activeControlRoom = room({
      id: "control-active",
      roomName: "컨트롤 파티",
      battleId: "control-boss",
      hostId: "self",
      members: [{ id: "self", name: "나" }],
    });
    lobby.render({
      status: "connected",
      selfId: "self",
      rooms: [activeControlRoom],
      currentRoom: activeControlRoom,
    });
    assert.equal(lobby.open({ battle: { id: "stat-boss", title: "스탯 보스" } }), false);
    assert.equal(lobby.isOpen(), false);
    assert.equal(lobby.open({ battle: { id: "control-boss", title: "컨트롤 보스" } }), true);
    assert.equal(lobby.getView(), ROOM_LOBBY_VIEWS.WAITING);
  } finally {
    restore();
  }
});

test("a disconnected player cannot bypass the room flow with a solo fallback", () => {
  const restore = installFakeDom();
  try {
    const battle = { id: "stat-boss", title: "스탯 보스" };
    const spawn = { zone: "plaza", x: 0.5, y: 0.75 };
    const lobby = createPostgameRoomLobby();
    lobby.open({ battle, spawn });
    lobby.render({ status: "reconnecting", selfId: "self", rooms: [] });

    const solo = button(lobby.element, "서버 없이 혼자 입장");
    assert.equal(solo, null);
    assert.equal(lobby.isOpen(), true);
    assert.match(byClass(lobby.element, "postgame-room-lobby__connection")[0].textContent, /연결을 복구/u);
  } finally {
    restore();
  }
});

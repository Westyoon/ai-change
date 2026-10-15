import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createStoryEndingScene } from "../../js/scenes/story-ending-scene.js";
import { wishCard, createWishList } from "../../js/ui/wish-board.js";
import { GUARDIAN_EGGS } from "../../js/core/guardian-inventory.js";
import { isFestivalOpen } from "../../js/core/story-progress.js";

class Element {
  constructor(tag) { this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } }; this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = new Map(); this.attributes = {}; this.textContent = ""; this.className = ""; this.value = ""; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, handler) { const list = this.listeners.get(type) ?? []; list.push(handler); this.listeners.set(type, list); }
  removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler)); }
  async dispatch(type) { for (const handler of [...(this.listeners.get(type) ?? [])]) await handler({ type, detail: 1, preventDefault() {} }); }
  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (selector.startsWith(".") ? child.className.split(" ").includes(selector.slice(1)) : child.tagName === selector) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function environment() {
  const keys = ["Node", "document", "setTimeout", "clearTimeout"];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const timers = new Map(); let id = 0;
  globalThis.Node = Element;
  globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => Object.assign(new Element("text"), { textContent: text }) };
  globalThis.setTimeout = (handler) => { timers.set(++id, handler); return id; };
  globalThis.clearTimeout = (key) => timers.delete(key);
  return { timers, step() { const first = timers.entries().next().value; assert.ok(first); timers.delete(first[0]); first[1](); }, restore() { for (const key of keys) globalThis[key] = previous[key]; } };
}

const document = JSON.parse(await readFile(new URL("../../data/scripts/npc-dialogues.json", import.meta.url), "utf8"));
function context({ open = false, submit } = {}) {
  const seen = ["main-story-outro", ...(open ? ["festival-open"] : [])];
  const navigation = [];
  return { seen, navigation, context: {
    content: { scripts: document.scripts },
    services: {
      save: { getState: () => ({ story: { seenStoryIds: seen } }), markStorySeen: (id) => { if (!seen.includes(id)) seen.push(id); } },
      account: { getState: () => ({ authenticated: false }) },
      wishes: { submit: submit ?? (async (text, options) => ({ id: "wish", nickname: "꿈꾸는 이화인", text, department: options.department })), list: async () => ({ wishes: [], nextCursor: null }) },
    },
    router: { navigate: (id) => { navigation.push(id); return Promise.resolve(true); } },
  } };
}
async function advance(root, count) { const dialogue = root.querySelector(".story-dialogue-scene"); assert.ok(dialogue); for (let i = 0; i < count; i++) await dialogue.dispatch("click"); }

test("the ending shows its last monologue, fades to white, and automatically opens the festival", async () => {
  const env = environment(); const state = context(); const root = new Element("main");
  const scene = createStoryEndingScene(state.context); const abort = new AbortController();
  try {
    scene.mount(root, {}, { signal: abort.signal });
    const stage = root.querySelector(".story-ending");
    assert.equal(stage.dataset.phase, "recovery");
    assert.equal(stage.querySelectorAll(".story-ending__lock").length, 1, "the flower lock is a single object");
    await advance(root, 4); assert.equal(stage.dataset.phase, "unlocking");
    assert.equal(root.querySelector(".story-dialogue-scene"), null);
    env.step(); await advance(root, 3);
    assert.equal(stage.dataset.phase, "embryo");
    await advance(root, 2);
    assert.equal(stage.dataset.phase, "wish");
    assert.equal(isFestivalOpen(state.context), false);
    const department = root.querySelector(".wish-department-select"); department.value = "DS"; await department.dispatch("change");
    const input = root.querySelector("textarea");
    assert.equal(input.attributes.placeholder, "이번 학기엔 나에게 조금 더 다정해지고 싶어.");
    input.value = "나에게 다정해지고 싶어."; await input.dispatch("input");
    await root.querySelector("form").dispatch("submit");
    assert.equal(stage.dataset.phase, "wish-sent");
    assert.equal(isFestivalOpen(state.context), false);
    env.step(); await advance(root, 4);
    assert.equal(root.querySelector(".dialogue-text").textContent, "우리의 꿈은, 여기서 다시 시작된다.");
    assert.equal(root.querySelector(".story-ending__last-line"), null);
    assert.equal(isFestivalOpen(state.context), false);
    assert.equal(root.querySelectorAll("button").some(item => item.textContent.includes("\uCD95\uC81C \uC990\uAE30\uB7EC \uAC00\uAE30")), false);
    assert.deepEqual(state.navigation, []);
    env.step();
    assert.equal(stage.dataset.returningToFestival, "true");
    assert.equal(isFestivalOpen(state.context), false);
    assert.deepEqual(state.navigation, []);
    env.step();
    assert.equal(isFestivalOpen(state.context), true);
    assert.deepEqual(state.navigation, ["main-menu"]);
  } finally { scene.unmount(); abort.abort(); env.restore(); }
});

test("failed wishes retain text and the same retry id, without opening the festival", async () => {
  const env = environment(); const calls = [];
  const state = context({ submit: async (text, options) => { calls.push({ text, ...options }); throw new Error("다시 시도해 주세요."); } });
  const root = new Element("main"); const scene = createStoryEndingScene(state.context);
  try {
    scene.mount(root); await advance(root, 4); env.step(); await advance(root, 3); await advance(root, 2);
    const department = root.querySelector(".wish-department-select"); department.value = "DS"; await department.dispatch("change");
    const input = root.querySelector("textarea"); input.value = "내 꿈"; await input.dispatch("input");
    const form = root.querySelector("form"); await form.dispatch("submit"); await form.dispatch("submit");
    assert.equal(input.value, "내 꿈"); assert.equal(calls.length, 2);
    assert.equal(calls[0].requestId, calls[1].requestId);
    assert.equal(isFestivalOpen(state.context), false);
    assert.equal(env.timers.size, 0);
  } finally { scene.unmount(); env.restore(); }
});

test("revisiting shows the board; leaving an ending cancels its pending scene transition", async () => {
  const env = environment(); const state = context({ open: true }); const root = new Element("main");
  const scene = createStoryEndingScene(state.context);
  try {
    scene.mount(root); await Promise.resolve(); await Promise.resolve();
    assert.ok(root.querySelector(".wish-board")); assert.equal(root.querySelector(".story-dialogue-scene"), null);
    assert.equal(root.querySelector(".story-ending__hero"), null);
    assert.equal(root.querySelector(".embryo-art"), null);
    assert.equal(root.querySelectorAll("button").some(item => item.textContent === "축제 즐기러 가기"), false);
    const panel = root.querySelector(".wish-board-scene__composer");
    const write = root.querySelectorAll("button").find(item => item.textContent === "새로운 소원 말하기");
    assert.equal(panel.hidden, true);
    assert.equal(write.attributes["aria-expanded"], "false");
    await write.dispatch("click");
    assert.equal(panel.hidden, false);
    assert.equal(write.attributes["aria-expanded"], "true");
    const department = root.querySelector(".wish-department-select"); department.value = "DS"; await department.dispatch("change");
    const input = root.querySelector("textarea"); input.value = "<img src=x onerror=alert(1)>";
    await root.querySelectorAll("button").find(item => item.textContent === "닫기").dispatch("click");
    assert.equal(panel.hidden, true);
    await write.dispatch("click");
    assert.equal(input.value, "<img src=x onerror=alert(1)>");
    assert.ok(root.querySelectorAll("button").some(item => item.textContent === "메모지 붙이기"));
    await root.querySelector("form").dispatch("submit");
    assert.equal(root.querySelector(".wish-card__text").textContent, "<img src=x onerror=alert(1)>");
    assert.equal(panel.hidden, true);
    assert.equal(write.attributes["aria-expanded"], "false");
    assert.deepEqual(state.navigation, []);
  } finally { scene.unmount(); env.restore(); }
  const next = environment(); const pending = context(); const second = createStoryEndingScene(pending.context); const container = new Element("main");
  try { second.mount(container); await advance(container, 4); assert.equal(next.timers.size, 1); second.unmount(); assert.equal(next.timers.size, 0); }
  finally { second.unmount(); next.restore(); }
});

test("department notes use their guardian egg colors and stale filter responses cannot replace the board", async () => {
  const env = environment();
  try {
    for (const egg of GUARDIAN_EGGS) {
      const card = wishCard({ id: egg.departmentCode, department: egg.departmentCode, nickname: "student", text: "wish" });
      assert.equal(card.style["--note-color"], egg.color);
    }
    const pending = [];
    const list = createWishList({ service: { list: options => new Promise(resolve => pending.push({ options, resolve })) } });
    const filter = list.element.querySelector("select"); filter.value = "AI"; await filter.dispatch("change");
    assert.equal(pending[1].options.department, "AI");
    pending[1].resolve({ wishes: [{ id: "new", department: "AI", text: "new wish", nickname: "student" }], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    pending[0].resolve({ wishes: [{ id: "old", department: "DS", text: "old wish", nickname: "student" }], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(list.element.querySelectorAll(".wish-card").length, 1);
    assert.equal(list.element.querySelector(".wish-card__text").textContent, "new wish");
    list.destroy();
  } finally { env.restore(); }
});

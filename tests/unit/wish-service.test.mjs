import assert from "node:assert/strict";
import test from "node:test";
import { WishService, normalizeWishText } from "../../js/core/wish-service.js";

test("wish text allows small wishes, Unicode and newlines, and rejects empty or oversized input", () => {
  assert.equal(normalizeWishText("  나에게\n다정해지고 싶어.  "), "나에게\n다정해지고 싶어.");
  assert.equal(normalizeWishText("😀".repeat(300)), "😀".repeat(300));
  for (const input of ["  ", "😀".repeat(301), "숨은\u200b글자", "\u0000", null]) assert.equal(normalizeWishText(input), null);
});

test("wish service persists only text and a retry key and exposes only public board fields", async () => {
  const calls = [];
  const wish = { id: "wish", nickname: "이화", text: "내 꿈", department: "DS", rate_key: "private", email: "hidden@example.test" };
  const service = new WishService({ fetchImpl: async (path, options) => {
    calls.push({ path, options });
    return { ok: true, json: async () => options.method === "POST" ? { wish } : { wishes: [wish], nextCursor: "123:uuid" } };
  } });
  const posted = await service.submit(" 내 꿈 ", { requestId: "retry-key", department: "DS" });
  assert.deepEqual(posted, { id: "wish", nickname: "이화", text: "내 꿈", department: "DS" });
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: "내 꿈", requestId: "retry-key", department: "DS" });
  assert.equal(calls[0].options.credentials, "same-origin");
  const page = await service.list({ after: "123:uuid" });
  assert.equal(calls[1].path, "/api/wishes?after=123%3Auuid");
  assert.deepEqual(page.wishes, [posted]);
  assert.equal(page.nextCursor, "123:uuid");
});

test("server failures never report that an unsaved wish was delivered", async () => {
  const service = new WishService({ fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(service.submit("내 꿈", { requestId: "retry-key", department: "DS" }), /잠깐 쉬었다가/u);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(service.list({ signal: abort.signal }), { name: "AbortError" });
});

test("department filters are encoded and invalid departments never reach the server", async () => {
  const calls = [];
  const service = new WishService({ fetchImpl: async (path) => { calls.push(path); return { ok: true, json: async () => ({ wishes: [], nextCursor: null }) }; } });
  await service.list({ department: "CSE" });
  assert.equal(calls[0], "/api/wishes?department=CSE");
  await assert.rejects(service.submit("?", { department: "OTHER" }));
  await assert.rejects(service.list({ department: "OTHER" }));
  assert.equal(calls.length, 1);
});

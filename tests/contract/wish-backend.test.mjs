import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFile(new URL(`../../backend/${path}`, import.meta.url), "utf8");
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
let source = await read("src/index.ts");
source = source.replace(/^export \{ PostgameCoordinator \} from "\.\/postgame-coordinator";\s*/u, "");
for (const name of ["progression", "wishes"]) source = source.replace(`"./${name}"`, JSON.stringify(moduleUrl(await read(`src/${name}.ts`))));
const worker = (await import(moduleUrl(source))).default;
const wishRules = await import(moduleUrl(await read("src/wishes.ts")));
const migration = await read("migrations/0012_wish_board.sql");
const departmentMigration = await read("migrations/0013_wish_departments.sql");
const bossMigration = await read("migrations/0009_boss_rankings.sql");
const origin = "https://game.example.test";

test("ranking window ordering uses source columns and selects latest or fastest team run", async () => {
  const { db, request } = harness();
  try {
    db.exec(bossMigration);
    const insert = db.prepare("INSERT INTO boss_runs (id, room_id, boss_id, party_key, team_name, party_size, clear_time_ms, created_at) VALUES (?, ?, 'stat-boss', 'team', 'Team', 1, ?, ?)");
    insert.run("first", "room-first", 1000, "2026-10-01");
    insert.run("latest", "room-latest", 2000, "2026-10-02");
    for (const [criteria, expectedTime] of [["boss-clears", 2000], ["boss-speed", 1000]]) {
      const response = await request(`/api/ranking?bossId=stat-boss&criteria=${criteria}`);
      assert.equal(response.status, 200);
      const rows = await response.json();
      assert.equal(rows.length, 1); assert.equal(rows[0].clears, 2);
      assert.equal(rows[0].clearTimeMs, expectedTime);
    }
  } finally { db.close(); }
});

function harness(session = null) {
  const db = new DatabaseSync(":memory:"); db.exec(migration); db.exec(departmentMigration);
  const env = { PUBLIC_ORIGIN: origin, DB: { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      first() { return sql.includes("SELECT s.user_id") ? session : db.prepare(sql).get(...args) ?? null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
  } } };
  const request = (path, body, headers = {}) => worker.fetch(new Request(origin + path, {
    method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { db, request };
}

test("wish backend supports guests, stores once on retry, throttles bursts, and returns only public fields", async () => {
  const { db, request } = harness();
  try {
    const body = { text: " 나에게 다정해지고 싶어. ", department: "DS", requestId: crypto.randomUUID() };
    const first = await request("/api/wishes", body); assert.equal(first.status, 201);
    const posted = (await first.json()).wish;
    assert.deepEqual(Object.keys(posted).sort(), ["department", "id", "nickname", "text"]);
    assert.equal(posted.nickname, "꿈꾸는 이화인"); assert.equal(posted.text, body.text.trim());
    const repeated = await request("/api/wishes", body); assert.equal(repeated.status, 200);
    assert.deepEqual((await repeated.json()).wish, posted);
    assert.equal(db.prepare("SELECT count(*) AS n FROM wish_posts").get().n, 1);
    assert.equal((await request("/api/wishes", { ...body, text: "바뀐 내용" })).status, 409);
    const page = await (await request("/api/wishes")).json();
    assert.deepEqual(page, { wishes: [posted], nextCursor: null });
    // Several festival visitors can share campus Wi-Fi without blocking each other.
    for (let i = 1; i < 20; i++) assert.equal((await request("/api/wishes", { text: `다른 꿈 ${i}`, department: "DS", requestId: crypto.randomUUID() })).status, 201);
    assert.equal((await request("/api/wishes", { text: "연속 소원", department: "DS", requestId: crypto.randomUUID() })).status, 429);
  } finally { db.close(); }
});

test("signed-in wishes use the configured nickname and never publish a Google name or account id", async () => {
  const { db, request } = harness({ user_id: "private-account", nickname: "이화", name: "private@example.test", hair_color: "purple", expires_at: Date.now() });
  try {
    const response = await request("/api/wishes", { text: "내 꿈", department: "DS", requestId: crypto.randomUUID() }, { Cookie: "__Host-ai-change-session=valid-session" });
    assert.equal(response.status, 201);
    const posted = await response.json(); assert.equal(posted.wish.nickname, "이화");
    assert.doesNotMatch(JSON.stringify(posted), /private-account|private@example/u);
    assert.equal((await request("/api/wishes", { text: "연속 소원", department: "DS", requestId: crypto.randomUUID() }, { Cookie: "__Host-ai-change-session=valid-session" })).status, 429);
  } finally { db.close(); }
});

test("wish mutations reject foreign origins, extra identity fields, invalid IDs and oversize text", async () => {
  const { db, request } = harness();
  try {
    const body = { text: "꿈", department: "DS", requestId: crypto.randomUUID() };
    assert.equal((await request("/api/wishes", body, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await request("/api/wishes", body, { "Content-Type": "text/plain" })).status, 415);
    for (const invalid of [{ ...body, userId: "other" }, { ...body, nickname: "다른 사람" }, { ...body, text: "😀".repeat(301) }, { ...body, requestId: "wrong" }, { ...body, text: " " }, { ...body, department: "OTHER" }, { ...body, department: null }]) {
      assert.equal((await request("/api/wishes", invalid)).status, 400);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM wish_posts").get().n, 0);
    assert.equal(wishRules.normalizeWish("😀".repeat(300)), "😀".repeat(300));
    assert.equal(wishRules.normalizeWish("꿈\u200b"), null);
  } finally { db.close(); }
});

test("wish pages use stable ordering without skipping posts sharing the same timestamp", async () => {
  const { db, request } = harness();
  try {
    const insert = db.prepare("INSERT INTO wish_posts (id, nickname, body, created_at, rate_key) VALUES (?, ?, ?, ?, ?)");
    for (let i = 0; i < 25; i++) insert.run(crypto.randomUUID(), "이화", `소원 ${i}`, 100, "rate");
    const first = await (await request("/api/wishes")).json();
    assert.equal(first.wishes.length, 20); assert.ok(first.nextCursor);
    const second = await (await request(`/api/wishes?after=${encodeURIComponent(first.nextCursor)}`)).json();
    assert.equal(second.wishes.length, 5); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.wishes, ...second.wishes].map((wish) => wish.id)).size, 25);
    assert.equal((await request("/api/wishes?after=wrong")).status, 400);
  } finally { db.close(); }
});

test("department migration preserves legacy wishes and filtering paginates only the selected department", async () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec(migration);
    legacy.prepare("INSERT INTO wish_posts VALUES (?, ?, ?, ?, ?)").run("legacy", "student", "legacy wish", 1, "rate");
    legacy.exec(departmentMigration);
    assert.equal(legacy.prepare("SELECT body, department FROM wish_posts").get().body, "legacy wish");
    assert.equal(legacy.prepare("SELECT department FROM wish_posts").get().department, null);
  } finally { legacy.close(); }
  const { db, request } = harness();
  try {
    const insert = db.prepare("INSERT INTO wish_posts (id, nickname, body, department, created_at, rate_key) VALUES (?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < 25; i++) {
      insert.run(crypto.randomUUID(), "student", `wish ${i}`, "CSE", 100, "rate");
      insert.run(crypto.randomUUID(), "student", `wish ${i}`, "AI", 100, "rate");
    }
    const first = await (await request("/api/wishes?department=CSE")).json();
    const second = await (await request(`/api/wishes?department=CSE&after=${encodeURIComponent(first.nextCursor)}`)).json();
    assert.equal(first.wishes.length, 20); assert.equal(second.wishes.length, 5);
    assert.ok([...first.wishes, ...second.wishes].every(wish => wish.department === "CSE"));
    assert.equal(new Set([...first.wishes, ...second.wishes].map(wish => wish.id)).size, 25);
    assert.equal((await request("/api/wishes?department=OTHER")).status, 400);
    const body = { text: "wish", department: "DS", requestId: crypto.randomUUID() };
    assert.equal((await request("/api/wishes", body)).status, 201);
    assert.equal((await request("/api/wishes", { ...body, department: "AI" })).status, 409);
  } finally { db.close(); }
});

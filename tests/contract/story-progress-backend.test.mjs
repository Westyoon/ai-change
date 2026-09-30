import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u"));
  assert.notEqual(start, -1, `missing Worker function: ${name}`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

const [worker, schema, initialMigration, storyMigration] = await Promise.all([
  read("backend/src/index.ts"),
  read("backend/schema.sql"),
  read("backend/migrations/0001_initial.sql"),
  read("backend/migrations/0007_story_progress.sql"),
]);

test("story progress is account scoped, allowlisted, idempotent, and returned with the session", () => {
  const importer = functionBody(worker, "importStoryProgress");
  const account = functionBody(worker, "authenticatedAccountResponse");

  assert.match(importer, /requireMutationRequest\s*\(\s*request\s*,\s*origin\s*\)/u);
  assert.match(importer, /requireSession\s*\(\s*request\s*,\s*env\s*\)/u);
  assert.match(importer, /ALLOWED_STORY_IDS\.has\s*\(\s*storyId\s*\)/u);
  assert.match(worker, /ALLOWED_STORY_IDS\s*=\s*new\s+Set\([\s\S]*?["']main-story-outro["']/u);
  for (const storyId of ["ds", "cs", "cse", "ai", "aids"]) {
    assert.match(worker, new RegExp(`["']afterstory:${storyId}["']`, "u"));
  }
  assert.match(importer, /INSERT\s+OR\s+IGNORE\s+INTO\s+story_progress/iu);
  assert.match(importer, /session\.user_id/u);
  assert.doesNotMatch(importer, /body\.(?:userId|user_id|email)\b/u);
  assert.match(account, /seenStoryIds/u);
  assert.match(worker, /url\.pathname\s*===\s*["']\/api\/story-progress["']/u);
});

test("story progress schema keeps one row per account and cascades on account deletion", () => {
  for (const source of [schema, storyMigration]) {
    assert.match(source, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?story_progress/iu);
    assert.match(source, /PRIMARY\s+KEY\s*\(\s*user_id\s*,\s*story_id\s*\)/iu);
    assert.match(source, /REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/iu);
  }

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(initialMigration);
    database.exec(storyMigration);
    database.exec("INSERT INTO users (id, email, name) VALUES ('u1', 'u1@example.com', 'U1')");
    database.exec("INSERT INTO story_progress (user_id, story_id) VALUES ('u1', 'npc-ds')");
    database.exec("INSERT OR IGNORE INTO story_progress (user_id, story_id) VALUES ('u1', 'npc-ds')");
    assert.equal(database.prepare(
      "SELECT COUNT(*) AS count FROM story_progress WHERE user_id = 'u1'",
    ).get().count, 1);
    database.exec("DELETE FROM users WHERE id = 'u1'");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM story_progress").get().count, 0);
  } finally {
    database.close();
  }
});

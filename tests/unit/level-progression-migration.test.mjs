import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migration(name) {
  return readFile(new URL(`../../backend/migrations/${name}`, import.meta.url), "utf8");
}

test("level migration backfills legacy clears without duplicating awarded points", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(await migration("0001_initial.sql"));
    database.exec(await migration("0002_secure_sessions_and_results.sql"));
    database.exec(`
      INSERT INTO users (id, email, name) VALUES
        ('new', 'new@example.com', 'New'),
        ('mid', 'mid@example.com', 'Mid'),
        ('cap', 'cap@example.com', 'Cap');
      INSERT INTO stats (user_id, hp, clears, unspent_points) VALUES
        ('new', 100, 0, 0),
        ('mid', 100, 3, 1),
        ('cap', 100, 14, 7);
    `);

    database.exec(await migration("0003_level_progression.sql"));

    const rows = database.prepare(
      `SELECT user_id, clears, level, experience, unspent_points
         FROM stats
        ORDER BY user_id`,
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { user_id: "cap", clears: 14, level: 10, experience: 900, unspent_points: 7 },
      { user_id: "mid", clears: 3, level: 4, experience: 300, unspent_points: 1 },
      { user_id: "new", clears: 0, level: 1, experience: 0, unspent_points: 0 },
    ]);
    assert.throws(
      () => database.exec("UPDATE stats SET level = 11 WHERE user_id = 'new'"),
      /CHECK constraint failed/u,
    );
    assert.throws(
      () => database.exec("UPDATE stats SET experience = 901 WHERE user_id = 'new'"),
      /CHECK constraint failed/u,
    );
  } finally {
    database.close();
  }
});

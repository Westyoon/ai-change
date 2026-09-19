import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migration(name) {
  return readFile(new URL(`../../backend/migrations/${name}`, import.meta.url), "utf8");
}

test("level migrations preserve legacy points and safely remove the temporary cap", async () => {
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

    database.exec(await migration("0004_unbounded_level_progression.sql"));

    assert.deepEqual(database.prepare(
      `SELECT user_id, clears, level, experience, unspent_points
         FROM stats
        ORDER BY user_id`,
    ).all().map((row) => ({ ...row })), rows);

    database.exec("UPDATE stats SET level = 11, experience = 1000 WHERE user_id = 'new'");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT level, experience FROM stats WHERE user_id = 'new'",
      ).get() },
      { level: 11, experience: 1000 },
    );
    assert.throws(
      () => database.exec("UPDATE stats SET level = 0 WHERE user_id = 'new'"),
      /CHECK constraint failed/u,
    );
    assert.throws(
      () => database.exec("UPDATE stats SET experience = -1 WHERE user_id = 'new'"),
      /CHECK constraint failed/u,
    );

    const indexes = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'stats'",
    ).all().map((row) => row.name);
    assert.ok(indexes.includes("idx_stats_score"));
    assert.ok(indexes.includes("idx_stats_clears"));

    database.exec("DELETE FROM users WHERE id = 'new'");
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM stats WHERE user_id = 'new'").get().count,
      0,
      "rebuilt stats table keeps ON DELETE CASCADE",
    );
  } finally {
    database.close();
  }
});

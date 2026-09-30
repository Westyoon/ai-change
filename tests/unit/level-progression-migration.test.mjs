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

test("HP baseline migration preserves stats while normalizing legacy zero rows", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(await migration("0001_initial.sql"));
    database.exec(await migration("0002_secure_sessions_and_results.sql"));
    database.exec(`
      INSERT INTO users (id, email, name) VALUES
        ('legacy', 'legacy@example.com', 'Legacy'),
        ('grown', 'grown@example.com', 'Grown');
      INSERT INTO stats (user_id, attack, hp, defense, clears, score, unspent_points) VALUES
        ('legacy', 2, 0, 3, 4, 50, 1),
        ('grown', 5, 107, 6, 7, 80, 2);
    `);
    database.exec(await migration("0003_level_progression.sql"));
    database.exec(await migration("0004_unbounded_level_progression.sql"));
    database.exec(await migration("0006_hp_baseline.sql"));

    assert.deepEqual(database.prepare(
      `SELECT user_id, attack, hp, defense, clears, score, unspent_points
         FROM stats
        ORDER BY user_id`,
    ).all().map((row) => ({ ...row })), [
      { user_id: "grown", attack: 5, hp: 107, defense: 6, clears: 7, score: 80, unspent_points: 2 },
      { user_id: "legacy", attack: 2, hp: 100, defense: 3, clears: 4, score: 50, unspent_points: 1 },
    ]);

    database.exec(await migration("0008_hp_stat_unit.sql"));
    assert.deepEqual(database.prepare(
      `SELECT user_id, attack, hp, defense, clears, score, unspent_points
         FROM stats
        ORDER BY user_id`,
    ).all().map((row) => ({ ...row })), [
      { user_id: "grown", attack: 5, hp: 800, defense: 6, clears: 7, score: 80, unspent_points: 2 },
      { user_id: "legacy", attack: 2, hp: 100, defense: 3, clears: 4, score: 50, unspent_points: 1 },
    ]);

    database.exec("INSERT INTO users (id, email) VALUES ('defaulted', 'defaulted@example.com')");
    database.exec("INSERT INTO stats (user_id) VALUES ('defaulted')");
    assert.equal(database.prepare("SELECT hp FROM stats WHERE user_id = 'defaulted'").get().hp, 100);
    assert.throws(
      () => database.exec("UPDATE stats SET hp = 99 WHERE user_id = 'grown'"),
      /CHECK constraint failed/u,
    );

    database.exec("DELETE FROM users WHERE id = 'legacy'");
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM stats WHERE user_id = 'legacy'").get().count,
      0,
      "rebuilt stats table keeps ON DELETE CASCADE",
    );
  } finally {
    database.close();
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFile(new URL(`../../backend/src/${path}`, import.meta.url), "utf8");
const progression = await read("progression.ts");
const values = await import(`data:text/javascript;base64,${Buffer.from(progression).toString("base64")}`);

test("random clear rewards cover all eleven 10-XP steps including both endpoints", () => {
  const rewards = Array.from({ length: 11 }, (_, index) =>
    values.createPostgameReward(() => (index + 0.5) / 11).EXPERIENCE_PER_POSTGAME_CLEAR);
  assert.deepEqual(rewards, Array.from({ length: 11 }, (_, index) => 100 + index * 10));
  assert.equal(values.createPostgameReward(() => 0).EXPERIENCE_PER_POSTGAME_CLEAR, 100);
  assert.equal(values.createPostgameReward(() => 0.999999).EXPERIENCE_PER_POSTGAME_CLEAR, 200);
});

test("increasing-XP migration preserves earned levels, points and progress within the level", async () => {
  const migration = await readFile(new URL("../../backend/migrations/0014_increasing_level_experience.sql", import.meta.url), "utf8");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE stats (level INTEGER, experience INTEGER, unspent_points INTEGER, updated_at TEXT);
      INSERT INTO stats VALUES (1, 80, 0, NULL), (2, 160, 1, NULL), (15, 1440, 3, NULL);`);
    db.exec(migration);
    assert.deepEqual(db.prepare("SELECT level, experience, unspent_points FROM stats").all().map(row => ({ ...row })), [
      { level: 1, experience: 80, unspent_points: 0 },
      { level: 2, experience: 160, unspent_points: 1 },
      { level: 15, experience: 10540, unspent_points: 3 },
    ]);
  } finally { db.close(); }
});

for (const path of ["index.ts", "postgame-coordinator.ts"]) {
  const source = await read(path);
  const template = [...source.matchAll(/`(UPDATE stats[\s\S]*?)`/gu)]
    .map((match) => match[1]).find((sql) => sql.includes("POSTGAME_LEVEL_GAIN_SQL"));
  assert.ok(template, `${path}: missing reward statement`);
  for (const reward of [100, 150, 200]) {
  const rewardValues = values.createPostgameReward(() => ((reward - 100) / 10 + 0.5) / 11);
  const sql = template.replace(/\$\{(\w+)\}/gu, (_, key) => rewardValues[key]);

  test(`${path} (${reward} XP): level costs rise by 100 XP, and duplicate clears never award twice`, () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE stats (user_id TEXT, clears INTEGER, experience INTEGER,
        level INTEGER, unspent_points INTEGER, updated_at TEXT);
        CREATE TABLE postgame_results (user_id TEXT, attempt_id TEXT, content_id TEXT, awarded INTEGER);`);
      const award = db.prepare(sql);
      for (const [initialXp, initialLevel, initialPoints] of [[0, 1, 0], [5500, 11, 3], [90, 1, 0], [290, 2, 1], [590, 3, 2]]) {
        db.exec("DELETE FROM stats; DELETE FROM postgame_results;");
        db.prepare("INSERT INTO stats VALUES ('u', 0, ?, ?, ?, NULL)").run(initialXp, initialLevel, initialPoints);
        for (let count = 1; count <= 30; count++) {
          const attempt = `attempt-${count}`;
          db.prepare("INSERT INTO postgame_results VALUES ('u', ?, 'game', 0)").run(attempt);
          assert.equal(award.run("u", "u", attempt, "game").changes, 1);
          db.prepare("UPDATE postgame_results SET awarded = 1 WHERE attempt_id = ?").run(attempt);
          assert.equal(award.run("u", "u", attempt, "game").changes, 0);
          const row = db.prepare("SELECT * FROM stats").get();
          const gainedLevel = 1 + Math.floor((Math.sqrt(1 + 8 * (initialXp + count * reward) / 100) - 1) / 2);
          const gain = gainedLevel - initialLevel;
          assert.equal(row.experience, initialXp + count * reward);
          assert.equal(row.level, initialLevel + gain);
          assert.equal(row.unspent_points, initialPoints + gain);
          assert.equal(row.clears, count);
        }
      }
    } finally {
      db.close();
    }
  });
}

}

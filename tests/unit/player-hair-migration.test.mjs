import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("hair migration preserves accounts and accepts only the four supplied colors", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(await readFile(new URL("../../backend/migrations/0001_initial.sql", import.meta.url), "utf8"));
    database.exec("INSERT INTO users (id, email, name) VALUES ('player', 'hidden@example.test', '이화')");
    database.exec(await readFile(new URL("../../backend/migrations/0011_player_hair_color.sql", import.meta.url), "utf8"));
    const row = database.prepare("SELECT name, hair_color FROM users WHERE id = 'player'").get();
    assert.equal(row.name, "이화");
    assert.equal(row.hair_color, null);
    for (const color of ["magenta", "purple", "brown", "blonde"]) {
      database.prepare("UPDATE users SET hair_color = ? WHERE id = 'player'").run(color);
      assert.equal(database.prepare("SELECT hair_color FROM users WHERE id = 'player'").get().hair_color, color);
    }
    assert.throws(() => database.exec("UPDATE users SET hair_color = 'unknown'"), /CHECK constraint/u);
  } finally { database.close(); }
});

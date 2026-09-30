import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [worker, schema, migration, accountScene, playerConfig, statBossData, controlBossData] = await Promise.all([
  readFile(new URL("../../backend/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../backend/schema.sql", import.meta.url), "utf8"),
  readFile(new URL("../../backend/migrations/0008_hp_stat_unit.sql", import.meta.url), "utf8"),
  readFile(new URL("../../js/scenes/account-scene.js", import.meta.url), "utf8"),
  readFile(new URL("../../js/battle/player-config.js", import.meta.url), "utf8"),
  readFile(new URL("../../data/battle/stat-boss.json", import.meta.url), "utf8"),
  readFile(new URL("../../data/battle/control-boss.json", import.meta.url), "utf8"),
]);

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u"));
  assert.notEqual(start, -1, `missing function ${name}`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("D1 stores HP as the actual 100-point maximum-health value", () => {
  const allocation = functionBody(worker, "allocateStat");
  assert.match(worker, /COMBAT_HP_PER_POINT\s*=\s*100/u);
  assert.match(
    allocation,
    /hp\s*=\s*COALESCE\(hp,\s*\$\{BASE_COMBAT_HP\}\)\s*\+\s*CASE\s+WHEN\s+\?\s*=\s*['"]hp['"]\s+THEN\s+\$\{COMBAT_HP_PER_POINT\}/u,
  );
  assert.match(schema, /hp\s+INTEGER[^\n]*DEFAULT\s+100[^\n]*hp\s*%\s*100\s*=\s*0/iu);
  assert.match(migration, /100\s*\+\s*MAX\(0,\s*COALESCE\(hp,\s*100\)\s*-\s*100\)\s*\*\s*100/iu);
});

test("account UI, adapter and both account-stat bosses share the HP unit", () => {
  assert.match(accountScene, /key:\s*["']hp["'][^\n]*increment:\s*100/u);
  assert.match(accountScene, /key:\s*["']hp["'][^\n]*label:\s*["']체력["']/u);
  assert.match(accountScene, /최대 체력 100 올리기/u);
  assert.doesNotMatch(accountScene, /account-stat-card__description|account-formula-note/u);
  assert.match(playerConfig, /Math\.floor\(Math\.max\(0,\s*hp\s*-\s*100\)\s*\/\s*100\)/u);
  assert.equal(JSON.parse(statBossData).balance.hpPerPoint, 100);
  assert.equal(JSON.parse(controlBossData).player.hpPerPoint, 100);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const [worker, coordinator, service, scene, schema, migration] = await Promise.all([
  read("backend/src/index.ts"),
  read("backend/src/postgame-coordinator.ts"),
  read("js/core/account-service.js"),
  read("js/scenes/ranking-scene.js"),
  read("backend/schema.sql"),
  read("backend/migrations/0009_boss_rankings.sql"),
]);

test("boss ranking persistence is server-authoritative and exactly once per room", () => {
  assert.match(worker, /["']x-ai-player-user-id["']:\s*session\.user_id/u);
  assert.match(coordinator, /headers\.get\s*\(\s*["']x-ai-player-user-id["']\s*\)/u);
  assert.match(coordinator, /userId:\s*member\.userId\s*\?\?\s*null/u);
  assert.match(coordinator, /private\s+async\s+persistBossVictory/u);
  assert.match(coordinator, /INSERT\s+OR\s+IGNORE\s+INTO\s+boss_runs/iu);
  assert.match(coordinator, /INSERT\s+OR\s+IGNORE\s+INTO\s+boss_run_members/iu);
  assert.match(migration, /room_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/iu);
  assert.match(migration, /PRIMARY\s+KEY\s*\(\s*run_id\s*,\s*user_id\s*\)/iu);
  assert.doesNotMatch(scene, /recordBoss|boss-results|POST\b/u);
});

test("only stat and control bosses feed rankings and pre-game ranking criteria are gone", () => {
  for (const source of [worker, coordinator, service, scene, migration]) {
    assert.match(source, /stat-boss/u);
    assert.match(source, /control-boss/u);
  }
  assert.match(worker, /criterion\s*!==\s*["']boss-clears["'][\s\S]*criterion\s*!==\s*["']boss-speed["']/u);
  assert.match(worker, /RANKED_BOSS_IDS\.has\s*\(\s*bossId\s*\)/u);
  assert.doesNotMatch(migration, /data-sphinx|game_results|mini.?game/iu);
  assert.doesNotMatch(scene, /computer-code-heart|cyber-click-to-purify|ai-ball-classification/u);
});

test("fastest time starts at the server readiness barrier and public ranking omits ids", () => {
  assert.match(coordinator, /battle\.combatStartedAt\s*===\s*null\s*&&\s*this\.battleAllReady\s*\(\s*battle\s*\)/u);
  assert.match(coordinator, /battle\.combatStartedAt\s*=\s*Date\.now\s*\(\s*\)/u);
  assert.match(coordinator, /battle\.finishedAt\s*-\s*\(\s*battle\.combatStartedAt\s*\?\?\s*battle\.startedAt\s*\)/u);
  assert.match(worker, /clearTimeMs:\s*Number\s*\(\s*row\.clear_time_ms\s*\)/u);
  assert.match(worker, /members/u);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("async function ranking("), worker.indexOf("async function importCompletedProgress(")),
    /\b(?:userId|user_id|roomId|room_id|partyKey|party_key)\s*:/u,
  );
});

test("fresh and migrated D1 schemas keep team snapshots and both ranking indexes", () => {
  for (const source of [schema, migration]) {
    assert.match(source, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+boss_runs/iu);
    assert.match(source, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+boss_run_members/iu);
    assert.match(source, /team_name\s+TEXT\s+NOT\s+NULL/iu);
    assert.match(source, /nickname_snapshot\s+TEXT\s+NOT\s+NULL/iu);
    assert.match(source, /clear_time_ms\s+INTEGER\s+NOT\s+NULL/iu);
    assert.match(source, /idx_boss_runs_clears/iu);
    assert.match(source, /idx_boss_runs_speed/iu);
  }
});

test("ranking UI presents two boards for each selectable boss and team member names", () => {
  assert.match(scene, /"boss-clears"/u);
  assert.match(scene, /"boss-speed"/u);
  assert.match(scene, /스탯 보스/u);
  assert.match(scene, /컨트롤 보스/u);
  assert.match(scene, /entry\.members\.join\s*\(\s*["'] · ["']\s*\)/u);
  assert.match(scene, /entry\.partySize\s*>\s*1/u);
  assert.match(service, /bossId:\s*normalizedBossId/u);
  assert.match(service, /clearTimeMs/u);
});

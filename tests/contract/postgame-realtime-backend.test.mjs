import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workerSource, coordinatorSource, wranglerConfig, buildSource] = await Promise.all([
  readFile(new URL("../../backend/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../backend/src/postgame-coordinator.ts", import.meta.url), "utf8"),
  readFile(new URL("../../backend/wrangler.toml", import.meta.url), "utf8"),
  readFile(new URL("../../scripts/build.mjs", import.meta.url), "utf8"),
]);

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u"));
  assert.notEqual(start, -1, `missing function ${name}`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("postgame WebSocket upgrades are same-origin and session authenticated before DO routing", () => {
  const connect = functionBody(workerSource, "connectPostgame");
  assert.match(workerSource, /url\.pathname\s*===\s*["']\/api\/postgame\/socket["']/u);
  assert.match(connect, /requireMethod\s*\(\s*request\s*,\s*["']GET["']/u);
  assert.match(connect, /headers\.get\s*\(\s*["']Origin["']\s*\)\s*!==\s*origin/u);
  assert.match(connect, /headers\.get\s*\(\s*["']Upgrade["']\s*\)/u);
  assert.match(connect, /requireSession\s*\(\s*request\s*,\s*env\s*\)/u);
  assert.match(connect, /new\s+Headers\s*\(/u);
  assert.match(connect, /sha256\s*\(\s*`postgame:/u);
  assert.match(connect, /env\.POSTGAME\.getByName\s*\(\s*["']festival-v1["']/u);
  assert.doesNotMatch(connect, /\bemail\b/iu);
  assert.doesNotMatch(connect, /new\s+URLSearchParams|searchParams\.set/iu);
});

test("Wrangler declares one SQLite-backed Durable Object namespace", () => {
  assert.match(wranglerConfig, /\[\[durable_objects\.bindings\]\][\s\S]*name\s*=\s*["']POSTGAME["'][\s\S]*class_name\s*=\s*["']PostgameCoordinator["']/u);
  assert.match(wranglerConfig, /\[\[migrations\]\][\s\S]*new_sqlite_classes\s*=\s*\[[^\]]*["']PostgameCoordinator["']/u);
  assert.match(workerSource, /POSTGAME:\s*DurableObjectNamespace/u);
  assert.match(workerSource, /export\s*\{\s*PostgameCoordinator\s*\}/u);
});

test("the production CSP explicitly permits secure same-origin WebSockets", () => {
  assert.match(buildSource, /connect-src\s+'self'\s+wss:/u);
});

test("the coordinator uses hibernating sockets and keeps private account keys out of public payloads", () => {
  assert.match(coordinatorSource, /ctx\.acceptWebSocket\s*\(/u);
  assert.match(coordinatorSource, /serializeAttachment\s*\(/u);
  assert.match(coordinatorSource, /deserializeAttachment\s*\(/u);
  assert.match(coordinatorSource, /ctx\.getWebSockets\s*\(/u);
  assert.doesNotMatch(coordinatorSource, /\.accept\s*\(\s*\)/u);
  assert.doesNotMatch(coordinatorSource, /setInterval\s*\(/u);
  assert.doesNotMatch(coordinatorSource, /\bemail\b/iu);
  const publicPlayerBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private publicPlayer("),
    coordinatorSource.indexOf("private publicRoom("),
  );
  assert.ok(publicPlayerBody.length > 0);
  assert.doesNotMatch(publicPlayerBody, /playerKey/u);
  assert.match(coordinatorSource, /player\.playerKey\s*!==\s*recipient\.playerKey/u);
});

test("room authority validates public room names and preserves 1-5 seats, host transfer, and persistence", () => {
  assert.match(coordinatorSource, /MAX_ROOM_NAME_LENGTH\s*=\s*32/u);
  assert.match(coordinatorSource, /hasExactKeys\s*\(\s*parsed,\s*\[[^\]]*["']roomName["']/u);
  assert.match(coordinatorSource, /normalize\s*\(\s*["']NFKC["']\s*\)/u);
  assert.match(coordinatorSource, /invalid_room_name/u);
  assert.match(coordinatorSource, /roomName:\s*room\.roomName/u);
  assert.match(coordinatorSource, /parsed\.capacity\s*<\s*1/u);
  assert.match(coordinatorSource, /parsed\.capacity\s*>\s*5/u);
  assert.match(coordinatorSource, /memberPlayerIds\.length\s*>=\s*room\.capacity/u);
  assert.match(coordinatorSource, /room\.hostPlayerId\s*!==\s*attachment\.playerId/u);
  assert.match(coordinatorSource, /room\.memberPlayerIds\.length\s*<\s*1/u);
  assert.match(coordinatorSource, /room\.hostPlayerId\s*=\s*room\.memberPlayerIds\[0\]/u);
  assert.match(coordinatorSource, /account_already_in_room/u);
  assert.match(coordinatorSource, /ctx\.storage\.put\s*\(/u);
  assert.match(coordinatorSource, /type:\s*["']room\.started["'][\s\S]*seed[\s\S]*startedAt/u);
  assert.match(coordinatorSource, /encodedName\.length\s*>\s*1_024/u);
});

test("room.start creates one persisted server-authoritative battle without trusting client damage", () => {
  assert.match(coordinatorSource, /BATTLE_STORAGE_KEY\s*=\s*["']postgame:battles:v1["']/u);
  assert.match(
    coordinatorSource,
    /["']stat-boss["']:\s*\{\s*bossMaxHp:\s*1_000,\s*hitDamage:\s*10,\s*hitCooldownMs:/u,
  );
  assert.match(coordinatorSource, /room\.status\s*=\s*["']started["']/u);
  assert.match(coordinatorSource, /this\.battles\.set\s*\(\s*roomId\s*,\s*battle\s*\)/u);
  const startRoomBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async startRoom("),
    coordinatorSource.indexOf("private battleMembership("),
  );
  assert.ok(
    startRoomBody.lastIndexOf("this.rooms.delete(roomId)") < startRoomBody.indexOf("this.battles.set(roomId, battle)"),
    "only an empty/disconnected lobby may be removed before battle creation",
  );
  assert.match(coordinatorSource, /hasExactKeys\s*\(\s*parsed,\s*\[[^\]]*["']kind["'][^\]]*["']actionId["']/u);
  assert.doesNotMatch(
    coordinatorSource.slice(
      coordinatorSource.indexOf('case "battle.hit"'),
      coordinatorSource.indexOf("default:", coordinatorSource.indexOf('case "battle.hit"')),
    ),
    /damage/u,
  );
  assert.match(coordinatorSource, /battle\.bossHp\s*=\s*Math\.max\s*\(\s*0\s*,\s*battle\.bossHp\s*-\s*battle\.hitDamage\s*\)/u);
});

test("battle hits validate membership, readiness, kind, idempotency, cooldown, and terminal state", () => {
  const hitBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async hitBattle("),
    coordinatorSource.indexOf("private async leaveBattle("),
  );
  assert.match(hitBody, /this\.battleMembership\s*\(/u);
  assert.match(hitBody, /battle\.status\s*!==\s*["']running["'][\s\S]*battle_finished/u);
  assert.match(hitBody, /!member\.ready\s*\|\|\s*!member\.connected[\s\S]*battle_not_ready/u);
  assert.match(hitBody, /!this\.battleAllReady\s*\(\s*battle\s*\)[\s\S]*battle_party_not_ready/u);
  assert.match(hitBody, /kind\s*!==\s*BATTLE_HIT_KINDS\[battle\.battleId\][\s\S]*invalid_hit_kind/u);
  assert.match(hitBody, /member\.recentActionIds\.includes\s*\(\s*actionId\s*\)[\s\S]*battle\.snapshot/u);
  assert.match(hitBody, /now\s*-\s*member\.lastHitAt\s*<\s*battle\.hitCooldownMs[\s\S]*hit_cooldown/u);
  assert.match(hitBody, /battle\.status\s*=\s*["']finished["']/u);
  assert.match(hitBody, /["']battle\.updated["'][\s\S]*["']battle\.finished["']/u);
});

test("battle snapshots are shared only with connected room members and reconnect by private account key", () => {
  const broadcastBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private broadcastBattleEvent("),
    coordinatorSource.indexOf("private sendPresenceSnapshot("),
  );
  assert.match(broadcastBody, /attachment\.roomId\s*===\s*battle\.roomId/u);
  assert.match(broadcastBody, /memberKeys\.has\s*\(\s*attachment\.playerKey\s*\)/u);
  assert.match(coordinatorSource, /resumeBattleConnection\s*\(/u);
  assert.match(coordinatorSource, /member\.playerKey\s*===\s*attachment\.playerKey/u);
  assert.match(coordinatorSource, /member\.publicId\s*=\s*attachment\.playerId/u);
  assert.match(coordinatorSource, /this\.sendBattleEvent\s*\(\s*server\s*,\s*["']battle\.snapshot["']/u);
  assert.match(coordinatorSource, /\.filter\s*\(\s*\(room\)\s*=>\s*room\.status\s*===\s*["']waiting["']\s*\)/u);
  assert.match(coordinatorSource, /disconnectBattle\s*\(\s*attachment\s*\)/u);
  assert.match(coordinatorSource, /member\.connected\s*=\s*false/u);

  const publicBattleBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private publicBattle("),
    coordinatorSource.indexOf("private publicRooms("),
  );
  assert.doesNotMatch(publicBattleBody, /playerKey/u);
  for (const field of ["roomId", "battleId", "seed", "status", "bossHp", "bossMaxHp", "revision", "allReady", "roster"]) {
    assert.match(publicBattleBody, new RegExp(`\\b${field}\\b`, "u"));
  }
});

test("shared battle lifecycle keeps a seed, readiness barrier, and bounded reconnect retention", () => {
  assert.match(coordinatorSource, /seed:\s*string/u);
  assert.match(coordinatorSource, /seed,\s*\n\s*status:\s*["']running["']/u);
  assert.match(coordinatorSource, /connectedMembers\.every\s*\(\s*\(member\)\s*=>\s*member\.ready\s*\)/u);
  assert.match(coordinatorSource, /ABANDONED_BATTLE_GRACE_MS\s*=\s*15\s*\*\s*60\s*\*\s*1_000/u);
  assert.match(coordinatorSource, /FINISHED_BATTLE_RETENTION_MS\s*=\s*5\s*\*\s*60\s*\*\s*1_000/u);
  assert.match(coordinatorSource, /async alarm\s*\(\s*\)[\s\S]*cleanupExpiredBattles/u);
  assert.match(coordinatorSource, /storage\.setAlarm\s*\(/u);
  assert.match(coordinatorSource, /storage\.deleteAlarm\s*\(/u);
});

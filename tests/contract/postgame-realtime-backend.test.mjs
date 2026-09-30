import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workerSource, coordinatorSource, wranglerConfig, buildSource, controlBattleSource] = await Promise.all([
  readFile(new URL("../../backend/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../backend/src/postgame-coordinator.ts", import.meta.url), "utf8"),
  readFile(new URL("../../backend/wrangler.toml", import.meta.url), "utf8"),
  readFile(new URL("../../scripts/build.mjs", import.meta.url), "utf8"),
  readFile(new URL("../../js/battle/postgame/bosses/control-boss/battle.js", import.meta.url), "utf8"),
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
  assert.match(connect, /const\s+stats\s*=\s*await\s+fetchStats\s*\(\s*env\s*,\s*session\.user_id\s*\)/u);
  assert.match(connect, /new\s+Headers\s*\(/u);
  assert.match(connect, /sha256\s*\(\s*`postgame:/u);
  assert.match(
    connect,
    /["']x-ai-player-combat-max-hp["']:\s*String\s*\(\s*combatMaxHp\s*\(\s*stats\s*\)\s*\)/u,
  );
  assert.match(
    connect,
    /["']x-ai-player-stat-boss-damage["']:\s*String\s*\(\s*statBossAttackDamage\s*\(\s*stats\s*\)\s*\)/u,
  );
  assert.match(
    connect,
    /["']x-ai-player-control-boss-damage["']:\s*String\s*\(\s*controlBossAttackDamage\s*\(\s*stats\s*\)\s*\)/u,
  );
  assert.match(connect, /env\.POSTGAME\.getByName\s*\(\s*["']festival-v1["']/u);
  assert.doesNotMatch(connect, /\bemail\b/iu);
  assert.doesNotMatch(connect, /new\s+URLSearchParams|searchParams\.set/iu);
});

test("combat max HP is derived from persisted stats and passed as a validated internal header", () => {
  const combatMaxHpBody = functionBody(workerSource, "combatMaxHp");
  assert.match(workerSource, /BASE_COMBAT_HP\s*=\s*100/u);
  assert.match(workerSource, /COMBAT_HP_PER_POINT\s*=\s*100/u);
  assert.match(combatMaxHpBody, /Number\s*\(\s*stats\.hp\s*\)/u);
  assert.match(combatMaxHpBody, /storedHp\s*-\s*BASE_COMBAT_HP\)\s*\/\s*COMBAT_HP_PER_POINT/u);
  assert.match(combatMaxHpBody, /BASE_COMBAT_HP\s*\+\s*bonusPoints\s*\*\s*COMBAT_HP_PER_POINT/u);

  const connectBody = coordinatorSource.slice(
    coordinatorSource.indexOf("async fetch(request: Request)"),
    coordinatorSource.indexOf("async webSocketMessage("),
  );
  assert.match(connectBody, /headers\.get\s*\(\s*["']x-ai-player-combat-max-hp["']\s*\)/u);
  assert.match(connectBody, /Number\.isSafeInteger\s*\(\s*combatMaxHp\s*\)/u);
  assert.match(connectBody, /combatMaxHp\s*<\s*1/u);
  assert.match(connectBody, /combatMaxHp\s*>\s*MAX_PLAYER_HP/u);
  assert.match(connectBody, /combatMaxHp,\s*\n/u);
});

test("stat-boss compound attack is derived from D1 stats and frozen as server-trusted room state", () => {
  const attackBody = functionBody(workerSource, "statBossAttackDamage");
  assert.match(workerSource, /BASE_COMBAT_ATTACK\s*=\s*10/u);
  assert.match(workerSource, /COMBAT_ATTACK_GROWTH\s*=\s*0\.05/u);
  assert.match(attackBody, /Number\s*\(\s*stats\.attack\s*\)/u);
  assert.match(
    attackBody,
    /BASE_COMBAT_ATTACK\s*\*\s*\(\(1\s*\+\s*COMBAT_ATTACK_GROWTH\)\s*\*\*\s*attackPoints\)/u,
  );
  assert.match(attackBody, /Math\.min\s*\(\s*Number\.MAX_SAFE_INTEGER/u);
  assert.match(attackBody, /COMBAT_VALUE_SCALE/u);

  const connectBody = coordinatorSource.slice(
    coordinatorSource.indexOf("async fetch(request: Request)"),
    coordinatorSource.indexOf("async webSocketMessage("),
  );
  assert.match(connectBody, /headers\.get\s*\(\s*["']x-ai-player-stat-boss-damage["']\s*\)/u);
  assert.match(connectBody, /Number\.isFinite\s*\(\s*statBossAttackDamage\s*\)/u);
  assert.match(connectBody, /statBossAttackDamage\s*<=\s*0/u);
  assert.match(connectBody, /statBossAttackDamage\s*>\s*MAX_STAT_BOSS_DAMAGE/u);
  assert.match(
    connectBody,
    /statBossAttackDamage:\s*roundCombatValue\s*\(\s*statBossAttackDamage\s*\)/u,
  );
  assert.match(coordinatorSource, /"stat-boss":\s*\{\s*bossMaxHp:\s*1_000,\s*hitDamage:\s*10,\s*hitCooldownMs:\s*1_000\s*\}/u);

  const startRoomBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async startRoom("),
    coordinatorSource.indexOf("private battleMembership("),
  );
  assert.match(
    startRoomBody,
    /statBossAttackDamage:\s*initialStatBossAttackDamage\s*\(\s*member\s*\)/u,
  );
  const hitBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async hitBattle("),
    coordinatorSource.indexOf("private async leaveBattle("),
  );
  assert.match(
    hitBody,
    /battle\.battleId\s*===\s*["']stat-boss["']\s*\?\s*member\.statBossAttackDamage/u,
  );
  assert.match(
    hitBody,
    /battle\.bossHp\s*=\s*Math\.max\s*\(\s*0\s*,\s*roundCombatValue\s*\(\s*battle\.bossHp\s*-\s*hitDamage\s*\)\s*\)/u,
  );
});

test("control-boss direct and gimmick damage stay server-derived and match solo rules", () => {
  const attackBody = functionBody(workerSource, "controlBossAttackDamage");
  assert.match(attackBody, /Number\s*\(\s*stats\.attack\s*\)/u);
  assert.match(
    attackBody,
    /BASE_COMBAT_ATTACK\s*\*\s*\(\(1\s*\+\s*COMBAT_ATTACK_GROWTH\)\s*\*\*\s*attackPoints\)/u,
  );

  const connectBody = coordinatorSource.slice(
    coordinatorSource.indexOf("async fetch(request: Request)"),
    coordinatorSource.indexOf("async webSocketMessage("),
  );
  assert.match(connectBody, /headers\.get\s*\(\s*["']x-ai-player-control-boss-damage["']\s*\)/u);
  assert.match(connectBody, /controlBossAttackDamage:\s*roundCombatValue\s*\(\s*controlBossAttackDamage\s*\)/u);

  const startRoomBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async startRoom("),
    coordinatorSource.indexOf("private battleMembership("),
  );
  assert.match(
    startRoomBody,
    /controlBossAttackDamage:\s*initialControlBossAttackDamage\s*\(\s*member\s*\)/u,
  );

  const hitBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async hitBattle("),
    coordinatorSource.indexOf("private async leaveBattle("),
  );
  assert.match(hitBody, /kind\s*===\s*["']control-gimmick["']/u);
  assert.match(hitBody, /battle\.bossMaxHp\s*\*\s*0\.2/u);
  assert.match(hitBody, /member\.controlBossAttackDamage/u);
  assert.match(hitBody, /member\.lastGimmickAt/u);
  assert.match(hitBody, /CONTROL_GIMMICK_COOLDOWN_MS/u);
  assert.match(controlBattleSource, /kind:\s*event\.kind\s*===\s*["']gimmick["']\s*\?\s*["']control-gimmick["']\s*:\s*["']control-attack["']/u);
  assert.doesNotMatch(
    controlBattleSource.slice(
      controlBattleSource.indexOf("sharedBinding.hit({"),
      controlBattleSource.indexOf("});", controlBattleSource.indexOf("sharedBinding.hit({")) + 3,
    ),
    /\bdamage\s*:/u,
  );
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
  assert.match(startRoomBody, /const\s+maxHp\s*=\s*initialBattlePlayerMaxHp\s*\(\s*room\.battleId\s*,\s*member\s*\)/u);
  assert.match(startRoomBody, /hp:\s*maxHp,\s*\n\s*maxHp,/u);
  const initialHpBody = functionBody(coordinatorSource, "initialBattlePlayerMaxHp");
  assert.match(initialHpBody, /battleId\s*===\s*["']data-sphinx["']\)\s*return\s+100/u);
  assert.match(initialHpBody, /Number\s*\(\s*attachment\.combatMaxHp\s*\)/u);
  assert.match(coordinatorSource, /hasExactKeys\s*\(\s*parsed,\s*\[[^\]]*["']kind["'][^\]]*["']actionId["']/u);
  assert.doesNotMatch(
    coordinatorSource.slice(
      coordinatorSource.indexOf('case "battle.hit"'),
      coordinatorSource.indexOf("default:", coordinatorSource.indexOf('case "battle.hit"')),
    ),
    /damage/u,
  );
  assert.match(coordinatorSource, /const\s+hitDamage\s*=\s*battle\.battleId\s*===\s*["']stat-boss["']/u);
  assert.match(
    coordinatorSource,
    /battle\.bossHp\s*=\s*Math\.max\s*\(\s*0\s*,\s*roundCombatValue\s*\(\s*battle\.bossHp\s*-\s*hitDamage\s*\)\s*\)/u,
  );
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
  assert.match(hitBody, /!isAllowedBattleHitKind\s*\(\s*battle\.battleId\s*,\s*kind\s*\)[\s\S]*invalid_hit_kind/u);
  assert.match(hitBody, /member\.recentActionIds\.includes\s*\(\s*actionId\s*\)[\s\S]*battle\.snapshot/u);
  assert.match(hitBody, /previousHitAt[\s\S]*cooldownMs[\s\S]*now\s*-\s*previousHitAt\s*<\s*cooldownMs[\s\S]*hit_cooldown/u);
  assert.match(hitBody, /battle\.status\s*=\s*["']finished["']/u);
  assert.match(hitBody, /["']battle\.updated["'][\s\S]*["']battle\.finished["']/u);
  assert.match(hitBody, /member\.hp\s*===\s*0[\s\S]*battle_member_defeated/u);
});

test("party health accepts finite decimal HP, persists it, and publishes no private identity", () => {
  assert.match(coordinatorSource, /case\s+["']battle\.health["']/u);
  assert.match(coordinatorSource, /hasExactKeys\s*\(\s*parsed,\s*\[[^\]]*["']hp["'][^\]]*["']maxHp["']/u);
  const healthParser = coordinatorSource.slice(
    coordinatorSource.indexOf('case "battle.health"'),
    coordinatorSource.indexOf('case "battle.hit"'),
  );
  assert.match(healthParser, /Number\.isFinite\s*\(\s*parsed\.hp\s*\)/u);
  assert.doesNotMatch(healthParser, /Number\.isInteger\s*\(\s*parsed\.hp\s*\)/u);
  assert.match(healthParser, /Number\.isInteger\s*\(\s*parsed\.maxHp\s*\)/u);
  assert.match(healthParser, /hp:\s*roundCombatValue\s*\(\s*parsed\.hp\s*\)/u);
  const healthBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async updateBattleHealth("),
    coordinatorSource.indexOf("private async hitBattle("),
  );
  assert.match(healthBody, /this\.battleMembership\s*\(/u);
  assert.match(healthBody, /member\.hp\s*=\s*nextHp/u);
  assert.match(healthBody, /Math\.min\s*\(\s*member\.hp\s*,\s*hp\s*\)/u);
  assert.match(healthBody, /member\.maxHp\s*!==\s*maxHp[\s\S]*battle_health_mismatch/u);
  assert.match(
    healthBody,
    /member\.hp\s*===\s*nextHp\s*&&\s*member\.maxHp\s*===\s*nextMaxHp[\s\S]*["']battle\.snapshot["']/u,
  );
  assert.match(healthBody, /if\s*\(nextHp\s*===\s*0\)\s*member\.ready\s*=\s*false/u);
  assert.match(healthBody, /activeMembers\.every\s*\(\s*\(candidate\)\s*=>\s*candidate\.hp\s*===\s*0\s*\)/u);
  assert.match(healthBody, /battle\.status\s*=\s*["']finished["']/u);
  assert.match(healthBody, /["']battle\.finished["']/u);
  assert.match(healthBody, /await\s+this\.persistBattles\s*\(\s*\)/u);
  assert.match(healthBody, /["']battle\.updated["']/u);
  const publicBattleBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private publicBattle("),
    coordinatorSource.indexOf("private battleAllReady("),
  );
  for (const field of ["hp", "maxHp", "alive"]) assert.match(publicBattleBody, new RegExp(`\\b${field}\\b`, "u"));
  assert.match(publicBattleBody, /outcome:\s*["']defeat["']\s*,\s*reason:\s*["']party-defeated["']/u);
  assert.doesNotMatch(publicBattleBody, /playerKey/u);
});

test("protocol errors identify the failed request and room without inventing context for unrelated errors", () => {
  const messageBody = coordinatorSource.slice(
    coordinatorSource.indexOf("async webSocketMessage("),
    coordinatorSource.indexOf("async webSocketClose("),
  );
  assert.match(messageBody, /let\s+requestType:\s*ClientMessage\[["']type["']\]\s*\|\s*null\s*=\s*null/u);
  assert.match(messageBody, /let\s+requestRoomId:\s*string\s*\|\s*null\s*=\s*null/u);
  assert.match(messageBody, /requestType\s*=\s*parsed\.type/u);
  assert.match(messageBody, /requestRoomId\s*=\s*["']roomId["']\s+in\s+parsed\s*\?\s*parsed\.roomId\s*:\s*null/u);
  assert.match(messageBody, /sendError\s*\(\s*socket\s*,\s*error\.code\s*,\s*error\.message\s*,\s*\{\s*requestType\s*,\s*roomId:\s*requestRoomId\s*\}\s*\)/u);
  assert.match(messageBody, /sendError\s*\(\s*socket\s*,\s*["']server_error["'][\s\S]*requestType,\s*\n\s*roomId:\s*requestRoomId,/u);

  const sendErrorBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private sendError("),
    coordinatorSource.indexOf("private generateRoomId("),
  );
  assert.match(sendErrorBody, /context:\s*\{\s*requestType\?:\s*string\s*\|\s*null;\s*roomId\?:\s*string\s*\|\s*null\s*\}/u);
  assert.match(sendErrorBody, /context\.requestType\s*\?\s*\{\s*requestType:\s*context\.requestType\s*\}\s*:\s*\{\}/u);
  assert.match(sendErrorBody, /context\.roomId\s*\?\s*\{\s*roomId:\s*context\.roomId\s*\}\s*:\s*\{\}/u);
});

test("battle leave is persisted before its success acknowledgement", () => {
  const leaveBody = coordinatorSource.slice(
    coordinatorSource.indexOf("private async leaveBattle("),
    coordinatorSource.indexOf("private async resumeBattleConnection("),
  );
  assert.ok(
    leaveBody.indexOf("await this.persistState()") < leaveBody.indexOf('type: "battle.left"'),
    "battle.left must only acknowledge durable state",
  );
  assert.match(leaveBody, /catch\s*\(error\)[\s\S]*member\.left\s*=\s*previousMember\.left/u);
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

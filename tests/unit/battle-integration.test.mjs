import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createBattlePlayer, createStatBossPlayer } from "../../js/battle/player-config.js";
import { getBattleUnlockStatus } from "../../js/battle/unlock.js";
import {
  calcIncomingDamage,
  calcMaxHp,
  calcPlayerDamage,
} from "../../js/battle/postgame/bosses/stat-boss/stats.js";
import { getCharacterJudgementPosition } from "../../js/battle/postgame/bosses/stat-boss/battle.js";
import { finalizeBattleCandidate } from "../../js/scenes/battle-scene.js";

const MINI_GAME_IDS = ["ds", "cs", "cse", "ai", "aids"];
const DEFINITION = Object.freeze({
  unlockCondition: Object.freeze({
    type: "ALL_MINIGAMES_CLEAR",
    miniGameIds: Object.freeze(MINI_GAME_IDS),
  }),
});

function localSave(completedIds = []) {
  return {
    minigames: Object.fromEntries(MINI_GAME_IDS.map((id) => [id, {
      completed: completedIds.includes(id),
      playCount: id === "ds" ? 99 : 0,
    }])),
  };
}

test("Battle unlock requires every distinct mini-game id and unions local/server completion", () => {
  const repeatedSingleGame = getBattleUnlockStatus(
    DEFINITION,
    localSave(["ds"]),
    { stats: { clears: 99 }, completedGameIds: [] },
  );
  assert.equal(repeatedSingleGame.unlocked, false);
  assert.equal(repeatedSingleGame.completed, 1);

  const restoredAcrossOrigins = getBattleUnlockStatus(
    DEFINITION,
    localSave(["ds", "cs", "cse", "ai"]),
    { completedGameIds: ["aids", "aids"] },
  );
  assert.deepEqual(restoredAcrossOrigins, {
    unlocked: true,
    completed: 5,
    total: 5,
    missingMiniGameIds: [],
  });
});

test("Battle unlock reports the exact missing stable ids", () => {
  const status = getBattleUnlockStatus(
    DEFINITION,
    localSave(["ds", "cs", "ai"]),
    { completedGameIds: [] },
  );
  assert.equal(status.unlocked, false);
  assert.equal(status.completed, 3);
  assert.equal(status.total, 5);
  assert.deepEqual(status.missingMiniGameIds, ["cse", "aids"]);
});

test("account stats map from D1 baselines to stat-boss baselines exactly once", () => {
  const baseline = createStatBossPlayer({
    authenticated: true,
    stats: { attack: 0, hp: 100, defense: 0 },
  });
  assert.equal(baseline.attackStat, 1);
  assert.equal(baseline.healthStat, 1);
  assert.equal(baseline.defenseStat, 1);
  assert.equal(baseline.appearance.spriteSheet.src, "./assets/images/character-walk.png");
  assert.equal(calcPlayerDamage(baseline.attackStat), 10);
  assert.equal(calcMaxHp(baseline.healthStat), 100);
  assert.equal(calcIncomingDamage(34, baseline.defenseStat), 34);

  const allocated = createStatBossPlayer({
    authenticated: true,
    stats: { attack: 1, hp: 101, defense: 1 },
  });
  assert.equal(allocated.attackStat, 2);
  assert.equal(allocated.healthStat, 2);
  assert.equal(allocated.defenseStat, 2);
  assert.equal(calcPlayerDamage(allocated.attackStat), 10.5);
  assert.equal(calcMaxHp(allocated.healthStat), 110);
  assert.equal(calcIncomingDamage(34, allocated.defenseStat), 33);
  assert.deepEqual(allocated.accountStats, { attack: 1, hp: 101, defense: 1 });
});

test("guest Battle uses 1/1/1 without accepting private account fields", () => {
  const player = createStatBossPlayer({
    authenticated: false,
    user: { name: "private", email: "hidden@example.com" },
    stats: { attack: 999, hp: 999, defense: 999 },
  });
  assert.equal(player.attackStat, 1);
  assert.equal(player.healthStat, 1);
  assert.equal(player.defenseStat, 1);
  assert.deepEqual(player.accountStats, { attack: 0, hp: 0, defense: 0 });
  assert.equal(Object.hasOwn(player, "user"), false);
});

test("fixed-rule Battles do not receive authenticated account stats", () => {
  const player = createBattlePlayer({
    authenticated: true,
    stats: { attack: 9, hp: 250, defense: 7 },
  }, undefined, { useAccountStats: false });
  assert.equal(player.attackStat, 1);
  assert.equal(player.healthStat, 1);
  assert.equal(player.defenseStat, 1);
  assert.deepEqual(player.accountStats, { attack: 0, hp: 0, defense: 0 });
});

test("stat-boss judges the character center rather than its top-left corner", () => {
  assert.deepEqual(
    getCharacterJudgementPosition({ x: 120, y: 80, width: 34, height: 44 }),
    { x: 137, y: 102 },
  );
});

test("Battle host validates candidates and owns identity and duration fields", () => {
  const result = finalizeBattleCandidate({
    battleId: "stat-boss",
    id: "stat-boss:attempt-1",
    durationMs: 1234,
    candidate: {
      status: "CLEAR",
      score: 100,
      failureReason: null,
      metrics: { damageDealt: 100 },
      reward: null,
    },
  });
  assert.deepEqual(result, {
    sessionId: "stat-boss:attempt-1",
    battleId: "stat-boss",
    status: "CLEAR",
    score: 100,
    durationMs: 1234,
    failureReason: null,
    metrics: { damageDealt: 100 },
    reward: null,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => finalizeBattleCandidate({
    battleId: "stat-boss",
    id: "bad",
    durationMs: 0,
    candidate: {
      status: "CLEAR",
      score: 1,
      failureReason: null,
      metrics: {},
      reward: null,
      sessionId: "module-owned",
    },
  }), /host-owned/u);
});

test("Battle result card stays above module-owned HUD and touch controls", async () => {
  const css = await readFile(new URL("../../css/battle.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.battle-stage\s*>\s*\.result-backdrop\s*\{[^}]*z-index:\s*10000;/su,
  );
});

test("festival sprite is enlarged and bottom-anchored independently from its actor", async () => {
  const css = await readFile(new URL("../../css/battle-character.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.character-actor__sprite\[data-sprite-sheet="true"\]\s*\{[^}]*bottom:\s*0;[^}]*height:\s*130%;/su,
  );
});

test("Battle layouts keep narrow landscapes contained without changing world coordinates", async () => {
  const [dataSphinxCss, statBossCss, controlBossCss] = await Promise.all([
    readFile(new URL("../../css/data-sphinx.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/stat-boss.css", import.meta.url), "utf8"),
    readFile(new URL("../../css/control-boss.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    dataSphinxCss,
    /@media \(orientation: landscape\) and \(max-height: 560px\) and \(min-width: 800px\)/u,
  );
  assert.match(
    statBossCss,
    /\.stat-boss-stage\s*\{[^}]*max-height:\s*max\(260px, calc\(100dvh - 210px\)\)[^}]*overflow-y:\s*auto/su,
  );
  assert.match(
    statBossCss,
    /\.stat-boss-battlefield\s*\{[^}]*width:\s*min\(100%, 960px, max\(480px, calc\(\(100dvh - 520px\) \* 8 \/ 5\)\)\)/su,
  );
  assert.match(statBossCss, /\.stat-boss-arena\s*\{[^}]*aspect-ratio:\s*8 \/ 5/su);
  assert.doesNotMatch(
    statBossCss,
    /@media \(hover: none\), \(pointer: coarse\), \(max-width: 720px\)\s*\{[\s\S]*?\.stat-boss-arena\s*\{[^}]*aspect-ratio:/u,
  );

  assert.match(controlBossCss, /\.control-boss-world\s*\{[^}]*aspect-ratio:\s*9 \/ 16/su);
  assert.match(
    controlBossCss,
    /@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 900px\) and \(min-height: 640px\)\s*\{[\s\S]*?grid-template-areas:\s*"header header"\s*"world boss"\s*"world player"\s*"world status";/u,
  );
  assert.match(
    controlBossCss,
    /@media \(orientation: landscape\) and \(max-height: 560px\)\s*\{[\s\S]*?\.control-boss-stage\s*\{[^}]*minmax\(140px, 1fr\)[^}]*overflow-y:\s*auto;/u,
  );
});

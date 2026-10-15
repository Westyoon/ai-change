import assert from "node:assert/strict";
import test from "node:test";
import { formatCombatValue, formatCombatHealth, formatBossValue, formatBossHealth } from "../../js/battle/combat-display.js";
import { calcPlayerDamage, calcIncomingDamage } from "../../js/battle/postgame/bosses/stat-boss/stats.js";
import { getBattlePlayerHealth, getPartyMemberHealthView } from "../../js/scenes/battle-scene.js";
import { formatResultMetric } from "../../js/ui/result-overlay.js";

test("combat presentation keeps original units and rounds to one decimal without trailing zeros", () => {
  assert.equal(formatCombatValue(11.57625), "11.6");
  assert.equal(formatCombatValue(965.27125), "965.3");
  assert.equal(formatCombatHealth(190.2, 200), "190.2 / 200");
  assert.equal(formatCombatValue(0), "0");
  assert.equal(formatCombatValue(1000), "1000");
  assert.equal(formatCombatValue(100), "100");
  assert.equal(formatCombatValue(-1), "0");
  assert.equal(formatCombatValue(Number.NaN), "0");
  assert.equal(formatCombatValue(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));
});

test("boss health is integer-only without showing zero for a surviving boss", () => {
  assert.equal(formatBossHealth(928.2, 1000), "928 / 1000");
  assert.equal(formatBossValue(928.7), "929");
  assert.equal(formatBossValue(0.1), "1");
  for (const value of [0, -1, NaN, Infinity]) assert.equal(formatBossValue(value), "0");
  assert.equal(formatCombatHealth(190.2, 200), "190.2 / 200", "player HP is unchanged");
});

test("results use combat units only for postgame HP/damage, never timing or counts", () => {
  assert.equal(formatResultMetric("damageTaken", 19.625, "stat-boss"), "19.6");
  assert.equal(formatResultMetric("bossShieldRemaining", 50, "control-boss"), "50");
  assert.equal(formatResultMetric("damageTaken", 20, "word-breaker"), "20");
  assert.equal(formatResultMetric("clearTimeMs", 1100, "stat-boss"), "1.1초");
  assert.equal(formatResultMetric("counterSuccesses", 11, "stat-boss"), "11");
});

test("damage, account formulas and online health use unrounded simulation units", () => {
  const damage = calcPlayerDamage(4);
  assert.equal(damage, 11.57625);
  assert.equal(formatCombatValue(damage), "11.6");
  assert.equal(formatCombatValue(calcIncomingDamage(10, 2)), "9.8");
  const snapshot = { players: { self: { hp: 190.2, maxHp: 200 } } };
  assert.deepEqual(getBattlePlayerHealth("stat-boss", snapshot, "self"), { hp: 190.2, maxHp: 200 });
  assert.deepEqual(getPartyMemberHealthView({ hp: 190.2, maxHp: 200 }), {
    hp: 190.2, maxHp: 200, dead: false, ratio: 190.2 / 200, label: "190.2/200",
  });
});

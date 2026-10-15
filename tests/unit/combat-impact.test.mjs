import assert from "node:assert/strict";
import test from "node:test";
import { createCombatImpact } from "../../js/battle/combat-impact.js";

test("combat feedback shakes the visible app only after damage, cancels overlaps and cleans up", () => {
  const calls = [];
  let cancelled = 0;
  const app = { animate(frames, options) { calls.push({ frames, options }); return { cancel() { cancelled++; } }; } };
  const impact = createCombatImpact({ closest(selector) { assert.equal(selector, "#app"); return app; } });
  impact.player({ currentHealth: 5 });
  impact.player({ currentHealth: 5 });
  assert.equal(calls.length, 0);
  impact.player({ currentHealth: 4 });
  assert.equal(calls[0].options.duration, 180);
  impact.pulse();
  assert.equal(calls[1].options.duration, 120);
  assert.deepEqual(calls[1].frames.at(-1), { translate: "0px 0px" });
  assert.equal(cancelled, 1);
  impact.destroy();
  assert.equal(cancelled, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { advanceLidProgress, drawSortingLid } from "../../js/minigames/AI/sorting-bin.js";
import { createMiniGame } from "../../js/minigames/AI/index.js";
import { INPUT_ACTIONS } from "../../js/core/input-manager.js";

test("Space toggles the gameplay lid while pause and release cannot change it", async () => {
  let action;
  const game = createMiniGame({ input: { onAction(listener) { action = listener; return () => {}; } } });
  try {
    await game.init({ countdownSeconds: 0 });
    game.start({ attemptId: "ai:lid-input" });
    const press = { action: INPUT_ACTIONS.CONFIRM, phase: "press", source: "keyboard" };
    action(press); // Leave the start gate.
    assert.equal(game.getState().lidState, "CLOSED");
    action(press);
    assert.equal(game.getState().lidState, "OPEN");
    action({ ...press, phase: "release" });
    assert.equal(game.getState().lidState, "OPEN");
    game.pause();
    action(press);
    assert.equal(game.getState().lidState, "OPEN");
    game.resume();
    action(press);
    assert.equal(game.getState().lidState, "CLOSED");
  } finally { game.destroy(); }
});

test("sorting lid opens and closes smoothly, reverses mid-motion and freezes with time", () => {
  assert.equal(advanceLidProgress(0, true, 0.09), 0.5);
  assert.equal(advanceLidProgress(0.5, false, 0.09), 0);
  assert.equal(advanceLidProgress(0.5, true, 0), 0.5);
  assert.equal(advanceLidProgress(0, true, 1), 1);
  assert.equal(advanceLidProgress(1, false, 1), 0);
});

test("sorting lid draws the separate sprite around the same hinge with pixel smoothing off", () => {
  const calls = [];
  const ctx = { save() {}, restore() {}, translate(...args) { calls.push(args); },
    rotate(angle) { calls.push(angle); }, drawImage(...args) { calls.push(args); } };
  const image = { naturalWidth: 1133, complete: true };
  const crop = { x: 2, y: 56, width: 1129, height: 176 };
  drawSortingLid(ctx, image, crop, { binX: 300, binY: 330, binWidth: 96 }, 1);
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.deepEqual(calls[0], [296, 330]);
  assert.equal(calls[1], -Math.PI * 0.55);
  assert.equal(calls[2][0], image);
  assert.deepEqual(calls[2].slice(1, 5), [2, 56, 1129, 176]);
});

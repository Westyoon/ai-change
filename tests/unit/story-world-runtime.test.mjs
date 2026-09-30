import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStoryWorldLayout,
  clampStoryWorldPosition,
  findNearestStoryTarget,
  resolveStoryWorldStartPosition,
} from "../../js/scenes/story-world-runtime.js";

const map = Object.freeze({
  id: "festival-main-map",
  worldSize: Object.freeze({ width: 1024, height: 640 }),
  startPosition: Object.freeze({ x: 512, y: 560 }),
});

test("Story world restores only the current map position and clamps it inside 1024x640", () => {
  assert.deepEqual(
    resolveStoryWorldStartPosition(map, {
      story: {
        lastMapId: "festival-main-map",
        lastPlayerPosition: { x: 2000, y: -30 },
      },
    }),
    { x: 982, y: 0 },
  );
  assert.deepEqual(
    resolveStoryWorldStartPosition(map, {
      story: {
        lastMapId: "another-map",
        lastPlayerPosition: { x: 30, y: 40 },
      },
    }),
    { x: 512, y: 560 },
  );
  assert.deepEqual(
    clampStoryWorldPosition({ x: -5, y: 999 }, map.worldSize, { width: 50, height: 70 }),
    { x: 0, y: 570 },
  );
});

test("Story interaction selects only the closest NPC whose radius contains the player", () => {
  const targets = [
    { id: "npc-left", x: 100, y: 100, interactionRadius: 64 },
    { id: "npc-right", x: 142, y: 100, interactionRadius: 64 },
  ];
  const nearest = findNearestStoryTarget(targets, { x: 106, y: 76, width: 42, height: 56 });
  assert.equal(nearest.target.id, "npc-right");
  assert.equal(findNearestStoryTarget(targets, { x: 400, y: 400, width: 42, height: 56 }), null);
});

test("desktop layout shows the whole map while portrait layout follows without stretching", () => {
  const desktop = calculateStoryWorldLayout({
    worldSize: map.worldSize,
    viewportSize: { width: 1280, height: 800 },
    focusBounds: { x: 800, y: 500, width: 42, height: 56 },
    camera: false,
  });
  assert.deepEqual(desktop, {
    camera: false,
    scale: 1.25,
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
  });

  const portrait = calculateStoryWorldLayout({
    worldSize: map.worldSize,
    viewportSize: { width: 390, height: 620 },
    focusBounds: { x: 800, y: 500, width: 42, height: 56 },
    camera: true,
  });
  assert.equal(portrait.camera, true);
  assert.equal(portrait.scale, 0.96875);
  assert.equal(portrait.width, 992);
  assert.equal(portrait.height, 620);
  assert.ok(portrait.x < 0);
  assert.equal(portrait.y, 0);
});

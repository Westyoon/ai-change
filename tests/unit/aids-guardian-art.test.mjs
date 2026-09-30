import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardianImage, SORTING_GUARDIANS, updateEggRotation } from '../../js/minigames/AIDS/guardian-art.js';
import { spawnEgg } from '../../js/minigames/AIDS/eggs.js';
import { DEFAULT_CONFIG } from '../../js/minigames/AIDS/config.js';

test('AIDS spawns the two correct guardian images without changing the sorting type', () => {
  const doc = { createElement: () => ({ children: [], appendChild(child) { this.children.push(child); } }) };
  for (const [type, probability, department] of [['in', 1, 'AI'], ['de', 0, 'DS']]) {
    const field = { ownerDocument: doc, clientWidth: 362, appendChild() {} };
    const state = { platforms: [{ rowIndex: 0, lane: 'center' }], eggs: [] };
    spawnEgg({ field }, { ...DEFAULT_CONFIG, eggTypeProbability: { in: probability } }, state);
    const egg = state.eggs[0];
    assert.equal(egg.type, type);
    assert.equal(SORTING_GUARDIANS[type].departmentCode, department);
    assert.equal(egg.sprite.src, SORTING_GUARDIANS[type].imageSrc);
    assert.equal(egg.el.children[0], egg.sprite);
    assert.equal(egg.rotation, 0);
    assert.equal(egg.angularVelocity, 0);
    assert.equal(createGuardianImage(doc, type, 'receiver').src, egg.sprite.src);
  }
});

test('guardian roll uses signed travel distance, keeps physics unchanged, and reverses with movement', () => {
  const egg = { x: 20, y: 0, vx: 100, vy: 0, rotation: 0, sprite: { style: {} } };
  updateEggRotation(egg, 0, 0, true, 0.2, 20);
  assert.ok(Math.abs(egg.rotation - 180 / Math.PI) < 1e-8);
  assert.equal(egg.sprite.style.transform, `rotate(${egg.rotation}deg)`);
  assert.deepEqual([egg.x, egg.y, egg.vx, egg.vy], [20, 0, 100, 0]);
  egg.x = 0;
  updateEggRotation(egg, 20, 0, true, 0.2, 20);
  assert.ok(Math.abs(egg.rotation) < 1e-8);
  assert.ok(egg.angularVelocity < 0);
});

test('guardian rotation carries into falling, freezes at zero delta and is frame-rate independent', () => {
  const egg = { x: 5, y: 5, rotation: 60, angularVelocity: 90, sprite: { style: {} } };
  updateEggRotation(egg, 5, 5, false, 0, 20);
  assert.equal(egg.rotation, 60);
  updateEggRotation(egg, 5, 5, false, 0.5, 20);
  assert.equal(egg.rotation, 105);
  const once = { x: 20, y: 10, rotation: 0 };
  const split = { x: 10, y: 5, rotation: 0 };
  updateEggRotation(once, 0, 0, true, 0.2, 20);
  updateEggRotation(split, 0, 0, true, 0.1, 20);
  split.x = 20; split.y = 10;
  updateEggRotation(split, 10, 5, true, 0.1, 20);
  assert.ok(Math.abs(once.rotation - split.rotation) < 1e-8);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDamageNumbers } from '../../js/battle/damage-numbers.js';

test('damage numbers round real hits, expire, cap rapid hits and clean up on exit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const children = [];
  const documentRef = {
    createElement() {
      return {
        style: { setProperty(key, value) { this[key] = value; } },
        setAttribute(key, value) { this[key] = value; },
        remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); },
      };
    },
  };
  const anchor = { append(node) { children.push(node); } };
  const numbers = createDamageNumbers(anchor, documentRef);
  for (const invalid of [0, -10, NaN, Infinity]) assert.equal(numbers.show(invalid), false);
  assert.equal(numbers.show(11.57625), true);
  assert.equal(children[0].textContent, '12');
  assert.equal(children[0]['aria-hidden'], 'true');
  t.mock.timers.tick(851);
  assert.equal(children.length, 0);
  for (let i = 0; i < 20; i++) numbers.show(10);
  assert.equal(children.length, 4);
  numbers.destroy();
  assert.equal(children.length, 0);
  assert.equal(numbers.show(10), false);
  t.mock.timers.tick(1000);
  assert.equal(children.length, 0);
});

test('damage feedback uses local hit events, outlined pixel text and reduced-motion support', async () => {
  const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
  const css = await read('css/battle.css');
  assert.match(css, /\.boss-damage-number\s*\{[^}]*pointer-events: none;[^}]*color: #a40920;[^}]*font-family: Galmuri11, monospace;[^}]*-webkit-text-stroke: 3px #fff;/su);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  const stat = await read('js/battle/postgame/bosses/stat-boss/battle.js');
  assert.match(stat, /event\.playerId === localPlayerId\) view\?\.damageNumbers\.show\(event\.damage\)/u);
  const control = await read('js/battle/postgame/bosses/control-boss/battle.js');
  assert.match(control, /event\.type === "boss-damage" \|\| event\.type === "shield-damage"/u);
  for (const id of ['stat-boss', 'control-boss', 'data-sphinx']) {
    assert.match(await read(`js/battle/postgame/bosses/${id}/view.js`), /formatBossHealth/u);
  }
});

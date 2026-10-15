import test from "node:test";
import assert from "node:assert/strict";
import { bindBattlePresence } from "../../js/battle/postgame/battle-presence.js";

test("battle presence publishes position and shows only other participants in the same battle", () => {
  let listener, tick, frames, cancelled = false, removed = false;
  const sent = [];
  const state = { selfId: "self", battle: { roomId: "room", status: "running" }, players: [
    { id: "friend", zone: "battle:data-sphinx", x: .75, y: .25, hairColor: "brown", name: "Friend", direction: "left", moving: true },
    { id: "outsider", zone: "battle:data-sphinx", x: .5, y: .5 },
    { id: "field", zone: "plaza", x: .5, y: .5 },
    { id: "self", zone: "battle:data-sphinx", x: .5, y: .5 },
  ] };
  const player = { x: 100, y: 80, width: 40, height: 40, direction: "right", moving: true };
  const root = {};
  let roster = [{ id: "self" }, { id: "friend", connected: true }, { id: "field", connected: false }];
  const binding = bindBattlePresence({ battleId: "data-sphinx", roomId: "room",
    realtime: { getState: () => state, subscribe(fn) { listener = fn; fn(state); return () => { listener = null; }; }, updatePresence: value => sent.push(value) },
    getRuntime: () => ({ root, worldSize: { width: 400, height: 200 }, snapshot: player }),
    getRoster: () => roster,
    createView: () => ({ update(value) { frames = value; }, destroy() { removed = true; } }),
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { cancelled = true; },
  });
  assert.deepEqual(sent[0], { zone: "battle:data-sphinx", x: .3, y: .5, direction: "right", moving: true });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].id, "friend");
  assert.equal(frames[0].x, 280);
  assert.equal(frames[0].y, 30);
  assert.equal(frames[0].appearance.hairColor, "brown");
  assert.equal(frames[0].appearance.label, "Friend");
  player.moving = false; tick();
  assert.equal(sent.at(-1).moving, false);
  state.players = []; listener(state);
  assert.equal(frames.length, 1, "the roster keeps a teammate visible before the next position message");
  roster = []; listener(state);
  assert.deepEqual(frames, []);
  state.battle = null; tick();
  assert.equal(sent.length, 2, "leaving the room stops battle position traffic");
  binding.destroy(); tick();
  assert.equal(sent.length, 2);
  assert.equal(listener, null);
  assert.ok(cancelled && removed);
});

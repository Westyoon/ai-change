import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindSharedBossBattle,
  createSharedActionId,
  normalizeSharedBossSnapshot,
} from "../../js/battle/postgame/bosses/shared-battle.js";
import { StatBossEncounter } from "../../js/battle/postgame/bosses/stat-boss/encounter.js";
import {
  DATA_SPHINX_SELECTIONS,
  DataSphinxEncounter,
  normalizeDataSphinxConfig,
} from "../../js/battle/postgame/bosses/data-sphinx/index.js";
import {
  CONTROL_BOSS_PHASES,
  ControlBossEncounter,
  resolveControlBossConfig,
} from "../../js/battle/postgame/bosses/control-boss/index.js";

const controlSource = JSON.parse(await readFile(
  new URL("../../data/battle/control-boss.json", import.meta.url),
  "utf8",
));

function sharedSphinxConfig() {
  return normalizeDataSphinxConfig({
    battleId: "data-sphinx",
    arena: { width: 100, height: 60 },
    player: {
      spawn: { x: 50, y: 30 },
      width: 10,
      height: 10,
      speed: 10,
      maxHealth: 100,
    },
    timeLimitMs: 100,
    resolutionDelayMs: 0,
    deathDelayMs: 0,
    bossMaxHealth: 10,
    damagePerCorrect: 10,
    playerDamagePerWrong: 100,
    quizList: [{ id: "q1", question: "테스트", answer: "O" }],
  });
}

test("shared boss binding accepts only its room/battle and uses protocol-safe action ids", () => {
  let listener = null;
  let readyCount = 0;
  const hits = [];
  const snapshots = [];
  const finishes = [];
  const sharedBattle = {
    online: true,
    roomId: "ABCDEFGHIJ",
    battleId: "stat-boss",
    state: {
      roomId: "ABCDEFGHIJ",
      battleId: "stat-boss",
      status: "running",
      bossHp: 1_000,
      bossMaxHp: 1_000,
      revision: 0,
    },
    subscribe(callback) {
      listener = callback;
      return () => { listener = null; };
    },
    ready() {
      readyCount += 1;
    },
    hit(payload) {
      hits.push(payload);
    },
  };
  const binding = bindSharedBossBattle({
    sharedBattle,
    battleId: "stat-boss",
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onFinished: (snapshot) => finishes.push(snapshot),
  });

  assert.ok(binding);
  assert.equal(snapshots.length, 1, "the current snapshot is applied immediately");
  assert.equal(binding.ready(), true);
  assert.equal(readyCount, 1);
  const actionId = createSharedActionId("stat-boss:" + "x".repeat(100), "counter", 7);
  assert.ok(actionId.length <= 64);
  assert.match(actionId, /^[A-Za-z0-9._:-]+$/u);
  assert.equal(binding.hit({ kind: "counter-hit", actionId }), true);
  assert.deepEqual(hits, [{ kind: "counter-hit", actionId }]);

  listener({
    roomId: "OTHERROOM1",
    battleId: "stat-boss",
    status: "running",
    bossHp: 900,
    bossMaxHp: 1_000,
    revision: 1,
  });
  assert.equal(snapshots.length, 1, "another room cannot change this boss");
  listener({
    roomId: "ABCDEFGHIJ",
    battleId: "stat-boss",
    status: "finished",
    bossHp: 0,
    bossMaxHp: 1_000,
    revision: 2,
  });
  assert.equal(snapshots.length, 2);
  assert.equal(finishes.length, 1);
  assert.equal(binding.destroy(), true);
  assert.equal(listener, null);
});

test("stat boss keeps local counters as intents and clears only from server finished", () => {
  const completions = [];
  const encounter = new StatBossEncounter({
    arena: { width: 960, height: 600 },
    players: [{
      id: "p1",
      attackStat: 1,
      defenseStat: 1,
      healthStat: 1,
      position: { x: 480, y: 500 },
    }],
    bossBaseHp: 1_000,
    bossAttack: 10,
    staggerDurationMs: 1_400,
    patternIds: ["single-snipe"],
    seed: 1,
    sharedBossAuthority: true,
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "stat-boss:shared" });
  encounter.tick(10_000);
  assert.equal(encounter.getSnapshot().phase, "STAGGER");
  assert.equal(encounter.attemptCounter("p1").hit, true);
  assert.equal(encounter.getSnapshot().boss.hp, 1_000, "a local counter does not mutate shared HP");
  assert.deepEqual(completions, []);

  encounter.syncSharedBossHealth({ bossHp: 540, bossMaxHp: 1_000 });
  assert.equal(encounter.getSnapshot().boss.hp, 540);
  assert.equal(encounter.completeSharedBattle({ bossHp: 0, bossMaxHp: 1_000 }), true);
  assert.equal(encounter.getSnapshot().boss.hp, 0);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
});

test("data sphinx correct answers do not locally kill a shared boss and server CLEAR can replace a local FAIL", () => {
  const correctCompletions = [];
  const correct = new DataSphinxEncounter({
    config: sharedSphinxConfig(),
    sharedBossAuthority: true,
    onComplete: (attemptId, candidate) => correctCompletions.push({ attemptId, candidate }),
  });
  correct.init();
  correct.start({ attemptId: "data-sphinx:shared-correct" });
  correct.setPlayerLocation(DATA_SPHINX_SELECTIONS.O);
  correct.tick(100);
  assert.equal(correct.getSnapshot().bossHealth, 10);
  assert.deepEqual(correctCompletions, []);
  correct.syncSharedBossHealth({ bossHp: 5, bossMaxHp: 10 });
  assert.equal(correct.getSnapshot().bossHealth, 5);
  correct.completeSharedBattle({ bossHp: 0, bossMaxHp: 10 });
  assert.equal(correctCompletions.at(-1).candidate.status, "CLEAR");

  const defeatedCompletions = [];
  const defeated = new DataSphinxEncounter({
    config: sharedSphinxConfig(),
    sharedBossAuthority: true,
    onComplete: (attemptId, candidate) => defeatedCompletions.push({ attemptId, candidate }),
  });
  defeated.init();
  defeated.start({ attemptId: "data-sphinx:shared-defeated" });
  defeated.setPlayerLocation(DATA_SPHINX_SELECTIONS.X);
  defeated.tick(100);
  defeated.tick(0);
  assert.equal(defeatedCompletions[0].candidate.status, "FAIL");
  assert.equal(defeated.completeSharedBattle({ bossHp: 0, bossMaxHp: 10 }), true);
  assert.equal(defeatedCompletions[1].candidate.status, "CLEAR");
});

test("control boss reports valid local damage intents while server owns HP and completion", () => {
  const events = [];
  const completions = [];
  const encounter = new ControlBossEncounter({
    config: resolveControlBossConfig(controlSource),
    random: () => 0.5,
    sharedBossAuthority: true,
    onEvent: (event) => events.push(event),
    onComplete: (attemptId, candidate) => completions.push({ attemptId, candidate }),
  });
  encounter.init();
  encounter.start({ attemptId: "control-boss:shared" });
  encounter.enterPhase3();
  const plates = encounter.getSnapshot().platesSequence;
  for (const tileId of plates) encounter.activatePlate(tileId);
  assert.equal(encounter.getSnapshot().phase, CONTROL_BOSS_PHASES.GROGGY);
  assert.equal(encounter.getSnapshot().currentHp, 1_000);
  assert.ok(events.some((event) => event.type === "boss-damage" && event.kind === "gimmick"));

  encounter.setPlayerBounds({ x: 209, y: 121, width: 32, height: 42 });
  assert.equal(encounter.attack(), true);
  assert.equal(encounter.getSnapshot().currentHp, 1_000);
  assert.ok(events.some((event) => event.type === "boss-damage" && event.kind === "attack"));
  encounter.syncSharedBossHealth({ bossHp: 320, bossMaxHp: 1_000 });
  assert.equal(encounter.getSnapshot().currentHp, 320);
  encounter.enterPhase3();
  encounter.tick(1_000);
  assert.equal(
    encounter.getSnapshot().currentHp,
    320,
    "the local altar regeneration cannot overwrite server-authoritative HP",
  );
  encounter.completeSharedBattle({ bossHp: 0, bossMaxHp: 1_000 });
  assert.equal(completions.length, 1);
  assert.equal(completions[0].candidate.status, "CLEAR");
});

test("shared snapshot normalization clamps HP and rejects mismatched battles", () => {
  assert.deepEqual(
    normalizeSharedBossSnapshot({
      battleId: "data-sphinx",
      roomId: "ABCDEFGHIJ",
      status: "running",
      bossHp: 200,
      bossMaxHp: 100,
      revision: 4.8,
    }, "data-sphinx", "ABCDEFGHIJ"),
    {
      battleId: "data-sphinx",
      roomId: "ABCDEFGHIJ",
      status: "running",
      bossHp: 100,
      bossMaxHp: 100,
      revision: 4,
    },
  );
  assert.equal(normalizeSharedBossSnapshot({
    battleId: "control-boss",
    bossHp: 10,
    bossMaxHp: 100,
  }, "stat-boss"), null);
});

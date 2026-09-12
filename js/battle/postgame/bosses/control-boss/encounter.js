import {
  buildControlBossTiles,
  calcControlBossAttackDamage,
  calcControlBossIncomingDamage,
  calcControlBossMaxHp,
  resolveControlBossConfig,
} from "./config.js";

export const CONTROL_BOSS_STATES = Object.freeze({
  CREATED: "CREATED",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  DESTROYED: "DESTROYED",
});

export const CONTROL_BOSS_PHASES = Object.freeze({
  SHIELD: 1,
  INSTANT_KILL: 2,
  ALTAR: 3,
  GROGGY: 4,
});

export const CONTROL_BOSS_FAILURES = Object.freeze({
  PLAYER_DEFEATED: "PLAYER_DEFEATED",
  INSTANT_KILL: "INSTANT_KILL",
  FALL_HOLE: "FALL_HOLE",
});

// The projectile radius lives in logical 450x800 world units. The view uses
// the same value, so the visible orb and its collision area stay aligned at
// every responsive scale.
export const CONTROL_BOSS_BULLET_RADIUS = 6;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function rect(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    width: Math.max(0, finite(value.width)),
    height: Math.max(0, finite(value.height)),
  });
}

function center(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function overlaps(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function circleOverlapsRect(circle, bounds) {
  const nearestX = Math.max(bounds.x, Math.min(circle.x, bounds.x + bounds.width));
  const nearestY = Math.max(bounds.y, Math.min(circle.y, bounds.y + bounds.height));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) <= circle.radius;
}

function rounded(value) {
  return Math.round(finite(value) * 1000) / 1000;
}

function freezeList(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

function normalizePlayer(source, config) {
  const attackStat = Math.max(1, finite(source?.attackStat, 1));
  const defenseStat = Math.max(1, finite(source?.defenseStat, 1));
  const healthStat = Math.max(1, finite(source?.healthStat, 1));
  const start = config.player.startPosition;
  return Object.freeze({
    id: typeof source?.id === "string" && source.id ? source.id : "player-1",
    attackStat,
    defenseStat,
    healthStat,
    maxHp: calcControlBossMaxHp(healthStat, config.player),
    attackDamage: calcControlBossAttackDamage(attackStat, config.player),
    position: Object.freeze({ x: start.x, y: start.y }),
    appearance: source?.appearance ?? null,
    accountStats: source?.accountStats ?? null,
  });
}

export class ControlBossEncounter {
  constructor({ config = {}, player = null, random = Math.random, onEvent = null, onComplete = null } = {}) {
    this.config = resolveControlBossConfig(config);
    this.player = normalizePlayer(player, this.config);
    this.random = typeof random === "function" ? random : Math.random;
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.tiles = buildControlBossTiles(this.config);
    this.state = CONTROL_BOSS_STATES.CREATED;
    this.disposed = false;
    this.attemptId = null;
    this.projectileSequence = 0;
    this.shockwaveSequence = 0;
    this.#resetRuntime();
  }

  init() {
    if (this.disposed) throw new Error("Destroyed ControlBossEncounter cannot be initialized.");
    this.#resetRuntime();
    this.state = CONTROL_BOSS_STATES.READY;
    return this.getSnapshot();
  }

  start({ attemptId } = {}) {
    if (this.state !== CONTROL_BOSS_STATES.READY) {
      throw new Error(`Control Boss can only start from READY; received ${this.state}.`);
    }
    if (typeof attemptId !== "string" || attemptId.length === 0) {
      throw new TypeError("Control Boss start requires a non-empty attemptId.");
    }
    this.attemptId = attemptId;
    this.state = CONTROL_BOSS_STATES.RUNNING;
    this.#enterPhase1();
    this.#emit({ type: "started", attemptId });
    return this.getSnapshot();
  }

  pause() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return false;
    this.state = CONTROL_BOSS_STATES.PAUSED;
    this.#emit({ type: "paused" });
    return true;
  }

  resume() {
    if (this.state !== CONTROL_BOSS_STATES.PAUSED) return false;
    this.state = CONTROL_BOSS_STATES.RUNNING;
    this.#emit({ type: "resumed" });
    return true;
  }

  restart({ attemptId } = {}) {
    if (this.disposed) return false;
    this.#resetRuntime();
    this.state = CONTROL_BOSS_STATES.READY;
    this.start({ attemptId });
    return true;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.state = CONTROL_BOSS_STATES.DESTROYED;
    this.bullets = [];
    this.shockwaves = [];
    this.activeTileContacts.clear();
    this.onEvent = null;
    this.onComplete = null;
  }

  setPlayerBounds(bounds) {
    if (this.disposed) return false;
    this.playerBounds = rect(bounds);
    this.isCovered = overlaps(this.playerBounds, this.config.world.coverZone);
    return true;
  }

  attack() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING || this.isStunned) return false;
    this.metrics.attacks += 1;
    const playerCenter = center(this.playerBounds);
    const boss = this.config.world.bossZone;
    const nearest = {
      x: Math.max(boss.x, Math.min(playerCenter.x, boss.x + boss.width)),
      y: Math.max(boss.y, Math.min(playerCenter.y, boss.y + boss.height)),
    };
    if (Math.hypot(playerCenter.x - nearest.x, playerCenter.y - nearest.y) > this.config.boss.attackRange) {
      this.#status("⚠️ 사거리 부족! 보스 바로 밑으로 다가가세요.", "warning");
      return false;
    }

    if (this.phase === CONTROL_BOSS_PHASES.SHIELD) {
      this.currentShield = Math.max(0, this.currentShield - this.player.attackDamage);
      this.metrics.shieldDamage += this.player.attackDamage;
      if (this.currentShield === 0) {
        this.#enterPhase2();
      } else {
        this.#status(`보스 실드 타격! (${Math.ceil(this.currentShield)} 남음)`, "info");
      }
      return true;
    }
    if (this.phase === CONTROL_BOSS_PHASES.GROGGY) {
      this.#applyBossDamage(this.player.attackDamage);
      return true;
    }
    this.#status("공격이 통하지 않는 상태입니다!", "error");
    return false;
  }

  tick(deltaMs) {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return this.getSnapshot();
    const elapsedMs = Math.max(0, finite(deltaMs));
    const seconds = elapsedMs / 1000;
    this.elapsedMs += elapsedMs;
    this.isCovered = overlaps(this.playerBounds, this.config.world.coverZone);
    this.#updateStun(elapsedMs);
    this.#updateTileContacts();
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return this.getSnapshot();

    if (this.phase === CONTROL_BOSS_PHASES.SHIELD) {
      this.bossAttackTimerMs -= elapsedMs;
      while (this.bossAttackTimerMs <= 0 && this.state === CONTROL_BOSS_STATES.RUNNING) {
        this.#spawnBullet();
        this.bossAttackTimerMs += this.config.boss.attackIntervalSec * 1000;
      }
      this.#updateBullets(seconds);
    } else if (this.phase === CONTROL_BOSS_PHASES.INSTANT_KILL) {
      this.phaseTimerMs = Math.max(0, this.phaseTimerMs - elapsedMs);
      if (this.phaseTimerMs === 0) this.resolveInstantKill();
    } else if (this.phase === CONTROL_BOSS_PHASES.ALTAR) {
      this.phaseTimerMs = Math.max(0, this.phaseTimerMs - elapsedMs);
      this.currentHp = Math.min(
        this.config.boss.maxHp,
        this.currentHp + this.config.boss.maxHp * this.config.boss.regenRatePerSec * seconds,
      );
      this.shockwaveTimerMs -= elapsedMs;
      while (this.shockwaveTimerMs <= 0 && this.state === CONTROL_BOSS_STATES.RUNNING) {
        this.#spawnShockwave();
        this.shockwaveTimerMs += this.config.boss.shockwaveIntervalSec * 1000;
      }
      this.#updateShockwaves(seconds);
      if (this.phaseTimerMs === 0 && this.state === CONTROL_BOSS_STATES.RUNNING) {
        this.#status("시간 초과! Phase 1로 복귀합니다.", "error");
        this.#enterPhase1();
      }
    } else if (this.phase === CONTROL_BOSS_PHASES.GROGGY) {
      this.phaseTimerMs = Math.max(0, this.phaseTimerMs - elapsedMs);
      if (this.phaseTimerMs === 0) {
        this.#status("보스가 실드를 재충전했습니다!", "info");
        this.#enterPhase1();
      }
    }
    return this.getSnapshot();
  }

  enterPhase2() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return false;
    this.#enterPhase2();
    return true;
  }

  enterPhase3() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return false;
    this.#enterPhase3();
    return true;
  }

  activatePlate(tileId) {
    if (
      this.state !== CONTROL_BOSS_STATES.RUNNING ||
      this.phase !== CONTROL_BOSS_PHASES.ALTAR ||
      this.isStunned
    ) {
      return false;
    }
    const expected = this.platesSequence[this.currentPlateStep];
    if (tileId !== expected) {
      this.currentPlateStep = 0;
      this.clearedPlateIds.clear();
      this.#applyStun();
      return false;
    }
    this.currentPlateStep += 1;
    this.clearedPlateIds.add(tileId);
    if (this.currentPlateStep >= this.platesSequence.length) {
      this.#enterPhase4();
    } else {
      this.#status(`발판 (${this.currentPlateStep}/${this.platesSequence.length}) 성공!`, "success");
    }
    return true;
  }

  enterFallHole() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING || this.phase !== CONTROL_BOSS_PHASES.ALTAR) {
      return false;
    }
    this.#instantDefeat(CONTROL_BOSS_FAILURES.FALL_HOLE, "붕괴된 낙사 홀로 추락했습니다!");
    return true;
  }

  resolveInstantKill() {
    if (
      this.state !== CONTROL_BOSS_STATES.RUNNING ||
      this.phase !== CONTROL_BOSS_PHASES.INSTANT_KILL
    ) {
      return false;
    }
    if (this.isCovered) {
      this.#status("엄폐 성공! 즉사기를 회피했습니다.", "success");
      this.#enterPhase3();
    } else {
      this.#instantDefeat(CONTROL_BOSS_FAILURES.INSTANT_KILL, "즉사기에 노출되어 사망했습니다!");
    }
    return true;
  }

  getSnapshot() {
    const tileKinds = new Map();
    for (const id of this.collapsedTileIds) tileKinds.set(id, { kind: "hole", order: null });
    this.platesSequence.forEach((id, index) => tileKinds.set(id, { kind: "plate", order: index + 1 }));
    return Object.freeze({
      state: this.state,
      disposed: this.disposed,
      attemptId: this.attemptId,
      phase: this.phase,
      elapsedMs: rounded(this.elapsedMs),
      phaseTimerMs: rounded(this.phaseTimerMs),
      bossAttackTimerMs: rounded(this.bossAttackTimerMs),
      shockwaveTimerMs: rounded(this.shockwaveTimerMs),
      currentHp: rounded(this.currentHp),
      maxHp: this.config.boss.maxHp,
      currentShield: rounded(this.currentShield),
      maxShield: this.config.boss.maxShield,
      playerHp: rounded(this.playerHp),
      playerMaxHp: this.player.maxHp,
      playerBounds: rect(this.playerBounds),
      isCovered: this.isCovered,
      isStunned: this.isStunned,
      stunRemainingMs: rounded(this.stunRemainingMs),
      currentPlateStep: this.currentPlateStep,
      platesSequence: Object.freeze([...this.platesSequence]),
      collapsedTileIds: Object.freeze([...this.collapsedTileIds]),
      tiles: freezeList(this.tiles.map((tile) => ({
        ...tile,
        bounds: tile.bounds,
        kind: tileKinds.get(tile.id)?.kind ?? "plain",
        order: tileKinds.get(tile.id)?.order ?? null,
        cleared: this.clearedPlateIds.has(tile.id),
      }))),
      bullets: freezeList(this.bullets.map((bullet) => ({ ...bullet }))),
      shockwaves: freezeList(this.shockwaves.map((shockwave) => ({ ...shockwave }))),
      status: Object.freeze({ ...this.status }),
      player: this.player,
      metrics: Object.freeze({ ...this.metrics }),
    });
  }

  #resetRuntime() {
    const start = this.player?.position ?? { x: 0, y: 0 };
    const playerConfig = this.config?.player ?? { width: 32, height: 42 };
    this.phase = CONTROL_BOSS_PHASES.SHIELD;
    this.maxPhaseReached = CONTROL_BOSS_PHASES.SHIELD;
    this.elapsedMs = 0;
    this.phaseTimerMs = 0;
    this.bossAttackTimerMs = 0;
    this.shockwaveTimerMs = 0;
    this.currentHp = this.config?.boss?.maxHp ?? 0;
    this.currentShield = this.config?.boss?.maxShield ?? 0;
    this.playerHp = this.player?.maxHp ?? 1;
    this.playerBounds = rect({ ...start, width: playerConfig.width, height: playerConfig.height });
    this.isCovered = false;
    this.isStunned = false;
    this.stunRemainingMs = 0;
    this.bullets = [];
    this.shockwaves = [];
    this.platesSequence = [];
    this.collapsedTileIds = new Set();
    this.clearedPlateIds = new Set();
    this.activeTileContacts = new Set();
    this.currentPlateStep = 0;
    this.statusSequence = 0;
    this.status = { text: "전투 준비 중", tone: "info", sequence: 0 };
    this.metrics = {
      attacks: 0,
      shieldDamage: 0,
      bossDamage: 0,
      damageTaken: 0,
      platesCompleted: 0,
      maxPhaseReached: CONTROL_BOSS_PHASES.SHIELD,
    };
  }

  #enterPhase1() {
    this.phase = CONTROL_BOSS_PHASES.SHIELD;
    this.currentShield = this.config.boss.maxShield;
    this.phaseTimerMs = 0;
    this.bossAttackTimerMs = this.config.boss.phase1FirstAttackDelaySec * 1000;
    this.bullets = [];
    this.shockwaves = [];
    this.#clearGimmick();
    this.#status("Phase 1: 보스 가까이 다가가 공격해 실드를 파괴하세요!", "info");
    this.#emit({ type: "phase", phase: this.phase });
  }

  #enterPhase2() {
    this.phase = CONTROL_BOSS_PHASES.INSTANT_KILL;
    this.maxPhaseReached = Math.max(this.maxPhaseReached, this.phase);
    this.metrics.maxPhaseReached = this.maxPhaseReached;
    this.phaseTimerMs = this.config.boss.phase2CastSec * 1000;
    this.bullets = [];
    this.shockwaves = [];
    this.#status("⚠️ 즉사기 캐스팅! 중앙 엄폐벽 안으로 대피하세요!", "error");
    this.#emit({ type: "phase", phase: this.phase });
  }

  #enterPhase3() {
    this.phase = CONTROL_BOSS_PHASES.ALTAR;
    this.maxPhaseReached = Math.max(this.maxPhaseReached, this.phase);
    this.metrics.maxPhaseReached = this.maxPhaseReached;
    this.phaseTimerMs = this.config.boss.phase3DurationSec * 1000;
    this.shockwaveTimerMs = this.config.boss.shockwaveInitialDelaySec * 1000;
    this.bullets = [];
    this.shockwaves = [];
    this.currentPlateStep = 0;
    this.clearedPlateIds.clear();
    this.activeTileContacts.clear();
    this.#generateGimmick();
    this.#status("Phase 3: 발판을 순서대로 밟고 충격파는 엄폐하세요!", "warning");
    this.#emit({ type: "phase", phase: this.phase });
  }

  #enterPhase4() {
    this.phase = CONTROL_BOSS_PHASES.GROGGY;
    this.maxPhaseReached = Math.max(this.maxPhaseReached, this.phase);
    this.metrics.maxPhaseReached = this.maxPhaseReached;
    this.metrics.platesCompleted += 1;
    this.phaseTimerMs = this.config.boss.groggyDurationSec * 1000;
    this.bullets = [];
    this.shockwaves = [];
    this.#clearGimmick();
    this.#applyBossDamage(this.config.boss.maxHp * this.config.boss.groggyDirectDamageRate);
    if (this.state === CONTROL_BOSS_STATES.RUNNING) {
      this.#status("✨ 기믹 성공! 보스가 그로기 상태입니다. 지금 공격하세요!", "success");
      this.#emit({ type: "phase", phase: this.phase });
    }
  }

  #clearGimmick() {
    this.platesSequence = [];
    this.collapsedTileIds.clear();
    this.clearedPlateIds.clear();
    this.activeTileContacts.clear();
    this.currentPlateStep = 0;
  }

  #generateGimmick() {
    const ids = this.tiles.map((tile) => tile.id);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const sample = Math.max(0, Math.min(0.999999999, finite(this.random(), 0)));
      const swapIndex = Math.floor(sample * (index + 1));
      [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
    }
    const holeCount = this.config.gimmick.collapsedTileCount;
    this.collapsedTileIds = new Set(ids.slice(0, holeCount));
    this.platesSequence = ids.slice(holeCount, holeCount + this.config.gimmick.sequenceLength);
  }

  #spawnBullet() {
    const boss = this.config.world.bossZone;
    const origin = { x: boss.x + boss.width / 2, y: boss.y + boss.height };
    const target = center(this.playerBounds);
    const length = Math.hypot(target.x - origin.x, target.y - origin.y) || 1;
    const speed = this.config.boss.bulletSpeed;
    this.bullets.push({
      id: `bullet-${++this.projectileSequence}`,
      x: origin.x,
      y: origin.y,
      radius: CONTROL_BOSS_BULLET_RADIUS,
      vx: ((target.x - origin.x) / length) * speed,
      vy: ((target.y - origin.y) / length) * speed,
    });
  }

  #updateBullets(seconds) {
    const bounds = this.config.world.bounds;
    const cover = this.config.world.coverZone;
    const survivors = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * seconds;
      bullet.y += bullet.vy * seconds;
      if (circleOverlapsRect(bullet, cover)) continue;
      if (circleOverlapsRect(bullet, this.playerBounds)) {
        this.#damagePlayer(this.config.boss.bulletDamage, "BULLET");
        continue;
      }
      if (
        bullet.x + bullet.radius < 0 || bullet.x - bullet.radius > bounds.width ||
        bullet.y + bullet.radius < 0 || bullet.y - bullet.radius > bounds.height
      ) {
        continue;
      }
      survivors.push(bullet);
    }
    this.bullets = survivors;
  }

  #spawnShockwave() {
    const boss = this.config.world.bossZone;
    this.shockwaves.push({
      id: `shockwave-${++this.shockwaveSequence}`,
      x: boss.x + boss.width / 2,
      y: boss.y + boss.height / 2,
      radius: 10,
      hitPlayer: false,
    });
    this.#status("⚠️ 보스 원형 충격파! 엄폐벽 안으로 숨으세요!", "error");
  }

  #updateShockwaves(seconds) {
    const survivors = [];
    const playerCenter = center(this.playerBounds);
    for (const shockwave of this.shockwaves) {
      shockwave.radius += this.config.boss.shockwaveSpeed * seconds;
      if (!shockwave.hitPlayer) {
        const distance = Math.hypot(playerCenter.x - shockwave.x, playerCenter.y - shockwave.y);
        if (Math.abs(distance - shockwave.radius) < this.config.boss.shockwaveThickness) {
          shockwave.hitPlayer = true;
          if (this.isCovered) {
            this.#status("🛡️ 엄폐벽이 원형 충격파를 막았습니다!", "success");
          } else {
            this.#damagePlayer(this.config.boss.shockwaveDamage, "SHOCKWAVE");
            this.#applyStun();
          }
        }
      }
      if (shockwave.radius <= this.config.boss.shockwaveMaxRadius) survivors.push(shockwave);
    }
    this.shockwaves = survivors;
  }

  #updateTileContacts() {
    if (this.phase !== CONTROL_BOSS_PHASES.ALTAR || this.state !== CONTROL_BOSS_STATES.RUNNING) {
      this.activeTileContacts.clear();
      return;
    }
    const next = new Set();
    for (const tile of this.tiles) {
      if (!overlaps(this.playerBounds, tile.bounds)) continue;
      next.add(tile.id);
      if (this.activeTileContacts.has(tile.id)) continue;
      if (this.collapsedTileIds.has(tile.id)) {
        this.enterFallHole();
        break;
      }
      if (this.platesSequence.includes(tile.id)) this.activatePlate(tile.id);
      if (this.state !== CONTROL_BOSS_STATES.RUNNING || this.phase !== CONTROL_BOSS_PHASES.ALTAR) break;
    }
    this.activeTileContacts = next;
  }

  #applyStun() {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return;
    this.isStunned = true;
    this.stunRemainingMs = this.config.player.stunDurationMs;
    this.#status("⚠️ 경직! 발판 순서가 초기화되었습니다.", "error");
    this.#emit({ type: "stun", active: true, durationMs: this.stunRemainingMs });
  }

  #updateStun(elapsedMs) {
    if (!this.isStunned) return;
    this.stunRemainingMs = Math.max(0, this.stunRemainingMs - elapsedMs);
    if (this.stunRemainingMs > 0) return;
    this.isStunned = false;
    this.#status("경직 해제! 1번 발판부터 다시 밟으세요.", "info");
    this.#emit({ type: "stun", active: false, durationMs: 0 });
  }

  #damagePlayer(rawDamage, source) {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING || this.playerHp <= 0) return;
    const damage = Math.min(
      this.playerHp,
      calcControlBossIncomingDamage(rawDamage, this.player.defenseStat, this.config.player),
    );
    this.playerHp = Math.max(0, this.playerHp - damage);
    this.metrics.damageTaken += damage;
    this.#emit({ type: "player-damage", amount: damage, source });
    if (this.playerHp === 0) {
      this.#complete("FAIL", CONTROL_BOSS_FAILURES.PLAYER_DEFEATED);
    }
  }

  #instantDefeat(reason, statusText) {
    if (this.state !== CONTROL_BOSS_STATES.RUNNING) return;
    const damage = this.playerHp;
    this.playerHp = 0;
    this.metrics.damageTaken += damage;
    this.#status(statusText, "error");
    this.#emit({ type: "player-damage", amount: damage, source: reason, lethal: true });
    this.#complete("FAIL", reason);
  }

  #applyBossDamage(damage) {
    const applied = Math.min(this.currentHp, Math.max(0, finite(damage)));
    this.currentHp = Math.max(0, this.currentHp - applied);
    this.metrics.bossDamage += applied;
    if (this.currentHp === 0) this.#complete("CLEAR", null);
  }

  #complete(status, failureReason) {
    if (this.state === CONTROL_BOSS_STATES.COMPLETED || this.disposed) return false;
    this.state = CONTROL_BOSS_STATES.COMPLETED;
    this.isStunned = false;
    this.stunRemainingMs = 0;
    this.bullets = [];
    this.shockwaves = [];
    const candidate = Object.freeze({
      status,
      score: null,
      failureReason,
      metrics: Object.freeze({
        phaseReached: this.maxPhaseReached,
        bossHpRemaining: rounded(this.currentHp),
        bossShieldRemaining: rounded(this.currentShield),
        playerHpRemaining: rounded(this.playerHp),
        attacks: this.metrics.attacks,
        platesCompleted: this.metrics.platesCompleted,
        damageTaken: rounded(this.metrics.damageTaken),
        elapsedBattleMs: rounded(this.elapsedMs),
      }),
      reward: null,
    });
    this.#emit({ type: "complete", attemptId: this.attemptId, candidate });
    this.onComplete?.(this.attemptId, candidate);
    return true;
  }

  #status(text, tone) {
    this.status = { text, tone, sequence: ++this.statusSequence };
    this.#emit({ type: "status", ...this.status });
  }

  #emit(event) {
    this.onEvent?.(Object.freeze({ ...event }));
  }
}

export default ControlBossEncounter;

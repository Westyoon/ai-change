import {
  CharacterSystem,
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS
} from "../../battle/character/index.js";

export default class AfterControlBossMiniGame {
  constructor(context) {
    this.container = context.container;
    this.services = context.services || {};
    this.config = null;

    this.listeners = {};
    this.eventBus = this.services.events || {
      on: (e, fn) => { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      off: (e, fn) => {
        if (this.listeners[e]) this.listeners[e] = this.listeners[e].filter(h => h !== fn);
      },
      emit: (e, payload) => {
        if (this.listeners[e]) this.listeners[e].forEach(h => h(payload));
      }
    };

    this.characterSystem = null;

    this.currentHp = 0;
    this.currentShield = 0;
    this.phase = 1;
    this.phaseTimer = 0;
    this.bossAttackTimer = 0;

    this.shockwaveInterval = 4.5;
    this.shockwaveTimer = 0;
    this.shockwaves = [];

    this.playerCurrentHp = 100;
    this.playerMaxHp = 100;
    this.playerPos = { x: 225, y: 550 };
    this.playerSpeed = 220;
    this.playerEl = null;
    this.keys = { w: false, a: false, s: false, d: false };
    this.activeTriggers = new Set();

    this.bullets = [];
    this.platesSequence = [];
    this.currentPlateStep = 0;
    this.collapsedTileIds = new Set();
    this.tileBoundsMap = new Map();

    this.isCovered = false;
    this.isStunned = false;
    this.isGameOver = false;
    this.isDestroyed = false;

    this.rafId = null;
    this.lastTime = 0;

    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    this.onCharacterAttack = this.handleCharacterAttack.bind(this);
    this.onCharacterContact = this.handleCharacterContact.bind(this);
    this.onRetryClick = this.handleRetryClick.bind(this);
  }

  async init(configData) {
    this.config = configData;
    this.playerPos = { x: 225, y: 550 };
    this.renderDOM();
    this.buildWorldTriggers();
    this.initCharacterSystem();
    this.bindEvents();
    this.resetGame();
  }

  start() {
    this.lastTime = performance.now();
    if (this.characterSystem) {
      this.characterSystem.start();
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.loop();
  }

  destroy() {
    this.isDestroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.clearBulletsDOM();
    this.clearShockwavesDOM();
    this.unbindEvents();
    if (this.characterSystem) {
      this.characterSystem.destroy?.();
      this.characterSystem = null;
    }
    this.container.innerHTML = '';
  }

  renderDOM() {
    const { width, height } = this.config.world.bounds;
    const { coverZone, bossZone } = this.config.world;

    this.container.innerHTML = `
      <div class="after-controlboss-game light-theme" style="width: ${width}px; height: ${height}px;">
        <header class="acb-header">
          <span class="acb-title">⚡ ${this.config.title}</span>
          <span id="acb-phase-indicator" class="acb-phase-badge">Phase 1: 실드 파괴</span>
        </header>

        <section class="acb-boss-status-bar">
          <div class="acb-bar-wrap">
            <label>BOSS</label>
            <div class="acb-bar-bg"><div id="acb-hp-bar" class="acb-bar-fill hp"></div></div>
            <span id="acb-hp-text" class="acb-bar-val">0 / 0</span>
          </div>
          <div class="acb-bar-wrap">
            <label>SHIELD</label>
            <div class="acb-bar-bg"><div id="acb-shield-bar" class="acb-bar-fill shield"></div></div>
            <span id="acb-shield-text" class="acb-bar-val">0 / 0</span>
          </div>
          <div class="acb-bar-wrap player-hp-wrap">
            <label>PLAYER</label>
            <div class="acb-bar-bg"><div id="acb-player-hp-bar" class="acb-bar-fill player-hp"></div></div>
            <span id="acb-player-hp-text" class="acb-bar-val">100 / 100</span>
          </div>
        </section>

        <div id="acb-game-world" class="acb-game-world">
          <div id="acb-boss-box" class="acb-boss-box" style="
            left: ${bossZone.x}px;
            top: ${bossZone.y}px;
            width: ${bossZone.width}px;
            height: ${bossZone.height}px;
          ">
            <div class="boss-title">BOSS</div>
            <div id="acb-cast-bar-wrap" class="acb-cast-bar-wrap hidden">
              <div id="acb-cast-progress" class="acb-cast-progress"></div>
              <span id="acb-cast-label" class="acb-cast-label">즉사기 시전</span>
            </div>
          </div>

          <div id="acb-cover-wall" class="acb-cover-wall" style="
            left: ${coverZone.x}px;
            top: ${coverZone.y}px;
            width: ${coverZone.width}px;
            height: ${coverZone.height}px;
          ">
            <span>🛡️ 엄폐벽</span>
          </div>

          <div id="acb-altar-tiles" class="acb-altar-tiles"></div>
          <div id="acb-shockwave-layer" class="acb-shockwave-layer"></div>
          <div id="acb-bullet-layer" class="acb-bullet-layer"></div>
          <div id="acb-character-layer" class="acb-character-layer">
            <div id="acb-player-actor" class="acb-player-actor">YOU</div>
          </div>
        </div>

        <div id="acb-status-msg" class="acb-status-msg">보스 바로 밑으로 다가가 Space로 공격하세요!</div>

        <div id="acb-result-modal" class="acb-modal-backdrop hidden">
          <div class="acb-modal-card">
            <h3 id="acb-result-title">결과</h3>
            <p id="acb-result-desc">설명</p>
            <button id="acb-btn-retry" class="acb-btn-retry">다시 도전</button>
          </div>
        </div>
      </div>
    `;

    this.playerEl = this.container.querySelector('#acb-player-actor');
  }

  buildWorldTriggers() {
    const { startX, startY, tileW, tileH, rows, cols } = this.config.world.altarArea;
    this.tileBoundsMap.clear();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `tile_${r}_${c}`;
        this.tileBoundsMap.set(id, {
          x: startX + c * (tileW + 18),
          y: startY + r * (tileH + 12),
          width: tileW,
          height: tileH
        });
      }
    }
  }

  initCharacterSystem() {
    const characterMount = this.container.querySelector('#acb-character-layer');
    const zoneKind = (typeof CHARACTER_TRIGGER_KINDS !== 'undefined' && CHARACTER_TRIGGER_KINDS.ZONE) ? CHARACTER_TRIGGER_KINDS.ZONE : "zone";

    this.characterSystem = new CharacterSystem({
      events: this.eventBus,
      inputManager: this.services.input || null,
      container: characterMount,
      character: {
        id: "player",
        x: 225,
        y: 550,
        width: 32,
        height: 42,
        speed: 200,
        maxHealth: 100,
        currentHealth: 100,
        stats: { attack: 40, defense: 10, health: 100 }
      },
      world: {
        bounds: this.config.world.bounds,
        colliders: [
          this.config.world.bossZone,
          this.config.world.coverZone
        ],
        triggers: [
          {
            id: "trigger_cover_zone",
            kind: zoneKind,
            bounds: this.config.world.coverZone,
            metadata: { type: "COVER" }
          }
        ]
      }
    });
  }

  bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.eventBus.on(CHARACTER_EVENTS.ATTACK, this.onCharacterAttack);
    this.eventBus.on(CHARACTER_EVENTS.CONTACT, this.onCharacterContact);

    const retryBtn = this.container.querySelector('#acb-btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', this.onRetryClick);
    }
  }

  unbindEvents() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.eventBus.off?.(CHARACTER_EVENTS.ATTACK, this.onCharacterAttack);
    this.eventBus.off?.(CHARACTER_EVENTS.CONTACT, this.onCharacterContact);

    const retryBtn = this.container.querySelector('#acb-btn-retry');
    if (retryBtn) {
      retryBtn.removeEventListener('click', this.onRetryClick);
    }
  }

  handleKeyDown(e) {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(k)) this.keys[k] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      this.eventBus.emit(CHARACTER_EVENTS.ATTACK, {
        characterId: 'player',
        stats: { attack: 40 }
      });
    }
  }

  handleKeyUp(e) {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(k)) this.keys[k] = false;
  }

  resetGame() {
    this.currentHp = this.config.boss.maxHp;
    this.currentShield = this.config.boss.maxShield;
    this.playerCurrentHp = 100;
    this.playerMaxHp = 100;
    this.playerPos = { x: 225, y: 550 };
    this.isCovered = false;
    this.isStunned = false;
    this.isGameOver = false;
    this.activeTriggers.clear();
    this.clearBulletsDOM();
    this.clearShockwavesDOM();

    if (this.playerEl) {
      this.playerEl.style.left = `${this.playerPos.x}px`;
      this.playerEl.style.top = `${this.playerPos.y}px`;
    }

    if (this.characterSystem) {
      this.characterSystem.setControlLocked(false, "boss-gimmick-lock");
    }

    const modal = this.container.querySelector('#acb-result-modal');
    if (modal) modal.classList.add('hidden');

    this.enterPhase1();
    this.updatePlayerUI();
    this.start();
  }

  enterPhase1() {
    this.phase = 1;
    this.currentShield = this.config.boss.maxShield;
    this.bossAttackTimer = 0.6;
    this.clearTilesVisual();
    this.clearBulletsDOM();
    this.clearShockwavesDOM();
    this.rebuildDynamicTriggers();
    this.updateUI();
    this.setStatus("Phase 1: 보스 가까이 다가가 Space로 실드를 공격하세요!", "info");
  }

  enterPhase2() {
    this.phase = 2;
    this.phaseTimer = this.config.boss.phase2CastSec || 3;
    this.clearBulletsDOM();
    this.clearShockwavesDOM();
    this.updateUI();
    this.setStatus("⚠️ 보스 즉사기 캐스팅 (3초)! 중앙 엄폐벽 안으로 대피하세요!", "error", true);
  }

  enterPhase3() {
    this.phase = 3;
    this.phaseTimer = this.config.boss.phase3DurationSec || 30;
    this.currentPlateStep = 0;
    this.shockwaveTimer = 2.0;
    this.clearBulletsDOM();
    this.clearShockwavesDOM();
    this.generatePhase3GimmickData();
    this.renderTilesVisual();
    this.rebuildDynamicTriggers();
    this.updateUI();
    this.setStatus("Phase 3: 발판 순서대로 밟기! 원형 파동이 오면 엄폐벽 뒤로 숨으세요!", "warning");
  }

  enterPhase4() {
    this.phase = 4;
    this.phaseTimer = this.config.boss.groggyDurationSec || 10;
    this.clearTilesVisual();
    this.clearBulletsDOM();
    this.clearShockwavesDOM();
    this.rebuildDynamicTriggers();

    const bonusDmg = this.config.boss.maxHp * this.config.boss.groggyDirectDamageRate;
    this.applyBossDamage(bonusDmg);

    if (this.currentHp <= 0) return;

    this.updateUI();
    this.setStatus("✨ 기믹 성공! 보스 그로기 10초 다운! 가까이 가서 극딜하세요!", "success");
  }

  spawnShockwave() {
    const { bossZone } = this.config.world;
    const originX = bossZone.x + bossZone.width / 2;
    const originY = bossZone.y + bossZone.height / 2;

    const layer = this.container.querySelector('#acb-shockwave-layer');
    if (!layer) return;

    const ringEl = document.createElement('div');
    ringEl.className = 'acb-shockwave';
    ringEl.style.position = 'absolute';
    ringEl.style.borderRadius = '50%';
    ringEl.style.border = '5px solid #ff1744';
    ringEl.style.backgroundColor = 'rgba(255, 23, 68, 0.15)';
    ringEl.style.boxShadow = '0 0 20px #ff1744, inset 0 0 15px rgba(255, 23, 68, 0.5)';
    ringEl.style.transform = 'translate(-50%, -50%)';
    ringEl.style.pointerEvents = 'none';
    ringEl.style.zIndex = '30';
    ringEl.style.boxSizing = 'border-box';
    ringEl.style.left = `${originX}px`;
    ringEl.style.top = `${originY}px`;
    ringEl.style.width = '10px';
    ringEl.style.height = '10px';

    layer.appendChild(ringEl);

    this.shockwaves.push({
      x: originX,
      y: originY,
      radius: 10,
      speed: 240,
      maxRadius: 650,
      thickness: 30,
      hasHitPlayer: false,
      el: ringEl
    });

    this.setStatus("⚠️ 보스 원형 충격파 방출! 엄폐벽 안으로 숨으세요!", "error", true);
  }

  updateShockwaves(dt) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed * dt;

      const d = Math.round(sw.radius * 2);
      sw.el.style.width = `${d}px`;
      sw.el.style.height = `${d}px`;
      sw.el.style.left = `${sw.x}px`;
      sw.el.style.top = `${sw.y}px`;

      if (!sw.hasHitPlayer) {
        const dist = Math.hypot(this.playerPos.x - sw.x, this.playerPos.y - sw.y);
        if (Math.abs(dist - sw.radius) < sw.thickness) {
          sw.hasHitPlayer = true;
          if (this.isCovered) {
            this.setStatus("🛡️ 엄폐벽이 원형 충격파를 막아냈습니다!", "success");
          } else {
            this.applyDirectPlayerDamage(25);
            this.applyStunPenalty();
            this.setStatus("💥 원형 충격파에 피격되었습니다! (엄폐 실패)", "error", true);
          }
        }
      }

      if (sw.radius > sw.maxRadius) {
        sw.el.remove();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  clearShockwavesDOM() {
    this.shockwaves.forEach(sw => sw.el.remove());
    this.shockwaves = [];
  }

  spawnBossBullet() {
    const { bossZone } = this.config.world;
    const originX = bossZone.x + bossZone.width / 2;
    const originY = bossZone.y + bossZone.height;

    let dx = this.playerPos.x - originX;
    let dy = this.playerPos.y - originY;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    const bulletLayer = this.container.querySelector('#acb-bullet-layer');
    if (!bulletLayer) return;

    const bulletEl = document.createElement('div');
    bulletEl.className = 'acb-bullet';
    bulletLayer.appendChild(bulletEl);

    const speed = this.config.boss.bulletSpeed || 240;
    this.bullets.push({
      x: originX,
      y: originY,
      vx: dx * speed,
      vy: dy * speed,
      el: bulletEl
    });
  }

  updateBullets(dt) {
    const cover = this.config.world.coverZone;
    const { width: mapW, height: mapH } = this.config.world.bounds;
    const pBox = { x: this.playerPos.x - 16, y: this.playerPos.y - 21, width: 32, height: 42 };

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (
        b.x >= cover.x && b.x <= cover.x + cover.width &&
        b.y >= cover.y && b.y <= cover.y + cover.height
      ) {
        b.el.remove();
        this.bullets.splice(i, 1);
        continue;
      }

      if (
        b.x >= pBox.x && b.x <= pBox.x + pBox.width &&
        b.y >= pBox.y && b.y <= pBox.y + pBox.height
      ) {
        b.el.remove();
        this.bullets.splice(i, 1);
        const dmg = this.config.boss.bulletDamage || 15;
        this.applyDirectPlayerDamage(dmg);
        continue;
      }

      if (b.x < -20 || b.x > mapW + 20 || b.y < -20 || b.y > mapH + 20) {
        b.el.remove();
        this.bullets.splice(i, 1);
        continue;
      }

      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${b.y}px`;
    }
  }

  updatePlayerMovement(dt) {
    if (this.isStunned || this.isGameOver) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.d) dx += 1;
    if (this.keys.a) dx -= 1;
    if (this.keys.s) dy += 1;
    if (this.keys.w) dy -= 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    this.playerPos.x += dx * this.playerSpeed * dt;
    this.playerPos.y += dy * this.playerSpeed * dt;

    this.playerPos.x = Math.max(18, Math.min(432, this.playerPos.x));
    this.playerPos.y = Math.max(20, Math.min(610, this.playerPos.y));

    if (this.playerEl) {
      this.playerEl.style.left = `${this.playerPos.x}px`;
      this.playerEl.style.top = `${this.playerPos.y}px`;
    }

    const playerBox = { x: this.playerPos.x - 16, y: this.playerPos.y - 21, width: 32, height: 42 };

    const coverBounds = this.config.world.coverZone;
    const isOverCover = this.checkOverlap(playerBox, coverBounds);
    if (isOverCover && !this.activeTriggers.has('COVER')) {
      this.activeTriggers.add('COVER');
      this.eventBus.emit(CHARACTER_EVENTS.CONTACT, { phase: 'enter', metadata: { type: 'COVER' } });
    } else if (!isOverCover && this.activeTriggers.has('COVER')) {
      this.activeTriggers.delete('COVER');
      this.eventBus.emit(CHARACTER_EVENTS.CONTACT, { phase: 'exit', metadata: { type: 'COVER' } });
    }

    if (this.phase === 3) {
      this.collapsedTileIds.forEach(id => {
        const bounds = this.tileBoundsMap.get(id);
        if (bounds && this.checkOverlap(playerBox, bounds)) {
          this.eventBus.emit(CHARACTER_EVENTS.CONTACT, { phase: 'enter', metadata: { type: 'FALL_HOLE' } });
        }
      });

      this.platesSequence.forEach((id, step) => {
        const bounds = this.tileBoundsMap.get(id);
        const trigKey = `PLATE_${id}`;
        if (bounds && this.checkOverlap(playerBox, bounds)) {
          if (!this.activeTriggers.has(trigKey)) {
            this.activeTriggers.add(trigKey);
            this.eventBus.emit(CHARACTER_EVENTS.CONTACT, {
              phase: 'enter',
              metadata: { type: 'ORDER_PLATE', targetStep: step }
            });
          }
        } else {
          this.activeTriggers.delete(trigKey);
        }
      });
    }
  }

  checkOverlap(boxA, boxB) {
    return (
      boxA.x < boxB.x + boxB.width &&
      boxA.x + boxA.width > boxB.x &&
      boxA.y < boxB.y + boxB.height &&
      boxA.y + boxA.height > boxB.y
    );
  }

  applyDirectPlayerDamage(dmg) {
    if (this.isGameOver) return;

    this.playerCurrentHp = Math.max(0, this.playerCurrentHp - dmg);
    this.updatePlayerUI();

    if (this.characterSystem?.applyResolvedDamage) {
      this.characterSystem.applyResolvedDamage(dmg, { sourceId: "boss_attack" });
    }

    if (this.playerCurrentHp <= 0) {
      this.triggerGameOver("체력이 0이 되어 사망했습니다!");
    }
  }

  clearBulletsDOM() {
    this.bullets.forEach(b => b.el.remove());
    this.bullets = [];
  }

  loop() {
    if (this.isDestroyed || this.isGameOver) return;

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    this.updatePlayerMovement(dt);

    if (this.characterSystem?.update) {
      this.characterSystem.update(deltaMs);
    }

    if (this.phase === 1) {
      this.bossAttackTimer -= dt;
      if (this.bossAttackTimer <= 0) {
        this.spawnBossBullet();
        this.bossAttackTimer = this.config.boss.attackIntervalSec || 1.3;
      }
      this.updateBullets(dt);
    } else if (this.phase === 2) {
      this.phaseTimer -= dt;
      this.updateCastBar(this.phaseTimer, this.config.boss.phase2CastSec || 3, "즉사기 캐스팅!");
      if (this.phaseTimer <= 0) {
        this.resolveInstantKill();
      }
    } else if (this.phase === 3) {
      this.phaseTimer -= dt;

      const regen = this.config.boss.maxHp * this.config.boss.regenRatePerSec * dt;
      this.currentHp = Math.min(this.config.boss.maxHp, this.currentHp + regen);
      this.updateUI();

      this.shockwaveTimer -= dt;
      if (this.shockwaveTimer <= 0) {
        this.spawnShockwave();
        this.shockwaveTimer = this.shockwaveInterval;
      }
      this.updateShockwaves(dt);

      if (this.phaseTimer <= 0) {
        this.setStatus("시간 초과! Phase 1로 복귀합니다.", "error");
        this.enterPhase1();
      }
    } else if (this.phase === 4) {
      this.phaseTimer -= dt;
      this.updateCastBar(this.phaseTimer, this.config.boss.groggyDurationSec || 10, "그로기 상태!");
      if (this.phaseTimer <= 0) {
        this.setStatus("보스가 실드를 재충전했습니다!", "info");
        this.enterPhase1();
      }
    }

    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  resolveInstantKill() {
    if (this.isCovered) {
      this.setStatus("엄폐 성공! 즉사기를 회피했습니다.", "success");
      this.enterPhase3();
    } else {
      this.applyDirectPlayerDamage(999999);
      this.triggerGameOver("즉사기에 노출되어 사망했습니다! (엄폐 실패)");
    }
  }

  handleCharacterAttack(command) {
    if (this.isGameOver || this.isStunned) return;

    const boss = this.config.world.bossZone;
    const closestX = Math.max(boss.x, Math.min(this.playerPos.x, boss.x + boss.width));
    const closestY = Math.max(boss.y, Math.min(this.playerPos.y, boss.y + boss.height));
    const distance = Math.hypot(this.playerPos.x - closestX, this.playerPos.y - closestY);

    const maxAttackRange = 130;
    if (distance > maxAttackRange) {
      this.setStatus("⚠️ 사거리 부족! 보스 바로 밑으로 다가가세요.", "warning");
      return;
    }

    const baseDmg = command.stats?.attack || 40;

    if (this.phase === 1) {
      this.currentShield -= baseDmg;
      if (this.currentShield <= 0) {
        this.currentShield = 0;
        this.updateUI();
        this.enterPhase2();
        return;
      }
      this.updateUI();
      this.setStatus(`보스 실드 타격! (${this.currentShield} 남음)`, "info");
    } else if (this.phase === 4) {
      this.applyBossDamage(baseDmg);
    } else {
      this.setStatus("공격이 통하지 않는 상태입니다!", "error");
    }
  }

  handleCharacterContact(contact) {
    if (this.isGameOver) return;
    const { phase, metadata } = contact;

    if (metadata?.type === "COVER") {
      this.isCovered = (phase === "enter" || phase === "stay");
      const wall = this.container.querySelector('#acb-cover-wall');
      if (wall) wall.classList.toggle('active', this.isCovered);
      return;
    }

    if (this.phase !== 3) return;

    if (metadata?.type === "FALL_HOLE" && phase === "enter") {
      this.applyDirectPlayerDamage(999999);
      this.triggerGameOver("붕괴된 낙사 홀로 추락했습니다!");
      return;
    }

    if (metadata?.type === "ORDER_PLATE" && phase === "enter") {
      if (this.isStunned) return;
      if (metadata.targetStep === this.currentPlateStep) {
        this.currentPlateStep++;
        this.highlightTileCleared(this.platesSequence[metadata.targetStep]);
        if (this.currentPlateStep >= 4) {
          this.enterPhase4();
        } else {
          this.setStatus(`발판 (${this.currentPlateStep}/4) 성공!`, "success");
        }
      } else {
        this.applyStunPenalty();
      }
    }
  }

  applyStunPenalty() {
    this.isStunned = true;
    this.currentPlateStep = 0;
    this.setStatus("⚠️ 1초 경직 및 발판 순서가 초기화되었습니다!", "error", true);

    if (this.characterSystem) {
      this.characterSystem.setControlLocked(true, "boss-gimmick-lock");
    }

    const clearedTiles = this.container.querySelectorAll('.acb-tile.cleared');
    clearedTiles.forEach(el => el.classList.remove('cleared'));

    setTimeout(() => {
      this.isStunned = false;
      if (this.characterSystem) {
        this.characterSystem.setControlLocked(false, "boss-gimmick-lock");
      }
      this.setStatus("경직 해제! 1번 발판부터 다시 밟으세요.", "info");
    }, 1000);
  }

  applyBossDamage(dmg) {
    this.currentHp = Math.max(0, this.currentHp - dmg);
    this.updateUI();
    if (this.currentHp <= 0) this.triggerVictory();
  }

  triggerVictory() {
    this.isGameOver = true;
    this.showResultModal("🎉 VICTORY", "보스를 성공적으로 토벌하였습니다!");
    this.eventBus.emit('BOSS_BATTLE_CLEARED', { bossId: this.config.id });
  }

  triggerGameOver(reason) {
    this.isGameOver = true;
    this.showResultModal("💀 GAME OVER", reason);
  }

  handleRetryClick() {
    this.resetGame();
  }

  generatePhase3GimmickData() {
    const tileIds = Array.from(this.tileBoundsMap.keys());
    tileIds.sort(() => Math.random() - 0.5);
    this.collapsedTileIds = new Set(tileIds.slice(0, 2));
    const candidates = tileIds.filter(id => !this.collapsedTileIds.has(id));
    this.platesSequence = candidates.slice(0, 4);
  }

  rebuildDynamicTriggers() {
    if (!this.characterSystem) return;
    const zoneKind = (typeof CHARACTER_TRIGGER_KINDS !== 'undefined' && CHARACTER_TRIGGER_KINDS.ZONE) ? CHARACTER_TRIGGER_KINDS.ZONE : "zone";
    const trapKind = (typeof CHARACTER_TRIGGER_KINDS !== 'undefined' && CHARACTER_TRIGGER_KINDS.TRAP) ? CHARACTER_TRIGGER_KINDS.TRAP : "trap";
    const plateKind = (typeof CHARACTER_TRIGGER_KINDS !== 'undefined' && CHARACTER_TRIGGER_KINDS.PLATE) ? CHARACTER_TRIGGER_KINDS.PLATE : "plate";

    const triggers = [
      {
        id: "trigger_cover_zone",
        kind: zoneKind,
        bounds: this.config.world.coverZone,
        metadata: { type: "COVER" }
      }
    ];

    if (this.phase === 3) {
      this.collapsedTileIds.forEach(id => {
        triggers.push({
          id: `trigger_hole_${id}`,
          kind: trapKind,
          bounds: this.tileBoundsMap.get(id),
          metadata: { type: "FALL_HOLE" }
        });
      });

      this.platesSequence.forEach((id, idx) => {
        triggers.push({
          id: `trigger_plate_${id}`,
          kind: plateKind,
          bounds: this.tileBoundsMap.get(id),
          metadata: { type: "ORDER_PLATE", targetStep: idx }
        });
      });
    }

    this.characterSystem.worldTriggers = triggers;
  }

  renderTilesVisual() {
    const tilesLayer = this.container.querySelector('#acb-altar-tiles');
    if (!tilesLayer) return;
    tilesLayer.innerHTML = '';

    this.tileBoundsMap.forEach((bounds, id) => {
      const tile = document.createElement('div');
      tile.id = `tile-view-${id}`;
      tile.className = 'acb-tile';
      tile.style.left = `${bounds.x}px`;
      tile.style.top = `${bounds.y}px`;
      tile.style.width = `${bounds.width}px`;
      tile.style.height = `${bounds.height}px`;

      if (this.collapsedTileIds.has(id)) {
        tile.classList.add('collapsed');
        tile.textContent = '🕳️';
      } else {
        const orderIdx = this.platesSequence.indexOf(id);
        if (orderIdx !== -1) {
          tile.classList.add('active-target');
          tile.textContent = `${orderIdx + 1}`;
        } else {
          tile.classList.add('plain');
          tile.textContent = '·';
        }
      }
      tilesLayer.appendChild(tile);
    });
  }

  highlightTileCleared(tileId) {
    const tileEl = this.container.querySelector(`#tile-view-${tileId}`);
    if (tileEl) tileEl.classList.add('cleared');
  }

  clearTilesVisual() {
    const tilesLayer = this.container.querySelector('#acb-altar-tiles');
    if (!tilesLayer) return;
    tilesLayer.innerHTML = '';
    this.collapsedTileIds.clear();
    this.platesSequence = [];
  }

  updateUI() {
    const hpBar = this.container.querySelector('#acb-hp-bar');
    const shieldBar = this.container.querySelector('#acb-shield-bar');
    const hpText = this.container.querySelector('#acb-hp-text');
    const shieldText = this.container.querySelector('#acb-shield-text');
    const phaseBadge = this.container.querySelector('#acb-phase-indicator');

    if (hpBar) hpBar.style.width = `${(this.currentHp / this.config.boss.maxHp) * 100}%`;
    if (shieldBar) shieldBar.style.width = `${(this.currentShield / this.config.boss.maxShield) * 100}%`;
    if (hpText) hpText.textContent = `${Math.ceil(this.currentHp)}`;
    if (shieldText) shieldText.textContent = `${Math.ceil(this.currentShield)}`;

    if (phaseBadge) {
      const names = { 1: "Phase 1", 2: "Phase 2", 3: "Phase 3", 4: "Phase 4" };
      phaseBadge.textContent = names[this.phase];
    }
  }

  updatePlayerUI() {
    const playerBar = this.container.querySelector('#acb-player-hp-bar');
    const playerText = this.container.querySelector('#acb-player-hp-text');
    if (playerBar) playerBar.style.width = `${Math.max(0, (this.playerCurrentHp / this.playerMaxHp) * 100)}%`;
    if (playerText) playerText.textContent = `${Math.max(0, Math.ceil(this.playerCurrentHp))}`;
  }

  updateCastBar(remain, total, label) {
    const wrap = this.container.querySelector('#acb-cast-bar-wrap');
    const prog = this.container.querySelector('#acb-cast-progress');
    const lbl = this.container.querySelector('#acb-cast-label');
    if (!wrap || !prog || !lbl) return;

    if (this.phase === 2 || this.phase === 4) {
      wrap.classList.remove('hidden');
      prog.style.width = `${Math.max(0, (remain / total) * 100)}%`;
      lbl.textContent = `${label} (${remain.toFixed(1)}s)`;
    } else {
      wrap.classList.add('hidden');
    }
  }

  setStatus(msg, level = "info", vibrate = false) {
    const statusEl = this.container.querySelector('#acb-status-msg');
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `acb-status-msg ${level}`;
    if (vibrate) {
      statusEl.classList.remove('acb-shake');
      void statusEl.offsetWidth;
      statusEl.classList.add('acb-shake');
    }
  }

  showResultModal(title, desc) {
    const modal = this.container.querySelector('#acb-result-modal');
    const t = this.container.querySelector('#acb-result-title');
    const d = this.container.querySelector('#acb-result-desc');
    if (modal && t && d) {
      t.textContent = title;
      d.textContent = desc;
      modal.classList.remove('hidden');
    }
  }
}
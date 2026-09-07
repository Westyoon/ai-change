import test from 'node:test';
import assert from 'node:assert/strict';

// Node.js 환경용 경량 Mock DOM 주입
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        innerHTML: '',
        style: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) {
            if (force === undefined) {
              this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
            } else {
              force ? this.classes.add(c) : this.classes.delete(c);
            }
          },
          contains(c) { return this.classes.has(c); }
        },
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        remove() {},
        querySelector: () => el,
        querySelectorAll: () => [],
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {}
      };
      return el;
    }
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

import AfterControlBossMiniGame from '../../js/minigames/after_controlboss/index.js';
import { CHARACTER_EVENTS } from '../../js/battle/character/index.js';

// Mock EventBus
class MockEventBus {
  constructor() { this.listeners = {}; }
  on(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }
  off(event, handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }
  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(handler => handler(payload));
    }
  }
}

const mockConfig = {
  id: "after_controlboss",
  title: "시련의 제단 테스트",
  world: {
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    bossZone: { x: 340, y: 40, width: 120, height: 80 },
    coverZone: { x: 50, y: 420, width: 100, height: 100 },
    altarArea: { startX: 200, startY: 300, tileW: 80, tileH: 60, rows: 4, cols: 5 }
  },
  boss: {
    maxHp: 1000,
    maxShield: 500,
    regenRatePerSec: 0.01,
    phase2CastSec: 3,
    phase3DurationSec: 30,
    groggyDurationSec: 10,
    groggyDirectDamageRate: 0.2
  }
};

test('after_controlboss: Phase 1 실드 파괴 후 Phase 2 전이 검증', async () => {
  const container = document.createElement('div');
  const eventBus = new MockEventBus();
  const game = new AfterControlBossMiniGame({
    container,
    services: { events: eventBus, input: null }
  });

  await game.init(mockConfig);
  game.playerPos = { x: 400, y: 140 };

  assert.equal(game.phase, 1, '시작 시 Phase 1이어야 함');
  assert.equal(game.currentShield, 500, '초기 실드는 500이어야 함');

  // 공격으로 실드 500 소진
  for (let i = 0; i < 15; i++) {
    eventBus.emit(CHARACTER_EVENTS.ATTACK, { stats: { attack: 35 } });
  }

  assert.equal(game.currentShield, 0, '실드가 완전히 0이 되어야 함');
  assert.equal(game.phase, 2, '실드 소진 즉시 Phase 2로 전이되어야 함');
  game.destroy();
});

test('after_controlboss: Phase 2 엄폐 성공 시 Phase 3 전이 / 미엄폐 시 게임오버', async () => {
  const container = document.createElement('div');
  const eventBus = new MockEventBus();
  const game = new AfterControlBossMiniGame({
    container,
    services: { events: eventBus, input: null }
  });

  await game.init(mockConfig);
  game.enterPhase2();

  // 미엄폐 상태 즉사기 피격
  game.isCovered = false;
  game.resolveInstantKill();
  assert.equal(game.isGameOver, true, '엄폐하지 않으면 게임 오버되어야 함');

  // 엄폐 성공 시뮬레이션
  game.resetGame();
  game.enterPhase2();
  eventBus.emit(CHARACTER_EVENTS.CONTACT, {
    phase: 'enter',
    metadata: { type: 'COVER' }
  });
  assert.equal(game.isCovered, true, '엄폐 구역 진입 시 isCovered=true여야 함');

  game.resolveInstantKill();
  assert.equal(game.phase, 3, '엄폐 성공 시 Phase 3으로 전이되어야 함');
  game.destroy();
});

test('after_controlboss: Phase 3 발판 4개 순서 성공 시 Phase 4 진입 및 20% 체력 차감', async () => {
  const container = document.createElement('div');
  const eventBus = new MockEventBus();
  const game = new AfterControlBossMiniGame({
    container,
    services: { events: eventBus, input: null }
  });

  await game.init(mockConfig);
  game.enterPhase3();

  const prevHp = game.currentHp;
  const seq = game.platesSequence;

  seq.forEach((tileId, step) => {
    eventBus.emit(CHARACTER_EVENTS.CONTACT, {
      phase: 'enter',
      metadata: { type: 'ORDER_PLATE', targetStep: step }
    });
  });

  assert.equal(game.phase, 4, '발판 4개 순서 성공 시 Phase 4로 전이되어야 함');
  const expectedHp = prevHp - (mockConfig.boss.maxHp * 0.2);
  assert.equal(game.currentHp, expectedHp, '기믹 성공 시 보스 최대 HP의 20%가 차감되어야 함');
  game.destroy();
});

test('after_controlboss: Phase 3 낙사 홀 진입 시 즉사 판정', async () => {
  const container = document.createElement('div');
  const eventBus = new MockEventBus();
  const game = new AfterControlBossMiniGame({
    container,
    services: { events: eventBus, input: null }
  });

  await game.init(mockConfig);
  game.enterPhase3();

  eventBus.emit(CHARACTER_EVENTS.CONTACT, {
    phase: 'enter',
    metadata: { type: 'FALL_HOLE' }
  });

  assert.equal(game.isGameOver, true, '붕괴된 낙사 홀 진입 시 게임 오버되어야 함');
  game.destroy();
});

import { findPlatform } from './platforms.js';
import { showFloatText, flashBox, popHeart, updateHearts } from './hud.js';

export function spawnEgg(refs, config, state) {
    const doc = refs.field.ownerDocument;
    const type = Math.random() < config.eggTypeProbability.in ? 'in' : 'de';
    const el = doc.createElement('div');
    el.className = 'aids-egg aids-egg-' + type;
    el.textContent = type === 'in' ? '인지' : '데사';
    refs.field.appendChild(el);

    const fieldW = refs.field.clientWidth;
    const firstPlatform = findPlatform(state, 0, 'center');

    state.eggs.push({
        type,
        el,
        x: fieldW / 2,
        y: 0,
        vx: 0,
        vy: 0,
        phase: 'falling', // 'falling' | 'rolling'
        target: 'platform', // 'platform' | 'box' | 'miss'
        targetPlatform: firstPlatform,
        platform: null,
        rollTime: 0,
        finalDir: null,
        done: false,
    });
}

export function finalizeRelease(state, egg, exitSide, config, runtimePhysics = config.physics) {
    const rowIndex = egg.platform.rowIndex;
    egg.phase = 'falling';
    egg.vy = 0;
    const releaseSpeedThreshold = runtimePhysics.releaseSpeedThreshold ?? 60;
    const releaseSpeed = runtimePhysics.releaseSpeed ?? 120;
    if (Math.abs(egg.vx) < releaseSpeedThreshold) {
        egg.vx = exitSide === 'left' ? -releaseSpeed : releaseSpeed;
    }

    const nextRowIndex = rowIndex + 1;

    if (nextRowIndex >= config.platformRows.length) {
        egg.finalDir = exitSide;
        egg.target = 'box';
        egg.targetPlatform = null;
        return;
    }

    if (egg.platform.lane === 'center' || rowIndex === 1) {
        egg.targetPlatform = findPlatform(state, nextRowIndex, exitSide);
        egg.target = 'platform';
        return;
    }

    if (rowIndex === 2) {
        const inward =
            (egg.platform.lane === 'left' && exitSide === 'right') ||
            (egg.platform.lane === 'right' && exitSide === 'left');
        if (inward) {
            egg.targetPlatform = findPlatform(state, nextRowIndex, 'center');
            egg.target = 'platform';
        } else {
            egg.target = 'miss';
            egg.targetPlatform = null;
        }
    }
}

function loseLife(refs, state) {
    state.life = Math.max(0, state.life - 1);
    popHeart(refs.heartsEl, state.life);
    updateHearts(refs.heartsEl, state.life);
}

export function resolveEgg(refs, state, egg) {
    egg.done = true;
    const correctSide = egg.type === 'in' ? 'left' : 'right';
    const good = egg.finalDir === correctSide;
    const landedBox = egg.finalDir === 'left' ? refs.boxLeft : refs.boxRight;

    flashBox(landedBox, good);
    showFloatText(landedBox, good ? '정답!' : '오답!', good);

    if (good) {
        state.correctCount++;
    } else {
        state.wrongCount++;
        loseLife(refs, state);
    }
    egg.el.remove();
}

export function resolveMiss(refs, state, egg) {
    egg.done = true;
    const doc = refs.field.ownerDocument;

    const marker = doc.createElement('div');
    marker.className = 'aids-miss-marker';
    marker.style.position = 'absolute';
    marker.style.left = Math.max(6, Math.min(refs.field.clientWidth - 40, egg.x - 20)) + 'px';
    marker.style.top = Math.max(0, Math.min(refs.field.clientHeight - 20, egg.y - 10)) + 'px';
    refs.field.appendChild(marker);
    showFloatText(marker, '이탈!', false);
    setTimeout(() => marker.remove(), 750);

    state.lostCount++;
    loseLife(refs, state);
    egg.el.remove();
}

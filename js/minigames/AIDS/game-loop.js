import { stepFalling, stepRolling } from './physics.js';
import { spawnEgg, finalizeRelease, resolveEgg, resolveMiss } from './eggs.js';
import { updateTimerDisplay } from './hud.js';

export function spawnIntervalFor(config, elapsedSec) {
    for (const rule of config.spawnIntervals) {
        if (rule.maxElapsedSec === null || elapsedSec < rule.maxElapsedSec) {
            return rule.intervalMs;
        }
    }
    return config.spawnIntervals[config.spawnIntervals.length - 1].intervalMs;
}

export function stepFrame({ state, config, refs, elapsedMs }) {
    const elapsedSec = elapsedMs / 1000;
    const dt = Math.min(Math.max((elapsedMs - state.lastElapsedMs) / 1000, 0), 0.032);
    state.lastElapsedMs = elapsedMs;

    if (elapsedSec >= state.nextSpawnAtSec) {
        spawnEgg(refs, config, state);
        state.nextSpawnAtSec = elapsedSec + spawnIntervalFor(config, elapsedSec) / 1000;
    }

    const fieldW = refs.field.clientWidth;
    const fieldH = refs.field.clientHeight;
    const eggR = config.physics.eggRadius;

    for (const egg of state.eggs) {
        if (egg.done) continue;

        if (egg.phase === 'falling') {
            stepFalling(egg, dt, config, fieldW, fieldH);

            if (egg.target === 'box') {
                if (egg.y + eggR >= fieldH) {
                    resolveEgg(refs, state, egg);
                    continue;
                }
            } else if (egg.target === 'miss') {
                if (egg.x < -60 || egg.x > fieldW + 60 || egg.y > fieldH + 60) {
                    resolveMiss(refs, state, egg);
                    continue;
                }
            } else {
                const plat = egg.targetPlatform;
                const surfaceY = plat.y - config.physics.surfaceOffset;
                if (egg.y + eggR >= surfaceY) {
                    egg.y = surfaceY - eggR;
                    const dxAtLanding = egg.x - plat.x;

                    if (Math.abs(dxAtLanding) > config.physics.platformHalfLen) {
                        egg.vy = 0;
                        egg.platform = plat;
                        finalizeRelease(state, egg, dxAtLanding >= 0 ? 'right' : 'left', config);
                    } else {
                        egg.vy = 0;
                        egg.vx *= config.physics.landingInertiaKeep;
                        const margin = Math.max(config.physics.platformHalfLen - Math.abs(dxAtLanding), 2);
                        const maxSafeSpeed = Math.sqrt(2 * config.physics.rollAccel * margin) * 0.85;
                        if (Math.abs(egg.vx) > maxSafeSpeed) {
                            egg.vx = Math.sign(egg.vx) * maxSafeSpeed;
                        }
                        egg.phase = 'rolling';
                        egg.platform = plat;
                        egg.rollTime = 0;
                    }
                }
            }
        } else {
            const exitSide = stepRolling(egg, dt, config, state.tilt);
            if (exitSide) {
                finalizeRelease(state, egg, exitSide, config);
            }
        }

        egg.el.style.left = egg.x - eggR + 'px';
        egg.el.style.top = egg.y - eggR + 'px';
    }

    state.eggs = state.eggs.filter((e) => !e.done);

    const timeLeft = Math.max(0, config.totalTimeSec - elapsedSec);
    updateTimerDisplay(refs.timerEl, timeLeft, config.warningThresholdSec);

    if (state.life <= 0) return { terminal: 'FAIL' };
    if (timeLeft <= 0) return { terminal: 'CLEAR' };
    return { terminal: null };
}

import { platformRestingY, stepFalling, stepRolling } from './physics.js';
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
    const physics = state.fieldLayout?.physics ?? config.physics;
    const eggR = physics.eggRadius;

    for (const egg of state.eggs) {
        if (egg.done) continue;

        if (egg.phase === 'falling') {
            stepFalling(egg, dt, config, fieldW, fieldH, physics);

            const crossedSide = egg.x <= 0 ? 'left' : (egg.x >= fieldW ? 'right' : null);
            if (crossedSide) {
                egg.finalDir = crossedSide;
                resolveEgg(refs, state, egg);
                continue;
            }

            if (egg.target === 'box') {
                if (egg.y + eggR >= fieldH) {
                    const centerOffset = egg.x - fieldW / 2;
                    if (centerOffset < 0) {
                        egg.finalDir = 'left';
                        resolveEgg(refs, state, egg);
                    } else if (centerOffset > 0) {
                        egg.finalDir = 'right';
                        resolveEgg(refs, state, egg);
                    } else if (egg.vx !== 0) {
                        egg.finalDir = egg.vx < 0 ? 'left' : 'right';
                        resolveEgg(refs, state, egg);
                    } else {
                        resolveMiss(refs, state, egg);
                    }
                    continue;
                }
            } else if (egg.target === 'miss') {
                const missMargin = physics.missMargin ?? 60;
                if (
                    egg.x < -missMargin
                    || egg.x > fieldW + missMargin
                    || egg.y > fieldH + missMargin
                ) {
                    resolveMiss(refs, state, egg);
                    continue;
                }
            } else {
                const plat = egg.targetPlatform;
                const dxAtLanding = egg.x - plat.x;
                const contactX = Math.max(
                    plat.x - physics.platformHalfLen,
                    Math.min(plat.x + physics.platformHalfLen, egg.x)
                );
                const restingY = platformRestingY(
                    plat,
                    contactX,
                    config,
                    state.tilt,
                    physics
                );
                if (egg.y >= restingY) {
                    if (Math.abs(dxAtLanding) > physics.platformHalfLen) {
                        // Passing beside a target is not the same as rolling off it.
                        // Keep the current momentum and let the egg leave naturally.
                        egg.target = 'miss';
                        egg.targetPlatform = null;
                        egg.platform = null;
                    } else {
                        egg.y = restingY;
                        egg.vy = 0;
                        egg.vx *= physics.landingInertiaKeep;
                        const margin = Math.max(physics.platformHalfLen - Math.abs(dxAtLanding), 2);
                        const maxSafeSpeed = Math.sqrt(2 * physics.rollAccel * margin) * 0.85;
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
            const exitSide = stepRolling(egg, dt, config, state.tilt, physics);
            if (exitSide) {
                finalizeRelease(state, egg, exitSide, config, physics);
            }
        }

        egg.el.style.left = egg.x - eggR + 'px';
        egg.el.style.top = egg.y - eggR + 'px';
    }

    state.eggs = state.eggs.filter((e) => !e.done);

    const timeLeft = Math.max(0, config.totalTimeSec - elapsedSec);
    updateTimerDisplay(refs.timerEl, timeLeft, config.warningThresholdSec);

    if (timeLeft <= 0) return { terminal: 'CLEAR' };
    if (state.life <= 0) return { terminal: 'FAIL' };
    return { terminal: null };
}

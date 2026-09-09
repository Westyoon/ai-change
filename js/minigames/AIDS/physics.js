function tiltAngleRad(config, tilt) {
    const rad = (config.physics.tiltAngleDeg * Math.PI) / 180;
    return tilt === 'left' ? -rad : rad;
}

const GUIDED_LANDING_EDGE_RATIO = 0.72;

export function platformRestingY(
    platform,
    x,
    config,
    tilt,
    runtimePhysics = config.physics
) {
    const theta = tiltAngleRad(config, tilt);
    const eggRadius = Number.isFinite(runtimePhysics.eggRadius)
        ? runtimePhysics.eggRadius
        : 0;
    return platform.y
        - runtimePhysics.surfaceOffset
        - eggRadius
        + (x - platform.x) * Math.tan(theta);
}

export function stepFalling(egg, dt, config, _fieldW, _fieldH, runtimePhysics = config.physics) {
    const p = runtimePhysics;
    const eggRadius = Number.isFinite(p.eggRadius) ? p.eggRadius : 0;

    egg.vy += p.gravity * dt;

    if (egg.target === 'platform' && egg.targetPlatform) {
        const surfaceY = egg.targetPlatform.y - p.surfaceOffset - eggRadius;
        const remainingHeight = Math.max(surfaceY - egg.y, 0);
        let timeToLand;
        if (p.gravity > 0) {
            const discriminant = Math.max(egg.vy * egg.vy + 2 * p.gravity * remainingHeight, 0);
            timeToLand = (-egg.vy + Math.sqrt(discriminant)) / p.gravity;
        } else {
            timeToLand = egg.vy > 0 ? remainingHeight / egg.vy : 0.1;
        }

        if (timeToLand > 0.02) {
            const projectedX = egg.x + egg.vx * timeToLand;
            const platformHalfLen = Number.isFinite(p.platformHalfLen)
                ? p.platformHalfLen
                : 0;
            const safeHalfLength = platformHalfLen * GUIDED_LANDING_EDGE_RATIO;
            const safeLeft = egg.targetPlatform.x - safeHalfLength;
            const safeRight = egg.targetPlatform.x + safeHalfLength;
            const steerX = Math.max(safeLeft, Math.min(safeRight, projectedX));
            const desiredVx = Math.max(
                -p.maxFallSteerSpeed,
                Math.min(p.maxFallSteerSpeed, (steerX - egg.x) / timeToLand)
            );
            const maxDelta = p.fallSteerAccel * dt;
            const diff = desiredVx - egg.vx;
            egg.vx += Math.max(-maxDelta, Math.min(maxDelta, diff));
        }
    }

    egg.x += egg.vx * dt;
    egg.y += egg.vy * dt;
}

export function stepRolling(egg, dt, config, tilt, runtimePhysics = config.physics) {
    const p = runtimePhysics;

    const dirSign = tilt === 'left' ? -1 : 1;
    egg.vx += p.rollAccel * dirSign * dt;
    egg.vx = Math.max(-p.maxRollSpeed, Math.min(p.maxRollSpeed, egg.vx));
    egg.x += egg.vx * dt;

    const dx = egg.x - egg.platform.x;
    const theta = tiltAngleRad(config, tilt);
    egg.y = platformRestingY(egg.platform, egg.x, config, tilt, p);
    egg.vy = egg.vx * Math.tan(theta);

    egg.rollTime += dt;
    const reachedEdge = Math.abs(dx) >= p.platformHalfLen;
    const forced = egg.rollTime > p.maxRollTimeSec; // 끼임 방지용 강제 이탈

    if (reachedEdge || forced) {
        return reachedEdge ? (dx >= 0 ? 'right' : 'left') : (egg.vx >= 0 ? 'right' : 'left');
    }
    return null;
}

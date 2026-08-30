function tiltAngleRad(config, tilt) {
    const rad = (config.physics.tiltAngleDeg * Math.PI) / 180;
    return tilt === 'left' ? -rad : rad;
}

export function boxTargetX(config, dir, fieldW) {
    const pct = dir === 'left' ? config.boxes.leftPct : config.boxes.rightPct;
    return (fieldW * pct) / 100;
}

export function stepFalling(egg, dt, config, fieldW, fieldH, runtimePhysics = config.physics) {
    const p = runtimePhysics;

    let steerX = null;
    let surfaceY = null;
    if (egg.target === 'platform' && egg.targetPlatform) {
        steerX = egg.targetPlatform.x;
        surfaceY = egg.targetPlatform.y - p.surfaceOffset;
    } else if (egg.target === 'box') {
        steerX = boxTargetX(config, egg.finalDir, fieldW);
        surfaceY = fieldH;
    }

    egg.vy += p.gravity * dt;

    if (steerX !== null && surfaceY !== null) {
        const remainingHeight = Math.max(surfaceY - egg.y, 0);
        let timeToLand;
        if (p.gravity > 0) {
            const discriminant = Math.max(egg.vy * egg.vy + 2 * p.gravity * remainingHeight, 0);
            timeToLand = (-egg.vy + Math.sqrt(discriminant)) / p.gravity;
        } else {
            timeToLand = egg.vy > 0 ? remainingHeight / egg.vy : 0.1;
        }

        if (timeToLand > 0.02) {
            const desiredVx = Math.max(
                -p.maxFallSteerSpeed,
                Math.min(p.maxFallSteerSpeed, (steerX - egg.x) / timeToLand)
            );
            const maxDelta = p.fallSteerAccel * dt;
            const diff = desiredVx - egg.vx;
            egg.vx += Math.max(-maxDelta, Math.min(maxDelta, diff));
        } else {
            const target = steerX - egg.x >= 0 ? p.maxFallSteerSpeed : -p.maxFallSteerSpeed;
            const maxDelta = p.fallSteerAccel * dt;
            const diff = target - egg.vx;
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
    egg.y = egg.platform.y - p.surfaceOffset + dx * Math.sin(theta);

    egg.rollTime += dt;
    const reachedEdge = Math.abs(dx) >= p.platformHalfLen;
    const forced = egg.rollTime > p.maxRollTimeSec; // 끼임 방지용 강제 이탈

    if (reachedEdge || forced) {
        return reachedEdge ? (dx >= 0 ? 'right' : 'left') : (egg.vx >= 0 ? 'right' : 'left');
    }
    return null;
}

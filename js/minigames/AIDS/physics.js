function tiltAngleRad(config, tilt) {
    const rad = (config.physics.tiltAngleDeg * Math.PI) / 180;
    return tilt === 'left' ? -rad : rad;
}

export function boxTargetX(config, dir, fieldW) {
    const pct = dir === 'left' ? config.boxes.leftPct : config.boxes.rightPct;
    return (fieldW * pct) / 100;
}

// 낙하 중 위치 갱신
export function stepFalling(egg, dt, config, fieldW) {
    const p = config.physics;

    let steerX = null;
    if (egg.target === 'platform' && egg.targetPlatform) {
        steerX = egg.targetPlatform.x;
    } else if (egg.target === 'box') {
        steerX = boxTargetX(config, egg.finalDir, fieldW);
    }
    if (steerX !== null) {
        egg.vx += (steerX - egg.x) * p.steer * dt;
    }

    egg.vy += p.gravity * dt;
    egg.x += egg.vx * dt;
    egg.y += egg.vy * dt;
}

// 발판 구르는 중 위치 갱신
export function stepRolling(egg, dt, config, tilt) {
    const p = config.physics;

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
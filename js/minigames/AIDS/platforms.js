const PLATFORM_BORDER_WIDTH = 2;

export function platformOuterDimensions(platformHalfLen) {
    if (!Number.isFinite(platformHalfLen) || platformHalfLen <= 0) {
        throw new TypeError('platformHalfLen must be a positive finite number.');
    }
    const outerHalf = platformHalfLen + PLATFORM_BORDER_WIDTH;
    return Object.freeze({
        width: outerHalf * 2,
        marginLeft: -outerHalf,
    });
}

export function layoutPlatforms(refs, config, state) {
    const doc = refs.platformsContainer.ownerDocument;
    const fieldW = refs.field.clientWidth;
    const fieldH = refs.field.clientHeight;
    const jitterPct = config.physics.platformJitterPct;

    refs.platformsContainer.innerHTML = '';
    state.platforms = [];

    config.platformRows.forEach((row, rowIndex) => {
        row.lanes.forEach((laneDef) => {
            const jitterX = Math.random() * jitterPct * 2 - jitterPct;
            const x = (fieldW * (laneDef.xPct + jitterX)) / 100;
            const y = (fieldH * row.yPct) / 100;

            const wrap = doc.createElement('div');
            wrap.className = 'aids-platform-wrap aids-tilt-' + state.tilt;
            wrap.style.left = x + 'px';
            wrap.style.top = y + 'px';
            const dimensions = platformOuterDimensions(config.physics.platformHalfLen);
            wrap.style.width = dimensions.width + 'px';
            wrap.style.marginLeft = dimensions.marginLeft + 'px';
            wrap.innerHTML = '<div class="aids-platform-bar"></div><div class="aids-platform-pivot"></div>';
            refs.platformsContainer.appendChild(wrap);

            state.platforms.push({ rowIndex, lane: laneDef.lane, x, y, el: wrap });
        });
    });
}

export function findPlatform(state, rowIndex, lane) {
    return state.platforms.find((p) => p.rowIndex === rowIndex && p.lane === lane);
}

export function setTilt(state, dir) {
    state.tilt = dir;
    state.platforms.forEach((p) => {
        p.el.classList.remove('aids-tilt-left', 'aids-tilt-right');
        p.el.classList.add(dir === 'left' ? 'aids-tilt-left' : 'aids-tilt-right');
    });
}

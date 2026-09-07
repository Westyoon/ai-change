const PLATFORM_BORDER_WIDTH = 2;

export const AIDS_BASE_FIELD_WIDTH = 362;
export const AIDS_BASE_FIELD_HEIGHT = 490;

const MIN_LAYOUT_SCALE = 0.75;
const MAX_HORIZONTAL_LAYOUT_SCALE = 5;
const MAX_VERTICAL_LAYOUT_SCALE = 3;

function positiveFinite(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive finite number.`);
    }
    return value;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function measuredFieldSize(field, axis, fallback) {
    const clientValue = Number(field?.[axis === 'width' ? 'clientWidth' : 'clientHeight']);
    if (clientValue > 0) return clientValue;
    const rectValue = Number(field?.getBoundingClientRect?.()?.[axis]);
    return rectValue > 0 ? rectValue : fallback;
}

export function platformOuterDimensions(platformHalfLen) {
    positiveFinite(platformHalfLen, 'platformHalfLen');
    const outerHalf = platformHalfLen + PLATFORM_BORDER_WIDTH;
    return Object.freeze({
        width: outerHalf * 2,
        marginLeft: -outerHalf,
    });
}

/**
 * Converts the original 362px-wide field physics into responsive field units.
 * Horizontal distances, acceleration, velocity, and forced release velocity all
 * use one scale so the original timing is retained as the desktop field grows.
 */
export function createFieldLayout(config, fieldWidth, fieldHeight) {
    const width = positiveFinite(fieldWidth, 'fieldWidth');
    const height = positiveFinite(fieldHeight, 'fieldHeight');
    const basePhysics = config?.physics;
    if (!basePhysics) {
        throw new TypeError('config.physics is required.');
    }

    const horizontalScale = clamp(
        width / AIDS_BASE_FIELD_WIDTH,
        MIN_LAYOUT_SCALE,
        MAX_HORIZONTAL_LAYOUT_SCALE
    );
    const verticalScale = clamp(
        height / AIDS_BASE_FIELD_HEIGHT,
        MIN_LAYOUT_SCALE,
        MAX_VERTICAL_LAYOUT_SCALE
    );

    return Object.freeze({
        fieldWidth: width,
        fieldHeight: height,
        horizontalScale,
        verticalScale,
        physics: Object.freeze({
            ...basePhysics,
            gravity: basePhysics.gravity * verticalScale,
            rollAccel: basePhysics.rollAccel * horizontalScale,
            maxRollSpeed: basePhysics.maxRollSpeed * horizontalScale,
            platformHalfLen: basePhysics.platformHalfLen * horizontalScale,
            fallSteerAccel: basePhysics.fallSteerAccel * horizontalScale,
            maxFallSteerSpeed: basePhysics.maxFallSteerSpeed * horizontalScale,
            releaseSpeedThreshold: 60 * horizontalScale,
            releaseSpeed: 120 * horizontalScale,
            missMargin: 60 * horizontalScale,
        }),
    });
}

function applyPlatformGeometry(platform, layout) {
    platform.x = (layout.fieldWidth * platform.xPct) / 100;
    platform.y = (layout.fieldHeight * platform.yPct) / 100;
    platform.el.style.left = platform.x + 'px';
    platform.el.style.top = platform.y + 'px';

    const dimensions = platformOuterDimensions(layout.physics.platformHalfLen);
    platform.el.style.width = dimensions.width + 'px';
    platform.el.style.marginLeft = dimensions.marginLeft + 'px';
}

function remapEgg(egg, previousLayout, nextLayout, tilt) {
    const widthRatio = nextLayout.fieldWidth / previousLayout.fieldWidth;
    const heightRatio = nextLayout.fieldHeight / previousLayout.fieldHeight;
    const velocityXRatio = nextLayout.horizontalScale / previousLayout.horizontalScale;
    const velocityYRatio = nextLayout.verticalScale / previousLayout.verticalScale;

    egg.x *= widthRatio;
    egg.y *= heightRatio;
    egg.vx *= velocityXRatio;
    egg.vy *= velocityYRatio;

    // Keep rolling eggs exactly on the resized platform surface. Platform and
    // targetPlatform references are intentionally left untouched.
    if (egg.phase === 'rolling' && egg.platform) {
        const dx = egg.x - egg.platform.x;
        const direction = tilt === 'left' ? -1 : 1;
        const theta = (direction * nextLayout.physics.tiltAngleDeg * Math.PI) / 180;
        egg.y = egg.platform.y - nextLayout.physics.surfaceOffset + dx * Math.sin(theta);
    }

    const eggRadius = nextLayout.physics.eggRadius;
    if (egg.el?.style) {
        egg.el.style.left = egg.x - eggRadius + 'px';
        egg.el.style.top = egg.y - eggRadius + 'px';
    }
}

export function layoutPlatforms(refs, config, state) {
    const doc = refs.platformsContainer.ownerDocument;
    const fieldW = measuredFieldSize(refs.field, 'width', AIDS_BASE_FIELD_WIDTH);
    const fieldH = measuredFieldSize(refs.field, 'height', AIDS_BASE_FIELD_HEIGHT);
    const jitterPct = config.physics.platformJitterPct;
    const layout = createFieldLayout(config, fieldW, fieldH);

    refs.platformsContainer.innerHTML = '';
    state.platforms = [];
    state.fieldLayout = layout;

    config.platformRows.forEach((row, rowIndex) => {
        row.lanes.forEach((laneDef) => {
            const jitterX = Math.random() * jitterPct * 2 - jitterPct;
            const wrap = doc.createElement('div');
            wrap.className = 'aids-platform-wrap aids-tilt-' + state.tilt;
            wrap.innerHTML = '<div class="aids-platform-bar"></div><div class="aids-platform-pivot"></div>';
            refs.platformsContainer.appendChild(wrap);

            const platform = {
                rowIndex,
                lane: laneDef.lane,
                xPct: laneDef.xPct + jitterX,
                yPct: row.yPct,
                x: 0,
                y: 0,
                el: wrap,
            };
            applyPlatformGeometry(platform, layout);
            state.platforms.push(platform);
        });
    });
}

export function relayoutPlatforms(refs, config, state) {
    if (!state?.platforms?.length) return false;

    const fieldW = measuredFieldSize(refs.field, 'width', AIDS_BASE_FIELD_WIDTH);
    const fieldH = measuredFieldSize(refs.field, 'height', AIDS_BASE_FIELD_HEIGHT);
    const previousLayout = state.fieldLayout
        ?? createFieldLayout(config, AIDS_BASE_FIELD_WIDTH, AIDS_BASE_FIELD_HEIGHT);

    if (
        previousLayout.fieldWidth === fieldW
        && previousLayout.fieldHeight === fieldH
    ) {
        return false;
    }

    const nextLayout = createFieldLayout(config, fieldW, fieldH);
    for (const platform of state.platforms) {
        applyPlatformGeometry(platform, nextLayout);
    }
    for (const egg of state.eggs ?? []) {
        if (!egg.done) remapEgg(egg, previousLayout, nextLayout, state.tilt);
    }
    state.fieldLayout = nextLayout;
    return true;
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

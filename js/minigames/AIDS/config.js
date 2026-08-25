export const DEFAULT_CONFIG = Object.freeze({
    schemaVersion: 1,
    gameId: 'ai-data-egg-sort',
    implementationStatus: 'MVP',
    goal: '떨어지는 인지알과 데사알을 판별해 올바른 상자로 분류합니다.',
    controls: Object.freeze({
        pc: Object.freeze(['왼쪽·오른쪽 방향키 또는 A·D로 발판 조작']),
        mobile: Object.freeze(['왼쪽·오른쪽 버튼을 터치해 발판 조작']),
    }),

    totalTimeSec: 45,
    initialLives: 5,
    warningThresholdSec: 10,
    initialTilt: 'left',

    spawnIntervals: [
        { maxElapsedSec: 10, intervalMs: 4500 },
        { maxElapsedSec: 25, intervalMs: 3500 },
        { maxElapsedSec: null, intervalMs: 2500 },
    ],

    eggTypeProbability: Object.freeze({ in: 0.5, de: 0.5 }),

    boxes: Object.freeze({ leftPct: 22, rightPct: 78 }),

    platformRows: Object.freeze([
        Object.freeze({ yPct: 15, lanes: Object.freeze([Object.freeze({ lane: 'center', xPct: 50 })]) }),
        Object.freeze({
            yPct: 36,
            lanes: Object.freeze([
                Object.freeze({ lane: 'left', xPct: 26 }),
                Object.freeze({ lane: 'right', xPct: 74 }),
            ]),
        }),
        Object.freeze({
            yPct: 57,
            lanes: Object.freeze([
                Object.freeze({ lane: 'left', xPct: 26 }),
                Object.freeze({ lane: 'right', xPct: 74 }),
            ]),
        }),
        Object.freeze({ yPct: 78, lanes: Object.freeze([Object.freeze({ lane: 'center', xPct: 50 })]) }),
    ]),

    physics: Object.freeze({
        gravity: 500, // 낙하 가속도
        rollAccel: 70, // 구르는 속도
        maxRollSpeed: 150,
        tiltAngleDeg: 16,
        surfaceOffset: 9,
        platformHalfLen: 40,
        maxRollTimeSec: 2.5,
        eggRadius: 20,
        steer: 2.4,
        fallSteerAccel: 600,
        platformJitterPct: 3,
        landingInertiaKeep: 0.3,
        maxFallSteerSpeed: 320,
    }),
});

export function mergeConfig(overrides = {}) {
    const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
    return {
        ...DEFAULT_CONFIG,
        ...safeOverrides,
        controls: { ...DEFAULT_CONFIG.controls, ...(safeOverrides.controls ?? {}) },
        physics: { ...DEFAULT_CONFIG.physics, ...(safeOverrides.physics ?? {}) },
        eggTypeProbability: {
            ...DEFAULT_CONFIG.eggTypeProbability,
            ...(safeOverrides.eggTypeProbability ?? {}),
        },
        boxes: { ...DEFAULT_CONFIG.boxes, ...(safeOverrides.boxes ?? {}) },
        spawnIntervals:
            Array.isArray(safeOverrides.spawnIntervals) && safeOverrides.spawnIntervals.length > 0
                ? safeOverrides.spawnIntervals
                : DEFAULT_CONFIG.spawnIntervals,
        platformRows:
            Array.isArray(safeOverrides.platformRows) && safeOverrides.platformRows.length > 0
                ? safeOverrides.platformRows
                : DEFAULT_CONFIG.platformRows,
    };
}

const REQUIRED_NUMBER_FIELDS = ['totalTimeSec', 'initialLives', 'warningThresholdSec'];

export function validateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new TypeError('ai-data-egg-sort config must be an object.');
    }
    for (const field of REQUIRED_NUMBER_FIELDS) {
        if (typeof config[field] !== 'number' || !Number.isFinite(config[field])) {
            throw new TypeError(`ai-data-egg-sort config.${field} must be a finite number.`);
        }
    }
    if (!Array.isArray(config.platformRows) || config.platformRows.length === 0) {
        throw new TypeError('ai-data-egg-sort config.platformRows must be a non-empty array.');
    }
}

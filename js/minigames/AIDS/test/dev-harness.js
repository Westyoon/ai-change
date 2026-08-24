import { createMiniGame } from '../index.js';
import { DEFAULT_CONFIG } from '../config.js';

function createFakeInputManager() {
    const listeners = new Set();
    function dispatch(action, phase) {
        listeners.forEach((cb) => cb({ action, phase }));
    }
    window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
            dispatch('SELECT_LEFT', 'press');
        } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
            dispatch('SELECT_RIGHT', 'press');
        }
    });
    return {
        onAction(callback) {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
    };
}

const uiRoot = document.getElementById('ui-root');
const logEl = document.getElementById('log');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const destroyBtn = document.getElementById('destroy-btn');

function log(label, payload) {
    logEl.textContent = `${label}\n${JSON.stringify(payload, null, 2)}`;
    // eslint-disable-next-line no-console
    console.log(label, payload);
}

let attemptCount = 0;
function nextAttemptId() {
    attemptCount += 1;
    return `dev-attempt-${attemptCount}`;
}

const context = {
    canvas: null,
    uiRoot,
    input: createFakeInputManager(), // 방향키·A/D 지원 (진짜 InputManager 연결 전 로컬 테스트용)
    clock: { now: () => performance.now() },
    assets: {},
    audio: {},
    events: {},
    onComplete(attemptId, candidate) {
        log(`onComplete(${attemptId})`, candidate);
        restartBtn.disabled = false;
    },
    onError(attemptId, error) {
        log(`onError(${attemptId})`, { message: error?.message, stack: error?.stack });
    },
};

const controller = new AbortController();
const instance = createMiniGame(context);

async function boot() {
    await instance.init(DEFAULT_CONFIG, { signal: controller.signal });
    instance.start({ attemptId: nextAttemptId() });
    log('started', instance.getState());
}

pauseBtn.addEventListener('click', () => {
    const ok = instance.pause('MANUAL');
    log('pause() ->', { ok, ...instance.getState() });
});

resumeBtn.addEventListener('click', () => {
    const ok = instance.resume();
    log('resume() ->', { ok, ...instance.getState() });
});

restartBtn.addEventListener('click', () => {
    restartBtn.disabled = true;
    instance.restart({ attemptId: nextAttemptId() });
    log('restart()', instance.getState());
});

destroyBtn.addEventListener('click', () => {
    instance.destroy();
    log('destroyed', instance.getState());
});

boot().catch((error) => log('boot failed', { message: error?.message }));
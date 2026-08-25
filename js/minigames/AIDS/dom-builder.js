import { DEFINITION } from './definition.js';

export function buildGameDom(uiRoot, config) {
    const doc = uiRoot?.ownerDocument ?? globalThis.document;
    if (!uiRoot?.append || !doc?.createElement) {
        throw new Error('ai-data-egg-sort: a uiRoot with an owner document is required.');
    }

    const root = doc.createElement('div');
    root.className = 'aids-root';
    root.dataset.miniGameId = DEFINITION.id;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', `${DEFINITION.department} ${DEFINITION.title}`);
    root.title = config.goal ?? DEFINITION.goal;

    const topbar = doc.createElement('div');
    topbar.className = 'aids-topbar';
    const timerEl = doc.createElement('div');
    timerEl.className = 'aids-timer';
    timerEl.textContent = String(config.totalTimeSec);
    const heartsEl = doc.createElement('div');
    heartsEl.className = 'aids-hearts';
    topbar.append(timerEl, heartsEl);

    const pipeRow = doc.createElement('div');
    pipeRow.className = 'aids-pipe-row';
    const pipe = doc.createElement('div');
    pipe.className = 'aids-pipe';
    pipeRow.append(pipe);

    const field = doc.createElement('div');
    field.className = 'aids-field';
    const platformsContainer = doc.createElement('div');
    platformsContainer.className = 'aids-platforms';
    field.append(platformsContainer);

    const boxes = doc.createElement('div');
    boxes.className = 'aids-boxes';
    const boxLeft = doc.createElement('div');
    boxLeft.className = 'aids-box aids-box-left';
    boxLeft.innerHTML = '<div class="aids-box-dot"></div>인지';
    const boxRight = doc.createElement('div');
    boxRight.className = 'aids-box aids-box-right';
    boxRight.innerHTML = '<div class="aids-box-dot"></div>데사';
    boxes.append(boxLeft, boxRight);

    const controls = doc.createElement('div');
    controls.className = 'aids-controls';
    const controlHint = Array.isArray(config.controls?.mobile) ? config.controls.mobile[0] : undefined;
    const btnLeft = doc.createElement('button');
    btnLeft.type = 'button';
    btnLeft.className = 'aids-ctrl-btn aids-ctrl-left';
    btnLeft.textContent = '◀ 왼쪽';
    if (controlHint) btnLeft.title = controlHint;
    const btnRight = doc.createElement('button');
    btnRight.type = 'button';
    btnRight.className = 'aids-ctrl-btn aids-ctrl-right';
    btnRight.textContent = '오른쪽 ▶';
    if (controlHint) btnRight.title = controlHint;
    controls.append(btnLeft, btnRight);

    root.append(topbar, pipeRow, field, boxes, controls);
    uiRoot.append(root);

    return {
        root,
        field,
        platformsContainer,
        boxLeft,
        boxRight,
        heartsEl,
        timerEl,
        btnLeft,
        btnRight,
    };
}
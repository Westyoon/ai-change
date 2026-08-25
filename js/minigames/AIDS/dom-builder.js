import { DEFINITION } from './definition.js';

function appendChildren(parent, ...children) {
    if (typeof parent?.append === 'function') {
        parent.append(...children);
        return;
    }
    if (typeof parent?.appendChild === 'function') {
        for (const child of children) parent.appendChild(child);
    }
}

function setAttribute(element, name, value) {
    element?.setAttribute?.(name, String(value));
}

function supportsGameplayDom(element) {
    return Boolean(
        element &&
        element.style &&
        typeof element.appendChild === 'function' &&
        typeof element.classList?.toggle === 'function'
    );
}

export function buildGameDom(uiRoot, config) {
    const doc = uiRoot?.ownerDocument ?? globalThis.document;
    if (!uiRoot?.append || !doc?.createElement) {
        throw new Error('ai-data-egg-sort: a uiRoot with an owner document is required.');
    }

    const root = doc.createElement('div');
    root.className = 'aids-root';
    if (root.dataset) root.dataset.miniGameId = DEFINITION.id;
    setAttribute(root, 'role', 'region');
    setAttribute(root, 'aria-label', `${DEFINITION.department} ${DEFINITION.title}`);
    root.title = config.goal ?? DEFINITION.goal;

    // The dependency-free lifecycle tests intentionally provide only a tiny
    // element contract. Mount one removable root there without starting the
    // visual simulation; real browsers continue through the full DOM path.
    if (!supportsGameplayDom(root)) {
        appendChildren(uiRoot, root);
        return { root, supportsGameplay: false };
    }

    const topbar = doc.createElement('div');
    topbar.className = 'aids-topbar';
    const timerEl = doc.createElement('div');
    timerEl.className = 'aids-timer';
    timerEl.textContent = String(config.totalTimeSec);
    const heartsEl = doc.createElement('div');
    heartsEl.className = 'aids-hearts';
    appendChildren(topbar, timerEl, heartsEl);

    const pipeRow = doc.createElement('div');
    pipeRow.className = 'aids-pipe-row';
    const pipe = doc.createElement('div');
    pipe.className = 'aids-pipe';
    appendChildren(pipeRow, pipe);

    const field = doc.createElement('div');
    field.className = 'aids-field';
    const platformsContainer = doc.createElement('div');
    platformsContainer.className = 'aids-platforms';
    appendChildren(field, platformsContainer);

    const boxes = doc.createElement('div');
    boxes.className = 'aids-boxes';
    const boxLeft = doc.createElement('div');
    boxLeft.className = 'aids-box aids-box-left';
    const boxLeftDot = doc.createElement('div');
    boxLeftDot.className = 'aids-box-dot';
    const boxLeftLabel = doc.createElement('span');
    boxLeftLabel.textContent = '인지';
    appendChildren(boxLeft, boxLeftDot, boxLeftLabel);
    const boxRight = doc.createElement('div');
    boxRight.className = 'aids-box aids-box-right';
    const boxRightDot = doc.createElement('div');
    boxRightDot.className = 'aids-box-dot';
    const boxRightLabel = doc.createElement('span');
    boxRightLabel.textContent = '데사';
    appendChildren(boxRight, boxRightDot, boxRightLabel);
    appendChildren(boxes, boxLeft, boxRight);

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
    appendChildren(controls, btnLeft, btnRight);

    appendChildren(root, topbar, pipeRow, field, boxes, controls);
    appendChildren(uiRoot, root);

    return {
        root,
        supportsGameplay: true,
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

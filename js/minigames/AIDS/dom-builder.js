import { DEFINITION } from './definition.js';
import { createGuardianImage } from './guardian-art.js';

export const AIDS_LOGICAL_WIDTH = 390;
export const AIDS_LOGICAL_HEIGHT = 740;

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
    const pipeArt = doc.createElement('span');
    pipeArt.className = 'aids-pipe-art';
    setAttribute(pipeArt, 'aria-hidden', 'true');
    const pipeImage = doc.createElement('img');
    pipeImage.className = 'aids-pipe-image';
    pipeImage.src = './assets/images/인데부 상자.png';
    pipeImage.alt = '';
    pipeImage.draggable = false;
    appendChildren(pipeArt, pipeImage);
    appendChildren(pipe, pipeArt);
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
    setAttribute(boxLeft, 'role', 'img');
    setAttribute(boxLeft, 'aria-label', '인지 수호알 분류 상자 · 파랑');
    appendChildren(boxLeft, createGuardianImage(doc, 'in', 'aids-box-egg'));
    const boxRight = doc.createElement('div');
    boxRight.className = 'aids-box aids-box-right';
    setAttribute(boxRight, 'role', 'img');
    setAttribute(boxRight, 'aria-label', '데사 수호알 분류 상자 · 분홍');
    appendChildren(boxRight, createGuardianImage(doc, 'de', 'aids-box-egg'));
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

    const viewport = doc.createElement('div');
    viewport.className = 'aids-frame-viewport';
    const frame = doc.createElement('div');
    frame.className = 'aids-logical-frame';

    appendChildren(root, topbar, pipeRow, field, boxes, controls);
    appendChildren(frame, root);
    appendChildren(viewport, frame);
    appendChildren(uiRoot, viewport);

    return {
        root,
        supportsGameplay: true,
        viewport,
        frame,
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

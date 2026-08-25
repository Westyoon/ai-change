const HEART_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10.2-9C.2 9 1 5.6 4 4.3 6.4 3.2 9 4 12 7.2 15 4 17.6 3.2 20 4.3 23 5.6 23.8 9 22.2 12 19.5 16.4 12 21 12 21z"/></svg>';

export function buildHearts(heartsEl, totalLives) {
    const doc = heartsEl.ownerDocument;
    heartsEl.innerHTML = '';
    for (let i = 0; i < totalLives; i++) {
        const d = doc.createElement('div');
        d.className = 'aids-heart aids-on';
        d.innerHTML = HEART_SVG;
        heartsEl.appendChild(d);
    }
}

export function updateHearts(heartsEl, life) {
    const nodes = heartsEl.children;
    for (let i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('aids-on', i < life);
    }
}

export function popHeart(heartsEl, lifeAfterLoss) {
    const node = heartsEl.children[lifeAfterLoss];
    if (node) {
        node.classList.add('aids-pop');
        setTimeout(() => node.classList.remove('aids-pop'), 200);
    }
}

export function showFloatText(parentEl, text, good) {
    const doc = parentEl.ownerDocument;
    const t = doc.createElement('div');
    t.className = 'aids-float-text ' + (good ? 'aids-good' : 'aids-bad');
    t.textContent = text;
    parentEl.appendChild(t);
    setTimeout(() => t.remove(), 700);
}

export function flashBox(boxEl, good) {
    boxEl.classList.add(good ? 'aids-flash-good' : 'aids-flash-bad');
    setTimeout(() => boxEl.classList.remove(good ? 'aids-flash-good' : 'aids-flash-bad'), 260);
}

export function updateTimerDisplay(timerEl, timeLeft, warningThresholdSec) {
    timerEl.textContent = Math.max(0, Math.ceil(timeLeft));
    timerEl.classList.toggle('aids-blink', timeLeft <= warningThresholdSec);
}
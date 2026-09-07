(function () {
    window.MiniGames = window.MiniGames || {};

    const TIME_LIMIT_MS = 10000;
    const TARGET_CLICKS = 40;

    function start(container, callbacks = {}) {
        const { onClear, onFail } = callbacks;

        let clicks = 0;
        let started = false;
        let finished = false;
        let rafId = null;
        let startTime = 0;

        container.innerHTML = `
      <h2 class="mg-title">연타 챌린지</h2>
      <div class="mash-stats">
        <span>남은 시간: <strong id="mashTime">${(TIME_LIMIT_MS / 1000).toFixed(1)}</strong>초</span>
        <span>목표: <strong>${TARGET_CLICKS}</strong>회</span>
      </div>
      <div class="mash-timer-track"><div class="mash-timer-bar" id="mashTimerBar"></div></div>
      <div class="mash-count" id="mashCount">0</div>
      <p class="mash-goal">버튼을 최대한 빠르게 연타하라!</p>
      <button type="button" class="mash-button" id="mashButton">연타!</button>
      <p class="mg-result" id="mashResult"></p>
    `;

        const timeEl = container.querySelector('#mashTime');
        const timerBar = container.querySelector('#mashTimerBar');
        const countEl = container.querySelector('#mashCount');
        const button = container.querySelector('#mashButton');
        const resultEl = container.querySelector('#mashResult');

        ModalManager.setClosable(false);

        function finish(success) {
            if (finished) return;
            finished = true;
            button.disabled = true;
            if (rafId) cancelAnimationFrame(rafId);

            if (success) {
                resultEl.textContent = `클리어! 총 ${clicks}회 연타 성공.`;
                resultEl.className = 'mg-result mg-result--win';
                window.setTimeout(() => onClear && onClear(), 600);
            } else {
                resultEl.textContent = `실패... 내 기록: ${clicks}/40`;
                resultEl.className = 'mg-result mg-result--lose';
                window.setTimeout(() => onFail && onFail(), 600);
            }
        }

        function tick() {
            const elapsed = performance.now() - startTime;
            const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
            timeEl.textContent = (remaining / 1000).toFixed(1);
            timerBar.style.width = `${(remaining / TIME_LIMIT_MS) * 100}%`;

            if (remaining <= 0) {
                finish(clicks >= TARGET_CLICKS);
                return;
            }
            rafId = requestAnimationFrame(tick);
        }

        button.addEventListener('click', () => {
            if (finished) return;

            if (!started) {
                started = true;
                startTime = performance.now();
                rafId = requestAnimationFrame(tick);
            }

            clicks += 1;
            countEl.textContent = String(clicks);

            if (clicks >= TARGET_CLICKS) {
                finish(true);
            }
        });
    }

    window.MiniGames.Mash = { name: '연타', start };
})();
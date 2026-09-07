(function () {
    window.MiniGames = window.MiniGames || {};

    const HANDS = [
        { key: 'rock', label: '바위', emoji: '✊' },
        { key: 'scissors', label: '가위', emoji: '✌️' },
        { key: 'paper', label: '보', emoji: '✋' },
    ];

    const BEATS = {
        rock: 'scissors',
        scissors: 'paper',
        paper: 'rock',
    };

    function judge(playerKey, opponentKey) {
        if (playerKey === opponentKey) return 'draw';
        return BEATS[playerKey] === opponentKey ? 'win' : 'lose';
    }

    function findHand(key) {
        return HANDS.find((h) => h.key === key);
    }

    function start(container, callbacks = {}) {
        const { onClear, onFail } = callbacks;

        container.innerHTML = `
      <h2 class="mg-title">가위바위보 승부</h2>
      <p class="mg-sub">기회는 단 한 번! X알을 이겨라</p>

      <div class="rps-arena">
        <div class="rps-slot" id="rpsPlayerSlot">❔</div>
        <div class="rps-vs">VS</div>
        <div class="rps-slot" id="rpsOpponentSlot">❔</div>
      </div>

      <div class="rps-choices" id="rpsChoices">
        ${HANDS.map(
            (h) => `<button type="button" class="rps-choice" data-key="${h.key}" title="${h.label}">${h.emoji}</button>`
        ).join('')}
      </div>

      <p class="mg-result" id="rpsResult"></p>
    `;

        const playerSlot = container.querySelector('#rpsPlayerSlot');
        const opponentSlot = container.querySelector('#rpsOpponentSlot');
        const resultEl = container.querySelector('#rpsResult');
        const choiceButtons = Array.from(container.querySelectorAll('.rps-choice'));

        ModalManager.setClosable(true);

        let decided = false;

        choiceButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                if (decided) return;
                decided = true;
                choiceButtons.forEach((b) => (b.disabled = true));

                const playerKey = btn.dataset.key;
                const playerHand = findHand(playerKey);
                const opponentHand = HANDS[Math.floor(Math.random() * HANDS.length)];

                playerSlot.textContent = playerHand.emoji;
                opponentSlot.textContent = opponentHand.emoji;

                const outcome = judge(playerKey, opponentHand.key);

                window.setTimeout(() => {
                    if (outcome === 'win') {
                        resultEl.textContent = `승리! 이겼다!`;
                        resultEl.className = 'mg-result mg-result--win';
                        window.setTimeout(() => onClear && onClear(), 700);
                    } else {
                        const reason = outcome === 'draw' ? '비겼다' : `졌다..`;
                        resultEl.textContent = `실패... ${reason}.`;
                        resultEl.className = 'mg-result mg-result--lose';
                        window.setTimeout(() => onFail && onFail(), 700);
                    }
                }, 350);
            });
        });
    }

    window.MiniGames.RPS = { name: '가위바위보', start };
})();
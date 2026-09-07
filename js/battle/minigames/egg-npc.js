(function () {
    const REWARD_STAT = 10;

    const GREETINGS = [
        '...누군가 다가온 것을 느낀다.',
        '차가운 알 표면이 희미하게 떨린다.',
        '엑스알이 당신을 향해 시선을 돌린다.',
        // 스토리 담당자분이 해당 부분 각 게임에 맞춰 문구 선정해주시면 좋을 것 같습니다
    ];

    const eggEl = document.getElementById('xrEgg');
    const fieldEl = document.querySelector('.field');
    const statValueEl = document.getElementById('statValue');

    let stat = 0;
    let cleared = false;
    let speechEl = null;

    function removeSpeech() {
        if (speechEl) {
            speechEl.remove();
            speechEl = null;
        }
    }

    function showSpeech(text, actions) {
        removeSpeech();
        speechEl = document.createElement('div');
        speechEl.className = 'egg-speech';
        speechEl.innerHTML = `
      <p style="margin:0 0 10px;">${text}</p>
      <div class="mg-actions" style="margin-top:0;"></div>
    `;
        const actionsEl = speechEl.querySelector('.mg-actions');
        actions.forEach(({ label, variant, onClick }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `mg-btn ${variant === 'ghost' ? 'mg-btn--ghost' : ''}`.trim();
            btn.textContent = label;
            btn.addEventListener('click', onClick);
            actionsEl.appendChild(btn);
        });
        fieldEl.appendChild(speechEl);
    }

    function pickRandomGame() {
        const games = [window.MiniGames.RPS, window.MiniGames.CardMatch, window.MiniGames.Mash];
        return games[Math.floor(Math.random() * games.length)];
    }

    function awardStat() {
        stat += REWARD_STAT;
        statValueEl.textContent = String(stat);
    }

    function transformAndFly() {
        eggEl.disabled = true;
        eggEl.classList.add('is-transformed');
        window.setTimeout(() => {
            eggEl.classList.add('is-flying');
        }, 550);
    }

    function handleClear() {
        cleared = true;
        ModalManager.setClosable(true);
        const content = ModalManager.getContent();
        content.innerHTML = `
      <h2 class="mg-title">스탯 획득!</h2>
      <p class="mg-sub">엑스알이 하얀 마음의 알로 변해 하늘로 떠오른다.</p>
      <p class="mg-result mg-result--win">필드 스탯 +${REWARD_STAT}</p>
      <div class="mg-actions">
        <button type="button" class="mg-btn" id="eggClearConfirm">확인</button>
      </div>
    `;
        content.querySelector('#eggClearConfirm').addEventListener('click', () => {
            ModalManager.close();
        });

        awardStat();
        transformAndFly();
    }

    const FAIL_AUTO_CLOSE_MS = 2600;

    function handleFail() {
        ModalManager.setClosable(false);
        const content = ModalManager.getContent();
        content.innerHTML = `
      <h2 class="mg-title">도전 실패</h2>
    `;

        window.setTimeout(() => {
            ModalManager.setClosable(true);
            ModalManager.close();
        }, FAIL_AUTO_CLOSE_MS);
    }

    function startGame(game) {
        ModalManager.open();
        ModalManager.setClosable(false);
        const content = ModalManager.getContent();
        game.start(content, {
            onClear: handleClear,
            onFail: handleFail,
        });
    }

    function talkToEgg() {
        if (cleared) return;

        const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        showSpeech(`${greeting}<br>도전하시겠습니까?`, [
            {
                label: '도전한다',
                onClick: () => {
                    removeSpeech();
                    startGame(pickRandomGame());
                },
            },
            {
                label: '그만둔다',
                variant: 'ghost',
                onClick: removeSpeech,
            },
        ]);
    }

    eggEl.addEventListener('click', talkToEgg);
})();
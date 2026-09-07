(function () {
    window.MiniGames = window.MiniGames || {};

    const SYMBOLS = ['🃏', '♠️', '♣️', '♥️', '♦️'];
    const TOTAL_LIVES = 5;
    const PAIRS_TO_CLEAR = 3;
    const PREVIEW_MS = 1000;
    const MISMATCH_DELAY_MS = 700;

    function shuffledDeck() {
        const deck = [...SYMBOLS, ...SYMBOLS].map((symbol, i) => ({
            id: `c${i}`,
            symbol,
        }));
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function start(container, callbacks = {}) {
        const { onClear, onFail } = callbacks;
        const deck = shuffledDeck();

        let lives = TOTAL_LIVES;
        let matchedPairs = 0;
        let locked = true;
        let flipped = [];

        container.innerHTML = `
      <h2 class="mg-title">카드 짝 맞추기</h2>
      <div class="card-top">
        <span class="card-progress" id="cmProgress">0 / ${PAIRS_TO_CLEAR}쌍 완성</span>
        <span class="card-lives" id="cmLives"></span>
      </div>
      <div class="card-grid" id="cmGrid"></div>
      <p class="mg-result" id="cmResult">카드를 잘 기억해두자...</p>
    `;

        const gridEl = container.querySelector('#cmGrid');
        const livesEl = container.querySelector('#cmLives');
        const progressEl = container.querySelector('#cmProgress');
        const resultEl = container.querySelector('#cmResult');

        ModalManager.setClosable(false);

        function renderLives() {
            livesEl.innerHTML = '';
            for (let i = 0; i < TOTAL_LIVES; i++) {
                const span = document.createElement('span');
                span.textContent = '💜';
                if (i >= lives) span.classList.add('life-lost');
                livesEl.appendChild(span);
            }
        }

        function renderGrid() {
            gridEl.innerHTML = '';
            deck.forEach((card, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mg-card';
                btn.dataset.index = String(index);
                btn.innerHTML = `
          <div class="mg-card__inner">
            <div class="mg-card__face mg-card__face--back">?</div>
            <div class="mg-card__face mg-card__face--front">${card.symbol}</div>
          </div>
        `;
                btn.addEventListener('click', () => handleCardClick(index, btn));
                gridEl.appendChild(btn);
            });
        }

        function setAllFaceUp(faceUp) {
            Array.from(gridEl.children).forEach((btn) => {
                btn.classList.toggle('is-face-up', faceUp);
            });
        }

        function handleCardClick(index, btn) {
            if (locked) return;
            if (btn.classList.contains('is-matched') || btn.classList.contains('is-face-up')) return;
            if (flipped.some((f) => f.index === index)) return;

            btn.classList.add('is-face-up');
            flipped.push({ index, btn });

            if (flipped.length < 2) return;

            locked = true;
            const [first, second] = flipped;
            const isMatch = deck[first.index].symbol === deck[second.index].symbol;

            if (isMatch) {
                matchedPairs += 1;
                first.btn.classList.add('is-matched');
                second.btn.classList.add('is-matched');
                progressEl.textContent = `${matchedPairs} / ${PAIRS_TO_CLEAR}쌍 완성`;
                resultEl.textContent = '짝 맞추기 성공!';
                resultEl.className = 'mg-result mg-result--win';
                flipped = [];
                locked = false;

                if (matchedPairs >= PAIRS_TO_CLEAR) {
                    locked = true;
                    resultEl.textContent = '클리어! 모든 짝을 맞췄다.';
                    window.setTimeout(() => onClear && onClear(), 600);
                }
                return;
            }

            lives -= 1;
            renderLives();
            resultEl.textContent = '틀렸다...';
            resultEl.className = 'mg-result mg-result--lose';

            window.setTimeout(() => {
                first.btn.classList.remove('is-face-up');
                second.btn.classList.remove('is-face-up');
                flipped = [];

                if (lives <= 0) {
                    locked = true;
                    resultEl.textContent = '라이프가 모두 소진되었다...';
                    window.setTimeout(() => onFail && onFail(), 500);
                } else {
                    locked = false;
                    resultEl.textContent = '';
                }
            }, MISMATCH_DELAY_MS);
        }

        renderLives();
        renderGrid();
        setAllFaceUp(true);

        window.setTimeout(() => {
            setAllFaceUp(false);
            resultEl.textContent = '';
            locked = false;
        }, PREVIEW_MS);
    }

    window.MiniGames.CardMatch = { name: '카드 짝 맞추기', start };
})();

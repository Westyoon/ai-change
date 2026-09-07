/**
 * dev_harness.js
 * -------------------------------------------------------------
 * index.html 없이 엑스알 미니게임만 격리해서 확인하기 위한
 * 개발자용 테스트 하니스입니다. 실제 프로젝트에는 포함하지 않습니다.
 *
 * 사용법:
 *   1) 아무 빈 브라우저 탭을 하나 엽니다 (about:blank 등).
 *   2) 개발자 도구 콘솔을 열고 이 파일 전체 내용을 붙여넣어 실행합니다.
 *   3) 화면에 생성된 엑스알을 클릭해 미니게임을 테스트합니다.
 */
(function bootstrapDevHarness() {
    // 1. 폰트 로드
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap";
    document.head.appendChild(fontLink);

    // 2. 스타일 주입 (css/style.css 내용 그대로)
    const styleTag = document.createElement("style");
    styleTag.textContent = "/* ------------------------------------------------------------\n   토큰\n------------------------------------------------------------- */\n:root {\n  --field-sky-top: #191233;\n  --field-sky-bottom: #362a5c;\n  --field-ground: #241a3d;\n  --ink: #221b3a;\n  --parchment: #fbf3e3;\n  --parchment-edge: #e8d9b8;\n  --accent-violet: #8b6cff;\n  --accent-violet-dim: #6b4fd6;\n  --accent-rose: #ff6f9c;\n  --accent-rose-dim: #d94f7b;\n  --danger: #ef5c72;\n  --ok: #59c78a;\n  --font-display: 'Jua', sans-serif;\n  --font-body: 'Gowun Dodum', sans-serif;\n}\n\n* { box-sizing: border-box; }\n\nhtml, body {\n  height: 100%;\n  margin: 0;\n  font-family: var(--font-body);\n  color: var(--ink);\n  background: var(--field-sky-top);\n  overflow: hidden;\n}\n\nbutton { font-family: inherit; }\n\n/* ------------------------------------------------------------\n   필드 배경\n------------------------------------------------------------- */\n.field {\n  position: relative;\n  width: 100vw;\n  height: 100vh;\n  background: linear-gradient(180deg, var(--field-sky-top) 0%, var(--field-sky-bottom) 62%, var(--field-ground) 62%);\n  overflow: hidden;\n}\n\n.field__ground {\n  position: absolute;\n  left: 0; right: 0; bottom: 0;\n  height: 38%;\n  background:\n    radial-gradient(ellipse at 50% 0%, rgba(139,108,255,0.12), transparent 60%),\n    var(--field-ground);\n  border-top: 2px solid rgba(139,108,255,0.25);\n}\n\n.field__vignette {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  background: radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(10,7,20,0.55) 100%);\n}\n\n.stat-hud {\n  position: absolute;\n  top: 24px;\n  left: 28px;\n  display: flex;\n  align-items: baseline;\n  gap: 10px;\n  padding: 10px 18px;\n  background: rgba(20,14,36,0.55);\n  border: 1px solid rgba(139,108,255,0.35);\n  border-radius: 999px;\n  color: #efe9ff;\n  z-index: 5;\n}\n.stat-hud__label { font-size: 13px; opacity: 0.75; }\n.stat-hud__value { font-family: var(--font-display); font-size: 20px; color: var(--accent-violet); }\n\n/* ------------------------------------------------------------\n   엑스알 (검은 알 + 흰 X)\n------------------------------------------------------------- */\n.xr-egg {\n  position: absolute;\n  left: 50%;\n  bottom: 20%;\n  width: 120px;\n  height: 148px;\n  transform: translateX(-50%);\n  border: none;\n  padding: 0;\n  cursor: pointer;\n  border-radius: 50% 50% 48% 48% / 58% 58% 42% 42%;\n  background:\n    radial-gradient(circle at 34% 28%, #2c2c3a 0%, #101018 55%, #050508 100%);\n  box-shadow:\n    inset -10px -14px 24px rgba(0,0,0,0.6),\n    inset 8px 10px 18px rgba(120,100,200,0.15),\n    0 12px 26px rgba(0,0,0,0.55);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  animation: egg-bob 3.2s ease-in-out infinite;\n  transition: transform 0.15s ease;\n  z-index: 4;\n}\n.xr-egg:hover { transform: translateX(-50%) scale(1.035); }\n.xr-egg:active { transform: translateX(-50%) scale(0.97); }\n\n.xr-egg__mark {\n  font-family: var(--font-display);\n  font-size: 44px;\n  color: #f5f2ff;\n  text-shadow: 0 0 14px rgba(245,242,255,0.55);\n  transform: translateY(-4px);\n}\n\n.xr-egg__shine {\n  position: absolute;\n  top: 22px;\n  left: 30px;\n  width: 22px;\n  height: 34px;\n  background: rgba(255,255,255,0.14);\n  border-radius: 50%;\n  filter: blur(1px);\n}\n\n.xr-egg__shadow {\n  position: absolute;\n  left: 50%;\n  bottom: calc(20% - 14px);\n  width: 108px;\n  height: 22px;\n  transform: translateX(-50%);\n  background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%);\n  z-index: 3;\n}\n\n@keyframes egg-bob {\n  0%, 100% { transform: translateX(-50%) translateY(0); }\n  50% { transform: translateX(-50%) translateY(-10px); }\n}\n\n/* 클리어 시 하얀 마음 알로 변신 후 비상 */\n.xr-egg.is-transformed {\n  animation: none;\n  background: radial-gradient(circle at 34% 28%, #ffffff 0%, #ffe3ec 55%, #ffc7db 100%);\n  box-shadow:\n    inset -8px -10px 20px rgba(255,150,190,0.35),\n    0 0 30px rgba(255,180,205,0.65);\n}\n.xr-egg.is-transformed .xr-egg__mark::before { content: '♥'; }\n.xr-egg.is-transformed .xr-egg__mark { color: var(--accent-rose); text-shadow: 0 0 16px rgba(255,111,156,0.7); }\n\n.xr-egg.is-flying {\n  transition: transform 1.1s cubic-bezier(.3,.6,.4,1), opacity 1.1s ease;\n  transform: translateX(-50%) translateY(-480px) scale(0.4);\n  opacity: 0;\n}\n\n/* 말풍선 */\n.egg-speech {\n  position: absolute;\n  left: 50%;\n  bottom: calc(20% + 168px);\n  transform: translateX(-50%);\n  background: var(--parchment);\n  border: 2px solid var(--parchment-edge);\n  border-radius: 16px;\n  padding: 14px 18px;\n  max-width: 320px;\n  text-align: center;\n  font-size: 15px;\n  line-height: 1.5;\n  box-shadow: 0 10px 22px rgba(0,0,0,0.35);\n  z-index: 6;\n  animation: pop-in 0.18s ease-out;\n}\n.egg-speech::after {\n  content: '';\n  position: absolute;\n  left: 50%;\n  bottom: -10px;\n  transform: translateX(-50%);\n  border: 10px solid transparent;\n  border-top-color: var(--parchment-edge);\n}\n\n@keyframes pop-in {\n  from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); }\n  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }\n}\n\n/* ------------------------------------------------------------\n   모달\n------------------------------------------------------------- */\n.mg-modal-overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(10, 7, 18, 0.66);\n  backdrop-filter: blur(2px);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 50;\n  opacity: 1;\n  transition: opacity 0.18s ease;\n}\n.mg-modal-overlay.hidden {\n  opacity: 0;\n  pointer-events: none;\n}\n\n.mg-modal-box {\n  position: relative;\n  width: 560px;\n  max-width: 92vw;\n  background: var(--parchment);\n  border: 3px solid var(--parchment-edge);\n  border-radius: 20px;\n  padding: 30px 32px 28px;\n  box-shadow: 0 24px 60px rgba(0,0,0,0.5);\n  transform: translateY(0);\n  animation: modal-in 0.22s cubic-bezier(.2,.7,.3,1);\n}\n\n@keyframes modal-in {\n  from { opacity: 0; transform: translateY(18px) scale(0.97); }\n  to { opacity: 1; transform: translateY(0) scale(1); }\n}\n\n.mg-modal-close {\n  position: absolute;\n  top: 12px;\n  right: 14px;\n  width: 30px;\n  height: 30px;\n  border: none;\n  background: transparent;\n  font-size: 20px;\n  color: var(--ink);\n  opacity: 0.5;\n  cursor: pointer;\n  line-height: 1;\n}\n.mg-modal-close:hover { opacity: 0.9; }\n\n.mg-modal-content {\n  min-height: 120px;\n}\n\n/* ------------------------------------------------------------\n   공용 게임 UI 요소\n------------------------------------------------------------- */\n.mg-title {\n  font-family: var(--font-display);\n  font-size: 22px;\n  margin: 0 0 6px;\n  text-align: center;\n}\n.mg-sub {\n  text-align: center;\n  font-size: 14px;\n  opacity: 0.75;\n  margin: 0 0 20px;\n}\n\n.mg-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 11px 22px;\n  border-radius: 12px;\n  border: none;\n  background: var(--accent-violet);\n  color: #fff;\n  font-family: var(--font-display);\n  font-size: 15px;\n  cursor: pointer;\n  transition: transform 0.12s ease, background 0.12s ease;\n}\n.mg-btn:hover { background: var(--accent-violet-dim); transform: translateY(-1px); }\n.mg-btn:active { transform: translateY(0); }\n.mg-btn--ghost {\n  background: transparent;\n  color: var(--ink);\n  border: 2px solid var(--parchment-edge);\n}\n.mg-btn--ghost:hover { background: rgba(0,0,0,0.04); }\n.mg-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }\n\n.mg-actions {\n  display: flex;\n  justify-content: center;\n  gap: 12px;\n  margin-top: 18px;\n}\n\n.mg-result {\n  text-align: center;\n  margin-top: 16px;\n  font-size: 15px;\n  min-height: 22px;\n}\n.mg-result--win { color: var(--ok); font-weight: bold; }\n.mg-result--lose { color: var(--danger); font-weight: bold; }\n\n/* ------------------------------------------------------------\n   가위바위보\n------------------------------------------------------------- */\n.rps-arena {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 28px;\n  margin: 18px 0 8px;\n}\n.rps-slot {\n  width: 96px;\n  height: 96px;\n  border-radius: 50%;\n  background: #fff;\n  border: 3px solid var(--parchment-edge);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 42px;\n}\n.rps-vs {\n  font-family: var(--font-display);\n  font-size: 18px;\n  opacity: 0.55;\n}\n.rps-choices {\n  display: flex;\n  justify-content: center;\n  gap: 14px;\n  margin-top: 22px;\n}\n.rps-choice {\n  width: 68px;\n  height: 68px;\n  border-radius: 50%;\n  border: 3px solid var(--parchment-edge);\n  background: #fff;\n  font-size: 30px;\n  cursor: pointer;\n  transition: transform 0.12s ease, border-color 0.12s ease;\n}\n.rps-choice:hover { transform: translateY(-3px); border-color: var(--accent-violet); }\n.rps-choice:active { transform: translateY(0); }\n.rps-choice:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }\n\n/* ------------------------------------------------------------\n   카드 짝 맞추기\n------------------------------------------------------------- */\n.card-top {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 14px;\n}\n.card-lives { display: flex; gap: 4px; font-size: 18px; }\n.card-lives .life-lost { opacity: 0.2; filter: grayscale(1); }\n.card-progress { font-size: 13px; opacity: 0.75; }\n\n.card-grid {\n  display: grid;\n  grid-template-columns: repeat(5, 1fr);\n  gap: 10px;\n}\n\n.mg-card {\n  position: relative;\n  aspect-ratio: 3 / 4;\n  border-radius: 10px;\n  cursor: pointer;\n  perspective: 600px;\n  background: transparent;\n  border: none;\n  padding: 0;\n}\n.mg-card__inner {\n  position: relative;\n  width: 100%;\n  height: 100%;\n  transform-style: preserve-3d;\n  transition: transform 0.35s ease;\n}\n.mg-card.is-face-up .mg-card__inner,\n.mg-card.is-matched .mg-card__inner {\n  transform: rotateY(180deg);\n}\n.mg-card__face {\n  position: absolute;\n  inset: 0;\n  border-radius: 10px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  backface-visibility: hidden;\n}\n.mg-card__face--back {\n  background: linear-gradient(145deg, var(--accent-violet), var(--accent-violet-dim));\n  font-size: 20px;\n  color: rgba(255,255,255,0.85);\n}\n.mg-card__face--front {\n  background: #fff;\n  border: 2px solid var(--parchment-edge);\n  font-size: 30px;\n  transform: rotateY(180deg);\n}\n.mg-card.is-matched .mg-card__face--front {\n  background: #eafbf1;\n  border-color: var(--ok);\n}\n.mg-card:disabled { cursor: default; }\n\n/* ------------------------------------------------------------\n   연타\n------------------------------------------------------------- */\n.mash-stats {\n  display: flex;\n  justify-content: space-between;\n  margin-bottom: 6px;\n  font-size: 14px;\n}\n.mash-timer-track {\n  width: 100%;\n  height: 10px;\n  border-radius: 999px;\n  background: rgba(0,0,0,0.08);\n  overflow: hidden;\n  margin-bottom: 22px;\n}\n.mash-timer-bar {\n  height: 100%;\n  width: 100%;\n  background: var(--accent-rose);\n  transition: width 0.1s linear;\n}\n.mash-count {\n  text-align: center;\n  font-family: var(--font-display);\n  font-size: 52px;\n  color: var(--accent-violet);\n  margin-bottom: 6px;\n}\n.mash-goal {\n  text-align: center;\n  font-size: 13px;\n  opacity: 0.7;\n  margin-bottom: 20px;\n}\n.mash-button {\n  display: block;\n  width: 168px;\n  height: 168px;\n  margin: 0 auto;\n  border-radius: 50%;\n  border: none;\n  background: radial-gradient(circle at 35% 30%, var(--accent-rose), var(--accent-rose-dim));\n  color: #fff;\n  font-family: var(--font-display);\n  font-size: 22px;\n  cursor: pointer;\n  box-shadow: 0 10px 0 var(--accent-rose-dim), 0 16px 24px rgba(0,0,0,0.3);\n  user-select: none;\n  transition: transform 0.05s ease, box-shadow 0.05s ease;\n}\n.mash-button:active {\n  transform: translateY(8px);\n  box-shadow: 0 2px 0 var(--accent-rose-dim), 0 6px 14px rgba(0,0,0,0.3);\n}\n";
    document.head.appendChild(styleTag);

    // 3. 필드 + 엑스알 마크업 주입
    document.body.innerHTML = `
    <div class="field">
      <div class="field__vignette"></div>
      <div class="field__ground"></div>

      <div class="stat-hud">
        <span class="stat-hud__label">획득한 필드 스탯</span>
        <span class="stat-hud__value" id="statValue">0</span>
      </div>

      <button type="button" class="xr-egg" id="xrEgg" aria-label="엑스알에게 말 걸기">
        <span class="xr-egg__mark">✕</span>
        <span class="xr-egg__shine"></span>
      </button>
      <div class="xr-egg__shadow"></div>
    </div>
  `;
})();


/* ===================== minigames/cardMatch.js ===================== */
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

/* ===================== minigames/mash.js ===================== */
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

/* ===================== minigames/rps.js ===================== */
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

/* ===================== eggNPC.js ===================== */
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

/* ===================== modalManager.js ===================== */
/**
 * ModalManager
 * -------------------------------------------------------------
 * 화면 어디서든 재사용 가능한 단일 모달 오버레이.
 * 미니게임은 ModalManager.getContent()로 받은 컨테이너에
 * 자신의 UI를 그려 넣기만 하면 된다.
 */
(function () {
    const overlay = document.createElement('div');
    overlay.className = 'mg-modal-overlay hidden';
    overlay.innerHTML = `
    <div class="mg-modal-box">
      <button type="button" class="mg-modal-close" aria-label="닫기">×</button>
      <div class="mg-modal-content"></div>
    </div>
  `;
    document.body.appendChild(overlay);

    const contentEl = overlay.querySelector('.mg-modal-content');
    const closeBtn = overlay.querySelector('.mg-modal-box .mg-modal-close');

    let closable = true;
    let onCloseCallback = null;

    function open() {
        overlay.classList.remove('hidden');
    }

    function close() {
        overlay.classList.add('hidden');
        contentEl.innerHTML = '';
        const cb = onCloseCallback;
        onCloseCallback = null;
        if (typeof cb === 'function') cb();
    }

    /**
     * @param {boolean} value 닫기 버튼/바깥 클릭으로 닫을 수 있는지 여부.
     *   게임이 진행 중일 때는 false로 두어 도중 이탈을 막는 데 쓴다.
     */
    function setClosable(value) {
        closable = value;
        closeBtn.style.display = value ? '' : 'none';
    }

    function getContent() {
        return contentEl;
    }

    /** 모달이 닫힐 때(닫기 버튼/바깥 클릭 포함) 한 번 호출될 콜백 등록 */
    function onClose(callback) {
        onCloseCallback = callback;
    }

    closeBtn.addEventListener('click', () => {
        if (closable) close();
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay && closable) close();
    });

    window.ModalManager = {
        open,
        close,
        setClosable,
        getContent,
        onClose,
    };
})();

console.log("[dev_harness] 엑스알 테스트 환경 준비 완료. 화면의 검은 알을 클릭해보세요.");
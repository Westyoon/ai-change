export default class CodeHeartMiniGame {
    constructor(context) {
      this.container = context.container;
      this.eventBus = context.eventBus || { emit: () => {} };
      this.config = null;
  
      this.slots = { lang: null, engine: null, lib: null, tool: null };
      this.orderQueue = [];
      this.currentOrderIndex = null;
      this.clearedCount = 0;
      this.score = 0;
      this.isDestroyed = false;
      this.isGameOver = false;
  
      // 타이머 누적 변수
      this.startTime = 0;
      this.pausedAccumulated = 0;
      this.penaltyAccumulated = 0;
      this.pauseStart = 0;
      this.isPaused = false;
      this.rafId = null;
  
      this.onActionClick = this.handleActionClick.bind(this);
    }
  
    async init(configData) {
      this.config = configData;
      this.renderDOM();
      this.populateIngredients();
      this.populateRecipes();
      this.container.addEventListener('click', this.onActionClick);
      this.resetState();
    }
  
    start() {
      this.startTime = performance.now();
      this.loop();
    }
  
    pause() {
      if (!this.isPaused) {
        this.pauseStart = performance.now();
        this.isPaused = true;
      }
    }
  
    resume() {
      if (this.isPaused) {
        this.pausedAccumulated += performance.now() - this.pauseStart;
        this.isPaused = false;
      }
    }
  
    renderDOM() {
      this.container.innerHTML = `
        <div class="code-heart-game">
          <header class="ch-header">
            <span class="ch-title">💖 ${this.config.title}</span>
            <span id="ch-timer-display" class="ch-timer">남은 시간: --초</span>
          </header>
  
          <!-- 손님(실루엣+이름) & 대사 말풍선 & 레시피 버튼 -->
          <section class="ch-counter-scene">
            <div class="ch-customer-unit">
              <div class="ch-person-silhouette" aria-label="의뢰인 실루엣">
                <div class="ch-sil-head"></div>
                <div class="ch-sil-body"></div>
              </div>
              <div id="ch-customer-name" class="ch-customer-name">의뢰인 로딩 중...</div>
            </div>
  
            <div id="ch-order-bubble" class="ch-order-bubble">주문 생성 중...</div>
  
            <button class="ch-btn-recipe-trigger" data-action="TOGGLE_RECIPE" aria-label="레시피북 열기">
              <span class="ch-book-icon">📖</span>
              <span class="ch-book-text">레시피</span>
            </button>
          </section>
  
          <section class="ch-workspace">
            <div class="ch-workspace-top">
              <span>[ 작업대 : git add & commit ]</span>
              <button class="ch-btn-reset" data-action="RESET_SLOTS">비우기</button>
            </div>
            <div class="ch-slots-grid">
              <div class="ch-slot-tile" id="ch-slot-lang">
                <span class="ch-slot-type">언어</span>
                <span class="ch-slot-val">-</span>
              </div>
              <div class="ch-slot-tile" id="ch-slot-engine">
                <span class="ch-slot-type">엔진</span>
                <span class="ch-slot-val">-</span>
              </div>
              <div class="ch-slot-tile" id="ch-slot-lib">
                <span class="ch-slot-type">라이브러리</span>
                <span class="ch-slot-val">-</span>
              </div>
              <div class="ch-slot-tile" id="ch-slot-tool">
                <span class="ch-slot-type">도구</span>
                <span class="ch-slot-val">-</span>
              </div>
            </div>
          </section>
  
          <div id="ch-feedback-msg" class="ch-feedback">재료를 선택하여 4개의 슬롯을 채우고 UNLOCK을 누르세요.</div>
  
          <section class="ch-tray-section">
            <div id="ch-materials-grid" class="ch-materials-grid"></div>
            <button class="ch-btn-unlock" data-action="PUSH_COMMIT">
              <span>★ UNLOCK</span>
              <small>git push</small>
            </button>
          </section>
  
          <div id="ch-recipe-modal" class="ch-modal-backdrop hidden">
            <div class="ch-modal-card">
              <h3>📖 개발 레시피북</h3>
              <div id="ch-recipe-list" class="ch-recipe-list"></div>
              <button class="ch-btn-close" data-action="TOGGLE_RECIPE">닫기</button>
            </div>
          </div>
  
          <div id="ch-result-modal" class="ch-modal-backdrop hidden">
            <div class="ch-modal-card ch-result-card">
              <div id="ch-result-title" class="ch-result-title">결과 타이틀</div>
              <div id="ch-result-desc" class="ch-result-desc">세부 내용</div>
              <div id="ch-result-score" class="ch-result-score">최종 점수: 0점</div>
              
              <div class="ch-result-btn-group">
                <button id="ch-btn-retry" class="ch-btn-action retry" data-action="RETRY_GAME">
                  [ 한 번 더 플레이하기 ]
                </button>
                <button id="ch-btn-return-map" class="ch-btn-action success" data-action="RETURN_MAP">
                  [ 메인 맵으로 돌아가기 ]
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  
    generateRandomOrderQueue() {
      const indices = this.config.recipes.map((_, idx) => idx);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      return indices;
    }
  
    resetState() {
      this.slots = { lang: null, engine: null, lib: null, tool: null };
      this.clearedCount = 0;
      this.score = 0;
      this.penaltyAccumulated = 0;
      this.pausedAccumulated = 0;
      this.isGameOver = false;
      this.isPaused = false;
  
      this.orderQueue = this.generateRandomOrderQueue();
      this.currentOrderIndex = this.orderQueue.shift();
  
      const resultModal = this.container.querySelector('#ch-result-modal');
      if (resultModal) resultModal.classList.add('hidden');
  
      this.updateSlotsUI();
      this.loadOrder(this.currentOrderIndex);
      this.updateFeedback("재료를 선택하여 4개의 슬롯을 채우고 UNLOCK을 누르세요.", "");
    }
  
    populateIngredients() {
      const grid = this.container.querySelector('#ch-materials-grid');
      if (!grid) return;
  
      grid.innerHTML = this.config.items.map(item => `
        <button class="ch-btn-material" data-action="SELECT_INGREDIENT" data-cat="${item.category}" data-id="${item.id}">
          ${item.name}
        </button>
      `).join('');
    }
  
    populateRecipes() {
      const list = this.container.querySelector('#ch-recipe-list');
      if (!list) return;
  
      list.innerHTML = this.config.recipes.map(r => `
        <div class="ch-recipe-row">
          <strong>★ [ ${r.targetProgram} ]</strong>
          언어: ${r.expected.lang} | 엔진: ${r.expected.engine}<br>
          라이브러리: ${r.expected.lib} | 도구: ${r.expected.tool}
        </div>
      `).join('');
    }
  
    handleActionClick(e) {
      if (this.isDestroyed) return;
  
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
  
      const action = actionBtn.getAttribute('data-action');
      const itemId = actionBtn.getAttribute('data-id');
  
      switch (action) {
        case 'SELECT_INGREDIENT':
          if (!this.isGameOver) this.selectIngredient(itemId);
          break;
        case 'RESET_SLOTS':
          if (!this.isGameOver) this.resetSlots();
          break;
        case 'TOGGLE_RECIPE':
          this.toggleRecipeModal();
          break;
        case 'PUSH_COMMIT':
          if (!this.isGameOver) this.evaluateBuild();
          break;
        case 'RETURN_MAP':
          this.handleReturnToMap();
          break;
        case 'RETRY_GAME':
          this.restartGame();
          break;
      }
    }
  
    selectIngredient(itemId) {
      const item = this.config.items.find(i => i.id === itemId);
      if (!item) return;
  
      this.slots[item.category] = item;
      this.updateSlotsUI();
    }
  
    resetSlots() {
      this.slots = { lang: null, engine: null, lib: null, tool: null };
      this.updateSlotsUI();
    }
  
    toggleRecipeModal() {
      const modal = this.container.querySelector('#ch-recipe-modal');
      if (modal) modal.classList.toggle('hidden');
    }
  
    evaluateBuild() {
      // 4개 슬롯 완결성 검증
      const isAllFilled = Object.values(this.slots).every(slot => slot !== null);
      if (!isAllFilled) {
        this.updateFeedback("⚠️ 4개 슬롯을 모두 채운 뒤 UNLOCK을 누르세요!", "error", true);
        return;
      }
  
      const currentOrder = this.config.recipes[this.currentOrderIndex];
      const expected = currentOrder.expected;
  
      const isSuccess = Object.keys(expected).every(
        cat => this.slots[cat] && this.slots[cat].id === expected[cat]
      );
  
      if (isSuccess) {
        this.score += this.config.balance.scorePerClear;
        this.clearedCount++;
        this.updateFeedback(`✔ [정화 성공] ${currentOrder.targetProgram} 빌드 완료!`, "success");
  
        this.resetSlots();
  
        const targetCount = this.config.recipes.length;
        if (this.orderQueue.length === 0 || this.clearedCount >= targetCount) {
          this.showResultScreen(true);
          return;
        }
  
        this.currentOrderIndex = this.orderQueue.shift();
        this.loadOrder(this.currentOrderIndex);
      } else {
        const penalty = this.config.balance.penaltySec || 5;
        this.penaltyAccumulated += penalty;
        this.updateFeedback(`✖ [빌드 에러] 구성 불일치! (-${penalty}초 페널티)`, "error", true);
      }
    }
  
    loop() {
      if (this.isDestroyed || this.isGameOver) return;
  
      if (!this.isPaused) {
        const now = performance.now();
        const elapsed = (now - this.startTime - this.pausedAccumulated) / 1000;
        const remainTime = Math.max(0, this.config.balance.gameDurationSec - elapsed - this.penaltyAccumulated);
  
        this.updateTimerUI(remainTime);
  
        if (remainTime <= 0) {
          this.showResultScreen(false);
          return;
        }
      }
  
      this.rafId = requestAnimationFrame(this.loop.bind(this));
    }
  
    showResultScreen(isClear) {
      this.isGameOver = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
  
      const resultModal = this.container.querySelector('#ch-result-modal');
      const titleEl = this.container.querySelector('#ch-result-title');
      const descEl = this.container.querySelector('#ch-result-desc');
      const scoreEl = this.container.querySelector('#ch-result-score');
      const btnRetry = this.container.querySelector('#ch-btn-retry');
  
      scoreEl.textContent = `최종 점수: ${this.score}점`;
  
      if (isClear) {
        titleEl.textContent = "💖 OPEN HEART! 정화 완료 💖";
        titleEl.className = "ch-result-title success";
        descEl.textContent = "모든 코드를 완벽하게 빌드하여 정화했습니다!";
        btnRetry.textContent = "[ 한 번 더 플레이하기 ]";
      } else {
        titleEl.textContent = "✖ BUILD FAILED: 시간 초과 ✖";
        titleEl.className = "ch-result-title error";
        descEl.textContent = "코드가 심하게 꼬여 정화하지 못했습니다.";
        btnRetry.textContent = "[ 다시 도전하기 ]";
      }
  
      resultModal.classList.remove('hidden');
  
      this.eventBus.emit('MINIGAME_COMPLETED', {
        gameId: 'code-heart',
        cleared: isClear,
        score: this.score,
        details: {
          clearedOrders: this.clearedCount,
          totalOrders: this.config.recipes.length
        }
      });
    }
  
    handleReturnToMap() {
      this.destroy();
      this.eventBus.emit('NAVIGATE_TO_SCENE', { sceneName: 'map-scene' });
    }
  
    restartGame() {
      this.resetState();
      this.start();
    }
  
    destroy() {
      this.isDestroyed = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.container.removeEventListener('click', this.onActionClick);
      this.container.innerHTML = '';
    }
  
    loadOrder(index) {
      const order = this.config.recipes[index];
      this.container.querySelector('#ch-customer-name').textContent = order.customerTitle;
      this.container.querySelector('#ch-order-bubble').textContent = `${order.dialogue}`;
    }
  
    updateSlotsUI() {
      this.config.categories.forEach(cat => {
        const tile = this.container.querySelector(`#ch-slot-${cat.id}`);
        if (!tile) return;
        
        const valEl = tile.querySelector('.ch-slot-val');
        const selected = this.slots[cat.id];
  
        valEl.textContent = selected ? selected.name : '-';
        tile.classList.toggle('filled', !!selected);
      });
    }
  
    updateTimerUI(remainTime) {
      const timerEl = this.container.querySelector('#ch-timer-display');
      if (timerEl) {
        timerEl.textContent = `남은 시간: ${Math.ceil(remainTime)}초`;
      }
    }
  
    updateFeedback(text, statusClass, triggerShake = false) {
      const feedbackEl = this.container.querySelector('#ch-feedback-msg');
      if (!feedbackEl) return;
  
      feedbackEl.textContent = text;
      feedbackEl.classList.remove('ch-shake', 'success', 'error');
      void feedbackEl.offsetWidth; // Reflow 강제 실행
  
      if (statusClass) {
        feedbackEl.classList.add(statusClass);
      }
      if (triggerShake) {
        feedbackEl.classList.add('ch-shake');
      }
    }
  }
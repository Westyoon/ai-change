export class AIBallClassificationModule {
  constructor(canvas, configData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = configData.config;
    this.uiText = configData.uiText;

    // 위치/크기 기본값 (resize 시 재계산)
    this.trackY = 200;
    this.binX = 320;
    this.binY = 280;
    this.binWidth = 80;
    this.binHeight = 90;

    this.assets = { targetImages: [], nonTargetImages: [] };
    this.isLoaded = false;
    this.isPaused = false;

    // 이벤트 바인딩 참조 보관 (destroy용)
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.resetState();
  }

  /**
   * 모듈 초기화 및 에셋 지연 로딩
   * @param {Function} onComplete - 미니게임 완료 시 호출할 콜백 함수
   */
  async init(onComplete) {
    this.onCompleteContract = onComplete;
    await this.loadAssets();
    this.recalculateLayout();

    // 글로벌 이벤트 등록 (탭 비활성화 pause, 리사이즈)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleResize);

    this.render();
  }

  /** 게임 시작 */
  start() {
    this.resetState();
    this.status = 'PLAYING';
    this.startTime = Date.now();
    this.startLoop();
  }

  /** 일시 정지 (규칙 14) */
  pause() {
    if (this.status !== 'PLAYING' || this.isPaused) return;
    this.isPaused = true;
    this.stopLoop();
  }

  /** 재개 */
  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.startLoop();
  }

  /** 재시작 */
  restart() {
    this.stopLoop();
    this.resetState();
    this.start();
  }

  /** 리소스 및 이벤트 해제 */
  destroy() {
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resize', this.handleResize);
    this.activeBalls = [];
    this.ballQueue = [];
  }

  /** 결과 처리 및 상위 Scene 반환 (규칙 10) */
  onComplete(isSuccess) {
    this.stopLoop();
    this.status = isSuccess ? 'CLEAR' : 'FAIL';

    const playTimeMs = Date.now() - (this.startTime || Date.now());

    // 공통 result object 데이터 규약
    const resultObj = {
      gameId: 'ai-ball-classification',
      success: isSuccess,
      score: isSuccess ? 100 : Math.floor((this.collectedTargets / this.config.targetCount) * 100),
      metrics: {
        collectedTargets: this.collectedTargets,
        totalTargetCount: this.config.targetCount,
        failReason: this.failReason || null,
        playTimeMs: playTimeMs
      }
    };

    if (typeof this.onCompleteContract === 'function') {
      this.onCompleteContract(resultObj);
    }
  }

  // ==========================================
  // 2. 에셋 및 반응형 / 예외 처리 (규칙 12, 13, 14)
  // ==========================================

  async loadAssets() {
    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    const targetPromises = (this.config.targetImageUrls || []).map(loadImage);
    const nonTargetPromises = (this.config.nonTargetImageUrls || []).map(loadImage);

    const [targets, nonTargets] = await Promise.all([
      Promise.all(targetPromises),
      Promise.all(nonTargetPromises)
    ]);

    this.assets.targetImages = targets.filter(Boolean);
    this.assets.nonTargetImages = nonTargets.filter(Boolean);
    this.isLoaded = true;
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.pause();
    }
  }

  handleResize() {
    // 진행 상태를 초기화하지 않고 위치 좌표 및 Canvas 크기만 재배치 (규칙 13)
    this.recalculateLayout();
    this.render();
  }

  recalculateLayout() {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.trackY = h * 0.45;
    this.binX = w * 0.65;
    this.binY = h * 0.6;
    this.binWidth = w * 0.2;
    this.binHeight = h * 0.3;
  }

  // ==========================================
  // 3. 로직 및 렌더링
  // ==========================================

  resetState() {
    this.status = 'READY';
    this.lidState = this.config.initialLidState || 'CLOSED';
    this.collectedTargets = 0;

    const progressEl = document.getElementById('progress-text');
    if (progressEl) progressEl.textContent = '0';
    
    this.failReason = '';
    this.activeBalls = [];
    this.ballQueue = [];
    this.frameCount = 0;
    this.animFrameId = null;
    this.isPaused = false;

    this.generateQueue();
  }

  generateQueue() {
    const queue = [];
    for (let i = 0; i < this.config.targetCount; i++) {
      const img = this.assets.targetImages.length > 0
        ? this.assets.targetImages[i % this.assets.targetImages.length]
        : null;
      queue.push({ id: `target-${i}`, isTarget: true, img });
    }
    for (let i = 0; i < this.config.nonTargetCount; i++) {
      const img = this.assets.nonTargetImages.length > 0
        ? this.assets.nonTargetImages[i % this.assets.nonTargetImages.length]
        : null;
      queue.push({ id: `distractor-${i}`, isTarget: false, img });
    }

    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    this.ballQueue = queue;
  }

  toggleLid() {
    if (this.status !== 'PLAYING' || this.isPaused) return;
    this.lidState = this.lidState === 'CLOSED' ? 'OPEN' : 'CLOSED';
  }

  startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = () => {
      if (!this.isPaused) {
        this.update();
        this.render();
      }
      if (this.status === 'PLAYING') {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
  }

  update() {
    if (this.status !== 'PLAYING' || this.isPaused) return;

    this.frameCount++;

    if (this.frameCount % this.config.spawnIntervalFrames === 0 && this.ballQueue.length > 0) {
      const nextBall = this.ballQueue.shift();
      this.activeBalls.push({
        ...nextBall,
        x: -20,
        y: this.trackY - 20,
        radius: 20,
        falling: false
      });
    }

    for (let i = this.activeBalls.length - 1; i >= 0; i--) {
      const ball = this.activeBalls[i];

      if (ball.falling) {
        ball.y += 6;
        if (ball.y > this.binY + 40) {
          if (ball.isTarget) {
            this.collectedTargets++;

            const progressEl = document.getElementById('progress-text');
            if (progressEl) progressEl.textContent = this.collectedTargets;

            if (this.collectedTargets >= this.config.targetCount) {
              this.onComplete(true);
            }
          } else {
            this.failReason = this.uiText.failReasons.WRONG_BALL;
            this.onComplete(false);
          }
          this.activeBalls.splice(i, 1);
        }
        continue;
      }

      ball.x += this.config.ballSpeed;

      const inBinZone = ball.x >= this.binX + 15 && ball.x <= this.binX + this.binWidth - 15;
      if (inBinZone && this.lidState === 'OPEN') {
        ball.falling = true;
      }

      if (ball.x > this.binX + this.binWidth + 20) {
        if (ball.isTarget) {
          this.failReason = this.uiText.failReasons.MISSED_TARGET;
          this.onComplete(false);
        }
        this.activeBalls.splice(i, 1);
      }
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. 레일
    this.ctx.fillStyle = '#3a3d52';
    this.ctx.fillRect(0, this.trackY, this.canvas.width, 10);

    // 2. 분류통
    this.ctx.fillStyle = '#4a4d66';
    this.ctx.fillRect(this.binX, this.binY, this.binWidth, this.binHeight);
    this.ctx.strokeStyle = '#00cec9';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(this.binX, this.binY, this.binWidth, this.binHeight);

    // 3. 뚜껑
    this.ctx.save();
    if (this.lidState === 'CLOSED') {
      this.ctx.fillStyle = '#ff7675';
      this.ctx.fillRect(this.binX - 5, this.binY - 8, this.binWidth + 10, 10);
    } else {
      this.ctx.fillStyle = '#55efc4';
      this.ctx.fillRect(this.binX - 5, this.binY, 10, this.binHeight - 10);
    }
    this.ctx.restore();

    // 4. 공
    for (const ball of this.activeBalls) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      this.ctx.closePath();

      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = ball.isTarget ? '#6c5ce7' : '#fdcb6e';
      this.ctx.stroke();
      this.ctx.clip();

      if (ball.img) {
        this.ctx.drawImage(
          ball.img,
          ball.x - ball.radius,
          ball.y - ball.radius,
          ball.radius * 2,
          ball.radius * 2
        );
      } else {
        this.ctx.fillStyle = ball.isTarget ? '#6c5ce7' : '#fdcb6e';
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }
}
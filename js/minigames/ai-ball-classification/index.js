export class AIBallClassificationModule {
  constructor(canvas, configData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = configData.config;
    this.uiText = configData.uiText;

    this.trackY = 280;
    this.binX = 320;
    this.binY = 360;
    this.binWidth = 80;
    this.binHeight = 90;

    this.assets = { targetImages: [], nonTargetImages: [] };
    this.isLoaded = false;
    this.isPaused = false;

    this.lastTime = 0;
    this.spawnTimer = 0;
    this.countdownTimer = 3.0;

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.resetState();
  }

  async init(onComplete) {
    this.onCompleteContract = onComplete;
    await this.loadAssets();
    this.recalculateLayout();

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleResize);

    this.render();
  }

  start() {
    this.resetState();
    this.status = 'PLAYING';
    this.startTime = Date.now();
    this.lastTime = performance.now();
    this.countdownTimer = 3.0;
    this.startLoop();
  }

  pause() {
    if (this.status !== 'PLAYING' || this.isPaused) return;
    this.isPaused = true;
    this.stopLoop();
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.startLoop();
  }

  restart() {
    this.stopLoop();
    this.resetState();
    this.start();
  }

  destroy() {
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resize', this.handleResize);
    this.activeBalls = [];
    this.ballQueue = [];
  }

  onComplete(isSuccess) {
    this.stopLoop();
    this.status = isSuccess ? 'CLEAR' : 'FAIL';

    const playTimeMs = Date.now() - (this.startTime || Date.now());

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
    if (document.hidden) this.pause();
  }

  handleResize() {
    this.recalculateLayout();
    this.render();
  }

  recalculateLayout() {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 💡 레일 및 분류통 위치 하향 조정 (기존 h * 0.45 ➔ h * 0.6)
    this.trackY = h * 0.6;
    this.binX = w * 0.65;
    this.binY = h * 0.72;
    this.binWidth = w * 0.2;
    this.binHeight = h * 0.22;
  }

  resetState() {
    this.status = 'READY';
    this.lidState = this.config.initialLidState || 'CLOSED';
    this.collectedTargets = 0;
    this.failReason = '';
    this.activeBalls = [];
    this.ballQueue = [];
    this.animFrameId = null;
    this.isPaused = false;
    this.spawnTimer = 0;
    this.countdownTimer = 3.0;

    this.generateQueue();
    this.updateScoreUI();
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
    if (this.status !== 'PLAYING' || this.isPaused || this.countdownTimer > 0) return;
    this.lidState = this.lidState === 'CLOSED' ? 'OPEN' : 'CLOSED';
  }

  startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const loop = (currentTime) => {
      if (!this.isPaused) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        const safeDeltaTime = Math.min(deltaTime, 0.1);

        if (!isNaN(safeDeltaTime) && safeDeltaTime > 0) {
          this.update(safeDeltaTime);
        }
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

  updateScoreUI() {
    const progressEl = document.getElementById('progress-text');
    if (progressEl) {
      progressEl.textContent = this.collectedTargets;
    }
  }

  update(dt) {
    if (this.status !== 'PLAYING' || this.isPaused) return;

    if (this.countdownTimer > 0) {
      this.countdownTimer -= dt;
      return;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. 공 이동 속도 설정
    const horizontalSpeed = w * 0.8; 
    const fallSpeed = h * 2;

    // 💡 2. 화면 전체(너비 w)를 지나가는 데 걸리는 시간 계산
    // 화면 전체 이동 시간 = w / horizontalSpeed = 1 / 0.55 ≈ 1.81초
    // 화면에 2개 정도 유지되도록 스폰 간격을 이동 시간의 1/2 수준으로 설정 (약 0.9초)
    const travelTime = w / horizontalSpeed; 
    const spawnIntervalSeconds = travelTime / 2;

    this.spawnTimer += dt;

    // 스폰 속도 조절만으로 자연스럽게 화면에 2개 배치
    if (this.spawnTimer >= spawnIntervalSeconds && this.ballQueue.length > 0) {
      this.spawnTimer = 0;
      const nextBall = this.ballQueue.shift();
      const radiusPx = w * 0.035;

      this.activeBalls.push({
        ...nextBall,
        x: -radiusPx,
        y: this.trackY - radiusPx,
        radius: radiusPx,
        falling: false
      });
    }

    // 3. 이동 및 판정 로직
    for (let i = this.activeBalls.length - 1; i >= 0; i--) {
      const ball = this.activeBalls[i];

      if (ball.falling) {
        ball.y += fallSpeed * dt;

        if (ball.y > this.binY + 40) {
          if (ball.isTarget) {
            this.collectedTargets++;
            this.updateScoreUI();

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

      ball.x += horizontalSpeed * dt;

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

    // 4. 공 렌더링
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

    // 💡 5. Canvas 내부 텍스트 완전 제거 (외부 수집 UI만 사용)

    // 6. 상단 중앙 Target 안내 카드
    this.renderTargetPreview();

    // 7. 3초 카운트다운 오버레이
    if (this.countdownTimer > 0 && this.status === 'PLAYING') {
      this.renderCountdownOverlay();
    }
  }

  /** 💡 중앙 상단 Target 안내 카드 (크기 확대 및 상단 배치) */
  renderTargetPreview() {
    const w = this.canvas.width;
    const centerX = w / 2;
    const startY = 15;

    // 💡 이미지 박스 크기 확대 (기존 0.08 ➔ 0.16)
    const maxBoxSize = Math.min(w * 0.16, 110);
    const targetImg = this.assets.targetImages[0];

    this.ctx.save();

    const panelWidth = Math.max(maxBoxSize + 40, 150);
    const panelHeight = maxBoxSize + 35;

    // 배경 카드
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.beginPath();
    this.ctx.roundRect(
      centerX - panelWidth / 2,
      startY,
      panelWidth,
      panelHeight,
      12
    );
    this.ctx.fill();

    // TARGET 텍스트
    this.ctx.fillStyle = '#a29bfe';
    this.ctx.font = 'bold 13px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('TARGET', centerX, startY + 18);

    // 이미지 렌더링
    if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
      const imgWidth = targetImg.naturalWidth;
      const imgHeight = targetImg.naturalHeight;
      const scale = Math.min(maxBoxSize / imgWidth, maxBoxSize / imgHeight);

      const drawWidth = imgWidth * scale;
      const drawHeight = imgHeight * scale;

      const drawX = centerX - drawWidth / 2;
      const drawY = startY + 25 + (maxBoxSize - drawHeight) / 2;

      this.ctx.drawImage(targetImg, drawX, drawY, drawWidth, drawHeight);
    } else {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText('Loading...', centerX, startY + 45);
    }

    this.ctx.restore();
  }

  /** 💡 화면 중앙 3, 2, 1 카운트다운 표시 */
  renderCountdownOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const countNum = Math.ceil(this.countdownTimer);

    this.ctx.save();

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.fillStyle = '#ffeaa7';
    this.ctx.font = 'bold 64px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(`${countNum}`, w / 2, h / 2);

    this.ctx.restore();
  }
}
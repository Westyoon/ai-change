class AIBallClassificationRenderer {
  constructor(canvas, configData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = configData.config;
    this.uiText = configData.uiText;

    // 트랙 및 분류통 위치 정의
    this.trackY = 200;
    this.binX = 320;
    this.binY = 280;
    this.binWidth = 80;
    this.binHeight = 90;

    // 이미지 에셋 캐시
    this.assets = {
      targetImages: [],
      nonTargetImages: []
    };
    this.isLoaded = false;

    this.resetState();
  }

  // 1. 이미지 프리로드 로직
  async loadAssets() {
    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // 에러 발생 시 처리
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

  resetState() {
    this.status = 'EXPLANATION'; // EXPLANATION, COUNTDOWN, PLAYING, CLEAR, FAIL
    this.lidState = this.config.initialLidState;
    this.collectedTargets = 0;
    this.failReason = '';
    
    this.activeBalls = [];
    this.ballQueue = [];
    this.frameCount = 0;
    this.animFrameId = null;

    this.generateQueue();
  }

  generateQueue() {
    const queue = [];
    for (let i = 0; i < this.config.targetCount; i++) {
      // 무작위 목표 이미지 배정
      const img = this.assets.targetImages.length > 0
        ? this.assets.targetImages[i % this.assets.targetImages.length]
        : null;
      queue.push({ id: `target-${i}`, isTarget: true, img });
    }
    for (let i = 0; i < this.config.nonTargetCount; i++) {
      // 무작위 방해 이미지 배정
      const img = this.assets.nonTargetImages.length > 0
        ? this.assets.nonTargetImages[i % this.assets.nonTargetImages.length]
        : null;
      queue.push({ id: `distractor-${i}`, isTarget: false, img });
    }

    // Fisher-Yates 셔플
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    this.ballQueue = queue;
  }

  toggleLid() {
    if (this.status !== 'PLAYING') return;
    this.lidState = this.lidState === 'CLOSED' ? 'OPEN' : 'CLOSED';
  }

  startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = () => {
      this.update();
      this.render();
      if (this.status === 'PLAYING' || this.status === 'COUNTDOWN') {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  update() {
    if (this.status !== 'PLAYING') return;

    this.frameCount++;

    // 공 스폰
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

    // 공 이동 및 충돌 판정
    for (let i = this.activeBalls.length - 1; i >= 0; i--) {
      const ball = this.activeBalls[i];

      if (ball.falling) {
        ball.y += 6;
        if (ball.y > this.binY + 40) {
          if (ball.isTarget) {
            this.collectedTargets++;
            if (this.collectedTargets >= this.config.targetCount) {
              this.status = 'CLEAR';
            }
          } else {
            this.status = 'FAIL';
            this.failReason = this.uiText.failReasons.WRONG_BALL;
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
          this.status = 'FAIL';
          this.failReason = this.uiText.failReasons.MISSED_TARGET;
        }
        this.activeBalls.splice(i, 1);
      }
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. 레일/트랙 그리기
    this.ctx.fillStyle = '#3a3d52';
    this.ctx.fillRect(0, this.trackY, this.canvas.width, 10);

    // 2. 분류통 그리기
    this.ctx.fillStyle = '#4a4d66';
    this.ctx.fillRect(this.binX, this.binY, this.binWidth, this.binHeight);
    this.ctx.strokeStyle = '#00cec9';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(this.binX, this.binY, this.binWidth, this.binHeight);

    // 3. 뚜껑 그리기
    this.ctx.save();
    if (this.lidState === 'CLOSED') {
      this.ctx.fillStyle = '#ff7675';
      this.ctx.fillRect(this.binX - 5, this.binY - 8, this.binWidth + 10, 10);
    } else {
      this.ctx.fillStyle = '#55efc4';
      this.ctx.fillRect(this.binX - 5, this.binY, 10, this.binHeight - 10);
    }
    this.ctx.restore();

    // 4. 공 그리기 (이미지 렌더링)
    for (const ball of this.activeBalls) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      this.ctx.closePath();

      // 테두리 선
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = ball.isTarget ? '#6c5ce7' : '#fdcb6e';
      this.ctx.stroke();

      // 원형 찌그러짐 방지를 위한 Clip 적용
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
        // 이미지 로드 실패 시 기본 색상
        this.ctx.fillStyle = ball.isTarget ? '#6c5ce7' : '#fdcb6e';
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    // 5. 상단 목표 이미지 배지 렌더링 (PLAYING 상태일 때)
    if (this.status === 'PLAYING') {
      this.renderHeaderTargetBadge();
    }
  }

  // 상단 중앙에 고정 표시되는 목표 이미지 배지
  renderHeaderTargetBadge() {
    const targetImg = this.assets.targetImages[0];
    if (!targetImg) return;

    const badgeX = this.canvas.width / 2;
    const badgeY = 40;

    this.ctx.save();
    // 배경 가이드 박스
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.roundRect(badgeX - 60, badgeY - 30, 120, 50, 8);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('목표 이미지', badgeX - 15, badgeY);

    // 원형 목표 아이콘
    this.ctx.beginPath();
    this.ctx.arc(badgeX + 30, badgeY - 5, 18, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#6c5ce7';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.clip();
    this.ctx.drawImage(targetImg, badgeX + 12, badgeY - 23, 36, 36);
    this.ctx.restore();
  }

  // 카운트다운 진행 중 중앙 대형 목표 이미지 표시
  renderCountdownTargetOverlay() {
    const targetImg = this.assets.targetImages[0];
    if (!targetImg) return;

    const centerX = this.canvas.width / 2;
    const centerY = 110;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    this.ctx.roundRect(centerX - 100, centerY - 60, 200, 120, 12);
    this.ctx.fill();

    this.ctx.fillStyle = '#2d3436';
    this.ctx.font = 'bold 14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('수집할 공 이미지', centerX, centerY - 35);

    // 큰 원형 대표 이미지
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY + 15, 30, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#6c5ce7';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    this.ctx.clip();
    this.ctx.drawImage(targetImg, centerX - 30, centerY - 15, 60, 60);
    this.ctx.restore();
  }
}

// 스크립트 실행 부분
fetch('./data/minigames/ai-ball-classification.json')
  .then(res => res.json())
  .then(async (configData) => {
    const canvas = document.getElementById('game-canvas');
    const renderer = new AIBallClassificationRenderer(canvas, configData);

    // 에셋Preload 실행
    await renderer.loadAssets();

    const overlayRules = document.getElementById('overlay-rules');
    const overlayCountdown = document.getElementById('overlay-countdown');
    const overlayResult = document.getElementById('overlay-result');
    const countdownText = document.getElementById('countdown-text');

    const btnStartGame = document.getElementById('btn-start-game');
    const btnToggleLid = document.getElementById('btn-toggle-lid');
    const btnResultAction = document.getElementById('btn-result-action');
    const progressText = document.getElementById('progress-text');

    function syncUI() {
      progressText.textContent = renderer.collectedTargets;

      if (renderer.lidState === 'OPEN') {
        btnToggleLid.textContent = configData.uiText.lidOpen;
        btnToggleLid.className = 'btn-lid open';
      } else {
        btnToggleLid.textContent = configData.uiText.lidClose;
        btnToggleLid.className = 'btn-lid closed';
      }

      if (renderer.status === 'CLEAR') {
        renderer.stopLoop();
        overlayResult.classList.remove('hidden');
        document.getElementById('result-title').textContent = configData.uiText.clearTitle;
        document.getElementById('result-reason').textContent = '정답 공 5개를 모두 성공적으로 분류했습니다!';
        btnResultAction.textContent = configData.uiText.clearButton;
      } else if (renderer.status === 'FAIL') {
        renderer.stopLoop();
        overlayResult.classList.remove('hidden');
        document.getElementById('result-title').textContent = configData.uiText.failTitle;
        document.getElementById('result-reason').textContent = renderer.failReason;
        btnResultAction.textContent = configData.uiText.failButton;
      }
    }

    btnToggleLid.addEventListener('click', () => {
      renderer.toggleLid();
      syncUI();
    });

    btnStartGame.addEventListener('click', () => {
      overlayRules.classList.add('hidden');
      overlayCountdown.classList.remove('hidden');

      renderer.resetState();
      renderer.status = 'COUNTDOWN';

      let count = configData.config.countdownSeconds;
      countdownText.textContent = count;

      // 카운트다운 중에 목표 이미지를 Canvas에 주기적으로 그려줌
      const countdownDrawInterval = setInterval(() => {
        renderer.render();
        renderer.renderCountdownTargetOverlay();
      }, 50);

      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          countdownText.textContent = count;
        } else {
          clearInterval(timer);
          clearInterval(countdownDrawInterval);

          overlayCountdown.classList.add('hidden');
          renderer.status = 'PLAYING';
          renderer.startLoop();

          const monitor = setInterval(() => {
            syncUI();
            if (renderer.status === 'CLEAR' || renderer.status === 'FAIL') {
              clearInterval(monitor);
            }
          }, 100);
        }
      }, 1000);
    });

    btnResultAction.addEventListener('click', () => {
      overlayResult.classList.add('hidden');
      overlayRules.classList.remove('hidden');
      renderer.resetState();
      renderer.render();
      syncUI();
    });

    renderer.render();
  });
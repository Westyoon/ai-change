import { AIBallClassificationModule } from './index.js';

async function initGame() {
  try {
    const res = await fetch('./data/minigames/ai-ball-classification.json');
    const configData = await res.json();

    const canvas = document.getElementById('game-canvas');
    const btnStart = document.getElementById('btn-start-game');
    const btnToggleLid = document.getElementById('btn-toggle-lid');
    const overlayRules = document.getElementById('overlay-rules');
    const overlayCountdown = document.getElementById('overlay-countdown');
    const countdownText = document.getElementById('countdown-text');
    const overlayResult = document.getElementById('overlay-result');
    const resultTitle = document.getElementById('result-title');
    const resultReason = document.getElementById('result-reason');
    const btnResultAction = document.getElementById('btn-result-action');
    const progressText = document.getElementById('progress-text');

    let lastResult = null;
    const minigame = new AIBallClassificationModule(canvas, configData);

    // 1. 게임 결과 콜백
    await minigame.init((result) => {
      lastResult = result;

      if (overlayResult) {
        if (result.success) {
          resultTitle.textContent = 'SUCCESS!';
          resultReason.textContent = '목표 공을 모두 수집했습니다!';
          btnResultAction.textContent = '수호알 획득하기';
        } else {
          resultTitle.textContent = 'GAME OVER';
          resultReason.textContent = result.metrics.failReason || '틀린 공을 담았거나 목표 공을 놓쳤습니다.';
          btnResultAction.textContent = '다시 도전하기';
        }
        overlayResult.classList.remove('hidden');
      }
    });

    // 2. 3초 카운트다운 후 게임 시작 함수
    function startCountdownAndGame() {
      if (overlayRules) overlayRules.classList.add('hidden');
      if (overlayResult) overlayResult.classList.add('hidden');

      let count = 3;
      if (countdownText) countdownText.textContent = count;
      if (overlayCountdown) overlayCountdown.classList.remove('hidden');

      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          if (countdownText) countdownText.textContent = count;
        } else {
          clearInterval(timer);
          if (overlayCountdown) overlayCountdown.classList.add('hidden');
          minigame.start();
        }
      }, 1000);
    }

    // 3. 버튼 이벤트 연결
    if (btnStart) {
      btnStart.addEventListener('click', startCountdownAndGame);
    }

    if (btnResultAction) {
      btnResultAction.addEventListener('click', () => {
        if (lastResult && lastResult.success) {
          alert('수호알을 획득했습니다!');
        } else {
          startCountdownAndGame();
        }
      });
    }

    // 4. 뚜껑 조작 (버튼 & 스페이스바)
    function handleLidToggle() {
      minigame.toggleLid();
      if (btnToggleLid) {
        const isOpen = minigame.lidState === 'OPEN';
        btnToggleLid.textContent = isOpen ? 'OPEN (뚜껑 열림)' : 'CLOSE (뚜껑 닫힘)';
        btnToggleLid.className = `btn-lid ${isOpen ? 'open' : 'closed'}`;
      }
    }

    if (btnToggleLid) {
      btnToggleLid.addEventListener('click', handleLidToggle);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleLidToggle();
      }
    });

  } catch (error) {
    console.error('게임 실행 오류:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
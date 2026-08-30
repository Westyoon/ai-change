import { buildMiniGameCandidate } from '../shared/result-builder.js';
import { attachFixedFrameScaler } from '../shared/fixed-frame-scaler.js';

const GAME_ID = 'computer-code-heart';
const FAILURE_REASON = 'TIME_LIMIT';
const SLOT_IDS = Object.freeze(['lang', 'engine', 'lib', 'tool']);
const LOGICAL_FRAME_WIDTH = 440;
const LOGICAL_FRAME_HEIGHT = 920;
const MAX_DISPLAY_SCALE = 1.25;

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Mini-game initialization was aborted.', 'AbortError');
  }
  const error = new Error('Mini-game initialization was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted || disposed()) {
    throw signal?.reason ?? createAbortError();
  }
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    throw new TypeError('Mini-game attemptId must be a non-empty string.');
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('computer-code-heart config must be an object.');
  }
  if (!Array.isArray(config.categories) || !Array.isArray(config.items) || !Array.isArray(config.recipes)) {
    throw new TypeError('computer-code-heart requires categories, items, and recipes arrays.');
  }
  if (config.recipes.length === 0) {
    throw new TypeError('computer-code-heart requires at least one recipe.');
  }
}

function shuffleIndices(length) {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [indices[index], indices[target]] = [indices[target], indices[index]];
  }
  return indices;
}

function createElement(documentRef, tagName, { className = '', text = '', attributes = {} } = {}) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute?.(name, value);
  }
  return element;
}

export function createMiniGame(context = {}) {
  const removers = [];
  const frameRequest =
    context.requestAnimationFrame ??
    globalThis.requestAnimationFrame ??
    ((callback) => globalThis.setTimeout(() => callback(now()), 16));
  const frameCancel =
    context.cancelAnimationFrame ??
    globalThis.cancelAnimationFrame ??
    ((id) => globalThis.clearTimeout(id));
  const now =
    typeof context.clock?.now === 'function'
      ? () => context.clock.now()
      : () => globalThis.performance?.now?.() ?? Date.now();

  let config = null;
  let ui = null;
  let slots = Object.fromEntries(SLOT_IDS.map((id) => [id, null]));
  let orderQueue = [];
  let currentOrderIndex = null;
  let clearedCount = 0;
  let ordersFailed = 0;
  let buildErrorCount = 0;
  let score = 0;
  let penaltyMs = 0;
  let startedAt = 0;
  let pausedAt = 0;
  let pausedAccumulatedMs = 0;
  let remainingTimeMs = 0;
  let frameId = null;
  let lifecycleState = 'CREATED';
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;
  let originalUiRootClassName = '';
  let detachFrameScaler = () => {};

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function setInteractive(enabled) {
    if (!enabled) {
      ui?.setRecipeOpen?.(false, { restoreFocus: false });
    }
    for (const button of ui?.buttons ?? []) {
      button.disabled = !enabled;
    }
  }

  function setFeedback(message, status = '', shake = false) {
    if (!ui?.feedback) return;
    ui.feedback.textContent = message;
    ui.feedback.className = `ch-feedback${status ? ` ${status}` : ''}`;
    if (shake) {
      void ui.feedback.offsetWidth;
      ui.feedback.className += ' ch-shake';
    }
  }

  function updateSlots() {
    if (!ui) return;
    for (const id of SLOT_IDS) {
      const selected = slots[id];
      const slot = ui.slots.get(id);
      if (!slot) continue;
      slot.value.textContent = selected?.name ?? '-';
      slot.tile.className = `ch-slot-tile${selected ? ' filled' : ''}`;
    }
  }

  function updateOrder() {
    if (!ui) return;
    const order = config.recipes[currentOrderIndex];
    ui.customerName.textContent = order?.customerTitle ?? '의뢰인';
    ui.orderBubble.textContent = order?.dialogue ?? '주문을 준비하고 있습니다.';
  }

  function updateTimer() {
    if (ui?.timer) {
      ui.timer.textContent = `남은 시간: ${Math.ceil(remainingTimeMs / 1000)}초`;
    }
  }

  function resetSlots() {
    slots = Object.fromEntries(SLOT_IDS.map((id) => [id, null]));
    updateSlots();
  }

  function resetAttemptState() {
    resetSlots();
    orderQueue = shuffleIndices(config.recipes.length);
    currentOrderIndex = orderQueue.shift();
    clearedCount = 0;
    ordersFailed = 0;
    buildErrorCount = 0;
    score = 0;
    penaltyMs = 0;
    pausedAccumulatedMs = 0;
    remainingTimeMs = Number(config.balance?.gameDurationSec ?? 60) * 1000;
    updateOrder();
    updateTimer();
    setFeedback('재료를 선택하여 4개의 슬롯을 채우고 UNLOCK을 누르세요.');
  }

  function selectIngredient(itemId) {
    if (lifecycleState !== 'RUNNING') return;
    const item = config.items.find((candidate) => candidate.id === itemId);
    if (!item || !SLOT_IDS.includes(item.category)) return;
    slots[item.category] = item;
    updateSlots();
  }

  function evaluateBuild() {
    if (lifecycleState !== 'RUNNING') return;
    if (!SLOT_IDS.every((id) => slots[id])) {
      setFeedback('⚠️ 4개 슬롯을 모두 채운 뒤 UNLOCK을 누르세요!', 'error', true);
      return;
    }

    const currentOrder = config.recipes[currentOrderIndex];
    const matches = SLOT_IDS.every((id) => slots[id]?.id === currentOrder.expected?.[id]);
    if (!matches) {
      ordersFailed += 1;
      buildErrorCount += 1;
      penaltyMs += Number(config.balance?.penaltySec ?? 5) * 1000;
      setFeedback(
        `✖ [빌드 에러] 구성 불일치! (-${config.balance?.penaltySec ?? 5}초 페널티)`,
        'error',
        true,
      );
      return;
    }

    clearedCount += 1;
    score += Number(config.balance?.scorePerClear ?? 100);
    setFeedback(`✔ [정화 성공] ${currentOrder.targetProgram} 빌드 완료!`, 'success');
    resetSlots();

    if (orderQueue.length === 0 || clearedCount >= config.recipes.length) {
      complete('CLEAR', currentAttemptId);
      return;
    }
    currentOrderIndex = orderQueue.shift();
    updateOrder();
  }

  function metrics() {
    return {
      ordersCompleted: clearedCount,
      ordersFailed,
      buildErrorCount,
      remainingTimeMs: Math.max(0, Math.round(remainingTimeMs)),
    };
  }

  function stopFrame() {
    if (frameId !== null) {
      frameCancel(frameId);
      frameId = null;
    }
  }

  function complete(status, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== 'RUNNING' && lifecycleState !== 'PAUSED')
    ) {
      return false;
    }
    if (status !== 'CLEAR' && status !== 'FAIL') {
      throw new TypeError(`${GAME_ID} may only complete with CLEAR or FAIL.`);
    }

    terminal = true;
    lifecycleState = 'COMPLETED';
    stopFrame();
    setInteractive(false);

    try {
      const candidate = buildMiniGameCandidate({
        status,
        score,
        failureReason: status === 'FAIL' ? FAILURE_REASON : null,
        metrics: metrics(),
        reward: null,
      });
      context.onComplete?.(attemptId, candidate);
    } catch (error) {
      lifecycleState = 'ERROR';
      context.onError?.(attemptId, error);
    }
    return true;
  }

  function frame(timestamp) {
    if (lifecycleState !== 'RUNNING') return;
    try {
      remainingTimeMs = Math.max(
        0,
        Number(config.balance?.gameDurationSec ?? 60) * 1000 -
          (timestamp - startedAt - pausedAccumulatedMs) -
          penaltyMs,
      );
      updateTimer();
      if (remainingTimeMs <= 0) {
        complete('FAIL', currentAttemptId);
        return;
      }
      frameId = frameRequest(frame);
    } catch (error) {
      lifecycleState = 'ERROR';
      stopFrame();
      context.onError?.(currentAttemptId, error);
    }
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    stopFrame();
    currentAttemptId = attemptId;
    terminal = false;
    lifecycleState = 'RUNNING';
    resetAttemptState();
    setInteractive(true);
    startedAt = now();
    frameId = frameRequest(frame);
  }

  function buildUi() {
    const documentRef = context.uiRoot?.ownerDocument ?? globalThis.document;
    if (!context.uiRoot?.append || !documentRef?.createElement) {
      throw new Error(`${GAME_ID} requires a uiRoot with an owner document.`);
    }

    originalUiRootClassName = context.uiRoot.className ?? '';
    context.uiRoot.className = `${originalUiRootClassName} cse-ui-root`.trim();

    const root = createElement(documentRef, 'section', {
      className: 'code-heart-game',
      attributes: { role: 'region', 'aria-label': '컴퓨터공학과 Code Heart: Unlock!' },
    });
    root.dataset.miniGameId = GAME_ID;

    const header = createElement(documentRef, 'header', { className: 'ch-header' });
    const title = createElement(documentRef, 'span', {
      className: 'ch-title',
      text: `💖 ${config.title ?? 'Code Heart: Unlock!'}`,
    });
    const timer = createElement(documentRef, 'span', { className: 'ch-timer', text: '남은 시간: --초' });
    header.append(title, timer);

    const counter = createElement(documentRef, 'section', { className: 'ch-counter-scene' });
    const customerUnit = createElement(documentRef, 'div', { className: 'ch-customer-unit' });
    const silhouette = createElement(documentRef, 'div', {
      className: 'ch-person-silhouette',
      attributes: { 'aria-label': '의뢰인 실루엣' },
    });
    silhouette.append(
      createElement(documentRef, 'div', { className: 'ch-sil-head' }),
      createElement(documentRef, 'div', { className: 'ch-sil-body' }),
    );
    const customerName = createElement(documentRef, 'div', { className: 'ch-customer-name' });
    customerUnit.append(silhouette, customerName);
    const orderBubble = createElement(documentRef, 'div', { className: 'ch-order-bubble' });
    const recipeButton = createElement(documentRef, 'button', {
      className: 'ch-btn-recipe-trigger',
      attributes: {
        type: 'button',
        'aria-label': '레시피북 열기',
        'aria-expanded': 'false',
        'aria-controls': 'code-heart-recipe-dialog',
      },
    });
    recipeButton.append(
      createElement(documentRef, 'span', { className: 'ch-book-icon', text: '📖' }),
      createElement(documentRef, 'span', { className: 'ch-book-text', text: '레시피' }),
    );
    counter.append(customerUnit, orderBubble, recipeButton);

    const workspace = createElement(documentRef, 'section', { className: 'ch-workspace' });
    const workspaceTop = createElement(documentRef, 'div', { className: 'ch-workspace-top' });
    const workspaceLabel = createElement(documentRef, 'span', { text: '[ 작업대 : git add & commit ]' });
    const resetButton = createElement(documentRef, 'button', {
      className: 'ch-btn-reset',
      text: '비우기',
      attributes: { type: 'button' },
    });
    workspaceTop.append(workspaceLabel, resetButton);
    const slotsGrid = createElement(documentRef, 'div', { className: 'ch-slots-grid' });
    const slotRefs = new Map();
    for (const category of config.categories) {
      const tile = createElement(documentRef, 'div', { className: 'ch-slot-tile' });
      const label = createElement(documentRef, 'span', { className: 'ch-slot-type', text: category.name });
      const value = createElement(documentRef, 'span', { className: 'ch-slot-val', text: '-' });
      tile.append(label, value);
      slotsGrid.append(tile);
      slotRefs.set(category.id, { tile, value });
    }
    workspace.append(workspaceTop, slotsGrid);

    const feedback = createElement(documentRef, 'div', { className: 'ch-feedback' });
    feedback.setAttribute?.('aria-live', 'polite');

    const tray = createElement(documentRef, 'section', { className: 'ch-tray-section' });
    const materialsGrid = createElement(documentRef, 'div', { className: 'ch-materials-grid' });
    const buttons = [recipeButton, resetButton];
    for (const item of config.items) {
      const button = createElement(documentRef, 'button', {
        className: 'ch-btn-material',
        text: item.name,
        attributes: { type: 'button' },
      });
      button.dataset.itemId = item.id;
      button.dataset.cat = item.category;
      addListener(button, 'click', () => selectIngredient(item.id));
      materialsGrid.append(button);
      buttons.push(button);
    }
    const unlockButton = createElement(documentRef, 'button', {
      className: 'ch-btn-unlock',
      attributes: { type: 'button' },
    });
    unlockButton.append(
      createElement(documentRef, 'span', { text: '★ UNLOCK' }),
      createElement(documentRef, 'small', { text: 'git push' }),
    );
    addListener(unlockButton, 'click', evaluateBuild);
    addListener(resetButton, 'click', () => {
      if (lifecycleState === 'RUNNING') resetSlots();
    });

    const recipeBackdrop = createElement(documentRef, 'div', {
      className: 'ch-modal-backdrop',
      attributes: {
        id: 'code-heart-recipe-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'code-heart-recipe-title',
      },
    });
    recipeBackdrop.hidden = true;
    const recipePanel = createElement(documentRef, 'div', { className: 'ch-modal-card' });
    const recipeTitle = createElement(documentRef, 'h3', {
      className: 'ch-modal-title',
      text: '📖 개발 레시피북',
      attributes: { id: 'code-heart-recipe-title' },
    });
    const recipeList = createElement(documentRef, 'div', { className: 'ch-recipe-list' });
    for (const recipe of config.recipes) {
      const row = createElement(documentRef, 'div', {
        className: 'ch-recipe-row',
      });
      row.append(
        createElement(documentRef, 'strong', { text: `★ [ ${recipe.targetProgram} ]` }),
        createElement(documentRef, 'span', {
          className: 'ch-recipe-detail',
          text: `언어: ${recipe.expected.lang} | 엔진: ${recipe.expected.engine}`,
        }),
        createElement(documentRef, 'span', {
          className: 'ch-recipe-detail',
          text: `라이브러리: ${recipe.expected.lib} | 도구: ${recipe.expected.tool}`,
        }),
      );
      recipeList.append(row);
    }
    const closeRecipeButton = createElement(documentRef, 'button', {
      className: 'ch-btn-close',
      text: '닫기',
      attributes: { type: 'button' },
    });
    const modalSiblings = [header, counter, workspace, feedback, tray];
    const setRecipeOpen = (open, { restoreFocus = true } = {}) => {
      recipeBackdrop.hidden = !open;
      recipeButton.setAttribute?.('aria-expanded', String(open));
      for (const sibling of modalSiblings) {
        sibling.inert = open;
      }
      if (open) {
        closeRecipeButton.focus?.();
      } else if (restoreFocus && !recipeButton.disabled) {
        recipeButton.focus?.();
      }
    };
    addListener(recipeButton, 'click', () => setRecipeOpen(recipeBackdrop.hidden));
    addListener(closeRecipeButton, 'click', () => setRecipeOpen(false));
    addListener(recipeBackdrop, 'click', (event) => {
      if (event.target === recipeBackdrop) setRecipeOpen(false);
    });
    addListener(recipeBackdrop, 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        setRecipeOpen(false);
      } else if (event.key === 'Tab') {
        event.preventDefault?.();
        closeRecipeButton.focus?.();
      }
    });
    recipePanel.append(recipeTitle, recipeList, closeRecipeButton);
    recipeBackdrop.append(recipePanel);

    tray.append(materialsGrid, unlockButton);
    buttons.push(unlockButton, closeRecipeButton);
    root.append(header, counter, workspace, feedback, tray, recipeBackdrop);
    const viewport = createElement(documentRef, 'div', {
      className: 'cse-fixed-frame-viewport',
      attributes: { 'aria-label': 'Code Heart 고정 화면' },
    });
    viewport.append(root);
    context.uiRoot.append(viewport);

    ui = {
      mount: viewport,
      root,
      timer,
      customerName,
      orderBubble,
      slots: slotRefs,
      feedback,
      buttons,
      setRecipeOpen,
    };
    detachFrameScaler = attachFixedFrameScaler({
      container: context.uiRoot,
      viewport,
      frame: root,
      logicalWidth: LOGICAL_FRAME_WIDTH,
      logicalHeight: LOGICAL_FRAME_HEIGHT,
      fitHeight: false,
      maxScale: MAX_DISPLAY_SCALE,
    });
  }

  return Object.freeze({
    async init(nextConfig, { signal } = {}) {
      if (disposed || lifecycleState !== 'CREATED') {
        throw new Error(`Cannot initialize mini-game from state ${lifecycleState}.`);
      }
      lifecycleState = 'INITIALIZING';
      throwIfUnavailable(signal, () => disposed);
      validateConfig(nextConfig);
      config = nextConfig;
      await Promise.resolve();
      throwIfUnavailable(signal, () => disposed);
      try {
        buildUi();
        resetAttemptState();
        setInteractive(false);
        lifecycleState = 'READY';
      } catch (error) {
        detachFrameScaler();
        detachFrameScaler = () => {};
        for (const remove of removers.splice(0)) {
          try {
            remove();
          } catch {
            // Preserve the initialization failure while cleaning up best-effort.
          }
        }
        ui?.mount?.remove?.();
        ui = null;
        if (context.uiRoot) context.uiRoot.className = originalUiRootClassName;
        lifecycleState = 'ERROR';
        throw error;
      }
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== 'READY') {
        throw new Error(`Cannot start mini-game from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    pause() {
      if (disposed || lifecycleState !== 'RUNNING') return false;
      lifecycleState = 'PAUSED';
      pausedAt = now();
      stopFrame();
      setInteractive(false);
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== 'PAUSED') return false;
      pausedAccumulatedMs += now() - pausedAt;
      lifecycleState = 'RUNNING';
      setInteractive(true);
      frameId = frameRequest(frame);
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== 'COMPLETED') {
        throw new Error(`Cannot restart mini-game from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    completeForDevelopment(status, attemptId = currentAttemptId) {
      return complete(status, attemptId);
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      currentAttemptId = null;
      stopFrame();
      detachFrameScaler();
      detachFrameScaler = () => {};
      for (const remove of removers.splice(0)) {
        try {
          remove();
        } catch {
          // A host listener must not make destroy non-idempotent.
        }
      }
      ui?.mount?.remove?.();
      ui = null;
      if (context.uiRoot) {
        context.uiRoot.className = originalUiRootClassName;
      }
      lifecycleState = 'DESTROYED';
    },

    getState() {
      return Object.freeze({
        state: lifecycleState,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        score,
        ordersCompleted: clearedCount,
        ordersFailed,
        buildErrorCount,
        remainingTimeMs,
      });
    },
  });
}

export default createMiniGame;

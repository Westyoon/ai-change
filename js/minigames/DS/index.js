import { buildMiniGameCandidate } from "../shared/result-builder.js";

const GAME_ID = "data-number-baseball";
const FAILURE_REASON = "EPOCH_LIMIT_REACHED";
const DEFAULT_RULES = Object.freeze({
  digitRange: Object.freeze([0, 9]),
  answerLength: 3,
  allowDuplicate: false,
  maxEpochs: 9,
  allowLeadingZero: true,
});

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Mini-game initialization was aborted.", "AbortError");
  }
  const error = new Error("Mini-game initialization was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfUnavailable(signal, disposed) {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }
  if (disposed) {
    throw createAbortError();
  }
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new TypeError("Mini-game attemptId must be a non-empty string.");
  }
}

function normalizeRules(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Number Baseball config must be an object.");
  }

  const configGameId = config.gameId ?? config.id;
  if (configGameId != null && configGameId !== GAME_ID) {
    throw new TypeError(`Number Baseball config gameId must be ${GAME_ID}.`);
  }

  const source = config.rules ?? {};
  const digitRange = source.digitRange ?? DEFAULT_RULES.digitRange;
  const answerLength = source.answerLength ?? DEFAULT_RULES.answerLength;
  const allowDuplicate = source.allowDuplicate ?? DEFAULT_RULES.allowDuplicate;
  const maxEpochs = source.maxEpochs ?? DEFAULT_RULES.maxEpochs;

  if (
    !Array.isArray(digitRange) ||
    digitRange.length !== 2 ||
    !digitRange.every(Number.isInteger) ||
    digitRange[0] < 0 ||
    digitRange[1] > 9 ||
    digitRange[0] > digitRange[1]
  ) {
    throw new TypeError("Number Baseball rules.digitRange must be an inclusive range within 0..9.");
  }
  if (!Number.isInteger(answerLength) || answerLength <= 0) {
    throw new TypeError("Number Baseball rules.answerLength must be a positive integer.");
  }
  if (allowDuplicate !== false) {
    throw new TypeError("Number Baseball currently requires rules.allowDuplicate=false.");
  }
  if (answerLength > digitRange[1] - digitRange[0] + 1) {
    throw new TypeError("Number Baseball digit range is too small for a unique answer.");
  }
  if (!Number.isInteger(maxEpochs) || maxEpochs <= 0) {
    throw new TypeError("Number Baseball rules.maxEpochs must be a positive integer.");
  }

  const configuredLeadingZero = config.balance?.allowLeadingZero;
  const allowLeadingZero =
    typeof configuredLeadingZero === "boolean"
      ? configuredLeadingZero
      : DEFAULT_RULES.allowLeadingZero;
  if (!allowLeadingZero && digitRange[0] === 0 && digitRange[1] === 0) {
    throw new TypeError("Number Baseball requires a non-zero first-digit candidate.");
  }

  return Object.freeze({
    digitRange: Object.freeze([...digitRange]),
    answerLength,
    allowDuplicate,
    maxEpochs,
    // The feature implementation allowed a leading zero. Keep that behavior
    // while D-08 remains TBD, but honor a resolved boolean value.
    allowLeadingZero,
  });
}

function createInitialState(rules = DEFAULT_RULES) {
  return {
    answer: [],
    currentInput: [],
    history: [],
    epoch: 0,
    maxEpochs: rules.maxEpochs,
    phase: "READY",
    inputLocked: true,
  };
}

export function createMiniGame(context = {}) {
  let rules = DEFAULT_RULES;
  let state = createInitialState(rules);
  let lifecycleState = "CREATED";
  let currentAttemptId = null;
  let terminal = false;
  let disposed = false;
  let originalUiRootClassName = null;
  const removers = [];

  const dom = {
    root: null,
    epochText: null,
    progressBar: null,
    inputSlots: [],
    historyContainer: null,
    keypad: null,
    keyButtons: [],
    deleteButton: null,
    submitButton: null,
    feedback: null,
  };

  const random = typeof context.random === "function" ? context.random : Math.random;

  function addListener(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  function setFeedback(message) {
    if (dom.feedback) {
      dom.feedback.textContent = message;
    }
  }

  function isInteractive() {
    return (
      !disposed &&
      !terminal &&
      lifecycleState === "RUNNING" &&
      state.phase === "INPUT" &&
      !state.inputLocked
    );
  }

  function updateInputSlots() {
    dom.inputSlots.forEach((slot, index) => {
      slot.textContent = state.currentInput[index] ?? "";
    });
  }

  function updateProgress() {
    if (dom.epochText) {
      dom.epochText.textContent = `EPOCH ${state.epoch}/${state.maxEpochs}`;
    }
    if (dom.progressBar) {
      dom.progressBar.max = state.maxEpochs;
      dom.progressBar.value = state.epoch;
      dom.progressBar.textContent = `${state.epoch}/${state.maxEpochs}`;
      dom.progressBar.setAttribute("aria-valuemax", state.maxEpochs);
      dom.progressBar.setAttribute("aria-valuenow", state.epoch);
    }
  }

  function updateControls() {
    const interactive = isInteractive();
    const inputFull = state.currentInput.length >= rules.answerLength;
    for (const { button, value } of dom.keyButtons) {
      const alreadySelected = !rules.allowDuplicate && state.currentInput.includes(value);
      button.disabled = !interactive || inputFull || alreadySelected;
    }
    if (dom.deleteButton) {
      dom.deleteButton.disabled = !interactive || state.currentInput.length === 0;
    }
    if (dom.submitButton) {
      dom.submitButton.disabled = !interactive;
    }
  }

  function clearHistoryUI() {
    for (const child of Array.from(dom.historyContainer?.children ?? [])) {
      child.remove?.();
    }
    if (dom.historyContainer) {
      dom.historyContainer.scrollTop = 0;
    }
  }

  function appendHistoryUI(record) {
    const documentRef = context.uiRoot.ownerDocument;
    const row = documentRef.createElement("div");
    row.className = "nb-history-row";

    const guessText = documentRef.createElement("span");
    guessText.className = "nb-history-guess";
    guessText.textContent = `[ ${record.guess.join(" ")} ]`;

    const resultText = documentRef.createElement("span");
    resultText.className = "nb-history-result";
    const fitText = documentRef.createElement("span");
    fitText.className = "nb-history-fit";
    fitText.textContent = `${record.fit} Fit`;
    const firstSeparator = documentRef.createElement("span");
    firstSeparator.className = "nb-history-separator";
    firstSeparator.textContent = " / ";
    const shiftText = documentRef.createElement("span");
    shiftText.className = "nb-history-shift";
    shiftText.textContent = `${record.shift} Shift`;
    const secondSeparator = documentRef.createElement("span");
    secondSeparator.className = "nb-history-separator";
    secondSeparator.textContent = " / ";
    const outlierText = documentRef.createElement("span");
    outlierText.className = "nb-history-outlier";
    outlierText.textContent = `${record.outlier} Outlier`;
    resultText.append(
      fitText,
      firstSeparator,
      shiftText,
      secondSeparator,
      outlierText,
    );

    row.append(guessText, resultText);
    dom.historyContainer.append(row);
    dom.historyContainer.scrollTop = dom.historyContainer.scrollHeight;
  }

  function renderAttempt() {
    updateInputSlots();
    updateProgress();
    updateControls();
  }

  function generateAnswer() {
    const [minimum, maximum] = rules.digitRange;
    const numbers = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
    const result = [];

    for (let index = 0; index < rules.answerLength; index += 1) {
      const candidates =
        index === 0 && !rules.allowLeadingZero
          ? numbers.filter((number) => number !== 0)
          : numbers;
      const randomValue = random();
      if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
        throw new TypeError("Number Baseball random source must return a number from 0 (inclusive) to 1 (exclusive).");
      }
      const selected = candidates[Math.floor(randomValue * candidates.length)];
      result.push(selected);
      numbers.splice(numbers.indexOf(selected), 1);
    }
    return result;
  }

  function handleNumberInput(number) {
    if (!isInteractive()) return;
    if (state.currentInput.length >= rules.answerLength) {
      setFeedback(`${rules.answerLength}자리를 모두 입력했습니다.`);
      return;
    }
    if (!rules.allowDuplicate && state.currentInput.includes(number)) {
      setFeedback(`${number}은(는) 이미 입력한 숫자입니다.`);
      return;
    }

    state.currentInput.push(number);
    setFeedback("");
    updateInputSlots();
    updateControls();
  }

  function handleDelete() {
    if (!isInteractive() || state.currentInput.length === 0) return;
    state.currentInput.pop();
    setFeedback("");
    updateInputSlots();
    updateControls();
  }

  function createMetrics(status) {
    const lastRecord = state.history.at(-1) ?? {
      fit: status === "CLEAR" ? rules.answerLength : 0,
      shift: 0,
      outlier: status === "CLEAR" ? 0 : rules.answerLength,
    };
    return {
      epochsUsed: state.epoch,
      history: state.history.map((record) => ({
        guess: [...record.guess],
        fit: record.fit,
        shift: record.shift,
        outlier: record.outlier,
      })),
      fit: lastRecord.fit,
      shift: lastRecord.shift,
      outlier: lastRecord.outlier,
      ...(status === "FAIL" ? { answer: [...state.answer] } : {}),
    };
  }

  function complete(status, attemptId = currentAttemptId) {
    if (
      disposed ||
      terminal ||
      attemptId == null ||
      attemptId !== currentAttemptId ||
      (lifecycleState !== "RUNNING" && lifecycleState !== "PAUSED")
    ) {
      return false;
    }
    if (status !== "CLEAR" && status !== "FAIL") {
      throw new TypeError("Number Baseball can only complete with CLEAR or FAIL.");
    }

    terminal = true;
    state.phase = status;
    state.inputLocked = true;
    lifecycleState = "RESOLVING";
    updateControls();

    let candidate;
    try {
      candidate = buildMiniGameCandidate({
        status,
        score: null,
        failureReason: status === "FAIL" ? FAILURE_REASON : null,
        metrics: createMetrics(status),
        reward: null,
      });
    } catch (error) {
      lifecycleState = "ERROR";
      context.onError?.(attemptId, error);
      return true;
    }

    lifecycleState = "COMPLETED";
    if (status === "FAIL") {
      setFeedback(`게임 오버! 정답은 ${state.answer.join("")}였습니다.`);
    } else {
      setFeedback(`클리어! ${state.epoch} Epoch 만에 맞혔습니다.`);
    }
    context.onComplete?.(attemptId, candidate);
    return true;
  }

  function handleSubmit() {
    if (!isInteractive()) return;
    if (state.currentInput.length < rules.answerLength) {
      setFeedback(`숫자 ${rules.answerLength}자리를 모두 채워주세요.`);
      return;
    }

    state.epoch += 1;
    const guess = [...state.currentInput];
    const fit = guess.filter((digit, index) => digit === state.answer[index]).length;
    const shift = guess.filter(
      (digit, index) => digit !== state.answer[index] && state.answer.includes(digit),
    ).length;
    const outlier = rules.answerLength - fit - shift;
    const record = { guess, fit, shift, outlier };

    state.history.push(record);
    appendHistoryUI(record);
    updateProgress();

    if (fit === rules.answerLength) {
      complete("CLEAR");
    } else if (state.epoch >= state.maxEpochs) {
      complete("FAIL");
    } else {
      state.currentInput = [];
      setFeedback(`${fit} Fit / ${shift} Shift / ${outlier} Outlier`);
      updateInputSlots();
      updateControls();
    }
  }

  function resetAttempt() {
    state = {
      answer: generateAnswer(),
      currentInput: [],
      history: [],
      epoch: 0,
      maxEpochs: rules.maxEpochs,
      phase: "INPUT",
      inputLocked: false,
    };
    clearHistoryUI();
    setFeedback("");
    renderAttempt();
  }

  function beginAttempt(attemptId) {
    requireAttemptId(attemptId);
    currentAttemptId = attemptId;
    terminal = false;
    lifecycleState = "RUNNING";
    resetAttempt();
  }

  function buildUi() {
    const uiRoot = context.uiRoot;
    const documentRef = uiRoot?.ownerDocument;
    if (!uiRoot?.append || !documentRef?.createElement) {
      throw new TypeError("Number Baseball requires context.uiRoot with an ownerDocument.");
    }

    originalUiRootClassName = uiRoot.className ?? "";
    uiRoot.className = `${originalUiRootClassName} ds-ui-root`.trim();

    const container = documentRef.createElement("section");
    container.className = "nb-container";
    container.dataset.miniGameId = GAME_ID;
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "데이터사이언스전공 숫자 야구");

    const header = documentRef.createElement("header");
    header.className = "nb-header";
    dom.epochText = documentRef.createElement("div");
    dom.epochText.className = "nb-epoch-text";

    const progressWrapper = documentRef.createElement("div");
    progressWrapper.className = "nb-progress-wrapper";
    dom.progressBar = documentRef.createElement("progress");
    dom.progressBar.className = "nb-progress-bar";
    dom.progressBar.setAttribute("aria-label", "사용한 Epoch");
    progressWrapper.append(dom.progressBar);
    header.append(dom.epochText, progressWrapper);

    const slotsContainer = documentRef.createElement("div");
    slotsContainer.className = "nb-slots";
    slotsContainer.setAttribute("aria-label", "현재 입력");
    for (let index = 0; index < rules.answerLength; index += 1) {
      const slot = documentRef.createElement("div");
      slot.className = "nb-slot";
      slot.setAttribute("aria-label", `${index + 1}번째 숫자`);
      dom.inputSlots.push(slot);
      slotsContainer.append(slot);
    }

    dom.historyContainer = documentRef.createElement("div");
    dom.historyContainer.className = "nb-history";
    dom.historyContainer.setAttribute("aria-label", "판정 기록");

    dom.feedback = documentRef.createElement("p");
    dom.feedback.className = "nb-feedback";
    dom.feedback.setAttribute("aria-live", "polite");

    const controls = documentRef.createElement("div");
    controls.className = "nb-controls";
    dom.keypad = documentRef.createElement("div");
    dom.keypad.className = "nb-keypad";
    dom.keypad.setAttribute("aria-label", "숫자 키패드");

    const [minimum, maximum] = rules.digitRange;
    for (let value = minimum; value <= maximum; value += 1) {
      const button = documentRef.createElement("button");
      button.className = "nb-key";
      button.type = "button";
      button.textContent = String(value);
      button.setAttribute("aria-label", `숫자 ${value}`);
      addListener(button, "click", () => handleNumberInput(value));
      dom.keyButtons.push({ button, value });
      dom.keypad.append(button);
    }

    const actionButtons = documentRef.createElement("div");
    actionButtons.className = "nb-actions";
    dom.deleteButton = documentRef.createElement("button");
    dom.deleteButton.className = "nb-btn-delete";
    dom.deleteButton.type = "button";
    dom.deleteButton.textContent = "지우기";
    addListener(dom.deleteButton, "click", handleDelete);

    dom.submitButton = documentRef.createElement("button");
    dom.submitButton.className = "nb-btn-submit";
    dom.submitButton.type = "button";
    dom.submitButton.textContent = "검증";
    addListener(dom.submitButton, "click", handleSubmit);
    actionButtons.append(dom.deleteButton, dom.submitButton);
    controls.append(dom.keypad, actionButtons);

    container.append(
      header,
      slotsContainer,
      dom.historyContainer,
      dom.feedback,
      controls,
    );
    uiRoot.append(container);
    dom.root = container;

    const unsubscribeInput = context.input?.onAction?.((event) => {
      if (event?.phase === "press" && event.action === "CONFIRM") {
        handleSubmit();
      }
    });
    if (typeof unsubscribeInput === "function") {
      removers.push(unsubscribeInput);
    }

    const keyboardTarget = documentRef.defaultView ?? documentRef;
    const hasInputManager = typeof context.input?.onAction === "function";
    addListener(keyboardTarget, "keydown", (event) => {
      if (!isInteractive()) return;
      const code = String(event?.code ?? "");
      const key = String(event?.key ?? "");
      const digitMatch = /^(?:Digit|Numpad)([0-9])$/u.exec(code);
      const digit = digitMatch ? Number(digitMatch[1]) : /^[0-9]$/u.test(key) ? Number(key) : null;
      if (digit != null && digit >= minimum && digit <= maximum) {
        event.preventDefault?.();
        handleNumberInput(digit);
      } else if (code === "Backspace" || key === "Backspace") {
        event.preventDefault?.();
        handleDelete();
      } else if (!hasInputManager && (code === "Enter" || key === "Enter")) {
        event.preventDefault?.();
        handleSubmit();
      }
    });

    renderAttempt();
  }

  function cleanupUi() {
    for (const remove of removers.splice(0)) {
      try {
        remove();
      } catch {
        // Keep initialization rollback and destroy idempotent.
      }
    }
    dom.root?.remove?.();
    dom.root = null;
    if (context.uiRoot && originalUiRootClassName !== null) {
      context.uiRoot.className = originalUiRootClassName;
    }
    originalUiRootClassName = null;
    dom.epochText = null;
    dom.progressBar = null;
    dom.inputSlots.length = 0;
    dom.historyContainer = null;
    dom.keypad = null;
    dom.keyButtons.length = 0;
    dom.deleteButton = null;
    dom.submitButton = null;
    dom.feedback = null;
  }

  return Object.freeze({
    async init(config = {}, { signal } = {}) {
      if (disposed || lifecycleState !== "CREATED") {
        throw new Error(`Cannot initialize Number Baseball from state ${lifecycleState}.`);
      }
      lifecycleState = "INITIALIZING";
      throwIfUnavailable(signal, disposed);
      rules = normalizeRules(config);
      state = createInitialState(rules);

      await Promise.resolve();
      throwIfUnavailable(signal, disposed);
      try {
        buildUi();
        lifecycleState = "READY";
        renderAttempt();
      } catch (error) {
        cleanupUi();
        lifecycleState = "ERROR";
        throw error;
      }
    },

    start({ attemptId } = {}) {
      if (disposed || lifecycleState !== "READY") {
        throw new Error(`Cannot start Number Baseball from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    pause(reason = "SYSTEM") {
      if (disposed || lifecycleState !== "RUNNING") {
        return false;
      }
      state.inputLocked = true;
      lifecycleState = "PAUSED";
      setFeedback(`일시정지: ${String(reason)}`);
      updateControls();
      return true;
    },

    resume() {
      if (disposed || lifecycleState !== "PAUSED") {
        return false;
      }
      state.inputLocked = state.phase !== "INPUT";
      lifecycleState = "RUNNING";
      setFeedback("");
      updateControls();
      return true;
    },

    restart({ attemptId } = {}) {
      if (disposed || lifecycleState !== "COMPLETED") {
        throw new Error(`Cannot restart Number Baseball from state ${lifecycleState}.`);
      }
      beginAttempt(attemptId);
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      currentAttemptId = null;
      state.inputLocked = true;
      cleanupUi();
      lifecycleState = "DESTROYED";
    },

    completeForDevelopment(status, attemptId) {
      return complete(status, attemptId);
    },

    getState() {
      return Object.freeze({
        state: lifecycleState,
        gamePhase: state.phase,
        attemptId: currentAttemptId,
        terminal,
        disposed,
        epoch: state.epoch,
        maxEpochs: state.maxEpochs,
        historyLength: state.history.length,
        currentInput: Object.freeze([...state.currentInput]),
      });
    },
  });
}

export default createMiniGame;

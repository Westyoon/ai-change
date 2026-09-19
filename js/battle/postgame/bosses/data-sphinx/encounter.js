import { DATA_SPHINX_SELECTIONS } from "./config.js";

export const DATA_SPHINX_STATES = Object.freeze({
  CREATED: "CREATED",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  DESTROYED: "DESTROYED",
});

export const DATA_SPHINX_PHASES = Object.freeze({
  INIT: "INIT",
  PLAYING: "PLAYING",
  RESOLVING: "RESOLVING",
  END: "END",
});

function attemptId(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Data Sphinx start requires a non-empty attemptId.");
  }
  return value;
}

function delta(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function metricsSnapshot(metrics) {
  return Object.freeze({
    correctCount: metrics.correctCount,
    wrongCount: metrics.wrongCount,
    timeoutCount: metrics.timeoutCount,
  });
}

/** Pure O/X timing and damage rules. Character movement and DOM stay outside. */
export class DataSphinxEncounter {
  constructor({ config, onEvent = null, onComplete = null } = {}) {
    if (!config?.quizList?.length) {
      throw new TypeError("DataSphinxEncounter requires normalized config.");
    }
    this.config = config;
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.state = DATA_SPHINX_STATES.CREATED;
    this.completedAttemptIds = new Set();
    this.currentAttemptId = null;
    this._resetAttempt();
  }

  init() {
    if (this.state !== DATA_SPHINX_STATES.CREATED) {
      throw new Error(`Data Sphinx cannot init from ${this.state}.`);
    }
    this._resetAttempt();
    this.state = DATA_SPHINX_STATES.READY;
    this._emit({ type: "ready" });
    return true;
  }

  start({ attemptId: value } = {}) {
    if (this.state !== DATA_SPHINX_STATES.READY) {
      throw new Error(`Data Sphinx cannot start from ${this.state}.`);
    }
    const nextAttemptId = attemptId(value);
    if (this.completedAttemptIds.has(nextAttemptId)) {
      throw new Error(`Data Sphinx attemptId was already completed: ${nextAttemptId}.`);
    }
    this.currentAttemptId = nextAttemptId;
    this.state = DATA_SPHINX_STATES.RUNNING;
    this._beginQuiz(0);
    this._emit({ type: "start", attemptId: nextAttemptId });
    return true;
  }

  pause() {
    if (this.state !== DATA_SPHINX_STATES.RUNNING) return false;
    this.state = DATA_SPHINX_STATES.PAUSED;
    this._emit({ type: "pause" });
    return true;
  }

  resume() {
    if (this.state !== DATA_SPHINX_STATES.PAUSED) return false;
    this.state = DATA_SPHINX_STATES.RUNNING;
    this._emit({ type: "resume" });
    return true;
  }

  restart() {
    if (this.state !== DATA_SPHINX_STATES.COMPLETED) {
      throw new Error(`Data Sphinx cannot restart from ${this.state}.`);
    }
    this._resetAttempt();
    this.state = DATA_SPHINX_STATES.READY;
    this._emit({ type: "restart" });
    return true;
  }

  destroy() {
    if (this.state === DATA_SPHINX_STATES.DESTROYED) return false;
    this.state = DATA_SPHINX_STATES.DESTROYED;
    this.phase = DATA_SPHINX_PHASES.END;
    this._emit({ type: "destroy" });
    return true;
  }

  setPlayerLocation(location) {
    if (Object.values(DATA_SPHINX_SELECTIONS).includes(location)) {
      this.playerLocation = location;
    }
    return this.playerLocation;
  }

  tick(deltaMs) {
    if (this.state !== DATA_SPHINX_STATES.RUNNING) return false;
    const elapsed = delta(deltaMs);

    if (this.phase === DATA_SPHINX_PHASES.PLAYING) {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - elapsed);
      if (this.timeRemainingMs === 0) this._resolveQuiz();
    } else if (this.phase === DATA_SPHINX_PHASES.RESOLVING) {
      this.delayRemainingMs = Math.max(0, this.delayRemainingMs - elapsed);
      if (this.delayRemainingMs === 0) {
        if (this.playerHealth <= 0) this._complete("FAIL", "PLAYER_DEAD");
        else this._beginQuiz(this.currentQuizIndex + 1);
      }
    }
    return true;
  }

  getSnapshot() {
    const quiz = this.config.quizList[this.currentQuizIndex] ?? null;
    return Object.freeze({
      state: this.state,
      phase: this.phase,
      attemptId: this.currentAttemptId,
      currentQuizIndex: this.currentQuizIndex,
      currentQuizId: quiz?.id ?? null,
      currentQuestion: quiz?.question ?? null,
      quizCount: this.config.quizList.length,
      timeLimitMs: this.config.timeLimitMs,
      timeRemainingMs: this.timeRemainingMs,
      delayRemainingMs: this.delayRemainingMs,
      playerLocation: this.playerLocation,
      playerHealth: this.playerHealth,
      playerMaxHealth: this.config.player.maxHealth,
      bossHealth: this.bossHealth,
      bossMaxHealth: this.config.bossMaxHealth,
      metrics: metricsSnapshot(this.metrics),
    });
  }

  _resetAttempt() {
    this.currentQuizIndex = 0;
    this.timeRemainingMs = 0;
    this.delayRemainingMs = 0;
    this.playerLocation = DATA_SPHINX_SELECTIONS.NEUTRAL;
    this.playerHealth = this.config.player.maxHealth;
    this.bossHealth = this.config.bossMaxHealth;
    this.phase = DATA_SPHINX_PHASES.INIT;
    this.metrics = { correctCount: 0, wrongCount: 0, timeoutCount: 0 };
  }

  _beginQuiz(index) {
    if (this.bossHealth <= 0) {
      this._complete("CLEAR", null);
      return;
    }
    if (index >= this.config.quizList.length) {
      this._complete("FAIL", "OUT_OF_QUESTIONS");
      return;
    }
    this.currentQuizIndex = index;
    this.timeRemainingMs = this.config.timeLimitMs;
    this.delayRemainingMs = 0;
    this.phase = DATA_SPHINX_PHASES.PLAYING;
    const quiz = this.config.quizList[index];
    this._emit({
      type: "quiz-start",
      index,
      quizId: quiz.id,
      question: quiz.question,
      quizCount: this.config.quizList.length,
      timeLimitMs: this.config.timeLimitMs,
    });
  }

  _resolveQuiz() {
    if (this.phase !== DATA_SPHINX_PHASES.PLAYING) return;
    const quiz = this.config.quizList[this.currentQuizIndex];
    const selection = this.playerLocation;
    let outcome;
    let damageToPlayer = 0;
    let damageToBoss = 0;

    if (selection === DATA_SPHINX_SELECTIONS.NEUTRAL) {
      outcome = "TIMEOUT";
      damageToPlayer = this.config.playerDamagePerWrong;
      this.metrics.timeoutCount += 1;
    } else if (selection === quiz.answer) {
      outcome = "CORRECT";
      damageToBoss = this.config.damagePerCorrect;
      this.metrics.correctCount += 1;
    } else {
      outcome = "WRONG";
      damageToPlayer = this.config.playerDamagePerWrong;
      this.metrics.wrongCount += 1;
    }

    this.playerHealth = Math.max(0, this.playerHealth - damageToPlayer);
    this.bossHealth = Math.max(0, this.bossHealth - damageToBoss);
    this.phase = DATA_SPHINX_PHASES.RESOLVING;
    this.delayRemainingMs = this.playerHealth <= 0
      ? this.config.deathDelayMs
      : this.config.resolutionDelayMs;
    this._emit({
      type: "quiz-resolved",
      index: this.currentQuizIndex,
      quizId: quiz.id,
      answer: quiz.answer,
      selection,
      outcome,
      damageToPlayer,
      damageToBoss,
      playerHealth: this.playerHealth,
      bossHealth: this.bossHealth,
      delayMs: this.delayRemainingMs,
    });
  }

  _complete(status, failureReason) {
    if (this.state !== DATA_SPHINX_STATES.RUNNING) return false;
    const id = this.currentAttemptId;
    if (!id || this.completedAttemptIds.has(id)) return false;
    this.completedAttemptIds.add(id);
    this.state = DATA_SPHINX_STATES.COMPLETED;
    this.phase = DATA_SPHINX_PHASES.END;
    const candidate = Object.freeze({
      status,
      score: null,
      failureReason,
      metrics: metricsSnapshot(this.metrics),
      reward: null,
    });
    this._emit({ type: "complete", attemptId: id, candidate });
    this.onComplete?.(id, candidate);
    return true;
  }

  _emit(event) {
    this.onEvent?.(Object.freeze(event));
  }
}

export default DataSphinxEncounter;

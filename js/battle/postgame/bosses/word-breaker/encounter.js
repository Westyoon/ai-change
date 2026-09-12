import { buildClearCandidate } from "../../../../minigames/shared/result-builder.js";
import {
  aabbIntersects,
  clampAabbToArena,
  moveAabbToward,
  normalizeAabb,
  sweptAabbIntersects,
} from "./collision.js";
import { normalizeWordBreakerConfig } from "./config.js";
import {
  chooseRoundPhrase,
  createWordBreakerCollapsePhrase,
  createWordBreakerFinalePhrase,
  createWordBreakerGuardian,
  createWordBreakerPhrase,
  createWordBreakerShot,
  movePhraseDown,
  moveShotUp,
} from "./patterns.js";

export const WORD_BREAKER_STATES = Object.freeze({
  CREATED: "CREATED",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  DESTROYED: "DESTROYED",
});

export const WORD_BREAKER_PHASES = Object.freeze({
  PLAY: "PLAY",
  RECOVERING: "RECOVERING",
  FINALE: "FINALE",
});

const EPSILON = 1e-7;

function rounded(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new TypeError("Word Breaker requires a non-empty attemptId.");
  }
  return attemptId;
}

function snapshotTargetBounds(bounds) {
  return Object.freeze({
    x: rounded(bounds.x),
    y: rounded(bounds.y),
    width: rounded(bounds.width),
    height: rounded(bounds.height),
  });
}

function snapshotPhrase(phrase) {
  return Object.freeze({
    id: phrase.id,
    x: rounded(phrase.x),
    y: rounded(phrase.y),
    width: rounded(phrase.width),
    height: rounded(phrase.height),
    negative: phrase.negative,
    target: phrase.target,
    reframe: phrase.reframe,
    hp: rounded(phrase.hp),
    maxHp: rounded(phrase.maxHp),
    tone: phrase.tone,
    targetBounds: snapshotTargetBounds(phrase.targetBounds),
  });
}

function snapshotShot(shot) {
  return Object.freeze({
    id: shot.id,
    x: rounded(shot.x),
    y: rounded(shot.y),
    width: rounded(shot.width),
    height: rounded(shot.height),
  });
}

function snapshotGuardian(guardian) {
  if (!guardian) return null;
  return Object.freeze({
    id: guardian.id,
    code: guardian.code,
    label: guardian.label,
    color: guardian.color,
    x: rounded(guardian.x),
    y: rounded(guardian.y),
    width: rounded(guardian.width),
    height: rounded(guardian.height),
    roundIndex: guardian.roundIndex,
  });
}

export class WordBreakerEncounter {
  constructor({ config = {}, random = Math.random, onEvent = null, onComplete = null } = {}) {
    this.config = normalizeWordBreakerConfig(config);
    this.random = typeof random === "function" ? random : Math.random;
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.state = WORD_BREAKER_STATES.CREATED;
    this.disposed = false;
    this.attemptId = null;
    this.completedAttemptIds = new Set();
    this.phraseSequence = 0;
    this.shotSequence = 0;
    this.statusSequence = 0;
    this.#resetAttempt();
  }

  init() {
    if (this.disposed) throw new Error("Destroyed WordBreakerEncounter cannot be initialized.");
    if (this.state !== WORD_BREAKER_STATES.CREATED) {
      throw new Error(`Word Breaker can only initialize from CREATED; received ${this.state}.`);
    }
    this.#resetAttempt();
    this.state = WORD_BREAKER_STATES.READY;
    this.#setStatus("다섯 수호알과 함께 마음의 말을 정화할 준비가 되었습니다.", "info");
    this.#emit({ type: "ready" });
    return this.getSnapshot();
  }

  start({ attemptId } = {}) {
    if (this.state !== WORD_BREAKER_STATES.READY) {
      throw new Error(`Word Breaker can only start from READY; received ${this.state}.`);
    }
    const nextAttemptId = requireAttemptId(attemptId);
    if (this.completedAttemptIds.has(nextAttemptId)) {
      throw new Error(`Word Breaker attemptId has already completed: ${nextAttemptId}.`);
    }
    this.attemptId = nextAttemptId;
    this.state = WORD_BREAKER_STATES.RUNNING;
    this.#enterRound(0);
    this.#emit({ type: "started", attemptId: nextAttemptId });
    return this.getSnapshot();
  }

  pause() {
    if (this.state !== WORD_BREAKER_STATES.RUNNING) return false;
    this.state = WORD_BREAKER_STATES.PAUSED;
    this.#emit({ type: "paused" });
    return true;
  }

  resume() {
    if (this.state !== WORD_BREAKER_STATES.PAUSED) return false;
    this.state = WORD_BREAKER_STATES.RUNNING;
    this.#emit({ type: "resumed" });
    return true;
  }

  restart({ attemptId } = {}) {
    if (this.disposed) return false;
    const nextAttemptId = requireAttemptId(attemptId);
    if (this.completedAttemptIds.has(nextAttemptId)) {
      throw new Error(`Word Breaker attemptId has already completed: ${nextAttemptId}.`);
    }
    this.#resetAttempt();
    this.state = WORD_BREAKER_STATES.READY;
    this.start({ attemptId: nextAttemptId });
    return true;
  }

  destroy() {
    if (this.disposed) return false;
    this.disposed = true;
    this.state = WORD_BREAKER_STATES.DESTROYED;
    this.phrases = [];
    this.shots = [];
    this.guardian = null;
    this.onEvent = null;
    this.onComplete = null;
    return true;
  }

  setPlayerBounds(bounds) {
    if (this.disposed) return false;
    const candidate = normalizeAabb({
      x: Number.isFinite(bounds?.x) ? bounds.x : this.playerBounds.x,
      y: Number.isFinite(bounds?.y) ? bounds.y : this.playerBounds.y,
      width: Number.isFinite(bounds?.width) && bounds.width > 0 ? bounds.width : this.playerBounds.width,
      height: Number.isFinite(bounds?.height) && bounds.height > 0 ? bounds.height : this.playerBounds.height,
    });
    this.playerBounds = clampAabbToArena(candidate, this.config.arena);
    if (
      this.state === WORD_BREAKER_STATES.RUNNING
      && this.phase === WORD_BREAKER_PHASES.RECOVERING
      && this.guardian
      && this.guardianElapsedMs >= this.config.collapseImpactMs
      && aabbIntersects(this.playerBounds, this.guardian)
    ) {
      this.#collectGuardian();
    }
    return true;
  }

  tick(deltaMs) {
    if (this.state !== WORD_BREAKER_STATES.RUNNING) return this.getSnapshot();
    let remainingMs = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);

    this.#resolveImmediateContact();
    while (remainingMs > EPSILON && this.state === WORD_BREAKER_STATES.RUNNING) {
      let stepMs = Math.min(remainingMs, this.config.simulationStepMs);
      if (this.phase === WORD_BREAKER_PHASES.PLAY) {
        stepMs = Math.min(stepMs, this.roundRemainingMs);
      } else if (this.phase === WORD_BREAKER_PHASES.RECOVERING) {
        const untilMagnet = this.config.magnetDelayMs - this.guardianElapsedMs;
        if (untilMagnet > EPSILON) stepMs = Math.min(stepMs, untilMagnet);
      } else if (this.phase === WORD_BREAKER_PHASES.FINALE) {
        stepMs = Math.min(stepMs, this.finaleRemainingMs);
      }

      if (stepMs <= EPSILON) {
        if (this.phase === WORD_BREAKER_PHASES.PLAY) this.#collapseRound();
        else if (this.phase === WORD_BREAKER_PHASES.FINALE) this.#finishFinale();
        else this.guardianElapsedMs = this.config.magnetDelayMs;
        continue;
      }

      this.elapsedMs += stepMs;
      this.invulnerableRemainingMs = Math.max(0, this.invulnerableRemainingMs - stepMs);
      if (this.phase === WORD_BREAKER_PHASES.PLAY) this.#stepPlay(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.RECOVERING) this.#stepRecovering(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.FINALE) this.#stepFinale(stepMs);
      remainingMs -= stepMs;
      this.#resolveImmediateContact();
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    const metrics = this.#snapshotMetrics();
    return Object.freeze({
      state: this.state,
      disposed: this.disposed,
      attemptId: this.attemptId,
      roundIndex: this.roundIndex,
      phase: this.phase,
      roundRemainingMs: rounded(this.roundRemainingMs),
      finaleRemainingMs: rounded(this.finaleRemainingMs),
      invulnerableRemainingMs: rounded(this.invulnerableRemainingMs),
      score: rounded(this.score),
      playerBounds: snapshotTargetBounds(this.playerBounds),
      phrases: Object.freeze(this.phrases.map(snapshotPhrase)),
      shots: Object.freeze(this.shots.map(snapshotShot)),
      guardian: snapshotGuardian(this.guardian),
      collectedGuardians: Object.freeze(this.collectedGuardians.map(snapshotGuardian)),
      status: Object.freeze({ ...this.status }),
      metrics: Object.freeze(metrics),
    });
  }

  #resetAttempt() {
    const { arena, player } = this.config;
    this.phraseSequence = 0;
    this.shotSequence = 0;
    this.attemptId = null;
    this.phase = WORD_BREAKER_PHASES.PLAY;
    this.roundIndex = 0;
    this.roundRemainingMs = 0;
    this.finaleRemainingMs = 0;
    this.guardianElapsedMs = 0;
    this.finaleGuardianCount = 0;
    this.invulnerableRemainingMs = 0;
    this.elapsedMs = 0;
    this.score = 0;
    this.phrases = [];
    this.shots = [];
    this.guardian = null;
    this.collectedGuardians = [];
    this.phraseSpawnTimerMs = 0;
    this.shotTimerMs = 0;
    this.playerBounds = clampAabbToArena({
      x: player.startPosition.x,
      y: player.startPosition.y,
      width: player.width,
      height: player.height,
    }, arena);
    this.metrics = {
      phrasesSpawned: 0,
      purifiedCount: 0,
      missedCount: 0,
      hitCount: 0,
      forcedHitCount: 0,
      combo: 0,
      maxCombo: 0,
      shotsFired: 0,
      guardiansCollected: 0,
      roundsCollapsed: 0,
    };
    this.status = {
      text: "준비 중입니다.",
      tone: "info",
      sequence: ++this.statusSequence,
    };
  }

  #enterRound(roundIndex) {
    this.roundIndex = roundIndex;
    this.phase = WORD_BREAKER_PHASES.PLAY;
    this.roundRemainingMs = this.config.roundDurationMs;
    this.finaleRemainingMs = 0;
    this.guardianElapsedMs = 0;
    this.guardian = null;
    this.phrases = [];
    this.shots = [];
    this.phraseSpawnTimerMs = this.config.phrase.spawnIntervalMs;
    this.shotTimerMs = this.config.shot.intervalMs;
    const round = this.config.rounds[roundIndex];
    this.#setStatus(`${round.label}의 수호알을 향해 핵심 단어를 정화하세요.`, "info");
    this.#spawnPhrase();
    this.#spawnShot();
    this.#emit({
      type: "round-start",
      roundIndex,
      roundId: round.id,
      durationMs: this.config.roundDurationMs,
    });
  }

  #stepPlay(stepMs) {
    const seconds = stepMs / 1000;
    this.#movePhrases(seconds);
    this.#moveShots(seconds);
    this.#resolveShotHits();
    this.#resolvePlayerPhraseHits();
    this.#removeExpiredPhrases(stepMs);

    this.roundRemainingMs = Math.max(0, this.roundRemainingMs - stepMs);
    if (this.roundRemainingMs <= EPSILON) {
      this.roundRemainingMs = 0;
      this.#collapseRound();
      return;
    }

    this.phraseSpawnTimerMs -= stepMs;
    while (this.phraseSpawnTimerMs <= EPSILON) {
      if (this.phrases.length < this.config.maxActivePhrases) this.#spawnPhrase();
      this.phraseSpawnTimerMs += this.config.phrase.spawnIntervalMs;
    }
    this.shotTimerMs -= stepMs;
    while (this.shotTimerMs <= EPSILON) {
      this.#spawnShot();
      this.shotTimerMs += this.config.shot.intervalMs;
    }
  }

  #movePhrases(seconds) {
    for (const phrase of this.phrases) {
      if (phrase.tone === "negative") movePhraseDown(phrase, phrase.speed * seconds);
    }
  }

  #moveShots(seconds) {
    const survivors = [];
    for (const shot of this.shots) {
      shot.previousBounds = { x: shot.x, y: shot.y, width: shot.width, height: shot.height };
      moveShotUp(shot, this.config.shot.speed * seconds);
      if (shot.y + shot.height >= this.config.arena.y) survivors.push(shot);
    }
    this.shots = survivors;
  }

  #resolveShotHits() {
    const survivingShots = [];
    for (const shot of this.shots) {
      const target = this.phrases.find((phrase) => (
        phrase.tone === "negative"
        && sweptAabbIntersects(
          shot.previousBounds ?? shot,
          shot,
          phrase.targetBounds,
        )
      ));
      delete shot.previousBounds;
      if (!target) {
        survivingShots.push(shot);
        continue;
      }
      target.hp = Math.max(0, target.hp - this.config.shot.damage);
      this.#emit({
        type: "phrase-hit",
        phraseId: target.id,
        hp: rounded(target.hp),
        maxHp: rounded(target.maxHp),
      });
      if (target.hp <= EPSILON) this.#purifyPhrase(target);
    }
    this.shots = survivingShots;
  }

  #purifyPhrase(phrase) {
    if (phrase.tone !== "negative") return false;
    phrase.hp = 0;
    phrase.tone = "reframed";
    phrase.reframeRemainingMs = this.config.phrase.reframeDurationMs;
    this.metrics.purifiedCount += 1;
    this.metrics.combo += 1;
    this.metrics.maxCombo = Math.max(this.metrics.maxCombo, this.metrics.combo);
    this.score += this.config.scoring.phraseBase
      + (this.metrics.combo - 1) * this.config.scoring.comboStep;
    this.#emit({
      type: "phrase-purified",
      phraseId: phrase.id,
      combo: this.metrics.combo,
      score: rounded(this.score),
      reframe: phrase.reframe,
    });
    return true;
  }

  #resolvePlayerPhraseHits() {
    const survivors = [];
    for (const phrase of this.phrases) {
      if (phrase.tone !== "negative" || !aabbIntersects(this.playerBounds, phrase)) {
        survivors.push(phrase);
        continue;
      }
      if (this.invulnerableRemainingMs <= EPSILON) {
        this.metrics.hitCount += 1;
        this.metrics.combo = 0;
        this.invulnerableRemainingMs = this.config.player.invulnerableMs;
        this.#setStatus("문장에 부딪혔지만 다시 움직일 수 있습니다.", "warning");
        this.#emit({
          type: "player-hit",
          phraseId: phrase.id,
          hitCount: this.metrics.hitCount,
          invulnerableMs: this.config.player.invulnerableMs,
        });
      }
    }
    this.phrases = survivors;
  }

  #removeExpiredPhrases(stepMs) {
    const bottom = this.config.arena.y + this.config.arena.height;
    const survivors = [];
    for (const phrase of this.phrases) {
      if (phrase.tone === "reframed") {
        phrase.reframeRemainingMs = Math.max(0, phrase.reframeRemainingMs - stepMs);
        if (phrase.reframeRemainingMs > EPSILON) survivors.push(phrase);
        continue;
      }
      if (phrase.y <= bottom) {
        survivors.push(phrase);
      } else {
        this.metrics.missedCount += 1;
      }
    }
    this.phrases = survivors;
  }

  #spawnPhrase() {
    const round = this.config.rounds[this.roundIndex];
    const definition = chooseRoundPhrase(round, this.random);
    const phrase = createWordBreakerPhrase({
      definition,
      arena: this.config.arena,
      phraseConfig: this.config.phrase,
      roundIndex: this.roundIndex,
      sequence: ++this.phraseSequence,
      random: this.random,
    });
    this.phrases.push(phrase);
    this.metrics.phrasesSpawned += 1;
    this.#emit({ type: "phrase-spawned", phrase: snapshotPhrase(phrase) });
  }

  #spawnShot() {
    const shot = createWordBreakerShot({
      playerBounds: this.playerBounds,
      shotConfig: this.config.shot,
      sequence: ++this.shotSequence,
    });
    this.shots.push(shot);
    this.metrics.shotsFired += 1;
    this.#emit({ type: "shot-fired", shot: snapshotShot(shot) });
  }

  #collapseRound() {
    if (this.phase !== WORD_BREAKER_PHASES.PLAY || this.state !== WORD_BREAKER_STATES.RUNNING) return;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.RECOVERING;
    this.roundRemainingMs = 0;
    const collapsePhrase = createWordBreakerCollapsePhrase({
      definition: round.phrases[this.roundIndex % round.phrases.length],
      arena: this.config.arena,
      phraseConfig: this.config.phrase,
      playerBounds: this.playerBounds,
      roundIndex: this.roundIndex,
    });
    this.phrases = [collapsePhrase];
    this.shots = [];
    this.guardianElapsedMs = 0;
    this.guardian = createWordBreakerGuardian({
      round,
      arena: this.config.arena,
      guardianConfig: this.config.guardian,
      roundIndex: this.roundIndex,
      random: this.random,
    });
    this.metrics.roundsCollapsed += 1;
    this.metrics.hitCount += 1;
    this.metrics.forcedHitCount += 1;
    this.metrics.combo = 0;
    this.invulnerableRemainingMs = this.config.player.invulnerableMs;
    this.#setStatus(round.collapseMessage, "collapse");
    this.#emit({
      type: "player-hit",
      phraseId: collapsePhrase.id,
      hitCount: this.metrics.hitCount,
      forced: true,
      invulnerableMs: this.config.player.invulnerableMs,
    });
    this.#emit({
      type: "collapse",
      roundIndex: this.roundIndex,
      roundId: round.id,
      message: round.collapseMessage,
      phrase: snapshotPhrase(collapsePhrase),
      guardian: snapshotGuardian(this.guardian),
    });
  }

  #stepRecovering(stepMs) {
    if (!this.guardian) return;
    const activeBeforeMs = Math.max(0, this.guardianElapsedMs - this.config.magnetDelayMs);
    this.guardianElapsedMs += stepMs;
    if (this.guardianElapsedMs + EPSILON < this.config.magnetDelayMs) return;
    const activeAfterMs = Math.max(0, this.guardianElapsedMs - this.config.magnetDelayMs);
    const movementMs = activeAfterMs - activeBeforeMs;
    if (movementMs <= EPSILON) return;
    this.guardian = moveAabbToward(
      this.guardian,
      this.playerBounds,
      this.config.guardian.speed * (movementMs / 1000),
    );
    const round = this.config.rounds[this.roundIndex];
    Object.assign(this.guardian, {
      id: round.guardian.id,
      code: round.guardian.code,
      label: round.guardian.label,
      color: round.guardian.color,
      roundIndex: this.roundIndex,
    });
  }

  #resolveImmediateContact() {
    if (
      this.state === WORD_BREAKER_STATES.RUNNING
      && this.phase === WORD_BREAKER_PHASES.RECOVERING
      && this.guardian
      && this.guardianElapsedMs >= this.config.collapseImpactMs
      && aabbIntersects(this.playerBounds, this.guardian)
    ) {
      this.#collectGuardian();
    }
  }

  #collectGuardian() {
    if (!this.guardian || this.phase !== WORD_BREAKER_PHASES.RECOVERING) return false;
    const round = this.config.rounds[this.roundIndex];
    const collected = snapshotGuardian(this.guardian);
    this.collectedGuardians.push(collected);
    this.guardian = null;
    this.metrics.guardiansCollected = this.collectedGuardians.length;
    this.score += this.config.scoring.guardianBonus;
    this.#setStatus(round.recoveryMessage, "success");
    this.#emit({
      type: "guardian-collected",
      guardian: collected,
      roundIndex: this.roundIndex,
      collectedCount: this.collectedGuardians.length,
      message: round.recoveryMessage,
    });
    if (this.collectedGuardians.length >= this.config.rounds.length) {
      this.#enterFinale();
    } else {
      this.#enterRound(this.roundIndex + 1);
    }
    return true;
  }

  #enterFinale() {
    this.phase = WORD_BREAKER_PHASES.FINALE;
    this.roundRemainingMs = 0;
    this.finaleRemainingMs = this.config.finaleDurationMs;
    this.finaleGuardianCount = 0;
    this.guardian = null;
    this.shots = [];
    this.phrases = [createWordBreakerFinalePhrase({
      definition: this.config.finalPhrase,
      arena: this.config.arena,
      phraseConfig: this.config.phrase,
    })];
    this.#setStatus("다섯 수호알이 마지막 문장을 함께 정화합니다.", "finale");
    this.#emit({
      type: "finale",
      durationMs: this.config.finaleDurationMs,
      guardians: Object.freeze(this.collectedGuardians.map(snapshotGuardian)),
      phrase: snapshotPhrase(this.phrases[0]),
    });
  }

  #stepFinale(stepMs) {
    this.finaleRemainingMs = Math.max(0, this.finaleRemainingMs - stepMs);
    const elapsed = this.config.finaleDurationMs - this.finaleRemainingMs;
    const completedGuardians = Math.min(
      this.config.rounds.length,
      Math.floor((elapsed / this.config.finaleDurationMs) * this.config.rounds.length + EPSILON),
    );
    const phrase = this.phrases[0];
    while (this.finaleGuardianCount < completedGuardians) {
      const guardian = this.collectedGuardians[this.finaleGuardianCount];
      this.finaleGuardianCount += 1;
      phrase.hp = Math.max(0, phrase.maxHp - this.finaleGuardianCount);
      this.#emit({
        type: "finale-step",
        guardian,
        guardianIndex: this.finaleGuardianCount - 1,
        phraseHp: phrase.hp,
      });
    }
    if (this.finaleRemainingMs <= EPSILON) this.#finishFinale();
  }

  #finishFinale() {
    if (this.phase !== WORD_BREAKER_PHASES.FINALE || this.state !== WORD_BREAKER_STATES.RUNNING) return false;
    const phrase = this.phrases[0];
    if (phrase) {
      phrase.hp = 0;
      phrase.tone = "reframed";
    }
    this.score += this.config.scoring.finaleBonus;
    this.#setStatus(this.config.finalPhrase.reframe, "success");
    return this.#complete();
  }

  #complete() {
    if (
      this.state !== WORD_BREAKER_STATES.RUNNING
      || !this.attemptId
      || this.completedAttemptIds.has(this.attemptId)
    ) {
      return false;
    }
    const completedAttemptId = this.attemptId;
    this.completedAttemptIds.add(completedAttemptId);
    this.state = WORD_BREAKER_STATES.COMPLETED;
    const candidate = buildClearCandidate(this.#snapshotMetrics(), {
      score: rounded(this.score),
      reward: null,
    });
    this.#emit({ type: "complete", attemptId: completedAttemptId, candidate });
    this.onComplete?.(completedAttemptId, candidate);
    return true;
  }

  #snapshotMetrics() {
    return {
      phrasesSpawned: this.metrics.phrasesSpawned,
      purifiedCount: this.metrics.purifiedCount,
      missedCount: this.metrics.missedCount,
      hitCount: this.metrics.hitCount,
      forcedHitCount: this.metrics.forcedHitCount,
      combo: this.metrics.combo,
      maxCombo: this.metrics.maxCombo,
      shotsFired: this.metrics.shotsFired,
      guardiansCollected: this.metrics.guardiansCollected,
      roundsCollapsed: this.metrics.roundsCollapsed,
      elapsedMs: rounded(this.elapsedMs),
    };
  }

  #setStatus(text, tone) {
    this.status = { text, tone, sequence: ++this.statusSequence };
    this.#emit({ type: "status", ...this.status });
  }

  #emit(event) {
    this.onEvent?.(Object.freeze({ ...event }));
  }
}

export default WordBreakerEncounter;

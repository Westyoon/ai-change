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
  createWordBreakerFinalePhrase,
  createWordBreakerGuardian,
  createWordBreakerOverloadSurge,
  createWordBreakerOverloadWave,
  createWordBreakerPhrase,
  createWordBreakerShot,
  movePhraseDown,
  moveShotUp,
  moveWordBreakerOverloadGlyph,
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
  OMEN: "OMEN",
  OVERLOAD: "OVERLOAD",
  KNOCKED_OUT: "KNOCKED_OUT",
  GUARDIAN_REVEAL: "GUARDIAN_REVEAL",
  RECOVERING: "RECOVERING",
  REVIVED: "REVIVED",
  FINALE: "FINALE",
});

const EPSILON = 1e-7;
const OVERLOAD_SURGE_LEAD_MS = 650;
const OVERLOAD_SURGE_INTERVAL_MS = 3_600;
const OVERLOAD_SURGE_TRAVEL_MS = 2_400;
const OVERLOAD_DENSE_SPAWN_MIN_MS = 80;

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
    glyphs: Object.freeze((phrase.glyphs ?? []).map(snapshotGlyph)),
  });
}

function snapshotGlyph(glyph) {
  return Object.freeze({
    id: glyph.id,
    text: glyph.text,
    x: rounded(glyph.x),
    y: rounded(glyph.y),
    width: rounded(glyph.width),
    height: rounded(glyph.height),
    collidable: glyph.collidable !== false,
    isTarget: glyph.isTarget === true,
    broken: glyph.broken === true,
    hp: rounded(glyph.hp),
    maxHp: rounded(glyph.maxHp),
  });
}

function snapshotOverloadGlyph(glyph) {
  return Object.freeze({
    id: glyph.id,
    text: glyph.text,
    x: rounded(glyph.x),
    y: rounded(glyph.y),
    width: rounded(glyph.width),
    height: rounded(glyph.height),
    pattern: glyph.pattern,
    waveIndex: glyph.waveIndex,
    color: glyph.color,
    variant: glyph.variant,
    stage: glyph.stage,
    badge: glyph.badge,
    targetX: Number.isFinite(glyph.targetX) ? rounded(glyph.targetX) : null,
    targetY: Number.isFinite(glyph.targetY) ? rounded(glyph.targetY) : null,
    telegraphing: rounded(glyph.delayRemainingMs) > 0,
    delayRemainingMs: rounded(glyph.delayRemainingMs),
    surge: glyph.surge === true,
    contacted: glyph.contacted === true,
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
    this.#setStatus("READY", "info");
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
    this.overloadGlyphs = [];
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
    this.#resolveImmediateContact();
    return true;
  }

  tick(deltaMs) {
    if (this.state !== WORD_BREAKER_STATES.RUNNING) return this.getSnapshot();
    const incomingMs = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);
    const simulationStepMs = this.config.simulationStepMs;
    const accumulatedMs = this.simulationRemainderMs + incomingMs;
    const completedSteps = Math.floor((accumulatedMs + EPSILON) / simulationStepMs);
    let remainingMs = completedSteps * simulationStepMs;
    this.simulationRemainderMs = Math.max(0, accumulatedMs - remainingMs);

    this.#resolveImmediateContact();
    while (remainingMs > EPSILON && this.state === WORD_BREAKER_STATES.RUNNING) {
      let stepMs = Math.min(remainingMs, this.config.simulationStepMs);
      if (this.phase === WORD_BREAKER_PHASES.PLAY) {
        stepMs = Math.min(stepMs, this.roundRemainingMs);
      } else if (this.phase === WORD_BREAKER_PHASES.OMEN) {
        stepMs = Math.min(stepMs, this.omenRemainingMs);
      } else if (this.phase === WORD_BREAKER_PHASES.OVERLOAD) {
        const untilArmed = this.config.overloadGraceMs - this.overloadElapsedMs;
        if (!this.overloadArmed && untilArmed > EPSILON) stepMs = Math.min(stepMs, untilArmed);
        const untilEscalation = this.currentGimmick.forceAtMs - this.overloadElapsedMs;
        if (!this.overloadEscalated && untilEscalation > EPSILON) {
          stepMs = Math.min(stepMs, untilEscalation);
        }
      } else if (this.phase === WORD_BREAKER_PHASES.KNOCKED_OUT) {
        const untilRecovery = this.config.collapseImpactMs - this.knockoutElapsedMs;
        if (untilRecovery > EPSILON) stepMs = Math.min(stepMs, untilRecovery);
      } else if (this.phase === WORD_BREAKER_PHASES.GUARDIAN_REVEAL) {
        stepMs = Math.min(stepMs, this.guardianRevealRemainingMs);
      } else if (this.phase === WORD_BREAKER_PHASES.RECOVERING) {
        const untilMagnet = this.config.magnetDelayMs - this.guardianElapsedMs;
        if (untilMagnet > EPSILON) stepMs = Math.min(stepMs, untilMagnet);
      } else if (this.phase === WORD_BREAKER_PHASES.REVIVED) {
        stepMs = Math.min(stepMs, this.recoveryHoldRemainingMs);
      } else if (this.phase === WORD_BREAKER_PHASES.FINALE) {
        stepMs = Math.min(stepMs, this.finaleRemainingMs);
      }

      if (stepMs <= EPSILON) {
        if (this.phase === WORD_BREAKER_PHASES.PLAY) this.#beginOmen();
        else if (this.phase === WORD_BREAKER_PHASES.OMEN) this.#beginOverload();
        else if (this.phase === WORD_BREAKER_PHASES.OVERLOAD) {
          if (!this.overloadArmed) this.#armOverload();
          else if (!this.overloadEscalated) this.#beginOverloadEscalation();
        }
        else if (this.phase === WORD_BREAKER_PHASES.KNOCKED_OUT) this.#beginGuardianReveal();
        else if (this.phase === WORD_BREAKER_PHASES.GUARDIAN_REVEAL) this.#beginRecovery();
        else if (this.phase === WORD_BREAKER_PHASES.REVIVED) this.#finishRecoveryHold();
        else if (this.phase === WORD_BREAKER_PHASES.FINALE) this.#finishFinale();
        else this.guardianElapsedMs = this.config.magnetDelayMs;
        continue;
      }

      this.elapsedMs += stepMs;
      this.invulnerableRemainingMs = Math.max(0, this.invulnerableRemainingMs - stepMs);
      if (this.phase === WORD_BREAKER_PHASES.PLAY) this.#stepPlay(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.OMEN) this.#stepOmen(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.OVERLOAD) this.#stepOverload(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.KNOCKED_OUT) this.#stepKnockedOut(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.GUARDIAN_REVEAL) this.#stepGuardianReveal(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.RECOVERING) this.#stepRecovering(stepMs);
      else if (this.phase === WORD_BREAKER_PHASES.REVIVED) this.#stepRecoveryHold(stepMs);
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
      omenRemainingMs: rounded(this.omenRemainingMs),
      knockoutRemainingMs: rounded(Math.max(0, this.config.collapseImpactMs - this.knockoutElapsedMs)),
      guardianRevealRemainingMs: rounded(this.guardianRevealRemainingMs),
      recoveryHoldRemainingMs: rounded(this.recoveryHoldRemainingMs),
      finaleRemainingMs: rounded(this.finaleRemainingMs),
      invulnerableRemainingMs: rounded(this.invulnerableRemainingMs),
      controlLocked: this.phase === WORD_BREAKER_PHASES.KNOCKED_OUT
        || this.phase === WORD_BREAKER_PHASES.GUARDIAN_REVEAL
        || this.phase === WORD_BREAKER_PHASES.REVIVED
        || this.phase === WORD_BREAKER_PHASES.FINALE,
      score: rounded(this.score),
      playerBounds: snapshotTargetBounds(this.playerBounds),
      phrases: Object.freeze(this.phrases.map(snapshotPhrase)),
      overloadGlyphs: Object.freeze(this.overloadGlyphs.map(snapshotOverloadGlyph)),
      overload: Object.freeze({
        type: this.currentGimmick?.type ?? null,
        name: this.currentGimmick?.name ?? null,
        cue: this.currentGimmick?.cue ?? null,
        elapsedMs: rounded(this.overloadElapsedMs),
        escalationAtMs: rounded(this.currentGimmick?.forceAtMs ?? 0),
        escalationElapsedMs: rounded(Math.max(
          0,
          this.overloadElapsedMs - (this.currentGimmick?.forceAtMs ?? this.overloadElapsedMs),
        )),
        telegraphMs: rounded(this.currentGimmick?.telegraphMs ?? 0),
        graceRemainingMs: rounded(Math.max(0, this.config.overloadGraceMs - this.overloadElapsedMs)),
        armed: this.overloadArmed,
        attackLeadRemainingMs: rounded(Math.max(
          0,
          this.config.overloadGraceMs + this.config.overloadAttackLeadMs - this.overloadElapsedMs,
        )),
        attacking: this.overloadNormalAttackRetired,
        escalated: this.overloadEscalated,
        waveIndex: this.overloadWaveIndex,
        surgeIndex: this.overloadSurgeIndex,
        contactCount: this.overloadContactCount,
      }),
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
    this.omenRemainingMs = 0;
    this.finaleRemainingMs = 0;
    this.guardianElapsedMs = 0;
    this.guardianRevealRemainingMs = 0;
    this.recoveryHoldRemainingMs = 0;
    this.knockoutElapsedMs = 0;
    this.overloadElapsedMs = 0;
    this.overloadArmed = false;
    this.overloadEscalated = false;
    this.overloadNormalAttackRetired = false;
    this.overloadSpawnTimerMs = 0;
    this.overloadSurgeTimerMs = 0;
    this.overloadWaveIndex = 0;
    this.overloadSurgeIndex = 0;
    this.overloadContactCount = 0;
    this.simulationRemainderMs = 0;
    this.currentGimmick = this.config.rounds[0]?.gimmick ?? null;
    this.finaleGuardianCount = 0;
    this.invulnerableRemainingMs = 0;
    this.elapsedMs = 0;
    this.score = 0;
    this.phrases = [];
    this.shots = [];
    this.overloadGlyphs = [];
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
      glyphsBroken: 0,
      overloadGlyphsSpawned: 0,
      overloadContacts: 0,
      knockoutCount: 0,
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
    this.omenRemainingMs = 0;
    this.finaleRemainingMs = 0;
    this.guardianElapsedMs = 0;
    this.guardianRevealRemainingMs = 0;
    this.recoveryHoldRemainingMs = 0;
    this.knockoutElapsedMs = 0;
    this.overloadElapsedMs = 0;
    this.overloadArmed = false;
    this.overloadEscalated = false;
    this.overloadNormalAttackRetired = false;
    this.overloadSpawnTimerMs = 0;
    this.overloadSurgeTimerMs = 0;
    this.overloadWaveIndex = 0;
    this.overloadSurgeIndex = 0;
    this.overloadContactCount = 0;
    this.guardian = null;
    this.phrases = [];
    this.shots = [];
    this.overloadGlyphs = [];
    this.phraseSpawnTimerMs = this.config.phrase.spawnIntervalMs;
    this.shotTimerMs = this.config.shot.intervalMs;
    const round = this.config.rounds[roundIndex];
    this.currentGimmick = round.gimmick;
    this.#setStatus(`${round.label} · 표적 정화`, "info");
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
    this.#stepNormalAttackObjects(stepMs);

    this.roundRemainingMs = Math.max(0, this.roundRemainingMs - stepMs);
    if (this.roundRemainingMs <= EPSILON) {
      this.roundRemainingMs = 0;
      this.#beginOmen();
      return;
    }

    this.#stepNormalAttackSpawns(stepMs);
  }

  #stepNormalAttackObjects(stepMs) {
    const seconds = stepMs / 1000;
    this.#movePhrases(seconds);
    this.#moveShots(seconds);
    this.#resolveShotHits();
    this.#resolvePlayerPhraseHits();
    this.#removeExpiredPhrases(stepMs);
  }

  #stepNormalAttackSpawns(stepMs) {
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

  #beginOmen() {
    if (this.phase !== WORD_BREAKER_PHASES.PLAY || this.state !== WORD_BREAKER_STATES.RUNNING) return false;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.OMEN;
    this.roundRemainingMs = 0;
    this.omenRemainingMs = this.config.omenDurationMs;
    this.#emit({
      type: "omen-start",
      roundIndex: this.roundIndex,
      roundId: round.id,
      durationMs: this.config.omenDurationMs,
      message: round.omenMessage,
      guardian: Object.freeze({ ...round.guardian }),
    });
    if (this.omenRemainingMs <= EPSILON) this.#beginOverload();
    return true;
  }

  #stepOmen(stepMs) {
    if (this.phase !== WORD_BREAKER_PHASES.OMEN) return;
    this.#stepNormalAttackObjects(stepMs);
    this.#stepNormalAttackSpawns(stepMs);
    this.omenRemainingMs = Math.max(0, this.omenRemainingMs - stepMs);
    if (this.omenRemainingMs <= EPSILON) this.#beginOverload();
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
      let targetPhrase = null;
      let targetGlyph = null;
      for (const phrase of this.phrases) {
        if (phrase.tone !== "negative") continue;
        targetGlyph = (phrase.glyphs ?? []).find((glyph) => (
          glyph.isTarget
          && !glyph.broken
          && sweptAabbIntersects(shot.previousBounds ?? shot, shot, glyph)
        ));
        if (targetGlyph) {
          targetPhrase = phrase;
          break;
        }
      }
      delete shot.previousBounds;
      if (!targetPhrase || !targetGlyph) {
        survivingShots.push(shot);
        continue;
      }
      targetGlyph.hp = Math.max(0, targetGlyph.hp - this.config.shot.damage);
      if (targetGlyph.hp <= EPSILON && !targetGlyph.broken) {
        targetGlyph.broken = true;
        this.metrics.glyphsBroken += 1;
        this.#emit({
          type: "glyph-broken",
          phraseId: targetPhrase.id,
          glyphId: targetGlyph.id,
          text: targetGlyph.text,
        });
      }
      targetPhrase.hp = (targetPhrase.glyphs ?? [])
        .filter(({ isTarget }) => isTarget)
        .reduce((total, glyph) => total + Math.max(0, glyph.hp), 0);
      this.#emit({
        type: "phrase-hit",
        phraseId: targetPhrase.id,
        glyphId: targetGlyph.id,
        glyphHp: rounded(targetGlyph.hp),
        glyphMaxHp: rounded(targetGlyph.maxHp),
        hp: rounded(targetPhrase.hp),
        maxHp: rounded(targetPhrase.maxHp),
      });
      const allTargetsBroken = (targetPhrase.glyphs ?? [])
        .filter(({ isTarget }) => isTarget)
        .every(({ broken }) => broken);
      if (allTargetsBroken) this.#purifyPhrase(targetPhrase);
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
      const collidingGlyph = phrase.tone === "negative"
        ? (phrase.glyphs ?? []).find((glyph) => (
          glyph.collidable !== false
          && !glyph.broken
          && aabbIntersects(this.playerBounds, glyph)
        ))
        : null;
      if (!collidingGlyph) {
        survivors.push(phrase);
        continue;
      }
      if (this.invulnerableRemainingMs <= EPSILON) {
        this.metrics.hitCount += 1;
        this.metrics.combo = 0;
        this.invulnerableRemainingMs = this.config.player.invulnerableMs;
        this.#setStatus("HIT", "warning");
        this.#emit({
          type: "player-hit",
          phraseId: phrase.id,
          glyphId: collidingGlyph.id,
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
      shotDamage: this.config.shot.damage,
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

  #beginOverload() {
    if (this.phase !== WORD_BREAKER_PHASES.OMEN || this.state !== WORD_BREAKER_STATES.RUNNING) return false;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.OVERLOAD;
    this.currentGimmick = round.gimmick;
    this.roundRemainingMs = 0;
    this.omenRemainingMs = 0;
    this.guardian = null;
    this.overloadGlyphs = [];
    this.overloadElapsedMs = 0;
    this.overloadArmed = false;
    this.overloadEscalated = false;
    this.overloadNormalAttackRetired = false;
    this.overloadSpawnTimerMs = round.gimmick.telegraphMs;
    this.overloadSurgeTimerMs = 0;
    this.overloadWaveIndex = 0;
    this.overloadSurgeIndex = 0;
    this.overloadContactCount = 0;
    this.metrics.combo = 0;
    this.#emit({
      type: "overload-start",
      roundIndex: this.roundIndex,
      roundId: round.id,
      gimmickType: round.gimmick.type,
      telegraphMs: round.gimmick.telegraphMs,
      escalationAtMs: round.gimmick.forceAtMs,
      graceMs: this.config.overloadGraceMs,
    });
    if (this.config.overloadGraceMs <= EPSILON) this.#armOverload();
    else this.#spawnOverloadWave();
    return true;
  }

  #stepOverload(stepMs) {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD) return;
    this.overloadElapsedMs += stepMs;
    if (!this.overloadNormalAttackRetired) {
      this.#stepNormalAttackObjects(stepMs);
      this.#stepNormalAttackSpawns(stepMs);
    }
    if (!this.overloadArmed && this.overloadElapsedMs + EPSILON >= this.config.overloadGraceMs) {
      this.#armOverload();
      return;
    }
    this.overloadSpawnTimerMs -= stepMs;
    while (this.overloadSpawnTimerMs <= EPSILON && this.phase === WORD_BREAKER_PHASES.OVERLOAD) {
      this.#spawnOverloadWave();
      this.overloadSpawnTimerMs += this.#currentOverloadSpawnInterval();
    }
    if (this.overloadEscalated) {
      this.overloadSurgeTimerMs -= stepMs;
      while (this.overloadSurgeTimerMs <= EPSILON && this.phase === WORD_BREAKER_PHASES.OVERLOAD) {
        this.#spawnOverloadSurge();
        this.overloadSurgeTimerMs += OVERLOAD_SURGE_INTERVAL_MS;
      }
    }
    for (const glyph of this.overloadGlyphs) {
      glyph.previousBounds = {
        x: glyph.x,
        y: glyph.y,
        width: glyph.width,
        height: glyph.height,
      };
      moveWordBreakerOverloadGlyph(glyph, stepMs, this.playerBounds);
    }
    if (
      !this.overloadNormalAttackRetired
      && this.overloadArmed
      && this.overloadGlyphs.some((glyph) => (
        glyph.delayRemainingMs <= EPSILON
        && !glyph.contacted
      ))
    ) {
      this.#retireNormalAttack();
    }
    this.#resolveOverloadContacts();
    if (this.phase === WORD_BREAKER_PHASES.OVERLOAD) this.#removeExpiredOverloadGlyphs();
    if (
      this.phase === WORD_BREAKER_PHASES.OVERLOAD
      && !this.overloadEscalated
      && this.overloadElapsedMs + EPSILON >= this.currentGimmick.forceAtMs
    ) {
      this.#beginOverloadEscalation();
    }
  }

  #armOverload() {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD || this.overloadArmed) return false;
    const round = this.config.rounds[this.roundIndex];
    this.overloadArmed = true;
    this.overloadGlyphs = [];
    this.overloadWaveIndex = 0;
    this.overloadSpawnTimerMs = this.config.overloadAttackLeadMs + this.currentGimmick.spawnIntervalMs;
    this.#emit({
      type: "overload-armed",
      roundIndex: this.roundIndex,
      roundId: round.id,
      gimmickType: this.currentGimmick.type,
      name: this.currentGimmick.name,
      cue: this.currentGimmick.cue,
    });
    this.#spawnOverloadWave();
    for (const glyph of this.overloadGlyphs) {
      glyph.delayRemainingMs += this.config.overloadAttackLeadMs;
    }
    return true;
  }

  #retireNormalAttack() {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD || this.overloadNormalAttackRetired) return false;
    this.overloadNormalAttackRetired = true;
    this.phrases = [];
    this.shots = [];
    this.phraseSpawnTimerMs = Number.POSITIVE_INFINITY;
    this.shotTimerMs = Number.POSITIVE_INFINITY;
    this.#setStatus(this.currentGimmick.name, "collapse");
    return true;
  }

  #currentOverloadSpawnInterval() {
    if (!this.overloadEscalated) return this.currentGimmick.spawnIntervalMs;
    const escalationElapsedMs = Math.max(0, this.overloadElapsedMs - this.currentGimmick.forceAtMs);
    const stage = Math.min(2, Math.floor(escalationElapsedMs / 1_200));
    const densityScale = [0.72, 0.54, 0.4][stage];
    return Math.max(OVERLOAD_DENSE_SPAWN_MIN_MS, this.currentGimmick.spawnIntervalMs * densityScale);
  }

  #spawnOverloadWave() {
    const round = this.config.rounds[this.roundIndex];
    const waveIndex = this.overloadWaveIndex;
    this.overloadWaveIndex += 1;
    if (this.currentGimmick.type === "firewall-gates") {
      this.overloadGlyphs = this.overloadGlyphs.filter((glyph) => glyph.surge);
    }
    const capacity = Math.max(0, this.currentGimmick.maxGlyphs - this.overloadGlyphs.length);
    if (capacity <= 0) return;
    const glyphs = createWordBreakerOverloadWave({
      round,
      arena: this.config.arena,
      playerBounds: this.playerBounds,
      gimmick: this.currentGimmick,
      roundIndex: this.roundIndex,
      waveIndex,
      random: this.random,
    }).slice(0, capacity);
    if (!glyphs.length) return;
    this.overloadGlyphs.push(...glyphs);
    this.metrics.overloadGlyphsSpawned += glyphs.length;
    this.#emit({
      type: "overload-wave",
      roundIndex: this.roundIndex,
      gimmickType: this.currentGimmick.type,
      waveIndex,
      glyphs: Object.freeze(glyphs.map(snapshotOverloadGlyph)),
    });
  }

  #removeExpiredOverloadGlyphs() {
    const { arena } = this.config;
    this.overloadGlyphs = this.overloadGlyphs.filter((glyph) => {
      if (glyph.expired) return false;
      const margin = glyph.pattern === "firewall-gates" ? 220 : 80;
      return (
        glyph.x + glyph.width >= arena.x - margin
        && glyph.x <= arena.x + arena.width + margin
        && glyph.y + glyph.height >= arena.y - margin
        && glyph.y <= arena.y + arena.height + margin
      );
    });
  }

  #resolveOverloadContacts() {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD) return false;
    if (!this.overloadArmed) return false;
    for (const glyph of this.overloadGlyphs) {
      const previousBounds = glyph.previousBounds ?? glyph;
      delete glyph.previousBounds;
      const crossedPlayer = aabbIntersects(this.playerBounds, glyph)
        || sweptAabbIntersects(previousBounds, glyph, this.playerBounds);
      if (glyph.contacted || glyph.delayRemainingMs > EPSILON || !crossedPlayer) {
        continue;
      }
      glyph.contacted = true;
      this.overloadContactCount += 1;
      this.metrics.overloadContacts += 1;
      this.#emit({
        type: "overload-contact",
        roundIndex: this.roundIndex,
        gimmickType: this.currentGimmick.type,
        glyph: snapshotOverloadGlyph(glyph),
        contactCount: this.overloadContactCount,
      });
      if (this.overloadContactCount >= this.currentGimmick.contactThreshold) {
        this.#knockOutPlayer({ glyph, reason: glyph.surge ? "surge-contact" : "contact" });
        return true;
      }
    }
    return false;
  }

  #beginOverloadEscalation() {
    if (
      this.phase !== WORD_BREAKER_PHASES.OVERLOAD
      || !this.overloadArmed
      || this.overloadEscalated
    ) {
      return false;
    }
    const round = this.config.rounds[this.roundIndex];
    this.overloadEscalated = true;
    this.overloadSpawnTimerMs = Math.min(
      this.overloadSpawnTimerMs,
      this.#currentOverloadSpawnInterval(),
    );
    this.overloadSurgeTimerMs = OVERLOAD_SURGE_INTERVAL_MS;
    this.#setStatus(`${this.currentGimmick.name} · 폭주`, "collapse");
    this.#emit({
      type: "overload-escalated",
      roundIndex: this.roundIndex,
      roundId: round.id,
      gimmickType: this.currentGimmick.type,
      escalationAtMs: this.currentGimmick.forceAtMs,
    });
    this.#spawnOverloadSurge();
    return true;
  }

  #spawnOverloadSurge() {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD || !this.overloadEscalated) return false;
    const round = this.config.rounds[this.roundIndex];
    const surgeIndex = this.overloadSurgeIndex;
    this.overloadSurgeIndex += 1;
    const glyphs = createWordBreakerOverloadSurge({
      round,
      arena: this.config.arena,
      playerBounds: this.playerBounds,
      gimmick: this.currentGimmick,
      roundIndex: this.roundIndex,
      surgeIndex,
      delayMs: OVERLOAD_SURGE_LEAD_MS,
      travelMs: OVERLOAD_SURGE_TRAVEL_MS,
    });
    const overflow = Math.max(
      0,
      this.overloadGlyphs.length + glyphs.length - this.currentGimmick.maxGlyphs,
    );
    if (overflow > 0) this.overloadGlyphs.splice(0, overflow);
    this.overloadGlyphs.push(...glyphs);
    this.metrics.overloadGlyphsSpawned += glyphs.length;
    this.#emit({
      type: "overload-surge",
      roundIndex: this.roundIndex,
      gimmickType: this.currentGimmick.type,
      surgeIndex,
      glyphs: Object.freeze(glyphs.map(snapshotOverloadGlyph)),
    });
    return true;
  }

  #knockOutPlayer({ glyph = null, reason = "contact" } = {}) {
    if (this.phase !== WORD_BREAKER_PHASES.OVERLOAD) return false;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.KNOCKED_OUT;
    this.knockoutElapsedMs = 0;
    this.guardianRevealRemainingMs = 0;
    this.recoveryHoldRemainingMs = 0;
    this.phrases = [];
    this.shots = [];
    const forced = glyph?.surge === true;
    this.metrics.hitCount += 1;
    if (forced) this.metrics.forcedHitCount += 1;
    this.metrics.knockoutCount += 1;
    this.metrics.roundsCollapsed += 1;
    this.metrics.combo = 0;
    this.invulnerableRemainingMs = this.config.player.invulnerableMs;
    this.#setStatus("DOWN", "knockout");
    this.#emit({
      type: "player-hit",
      phraseId: null,
      glyphId: glyph?.id ?? null,
      hitCount: this.metrics.hitCount,
      forced,
      invulnerableMs: this.config.player.invulnerableMs,
    });
    this.#emit({
      type: "collapse",
      roundIndex: this.roundIndex,
      roundId: round.id,
      message: round.collapseMessage,
      gimmick: Object.freeze({ ...round.gimmick }),
      glyph: glyph ? snapshotOverloadGlyph(glyph) : null,
      guardian: null,
    });
    this.#emit({
      type: "player-knockout",
      roundIndex: this.roundIndex,
      roundId: round.id,
      gimmickType: this.currentGimmick.type,
      glyph: glyph ? snapshotOverloadGlyph(glyph) : null,
      reason,
      durationMs: this.config.collapseImpactMs,
    });
    return true;
  }

  #stepKnockedOut(stepMs) {
    if (this.phase !== WORD_BREAKER_PHASES.KNOCKED_OUT) return;
    this.knockoutElapsedMs = Math.min(this.config.collapseImpactMs, this.knockoutElapsedMs + stepMs);
    if (this.knockoutElapsedMs + EPSILON >= this.config.collapseImpactMs) this.#beginGuardianReveal();
  }

  #beginGuardianReveal() {
    if (this.phase !== WORD_BREAKER_PHASES.KNOCKED_OUT) return false;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.GUARDIAN_REVEAL;
    this.overloadGlyphs = [];
    this.guardianRevealRemainingMs = this.config.guardianRevealMs;
    this.guardian = createWordBreakerGuardian({
      round,
      arena: this.config.arena,
      guardianConfig: this.config.guardian,
      roundIndex: this.roundIndex,
      random: this.random,
    });
    this.#setStatus(`${round.guardian.label} · 등장`, "guardian");
    this.#emit({
      type: "guardian-reveal",
      roundIndex: this.roundIndex,
      roundId: round.id,
      guardian: snapshotGuardian(this.guardian),
      message: round.guardianMessage,
      durationMs: this.config.guardianRevealMs,
    });
    if (this.guardianRevealRemainingMs <= EPSILON) this.#beginRecovery();
    return true;
  }

  #stepGuardianReveal(stepMs) {
    if (this.phase !== WORD_BREAKER_PHASES.GUARDIAN_REVEAL) return;
    this.guardianRevealRemainingMs = Math.max(0, this.guardianRevealRemainingMs - stepMs);
    if (this.guardianRevealRemainingMs <= EPSILON) this.#beginRecovery();
  }

  #beginRecovery() {
    if (this.phase !== WORD_BREAKER_PHASES.GUARDIAN_REVEAL) return false;
    const round = this.config.rounds[this.roundIndex];
    this.phase = WORD_BREAKER_PHASES.RECOVERING;
    this.guardianRevealRemainingMs = 0;
    this.guardianElapsedMs = 0;
    if (!this.guardian) {
      this.guardian = createWordBreakerGuardian({
        round,
        arena: this.config.arena,
        guardianConfig: this.config.guardian,
        roundIndex: this.roundIndex,
        random: this.random,
      });
    }
    this.#setStatus("수호알에게 이동", "recovery");
    this.#emit({
      type: "recovery-start",
      roundIndex: this.roundIndex,
      roundId: round.id,
      guardian: snapshotGuardian(this.guardian),
      message: round.recoveryMessage,
    });
    return true;
  }

  #stepRecovering(stepMs) {
    if (!this.guardian) return;
    const activeBeforeMs = Math.max(0, this.guardianElapsedMs - this.config.magnetDelayMs);
    this.guardianElapsedMs += stepMs;
    if (this.guardianElapsedMs + EPSILON >= this.config.recoveryFailsafeMs) {
      this.#collectGuardian({ automatic: true });
      return;
    }
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
      && this.phase === WORD_BREAKER_PHASES.OVERLOAD
    ) {
      this.#resolveOverloadContacts();
      return;
    }
    if (
      this.state === WORD_BREAKER_STATES.RUNNING
      && this.phase === WORD_BREAKER_PHASES.RECOVERING
      && this.guardian
      && aabbIntersects(this.playerBounds, this.guardian)
    ) {
      this.#collectGuardian();
    }
  }

  #collectGuardian({ automatic = false } = {}) {
    if (!this.guardian || this.phase !== WORD_BREAKER_PHASES.RECOVERING) return false;
    const round = this.config.rounds[this.roundIndex];
    const collected = snapshotGuardian(this.guardian);
    this.collectedGuardians.push(collected);
    this.phase = WORD_BREAKER_PHASES.REVIVED;
    this.recoveryHoldRemainingMs = this.config.recoveryHoldMs;
    this.metrics.guardiansCollected = this.collectedGuardians.length;
    this.score += this.config.scoring.guardianBonus;
    this.#setStatus(round.recoveryMessage, "success");
    this.#emit({
      type: "guardian-collected",
      guardian: collected,
      roundIndex: this.roundIndex,
      collectedCount: this.collectedGuardians.length,
      message: round.recoveryMessage,
      automatic,
    });
    if (this.recoveryHoldRemainingMs <= EPSILON) this.#finishRecoveryHold();
    return true;
  }

  #stepRecoveryHold(stepMs) {
    if (this.phase !== WORD_BREAKER_PHASES.REVIVED) return;
    this.recoveryHoldRemainingMs = Math.max(0, this.recoveryHoldRemainingMs - stepMs);
    if (this.recoveryHoldRemainingMs <= EPSILON) this.#finishRecoveryHold();
  }

  #finishRecoveryHold() {
    if (this.phase !== WORD_BREAKER_PHASES.REVIVED) return false;
    this.recoveryHoldRemainingMs = 0;
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
    this.omenRemainingMs = 0;
    this.guardianRevealRemainingMs = 0;
    this.recoveryHoldRemainingMs = 0;
    this.finaleRemainingMs = this.config.finaleDurationMs;
    this.finaleGuardianCount = 0;
    this.guardian = null;
    this.shots = [];
    this.phrases = [createWordBreakerFinalePhrase({
      definition: this.config.finalPhrase,
      arena: this.config.arena,
      phraseConfig: this.config.phrase,
    })];
    this.#setStatus("FINAL", "finale");
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
      glyphsBroken: this.metrics.glyphsBroken,
      overloadGlyphsSpawned: this.metrics.overloadGlyphsSpawned,
      overloadContacts: this.metrics.overloadContacts,
      knockoutCount: this.metrics.knockoutCount,
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

import {
  CharacterView,
  createCharacterActorElement,
} from "../../../character/character-view.js";
import { EIAI_IMAGE_SRC } from "../../../../ui/festival-art.js";
import { guardianSupportStory } from "./guardian-story.js";

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function percent(value, total) {
  return `${(finite(value) / Math.max(1, finite(total, 1))) * 100}%`;
}

function positionRect(node, bounds, arena) {
  node.style.left = percent(finite(bounds?.x) - finite(arena.x), arena.width);
  node.style.top = percent(finite(bounds?.y) - finite(arena.y), arena.height);
  node.style.width = percent(bounds?.width, arena.width);
  node.style.height = percent(bounds?.height, arena.height);
}

const OVERLOAD_PATTERN_LABELS = Object.freeze({
  "lane-rain": "결측치·이상치 폭주",
  "firewall-gates": "악성 패킷·포트 스캔",
  "recursive-fork": "무한 재귀·스택 오버플로",
  "prediction-lock": "오분류·신뢰도 락온",
  "convergence-ring": "데이터↔AI 피드백 폭주",
});

function overloadPatternLabel(type) {
  return OVERLOAD_PATTERN_LABELS[type] ?? "말의 범람";
}

function createElementFactory(documentRef) {
  if (!documentRef?.createElement) throw new Error("WordBreakerView requires a DOM document.");
  return function element(
    tagName,
    { className = "", text = null, attributes = {}, dataset = {} } = {},
    children = [],
  ) {
    const node = documentRef.createElement(tagName);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    for (const [name, value] of Object.entries(dataset)) node.dataset[name] = String(value);
    node.append(...children);
    return node;
  };
}

function createGuardianArt(element, guardian, className = "word-breaker-guardian-art") {
  return element("img", {
    className,
    attributes: {
      src: guardian.imageSrc,
      alt: "",
      width: "1254",
      height: "1254",
      decoding: "async",
      draggable: "false",
      "aria-hidden": "true",
    },
  });
}

function statusText(status) {
  if (typeof status === "string") return status;
  return typeof status?.text === "string" ? status.text : "READY";
}

export class WordBreakerView {
  constructor({ config, localPlayerId = "player-1", document: documentRef = globalThis.document, onGuardianContinue = () => {} } = {}) {
    if (!config?.arena) throw new Error("WordBreakerView requires normalized config.");
    this.config = config;
    this.arena = config.arena;
    this.guardians = config.rounds.map(({ guardian }) => guardian);
    this.localPlayerId = localPlayerId;
    this.onGuardianContinue = onGuardianContinue;
    this.document = documentRef;
    this.createElement = createElementFactory(documentRef);
    this.phraseGlyphElements = new Map();
    this.phraseReframeElements = new Map();
    this.overloadGlyphElements = new Map();
    this.shotElements = new Map();
    this.guardianElement = null;
    this.guardianSlots = new Map();
    this.lastHitCount = null;
    this.previousGuardianIds = null;
    this.recoveryCaption = null;
    this.hitAnimation = null;
    this.element = this.#buildDom();
  }

  mount(parent) {
    if (!parent?.append) throw new Error("WordBreakerView.mount(parent) requires a DOM parent.");
    parent.append(this.element);
  }

  showGuardianStory(round, progress) {
    const story = guardianSupportStory(round, progress);
    this.storyPreviousFocus = this.document.activeElement;
    this.guardianStory.dataset.visible = "true";
    this.guardianStory.dataset.final = String(story.final);
    this.guardianStory.setAttribute("aria-hidden", "false");
    this.guardianStory.style.setProperty("--guardian-color", story.guardian.color);
    this.guardianStoryProgress.textContent = story.progress;
    this.guardianStoryImage.setAttribute("src", story.guardian.imageSrc);
    this.guardianStoryTitle.textContent = `${story.guardian.label}이 깨어났어!`;
    this.guardianStoryDepartment.textContent = story.department;
    this.guardianStoryMemory.textContent = story.memory;
    this.guardianStoryVoice.textContent = `“${story.voice}”`;
    this.guardianStoryBridge.textContent = story.bridge;
    this.guardianStoryContinue.textContent = story.continueLabel;
    this.guardianStory.scrollTop = 0;
    this.guardianStory.querySelector(".guardian-story__panel").scrollTop = 0;
    this.showEiaiCaption("");
    this.guardianStoryContinue.focus?.({ preventScroll: true });
  }

  hideGuardianStory() {
    this.guardianStory.dataset.visible = "false";
    this.guardianStory.setAttribute("aria-hidden", "true");
    this.storyPreviousFocus?.isConnected
      ? this.storyPreviousFocus.focus?.({ preventScroll: true })
      : this.world.focus?.({ preventScroll: true });
    this.storyPreviousFocus = null;
  }

  #createEiaiSprite() {
    const image = this.createElement("img", {
      className: "word-breaker-eiai__sprite",
      attributes: { alt: "", width: "56", height: "56", draggable: "false" },
      dataset: { ready: "false" },
    });
    image.addEventListener("load", () => { image.dataset.ready = "true"; });
    image.addEventListener("error", () => {
      if (image.dataset.retried === "true") return;
      image.dataset.retried = "true";
      const retry = new URL(EIAI_IMAGE_SRC);
      retry.searchParams.set("retry", "1");
      image.setAttribute("src", retry.href);
    });
    image.setAttribute("src", EIAI_IMAGE_SRC);
    return image;
  }

  render(snapshot = {}, characterSnapshot = null) {
    if (!this.element) return;
    const guardians = this.guardians;
    const collected = new Set((snapshot.collectedGuardians ?? []).map((guardian) => guardian.id));
    const phase = String(snapshot.phase ?? "PLAY");
    const currentRound = Math.min(guardians.length, Math.max(0, finite(snapshot.roundIndex)) + 1);
    const overloadType = snapshot.overload?.type ?? null;
    const overloadName = snapshot.overload?.name || overloadPatternLabel(overloadType);
    const omen = phase === "OMEN";
    const staggered = phase === "STAGGERED";
    const knockedOut = phase === "KNOCKED_OUT";
    const guardianReveal = phase === "GUARDIAN_REVEAL";
    const recovering = phase === "RECOVERING";
    const revived = phase === "REVIVED";
    const overloadArmed = phase === "OVERLOAD" && snapshot.overload?.armed === true;
    const overloadAttacking = phase === "OVERLOAD" && snapshot.overload?.attacking === true;
    const concealedTransition = omen || (phase === "OVERLOAD" && !overloadAttacking);
    const collapseBursting = phase === "OVERLOAD"
      && overloadArmed
      && !overloadAttacking;
    const escalated = phase === "OVERLOAD" && snapshot.overload?.escalated === true;
    const controlsLocked = Boolean(snapshot.controlLocked || characterSnapshot?.controlLocked);
    const activeRound = this.config.rounds[Math.max(
      0,
      Math.min(this.config.rounds.length - 1, Math.trunc(finite(snapshot.roundIndex))),
    )];
    const roundPhrases = activeRound?.phrases ?? [];
    const burstPhraseIndex = roundPhrases.length > 0
      ? Math.max(0, Math.trunc(finite(snapshot.overload?.waveIndex)) - 1) % roundPhrases.length
      : 0;
    const pendingOverloadDelays = (snapshot.overloadGlyphs ?? [])
      .map(({ delayRemainingMs }) => Math.max(0, finite(delayRemainingMs)))
      .filter((delayMs) => delayMs > 0);
    const armedTransitionRemainingMs = pendingOverloadDelays.length > 0
      ? Math.min(...pendingOverloadDelays)
      : Math.max(0, finite(snapshot.overload?.attackLeadRemainingMs));
    const playerMaxHealth = Math.max(1, Math.trunc(finite(snapshot.playerMaxHealth, guardians.length)));
    const playerHealth = Math.max(0, Math.min(
      playerMaxHealth,
      Math.trunc(finite(snapshot.playerHealth, playerMaxHealth)),
    ));
    const damageLevel = Math.max(0, playerMaxHealth - playerHealth);
    const damageRatio = damageLevel / playerMaxHealth;
    const hitCount = Math.max(0, finite(snapshot.metrics?.hitCount));
    if (this.lastHitCount !== null && hitCount > this.lastHitCount) {
      this.hitAnimation?.cancel?.();
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!reducedMotion) {
        const target = this.element.closest?.("#app") ?? this.element.closest?.(".battle-frame") ?? this.element;
        this.hitAnimation = target.animate?.([
          { transform: "translate(0, 0)" },
          { transform: "translate(-4px, 2px)" },
          { transform: "translate(4px, -2px)" },
          { transform: "translate(-2px, 1px)" },
          { transform: "translate(0, 0)" },
        ], { duration: 240, easing: "ease-out" });
        try { globalThis.navigator?.vibrate?.(45); } catch { /* Unsupported vibration is optional. */ }
      }
    }
    this.lastHitCount = hitCount;
    const finalRevival = collected.size >= guardians.length && (guardianReveal || revived);

    this.element.dataset.state = String(snapshot.state ?? "READY");
    this.element.dataset.controlLocked = String(controlsLocked);
    this.element.dataset.damageLevel = String(damageLevel);
    this.element.style.setProperty("--word-breaker-damage-ratio", String(damageRatio));
    this.world.dataset.phase = concealedTransition ? "PLAY" : phase;
    this.world.dataset.controlLocked = String(controlsLocked);
    this.world.dataset.collapseBurst = String(collapseBursting);
    this.world.dataset.playerDead = String(playerHealth <= 0);
    this.world.dataset.finalRevival = String(finalRevival);
    this.world.dataset.damageLevel = String(damageLevel);
    this.world.style.setProperty("--word-breaker-damage-ratio", String(damageRatio));
    this.eiai.dataset.burstText = collapseBursting
      ? String(roundPhrases[burstPhraseIndex]?.negative ?? "")
      : "";
    if (overloadType) this.world.dataset.overloadPattern = String(overloadType);
    else delete this.world.dataset.overloadPattern;
    if (phase === "OVERLOAD") {
      const armed = overloadArmed;
      const attacking = snapshot.overload?.attacking === true;
      const elapsedMs = Math.max(0, finite(snapshot.overload?.elapsedMs));
      const graceRemainingMs = Math.max(0, finite(snapshot.overload?.graceRemainingMs));
      const graceDurationMs = Math.max(1, elapsedMs + graceRemainingMs);
      const progress = armed ? 1 : Math.max(0, Math.min(1, elapsedMs / graceDurationMs));
      this.world.dataset.overloadArmed = String(armed);
      this.world.dataset.overloadAttacking = String(attacking);
      this.world.dataset.overloadEscalated = String(escalated);
      this.world.dataset.overloadStage = escalated
        ? "surge"
        : attacking
          ? "impact"
          : armed
            ? "locking"
            : "rising";
      this.world.style.setProperty("--word-breaker-overload-progress", String(progress));
    } else {
      delete this.world.dataset.overloadArmed;
      delete this.world.dataset.overloadAttacking;
      delete this.world.dataset.overloadEscalated;
      delete this.world.dataset.overloadStage;
      this.world.style.setProperty("--word-breaker-overload-progress", "0");
    }
    if (phase === "FINALE") {
      this.phaseText.textContent = "FINAL · 함께 정화하기";
    } else if (revived) {
      this.phaseText.textContent = "REVIVED · 다섯 수호알";
    } else if (recovering) {
      this.phaseText.textContent = `RECOVERY · 수호알 ${Math.min(guardians.length, collected.size + 1)}/${guardians.length}`;
    } else if (guardianReveal) {
      this.phaseText.textContent = "GUARDIAN · 다섯 알의 공명";
    } else if (knockedOut) {
      this.phaseText.textContent = "DOWN · 생명 0/5";
    } else if (staggered) {
      this.phaseText.textContent = `IMPACT · 생명 ${playerHealth}/${playerMaxHealth}`;
    } else if (phase === "OVERLOAD" && !concealedTransition) {
      this.phaseText.textContent = `${escalated ? "SURGE" : "OVERLOAD"} · ${overloadName}`;
    } else {
      this.phaseText.textContent = `ROUND ${currentRound}/${guardians.length}`;
    }
    this.guardianCount.textContent = `${collected.size} / ${guardians.length}`;
    this.purifiedCount.textContent = String(snapshot.metrics?.purifiedCount ?? 0);
    this.lifeCount.textContent = `${playerHealth} / ${playerMaxHealth}`;
    this.lifeMeter.setAttribute("aria-valuemax", String(playerMaxHealth));
    this.lifeMeter.setAttribute("aria-valuenow", String(playerHealth));
    this.lifeMeter.setAttribute("aria-valuetext", `생명 ${playerHealth}/${playerMaxHealth}`);
    this.lifeFill.style.width = `${(playerHealth / playerMaxHealth) * 100}%`;
    for (const [index, pip] of this.lifePips.entries()) {
      pip.dataset.active = String(index < playerHealth);
      pip.dataset.lost = String(index >= playerHealth);
    }
    if (phase === "PLAY" || concealedTransition) {
      this.timeLabel.textContent = "다음 붕괴";
      const transitionRemainingMs = phase === "PLAY"
        ? finite(snapshot.roundRemainingMs) + this.config.omenDurationMs + this.config.overloadGraceMs
        : omen
          ? finite(snapshot.omenRemainingMs) + this.config.overloadGraceMs
          : overloadArmed
            ? armedTransitionRemainingMs
            : finite(snapshot.overload?.graceRemainingMs);
      this.roundTime.textContent = `${Math.ceil(Math.max(0, transitionRemainingMs) / 1000)}초`;
    } else if (phase === "OVERLOAD") {
      if (escalated) {
        const escalationStage = Math.min(
          3,
          1 + Math.floor(Math.max(0, finite(snapshot.overload?.escalationElapsedMs)) / 1_200),
        );
        this.timeLabel.textContent = "공격 폭주";
        this.roundTime.textContent = `${escalationStage}단계`;
      } else {
        const overloadRemainingMs = Math.max(
          0,
          finite(snapshot.overload?.escalationAtMs) - finite(snapshot.overload?.elapsedMs),
        );
        this.timeLabel.textContent = snapshot.overload?.attacking
          ? "공격 밀도 상승"
          : snapshot.overload?.armed
            ? "오류 패턴 고정 중"
            : "오류 패턴 분석 중";
        this.roundTime.textContent = `${Math.ceil(overloadRemainingMs / 1000)}초`;
      }
    } else if (knockedOut || staggered) {
      this.timeLabel.textContent = "숨 고르기";
      this.roundTime.textContent = `${Math.ceil(Math.max(0, finite(snapshot.knockoutRemainingMs)) / 1000)}초`;
    } else if (guardianReveal) {
      this.timeLabel.textContent = "수호알 등장";
      this.roundTime.textContent = `${Math.ceil(Math.max(0, finite(snapshot.guardianRevealRemainingMs)) / 1000)}초`;
    } else if (recovering) {
      this.timeLabel.textContent = "상태";
      this.roundTime.textContent = "수호알 회복 중";
    } else if (revived) {
      this.timeLabel.textContent = "다시 이어가기";
      this.roundTime.textContent = `${Math.ceil(Math.max(0, finite(snapshot.recoveryHoldRemainingMs)) / 1000)}초`;
    } else {
      this.timeLabel.textContent = "마지막 정화";
      this.roundTime.textContent = "함께하는 중";
    }
    this.status.textContent = statusText(snapshot.status);
    this.status.dataset.tone = String(snapshot.status?.tone ?? "info");
    const elapsedMs = finite(snapshot.metrics?.elapsedMs);
    if (this.previousGuardianIds !== null) {
      const rescuedRound = this.config.rounds.findLast(({ guardian }) =>
        collected.has(guardian.id) && !this.previousGuardianIds.has(guardian.id));
      if (rescuedRound) {
        this.recoveryCaption = { round: rescuedRound, untilMs: elapsedMs + 4_500 };
      }
    }
    this.previousGuardianIds = collected;
    if (collected.size === 0 || ["COMPLETED", "DESTROYED"].includes(snapshot.state)) this.recoveryCaption = null;
    const cheerVisible = Boolean(this.recoveryCaption && elapsedMs < this.recoveryCaption.untilMs && !knockedOut && !guardianReveal);
    this.guardianCheer.textContent = cheerVisible
      ? `${this.recoveryCaption.round.guardian.label}: ${this.recoveryCaption.round.recoveryMessage}`
      : "";
    this.guardianCheer.dataset.visible = String(cheerVisible);
    this.guardianCheer.setAttribute("aria-hidden", String(!cheerVisible));
    this.guardianCheer.style.setProperty(
      "--guardian-color",
      String(this.recoveryCaption?.round.guardian.color ?? "#fdd044"),
    );

    for (const [id, slot] of this.guardianSlots) {
      const isCollected = collected.has(id);
      const guardian = guardians.find((item) => item.id === id);
      slot.dataset.collected = String(isCollected);
      slot.setAttribute(
        "aria-label",
        `${guardian?.label ?? guardian?.code ?? id}: ${isCollected ? "함께하는 중" : "아직 만나지 못함"}`,
      );
    }

    this.#renderPhrases(snapshot.phrases);
    this.#renderOverloadGlyphs(snapshot.overloadGlyphs);
    this.#renderShots(snapshot.shots);
    this.#renderGuardian(snapshot.guardian);
    this.revivalGuardians.dataset.visible = String(finalRevival);
    this.revivalGuardians.setAttribute("aria-hidden", String(!finalRevival));
    for (const [index, egg] of this.revivalGuardianElements.entries()) {
      egg.dataset.active = String(index < collected.size);
    }
    const finalePhrase = phase === "FINALE" ? snapshot.phrases?.[0] : null;
    const finaleStep = finalePhrase
      ? Math.max(0, Math.round(finite(finalePhrase.maxHp) - finite(finalePhrase.hp)))
      : 0;
    for (const [index, egg] of this.finaleGuardianElements.entries()) {
      egg.dataset.active = String(index < finaleStep);
    }
    const allLit = finaleStep >= guardians.length;
    this.finaleOverlay.dataset.allLit = String(allLit);
    this.finaleReframe.dataset.visible = String(allLit && finite(snapshot.finaleRemainingMs) <= this.config.finaleDurationMs * 0.04);

    this.finaleOverlay.dataset.visible = String(phase === "FINALE");
    this.finaleOverlay.setAttribute("aria-hidden", String(phase !== "FINALE"));

    this.playerActor.dataset.staggered = String(staggered);
    this.playerActor.dataset.knockedOut = String(knockedOut || guardianReveal);
    this.playerActor.dataset.recovering = String(recovering);
    this.playerActor.dataset.revived = String(revived);
    this.playerActor.dataset.controlLocked = String(controlsLocked);
    this.playerActor.dataset.invulnerable = String(finite(snapshot.invulnerableRemainingMs) > 0);
    if (characterSnapshot) this.characterView.render(characterSnapshot);
  }

  destroy() {
    this.onGuardianContinue = () => {};
    this.storyPreviousFocus = null;
    this.hitAnimation?.cancel?.();
    this.element?.remove();
    this.element = null;
    this.phraseGlyphElements.clear();
    this.phraseReframeElements.clear();
    this.overloadGlyphElements.clear();
    this.shotElements.clear();
    this.guardianSlots.clear();
    this.guardianElement = null;
  }

  showEiaiCaption(text) {
    if (!this.eiaiCaption) return;
    this.eiaiCaption.textContent = text ? `이아이: ${text}` : "";
    this.eiaiCaption.hidden = !text;
    if (text) this.eiai?.animate?.([
      { filter: "drop-shadow(0 0 0px #342038)" },
      { filter: "drop-shadow(0 0 24px #251129)" },
      { filter: "drop-shadow(0 0 0px #342038)" },
    ], { duration: 950, easing: "ease-out" });
  }

  #createPhraseGlyphNode(glyph) {
    return this.createElement("span", {
      className: "word-breaker-glyph",
      text: glyph.text,
      attributes: { "aria-hidden": "true" },
    });
  }

  #renderPhrases(phrases = []) {
    const activeGlyphs = new Set();
    const activeReframes = new Set();
    for (const phrase of Array.isArray(phrases) ? phrases : []) {
      const tone = String(phrase.tone ?? "negative");
      for (const glyph of Array.isArray(phrase.glyphs) ? phrase.glyphs : []) {
        activeGlyphs.add(glyph.id);
        let node = this.phraseGlyphElements.get(glyph.id);
        if (!node) {
          node = this.#createPhraseGlyphNode(glyph);
          this.phraseLayer.append(node);
          this.phraseGlyphElements.set(glyph.id, node);
        }
        node.textContent = String(glyph.text ?? "");
        positionRect(node, glyph, this.arena);
        const maxHp = Math.max(0, finite(glyph.maxHp));
        const hp = Math.max(0, Math.min(maxHp, finite(glyph.hp, maxHp)));
        node.dataset.phraseId = String(phrase.id);
        node.dataset.collidable = String(glyph.collidable !== false);
        node.dataset.attackable = String(glyph.attackable !== false && glyph.collidable !== false);
        node.dataset.target = String(glyph.isTarget === true);
        node.dataset.broken = String(glyph.broken === true);
        node.dataset.damaged = String(maxHp > 0 && hp < maxHp && !glyph.broken);
        node.dataset.tone = tone;
      }

      if (tone === "reframed") {
        activeReframes.add(phrase.id);
        let reframe = this.phraseReframeElements.get(phrase.id);
        if (!reframe) {
          reframe = this.createElement("p", {
            className: "word-breaker-reframe",
            attributes: { "aria-hidden": "true" },
          });
          this.phraseLayer.append(reframe);
          this.phraseReframeElements.set(phrase.id, reframe);
        }
        reframe.textContent = String(phrase.reframe ?? "");
        positionRect(reframe, phrase, this.arena);
      }
    }
    for (const [id, node] of this.phraseGlyphElements) {
      if (activeGlyphs.has(id)) continue;
      node.remove();
      this.phraseGlyphElements.delete(id);
    }
    for (const [id, node] of this.phraseReframeElements) {
      if (activeReframes.has(id)) continue;
      node.remove();
      this.phraseReframeElements.delete(id);
    }
  }

  #renderOverloadGlyphs(glyphs = []) {
    const active = new Set();
    for (const glyph of Array.isArray(glyphs) ? glyphs : []) {
      active.add(glyph.id);
      let node = this.overloadGlyphElements.get(glyph.id);
      if (!node) {
        node = this.createElement("span", {
          className: "word-breaker-overload-glyph",
          attributes: { "aria-hidden": "true" },
        });
        this.overloadLayer.append(node);
        this.overloadGlyphElements.set(glyph.id, node);
      }
      node.textContent = String(glyph.text ?? "");
      positionRect(node, glyph, this.arena);
      node.dataset.pattern = String(glyph.pattern ?? "unknown");
      node.dataset.wave = String(Math.max(0, Math.trunc(finite(glyph.waveIndex))));
      node.dataset.stage = String(Math.max(0, Math.trunc(finite(glyph.stage))));
      node.dataset.variant = String(glyph.variant ?? "default");
      if (glyph.badge) node.dataset.badge = String(glyph.badge);
      else delete node.dataset.badge;
      node.dataset.telegraphing = String(glyph.telegraphing === true);
      node.dataset.active = String(glyph.telegraphing !== true && glyph.contacted !== true);
      node.dataset.surge = String(glyph.surge === true);
      node.dataset.unavoidable = String(glyph.unavoidable === true);
      node.dataset.attackable = String(glyph.attackable !== false);
      node.dataset.broken = String(glyph.broken === true);
      node.dataset.damaged = String(
        finite(glyph.maxHp) > 0
        && finite(glyph.hp, glyph.maxHp) < finite(glyph.maxHp)
        && glyph.broken !== true
      );
      node.dataset.contacted = String(glyph.contacted === true);
      node.style.setProperty("--word-breaker-overload-color", String(glyph.color ?? "#d82f76"));
    }
    for (const [id, node] of this.overloadGlyphElements) {
      if (active.has(id)) continue;
      node.remove();
      this.overloadGlyphElements.delete(id);
    }
  }

  #renderShots(shots = []) {
    const active = new Set();
    for (const shot of Array.isArray(shots) ? shots : []) {
      active.add(shot.id);
      let node = this.shotElements.get(shot.id);
      if (!node) {
        node = this.createElement("span", {
          className: "word-breaker-shot",
          attributes: { "aria-hidden": "true" },
        });
        this.shotLayer.append(node);
        this.shotElements.set(shot.id, node);
      }
      positionRect(node, shot, this.arena);
      node.dataset.targetSide = String(shot.targetSide ?? "center");
    }
    for (const [id, node] of this.shotElements) {
      if (active.has(id)) continue;
      node.remove();
      this.shotElements.delete(id);
    }
  }

  #renderGuardian(guardian) {
    if (!guardian) {
      this.guardianElement?.remove();
      this.guardianElement = null;
      return;
    }
    if (!this.guardianElement || this.guardianElement.dataset.guardianId !== guardian.id) {
      this.guardianElement?.remove();
      const configuredGuardian = this.guardians.find(({ id }) => id === guardian.id) ?? guardian;
      this.guardianElement = this.createElement("div", {
        className: "word-breaker-guardian",
        dataset: { guardianId: guardian.id },
        attributes: { role: "img", "aria-label": `${guardian.label ?? guardian.code} 수호알` },
      }, [
        createGuardianArt(this.createElement, configuredGuardian),
      ]);
      this.world.append(this.guardianElement);
    }
    const configuredGuardian = this.guardians.find(({ id }) => id === guardian.id) ?? guardian;
    this.guardianElement.style.setProperty("--guardian-color", String(configuredGuardian.color ?? "#fcb5dd"));
    this.guardianElement.style.setProperty("--guardian-ink-color", String(configuredGuardian.inkColor ?? "#501060"));
    positionRect(this.guardianElement, guardian, this.arena);
  }

  #buildDom() {
    const element = this.createElement;
    const guardians = this.guardians;
    this.phaseText = element("strong", { className: "word-breaker-phase", text: "READY" });
    this.guardianCount = element("output", { text: `0 / ${guardians.length}` });
    this.purifiedCount = element("output", { text: "0" });
    this.lifeCount = element("output", { className: "word-breaker-life-count", text: `${guardians.length} / ${guardians.length}` });
    this.lifePips = guardians.map(() => element("span", {
      className: "word-breaker-life-pip",
      text: "♥",
      dataset: { active: "true", lost: "false" },
      attributes: { "aria-hidden": "true" },
    }));
    this.lifeFill = element("span", {
      className: "word-breaker-life-fill",
      attributes: { "aria-hidden": "true" },
    });
    this.lifeMeter = element("div", {
      className: "word-breaker-life-meter",
      attributes: {
        role: "progressbar",
        "aria-label": "플레이어 생명",
        "aria-valuemin": "0",
        "aria-valuemax": String(guardians.length),
        "aria-valuenow": String(guardians.length),
      },
    }, [this.lifeFill, ...this.lifePips]);
    this.vitality = element("div", { className: "word-breaker-vitality" }, [
      this.lifeMeter,
    ]);
    this.roundTime = element("output", { text: "준비" });
    this.timeLabel = element("dt", { text: "다음 붕괴" });
    const stats = element("dl", { className: "word-breaker-stats" }, [
      element("div", {}, [element("dt", { text: "수호알" }), element("dd", {}, [this.guardianCount])]),
      element("div", {}, [element("dt", { text: "정화" }), element("dd", {}, [this.purifiedCount])]),
      element("div", {}, [this.timeLabel, element("dd", {}, [this.roundTime])]),
    ]);

    const guardianList = element("div", {
      className: "word-breaker-guardian-list",
      attributes: { role: "list", "aria-label": "모은 수호알" },
    });
    for (const guardian of guardians) {
      const slot = element("span", {
        className: "word-breaker-guardian-chip",
        dataset: { collected: "false" },
        attributes: {
          role: "listitem",
          title: guardian.label ?? guardian.code,
          "aria-label": `${guardian.label ?? guardian.code}: 아직 만나지 못함`,
        },
      }, [createGuardianArt(element, guardian)]);
      slot.style.setProperty("--guardian-color", String(guardian.color ?? "#fcb5dd"));
      slot.style.setProperty("--guardian-ink-color", String(guardian.inkColor ?? "#501060"));
      guardianList.append(slot);
      this.guardianSlots.set(guardian.id, slot);
    }
    this.status = element("p", {
      className: "word-breaker-status",
      text: "움직이며 핵심 단어를 정화하세요.",
      dataset: { tone: "info" },
      attributes: { "aria-live": "polite" },
    });
    this.guardianCheer = element("p", {
      className: "word-breaker-guardian-cheer",
      dataset: { visible: "false" },
      attributes: { "aria-hidden": "true", "aria-live": "polite" },
    });
    const header = element("header", { className: "word-breaker-hud" }, [
      element("img", { className: "word-breaker-lock", attributes: { src: "./assets/images/flower-lock.png", alt: "꽃잎 자물쇠", draggable: "false" } }),
      guardianList,
    ]);

    const grid = element("span", { className: "word-breaker-world__grid", attributes: { "aria-hidden": "true" } });
    this.eiai = element("div", {
      className: "word-breaker-eiai",
      dataset: { burstText: "" },
      attributes: { "aria-hidden": "true" },
    }, [
      this.#createEiaiSprite(),
      element("strong", { text: "이아이" }),
    ]);
    this.phraseLayer = element("div", { className: "word-breaker-phrases", attributes: { "aria-hidden": "true" } });
    this.overloadLayer = element("div", {
      className: "word-breaker-overload-glyphs",
      attributes: { "aria-hidden": "true" },
    });
    this.shotLayer = element("div", { className: "word-breaker-shots", attributes: { "aria-hidden": "true" } });
    this.revivalGuardianElements = guardians.map((guardian) => {
      const egg = element("span", { dataset: { active: "false" } }, [
        createGuardianArt(element, guardian),
      ]);
      egg.style.setProperty("--guardian-color", String(guardian.color ?? "#fcb5dd"));
      egg.style.setProperty("--guardian-ink-color", String(guardian.inkColor ?? "#501060"));
      return egg;
    });
    this.revivalGuardians = element("div", {
      className: "word-breaker-revival-guardians",
      dataset: { visible: "false" },
      attributes: { "aria-hidden": "true" },
    }, this.revivalGuardianElements);
    this.finaleGuardianElements = guardians.map((guardian) => {
      const egg = element("span", { dataset: { active: "false" } }, [
        createGuardianArt(element, guardian),
      ]);
      egg.style.setProperty("--guardian-color", String(guardian.color ?? "#fcb5dd"));
      egg.style.setProperty("--guardian-ink-color", String(guardian.inkColor ?? "#501060"));
      return egg;
    });
    const finaleGuardians = element(
      "div",
      { className: "word-breaker-finale__guardians", attributes: { "aria-hidden": "true" } },
      [...this.finaleGuardianElements, element("div", { className: "word-breaker-finale__eiai" }, [
        this.#createEiaiSprite(),
        element("strong", { text: "이아이" }),
      ])],
    );
    this.finaleReframe = element("strong", {
      className: "word-breaker-finale__reframe",
      text: this.config.finalPhrase.reframe,
      dataset: { visible: "false" },
    });
    const negativeLine = element("p");
    const targetStart = this.config.finalPhrase.negative.indexOf(this.config.finalPhrase.target);
    negativeLine.append(
      element("span", { text: this.config.finalPhrase.negative.slice(0, targetStart) }),
      element("span", { className: "word-breaker-finale__target", text: this.config.finalPhrase.target }),
      element("span", { text: this.config.finalPhrase.negative.slice(targetStart + this.config.finalPhrase.target.length) }),
    );
    this.finaleOverlay = element("div", {
      className: "word-breaker-finale",
      dataset: { visible: "false" },
      attributes: { "aria-hidden": "true" },
    }, [
      negativeLine,
      finaleGuardians,
      this.finaleReframe,
    ]);
    this.playerActor = createCharacterActorElement({ document: this.document, local: true });
    this.eiaiCaption = element("p", { className: "eiai-battle-caption", attributes: { role: "status", "aria-live": "polite" } });
    this.eiaiCaption.hidden = true;
    this.playerActor.dataset.characterId = this.localPlayerId;
    this.characterView = new CharacterView({ element: this.playerActor, worldSize: this.arena });
    this.world = element("div", {
      className: "word-breaker-world",
      attributes: { role: "application", tabindex: "-1", "aria-label": "마음의 말 깨부수기 전투 필드" },
    }, [
      grid,
      this.eiai,
      this.eiaiCaption,
      this.phraseLayer,
      this.overloadLayer,
      this.shotLayer,
      this.revivalGuardians,
      this.finaleOverlay,
      this.playerActor,
      this.guardianCheer,
    ]);

    this.joystickKnob = element("span", { className: "character-joystick__knob", attributes: { "aria-hidden": "true" } });
    this.joystickBase = element("div", {
      className: "character-joystick word-breaker-joystick",
      attributes: { role: "group", "aria-label": "플레이어 이동 조이스틱" },
    }, [this.joystickKnob, element("span", { className: "character-joystick__label", text: "MOVE" })]);
    const touchControls = element("div", {
      className: "character-touch-controls word-breaker-touch-controls",
      attributes: { "aria-label": "모바일 조작" },
    }, [this.joystickBase]);

    this.guardianStoryProgress = element("p", { className: "guardian-story__progress" });
    this.guardianStoryImage = element("img", { className: "guardian-story__egg", attributes: { alt: "", width: "1254", height: "1254", draggable: "false" } });
    this.guardianStoryTitle = element("h2", { className: "guardian-story__title" });
    this.guardianStoryDepartment = element("p", { className: "guardian-story__department" });
    this.guardianStoryMemory = element("p", { className: "guardian-story__memory" });
    this.guardianStoryVoice = element("blockquote", { className: "guardian-story__voice" });
    this.guardianStoryBridge = element("p", { className: "guardian-story__bridge" });
    this.guardianStoryContinue = element("button", { className: "button button--primary guardian-story__continue", attributes: { type: "button" } });
    this.guardianStoryContinue.addEventListener("click", () => this.onGuardianContinue());
    this.guardianStory = element("section", {
      className: "guardian-story", dataset: { visible: "false", final: "false" },
      attributes: { role: "dialog", "aria-modal": "true", "aria-label": "수호알이 전하는 응원", "aria-hidden": "true" },
    }, [element("div", { className: "guardian-story__panel" }, [
      this.guardianStoryProgress,
      element("div", { className: "guardian-story__light", attributes: { "aria-hidden": "true" } }, [this.guardianStoryImage]),
      this.guardianStoryDepartment, this.guardianStoryTitle, this.guardianStoryMemory,
      this.guardianStoryVoice, this.guardianStoryBridge,
      element("div", { className: "guardian-story__all", attributes: { "aria-hidden": "true" } }, guardians.map(guardian => createGuardianArt(element, guardian))),
      this.guardianStoryContinue,
      element("p", { className: "guardian-story__hint", text: "클릭·터치 또는 Enter·스페이스바로 계속" }),
    ])]);
    this.guardianStory.addEventListener("keydown", event => {
      if (this.guardianStory.dataset.visible !== "true") return;
      if (["Escape", "KeyP"].includes(event.code)) return;
      // Keep movement/confirmation keys out of the battle input while reading.
      event.stopPropagation();
      if (["Space", "Enter", "KeyE"].includes(event.code)) {
        event.preventDefault();
        if (!event.repeat) this.onGuardianContinue();
      } else if (event.key === "Tab") {
        event.preventDefault(); this.guardianStoryContinue.focus?.();
      }
    });

    return element("section", { className: "word-breaker-stage character-stage" }, [
      this.vitality,
      header,
      this.world,
      touchControls,
      this.guardianStory,
    ]);
  }
}

export default WordBreakerView;

import {
  CharacterView,
  createCharacterActorElement,
} from "../../../character/character-view.js";

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

function statusText(status) {
  if (typeof status === "string") return status;
  return typeof status?.text === "string" ? status.text : "READY";
}

export class WordBreakerView {
  constructor({ config, localPlayerId = "player-1", document: documentRef = globalThis.document } = {}) {
    if (!config?.arena) throw new Error("WordBreakerView requires normalized config.");
    this.config = config;
    this.arena = config.arena;
    this.guardians = config.rounds.map(({ guardian }) => guardian);
    this.localPlayerId = localPlayerId;
    this.document = documentRef;
    this.createElement = createElementFactory(documentRef);
    this.phraseGlyphElements = new Map();
    this.phraseReframeElements = new Map();
    this.overloadGlyphElements = new Map();
    this.shotElements = new Map();
    this.guardianElement = null;
    this.guardianSlots = new Map();
    this.element = this.#buildDom();
  }

  mount(parent) {
    if (!parent?.append) throw new Error("WordBreakerView.mount(parent) requires a DOM parent.");
    parent.append(this.element);
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

    this.element.dataset.state = String(snapshot.state ?? "READY");
    this.element.dataset.controlLocked = String(controlsLocked);
    this.world.dataset.phase = concealedTransition ? "PLAY" : phase;
    this.world.dataset.controlLocked = String(controlsLocked);
    this.world.dataset.collapseBurst = String(collapseBursting);
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
      this.phaseText.textContent = `RECOVERED · ${collected.size}/${guardians.length}`;
    } else if (recovering) {
      this.phaseText.textContent = `RECOVERY · 수호알 ${Math.min(guardians.length, collected.size + 1)}/${guardians.length}`;
    } else if (guardianReveal) {
      this.phaseText.textContent = `GUARDIAN · ${guardians[Math.max(0, finite(snapshot.roundIndex))]?.code ?? "EGG"}`;
    } else if (knockedOut) {
      this.phaseText.textContent = "DOWN · 잠시 멈춤";
    } else if (phase === "OVERLOAD" && !concealedTransition) {
      this.phaseText.textContent = `${escalated ? "SURGE" : "OVERLOAD"} · ${overloadName}`;
    } else {
      this.phaseText.textContent = `ROUND ${currentRound}/${guardians.length}`;
    }
    this.guardianCount.textContent = `${collected.size} / ${guardians.length}`;
    this.purifiedCount.textContent = String(snapshot.metrics?.purifiedCount ?? 0);
    this.hitCount.textContent = String(snapshot.metrics?.hitCount ?? 0);
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
    } else if (knockedOut) {
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
    const cheerVisible = revived && Boolean(snapshot.guardian);
    this.guardianCheer.textContent = cheerVisible
      ? `${snapshot.guardian.code} · “${statusText(snapshot.status)}”`
      : "";
    this.guardianCheer.dataset.visible = String(cheerVisible);
    this.guardianCheer.setAttribute("aria-hidden", String(!cheerVisible));
    this.guardianCheer.style.setProperty(
      "--guardian-color",
      String(snapshot.guardian?.color ?? "#d82f76"),
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
    const finalePhrase = phase === "FINALE" ? snapshot.phrases?.[0] : null;
    const finaleStep = finalePhrase
      ? Math.max(0, Math.round(finite(finalePhrase.maxHp) - finite(finalePhrase.hp)))
      : 0;
    for (const [index, egg] of this.finaleGuardianElements.entries()) {
      egg.dataset.active = String(index < finaleStep);
    }
    this.finaleReframe.dataset.visible = String(finaleStep >= Math.max(1, guardians.length - 1));

    this.finaleOverlay.dataset.visible = String(phase === "FINALE");
    this.finaleOverlay.setAttribute("aria-hidden", String(phase !== "FINALE"));

    this.playerActor.dataset.knockedOut = String(knockedOut || guardianReveal);
    this.playerActor.dataset.recovering = String(recovering);
    this.playerActor.dataset.revived = String(revived);
    this.playerActor.dataset.controlLocked = String(controlsLocked);
    this.playerActor.dataset.invulnerable = String(finite(snapshot.invulnerableRemainingMs) > 0);
    if (characterSnapshot) this.characterView.render(characterSnapshot);
  }

  destroy() {
    this.element?.remove();
    this.element = null;
    this.phraseGlyphElements.clear();
    this.phraseReframeElements.clear();
    this.overloadGlyphElements.clear();
    this.shotElements.clear();
    this.guardianSlots.clear();
    this.guardianElement = null;
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
      this.guardianElement = this.createElement("div", {
        className: "word-breaker-guardian",
        dataset: { guardianId: guardian.id },
        attributes: { role: "img", "aria-label": `${guardian.label ?? guardian.code} 수호알` },
      }, [
        this.createElement("span", { className: "word-breaker-guardian__shine", attributes: { "aria-hidden": "true" } }),
        this.createElement("strong", { className: "word-breaker-guardian__code", text: guardian.code }),
      ]);
      this.world.append(this.guardianElement);
    }
    this.guardianElement.style.setProperty("--guardian-color", String(guardian.color ?? "#d82f76"));
    positionRect(this.guardianElement, guardian, this.arena);
  }

  #buildDom() {
    const element = this.createElement;
    const guardians = this.guardians;
    this.phaseText = element("strong", { className: "word-breaker-phase", text: "READY" });
    this.guardianCount = element("output", { text: `0 / ${guardians.length}` });
    this.purifiedCount = element("output", { text: "0" });
    this.hitCount = element("output", { text: "0" });
    this.roundTime = element("output", { text: "준비" });
    this.timeLabel = element("dt", { text: "다음 붕괴" });
    const stats = element("dl", { className: "word-breaker-stats" }, [
      element("div", {}, [element("dt", { text: "수호알" }), element("dd", {}, [this.guardianCount])]),
      element("div", {}, [element("dt", { text: "정화" }), element("dd", {}, [this.purifiedCount])]),
      element("div", {}, [element("dt", { text: "흔들림" }), element("dd", {}, [this.hitCount])]),
      element("div", {}, [this.timeLabel, element("dd", {}, [this.roundTime])]),
    ]);

    const guardianList = element("div", {
      className: "word-breaker-guardian-list",
      attributes: { role: "list", "aria-label": "모은 수호알" },
    });
    for (const guardian of guardians) {
      const slot = element("span", {
        className: "word-breaker-guardian-chip",
        text: guardian.code,
        dataset: { collected: "false" },
        attributes: {
          role: "listitem",
          title: guardian.label ?? guardian.code,
          "aria-label": `${guardian.label ?? guardian.code}: 아직 만나지 못함`,
        },
      });
      slot.style.setProperty("--guardian-color", String(guardian.color ?? "#d82f76"));
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
      attributes: { "aria-hidden": "true" },
    });
    const header = element("header", { className: "word-breaker-hud" }, [
      element("p", { className: "word-breaker-eyebrow", text: "FINAL BATTLE · 다시 이어가는 마음" }),
      element("h2", { className: "word-breaker-title", text: "마음의 말 깨부수기" }),
      this.phaseText,
      stats,
      guardianList,
      this.status,
      element("p", {
        className: "word-breaker-help",
        text: "빛은 자동으로 발사됩니다. 떨어지는 글자 사이를 움직이고, 마음이 멈춘 뒤에는 수호알을 만나 다시 이어가세요.",
      }),
    ]);

    const grid = element("span", { className: "word-breaker-world__grid", attributes: { "aria-hidden": "true" } });
    this.eiai = element("div", {
      className: "word-breaker-eiai",
      dataset: { burstText: "" },
      attributes: { "aria-hidden": "true" },
    }, [
      element("span", { className: "word-breaker-eiai__face", text: "AI" }),
      element("strong", { text: "이아이" }),
    ]);
    this.phraseLayer = element("div", { className: "word-breaker-phrases", attributes: { "aria-hidden": "true" } });
    this.overloadLayer = element("div", {
      className: "word-breaker-overload-glyphs",
      attributes: { "aria-hidden": "true" },
    });
    this.shotLayer = element("div", { className: "word-breaker-shots", attributes: { "aria-hidden": "true" } });
    this.finaleGuardianElements = guardians.map((guardian) => {
      const egg = element("span", { text: guardian.code, dataset: { active: "false" } });
      egg.style.setProperty("--guardian-color", String(guardian.color ?? "#d82f76"));
      return egg;
    });
    const finaleGuardians = element(
      "div",
      { className: "word-breaker-finale__guardians", attributes: { "aria-hidden": "true" } },
      this.finaleGuardianElements,
    );
    this.finaleReframe = element("strong", {
      className: "word-breaker-finale__reframe",
      text: this.config.finalPhrase.reframe,
      dataset: { visible: "false" },
    });
    this.finaleOverlay = element("div", {
      className: "word-breaker-finale",
      dataset: { visible: "false" },
      attributes: { "aria-hidden": "true" },
    }, [
      element("p", { text: this.config.finalPhrase.negative }),
      finaleGuardians,
      this.finaleReframe,
    ]);
    this.playerActor = createCharacterActorElement({ document: this.document, local: true });
    this.playerActor.dataset.characterId = this.localPlayerId;
    this.characterView = new CharacterView({ element: this.playerActor, worldSize: this.arena });
    this.world = element("div", {
      className: "word-breaker-world",
      attributes: { role: "application", "aria-label": "마음의 말 깨부수기 전투 필드" },
    }, [
      grid,
      this.eiai,
      this.phraseLayer,
      this.overloadLayer,
      this.shotLayer,
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

    return element("section", { className: "word-breaker-stage character-stage" }, [
      header,
      this.world,
      touchControls,
    ]);
  }
}

export default WordBreakerView;

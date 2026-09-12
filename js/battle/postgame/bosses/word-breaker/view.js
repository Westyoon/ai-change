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

function positionPhraseTarget(node, phrase, horizontalPadding) {
  const phraseWidth = Math.max(1, finite(phrase?.width, 1));
  const phraseHeight = Math.max(1, finite(phrase?.height, 1));
  const target = phrase?.targetBounds;
  if (!target) return;

  const contentPadding = Math.max(0, Math.min(phraseWidth / 2, finite(horizontalPadding)));
  node.style.setProperty("--word-breaker-content-left", percent(contentPadding, phraseWidth));
  node.style.setProperty("--word-breaker-content-right", percent(contentPadding, phraseWidth));
  node.style.setProperty(
    "--word-breaker-target-left",
    percent(finite(target.x) - finite(phrase.x), phraseWidth),
  );
  node.style.setProperty(
    "--word-breaker-target-top",
    percent(finite(target.y) - finite(phrase.y), phraseHeight),
  );
  node.style.setProperty("--word-breaker-target-width", percent(target.width, phraseWidth));
  node.style.setProperty("--word-breaker-target-height", percent(target.height, phraseHeight));
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

function splitTarget(negative, target) {
  const text = String(negative ?? "");
  const needle = String(target ?? "");
  const index = needle ? text.indexOf(needle) : -1;
  if (index < 0) return { before: text, target: "", after: "" };
  return {
    before: text.slice(0, index),
    target: needle,
    after: text.slice(index + needle.length),
  };
}

function statusText(status) {
  if (typeof status === "string") return status;
  return typeof status?.text === "string" ? status.text : "마음의 말을 마주하고 있습니다.";
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
    this.phraseElements = new Map();
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

    this.element.dataset.state = String(snapshot.state ?? "READY");
    this.world.dataset.phase = phase;
    this.phaseText.textContent = phase === "FINALE"
      ? "FINAL · 함께 정화하기"
      : phase === "RECOVERING"
        ? `RECOVERY · 수호알 ${collected.size + 1}/${guardians.length}`
        : `ROUND ${currentRound}/${guardians.length}`;
    this.guardianCount.textContent = `${collected.size} / ${guardians.length}`;
    this.purifiedCount.textContent = String(snapshot.metrics?.purifiedCount ?? 0);
    this.hitCount.textContent = String(snapshot.metrics?.hitCount ?? 0);
    this.roundTime.textContent = phase === "PLAY"
      ? `${Math.ceil(Math.max(0, finite(snapshot.roundRemainingMs)) / 1000)}초`
      : phase === "FINALE"
        ? "함께하는 중"
        : "다시 일어나는 중";
    this.status.textContent = statusText(snapshot.status);
    this.status.dataset.tone = String(snapshot.status?.tone ?? "info");

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

    const recovering = phase === "RECOVERING";
    this.recoveryOverlay.dataset.visible = String(recovering);
    this.finaleOverlay.dataset.visible = String(phase === "FINALE");
    this.recoveryOverlay.setAttribute("aria-hidden", String(!recovering));
    this.finaleOverlay.setAttribute("aria-hidden", String(phase !== "FINALE"));
    if (recovering) {
      const round = this.config.rounds[Math.max(0, finite(snapshot.roundIndex))];
      this.collapseText.textContent = round?.collapseMessage
        ?? "피할 수 없는 말에 마음이 잠시 멈췄습니다.";
      this.recoveryText.textContent = round?.recoveryMessage
        ?? "수호알에게 다가가 다시 이어가세요.";
    }

    if (characterSnapshot) {
      this.characterView.render(characterSnapshot);
      this.playerActor.dataset.recovering = String(recovering);
      this.playerActor.dataset.invulnerable = String(finite(snapshot.invulnerableRemainingMs) > 0);
    }
  }

  destroy() {
    this.element?.remove();
    this.element = null;
    this.phraseElements.clear();
    this.shotElements.clear();
    this.guardianSlots.clear();
    this.guardianElement = null;
  }

  #createPhraseNode(phrase) {
    const element = this.createElement;
    const parts = splitTarget(phrase.negative, phrase.target);
    const line = element("p", { className: "word-breaker-phrase__text" }, [
      element("span", { className: "word-breaker-phrase__before", text: parts.before }),
      element("mark", { className: "word-breaker-phrase__target", text: parts.target }),
      element("span", { className: "word-breaker-phrase__after", text: parts.after }),
    ]);
    const fill = element("span", { className: "word-breaker-phrase__hp-fill", attributes: { "aria-hidden": "true" } });
    const hp = element("span", {
      className: "word-breaker-phrase__hp",
      attributes: { "aria-hidden": "true" },
    }, [fill]);
    const node = element("article", { className: "word-breaker-phrase" }, [line, hp]);
    node._wordBreakerLine = line;
    node._wordBreakerHp = hp;
    node._wordBreakerFill = fill;
    return node;
  }

  #renderPhrases(phrases = []) {
    const active = new Set();
    for (const phrase of Array.isArray(phrases) ? phrases : []) {
      active.add(phrase.id);
      let node = this.phraseElements.get(phrase.id);
      if (!node) {
        node = this.#createPhraseNode(phrase);
        this.phraseLayer.append(node);
        this.phraseElements.set(phrase.id, node);
      }
      positionRect(node, phrase, this.arena);
      positionPhraseTarget(node, phrase, this.config.phrase.horizontalPadding);
      const maxHp = Math.max(1, finite(phrase.maxHp, 1));
      const hp = Math.max(0, Math.min(maxHp, finite(phrase.hp, maxHp)));
      node._wordBreakerFill.style.width = `${(hp / maxHp) * 100}%`;
      node._wordBreakerHp.setAttribute("aria-valuemax", String(maxHp));
      node._wordBreakerHp.setAttribute("aria-valuenow", String(hp));
      node.dataset.tone = String(phrase.tone ?? "negative");
      if (phrase.tone === "reframed" && node._wordBreakerTone !== "reframed") {
        node._wordBreakerLine.textContent = phrase.reframe;
      }
      node._wordBreakerTone = String(phrase.tone ?? "negative");
    }
    for (const [id, node] of this.phraseElements) {
      if (active.has(id)) continue;
      node.remove();
      this.phraseElements.delete(id);
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
    const stats = element("dl", { className: "word-breaker-stats" }, [
      element("div", {}, [element("dt", { text: "수호알" }), element("dd", {}, [this.guardianCount])]),
      element("div", {}, [element("dt", { text: "정화" }), element("dd", {}, [this.purifiedCount])]),
      element("div", {}, [element("dt", { text: "흔들림" }), element("dd", {}, [this.hitCount])]),
      element("div", {}, [element("dt", { text: "다음 붕괴" }), element("dd", {}, [this.roundTime])]),
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
    const header = element("header", { className: "word-breaker-hud" }, [
      element("p", { className: "word-breaker-eyebrow", text: "FINAL BATTLE · 다시 이어가는 마음" }),
      element("h2", { className: "word-breaker-title", text: "마음의 말 깨부수기" }),
      this.phaseText,
      stats,
      guardianList,
      this.status,
      element("p", {
        className: "word-breaker-help",
        text: "자동으로 빛을 발사합니다. 움직여 문장을 피하고, 멈춘 순간에는 수호알에게 다가가세요.",
      }),
    ]);

    const grid = element("span", { className: "word-breaker-world__grid", attributes: { "aria-hidden": "true" } });
    const eiai = element("div", { className: "word-breaker-eiai", attributes: { "aria-hidden": "true" } }, [
      element("span", { className: "word-breaker-eiai__face", text: "AI" }),
      element("strong", { text: "이아이" }),
    ]);
    this.phraseLayer = element("div", { className: "word-breaker-phrases", attributes: { "aria-hidden": "true" } });
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
    this.collapseText = element("strong", { className: "word-breaker-recovery__collapse" });
    this.recoveryText = element("span", { className: "word-breaker-recovery__guide" });
    this.recoveryOverlay = element("div", {
      className: "word-breaker-recovery",
      dataset: { visible: "false" },
      attributes: { "aria-hidden": "true", "aria-live": "assertive" },
    }, [this.collapseText, this.recoveryText]);
    this.playerActor = createCharacterActorElement({ document: this.document, local: true });
    this.playerActor.dataset.characterId = this.localPlayerId;
    this.characterView = new CharacterView({ element: this.playerActor, worldSize: this.arena });
    this.world = element("div", {
      className: "word-breaker-world",
      attributes: { role: "application", "aria-label": "마음의 말 깨부수기 전투 필드" },
    }, [grid, eiai, this.phraseLayer, this.shotLayer, this.finaleOverlay, this.playerActor, this.recoveryOverlay]);

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

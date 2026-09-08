import { CharacterView, createCharacterActorElement } from "../../../character/index.js";
import { DATA_SPHINX_SELECTIONS } from "./config.js";

function createElement(documentRef, tagName, options = {}, children = []) {
  const element = documentRef.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    element.dataset[name] = String(value);
  }
  element.append(...children.filter(Boolean));
  return element;
}

function ratio(current, maximum) {
  const max = Math.max(1, Number(maximum) || 1);
  return Math.max(0, Math.min(1, (Number(current) || 0) / max));
}

function selectionLabel(selection) {
  if (selection === DATA_SPHINX_SELECTIONS.O) return "O 영역 선택";
  if (selection === DATA_SPHINX_SELECTIONS.X) return "X 영역 선택";
  return "중앙 · 미선택";
}

export class DataSphinxView {
  constructor({ arena, documentRef = globalThis.document } = {}) {
    if (!documentRef?.createElement) throw new Error("DataSphinxView requires a document.");
    this.arena = arena;
    this.document = documentRef;
    this.root = this._build();
    this.playerView = new CharacterView({
      element: this.playerActor,
      worldSize: arena,
      healthTrack: this.playerHealthTrack,
      healthFill: this.playerHealthFill,
      healthText: this.playerHealthText,
      stateText: this.playerStateText,
    });
  }

  mount(parent) {
    parent.append(this.root);
  }

  render(snapshot, playerSnapshot) {
    if (!snapshot) return;
    this.root.dataset.state = snapshot.state;
    this.root.dataset.phase = snapshot.phase;
    this.arenaElement.dataset.selection = snapshot.playerLocation;
    this.zoneO.dataset.selected = String(snapshot.playerLocation === DATA_SPHINX_SELECTIONS.O);
    this.zoneX.dataset.selected = String(snapshot.playerLocation === DATA_SPHINX_SELECTIONS.X);

    const bossRatio = ratio(snapshot.bossHealth, snapshot.bossMaxHealth);
    this.bossHealthFill.style.width = `${bossRatio * 100}%`;
    this.bossHealthText.textContent = `${Math.round(snapshot.bossHealth)} / ${Math.round(snapshot.bossMaxHealth)}`;
    this.bossHealthTrack.setAttribute("aria-valuemax", String(snapshot.bossMaxHealth));
    this.bossHealthTrack.setAttribute("aria-valuenow", String(snapshot.bossHealth));

    const questionNumber = snapshot.currentQuestion
      ? `${snapshot.currentQuizIndex + 1} / ${snapshot.quizCount}`
      : `0 / ${snapshot.quizCount}`;
    this.questionProgress.textContent = `QUESTION ${questionNumber}`;
    this.questionText.textContent = snapshot.currentQuestion ?? "전투 시작을 기다리고 있습니다.";
    this.selectionText.textContent = selectionLabel(snapshot.playerLocation);

    const seconds = Math.max(0, snapshot.timeRemainingMs / 1000);
    const timerRatio = ratio(snapshot.timeRemainingMs, snapshot.timeLimitMs);
    this.timerText.textContent = `${seconds.toFixed(1)}초`;
    this.timerFill.style.width = `${timerRatio * 100}%`;
    this.timerTrack.dataset.urgent = String(snapshot.phase === "PLAYING" && seconds <= 3);
    this.timerTrack.setAttribute("aria-valuemax", String(snapshot.timeLimitMs));
    this.timerTrack.setAttribute("aria-valuenow", String(snapshot.timeRemainingMs));

    if (playerSnapshot) this.playerView.render(playerSnapshot);
  }

  showFeedback(message, tone = "info") {
    this.feedback.textContent = message;
    this.feedback.dataset.tone = tone;
  }

  destroy() {
    this.root.remove();
  }

  _build() {
    const documentRef = this.document;
    this.bossHealthFill = createElement(documentRef, "span", { className: "data-sphinx-health__fill" });
    this.bossHealthTrack = createElement(documentRef, "span", {
      className: "data-sphinx-health__track",
      attributes: { role: "progressbar", "aria-label": "데이터 스핑크스 체력", "aria-valuemin": "0" },
    }, [this.bossHealthFill]);
    this.bossHealthText = createElement(documentRef, "output", { className: "data-sphinx-health__text", text: "- / -" });
    const bossHealth = createElement(documentRef, "div", { className: "data-sphinx-health data-sphinx-health--boss" }, [
      createElement(documentRef, "strong", { text: "DATA SPHINX" }),
      this.bossHealthTrack,
      this.bossHealthText,
    ]);

    this.playerHealthFill = createElement(documentRef, "span", { className: "character-health__fill" });
    this.playerHealthTrack = createElement(documentRef, "span", {
      className: "character-health__track",
      attributes: { role: "progressbar", "aria-label": "플레이어 체력", "aria-valuemin": "0" },
    }, [this.playerHealthFill]);
    this.playerHealthText = createElement(documentRef, "output", { className: "character-health__text", text: "- / -" });
    this.playerStateText = createElement(documentRef, "output", { className: "character-state-badge", text: "대기" });
    const playerHealth = createElement(documentRef, "div", { className: "character-health" }, [
      createElement(documentRef, "strong", { text: "PLAYER" }),
      this.playerHealthTrack,
      this.playerHealthText,
    ]);
    const hud = createElement(documentRef, "header", { className: "data-sphinx-hud" }, [
      bossHealth,
      createElement(documentRef, "div", { className: "data-sphinx-player-status" }, [playerHealth, this.playerStateText]),
    ]);

    this.questionProgress = createElement(documentRef, "span", { className: "data-sphinx-question__progress", text: "QUESTION 0 / 0" });
    this.questionText = createElement(documentRef, "h2", { className: "data-sphinx-question__text", text: "-" });
    this.timerText = createElement(documentRef, "output", { className: "data-sphinx-timer__text", text: "0.0초" });
    this.timerFill = createElement(documentRef, "span", { className: "data-sphinx-timer__fill" });
    this.timerTrack = createElement(documentRef, "span", {
      className: "data-sphinx-timer__track",
      attributes: { role: "progressbar", "aria-label": "문제 남은 시간", "aria-valuemin": "0" },
    }, [this.timerFill]);
    const timer = createElement(documentRef, "div", { className: "data-sphinx-timer" }, [this.timerText, this.timerTrack]);
    this.feedback = createElement(documentRef, "p", {
      className: "data-sphinx-feedback",
      text: "제한 시간이 끝나기 전에 O 또는 X 영역으로 이동하세요.",
      attributes: { "aria-live": "polite" },
      dataset: { tone: "info" },
    });
    const question = createElement(documentRef, "section", { className: "data-sphinx-question" }, [
      this.questionProgress,
      this.questionText,
      timer,
      this.feedback,
    ]);

    this.zoneO = createElement(documentRef, "div", {
      className: "data-sphinx-zone data-sphinx-zone--o",
      dataset: { selected: "false" },
      attributes: { "aria-hidden": "true" },
    }, [
      createElement(documentRef, "strong", { text: "O" }),
      createElement(documentRef, "span", { text: "맞다" }),
    ]);
    this.zoneX = createElement(documentRef, "div", {
      className: "data-sphinx-zone data-sphinx-zone--x",
      dataset: { selected: "false" },
      attributes: { "aria-hidden": "true" },
    }, [
      createElement(documentRef, "strong", { text: "X" }),
      createElement(documentRef, "span", { text: "아니다" }),
    ]);
    const divider = createElement(documentRef, "div", { className: "data-sphinx-divider" }, [
      createElement(documentRef, "span", { text: "START" }),
    ]);
    this.selectionText = createElement(documentRef, "output", {
      className: "data-sphinx-selection",
      text: "중앙 · 미선택",
      attributes: { "aria-live": "polite" },
    });
    this.playerActor = createCharacterActorElement({ document: documentRef, local: true });
    this.arenaElement = createElement(documentRef, "div", {
      className: "data-sphinx-arena",
      dataset: { selection: DATA_SPHINX_SELECTIONS.NEUTRAL },
      attributes: { role: "application", "aria-label": "데이터 스핑크스 O X 선택 구역" },
    }, [this.zoneO, this.zoneX, divider, this.playerActor, this.selectionText]);

    this.joystickKnob = createElement(documentRef, "span", {
      className: "data-sphinx-joystick__knob",
      attributes: { "aria-hidden": "true" },
    });
    this.joystickBase = createElement(documentRef, "div", {
      className: "data-sphinx-joystick",
      attributes: { role: "group", "aria-label": "O X 영역 이동 조이스틱" },
    }, [
      this.joystickKnob,
      createElement(documentRef, "span", { className: "data-sphinx-joystick__label", text: "MOVE" }),
    ]);
    const mobileControls = createElement(documentRef, "div", {
      className: "data-sphinx-mobile-controls",
      attributes: { "aria-label": "모바일 조작" },
    }, [this.joystickBase]);

    return createElement(documentRef, "section", { className: "data-sphinx-stage" }, [
      hud,
      question,
      this.arenaElement,
      mobileControls,
    ]);
  }
}

export default DataSphinxView;

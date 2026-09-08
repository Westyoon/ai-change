import {
  CharacterView,
  createCharacterActorElement,
} from "../../../character/character-view.js";
import { CONTROL_BOSS_PHASES } from "./encounter.js";

const PHASE_LABELS = Object.freeze({
  [CONTROL_BOSS_PHASES.SHIELD]: "Phase 1 · 실드 파괴",
  [CONTROL_BOSS_PHASES.INSTANT_KILL]: "Phase 2 · 즉사기 엄폐",
  [CONTROL_BOSS_PHASES.ALTAR]: "Phase 3 · 시련의 발판",
  [CONTROL_BOSS_PHASES.GROGGY]: "Phase 4 · 그로기",
});

function createElementFactory(documentRef) {
  if (!documentRef?.createElement) throw new Error("ControlBossView requires a DOM document.");
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

function percent(value, total) {
  return `${(Number(value) / Math.max(1, Number(total))) * 100}%`;
}

function positionRect(node, bounds, arena) {
  node.style.left = percent(bounds.x, arena.width);
  node.style.top = percent(bounds.y, arena.height);
  node.style.width = percent(bounds.width, arena.width);
  node.style.height = percent(bounds.height, arena.height);
}

function setProgress(track, fill, value, max) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = Math.max(0, Math.min(safeMax, Number(value) || 0));
  fill.style.width = `${(safeValue / safeMax) * 100}%`;
  track.setAttribute("aria-valuemax", String(safeMax));
  track.setAttribute("aria-valuenow", String(safeValue));
}

function formatSeconds(milliseconds) {
  return `${Math.max(0, milliseconds / 1000).toFixed(1)}초`;
}

export class ControlBossView {
  constructor({ config, localPlayerId = "player-1", document: documentRef = globalThis.document } = {}) {
    if (!config?.world?.bounds) throw new Error("ControlBossView requires resolved config.");
    this.config = config;
    this.arena = config.world.bounds;
    this.localPlayerId = localPlayerId;
    this.document = documentRef;
    this.createElement = createElementFactory(documentRef);
    this.bulletElements = new Map();
    this.shockwaveElements = new Map();
    this.tileElements = new Map();
    this.element = this.#buildDom();
  }

  mount(parent) {
    if (!parent?.append) throw new Error("ControlBossView.mount(parent) requires a DOM parent.");
    parent.append(this.element);
  }

  render(snapshot, characterSnapshot = null) {
    if (!snapshot || !this.element) return;
    setProgress(this.bossHpTrack, this.bossHpFill, snapshot.currentHp, snapshot.maxHp);
    setProgress(this.shieldTrack, this.shieldFill, snapshot.currentShield, snapshot.maxShield);
    this.bossHpText.textContent = `${Math.ceil(snapshot.currentHp)} / ${snapshot.maxHp}`;
    this.shieldText.textContent = `${Math.ceil(snapshot.currentShield)} / ${snapshot.maxShield}`;
    this.phaseBadge.textContent = PHASE_LABELS[snapshot.phase] ?? `Phase ${snapshot.phase}`;
    this.phaseBadge.dataset.phase = String(snapshot.phase);

    const castVisible = [CONTROL_BOSS_PHASES.INSTANT_KILL, CONTROL_BOSS_PHASES.GROGGY].includes(snapshot.phase);
    this.castWrap.dataset.visible = String(castVisible);
    if (castVisible) {
      const total = snapshot.phase === CONTROL_BOSS_PHASES.INSTANT_KILL
        ? this.config.boss.phase2CastSec * 1000
        : this.config.boss.groggyDurationSec * 1000;
      setProgress(this.castWrap, this.castFill, snapshot.phaseTimerMs, total);
      this.castLabel.textContent = snapshot.phase === CONTROL_BOSS_PHASES.INSTANT_KILL
        ? `즉사기 ${formatSeconds(snapshot.phaseTimerMs)}`
        : `그로기 ${formatSeconds(snapshot.phaseTimerMs)}`;
    }

    this.cover.dataset.active = String(snapshot.isCovered);
    this.status.textContent = snapshot.status.text;
    this.status.dataset.tone = snapshot.status.tone;
    this.status.dataset.sequence = String(snapshot.status.sequence);
    this.status.setAttribute("aria-label", snapshot.status.text);
    this.#renderTiles(snapshot.tiles);
    this.#renderBullets(snapshot.bullets);
    this.#renderShockwaves(snapshot.shockwaves);

    const renderedCharacter = characterSnapshot ?? {
      id: this.localPlayerId,
      ...snapshot.playerBounds,
      direction: "up",
      state: snapshot.isStunned ? "control-locked" : "idle",
      currentHealth: snapshot.playerHp,
      maxHealth: snapshot.playerMaxHp,
      appearance: { id: "player", label: "YOU", color: "#2e7d32", accentColor: "#69db7c" },
    };
    this.characterView.render(renderedCharacter);
    this.playerHpText.textContent = `${Math.ceil(snapshot.playerHp)} / ${snapshot.playerMaxHp}`;
    this.playerState.textContent = snapshot.isStunned
      ? `경직 · ${formatSeconds(snapshot.stunRemainingMs)}`
      : snapshot.isCovered
        ? "엄폐 중"
        : "전투 중";
  }

  destroy() {
    this.element?.remove();
    this.element = null;
    this.bulletElements.clear();
    this.shockwaveElements.clear();
    this.tileElements.clear();
  }

  #renderTiles(tiles = []) {
    const element = this.createElement;
    const active = new Set();
    for (const tile of tiles) {
      active.add(tile.id);
      let node = this.tileElements.get(tile.id);
      if (!node) {
        node = element("span", {
          className: "control-boss-tile",
          attributes: { "aria-hidden": "true" },
        });
        this.tilesLayer.append(node);
        this.tileElements.set(tile.id, node);
      }
      positionRect(node, tile.bounds, this.arena);
      node.dataset.kind = tile.kind;
      node.dataset.cleared = String(tile.cleared);
      node.textContent = tile.kind === "hole" ? "🕳️" : tile.kind === "plate" ? String(tile.order) : "·";
    }
    for (const [id, node] of this.tileElements) {
      if (active.has(id)) continue;
      node.remove();
      this.tileElements.delete(id);
    }
  }

  #renderBullets(bullets = []) {
    const element = this.createElement;
    const active = new Set();
    for (const bullet of bullets) {
      active.add(bullet.id);
      let node = this.bulletElements.get(bullet.id);
      if (!node) {
        node = element("span", { className: "control-boss-bullet", attributes: { "aria-hidden": "true" } });
        this.bulletLayer.append(node);
        this.bulletElements.set(bullet.id, node);
      }
      node.style.left = percent(bullet.x, this.arena.width);
      node.style.top = percent(bullet.y, this.arena.height);
    }
    for (const [id, node] of this.bulletElements) {
      if (active.has(id)) continue;
      node.remove();
      this.bulletElements.delete(id);
    }
  }

  #renderShockwaves(shockwaves = []) {
    const element = this.createElement;
    const active = new Set();
    for (const shockwave of shockwaves) {
      active.add(shockwave.id);
      let node = this.shockwaveElements.get(shockwave.id);
      if (!node) {
        node = element("span", { className: "control-boss-shockwave", attributes: { "aria-hidden": "true" } });
        this.shockwaveLayer.append(node);
        this.shockwaveElements.set(shockwave.id, node);
      }
      node.style.left = percent(shockwave.x, this.arena.width);
      node.style.top = percent(shockwave.y, this.arena.height);
      node.style.width = percent(shockwave.radius * 2, this.arena.width);
      node.style.height = percent(shockwave.radius * 2, this.arena.height);
    }
    for (const [id, node] of this.shockwaveElements) {
      if (active.has(id)) continue;
      node.remove();
      this.shockwaveElements.delete(id);
    }
  }

  #buildBar(label, tone) {
    const element = this.createElement;
    const fill = element("span", { className: `control-boss-bar__fill control-boss-bar__fill--${tone}` });
    const track = element("span", {
      className: "control-boss-bar__track",
      attributes: { role: "progressbar", "aria-label": label, "aria-valuemin": "0" },
    }, [fill]);
    const output = element("output", { className: "control-boss-bar__value", text: "- / -" });
    const row = element("div", { className: "control-boss-bar" }, [
      element("strong", { text: label }),
      track,
      output,
    ]);
    return { row, track, fill, output };
  }

  #buildDom() {
    const element = this.createElement;
    const hp = this.#buildBar("BOSS", "hp");
    const shield = this.#buildBar("SHIELD", "shield");
    this.bossHpTrack = hp.track;
    this.bossHpFill = hp.fill;
    this.bossHpText = hp.output;
    this.shieldTrack = shield.track;
    this.shieldFill = shield.fill;
    this.shieldText = shield.output;
    this.phaseBadge = element("output", { className: "control-boss-phase", text: "Phase 1" });
    const header = element("header", { className: "control-boss-header" }, [
      element("strong", { className: "control-boss-title", text: `⚡ ${this.config.title}` }),
      this.phaseBadge,
    ]);
    const bossHud = element("section", { className: "control-boss-hud", attributes: { "aria-label": "보스 상태" } }, [
      hp.row,
      shield.row,
    ]);

    this.castFill = element("span", { className: "control-boss-cast__fill" });
    this.castLabel = element("span", { className: "control-boss-cast__label", text: "즉사기" });
    this.castWrap = element("span", {
      className: "control-boss-cast",
      dataset: { visible: "false" },
      attributes: { role: "progressbar", "aria-label": "보스 시전 시간", "aria-valuemin": "0" },
    }, [this.castFill, this.castLabel]);
    this.bossActor = element("div", { className: "control-boss-actor", attributes: { "aria-hidden": "true" } }, [
      element("span", { className: "control-boss-actor__label", text: "BOSS" }),
      this.castWrap,
    ]);
    positionRect(this.bossActor, this.config.world.bossZone, this.arena);

    this.cover = element("div", {
      className: "control-boss-cover",
      text: "🛡️ 엄폐벽",
      dataset: { active: "false" },
      attributes: { "aria-hidden": "true" },
    });
    positionRect(this.cover, this.config.world.coverZone, this.arena);
    this.tilesLayer = element("div", { className: "control-boss-tiles", attributes: { "aria-hidden": "true" } });
    this.shockwaveLayer = element("div", { className: "control-boss-shockwaves", attributes: { "aria-hidden": "true" } });
    this.bulletLayer = element("div", { className: "control-boss-bullets", attributes: { "aria-hidden": "true" } });
    this.playerActor = createCharacterActorElement({ document: this.document, local: true });
    this.playerActor.dataset.characterId = this.localPlayerId;
    this.characterView = new CharacterView({ element: this.playerActor, worldSize: this.arena });
    this.world = element("div", {
      className: "control-boss-world",
      attributes: { role: "application", "aria-label": "컨트롤 보스 전투 필드" },
    }, [this.tilesLayer, this.cover, this.bossActor, this.shockwaveLayer, this.bulletLayer, this.playerActor]);

    this.playerHpText = element("output", { className: "control-boss-player-hp", text: "100 / 100" });
    this.playerState = element("output", { className: "control-boss-player-state", text: "전투 준비" });
    const playerHud = element("div", { className: "control-boss-player-hud" }, [
      element("strong", { text: "PLAYER" }),
      this.playerHpText,
      this.playerState,
    ]);
    this.status = element("p", {
      className: "control-boss-status",
      text: "전투 준비 중",
      dataset: { tone: "info", sequence: "0" },
      attributes: { "aria-live": "polite" },
    });

    this.joystickKnob = element("span", { className: "character-joystick__knob", attributes: { "aria-hidden": "true" } });
    this.joystickBase = element("div", {
      className: "character-joystick control-boss-joystick",
      attributes: { role: "group", "aria-label": "이동 조이스틱" },
    }, [this.joystickKnob, element("span", { className: "character-joystick__label", text: "MOVE" })]);
    this.attackButton = element("button", {
      className: "character-attack-button control-boss-attack",
      text: "공격",
      attributes: { type: "button", "aria-label": "컨트롤 보스 공격" },
    });
    const touchControls = element("div", {
      className: "character-touch-controls control-boss-touch-controls",
      attributes: { "aria-label": "모바일 조작" },
    }, [this.joystickBase, this.attackButton]);

    return element("section", { className: "control-boss-stage character-stage" }, [
      header,
      bossHud,
      playerHud,
      this.world,
      this.status,
      touchControls,
    ]);
  }
}

export default ControlBossView;

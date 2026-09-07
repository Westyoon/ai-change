// view.js
//
// 3단계: encounter.js의 상태(getSnapshot())를 실제 DOM 화면으로 그려주는 부분.
// 판정 로직(encounter.js)과 렌더링(이 파일)을 분리해뒀기 때문에, 그림을 어떻게
// 그리든 self-check.mjs로 검증한 판정 로직에는 영향이 없다 (반대도 마찬가지).
//
// 화면 레이아웃은 승인된 목업(Main.dc.html/BattleStagger.dc.html)을 그대로 따른다:
//   - 좌상단: 내 스탯 카드 (경과 시간 / 공격력 / 방어력 / HP)
//   - 중앙 상단: 보스 이름 + HP바, 그 아래 현재 패턴 이름 태그
//   - 보스는 격자 "위" 별도 구역에 떠 있고, 격자 칸과 겹치지 않는다
//   - 격자(.stat-boss-arena)는 7x5을 정확히 채우고, 이 요소 크기 = encounter.js가
//     쓰는 ARENA(battle.js의 DEFAULT_ARENA)와 반드시 같은 좌표계여야 위험 칸 표시와
//     실제 판정이 어긋나지 않는다.
//
// [예고 vs 실제 판정 표시] (2026-09-06 피드백 반영)
//   - 예고(TELEGRAPH) 중: 빗금 무늬로 "위험해질 예정"을 표시
//   - 판정 순간(encounter의 "dodge-result" 이벤트): 그 칸을 잠깐 단색 빨강으로
//     플래시해서 "지금 여기 맞았다/안 맞았다"가 갈리는 순간을 보여준다
//   - STAGGER(경직) 중에는 격자를 더 이상 위험색으로 물들이지 않는다 - 그리드
//     하이라이트는 "위험하다"는 뜻으로만 쓰고, 반격 타이밍은 상단 phase 배지와
//     화면 중앙의 "반격!" 프롬프트로 알려준다 (그리드에 초록을 섞으면 "이 칸도
//     위험한가?"로 헷갈린다는 피드백 반영).
//
// [렌더링 방식] 팀 공용 캐릭터 시스템(character-view.js)과 통일해서 Canvas가 아니라
// <div> + 퍼센트(%) 좌표 기반으로 그린다.

import { GRID, isCellInSet } from "./grid.js";
import { CharacterView, RemoteCharacterView, createCharacterActorElement } from "../../../character/index.js";
import { createElement } from "../../../../scenes/scene-utils.js";

const PHASE_LABELS = Object.freeze({
  TELEGRAPH: "예고",
  STAGGER: "경직 · 반격 찬스",
});

// 2026-09-06: 같이 플레이하는 다른 플레이어(원격 캐릭터)를 내 캐릭터(기본 --character-color,
// 파란 계열)와 헷갈리지 않게 연보라색으로 고정 - 팀 공용 캐릭터 시스템의
// character-actor--remote가 이미 --character-color 변수로 색을 받게 되어 있어서
// (character-view.js applyAppearance), 색만 지정해서 넘기면 된다.
const REMOTE_PLAYER_COLOR = "#b088ff";

function clampRatio(current, max) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeCurrent = Math.max(0, Number(current) || 0);
  return Math.max(0, Math.min(1, safeCurrent / safeMax));
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export class StatBossView {
  /**
   * @param {{arena: {width:number, height:number}, localPlayerId: string}} options
   *   arena는 encounter.js에 넘기는 config.arena와 반드시 같은 값을 써야 한다
   *   (좌표계를 맞추기 위해). battle.js가 두 곳에 같은 값을 넘겨준다.
   */
  constructor({ arena, localPlayerId }) {
    this.arena = arena;
    this.localPlayerId = localPlayerId;
    this._impactTimer = null;
    this._counterFlashTimer = null;
    this.root = this.#buildDom();
    this.playerView = new CharacterView({
      element: this.playerActorEl,
      worldSize: this.arena,
      healthTrack: this.playerHealthTrack,
      healthFill: this.playerHealthFill,
      healthText: this.playerHealthText,
      stateText: this.playerStateText,
    });
    // 다른 플레이어들(로컬 1명을 제외한 나머지) - 아직 실제 멀티플레이 네트워킹은
    // 없지만, config.players에 2명 이상이 들어오는 즉시(추후 계정/파티 시스템 연결
    // 시) 자동으로 연보라색 캐릭터로 그려지도록 미리 연결해둔다.
    this.remoteView = new RemoteCharacterView({ root: this.arenaEl, worldSize: this.arena });
  }

  /** 실제 화면(부모 scene)에 이 view의 DOM을 붙인다. */
  mount(parent) {
    parent.append(this.root);
  }

  destroy() {
    if (this._counterFlashTimer) clearTimeout(this._counterFlashTimer);
    if (this._impactTimer) clearTimeout(this._impactTimer);
    this.remoteView.destroy();
    this.root.remove();
  }

  /**
   * 나 말고 다른 플레이어들을 그린다 (연보라색 고정, character-actor--remote).
   * @param {{id:string, x:number, y:number, currentHealth?:number, maxHealth?:number}[]} remotePlayers
   */
  renderRemotePlayers(remotePlayers = []) {
    this.remoteView.update(
      remotePlayers.map((p) => ({
        ...p,
        appearance: { ...(p.appearance ?? {}), color: REMOTE_PLAYER_COLOR, label: p.appearance?.label ?? p.id },
      })),
    );
  }

  // ---- 보스/격자/타이머 렌더링 (encounter.getSnapshot() 기반) ----

  /** @param {ReturnType<import("./encounter.js").StatBossEncounter["getSnapshot"]>} snapshot */
  render(snapshot) {
    if (!snapshot) return;

    // 보스 HP바
    if (snapshot.boss) {
      const ratio = clampRatio(snapshot.boss.hp, snapshot.boss.maxHp);
      this.bossHpFill.style.width = `${ratio * 100}%`;
      this.bossHpText.textContent = `${Math.max(0, Math.round(snapshot.boss.hp))} / ${snapshot.boss.maxHp}`;
      this.bossHpTrack.dataset.low = String(ratio <= 0.25);
    }

    // 위험 칸 하이라이트: TELEGRAPH일 때만 빗금으로 "예정"을 보여준다.
    // (실제 판정 순간의 단색 빨강 플래시는 flashImpact()가 따로 처리한다.)
    const danger = snapshot.phase === "TELEGRAPH" ? snapshot.dangerCells : [];
    for (const { row, col, el } of this.cells) {
      el.dataset.danger = String(isCellInSet({ row, col }, danger));
    }

    // 상단 phase 배지 + 패턴 이름 태그
    const phaseLabel = PHASE_LABELS[snapshot.phase] ?? snapshot.phase ?? "-";
    const remainingMs = snapshot.phase === "STAGGER" ? snapshot.staggerRemainingMs : null;
    this.phaseBadge.textContent =
      remainingMs != null ? `${phaseLabel} · ${(remainingMs / 1000).toFixed(1)}초` : phaseLabel;
    this.phaseBadge.dataset.phase = snapshot.phase ?? "";
    this.patternTag.textContent = snapshot.currentPatternName
      ? `패턴 · ${snapshot.currentPatternName} · ${phaseLabel} 중`
      : "-";

    // 화면 중앙 "반격!" 프롬프트: STAGGER 중에만 보인다.
    this.counterPrompt.dataset.visible = String(snapshot.phase === "STAGGER");

    // 좌상단 내 스탯 카드 (경과 시간 / 공격력 / 방어력 / HP)
    this.timerText.textContent = formatClock(snapshot.elapsedMs);
    const me = snapshot.players?.[this.localPlayerId];
    if (me) {
      this.statAtk.textContent = String(me.attackStat);
      this.statDef.textContent = String(me.defenseStat);
      this.statHp.textContent = `${Math.max(0, Math.round(me.hp))}/${me.maxHp}`;
    }
  }

  /** 캐릭터 시스템 snapshot(system.getSnapshot())을 그대로 넘기면 플레이어 액터를 그린다. */
  renderPlayer(characterSnapshot) {
    this.playerView.render(characterSnapshot);
  }

  /** encounter의 "dodge-result" 이벤트가 오면, 그 순간 판정된 칸을 잠깐 빨갛게 플래시한다. */
  flashImpact(dangerCells = []) {
    if (this._impactTimer) clearTimeout(this._impactTimer);
    for (const { row, col, el } of this.cells) {
      el.dataset.impact = String(isCellInSet({ row, col }, dangerCells));
    }
    this._impactTimer = setTimeout(() => {
      for (const { el } of this.cells) el.dataset.impact = "false";
    }, 220);
  }

  /** encounter의 onEvent로 "counter-hit"/"counter-miss"가 오면 화면에 잠깐 표시. */
  flashCounter({ hit, damage } = {}) {
    if (this._counterFlashTimer) clearTimeout(this._counterFlashTimer);
    this.counterFlashEl.textContent = hit ? `반격 성공! -${damage}` : "반격 실패";
    this.counterFlashEl.dataset.tone = hit ? "hit" : "miss";
    this.counterFlashEl.dataset.visible = "true";
    this._counterFlashTimer = setTimeout(() => {
      this.counterFlashEl.dataset.visible = "false";
    }, 600);
  }

  // ---- DOM 구성 ----

  #buildStatCard() {
    this.timerText = createElement("output", { className: "stat-boss-stat-timer", text: "00:00" });
    this.statAtk = createElement("dd", { text: "-" });
    this.statDef = createElement("dd", { text: "-" });
    this.statHp = createElement("dd", { text: "-" });
    // 2026-09-06: 남은시간(타이머)을 카드 왼쪽 -> 오른쪽 끝으로 이동 (피드백 반영).
    return createElement("div", { className: "stat-boss-stat-card" }, [
      createElement("dl", { className: "stat-boss-stat-card__list" }, [
        createElement("dt", { text: "ATK" }),
        this.statAtk,
        createElement("dt", { text: "DEF" }),
        this.statDef,
        createElement("dt", { text: "HP" }),
        this.statHp,
      ]),
      this.timerText,
    ]);
  }

  #buildDom() {
    // ---- 상단 HUD: 내 스탯 카드 + 보스 HP + 패턴 태그 ----
    this.bossHpFill = createElement("span", { className: "stat-boss-boss-hp-fill" });
    this.bossHpTrack = createElement(
      "span",
      {
        className: "stat-boss-boss-hp-track",
        attributes: { role: "progressbar", "aria-label": "보스 체력", "aria-valuemin": "0" },
      },
      [this.bossHpFill],
    );
    this.bossHpText = createElement("output", { className: "stat-boss-boss-hp-text", text: "- / -" });
    const bossInfo = createElement("div", { className: "stat-boss-boss-info" }, [
      createElement("strong", { text: "BOSS" }),
      this.bossHpTrack,
      this.bossHpText,
    ]);

    this.phaseBadge = createElement("output", { className: "stat-boss-phase-badge", text: "대기" });
    // 2026-09-06: bossInfo(보스 HP)와 phaseBadge를 같은 줄(.stat-boss-boss-row)로 묶고
    // 그 줄 자체는 절대 줄바꿈 안 되게(nowrap) 한다. "예고"(짧은 텍스트)일 때만 보스HP
    // 옆에 붙고 "경직 · 반격 찬스 · N초"(긴 텍스트)로 바뀌면 아래줄로 밀려서 화면 높이가
    // 오락가락하던 버그 수정(모바일 실기기 테스트로 발견: 화면이 계속 내려갔다 올라갔다함).
    // 이제는 텍스트 길이와 상관없이 항상 같은 줄에 있고, 대신 보스 HP바 쪽이 필요한 만큼
    // 줄어들어서 자리를 내준다 (css의 .stat-boss-boss-row/.stat-boss-boss-hp-track 참고).
    const bossRow = createElement("div", { className: "stat-boss-boss-row" }, [bossInfo, this.phaseBadge]);
    const hud = createElement("header", { className: "stat-boss-hud" }, [this.#buildStatCard(), bossRow]);

    this.patternTag = createElement("p", { className: "stat-boss-pattern-tag", text: "-" });

    // ---- 보스 존: 격자와 절대 겹치지 않는 별도 구역 (2026-09-06: "그리드가 보스를
    // 뚫는다" 피드백으로 격자 밖으로 분리함) ----
    const bossSprite = createElement("span", { className: "stat-boss-boss-actor__sprite" });
    const bossActor = createElement(
      "div",
      { className: "stat-boss-boss-actor", attributes: { "aria-hidden": "true" } },
      [bossSprite],
    );
    const bossZone = createElement("div", { className: "stat-boss-boss-zone" }, [bossActor]);

    // ---- 격자: GRID.rows x GRID.columns 칸을 만들고 render()에서 data-danger만 바꾼다 ----
    this.cells = [];
    const gridEl = createElement("div", {
      className: "stat-boss-grid",
      attributes: { "aria-hidden": "true" },
    });
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.columns; col++) {
        const el = createElement("div", {
          className: "stat-boss-cell",
          dataset: { row: String(row), col: String(col), danger: "false", impact: "false" },
        });
        this.cells.push({ row, col, el });
        gridEl.append(el);
      }
    }

    this.playerActorEl = createCharacterActorElement({ local: true });
    this.playerActorEl.dataset.characterId = this.localPlayerId;

    this.counterPrompt = createElement("div", {
      className: "stat-boss-counter-prompt",
      text: "반격!",
      attributes: { "aria-hidden": "true" },
    });
    this.counterFlashEl = createElement("div", {
      className: "stat-boss-counter-flash",
      attributes: { "aria-live": "polite" },
    });

    // arena: 실제 판정 좌표계(ARENA)와 정확히 같은 비율의 박스. 격자·플레이어 액터가
    // 전부 이 박스를 기준으로 %로 배치된다.
    const arena = createElement(
      "div",
      { className: "stat-boss-arena", attributes: { role: "application", "aria-label": "스탯 보스 전투 격자" } },
      [gridEl, this.playerActorEl, this.counterPrompt, this.counterFlashEl],
    );
    this.arenaEl = arena; // RemoteCharacterView가 이 위에 다른 플레이어 액터를 붙임(같은 %좌표계)

    // ---- 캐릭터 HP + 터치 조작 ----
    this.playerHealthFill = createElement("span", { className: "character-health__fill" });
    this.playerHealthTrack = createElement(
      "span",
      {
        className: "character-health__track",
        attributes: { role: "progressbar", "aria-label": "내 캐릭터 체력", "aria-valuemin": "0" },
      },
      [this.playerHealthFill],
    );
    this.playerHealthText = createElement("output", { className: "character-health__text", text: "- / -" });
    this.playerStateText = createElement("output", { className: "character-state-badge", text: "대기" });
    const playerHud = createElement("div", { className: "character-hud" }, [
      createElement("div", { className: "character-health" }, [
        createElement("strong", { text: "HP" }),
        this.playerHealthTrack,
        this.playerHealthText,
      ]),
      this.playerStateText,
    ]);

    this.joystickKnob = createElement("span", {
      className: "character-joystick__knob",
      attributes: { "aria-hidden": "true" },
    });
    this.joystickBase = createElement(
      "div",
      { className: "character-joystick", attributes: { role: "group", "aria-label": "이동 조이스틱" } },
      [this.joystickKnob, createElement("span", { className: "character-joystick__label", text: "MOVE" })],
    );
    this.attackButton = createElement("button", {
      className: "character-attack-button",
      text: "공격",
      type: "button",
      attributes: { "aria-label": "공격 · 반격 명령" },
    });
    const touchControls = createElement(
      "div",
      { className: "character-touch-controls", attributes: { "aria-label": "모바일 조작" } },
      [this.joystickBase, this.attackButton],
    );

    const battlefield = createElement("div", { className: "stat-boss-battlefield" }, [bossZone, arena]);

    return createElement("section", { className: "stat-boss-stage character-stage" }, [
      hud,
      this.patternTag,
      playerHud,
      battlefield,
      touchControls,
    ]);
  }
}

export default StatBossView;

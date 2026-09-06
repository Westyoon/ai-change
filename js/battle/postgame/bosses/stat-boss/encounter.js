// encounter.js
//
// 2단계: 1단계에서 만든 순수 함수들(patterns/stats/difficulty/judge/random)을
// 실제로 "시간이 흐르는 전투 루프"에 연결하는 부분.
// 예고 -> 회피판정 -> (다음 step 있으면 반복) -> 경직 -> 반격 -> 다음 예고로 복귀.
//
// [핵심 설계 1] 이 파일은 setTimeout이나 requestAnimationFrame을 직접 쓰지 않는다.
// 대신 밖에서 tick(deltaMs)를 불러줘야 시간이 흐른다.
//   - 실제 게임(3단계)에서는 매 프레임 requestAnimationFrame 콜백 안에서
//     encounter.tick(프레임 간 경과시간)을 불러주면 된다.
//   - 테스트할 땐 self-check.mjs에서 tick(1500) 같은 식으로 "가짜 시간"을
//     원하는 만큼씩 흘려보내면서 실제로 기다리지 않고 로직만 검증할 수 있다.
// random.js를 시드 주입 방식으로 만든 것과 같은 이유(테스트 가능성).
//
// [핵심 설계 2] 이 파일은 캐릭터를 직접 움직이지 않는다. 플레이어 위치는
// setPlayerPosition(id, x, y)로 밖에서(3단계 공용 캐릭터 시스템/입력 처리 쪽에서)
// 매번 갱신해주면, 판정이 필요한 순간(예고가 끝나는 시점)에 그 위치를 그대로 갖다 쓴다.
// "이동은 자유이동, 판정 시에만 좌표->칸 변환"이라는 1단계 설계를 그대로 따른 것.
//
// [재도전 규칙] 실패해도 스탯이 깎이면 안 된다(1단계 체크리스트 항목)는 규칙은,
// 애초에 이 모듈이 외부 스탯을 직접 바꿀 권한이 없게 만들어서 지킨다 - 이 모듈은
// candidate 객체만 onComplete로 돌려주고, 그걸 실제 세이브 데이터에 반영할지 말지는
// 호출하는 쪽(상위 시스템) 책임으로 남겨둔다.

import { positionToCell } from "./grid.js";
import { getAvailablePatterns } from "./patterns.js";
import { calcPlayerDamage, calcIncomingDamage, calcMaxHp, DEFAULT_BALANCE } from "./stats.js";
import { getDifficultyTier, getBossHpMultiplier } from "./difficulty.js";
import { judgeDodgeForAll, isCounterValid } from "./judge.js";
import { createRandom } from "./random.js";
import { STATE, assertTransition } from "./state.js";

// 여러 step으로 이루어진 패턴(③ 좌우 스윕, ⑤ 연속 콤보)에서, 첫 step 이후 예고 시간.
// v3 스펙은 "한 칸씩 훑고 지나간다" / "짧은 간격으로 2번" 이라고만 설명하고 구체적인
// 간격 수치는 없어서 (1단계 체크리스트에 "② 좌우 스윕 step별 예고시간 분배는 2단계에서
// 결정"으로 남겨뒀던 항목) 기본 예고시간의 1/3로 정하고 최소 300ms는 보장하는 걸로
// 가정해서 구현함. 실제로 플레이해보고 너무 빠르다/느리다 싶으면 이 두 상수만 바꾸면 됨.
const STEP_INTERVAL_DIVISOR = 3;
const MIN_STEP_INTERVAL_MS = 300;

function getStepTelegraphMs(tierTelegraphMs, stepIndex) {
  if (stepIndex === 0) return tierTelegraphMs;
  return Math.max(MIN_STEP_INTERVAL_MS, Math.round(tierTelegraphMs / STEP_INTERVAL_DIVISOR));
}

let attemptSeq = 0; // 모듈 전체에서 attemptId가 겹치지 않게 부여하기 위한 카운터

export class StatBossEncounter {
  /**
   * @param {object} config
   * @param {{width:number, height:number}} config.arena
   * @param {{id:string, attackStat:number, defenseStat:number, healthStat:number, position:{x:number,y:number}}[]} config.players
   * @param {number} [config.bossAttack=20] - 보스 공격력 (예시값 - v3에 구체 수치 없어서 임시로 넣음, 밸런싱 대상)
   * @param {number} [config.bossBaseHp=1000] - 1인 기준 보스 기본 체력 (예시값, 밸런싱 대상)
   * @param {number} [config.staggerDurationMs=1200] - 경직 지속 시간 (v3 3-4절 예시 수치)
   * @param {number} [config.timeLimitSec] - 제한시간(초). v3 문서에서 정확한 값을 확인하기 전까지는
   *   생략하면 시간초과 실패 조건이 꺼져 있다(무제한). 값이 확인되는 대로 넣어줄 것.
   * @param {string[]} [config.patternIds] - 등장 후보로 쓸 패턴 id 목록(난이도 필터링 전 전체 후보). 생략하면 5종 전부.
   * @param {number} [config.seed] - 패턴 선택에 쓸 난수 시드. 생략하면 매번 다른 진짜 랜덤.
   * @param {object} [config.balance] - stats.js DEFAULT_BALANCE를 덮어쓸 값
   * @param {(attemptId:string, candidate:object) => void} [config.onComplete] - Battle lifecycle 계약의 onComplete
   * @param {(event:{type:string, [key:string]:any}) => void} [config.onEvent] - 3단계 연출용 이벤트 훅 (선택)
   */
  constructor(config) {
    this.config = config;
    this.state = STATE.CREATED;
    this.random = createRandom(config.seed);
    this.attemptId = null;

    this.players = null;
    this.boss = null;
    this.elapsedMs = 0;
    this.phase = null; // 'TELEGRAPH' | 'STAGGER'
    this.currentPattern = null;
    this.currentStepIndex = 0;
    this.currentDangerCells = [];
    this.phaseRemainingMs = 0;
    this.staggerStartedAt = null;
    this.metrics = null;
  }

  // ---- 내부 유틸 ----

  _setState(next) {
    assertTransition(this.state, next);
    this.state = next;
  }

  _emit(event) {
    if (typeof this.config.onEvent === "function") this.config.onEvent(event);
  }

  _getArenaCell(position) {
    return positionToCell(position.x, position.y, this.config.arena);
  }

  /** init()과 restart() 둘 다 필요한 "값 계산" 부분만 따로 뺀 것 (상태 전이는 각자 책임). */
  _setupInitialState() {
    const balance = { ...DEFAULT_BALANCE, ...(this.config.balance || {}) };
    this.balance = balance;

    this.players = new Map();
    for (const p of this.config.players) {
      const maxHp = calcMaxHp(p.healthStat, balance);
      this.players.set(p.id, {
        id: p.id,
        attackStat: p.attackStat,
        defenseStat: p.defenseStat,
        position: { ...p.position },
        maxHp,
        hp: maxHp,
      });
    }

    const bossBaseHp = this.config.bossBaseHp ?? 1000; // TODO: v3 확정 수치로 교체
    const multiplier = getBossHpMultiplier(this.players.size);
    const bossMaxHp = Math.round(bossBaseHp * multiplier);
    this.boss = {
      attack: this.config.bossAttack ?? 20, // TODO: v3 확정 수치로 교체
      maxHp: bossMaxHp,
      hp: bossMaxHp,
    };

    this.elapsedMs = 0;
    this.phase = null;
    this.currentPattern = null;
    this.currentStepIndex = 0;
    this.currentDangerCells = [];
    this.phaseRemainingMs = 0;
    this.staggerStartedAt = null;
    this.metrics = {
      damageDealt: 0,
      damageTaken: 0,
      counterSuccesses: 0,
      counterMisses: 0,
      patternsResolved: 0,
    };
  }

  // ---- Battle lifecycle 계약: init/start/pause/resume/restart/destroy ----

  init() {
    this._setState(STATE.INITIALIZING);
    this._setupInitialState();
    this._setState(STATE.READY);
    this._emit({ type: "ready" });
  }

  start() {
    this._setState(STATE.RUNNING);
    this.attemptId = `stat-boss-${Date.now()}-${attemptSeq++}`;
    this._beginNextPattern();
    this._emit({ type: "start", attemptId: this.attemptId });
  }

  pause() {
    this._setState(STATE.PAUSED);
    this._emit({ type: "pause" });
  }

  resume() {
    this._setState(STATE.RUNNING);
    this._emit({ type: "resume" });
  }

  /** COMPLETED 상태에서 다시 처음부터 도전할 때. init()과 같은 계산을 다시 하되,
   *  INITIALIZING을 다시 거치지 않는다 (COMPLETED -> INITIALIZING은 허용 전이가 아님). */
  restart() {
    this._setState(STATE.READY);
    this._setupInitialState();
    this._emit({ type: "restart" });
  }

  destroy() {
    if (this.state === STATE.DESTROYED) return;
    this._setState(STATE.DESTROYED);
    this._emit({ type: "destroy" });
  }

  // ---- 3단계(공용 캐릭터 시스템)에서 매 프레임 호출해줄 것으로 예상하는 함수 ----

  setPlayerPosition(playerId, x, y) {
    const player = this.players?.get(playerId);
    if (player) player.position = { x, y };
  }

  // ---- 메인 루프: 밖에서 매 프레임(또는 테스트에서 임의로) 호출 ----

  tick(deltaMs) {
    if (this.state !== STATE.RUNNING) return; // PAUSED 등일 땐 시간 자체가 안 흐름
    this.elapsedMs += deltaMs;
    this.phaseRemainingMs -= deltaMs;

    if (this.phaseRemainingMs > 0) return; // 아직 이번 phase 안 끝남

    if (this.phase === "TELEGRAPH") this._resolveTelegraph();
    else if (this.phase === "STAGGER") this._endStagger();
  }

  // ---- 반격 시도 (경직 중에만 유효) ----

  attemptCounter(playerId) {
    if (this.state !== STATE.RUNNING || this.phase !== "STAGGER") return { hit: false };
    const player = this.players.get(playerId);
    if (!player) return { hit: false };

    const staggerDurationMs = this.config.staggerDurationMs ?? 1200;
    const valid = isCounterValid(this.staggerStartedAt, this.elapsedMs, staggerDurationMs);
    if (!valid) {
      this.metrics.counterMisses++;
      this._emit({ type: "counter-miss", playerId });
      return { hit: false };
    }

    const damage = calcPlayerDamage(player.attackStat, this.balance);
    this.boss.hp = Math.max(0, this.boss.hp - damage);
    this.metrics.damageDealt += damage;
    this.metrics.counterSuccesses++;
    this._emit({ type: "counter-hit", playerId, damage, bossHp: this.boss.hp });

    if (this.boss.hp <= 0) this._resolve("success", null);
    return { hit: true, damage };
  }

  // ---- 내부: 패턴 진행 ----

  _beginNextPattern() {
    const elapsedSec = this.elapsedMs / 1000;
    const tier = getDifficultyTier(elapsedSec);
    const restrictTo = this.config.patternIds; // 테스트/특수 상황에서 후보를 좁히고 싶을 때
    const candidateIds = restrictTo ? tier.patternIds.filter((id) => restrictTo.includes(id)) : tier.patternIds;
    const available = getAvailablePatterns(candidateIds, this.players.size);

    // 이론상 후보가 비는 일은 없어야 하지만(1인 초반엔 단일 저격만 있어도 후보가 남음),
    // 설정 실수 등으로 비었을 때 게임이 멈춰버리는 것보단 난이도 필터 없이라도 하나
    // 고르는 게 안전하다.
    const fallback = () => getAvailablePatterns(tier.patternIds, this.players.size);
    const pickFrom = available.length > 0 ? available : fallback();

    this.currentPattern = this.random.pick(pickFrom);
    this.currentStepIndex = 0;
    this._tierTelegraphMs = tier.telegraphMs;
    this._beginStep();
  }

  _beginStep() {
    if (this.currentStepIndex === 0) {
      // getSteps는 패턴 전체 step 배열을 계산한다. 스윕처럼 step이 여럿인 패턴을
      // step마다 다시 계산하면 낭비이자(칸 배열을 매번 새로 만듦) 패턴에 따라 다른
      // 결과가 나올 수도 있어서, 패턴이 새로 시작될 때 한 번만 계산해 캐싱해둔다.
      const ctx = {
        players: Array.from(this.players.values()).map((p) => ({
          id: p.id,
          cell: this._getArenaCell(p.position),
        })),
        random: this.random,
      };
      this._steps = this.currentPattern.getSteps(ctx);
    }

    const step = this._steps[this.currentStepIndex];
    this.currentDangerCells = step.dangerCells;
    this.phase = "TELEGRAPH";
    this.phaseRemainingMs = getStepTelegraphMs(this._tierTelegraphMs, this.currentStepIndex);

    this._emit({
      type: "telegraph-start",
      patternId: this.currentPattern.id,
      stepIndex: this.currentStepIndex,
      totalSteps: this._steps.length,
      dangerCells: this.currentDangerCells,
      telegraphMs: this.phaseRemainingMs,
    });
  }

  _resolveTelegraph() {
    const arena = this.config.arena;
    const results = judgeDodgeForAll(Array.from(this.players.values()), this.currentDangerCells, arena);

    for (const result of results) {
      if (result.dodged) continue;
      const player = this.players.get(result.playerId);
      const damage = calcIncomingDamage(this.boss.attack, player.defenseStat);
      player.hp = Math.max(0, player.hp - damage);
      this.metrics.damageTaken += damage;
    }

    this._emit({ type: "dodge-result", results, playersHp: this._snapshotPlayersHp() });

    if (this._isTeamWiped()) return this._resolve("fail", "defeated");
    if (this._isTimeUp()) return this._resolve("fail", "timeout");

    this.currentStepIndex++;
    if (this.currentStepIndex < this._steps.length) this._beginStep(); // 같은 패턴의 다음 step
    else this._beginStagger();
  }

  _beginStagger() {
    this.phase = "STAGGER";
    this.staggerStartedAt = this.elapsedMs;
    this.phaseRemainingMs = this.config.staggerDurationMs ?? 1200;
    this.metrics.patternsResolved++;
    this._emit({ type: "stagger-start", durationMs: this.phaseRemainingMs });
  }

  _endStagger() {
    this._emit({ type: "stagger-end" });
    if (this._isTimeUp()) return this._resolve("fail", "timeout");
    this._beginNextPattern();
  }

  _isTeamWiped() {
    return Array.from(this.players.values()).every((p) => p.hp <= 0);
  }

  _isTimeUp() {
    const limit = this.config.timeLimitSec;
    return typeof limit === "number" && this.elapsedMs / 1000 >= limit;
  }

  _snapshotPlayersHp() {
    const out = {};
    for (const [id, p] of this.players) out[id] = { hp: p.hp, maxHp: p.maxHp };
    return out;
  }

  _resolve(status, failureReason) {
    this._setState(STATE.RESOLVING);
    const candidate = {
      status, // 'success' | 'fail'
      score: Math.round(this.metrics.damageDealt),
      failureReason: failureReason ?? null, // 성공이어도 이 필드 자체는 항상 있어야 함 (MiniGameResult 계약)
      metrics: {
        clearTimeMs: Math.round(this.elapsedMs),
        ...this.metrics,
        playersHp: this._snapshotPlayersHp(),
        bossHp: this.boss.hp,
        bossMaxHp: this.boss.maxHp,
      },
      reward: null, // 보상 체계는 아직 범위 밖 (TBD)
    };
    this._setState(STATE.COMPLETED);
    this._emit({ type: "complete", candidate });
    if (typeof this.config.onComplete === "function") this.config.onComplete(this.attemptId, candidate);
  }

  // ---- 3단계 렌더링이 참고할 수 있는 현재 상태 스냅샷 ----

  getSnapshot() {
    return {
      state: this.state,
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      currentPatternId: this.currentPattern?.id ?? null,
      dangerCells: this.currentDangerCells,
      staggerRemainingMs: this.phase === "STAGGER" ? Math.max(0, this.phaseRemainingMs) : 0,
      boss: this.boss ? { ...this.boss } : null,
      players: this.players ? Object.fromEntries(this.players) : null,
    };
  }
}
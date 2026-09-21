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

import { positionToCell, GRID, isCellInSet } from "./grid.js";
import { getAvailablePatterns } from "./patterns.js";
import { calcPlayerDamage, calcIncomingDamage, calcMaxHp, DEFAULT_BALANCE } from "./stats.js";
import { getDifficultyTier, getBossHpMultiplier } from "./difficulty.js";
import { judgeDodgeForAll, isCounterValid } from "./judge.js";
import { createRandom } from "./random.js";
import { STATE, assertTransition } from "./state.js";

// 여러 step으로 이루어진 패턴(③ 좌우 스윕, ⑤ 연속 콤보)에서, 첫 step 이후 예고 시간.
// v3 스펙은 "한 칸씩 훑고 지나간다" / "짧은 간격으로 2번" 이라고만 설명하고 구체적인
// 간격 수치는 없어서 (1단계 체크리스트에 "② 좌우 스윕 step별 예고시간 분배는 2단계에서
// 결정"으로 남겨뒀던 항목) 기본 예고시간의 일부로 정하고 최소값은 보장하는 걸로
// 가정해서 구현함. 실제로 플레이해보고 너무 빠르다/느리다 싶으면 이 두 상수만 바꾸면 됨.
//
// 2026-09-06: 처음엔 1/3, 최소 300ms로 넣었는데 실제로 해보니(초현 피드백) 좌우 스윕이
// "그리드 전체를 다 훑고 지나가는" 패턴 특성상, 반격 타이밍을 놓치면 그대로 못 피하고
// 맞는 구간이 너무 잦았음(40초 이후 구간은 800/3≈267 -> 300ms로 사실상 항상 최소치).
// 1/2, 최소 400ms로 완화 - 여전히 "미리 안전한 칸으로 이동해서 대기"하는 예측형 회피가
// 필요하지만, 반응형으로도 어느 정도 따라갈 수 있는 수준으로 늘림. 계속 너무 빡빡하면
// 이 두 상수를 더 키우면 됨.
const STEP_INTERVAL_DIVISOR = 2;
const MIN_STEP_INTERVAL_MS = 400;

// 2026-09-16: 누적형 위험 칸(단일 저격 accumulates) 상한. 계속 쌓이기만 하면 이론상
// 격자 전체가 위험해져서 클리어 자체가 불가능해질 수 있어서, 격자 전체 칸 수의 일정
// 비율(60%)까지만 쌓이게 막아둔다 - 그 이상은 새로 안 쌓이고 기존 위험 칸만 유지된다.
// 60%는 "생존 공간이 줄어드는 압박은 주되 항상 갈 곳은 남겨둔다"는 감으로 정한 값이라
// 플레이테스트로 조정될 수 있음.
const MAX_ACCUMULATED_HAZARD_RATIO = 0.6;

// 2026-09-16 버그 리포트: "대각선 끝나자마자 인지도 못 할 만큼 짧게 네모 공격이
// 겹쳐서 나온다" - 연속 콤보(combo-strike)의 2번째 step은 좌우 스윕처럼 바로 옆
// 칸으로 이어지는 예측 가능한 움직임이 아니라, 완전히 다른/무관한 위치로 갑자기
// 넘어가는 형태라 같은 최소 시간(400ms)으로는 인지할 시간이 부족했다. 그래서
// 패턴별로 다른 최소 시간을 쓸 수 있게 하고(pattern.minStepIntervalMs), 지정 안
// 하면 기존처럼 전역 MIN_STEP_INTERVAL_MS(좌우 스윕 등)를 그대로 쓴다.
function getStepTelegraphMs(tierTelegraphMs, stepIndex, pattern) {
  if (stepIndex === 0) return tierTelegraphMs;
  const minMs = pattern?.minStepIntervalMs ?? MIN_STEP_INTERVAL_MS;
  return Math.max(minMs, Math.round(tierTelegraphMs / STEP_INTERVAL_DIVISOR));
}

let attemptSeq = 0; // 모듈 전체에서 attemptId가 겹치지 않게 부여하기 위한 카운터

export class StatBossEncounter {
  /**
   * @param {object} config
   * @param {{width:number, height:number}} config.arena
   * @param {{id:string, attackStat:number, defenseStat:number, healthStat:number, position:{x:number,y:number}}[]} config.players
   * @param {number} [config.bossAttack=10] - 회피 실패 시 기본 피해.
   * @param {number} [config.bossBaseHp=1000] - 인원수와 무관한 보스 총 체력.
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
    this.sharedBossAuthority = config.sharedBossAuthority === true;
    this.sharedCompletionSent = false;
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
    this.accumulatedHazardCells = []; // 누적형 패턴(단일 저격)이 쌓아온 영구 위험 칸
    this._patternBag = []; // 셔플 백(2026-09-16, 패턴 다양성 개선) - 자세한 설명은 _pickNextPattern() 참고
    this._patternBagKey = null;
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

    const bossBaseHp = this.config.bossBaseHp ?? 1000;
    const multiplier = getBossHpMultiplier(this.players.size);
    const bossMaxHp = Math.round(bossBaseHp * multiplier);
    this.boss = {
      attack: this.config.bossAttack ?? 10,
      maxHp: bossMaxHp,
      hp: bossMaxHp,
    };

    this.elapsedMs = 0;
    this.phase = null;
    this.currentPattern = null;
    this.currentStepIndex = 0;
    this.currentDangerCells = [];
    this.accumulatedHazardCells = [];
    this._patternBag = [];
    this._patternBagKey = null;
    this.phaseRemainingMs = 0;
    this.staggerStartedAt = null;
    this.metrics = {
      damageDealt: 0,
      damageTaken: 0,
      counterSuccesses: 0,
      counterMisses: 0,
      patternsResolved: 0,
    };
    this.sharedCompletionSent = false;
  }

  // ---- Battle lifecycle 계약: init/start/pause/resume/restart/destroy ----

  init() {
    this._setState(STATE.INITIALIZING);
    this._setupInitialState();
    this._setState(STATE.READY);
    this._emit({ type: "ready" });
  }

  /**
   * @param {{attemptId?: string}} [options] - 3단계 host(createBattle 계약)가 이미
   *   attemptId를 만들어서 넘겨주는 경우 그걸 그대로 쓴다(사후게임_기획안.md 14.4:
   *   host가 attemptId를 관리). 안 넘어오면(예: self-check.mjs에서 단독 테스트할 때)
   *   지금처럼 이 모듈이 알아서 하나 만든다 - 기존 self-check.mjs 호출부와 호환 유지.
   */
  start({ attemptId } = {}) {
    this._setState(STATE.RUNNING);
    this.attemptId = attemptId ?? `stat-boss-${Date.now()}-${attemptSeq++}`;
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
  /** COMPLETED -> READY로만 돌아간다 (실제로 RUNNING까지 가려면 이어서 start()를
   *  호출해야 함). 3단계 host(battle.js)는 restart() 직후 바로 start({attemptId})를
   *  호출해서, 밖에서 보기엔 "한 번의 재도전 호출"처럼 보이게 감싸준다. */
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

  /** Apply the server-authoritative boss health without touching local player
   * simulation.  Offline encounters never call this path. */
  syncSharedBossHealth({ bossHp, bossMaxHp } = {}) {
    if (!this.sharedBossAuthority || !this.boss) return false;
    const maxHp = Number(bossMaxHp);
    const hp = Number(bossHp);
    if (!Number.isFinite(maxHp) || maxHp <= 0 || !Number.isFinite(hp)) return false;
    this.boss.maxHp = maxHp;
    this.boss.hp = Math.max(0, Math.min(maxHp, hp));
    return true;
  }

  /** Finish every party member from the same server `battle.finished`
   * snapshot. A local defeat may already have been reported to the host so it
   * can respawn this client; the authoritative CLEAR still wins if it arrives
   * before that respawn settles. */
  completeSharedBattle(snapshot = {}) {
    if (
      !this.sharedBossAuthority ||
      this.sharedCompletionSent ||
      !this.attemptId ||
      ![STATE.RUNNING, STATE.PAUSED, STATE.COMPLETED].includes(this.state)
    ) {
      return false;
    }
    this.syncSharedBossHealth({ ...snapshot, bossHp: 0 });
    this.sharedCompletionSent = true;
    if (this.state === STATE.PAUSED) this._setState(STATE.RUNNING);
    if (this.state === STATE.RUNNING) {
      this._resolve("CLEAR", null);
      return true;
    }
    if (this.state !== STATE.COMPLETED) return false;

    const candidate = this._buildCandidate("CLEAR", null);
    this._emit({ type: "complete", candidate, shared: true });
    this.config.onComplete?.(this.attemptId, candidate);
    return true;
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

  /**
   * 2026-09-06: 경직 시간(예: 1.2초) 안이기만 하면 몇 번을 시도하든 전부 명중 처리되고
   * 있었음(연타 무제한) - v3 3-4절 "경직 시간 동안에만 공격 가능"이 "그 시간 안에서
   * 무제한 연타 가능"이라는 뜻은 아닐 것: 1절/표0에 "회피만 정확하면 데미지는 스탯이
   * 좌우"라고 명시돼있는데, 연타 속도(=컨트롤/반응속도)로 데미지가 무한정 늘어나면
   * 그 설계 의도 자체가 깨짐(스탯이 아니라 손빠르기가 승패를 가르게 됨) - 플레이
   * 테스트로 발견(초현: "기본레벨+혼자서도 계속 클리어됨"의 실제 원인이었을 가능성 높음).
   * 그래서 "경직 1회당 플레이어 1명당 반격 1회"로 제한 - _beginStagger()에서 매 경직마다
   * 초기화되는 this._staggerHitPlayers에 이미 성공한 플레이어를 기록해두고, 같은 경직
   * 동안 또 시도하면 그냥 무시(추가 데미지도, "반격 실패" 표시도 없음 - 이미 한 번
   * 성공했을 뿐이지 잘못 누른 게 아니라서).
   */
  attemptCounter(playerId) {
    if (this.state !== STATE.RUNNING || this.phase !== "STAGGER") return { hit: false };
    const player = this.players.get(playerId);
    if (!player) return { hit: false };
    if (this._staggerHitPlayers.has(playerId)) return { hit: false }; // 이번 경직에 이미 반격 성공함 - 추가 연타는 무시

    const staggerDurationMs = this.config.staggerDurationMs ?? 1200;
    const valid = isCounterValid(this.staggerStartedAt, this.elapsedMs, staggerDurationMs);
    if (!valid) {
      this.metrics.counterMisses++;
      this._emit({ type: "counter-miss", playerId });
      return { hit: false };
    }

    const damage = calcPlayerDamage(player.attackStat, this.balance);
    if (!this.sharedBossAuthority) this.boss.hp = Math.max(0, this.boss.hp - damage);
    this.metrics.damageDealt += damage;
    this.metrics.counterSuccesses++;
    this._staggerHitPlayers.add(playerId);
    this._emit({ type: "counter-hit", playerId, damage, bossHp: this.boss.hp });

    if (!this.sharedBossAuthority && this.boss.hp <= 0) this._resolve("CLEAR", null);
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

    this.currentPattern = this._pickNextPattern(pickFrom);
    this.currentStepIndex = 0;
    this._tierTelegraphMs = tier.telegraphMs;
    this._beginStep();
  }

  /**
   * 2026-09-16: 윤서 피드백("공격 패턴이 너무 단조로운 느낌") 반영.
   * 기존엔 매번 pickFrom 전체에서 완전 독립적으로 랜덤을 뽑았음 - 그러다 보니 후보가
   * 2~3개뿐인 초중반 구간에서는 운 나쁘면 같은 패턴이 여러 번 연달아 나올 수 있어서
   * "단조롭다"는 인상으로 이어졌을 가능성이 큼.
   * "셔플 백(shuffle bag)" 방식으로 바꿔서, 지금 후보 목록에 있는 패턴을 전부 한 번씩
   * 다 쓰기 전까지는 같은 패턴이 다시 나오지 않게 한다(카드 게임에서 "한 벌 다 돌기
   * 전엔 같은 카드가 다시 안 나온다"는 것과 같은 방식) - 매번 뽑을 때마다 확률로만
   * 다양성을 기대하는 대신, 다양성 자체를 구조적으로 보장한다.
   * 후보 목록이 바뀌면(시간 구간이 넘어가서 새 패턴이 후보에 추가/제외되는 경우 등)
   * 그 시점에 새로 셔플한다. 새로 섞은 백의 첫 패턴이 하필 직전 패턴과 같으면(백
   * 경계에서 같은 패턴이 두 번 연달아 나오는 경우) 후보가 2개 이상일 때 다른 자리와
   * 맞바꿔서 피한다.
   * @param {object[]} pickFrom - 지금 시점에 등장 가능한 패턴 정의 목록 (patterns.js)
   */
  _pickNextPattern(pickFrom) {
    const bagKey = pickFrom
      .map((p) => p.id)
      .slice()
      .sort()
      .join(",");

    if (this._patternBag.length === 0 || this._patternBagKey !== bagKey) {
      this._patternBag = this._shuffle(pickFrom);
      this._patternBagKey = bagKey;

      const prevId = this.currentPattern?.id;
      if (this._patternBag.length > 1 && this._patternBag[0].id === prevId) {
        const swapWith = this.random.int(1, this._patternBag.length - 1);
        [this._patternBag[0], this._patternBag[swapWith]] = [this._patternBag[swapWith], this._patternBag[0]];
      }
    }

    return this._patternBag.shift();
  }

  /** random.sample(list, list.length)는 중복 없이 목록 전체를 뽑으므로, 결과적으로
   *  완전히 뒤섞인 순서(셔플)와 같다. */
  _shuffle(list) {
    return this.random.sample(list, list.length);
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
        // 2026-09-16 버그 수정: 광역 확산(area-burst)이 "안전 칸"을 고를 때 이미
        // 영구 위험 칸(누적형 단일 저격이 쌓아온 칸)을 후보로 잘못 포함시키는 문제가
        // 있어서, 패턴이 참고할 수 있게 넘겨준다 (patterns.js area-burst 참고).
        accumulatedHazardCells: [...this.accumulatedHazardCells],
      };
      this._steps = this.currentPattern.getSteps(ctx);
    }

    const step = this._steps[this.currentStepIndex];
    this.currentDangerCells = step.dangerCells;
    this.phase = "TELEGRAPH";
    this.phaseRemainingMs = getStepTelegraphMs(this._tierTelegraphMs, this.currentStepIndex, this.currentPattern);

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
    // 2026-09-16: 이번 step의 위험 칸뿐 아니라, 그동안 누적된 영구 위험 칸
    // (accumulatedHazardCells) 위에 서 있어도 맞는다 - "이번 패턴은 피했는데 예전에
    // 쌓인 위험 칸 위에 있어서 맞는다"가 의도된 동작(유정 피드백: 생존 공간이 점점
    // 줄어드는 기믹).
    const combinedDangerCells = [...this.currentDangerCells, ...this.accumulatedHazardCells];
    const results = judgeDodgeForAll(Array.from(this.players.values()), combinedDangerCells, arena);

    for (const result of results) {
      if (result.dodged) continue;
      const player = this.players.get(result.playerId);
      const damage = calcIncomingDamage(this.boss.attack, player.defenseStat);
      player.hp = Math.max(0, player.hp - damage);
      this.metrics.damageTaken += damage;
    }

    if (this.currentPattern.accumulates) this._accumulateHazard(this.currentDangerCells);

    // dangerCells를 같이 실어 보낸다: 3단계 화면에서 "지금 막 판정된 칸"을
    // 잠깐 빨갛게 플래시해주는 연출에 쓴다(예고=빗금, 실제 판정 순간=단색 빨강).
    this._emit({
      type: "dodge-result",
      results,
      dangerCells: this.currentDangerCells,
      playersHp: this._snapshotPlayersHp(),
    });

    if (this._isTeamWiped()) return this._resolve("FAIL", "defeated");
    if (this._isTimeUp()) return this._resolve("FAIL", "timeout");

    this.currentStepIndex++;
    if (this.currentStepIndex < this._steps.length) this._beginStep(); // 같은 패턴의 다음 step
    else this._beginStagger();
  }

  /** 누적형 패턴(단일 저격)이 판정한 칸을 영구 위험 칸 목록에 더한다. 이미 있는 칸은
   *  중복 추가 안 하고, MAX_ACCUMULATED_HAZARD_RATIO 상한을 넘기면 더 안 쌓는다. */
  _accumulateHazard(cells) {
    const cap = Math.floor(GRID.columns * GRID.rows * MAX_ACCUMULATED_HAZARD_RATIO);
    for (const c of cells) {
      if (this.accumulatedHazardCells.length >= cap) break;
      if (!isCellInSet(c, this.accumulatedHazardCells)) this.accumulatedHazardCells.push(c);
    }
  }

  _beginStagger() {
    this.phase = "STAGGER";
    this.staggerStartedAt = this.elapsedMs;
    this.phaseRemainingMs = this.config.staggerDurationMs ?? 1200;
    this._staggerHitPlayers = new Set(); // 경직 1회당 반격 1회 제한 - 매번 새로 초기화
    this.metrics.patternsResolved++;
    this._emit({ type: "stagger-start", durationMs: this.phaseRemainingMs });
  }

  _endStagger() {
    this._emit({ type: "stagger-end" });
    if (this._isTimeUp()) return this._resolve("FAIL", "timeout");
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

  _buildCandidate(status, failureReason) {
    return {
      status,
      score: Math.round(this.metrics.damageDealt),
      failureReason: failureReason ?? null,
      metrics: {
        clearTimeMs: Math.round(this.elapsedMs),
        ...this.metrics,
        playersHp: this._snapshotPlayersHp(),
        bossHp: this.boss.hp,
        bossMaxHp: this.boss.maxHp,
      },
      reward: null,
    };
  }

  _resolve(status, failureReason) {
    this._setState(STATE.RESOLVING);
    // 'CLEAR' | 'FAIL' and the remaining fields follow MiniGameResult.
    const candidate = this._buildCandidate(status, failureReason);
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
      currentPatternName: this.currentPattern?.name ?? null, // 3단계 화면 표시용 (patterns.js의 name)
      dangerCells: this.currentDangerCells,
      accumulatedHazardCells: [...this.accumulatedHazardCells],
      staggerRemainingMs: this.phase === "STAGGER" ? Math.max(0, this.phaseRemainingMs) : 0,
      boss: this.boss ? { ...this.boss } : null,
      players: this.players ? Object.fromEntries(this.players) : null,
    };
  }
}

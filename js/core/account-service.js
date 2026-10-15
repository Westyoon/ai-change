const STAT_KEYS = Object.freeze(["attack", "hp", "defense"]);
const HAIR_COLORS = new Set(["magenta", "purple", "brown", "blonde"]);
const RANKING_CRITERIA = new Set(["boss-clears", "boss-speed"]);
const RANKED_BOSS_IDS = new Set(["stat-boss", "control-boss"]);
const CLIENT_REWARDED_POSTGAME_IDS = new Set(["xr-egg-trials"]);
const EMPTY_GAME_IDS = Object.freeze([]);
const EMPTY_STORY_IDS = Object.freeze([]);
const ACCOUNT_REQUEST_TIMEOUT_MS = 8_000;
const SESSION_PATH = "/session";
const PLAYER_ACCOUNT_PATH = "/player-account";
const EXPERIENCE_PER_LEVEL = 100;
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 16;
const FORBIDDEN_NICKNAME_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

const EMPTY_STATS = Object.freeze({
  attack: 0,
  hp: 0,
  defense: 0,
  level: 1,
  experience: 0,
  nextLevelExperience: EXPERIENCE_PER_LEVEL,
  clears: 0,
  score: 0,
  unspentPoints: 0,
});

function integer(value, fallback = 0) {
  if (value == null) return fallback;
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isFinite(number)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(number)))
    : fallback;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeAccountNickname(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function validateAccountNickname(value) {
  const normalizedInput = typeof value === "string" ? value.normalize("NFKC") : "";
  const nickname = normalizeAccountNickname(value);
  const length = [...nickname].length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return Object.freeze({
      valid: false,
      nickname,
      error: `닉네임은 ${NICKNAME_MIN_LENGTH}자 이상 ${NICKNAME_MAX_LENGTH}자 이하로 입력해 주세요.`,
    });
  }
  if (FORBIDDEN_NICKNAME_CHARACTER.test(normalizedInput)) {
    return Object.freeze({
      valid: false,
      nickname,
      error: "닉네임에는 제어 문자나 숨김 문자를 사용할 수 없습니다.",
    });
  }
  return Object.freeze({ valid: true, nickname, error: null });
}

function freezeStats(candidate = {}) {
  const clears = integer(candidate.clears);
  // `clears` is a postgame statistic, not a fallback source of progression.
  // Keeping the fields independent prevents old/pre-game completion counts
  // from being interpreted as experience when a partial payload is received.
  const experience = integer(candidate.experience ?? candidate.xp, 0);
  const derivedLevel = 1 + Math.floor((Math.sqrt(1 + 8 * experience / EXPERIENCE_PER_LEVEL) - 1) / 2);
  const level = Math.max(1, integer(candidate.level, derivedLevel));
  const nextLevelExperience = integer(
    candidate.nextLevelExperience ?? candidate.next_level_experience,
    level * EXPERIENCE_PER_LEVEL,
  );
  return Object.freeze({
    attack: integer(candidate.attack),
    hp: integer(candidate.hp ?? candidate.health),
    defense: integer(candidate.defense),
    level,
    experience,
    nextLevelExperience,
    clears,
    score: integer(candidate.score),
    unspentPoints: integer(candidate.unspentPoints ?? candidate.unspent_points),
  });
}

function freezeCompletedGameIds(candidate) {
  if (!Array.isArray(candidate)) return Object.freeze([]);
  return Object.freeze([
    ...new Set(candidate.filter((id) => typeof id === "string" && id.length > 0)),
  ]);
}

function freezeSeenStoryIds(candidate) {
  if (!Array.isArray(candidate)) return Object.freeze([]);
  return Object.freeze([
    ...new Set(candidate.filter((id) => typeof id === "string" && id.length > 0)),
  ]);
}

function findStats(payload) {
  const candidates = [
    payload?.stats,
    payload?.account?.stats,
    payload?.session?.stats,
    payload?.user?.stats,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") ?? null;
}

function frozenState({
  status,
  authenticated = false,
  available = true,
  user = null,
  stats,
  completedGameIds = [],
  seenStoryIds = [],
  error = null,
}) {
  const normalizedNickname = text(user?.nickname);
  const publicUser = user
    ? {
        name: text(user.name ?? user.displayName ?? normalizedNickname, "플레이어"),
        ...(normalizedNickname ? { nickname: normalizedNickname } : {}),
        ...(HAIR_COLORS.has(user.hairColor) ? { hairColor: user.hairColor } : {}),
      }
    : null;
  return Object.freeze({
    status,
    authenticated,
    available,
    user: publicUser ? Object.freeze(publicUser) : null,
    stats: stats ? freezeStats(stats) : EMPTY_STATS,
    completedGameIds: freezeCompletedGameIds(completedGameIds),
    seenStoryIds: freezeSeenStoryIds(seenStoryIds),
    error,
  });
}

function guestState({ available = true, error = null } = {}) {
  return frozenState({ status: available ? "guest" : "unavailable", available, error });
}

function sessionState(payload) {
  const explicitlyGuest = payload?.authenticated === false;
  const user = payload?.user ?? payload?.account?.user ?? payload?.session?.user ?? null;
  const authenticated = !explicitlyGuest && (payload?.authenticated === true || Boolean(user));
  if (!authenticated) return guestState();
  return frozenState({
    status: "authenticated",
    authenticated: true,
    user: user ?? { name: payload?.name },
    stats: findStats(payload) ?? EMPTY_STATS,
    completedGameIds: payload?.completedGameIds,
    seenStoryIds: payload?.seenStoryIds,
  });
}

function friendlyHttpMessage(status) {
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "요청을 처리할 권한이 없습니다.";
  if (status === 409) return "사용 가능한 스탯 포인트가 없습니다.";
  if (status === 429) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "계정 서버가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
  return "계정 요청을 처리하지 못했습니다.";
}

export class AccountServiceError extends Error {
  constructor(message, { status = 0, code = "ACCOUNT_REQUEST_FAILED", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AccountServiceError";
    this.status = status;
    this.code = code;
  }
}

export class AccountService {
  #fetch;
  #apiBase;
  #listeners = new Set();
  #state = frozenState({ status: "idle", available: true });
  #refreshPromise = null;
  #importPromise = null;
  #storyImportPromise = null;
  #authGeneration = 0;

  constructor({ fetchImpl = globalThis.fetch, apiBase = "/api" } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("AccountService requires fetch.");
    }
    // Browser-native fetch is a Web API method and must keep the global object
    // as its receiver. Calling a detached fetch as `this.#fetch(...)` can throw
    // `Illegal invocation` in Chromium/WebView even though the server is healthy.
    this.#fetch = fetchImpl.bind(globalThis);
    this.#apiBase = String(apiBase).replace(/\/$/u, "");
  }

  getState() {
    return this.#state;
  }

  subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("AccountService subscriber must be a function.");
    }
    this.#listeners.add(listener);
    if (emitCurrent) listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  getLoginUrl() {
    return `${this.#apiBase}/auth/google`;
  }

  refreshSession({ timeoutMs = ACCOUNT_REQUEST_TIMEOUT_MS } = {}) {
    if (this.#refreshPromise) return this.#refreshPromise;

    const authGeneration = this.#authGeneration;
    const run = Promise.resolve().then(() => this.#loadSession(authGeneration, timeoutMs));
    const tracked = run.finally(() => {
      if (this.#refreshPromise === tracked) this.#refreshPromise = null;
    });
    this.#refreshPromise = tracked;

    this.#setState(frozenState({
      status: "loading",
      authenticated: this.#state.authenticated,
      available: this.#state.available,
      user: this.#state.user,
      stats: this.#state.stats,
      completedGameIds: this.#state.completedGameIds,
      seenStoryIds: this.#state.seenStoryIds,
    }));
    return this.#refreshPromise;
  }

  async logout() {
    const authGeneration = ++this.#authGeneration;
    try {
      await this.#request("/auth/logout", { method: "POST", body: {} });
      if (authGeneration === this.#authGeneration) this.#setState(guestState());
      return this.#state;
    } catch (error) {
      if (error instanceof AccountServiceError && error.status === 401) {
        return this.#state;
      }
      throw error;
    }
  }

  async getRanking(criteria = "boss-clears", { signal, bossId = null } = {}) {
    if (!RANKING_CRITERIA.has(criteria)) {
      throw new RangeError(`지원하지 않는 랭킹 기준입니다: ${criteria}`);
    }
    const normalizedBossId = text(bossId);
    if (!RANKED_BOSS_IDS.has(normalizedBossId)) {
      throw new TypeError("보스 랭킹에는 스탯 보스 또는 컨트롤 보스 식별자가 필요합니다.");
    }
    const params = new URLSearchParams({ criteria, bossId: normalizedBossId });
    const payload = await this.#request(`/ranking?${params.toString()}`, { signal });
    const rows = Array.isArray(payload)
      ? payload
      : payload?.ranking ?? payload?.rankings ?? payload?.results ?? payload?.data ?? [];
    if (!Array.isArray(rows)) return Object.freeze([]);
    return Object.freeze(rows.map((row, index) => {
      const members = Array.isArray(row?.members)
        ? row.members.map((member) => text(
          typeof member === "string" ? member : member?.name ?? member?.nickname,
        )).filter(Boolean).slice(0, 5)
        : [];
      const partySize = Math.max(1, Math.min(5, integer(row?.partySize ?? row?.party_size, members.length || 1)));
      return Object.freeze({
        rank: integer(row?.rank ?? row?.ranking ?? index + 1, index + 1),
        bossId: text(row?.bossId ?? row?.boss_id, normalizedBossId),
        name: text(row?.name ?? row?.teamName ?? row?.team_name, members[0] ?? "익명 플레이어"),
        teamName: text(row?.teamName ?? row?.team_name),
        members: Object.freeze(members),
        partySize,
        clears: integer(row?.clears),
        clearTimeMs: integer(row?.clearTimeMs ?? row?.clear_time_ms),
      });
    }));
  }

  async importCompletedGameIds(candidate = []) {
    const requestedGameIds = freezeCompletedGameIds(candidate);
    if (requestedGameIds.length === 0) {
      return Object.freeze({ submitted: false, reason: "empty", importedGameIds: EMPTY_GAME_IDS });
    }

    if (this.#importPromise) {
      await this.#importPromise;
      return this.importCompletedGameIds(requestedGameIds);
    }

    const run = Promise.resolve().then(() => this.#importCompletedGameIds(requestedGameIds));
    const tracked = run.finally(() => {
      if (this.#importPromise === tracked) this.#importPromise = null;
    });
    this.#importPromise = tracked;
    return tracked;
  }

  async #importCompletedGameIds(requestedGameIds) {
    if (this.#state.status === "idle" || this.#state.status === "loading") {
      await this.refreshSession();
    }
    if (!this.#state.authenticated) {
      return Object.freeze({ submitted: false, reason: "guest", importedGameIds: EMPTY_GAME_IDS });
    }

    const serverGameIds = new Set(this.#state.completedGameIds);
    const missingGameIds = requestedGameIds.filter((gameId) => !serverGameIds.has(gameId));
    if (missingGameIds.length === 0) {
      return Object.freeze({ submitted: false, reason: "up-to-date", importedGameIds: EMPTY_GAME_IDS });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request("/progress/import", {
      method: "POST",
      body: { completedGameIds: missingGameIds },
    });
    await this.#applyStatsOrRefresh(payload, {
      authGeneration,
      additionalCompletedGameIds: missingGameIds,
    });
    return Object.freeze({
      submitted: true,
      importedGameIds: freezeCompletedGameIds(payload?.importedGameIds),
      stats: this.#state.stats,
    });
  }

  async recordClear({ attemptId, gameId, status, score = null } = {}) {
    if (status !== "CLEAR") {
      return Object.freeze({ submitted: false, reason: "not-clear" });
    }
    if (!text(attemptId) || !text(gameId)) {
      throw new TypeError("클리어 기록에는 attemptId와 gameId가 필요합니다.");
    }

    if (this.#state.status === "idle" || this.#state.status === "loading") {
      await this.refreshSession();
    }
    if (!this.#state.authenticated) {
      return Object.freeze({ submitted: false, reason: "guest" });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request("/results", {
      method: "POST",
      body: {
        attemptId,
        gameId,
        status: "CLEAR",
        score: Number.isFinite(score) ? score : 0,
      },
    });
    await this.#applyStatsOrRefresh(payload, { authGeneration, completedGameId: gameId });
    return Object.freeze({
      submitted: true,
      duplicate:
        payload?.duplicate === true || payload?.created === false || payload?.credited === false,
      awarded:
        payload?.awarded !== false && payload?.duplicate !== true && payload?.credited !== false,
      stats: this.#state.stats,
    });
  }

  async recordPostgameClear({ attemptId, battleId, status, score = null } = {}) {
    if (status !== "CLEAR") {
      return Object.freeze({ submitted: false, reason: "not-clear" });
    }
    if (!text(attemptId) || !CLIENT_REWARDED_POSTGAME_IDS.has(text(battleId))) {
      throw new TypeError("X알 클리어 기록에는 올바른 attemptId와 battleId가 필요합니다.");
    }

    if (this.#state.status === "idle" || this.#state.status === "loading") {
      await this.refreshSession();
    }
    if (!this.#state.authenticated) {
      return Object.freeze({ submitted: false, reason: "guest" });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request("/postgame/results", {
      method: "POST",
      body: {
        attemptId,
        battleId,
        status: "CLEAR",
        score: Number.isFinite(score) ? score : 0,
      },
    });
    await this.#applyStatsOrRefresh(payload, { authGeneration });
    return Object.freeze({
      submitted: true,
      duplicate:
        payload?.duplicate === true || payload?.created === false || payload?.credited === false,
      awarded:
        payload?.awarded !== false && payload?.duplicate !== true && payload?.credited !== false,
      experienceAwarded: Number.isInteger(payload?.experienceAwarded) ? payload.experienceAwarded : 0,
      stats: this.#state.stats,
    });
  }

  async allocateStat(stat) {
    if (!STAT_KEYS.includes(stat)) {
      throw new RangeError(`지원하지 않는 스탯입니다: ${stat}`);
    }
    if (!this.#state.authenticated) {
      throw new AccountServiceError("스탯을 올리려면 먼저 로그인해 주세요.", {
        status: 401,
        code: "AUTH_REQUIRED",
      });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request("/stats/allocate", {
      method: "POST",
      body: { stat },
    });
    await this.#applyStatsOrRefresh(payload, { authGeneration });
    return this.#state.stats;
  }

  async importSeenStoryIds(candidate = []) {
    const requestedStoryIds = freezeSeenStoryIds(candidate);
    if (requestedStoryIds.length === 0) {
      return Object.freeze({ submitted: false, reason: "empty", seenStoryIds: EMPTY_STORY_IDS });
    }

    if (this.#storyImportPromise) {
      await this.#storyImportPromise;
      return this.importSeenStoryIds(requestedStoryIds);
    }

    const run = Promise.resolve().then(() => this.#importSeenStoryIds(requestedStoryIds));
    const tracked = run.finally(() => {
      if (this.#storyImportPromise === tracked) this.#storyImportPromise = null;
    });
    this.#storyImportPromise = tracked;
    return tracked;
  }

  async markStorySeen(storyId) {
    const normalized = text(storyId);
    if (!normalized) throw new TypeError("스토리 식별자가 필요합니다.");
    return this.importSeenStoryIds([normalized]);
  }

  async #importSeenStoryIds(requestedStoryIds) {
    if (this.#state.status === "idle" || this.#state.status === "loading") {
      await this.refreshSession();
    }
    if (!this.#state.authenticated) {
      return Object.freeze({ submitted: false, reason: "guest", seenStoryIds: EMPTY_STORY_IDS });
    }

    const existing = new Set(this.#state.seenStoryIds);
    const missing = requestedStoryIds.filter((storyId) => !existing.has(storyId));
    if (missing.length === 0) {
      return Object.freeze({
        submitted: false,
        reason: "up-to-date",
        seenStoryIds: this.#state.seenStoryIds,
      });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request("/story-progress", {
      method: "POST",
      body: { seenStoryIds: missing },
    });
    if (authGeneration !== this.#authGeneration || !this.#state.authenticated) {
      return Object.freeze({ submitted: false, reason: "session-changed", seenStoryIds: EMPTY_STORY_IDS });
    }
    const seenStoryIds = freezeSeenStoryIds(payload?.seenStoryIds);
    this.#setState(frozenState({
      status: "authenticated",
      authenticated: true,
      available: this.#state.available,
      user: this.#state.user,
      stats: this.#state.stats,
      completedGameIds: this.#state.completedGameIds,
      seenStoryIds,
    }));
    return Object.freeze({ submitted: true, seenStoryIds });
  }

  async updateHairColor(hairColor) {
    if (!this.#state.authenticated) throw new AccountServiceError("로그인이 필요합니다.", { status: 401, code: "AUTH_REQUIRED" });
    if (!HAIR_COLORS.has(hairColor)) throw new AccountServiceError("머리색을 선택해 주세요.", { status: 400, code: "INVALID_HAIR_COLOR" });
    const generation = this.#authGeneration;
    const payload = await this.#request("/player-appearance", { method: "PATCH", body: { hairColor } });
    if (generation !== this.#authGeneration) return this.#state.user;
    const next = sessionState(payload);
    if (!next.authenticated || next.user?.hairColor !== hairColor) {
      throw new AccountServiceError("머리색을 저장하지 못했습니다. 다시 시도해 주세요.", { code: "INVALID_RESPONSE" });
    }
    this.#setState(next);
    return this.#state.user;
  }

  async updateNickname(candidate) {
    if (!this.#state.authenticated) {
      throw new AccountServiceError("닉네임을 저장하려면 먼저 로그인해 주세요.", {
        status: 401,
        code: "AUTH_REQUIRED",
      });
    }
    const validation = validateAccountNickname(candidate);
    if (!validation.valid) {
      throw new AccountServiceError(validation.error, {
        status: 400,
        code: "INVALID_NICKNAME",
      });
    }

    const authGeneration = this.#authGeneration;
    const payload = await this.#request(PLAYER_ACCOUNT_PATH, {
      method: "PATCH",
      body: { nickname: validation.nickname },
    });
    if (authGeneration !== this.#authGeneration) return this.#state.user;

    const next = sessionState(payload);
    if (!next.authenticated) {
      throw new AccountServiceError("닉네임을 저장한 뒤 계정 정보를 확인하지 못했습니다.", {
        code: "INVALID_RESPONSE",
      });
    }
    this.#setState(next);
    return this.#state.user;
  }

  async #loadSession(authGeneration, timeoutMs) {
    try {
      const payload = await this.#request(SESSION_PATH, {
        allowUnauthorized: true,
        timeoutMs,
      });
      const next = payload === null ? guestState() : sessionState(payload);
      if (authGeneration !== this.#authGeneration) return this.#state;
      if (this.#state.authenticated && !next.authenticated) this.#authGeneration += 1;
      this.#setState(next);
      return next;
    } catch (error) {
      const wrongHost = error instanceof AccountServiceError
        && (error.status === 403 || error.code === "INVALID_RESPONSE");
      const requestError = error instanceof AccountServiceError ? error.message : null;
      const unavailable = guestState({
        available: false,
        error: wrongHost
          ? "현재 주소에는 계정 서버가 연결되어 있지 않습니다. 운영 주소에서 다시 열어 주세요."
          : `${requestError ?? "계정 서버에 연결할 수 없습니다."} 게임은 게스트로 계속할 수 있습니다.`,
      });
      if (authGeneration !== this.#authGeneration) return this.#state;
      if (this.#state.authenticated) this.#authGeneration += 1;
      this.#setState(unavailable);
      return unavailable;
    }
  }

  async #applyStatsOrRefresh(
    payload,
    {
      authGeneration = this.#authGeneration,
      completedGameId = null,
      additionalCompletedGameIds = [],
    } = {},
  ) {
    if (authGeneration !== this.#authGeneration || !this.#state.authenticated) return;
    const stats = findStats(payload);
    if (stats) {
      const hasAuthoritativeCompletedGameIds = Array.isArray(payload?.completedGameIds);
      const completedGameIds = new Set(
        hasAuthoritativeCompletedGameIds
          ? payload.completedGameIds
          : this.#state.completedGameIds,
      );
      if (completedGameId) completedGameIds.add(completedGameId);
      if (!hasAuthoritativeCompletedGameIds) {
        for (const gameId of additionalCompletedGameIds) completedGameIds.add(gameId);
      }
      this.#setState(frozenState({
        status: "authenticated",
        authenticated: true,
        user: this.#state.user,
        stats,
        completedGameIds: [...completedGameIds],
        seenStoryIds: this.#state.seenStoryIds,
      }));
      return;
    }
    await this.refreshSession();
  }

  async #request(
    path,
    {
      method = "GET",
      body,
      signal,
      allowUnauthorized = false,
      timeoutMs = ACCOUNT_REQUEST_TIMEOUT_MS,
    } = {},
  ) {
    const requestController = new AbortController();
    let timedOut = false;
    const forwardAbort = () => requestController.abort(signal?.reason);
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener?.("abort", forwardAbort, { once: true });
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, Math.max(1, Number(timeoutMs) || ACCOUNT_REQUEST_TIMEOUT_MS));

    try {
      let response;
      try {
        const headers = { Accept: "application/json" };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        response = await this.#fetch(`${this.#apiBase}${path}`, {
          method,
          credentials: "same-origin",
          cache: "no-store",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: requestController.signal,
        });
      } catch (cause) {
        if (cause?.name === "AbortError" && signal?.aborted) throw cause;
        if (timedOut) {
          throw new AccountServiceError("계정 서버 응답 시간이 초과되었습니다.", {
            code: "ACCOUNT_TIMEOUT",
            cause,
          });
        }
        throw new AccountServiceError("계정 서버에 연결할 수 없습니다.", {
          code: "ACCOUNT_UNAVAILABLE",
          cause,
        });
      }

      if (allowUnauthorized && response.status === 401) return null;

      let payload = null;
      let raw = "";
      try {
        raw = await response.text();
        payload = raw ? JSON.parse(raw) : null;
      } catch (cause) {
        if (cause?.name === "AbortError" && signal?.aborted) throw cause;
        if (timedOut) {
          throw new AccountServiceError("계정 서버 응답 시간이 초과되었습니다.", {
            code: "ACCOUNT_TIMEOUT",
            cause,
          });
        }
        if (response.ok) {
          throw new AccountServiceError("현재 주소에는 계정 API가 연결되어 있지 않습니다.", {
            status: response.status,
            code: "INVALID_RESPONSE",
            cause,
          });
        }
        payload = null;
      }

      if (!response.ok) {
        if (response.status === 401) {
          this.#authGeneration += 1;
          this.#setState(guestState());
        }
        throw new AccountServiceError(friendlyHttpMessage(response.status), {
          status: response.status,
          code: text(payload?.code, "ACCOUNT_REQUEST_FAILED"),
        });
      }
      return payload;
    } finally {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener?.("abort", forwardAbort);
    }
  }

  #setState(next) {
    this.#state = next;
    for (const listener of [...this.#listeners]) {
      try {
        listener(next);
      } catch (error) {
        console.error("AccountService subscriber failed", error);
      }
    }
  }
}

export function createAccountService(options) {
  return new AccountService(options);
}

export { ACCOUNT_REQUEST_TIMEOUT_MS, EMPTY_STATS, RANKING_CRITERIA, STAT_KEYS };

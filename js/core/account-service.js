const STAT_KEYS = Object.freeze(["attack", "hp", "defense"]);
const RANKING_CRITERIA = new Set(["score", "clears"]);

const EMPTY_STATS = Object.freeze({
  attack: 0,
  hp: 0,
  defense: 0,
  clears: 0,
  score: 0,
  unspentPoints: 0,
});

function integer(value, fallback = 0) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function freezeStats(candidate = {}) {
  return Object.freeze({
    attack: integer(candidate.attack),
    hp: integer(candidate.hp ?? candidate.health),
    defense: integer(candidate.defense),
    clears: integer(candidate.clears),
    score: integer(candidate.score),
    unspentPoints: integer(candidate.unspentPoints ?? candidate.unspent_points),
  });
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

function frozenState({ status, authenticated = false, available = true, user = null, stats, error = null }) {
  return Object.freeze({
    status,
    authenticated,
    available,
    user: user ? Object.freeze({ name: text(user.name ?? user.displayName, "플레이어") }) : null,
    stats: stats ? freezeStats(stats) : EMPTY_STATS,
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

  constructor({ fetchImpl = globalThis.fetch, apiBase = "/api" } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("AccountService requires fetch.");
    }
    this.#fetch = fetchImpl;
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

  refreshSession() {
    if (this.#refreshPromise) return this.#refreshPromise;

    this.#setState(frozenState({
      status: "loading",
      authenticated: this.#state.authenticated,
      available: this.#state.available,
      user: this.#state.user,
      stats: this.#state.stats,
    }));

    this.#refreshPromise = this.#loadSession().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  async logout() {
    try {
      await this.#request("/auth/logout", { method: "POST", body: {} });
      this.#setState(guestState());
      return this.#state;
    } catch (error) {
      if (error instanceof AccountServiceError && error.status === 401) {
        this.#setState(guestState());
        return this.#state;
      }
      throw error;
    }
  }

  async getRanking(criteria = "clears", { signal, gameId = null } = {}) {
    if (!RANKING_CRITERIA.has(criteria)) {
      throw new RangeError(`지원하지 않는 랭킹 기준입니다: ${criteria}`);
    }
    const params = new URLSearchParams({ criteria });
    if (criteria === "score") {
      const normalizedGameId = text(gameId);
      if (!normalizedGameId) {
        throw new TypeError("점수 랭킹에는 gameId가 필요합니다.");
      }
      params.set("gameId", normalizedGameId);
    }
    const payload = await this.#request(`/ranking?${params.toString()}`, { signal });
    const rows = Array.isArray(payload)
      ? payload
      : payload?.ranking ?? payload?.rankings ?? payload?.results ?? payload?.data ?? [];
    if (!Array.isArray(rows)) return Object.freeze([]);
    return Object.freeze(rows.map((row, index) => Object.freeze({
      rank: integer(row?.rank ?? row?.ranking ?? index + 1, index + 1),
      name: text(row?.name ?? row?.displayName ?? row?.user_name, "익명 플레이어"),
      score: integer(row?.score),
      clears: integer(row?.clears),
    })));
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

    const payload = await this.#request("/results", {
      method: "POST",
      body: {
        attemptId,
        gameId,
        status: "CLEAR",
        score: Number.isFinite(score) ? score : 0,
      },
    });
    await this.#applyStatsOrRefresh(payload);
    return Object.freeze({
      submitted: true,
      duplicate:
        payload?.duplicate === true || payload?.created === false || payload?.credited === false,
      awarded:
        payload?.awarded !== false && payload?.duplicate !== true && payload?.credited !== false,
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

    const payload = await this.#request("/stats/allocate", {
      method: "POST",
      body: { stat },
    });
    await this.#applyStatsOrRefresh(payload);
    return this.#state.stats;
  }

  async #loadSession() {
    try {
      const payload = await this.#request("/session", { allowUnauthorized: true });
      const next = payload === null ? guestState() : sessionState(payload);
      this.#setState(next);
      return next;
    } catch (error) {
      const unavailable = guestState({
        available: false,
        error: "계정 서버에 연결할 수 없습니다. 게임은 게스트로 계속할 수 있습니다.",
      });
      this.#setState(unavailable);
      return unavailable;
    }
  }

  async #applyStatsOrRefresh(payload) {
    const stats = findStats(payload);
    if (stats) {
      this.#setState(frozenState({
        status: "authenticated",
        authenticated: true,
        user: this.#state.user,
        stats,
      }));
      return;
    }
    await this.refreshSession();
  }

  async #request(path, { method = "GET", body, signal, allowUnauthorized = false } = {}) {
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
        signal,
      });
    } catch (cause) {
      if (cause?.name === "AbortError") throw cause;
      throw new AccountServiceError("계정 서버에 연결할 수 없습니다.", {
        code: "ACCOUNT_UNAVAILABLE",
        cause,
      });
    }

    if (allowUnauthorized && response.status === 401) return null;

    let payload = null;
    try {
      const raw = await response.text();
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401) this.#setState(guestState());
      throw new AccountServiceError(friendlyHttpMessage(response.status), {
        status: response.status,
        code: text(payload?.code, "ACCOUNT_REQUEST_FAILED"),
      });
    }
    return payload;
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

export { EMPTY_STATS, RANKING_CRITERIA, STAT_KEYS };

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AccountService,
  normalizeAccountNickname,
  validateAccountNickname,
} from "../../js/core/account-service.js";
import {
  consumeAuthCallback,
  refreshSessionAfterAuth,
} from "../../js/scenes/loading-scene.js";
import {
  accountConnectionMessage,
  ACCOUNT_ORIGIN,
  LOCAL_ACCOUNT_ORIGIN,
  isLikelyEmbeddedBrowser,
  isSeparateHostedOrigin,
  recoverSessionAfterAuth,
} from "../../js/scenes/account-scene.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return payload === null ? "" : JSON.stringify(payload);
    },
  };
}

function textResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return payload;
    },
  };
}

function queuedFetch(responses) {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };
  return { calls, fetchImpl };
}

function deferredResponse() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("AccountService restores a same-origin session and exposes only display account fields", async () => {
  const mock = queuedFetch([jsonResponse({
    authenticated: true,
    user: { id: "must-not-leak", email: "hidden@example.com", name: "테스터" },
    stats: {
      attack: "3",
      hp: 8,
      defense: 2,
      level: "5",
      experience: "450",
      next_level_experience: "500",
      clears: 4,
      score: 950,
      unspent_points: 1,
    },
    completedGameIds: ["data-number-baseball", "data-number-baseball", "computer-code-heart"],
    seenStoryIds: ["main-story-intro", "npc-ds", "npc-ds"],
  })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const state = await service.refreshSession();

  assert.equal(state.status, "authenticated");
  assert.deepEqual(state.user, { name: "테스터" });
  assert.equal(Object.hasOwn(state.user, "email"), false);
  assert.deepEqual(state.stats, {
    attack: 3,
    hp: 8,
    defense: 2,
    level: 5,
    experience: 450,
    nextLevelExperience: 500,
    clears: 4,
    score: 950,
    unspentPoints: 1,
  });
  assert.deepEqual(state.completedGameIds, ["data-number-baseball", "computer-code-heart"]);
  assert.deepEqual(state.seenStoryIds, ["main-story-intro", "npc-ds"]);
  assert.equal(mock.calls[0][0], "/api/session");
  assert.equal(mock.calls[0][1].credentials, "same-origin");
  assert.equal(mock.calls[0][1].cache, "no-store");
  assert.equal(service.getLoginUrl(), "/api/auth/google");
});

test("nickname validation matches the account API normalization contract", () => {
  assert.equal(normalizeAccountNickname("  ＡＩ   체인지  "), "AI 체인지");
  assert.deepEqual(validateAccountNickname("  ＡＩ   체인지  "), {
    valid: true,
    nickname: "AI 체인지",
    error: null,
  });
  assert.equal(validateAccountNickname("가").valid, false);
  assert.match(validateAccountNickname("가").error, /2자 이상 16자 이하/u);
  assert.equal(validateAccountNickname("열일곱글자닉네임입니다가나다라마바사").valid, false);
  assert.equal(validateAccountNickname("가\u200b나").valid, false);
  assert.match(validateAccountNickname("가\u200b나").error, /숨김 문자/u);
  assert.equal(validateAccountNickname("가\t나").valid, false);
  assert.equal(validateAccountNickname("가\u2028나").valid, false);
  assert.equal(validateAccountNickname("가\u2029나").valid, false);
});

test("AccountService binds browser-native fetch to the global receiver", async () => {
  let receiver = null;
  async function browserFetch() {
    receiver = this;
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return jsonResponse({ authenticated: false });
  }
  const service = new AccountService({ fetchImpl: browserFetch });

  const state = await service.refreshSession();

  assert.equal(receiver, globalThis);
  assert.equal(state.status, "guest");
  assert.equal(state.available, true);
});

test("AccountService saves a normalized nickname and replaces the session payload", async () => {
  const stats = {
    attack: 2,
    hp: 100,
    defense: 1,
    level: 2,
    experience: 100,
    nextLevelExperience: 200,
    clears: 1,
    score: 300,
    unspentPoints: 0,
  };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "Google 이름" },
      stats,
      completedGameIds: ["data-number-baseball"],
    }),
    jsonResponse({
      authenticated: true,
      user: { name: "AI 체인지", nickname: "AI 체인지" },
      stats,
      completedGameIds: ["data-number-baseball"],
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const user = await service.updateNickname("  ＡＩ   체인지  ");

  assert.equal(mock.calls[1][0], "/api/player-account");
  assert.equal(mock.calls[1][1].method, "PATCH");
  assert.equal(mock.calls[1][1].credentials, "same-origin");
  assert.deepEqual(JSON.parse(mock.calls[1][1].body), { nickname: "AI 체인지" });
  assert.deepEqual(user, { name: "AI 체인지", nickname: "AI 체인지" });
  assert.deepEqual(service.getState().user, user);
  assert.deepEqual(service.getState().completedGameIds, ["data-number-baseball"]);
});

test("AccountService rejects invalid nickname updates before making a request", async () => {
  const mock = queuedFetch([jsonResponse({
    authenticated: true,
    user: { name: "플레이어" },
    stats: {},
  })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  await assert.rejects(() => service.updateNickname("한"), /2자 이상 16자 이하/u);
  await assert.rejects(() => service.updateNickname("한\u200b글"), /숨김 문자/u);
  assert.equal(mock.calls.length, 1);
});

test("account UI keeps the requested privacy copy and accessible nickname form contract", () => {
  const source = readFileSync(
    new URL("../../js/scenes/account-scene.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /스토리 진행도를 로그인하여 계정에 연결합니다\. Google 계정 식별자와 이메일은 로그인 연결에만 사용하며 이 외에는 공개하지 않습니다\./u,
  );
  assert.match(source, /for: "account-nickname"/u);
  assert.match(source, /"aria-describedby": nicknameError/u);
  assert.match(source, /"aria-invalid": nicknameError/u);
  assert.match(source, /id: "account-nickname-error", role: "alert"/u);
  assert.match(source, /type: "submit"/u);
  assert.match(source, /busyAction === "nickname" \? "저장 중…" : "닉네임 저장"/u);
});

test("AccountService never derives progression from clears and accepts unbounded server levels", async () => {
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "기존 계정" },
      stats: { attack: 1, hp: 100, defense: 1, clears: 3, score: 10, unspentPoints: 0 },
    }),
    jsonResponse({
      credited: true,
      awarded: false,
      stats: {
        attack: 1,
        hp: 100,
        defense: 1,
        level: 13,
        experience: 1200,
        nextLevelExperience: 1300,
        clears: 12,
        score: 10,
        unspentPoints: 0,
      },
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const restored = await service.refreshSession();
  assert.equal(restored.stats.clears, 3);
  assert.equal(restored.stats.level, 1);
  assert.equal(restored.stats.experience, 0);
  assert.equal(restored.stats.nextLevelExperience, 100);

  await service.recordClear({
    attemptId: "legacy-account:cap-check",
    gameId: "data-number-baseball",
    status: "CLEAR",
    score: 10,
  });
  const progressed = service.getState().stats;
  assert.equal(progressed.level, 13);
  assert.equal(progressed.experience, 1200);
  assert.equal(progressed.nextLevelExperience, 1300);
});

test("session restore falls back to a playable guest state when the API is unavailable", async () => {
  const mock = queuedFetch([new TypeError("network down")]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  const observed = [];
  service.subscribe((state) => observed.push(state.status));

  const state = await service.refreshSession();

  assert.equal(state.authenticated, false);
  assert.equal(state.available, false);
  assert.equal(state.status, "unavailable");
  assert.match(state.error, /게스트/u);
  assert.deepEqual(observed, ["idle", "loading", "unavailable"]);
});

test("AccountService can recover an authenticated session after a transient fetch failure", async () => {
  const mock = queuedFetch([
    new TypeError("temporary network failure"),
    jsonResponse({
      authenticated: true,
      user: { name: "복구된 계정" },
      stats: { attack: 1, hp: 100, defense: 0 },
      completedGameIds: ["data-number-baseball"],
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const unavailable = await service.refreshSession();
  const recovered = await service.refreshSession();

  assert.equal(unavailable.status, "unavailable");
  assert.equal(recovered.status, "authenticated");
  assert.equal(recovered.authenticated, true);
  assert.deepEqual(recovered.user, { name: "복구된 계정" });
  assert.deepEqual(recovered.completedGameIds, ["data-number-baseball"]);
  assert.equal(mock.calls.length, 2);
});

test("session restore preserves a useful server failure message", async () => {
  const mock = queuedFetch([jsonResponse({ error: "Internal Server Error" }, 500)]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const state = await service.refreshSession();

  assert.equal(state.status, "unavailable");
  assert.match(state.error, /잠시 응답하지 않습니다/u);
});

test("session restore times out instead of leaving the loading screen pending forever", async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const service = new AccountService({ fetchImpl });

  const state = await service.refreshSession({ timeoutMs: 5 });

  assert.equal(state.status, "unavailable");
  assert.equal(state.available, false);
  assert.match(state.error, /시간이 초과/u);
});

test("session restore timeout also covers a stalled response body", async () => {
  const fetchImpl = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted while reading body");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  const service = new AccountService({ fetchImpl });

  const state = await service.refreshSession({ timeoutMs: 5 });

  assert.equal(state.status, "unavailable");
  assert.equal(state.available, false);
  assert.match(state.error, /시간이 초과/u);
});

test("a failed successful-response body cannot be mistaken for a guest session", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() {
      throw new Error("response body failed");
    },
  });
  const service = new AccountService({ fetchImpl });

  const state = await service.refreshSession();

  assert.equal(state.status, "unavailable");
  assert.equal(state.available, false);
  assert.match(state.error, /운영 주소/u);
});

test("a successful OAuth callback retries session discovery until the cookie is visible", async () => {
  const states = [
    { authenticated: false, status: "unavailable" },
    { authenticated: false, status: "guest" },
    { authenticated: true, status: "authenticated" },
  ];
  const calls = [];
  const waited = [];
  const service = {
    async refreshSession(options) {
      calls.push(options);
      return states.shift();
    },
  };

  const state = await refreshSessionAfterAuth(service, {
    authCallback: true,
    retryDelaysMs: [150, 500, 1_000],
    wait: async (delayMs) => {
      waited.push(delayMs);
      return true;
    },
  });

  assert.equal(state.authenticated, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls, [
    { timeoutMs: 4_000 },
    { timeoutMs: 4_000 },
    { timeoutMs: 4_000 },
  ]);
  assert.deepEqual(waited, [150, 500]);
});

test("the account scene recovers after all quick callback checks were unavailable", async () => {
  const states = [
    { authenticated: false, status: "unavailable" },
    { authenticated: false, status: "unavailable" },
    { authenticated: true, status: "authenticated" },
  ];
  const refreshCalls = [];
  const waited = [];
  const service = {
    getState() {
      return states[0];
    },
    async refreshSession(options) {
      refreshCalls.push(options);
      states.shift();
      return states[0];
    },
  };

  const state = await recoverSessionAfterAuth(service, {
    retryDelaysMs: [0, 1_000, 3_000],
    wait: async (delayMs) => {
      waited.push(delayMs);
      return true;
    },
  });

  assert.equal(state.authenticated, true);
  assert.deepEqual(refreshCalls, [undefined, undefined]);
  assert.deepEqual(waited, [0, 1_000]);
});

test("account recovery does not refresh after another request restores the session", async () => {
  let state = { authenticated: false, status: "unavailable" };
  let refreshCalls = 0;
  const service = {
    getState() {
      return state;
    },
    async refreshSession() {
      refreshCalls += 1;
      return state;
    },
  };

  const recovered = await recoverSessionAfterAuth(service, {
    retryDelaysMs: [1_000],
    wait: async () => {
      state = { authenticated: true, status: "authenticated" };
      return true;
    },
  });

  assert.equal(recovered.authenticated, true);
  assert.equal(refreshCalls, 0);
});

test("account recovery stops before refreshing when its scene is aborted", async () => {
  const controller = new AbortController();
  const state = { authenticated: false, status: "unavailable" };
  let refreshCalls = 0;
  const service = {
    getState() {
      return state;
    },
    async refreshSession() {
      refreshCalls += 1;
      return state;
    },
  };

  const recovered = await recoverSessionAfterAuth(service, {
    signal: controller.signal,
    retryDelaysMs: [1_000],
    wait: async () => {
      controller.abort();
      return true;
    },
  });

  assert.equal(recovered, state);
  assert.equal(refreshCalls, 0);
});

test("an unauthenticated session remains a normal available guest", async () => {
  const mock = queuedFetch([jsonResponse({ authenticated: false }, 401)]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const state = await service.refreshSession();

  assert.equal(state.status, "guest");
  assert.equal(state.available, true);
  assert.equal(state.error, null);
  assert.deepEqual(state.completedGameIds, []);
});

test("a successful HTML response is reported as unavailable instead of a false guest", async () => {
  const mock = queuedFetch([textResponse("<!doctype html><title>Static site</title>")]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const state = await service.refreshSession();

  assert.equal(state.status, "unavailable");
  assert.equal(state.available, false);
  assert.equal(state.authenticated, false);
});

test("recordClear stores authenticated pre-game completion without awarding progression", async () => {
  const unchangedStats = {
    attack: 0,
    hp: 100,
    defense: 0,
    level: 1,
    experience: 0,
    nextLevelExperience: 100,
    clears: 0,
    score: 0,
    unspentPoints: 0,
  };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "플레이어" },
      stats: unchangedStats,
    }),
    jsonResponse({
      credited: true,
      duplicate: false,
      awarded: false,
      stats: unchangedStats,
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const skipped = await service.recordClear({
    attemptId: "attempt-fail",
    gameId: "game-a",
    status: "FAIL",
    score: 9999,
  });
  assert.deepEqual(skipped, { submitted: false, reason: "not-clear" });
  assert.equal(mock.calls.length, 1);

  const submitted = await service.recordClear({
    attemptId: "game-a:attempt-1",
    gameId: "game-a",
    status: "CLEAR",
    score: 1200,
  });
  const request = mock.calls[1];
  assert.equal(request[0], "/api/results");
  assert.equal(request[1].method, "POST");
  assert.deepEqual(JSON.parse(request[1].body), {
    attemptId: "game-a:attempt-1",
    gameId: "game-a",
    status: "CLEAR",
    score: 1200,
  });
  assert.equal(submitted.submitted, true);
  assert.equal(submitted.duplicate, false);
  assert.equal(submitted.awarded, false);
  assert.deepEqual(service.getState().stats, unchangedStats);
  assert.deepEqual(service.getState().completedGameIds, ["game-a"]);
});

test("recordClear treats an uncredited replay as a duplicate without another reward", async () => {
  const stats = { attack: 0, hp: 100, defense: 0, clears: 1, score: 1200, unspentPoints: 1 };
  const mock = queuedFetch([
    jsonResponse({ authenticated: true, user: { name: "플레이어" }, stats }),
    jsonResponse({ credited: false, duplicate: true, awarded: false, stats }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const submission = await service.recordClear({
    attemptId: "game-a:attempt-1",
    gameId: "game-a",
    status: "CLEAR",
    score: 1200,
  });

  assert.equal(submission.submitted, true);
  assert.equal(submission.duplicate, true);
  assert.equal(submission.awarded, false);
});

test("recordPostgameClear awards one X-egg clear and reports a retry as a duplicate", async () => {
  const initialStats = {
    attack: 0,
    hp: 100,
    defense: 0,
    level: 1,
    experience: 0,
    nextLevelExperience: 100,
    clears: 0,
    score: 0,
    unspentPoints: 0,
  };
  const rewardedStats = {
    ...initialStats,
    level: 2,
    experience: 100,
    nextLevelExperience: 200,
    clears: 1,
    unspentPoints: 1,
  };
  const mock = queuedFetch([
    jsonResponse({ authenticated: true, user: { name: "X알 사냥꾼" }, stats: initialStats }),
    jsonResponse({ credited: true, duplicate: false, awarded: true, stats: rewardedStats }, 201),
    jsonResponse({ credited: false, duplicate: true, awarded: false, stats: rewardedStats }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  assert.deepEqual(
    await service.recordPostgameClear({
      attemptId: "xr-egg-trials:failed",
      battleId: "xr-egg-trials",
      status: "FAIL",
      score: 30,
    }),
    { submitted: false, reason: "not-clear" },
  );
  await assert.rejects(
    () => service.recordPostgameClear({
      attemptId: "data-sphinx:forged",
      battleId: "data-sphinx",
      status: "CLEAR",
      score: 999,
    }),
    /X알 클리어 기록/u,
  );
  assert.equal(mock.calls.length, 1, "failed and non-X-egg results must stay client-side");

  const first = await service.recordPostgameClear({
    attemptId: "xr-egg-trials:attempt-1",
    battleId: "xr-egg-trials",
    status: "CLEAR",
    score: 700,
  });
  assert.equal(mock.calls[1][0], "/api/postgame/results");
  assert.equal(mock.calls[1][1].method, "POST");
  assert.deepEqual(JSON.parse(mock.calls[1][1].body), {
    attemptId: "xr-egg-trials:attempt-1",
    battleId: "xr-egg-trials",
    status: "CLEAR",
    score: 700,
  });
  assert.equal(first.submitted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.awarded, true);
  assert.deepEqual(first.stats, rewardedStats);

  const duplicate = await service.recordPostgameClear({
    attemptId: "xr-egg-trials:attempt-1",
    battleId: "xr-egg-trials",
    status: "CLEAR",
    score: 700,
  });
  assert.equal(duplicate.submitted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.awarded, false);
  assert.deepEqual(service.getState().stats, rewardedStats);
});

test("recordPostgameClear does not submit a guest X-egg result", async () => {
  const mock = queuedFetch([jsonResponse({ authenticated: false })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  const result = await service.recordPostgameClear({
    attemptId: "xr-egg-trials:guest-1",
    battleId: "xr-egg-trials",
    status: "CLEAR",
    score: 100,
  });

  assert.deepEqual(result, { submitted: false, reason: "guest" });
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0][0], "/api/session");
});

test("guest progress import is a no-op until the player is authenticated", async () => {
  const mock = queuedFetch([jsonResponse({ authenticated: false })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  await service.importCompletedGameIds([
    "data-number-baseball",
    "computer-code-heart",
  ]);

  assert.equal(mock.calls.length, 1, "guest progress must not be sent to an account endpoint");
  assert.equal(mock.calls[0][0], "/api/session");
  assert.equal(service.getState().authenticated, false);
  assert.deepEqual(service.getState().completedGameIds, []);
});

test("guest progress import sends only missing unique games and becomes a repeat no-op", async () => {
  const initialStats = {
    attack: 1,
    hp: 100,
    defense: 2,
    clears: 1,
    score: 450,
    unspentPoints: 0,
  };
  const importedStats = { ...initialStats };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "진행 이전 테스터" },
      stats: initialStats,
      completedGameIds: ["data-number-baseball"],
    }),
    jsonResponse({
      importedGameIds: ["computer-code-heart"],
      stats: importedStats,
      completedGameIds: [
        "data-number-baseball",
        "computer-code-heart",
        "ai-ball-classification",
      ],
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const imported = await service.importCompletedGameIds([
    "data-number-baseball",
    "computer-code-heart",
    "computer-code-heart",
  ]);

  assert.equal(mock.calls.length, 2);
  const request = mock.calls[1];
  assert.equal(request[0], "/api/progress/import");
  assert.equal(request[1].method, "POST");
  assert.equal(request[1].credentials, "same-origin");
  assert.equal(request[1].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request[1].body), {
    completedGameIds: ["computer-code-heart"],
  });
  assert.deepEqual(imported.importedGameIds, ["computer-code-heart"]);
  assert.equal(Object.isFrozen(imported), true);
  assert.equal(Object.isFrozen(imported.importedGameIds), true);
  assert.equal(service.getState().stats.clears, 1);
  assert.equal(service.getState().stats.unspentPoints, 0);
  assert.deepEqual(service.getState().user, { name: "진행 이전 테스터" });
  assert.deepEqual(service.getState().completedGameIds, [
    "data-number-baseball",
    "computer-code-heart",
    "ai-ball-classification",
  ]);

  await service.importCompletedGameIds([
    "data-number-baseball",
    "computer-code-heart",
  ]);
  assert.equal(mock.calls.length, 2, "already imported progress must not be posted again");
});

test("concurrent imports share one request and recheck completion after it finishes", async () => {
  const pendingImport = deferredResponse();
  const stats = {
    attack: 0,
    hp: 100,
    defense: 0,
    clears: 0,
    score: 0,
    unspentPoints: 0,
  };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "동시 요청 테스터" },
      stats,
      completedGameIds: [],
    }),
    pendingImport.promise,
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const first = service.importCompletedGameIds(["computer-code-heart"]);
  const second = service.importCompletedGameIds(["computer-code-heart"]);
  await Promise.resolve();

  assert.equal(mock.calls.length, 2, "session plus exactly one import request is expected");
  assert.equal(
    mock.calls.filter(([url]) => url === "/api/progress/import").length,
    1,
  );

  pendingImport.resolve(jsonResponse({
    importedGameIds: ["computer-code-heart"],
    stats,
    completedGameIds: ["computer-code-heart"],
  }));
  const results = await Promise.all([first, second]);

  assert.deepEqual(results.map((result) => result.submitted), [true, false]);
  assert.deepEqual(service.getState().completedGameIds, ["computer-code-heart"]);
  assert.equal(
    mock.calls.filter(([url]) => url === "/api/progress/import").length,
    1,
  );
});

test("a late import response cannot restore authentication after logout", async () => {
  const pendingImport = deferredResponse();
  const initialStats = {
    attack: 2,
    hp: 100,
    defense: 1,
    clears: 1,
    score: 500,
    unspentPoints: 0,
  };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "로그아웃 테스터" },
      stats: initialStats,
      completedGameIds: ["data-number-baseball"],
    }),
    pendingImport.promise,
    jsonResponse({ authenticated: false }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const importing = service.importCompletedGameIds(["computer-code-heart"]);
  await Promise.resolve();
  assert.equal(mock.calls[1][0], "/api/progress/import");

  await service.logout();
  assert.equal(mock.calls[2][0], "/api/auth/logout");
  assert.equal(service.getState().status, "guest");
  assert.equal(service.getState().authenticated, false);

  pendingImport.resolve(jsonResponse({
    importedGameIds: ["computer-code-heart"],
    stats: initialStats,
    completedGameIds: ["data-number-baseball", "computer-code-heart"],
  }));
  await importing;

  assert.equal(service.getState().status, "guest");
  assert.equal(service.getState().authenticated, false);
  assert.equal(service.getState().user, null);
  assert.deepEqual(service.getState().completedGameIds, []);
});

test("allocateStat uses the authenticated account and never accepts arbitrary columns", async () => {
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "플레이어" },
      stats: { attack: 1, hp: 100, defense: 0, clears: 1, score: 50, unspentPoints: 1 },
    }),
    jsonResponse({
      stats: { attack: 2, hp: 100, defense: 0, clears: 1, score: 50, unspentPoints: 0 },
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  await assert.rejects(() => service.allocateStat("score"), /지원하지 않는 스탯/u);
  const stats = await service.allocateStat("attack");

  assert.equal(mock.calls[1][0], "/api/stats/allocate");
  assert.deepEqual(JSON.parse(mock.calls[1][1].body), { stat: "attack" });
  assert.equal(stats.attack, 2);
  assert.equal(stats.unspentPoints, 0);
});

test("ranking criteria are allowlisted and common response shapes are normalized", async () => {
  const mock = queuedFetch([jsonResponse({ rankings: [
    {
      rank: 1,
      bossId: "stat-boss",
      name: "알고리즘 원정대",
      teamName: "알고리즘 원정대",
      members: ["가람", "나래"],
      partySize: 2,
      clears: "7",
      clearTimeMs: "65432",
    },
    {
      name: "다온",
      members: ["다온"],
      party_size: 1,
      clears: 3,
      clear_time_ms: 70000,
    },
  ] })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  await assert.rejects(() => service.getRanking("email"), /지원하지 않는 랭킹 기준/u);
  await assert.rejects(() => service.getRanking("boss-clears"), /보스 랭킹/u);
  await assert.rejects(
    () => service.getRanking("boss-clears", { bossId: "data-sphinx" }),
    /보스 랭킹/u,
  );
  const ranking = await service.getRanking("boss-speed", { bossId: "stat-boss" });

  assert.deepEqual(ranking, [
    {
      rank: 1,
      bossId: "stat-boss",
      name: "알고리즘 원정대",
      teamName: "알고리즘 원정대",
      members: ["가람", "나래"],
      partySize: 2,
      clears: 7,
      clearTimeMs: 65432,
    },
    {
      rank: 2,
      bossId: "stat-boss",
      name: "다온",
      teamName: "",
      members: ["다온"],
      partySize: 1,
      clears: 3,
      clearTimeMs: 70000,
    },
  ]);
  assert.equal(mock.calls[0][0], "/api/ranking?criteria=boss-speed&bossId=stat-boss");
});

test("OAuth callback parameters route to account UI and are removed from the visible URL", () => {
  const replacements = [];
  const result = consumeAuthCallback(
    { pathname: "/", search: "?login=success&campaign=festival", hash: "#play" },
    { state: { preserved: true }, replaceState: (...args) => replacements.push(args) },
  );

  assert.equal(result.noticeTone, "info");
  assert.equal(result.authCallback, "success");
  assert.match(result.notice, /인증.*확인/u);
  assert.deepEqual(replacements, [[{ preserved: true }, "", "/?campaign=festival#play"]]);
});

test("hosted copies always send account login to the canonical Worker", () => {
  assert.equal(
    isSeparateHostedOrigin(new URL(`${ACCOUNT_ORIGIN}/`)),
    false,
  );
  assert.equal(
    isSeparateHostedOrigin(new URL("https://preview.example/")),
    true,
  );
  assert.equal(
    isSeparateHostedOrigin(new URL("http://127.0.0.1:4173/")),
    true,
  );
  assert.equal(
    isSeparateHostedOrigin(new URL(`${LOCAL_ACCOUNT_ORIGIN}/`)),
    false,
  );
  assert.equal(
    isSeparateHostedOrigin(new URL("http://localhost:8787/")),
    true,
  );
  assert.equal(
    isSeparateHostedOrigin(new URL("http://[::1]:8787/")),
    true,
  );
  assert.equal(
    isSeparateHostedOrigin({ origin: "null", protocol: "vscode-webview:", hostname: "" }),
    true,
  );
  assert.match(
    accountConnectionMessage(
      { error: "generic network failure" },
      new URL("https://preview.example/"),
    ),
    new RegExp(ACCOUNT_ORIGIN.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
  );
  assert.equal(
    accountConnectionMessage(
      { error: "계정 서버 응답 시간이 초과되었습니다." },
      new URL(`${ACCOUNT_ORIGIN}/`),
    ),
    "계정 서버 응답 시간이 초과되었습니다.",
  );
  assert.equal(isLikelyEmbeddedBrowser({ userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36" }), false);
  assert.equal(isLikelyEmbeddedBrowser({ userAgent: "Mozilla/5.0 Electron/30.0 Code/1.92" }), true);
  const topLevelWindow = {};
  topLevelWindow.self = topLevelWindow;
  topLevelWindow.top = topLevelWindow;
  assert.equal(
    isLikelyEmbeddedBrowser(
      { userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36" },
      topLevelWindow,
    ),
    false,
  );
  assert.equal(
    isLikelyEmbeddedBrowser(
      { userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36" },
      { self: {}, top: {} },
    ),
    true,
  );
  assert.match(
    accountConnectionMessage(
      { error: "계정 서버에 연결할 수 없습니다." },
      new URL(`${ACCOUNT_ORIGIN}/`),
      { userAgent: "Mozilla/5.0 Electron/30.0 Code/1.92" },
    ),
    /VS Code.*연결 다시 확인.*Chrome\/Edge/u,
  );
  assert.match(
    accountConnectionMessage(
      { error: "계정 서버에 연결할 수 없습니다." },
      new URL(`${ACCOUNT_ORIGIN}/`),
      { userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36" },
      { self: {}, top: {} },
    ),
    /같은 탭.*연결 다시 확인.*Chrome\/Edge/u,
  );
  assert.match(
    accountConnectionMessage(
      { error: "ignored" },
      { origin: "null", protocol: "vscode-webview:", hostname: "" },
      { userAgent: "Mozilla/5.0 Electron/30.0 Code/1.92" },
    ),
    /계정 API.*VS Code.*Chrome\/Edge/u,
  );
});

test("account story progress posts only unseen ids and stays separate from game stats", async () => {
  const stats = {
    attack: 1,
    hp: 100,
    defense: 2,
    clears: 1,
    score: 450,
    unspentPoints: 0,
  };
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "스토리 테스터" },
      stats,
      completedGameIds: ["data-number-baseball"],
      seenStoryIds: ["main-story-intro"],
    }),
    jsonResponse({
      seenStoryIds: ["main-story-intro", "npc-ds"],
    }),
  ]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });
  await service.refreshSession();

  const imported = await service.importSeenStoryIds([
    "main-story-intro",
    "npc-ds",
    "npc-ds",
  ]);

  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[1][0], "/api/story-progress");
  assert.equal(mock.calls[1][1].method, "POST");
  assert.deepEqual(JSON.parse(mock.calls[1][1].body), { seenStoryIds: ["npc-ds"] });
  assert.deepEqual(imported.seenStoryIds, ["main-story-intro", "npc-ds"]);
  assert.deepEqual(service.getState().seenStoryIds, ["main-story-intro", "npc-ds"]);
  assert.deepEqual(service.getState().stats, {
    ...stats,
    level: 1,
    experience: 0,
    nextLevelExperience: 100,
  });
  assert.deepEqual(service.getState().completedGameIds, ["data-number-baseball"]);

  await service.markStorySeen("npc-ds");
  assert.equal(mock.calls.length, 2, "an already-seen story must not be posted twice");
});

test("the account scene keeps automatic recovery and a manual connection retry", () => {
  const source = readFileSync(
    new URL("../../js/scenes/account-scene.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /연결 다시 확인/u);
  assert.match(source, /recoveryPending/u);
  assert.match(source, /accountConnectionMessage\(state\)/u);
  assert.match(source, /ACCOUNT_RECONNECT_DELAYS_MS/u);
  assert.match(source, /visibilitychange/u);
  assert.match(source, /"online"/u);
  assert.match(source, /clearTimeout\(reconnectTimer\)/u);
  assert.match(source, /\.finally\(\(\) => \{/u);
  assert.match(source, /getSeenStoryIds/u);
  assert.match(source, /importSeenStoryIds\(pendingStoryIds\)/u);
});

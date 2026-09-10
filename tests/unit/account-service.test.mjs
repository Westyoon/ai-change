import assert from "node:assert/strict";
import test from "node:test";
import { AccountService } from "../../js/core/account-service.js";
import { consumeAuthCallback } from "../../js/scenes/loading-scene.js";

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
      clears: 4,
      score: 950,
      unspent_points: 1,
    },
    completedGameIds: ["data-number-baseball", "data-number-baseball", "computer-code-heart"],
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
    clears: 4,
    score: 950,
    unspentPoints: 1,
  });
  assert.deepEqual(state.completedGameIds, ["data-number-baseball", "computer-code-heart"]);
  assert.equal(mock.calls[0][0], "/api/session");
  assert.equal(mock.calls[0][1].credentials, "same-origin");
  assert.equal(mock.calls[0][1].cache, "no-store");
  assert.equal(service.getLoginUrl(), "/api/auth/google");
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

test("recordClear submits only authenticated CLEAR results and refreshes account stats", async () => {
  const mock = queuedFetch([
    jsonResponse({
      authenticated: true,
      user: { name: "플레이어" },
      stats: { attack: 0, hp: 100, defense: 0, clears: 0, score: 0, unspentPoints: 0 },
    }),
    jsonResponse({
      created: true,
      awarded: true,
      stats: { attack: 0, hp: 100, defense: 0, clears: 1, score: 1200, unspent_points: 1 },
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
  assert.equal(submitted.awarded, true);
  assert.equal(service.getState().stats.clears, 1);
  assert.equal(service.getState().stats.unspentPoints, 1);
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
  const importedStats = {
    ...initialStats,
    clears: 2,
    unspentPoints: 1,
  };
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
  assert.equal(service.getState().stats.clears, 2);
  assert.equal(service.getState().stats.unspentPoints, 1);
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
    stats: { ...stats, clears: 1, unspentPoints: 1 },
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
    stats: { ...initialStats, clears: 2, unspentPoints: 1 },
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
    { rank: 1, displayName: "A", score: "1500", clears: 3 },
    { name: "B", score: 900, clears: "7" },
  ] })]);
  const service = new AccountService({ fetchImpl: mock.fetchImpl });

  await assert.rejects(() => service.getRanking("email"), /지원하지 않는 랭킹 기준/u);
  await assert.rejects(() => service.getRanking("score"), /gameId/u);
  const ranking = await service.getRanking("score", { gameId: "computer-code-heart" });

  assert.deepEqual(ranking, [
    { rank: 1, name: "A", score: 1500, clears: 3 },
    { rank: 2, name: "B", score: 900, clears: 7 },
  ]);
  assert.equal(mock.calls[0][0], "/api/ranking?criteria=score&gameId=computer-code-heart");
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

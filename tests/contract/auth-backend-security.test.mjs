import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function fromRoot(relativePath) {
  return path.join(projectRoot, ...relativePath.split("/"));
}

async function read(relativePath) {
  return readFile(fromRoot(relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await stat(fromRoot(relativePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
}

function registeredApiPaths(source) {
  return new Set(
    [...source.matchAll(/url\.pathname\s*===\s*["'](\/api\/[^"']+)["']/gu)]
      .map((match) => match[1]),
  );
}

function functionBody(source, name) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u");
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `missing Worker function: ${name}`);
  const remainder = source.slice(start + 1);
  const nextFunction = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, start + 1 + nextFunction);
}

const [
  workerSource,
  wranglerConfig,
  packageSource,
  backendPackageSource,
  gitignore,
  buildSource,
  accountSource,
  loadingSource,
  accountSceneSource,
  battleSceneSource,
  minigamesSource,
] =
  await Promise.all([
    read("backend/src/index.ts"),
    read("backend/wrangler.toml"),
    read("package.json"),
    read("backend/package.json"),
    read(".gitignore"),
    read("scripts/build.mjs"),
    read("js/core/account-service.js"),
    read("js/scenes/loading-scene.js"),
    read("js/scenes/account-scene.js"),
    read("js/scenes/battle-scene.js"),
    read("data/minigames.json"),
  ]);

const rootPackage = JSON.parse(packageSource);
const backendPackage = JSON.parse(backendPackageSource);

test("the same-origin Worker exposes only the intended account API surface", () => {
  const paths = registeredApiPaths(workerSource);
  const requiredPaths = [
    "/api/health",
    "/api/auth/google",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/player-account",
    "/api/me",
    "/api/session",
    "/api/ranking",
    "/api/results",
    "/api/postgame/results",
    "/api/progress/import",
    "/api/stats/allocate",
  ];

  for (const apiPath of requiredPaths) {
    assert.ok(paths.has(apiPath), `missing API route: ${apiPath}`);
  }
  assert.equal(paths.has("/api/users"), false, "a public users endpoint must not be restored");
  assert.equal(paths.has("/api/stats"), false, "the legacy raw stats mutation must remain unavailable");
  assert.equal(
    [...paths].some((apiPath) => apiPath.startsWith("/api/stats/") && apiPath !== "/api/stats/allocate"),
    false,
    "provider/user IDs must not select a public stats resource",
  );

  assert.doesNotMatch(workerSource, /\bbody\s*(?:\.\s*|\[\s*["'])user_?id\b/iu);
  assert.doesNotMatch(workerSource, /requireMethod\s*\(\s*request\s*,\s*["']PUT["']\s*\)/u);
  assert.match(workerSource, /requireSession\s*\(\s*request\s*,\s*env\s*\)/u);
});

test("pre-game progress is authenticated, allowlisted, idempotent, and completion-only", () => {
  const importProgress = functionBody(workerSource, "importCompletedProgress");
  const recordResult = functionBody(workerSource, "recordResult");

  assert.match(importProgress, /requireMethod\s*\(\s*request\s*,\s*["']POST["']\s*\)/u);
  assert.match(importProgress, /requireMutationRequest\s*\(\s*request\s*,\s*origin\s*\)/u);
  assert.match(importProgress, /requireSession\s*\(\s*request\s*,\s*env\s*\)/u);
  assert.match(importProgress, /Array\.isArray\s*\([^)]*completedGameIds/u);
  assert.match(importProgress, /Object\.keys\s*\(\s*body\s*\)/u);
  assert.match(importProgress, /completedGameIdsInput\.length\s*>\s*ALLOWED_GAME_IDS\.size/u);
  assert.match(importProgress, /ALLOWED_GAME_IDS\.has\s*\(/u);
  assert.match(importProgress, /new\s+Set\s*\(/u);
  assert.match(importProgress, /NOT\s+EXISTS/iu);
  assert.match(importProgress, /(?:INSERT\s+OR\s+IGNORE|ON\s+CONFLICT)/iu);
  assert.match(importProgress, /SELECT\s+\?,\s*\?,\s*\?,\s*\?,\s*['"]CLEAR['"],\s*0/iu);
  assert.match(importProgress, /GUEST_IMPORT_ATTEMPT_PREFIX/u);
  assert.match(workerSource, /GUEST_IMPORT_ATTEMPT_PREFIX\s*=\s*["']guest-import[^"']*["']/u);
  assert.match(importProgress, /completedGameIds/u);
  assert.match(importProgress, /fetchStats\s*\(/u);
  assert.match(importProgress, /fetchCompletedGameIds\s*\(/u);
  assert.match(recordResult, /attemptId\.startsWith\s*\(\s*GUEST_IMPORT_ATTEMPT_PREFIX\s*\)/u);
  assert.match(recordResult, /awarded:\s*false/u);
  assert.doesNotMatch(importProgress, /UPDATE\s+stats/iu);
  assert.doesNotMatch(recordResult, /UPDATE\s+stats/iu);
  assert.doesNotMatch(importProgress, /experience\s*=|level\s*=|unspent_points\s*=/iu);
  assert.doesNotMatch(recordResult, /experience\s*=|level\s*=|unspent_points\s*=/iu);
  assert.doesNotMatch(importProgress, /\bbody\s*(?:\.\s*|\[\s*["'])user_?id\b/iu);
  assert.doesNotMatch(importProgress, /\bbody\s*(?:\.\s*|\[\s*["'])score\b/iu);
});

test("the X-egg reward notice requires a submitted, nonduplicate server award", () => {
  assert.match(
    battleSceneSource,
    /submission\?\.submitted\s*&&\s*!submission\.duplicate\s*&&\s*submission\.awarded/u,
  );
});

test("the Worker progress allowlist matches every checked-in mini-game id", () => {
  const block = workerSource.match(
    /const\s+ALLOWED_GAME_IDS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/u,
  )?.[1] ?? "";
  const allowedGameIds = [...block.matchAll(/["']([^"']+)["']/gu)]
    .map((match) => match[1])
    .sort();
  const runtimeGameIds = JSON.parse(minigamesSource).minigames
    .map((game) => game.id)
    .sort();

  assert.deepEqual(allowedGameIds, runtimeGameIds);
});

test("authenticated UI connects normalized local completion to visible account progress", () => {
  const synchronizationSources = [loadingSource, accountSceneSource].join("\n");
  assert.match(synchronizationSources, /getCompletedMiniGameIds\s*\(\s*\)/u);
  assert.match(synchronizationSources, /importCompletedGameIds\s*\(/u);
  assert.match(accountSceneSource, /state\.completedGameIds\.filter\s*\(/u);
  assert.match(accountSceneSource, /사전게임 진행/u);
});

test("the account UI and Worker share one canonical production origin", () => {
  const clientOrigin = accountSceneSource.match(
    /ACCOUNT_ORIGIN\s*=\s*["']([^"']+)["']/u,
  )?.[1];
  const workerOrigin = wranglerConfig.match(
    /PUBLIC_ORIGIN\s*=\s*["']([^"']+)["']/u,
  )?.[1];
  assert.equal(clientOrigin, workerOrigin);
  assert.match(accountSceneSource, /const\s+separateAccountOrigin\s*=\s*isSeparateHostedOrigin\(\)/u);
  assert.match(
    accountSceneSource,
    /params\.authCallback\s*===\s*["']success["'][\s\S]*?recoverSessionAfterAuth\s*\(\s*service/u,
  );

  const awaitIndex = loadingSource.indexOf("await sessionRefresh");
  const accountRouteIndex = loadingSource.indexOf('navigate(authCallback ? "account"');
  assert.ok(awaitIndex >= 0 && accountRouteIndex > awaitIndex);
  assert.match(loadingSource, /await\s+sessionRefresh;\s*if\s*\(signal\.aborted\s*\|\|\s*!mounted\)\s*return;/u);
  assert.doesNotMatch(loadingSource, /await\s+accountProgressSync/u);
});

test("mutations require a same-origin JSON request and wildcard CORS is absent", () => {
  assert.match(workerSource, /headers\.get\s*\(\s*["']Origin["']\s*\)/u);
  assert.match(workerSource, /application\/json/iu);
  assert.doesNotMatch(
    workerSource,
    /Access-Control-Allow-Origin[\s\S]{0,100}(?:["'`]\s*\*|\*\s*["'`])/iu,
  );
});

test("OAuth state and hashed, expiring server sessions are enforced", () => {
  const callback = functionBody(workerSource, "finishGoogleLogin");
  const sessionLookup = functionBody(workerSource, "getSession");
  const logout = functionBody(workerSource, "logout");

  assert.match(workerSource, /searchParams[\s\S]{0,500}\bstate\b/u);
  assert.match(callback, /searchParams\.get\s*\(\s*["']state["']\s*\)/u);
  assert.match(callback, /expectedStates\.includes\s*\(\s*suppliedState\s*\)/u);
  assert.match(workerSource, /oauth-state/iu);
  assert.match(workerSource, /HttpOnly/iu);
  assert.match(workerSource, /SameSite=Lax/iu);
  assert.match(workerSource, /SameSite=None; Secure; Partitioned/iu);
  assert.match(workerSource, /__Host-ai-change-session-partitioned/u);
  assert.match(workerSource, /__Host-ai-change-oauth-state-partitioned/u);

  assert.match(workerSource, /crypto\.subtle\.digest\s*\(\s*["']SHA-256["']/u);
  assert.match(sessionLookup, /sha256\s*\(\s*token\s*\)/u);
  assert.match(sessionLookup, /token_hash/u);
  assert.match(sessionLookup, /expires_at\s*>/u);
  assert.match(sessionLookup, /for\s*\(\s*const\s+token\s+of\s+tokens\s*\)/u);
  assert.match(sessionLookup, /if\s*\(\s*session\s*\)\s*return\s+session/u);
  assert.match(workerSource, /__Host-[A-Za-z0-9-]+/u);
  assert.match(workerSource, /Path=\/;[\s\S]{0,80}HttpOnly;[\s\S]{0,80}SameSite=Lax/u);
  assert.match(workerSource, /protocol\s*===\s*["']https:["'][\s\S]{0,80}["']; Secure["']/u);
  assert.doesNotMatch(workerSource, /sessionCookie\s*\(\s*userId\b/u);
  const sessionCookieIndex = callback.indexOf("appendSessionCookies(response, request, sessionToken");
  const stateCleanupCookieIndex = callback.indexOf('appendStateCookies(response, "", request, 0)');
  assert.ok(
    sessionCookieIndex >= 0
      && stateCleanupCookieIndex >= 0
      && sessionCookieIndex < stateCleanupCookieIndex,
    "the login session cookie must be emitted before the OAuth state cleanup cookie",
  );
  assert.match(logout, /cookieCandidates\s*\([\s\S]*PARTITIONED_SESSION_COOKIE/u);
  assert.match(logout, /for\s*\(\s*const\s+token\s+of\s+tokens\s*\)/u);
  assert.match(logout, /appendSessionCookies\s*\(\s*response\s*,\s*request\s*,\s*["']["']\s*,\s*0\s*\)/u);
});

test("ranking returns only server-recorded boss team display data", () => {
  const ranking = functionBody(workerSource, "ranking");
  assert.match(ranking, /name/u);
  assert.match(ranking, /teamName/u);
  assert.match(ranking, /members/u);
  assert.match(ranking, /clears/u);
  assert.match(ranking, /clearTimeMs/u);
  assert.match(ranking, /boss_runs/u);
  assert.match(ranking, /boss_run_members/u);
  assert.match(ranking, /RANKED_BOSS_IDS\.has\s*\(\s*bossId\s*\)/u);
  assert.doesNotMatch(ranking, /game_results|ALLOWED_GAME_IDS/u);
  assert.doesNotMatch(ranking, /\bemail\b/iu);
  assert.doesNotMatch(ranking, /\b(?:email|userId|user_id)\s*:/iu);
});

test("D1 migrations preserve the baseline and add secure sessions and idempotent results", async () => {
  const migrationDirectory = fromRoot("backend/migrations");
  const names = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(names.length >= 2, "the imported baseline and its secure upgrade must be versioned separately");

  const migrations = (await Promise.all(names.map((name) => read(`backend/migrations/${name}`)))).join("\n");
  for (const table of ["users", "stats", "sessions", "game_results"]) {
    assert.match(migrations, new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, "iu"));
  }
  assert.match(migrations, /\bunspent_points\b/iu);
  assert.match(migrations, /\btoken_hash\b/iu);
  assert.doesNotMatch(migrations, /\btoken\s+TEXT\b/iu);
  assert.match(migrations, /UNIQUE\s*\(\s*user_id\s*,\s*attempt_id\s*\)/iu);
  assert.match(migrations, /FOREIGN\s+KEY\s*\(\s*user_id\s*\)/iu);
});

test("level progression is unbounded and only postgame clears can advance it", async () => {
  const boundedMigration = await read("backend/migrations/0003_level_progression.sql");
  const unboundedMigration = await read("backend/migrations/0004_unbounded_level_progression.sql");
  const postgameMigration = await read("backend/migrations/0010_postgame_progression.sql");
  const importProgress = functionBody(workerSource, "importCompletedProgress");
  const recordResult = functionBody(workerSource, "recordResult");
  const recordPostgameResult = functionBody(workerSource, "recordPostgameResult");

  assert.match(boundedMigration, /ADD\s+COLUMN\s+level[\s\S]*BETWEEN\s+1\s+AND\s+10/iu);
  assert.match(boundedMigration, /ADD\s+COLUMN\s+experience[\s\S]*BETWEEN\s+0\s+AND\s+900/iu);
  const backfill = boundedMigration.match(/UPDATE\s+stats[\s\S]*?;/iu)?.[0] ?? "";
  assert.ok(backfill, "level progression backfill is missing");
  assert.doesNotMatch(backfill, /unspent_points/iu);

  assert.match(unboundedMigration, /CREATE\s+TABLE\s+stats_unbounded_progression/iu);
  assert.match(unboundedMigration, /CHECK\s*\(\s*level\s*>=\s*1\s*\)/iu);
  assert.match(unboundedMigration, /CHECK\s*\(\s*experience\s*>=\s*0\s*\)/iu);
  assert.doesNotMatch(unboundedMigration, /level[^\n]*<=\s*10|experience[^\n]*<=\s*900/iu);
  assert.match(unboundedMigration, /FOREIGN\s+KEY\s*\(\s*user_id\s*\)[\s\S]*ON\s+DELETE\s+CASCADE/iu);
  assert.match(unboundedMigration, /CREATE\s+INDEX\s+idx_stats_score/iu);
  assert.match(unboundedMigration, /CREATE\s+INDEX\s+idx_stats_clears/iu);

  const progressionSource = await read("backend/src/progression.ts");
  assert.match(progressionSource, /EXPERIENCE_PER_POSTGAME_CLEAR\s*=\s*100\s*\+\s*Math\.floor\(random\(\)\s*\*\s*11\)\s*\*\s*10/u);
  assert.match(progressionSource, /EXPERIENCE_PER_LEVEL\s*=\s*100/u);
  assert.doesNotMatch(workerSource, /MAX_LEVEL/u);
  for (const source of [importProgress, recordResult]) {
    assert.doesNotMatch(source, /UPDATE\s+stats/iu);
    assert.doesNotMatch(source, /EXPERIENCE_PER_POSTGAME_CLEAR|unspent_points\s*=/u);
  }
  assert.match(workerSource, /CLIENT_REWARDED_POSTGAME_ID\s*=\s*["']xr-egg-trials["']/u);
  assert.match(recordPostgameResult, /battleId\s*!==\s*CLIENT_REWARDED_POSTGAME_ID/u);
  assert.match(recordPostgameResult, /INSERT\s+INTO\s+postgame_results/iu);
  assert.match(recordPostgameResult, /ON\s+CONFLICT\s*\(\s*user_id\s*,\s*attempt_id\s*\)\s+DO\s+NOTHING/iu);
  assert.match(recordPostgameResult, /awarded\s*=\s*0/iu);
  assert.match(recordPostgameResult, /experience\s*=\s*COALESCE\(experience,\s*0\)\s*\+\s*\$\{EXPERIENCE_PER_POSTGAME_CLEAR\}/u);
  assert.match(recordPostgameResult, /level\s*=\s*COALESCE\(level,\s*1\)\s*\+\s*\(\$\{POSTGAME_LEVEL_GAIN_SQL\}\)/u);
  assert.match(recordPostgameResult, /unspent_points\s*=\s*COALESCE\(unspent_points,\s*0\)\s*\+\s*\(\$\{POSTGAME_LEVEL_GAIN_SQL\}\)/u);
  assert.match(recordPostgameResult, /WHERE\s+user_id\s*=\s*\?[\s\S]*awarded\s*=\s*0/iu);
  assert.match(recordPostgameResult, /SET\s+awarded\s*=\s*1/iu);
  assert.match(recordPostgameResult, /awarded\s*=\s*Number\(awardResult\.meta\.changes/u);
  assert.match(workerSource, /nextLevelExperience\s*:\s*level\s*\*\s*EXPERIENCE_PER_LEVEL/u);

  for (const source of [postgameMigration, await read("backend/schema.sql")]) {
    assert.match(source, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+postgame_results/iu);
    assert.match(source, /content_id\s+IN\s*\(\s*['"]xr-egg-trials['"]\s*,\s*['"]data-sphinx['"]\s*,\s*['"]stat-boss['"]\s*,\s*['"]control-boss['"]\s*\)/iu);
    assert.match(source, /UNIQUE\s*\(\s*user_id\s*,\s*attempt_id\s*\)/iu);
    assert.match(source, /awarded\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0[\s\S]*CHECK\s*\(\s*awarded\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/iu);
  }
});

test("Wrangler serves dist and runs the API before same-origin static assets", () => {
  assert.match(wranglerConfig, /^\s*\[assets\]\s*$/imu);
  assert.match(wranglerConfig, /^\s*directory\s*=\s*["']\.\.\/dist["']\s*$/imu);
  assert.match(wranglerConfig, /^\s*binding\s*=\s*["']ASSETS["']\s*$/imu);
  assert.match(wranglerConfig, /^\s*run_worker_first\s*=\s*\[[^\]]*["']\/api\/\*["'][^\]]*\]\s*$/imu);
  assert.match(wranglerConfig, /^\s*\[\[d1_databases\]\]\s*$/imu);
  assert.match(wranglerConfig, /^\s*migrations_dir\s*=\s*["']migrations["']\s*$/imu);
});

test("root commands expose one API-first production deployment path", () => {
  assert.equal(rootPackage.scripts["cf:full:dev"], "npm --prefix backend run dev");
  assert.match(rootPackage.scripts["cf:full:check"], /npm --prefix backend run typecheck/u);
  assert.match(rootPackage.scripts["cf:full:deploy"], /npm --prefix backend run deploy/u);
  assert.equal(rootPackage.scripts["cf:deploy:production"], "npm run cf:full:deploy");
  assert.equal(rootPackage.scripts["cf:full:db:migrate:local"], "npm --prefix backend run db:migrate:local");
  assert.equal(rootPackage.scripts["cf:full:db:migrate:remote"], "npm --prefix backend run db:migrate:remote");

  for (const script of [
    "cf:deploy:pages-redirect",
    "cf:deploy:staging",
    "cf:deploy:worker:production",
    "cf:deploy:worker:staging",
    "cf:deploy:temporary",
  ]) {
    assert.equal(rootPackage.scripts[script], undefined, `accountless deployment command remains: ${script}`);
  }
  assert.equal(typeof rootPackage.scripts["cf:dev:worker"], "string");
  for (const script of ["dev", "deploy", "typecheck", "db:migrate:local", "db:migrate:remote"]) {
    assert.equal(typeof backendPackage.scripts[script], "string", `backend command is missing: ${script}`);
  }
});

test("secret files are ignored and no secret value is configured in Wrangler", () => {
  const ignoreLines = new Set(
    gitignore.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean),
  );
  for (const pattern of ["**/.dev.vars", "**/.dev.vars.*", "**/.env", "**/.env.*"]) {
    assert.ok(ignoreLines.has(pattern), `missing secret ignore rule: ${pattern}`);
  }
  assert.doesNotMatch(wranglerConfig, /GOOGLE_CLIENT_(?:ID|SECRET)\s*=/u);

  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  }).split("\0").filter(Boolean);
  const trackedSecrets = tracked.filter((file) => {
    const name = file.replaceAll("\\", "/").split("/").at(-1);
    return (
      (name === ".env" || name?.startsWith(".env.")) && name !== ".env.example"
    ) || (
      (name === ".dev.vars" || name?.startsWith(".dev.vars.")) && name !== ".dev.vars.example"
    );
  });
  assert.deepEqual(trackedSecrets, []);
});

test("the standalone PR login pages cannot leak into the dist build", async () => {
  for (const legacyPath of [
    "public/login.html",
    "public/rankingBoard.html",
    "public/js/scenes/login.js",
    "public/js/scenes/rankingBoard.js",
  ]) {
    assert.equal(await exists(legacyPath), false, `legacy standalone UI must stay removed: ${legacyPath}`);
  }

  const publicEntries = buildSource.match(/const\s+PUBLIC_ENTRIES\s*=\s*Object\.freeze\s*\((\[[\s\S]*?\])\s*\)/u)?.[1] ?? "";
  assert.ok(publicEntries, "build public entry list could not be inspected");
  assert.doesNotMatch(publicEntries, /["']public["']/u);
  assert.match(wranglerConfig, /directory\s*=\s*["']\.\.\/dist["']/u);
  assert.doesNotMatch(accountSource, /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/iu);
});

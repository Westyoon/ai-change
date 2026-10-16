export { PostgameCoordinator } from "./postgame-coordinator";
import { createPostgameReward, EXPERIENCE_PER_LEVEL } from "./progression";
import { isWishId, isWishDepartment, normalizeWish, WISH_COOLDOWN_MS, WISH_INSERT_SQL, WISH_PAGE_SIZE } from "./wishes";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  POSTGAME: DurableObjectNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  PUBLIC_ORIGIN?: string;
}

type JsonObject = Record<string, unknown>;

interface GoogleTokenResponse {
  access_token?: unknown;
}

interface GoogleUserInfo {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  verified_email?: unknown;
}

interface SessionRow {
  user_id: string;
  name: string | null;
  nickname: string | null;
  hair_color?: string | null;
  expires_at: number;
}

interface StatsRow {
  attack: number;
  hp: number;
  defense: number;
  level: number;
  experience: number;
  clears: number;
  score: number;
  unspent_points: number;
}

interface CompletedGameRow {
  game_id: string;
}

interface StoryProgressRow {
  story_id: string;
}

interface BossRankingRow {
  run_id: string;
  team_name: string;
  party_size: number;
  clears: number;
  clear_time_ms: number;
  created_at: string;
}

interface BossRankingMemberRow {
  nickname_snapshot: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

const SESSION_COOKIE = "__Host-ai-change-session";
const LOCAL_SESSION_COOKIE = "ai-change-session";
const PARTITIONED_SESSION_COOKIE = "__Host-ai-change-session-partitioned";
const OAUTH_STATE_COOKIE = "__Host-ai-change-oauth-state";
const LOCAL_OAUTH_STATE_COOKIE = "ai-change-oauth-state";
const PARTITIONED_OAUTH_STATE_COOKIE = "__Host-ai-change-oauth-state-partitioned";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;
const MAX_SCORE = 1_000_000;
const BASE_COMBAT_HP = 100;
const COMBAT_HP_PER_POINT = 100;
const BASE_COMBAT_ATTACK = 10;
const COMBAT_ATTACK_GROWTH = 0.05;
const COMBAT_VALUE_SCALE = 1_000_000;
const MIN_NICKNAME_LENGTH = 2;
const MAX_NICKNAME_LENGTH = 16;
const GUEST_IMPORT_ATTEMPT_PREFIX = "guest-import-v1:";
const ALLOWED_GAME_IDS = new Set([
  "data-number-baseball",
  "cyber-click-to-purify",
  "computer-code-heart",
  "ai-ball-classification",
  "ai-data-egg-sort",
]);
const CLIENT_REWARDED_POSTGAME_ID = "xr-egg-trials";
const RANKED_BOSS_IDS = new Set(["stat-boss", "control-boss"]);
const ALLOWED_STORY_IDS = new Set([
  "main-story-intro",
  "npc-ds",
  "npc-cs",
  "npc-cse",
  "npc-ai",
  "npc-aids",
  "afterstory:ds",
  "afterstory:cs",
  "afterstory:cse",
  "afterstory:ai",
  "afterstory:aids",
  "battle-unlock:word-breaker",
  "main-story-outro",
  "festival-open",
  "postgame-entry-seen",
]);
const ALLOWED_STATS = new Set(["attack", "hp", "defense"]);

function apiHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: apiHeaders(init.headers),
  });
}

function publicOrigin(request: Request, env: Env): string {
  const requestOrigin = new URL(request.url).origin;
  const configured = env.PUBLIC_ORIGIN?.trim();
  if (!configured) return requestOrigin;

  let expected: URL;
  try {
    expected = new URL(configured);
  } catch {
    throw new HttpError(500, "Server configuration error");
  }

  if (!/^https?:$/.test(expected.protocol) || expected.origin !== requestOrigin) {
    throw new HttpError(403, "Forbidden");
  }
  return expected.origin;
}

function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, "Method Not Allowed");
  }
}

function requireMutationRequest(request: Request, origin: string): void {
  const suppliedOrigin = request.headers.get("Origin");
  if (suppliedOrigin !== origin) {
    throw new HttpError(403, "Forbidden");
  }

  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    throw new HttpError(413, "Request body is too large");
  }
}

async function readJsonObject(request: Request): Promise<JsonObject> {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 4096) {
      throw new HttpError(413, "Request body is too large");
    }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as JsonObject;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON body");
  }
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stateCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:" ? OAUTH_STATE_COOKIE : LOCAL_OAUTH_STATE_COOKIE;
}

function stateCookie(value: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${stateCookieName(request)}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function partitionedCookie(
  name: string,
  value: string,
  request: Request,
  maxAge: number,
): string | null {
  if (new URL(request.url).protocol !== "https:") return null;
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned`;
}

function appendStateCookies(
  response: Response,
  value: string,
  request: Request,
  maxAge: number,
): void {
  response.headers.append("Set-Cookie", stateCookie(value, request, maxAge));
  const partitioned = partitionedCookie(
    PARTITIONED_OAUTH_STATE_COOKIE,
    value,
    request,
    maxAge,
  );
  if (partitioned) response.headers.append("Set-Cookie", partitioned);
}

function sessionCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:" ? SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

function sessionCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(request)}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function appendSessionCookies(
  response: Response,
  request: Request,
  value: string,
  maxAge: number,
): void {
  response.headers.append("Set-Cookie", sessionCookie(request, value, maxAge));
  const partitioned = partitionedCookie(
    PARTITIONED_SESSION_COOKIE,
    value,
    request,
    maxAge,
  );
  if (partitioned) response.headers.append("Set-Cookie", partitioned);
}

function cookieCandidates(request: Request, primaryName: string, partitionedName: string): string[] {
  const cookies = parseCookies(request);
  const names = [primaryName];
  if (new URL(request.url).protocol === "https:") names.push(partitionedName);
  return [...new Set(
    names
      .map((name) => cookies.get(name))
      .filter((value): value is string => (
        typeof value === "string" && value.length > 0 && value.length <= 128
      )),
  )];
}

function oauthRedirect(origin: string, reason?: string): Response {
  const destination = new URL("/", origin);
  destination.searchParams.set("login", reason ? "error" : "success");
  if (reason) destination.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}

function clearStateAndRedirect(origin: string, request: Request, reason: string): Response {
  const response = oauthRedirect(origin, reason);
  appendStateCookies(response, "", request, 0);
  return response;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "AI CHANGE 플레이어";
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 60);
  return normalized || "AI CHANGE 플레이어";
}

function normalizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) return null;
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(normalized)) return null;
  return normalized;
}

function accountUser(session: Pick<SessionRow, "name" | "nickname" | "hair_color">): {
  name: string;
  nickname: string | null;
  hairColor: string | null;
} {
  const nickname = normalizeNickname(session.nickname);
  return {
    name: nickname ?? normalizeDisplayName(session.name),
    nickname,
    hairColor: ["magenta", "purple", "brown", "blonde"].includes(session.hair_color ?? "") ? session.hair_color! : null,
  };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !normalized.includes("@")) return null;
  return normalized;
}

function statPayload(row: StatsRow): Record<string, number | null> {
  const level = Math.max(1, Math.trunc(Number(row.level) || 1));
  const experience = Math.max(0, Math.trunc(Number(row.experience) || 0));
  return {
    attack: Number(row.attack),
    hp: Number(row.hp),
    defense: Number(row.defense),
    level,
    experience,
    nextLevelExperience: level * EXPERIENCE_PER_LEVEL,
    clears: Number(row.clears),
    score: Number(row.score),
    unspentPoints: Number(row.unspent_points),
  };
}

async function fetchStats(env: Env, userId: string): Promise<StatsRow> {
  const row = await env.DB.prepare(
    `SELECT attack, hp, defense, level, experience, clears, score, unspent_points
       FROM stats
      WHERE user_id = ?`,
  )
    .bind(userId)
    .first<StatsRow>();
  if (!row) throw new HttpError(404, "Stats not found");
  return row;
}

function combatMaxHp(stats: StatsRow): number {
  const storedHp = Math.max(BASE_COMBAT_HP, Math.trunc(Number(stats.hp) || BASE_COMBAT_HP));
  const maxBonusPoints = Math.floor((Number.MAX_SAFE_INTEGER - BASE_COMBAT_HP) / COMBAT_HP_PER_POINT);
  const bonusPoints = Math.min(
    maxBonusPoints,
    Math.max(0, storedHp - BASE_COMBAT_HP) / COMBAT_HP_PER_POINT,
  );
  return BASE_COMBAT_HP + bonusPoints * COMBAT_HP_PER_POINT;
}

function statBossAttackDamage(stats: StatsRow): number {
  const attackPoints = Math.max(0, Math.trunc(Number(stats.attack) || 0));
  const compounded = BASE_COMBAT_ATTACK * ((1 + COMBAT_ATTACK_GROWTH) ** attackPoints);
  const bounded = Math.min(
    Number.MAX_SAFE_INTEGER,
    Number.isFinite(compounded) ? compounded : Number.MAX_SAFE_INTEGER,
  );
  if (bounded >= Number.MAX_SAFE_INTEGER / COMBAT_VALUE_SCALE) return bounded;
  return Math.round((bounded + Number.EPSILON) * COMBAT_VALUE_SCALE) / COMBAT_VALUE_SCALE;
}

function controlBossAttackDamage(stats: StatsRow): number {
  const attackPoints = Math.max(0, Math.trunc(Number(stats.attack) || 0));
  const compounded = BASE_COMBAT_ATTACK * ((1 + COMBAT_ATTACK_GROWTH) ** attackPoints);
  const bounded = Math.min(
    Number.MAX_SAFE_INTEGER,
    Number.isFinite(compounded) ? compounded : Number.MAX_SAFE_INTEGER,
  );
  if (bounded >= Number.MAX_SAFE_INTEGER / COMBAT_VALUE_SCALE) return bounded;
  return Math.round((bounded + Number.EPSILON) * COMBAT_VALUE_SCALE) / COMBAT_VALUE_SCALE;
}

async function fetchCompletedGameIds(env: Env, userId: string): Promise<string[]> {
  const query = await env.DB.prepare(
    `SELECT DISTINCT game_id
       FROM game_results
      WHERE user_id = ? AND status = 'CLEAR'
      ORDER BY game_id ASC`,
  )
    .bind(userId)
    .all<CompletedGameRow>();
  return query.results
    .map((row) => row.game_id)
    .filter((gameId) => ALLOWED_GAME_IDS.has(gameId));
}

async function fetchSeenStoryIds(env: Env, userId: string): Promise<string[]> {
  const query = await env.DB.prepare(
    `SELECT story_id
       FROM story_progress
      WHERE user_id = ?
      ORDER BY seen_at ASC, story_id ASC`,
  )
    .bind(userId)
    .all<StoryProgressRow>();
  return query.results
    .map((row) => row.story_id)
    .filter((storyId) => ALLOWED_STORY_IDS.has(storyId));
}

async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const tokens = cookieCandidates(request, sessionCookieName(request), PARTITIONED_SESSION_COOKIE);
  if (tokens.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  for (const token of tokens) {
    const session = await env.DB.prepare(
      `SELECT s.user_id, s.expires_at, u.name, u.nickname, u.hair_color
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), now)
      .first<SessionRow>();
    if (session) return session;
  }
  return null;
}

async function requireSession(request: Request, env: Env): Promise<SessionRow> {
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "Unauthorized");
  return session;
}

async function beginGoogleLogin(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "GET");
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, "Login is unavailable");

  const state = randomToken();
  const redirectUri = `${origin}/api/auth/callback`;
  const destination = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  destination.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  }).toString();

  const headers = new Headers({ Location: destination.toString(), "Cache-Control": "no-store" });
  const response = new Response(null, { status: 302, headers });
  appendStateCookies(response, state, request, OAUTH_STATE_TTL_SECONDS);
  return response;
}

async function finishGoogleLogin(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "GET");
  const url = new URL(request.url);
  const expectedStates = cookieCandidates(
    request,
    stateCookieName(request),
    PARTITIONED_OAUTH_STATE_COOKIE,
  );
  const suppliedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!suppliedState || !expectedStates.includes(suppliedState) || !code) {
    return clearStateAndRedirect(origin, request, "invalid_oauth_response");
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return clearStateAndRedirect(origin, request, "login_unavailable");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      return clearStateAndRedirect(origin, request, "provider_error");
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    if (typeof tokenData.access_token !== "string" || !tokenData.access_token) {
      return clearStateAndRedirect(origin, request, "provider_error");
    }

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userResponse.ok) {
      return clearStateAndRedirect(origin, request, "provider_error");
    }

    const googleUser = (await userResponse.json()) as GoogleUserInfo;
    const userId = typeof googleUser.id === "string" ? googleUser.id : "";
    const email = normalizeEmail(googleUser.email);
    if (!userId || userId.length > 128 || !email || googleUser.verified_email !== true) {
      return clearStateAndRedirect(origin, request, "account_unavailable");
    }

    const name = normalizeDisplayName(googleUser.name);
    const sessionToken = randomToken();
    const tokenHash = await sha256(sessionToken);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + SESSION_TTL_SECONDS;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, name)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name`,
      ).bind(userId, email, name),
      env.DB.prepare(
        `INSERT INTO stats (
           user_id, attack, hp, defense, level, experience, clears, score, unspent_points
         )
         VALUES (?, 0, 100, 0, 1, 0, 0, 0, 0)
         ON CONFLICT(user_id) DO NOTHING`,
      ).bind(userId),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      ).bind(tokenHash, userId, expiresAt),
    ]);

    const response = oauthRedirect(origin);
    appendSessionCookies(response, request, sessionToken, SESSION_TTL_SECONDS);
    appendStateCookies(response, "", request, 0);
    return response;
  } catch (error) {
    console.error("OAuth callback failed", error instanceof Error ? error.message : "unknown error");
    return clearStateAndRedirect(origin, request, "login_failed");
  }
}

async function sessionResponse(request: Request, env: Env): Promise<Response> {
  requireMethod(request, "GET");
  const session = await getSession(request, env);
  if (!session) return json({ authenticated: false });

  return authenticatedAccountResponse(env, session);
}

async function authenticatedAccountResponse(env: Env, session: SessionRow): Promise<Response> {
  const [stats, completedGameIds, seenStoryIds] = await Promise.all([
    fetchStats(env, session.user_id),
    fetchCompletedGameIds(env, session.user_id),
    fetchSeenStoryIds(env, session.user_id),
  ]);
  return json({
    authenticated: true,
    user: accountUser(session),
    stats: statPayload(stats),
    completedGameIds,
    seenStoryIds,
  });
}

async function importStoryProgress(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);
  const input = body.seenStoryIds;
  if (
    Object.keys(body).some((key) => key !== "seenStoryIds")
    || !Array.isArray(input)
    || input.length > ALLOWED_STORY_IDS.size
    || input.some((storyId) => typeof storyId !== "string" || !ALLOWED_STORY_IDS.has(storyId))
  ) {
    throw new HttpError(400, "Invalid seenStoryIds");
  }

  const requested = [...new Set(input as string[])];
  if (requested.length > 0) {
    await env.DB.batch(requested.map((storyId) => env.DB.prepare(
      `INSERT OR IGNORE INTO story_progress (user_id, story_id)
       VALUES (?, ?)`,
    ).bind(session.user_id, storyId)));
  }
  return json({ seenStoryIds: await fetchSeenStoryIds(env, session.user_id) });
}

async function updateNickname(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "PATCH");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);
  if (Object.keys(body).length !== 1 || !("nickname" in body)) {
    throw new HttpError(400, "Invalid nickname");
  }

  const nickname = normalizeNickname(body.nickname);
  if (!nickname) throw new HttpError(400, "Nickname must be 2 to 16 characters");

  const result = await env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?")
    .bind(nickname, session.user_id)
    .run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new HttpError(404, "Account not found");
  }

  return authenticatedAccountResponse(env, { ...session, nickname });
}

interface WishRow { id: string; nickname: string; body: string; department: string | null; created_at: number; rate_key?: string }

function publicWish(row: WishRow) {
  return { id: row.id, nickname: row.nickname, text: row.body, department: row.department ?? null };
}

async function wishes(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const after = params.get("after");
    const department = params.get("department");
    if (department !== null && !isWishDepartment(department)) throw new HttpError(400, "Invalid department");
    let timestamp = Number.MAX_SAFE_INTEGER;
    let id = "~";
    if (after) {
      const match = /^(\d{1,13}):(.+)$/u.exec(after);
      if (!match || !isWishId(match[2])) throw new HttpError(400, "Invalid cursor");
      timestamp = Number(match[1]); id = match[2];
    }
    const result = await env.DB.prepare(`SELECT id, nickname, body, department, created_at FROM wish_posts
      WHERE (created_at < ? OR (created_at = ? AND id < ?)) AND (? IS NULL OR department = ?)
      ORDER BY created_at DESC, id DESC LIMIT ?`)
      .bind(timestamp, timestamp, id, department, department, WISH_PAGE_SIZE + 1).all<WishRow>();
    const rows = (result.results ?? []).slice(0, WISH_PAGE_SIZE);
    const last = rows.at(-1);
    return json({ wishes: rows.map(publicWish), nextCursor: result.results.length > WISH_PAGE_SIZE && last
      ? `${last.created_at}:${last.id}` : null });
  }
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const body = await readJsonObject(request);
  const text = normalizeWish(body.text);
  if (Object.keys(body).length !== 3 || !text || !isWishId(body.requestId) || !isWishDepartment(body.department)) throw new HttpError(400, "Invalid wish");
  const session = await getSession(request, env);
  const rateKey = await sha256(`wish:${session?.user_id ?? request.headers.get("CF-Connecting-IP") ?? "local"}`);
  const existing = await env.DB.prepare("SELECT id, nickname, body, department, created_at, rate_key FROM wish_posts WHERE id = ?")
    .bind(body.requestId).first<WishRow>();
  if (existing) {
    if (existing.body !== text || existing.department !== body.department || existing.rate_key !== rateKey) throw new HttpError(409, "Wish id conflict");
    return json({ wish: publicWish(existing) });
  }
  const now = Date.now();
  const nickname = session?.nickname || "꿈꾸는 이화인";
  const result = await env.DB.prepare(WISH_INSERT_SQL)
    .bind(body.requestId, nickname, text, body.department, now, rateKey, rateKey, now - WISH_COOLDOWN_MS, session ? 1 : 20).run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    const repeated = await env.DB.prepare("SELECT id, nickname, body, department, created_at, rate_key FROM wish_posts WHERE id = ?")
      .bind(body.requestId).first<WishRow>();
    if (repeated?.body === text && repeated.department === body.department && repeated.rate_key === rateKey) return json({ wish: publicWish(repeated) });
    throw new HttpError(429, "Please wait before sharing another wish");
  }
  return json({ wish: { id: body.requestId, nickname, text, department: body.department } }, { status: 201 });
}

async function updateHairColor(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "PATCH");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);
  if (Object.keys(body).length !== 1 || typeof body.hairColor !== "string"
    || !["magenta", "purple", "brown", "blonde"].includes(body.hairColor)) {
    throw new HttpError(400, "Invalid hair color");
  }
  const result = await env.DB.prepare("UPDATE users SET hair_color = ? WHERE id = ?")
    .bind(body.hairColor, session.user_id).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new HttpError(404, "Account not found");
  return authenticatedAccountResponse(env, { ...session, hair_color: body.hairColor });
}

async function logout(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const tokens = cookieCandidates(request, sessionCookieName(request), PARTITIONED_SESSION_COOKIE);
  for (const token of tokens) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  }
  const response = json({ authenticated: false });
  appendSessionCookies(response, request, "", 0);
  return response;
}

async function ranking(request: Request, env: Env): Promise<Response> {
  requireMethod(request, "GET");
  const params = new URL(request.url).searchParams;
  const criterion = params.get("criteria") ?? "boss-clears";
  const bossId = params.get("bossId") ?? "";
  if (criterion !== "boss-clears" && criterion !== "boss-speed") {
    throw new HttpError(400, "Invalid ranking criteria");
  }
  if (!RANKED_BOSS_IDS.has(bossId)) throw new HttpError(400, "A valid bossId is required");

  const order = criterion === "boss-clears"
    ? "clears DESC, created_at ASC, run_id ASC"
    : "clear_time_ms ASC, created_at ASC, run_id ASC";
  const rankedOrder = criterion === "boss-clears"
    ? "r.created_at DESC, r.id DESC"
    : "r.clear_time_ms ASC, r.created_at ASC, r.id ASC";
  const query = await env.DB.prepare(
    `WITH ranked_runs AS (
       SELECT
         r.id AS run_id,
         r.team_name,
         r.party_size,
         r.clear_time_ms,
         r.created_at,
         COUNT(*) OVER (PARTITION BY r.party_key) AS clears,
         ROW_NUMBER() OVER (
           PARTITION BY r.party_key
           ORDER BY ${rankedOrder}
         ) AS party_rank
       FROM boss_runs r
       WHERE r.boss_id = ?
     )
     SELECT run_id, team_name, party_size, clears, clear_time_ms, created_at
       FROM ranked_runs
      WHERE party_rank = 1
      ORDER BY ${order}
      LIMIT 10`,
  ).bind(bossId).all<BossRankingRow>();

  const memberResults = await Promise.all(query.results.map((row) => env.DB.prepare(
    `SELECT nickname_snapshot
       FROM boss_run_members
      WHERE run_id = ?
      ORDER BY member_order ASC`,
  ).bind(row.run_id).all<BossRankingMemberRow>()));

  return json(query.results.map((row, index) => {
    const members = memberResults[index].results.map((member) => member.nickname_snapshot);
    const partySize = Math.max(1, Number(row.party_size));
    return {
      rank: index + 1,
      bossId,
      teamName: row.team_name,
      name: partySize > 1 ? row.team_name : members[0] ?? row.team_name,
      members,
      partySize,
      clears: Number(row.clears),
      clearTimeMs: Number(row.clear_time_ms),
    };
  }));
}

async function importCompletedProgress(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);
  const completedGameIdsInput = body.completedGameIds;

  if (
    Object.keys(body).some((key) => key !== "completedGameIds")
    || !Array.isArray(completedGameIdsInput)
    || completedGameIdsInput.length > ALLOWED_GAME_IDS.size
  ) {
    throw new HttpError(400, "Invalid completedGameIds");
  }
  if (
    completedGameIdsInput.some(
      (gameId) => typeof gameId !== "string" || !ALLOWED_GAME_IDS.has(gameId),
    )
  ) {
    throw new HttpError(400, "Invalid completedGameIds");
  }
  const requestedGameIds = [...new Set(completedGameIdsInput as string[])];

  const existingGameIds = new Set(await fetchCompletedGameIds(env, session.user_id));
  const missingGameIds = requestedGameIds.filter((gameId) => !existingGameIds.has(gameId));
  const statements: D1PreparedStatement[] = [];

  for (const gameId of missingGameIds) {
    const resultId = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO game_results (id, user_id, attempt_id, game_id, status, score)
         SELECT ?, ?, ?, ?, 'CLEAR', 0
          WHERE NOT EXISTS (
            SELECT 1 FROM game_results
             WHERE user_id = ? AND game_id = ? AND status = 'CLEAR'
          )`,
      ).bind(
        resultId,
        session.user_id,
        `${GUEST_IMPORT_ATTEMPT_PREFIX}${gameId}`,
        gameId,
        session.user_id,
        gameId,
      ),
    );
  }

  const batchResults = statements.length > 0 ? await env.DB.batch(statements) : [];
  const importedGameIds = missingGameIds.filter(
    (_gameId, index) => Number(batchResults[index]?.meta.changes ?? 0) === 1,
  );
  const [stats, completedGameIds] = await Promise.all([
    fetchStats(env, session.user_id),
    fetchCompletedGameIds(env, session.user_id),
  ]);

  return json({
    importedGameIds,
    completedGameIds,
    awarded: false,
    stats: statPayload(stats),
  });
}

async function recordResult(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);

  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const status = body.status;
  const score = body.score;
  if (!/^[A-Za-z0-9:_-]{8,160}$/u.test(attemptId)) {
    throw new HttpError(400, "Invalid attemptId");
  }
  if (attemptId.startsWith(GUEST_IMPORT_ATTEMPT_PREFIX)) {
    throw new HttpError(400, "Invalid attemptId");
  }
  if (!ALLOWED_GAME_IDS.has(gameId)) throw new HttpError(400, "Invalid gameId");
  if (status !== "CLEAR") throw new HttpError(400, "Only CLEAR results are accepted");
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new HttpError(400, "Invalid score");
  }

  const resultId = crypto.randomUUID();
  const [insertResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO game_results (id, user_id, attempt_id, game_id, status, score)
       VALUES (?, ?, ?, ?, 'CLEAR', ?)
       ON CONFLICT(user_id, attempt_id) DO NOTHING`,
    ).bind(resultId, session.user_id, attemptId, gameId, score),
  ]);

  const credited = Number(insertResult.meta.changes ?? 0) === 1;
  const stats = await fetchStats(env, session.user_id);
  return json(
    { credited, duplicate: !credited, awarded: false, stats: statPayload(stats) },
    { status: credited ? 201 : 200 },
  );
}

async function recordPostgameResult(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);

  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  const battleId = typeof body.battleId === "string" ? body.battleId : "";
  const status = body.status;
  const score = body.score;
  if (!/^[A-Za-z0-9:_-]{8,160}$/u.test(attemptId)) {
    throw new HttpError(400, "Invalid attemptId");
  }
  // Browser-submitted rewards are intentionally limited to the local X-egg
  // challenge. All three shared bosses are credited by the Durable Object
  // after it authoritatively observes bossHp reaching zero.
  if (battleId !== CLIENT_REWARDED_POSTGAME_ID) {
    throw new HttpError(400, "Invalid battleId");
  }
  if (!attemptId.startsWith(`${battleId}:`)) {
    throw new HttpError(400, "Invalid attemptId");
  }
  if (status !== "CLEAR") throw new HttpError(400, "Only CLEAR results are accepted");
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new HttpError(400, "Invalid score");
  }

  const resultId = crypto.randomUUID();
  const { EXPERIENCE_PER_POSTGAME_CLEAR, POSTGAME_LEVEL_GAIN_SQL } = createPostgameReward();
  const [insertResult, awardResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO postgame_results
         (id, user_id, attempt_id, content_id, source, status, score, awarded)
       VALUES (?, ?, ?, ?, 'field', 'CLEAR', ?, 0)
       ON CONFLICT(user_id, attempt_id) DO NOTHING`,
    ).bind(resultId, session.user_id, attemptId, battleId, score),
    env.DB.prepare(
      `UPDATE stats
          SET clears = COALESCE(clears, 0) + 1,
              experience = COALESCE(experience, 0) + ${EXPERIENCE_PER_POSTGAME_CLEAR},
              level = COALESCE(level, 1) + (${POSTGAME_LEVEL_GAIN_SQL}),
              unspent_points = COALESCE(unspent_points, 0) + (${POSTGAME_LEVEL_GAIN_SQL}),
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND EXISTS (
            SELECT 1 FROM postgame_results
             WHERE user_id = ? AND attempt_id = ? AND content_id = ? AND awarded = 0
          )`,
    ).bind(session.user_id, session.user_id, attemptId, battleId),
    env.DB.prepare(
      `UPDATE postgame_results
          SET awarded = 1
        WHERE user_id = ? AND attempt_id = ? AND content_id = ? AND awarded = 0
          AND EXISTS (SELECT 1 FROM stats WHERE user_id = ?)`,
    ).bind(session.user_id, attemptId, battleId, session.user_id),
  ]);

  const credited = Number(insertResult.meta.changes ?? 0) === 1;
  const awarded = Number(awardResult.meta.changes ?? 0) === 1;
  const stats = await fetchStats(env, session.user_id);
  return json(
    { credited, duplicate: !credited, awarded, experienceAwarded: awarded ? EXPERIENCE_PER_POSTGAME_CLEAR : 0, stats: statPayload(stats) },
    { status: credited ? 201 : 200 },
  );
}

async function claimEngineeringWalk(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request,"POST");
  requireMutationRequest(request,origin);
  const session=await requireSession(request,env);
  // D1 batches are transactional. Both retries and concurrent clicks award once.
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE stats SET hp = hp + 10, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM campus_walk_claims WHERE user_id = ?)`)
      .bind(session.user_id,session.user_id),
    env.DB.prepare(`INSERT OR IGNORE INTO campus_walk_claims (user_id) SELECT user_id FROM stats WHERE user_id = ?`)
      .bind(session.user_id),
  ]);
  return json({awarded:Number(results[0]?.meta?.changes)>0,stats:statPayload(await fetchStats(env,session.user_id))});
}

async function allocateStat(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const session = await requireSession(request, env);
  const body = await readJsonObject(request);
  const stat = typeof body.stat === "string" ? body.stat : "";
  if (!ALLOWED_STATS.has(stat)) throw new HttpError(400, "Invalid stat");

  const result = await env.DB.prepare(
    `UPDATE stats
        SET attack = COALESCE(attack, 0) + CASE WHEN ? = 'attack' THEN 1 ELSE 0 END,
            hp = COALESCE(hp, ${BASE_COMBAT_HP}) + CASE WHEN ? = 'hp' THEN ${COMBAT_HP_PER_POINT} ELSE 0 END,
            defense = COALESCE(defense, 0) + CASE WHEN ? = 'defense' THEN 1 ELSE 0 END,
            unspent_points = COALESCE(unspent_points, 0) - 1,
            updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND COALESCE(unspent_points, 0) > 0`,
  )
    .bind(stat, stat, stat, session.user_id)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, "No unspent stat points");
  }
  return json({ stats: statPayload(await fetchStats(env, session.user_id)) });
}

async function connectPostgame(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "GET");
  if (request.headers.get("Origin") !== origin) {
    throw new HttpError(403, "Forbidden");
  }
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new HttpError(426, "WebSocket upgrade required");
  }

  const session = await requireSession(request, env);
  const stats = await fetchStats(env, session.user_id);
  const headers = new Headers({
    Upgrade: "websocket",
    "x-ai-player-user-id": session.user_id,
    "x-ai-player-key": await sha256(`postgame:${session.user_id}`),
    "x-ai-player-name": encodeURIComponent(accountUser(session).name),
    "x-ai-player-hair-color": accountUser(session).hairColor ?? "purple",
    "x-ai-player-combat-max-hp": String(combatMaxHp(stats)),
    "x-ai-player-stat-boss-damage": String(statBossAttackDamage(stats)),
    "x-ai-player-control-boss-damage": String(controlBossAttackDamage(stats)),
  });
  const coordinator = env.POSTGAME.getByName("festival-v1");
  return coordinator.fetch(new Request("https://postgame.internal/connect", {
    method: "GET",
    headers,
  }));
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = publicOrigin(request, env);

  if (url.pathname === "/api/health") {
    requireMethod(request, "GET");
    return json({ status: "ok" });
  }
  if (url.pathname === "/api/auth/google") return beginGoogleLogin(request, env, origin);
  if (url.pathname === "/api/auth/callback") return finishGoogleLogin(request, env, origin);
  if (url.pathname === "/api/auth/logout") return logout(request, env, origin);
  // Primary player endpoint. Some browser privacy filters block the conventional
  // `/api/me` path before it reaches the Worker, so the client uses this route
  // while the older aliases stay available for backwards compatibility.
  if (url.pathname === "/api/player-account") {
    if (request.method === "PATCH") return updateNickname(request, env, origin);
    return sessionResponse(request, env);
  }
  if (url.pathname === "/api/wishes") return wishes(request, env, origin);
  if (url.pathname === "/api/me") {
    if (request.method === "PATCH") return updateNickname(request, env, origin);
    return sessionResponse(request, env);
  }
  if (url.pathname === "/api/session") return sessionResponse(request, env);
  if (url.pathname === "/api/player-appearance") return updateHairColor(request, env, origin);
  if (url.pathname === "/api/ranking") return ranking(request, env);
  if (url.pathname === "/api/story-progress") return importStoryProgress(request, env, origin);
  if (url.pathname === "/api/progress/import") return importCompletedProgress(request, env, origin);
  if (url.pathname === "/api/results") return recordResult(request, env, origin);
  if (url.pathname === "/api/postgame/results") return recordPostgameResult(request, env, origin);
  if (url.pathname === "/api/stats/allocate") return allocateStat(request, env, origin);
  if (url.pathname === "/api/campus/engineering-walk") return claimEngineeringWalk(request, env, origin);
  if (url.pathname === "/api/postgame/socket") return connectPostgame(request, env, origin);

  // Legacy endpoints intentionally stay unavailable: /api/users, /api/stats/:id,
  // and PUT /api/stats previously exposed private data or trusted a caller userId.
  return json({ error: "Not Found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.publicMessage }, { status: error.status });
      }
      console.error("API request failed", error instanceof Error ? error.message : "unknown error");
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

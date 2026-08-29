export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
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
  expires_at: number;
}

interface StatsRow {
  attack: number;
  hp: number;
  defense: number;
  clears: number;
  score: number;
  unspent_points: number;
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
const OAUTH_STATE_COOKIE = "__Host-ai-change-oauth-state";
const LOCAL_OAUTH_STATE_COOKIE = "ai-change-oauth-state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;
const MAX_SCORE = 1_000_000;
const ALLOWED_GAME_IDS = new Set([
  "data-number-baseball",
  "cyber-click-to-purify",
  "computer-code-heart",
  "ai-ball-classification",
  "ai-data-egg-sort",
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

function sessionCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:" ? SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

function sessionCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(request)}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
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
  response.headers.append("Set-Cookie", stateCookie("", request, 0));
  return response;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "AI CHANGE 플레이어";
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 60);
  return normalized || "AI CHANGE 플레이어";
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !normalized.includes("@")) return null;
  return normalized;
}

function statPayload(row: StatsRow): Record<string, number> {
  return {
    attack: Number(row.attack),
    hp: Number(row.hp),
    defense: Number(row.defense),
    clears: Number(row.clears),
    score: Number(row.score),
    unspentPoints: Number(row.unspent_points),
  };
}

async function fetchStats(env: Env, userId: string): Promise<StatsRow> {
  const row = await env.DB.prepare(
    `SELECT attack, hp, defense, clears, score, unspent_points
       FROM stats
      WHERE user_id = ?`,
  )
    .bind(userId)
    .first<StatsRow>();
  if (!row) throw new HttpError(404, "Stats not found");
  return row;
}

async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = parseCookies(request).get(sessionCookieName(request));
  if (!token || token.length > 128) return null;

  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<SessionRow>();
  return session ?? null;
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
  headers.append("Set-Cookie", stateCookie(state, request, OAUTH_STATE_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

async function finishGoogleLogin(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "GET");
  const url = new URL(request.url);
  const expectedState = parseCookies(request).get(stateCookieName(request));
  const suppliedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!expectedState || !suppliedState || expectedState !== suppliedState || !code) {
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
        `INSERT INTO stats (user_id, attack, hp, defense, clears, score, unspent_points)
         VALUES (?, 0, 100, 0, 0, 0, 0)
         ON CONFLICT(user_id) DO NOTHING`,
      ).bind(userId),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      ).bind(tokenHash, userId, expiresAt),
    ]);

    const response = oauthRedirect(origin);
    response.headers.append("Set-Cookie", stateCookie("", request, 0));
    response.headers.append("Set-Cookie", sessionCookie(request, sessionToken, SESSION_TTL_SECONDS));
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

  const stats = await fetchStats(env, session.user_id);
  return json({
    authenticated: true,
    user: { name: normalizeDisplayName(session.name) },
    stats: statPayload(stats),
  });
}

async function logout(request: Request, env: Env, origin: string): Promise<Response> {
  requireMethod(request, "POST");
  requireMutationRequest(request, origin);
  const token = parseCookies(request).get(sessionCookieName(request));
  if (token && token.length <= 128) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  const response = json({ authenticated: false });
  response.headers.append("Set-Cookie", sessionCookie(request, "", 0));
  return response;
}

async function ranking(request: Request, env: Env): Promise<Response> {
  requireMethod(request, "GET");
  const params = new URL(request.url).searchParams;
  const criterion = params.get("criteria") ?? "clears";
  if (criterion !== "score" && criterion !== "clears") {
    throw new HttpError(400, "Invalid ranking criteria");
  }

  let results: Array<{ name: string | null; score: number; clears: number }>;
  if (criterion === "score") {
    const gameId = params.get("gameId") ?? "";
    if (!ALLOWED_GAME_IDS.has(gameId)) throw new HttpError(400, "A valid gameId is required");
    const query = await env.DB.prepare(
      `SELECT u.name, MAX(g.score) AS score, s.clears
         FROM game_results g
         JOIN users u ON u.id = g.user_id
         JOIN stats s ON s.user_id = g.user_id
        WHERE g.game_id = ?
        GROUP BY u.id, u.name, s.clears, u.created_at
        ORDER BY score DESC, s.clears DESC, u.created_at ASC
        LIMIT 10`,
    )
      .bind(gameId)
      .all<{ name: string | null; score: number; clears: number }>();
    results = query.results;
  } else {
    const query = await env.DB.prepare(
      `SELECT u.name, s.score, s.clears
         FROM stats s
         JOIN users u ON u.id = s.user_id
        ORDER BY s.clears DESC, s.score DESC, u.created_at ASC
        LIMIT 10`,
    ).all<{ name: string | null; score: number; clears: number }>();
    results = query.results;
  }

  return json(
    results.map((row, index) => ({
      rank: index + 1,
      name: normalizeDisplayName(row.name),
      score: Number(row.score),
      clears: Number(row.clears),
    })),
  );
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
    env.DB.prepare(
      `UPDATE stats
          SET clears = COALESCE(clears, 0) + 1,
              score = MAX(COALESCE(score, 0), ?),
              unspent_points = COALESCE(unspent_points, 0) + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND EXISTS (SELECT 1 FROM game_results WHERE id = ? AND user_id = ?)`,
    ).bind(score, session.user_id, resultId, session.user_id),
  ]);

  const credited = Number(insertResult.meta.changes ?? 0) === 1;
  const stats = await fetchStats(env, session.user_id);
  return json(
    { credited, duplicate: !credited, awarded: credited, stats: statPayload(stats) },
    { status: credited ? 201 : 200 },
  );
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
            hp = COALESCE(hp, 0) + CASE WHEN ? = 'hp' THEN 1 ELSE 0 END,
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
  if (url.pathname === "/api/session") return sessionResponse(request, env);
  if (url.pathname === "/api/ranking") return ranking(request, env);
  if (url.pathname === "/api/results") return recordResult(request, env, origin);
  if (url.pathname === "/api/stats/allocate") return allocateStat(request, env, origin);

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

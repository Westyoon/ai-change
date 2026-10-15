import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u"));
  assert.notEqual(start, -1, `missing Worker function: ${name}`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

const [worker, schema, migration] = await Promise.all([
  read("backend/src/index.ts"),
  read("backend/schema.sql"),
  read("backend/migrations/0005_user_nickname.sql"),
]);

test("authenticated users can update only their own normalized nickname", () => {
  const update = functionBody(worker, "updateNickname");
  const normalize = functionBody(worker, "normalizeNickname");

  assert.match(update, /requireMethod\s*\(\s*request\s*,\s*["']PATCH["']\s*\)/u);
  assert.match(update, /requireMutationRequest\s*\(\s*request\s*,\s*origin\s*\)/u);
  assert.match(update, /requireSession\s*\(\s*request\s*,\s*env\s*\)/u);
  assert.match(update, /Object\.keys\s*\(\s*body\s*\)\.length\s*!==\s*1/u);
  assert.match(update, /UPDATE\s+users\s+SET\s+nickname\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/iu);
  assert.match(update, /session\.user_id/u);
  assert.doesNotMatch(update, /body\.(?:id|userId|user_id|email)\b/u);

  assert.match(normalize, /\.normalize\s*\(\s*["']NFKC["']\s*\)/u);
  assert.match(normalize, /\.trim\s*\(\s*\)\.replace\s*\(\s*\/\\s\+\/gu,\s*["'] ["']\s*\)/u);
  assert.match(normalize, /Array\.from\s*\(\s*normalized\s*\)\.length/u);
  assert.match(worker, /MIN_NICKNAME_LENGTH\s*=\s*2/u);
  assert.match(worker, /MAX_NICKNAME_LENGTH\s*=\s*16/u);
  assert.match(normalize, /\\p\{C[cfst]\}/u);
});

test("hair changes require the same authenticated mutation protections and are injected by the server", () => {
  const update = functionBody(worker, "updateHairColor");
  assert.match(update, /requireMethod\(request, "PATCH"\)/u);
  assert.match(update, /requireMutationRequest\(request, origin\)/u);
  assert.match(update, /requireSession\(request, env\)/u);
  assert.match(update, /Object\.keys\(body\)\.length !== 1/u);
  assert.match(update, /UPDATE users SET hair_color = \? WHERE id = \?/u);
  assert.match(update, /\.bind\(body\.hairColor, session\.user_id\)/u);
  assert.doesNotMatch(update, /body\.(?:userId|email|id)\b/u);
  assert.match(functionBody(worker, "getSession"), /u\.hair_color/u);
  assert.match(functionBody(worker, "connectPostgame"), /"x-ai-player-hair-color": accountUser\(session\)\.hairColor/u);
});

test("nickname persists separately from the Google name and is returned as the display identity", () => {
  const callback = functionBody(worker, "finishGoogleLogin");
  const session = functionBody(worker, "getSession");
  const payload = functionBody(worker, "authenticatedAccountResponse");
  const ranking = functionBody(worker, "ranking");
  const socket = functionBody(worker, "connectPostgame");

  assert.match(session, /u\.nickname/u);
  assert.match(payload, /user:\s*accountUser\s*\(\s*session\s*\)/u);
  assert.match(callback, /ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+UPDATE\s+SET\s+email\s*=\s*excluded\.email,\s*name\s*=\s*excluded\.name/iu);
  assert.doesNotMatch(callback, /nickname\s*=\s*excluded\.nickname/iu);
  assert.match(ranking, /nickname_snapshot/u);
  assert.match(ranking, /members/u);
  assert.match(socket, /accountUser\s*\(\s*session\s*\)\.name/u);
  assert.match(worker, /request\.method\s*===\s*["']PATCH["'][\s\S]*updateNickname/u);
});

test("D1 adds an optional, non-unique nickname with the same length boundary", () => {
  for (const source of [schema, migration]) {
    assert.match(source, /nickname\s+TEXT/iu);
    assert.match(source, /length\s*\(\s*nickname\s*\)\s+BETWEEN\s+2\s+AND\s+16/iu);
    assert.match(source, /nickname\s*=\s*trim\s*\(\s*nickname\s*\)/iu);
    assert.doesNotMatch(source, /(?:UNIQUE\s*\(\s*nickname\s*\)|nickname\s+TEXT\s+UNIQUE)/iu);
  }
  assert.match(migration, /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+nickname/iu);
});

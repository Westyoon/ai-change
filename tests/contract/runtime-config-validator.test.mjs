import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEPARTMENT_DISPLAY_NAMES,
  SCAFFOLD_MINI_GAME_DEPARTMENTS,
  validateMiniGameCandidate,
  validateScaffoldContent
} from "../../js/core/config-validator.js";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

test("runtime config validator accepts the checked-in runtime data graph", async () => {
  const [appConfig, departments, minigames, manifest, mapData, ...scripts] = await Promise.all([
    readJson("../../data/app-config.json"),
    readJson("../../data/departments.json"),
    readJson("../../data/minigames.json"),
    readJson("../../data/asset-manifest.json"),
    readJson("../../data/map-data.json"),
    readJson("../../data/scripts/main-story.json"),
    readJson("../../data/scripts/npc-dialogues.json"),
    readJson("../../data/scripts/minigame-outros.json")
  ]);

  const result = validateScaffoldContent({
    appConfig,
    departments,
    minigames,
    manifest,
    mapData,
    scripts,
    htmlContentVersion: 1
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 5);
});

test("runtime department constants preserve all user-approved abbreviations", () => {
  assert.deepEqual(DEPARTMENT_DISPLAY_NAMES, {
    AI: "인공지능학부",
    DS: "데이터사이언스전공",
    CSE: "컴퓨터공학과",
    CS: "사이버보안학과",
    AIDS: "인공지능데이터사이언스학부"
  });
  assert.deepEqual(SCAFFOLD_MINI_GAME_DEPARTMENTS, {
    "data-number-baseball": "DS",
    "cyber-click-to-purify": "CS",
    "computer-code-heart": "CSE",
    "ai-ball-classification": "AI",
    "ai-data-egg-sort": "AIDS"
  });
});

test("runtime candidate validation rejects host-owned fields and invalid ERROR metrics", () => {
  const candidate = {
    status: "ERROR",
    score: null,
    failureReason: "RUNTIME_ERROR",
    metrics: { shouldBeEmpty: true },
    reward: null,
    sessionId: "host-owned"
  };
  const result = validateMiniGameCandidate(candidate);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("host-owned")));
  assert.ok(result.errors.some((error) => error.includes("metrics must be empty")));
});

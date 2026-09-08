import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSmokeTest } from "./smoke.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(scriptDirectory, "..", "dist");
const forbiddenPaths = [
  "/data/drafts/app-config.draft.json",
  "/assets/images/sample.png",
  "/css/after_control_boss.css",
  "/css/after_minigames.css",
  "/data/battle/data-sphinx.json",
  "/data/minigames/after_controlboss.json",
  "/docs/AI_CHANGE_PLAN.md",
  "/js/battle/minigames/modal-manager.js",
  "/js/battle/postgame/bosses/data-sphinx.js",
  "/js/minigames/after_controlboss/index.js",
  "/js/minigames/AIDS/dev/dev-harness.html",
  "/package.json",
  "/scripts/build.mjs",
  "/tests/contract/validation.test.mjs",
];

try {
  const result = await runSmokeTest({ rootDirectory: distRoot, forbiddenPaths });
  console.log(`Release smoke test passed: ${result.checks} HTTP checks against ${result.origin}.`);
} catch (error) {
  console.error(`Release smoke test failed: ${error.message}`);
  process.exitCode = 1;
}

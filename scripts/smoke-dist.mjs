import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSmokeTest } from "./smoke.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(scriptDirectory, "..", "dist");
const forbiddenPaths = [
  "/data/drafts/app-config.draft.json",
  "/docs/AI_CHANGE_PLAN.md",
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

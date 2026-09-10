import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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

const [packageSource, backendPackageSource, wranglerConfig, buildSource] =
  await Promise.all([
    read("package.json"),
    read("backend/package.json"),
    read("backend/wrangler.toml"),
    read("scripts/build.mjs"),
  ]);

const rootPackage = JSON.parse(packageSource);
const backendPackage = JSON.parse(backendPackageSource);
const canonicalOrigin = wranglerConfig.match(
  /^\s*PUBLIC_ORIGIN\s*=\s*["'](https:\/\/[^"']+)["']\s*$/imu,
)?.[1];

test("the production command deploys the integrated API-first Worker", () => {
  assert.ok(canonicalOrigin, "backend/wrangler.toml must declare the canonical HTTPS origin");
  assert.equal(rootPackage.scripts["cf:deploy:production"], "npm run cf:full:deploy");
  assert.match(rootPackage.scripts["cf:full:deploy"], /npm --prefix backend run deploy/u);
  assert.match(backendPackage.scripts.deploy, /wrangler deploy --config wrangler\.toml/u);
  assert.doesNotMatch(rootPackage.scripts["cf:deploy:production"], /pages deploy/u);
});

test("accountless public deployment shortcuts stay retired", async () => {
  for (const script of [
    "cf:deploy:pages-redirect",
    "cf:deploy:staging",
    "cf:deploy:worker:production",
    "cf:deploy:worker:staging",
    "cf:deploy:temporary",
  ]) {
    assert.equal(rootPackage.scripts[script], undefined, `${script} must not recreate a static public app`);
  }
  assert.equal(await exists("wrangler.jsonc"), false);
  assert.equal(await exists("pages-redirect/_redirects"), false);
});

test("the shared application dist remains free of the Pages-only redirect", async () => {
  const publicEntries = buildSource.match(
    /const\s+PUBLIC_ENTRIES\s*=\s*Object\.freeze\s*\((\[[\s\S]*?\])\s*\)/u,
  )?.[1] ?? "";
  assert.ok(publicEntries, "build public entry list could not be inspected");
  assert.doesNotMatch(publicEntries, /pages-redirect|_redirects/u);
  assert.doesNotMatch(buildSource, /pages-redirect/u);
  assert.equal(await exists("dist/_redirects"), false);
});

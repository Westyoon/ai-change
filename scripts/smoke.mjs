import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createStaticServer, root } from "./serve.mjs";

function unwrapAssets(manifest) {
  return Array.isArray(manifest) ? manifest : manifest?.assets;
}

async function assertResponse(baseUrl, pathname, expectedType, expectedStatus = 200) {
  const response = await fetch(new URL(pathname, baseUrl));
  const contentType = response.headers.get("content-type") ?? "";
  await response.arrayBuffer();

  if (response.status !== expectedStatus) {
    throw new Error(`${pathname}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  if (expectedType && !contentType.toLowerCase().startsWith(expectedType.toLowerCase())) {
    throw new Error(`${pathname}: expected Content-Type ${expectedType}, received ${contentType || "<missing>"}`);
  }
}

function expectedAssetType(pathname) {
  const extension = path.extname(pathname).toLowerCase();
  return new Map([
    [".css", "text/css"],
    [".html", "text/html"],
    [".js", "text/javascript"],
    [".json", "application/json"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".webp", "image/webp"],
  ]).get(extension);
}

export async function runSmokeTest({ rootDirectory = root, forbiddenPaths = [] } = {}) {
  const manifestPath = path.join(rootDirectory, "data", "asset-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const indexHtml = await readFile(path.join(rootDirectory, "index.html"), "utf8");
  const stylePaths = [...indexHtml.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/giu)]
    .map((match) => new URL(match[1], "http://localhost/").pathname);
  const modulePaths = [...indexHtml.matchAll(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)]
    .map((match) => new URL(match[1], "http://localhost/").pathname);
  const manifestAssets = unwrapAssets(manifest);
  if (!Array.isArray(manifestAssets) || manifestAssets.length === 0) {
    throw new Error("asset-manifest.json must expose at least one runtime asset for the smoke test");
  }

  const server = createStaticServer({ rootDirectory });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const baseUrl = new URL(`http://127.0.0.1:${address.port}/`);
  let checks = 0;

  try {
    await assertResponse(baseUrl, "/", "text/html");
    checks += 1;
    for (const stylePath of stylePaths) {
      await assertResponse(baseUrl, stylePath, "text/css");
      checks += 1;
    }
    for (const modulePath of modulePaths) {
      await assertResponse(baseUrl, modulePath, "text/javascript");
      checks += 1;
    }
    await assertResponse(baseUrl, "/data/app-config.json", "application/json");
    checks += 1;
    await assertResponse(baseUrl, "/data/asset-manifest.json", "application/json");
    checks += 1;
    for (const asset of manifestAssets) {
      if (typeof asset?.src !== "string") {
        throw new Error(`Manifest asset ${asset?.id ?? "<unknown>"} has no src`);
      }
      const assetUrl = new URL(asset.src, baseUrl);
      if (assetUrl.origin !== baseUrl.origin) {
        throw new Error(`Manifest asset ${asset.id} must stay on the deployment origin`);
      }
      await assertResponse(baseUrl, assetUrl.pathname, expectedAssetType(assetUrl.pathname));
      checks += 1;
    }
    await assertResponse(baseUrl, "/__ai_change_missing__.json", "text/plain", 404);
    checks += 1;
    for (const forbiddenPath of forbiddenPaths) {
      await assertResponse(baseUrl, forbiddenPath, "text/plain", 404);
      checks += 1;
    }
  } finally {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return { checks, origin: baseUrl.origin };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    const result = await runSmokeTest();
    console.log(`Smoke test passed: ${result.checks} HTTP checks against ${result.origin}.`);
  } catch (error) {
    console.error(`Smoke test failed: ${error.message}`);
    process.exitCode = 1;
  }
}

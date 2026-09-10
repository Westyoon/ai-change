import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the festival logo remains on the main and loading scenes while the top bar stays compact", async () => {
  const [html, manifestText, menu, loading] = await Promise.all([
    source("index.html"),
    source("data/asset-manifest.json"),
    source("js/scenes/main-menu-scene.js"),
    source("js/scenes/loading-scene.js"),
  ]);
  const manifest = JSON.parse(manifestText);
  const logo = manifest.assets.find((asset) => asset.id === "app-logo");

  assert.equal(logo?.src, "./assets/images/main logo.png");
  assert.match(logo?.alt ?? "", /인지사전게임/u);
  assert.doesNotMatch(html, /class="brand-mark(?:__logo|__name)?"/u);
  assert.match(html, /class="build-badge">LIVE · v1/u);
  assert.match(html, /data-top-route="account"/u);
  assert.match(html, /data-top-route="settings"/u);
  assert.match(html, /shape-rendering="crispEdges"/u);
  assert.match(html, /class="scene-brand-logo scene-brand-logo--loading"/u);
  assert.doesNotMatch(html, />\s*ai-change\s*</u);
  assert.doesNotMatch(menu, /image\.width\s*=|image\.height\s*=/u);
  assert.match(menu, /className = "scene-brand-logo"/u);
  assert.match(loading, /main%20logo\.png/u);
});

test("the shared theme uses the logo palette, responsive plaid, and self-hosted Galmuri", async () => {
  const [common, responsive, build] = await Promise.all([
    source("css/common.css"),
    source("css/responsive.css"),
    source("scripts/build.mjs"),
  ]);

  assert.match(common, /@font-face\s*\{[\s\S]*?Galmuri11\.woff2/u);
  assert.match(common, /@font-face\s*\{[\s\S]*?Galmuri11-Bold\.woff2/u);
  assert.match(common, /--accent:\s*#e95f9d/u);
  assert.match(common, /repeating-linear-gradient\(\s*0deg/u);
  assert.match(common, /repeating-linear-gradient\(\s*90deg/u);
  assert.match(common, /\.scene-brand-logo\s*\{[\s\S]*?height:\s*auto/u);
  assert.match(common, /font-family:\s*var\(--font-body\)/u);
  assert.match(responsive, /\.scene-brand-logo/u);
  assert.match(build, /"assets\/fonts\/Galmuri11\.woff2"/u);
  assert.match(build, /"assets\/fonts\/LICENSE\.txt"/u);
  assert.match(build, /font-src 'self'/u);
  assert.doesNotMatch(build, /cdn\.jsdelivr\.net/u);
});

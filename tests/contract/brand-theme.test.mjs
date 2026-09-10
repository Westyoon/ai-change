import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the final festival logo replaces visible ai-change wordmarks without changing the app id", async () => {
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
  assert.match(html, /class="brand-mark__logo"[^>]*[\s\S]*?main%20logo\.png/u);
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
  assert.match(common, /--accent:\s*#d82f76/u);
  assert.match(common, /--accent-alt:\s*#e333bb/u);
  assert.match(common, /--surface:\s*#363367/u);
  assert.match(common, /--accent-cyan:\s*#2ab5e4/u);
  assert.match(common, /--text:\s*#ffffff/u);
  assert.match(common, /button--primary:hover\s*\{[\s\S]*?background:\s*var\(--accent-strong\)/u);
  assert.match(common, /\[tabindex\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*0 0 0 6px var\(--surface\)/u);
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

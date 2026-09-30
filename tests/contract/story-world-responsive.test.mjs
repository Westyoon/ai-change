import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the Story world fits laptop and portrait heights without stretching its logical map", async () => {
  const mapCss = await source("css/map.css");

  assert.match(
    mapCss,
    /\.story-world-scene\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(260px, 1fr\) auto;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/u,
  );
  assert.match(
    mapCss,
    /\.story-world__viewport\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*calc\(100dvh - 180px\);/u,
  );
  assert.match(
    mapCss,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.story-world__viewport\s*\{[\s\S]*?min-height:\s*260px;[\s\S]*?max-height:\s*calc\(100dvh - 150px\);/u,
  );
  assert.doesNotMatch(mapCss, /height:\s*clamp\(460px,\s*68dvh,\s*680px\)/u);
});

test("the Story inventory stays in the toolbar and blocks background interaction while open", async () => {
  const [inventoryCss, mapScene] = await Promise.all([
    source("css/story-inventory.css"),
    source("js/scenes/map-scene.js"),
  ]);

  assert.match(
    inventoryCss,
    /\.story-inventory\s*\{[\s\S]*?position:\s*relative;/u,
  );
  assert.match(
    inventoryCss,
    /\.story-inventory__panel\s*\{[\s\S]*?position:\s*fixed;/u,
  );
  assert.match(
    inventoryCss,
    /\.story-inventory__panel\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;[\s\S]*?overflow:\s*hidden;/u,
  );
  assert.match(
    inventoryCss,
    /\.story-inventory__egg-list\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/u,
  );
  assert.match(inventoryCss, /\.story-inventory__memories\s*\{[\s\S]*?width:\s*100%;/u);
  assert.match(inventoryCss, /\.story-inventory\[data-open="true"\] \.story-inventory__trigger\s*\{[^}]*visibility:\s*hidden;/u);
  assert.match(inventoryCss, /\.story-inventory__overlay\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*110;/u);
  assert.match(inventoryCss, /\.story-inventory__panel\s*\{[^}]*bottom:\s*max\(16px, env\(safe-area-inset-bottom\)\);/u);
  assert.match(inventoryCss, /\.story-inventory__egg-list\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*max-content;/u);
  assert.match(mapScene, /if \(navigationPending \|\| inventory\?\.isOpen \|\| !system\) return false;/u);
  assert.match(mapScene, /viewport\.inert = true;[\s\S]*?toolbarActions\.inert = true;/u);
  assert.match(mapScene, /viewport\.inert = false;[\s\S]*?toolbarActions\.inert = false;/u);
});

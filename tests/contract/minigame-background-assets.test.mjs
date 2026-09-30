import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function readPngDimensions(relativePath) {
  const bytes = await readFile(new URL(relativePath, ROOT));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("department mini-games register their required production background assets", async () => {
  const manifest = await readJson("data/asset-manifest.json");
  const entries = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const configs = [
    ["data/minigames/number-baseball.json", "backgroundAssetId", "data-number-baseball"],
    ["data/minigames/code-heart.json", "backgroundAssetId", "computer-code-heart"],
    ["data/minigames/click-to-purify.json", "stageBackgroundAssetId", "cyber-click-to-purify"],
    ["data/minigames/click-to-purify.json", "arenaBackgroundAssetId", "cyber-click-to-purify"],
    ["data/minigames/ai-ball-classification.json", "backgroundAssetId", "ai-ball-classification"],
    ["data/minigames/ai-ball-classification.json", "sortingBinAssetId", "ai-ball-classification"],
    ["data/minigames/ai-ball-classification.json", "sortingLidAssetId", "ai-ball-classification"],
  ];

  for (const [configPath, field, expectedGroup] of configs) {
    const config = await readJson(configPath);
    const asset = entries.get(config[field]);
    assert.ok(asset, `${configPath}.${field} must resolve through the asset manifest`);
    assert.equal(asset.type, "image");
    assert.equal(asset.group, expectedGroup);
    assert.equal(asset.required, true);
    assert.match(asset.src, /^\.\/assets\/(?:minigames|images)\//u);
  }
});

test("derived backgrounds are cropped and sized for laptop and portrait-mobile memory limits", async () => {
  const expected = new Map([
    ["assets/minigames/number-baseball/game-background.png", { width: 2048, height: 1258 }],
    ["assets/minigames/code-heart/game-background.png", { width: 2048, height: 972 }],
    ["assets/minigames/click-to-purify/stage-background.png", { width: 2048, height: 1253 }],
    ["assets/minigames/click-to-purify/arena-background.png", { width: 1200, height: 1200 }],
    ["assets/minigames/ai-ball-classification/game-background.png", { width: 960, height: 920 }],
    ["assets/minigames/ai-ball-classification/sorting-bin.png", { width: 256, height: 264 }],
    ["assets/minigames/ai-ball-classification/sorting-bin-pixel.png", { width: 1182, height: 1330 }],
  ]);

  for (const [path, dimensions] of expected) {
    assert.deepEqual(await readPngDimensions(path), dimensions, path);
    assert.ok(dimensions.width * dimensions.height <= 2_600_000, `${path} is too large to decode safely`);
  }
});

test("AI background and pixel bin use independent crops within their source images", async () => {
  const config = await readJson("data/minigames/ai-ball-classification.json");
  assert.notEqual(config.backgroundAssetId, config.sortingBinAssetId);
  assert.deepEqual(config.backgroundSourceRect, { x: 0, y: 0, width: 960, height: 920 });
  const manifest = await readJson("data/asset-manifest.json");
  const asset = manifest.assets.find((entry) => entry.id === config.sortingBinAssetId);
  const dimensions = await readPngDimensions(asset.src);
  const rect = config.binSourceRect;
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
  assert.ok(rect.x + rect.width <= dimensions.width);
  assert.ok(rect.y + rect.height <= dimensions.height);
  const lid = entriesForLid(manifest, config);
  const lidSize = await readPngDimensions(lid.src);
  assert.ok(config.lidSourceRect.x + config.lidSourceRect.width <= lidSize.width);
  assert.ok(config.lidSourceRect.y + config.lidSourceRect.height <= lidSize.height);
});

function entriesForLid(manifest, config) {
  return manifest.assets.find((entry) => entry.id === config.sortingLidAssetId);
}

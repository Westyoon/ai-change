import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("light shared controls keep dark idle text and use a pink/white interactive state", async () => {
  const common = await source("css/common.css");

  assert.match(
    common,
    /\.top-nav__button\s*\{[\s\S]*?color:\s*var\(--ink\);[\s\S]*?background:\s*var\(--paper\);/u,
  );
  assert.match(
    common,
    /\.top-nav__button:not\(:disabled\):not\(\[aria-disabled="true"\]\):hover,[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*var\(--accent\);/u,
  );
  assert.match(
    common,
    /\.button\s*\{[\s\S]*?color:\s*var\(--ink\);[\s\S]*?background:\s*var\(--paper\);/u,
  );
  assert.match(
    common,
    /\.button:not\(\.button--primary\):not\(\.button--danger\):not\(\.button--ghost\):not\(:disabled\):not\(\[aria-disabled="true"\]\):hover,[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*var\(--accent\);/u,
  );
  assert.match(
    common,
    /\.menu-card:not\(:disabled\):not\(\[aria-disabled="true"\]\):hover,[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*var\(--accent\);/u,
  );
});

test("disabled and non-interactive surfaces do not advertise a hover action", async () => {
  const [common, map, battle, afterMinigames, minigames] = await Promise.all([
    source("css/common.css"),
    source("css/map.css"),
    source("css/battle.css"),
    source("css/after_minigames.css"),
    source("css/minigames.css"),
  ]);

  assert.doesNotMatch(common, /\.info-card:hover/u);
  assert.doesNotMatch(common, /(?<![\w-])\.button:hover/u);
  assert.doesNotMatch(battle, /\.postgame-room-card:hover/u);
  assert.match(map, /\.npc-card:not\(:disabled\):not\(\[aria-disabled="true"\]\):hover/u);
  assert.match(map, /\.story-memory-card:disabled,[\s\S]*?opacity:\s*0\.52/u);
  assert.match(afterMinigames, /\.mg-btn:not\(:disabled\):hover/u);
  assert.match(afterMinigames, /\.rps-choice:not\(:disabled\):hover/u);
  assert.match(minigames, /\.ch-btn-material:not\(:disabled\):hover/u);
});

test("programmatically focused scene roots do not draw the yellow interaction outline", async () => {
  const [common, html] = await Promise.all([
    source("css/common.css"),
    source("index.html"),
  ]);

  assert.match(html, /<main id="app" class="scene-root" tabindex="-1">/u);
  assert.match(common, /\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible/u);
  assert.doesNotMatch(common, /(?<!not\()\[tabindex\]:focus-visible/u);
  assert.match(common, /\.scene-root:focus,\s*\.scene-root:focus-visible\s*\{\s*outline:\s*none;/u);
});

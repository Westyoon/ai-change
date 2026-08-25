import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_DEPARTMENTS,
  EXPECTED_GAMES,
  extractHtmlContentVersion,
  extractJavaScriptContentVersion,
  validateReferenceGraph,
  validateToolingPackage
} from "../../scripts/validate.mjs";

function makeFixture() {
  const scripts = [];
  const assets = [];
  const minigames = [];
  const npcs = [];
  const imports = [];
  const configDocuments = {};

  for (const [id, expected] of Object.entries(EXPECTED_GAMES)) {
    const prefix = id;
    scripts.push(
      { id: `${prefix}-intro`, type: "dialogue", lines: [], nextAction: { type: "openMiniGame", target: id } },
      { id: `${prefix}-clear`, type: "dialogue", lines: [], nextAction: { type: "returnToMap" } },
      { id: `${prefix}-fail`, type: "dialogue", lines: [], nextAction: { type: "returnToMap" } },
      { id: `${prefix}-first`, type: "dialogue", lines: [] },
      { id: `${prefix}-revisit`, type: "dialogue", lines: [] }
    );
    assets.push(
      {
        id: `${prefix}-config`,
        group: id,
        type: "json",
        src: `./${expected.configPath}`,
        required: true,
        alt: null,
        sourceRef: `CONTENT-${expected.departmentCode}-001`
      },
      {
        id: `${prefix}-thumbnail`,
        group: id,
        type: "image",
        src: `./assets/minigames/${id}/thumbnail.svg`,
        required: true,
        alt: `${expected.department} 미니게임 미리보기`,
        sourceRef: `ASSET-${expected.departmentCode}-001`
      }
    );
    minigames.push({
      id,
      department: expected.department,
      departmentCode: expected.departmentCode,
      title: id,
      introScript: `${prefix}-intro`,
      clearOutroScript: `${prefix}-clear`,
      failOutroScript: `${prefix}-fail`,
      module: id,
      configAssetId: `${prefix}-config`,
      thumbnailAssetId: `${prefix}-thumbnail`,
      assetGroup: id,
      recordPolicy: null,
      status: "published",
      unlockCondition: null
    });
    npcs.push({
      id: `npc-${expected.departmentCode.toLowerCase()}`,
      departmentCode: expected.departmentCode,
      firstScript: `${prefix}-first`,
      revisitScript: `${prefix}-revisit`,
      miniGameId: id,
      completionRule: { type: "MINIGAME_CLEAR", target: id }
    });
    imports.push(`"${id}": () => import("./${expected.modulePath}")`);
    configDocuments[expected.configPath] = { gameId: id, implementationStatus: "SCAFFOLD" };
  }

  return {
    appConfig: {
      appId: "ai-change",
      contentVersion: 1,
      storageChannel: "development",
      publicBasePath: "/",
      initialScene: "loading",
      mainMapId: "festival-main-map",
      defaultLocale: "ko-KR",
      audio: { masterVolume: 0.8, bgmVolume: 0.6, sfxVolume: 0.8 },
      features: { story: true, localSave: true, battleContent: false }
    },
    battles: [],
    departments: {
      departments: Object.entries(EXPECTED_DEPARTMENTS).map(([code, department]) => ({
        code,
        slug: code.toLowerCase(),
        ...department
      }))
    },
    htmlVersion: "1",
    javaScriptVersion: "1",
    manifest: { contentVersion: 1, assets },
    mapData: { id: "festival-main-map", npcs },
    minigames,
    registrySource: `const loaders = {${imports.join(",")}};`,
    scriptDocuments: [{ scripts }],
    configDocuments
  };
}

test("contentVersion extractors accept attribute reordering and numeric constants", () => {
  assert.equal(
    extractHtmlContentVersion('<meta content="7" name="ai-change-content-version">'),
    "7"
  );
  assert.equal(extractJavaScriptContentVersion("export const CONTENT_VERSION = 7;"), "7");
});

test("tooling package contract is dependency-free and exposes the required commands", () => {
  const packageDocument = {
    type: "module",
    scripts: {
      dev: "node scripts/serve.mjs",
      validate: "node scripts/validate.mjs",
      test: "node --test",
      smoke: "node scripts/smoke.mjs",
      check: "npm run validate && npm test && npm run smoke"
    }
  };
  assert.deepEqual(validateToolingPackage(packageDocument), []);

  packageDocument.devDependencies = { vite: "latest" };
  assert.ok(validateToolingPackage(packageDocument).some((error) => error.includes("zero external dependencies")));
});

test("the complete five-department reference graph passes", () => {
  assert.deepEqual(validateReferenceGraph(makeFixture()), []);
});

test("department abbreviations are an exact stable mapping", () => {
  const fixture = makeFixture();
  fixture.minigames.find((game) => game.id === "cyber-click-to-purify").departmentCode = "CSE";

  const errors = validateReferenceGraph(fixture);
  assert.ok(errors.some((error) => error.includes("departmentCode must be CS")));
});

test("department catalog display and short names are part of the exact mapping", () => {
  const fixture = makeFixture();
  fixture.departments.departments.find((department) => department.code === "AIDS").shortName = "AI-DS";

  const errors = validateReferenceGraph(fixture);
  assert.ok(errors.some((error) => error.includes("AIDS shortName must be 인데부")));
});

test("broken registry, dialogue, NPC, manifest and version references are reported together", () => {
  const fixture = makeFixture();
  fixture.appConfig.contentVersion = 2;
  fixture.minigames[0].introScript = "missing-script";
  fixture.minigames[1].thumbnailAssetId = "missing-thumbnail";
  fixture.mapData.npcs[0].miniGameId = "missing-game";
  fixture.scriptDocuments[0].scripts[0].nextAction.target = "missing-game";
  fixture.registrySource = "";

  const errors = validateReferenceGraph(fixture);
  assert.ok(errors.some((error) => error.includes("contentVersion mismatch")));
  assert.ok(errors.some((error) => error.includes("introScript does not resolve")));
  assert.ok(errors.some((error) => error.includes("thumbnailAssetId")));
  assert.ok(errors.some((error) => error.includes("NPC") && error.includes("miniGameId")));
  assert.ok(errors.some((error) => error.includes("openMiniGame action target")));
  assert.ok(errors.some((error) => error.includes("js/minigames/registry.js")));
});

test("runtime draft paths in the manifest are rejected", () => {
  const fixture = makeFixture();
  fixture.manifest.assets[0].src = "./data/drafts/minigames/number-baseball.draft.json";

  const errors = validateReferenceGraph(fixture);
  assert.ok(errors.some((error) => error.includes("references a draft path")));
});

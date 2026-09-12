import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { root as defaultRoot } from "./serve.mjs";

const execFileAsync = promisify(execFile);

export const EXPECTED_GAMES = Object.freeze({
  "ai-ball-classification": Object.freeze({
    department: "인공지능학부",
    departmentCode: "AI",
    configPath: "data/minigames/ai-ball-classification.json",
    modulePath: "AI/index.js"
  }),
  "data-number-baseball": Object.freeze({
    department: "데이터사이언스전공",
    departmentCode: "DS",
    configPath: "data/minigames/number-baseball.json",
    modulePath: "DS/index.js"
  }),
  "computer-code-heart": Object.freeze({
    department: "컴퓨터공학과",
    departmentCode: "CSE",
    configPath: "data/minigames/code-heart.json",
    modulePath: "CSE/index.js"
  }),
  "cyber-click-to-purify": Object.freeze({
    department: "사이버보안학과",
    departmentCode: "CS",
    configPath: "data/minigames/click-to-purify.json",
    modulePath: "CS/index.js"
  }),
  "ai-data-egg-sort": Object.freeze({
    department: "인공지능데이터사이언스학부",
    departmentCode: "AIDS",
    configPath: "data/minigames/ai-data-egg-sort.json",
    modulePath: "AIDS/index.js"
  })
});

export const EXPECTED_DEPARTMENTS = Object.freeze({
  AI: Object.freeze({ displayName: "인공지능학부", shortName: "인공지능" }),
  DS: Object.freeze({ displayName: "데이터사이언스전공", shortName: "데이터사이언스" }),
  CSE: Object.freeze({ displayName: "컴퓨터공학과", shortName: "컴공" }),
  CS: Object.freeze({ displayName: "사이버보안학과", shortName: "사이버보안" }),
  AIDS: Object.freeze({ displayName: "인공지능데이터사이언스학부", shortName: "인데부" })
});

export const REQUIRED_FILES = Object.freeze([
  "package.json",
  "index.html",
  "assets/bgm/intro.mp3",
  "assets/bgm/main-theme.mp3",
  "assets/images/character-walk.png",
  "css/common.css",
  "css/responsive.css",
  "css/dialogue.css",
  "css/map.css",
  "css/minigames.css",
  "css/battle-character.css",
  "css/battle.css",
  "css/control-boss.css",
  "css/data-sphinx.css",
  "css/stat-boss.css",
  "css/xr-egg-trials.css",
  "css/word-breaker.css",
  "css/account.css",
  "js/app.js",
  "js/router.js",
  "js/core/account-service.js",
  "js/core/config-validator.js",
  "js/core/version.js",
  "js/battle/registry.js",
  "js/battle/player-config.js",
  "js/battle/unlock.js",
  "js/battle/character/index.js",
  "js/battle/character/character.js",
  "js/battle/character/character-controller.js",
  "js/battle/character/character-input.js",
  "js/battle/character/character-system.js",
  "js/battle/character/character-view.js",
  "js/battle/character/constants.js",
  "js/battle/character/virtual-joystick.js",
  "js/battle/postgame/bosses/control-boss/index.js",
  "js/battle/postgame/bosses/data-sphinx/index.js",
  "js/battle/postgame/bosses/stat-boss/index.js",
  "js/battle/postgame/bosses/word-breaker/battle.js",
  "js/battle/postgame/bosses/word-breaker/collision.js",
  "js/battle/postgame/bosses/word-breaker/config.js",
  "js/battle/postgame/bosses/word-breaker/encounter.js",
  "js/battle/postgame/bosses/word-breaker/index.js",
  "js/battle/postgame/bosses/word-breaker/patterns.js",
  "js/battle/postgame/bosses/word-breaker/view.js",
  "js/battle/postgame/challenges/xr-egg-trials/index.js",
  "js/scenes/loading-scene.js",
  "js/scenes/main-menu-scene.js",
  "js/scenes/how-to-scene.js",
  "js/scenes/settings-scene.js",
  "js/scenes/map-scene.js",
  "js/scenes/dialogue-scene.js",
  "js/scenes/minigame-intro-scene.js",
  "js/scenes/minigame-scene.js",
  "js/scenes/battle-coming-soon-scene.js",
  "js/scenes/battle-scene.js",
  "js/scenes/character-preview-scene.js",
  "js/scenes/account-scene.js",
  "js/scenes/ranking-scene.js",
  "js/scenes/error-scene.js",
  "js/scenes/scene-utils.js",
  "js/ui/result-overlay.js",
  "js/ui/top-navigation.js",
  "js/minigames/registry.js",
  "js/minigames/DS/index.js",
  "js/minigames/CS/index.js",
  "js/minigames/CSE/index.js",
  "js/minigames/AI/index.js",
  "js/minigames/AIDS/index.js",
  "data/app-config.json",
  "data/asset-manifest.json",
  "data/minigames.json",
  "data/departments.json",
  "data/battles.json",
  "data/battle/control-boss.json",
  "data/battle/data-sphinx.json",
  "data/battle/stat-boss.json",
  "data/battle/word-breaker.json",
  "data/battle/xr-egg-trials.json",
  "data/map-data.json",
  "data/scripts/npc-dialogues.json",
  "data/scripts/minigame-outros.json",
  "data/minigames/number-baseball.json",
  "data/minigames/click-to-purify.json",
  "data/minigames/code-heart.json",
  "data/minigames/ai-ball-classification.json",
  "data/minigames/ai-data-egg-sort.json"
]);

const RUNTIME_TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs"]);
const SKIPPED_DIRECTORIES = new Set([".git", ".wrangler", "dist", "node_modules", "releases"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORD_BREAKER_GUARDIANS = Object.freeze([
  Object.freeze({ code: "DS", color: "#d82f76" }),
  Object.freeze({ code: "CS", color: "#363367" }),
  Object.freeze({ code: "CSE", color: "#e333bb" }),
  Object.freeze({ code: "AI", color: "#2ab5e4" }),
  Object.freeze({ code: "AIDS", color: "#fac804" }),
]);
const UNSAFE_WORD_BREAKER_COPY = /자해|극단적\s*선택|죽고\s*싶|죽어\s*버|혐오|살\s*가치가\s*없/u;
const REQUIRED_NPM_SCRIPTS = Object.freeze({
  dev: "node scripts/serve.mjs",
  validate: "node scripts/validate.mjs",
  test: "node --test",
  smoke: "node scripts/smoke.mjs",
  check: "npm run validate && npm test && npm run smoke"
});

function addError(errors, message) {
  errors.push(message);
}

function asArray(document, keys, label, errors) {
  if (Array.isArray(document)) {
    return document;
  }

  if (document && typeof document === "object") {
    for (const key of keys) {
      if (Array.isArray(document[key])) {
        return document[key];
      }
    }
  }

  addError(errors, `${label} must be an array or contain ${keys.join("/")}`);
  return [];
}

function requireUniqueIds(records, label, errors) {
  const seen = new Set();

  for (const record of records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || record.id.length === 0) {
      addError(errors, `${label} entry is missing a non-empty id`);
      continue;
    }

    if (!ID_PATTERN.test(record.id)) {
      addError(errors, `${label} id must be lowercase kebab-case: ${record.id}`);
    }

    if (seen.has(record.id)) {
      addError(errors, `${label} id is duplicated: ${record.id}`);
    }
    seen.add(record.id);
  }

  return seen;
}

function groupsForAsset(asset) {
  if (Array.isArray(asset?.group)) {
    return asset.group;
  }
  if (typeof asset?.group === "string") {
    return [asset.group];
  }
  return [];
}

function recursivelyVisit(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) {
      recursivelyVisit(item, visitor);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  visitor(value);
  for (const nested of Object.values(value)) {
    recursivelyVisit(nested, visitor);
  }
}

export function extractDialogueScripts(scriptDocuments) {
  const scripts = [];

  for (const document of scriptDocuments ?? []) {
    recursivelyVisit(document, (record) => {
      if (
        typeof record.id === "string" &&
        (Array.isArray(record.lines) || record.type === "dialogue")
      ) {
        scripts.push(record);
      }
    });
  }

  return scripts;
}

export function extractHtmlContentVersion(html) {
  const metaTags = String(html).match(/<meta\b[^>]*>/giu) ?? [];
  const tag = metaTags.find((candidate) => /\bname\s*=\s*["']ai-change-content-version["']/iu.test(candidate));
  if (!tag) {
    return null;
  }

  const match = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/iu);
  return match?.[1] ?? null;
}

export function extractJavaScriptContentVersion(source) {
  const match = String(source).match(
    /(?:export\s+)?const\s+(?:AI_CHANGE_)?CONTENT_VERSION\s*=\s*(?:["']([^"']+)["']|(\d+))/u
  );
  return match?.[1] ?? match?.[2] ?? null;
}

export function validateToolingPackage(packageDocument) {
  const errors = [];
  if (!packageDocument || typeof packageDocument !== "object" || Array.isArray(packageDocument)) {
    return ["package.json must contain an object"];
  }
  if (packageDocument.type !== "module") {
    addError(errors, `package.json type must be module; received ${packageDocument.type}`);
  }

  for (const [name, command] of Object.entries(REQUIRED_NPM_SCRIPTS)) {
    if (packageDocument.scripts?.[name] !== command) {
      addError(errors, `package.json script ${name} must be exactly: ${command}`);
    }
  }

  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (packageDocument[field] && Object.keys(packageDocument[field]).length > 0) {
      addError(errors, `package.json ${field} must stay empty; the scaffold has zero external dependencies`);
    }
  }
  return errors;
}

function validateVersionContract(snapshot, errors) {
  const versions = new Map([
    ["index.html meta", snapshot.htmlVersion],
    ["app-config.json", snapshot.appConfig?.contentVersion],
    ["asset-manifest.json", snapshot.manifest?.contentVersion],
    ["js/core/version.js", snapshot.javaScriptVersion]
  ]);
  const values = [];

  for (const [label, version] of versions) {
    if (version === undefined || version === null || String(version).trim() === "") {
      addError(errors, `${label} contentVersion is missing`);
    } else {
      values.push([label, String(version)]);
    }
  }

  if (values.length === versions.size && new Set(values.map(([, version]) => version)).size !== 1) {
    addError(
      errors,
      `contentVersion mismatch: ${values.map(([label, version]) => `${label}=${version}`).join(", ")}`
    );
  }

  const numericVersion = Number(snapshot.appConfig?.contentVersion);
  if (!Number.isInteger(numericVersion) || numericVersion < 1) {
    addError(errors, "app-config.json contentVersion must be a positive integer");
  }
}

function validateAppConfig(appConfig, battles, mapData, errors) {
  if (!appConfig || typeof appConfig !== "object") {
    addError(errors, "app-config.json must contain an object");
    return;
  }

  if (appConfig.appId !== "ai-change") {
    addError(errors, `app-config.json appId must be ai-change; received ${appConfig.appId}`);
  }
  if (appConfig.defaultLocale !== "ko-KR") {
    addError(errors, `app-config.json defaultLocale must be ko-KR; received ${appConfig.defaultLocale}`);
  }
  if (appConfig.initialScene !== "loading") {
    addError(errors, `app-config.json initialScene must be loading; received ${appConfig.initialScene}`);
  }
  if (appConfig.storageChannel !== "production") {
    addError(errors, `app-config.json storageChannel must be production; received ${appConfig.storageChannel}`);
  }
  if (!appConfig.features || appConfig.features.story !== true || appConfig.features.localSave !== true) {
    addError(errors, "app-config.json production features story and localSave must both be true");
  }

  for (const field of ["masterVolume", "bgmVolume", "sfxVolume"]) {
    const value = appConfig.audio?.[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      addError(errors, `app-config.json audio.${field} must be a finite number in the range 0..1`);
    }
  }

  const maps = Array.isArray(mapData?.maps) ? mapData.maps : mapData ? [mapData] : [];
  if (typeof appConfig.mainMapId !== "string" || !maps.some((map) => map?.id === appConfig.mainMapId)) {
    addError(errors, `app-config.json mainMapId does not resolve: ${appConfig.mainMapId}`);
  }

  const hasPublishedBattle = battles.some((battle) => battle?.status === "published");
  if (appConfig.features?.battleContent !== hasPublishedBattle) {
    addError(
      errors,
      `app-config.json features.battleContent must equal published Battle presence (${hasPublishedBattle})`
    );
  }
}

function validateManifest(assets, errors) {
  const allowedTypes = new Set(["audio", "font", "image", "json"]);
  const assetIds = requireUniqueIds(assets, "asset", errors);

  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || typeof asset.id !== "string") {
      continue;
    }
    if (!allowedTypes.has(asset.type)) {
      addError(errors, `asset ${asset.id} has unsupported type: ${asset.type}`);
    }
    if (typeof asset.src !== "string" || asset.src.length === 0) {
      addError(errors, `asset ${asset.id} is missing src`);
    }
    if (groupsForAsset(asset).length === 0) {
      addError(errors, `asset ${asset.id} is missing group`);
    }
    if (typeof asset.required !== "boolean") {
      addError(errors, `asset ${asset.id} required must be boolean`);
    }
    if (asset.type === "image" && (typeof asset.alt !== "string" || asset.alt.trim() === "")) {
      addError(errors, `image asset ${asset.id} requires non-empty alt text`);
    }
    if (typeof asset.sourceRef !== "string" || asset.sourceRef.trim() === "") {
      addError(errors, `asset ${asset.id} requires sourceRef`);
    }
    if (typeof asset.src === "string" && /(^|[/\\])drafts?([/\\]|$)|\.draft\.json(?:$|[?#])/iu.test(asset.src)) {
      addError(errors, `runtime asset ${asset.id} references a draft path: ${asset.src}`);
    }
  }

  return assetIds;
}

function validateDepartments(document, errors) {
  const departments = asArray(document, ["departments", "items"], "departments.json", errors);
  const byCode = new Map();

  for (const department of departments) {
    const code = department?.code;
    if (typeof code !== "string" || code.length === 0) {
      addError(errors, "department entry is missing a non-empty code");
      continue;
    }
    if (byCode.has(code)) {
      addError(errors, `department code is duplicated: ${code}`);
      continue;
    }
    byCode.set(code, department);

    const expected = EXPECTED_DEPARTMENTS[code];
    if (!expected) {
      addError(errors, `unexpected department code: ${code}`);
      continue;
    }
    if (department.displayName !== expected.displayName) {
      addError(errors, `${code} displayName must be ${expected.displayName}; received ${department.displayName}`);
    }
    if (department.shortName !== expected.shortName) {
      addError(errors, `${code} shortName must be ${expected.shortName}; received ${department.shortName}`);
    }
    if (department.slug !== code.toLowerCase()) {
      addError(errors, `${code} slug must be ${code.toLowerCase()}; received ${department.slug}`);
    }
  }

  for (const code of Object.keys(EXPECTED_DEPARTMENTS)) {
    if (!byCode.has(code)) {
      addError(errors, `required department is missing: ${code}`);
    }
  }

  return byCode;
}

function validateGameRegistry(
  games,
  assets,
  scriptIds,
  registrySource,
  departmentByCode,
  configDocuments,
  errors
) {
  const gameIds = requireUniqueIds(games, "mini game", errors);
  const assetById = new Map(assets.filter(Boolean).map((asset) => [asset.id, asset]));
  const expectedIds = new Set(Object.keys(EXPECTED_GAMES));

  for (const expectedId of expectedIds) {
    if (!gameIds.has(expectedId)) {
      addError(errors, `required mini game is missing: ${expectedId}`);
    }
  }
  for (const gameId of gameIds) {
    if (!expectedIds.has(gameId)) {
      addError(errors, `unexpected mini game id: ${gameId}`);
    }
  }

  for (const game of games) {
    if (!game || typeof game !== "object" || !EXPECTED_GAMES[game.id]) {
      continue;
    }

    const expected = EXPECTED_GAMES[game.id];
    if (game.department !== expected.department) {
      addError(errors, `${game.id} department must be ${expected.department}; received ${game.department}`);
    }
    if (game.departmentCode !== expected.departmentCode) {
      addError(errors, `${game.id} departmentCode must be ${expected.departmentCode}; received ${game.departmentCode}`);
    }
    if (!departmentByCode.has(game.departmentCode)) {
      addError(errors, `${game.id} references an undefined departmentCode: ${game.departmentCode}`);
    }
    if (game.module !== game.id) {
      addError(errors, `${game.id} module key must equal its stable id`);
    }

    for (const field of ["introScript", "clearOutroScript", "failOutroScript"]) {
      if (typeof game[field] !== "string" || !scriptIds.has(game[field])) {
        addError(errors, `${game.id} ${field} does not resolve: ${game[field]}`);
      }
    }

    const configAsset = assetById.get(game.configAssetId);
    if (!configAsset || configAsset.type !== "json" || configAsset.required !== true) {
      addError(errors, `${game.id} configAssetId must resolve to a required JSON asset: ${game.configAssetId}`);
    } else if (!groupsForAsset(configAsset).includes(game.assetGroup)) {
      addError(errors, `${game.id} config asset is not in assetGroup ${game.assetGroup}`);
    }
    if (configAsset) {
      const normalizedConfigPath = String(configAsset.src ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
      if (normalizedConfigPath !== expected.configPath) {
        addError(
          errors,
          `${game.id} config asset must point to ${expected.configPath}; received ${configAsset.src}`
        );
      }
      const configDocument =
        configDocuments instanceof Map
          ? configDocuments.get(expected.configPath)
          : configDocuments?.[expected.configPath];
      if (!configDocument || typeof configDocument !== "object") {
        addError(errors, `${game.id} config document is missing: ${expected.configPath}`);
      } else if (configDocument.gameId !== game.id) {
        addError(errors, `${expected.configPath} gameId must be ${game.id}; received ${configDocument.gameId}`);
      }
    }

    const thumbnailAsset = assetById.get(game.thumbnailAssetId);
    if (!thumbnailAsset || thumbnailAsset.type !== "image") {
      addError(errors, `${game.id} thumbnailAssetId must resolve to an image asset: ${game.thumbnailAssetId}`);
    } else if (!groupsForAsset(thumbnailAsset).includes(game.assetGroup)) {
      addError(errors, `${game.id} thumbnail asset is not in assetGroup ${game.assetGroup}`);
    }

    if (!String(registrySource).includes(game.module) || !String(registrySource).includes(expected.modulePath)) {
      addError(errors, `${game.id} is not mapped to ${expected.modulePath} in js/minigames/registry.js`);
    }
  }

  return gameIds;
}

function validateBattleRegistry(
  battles,
  assets,
  gameIds,
  registrySource,
  configDocuments,
  errors
) {
  const validStatuses = new Set(["published", "locked", "coming-soon"]);
  const assetById = new Map(assets.filter(Boolean).map((asset) => [asset.id, asset]));
  const knownGroups = new Set(assets.flatMap((asset) => groupsForAsset(asset)));
  const publishedModules = new Set();
  const requiredMiniGameIds = new Set(Object.keys(EXPECTED_GAMES));

  for (const battle of battles) {
    if (!battle || typeof battle !== "object" || typeof battle.id !== "string") continue;
    if (typeof battle.title !== "string" || battle.title.trim() === "") {
      addError(errors, `Battle ${battle.id} requires a non-empty title`);
    }
    if (!validStatuses.has(battle.status)) {
      addError(errors, `Battle ${battle.id} has invalid status: ${battle.status}`);
      continue;
    }
    if (battle.status !== "published") continue;

    if (typeof battle.module !== "string" || !ID_PATTERN.test(battle.module)) {
      addError(errors, `published Battle ${battle.id} requires a kebab-case module key`);
    } else {
      const loaderPattern = new RegExp(
        `["']${battle.module.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}["']\\s*:\\s*\\(\\)\\s*=>\\s*import\\(`,
        "u"
      );
      if (!loaderPattern.test(String(registrySource))) {
        addError(errors, `Battle ${battle.id} module is not statically registered: ${battle.module}`);
      }
      if (publishedModules.has(battle.module)) {
        addError(errors, `published Battle module is duplicated: ${battle.module}`);
      }
      publishedModules.add(battle.module);
    }

    const configAsset = assetById.get(battle.configAssetId);
    if (!configAsset || configAsset.type !== "json" || configAsset.required !== true) {
      addError(errors, `Battle ${battle.id} configAssetId must resolve to a required JSON asset: ${battle.configAssetId}`);
    } else {
      if (!groupsForAsset(configAsset).includes(battle.assetGroup)) {
        addError(errors, `Battle ${battle.id} config asset is not in assetGroup ${battle.assetGroup}`);
      }
      const configPath = String(configAsset.src ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
      const config = configDocuments instanceof Map
        ? configDocuments.get(configPath)
        : configDocuments?.[configPath];
      if (!config || typeof config !== "object") {
        addError(errors, `Battle ${battle.id} config document is missing: ${configPath}`);
      } else if (config.battleId !== battle.id) {
        addError(errors, `${configPath} battleId must be ${battle.id}; received ${config.battleId}`);
      }
      if (battle.id === "word-breaker" && config && typeof config === "object") {
        if (configAsset.sourceRef !== "CONTENT-BATTLE-005") {
          addError(errors, "Battle word-breaker config asset sourceRef must be CONTENT-BATTLE-005");
        }
        validateWordBreakerConfig(config, battle, errors);
      }
    }
    if (typeof battle.assetGroup !== "string" || !knownGroups.has(battle.assetGroup)) {
      addError(errors, `Battle ${battle.id} references missing asset group: ${battle.assetGroup}`);
    }

    const condition = battle.unlockCondition;
    if (!condition || typeof condition !== "object" || condition.type !== "ALL_MINIGAMES_CLEAR") {
      addError(errors, `Battle ${battle.id} requires ALL_MINIGAMES_CLEAR unlockCondition`);
      continue;
    }
    if (!Array.isArray(condition.miniGameIds) || condition.miniGameIds.length === 0) {
      addError(errors, `Battle ${battle.id} unlockCondition requires miniGameIds`);
      continue;
    }
    const uniqueMiniGameIds = new Set(condition.miniGameIds);
    if (uniqueMiniGameIds.size !== condition.miniGameIds.length) {
      addError(errors, `Battle ${battle.id} unlockCondition contains duplicate miniGameIds`);
    }
    if (
      uniqueMiniGameIds.size !== requiredMiniGameIds.size
      || [...requiredMiniGameIds].some((miniGameId) => !uniqueMiniGameIds.has(miniGameId))
    ) {
      addError(errors, `Battle ${battle.id} unlockCondition must require all five mini games`);
    }
    for (const miniGameId of condition.miniGameIds) {
      if (typeof miniGameId !== "string" || !gameIds.has(miniGameId)) {
        addError(errors, `Battle ${battle.id} unlockCondition miniGameId does not resolve: ${miniGameId}`);
      }
    }
  }
}

function validateWordBreakerConfig(config, battle, errors) {
  const label = "data/battle/word-breaker.json";
  const requireExactNumber = (value, expected, field) => {
    if (value !== expected) {
      addError(errors, `${label} ${field} must be ${expected}; received ${value}`);
    }
  };

  if (config.implementationStatus !== "MVP") {
    addError(errors, `${label} implementationStatus must be MVP`);
  }
  if (battle.usesAccountStats !== false) {
    addError(errors, "Battle word-breaker must keep usesAccountStats=false");
  }
  requireExactNumber(config.arena?.width, 450, "arena.width");
  requireExactNumber(config.arena?.height, 800, "arena.height");
  requireExactNumber(config.player?.width, 34, "player.width");
  requireExactNumber(config.player?.height, 46, "player.height");
  requireExactNumber(config.player?.speed, 220, "player.speed");
  requireExactNumber(config.player?.startPosition?.x, 208, "player.startPosition.x");
  requireExactNumber(config.player?.startPosition?.y, 700, "player.startPosition.y");
  requireExactNumber(config.shot?.speed, 520, "shot.speed");
  requireExactNumber(config.shot?.intervalMs, 180, "shot.intervalMs");
  requireExactNumber(config.shot?.damage, 20, "shot.damage");
  requireExactNumber(config.collapseImpactMs, 520, "collapseImpactMs");
  requireExactNumber(config.magnetDelayMs, 1200, "magnetDelayMs");
  requireExactNumber(config.finaleDurationMs, 4000, "finaleDurationMs");
  requireExactNumber(config.finalPhrase?.maxHp, 5, "finalPhrase.maxHp");

  if (!Number.isFinite(config.roundDurationMs) || config.roundDurationMs < 12000 || config.roundDurationMs > 15000) {
    addError(errors, `${label} roundDurationMs must be between 12000 and 15000`);
  }
  for (const field of ["speed", "spawnIntervalMs"]) {
    if (!Number.isFinite(config.phrase?.[field]) || config.phrase[field] <= 0) {
      addError(errors, `${label} phrase.${field} must be a positive finite number`);
    }
  }
  requireExactNumber(config.phrase?.maxHp, 60, "phrase.maxHp");

  if (!Array.isArray(config.rounds) || config.rounds.length !== WORD_BREAKER_GUARDIANS.length) {
    addError(errors, `${label} rounds must contain exactly five guardian rounds`);
    return;
  }

  const phrases = [];
  for (const [index, expectedGuardian] of WORD_BREAKER_GUARDIANS.entries()) {
    const round = config.rounds[index];
    if (!round || typeof round !== "object") {
      addError(errors, `${label} rounds[${index}] must be an object`);
      continue;
    }
    if (round.guardian?.code !== expectedGuardian.code || round.guardian?.color !== expectedGuardian.color) {
      addError(
        errors,
        `${label} rounds[${index}] guardian must be ${expectedGuardian.code} ${expectedGuardian.color}`,
      );
    }
    for (const field of ["collapseMessage", "recoveryMessage"]) {
      if (typeof round[field] !== "string" || round[field].trim() === "") {
        addError(errors, `${label} rounds[${index}].${field} must be non-empty`);
      }
    }
    if (!Array.isArray(round.phrases) || round.phrases.length === 0) {
      addError(errors, `${label} rounds[${index}].phrases must not be empty`);
    } else {
      phrases.push(...round.phrases);
    }
  }

  if (phrases.length < 25) {
    addError(errors, `${label} must contain at least 25 round phrases; received ${phrases.length}`);
  }
  if (config.finalPhrase && typeof config.finalPhrase === "object") {
    phrases.push(config.finalPhrase);
  } else {
    addError(errors, `${label} finalPhrase must be an object`);
  }

  const phraseIds = new Set();
  for (const [index, phrase] of phrases.entries()) {
    const phraseLabel = `${label} phrase[${index}]`;
    if (!phrase || typeof phrase !== "object") {
      addError(errors, `${phraseLabel} must be an object`);
      continue;
    }
    if (typeof phrase.id !== "string" || phrase.id.trim() === "" || phraseIds.has(phrase.id)) {
      addError(errors, `${phraseLabel} requires a unique non-empty id`);
    } else {
      phraseIds.add(phrase.id);
    }
    for (const field of ["negative", "target", "reframe"]) {
      if (typeof phrase[field] !== "string" || phrase[field].trim() === "") {
        addError(errors, `${phraseLabel}.${field} must be non-empty`);
      }
    }
    if (typeof phrase.negative === "string" && typeof phrase.target === "string" && phrase.target !== "") {
      const occurrenceCount = phrase.negative.split(phrase.target).length - 1;
      if (occurrenceCount !== 1) {
        addError(errors, `${phraseLabel}.target must occur exactly once in negative`);
      }
    }
    if (!Number.isFinite(phrase.maxHp) || phrase.maxHp <= 0) {
      addError(errors, `${phraseLabel}.maxHp must be a positive finite number`);
    }
    const combinedCopy = `${phrase.negative ?? ""} ${phrase.reframe ?? ""}`;
    if (UNSAFE_WORD_BREAKER_COPY.test(combinedCopy)) {
      addError(errors, `${phraseLabel} contains prohibited self-harm or hate wording`);
    }
  }
}

function validateActions(scriptDocuments, gameIds, scriptIds, assetIds, errors) {
  for (const document of scriptDocuments) {
    recursivelyVisit(document, (record) => {
      if (Object.hasOwn(record, "portraitAssetId") && record.portraitAssetId !== null) {
        if (typeof record.portraitAssetId !== "string" || !assetIds.has(record.portraitAssetId)) {
          addError(errors, `dialogue portraitAssetId does not resolve: ${record.portraitAssetId}`);
        }
      }

      const action = record.nextAction;
      if (!action || typeof action !== "object") {
        return;
      }
      if (action.type === "openMiniGame" && !gameIds.has(action.target)) {
        addError(errors, `openMiniGame action target does not resolve: ${action.target}`);
      }
      if (action.type === "openDialogue" && !scriptIds.has(action.target)) {
        addError(errors, `openDialogue action target does not resolve: ${action.target}`);
      }
    });
  }
}

function validateMapReferences(mapData, games, departmentByCode, scriptIds, errors) {
  const gameIds = new Set(games.map((game) => game?.id).filter(Boolean));
  const gameById = new Map(games.map((game) => [game?.id, game]));
  const maps = Array.isArray(mapData?.maps) ? mapData.maps : mapData ? [mapData] : [];
  requireUniqueIds(maps, "map", errors);
  const npcs = maps.flatMap((map) => (Array.isArray(map?.npcs) ? map.npcs : []));
  requireUniqueIds(npcs, "NPC", errors);

  for (const npc of npcs) {
    if (!departmentByCode.has(npc.departmentCode)) {
      addError(errors, `NPC ${npc.id} departmentCode does not resolve: ${npc.departmentCode}`);
    }
    if (npc.miniGameId !== null && npc.miniGameId !== undefined && !gameIds.has(npc.miniGameId)) {
      addError(errors, `NPC ${npc.id} miniGameId does not resolve: ${npc.miniGameId}`);
    }
    const linkedGame = gameById.get(npc.miniGameId);
    if (linkedGame && linkedGame.departmentCode !== npc.departmentCode) {
      addError(
        errors,
        `NPC ${npc.id} departmentCode ${npc.departmentCode} does not match mini game ${npc.miniGameId} (${linkedGame.departmentCode})`
      );
    }
    for (const field of ["firstScript", "revisitScript"]) {
      if (typeof npc[field] !== "string" || !scriptIds.has(npc[field])) {
        addError(errors, `NPC ${npc.id} ${field} does not resolve: ${npc[field]}`);
      }
    }

    const completionRule = npc.completionRule;
    if (completionRule?.type === "MINIGAME_CLEAR" && !gameIds.has(completionRule.target)) {
      addError(errors, `NPC ${npc.id} completionRule mini game does not resolve: ${completionRule.target}`);
    }
    if (completionRule?.type === "DIALOGUE_COMPLETE" && !scriptIds.has(completionRule.target)) {
      addError(errors, `NPC ${npc.id} completionRule dialogue does not resolve: ${completionRule.target}`);
    }
  }
}

export function validateReferenceGraph(snapshot) {
  const errors = [];
  const games = asArray(snapshot.minigames, ["minigames", "games"], "minigames.json", errors);
  const battles = asArray(snapshot.battles, ["battles"], "battles.json", errors);
  const assets = asArray(snapshot.manifest, ["assets"], "asset-manifest.json", errors);
  const scripts = extractDialogueScripts(snapshot.scriptDocuments ?? []);
  const scriptIds = requireUniqueIds(scripts, "dialogue script", errors);
  const departmentByCode = validateDepartments(snapshot.departments, errors);
  const assetIds = validateManifest(assets, errors);
  const gameIds = validateGameRegistry(
    games,
    assets,
    scriptIds,
    snapshot.registrySource ?? "",
    departmentByCode,
    snapshot.configDocuments,
    errors
  );

  requireUniqueIds(battles, "Battle", errors);
  validateBattleRegistry(
    battles,
    assets,
    gameIds,
    snapshot.battleRegistrySource ?? "",
    snapshot.battleConfigDocuments,
    errors
  );
  validateVersionContract(snapshot, errors);
  validateAppConfig(snapshot.appConfig, battles, snapshot.mapData, errors);
  validateActions(snapshot.scriptDocuments ?? [], gameIds, scriptIds, assetIds, errors);
  validateMapReferences(snapshot.mapData, games, departmentByCode, scriptIds, errors);

  return errors;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

async function walkFiles(directory, options = {}) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && (SKIPPED_DIRECTORIES.has(entry.name) || options.skip?.(entry.name, directory))) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath, options)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function parseJsonFile(filePath, projectRoot, errors) {
  const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    addError(errors, `${relativePath} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function manifestPathToAbsolute(projectRoot, source) {
  if (typeof source !== "string" || source.trim() === "" || /^[a-z][a-z\d+.-]*:/iu.test(source)) {
    return null;
  }

  const normalizedSource = source.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/^\//u, "");
  const absolutePath = path.resolve(projectRoot, ...normalizedSource.split("/"));
  const relative = path.relative(projectRoot, absolutePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return absolutePath;
}

async function hasExactCase(projectRoot, filePath) {
  const relative = path.relative(projectRoot, filePath);
  let current = projectRoot;

  for (const segment of relative.split(path.sep)) {
    const names = await readdir(current);
    if (!names.includes(segment)) {
      return false;
    }
    current = path.join(current, segment);
  }
  return true;
}

function extractModuleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?:^|[;\n])\s*(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return specifiers;
}

async function validateJavaScriptFiles(projectRoot, allFiles, errors) {
  const javaScriptFiles = allFiles.filter((filePath) => [".js", ".mjs"].includes(path.extname(filePath).toLowerCase()));

  for (const filePath of javaScriptFiles) {
    const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
    try {
      await execFileAsync(process.execPath, ["--check", filePath], { windowsHide: true, maxBuffer: 1024 * 1024 });
    } catch (error) {
      addError(errors, `${relativePath} has invalid JavaScript syntax: ${error.stderr || error.message}`.trim());
      continue;
    }

    const source = await readFile(filePath, "utf8");
    for (const specifier of extractModuleSpecifiers(source)) {
      if (!specifier.startsWith(".") || specifier.includes("${")) continue;
      const target = path.resolve(path.dirname(filePath), specifier);
      const relativeTarget = path.relative(projectRoot, target);
      if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
        addError(errors, `${relativePath} imports outside the project root: ${specifier}`);
        continue;
      }
      if (!(await pathExists(target))) {
        addError(errors, `${relativePath} import does not resolve: ${specifier}`);
      } else if (!(await hasExactCase(projectRoot, target))) {
        addError(errors, `${relativePath} import path casing does not match the filesystem: ${specifier}`);
      }
    }
  }
}

async function validateIndexReferences(projectRoot, html, errors) {
  const styleReferences = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/giu)]
    .map((match) => match[1]);
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>/giu)];
  const moduleReferences = [];

  for (const [, attributes] of scriptTags) {
    const source = attributes.match(/\bsrc=["']([^"']+)["']/iu)?.[1];
    if (!source) continue;
    const type = attributes.match(/\btype=["']([^"']+)["']/iu)?.[1];
    if (type !== "module") {
      addError(errors, `index.html local script must use type=module: ${source}`);
    }
    moduleReferences.push(source);
  }

  const references = [...styleReferences, ...moduleReferences];
  for (const reference of references) {
    if (/^[a-z][a-z\d+.-]*:/iu.test(reference) || reference.startsWith("//")) {
      addError(errors, `index.html must not depend on an external runtime reference: ${reference}`);
      continue;
    }
    const sourcePath = reference.split(/[?#]/u, 1)[0].replace(/^\.\//u, "").replace(/^\//u, "");
    const target = path.resolve(projectRoot, ...sourcePath.split("/"));
    if (!(await pathExists(target))) {
      addError(errors, `index.html reference does not resolve: ${reference}`);
    } else if (!(await hasExactCase(projectRoot, target))) {
      addError(errors, `index.html reference casing does not match the filesystem: ${reference}`);
    }
  }

  for (const expectedStyle of REQUIRED_FILES.filter((file) => file.startsWith("css/"))) {
    if (!styleReferences.some((reference) => reference.replace(/^\.\//u, "") === expectedStyle)) {
      addError(errors, `index.html is missing stylesheet reference: ${expectedStyle}`);
    }
  }
  if (!moduleReferences.some((reference) => reference.replace(/^\.\//u, "") === "js/app.js")) {
    addError(errors, "index.html is missing the js/app.js module entry");
  }
}

async function validateAssetFiles(projectRoot, manifest, errors) {
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];

  for (const asset of assets) {
    const absolutePath = manifestPathToAbsolute(projectRoot, asset?.src);
    if (!absolutePath) {
      addError(errors, `asset ${asset?.id ?? "<unknown>"} has unsafe or external src: ${asset?.src}`);
      continue;
    }
    if (!(await pathExists(absolutePath))) {
      addError(errors, `asset ${asset.id} file does not exist: ${asset.src}`);
      continue;
    }
    if (!(await hasExactCase(projectRoot, absolutePath))) {
      addError(errors, `asset ${asset.id} path casing does not match the filesystem: ${asset.src}`);
    }
  }
}

async function validateNoRuntimeDraftReferences(projectRoot, allFiles, errors) {
  const runtimeRoots = new Set(["css", "data", "index.html", "js"]);

  for (const filePath of allFiles) {
    const relative = path.relative(projectRoot, filePath).split(path.sep).join("/");
    const firstSegment = relative.split("/", 1)[0];
    if (
      !runtimeRoots.has(firstSegment) ||
      relative.startsWith("data/drafts/") ||
      !RUNTIME_TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())
    ) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    if (/(?:^|["'`./\\])data[/\\]drafts[/\\]|\.draft\.json/iu.test(source)) {
      addError(errors, `runtime file references draft content: ${relative}`);
    }
  }
}

export async function validateProject(projectRoot = defaultRoot) {
  const absoluteRoot = path.resolve(projectRoot);
  const errors = [];
  const allFiles = await walkFiles(absoluteRoot);
  const relativeFiles = new Set(allFiles.map((file) => path.relative(absoluteRoot, file).split(path.sep).join("/")));

  for (const requiredFile of REQUIRED_FILES) {
    if (!relativeFiles.has(requiredFile)) {
      addError(errors, `required file is missing: ${requiredFile}`);
    }
  }

  const jsonFiles = allFiles.filter((file) => path.extname(file).toLowerCase() === ".json");
  const jsonByRelativePath = new Map();
  for (const jsonFile of jsonFiles) {
    jsonByRelativePath.set(
      path.relative(absoluteRoot, jsonFile).split(path.sep).join("/"),
      await parseJsonFile(jsonFile, absoluteRoot, errors)
    );
  }

  const readTextOrEmpty = async (relativePath) => {
    const absolutePath = path.join(absoluteRoot, ...relativePath.split("/"));
    return (await pathExists(absolutePath)) ? readFile(absolutePath, "utf8") : "";
  };
  const scriptDocuments = [...jsonByRelativePath.entries()]
    .filter(([relativePath]) => relativePath.startsWith("data/scripts/"))
    .map(([, document]) => document)
    .filter((document) => document !== undefined);
  const html = await readTextOrEmpty("index.html");
  const versionSource = await readTextOrEmpty("js/core/version.js");
  const registrySource = await readTextOrEmpty("js/minigames/registry.js");
  const battleRegistrySource = await readTextOrEmpty("js/battle/registry.js");
  const snapshot = {
    appConfig: jsonByRelativePath.get("data/app-config.json"),
    battles: jsonByRelativePath.get("data/battles.json"),
    departments: jsonByRelativePath.get("data/departments.json"),
    htmlVersion: extractHtmlContentVersion(html),
    javaScriptVersion: extractJavaScriptContentVersion(versionSource),
    manifest: jsonByRelativePath.get("data/asset-manifest.json"),
    mapData: jsonByRelativePath.get("data/map-data.json"),
    minigames: jsonByRelativePath.get("data/minigames.json"),
    registrySource,
    battleRegistrySource,
    scriptDocuments,
    configDocuments: new Map(
      [...jsonByRelativePath.entries()].filter(([relativePath]) =>
        /^data\/minigames\/[^/]+\.json$/u.test(relativePath)
      )
    ),
    battleConfigDocuments: new Map(
      [...jsonByRelativePath.entries()].filter(([relativePath]) =>
        /^data\/battle\/[^/]+\.json$/u.test(relativePath)
      )
    )
  };

  errors.push(...validateToolingPackage(jsonByRelativePath.get("package.json")));
  errors.push(...validateReferenceGraph(snapshot));
  await validateAssetFiles(absoluteRoot, snapshot.manifest, errors);
  await validateNoRuntimeDraftReferences(absoluteRoot, allFiles, errors);
  await validateJavaScriptFiles(absoluteRoot, allFiles, errors);
  await validateIndexReferences(absoluteRoot, html, errors);

  return {
    errors: [...new Set(errors)],
    fileCount: allFiles.length,
    jsonCount: jsonFiles.length,
    root: absoluteRoot
  };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  const report = await validateProject();
  if (report.errors.length > 0) {
    console.error(`Validation failed with ${report.errors.length} error(s):`);
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Validation passed: ${report.fileCount} files, ${report.jsonCount} JSON documents.`);
  }
}

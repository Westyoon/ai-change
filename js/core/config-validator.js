import { CONTENT_VERSION } from "./version.js";

export const DEPARTMENT_DISPLAY_NAMES = Object.freeze({
  AI: "인공지능학부",
  DS: "데이터사이언스전공",
  CSE: "컴퓨터공학과",
  CS: "사이버보안학과",
  AIDS: "인공지능데이터사이언스학부",
});

export const SCAFFOLD_MINI_GAME_DEPARTMENTS = Object.freeze({
  "data-number-baseball": "DS",
  "cyber-click-to-purify": "CS",
  "computer-code-heart": "CSE",
  "ai-ball-classification": "AI",
  "ai-data-egg-sort": "AIDS",
});

const VALID_ASSET_TYPES = new Set(["json", "image"]);
const VALID_MINI_GAME_STATUSES = new Set(["published", "locked", "coming-soon"]);
const VALID_RESULT_STATUSES = new Set(["CLEAR", "FAIL", "QUIT", "ERROR"]);
const CANDIDATE_FIELDS = new Set(["status", "score", "failureReason", "metrics", "reward"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unwrapList(value, keys = []) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isObject(value)) {
    return [];
  }
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }
  return [];
}

function collectDialogueScripts(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDialogueScripts(item, output);
    }
    return output;
  }
  if (!isObject(value)) {
    return output;
  }

  if (typeof value.id === "string" && Array.isArray(value.lines)) {
    output.push(value);
    return output;
  }

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || isObject(nested)) {
      collectDialogueScripts(nested, output);
    }
  }
  return output;
}

function collectMaps(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isObject(value)) {
    return [];
  }
  if (Array.isArray(value.maps)) {
    return value.maps;
  }
  return typeof value.id === "string" ? [value] : [];
}

function hasJsonSerialization(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined;
  } catch {
    return false;
  }
}

function addUnique(list, message) {
  if (!list.includes(message)) {
    list.push(message);
  }
}

/**
 * Validates the cross-file contract of the development scaffold.
 *
 * Expected bundle keys are appConfig, departments, minigames, manifest,
 * mapData and scripts. Each collection may either be an array or an object
 * wrapping the array with its conventional key.
 */
export function validateScaffoldContent(bundle = {}) {
  const errors = [];
  const warnings = [];
  const appConfig = bundle.appConfig ?? bundle.app ?? null;
  const departments = unwrapList(bundle.departments, ["departments", "items"]);
  const minigames = unwrapList(bundle.minigames, ["minigames", "games", "items"]);
  const manifest = bundle.manifest ?? bundle.assetManifest ?? null;
  const assets = unwrapList(manifest, ["assets", "items"]);
  const maps = collectMaps(bundle.mapData ?? bundle.maps);
  const scripts = collectDialogueScripts(bundle.scripts ?? bundle.dialogues);

  validateAppConfig(appConfig, errors);

  if (!isObject(manifest)) {
    errors.push("asset-manifest.json must contain an object.");
  } else if (manifest.contentVersion !== CONTENT_VERSION) {
    errors.push(
      `Asset manifest contentVersion must be ${CONTENT_VERSION}; received ${String(manifest.contentVersion)}.`,
    );
  }

  if (isObject(appConfig) && isObject(manifest) && appConfig.contentVersion !== manifest.contentVersion) {
    errors.push("app-config and asset-manifest contentVersion values must match.");
  }
  if (bundle.htmlContentVersion != null && Number(bundle.htmlContentVersion) !== CONTENT_VERSION) {
    errors.push(`HTML content version must be ${CONTENT_VERSION}.`);
  }

  const departmentByCode = validateDepartments(departments, errors);
  const assetById = validateAssets(assets, errors);
  const scriptIds = validateScripts(scripts, errors);
  const miniGameById = validateMiniGames(
    minigames,
    departmentByCode,
    assetById,
    assets,
    scriptIds,
    errors,
    warnings,
  );
  validateMaps(maps, appConfig, miniGameById, departmentByCode, scriptIds, errors);
  validateDialogueActions(scripts, miniGameById, scriptIds, errors);

  return { errors, warnings };
}

function validateAppConfig(appConfig, errors) {
  if (!isObject(appConfig)) {
    errors.push("app-config.json must contain an object.");
    return;
  }
  if (appConfig.appId !== "ai-change") {
    errors.push('app-config.appId must be "ai-change".');
  }
  if (appConfig.contentVersion !== CONTENT_VERSION) {
    errors.push(`app-config.contentVersion must be ${CONTENT_VERSION}.`);
  }
  if (typeof appConfig.storageChannel !== "string" || appConfig.storageChannel.length === 0) {
    errors.push("app-config.storageChannel must be a non-empty string.");
  }
  if (typeof appConfig.publicBasePath !== "string" || appConfig.publicBasePath.length === 0) {
    errors.push("app-config.publicBasePath must be a non-empty string.");
  }
  if (typeof appConfig.initialScene !== "string" || appConfig.initialScene.length === 0) {
    errors.push("app-config.initialScene must be a non-empty string.");
  }
  if (typeof appConfig.mainMapId !== "string" || appConfig.mainMapId.length === 0) {
    errors.push("app-config.mainMapId must be a non-empty string.");
  }
  if (appConfig.defaultLocale !== "ko-KR") {
    errors.push('app-config.defaultLocale must be "ko-KR".');
  }

  for (const key of ["masterVolume", "bgmVolume", "sfxVolume"]) {
    const volume = appConfig.audio?.[key];
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      errors.push(`app-config.audio.${key} must be a finite number from 0 to 1.`);
    }
  }
}

function validateDepartments(departments, errors) {
  const byCode = new Map();
  for (const department of departments) {
    const code = department?.code ?? department?.id;
    const displayName = department?.displayName ?? department?.name;
    if (!Object.hasOwn(DEPARTMENT_DISPLAY_NAMES, code)) {
      errors.push(`Unknown department code: ${String(code)}.`);
      continue;
    }
    if (byCode.has(code)) {
      errors.push(`Duplicate department code: ${code}.`);
      continue;
    }
    if (displayName !== DEPARTMENT_DISPLAY_NAMES[code]) {
      errors.push(
        `Department ${code} displayName must be "${DEPARTMENT_DISPLAY_NAMES[code]}".`,
      );
    }
    byCode.set(code, department);
  }

  for (const code of Object.keys(DEPARTMENT_DISPLAY_NAMES)) {
    if (!byCode.has(code)) {
      errors.push(`Missing department definition: ${code}.`);
    }
  }
  return byCode;
}

function validateAssets(assets, errors) {
  const byId = new Map();
  for (const asset of assets) {
    if (!isObject(asset) || typeof asset.id !== "string" || asset.id.length === 0) {
      errors.push("Every asset requires a non-empty id.");
      continue;
    }
    if (byId.has(asset.id)) {
      errors.push(`Duplicate asset id: ${asset.id}.`);
      continue;
    }
    if (!VALID_ASSET_TYPES.has(asset.type)) {
      errors.push(`Asset ${asset.id} has unsupported type ${String(asset.type)}.`);
    }
    if (typeof asset.group !== "string" || asset.group.length === 0) {
      errors.push(`Asset ${asset.id} requires a group.`);
    }
    if (typeof asset.src !== "string" || asset.src.length === 0) {
      errors.push(`Asset ${asset.id} requires a source path.`);
    }
    if (asset.type === "image" && typeof asset.alt !== "string") {
      errors.push(`Image asset ${asset.id} requires alt text (empty is allowed for decorative images).`);
    }
    byId.set(asset.id, asset);
  }
  return byId;
}

function validateScripts(scripts, errors) {
  const ids = new Set();
  for (const script of scripts) {
    if (typeof script.id !== "string" || script.id.length === 0) {
      errors.push("Every dialogue script requires a non-empty id.");
      continue;
    }
    if (ids.has(script.id)) {
      errors.push(`Duplicate dialogue script id: ${script.id}.`);
      continue;
    }
    ids.add(script.id);
    if (!Array.isArray(script.lines)) {
      errors.push(`Dialogue script ${script.id} requires a lines array.`);
    }
  }
  return ids;
}

function validateMiniGames(
  minigames,
  departmentByCode,
  assetById,
  assets,
  scriptIds,
  errors,
  warnings,
) {
  const byId = new Map();
  const knownGroups = new Set(assets.map((asset) => asset?.group).filter(Boolean));

  for (const game of minigames) {
    if (!isObject(game) || typeof game.id !== "string" || game.id.length === 0) {
      errors.push("Every mini-game requires a non-empty id.");
      continue;
    }
    if (byId.has(game.id)) {
      errors.push(`Duplicate mini-game id: ${game.id}.`);
      continue;
    }
    byId.set(game.id, game);

    const expectedCode = SCAFFOLD_MINI_GAME_DEPARTMENTS[game.id];
    if (expectedCode && game.departmentCode !== expectedCode) {
      errors.push(`Mini-game ${game.id} must use departmentCode ${expectedCode}.`);
    }
    if (!departmentByCode.has(game.departmentCode)) {
      errors.push(`Mini-game ${game.id} references unknown departmentCode ${String(game.departmentCode)}.`);
    }
    const expectedName = DEPARTMENT_DISPLAY_NAMES[game.departmentCode];
    if (expectedName && game.department !== expectedName) {
      errors.push(`Mini-game ${game.id} department must be "${expectedName}".`);
    }
    if (typeof game.module !== "string" || game.module.length === 0) {
      errors.push(`Mini-game ${game.id} requires a static module key.`);
    }
    if (!VALID_MINI_GAME_STATUSES.has(game.status)) {
      errors.push(`Mini-game ${game.id} has invalid status ${String(game.status)}.`);
    }
    if (game.status === "published" && game.recordPolicy == null) {
      warnings.push(
        `Mini-game ${game.id} is published with recordPolicy=null in the development scaffold.`,
      );
    }

    const configAsset = assetById.get(game.configAssetId);
    if (!configAsset || configAsset.type !== "json") {
      errors.push(`Mini-game ${game.id} configAssetId must reference a JSON asset.`);
    }
    const thumbnailAsset = assetById.get(game.thumbnailAssetId);
    if (!thumbnailAsset || thumbnailAsset.type !== "image") {
      errors.push(`Mini-game ${game.id} thumbnailAssetId must reference an image asset.`);
    }
    if (!knownGroups.has(game.assetGroup)) {
      errors.push(`Mini-game ${game.id} references missing asset group ${String(game.assetGroup)}.`);
    }
    if (configAsset && configAsset.group !== game.assetGroup) {
      errors.push(`Mini-game ${game.id} config asset must belong to group ${game.assetGroup}.`);
    }
    if (thumbnailAsset && thumbnailAsset.group !== game.assetGroup) {
      errors.push(`Mini-game ${game.id} thumbnail must belong to group ${game.assetGroup}.`);
    }

    for (const field of ["introScript", "clearOutroScript", "failOutroScript"]) {
      if (typeof game[field] !== "string" || !scriptIds.has(game[field])) {
        errors.push(`Mini-game ${game.id} references missing ${field}: ${String(game[field])}.`);
      }
    }
  }

  for (const [gameId, expectedCode] of Object.entries(SCAFFOLD_MINI_GAME_DEPARTMENTS)) {
    if (!byId.has(gameId)) {
      errors.push(`Missing scaffold mini-game ${gameId} (${expectedCode}).`);
    }
  }
  return byId;
}

function validateMaps(maps, appConfig, miniGameById, departmentByCode, scriptIds, errors) {
  const mapIds = new Set();
  const npcIds = new Set();

  for (const map of maps) {
    if (!isObject(map) || typeof map.id !== "string" || map.id.length === 0) {
      errors.push("Every map requires a non-empty id.");
      continue;
    }
    if (mapIds.has(map.id)) {
      errors.push(`Duplicate map id: ${map.id}.`);
      continue;
    }
    mapIds.add(map.id);

    for (const npc of map.npcs ?? []) {
      if (typeof npc?.id !== "string" || npc.id.length === 0) {
        errors.push(`Map ${map.id} contains an NPC without an id.`);
        continue;
      }
      if (npcIds.has(npc.id)) {
        errors.push(`Duplicate NPC id: ${npc.id}.`);
      }
      npcIds.add(npc.id);
      if (!departmentByCode.has(npc.departmentCode)) {
        errors.push(`NPC ${npc.id} references unknown departmentCode ${String(npc.departmentCode)}.`);
      }
      if (npc.miniGameId != null && !miniGameById.has(npc.miniGameId)) {
        errors.push(`NPC ${npc.id} references missing miniGameId ${String(npc.miniGameId)}.`);
      }
      for (const field of ["firstScript", "revisitScript"]) {
        if (npc[field] != null && !scriptIds.has(npc[field])) {
          errors.push(`NPC ${npc.id} references missing ${field}: ${String(npc[field])}.`);
        }
      }
    }
  }

  if (isObject(appConfig) && !mapIds.has(appConfig.mainMapId)) {
    errors.push(`app-config.mainMapId references missing map ${String(appConfig.mainMapId)}.`);
  }
}

function validateDialogueActions(scripts, miniGameById, scriptIds, errors) {
  for (const script of scripts) {
    const action = script.nextAction;
    if (!isObject(action)) {
      continue;
    }
    if (action.type === "openMiniGame" && !miniGameById.has(action.target)) {
      addUnique(errors, `Dialogue ${script.id} references missing mini-game ${String(action.target)}.`);
    }
    if (action.type === "openDialogue" && !scriptIds.has(action.target)) {
      addUnique(errors, `Dialogue ${script.id} references missing dialogue ${String(action.target)}.`);
    }
  }
}

export function validateMiniGameCandidate(candidate, status) {
  const errors = [];
  if (!isObject(candidate)) {
    return { valid: false, errors: ["Mini-game candidate must be an object."] };
  }

  for (const field of Object.keys(candidate)) {
    if (!CANDIDATE_FIELDS.has(field)) {
      errors.push(`Candidate contains host-owned or unknown field: ${field}.`);
    }
  }

  const resolvedStatus = status ?? candidate.status;
  if (!VALID_RESULT_STATUSES.has(resolvedStatus)) {
    errors.push(`Invalid candidate status: ${String(resolvedStatus)}.`);
  }
  if (status != null && candidate.status != null && candidate.status !== status) {
    errors.push("Candidate status does not match the expected status.");
  }
  if (candidate.score !== null && candidate.score !== undefined && !Number.isFinite(candidate.score)) {
    errors.push("Candidate score must be a finite number or null.");
  }
  if (!isObject(candidate.metrics)) {
    errors.push("Candidate metrics must be an object.");
  } else if (!hasJsonSerialization(candidate.metrics)) {
    errors.push("Candidate metrics must be JSON serializable.");
  }
  if (!hasJsonSerialization(candidate.reward)) {
    errors.push("Candidate reward must be JSON serializable.");
  }

  if ((resolvedStatus === "CLEAR" || resolvedStatus === "QUIT") && candidate.failureReason != null) {
    errors.push(`${resolvedStatus} candidate must have failureReason=null.`);
  }
  if (
    (resolvedStatus === "FAIL" || resolvedStatus === "ERROR") &&
    (typeof candidate.failureReason !== "string" || candidate.failureReason.length === 0)
  ) {
    errors.push(`${resolvedStatus} candidate requires a stable failureReason.`);
  }
  if (resolvedStatus === "QUIT" || resolvedStatus === "ERROR") {
    if (candidate.score != null || candidate.reward != null) {
      errors.push(`${resolvedStatus} candidate score and reward must be null.`);
    }
    if (isObject(candidate.metrics) && Object.keys(candidate.metrics).length > 0) {
      errors.push(`${resolvedStatus} candidate metrics must be empty.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export default validateScaffoldContent;

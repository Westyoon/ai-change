const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

function freezeEgg(egg) {
  return Object.freeze({ ...egg });
}

export const GUARDIAN_EGGS = Object.freeze([
  freezeEgg({
    id: "guardian-ds",
    departmentCode: "DS",
    departmentName: "데이터사이언스",
    miniGameId: "data-number-baseball",
    storyId: "afterstory:ds",
    name: "통찰의 수호알",
    color: "#fcb5dd",
    inkColor: "#501060",
    imageSrc: "./assets/images/guardian-eggs/guardian-ds.png",
    description: "흩어진 숫자 속에서 의미 있는 규칙을 발견할 용기를 품은 수호알입니다.",
  }),
  freezeEgg({
    id: "guardian-cs",
    departmentCode: "CS",
    departmentName: "사이버보안",
    miniGameId: "cyber-click-to-purify",
    storyId: "afterstory:cs",
    name: "신뢰의 수호알",
    color: "#a2c05e",
    inkColor: "#304010",
    imageSrc: "./assets/images/guardian-eggs/guardian-cs.png",
    description: "위협 속에서도 소중한 것을 지키고 서로를 믿는 마음을 품은 수호알입니다.",
  }),
  freezeEgg({
    id: "guardian-cse",
    departmentCode: "CSE",
    departmentName: "컴퓨터공학",
    miniGameId: "computer-code-heart",
    storyId: "afterstory:cse",
    name: "창조의 수호알",
    color: "#ac51fa",
    inkColor: "#301040",
    imageSrc: "./assets/images/guardian-eggs/guardian-cse.png",
    description: "작은 코드 조각을 이어 새로운 세계를 만들어 내는 끈기를 품은 수호알입니다.",
  }),
  freezeEgg({
    id: "guardian-ai",
    departmentCode: "AI",
    departmentName: "인공지능",
    miniGameId: "ai-ball-classification",
    storyId: "afterstory:ai",
    name: "성장의 수호알",
    color: "#0e7ffd",
    inkColor: "#0010a0",
    imageSrc: "./assets/images/guardian-eggs/guardian-ai.png",
    description: "실수와 학습을 거듭하며 더 나은 답을 찾아가는 가능성을 품은 수호알입니다.",
  }),
  freezeEgg({
    id: "guardian-aids",
    departmentCode: "AIDS",
    departmentName: "인공지능데이터사이언스",
    miniGameId: "ai-data-egg-sort",
    storyId: "afterstory:aids",
    name: "융합의 수호알",
    color: "#fdd044",
    inkColor: "#703000",
    imageSrc: "./assets/images/guardian-eggs/guardian-aids.png",
    description: "서로 다른 생각과 기술을 연결해 더 큰 가능성으로 나아가는 마음을 품은 수호알입니다.",
  }),
]);

function isGuardianEgg(candidate) {
  return candidate
    && typeof candidate === "object"
    && ["id", "departmentCode", "departmentName", "miniGameId", "storyId", "name", "description", "imageSrc"]
      .every((key) => typeof candidate[key] === "string" && candidate[key].length > 0)
    && typeof candidate.color === "string"
    && HEX_COLOR.test(candidate.color)
    && typeof candidate.inkColor === "string"
    && HEX_COLOR.test(candidate.inkColor);
}

function localSaveState(context) {
  return context?.services?.save?.getState?.()
    ?? context?.services?.save?.state
    ?? {};
}

function accountState(context) {
  return context?.services?.account?.getState?.() ?? {};
}

function stringSet(candidate) {
  return new Set(Array.isArray(candidate)
    ? candidate.filter((value) => typeof value === "string" && value.length > 0)
    : []);
}

export function getGuardianEggCatalog(context) {
  const loaded = context?.content?.guardianEggs;
  if (!Array.isArray(loaded) || loaded.length !== GUARDIAN_EGGS.length) {
    return GUARDIAN_EGGS;
  }
  const ids = new Set();
  for (const egg of loaded) {
    if (!isGuardianEgg(egg) || ids.has(egg.id)) return GUARDIAN_EGGS;
    ids.add(egg.id);
  }
  return Object.freeze(loaded.map(freezeEgg));
}

export function getGuardianEggProgressFromState(
  local = {},
  account = {},
  catalog = GUARDIAN_EGGS,
) {
  const eggs = Array.isArray(catalog) && catalog.length > 0 ? catalog : GUARDIAN_EGGS;
  const localStories = stringSet(local.story?.seenStoryIds);
  const accountStories = stringSet(account.seenStoryIds);
  const acquiredEggIds = eggs
    .filter((egg) => localStories.has(egg.storyId) || accountStories.has(egg.storyId))
    .map((egg) => egg.id);
  return Object.freeze({
    acquired: acquiredEggIds.length,
    total: eggs.length,
    acquiredEggIds: Object.freeze(acquiredEggIds),
  });
}

export function getGuardianInventory(context) {
  const local = localSaveState(context);
  const account = accountState(context);
  const localStories = stringSet(local.story?.seenStoryIds);
  const accountStories = stringSet(account.seenStoryIds);

  return Object.freeze(getGuardianEggCatalog(context).map((egg) => freezeEgg({
    ...egg,
    // The CLEAR result opens the department after-story. The egg becomes
    // owned only when that story reaches its final line, which also makes an
    // interrupted reward sequence safely resumable from the NPC.
    acquired: localStories.has(egg.storyId) || accountStories.has(egg.storyId),
    acquiredLocally: localStories.has(egg.storyId),
    acquiredFromAccount: accountStories.has(egg.storyId),
  })));
}

export function findGuardianEgg(context, guardianEggId) {
  return getGuardianInventory(context).find(({ id }) => id === guardianEggId) ?? null;
}

export function hasGuardianEgg(context, guardianEggId) {
  return findGuardianEgg(context, guardianEggId)?.acquired === true;
}

export function getGuardianEggCount(context) {
  const progress = getGuardianEggProgressFromState(
    localSaveState(context),
    accountState(context),
    getGuardianEggCatalog(context),
  );
  return Object.freeze({ acquired: progress.acquired, total: progress.total });
}

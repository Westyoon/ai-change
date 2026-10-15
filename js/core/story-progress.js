export const MAIN_STORY_ID = "main-story-intro";
export const FINAL_BATTLE_UNLOCK_STORY_ID = "battle-unlock:word-breaker";
export const OUTRO_STORY_ID = "main-story-outro";
export const FESTIVAL_STORY_ID = "festival-open";
export const POSTGAME_ENTRY_STORY_ID = "postgame-entry-seen";

export function isFestivalOpen(context) {
  return hasSeenStory(context, FESTIVAL_STORY_ID);
}

export const DEPARTMENT_AFTERSTORY_IDS = Object.freeze({
  DS: "afterstory:ds",
  CS: "afterstory:cs",
  CSE: "afterstory:cse",
  AI: "afterstory:ai",
  AIDS: "afterstory:aids",
});

function memoryChapter({ id, label, scriptId, ...legacy }) {
  return Object.freeze({ id, label, scriptId, ...legacy });
}

function departmentMemory({
  id,
  label,
  scriptId,
  legacyNpcId,
  completedMiniGameId,
  afterstoryId,
  afterstoryScriptId,
}) {
  const first = memoryChapter({
    id,
    label: "처음 만난 이야기",
    scriptId,
    legacyNpcId,
    completedMiniGameId,
  });
  const afterstory = memoryChapter({
    id: afterstoryId,
    label: "수호알을 얻은 이야기",
    scriptId: afterstoryScriptId,
  });
  return Object.freeze({
    ...first,
    label,
    department: true,
    chapters: Object.freeze([first, afterstory]),
  });
}

export const STORY_MEMORIES = Object.freeze([
  Object.freeze({
    id: MAIN_STORY_ID,
    label: "intro",
    scriptId: MAIN_STORY_ID,
    legacyIntro: true,
  }),
  departmentMemory({
    id: "npc-ds",
    label: "데이터사이언스",
    scriptId: "ds-npc-first",
    legacyNpcId: "npc-ds",
    completedMiniGameId: "data-number-baseball",
    afterstoryId: DEPARTMENT_AFTERSTORY_IDS.DS,
    afterstoryScriptId: "ds-npc-clear",
  }),
  departmentMemory({
    id: "npc-cs",
    label: "사이버보안",
    scriptId: "cs-npc-first",
    legacyNpcId: "npc-cs",
    completedMiniGameId: "cyber-click-to-purify",
    afterstoryId: DEPARTMENT_AFTERSTORY_IDS.CS,
    afterstoryScriptId: "cs-npc-clear",
  }),
  departmentMemory({
    id: "npc-cse",
    label: "컴퓨터공학",
    scriptId: "cse-npc-first",
    legacyNpcId: "npc-cse",
    completedMiniGameId: "computer-code-heart",
    afterstoryId: DEPARTMENT_AFTERSTORY_IDS.CSE,
    afterstoryScriptId: "cse-npc-clear",
  }),
  departmentMemory({
    id: "npc-ai",
    label: "인공지능",
    scriptId: "ai-npc-first",
    legacyNpcId: "npc-ai",
    completedMiniGameId: "ai-ball-classification",
    afterstoryId: DEPARTMENT_AFTERSTORY_IDS.AI,
    afterstoryScriptId: "ai-npc-clear",
  }),
  departmentMemory({
    id: "npc-aids",
    label: "인공지능데이터사이언스",
    scriptId: "aids-npc-first",
    legacyNpcId: "npc-aids",
    completedMiniGameId: "ai-data-egg-sort",
    afterstoryId: DEPARTMENT_AFTERSTORY_IDS.AIDS,
    afterstoryScriptId: "aids-npc-clear",
  }),
  Object.freeze({
    id: OUTRO_STORY_ID,
    label: "outro",
    scriptId: OUTRO_STORY_ID,
  }),
]);

function saveState(context) {
  return context?.services?.save?.getState?.() ?? context?.services?.save?.state ?? {};
}

function accountState(context) {
  return context?.services?.account?.getState?.() ?? {};
}

function stringSet(candidate) {
  return new Set(Array.isArray(candidate)
    ? candidate.filter((id) => typeof id === "string" && id.length > 0)
    : []);
}

export function hasSeenStory(
  context,
  storyId,
  { legacyIntro = false, legacyNpcId = null, completedMiniGameId = null } = {},
) {
  if (typeof storyId !== "string" || storyId.length === 0) return false;
  const local = saveState(context);
  const account = accountState(context);
  if (stringSet(local.story?.seenStoryIds).has(storyId)) return true;
  if (stringSet(account.seenStoryIds).has(storyId)) return true;
  if (legacyIntro && local.story?.introSeen === true) return true;
  if (
    typeof legacyNpcId === "string"
    && stringSet(local.story?.completedNpcIds).has(legacyNpcId)
  ) {
    return true;
  }
  return typeof completedMiniGameId === "string"
    && stringSet(account.completedGameIds).has(completedMiniGameId);
}

export function findStoryMemory(memoryId) {
  const topLevel = STORY_MEMORIES.find(({ id }) => id === memoryId);
  if (topLevel) return topLevel;
  for (const memory of STORY_MEMORIES) {
    const chapter = memory.chapters?.find(({ id }) => id === memoryId);
    if (chapter) return chapter;
  }
  return null;
}

export function getStoryMemoryChapters(memory) {
  if (!memory) return Object.freeze([]);
  return Array.isArray(memory.chapters)
    ? memory.chapters
    : Object.freeze([memory]);
}

export function hasSeenStoryMemory(context, memory) {
  if (!memory) return false;
  if (Array.isArray(memory.chapters)) {
    return memory.chapters.some((chapter) => hasSeenStoryMemory(context, chapter));
  }
  return hasSeenStory(context, memory.id, {
    legacyIntro: memory.legacyIntro === true,
    legacyNpcId: memory.legacyNpcId ?? null,
    completedMiniGameId: memory.completedMiniGameId ?? null,
  });
}

export function markStorySeen(
  context,
  storyId,
  { intro = false } = {},
) {
  if (typeof storyId !== "string" || storyId.length === 0) {
    throw new TypeError("Story id must be a non-empty string.");
  }

  const save = context?.services?.save;
  if (intro && typeof save?.markIntroSeen === "function") {
    save.markIntroSeen();
  } else {
    save?.markStorySeen?.(storyId);
  }

  const account = context?.services?.account;
  if (account?.getState?.().authenticated && typeof account.markStorySeen === "function") {
    void Promise.resolve(account.markStorySeen(storyId)).catch((error) => {
      console.warn(
        "Account story progress sync failed",
        error instanceof Error ? error.message : "unknown error",
      );
    });
  }
}

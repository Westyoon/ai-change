export const CAMPUS_STUDENT_SPRITES = Object.freeze({
  "npc-ai": "./assets/maps/npcs/college-student-ai-v3.png",
  "npc-ds": "./assets/maps/npcs/college-student-casual-v2.png",
  "npc-cse": "./assets/maps/npcs/college-student-cse-v3.png",
  "npc-cs": "./assets/maps/npcs/college-student-cs-v3.png",
  "npc-aids": "./assets/maps/npcs/college-student-aids-v3.png",
});

export function getCampusStudentSprite(npcId) {
  return CAMPUS_STUDENT_SPRITES[npcId] ?? CAMPUS_STUDENT_SPRITES["npc-ds"];
}

export function campusStudentSpriteSources(map) {
  return [...new Set(map.interactions.filter(point => point.kind === "npc")
    .map(point => getCampusStudentSprite(point.id)))];
}

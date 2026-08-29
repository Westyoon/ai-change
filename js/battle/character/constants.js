export const CHARACTER_DIRECTIONS = Object.freeze({
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
});

export const CHARACTER_STATES = Object.freeze({
  IDLE: "idle",
  MOVING: "moving",
  ATTACKING: "attacking",
  HIT: "hit",
  DEAD: "dead",
  CONTROL_LOCKED: "control-locked",
});

export const CHARACTER_EVENTS = Object.freeze({
  STATE_CHANGE: "character:state-change",
  MOVE: "character:move",
  ATTACK: "character:attack",
  DAMAGE: "character:damage",
  HEALTH_CHANGE: "character:health-change",
  DEATH: "character:death",
  STATS_CHANGE: "character:stats-change",
  CONTROL_LOCK_CHANGE: "character:control-lock-change",
  CONTACT: "character:contact",
});

export const CHARACTER_CONTACT_PHASES = Object.freeze({
  ENTER: "enter",
  STAY: "stay",
  EXIT: "exit",
});

export const CHARACTER_TRIGGER_KINDS = Object.freeze({
  EGG: "egg",
  FIELD_MINIGAME: "field-minigame",
  BATTLE_ENTRANCE: "battle-entrance",
  ATTACK_PAD: "attack-pad",
  TRAP: "trap",
  SAFE_ZONE: "safe-zone",
});

export const CHARACTER_DIRECTION_VALUES = Object.freeze(Object.values(CHARACTER_DIRECTIONS));
export const CHARACTER_STATE_VALUES = Object.freeze(Object.values(CHARACTER_STATES));

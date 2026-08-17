import { isWithinRadius } from "./collision.js";

const DEPARTMENT_COLORS = Object.freeze({
  AI: "#7567ff",
  DS: "#2d9cdb",
  CSE: "#f2994a",
  CS: "#eb5757",
  AIDS: "#27ae60",
});

export class Npc {
  constructor(definition = {}) {
    if (typeof definition.id !== "string" || definition.id.length === 0) {
      throw new TypeError("NPC definition requires an id.");
    }
    this.definition = Object.freeze({ ...definition });
    this.id = definition.id;
    this.departmentCode = definition.departmentCode ?? null;
    this.x = Number.isFinite(definition.x) ? definition.x : 0;
    this.y = Number.isFinite(definition.y) ? definition.y : 0;
    this.width = Number.isFinite(definition.width) ? definition.width : 36;
    this.height = Number.isFinite(definition.height) ? definition.height : 44;
    this.interactionRadius = Number.isFinite(definition.interactionRadius)
      ? definition.interactionRadius
      : 56;
    this.completed = false;
  }

  get center() {
    return { x: this.x, y: this.y };
  }

  canInteract(player) {
    const playerCenter = player?.center ?? player;
    return isWithinRadius(this.center, playerCenter, this.interactionRadius);
  }

  getScriptId() {
    return this.completed
      ? this.definition.revisitScript ?? this.definition.firstScript ?? null
      : this.definition.firstScript ?? null;
  }

  markCompleted(completed = true) {
    this.completed = Boolean(completed);
  }

  render(context, { active = false } = {}) {
    if (!context) {
      return;
    }
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;
    context.fillStyle = DEPARTMENT_COLORS[this.departmentCode] ?? "#9b8fb5";
    context.fillRect(left, top, this.width, this.height);
    context.strokeStyle = active ? "#ffffff" : "#201b2c";
    context.lineWidth = active ? 3 : 1;
    context.strokeRect(left, top, this.width, this.height);

    context.fillStyle = "#ffffff";
    context.font = "bold 12px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(this.departmentCode ?? "NPC", this.x, this.y);

    if (active) {
      context.fillStyle = "#fff1a8";
      context.font = "bold 20px sans-serif";
      context.fillText("!", this.x, top - 12);
    }
    if (this.completed) {
      context.fillStyle = "#ffffff";
      context.font = "bold 12px sans-serif";
      context.fillText("✓", this.x + this.width / 2 - 4, top + 5);
    }
  }
}

export function createNpcs(definitions = []) {
  return definitions.map((definition) => new Npc(definition));
}

export default Npc;

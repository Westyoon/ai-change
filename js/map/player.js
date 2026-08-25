import { resolveMovement } from "./collision.js";

export class Player {
  constructor({
    x = 0,
    y = 0,
    width = 32,
    height = 40,
    speed = 180,
    direction = "down",
    spriteAssetId = null,
  } = {}) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.direction = direction;
    this.spriteAssetId = spriteAssetId;
    this.canMove = true;
    this.moving = false;
  }

  get center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  get bounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  setPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("Player position must be finite.");
    }
    this.x = x;
    this.y = y;
  }

  update(input, deltaMs, { bounds, colliders = [] } = {}) {
    const vector = this.canMove
      ? input?.getMovementVector?.() ?? input ?? { x: 0, y: 0 }
      : { x: 0, y: 0 };
    const x = Number.isFinite(vector.x) ? vector.x : 0;
    const y = Number.isFinite(vector.y) ? vector.y : 0;
    this.moving = x !== 0 || y !== 0;

    if (Math.abs(x) > Math.abs(y)) {
      this.direction = x < 0 ? "left" : "right";
    } else if (y !== 0) {
      this.direction = y < 0 ? "up" : "down";
    }

    const seconds = Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0)) / 1000;
    const position = resolveMovement({
      position: this,
      size: this,
      delta: { x: x * this.speed * seconds, y: y * this.speed * seconds },
      colliders,
      bounds,
    });
    this.x = position.x;
    this.y = position.y;
    return this.snapshot();
  }

  render(context, assets) {
    const sprite = this.spriteAssetId ? assets?.get?.(this.spriteAssetId) : null;
    if (sprite && typeof context?.drawImage === "function") {
      context.drawImage(sprite, this.x, this.y, this.width, this.height);
      return;
    }
    if (!context) {
      return;
    }
    context.fillStyle = "#f8d66d";
    context.fillRect(this.x, this.y, this.width, this.height);
    context.strokeStyle = "#201b2c";
    context.strokeRect(this.x, this.y, this.width, this.height);
  }

  snapshot() {
    return Object.freeze({
      x: this.x,
      y: this.y,
      direction: this.direction,
      canMove: this.canMove,
      moving: this.moving,
    });
  }
}

export default Player;

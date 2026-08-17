export class MapRenderer {
  constructor({ canvas, mapData = null, assets = null } = {}) {
    if (!canvas?.getContext) {
      throw new TypeError("MapRenderer requires a canvas element.");
    }
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.assets = assets;
    this.setMapData(mapData);
  }

  setMapData(mapData) {
    this.mapData = mapData ?? {
      id: "scaffold-map",
      worldSize: { width: 1280, height: 720 },
      collisionObjects: [],
    };
  }

  render({ player = null, npcs = [], activeNpcId = null, completedNpcIds = [] } = {}) {
    const context = this.context;
    const worldWidth = this.mapData.worldSize?.width ?? 1280;
    const worldHeight = this.mapData.worldSize?.height ?? 720;
    const scaleX = this.canvas.width / worldWidth;
    const scaleY = this.canvas.height / worldHeight;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.scale(scaleX, scaleY);

    const background = this.mapData.backgroundAssetId
      ? this.assets?.get?.(this.mapData.backgroundAssetId)
      : null;
    if (background) {
      context.drawImage(background, 0, 0, worldWidth, worldHeight);
    } else {
      this.#drawPlaceholderMap(context, worldWidth, worldHeight);
    }

    const colliders =
      this.mapData.collisionObjects ?? this.mapData.colliders ?? this.mapData.obstacles ?? [];
    for (const collider of colliders) {
      if (this.mapData.debugCollision === true) {
        context.fillStyle = "rgba(235, 87, 87, 0.25)";
        context.fillRect(collider.x, collider.y, collider.width, collider.height);
      }
    }

    const completed = new Set(completedNpcIds);
    for (const npc of npcs) {
      npc.markCompleted?.(completed.has(npc.id));
      npc.render?.(context, { active: npc.id === activeNpcId });
    }
    player?.render?.(context, this.assets);
    context.restore();
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const width = this.mapData.worldSize?.width ?? 1280;
    const height = this.mapData.worldSize?.height ?? 720;
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }

  destroy() {
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.assets = null;
    this.mapData = null;
  }

  #drawPlaceholderMap(context, width, height) {
    context.fillStyle = "#f5dfca";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(68, 52, 80, 0.12)";
    context.lineWidth = 1;
    const grid = 48;
    for (let x = 0; x <= width; x += grid) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += grid) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }
}

export default MapRenderer;

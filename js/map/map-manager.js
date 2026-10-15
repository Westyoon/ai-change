import { WalkMask } from "./walk-mask.js";

export const CAMPUS_MAP_IDS = Object.freeze({
  CAMPUS: "campus", ECC: "ecc_interior", STUDENT_CENTER: "student_center_interior",
});

export class CampusMapManager {
  constructor(config) {
    this.version = config.version;
    this.maps = new Map(config.maps.map(map => [map.id, map]));
    this.masks = new Map();
  }
  get(id) {
    const map = this.maps.get(id);
    if (!map || !map.background) throw new Error(`Map is not available: ${id}`);
    return map;
  }
  mask(id) {
    if (!this.masks.has(id)) {
      const map = this.get(id);
      this.masks.set(id, new WalkMask({ ...map.world, ...map.collision }));
    }
    return this.masks.get(id);
  }
  restore(saved, mapId = CAMPUS_MAP_IDS.CAMPUS) {
    const map = this.get(mapId);
    const valid = saved?.version === this.version && saved.mapId === mapId
      && this.mask(mapId).allows({ x: saved.x - 6, y: saved.y - 8, width: 12, height: 8 });
    return { mapId, ...(valid ? { x: saved.x, y: saved.y } : map.spawn), version: this.version };
  }
}

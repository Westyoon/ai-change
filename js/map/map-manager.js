import { WalkMask } from "./walk-mask.js";
import { CAMPUS_FLOWERBEDS, campusProps } from "./campus-layers.js";
import { createEccTileMap } from "./ecc-layout.js";

export const CAMPUS_MAP_IDS = Object.freeze({
  CAMPUS: "campus", ECC: "ecc_interior", STUDENT_CENTER: "student_center_interior", GREENHOUSE:"greenhouse_interior",
});

export class CampusMapManager {
  constructor(config) {
    this.version = config.version;
    this.maps = new Map(config.maps.map(map => [map.id, map.renderer==="tile-ecc"?createEccTileMap(map):map]));
    this.masks = new Map();
  }
  get(id) {
    const map = this.maps.get(id);
    if (!map || (!map.background&&!map.layout)) throw new Error(`Map is not available: ${id}`);
    return map;
  }
  mask(id, {mode="after"}={}) {
    const key=`${id}:${mode}`;
    if (!this.masks.has(key)) {
      const map = this.get(id);
      let collision=map.collision;
      if(collision.walkGrass) {
        const props=campusProps(map,undefined,{mode});
        const obstacles=[...collision.obstacles.slice(mode==="before"?6:0),...(collision.buildings??[]),
          ...CAMPUS_FLOWERBEDS.map(b=>({x:b.x,y:b.y,width:b.width,height:b.height})),
          ...props.filter(p=>["tree","autumn","bench","lamp"].includes(p.kind)).map(p=>({
            x:p.x-(p.kind==="bench"?29:6),y:p.y-(p.kind==="bench"?12:8),
            width:p.kind==="bench"?58:12,height:p.kind==="bench"?14:10,
          }))];
        collision={...collision,paths:[[[0,0],[map.world.width,0],[map.world.width,map.world.height],[0,map.world.height]]],obstacles};
      }
      this.masks.set(key, new WalkMask({ ...map.world, ...collision }));
    }
    return this.masks.get(key);
  }
  restore(saved, mapId = CAMPUS_MAP_IDS.CAMPUS, options = {}) {
    const map = this.get(mapId);
    const valid = saved?.version === this.version && saved.mapId === mapId
      && this.mask(mapId,options).allows({ x: saved.x - 6, y: saved.y - 8, width: 12, height: 8 });
    return { mapId, ...(valid ? { x: saved.x, y: saved.y } : map.spawn), version: this.version };
  }
}

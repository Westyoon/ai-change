// Area is reduced to 75%, so each axis uses sqrt(.75), not .75.
export const INTERIOR_COMPACT_SCALE = Math.sqrt(0.75);

export function compactInterior(map, scale=INTERIOR_COMPACT_SCALE) {
  const seen=new WeakSet();
  const geometry=value=>{
    if(!value||typeof value!=="object"||seen.has(value))return;
    seen.add(value);
    if(Array.isArray(value)) {
      if(value.length===2&&value.every(n=>typeof n==="number")) {
        value[0]*=scale;value[1]*=scale;
      } else value.forEach(geometry);
      return;
    }
    for(const [key,child]of Object.entries(value)) {
      if(["x","y","width","height","footY","tileWidth","tileHeight"].includes(key)&&typeof child==="number")value[key]=child*scale;
      else if(child&&typeof child==="object")geometry(child);
    }
  };
  // Return destinations belong to the outdoor map and must remain unchanged.
  for(const value of [map.world,map.spawn,map.layout,map.collision,map.checkpoints])geometry(value);
  for(const interaction of map.interactions??[]) {
    interaction.x*=scale;interaction.y*=scale;
  }
  map.world.width=Math.round(map.world.width);map.world.height=Math.round(map.world.height);
  return map;
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CampusMapManager } from "../../js/map/map-manager.js";

test("ECC uses independent native-grid assets and placement-derived collision in a larger world",async()=>{
  const config=JSON.parse(await readFile(new URL("../../data/maps/campus.json",import.meta.url),"utf8"));
  const manager=new CampusMapManager(config),map=manager.get("ecc_interior"),mask=manager.mask(map.id);
  assert.equal(map.background,null,"full-scene background cannot silently return");
  assert.ok(map.world.width*map.world.height>=1536*1024*4);
  assert.ok(map.layout.items.length>200);
  const assets=new Set([...map.layout.floors,...map.layout.items].map(i=>i.asset));
  for(const name of ["floor-stone","wall","glass","door","desk","chair","plant","cushion"])assert.ok(assets.has(name));
  for(const asset of assets) {
    const source=await readFile(new URL(`../../assets/maps/ecc/${asset}.svg`,import.meta.url),"utf8");
    assert.match(source,/shape-rendering="crispEdges"/);
    assert.doesNotMatch(source,/<image|<filter|gradient/iu,"sprites contain real native-grid geometry, not an embedded map screenshot");
  }
  for(const item of map.layout.items) {
    if(item.collision)assert.ok(map.collision.obstacles.includes(item.collision),"moving a solid asset also moves its collider");
    if(item.door)assert.ok(mask.allows({x:item.center.x-6,y:item.center.y-8,width:12,height:8}),"door openings can be traversed");
  }
  assert.equal(map.layout.items.filter(i=>i.kind==="bench"&&i.x>832&&i.x<2240).length,0,"the central lounge uses cushions rather than park benches");
});

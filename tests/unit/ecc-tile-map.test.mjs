import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CampusMapManager } from "../../js/map/map-manager.js";

test("ECC uses independent assets and placement-derived collision in a larger world",async()=>{
  const config=JSON.parse(await readFile(new URL("../../data/maps/campus.json",import.meta.url),"utf8"));
  const manager=new CampusMapManager(config),map=manager.get("ecc_interior"),mask=manager.mask(map.id);
  assert.equal(map.background,null,"full-scene background cannot silently return");
  assert.ok(map.world.width*map.world.height>=1536*1024*4);
  assert.ok(map.layout.items.length>200);
  const assets=new Set([...map.layout.floors,...map.layout.items].map(i=>i.asset));
  for(const name of ["floor-wood-dark","wall","glass","door","desk","chair","plant","cushion-green","cushion-blue","ottoman-blue"])assert.ok(assets.has(name));
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

test("all indoor maps use the campus art set while preserving independent placement and collision",async()=>{
  const config=JSON.parse(await readFile(new URL("../../data/maps/campus.json",import.meta.url),"utf8"));
  const skin=JSON.parse(await readFile(new URL("../../data/maps/interior-skin.json",import.meta.url),"utf8"));
  const manager=new CampusMapManager(config);
  for(const definition of config.maps.filter(m=>m.id!=="campus")) {
    const map=manager.get(definition.id);
    assert.equal(map.background,null);assert.equal(map.skin,"campus");
    assert.deepEqual(map.camera,{minZoom:1.6,integerScale:false,viewWidth:780,viewHeight:480},"indoor cameras preserve the outdoor reference scale without rounding zoom upward");
    assert.ok(map.layout.items.length>50);
    for(const item of [...map.layout.items,...map.layout.floors])assert.ok(skin.frames[item.asset],`${map.id}: shared art for ${item.asset}`);
    for(const item of map.layout.items.filter(i=>i.collision))assert.ok(map.collision.obstacles.includes(item.collision));
  }
  assert.equal(skin.frames.bench.src,"./assets/maps/props/campus-props.png");
  assert.equal(skin.frames["floor-stone"].src,"./assets/maps/tiles/paving.png");
  for(const frame of Object.values(skin.frames)) {
    const {x,y,width,height}=frame.crop;
    assert.ok(x>=0&&y>=0&&width>0&&height>0&&x+width<=frame.width&&y+height<=frame.height);
  }
});

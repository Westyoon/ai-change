import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CAMPUS_BUILDINGS, CAMPUS_FLOWERBEDS, fitFlowerbed, campusProps, depthAtFoot } from "../../js/map/campus-layers.js";

test("flowerbeds preserve source proportions and fit their own footprints",()=>{
  for(const bed of CAMPUS_FLOWERBEDS) for(const crop of [{width:300,height:100},{width:100,height:300},{width:200,height:200}]) {
    const fit=fitFlowerbed(bed,crop);
    assert.ok(fit.width<=bed.width+1e-8&&fit.height<=bed.height+1e-8);
    assert.ok(Math.abs(fit.width/fit.height-crop.width/crop.height)<1e-8);
  }
  assert.ok(new Set(CAMPUS_FLOWERBEDS.map(bed=>bed.type)).size===6);
});
import { CampusMapManager } from "../../js/map/map-manager.js";
import { WalkMask } from "../../js/map/walk-mask.js";

test("campus foreground and characters share foot depth, so trees can cover characters behind them", () => {
  assert.ok(depthAtFoot(620) > depthAtFoot(590));
  assert.ok(depthAtFoot(620) < depthAtFoot(650));
  assert.equal(depthAtFoot(620), 1620);
  assert.deepEqual(CAMPUS_BUILDINGS.map(b=>b.id),["hall","student-center","greenhouse","ecc"]);
  assert.equal(CAMPUS_BUILDINGS.find(b=>b.id==="ecc").ground,true,"ECC stair surfaces stay below walking characters");
});

test("assembled campus reuses separate sprites and does not plant tree trunks in walkable paths", async () => {
  const config=JSON.parse(await readFile(new URL("../../data/maps/campus.json",import.meta.url),"utf8"));
  const manager=new CampusMapManager(config), map=manager.get("campus"),mask=manager.mask("campus");
  const props=campusProps(map,mask);
  const paving=new WalkMask({...map.world,...map.collision});
  assert.ok(props.filter(p=>p.kind==="tree").length>100);
  assert.equal(props.filter(p=>p.kind.startsWith("booth")).length,6);
  for(const bench of props.filter(p=>p.kind==="bench")) {
    for(let y=bench.y-14;y<=bench.y+6;y+=4) for(let x=bench.x-33;x<=bench.x+33;x+=4) {
      assert.equal(paving.cells[Math.floor(y/paving.cellSize)*paving.columns+Math.floor(x/paving.cellSize)],0,"benches leave the full paved path clear");
    }
  }
  for(const p of props.filter(p=>["tree","autumn"].includes(p.kind))) {
    assert.equal(mask.allows({x:p.x-6,y:p.y-8,width:12,height:8}),false,`tree trunk ${p.x},${p.y}`);
  }
});

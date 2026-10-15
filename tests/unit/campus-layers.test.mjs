import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CAMPUS_BUILDINGS, campusProps, depthAtFoot } from "../../js/map/campus-layers.js";
import { CampusMapManager } from "../../js/map/map-manager.js";

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
  assert.ok(props.filter(p=>p.kind==="tree").length>100);
  assert.equal(props.filter(p=>p.kind.startsWith("booth")).length,6);
  for(const p of props.filter(p=>["tree","autumn"].includes(p.kind))) {
    assert.equal(mask.allows({x:p.x-6,y:p.y-8,width:12,height:8}),false,`tree trunk ${p.x},${p.y}`);
  }
});

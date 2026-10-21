import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { followCamera, screenToWorld } from "../../js/map/camera.js";
import { WalkMask } from "../../js/map/walk-mask.js";
import { CampusMapManager } from "../../js/map/map-manager.js";
import { resolveContinuousMovement } from "../../js/map/collision.js";
import { CAMPUS_FLOWERBEDS } from "../../js/map/campus-layers.js";

test("camera follows only a portion of the world, clamps at all edges, and preserves world coordinates", () => {
  const world = { width: 1672, height: 941 };
  for (const viewport of [{ width: 390, height: 600 }, { width: 1440, height: 700 }]) {
    const center = followCamera({ target: { x: 835, y: 470 }, world, viewport, zoom: 2 });
    assert.ok(center.width < world.width);
    assert.deepEqual(screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, center), { x: 835, y: 470 });
    const corner = followCamera({ target: { x: 0, y: 0 }, world, viewport, zoom: 2 });
    assert.equal(corner.x, 0); assert.equal(corner.y, 0);
    const end = followCamera({ target: { x: 1672, y: 941 }, world, viewport, zoom: 2 });
    assert.equal(end.x + end.width, world.width); assert.equal(end.y + end.height, world.height);
  }
});

test("mask checks the whole foot box and continuous movement cannot tunnel through a thin wall", () => {
  const mask = new WalkMask({ width: 100, height: 100, cellSize: 2,
    paths: [[[0,0],[100,0],[100,100],[0,100]]], obstacles: [{ x: 50, y: 0, width: 4, height: 100 }] });
  assert.equal(mask.allows({ x: 46, y: 20, width: 8, height: 8 }), false);
  const moved = resolveContinuousMovement({ position: { x: 10, y: 20 }, size: { width: 8, height: 8 }, delta: { x: 80, y: 10 }, walkMask: mask, maxStep: 2 });
  assert.ok(moved.x + 8 <= 50);
  assert.ok(moved.y > 20, "blocked movement can slide along the wall");
  assert.equal(mask.allows({ x: -1, y: 0, width: 8, height: 8 }), false);
});

test("original campus map keeps every gameplay destination reachable with the full foot box", async () => {
  const config = JSON.parse(await readFile(new URL("../../data/maps/campus.json", import.meta.url), "utf8"));
  const manager = new CampusMapManager(config);
  const map = manager.get("campus"), mask = manager.mask("campus");
  const allows = (x,y) => mask.allows({ x: x-6, y: y-8, width: 12, height: 8 });
  const step = 4, columns = Math.ceil(map.world.width / step);
  const start = [Math.round(map.spawn.x/step), Math.round(map.spawn.y/step)];
  const queue = [start], seen = new Set([start[1]*columns+start[0]]);
  for (let index=0; index<queue.length; index++) {
    const [x,y] = queue[index];
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy, id=ny*columns+nx;
      if (!seen.has(id) && allows(nx*step,ny*step)) { seen.add(id); queue.push([nx,ny]); }
    }
  }
  for (const point of map.interactions) {
    assert.ok(allows(point.x,point.y), `${point.id} stands on a path`);
    assert.ok(queue.some(([x,y]) => Math.hypot(x*step-point.x,y*step-point.y)<12), `${point.id} is connected to spawn`);
  }
  let walkableCount=0;
  for(let y=0;y<map.world.height;y+=step) for(let x=0;x<map.world.width;x+=step) {
    if(allows(x,y))walkableCount++;
  }
  assert.equal(seen.size,walkableCount,"every walkable path belongs to the spawn network, including northern paths");
  for (const [x,y] of [[835,620],[150,300],[700,570]]) assert.equal(allows(x,y),false,"buildings and gardens are blocked");
  assert.equal(allows(950,470),true,"open grass is walkable");
  for(const bed of CAMPUS_FLOWERBEDS) assert.equal(allows(bed.x+bed.width/2,bed.y+bed.height/2),false,"every flowerbed blocks walking");
  assert.deepEqual(manager.restore({ mapId:"campus",version:"old",x:835,y:620 }), { mapId:"campus",version:config.version,...map.spawn });
  assert.throws(()=>manager.get("missing_interior"),/not available/);
});

test("indoor entrances, rooms and exits are reachable without crossing furniture or walls",async()=>{
  const config=JSON.parse(await readFile(new URL("../../data/maps/campus.json",import.meta.url),"utf8"));
  const manager=new CampusMapManager(config);
  for(const definition of config.maps.filter(m=>m.id!=="campus")) {
    const map=manager.get(definition.id);
    const mask=manager.mask(map.id),step=4,cols=Math.ceil(map.world.width/step);
    const allows=(x,y)=>mask.allows({x:x-6,y:y-8,width:12,height:8});
    assert.ok(allows(map.spawn.x,map.spawn.y),`${map.id} spawn`);
    const start=[Math.round(map.spawn.x/step),Math.round(map.spawn.y/step)];
    const queue=[start],seen=new Set([start[1]*cols+start[0]]);
    for(let i=0;i<queue.length;i++) {
      const [x,y]=queue[i];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy,id=ny*cols+nx;
        if(!seen.has(id)&&allows(nx*step,ny*step)){seen.add(id);queue.push([nx,ny]);}
      }
    }
    for(const point of [...map.interactions,...map.checkpoints]) {
      assert.ok(allows(point.x,point.y),`${map.id} point ${point.x},${point.y} is walkable`);
      assert.ok(queue.some(([x,y])=>Math.hypot(x*step-point.x,y*step-point.y)<10),`${map.id} point ${point.x},${point.y} connected`);
    }
    for(const obstacle of map.collision.obstacles) assert.equal(allows(obstacle.x+obstacle.width/2,obstacle.y+obstacle.height/2),false);
    for(const exit of map.interactions) {
      const outside=manager.mask(exit.targetMap);
      assert.ok(outside.allows({x:exit.spawn.x-6,y:exit.spawn.y-8,width:12,height:8}),"return position is safe");
    }
  }
  assert.equal(manager.mask("greenhouse_interior").allows({x:1530,y:1248,width:12,height:8}),false,"fountain blocks movement");
});

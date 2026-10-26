import assert from "node:assert/strict";
import test from "node:test";
import { WalkMask, insidePolygon } from "../../js/map/walk-mask.js";

test("shape rasterization preserves cell-center collision semantics for overlapping and fractional geometry",()=>{
  let seed=734;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let sample=0;sample<50;sample++) {
    const width=73,height=59,cellSize=[2,3.5,4][sample%3];
    const paths=[[[0,0],[50.5,0],[73,35],[28,59],[0,25]],[[20.5,18.5],[80,18.5],[80,60],[20.5,60]]];
    const obstacles=Array.from({length:14},()=>({x:random()*80-8,y:random()*65-5,width:random()*20,height:random()*18}));
    const blockedPolygons=[[[12.5,12.5],[28.5,12.5],[22,27.5]],[[45,40],[80,40],[80,70],[45,70]]];
    const mask=new WalkMask({width,height,cellSize,paths,obstacles,blockedPolygons});
    for(let row=0;row<mask.rows;row++)for(let column=0;column<mask.columns;column++) {
      const x=(column+.5)*cellSize,y=(row+.5)*cellSize;
      const expected=Number(paths.some(p=>insidePolygon(x,y,p))
        && !obstacles.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)
        && !blockedPolygons.some(p=>insidePolygon(x,y,p)));
      assert.equal(mask.cells[row*mask.columns+column],expected,`${sample}: ${x},${y}`);
    }
  }
});

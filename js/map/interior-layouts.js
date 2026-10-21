const box=(x,y,width,height)=>({x,y,width,height});
const polygon=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
const NEW_ASSETS=["sofa-h","sofa-v","rug","round-table","study-table","bookshelf","counter","garden-bed","planter-edge","leaf-patch","palm","fountain","pavilion-roof","pavilion-column"];

function builder(definition) {
  const floors=[],items=[],checkpoints=[];
  const floor=(asset,x,y,width,height,tileWidth=32,tileHeight=32)=>floors.push({...box(x,y,width,height),asset,tileWidth,tileHeight});
  const item=(kind,x,y,width,height,collision=null,extra={})=>{
    const value={kind,asset:kind,...box(x,y,width,height),footY:y+height,collision,...extra};items.push(value);return value;
  };
  const wall=(x,y,width,height,asset="wall")=>item(asset,x,y,width,height,box(x,y,width,height),{repeat:true,tileWidth:asset==="glass-h"?64:32,tileHeight:asset==="glass"?64:32});
  const door=(x,y)=>item("door-front",x,y-32,64,64,null,{door:true,center:{x:x+32,y:y+16},openAsset:"door-front-open"});
  const horizontal=(x,y,width,gapX=null,asset="wall")=>{
    if(gapX===null)return wall(x,y,width,32,asset);
    wall(x,y,gapX-x,32,asset);wall(gapX+64,y,x+width-gapX-64,32,asset);door(gapX,y);
  };
  const plant=(x,y,flowers=false)=>item(flowers?"flowers":"plant",x,y,32,flowers?40:48,box(x+8,y+(flowers?28:36),16,12));
  const bench=(x,y)=>item("bench",x,y,80,40,box(x+4,y+24,72,16));
  const enclosure=(glass=false)=>{
    floor("floor-stone",64,64,2944,1888);
    horizontal(64,64,2944,null,glass?"glass-h":"wall");
    horizontal(64,1920,2944,1504,glass?"glass-h":"wall");
    wall(64,96,32,1824,glass?"glass":"wall");wall(2976,96,32,1824,glass?"glass":"wall");
  };
  const finish=()=>({...definition,background:null,world:{width:3072,height:2048},assetRoot:"./assets/maps/ecc/",
    assets:Object.fromEntries(NEW_ASSETS.map(name=>[name,`./assets/maps/interior/${name}.svg`])),layout:{floors,items},checkpoints,
    collision:{cellSize:4,paths:floors.filter(f=>["floor-stone","floor-wood","stairs","rug"].includes(f.asset)).map(polygon),
      obstacles:items.filter(i=>i.collision).map(i=>i.collision),blockedPolygons:items.filter(i=>i.collisionPolygon).map(i=>i.collisionPolygon)},
    interactions:[{id:`exit-${definition.id}`,kind:"portal",label:"캠퍼스로",x:1536,y:1936,targetMap:"campus",spawn:definition.outdoorReturn}],
  });
  return {floor,item,wall,door,horizontal,plant,bench,enclosure,finish,checkpoints};
}

export function createStudentCenterTileMap(definition) {
  const b=builder(definition),{floor,item,wall,horizontal,plant,bench}=b;
  b.enclosure();
  // Glass partitions leave the top and bottom of both side aisles open.
  for(const x of [832,1888])wall(x,448,32,1152,"glass");
  for(const y of [512,1152]) {
    floor("rug",288,y-32,448,416);
    for(const x of [320,448,576]) {
      item("sofa-h",x,y,128,64,box(x,y+20,128,40));
      item("sofa-h",x,y+288,128,64,box(x,y+308,128,40));
    }
    for(const dy of [64,176])item("sofa-v",320,y+dy,68,112,box(328,y+dy,52,112),{flipX:true});
    item("round-table",512,y+144,64,64,box(518,y+152,52,48));
    plant(256,y-48);plant(256,y+304,true);
    b.checkpoints.push({id:`sofa-${y}`,x:736,y:y+176});
  }
  // Study room: bottom door, four independent table/chair groups, wall desks.
  floor("floor-wood",2144,416,768,1216);
  horizontal(2112,384,832);wall(2112,416,32,1216);wall(2912,416,32,1216);
  horizontal(2112,1632,832,2496);
  for(const x of [2272,2656])for(const y of [640,1152]) {
    item("study-table",x,y,96,96,box(x+4,y+5,88,72),{footY:y+80});
    for(const [dx,dy] of [[16,-32],[56,-32],[16,88],[56,88],[-32,32],[104,32]])
      item("chair",x+dx,y+dy,24,28,box(x+dx+3,y+dy+16,18,12));
  }
  item("bookshelf",2400,448,96,64,box(2404,480,88,32));
  item("counter",2848,576,64,960,box(2852,580,56,952),{repeat:true,tileWidth:64,tileHeight:64});
  for(const y of [448,1536])for(const x of [2176,2816])plant(x,y);
  for(const x of [896,1824])for(const y of [480,864,1248,1536])plant(x,y,true);
  for(const x of [256,2720]){bench(x,192);bench(x,1808);}
  for(const x of [128,2880])for(const y of [160,800,1728])plant(x,y);
  for(const [id,x,y] of [["lobby",1536,1024],["study-door",2528,1680],["study-center",2528,1024],["study-right",2792,1472]])b.checkpoints.push({id,x,y});
  return b.finish();
}

export function createGreenhouseTileMap(definition) {
  const b=builder(definition),{floor,item,wall,plant,bench}=b;
  b.enclosure(true);
  const garden=(x,y,width,height)=>{
    item("garden-bed",x,y,width,height,box(x,y,width,height),{repeat:true,tileWidth:32,tileHeight:32,footY:y+8});
    item("planter-edge",x,y+height,width,16,null,{repeat:true,tileWidth:32,tileHeight:16});
    for(let py=y+24;py<y+height-40;py+=96)for(let px=x+24;px<x+width-40;px+=96)
      item("leaf-patch",px,py,64,64);
    for(let px=x+48;px<x+width-32;px+=160)plant(px,y+height-48,true);
    item("palm",x+width/2-32,y+height/2-80,64,112);
  };
  for(const x of [256,2176]){garden(x,256,640,384);garden(x,896,640,384);}
  garden(256,1472,768,320);garden(2048,1472,768,320);
  for(const x of [512,2480])for(const y of [704,1344,1824])bench(x,y);
  for(const x of [128,2880])for(const y of [320,768,1216,1696])plant(x,y,true);

  // Fountain is a separate sprite with an ellipse-shaped ground collision.
  const cx=1536,cy=1256;
  const shape=Array.from({length:40},(_,i)=>[cx+176*Math.cos(i*Math.PI/20),cy+112*Math.sin(i*Math.PI/20)]);
  item("fountain",1344,1056,384,320,null,{collisionPolygon:shape,footY:1368});
  // Independent platform, stairs, roof and pillars form the pavilion.
  floor("floor-wood",1312,320,448,320);
  floor("stairs",1376,640,320,160);
  for(const x of [1344,1696])for(const y of [400,528])item("pavilion-column",x,y,32,112,box(x+6,y+100,20,12));
  item("pavilion-roof",1344,128,384,320,null,{footY:480});
  for(const x of [1280,1760])plant(x,592,true);
  for(const [id,x,y] of [["below-fountain",1536,1632],["left-aisle",1184,1216],["right-aisle",1888,1216],["stairs",1536,768],["pavilion",1536,480]])b.checkpoints.push({id,x,y});
  return b.finish();
}

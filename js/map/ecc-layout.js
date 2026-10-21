// Native 32px tiles and individually placed furniture, in world coordinates.
// No full-map bitmap is used. Every solid placement owns its collision box.
const ROOT="./assets/maps/ecc/";
const box=(x,y,width,height)=>({x,y,width,height});
const polygon=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];

export function createEccTileMap(definition) {
  const floors=[],items=[],checkpoints=[];
  const floor=(asset,x,y,width,height,tileWidth=32,tileHeight=32)=>floors.push({...box(x,y,width,height),asset,tileWidth,tileHeight});
  const item=(kind,x,y,width,height,collision=null,extra={})=>{
    const value={kind,asset:kind,...box(x,y,width,height),footY:y+height,collision,...extra};
    items.push(value);return value;
  };
  const wall=(x,y,width,height,asset="wall")=>item(asset,x,y,width,height,box(x,y,width,height),{repeat:true,tileWidth:asset==="glass-h"?64:32,tileHeight:asset==="glass"?64:32});
  const door=(x,y,front=false)=>item(front?"door-front":"door",x,front?y-32:y,front?64:32,64,null,{
    door:true,center:{x:x+(front?32:16),y:y+(front?16:32)},openAsset:front?"door-front-open":"door-open",
  });
  const horizontal=(x,y,width,gapX=null)=>{
    if(gapX===null)return wall(x,y,width,32);
    wall(x,y,gapX-x,32);wall(gapX+64,y,x+width-gapX-64,32);door(gapX,y,true);
  };
  const vertical=(x,y,height,asset="wall",gapY=null)=>{
    if(gapY===null)return wall(x,y,32,height,asset);
    wall(x,y,32,gapY-y,asset);wall(x,gapY+64,32,y+height-gapY-64,asset);door(x,gapY);
  };
  const plant=(x,y,flowers=false)=>item(flowers?"flowers":"plant",x,y,32,flowers?40:48,box(x+8,y+(flowers?28:36),16,12));
  const desk=(x,y)=>{
    item("desk",x,y,64,40,box(x+3,y+6,58,24),{footY:y+30});
    for(const dx of [4,36])item("chair",x+dx,y+32,24,28,box(x+dx+3,y+48,18,12));
  };
  const room=(id,x,y,width,height,side=null)=>{
    floor("floor-wood",x+32,y+32,width-64,height-64);
    horizontal(x,y,width);
    horizontal(x,y+height-32,width,x+width/2-32);
    vertical(x,y+32,height-64,side==="left"?"glass":"wall",side==="left"?y+384:null);
    vertical(x+width-32,y+32,height-64,side==="right"?"glass":"wall",side==="right"?y+384:null);
    item("board",x+width/2-64,y+48,128,48);
    item("podium",x+width/2-32,y+128,64,48,box(x+width/2-28,y+144,56,32));
    const cols=side?[64,192,320]:[48,160,272,384];
    const rows=side?[224,304,384,464]:[224,320];
    for(const dx of cols)for(const dy of rows)desk(x+dx,y+dy);
    plant(x+40,y+48);plant(x+width-72,y+48);
    plant(x+40,y+height-80,true);plant(x+width-72,y+height-80,true);
    checkpoints.push({id,x:x+width-56,y:y+height-104});
  };

  floor("floor-stone",64,64,768,1888);
  floor("floor-stone",2240,64,768,1888);
  floor("floor-stone",832,64,1408,1024);
  horizontal(64,64,2944);
  vertical(64,96,1824);vertical(2976,96,1824);
  horizontal(64,1920,768,688);horizontal(2240,1920,768,2320);
  vertical(800,1088,832,"glass");vertical(2240,1088,832,"glass");
  wall(800,1056,1472,32,"glass-h");

  room("left-upper-classroom",96,96,480,576,"right");
  room("left-lower-classroom",96,1152,480,576,"right");
  room("right-upper-classroom",2496,96,480,576,"left");
  room("right-lower-classroom",2496,1152,480,576,"left");
  room("center-left-classroom",960,96,544,512);
  room("center-right-classroom",1568,96,544,512);

  floor("floor-wood",1024,736,1024,320);
  floor("stairs",896,704,128,352);floor("stairs",2048,704,128,352);
  for(const y of [800,896,992])floor("step-edge",1024,y,1024,16,32,16);
  for(const y of [752,848,944])for(let center=1088;center<=1984;center+=128) {
    item("cushion",center-24,y,48,24,box(center-22,y+14,44,10));
  }
  for(const x of [1024,2016])plant(x,1008,true);
  for(const x of [176,2816])item("bench",x,960,80,40,box(x+4,984,72,16));
  for(const x of [96,2880])for(const y of [784,976,1808])plant(x,y,true);
  for(const x of [752,2288])for(const y of [128,416,736,1200,1536,1792])plant(x,y);
  for(const x of [864,2176])plant(x,640,true);
  checkpoints.push({id:"left-corridor",x:704,y:960},{id:"right-corridor",x:2368,y:960},
    {id:"wooden-seating",x:1040,y:912},{id:"bridge",x:1536,y:672});

  const world={width:3072,height:2048};
  return {...definition,world,background:null,assetRoot:ROOT,layout:{floors,items},
    collision:{cellSize:4,paths:floors.filter(f=>["floor-stone","floor-wood","stairs"].includes(f.asset)).map(polygon),obstacles:items.filter(i=>i.collision).map(i=>i.collision)},
    checkpoints,
    interactions:[
      {id:"exit-ecc-left",kind:"portal",label:"캠퍼스로",x:720,y:1936,targetMap:"campus",spawn:definition.outdoorReturn},
      {id:"exit-ecc-right",kind:"portal",label:"캠퍼스로",x:2352,y:1936,targetMap:"campus",spawn:definition.outdoorReturn},
    ],
  };
}

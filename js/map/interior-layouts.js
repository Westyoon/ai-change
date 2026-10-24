const box=(x,y,width,height)=>({x,y,width,height});
const polygon=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
const NEW_ASSETS=["sofa-h","sofa-v","rug","round-table","study-table","bookshelf","counter","garden-bed","planter-edge","leaf-patch","palm","fountain","pavilion-roof","pavilion-column"];

function builder(definition,width,height) {
  const floors=[],items=[],checkpoints=[];
  const floor=(asset,x,y,width,height,tileWidth=32,tileHeight=32)=>floors.push({...box(x,y,width,height),asset,tileWidth,tileHeight});
  const item=(kind,x,y,width,height,collision=null,extra={})=>{
    const value={kind,asset:kind,...box(x,y,width,height),footY:y+height,collision,...extra};items.push(value);return value;
  };
  const wall=(x,y,width,height,asset="wall")=>item(asset,x,y,width,height,box(x,y,width,height),{repeat:true,tileWidth:32,tileHeight:32});
  const door=(x,y)=>item("door-front",x,y-32,64,64,null,{door:true,center:{x:x+32,y:y+16},openAsset:"door-front-open"});
  const horizontal=(x,y,width,gapX=null,asset="wall")=>{
    if(gapX===null)return wall(x,y,width,32,asset);
    wall(x,y,gapX-x,32,asset);wall(gapX+64,y,x+width-gapX-64,32,asset);door(gapX,y);
  };
  const plant=(x,y,flowers=false)=>item(flowers?"flowers":"plant",x,y,32,flowers?40:48,box(x+8,y+(flowers?28:36),16,12));
  const bench=(x,y)=>item("bench",x,y,80,40,box(x+4,y+24,72,16));
  const enclosure=(glass=false)=>{
    floor("floor-stone",64,64,width-128,height-160);
    horizontal(64,64,width-128,null,glass?"glass-h":"wall");
    horizontal(64,height-128,width-128,width/2-32,glass?"glass-h":"wall");
    wall(64,96,32,height-224,glass?"glass":"wall");wall(width-96,96,32,height-224,glass?"glass":"wall");
  };
  const finish=()=>({...definition,background:null,world:{width,height},assetRoot:"./assets/maps/ecc/",
    assets:{...Object.fromEntries(NEW_ASSETS.map(name=>[name,"./assets/maps/interior/"+name+".svg"])),"chair-back":"./assets/maps/ecc/chair.svg","chair-side":"./assets/maps/ecc/chair.svg","broadleaf":"./assets/maps/interior/palm.svg"},
    layout:{floors,items},checkpoints,
    collision:{cellSize:4,paths:floors.filter(f=>["floor-stone","floor-wood","stairs","rug"].includes(f.asset)).map(polygon),
      obstacles:items.filter(i=>i.collision).map(i=>i.collision),blockedPolygons:items.filter(i=>i.collisionPolygon).map(i=>i.collisionPolygon)},
    interactions:[{id:"exit-"+definition.id,kind:"portal",label:"캠퍼스로",x:width/2,y:height-112,targetMap:"campus",spawn:definition.outdoorReturn}],
  });
  return {floor,item,wall,door,horizontal,plant,bench,enclosure,finish,checkpoints};
}

export function createStudentCenterTileMap(definition) {
  const b=builder(definition,1600,1024),{floor,item,wall,horizontal,plant,bench}=b;
  b.enclosure();
  // Left: continuous, shallow low-backed seating; no rugs or dining chairs.
  wall(544,192,24,640,"glass");
  for(const x of [184,328])item("lounge-sofa-h",x,208,144,40,box(x,224,144,24));
  for(const y of [240,384,528,672])item("lounge-sofa-v",144,y,40,144,box(144,y,40,144));
  for(const y of [384,672])item("round-table",272,y,48,36,box(278,y+18,36,16));
  plant(448,256);plant(448,480,true);plant(448,736);
  for(const y of [352,720])b.checkpoints.push({id:"rest-"+y,x:352,y});
  // Center: security office and elevator, with an unobstructed north/south aisle.
  item("security-office",624,352,144,96,box(628,408,136,40));
  item("elevator",800,176,96,112,box(804,244,88,44));
  bench(816,544);plant(624,528);plant(928,192);
  // Right: every desk touches the right wall; chairs exist only in front (left).
  floor("floor-wood",1088,224,352,544);
  horizontal(1056,192,416);wall(1056,224,32,544);wall(1440,224,32,544);
  horizontal(1056,768,416,1216);
  for(let y=256;y<=704;y+=64) {
    item("wall-study-desk",1400,y,40,64,box(1400,y+8,40,56),{stationY:y});
    item("study-chair",1364,y+20,24,28,box(1367,y+36,18,12),{stationY:y});
  }
  item("bookshelf",1184,240,112,64,box(1188,272,104,32));
  plant(1104,256);plant(1104,688);
  for(const x of [112,1456])for(const y of [128,816])plant(x,y);
  for(const [id,x,y]of [["lobby",800,672],["elevator-front",848,320],["security-front",696,480],["study-door",1248,816],["study-center",1248,480],["study-right",1328,672]])
    b.checkpoints.push({id,x,y});
  return b.finish();
}

export function createGreenhouseTileMap(definition) {
  const b=builder(definition,1536,1280),{floor,item,plant,bench}=b;
  b.enclosure(true);
  // Complete, densely planted individual planters replace the leaf carpet.
  const garden=(x,y,width,height,variation=0)=>{
    const columns=height<160?3:2,rows=height<160?1:2;
    const w=columns===3?112:128,h=96;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
      const px=x+col*(width-w)/(columns-1),py=y+row*(height-h);
      const asset=["planter-tropical","planter-flowers","planter-fern"][(row+col+variation)%3];
      item(asset,px,py,w,h,box(px+6,py+64,w-12,28));
    }
  };
  garden(160,208,288,240);garden(1088,208,288,240,1);
  garden(160,608,288,224,1);garden(1088,608,288,224);
  garden(160,960,352,144);garden(1024,960,352,144,1);
  for(const x of [480,992])item("trellis",x,176,64,112,box(x+8,272,48,16));
  item("potting-bench",192,848,112,88,box(198,904,100,28));
  item("potting-bench",1200,848,112,88,box(1206,904,100,28));
  for(const x of [320,480,1024,1184])item("hanging-basket",x,96,32,64,null,{footY:144});
  for(const x of [624,808])item("planter-flowers",x,544,104,72,box(x+6,592,92,20));
  // Pavilion sits at the end of the central promenade, with lower seating nearby.
  floor("floor-wood",608,176,320,208);
  floor("stairs",656,384,224,112);
  for(const x of [624,888])for(const y of [208,304])
    item("pavilion-column",x,y,24,80,box(x+4,y+70,16,10));
  item("pavilion-roof",640,64,256,212,null,{footY:256});
  bench(704,304);
  plant(576,352,true);plant(928,352,true);
  const cx=768,cy=768;
  const shape=Array.from({length:40},(_,i)=>[cx+58*Math.cos(i*Math.PI/20),cy+32*Math.sin(i*Math.PI/20)]);
  item("fountain",704,704,128,112,null,{collisionPolygon:shape,footY:800});
  for(const x of [528,928]) {
    bench(x,640);bench(x,864);
    item("broadleaf",x+8,528,56,80,box(x+20,592,32,16));
    plant(x+24,960,true);
  }
  // Low planting islands frame the fountain while preserving all four approaches.
  for(const x of [592,864]) {
    item("leaf-patch",x,1008,80,48,box(x+8,1032,64,20));
    plant(x+24,992,true);
  }
  for(const x of [112,1392])for(const y of [480,880])plant(x,y,true);
  for(const [id,x,y]of [["below-fountain",768,944],["left-aisle",496,768],["right-aisle",1040,768],["stairs",768,464],["pavilion",768,272]])
    b.checkpoints.push({id,x,y});
  return b.finish();
}

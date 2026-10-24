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
    floor(definition.id==="student_center_interior"?"student-grey":"floor-stone",64,64,width-128,height-160);
    horizontal(64,64,width-128,null,glass?"glass-h":"wall");
    horizontal(64,height-128,width-128,width/2-32,glass?"glass-h":"wall");
    wall(64,96,32,height-224,glass?"glass":"wall");wall(width-96,96,32,height-224,glass?"glass":"wall");
  };
  const finish=()=>({...definition,background:null,world:{width,height},assetRoot:"./assets/maps/ecc/",
    assets:{...Object.fromEntries(NEW_ASSETS.map(name=>[name,"./assets/maps/interior/"+name+".svg"])),"chair-back":"./assets/maps/ecc/chair.svg","chair-side":"./assets/maps/ecc/chair.svg","broadleaf":"./assets/maps/interior/palm.svg"},
    layout:{floors,items},checkpoints,
    collision:{cellSize:4,paths:floors.filter(f=>["floor-stone","floor-wood","student-grey","stairs","rug","conservatory-landing","conservatory-stairs"].includes(f.asset)).map(polygon),
      obstacles:items.filter(i=>i.collision).map(i=>i.collision),blockedPolygons:items.filter(i=>i.collisionPolygon).map(i=>i.collisionPolygon)},
    interactions:[{id:"exit-"+definition.id,kind:"portal",label:"캠퍼스로",x:width/2,y:height-112,targetMap:"campus",spawn:definition.outdoorReturn}],
  });
  return {floor,item,wall,door,horizontal,plant,bench,enclosure,finish,checkpoints};
}

export function createStudentCenterTileMap(definition) {
  const b=builder(definition,1600,1024),{floor,item,wall,horizontal,plant,bench}=b;
  b.enclosure();
  // Left: continuous, shallow low-backed seating; no rugs or dining chairs.
  wall(544,192,24,640,"lounge-glass-v");
  // One complete L-shaped sprite, not short sofa slices joined together.
  item("continuous-lounge-sofa",144,208,256,480,null,{collisionPolygon:[
    [144,208],[400,208],[400,262],[188,262],[188,688],[144,688],
  ]});
  for(const y of [384,672])item("round-table",272,y,48,36,box(278,y+18,36,16));
  plant(448,256);plant(448,480,true);plant(448,736);
  for(const y of [352,720])b.checkpoints.push({id:"rest-"+y,x:352,y});
  // Security office sits against the north wall; the plaza stays open.
  item("security-office",656,96,160,96,box(660,152,152,40));
  plant(624,128);plant(848,128);
  // Backrests meet the glass, with seats facing west into the plaza.
  // Both doorway approaches remain completely clear.
  for(const y of [192,432])item("grey-sofa-v",1016,y,40,128,box(1016,y,40,128));
  // Right: every desk touches the right wall; chairs exist only in front (left).
  floor("student-grey",1088,224,352,544);
  horizontal(1056,192,416,null,"lounge-glass-h");wall(1440,224,32,544,"lounge-glass-v");
  // Two west-facing doors open directly into the plaza, not the south wall.
  for(const [y,height]of [[224,96],[384,224],[672,96]])wall(1056,y,32,height,"lounge-glass-v");
  for(const y of [320,608])item("lounge-glass-door",1056,y,32,64,null,{door:true,center:{x:1072,y:y+32},openAsset:"lounge-glass-door-open",plazaEntrance:true});
  horizontal(1056,768,416,null,"lounge-glass-h");
  for(let y=256;y<=704;y+=64) {
    item("wall-study-desk",1408,y,32,64,box(1416,y+8,24,56),{stationY:y});
    item("study-chair",1380,y+20,24,28,box(1383,y+36,18,12),{stationY:y});
  }
  for(const y of [368,592]) {
    item("square-table",1200,y,64,56,box(1204,y+10,56,34));
    for(const [dx,dy,asset,flipX]of [[20,-28,"chair",false],[20,56,"chair-back",false],[-28,14,"study-chair",false],[68,14,"study-chair",true]])
      item("table-chair",1200+dx,y+dy,24,28,box(1203+dx,y+dy+16,18,12),{asset,flipX});
  }
  item("bookshelf",1184,240,112,64,box(1188,272,104,32));
  plant(1104,256);plant(1104,688);
  for(const x of [112,1456])for(const y of [128,816])plant(x,y);
  for(const [id,x,y]of [["lobby",800,672],["security-front",736,224],["study-door-north",1072,352],["study-door-south",1072,640],["study-center",1296,480],["study-right",1328,672]])
    b.checkpoints.push({id,x,y});
  return b.finish();
}

export function createGreenhouseTileMap(definition) {
  const b=builder(definition,1536,1280),{floor,item,plant,bench}=b;
  b.enclosure(true);
  // Paired botanical beds follow a regular grid, with clear aisles between beds.
  const garden=(x,y,width,height,variation=0)=>{
    const columns=height<160?3:2,rows=height<160?1:2;
    const w=columns===3?104:120,h=96;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
      const px=x+col*(width-w)/(columns-1),py=y+row*(height-h);
      const asset=["planter-tropical","planter-flowers","planter-fern"][(row+col+variation)%3];
      item(asset,px,py,w,h,box(px+6,py+64,w-12,28));
    }
  };
  garden(160,208,288,240);garden(1088,208,288,240);
  garden(160,608,288,224,1);garden(1088,608,288,224,1);
  garden(160,960,352,144);garden(1024,960,352,144);
  item("potting-bench",192,848,112,88,box(198,904,100,28));
  item("potting-bench",1200,848,112,88,box(1206,904,100,28));
  for(const x of [320,480,1024,1184])item("hanging-basket",x,96,32,64,null,{footY:144});
  // Fern borders frame the stair approach instead of scattered flower pots.
  for(const x of [544,832])item("conservatory-fern-h",x,520,160,56,box(x+6,556,148,20));
  // A broader low terrace, with only three shallow steps and a thin fascia.
  floor("conservatory-landing",544,160,448,256);
  floor("conservatory-stairs",640,408,256,64);
  for(const x of [552,968])for(const y of [144,272])
    item("conservatory-post",x,y,16,128,box(x+4,y+116,8,12));
  item("conservatory-canopy",536,80,464,224,null,{footY:416,
    canopy:{x:544,y:160,width:448,height:256,opacity:.94,insideOpacity:.2}});
  // Light upper eaves make the glass atrium ceiling visible without hiding play.
  item("conservatory-ceiling",96,64,1344,112,null,{repeat:true,tileWidth:192,tileHeight:112,footY:2048,
    canopy:{x:96,y:64,width:1344,height:112,opacity:.62,insideOpacity:.16}});
  for(const x of [584,904])item("conservatory-fern-v",x,384,48,104,box(x+4,408,40,80));
  // Small white steel cafe furniture leaves the middle aisle free.
  for(const x of [608,864]) {
    const y=272;
    item("white-cafe-table",x,y,64,48,box(x+5,y+14,54,24));
    for(const [dx,dy,asset,flipX]of [[20,-28,"white-chair",false],[20,48,"white-chair-back",false],[-28,10,"white-chair-side",false],[68,10,"white-chair-side",true]])
      item("cafe-chair",x+dx,y+dy,24,28,box(x+dx+3,y+dy+16,18,12),{asset,flipX});
  }
  for(const x of [480,1000])item("conservatory-fern-v",x,224,56,128,box(x+4,256,48,96));
  const cx=768,cy=768;
  const shape=Array.from({length:40},(_,i)=>[cx+58*Math.cos(i*Math.PI/20),cy+32*Math.sin(i*Math.PI/20)]);
  item("fountain",704,704,128,112,null,{collisionPolygon:shape,footY:800});
  for(const x of [528,928]) {
    bench(x,640);bench(x,864);
    item("conservatory-fern-h",x-8,592,96,40,box(x-4,616,88,16));
  }
  // A matching low pair closes the fountain garden without blocking its axis.
  for(const x of [560,864])item("conservatory-fern-h",x,1008,112,40,box(x+4,1032,104,16));
  for(const [id,x,y]of [["below-fountain",768,944],["left-aisle",496,768],["right-aisle",1040,768],["stairs",768,448],["pavilion",768,272]])
    b.checkpoints.push({id,x,y});
  return b.finish();
}

const SVG = "http://www.w3.org/2000/svg";
export const CAMPUS_BUILDINGS = Object.freeze([
  { id: "hall", src: "./assets/maps/buildings/hall.png", x: 568, y: 48, width: 535, height: 326, footY: 340 },
  { id: "student-center", src: "./assets/maps/buildings/student-center.png", x: 22, y: 136, width: 448, height: 342, footY: 416 },
  { id: "greenhouse", src: "./assets/maps/buildings/greenhouse.png", x: 711, y: 536, width: 249, height: 177, footY: 700 },
  { id: "ecc", src: "./assets/maps/buildings/ecc.png", x: 1210, y: 78, width: 395, height: 785, footY: 790, ground: true },
]);

export function depthAtFoot(y) { return 1000 + Math.round(y); }

// These sprites do not fill the atlas cells. Use their real bounds and aspect ratios.
const PROP_CROPS = {
  bench: { x:940, y:655, width:336, height:173 },
  lamp: { x:1500, y:464, width:99, height:388 },
};

export const CAMPUS_FLOWERBEDS = Object.freeze([
  { type:0, x:684, y:516, width:112, height:38 },
  { type:0, x:879, y:516, width:112, height:38 },
  { type:1, x:674, y:564, width:32, height:132 },
  { type:1, x:968, y:564, width:32, height:132 },
  { type:4, x:682, y:712, width:118, height:42 },
  { type:4, x:871, y:712, width:118, height:42 },
  { type:2, x:710, y:797, width:48, height:48 },
  { type:2, x:918, y:797, width:48, height:48 },
  { type:3, x:689, y:535, width:44, height:44 },
  { type:3, x:943, y:535, width:44, height:44, mirror:true },
  { type:0, x:592, y:344, width:135, height:28 },
  { type:0, x:943, y:344, width:135, height:28 },
  { type:5, x:103, y:442, width:24, height:28 },
  { type:5, x:378, y:442, width:24, height:28 },
]);

export function fitFlowerbed(bed, crop) {
  const scale = Math.min(bed.width / crop.width, bed.height / crop.height);
  const width = crop.width * scale, height = crop.height * scale;
  return { x:bed.x+(bed.width-width)/2, y:bed.y+(bed.height-height)/2, width, height, scale };
}

function touchesPath(mask,x,y,clearance=18) {
  for(let sy=y-clearance;sy<=y+clearance;sy+=4) for(let sx=x-clearance;sx<=x+clearance;sx+=4) {
    const column=Math.floor(sx/mask.cellSize),row=Math.floor(sy/mask.cellSize);
    if(column>=0&&column<mask.columns&&row>=0&&row<mask.rows&&mask.cells[row*mask.columns+column])return true;
  }
  return false;
}

function svgNode(document, name, attributes = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** Ground is assembled from reusable 32px patterns, never from an enlarged screenshot. */
export function createCampusTerrain(document, map) {
  const svg = svgNode(document, "svg", { viewBox: `0 0 ${map.world.width} ${map.world.height}`, width: map.world.width, height: map.world.height, "aria-hidden": "true", "shape-rendering": "crispEdges" });
  svg.classList.add("campus-terrain");
  const defs = svgNode(document, "defs");
  const grassTexture = map.terrain?.grass ?? { src:"./assets/maps/tiles/grass.svg", size:32 };
  const pavingTexture = map.terrain?.paving ?? { src:"./assets/maps/tiles/paving.svg", size:32 };
  const grass = svgNode(document, "pattern", { id: "campus-grass", width: grassTexture.size, height: grassTexture.size, patternUnits: "userSpaceOnUse" });
  grass.append(svgNode(document,"image",{href:grassTexture.src,width:grassTexture.size,height:grassTexture.size}));
  const paving = svgNode(document,"pattern",{id:"campus-paving",width:pavingTexture.size,height:pavingTexture.size,patternUnits:"userSpaceOnUse"});
  paving.append(svgNode(document,"image",{href:pavingTexture.src,width:pavingTexture.size,height:pavingTexture.size}));
  const stairs=svgNode(document,"pattern",{id:"campus-stairs",width:32,height:28,patternUnits:"userSpaceOnUse"});
  stairs.append(svgNode(document,"image",{href:"./assets/maps/tiles/stairs.svg",width:32,height:28}));
  defs.append(grass,paving,stairs);svg.append(defs);
  svg.append(svgNode(document,"rect",{width:map.world.width,height:map.world.height,fill:"url(#campus-grass)"}));
  for (const polygon of map.collision.paths) svg.append(svgNode(document,"polygon",{points:polygon.map(p=>p.join(",")).join(" "),fill:"url(#campus-paving)"}));
  // Outdoor entry steps are tiles; ECC architecture and its stairs are one building asset.
  for (const [x,y,w,h] of [[803,850,74,57],[208,802,102,54]]) {
    svg.append(svgNode(document,"rect",{x,y,width:w,height:h,fill:"url(#campus-stairs)"}));
  }
  return svg;
}

/** Separate sprites share the same foot-depth rule as local and remote characters. */
export function createCampusProp(document, { kind, x, y, width, height }) {
  const crop = PROP_CROPS[kind];
  if (crop) {
    const scale = Math.min(width / crop.width, height / crop.height);
    width = crop.width * scale;
    height = crop.height * scale;
  }
  const index = { tree:0, autumn:1, hedge:2, flowers:3, "booth-green":4, "booth-pink":5, bench:6, lamp:7 }[kind];
  const node = document.createElement("div");
  node.className = "campus-prop";
  node.dataset.prop = kind;
  node.dataset.footY = String(y);
  node.setAttribute("aria-hidden","true");
  Object.assign(node.style, { left:`${x-width/2}px`,top:`${y-height*.92}px`,width:`${width}px`,height:`${height}px`,zIndex:String(depthAtFoot(y)),
    backgroundPosition:`${(index%4)/3*100}% ${Math.floor(index/4)*100}%` });
  if (crop) {
    const scale = width / crop.width;
    Object.assign(node.style, {
      top:`${y-height}px`,
      backgroundSize:`${1774*scale}px ${887*scale}px`,
      backgroundPosition:`${-crop.x*scale}px ${-crop.y*scale}px`,
    });
  }
  return node;
}

function placeBenchBesidePath(x, y, mask) {
  const candidates = [];
  for (let dy=-80;dy<=80;dy+=4) for (let dx=-80;dx<=80;dx+=4) {
    const px=x+dx,py=y+dy;
    // The full bench footprint and a small walking clearance must stay off the path.
    let clear=true;
    for(let sy=py-14;sy<=py+6&&clear;sy+=4) for(let sx=px-33;sx<=px+33;sx+=4) {
      const col=Math.floor(sx/mask.cellSize),row=Math.floor(sy/mask.cellSize);
      if(col<0||row<0||col>=mask.columns||row>=mask.rows||mask.cells[row*mask.columns+col]) {clear=false;break;}
    }
    if (!clear || CAMPUS_FLOWERBEDS.some(b=>px+29>b.x&&px-29<b.x+b.width&&py>b.y&&py-30<b.y+b.height)) continue;
    if (CAMPUS_BUILDINGS.some(b=>px+29>b.x&&px-29<b.x+b.width&&py>b.y&&py-30<b.y+b.height)) continue;
    candidates.push({x:px,y:py,distance:dx*dx+dy*dy});
  }
  return candidates.sort((a,b)=>a.distance-b.distance)[0];
}

export function campusProps(map, mask) {
  const props = [];
  const occupiedBuilding = (x,y) => CAMPUS_BUILDINGS.some(b=>x>b.x-35&&x<b.x+b.width+35&&y>b.y-15&&y<b.y+b.height+20);
  // Deterministic spacing keeps forest crowns independent and never moves collision paths.
  for(let y=28;y<map.world.height;y+=42) for(let x=22;x<map.world.width;x+=43) {
    const tx=x+((Math.floor(y/42)%2)*19), ty=y+(Math.floor(x/43)%3)*4;
    if(occupiedBuilding(tx,ty)||touchesPath(mask,tx,ty)) continue;
    if(map.collision.paths.some(p=>p.some(([px,py])=>Math.hypot(px-tx,py-ty)<14))) continue;
    // No trees on any part of the paved footprint, including broad plazas.
    const row=Math.floor(ty/mask.cellSize),column=Math.floor(tx/mask.cellSize);
    if(mask.cells[row*mask.columns+column]) continue;
    const centralGarden=tx>600&&tx<1080&&ty>480&&ty<850;
    const rightPlaza=tx>1225&&tx<1575&&ty>190&&ty<855;
    const booths=tx>100&&tx<420&&ty>480&&ty<790;
    if(centralGarden||rightPlaza||booths)continue;
    props.push({kind:(Math.floor(tx/43)+Math.floor(ty/42))%9===0?"autumn":"tree",x:tx,y:ty,width:68,height:82});
  }
  for(const rect of map.collision.obstacles.slice(0,6)) props.push({kind:rect.x>250?"booth-pink":"booth-green",x:rect.x+rect.width/2,y:rect.y+rect.height,width:82,height:82});
  for(const [x,y] of [[679,744],[990,744],[627,601],[1048,600],[613,396],[1050,396]]) {
    const position=placeBenchBesidePath(x,y,mask);
    if(position) props.push({kind:"bench",x:position.x,y:position.y,width:58,height:30});
  }
  for(const [x,y] of [[565,420],[1100,420],[575,840],[1101,840],[1212,705],[1555,705],[100,775],[410,775]]) props.push({kind:"lamp",x,y,width:35,height:62});
  for(const [x,y] of [[704,562],[969,562],[693,808],[985,808]]) props.push({kind:"tree",x,y,width:65,height:80});
  const benches=props.filter(prop=>prop.kind==="bench");
  return props.filter(prop=>!["tree","autumn"].includes(prop.kind)
    || !benches.some(bench=>Math.abs(prop.x-bench.x)<60&&Math.abs(prop.y-bench.y)<55));
}

export async function createCampusLayers({ document, map, mask, signal }) {
  const sourceOnly = new URLSearchParams(globalThis.location?.search??"").has("campusOriginal");
  if(sourceOnly) {
    const image=document.createElement("img");image.className="campus-background";image.src=map.background;image.alt="";await image.decode();return [image];
  }
  const nodes=[createCampusTerrain(document,map)];
  const atlas=new Image();atlas.src="./assets/maps/props/campus-props.png";
  await atlas.decode();
  const beds=new Image();beds.src="./assets/maps/props/flowerbeds.png";
  const cropResponse=await fetch("./data/maps/flowerbeds.json",{signal});
  if(!cropResponse.ok)throw new Error("화단 에셋 정보를 불러오지 못했습니다.");
  const crops=await cropResponse.json();
  await beds.decode();
  for(const building of CAMPUS_BUILDINGS) {
    const node=document.createElement("img");node.className="campus-building";node.src=building.src;node.alt="";
    node.dataset.building=building.id;
    Object.assign(node.style,{left:`${building.x}px`,top:`${building.y}px`,width:`${building.width}px`,height:`${building.height}px`,zIndex:String(building.ground ? 1 : depthAtFoot(building.footY))});
    await node.decode();nodes.push(node);
  }
  if(signal?.aborted)return [];
  nodes.push(...campusProps(map,mask).map(prop=>createCampusProp(document,prop)));
  for(const bed of CAMPUS_FLOWERBEDS) {
    const crop=crops.frames[bed.type],fit=fitFlowerbed(bed,crop);
    const node=document.createElement("div");node.className="campus-flowerbed";node.dataset.bedType=String(bed.type);
    node.setAttribute("aria-hidden","true");
    Object.assign(node.style,{left:`${fit.x}px`,top:`${fit.y}px`,width:`${fit.width}px`,height:`${fit.height}px`,
      backgroundSize:`${crops.width*fit.scale}px ${crops.height*fit.scale}px`,backgroundPosition:`${-crop.x*fit.scale}px ${-crop.y*fit.scale}px`,
      zIndex:String(depthAtFoot(bed.y+bed.height)),transform:bed.mirror?"scaleX(-1)":"none"});
    nodes.push(node);
  }
  return nodes;
}

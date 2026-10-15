const SVG = "http://www.w3.org/2000/svg";
export const CAMPUS_BUILDINGS = Object.freeze([
  { id: "hall", src: "./assets/maps/buildings/hall.png", x: 568, y: 48, width: 535, height: 326, footY: 340 },
  { id: "student-center", src: "./assets/maps/buildings/student-center.png", x: 22, y: 136, width: 448, height: 342, footY: 416 },
  { id: "greenhouse", src: "./assets/maps/buildings/greenhouse.png", x: 711, y: 536, width: 249, height: 177, footY: 700 },
  { id: "ecc", src: "./assets/maps/buildings/ecc.png", x: 1210, y: 78, width: 395, height: 785, footY: 790, ground: true },
]);

export function depthAtFoot(y) { return 1000 + Math.round(y); }

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
  const grass = svgNode(document, "pattern", { id: "campus-grass", width: 32, height: 32, patternUnits: "userSpaceOnUse" });
  grass.append(svgNode(document,"image",{href:"./assets/maps/tiles/grass.svg",width:32,height:32}));
  const paving = svgNode(document,"pattern",{id:"campus-paving",width:32,height:32,patternUnits:"userSpaceOnUse"});
  paving.append(svgNode(document,"image",{href:"./assets/maps/tiles/paving.svg",width:32,height:32}));
  const stairs=svgNode(document,"pattern",{id:"campus-stairs",width:32,height:28,patternUnits:"userSpaceOnUse"});
  stairs.append(svgNode(document,"image",{href:"./assets/maps/tiles/stairs.svg",width:32,height:28}));
  defs.append(grass,paving,stairs);svg.append(defs);
  svg.append(svgNode(document,"rect",{width:map.world.width,height:map.world.height,fill:"url(#campus-grass)"}));
  for (const polygon of map.collision.paths) svg.append(svgNode(document,"polygon",{points:polygon.map(p=>p.join(",")).join(" "),fill:"url(#campus-paving)"}));
  // The sunken ECC plaza is ground geometry, not a fourth building sprite.
  for (const [x,y,w,h] of [[1324,190,151,77],[1360,412,91,108],[1336,782,147,69],[803,850,74,57],[208,802,102,54]]) {
    svg.append(svgNode(document,"rect",{x,y,width:w,height:h,fill:"url(#campus-stairs)"}));
  }
  for(const [x,y,w,h] of [[1310,266,12,414],[1484,266,12,414],[1327,190,9,70],[1473,190,9,70]]) {
    svg.append(svgNode(document,"rect",{x,y,width:w,height:h,fill:"#7f8b89"}));
    svg.append(svgNode(document,"rect",{x:x+2,y,width:3,height:h,fill:"#d4d9cc"}));
  }
  return svg;
}

/** Separate sprites share the same foot-depth rule as local and remote characters. */
export function createCampusProp(document, { kind, x, y, width, height }) {
  const index = { tree:0, autumn:1, hedge:2, flowers:3, "booth-green":4, "booth-pink":5, bench:6, lamp:7 }[kind];
  const node = document.createElement("div");
  node.className = "campus-prop";
  node.dataset.prop = kind;
  node.dataset.footY = String(y);
  node.setAttribute("aria-hidden","true");
  Object.assign(node.style, { left:`${x-width/2}px`,top:`${y-height*.92}px`,width:`${width}px`,height:`${height}px`,zIndex:String(depthAtFoot(y)),
    backgroundPosition:`${(index%4)/3*100}% ${Math.floor(index/4)*100}%` });
  return node;
}

export function campusProps(map, mask) {
  const props = [];
  const occupiedBuilding = (x,y) => CAMPUS_BUILDINGS.some(b=>x>b.x-35&&x<b.x+b.width+35&&y>b.y-15&&y<b.y+b.height+20);
  // Deterministic spacing keeps forest crowns independent and never moves collision paths.
  for(let y=28;y<map.world.height;y+=42) for(let x=22;x<map.world.width;x+=43) {
    const tx=x+((Math.floor(y/42)%2)*19), ty=y+(Math.floor(x/43)%3)*4;
    if(occupiedBuilding(tx,ty)||mask.allows({x:tx-22,y:ty-18,width:44,height:36})) continue;
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
  for(const [x,y] of [[690,566],[979,566],[692,731],[977,731],[707,812],[970,812],[1352,350],[1450,590]]) {
    props.push({kind:"flowers",x,y,width:90,height:56});
    props.push({kind:"hedge",x,y:y+8,width:98,height:40});
  }
  for(const [x,y] of [[679,744],[990,744],[627,601],[1048,600],[613,396],[1050,396]]) props.push({kind:"bench",x,y,width:58,height:40});
  for(const [x,y] of [[565,420],[1100,420],[575,840],[1101,840],[1212,705],[1555,705],[100,775],[410,775]]) props.push({kind:"lamp",x,y,width:35,height:62});
  for(const [x,y] of [[690,530],[982,530],[700,805],[970,805]]) props.push({kind:"tree",x,y,width:65,height:80});
  return props;
}

export async function createCampusLayers({ document, map, mask, signal }) {
  const sourceOnly = new URLSearchParams(globalThis.location?.search??"").has("campusOriginal");
  if(sourceOnly) {
    const image=document.createElement("img");image.className="campus-background";image.src=map.background;image.alt="";await image.decode();return [image];
  }
  const nodes=[createCampusTerrain(document,map)];
  const atlas=new Image();atlas.src="./assets/maps/props/campus-props.png";
  await atlas.decode();
  for(const building of CAMPUS_BUILDINGS) {
    const node=document.createElement("img");node.className="campus-building";node.src=building.src;node.alt="";
    node.dataset.building=building.id;
    Object.assign(node.style,{left:`${building.x}px`,top:`${building.y}px`,width:`${building.width}px`,height:`${building.height}px`,zIndex:String(building.ground ? 1 : depthAtFoot(building.footY))});
    await node.decode();nodes.push(node);
  }
  if(signal?.aborted)return [];
  nodes.push(...campusProps(map,mask).map(prop=>createCampusProp(document,prop)));
  return nodes;
}

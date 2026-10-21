import { depthAtFoot } from "./campus-layers.js";

export async function createTileMapLayers({document,map,signal}) {
  const assets=new Set(map.layout.floors.map(f=>f.asset));
  for(const item of map.layout.items){assets.add(item.asset);if(item.openAsset)assets.add(item.openAsset);}
  await Promise.all([...assets].map(async name=>{
    const image=new Image();image.src=`${map.assetRoot}${name}.svg`;await image.decode();
  }));
  if(signal?.aborted)return [];
  const nodes=[];
  for(const floor of map.layout.floors) {
    const node=document.createElement("div");node.className="campus-tile-floor";
    node.dataset.tile=floor.asset;
    Object.assign(node.style,{left:`${floor.x}px`,top:`${floor.y}px`,width:`${floor.width}px`,height:`${floor.height}px`,
      backgroundImage:`url("${map.assetRoot}${floor.asset}.svg")`,backgroundSize:`${floor.tileWidth}px ${floor.tileHeight}px`});
    nodes.push(node);
  }
  for(const item of map.layout.items) {
    const node=document.createElement(item.repeat?"div":"img");node.className="campus-tile-item";
    node.dataset.kind=item.kind;
    Object.assign(node.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.width}px`,height:`${item.height}px`,zIndex:String(depthAtFoot(item.footY))});
    if(item.repeat)Object.assign(node.style,{backgroundImage:`url("${map.assetRoot}${item.asset}.svg")`,backgroundSize:`${item.tileWidth}px ${item.tileHeight}px`});
    else{node.src=`${map.assetRoot}${item.asset}.svg`;node.alt="";node.draggable=false;}
    if(item.door){node.dataset.doorX=item.center.x;node.dataset.doorY=item.center.y;
      node.dataset.closedSrc=node.src;node.dataset.openSrc=`${map.assetRoot}${item.openAsset}.svg`;}
    node.setAttribute("aria-hidden","true");nodes.push(node);
  }
  return nodes;
}

export function updateTileDoors(root,position) {
  for(const node of root.querySelectorAll("[data-door-x]")) {
    const open=Math.hypot(position.x-Number(node.dataset.doorX),position.y-Number(node.dataset.doorY))<88;
    if(node.dataset.open===String(open))continue;
    node.dataset.open=String(open);node.src=open?node.dataset.openSrc:node.dataset.closedSrc;
  }
}

import { depthAtFoot } from "./campus-layers.js";
import { createAtlasSprite,replaceAtlasFrame } from "./interior-skin.js";

export async function createTileMapLayers({document,map,signal}) {
  const source=name=>map.assets?.[name]??`${map.assetRoot}${name}.svg`;
  let skin=null;
  if(map.skin==="campus") {
    const response=await fetch("./data/maps/interior-skin.json",{signal});
    if(!response.ok)throw new Error("실내 공통 에셋 정보를 불러오지 못했습니다.");
    skin=await response.json();
  }
  const frameFor=item=>skin?.frames[item.asset==="wall"&&item.height>item.width?"wall-v":item.asset];
  const assets=new Set(map.layout.floors.map(f=>f.asset));
  for(const item of map.layout.items){assets.add(item.asset);if(item.openAsset)assets.add(item.openAsset);}
  const sources=new Set([...assets].map(name=>skin?.frames[name]?.src??source(name)));
  if(skin?.frames["wall-v"])sources.add(skin.frames["wall-v"].src);
  await Promise.all([...sources].map(async src=>{
    const image=new Image();image.src=src;await image.decode();
  }));
  if(signal?.aborted)return [];
  const nodes=[];
  let serial=0;
  for(const floor of map.layout.floors) {
    const node=document.createElement("div");node.className="campus-tile-floor";
    node.dataset.tile=floor.asset;
    Object.assign(node.style,{left:`${floor.x}px`,top:`${floor.y}px`,width:`${floor.width}px`,height:`${floor.height}px`,
      backgroundImage:`url("${source(floor.asset)}")`,backgroundSize:`${floor.tileWidth}px ${floor.tileHeight}px`});
    const frame=frameFor(floor);
    if(frame){node.style.backgroundImage="none";node.append(createAtlasSprite(document,frame,{...floor,repeat:!frame.single,id:`${map.id}-tile-${serial++}`}));}
    nodes.push(node);
  }
  for(const item of map.layout.items) {
    const frame=frameFor(item);
    const node=document.createElement(item.repeat||frame?"div":"img");node.className="campus-tile-item";
    node.dataset.kind=item.kind;
    Object.assign(node.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.width}px`,height:`${item.height}px`,zIndex:String(depthAtFoot(item.footY))});
    if(item.flipX)node.style.transform="scaleX(-1)";
    if(item.canopy) {
      node.dataset.canopy="true";node.canopyBounds=item.canopy;
      node.style.opacity=String(item.canopy.opacity);
      node.style.transition="opacity 180ms ease";
    }
    if(frame)node.append(createAtlasSprite(document,frame,{...item,id:`${map.id}-tile-${serial++}`}));
    else if(item.repeat)Object.assign(node.style,{backgroundImage:`url("${source(item.asset)}")`,backgroundSize:`${item.tileWidth}px ${item.tileHeight}px`});
    else{node.src=source(item.asset);node.alt="";node.draggable=false;}
    if(item.door){node.dataset.doorX=item.center.x;node.dataset.doorY=item.center.y;
      if(frame)node.doorFrames={closed:frame,open:skin.frames[item.openAsset]};
      else{node.dataset.closedSrc=node.src;node.dataset.openSrc=source(item.openAsset);}}
    node.setAttribute("aria-hidden","true");nodes.push(node);
  }
  return nodes;
}

export function updateTileDoors(root,position) {
  for(const node of root.querySelectorAll("[data-door-x]")) {
    const open=Math.hypot(position.x-Number(node.dataset.doorX),position.y-Number(node.dataset.doorY))<88;
    if(node.dataset.open===String(open))continue;
    node.dataset.open=String(open);
    if(node.doorFrames)replaceAtlasFrame(node.querySelector("svg"),open?node.doorFrames.open:node.doorFrames.closed);
    else node.src=open?node.dataset.openSrc:node.dataset.closedSrc;
  }
}

export function updateTileCanopies(root,position) {
  for(const node of root.querySelectorAll("[data-canopy]")) {
    const bounds=node.canopyBounds;
    const under=position.x>=bounds.x&&position.x<=bounds.x+bounds.width&&position.y>=bounds.y&&position.y<=bounds.y+bounds.height;
    if(node.dataset.underCanopy===String(under))continue;
    node.dataset.underCanopy=String(under);
    node.style.opacity=String(under?bounds.insideOpacity:bounds.opacity);
  }
}

const NS="http://www.w3.org/2000/svg";
function svg(document,name,attrs={}) {
  const node=document.createElementNS(NS,name);
  for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}

// An atlas supplies independent sprites. Each placement clips only its own frame.
export function createAtlasSprite(document,frame,{repeat=false,width,height,tileWidth,tileHeight,id}) {
  const crop=frame.crop;
  const root=svg(document,"svg",{width:"100%",height:"100%","aria-hidden":"true",preserveAspectRatio:repeat?"none":"xMidYMax meet"});
  const bitmap=svg(document,"image",{href:frame.src,width:frame.width,height:frame.height});
  if(frame.src.includes("/interior/")) {
    // Gently neutralize warm pigments at render time; preserve source sprites,
    // transparency and neutral whites. Outdoor paving/benches keep their colors.
    const defs=svg(document,"defs");
    const filter=svg(document,"filter",{id:`${id}-tone`,x:"0%",y:"0%",width:"100%",height:"100%","color-interpolation-filters":"sRGB"});
    filter.append(svg(document,"feColorMatrix",{type:"matrix",values:"0.98 0 0.02 0 0  -0.015 1 0.015 0 0  0.12 0 0.88 0 0  0 0 0 1 0"}));
    defs.append(filter);root.append(defs);bitmap.setAttribute("filter",`url(#${id}-tone)`);
  }
  if(!repeat) {
    root.setAttribute("viewBox",`${crop.x} ${crop.y} ${crop.width} ${crop.height}`);
    // Letterboxing must never reveal a neighboring atlas cell.
    const defs=svg(document,"defs"),clip=svg(document,"clipPath",{id:`${id}-clip`,clipPathUnits:"userSpaceOnUse"});
    clip.append(svg(document,"rect",{x:crop.x,y:crop.y,width:crop.width,height:crop.height}));defs.append(clip);
    const group=svg(document,"g",{"clip-path":`url(#${id}-clip)`});group.append(bitmap);
    root.append(defs,group);return root;
  }
  root.setAttribute("viewBox",`0 0 ${width} ${height}`);
  const defs=svg(document,"defs");
  const pattern=svg(document,"pattern",{id,width:frame.tileWidth??tileWidth,height:frame.tileHeight??tileHeight,
    patternUnits:"userSpaceOnUse",viewBox:`${crop.x} ${crop.y} ${crop.width} ${crop.height}`,preserveAspectRatio:"none"});
  pattern.append(bitmap);defs.append(pattern);
  root.append(defs,svg(document,"rect",{width,height,fill:`url(#${id})`}));return root;
}

export function replaceAtlasFrame(root,frame) {
  const crop=frame.crop;
  root.setAttribute("viewBox",`${crop.x} ${crop.y} ${crop.width} ${crop.height}`);
  const clip=root.querySelector("clipPath rect");
  for(const [key,value]of Object.entries(crop))clip?.setAttribute(key,String(value));
  const image=root.querySelector("image");
  image.setAttribute("href",frame.src);image.setAttribute("width",frame.width);image.setAttribute("height",frame.height);
}

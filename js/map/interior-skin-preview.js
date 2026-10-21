import {createAtlasSprite} from "./interior-skin.js";

const response=await fetch("/data/maps/interior-skin.json");
const skin=await response.json();
const names={"floor-stone":"기본맵과 같은 보도","floor-wood":"나무 바닥",wall:"석재 벽",glass:"유리벽","door-front":"유리문",desk:"책상",chair:"의자",podium:"교탁",board:"칠판",plant:"화분",flowers:"꽃 화분",bench:"기본맵 벤치","sofa-h":"초록 소파","sofa-v":"옆면 소파","round-table":"원탁","study-table":"공부방 테이블",bookshelf:"책장",counter:"벽면 책상",cushion:"계단 쿠션",rug:"러그",fountain:"분수","pavilion-roof":"정자 지붕","pavilion-column":"정자 기둥",palm:"야자나무","leaf-patch":"관목",stairs:"나무 계단"};
const main=document.querySelector("main");let index=0;
for(const [name,label]of Object.entries(names)){
  const frame={...skin.frames[name],src:new URL(skin.frames[name].src,location.origin+"/").href};
  const figure=document.createElement("figure"),preview=document.createElement("div"),caption=document.createElement("figcaption");
  preview.style.width="210px";preview.style.height="160px";
  preview.append(createAtlasSprite(document,frame,{width:210,height:160,id:`preview-${index++}`}));
  caption.textContent=label;figure.append(preview,caption);main.append(figure);
}

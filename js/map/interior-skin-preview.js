import {createAtlasSprite} from "./interior-skin.js";

const response=await fetch("/data/maps/interior-skin.json");
const skin=await response.json();
const names={"floor-stone":"기본맵과 같은 보도","floor-wood":"나무 바닥",wall:"석재 벽",glass:"유리벽","door-front":"유리문",desk:"책상",chair:"의자",podium:"교탁",board:"칠판",plant:"화분",flowers:"꽃 화분",bench:"기본맵 벤치","sofa-h":"초록 소파","sofa-v":"옆면 소파","round-table":"원탁","study-table":"공부방 테이블",bookshelf:"책장",counter:"벽면 책상",cushion:"계단 쿠션",rug:"러그",fountain:"분수","pavilion-roof":"정자 지붕","pavilion-column":"정자 기둥",palm:"야자나무","leaf-patch":"관목",stairs:"나무 계단"};
const main=document.querySelector("main");let index=0;
Object.assign(names,{"lounge-sofa-h":"낮은 긴 휴식 소파","lounge-sofa-v":"이어지는 휴식 소파","wall-study-desk":"오른쪽 벽 붙임 책상","study-chair":"벽 책상용 의자","security-office":"경비실",elevator:"엘리베이터"});
Object.assign(names,{"cushion-green":"목재 단 초록 좌석","cushion-blue":"목재 단 파랑 좌석","ottoman-blue":"큐브 좌석","chair-back":"뒤쪽 의자","chair-side":"옆쪽 의자","broadleaf":"열대 관엽 식물","planter-tropical":"관엽 화단","planter-flowers":"꽃 화단","planter-fern":"고사리 화단",trellis:"덩굴 격자","potting-bench":"원예 작업대","hanging-basket":"행잉 화분"});
for(const [name,label]of Object.entries(names)){
  const frame={...skin.frames[name],src:new URL(skin.frames[name].src,location.origin+"/").href};
  const figure=document.createElement("figure"),preview=document.createElement("div"),caption=document.createElement("figcaption");
  preview.style.width="210px";preview.style.height="160px";
  preview.append(createAtlasSprite(document,frame,{width:210,height:160,id:`preview-${index++}`}));
  caption.textContent=label;figure.append(preview,caption);main.append(figure);
}

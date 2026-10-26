import { CAMPUS_MAP_IDS } from "../map/map-manager.js";
import { campusLoader, scheduleCampusWarmup } from "../map/campus-loader.js";
import { campusStudentSpriteSources, getCampusStudentSprite } from "../map/student-sprites.js";
import { campusResources } from "../map/resource-cache.js";
import { followCamera } from "../map/camera.js";
import { resolveContinuousMovement } from "../map/collision.js";
import { CharacterView, RemoteCharacterView, VirtualJoystick, createCharacterActorElement } from "../battle/character/index.js";
import { createPlayerAppearance } from "../battle/player-config.js";
import { getPublishedBattles, FINAL_BATTLE_ID } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { getMiniGameStoryDestination } from "./map-scene.js";
import { GameLoop } from "../core/game-loop.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { createElement, createButton, findMiniGame, showToast } from "./scene-utils.js";
import { createCampusLayers } from "../map/campus-layers.js";
import { updateTileDoors, updateTileCanopies } from "../map/tile-map-renderer.js";
import { getGuardianInventory } from "../core/guardian-inventory.js";
import { isFestivalOpen } from "../core/story-progress.js";
import { EIAI_IMAGE_SRC } from "../ui/festival-art.js";

const STORAGE_PREFIX = "ai-change:campus-position:";
const FOOT = { width: 12, height: 8 };
const ACTOR_SIZE = { width: 25.6, height: 38.4 };
let studentPaletteSequence = 0;

export function createCampusScene(context, { mode = "before" } = {}) {
  let loop, joystick, unsubscribeInput, unsubscribeRealtime, unsubscribeProgress, unsubscribeSave, resizeObserver, remoteView;
  let savePosition = () => {};
  let prepared = null, cancelWarmup;
  async function prepare(params, { signal } = {}) {
    const manager = await campusLoader.getManager({ signal });
    const map = manager.get(params?.campusMapId ?? (mode === "before" ? CAMPUS_MAP_IDS.ECC : CAMPUS_MAP_IDS.CAMPUS));
    const mask = manager.mask(map.id,{mode});
    const [layers] = await Promise.all([
      createCampusLayers({ document, map, mask, signal, mode }),
      mode === "before"
        ? Promise.all(campusStudentSpriteSources(map).map(src=>campusResources.image(src,{signal}))) : null,
      campusResources.image("./assets/images/character-hair-colors.png",{signal}),
      mode === "before" && map.interactions.some(point=>point.kind==="final")
        ? campusResources.image(EIAI_IMAGE_SRC,{signal}) : null,
    ]);
    if(signal?.aborted) throw signal.reason ?? new DOMException("Map preparation aborted.","AbortError");
    prepared = { manager, map, mask, layers };
  }
  return {
    prepare,
    async mount(root, _params, { signal } = {}) {
      if(!prepared) await prepare(_params,{signal});
      const { manager, map, mask, layers } = prepared;
      prepared = null;
      // Use the outdoor reference scale indoors too; retain the same foot anchor.
      const actorSize = ACTOR_SIZE;
      const account = context.services.account?.getState?.() ?? {};
      const key = STORAGE_PREFIX + mode + (map.id==="campus"?"":`:${map.id}`);
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(key)); } catch { /* Storage is optional. */ }
      let position = manager.restore(saved,map.id,{mode});
      if(_params?.campusSpawn && mask.allows({x:_params.campusSpawn.x-6,y:_params.campusSpawn.y-8,width:12,height:8})) position={...position,..._params.campusSpawn};
      let direction = "down", moving = false, leaving = false, target = null, engineeringEntered=false, dialogOpen=false;
      let virtual = { x: 0, y: 0 };
      savePosition = () => {
        try { sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* Movement remains usable. */ }
      };
      const page = createElement("section", { className: "campus-scene", dataset: { mode, mapId: map.id } });
      const viewport = createElement("div", {
        className: "campus-viewport",
        attributes: { tabindex: "0", role: "region", "aria-label": "길을 따라 이동하는 캠퍼스", "aria-describedby": "campus-controls" },
      });
      const world = createElement("div", { className: "campus-world" });
      const objective = createElement("p", {
        className: "campus-hud__objective",
        attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
      });
      const eggCount = createElement("span", {
        className: "campus-hud__eggs",
        attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
      });
      const hud = createElement("div", { className: "campus-hud" }, [
        objective,
        createElement("div", { className: "campus-hud__status" }, [
          createElement("span", { className: "campus-hud__location", text: map.label || "캠퍼스", attributes: { "aria-label": `현재 장소: ${map.label || "캠퍼스"}` } }),
          eggCount,
        ]),
      ]);
      world.style.width = `${map.world.width}px`;
      world.style.height = `${map.world.height}px`;
      if (signal?.aborted) return;
      world.append(...layers);
      const actor = createCharacterActorElement({ local: true });
      world.append(actor);
      const characterView = new CharacterView({ element: actor, worldSize: map.world });
      const appearance = createPlayerAppearance(mode === "before" ? "purple" : account.user?.hairColor, mode === "before" ? "" : account.user?.nickname ?? account.user?.name ?? "플레이어");
      const points = map.interactions.filter(point => point.kind==="portal" || (mode === "before"
        ? ["npc", "final"].includes(point.kind) : ["boss", "field", "engineering"].includes(point.kind)));
      const markers = new Map();
      const students = new Map();
      const paletteId = `campus-student-palette-${++studentPaletteSequence}`;
      const svgNode = name => document.createElementNS("http://www.w3.org/2000/svg", name);
      const palette = svgNode("svg"), paletteDefs = svgNode("defs");
      palette.setAttribute("width","0");palette.setAttribute("height","0");palette.setAttribute("aria-hidden","true");
      palette.classList.add("campus-student-palette");palette.append(paletteDefs);
      for (const point of points) {
        if(point.kind==="final") {
          const marker=createElement("button",{className:"campus-eiai",type:"button",dataset:{id:point.id,kind:"final"},
            attributes:{"aria-label":"이아이와 이야기하기"},on:{click:()=>void interact(point)}},[
            createElement("img",{attributes:{src:EIAI_IMAGE_SRC,alt:"",width:"256",height:"256",draggable:"false"}}),
            createElement("span",{text:"이아이"}),
          ]);
          Object.assign(marker.style,{left:`${point.x}px`,top:`${point.y}px`,zIndex:String(1000+Math.round(point.y))});
          world.append(marker);markers.set(point.id,marker);continue;
        }
        if (point.kind === "npc") {
          const npc=context.content.maps.find(m=>m.id===context.config.mainMapId)?.npcs?.find(n=>n.id===point.id);
          const student = createElement("button", {
            className: "campus-student", type: "button", dataset: { npcId: point.id },
            attributes: { "aria-label": `학생 ${point.studentNumber}과 대화하기` },
            on: { click: () => void interact(point) },
          });
          student.style.left = `${point.x-16}px`; student.style.top = `${point.y-48}px`;
          student.style.zIndex = String(1000+Math.round(point.y));
          const figure = createElement("img", {
            className: "campus-student__sprite",
            attributes: { src: getCampusStudentSprite(point.id), alt: "", draggable: "false", "aria-hidden": "true" },
          });
          const filter=svgNode("filter"),alpha=svgNode("feComponentTransfer"),cutoff=svgNode("feFuncA"),flood=svgNode("feFlood"),clip=svgNode("feComposite");
          const filterId=`${paletteId}-${point.id}`;
          filter.setAttribute("id",filterId);filter.setAttribute("color-interpolation-filters","sRGB");
          // A hard alpha cutoff keeps the generated sprite's soft fringe out of the silhouette.
          alpha.setAttribute("in","SourceAlpha");alpha.setAttribute("result","student-alpha");
          cutoff.setAttribute("type","discrete");cutoff.setAttribute("tableValues","0 1");alpha.append(cutoff);
          clip.setAttribute("in2","student-alpha");clip.setAttribute("operator","in");
          filter.append(alpha,flood,clip);paletteDefs.append(filter);
          students.set(point.id,{element:student,guardianEggId:npc?.guardianEggId,
            gameTitle:findMiniGame(context,npc?.miniGameId)?.title ?? "게임",
            talkLabel:`${point.label} · 말 걸기`,resolved:false,actionLabel:"",flood,filterId,number:point.studentNumber});
          student.append(figure);world.append(student);markers.set(point.id,student);
          continue;
        }
        const marker = createElement("div", { className: "campus-marker", dataset: { kind: point.kind, id: point.id } });
        if(point.kind==="portal") {
          marker.setAttribute("aria-hidden","true");
          // Anchor a small pixel arrow above the actual doorway, rather than
          // stretching a cue over the whole stair or door image.
          const bounds=map.layout?.items.find(item=>item.door
            &&Math.hypot(item.center.x-point.x,item.center.y-point.y)<1)??point.highlight;
          const arrow=svgNode("svg"),outline=svgNode("path"),fill=svgNode("path");
          arrow.classList.add("campus-portal-arrow");
          arrow.setAttribute("viewBox","0 0 16 18");arrow.setAttribute("width","16");arrow.setAttribute("height","18");
          arrow.setAttribute("focusable","false");arrow.setAttribute("shape-rendering","crispEdges");
          outline.setAttribute("d","M5 0H11V8H16V11H14V13H12V15H10V17H9V18H7V17H6V15H4V13H2V11H0V8H5Z");
          outline.setAttribute("fill","#392235");
          fill.setAttribute("d","M6 1H10V9H14V10H12V12H10V14H9V16H7V14H6V12H4V10H2V9H6Z");
          fill.setAttribute("fill","#fff5cc");arrow.append(outline,fill);marker.append(arrow);
          Object.assign(marker.style,{left:`${bounds?bounds.x+bounds.width/2:point.x}px`,top:`${bounds?bounds.y-(map.layout?30:5):point.y-12}px`,zIndex:"3000"});
          world.append(marker);markers.set(point.id,marker);
          continue;
        } else marker.append(
          createElement("span", { className: "campus-marker__icon", text: point.kind === "field" ? "X" : "◆", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "campus-marker__label", text: point.label }),
        );
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        world.append(marker);
        markers.set(point.id, marker);
      }
      if(students.size) world.append(palette);
      const refreshProgress=()=>{
          const eggs=getGuardianInventory(context);
          const inventory=new Map(eggs.map(egg=>[egg.id,egg]));
          const acquired=eggs.filter(egg=>egg.acquired).length;
          const countText=`수호알 ${acquired} / ${eggs.length}개`;
          const objectiveText=mode==="after" || isFestivalOpen(context)
            ? "캠퍼스 축제를 즐겨보자!"
            : acquired===eggs.length ? "대강당에 있는 이아이를 찾아가보자!" : "고민에 빠진 벗들을 만나, 각 학과의 수호알을 모아보자!";
          if(eggCount.textContent!==countText) eggCount.textContent=countText;
          if(objective.textContent!==objectiveText) objective.textContent=objectiveText;
          for(const student of students.values()) {
            const {element,guardianEggId,gameTitle,flood,filterId,number}=student;
            const egg=inventory.get(guardianEggId),resolved=egg?.acquired===true;
            student.resolved=resolved;
            student.actionLabel=resolved?`${gameTitle} 다시 하기`:student.talkLabel;
            element.dataset.resolved=String(resolved);
            flood.setAttribute("flood-color",resolved?egg.color:"#1f1f1f");
            element.style.setProperty("--student-silhouette-filter",`url(#${filterId})`);
            element.setAttribute("aria-label",resolved?student.actionLabel:`학생 ${number}과 대화하기`);
          }
      };
      refreshProgress();
      unsubscribeProgress=context.services.account?.subscribe?.(refreshProgress);
      unsubscribeSave=context.services.save?.subscribe?.(refreshProgress,{emitCurrent:false});
      const debug = new URLSearchParams(globalThis.location?.search ?? "").has("campusDebug");
      if (debug) {
        const canvas = document.createElement("canvas");
        canvas.className = "campus-mask-debug";
        canvas.width = map.world.width; canvas.height = map.world.height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#14ff7755";
        for (let y = 0; y < mask.rows; y++) for (let x = 0; x < mask.columns; x++) {
          if (mask.cells[y * mask.columns + x]) ctx.fillRect(x * mask.cellSize, y * mask.cellSize, mask.cellSize, mask.cellSize);
        }
        world.append(canvas);
      }
      const prompt = createButton("", () => void interact(), "primary");
      prompt.className += " campus-prompt";
      prompt.hidden = true;
      const knob = createElement("span", { className: "character-joystick__knob" });
      const joystickElement = createElement("div", { className: "character-joystick campus-joystick", attributes: { "aria-label": "이동 조이스틱" } }, [knob]);
      joystick = new VirtualJoystick({ element: joystickElement, knob, onChange: value => { virtual = value; } });
      viewport.append(world, hud, prompt, joystickElement);
      const controls = createElement("p", { className: "campus-controls", attributes: { id: "campus-controls" }, text: mode === "before"
        ? "방향키 / WASD 또는 조이스틱으로 이동 · 학생을 클릭해 대화 · 가까이서 E / 스페이스바"
        : "방향키 / WASD 또는 조이스틱으로 이동 · 가까이서 E / 스페이스바 / 입장 버튼" });
      page.append(viewport, controls);
      root.append(page);

      async function go(sceneId, params = {}) {
        if (leaving) return;
        leaving = true;
        savePosition();
        loop?.pause();
        const accepted = await context.router.navigate(sceneId, params);
        if (accepted === false && !signal?.aborted) { leaving = false; loop?.resume(); }
      }
      async function interact(point = target) {
        if (!point || leaving || dialogOpen) return;
        if(point.kind==="portal")return go(mode==="before"?"map":"battle",{campusMapId:point.targetMap,campusSpawn:point.spawn});
        if(point.kind==="engineering") {
          dialogOpen=true;
          loop?.pause();
          const dialog=document.createElement("dialog");
          dialog.className="campus-confirm";
          const message=createElement("p",{text:"공대로 올라갈까요?"});
          const detail=createElement("p",{text:"체력 스탯이 1 올라갑니다."});
          dialog.append(message,detail);
          const requestId=crypto.randomUUID();
          let submitting=false;
          const cancel=createButton("취소",()=>dialog.close());
          const accept=createButton("올라가기",async()=>{
            if(submitting)return;
            submitting=true;accept.disabled=true;
            try {
              const result=await context.services.account.claimCampusWalkBonus(requestId);
              message.textContent=result.awarded?"체력 스탯이 1 올랐어요!":result.remainingClaims===0
                ?"... 더 이상 힘들어서 올라갈 수가 없다.":"이미 이번 산책 보상을 받았어요.";
              detail.remove();
              cancel.textContent="확인";accept.remove();cancel.focus();
            } catch(error) {showToast(context,error.message);submitting=false;accept.disabled=false;}
          },"primary");
          dialog.append(createElement("div",{className:"button-row"},[cancel,accept]));
          dialog.addEventListener("close",()=>{dialogOpen=false;dialog.remove();if(!signal?.aborted&&!leaving){loop?.resume();viewport.focus({preventScroll:true});}},{once:true});
          signal?.addEventListener("abort",()=>dialog.remove(),{once:true});
          page.append(dialog);dialog.showModal();return;
        }
        if (point.kind === "npc") {
          const npc = context.content.maps.find(item => item.id === context.config.mainMapId)?.npcs.find(item => item.id === point.id);
          if (npc) {
            if(students.get(point.id)?.resolved) return go("minigame-intro",{miniGameId:npc.miniGameId});
            const destination = getMiniGameStoryDestination(context, npc.miniGameId, { conversation:true });
            return go(destination.sceneId, destination.params);
          }
          return;
        }
        const battleId = point.kind === "final" ? FINAL_BATTLE_ID : point.id;
        const battle = getPublishedBattles(context.content.battles).find(item => item.id === battleId);
        if (!battle) return;
        const unlock = getBattleUnlockStatus(battle, context.services.save?.getState?.() ?? {}, context.services.account.getState());
        if (!unlock.unlocked) {
          showToast(context, "수호알을 모두 모으면 입장할 수 있어요.");
          return;
        }
        if (point.kind === "boss") return go("battle", { legacyWorld: true, openBossId: battleId });
        return go("battle", { battleId });
      }
      const realtime = mode === "after" && account.authenticated ? context.services.postgameRealtime : null;
      const remotes = new RemoteCharacterView({ root: world, worldSize: map.world });
      remoteView = remotes;
      const publish = () => {
        if (realtime?.getState?.().status === "connected") realtime.updatePresence({
          zone: map.presenceZone, x: position.x / map.world.width, y: position.y / map.world.height, direction, moving,
        });
      };
      if (realtime) {
        unsubscribeRealtime = realtime.subscribe(state => {
          remotes.update((state.players ?? []).filter(player => player.id !== state.selfId && player.zone === map.presenceZone && player.connected !== false).map(player => ({
            id: player.id, name: player.name, x: player.x * map.world.width - actorSize.width / 2, y: player.y * map.world.height - actorSize.height,
            ...actorSize, direction: player.direction, moving: player.moving,
            appearance: createPlayerAppearance(player.hairColor, player.name),
          })));
        });
        realtime.connect();
      }
      unsubscribeInput = context.services.input.onAction(event => {
        if (event.phase === "press" && (event.action === INPUT_ACTIONS.INTERACT
          || (event.action === INPUT_ACTIONS.CONFIRM && event.originalEvent?.code === "Space"))) void interact();
      });
      let viewportSize = { width: 1, height: 1 }, publishMs = 0;
      const resize = () => {
        viewportSize = { width: Math.max(1, viewport.clientWidth), height: Math.max(1, viewport.clientHeight) };
        render();
      };
      function render() {
        if(map.layout){updateTileDoors(world,position);updateTileCanopies(world,position);}
        const indoor=map.id!=="campus";
        const requestedZoom=indoor
          ? Math.max(map.camera?.minZoom??1.25,viewportSize.width/(map.camera?.viewWidth??1040),viewportSize.height/(map.camera?.viewHeight??640))
          : Math.max(1.6,viewportSize.width/780,viewportSize.height/480);
        const camera = followCamera({ target: position, world: map.world, viewport: viewportSize,
          zoom: map.camera?.integerScale?Math.ceil(requestedZoom):requestedZoom });
        world.style.transform = `translate(${-Math.round(camera.x * camera.zoom)}px, ${-Math.round(camera.y * camera.zoom)}px) scale(${camera.zoom})`;
        characterView.render({ id: "campus-player", name: appearance.label, appearance, x: position.x - actorSize.width / 2, y: position.y - actorSize.height, footY: position.y,
          ...actorSize, direction, moving, state: moving ? "moving" : "idle", currentHealth: 1, maxHealth: 1 });
      }
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
      resize();
      loop = new GameLoop({ update(deltaMs) {
        if (leaving) return;
        const keyboard = context.services.input.getMovementVector();
        let x = keyboard.x + virtual.x, y = keyboard.y + virtual.y;
        const length = Math.hypot(x, y);
        if (length > 1) { x /= length; y /= length; }
        if (length) direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        const next = resolveContinuousMovement({ position: { x: position.x - 6, y: position.y - 8 }, size: FOOT,
          delta: { x: x * deltaMs * 0.14, y: y * deltaMs * 0.14 }, bounds: { x: 0, y: 0, ...map.world }, walkMask: mask, maxStep: 2 });
        moving = next.x + 6 !== position.x || next.y + 8 !== position.y;
        position = { ...position, x: next.x + 6, y: next.y + 8 };
        target = points.filter(point => Math.hypot(point.x - position.x, point.y - position.y) <= 42)
          .sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y))[0] ?? null;
        for (const [id, marker] of markers) marker.dataset.near = String(id === target?.id);
        if(target?.kind==="engineering"&&!engineeringEntered) {engineeringEntered=true;void interact();}
        if(target?.kind!=="engineering")engineeringEntered=false;
        prompt.hidden = !target;
        prompt.textContent = !target ? "" : target.kind==="portal"
          ? target.targetMap===CAMPUS_MAP_IDS.CAMPUS ? "캠퍼스로 나가기" : target.label
          : target.kind==="npc" ? students.get(target.id)?.actionLabel ?? "학생 · 말 걸기"
          : `${target.label} · 입장하기`;
        publishMs += deltaMs;
        if (publishMs >= 90) { publishMs = 0; publish(); }
      }, render });
      signal?.addEventListener("abort", () => { loop?.stop(); }, { once: true });
      loop.start();
      viewport.focus({ preventScroll: true });
      cancelWarmup = scheduleCampusWarmup({mode,firstMapId:map.id});
    },
    unmount() {
      cancelWarmup?.();
      savePosition();
      loop?.stop(); joystick?.destroy(); resizeObserver?.disconnect(); unsubscribeInput?.(); unsubscribeRealtime?.(); unsubscribeProgress?.(); unsubscribeSave?.(); remoteView?.destroy();
    },
  };
}

import { CampusMapManager, CAMPUS_MAP_IDS } from "../map/map-manager.js";
import { followCamera } from "../map/camera.js";
import { resolveContinuousMovement } from "../map/collision.js";
import { CharacterView, RemoteCharacterView, VirtualJoystick, createCharacterActorElement } from "../battle/character/index.js";
import { createPlayerAppearance } from "../battle/player-config.js";
import { getPublishedBattles, FINAL_BATTLE_ID } from "../battle/registry.js";
import { getBattleUnlockStatus } from "../battle/unlock.js";
import { getMiniGameStoryDestination } from "./map-scene.js";
import { GameLoop } from "../core/game-loop.js";
import { INPUT_ACTIONS } from "../core/input-manager.js";
import { createElement, createButton, showToast } from "./scene-utils.js";
import { createCampusLayers } from "../map/campus-layers.js";
import { updateTileDoors, updateTileCanopies } from "../map/tile-map-renderer.js";
import { getGuardianInventory } from "../core/guardian-inventory.js";

const STORAGE_PREFIX = "ai-change:campus-position:";
const FOOT = { width: 12, height: 8 };
const ACTOR_SIZE = { width: 25.6, height: 38.4 };
let studentPaletteSequence = 0;

export function createCampusScene(context, { mode = "before" } = {}) {
  let loop, joystick, unsubscribeInput, unsubscribeRealtime, unsubscribeStudentProgress, unsubscribeStudentSave, resizeObserver, remoteView;
  let savePosition = () => {};
  return {
    async mount(root, _params, { signal } = {}) {
      const response = await fetch("./data/maps/campus.json", { signal });
      if (!response.ok) throw new Error("캠퍼스 지도를 불러오지 못했습니다.");
      const manager = new CampusMapManager(await response.json());
      const map = manager.get(_params?.campusMapId ?? (mode === "before" ? CAMPUS_MAP_IDS.ECC : CAMPUS_MAP_IDS.CAMPUS));
      // Use the outdoor reference scale indoors too; retain the same foot anchor.
      const actorSize = ACTOR_SIZE;
      const mask = manager.mask(map.id,{mode});
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
      world.style.width = `${map.world.width}px`;
      world.style.height = `${map.world.height}px`;
      const layers = await createCampusLayers({ document, map, mask, signal, mode });
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
        if (point.kind === "npc") {
          const npc=context.content.maps.find(m=>m.id===context.config.mainMapId)?.npcs?.find(n=>n.id===point.id);
          const student = createElement("button", {
            className: "campus-student", type: "button", dataset: { npcId: point.id },
            attributes: { "aria-label": `학생 ${point.studentNumber}과 대화하기` },
            on: { click: () => void interact(point) },
          });
          student.style.left = `${point.x-16}px`; student.style.top = `${point.y-48}px`;
          student.style.zIndex = String(1000+Math.round(point.y));
          const figure = createCharacterActorElement({ local: true });
          new CharacterView({ element: figure, worldSize: { width:32, height:48 } }).render({
            appearance:createPlayerAppearance("purple",""),x:3.2,y:9.6,...actorSize,
            footY:48,direction:"down",state:"idle",currentHealth:1,maxHealth:1,
          });
          figure.classList.remove("character-actor--local");
          figure.removeAttribute("role");figure.removeAttribute("aria-label");figure.setAttribute("aria-hidden","true");
          const filter=svgNode("filter"),flood=svgNode("feFlood"),clip=svgNode("feComposite");
          const filterId=`${paletteId}-${point.id}`;
          filter.setAttribute("id",filterId);filter.setAttribute("color-interpolation-filters","sRGB");
          clip.setAttribute("in2","SourceAlpha");clip.setAttribute("operator","in");
          filter.append(flood,clip);paletteDefs.append(filter);
          students.set(point.id,{element:student,guardianEggId:npc?.guardianEggId,flood,filterId,number:point.studentNumber});
          student.append(figure);world.append(student);markers.set(point.id,student);
          continue;
        }
        const marker = createElement("div", { className: "campus-marker", dataset: { kind: point.kind, id: point.id } }, [
          createElement("span", { className: "campus-marker__icon", text: point.kind === "npc" ? "!" : point.kind === "field" ? "X" : "◆", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "campus-marker__label", text: point.label }),
        ]);
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        world.append(marker);
        markers.set(point.id, marker);
      }
      if(students.size) {
        world.append(palette);
        const refreshStudents=()=>{
          const inventory=new Map(getGuardianInventory(context).map(egg=>[egg.id,egg]));
          for(const {element,guardianEggId,flood,filterId,number}of students.values()) {
            const egg=inventory.get(guardianEggId),resolved=egg?.acquired===true;
            element.dataset.resolved=String(resolved);
            if(resolved) {
              flood.setAttribute("flood-color",egg.color);
              element.style.setProperty("--student-silhouette-filter",`url(#${filterId})`);
            } else element.style.removeProperty("--student-silhouette-filter");
            element.setAttribute("aria-label",resolved?`${egg.departmentName} 학생과 대화하기 · 해결 완료`:`학생 ${number}과 대화하기`);
          }
        };
        refreshStudents();
        unsubscribeStudentProgress=context.services.account?.subscribe?.(refreshStudents);
        unsubscribeStudentSave=context.services.save?.subscribe?.(refreshStudents,{emitCurrent:false});
      }
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
      viewport.append(world, prompt, joystickElement);
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
        prompt.textContent = target ? `${target.label} · ${target.kind === "npc" ? "말 걸기" : "입장하기"}` : "";
        publishMs += deltaMs;
        if (publishMs >= 90) { publishMs = 0; publish(); }
      }, render });
      signal?.addEventListener("abort", () => { loop?.stop(); }, { once: true });
      loop.start();
      viewport.focus({ preventScroll: true });
    },
    unmount() {
      savePosition();
      loop?.stop(); joystick?.destroy(); resizeObserver?.disconnect(); unsubscribeInput?.(); unsubscribeRealtime?.(); unsubscribeStudentProgress?.(); unsubscribeStudentSave?.(); remoteView?.destroy();
    },
  };
}

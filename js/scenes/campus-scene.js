import { CampusMapManager } from "../map/map-manager.js";
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

const STORAGE_PREFIX = "ai-change:campus-position:";
const FOOT = { width: 12, height: 8 };
const ACTOR_SIZE = { width: 25.6, height: 38.4 };

export function createCampusScene(context, { mode = "before" } = {}) {
  let loop, joystick, unsubscribeInput, unsubscribeRealtime, resizeObserver, remoteView;
  let savePosition = () => {};
  return {
    async mount(root, _params, { signal } = {}) {
      const response = await fetch("./data/maps/campus.json", { signal });
      if (!response.ok) throw new Error("캠퍼스 지도를 불러오지 못했습니다.");
      const manager = new CampusMapManager(await response.json());
      const map = manager.get(_params?.campusMapId ?? "campus");
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
      const header = createElement("header", { className: "campus-toolbar" }, [
        createElement("strong", { text: map.label ?? (mode === "before" ? "수호알을 찾아서" : "캠퍼스 축제") }),
        createElement("div", { className: "button-row" }, [
          createButton(map.id==="campus"?(mode === "before" ? "사후게임" : "사전게임"):"캠퍼스로", () => map.id==="campus"?go(mode === "before" ? "battle" : "map"):go(mode==="before"?"map":"battle",{campusMapId:"campus",campusSpawn:map.outdoorReturn})),
          createButton("돌아가기", () => go("main-menu")),
        ]),
      ]);
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
      for (const point of points) {
        const marker = createElement("div", { className: "campus-marker", dataset: { kind: point.kind, id: point.id } }, [
          createElement("span", { className: "campus-marker__icon", text: point.kind === "npc" ? "!" : point.kind === "field" ? "X" : "◆", attributes: { "aria-hidden": "true" } }),
          createElement("span", { className: "campus-marker__label", text: point.label }),
        ]);
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        world.append(marker);
        markers.set(point.id, marker);
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
      const controls = createElement("p", { className: "campus-controls", attributes: { id: "campus-controls" }, text: "방향키 / WASD 또는 조이스틱으로 이동 · 가까이서 E키 / 입장 버튼" });
      page.append(header, viewport, controls);
      root.append(page);

      async function go(sceneId, params = {}) {
        if (leaving) return;
        leaving = true;
        savePosition();
        loop?.pause();
        const accepted = await context.router.navigate(sceneId, params);
        if (accepted === false && !signal?.aborted) { leaving = false; loop?.resume(); }
      }
      async function interact() {
        if (!target || leaving || dialogOpen) return;
        if(target.kind==="portal")return go(mode==="before"?"map":"battle",{campusMapId:target.targetMap,campusSpawn:target.spawn});
        if(target.kind==="engineering") {
          dialogOpen=true;
          loop?.pause();
          const dialog=document.createElement("dialog");
          dialog.className="campus-confirm";
          dialog.append(createElement("p",{text:"공대로 올라가시겠습니까? 체력이 조금 좋아집니다."}));
          let submitting=false;
          const cancel=createButton("취소",()=>dialog.close());
          const accept=createButton("올라가기",async()=>{
            if(submitting)return;
            submitting=true;accept.disabled=true;
            try {
              const result=await context.services.account.claimCampusWalkBonus();
              showToast(context,result.awarded?"체력 스탯이 0.1 올랐어요!":"이미 공대 산책 보너스를 받았어요.");
              dialog.close();
            } catch(error) {showToast(context,error.message);submitting=false;accept.disabled=false;}
          },"primary");
          dialog.append(createElement("div",{className:"button-row"},[cancel,accept]));
          dialog.addEventListener("close",()=>{dialogOpen=false;dialog.remove();if(!signal?.aborted&&!leaving)loop?.resume();},{once:true});
          signal?.addEventListener("abort",()=>dialog.remove(),{once:true});
          page.append(dialog);dialog.showModal();return;
        }
        if (target.kind === "npc") {
          const npc = context.content.maps.find(item => item.id === context.config.mainMapId)?.npcs.find(item => item.id === target.id);
          if (npc) {
            const destination = getMiniGameStoryDestination(context, npc.miniGameId);
            return go(destination.sceneId, destination.params);
          }
          return;
        }
        const battleId = target.kind === "final" ? FINAL_BATTLE_ID : target.id;
        const battle = getPublishedBattles(context.content.battles).find(item => item.id === battleId);
        if (!battle) return;
        const unlock = getBattleUnlockStatus(battle, context.services.save?.getState?.() ?? {}, context.services.account.getState());
        if (!unlock.unlocked) {
          showToast(context, "수호알을 모두 모으면 입장할 수 있어요.");
          return;
        }
        if (target.kind === "boss") return go("battle", { legacyWorld: true, openBossId: battleId });
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
            id: player.id, name: player.name, x: player.x * map.world.width - ACTOR_SIZE.width / 2, y: player.y * map.world.height - ACTOR_SIZE.height,
            ...ACTOR_SIZE, direction: player.direction, moving: player.moving,
            appearance: createPlayerAppearance(player.hairColor, player.name),
          })));
        });
        realtime.connect();
      }
      unsubscribeInput = context.services.input.onAction(event => {
        if (event.phase === "press" && event.action === INPUT_ACTIONS.INTERACT) void interact();
      });
      let viewportSize = { width: 1, height: 1 }, publishMs = 0;
      const resize = () => {
        viewportSize = { width: Math.max(1, viewport.clientWidth), height: Math.max(1, viewport.clientHeight) };
        render();
      };
      function render() {
        const indoor=map.id!=="campus";
        const requestedZoom=indoor
          ? Math.max(map.camera?.minZoom??1.25,viewportSize.width/(map.camera?.viewWidth??1040),viewportSize.height/(map.camera?.viewHeight??640))
          : Math.max(1.6,viewportSize.width/780,viewportSize.height/480);
        const camera = followCamera({ target: position, world: map.world, viewport: viewportSize,
          zoom: map.camera?.integerScale?Math.ceil(requestedZoom):requestedZoom });
        world.style.transform = `translate(${-Math.round(camera.x * camera.zoom)}px, ${-Math.round(camera.y * camera.zoom)}px) scale(${camera.zoom})`;
        characterView.render({ id: "campus-player", name: appearance.label, appearance, x: position.x - ACTOR_SIZE.width / 2, y: position.y - ACTOR_SIZE.height, footY: position.y,
          ...ACTOR_SIZE, direction, moving, state: moving ? "moving" : "idle", currentHealth: 1, maxHealth: 1 });
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
      loop?.stop(); joystick?.destroy(); resizeObserver?.disconnect(); unsubscribeInput?.(); unsubscribeRealtime?.(); remoteView?.destroy();
    },
  };
}

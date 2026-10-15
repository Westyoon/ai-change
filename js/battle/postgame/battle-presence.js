import { RemoteCharacterView } from "../character/index.js";
import { createPlayerAppearance } from "../player-config.js";

const clamp = value => Math.max(0, Math.min(1, value));

/** Room-scoped visual presence; it never changes combat or answer authority. */
export function bindBattlePresence({ realtime, roomId, battleId, getRuntime, getRoster,
  createView = options => new RemoteCharacterView(options),
  setInterval: schedule = globalThis.setInterval, clearInterval: cancel = globalThis.clearInterval,
} = {}) {
  const zone = `battle:${battleId}`;
  let view = null, target = null, destroyed = false;
  function update(state = realtime.getState()) {
    if (destroyed) return;
    const runtime = getRuntime();
    if (!runtime?.root || !runtime.snapshot) return;
    const { width, height } = runtime.worldSize;
    const local = runtime.snapshot;
    if (target !== runtime.root) {
      view?.destroy(); target = runtime.root;
      view = createView({ root: target, worldSize: runtime.worldSize });
    }
    const roster = getRoster() ?? [];
    const members = roster.filter(member => member.id !== state.selfId && member.connected !== false)
      .map(member => {
        const live = (state.players ?? []).find(player => player.id === member.id && player.zone === zone);
        return { ...member, ...live, ...(live ? {} : member.presence ?? { x: .5, y: .8, direction: "down", moving: false }) };
      });
    view.update(members.map(player => ({
      id: player.id,
      x: Math.max(0, Math.min(width - local.width, player.x * width - local.width / 2)),
      y: Math.max(0, Math.min(height - local.height, player.y * height - local.height / 2)),
      width: local.width, height: local.height,
      direction: player.direction, moving: player.moving,
      currentHealth: player.hp, maxHealth: player.maxHp,
      state: player.hp === 0 ? "dead" : player.moving ? "moving" : "idle",
      appearance: createPlayerAppearance(player.hairColor, player.name),
    })));
    for (const actor of target.querySelectorAll?.(".character-actor--remote") ?? []) {
      const member = members.find(player => player.id === actor.dataset.characterId);
      const name = actor.querySelector?.(".character-actor__name");
      if (name && Number.isFinite(member?.hp) && member.maxHp > 0) {
        name.textContent = `${member.name} · ${Math.ceil(member.hp)} / ${member.maxHp}`;
      }
      if (battleId === "data-sphinx") {
        actor.style.setProperty("--sphinx-sprite-height", `${height * 0.1 / local.height * 100}%`);
      }
    }
  }
  function publish() {
    if (destroyed) return;
    const state = realtime.getState();
    if (state.battle?.roomId !== roomId || state.battle.status !== "running") return;
    const runtime = getRuntime();
    const player = runtime?.snapshot;
    if (!player || !runtime.worldSize) return;
    realtime.updatePresence({ zone,
      x: clamp((player.x + player.width / 2) / runtime.worldSize.width),
      y: clamp((player.y + player.height / 2) / runtime.worldSize.height),
      direction: player.direction, moving: player.moving === true && !player.controlLocked,
    });
    update(state);
  }
  const unsubscribe = realtime.subscribe(update);
  const timer = schedule(publish, 90);
  timer?.unref?.();
  publish();
  return { destroy() {
    if (destroyed) return;
    destroyed = true; cancel(timer); unsubscribe?.(); view?.destroy();
  } };
}

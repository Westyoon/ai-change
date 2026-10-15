import { formatBossValue } from './combat-display.js';

// Local successful hits only: never infer attacks from replicated HP snapshots.
export function createDamageNumbers(anchor, documentRef = anchor.ownerDocument ?? globalThis.document) {
  const active = new Map();
  let sequence = 0;
  let destroyed = false;
  const remove = (node) => {
    clearTimeout(active.get(node));
    active.delete(node);
    node.remove();
  };
  return {
    show(amount) {
      if (destroyed || !Number.isFinite(amount) || amount <= 0) return false;
      if (active.size >= 4) remove(active.keys().next().value);
      const node = documentRef.createElement('span');
      node.className = 'boss-damage-number';
      node.textContent = formatBossValue(amount);
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('--damage-offset', `${[0, -20, 20][sequence++ % 3]}px`);
      anchor.append(node);
      const timer = setTimeout(() => remove(node), 850);
      timer?.unref?.();
      active.set(node, timer);
      return true;
    },
    destroy() {
      destroyed = true;
      for (const node of active.keys()) remove(node);
    },
  };
}

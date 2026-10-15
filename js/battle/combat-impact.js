/** Short, cancellable feedback on the screen the player sees. */
export function createCombatImpact(root) {
  let animation = null;
  let health = null;
  const pulse = (hurt = false) => {
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    animation?.cancel?.();
    const target = root.closest?.("#app") ?? root.closest?.(".battle-frame") ?? root;
    const amount = hurt ? 5 : 3;
    animation = target.animate?.([
      { translate: "0px 0px" },
      { translate: `${-amount}px ${amount / 2}px` },
      { translate: `${amount}px ${-amount / 2}px` },
      { translate: `${-amount / 2}px 1px` },
      { translate: "0px 0px" },
    ], { duration: hurt ? 180 : 120, easing: "ease-out" });
    try { globalThis.navigator?.vibrate?.(hurt ? 35 : 15); } catch { /* Optional device feedback. */ }
  };
  return {
    pulse,
    player(snapshot) {
      const next = snapshot?.currentHealth;
      if (!Number.isFinite(next)) return;
      if (health !== null && next < health) pulse(true);
      health = next;
    },
    destroy() { animation?.cancel?.(); animation = null; health = null; },
  };
}

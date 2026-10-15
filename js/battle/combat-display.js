// Round for presentation only. Display the original simulation/DB units;
// never send the rounded text back to the server.

export function formatCombatValue(value) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  return String(Number(safeValue.toFixed(1)));
}

export function formatCombatHealth(current, maximum) {
  return `${formatCombatValue(current)} / ${formatCombatValue(maximum)}`;
}

// Keep a living boss visibly above zero without rounding simulation state.
export function formatBossValue(value) {
  const numeric = Number(value);
  return String(Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric)) : 0);
}

export function formatBossHealth(current, maximum) {
  return `${formatBossValue(current)} / ${formatBossValue(maximum)}`;
}

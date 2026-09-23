export function getQuickCashAmounts(total: number): number[] {
  const safeTotal = Math.max(0, Math.ceil(Number(total) || 0));
  if (safeTotal === 0) return [];

  const candidates = new Set<number>();
  const steps = [5000, 10000, 20000, 50000, 100000, 200000, 500000];

  for (const step of steps) {
    const rounded = Math.ceil(safeTotal / step) * step;
    if (rounded >= safeTotal) candidates.add(rounded);
  }

  // Prefer useful cashier denominations and keep only three distinct choices.
  return [...candidates]
    .filter((amount) => amount >= safeTotal)
    .sort((a, b) => a - b)
    .slice(0, 3);
}

export function resolveCashPayment(total: number, enteredAmount: number): {
  paid: number;
  change: number;
} {
  const safeTotal = Math.max(0, Number(total) || 0);
  const entered = Math.max(0, Number(enteredAmount) || 0);
  const paid = entered > 0 ? entered : safeTotal;

  return {
    paid,
    change: Math.max(0, paid - safeTotal),
  };
}

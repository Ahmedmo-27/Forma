/** Marketing helpers for plan duration SKUs (cycle unit + intervalCount). */

export function normalizeIntervalCount(intervalCount) {
  const n = Number(intervalCount);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function formatDurationLabel(cycle, intervalCount = 1) {
  const count = normalizeIntervalCount(intervalCount);
  if (cycle === "lifetime") return "Lifetime";
  if (cycle === "yearly") return count === 1 ? "1 year" : `${count} years`;
  return count === 1 ? "1 month" : `${count} months`;
}

export function durationKey(cycle, intervalCount = 1) {
  return `${cycle}:${normalizeIntervalCount(intervalCount)}`;
}

export function periodMonths(cycle, intervalCount = 1) {
  const count = normalizeIntervalCount(intervalCount);
  if (cycle === "lifetime") return null;
  if (cycle === "yearly") return count * 12;
  return count;
}

/**
 * Unique duration options from public prices, sorted by total months ascending.
 * Returns [{ id, cycle, intervalCount, label, months }]
 */
export function buildDurationOptions(prices = []) {
  const map = new Map();
  for (const p of prices) {
    if (!p?.cycle || p.cycle === "lifetime") continue;
    const intervalCount = normalizeIntervalCount(p.intervalCount);
    const id = durationKey(p.cycle, intervalCount);
    if (map.has(id)) continue;
    map.set(id, {
      id,
      cycle: p.cycle,
      intervalCount,
      label: formatDurationLabel(p.cycle, intervalCount),
      months: periodMonths(p.cycle, intervalCount),
    });
  }
  return Array.from(map.values()).sort((a, b) => a.months - b.months);
}

/**
 * Savings % vs equivalent 1-month price × months for a selected duration.
 */
export function durationSavingsPercent(prices, planKey, cycle, intervalCount) {
  const months = periodMonths(cycle, intervalCount);
  if (!months || months <= 1) return null;

  const monthly = prices.find(
    (p) =>
      p.planKey === planKey &&
      p.cycle === "monthly" &&
      normalizeIntervalCount(p.intervalCount) === 1 &&
      !p.isSoldOut
  );
  const selected = prices.find(
    (p) =>
      p.planKey === planKey &&
      p.cycle === cycle &&
      normalizeIntervalCount(p.intervalCount) === normalizeIntervalCount(intervalCount) &&
      !p.isSoldOut
  );
  if (!monthly?.amount || !selected?.amount) return null;
  const full = monthly.amount * months;
  if (full <= selected.amount) return null;
  return Math.round((1 - selected.amount / full) * 100);
}

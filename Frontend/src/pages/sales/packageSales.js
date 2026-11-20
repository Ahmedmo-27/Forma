const identity = (text) => text;

/** `t` is optional so display callers can translate the fallback label; logic keeps the English default. */
export function packageLabel(pkg, t = identity) {
  if (!pkg?.name) return t('Unknown package');
  return pkg.duration ? `${pkg.name} · ${pkg.duration}` : pkg.name;
}

export function entryPackageKey(entry) {
  const pkg = entry.subscription?.package;
  if (pkg?._id) return String(pkg._id);
  const name = pkg?.name || entry.subscription?.packageSnapshot?.name || 'Unknown package';
  const duration = pkg?.duration || entry.subscription?.packageSnapshot?.duration || '';
  return `name:${name}|${duration}`;
}

export function subscriptionNet(sub) {
  if (sub?.netPaid != null && sub.netPaid !== '') return Math.max(0, Number(sub.netPaid) || 0);
  const paid = Number(sub?.pricePaid) || 0;
  const refund = Math.max(0, Number(sub?.refundAmount) || 0);
  return Math.max(0, paid - refund);
}

export function summarizePackages(entries, t = identity) {
  const map = new Map();
  for (const entry of entries) {
    const key = entryPackageKey(entry);
    const pkg = entry.subscription?.package;
    const current = map.get(key) || {
      key,
      label: packageLabel(pkg?.name ? pkg : entry.subscription?.packageSnapshot, t),
      activityType: pkg?.activityType || entry.subscription?.packageSnapshot?.activityType || '',
      count: 0,
      revenue: 0,
    };
    current.count += 1;
    current.revenue += subscriptionNet(entry.subscription);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.label.localeCompare(b.label));
}

export function buildPackageOptions(packages, packageStats, packageId, t = identity) {
  const seen = new Set();
  const options = [];
  for (const pkg of packages) {
    const key = String(pkg._id);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ key, label: packageLabel(pkg, t) });
  }
  for (const stat of packageStats) {
    if (seen.has(stat.key)) continue;
    seen.add(stat.key);
    options.push({ key: stat.key, label: stat.label });
  }
  if (packageId && !seen.has(packageId)) {
    const fallback = packageId.startsWith('name:')
      ? packageId.slice(5).replace('|', ' · ')
      : t('Selected package');
    options.push({ key: packageId, label: fallback });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

export function filterByPackage(entries, packageId) {
  if (!packageId) return entries;
  return entries.filter((entry) => entryPackageKey(entry) === packageId);
}

export function sharePercent(revenue, total) {
  return total > 0 ? Math.round((revenue / total) * 100) : 0;
}

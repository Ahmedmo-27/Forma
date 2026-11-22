/**
 * Build GET /members query params for member report pages so every filter
 * is sent to the API (AND semantics via buildMemberListFilter).
 */

function omitEmpty(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function buildGuestReportApiParams({
  salesMan,
  fromDate,
  toDate,
  trainerName,
  source,
}) {
  return omitEmpty({
    status: 'guest',
    limit: 2000,
    page: 1,
    dateFrom: fromDate,
    dateTo: toDate,
    dateField: 'createdAt',
    assignedSales: salesMan && salesMan !== 'All' ? salesMan : undefined,
    currentCouch: trainerName && trainerName !== 'All' ? trainerName : undefined,
    source: source && source !== 'All' ? source : undefined,
  });
}

export function buildExpiredReportApiParams({
  status,
  fromDate,
  toDate,
  salesMan,
  trainerName,
  packageId,
  gender,
}) {
  const statusParam = !status || status === 'All' ? 'expired' : status;
  return omitEmpty({
    status: statusParam,
    limit: 2000,
    page: 1,
    dateFrom: fromDate,
    dateTo: toDate,
    dateField: 'endDate',
    assignedSales: salesMan && salesMan !== 'All' ? salesMan : undefined,
    currentCouch: trainerName && trainerName !== 'All' ? trainerName : undefined,
    packageId: packageId && packageId !== 'All' ? packageId : undefined,
    gender: gender && gender !== 'All' ? gender : undefined,
  });
}

export function latestSubscriptionForReport(member) {
  const subs = member?.subscriptions ?? [];
  if (!subs.length) return null;
  return [...subs].sort(
    (a, b) => new Date(b.endDate || b.createdAt || 0) - new Date(a.endDate || a.createdAt || 0),
  )[0];
}

/** Filters not modeled on the API (activity type, membership category). */
export function applyExpiredReportExtraFilters(members, { type, categories } = {}) {
  const typeVal = type && type !== 'All' ? String(type).toLowerCase() : null;
  const categoryVal = categories && categories !== 'All' ? categories : null;

  if (!typeVal && !categoryVal) return members;

  return members.filter((m) => {
    const lastSub = latestSubscriptionForReport(m);

    if (typeVal) {
      const snap = lastSub?.packageSnapshot ?? lastSub?.package;
      if (String(snap?.activityType ?? '').toLowerCase() !== typeVal) return false;
    }

    if (categoryVal === 'PT') {
      if ((Number(m.PT_sessions) || 0) <= 0) return false;
    } else if (categoryVal === 'Primary Membership') {
      if (!lastSub?.package && !lastSub?.packageSnapshot) return false;
    }

    return true;
  });
}
/**
 * Build GET /members query params for member report pages so every filter
 * is sent to the API (AND semantics via buildMemberListFilter).
 *
 * Reports page through the normal list limit (not the silent 2000 cap) so
 * every matching guest/member is returned under stacked filters.
 */

export const REPORT_PAGE_SIZE = 500;
export const REPORT_MAX_PAGES = 100;

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
  page = 1,
  limit = REPORT_PAGE_SIZE,
}) {
  return omitEmpty({
    status: 'guest',
    limit,
    page,
    dateFrom: fromDate,
    dateTo: toDate,
    dateField: 'createdAt',
    assignedSales: salesMan && salesMan !== 'All' ? salesMan : undefined,
    currentCouch: trainerName && trainerName !== 'All' ? trainerName : undefined,
    source: source && source !== 'All' ? source : undefined,
    sortBy: 'createdAt',
    sortDir: -1,
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
  page = 1,
  limit = REPORT_PAGE_SIZE,
}) {
  const statusParam = !status || status === 'All' ? 'expired' : status;
  return omitEmpty({
    status: statusParam,
    limit,
    page,
    dateFrom: fromDate,
    dateTo: toDate,
    dateField: 'endDate',
    assignedSales: salesMan && salesMan !== 'All' ? salesMan : undefined,
    currentCouch: trainerName && trainerName !== 'All' ? trainerName : undefined,
    packageId: packageId && packageId !== 'All' ? packageId : undefined,
    gender: gender && gender !== 'All' ? gender : undefined,
    sortBy: 'createdAt',
    sortDir: -1,
  });
}

/**
 * Shared params for any member/guest find UI (tasks, imported, etc.).
 * Keeps AND filters on the server so client-side passes are not working
 * from a silently truncated page.
 */
export function buildMemberFindApiParams({
  status,
  search,
  assignedSales,
  currentCouch,
  dateFrom,
  dateTo,
  dateField,
  packageId,
  gender,
  transferType,
  source,
  page = 1,
  limit = REPORT_PAGE_SIZE,
  sortBy = 'createdAt',
  sortDir = -1,
} = {}) {
  const normalizedStatus = !status || status === 'all' || status === 'All' ? undefined : status;
  return omitEmpty({
    status: normalizedStatus,
    search: search || undefined,
    assignedSales: assignedSales && assignedSales !== 'all' && assignedSales !== 'All' ? assignedSales : undefined,
    currentCouch: currentCouch && currentCouch !== 'all' && currentCouch !== 'All' ? currentCouch : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    dateField: dateField || undefined,
    packageId: packageId && packageId !== 'all' && packageId !== 'All' ? packageId : undefined,
    gender: gender && gender !== 'all' && gender !== 'All' ? gender : undefined,
    transferType: transferType && transferType !== 'all' && transferType !== 'All' ? transferType : undefined,
    source: source && source !== 'all' && source !== 'All' ? source : undefined,
    page,
    limit,
    sortBy,
    sortDir,
  });
}

/**
 * Walk every server page until exhausted so multi-filter reports are complete.
 */
export async function fetchAllMembersByParams(getPage, baseParams, {
  pageSize = REPORT_PAGE_SIZE,
  maxPages = REPORT_MAX_PAGES,
} = {}) {
  const members = [];
  let page = 1;
  let totalPages;

  do {
    const res = await getPage({ ...baseParams, page, limit: pageSize });
    const batch = res?.data?.members ?? res?.members ?? [];
    members.push(...batch);
    totalPages = res?.data?.pagination?.totalPages
      ?? res?.pagination?.totalPages
      ?? 1;
    const hasNext = res?.data?.pagination?.hasNextPage
      ?? res?.pagination?.hasNextPage
      ?? (page < totalPages);
    page += 1;
    if (!hasNext || !batch.length) break;
  } while (page <= totalPages && page <= maxPages);

  return members;
}

/** Last array subscription — same row the report table and expiry job use. */
export function latestSubscriptionForReport(member) {
  const subs = member?.subscriptions ?? [];
  if (!subs.length) return null;
  return subs[subs.length - 1];
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

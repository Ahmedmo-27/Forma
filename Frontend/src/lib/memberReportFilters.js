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

function isAllSentinel(value) {
  if (value == null || value === '') return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'all';
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
    assignedSales: !isAllSentinel(salesMan) ? salesMan : undefined,
    currentCouch: !isAllSentinel(trainerName) ? trainerName : undefined,
    source: !isAllSentinel(source) ? source : undefined,
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
  type,
  page = 1,
  limit = REPORT_PAGE_SIZE,
}) {
  // Status "All" means no status constraint — do not silently force "expired".
  const statusParam = isAllSentinel(status) ? undefined : status;
  return omitEmpty({
    status: statusParam,
    limit,
    page,
    dateFrom: fromDate,
    dateTo: toDate,
    dateField: 'endDate',
    assignedSales: !isAllSentinel(salesMan) ? salesMan : undefined,
    currentCouch: !isAllSentinel(trainerName) ? trainerName : undefined,
    packageId: !isAllSentinel(packageId) ? packageId : undefined,
    gender: !isAllSentinel(gender) ? gender : undefined,
    activityType: !isAllSentinel(type) ? String(type).toLowerCase() : undefined,
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
  activityType,
  page = 1,
  limit = REPORT_PAGE_SIZE,
  sortBy = 'createdAt',
  sortDir = -1,
} = {}) {
  const normalizedStatus = isAllSentinel(status) ? undefined : status;
  return omitEmpty({
    status: normalizedStatus,
    search: search || undefined,
    assignedSales: !isAllSentinel(assignedSales) ? assignedSales : undefined,
    currentCouch: !isAllSentinel(currentCouch) ? currentCouch : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    dateField: dateField || undefined,
    packageId: !isAllSentinel(packageId) ? packageId : undefined,
    gender: !isAllSentinel(gender) ? gender : undefined,
    transferType: !isAllSentinel(transferType) ? transferType : undefined,
    source: !isAllSentinel(source) ? source : undefined,
    activityType: !isAllSentinel(activityType) ? String(activityType).toLowerCase() : undefined,
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

/** Same activity resolution the backend uses (snapshot → populated package → gym). */
export function subscriptionActivityTypeForReport(sub) {
  if (!sub) return 'gym';
  const fromSnapshot = sub.packageSnapshot?.activityType;
  if (fromSnapshot) return String(fromSnapshot).toLowerCase();
  const pkg = sub.package;
  if (pkg && typeof pkg === 'object' && pkg.activityType) {
    return String(pkg.activityType).toLowerCase();
  }
  return 'gym';
}

function isClosedSubscription(sub) {
  if (!sub) return true;
  if (Number(sub.refundAmount) > 0) return true;
  return Boolean(sub.refunded || sub.cancelled || sub.subscriptionStatus === 'cancelled');
}

/**
 * Prefer the latest open subscription; fall back to the last array row.
 * When preferActivityType is set, prefer the latest open row of that category.
 */
export function latestSubscriptionForReport(member, { preferActivityType } = {}) {
  const subs = member?.subscriptions ?? [];
  if (!subs.length) return null;

  const typeVal = preferActivityType && !isAllSentinel(preferActivityType)
    ? String(preferActivityType).toLowerCase()
    : null;

  for (let i = subs.length - 1; i >= 0; i -= 1) {
    const sub = subs[i];
    if (isClosedSubscription(sub)) continue;
    if (typeVal && subscriptionActivityTypeForReport(sub) !== typeVal) continue;
    return sub;
  }

  if (typeVal) {
    for (let i = subs.length - 1; i >= 0; i -= 1) {
      if (subscriptionActivityTypeForReport(subs[i]) === typeVal) return subs[i];
    }
  }

  return subs[subs.length - 1];
}

/** Filters not modeled fully on the API (membership category). Type goes to the API too. */
export function applyExpiredReportExtraFilters(members, { type, categories } = {}) {
  const typeVal = !isAllSentinel(type) ? String(type).toLowerCase() : null;
  const categoryVal = !isAllSentinel(categories) ? categories : null;

  if (!typeVal && !categoryVal) return members;

  return members.filter((m) => {
    const subs = m?.subscriptions ?? [];

    if (typeVal) {
      // Match ANY subscription of that activity — concurrent packages must not hide rows.
      const hasType = subs.some((sub) => subscriptionActivityTypeForReport(sub) === typeVal);
      if (!hasType) return false;
    }

    if (categoryVal === 'PT') {
      if ((Number(m.PT_sessions) || 0) <= 0) return false;
    } else if (categoryVal === 'Primary Membership') {
      const lastSub = latestSubscriptionForReport(m, { preferActivityType: typeVal });
      if (!lastSub?.package && !lastSub?.packageSnapshot) return false;
    }

    return true;
  });
}

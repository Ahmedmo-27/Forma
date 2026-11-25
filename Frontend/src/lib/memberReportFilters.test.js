import { describe, it, expect, vi } from 'vitest';
import {
  buildGuestReportApiParams,
  buildExpiredReportApiParams,
  buildMemberFindApiParams,
  applyExpiredReportExtraFilters,
  fetchAllMembersByParams,
  latestSubscriptionForReport,
  subscriptionActivityTypeForReport,
  REPORT_PAGE_SIZE,
} from './memberReportFilters';

describe('member report API params', () => {
  it('combines all guest report filters in one params object', () => {
    const params = buildGuestReportApiParams({
      salesMan: 'rep1',
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
      trainerName: 'coach1',
      source: 'Walk in',
    });
    expect(params).toEqual({
      status: 'guest',
      limit: REPORT_PAGE_SIZE,
      page: 1,
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      dateField: 'createdAt',
      assignedSales: 'rep1',
      currentCouch: 'coach1',
      source: 'Walk in',
      sortBy: 'createdAt',
      sortDir: -1,
    });
  });

  it('omits guest optional filters when set to All', () => {
    const params = buildGuestReportApiParams({
      salesMan: 'All',
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
      trainerName: 'All',
      source: 'All',
    });
    expect(params.assignedSales).toBeUndefined();
    expect(params.currentCouch).toBeUndefined();
    expect(params.source).toBeUndefined();
    expect(params.status).toBe('guest');
    expect(params.dateField).toBe('createdAt');
  });

  it('combines all expired report filters in one params object', () => {
    const params = buildExpiredReportApiParams({
      status: 'frozen',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      salesMan: 'rep2',
      trainerName: 'coach2',
      packageId: 'pkg1',
      gender: 'male',
      type: 'gym',
    });
    expect(params).toMatchObject({
      status: 'frozen',
      dateField: 'endDate',
      assignedSales: 'rep2',
      currentCouch: 'coach2',
      packageId: 'pkg1',
      gender: 'male',
      activityType: 'gym',
      limit: REPORT_PAGE_SIZE,
    });
  });

  it('does not force status=expired when Status is All', () => {
    const params = buildExpiredReportApiParams({
      status: 'All',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
    });
    expect(params.status).toBeUndefined();
    expect(params.dateField).toBe('endDate');
  });

  it('keeps an explicit expired status', () => {
    expect(buildExpiredReportApiParams({
      status: 'expired',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
    }).status).toBe('expired');
  });
});

describe('buildMemberFindApiParams', () => {
  it('stacks guest find filters used outside report pages', () => {
    expect(buildMemberFindApiParams({
      status: 'guest',
      assignedSales: 'rep1',
      currentCouch: 'coach1',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      dateField: 'createdAt',
      source: 'Walk in',
    })).toMatchObject({
      status: 'guest',
      assignedSales: 'rep1',
      currentCouch: 'coach1',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      dateField: 'createdAt',
      source: 'Walk in',
      limit: REPORT_PAGE_SIZE,
    });
  });

  it('stacks member find filters (package + dates + sales + gender)', () => {
    expect(buildMemberFindApiParams({
      status: 'expired',
      assignedSales: 'rep2',
      packageId: 'pkg1',
      gender: 'female',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      dateField: 'endDate',
      transferType: 'bulk',
      activityType: 'mma',
    })).toMatchObject({
      status: 'expired',
      assignedSales: 'rep2',
      packageId: 'pkg1',
      gender: 'female',
      dateField: 'endDate',
      transferType: 'bulk',
      activityType: 'mma',
    });
  });
});

describe('fetchAllMembersByParams', () => {
  it('follows hasNextPage until every matching page is loaded', async () => {
    const getPage = vi.fn(async ({ page }) => {
      if (page === 1) {
        return {
          data: {
            members: [{ _id: 'a' }, { _id: 'b' }],
            pagination: { page: 1, totalPages: 2, hasNextPage: true, total: 3 },
          },
        };
      }
      return {
        data: {
          members: [{ _id: 'c' }],
          pagination: { page: 2, totalPages: 2, hasNextPage: false, total: 3 },
        },
      };
    });

    const members = await fetchAllMembersByParams(getPage, { status: 'guest' }, { pageSize: 2 });
    expect(members.map((m) => m._id)).toEqual(['a', 'b', 'c']);
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1, limit: 2, status: 'guest' }));
    expect(getPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, limit: 2, status: 'guest' }));
  });
});

describe('subscription activity + latest row helpers', () => {
  it('falls back from empty snapshot to populated package activityType', () => {
    expect(subscriptionActivityTypeForReport({
      packageSnapshot: {},
      package: { activityType: 'crossfit' },
    })).toBe('crossfit');
  });

  it('defaults missing activity metadata to gym', () => {
    expect(subscriptionActivityTypeForReport({ packageSnapshot: null, package: 'oid' })).toBe('gym');
  });

  it('prefers the latest open subscription of the requested activity', () => {
    const member = {
      subscriptions: [
        { endDate: '2026-05-01', packageSnapshot: { activityType: 'gym' }, refunded: false },
        { endDate: '2026-06-01', packageSnapshot: { activityType: 'mma' }, cancelled: true },
        { endDate: '2026-07-01', packageSnapshot: { activityType: 'crossfit' }, refunded: false },
      ],
    };
    expect(latestSubscriptionForReport(member, { preferActivityType: 'gym' }).packageSnapshot.activityType)
      .toBe('gym');
    expect(latestSubscriptionForReport(member).packageSnapshot.activityType).toBe('crossfit');
  });
});

describe('applyExpiredReportExtraFilters', () => {
  const base = [
    {
      _id: '1',
      PT_sessions: 5,
      subscriptions: [{ endDate: '2026-05-01', package: { activityType: 'gym' } }],
    },
    {
      _id: '2',
      PT_sessions: 0,
      subscriptions: [{ endDate: '2026-05-01', package: { activityType: 'mma' } }],
    },
    {
      _id: '3',
      PT_sessions: 0,
      // Concurrent packages: gym is older, MMA is last. Type=gym must still match.
      subscriptions: [
        { endDate: '2026-05-01', package: { activityType: 'gym' } },
        { endDate: '2026-06-01', package: { activityType: 'mma' } },
      ],
    },
    {
      _id: '4',
      PT_sessions: undefined, // list select used to omit this → treated as 0
      subscriptions: [{ endDate: '2026-05-01', packageSnapshot: { activityType: 'gym' } }],
    },
    {
      _id: '5',
      PT_sessions: 3,
      subscriptions: [
        { endDate: '2026-05-01', packageSnapshot: {}, package: { activityType: 'gym' } },
      ],
    },
  ];

  it('ANDs activity type and category filters', () => {
    const out = applyExpiredReportExtraFilters(base, {
      type: 'gym',
      categories: 'PT',
    });
    expect(out.map((m) => m._id)).toEqual(['1', '5']);
  });

  it('matches Type against any subscription, not only the last array row', () => {
    const out = applyExpiredReportExtraFilters(base, { type: 'gym' });
    expect(out.map((m) => m._id)).toEqual(['1', '3', '4', '5']);
  });

  it('drops Categories=PT when PT_sessions is missing or zero', () => {
    const out = applyExpiredReportExtraFilters(base, { categories: 'PT' });
    expect(out.map((m) => m._id)).toEqual(['1', '5']);
  });

  it('resolves activityType from populated package when snapshot omits it', () => {
    const out = applyExpiredReportExtraFilters([base[4]], { type: 'gym' });
    expect(out.map((m) => m._id)).toEqual(['5']);
  });
});

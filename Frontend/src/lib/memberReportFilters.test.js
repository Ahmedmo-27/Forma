import { describe, it, expect, vi } from 'vitest';
import {
  buildGuestReportApiParams,
  buildExpiredReportApiParams,
  buildMemberFindApiParams,
  applyExpiredReportExtraFilters,
  fetchAllMembersByParams,
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

  it('combines all expired report filters in one params object', () => {
    const params = buildExpiredReportApiParams({
      status: 'frozen',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      salesMan: 'rep2',
      trainerName: 'coach2',
      packageId: 'pkg1',
      gender: 'male',
    });
    expect(params).toMatchObject({
      status: 'frozen',
      dateField: 'endDate',
      assignedSales: 'rep2',
      currentCouch: 'coach2',
      packageId: 'pkg1',
      gender: 'male',
      limit: REPORT_PAGE_SIZE,
    });
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
    })).toMatchObject({
      status: 'expired',
      assignedSales: 'rep2',
      packageId: 'pkg1',
      gender: 'female',
      dateField: 'endDate',
      transferType: 'bulk',
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
      // Older gym row would previously satisfy dotted package+date; last row is MMA.
      subscriptions: [
        { endDate: '2026-05-01', package: { activityType: 'gym' } },
        { endDate: '2026-06-01', package: { activityType: 'mma' } },
      ],
    },
  ];

  it('ANDs activity type and category filters against the last subscription', () => {
    const out = applyExpiredReportExtraFilters(base, {
      type: 'gym',
      categories: 'PT',
    });
    expect(out.map((m) => m._id)).toEqual(['1']);
  });

  it('does not treat an older subscription activity type as a match', () => {
    const out = applyExpiredReportExtraFilters(base, { type: 'gym' });
    expect(out.map((m) => m._id)).toEqual(['1']);
  });
});

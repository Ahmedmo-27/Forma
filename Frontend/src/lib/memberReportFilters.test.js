import { describe, it, expect } from 'vitest';
import {
  buildGuestReportApiParams,
  buildExpiredReportApiParams,
  applyExpiredReportExtraFilters,
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
      limit: 2000,
      page: 1,
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      dateField: 'createdAt',
      assignedSales: 'rep1',
      currentCouch: 'coach1',
      source: 'Walk in',
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
    });
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
  ];

  it('ANDs activity type and category filters', () => {
    const out = applyExpiredReportExtraFilters(base, {
      type: 'gym',
      categories: 'PT',
    });
    expect(out.map((m) => m._id)).toEqual(['1']);
  });
});
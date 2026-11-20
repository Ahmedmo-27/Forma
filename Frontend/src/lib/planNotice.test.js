import { describe, it, expect } from 'vitest';
import { pickPlanNotice } from './planNotice';

const NOW = new Date('2026-11-20T10:00:00Z');
const base = {
  status: 'active',
  billing: { isLifetime: false },
  usage: { members: 10, staff: 2, branches: 1 },
  limits: { maxMembers: 300, maxStaff: 15, maxBranches: 3 },
};

describe('pickPlanNotice', () => {
  it('stays quiet for a gym well inside its plan', () => {
    expect(pickPlanNotice(base, NOW)).toBeNull();
  });

  it('never prompts lifetime gyms', () => {
    expect(pickPlanNotice({ ...base, status: 'past_due', billing: { isLifetime: true } }, NOW)).toBeNull();
  });

  it('puts an overdue payment first, with the suspension date', () => {
    const notice = pickPlanNotice(
      { ...base, status: 'past_due', dunning: { graceEndsAt: '2026-11-23T00:00:00Z' }, usage: { members: 300 } },
      NOW
    );
    expect(notice.kind).toBe('past_due');
    expect(notice.tone).toBe('danger');
  });

  it('counts down the last week of a trial', () => {
    const notice = pickPlanNotice({ ...base, status: 'trial', trialEndsAt: '2026-11-23T09:00:00Z' }, NOW);
    expect(notice).toMatchObject({ kind: 'trial_3', tone: 'warning' });
    expect(notice.text).toContain('3 days');
    expect(pickPlanNotice({ ...base, status: 'trial', trialEndsAt: '2026-12-20T00:00:00Z' }, NOW)).toBeNull();
  });

  it('warns at 80% of the tightest cap and escalates when full', () => {
    const near = pickPlanNotice({ ...base, usage: { members: 250, staff: 13, branches: 1 } }, NOW);
    expect(near.kind).toBe('cap_near_staff_80');
    expect(near.text).toContain('13 of 15 staff accounts');

    const full = pickPlanNotice({ ...base, usage: { members: 300, staff: 2, branches: 1 } }, NOW);
    expect(full).toMatchObject({ kind: 'cap_full_members', tone: 'danger' });
  });

  it('tells an over-cap gym how many to remove after a downgrade', () => {
    const over = pickPlanNotice({ ...base, usage: { members: 10, staff: 21, branches: 1 } }, NOW);
    expect(over).toMatchObject({ kind: 'cap_over_staff', tone: 'danger' });
    expect(over.text).toContain('21 staff accounts');
    expect(over.text).toContain('remove 6');
  });

  it('ignores unlimited caps', () => {
    expect(pickPlanNotice({ ...base, limits: { maxMembers: null, maxStaff: -1 }, usage: { members: 9999, staff: 99 } }, NOW)).toBeNull();
  });
});

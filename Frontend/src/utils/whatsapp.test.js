import { describe, expect, it } from 'vitest';
import {
  applyWhatsAppPlaceholders,
  buildWhatsAppPlaceholderContext,
} from './whatsapp';

describe('applyWhatsAppPlaceholders', () => {
  it('keeps string name compatibility and uses first word for firstName', () => {
    const out = applyWhatsAppPlaceholders(
      'Hi {{name}} / {{firstName}}',
      'Sara Ali'
    );
    expect(out).toBe('Hi Sara Ali / Sara');
  });

  it('falls back to there when name is empty', () => {
    expect(applyWhatsAppPlaceholders('Hi {{name}}', '')).toBe('Hi there');
    expect(applyWhatsAppPlaceholders('Hi {{firstName}}', null)).toBe('Hi there');
  });

  it('resolves member subscription and staff placeholders', () => {
    const member = {
      name: 'Omar Hassan',
      assignedSales: { name: 'Rep Nora', role: 'Sales' },
      current_couch: { name: 'Coach Kai' },
      subscriptions: [{
        package: { name: 'Gold Monthly' },
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-02-05T00:00:00.000Z',
      }],
    };
    const ctx = buildWhatsAppPlaceholderContext(member);
    expect(ctx.firstName).toBe('Omar');
    expect(ctx.package).toBe('Gold Monthly');
    expect(ctx.coach).toBe('Coach Kai');
    expect(ctx.salesman).toBe('Rep Nora');
    expect(ctx.startDate).toMatch(/Jan/);
    expect(ctx.endDate).toMatch(/Feb/);

    const msg = applyWhatsAppPlaceholders(
      '{{firstName}} — {{package}} ends {{endDate}} (coach {{coach}}, sales {{salesman}})',
      member
    );
    expect(msg).toContain('Omar — Gold Monthly ends');
    expect(msg).toContain('coach Coach Kai');
    expect(msg).toContain('sales Rep Nora');
  });
});

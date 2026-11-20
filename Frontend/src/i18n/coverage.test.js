import { describe, it, expect } from 'vitest';
import { runAudit } from '../../scripts/i18n-audit.mjs';
import { formatDate, formatNumber } from './format.js';

describe('i18n coverage', () => {
  it('keeps the Arabic dictionary consistent', async () => {
    const { dictionary } = await runAudit();
    expect(dictionary).toEqual([]);
  });

  it('has an Arabic entry for every t() / tr() literal in pages and components', async () => {
    const { findings } = await runAudit();
    const bad = findings.filter((f) => f.kind === 'missing-key' || f.kind === 'dynamic-key' || f.kind === 'parse-error');
    expect(bad.map((f) => `${f.file}:${f.line} ${f.kind} ${f.text}`)).toEqual([]);
  });

  it('has no static user-facing text outside t()', async () => {
    const { findings } = await runAudit();
    const bad = findings.filter((f) => f.kind === 'untranslated');
    expect(bad.map((f) => `${f.file}:${f.line} ${f.text}`)).toEqual([]);
  });
});

describe('i18n formatting', () => {
  it('keeps English formats and uses Latin digits in Arabic', () => {
    expect(formatNumber('en', 12345)).toBe('12,345');
    expect(formatNumber('ar', 12345)).toMatch(/^12.345$/);
    expect(formatNumber('ar', 12345)).toMatch(/^[0-9\u066C,.\u202F\s]+$/);
    expect(formatDate('en', '2026-11-20T12:00:00Z', { day: '2-digit', month: 'short', year: 'numeric' })).toBe('20 Nov 2026');
    expect(formatDate('ar', '2026-11-20T12:00:00Z', { day: '2-digit', year: 'numeric' })).toMatch(/2026/);
  });
});

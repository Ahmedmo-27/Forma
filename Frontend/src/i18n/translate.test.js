import { describe, it, expect } from 'vitest';
import { dirFor, normalizeLanguage, resolveLanguage, translate } from './translate.js';

describe('i18n translate', () => {
  it('normalizes language codes and rejects unsupported ones', () => {
    expect(normalizeLanguage('ar-EG')).toBe('ar');
    expect(normalizeLanguage('EN_us')).toBe('en');
    expect(normalizeLanguage('fr')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });

  it('prefers the user choice, then the gym default, then English', () => {
    expect(resolveLanguage({ stored: 'en', tenantDefault: 'ar' })).toBe('en');
    expect(resolveLanguage({ stored: null, tenantDefault: 'ar' })).toBe('ar');
    expect(resolveLanguage({ stored: 'xx', tenantDefault: 'zz' })).toBe('en');
    expect(resolveLanguage()).toBe('en');
  });

  it('sets direction from the language', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });

  it('translates known keys and falls back to the English key', () => {
    expect(translate('ar', 'Members')).toBe('الأعضاء');
    expect(translate('ar', 'Some brand new label')).toBe('Some brand new label');
    expect(translate('en', 'Members')).toBe('Members');
  });

  it('interpolates variables in both languages, including zero', () => {
    expect(translate('en', 'Welcome back, {name}!', { name: 'Mona' })).toBe('Welcome back, Mona!');
    expect(translate('ar', '{completed} of {total} done. Each step ticks itself off as you go.', { completed: 0, total: 7 }))
      .toContain('0 من 7');
    expect(translate('en', 'Hello {missing}', {})).toBe('Hello {missing}');
  });
});

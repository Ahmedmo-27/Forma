import { normalizeLanguage } from './translate.js';

/**
 * Locale-aware number and date formatting.
 *
 * English keeps the formats the app always used (`en-EG` numbers, `en-GB`
 * dates). Arabic uses `ar-EG` with Latin digits (`-u-nu-latn`) so amounts,
 * phone numbers and ids read the same in both languages. Switch to
 * `ar-EG` (no extension) here if the gym prefers Arabic-Indic digits.
 */
export const NUMBER_LOCALES = { en: 'en-EG', ar: 'ar-EG-u-nu-latn' };
export const DATE_LOCALES = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

function langOf(lang) {
  return normalizeLanguage(lang) || 'en';
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

export function formatNumber(lang, value, options) {
  return Number(value ?? 0).toLocaleString(NUMBER_LOCALES[langOf(lang)], options);
}

/** `enLocale` lets a call site keep a non-default English format (e.g. `en-US`). */
export function formatDate(lang, value, options, enLocale) {
  const l = langOf(lang);
  return toDate(value).toLocaleDateString(l === 'en' && enLocale ? enLocale : DATE_LOCALES[l], options);
}

export function formatTime(lang, value, options, enLocale) {
  const l = langOf(lang);
  return toDate(value).toLocaleTimeString(l === 'en' && enLocale ? enLocale : DATE_LOCALES[l], options);
}

export function formatDateTime(lang, value, options, enLocale) {
  const l = langOf(lang);
  return toDate(value).toLocaleString(l === 'en' && enLocale ? enLocale : DATE_LOCALES[l], options);
}

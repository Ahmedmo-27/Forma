import { useMemo } from 'react';
import { useI18n } from './useI18n.js';
import { formatDate, formatDateTime, formatNumber, formatTime } from './format.js';

/**
 * Formatters bound to the active language:
 *   const { fmtNumber, fmtDate, fmtTime, fmtDateTime } = useFormat();
 * Outside a component, call `formatNumber(lang, ...)` from `format.js`.
 */
export function useFormat() {
  const { lang } = useI18n();
  return useMemo(() => ({
    lang,
    fmtNumber: (value, options) => formatNumber(lang, value, options),
    fmtDate: (value, options, enLocale) => formatDate(lang, value, options, enLocale),
    fmtTime: (value, options, enLocale) => formatTime(lang, value, options, enLocale),
    fmtDateTime: (value, options, enLocale) => formatDateTime(lang, value, options, enLocale),
  }), [lang]);
}

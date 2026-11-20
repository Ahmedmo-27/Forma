import { useMemo } from 'react';
import { useI18n } from '../../i18n/useI18n.js';
import { formatDate, formatDateTime, formatTime } from '../../i18n/format.js';

const CAIRO_ZONE = 'Africa/Cairo';

const DATE_OPTS = { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' };
const DATE_TIME_OPTS = {
  timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
};
const TIME_OPTS = { timeZone: CAIRO_ZONE, hour: 'numeric', minute: '2-digit', hour12: true };

/**
 * Cairo-time date helpers for the member profile. They keep the English
 * output the shared `fmtDate` / `fmtDateTime` produced, and switch to Arabic
 * month names (Latin digits) when the UI language is Arabic.
 */
export function useMemberDates() {
  const { lang } = useI18n();
  return useMemo(() => ({
    fmtDate: (d) => (d ? formatDate(lang, d, DATE_OPTS) : '—'),
    fmtDateTime: (d) => (d ? formatDateTime(lang, d, DATE_TIME_OPTS, 'en-US') : '—'),
    fmtTime: (d) => (d ? formatTime(lang, d, TIME_OPTS, 'en-US') : '—'),
  }), [lang]);
}

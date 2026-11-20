import { tr } from '../../i18n/translate.js';
import { formatDate, formatNumber } from '../../i18n/format.js';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = [tr('Sun'), tr('Mon'), tr('Tue'), tr('Wed'), tr('Thu'), tr('Fri'), tr('Sat')];

export const SHORT_DATE = { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short', year: 'numeric' };

/** Member `source` values, translated where they render. */
export const SOURCE_LABELS = {
  'Social media': tr('Social media'),
  'Walk in': tr('Walk in'),
  'Word of mouth': tr('Word of mouth'),
  referral: tr('referral'),
  'sales call': tr('sales call'),
  'data entry': tr('data entry'),
  others: tr('others'),
  Unknown: tr('Unknown'),
};

export function sourceLabel(source, t) {
  return SOURCE_LABELS[source] ? t(SOURCE_LABELS[source]) : source;
}

export function formatMonth(key, lang) {
  if (!key) return '';
  const [year, month] = String(key).split('-');
  if (lang === 'ar' && Number(month) >= 1 && Number(month) <= 12) {
    return formatDate(lang, new Date(Number(year), Number(month) - 1, 1), { month: 'short', year: 'numeric' });
  }
  return `${MONTHS[Number(month) - 1] || month} ${year}`;
}

export function formatEgp(value, lang) {
  const rounded = Math.round(Number(value) || 0);
  if (lang === 'ar') return `${formatNumber(lang, rounded)} EGP`;
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} EGP`;
}

export function formatPercent(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

const REPORT_ERROR = tr('Could not load this report');

export function reportError(err, t) {
  return err?.response?.data?.message || (t ? t(REPORT_ERROR) : REPORT_ERROR);
}

export const thStyle = {
  textAlign: 'start',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--t3)',
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

export const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--t1)',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

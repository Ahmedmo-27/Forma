export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatMonth(key) {
  if (!key) return '';
  const [year, month] = String(key).split('-');
  return `${MONTHS[Number(month) - 1] || month} ${year}`;
}

export function formatEgp(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} EGP`;
}

export function formatPercent(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

export function reportError(err) {
  return err?.response?.data?.message || 'Could not load this report';
}

export const thStyle = {
  textAlign: 'left',
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

import { dirFor, normalizeLanguage, translate } from '../../i18n/translate';
import { formatDate, formatDateTime, formatNumber } from '../../i18n/format';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Printable HTML for a signed contract, in the staff member's language. Every value is escaped. */
export function contractHtml(signature, lang = 'en') {
  const code = normalizeLanguage(lang) || 'en';
  const t = (key, vars) => translate(code, key, vars);
  const fmt = (date) => (date ? formatDate(code, date, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const c = signature.contract || {};
  const rows = [
    ['Gym', c.legalName ? `${c.gymName} (${c.legalName})` : c.gymName],
    ['Member', `${c.memberName ?? ''}${c.memberSystemId != null ? ` · #${c.memberSystemId}` : ''}`],
    ['Package', [c.packageName, c.activityType].filter(Boolean).join(' · ')],
    ['Period', t('{start} to {end}', { start: fmt(c.startDate), end: fmt(c.endDate) })],
    ['Price paid', `${c.currency ?? ''} ${formatNumber(code, c.pricePaid ?? 0)}`],
  ];
  const image = String(signature.image || '').startsWith('data:image/png;base64,') ? signature.image : '';
  const signedAt = formatDateTime(code, signature.signedAt);
  return `<!doctype html><html lang="${code}" dir="${dirFor(code)}"><head><meta charset="utf-8"><title>${escapeHtml(t('Membership contract'))}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#111827;margin:40px;font-size:13px}
h1{font-size:20px;margin:0 0 4px} .muted{color:#6B7280}
table{border-collapse:collapse;margin:18px 0;width:100%} td{padding:6px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top;text-align:start}
td:first-child{width:130px;color:#6B7280;font-weight:600}
.terms{white-space:pre-wrap;line-height:1.6;border:1px solid #E5E7EB;border-radius:6px;padding:12px;margin:12px 0}
.sig{margin-top:24px;display:flex;gap:24px;align-items:flex-end} .sig img{max-height:100px;max-width:320px;border-bottom:1px solid #111827}
.foot{margin-top:32px;font-size:10px;color:#9CA3AF;word-break:break-all}
</style></head><body>
<h1>${escapeHtml(t('Membership contract'))}</h1>
<div class="muted">${escapeHtml(c.gymName)}${c.subscriptionId != null ? ` · ${escapeHtml(t('Membership #{id}', { id: c.subscriptionId }))}` : ''}</div>
<table>${rows.map(([k, v]) => `<tr><td>${escapeHtml(t(k))}</td><td dir="auto">${escapeHtml(v || '—')}</td></tr>`).join('')}</table>
<div class="terms" dir="auto">${escapeHtml(signature.terms || t('No additional terms.'))}</div>
<div class="sig">${image ? `<img src="${image}" alt="${escapeHtml(t('Signature'))}">` : ''}
<div><strong dir="auto">${escapeHtml(signature.signerName)}</strong><br><span class="muted">${escapeHtml(t('Signed {date}', { date: signedAt }))}</span>
${signature.capturedBy?.name ? `<br><span class="muted">${escapeHtml(t('Witnessed by {name}', { name: signature.capturedBy.name }))}</span>` : ''}</div></div>
<div class="foot" dir="ltr">${escapeHtml(t('Terms fingerprint (SHA-256): {hash}', { hash: signature.termsHash }))}</div>
</body></html>`;
}

export function printContract(signature, lang = 'en') {
  const win = window.open('', '_blank', 'noopener=no,width=820,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(contractHtml(signature, lang));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  return true;
}

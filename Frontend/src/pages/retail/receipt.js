import { PAYMENT_LABELS, money } from './retailShared';
import { dirFor, normalizeLanguage, translate } from '../../i18n/translate';
import { formatDateTime } from '../../i18n/format';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Opens a small printable receipt. All dynamic text is escaped. */
export function printReceipt(sale, lang = 'en') {
  if (!sale) return;
  const language = normalizeLanguage(lang) || 'en';
  const t = (key, vars) => translate(language, key, vars);
  const amount = (value) => `<bdi dir="ltr">${esc(money(value, language))}</bdi>`;
  const rows = sale.items
    .map((i) => `<tr><td><bdi>${esc(i.qty)} x ${esc(i.name)}</bdi></td><td class="r">${amount(i.lineTotal)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="${language}" dir="${dirFor(language)}"><head><meta charset="utf-8"><title>${esc(t('Receipt #{number}', { number: sale.receiptNumber }))}</title>
<style>body{font-family:system-ui,sans-serif;font-size:13px;width:280px;margin:12px auto}h1{font-size:15px;margin:0 0 4px}
table{width:100%;border-collapse:collapse}td{padding:3px 0}.r{text-align:end}hr{border:0;border-top:1px dashed #999;margin:8px 0}
.t{font-weight:700;font-size:15px}</style></head><body>
<h1>${esc(t('Receipt #{number}', { number: sale.receiptNumber }))}</h1><div>${esc(formatDateTime(language, sale.createdAt))}</div><hr>
<table>${rows}</table><hr>
${sale.discount > 0 ? `<table><tr><td>${esc(t('Discount'))}</td><td class="r"><bdi dir="ltr">-${esc(money(sale.discount, language))}</bdi></td></tr></table>` : ''}
<table><tr class="t"><td>${esc(t('Total'))}</td><td class="r">${amount(sale.total)}</td></tr>
<tr><td>${esc(t('Paid by'))}</td><td class="r">${esc(PAYMENT_LABELS[sale.paymentMethod] ? t(PAYMENT_LABELS[sale.paymentMethod]) : sale.paymentMethod)}</td></tr></table>
${sale.memberName ? `<div>${esc(t('Member'))}: <bdi>${esc(sale.memberName)}</bdi></div>` : ''}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const win = window.open('', '_blank', 'width=360,height=600');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

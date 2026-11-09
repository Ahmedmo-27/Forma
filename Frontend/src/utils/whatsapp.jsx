import { Btn } from '../components/ui';

/** Encode message text for WhatsApp deep links (keeps emoji/Arabic intact). */
function encodeWhatsAppText(text) {
  // encodeURIComponent is UTF-8 safe; also fix broken leftover replacement chars
  return encodeURIComponent(String(text).replace(/\uFFFD/g, '').trim());
}

/** Build a wa.me / api.whatsapp.com link from a stored phone. */
export function toWhatsAppUrl(phone, text, countryCode = '20') {
  if (!phone || phone === 'hidden') return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  const cc = String(countryCode || '20').replace(/\D/g, '');
  if (cc && !digits.startsWith(cc) && digits.length <= 11) digits = `${cc}${digits}`;

  const encoded = text != null && String(text).trim()
    ? encodeWhatsAppText(text)
    : '';

  // api.whatsapp.com handles Unicode (emoji) more reliably than wa.me on some desktops
  if (encoded) {
    return `https://api.whatsapp.com/send?phone=${digits}&text=${encoded}`;
  }
  return `https://wa.me/${digits}`;
}

/** Replace {{name}} and {{firstName}} with the member's full name. */
export function applyWhatsAppPlaceholders(text, memberName) {
  if (!text) return '';
  const name = String(memberName || '').trim() || 'there';
  return String(text)
    .replace(/\uFFFD/g, '')
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*firstName\s*\}\}/gi, name);
}

function formatPackageLine(pkg, currency = 'EGP') {
  return `• ${pkg.name} (${pkg.duration}) — ${Number(pkg.price).toLocaleString()} ${currency}`;
}

function discountedPrice(price, percent) {
  const p = Number(price) || 0;
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return Math.round(p * (1 - pct / 100));
}

/** e.g. Premium Quarterly — price was 2000 EGP, now it's 1000 EGP (50% off) */
function formatDiscountAppliedLine(pkg, percent, currency = 'EGP') {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const original = Number(pkg.price) || 0;
  const next = discountedPrice(original, pct);
  return `${pkg.name} (${pkg.duration})\nPrice was ${original.toLocaleString()} ${currency}, now it's ${next.toLocaleString()} ${currency} (${pct}% off).`;
}

function formatDiscountBlock(selected, percent, lang, currency = 'EGP') {
  if (!selected.length || !(percent > 0)) return '';
  const lines = selected.map((p) => formatDiscountAppliedLine(p, percent, currency));
  if (lang === 'ar') {
    return `تفاصيل العرض:\n\n${lines.join('\n\n')}`;
  }
  return `Offer details:\n\n${lines.join('\n\n')}`;
}

function packageId(pkg) {
  return String(pkg._id ?? pkg.id ?? '');
}

function filterSelectedPackages(packages, selectedPackageIds) {
  const catalog = Array.isArray(packages) ? packages : [];
  if (!selectedPackageIds || selectedPackageIds.length === 0) return [];
  const set = new Set(selectedPackageIds.map(String));
  return catalog.filter((p) => set.has(packageId(p)));
}

/**
 * Compose the editable draft message for a template.
 * @param {object} template
 * @param {array} packages - full catalog
 * @param {object} [options]
 * @param {string} [options.memberName]
 * @param {string[]} [options.selectedPackageIds]
 * @param {number} [options.discountPercent] - for discounts type
 * @param {'en'|'ar'} [options.language]
 */
export function composeWhatsAppTemplateMessage(template, packages = [], options = {}) {
  if (!template) return '';
  const type = String(template.type || '').toLowerCase();
  const lang = options.language === 'ar' ? 'ar' : 'en';
  const introRaw = lang === 'ar'
    ? ((template.introTextAr || '').trim() || (template.introText || '').trim())
    : ((template.introText || '').trim());
  const bodyRaw = lang === 'ar'
    ? ((template.bodyTextAr || '').trim() || (template.bodyText || '').trim())
    : ((template.bodyText || '').trim());
  const intro = applyWhatsAppPlaceholders(introRaw, options.memberName);
  const body = applyWhatsAppPlaceholders(bodyRaw, options.memberName);
  const includeLive = template.includeLiveData !== false;
  const selected = filterSelectedPackages(packages, options.selectedPackageIds);

  const currency = options.currency || 'EGP';

  if (type === 'packages') {
    const parts = [];
    if (intro) parts.push(intro);
    if (includeLive) {
      const catalog = Array.isArray(packages) ? packages : [];
      const list = selected.length ? selected : catalog;
      const lines = list.map((pkg) => formatPackageLine(pkg, currency));
      if (lines.length) parts.push(lines.join('\n'));
    }
    if (body) parts.push(body);
    return parts.join('\n\n');
  }

  if (type === 'discounts') {
    const percent = options.discountPercent != null
      ? Number(options.discountPercent)
      : Number(template.defaultDiscountPercent) || 0;
    const parts = [];
    if (intro) parts.push(intro);
    // Always include chosen package + recalculated price when sender picked them
    const block = formatDiscountBlock(selected, percent, lang, currency);
    if (block) parts.push(block);
    if (body) parts.push(body);
    return parts.join('\n\n');
  }

  return body || intro || '';
}

export function WhatsAppBtn({ phone, size = 'xs', fullWidth = false }) {
  const url = toWhatsAppUrl(phone);
  if (!url) return null;
  return (
    <Btn
      variant="success"
      size={size}
      fullWidth={fullWidth}
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
    >
      Chat on WhatsApp
    </Btn>
  );
}

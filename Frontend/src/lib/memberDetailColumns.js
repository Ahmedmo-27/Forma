import { tr } from '../i18n/translate';

export const MEMBER_DETAIL_COLUMNS_ACCESS = 'member_detail_columns';
export const MEMBER_DETAIL_COLUMNS_STORAGE_KEY = 'ff_member_detail_columns';

/** Always-visible visit columns (not toggled). */
export const CORE_VISIT_COLUMNS = [
  { key: 'serial', label: tr('#') },
  { key: 'name', label: tr('Name') },
  { key: 'time', label: tr('Time') },
  { key: 'status', label: tr('Status') },
];

/** Extra member fields unlocked by the Columns control. */
export const OPTIONAL_VISIT_COLUMNS = [
  { key: 'memberId', label: tr('Member ID') },
  { key: 'systemId', label: tr('System ID') },
  { key: 'phone', label: tr('Phone') },
  { key: 'package', label: tr('Package') },
  { key: 'sales', label: tr('Sales') },
];

const OPTIONAL_KEYS = new Set(OPTIONAL_VISIT_COLUMNS.map((col) => col.key));

export function loadOptionalVisitColumns() {
  try {
    const raw = localStorage.getItem(MEMBER_DETAIL_COLUMNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key) => OPTIONAL_KEYS.has(key));
  } catch {
    return [];
  }
}

export function saveOptionalVisitColumns(keys) {
  const next = (Array.isArray(keys) ? keys : []).filter((key) => OPTIONAL_KEYS.has(key));
  try {
    localStorage.setItem(MEMBER_DETAIL_COLUMNS_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}

export function optionalColumnValue(entry, key) {
  const member = entry?.member || {};
  switch (key) {
    case 'memberId':
      return member.memberId != null && member.memberId !== '' ? String(member.memberId) : '—';
    case 'systemId':
      return member.systemId != null && member.systemId !== '' ? String(member.systemId) : '—';
    case 'phone':
      return member.phones || '—';
    case 'package':
      return member.package?.name || '—';
    case 'sales':
      return member.assignedSales?.name || '—';
    default:
      return '—';
  }
}

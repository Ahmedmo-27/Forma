export const GROUPS = [
  { id: 'expired', label: 'Expired', hint: 'Memberships that have ended' },
  { id: 'guest', label: 'Guest', hint: 'People who have not subscribed' },
  { id: 'active', label: 'Active', hint: 'Members in good standing' },
  { id: 'frozen', label: 'Freeze', hint: 'Memberships on hold' },
];

export const EXPORT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'systemId', label: 'System ID' },
  { key: 'memberId', label: 'Member ID' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'salesman', label: 'Salesman' },
  { key: 'sales', label: 'Sales' },
  { key: 'coach', label: 'Coach' },
  { key: 'package', label: 'Package' },
  { key: 'startDate', label: 'Start date' },
  { key: 'endDate', label: 'End date' },
  { key: 'source', label: 'Source' },
  { key: 'gender', label: 'Gender' },
  { key: 'joined', label: 'Joined' },
];

export function hasAccessKey(user, key) {
  if (!Array.isArray(user?.access)) return false;
  return user.access.includes(key);
}

export function latestSubscription(member) {
  const list = member?.subscriptions;
  if (!Array.isArray(list) || !list.length) return null;
  return list[list.length - 1];
}

export function personName(value) {
  if (!value) return '';
  if (typeof value === 'object') return value.name || '';
  return '';
}

export function salesmanName(member) {
  const assigned = member?.assignedSales;
  if (!assigned || assigned.role === 'Sales Manager') return '';
  return personName(assigned);
}

export function salesName(member) {
  const assigned = member?.assignedSales;
  if (assigned?.role === 'Sales Manager') return assigned.name || '';
  return personName(latestSubscription(member)?.salesManager);
}

export function coachName(member) {
  return personName(member?.current_couch);
}

export function packageName(member) {
  return latestSubscription(member)?.package?.name || '';
}

export function memberPhone(member) {
  const phone = member?.phones;
  if (!phone || phone === 'hidden') return '';
  return String(phone);
}

export function csvDate(value) {
  if (!value) return '';
  const formatted = new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return formatted === '—' ? '' : formatted;
}

export function columnValue(member, key) {
  const sub = latestSubscription(member);
  switch (key) {
    case 'name': return member.name || '';
    case 'systemId': return member.systemId ?? '';
    case 'memberId': return member.memberId ?? '';
    case 'phone': return memberPhone(member);
    case 'status': return member.status || '';
    case 'salesman': return salesmanName(member);
    case 'sales': return salesName(member);
    case 'coach': return coachName(member);
    case 'package': return packageName(member);
    case 'startDate': return csvDate(sub?.startDate);
    case 'endDate': return csvDate(sub?.endDate);
    case 'source': return member.source || '';
    case 'gender': return member.gender || '';
    case 'joined': return csvDate(member.createdAt);
    default: return '';
  }
}

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(columns, rows) {
  const header = columns.map((col) => csvEscape(col.label)).join(',');
  const body = rows.map((row) => columns.map((col) => csvEscape(columnValue(row, col.key))).join(','));
  return `\uFEFF${[header, ...body].join('\n')}`;
}

export function columnsForExport(keys) {
  return EXPORT_COLUMNS.filter((col) => keys.includes(col.key));
}

export function rowsForExport(selectedMembers, filtered) {
  return selectedMembers.length ? selectedMembers : filtered;
}

export function smsUrl(phones, body) {
  const numbers = phones.filter(Boolean).join(',');
  if (!numbers) return null;
  return `sms:${numbers}?&body=${encodeURIComponent(body || '')}`;
}

export function filterMembers(members, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return members;
  return members.filter((member) => {
    const phone = memberPhone(member);
    return (
      member.name?.toLowerCase().includes(q)
      || phone.includes(q)
      || String(member.systemId ?? '').includes(q)
      || salesmanName(member).toLowerCase().includes(q)
      || salesName(member).toLowerCase().includes(q)
      || coachName(member).toLowerCase().includes(q)
    );
  });
}

export function taskPermissions(user, hasFeature) {
  const canSalesman = hasAccessKey(user, 'transfer');
  const canCoach = hasAccessKey(user, 'coach_transfer');
  return {
    canSalesman,
    canCoach,
    canSales: canSalesman || user?.role === 'Accountant',
    canWhatsApp: Boolean(hasFeature?.('whatsapp')),
  };
}

export function assignChoices(kind, { salesUsers = [], coaches = [], selectedCount = 0 } = {}) {
  const salesmanOptions = salesUsers.filter((person) => person.role === 'Sales');
  const salesOptions = salesUsers.filter((person) => person.role === 'Sales Manager');
  if (kind === 'salesman') {
    return {
      title: 'Change salesman',
      hint: `Move ${selectedCount} selected member(s) to a sales rep.`,
      options: salesmanOptions.length ? salesmanOptions : salesUsers,
      empty: 'No sales users found',
    };
  }
  if (kind === 'sales') {
    return {
      title: 'Change sales',
      hint: `Move ${selectedCount} selected member(s) to a sales manager.`,
      options: salesOptions.length ? salesOptions : salesUsers,
      empty: 'No sales managers found',
    };
  }
  return {
    title: 'Change coach',
    hint: `Assign ${selectedCount} selected member(s) to a coach.`,
    options: coaches,
    empty: 'No coaches found',
  };
}

export function toggleId(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function toggleIds(selected, ids) {
  const next = new Set(selected);
  const allOn = ids.length > 0 && ids.every((id) => next.has(id));
  if (allOn) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

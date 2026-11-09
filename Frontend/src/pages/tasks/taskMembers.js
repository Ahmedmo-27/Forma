import { formatSystemId } from '../../lib/systemId';

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
  { key: 'transfers', label: 'Transfers' },
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
    case 'systemId': return formatSystemId(member.systemId);
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
    case 'transfers': return transferSummary(member);
    default: return '';
  }
}

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Excel SpreadsheetML. Excel opens this as a workbook without an extra dependency. */
export function buildExcel(columns, rows) {
  const header = columns.map((col) => `<Cell><Data ss:Type="String">${escapeXml(col.label)}</Data></Cell>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((col) => `<Cell><Data ss:Type="String">${escapeXml(columnValue(row, col.key))}</Data></Cell>`).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Members"><Table>
<Row>${header}</Row>
${body}
</Table></Worksheet>
</Workbook>`;
}

export function buildCsv(columns, rows) {
  const header = columns.map((col) => csvEscape(col.label)).join(',');
  const body = rows.map((row) => columns.map((col) => csvEscape(columnValue(row, col.key))).join(','));
  return `\uFEFF${[header, ...body].join('\n')}`;
}

export function columnsForExport(keys) {
  const chosen = EXPORT_COLUMNS.filter((col) => keys.includes(col.key));
  if (!chosen.some((col) => col.key === 'salesman')) {
    const salesRep = EXPORT_COLUMNS.find((col) => col.key === 'salesman');
    if (salesRep) chosen.push(salesRep);
  }
  return chosen;
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
      || formatSystemId(member.systemId).toLowerCase().includes(q)
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

export function formatTaskDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function canUserAssignTasks(user) {
  if (!user) return false;
  if (['Owner', 'General Manager', 'Sales Manager', 'Coach Manager'].includes(user.role)) return true;
  return hasAccessKey(user, 'transfer') || hasAccessKey(user, 'coach_transfer');
}

export function filterTaskHistory(history = [], query = '', statusFilter = 'all') {
  const q = String(query || '').trim().toLowerCase();
  return history.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!q) return true;
    const name = String(item.member?.name || '').toLowerCase();
    const phone = String(item.member?.phone || '').toLowerCase();
    const systemId = String(item.member?.systemId || '').toLowerCase();
    const by = String(item.assignedBy?.name || '').toLowerCase();
    const to = String(item.assignedTo?.name || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || systemId.includes(q) || by.includes(q) || to.includes(q);
  });
}

export function getTransferLogs(member) {
  if (!Array.isArray(member?.userlog)) return [];
  return member.userlog.filter((log) => log.type === 'assign');
}

export function lastTransferDate(member) {
  const logs = getTransferLogs(member);
  if (!logs.length) return null;
  return logs[logs.length - 1].createdAt || null;
}

export function transferSummary(member) {
  const logs = getTransferLogs(member);
  if (!logs.length) return 'None';
  const latest = logs[logs.length - 1];
  return latest.text || 'Transferred';
}

export function filterMembersAdvanced(members = [], filters = {}) {
  const {
    search = '',
    status = 'all',
    kind = 'all',
    personId = '',
    dateField = 'endDate',
    dateFrom = '',
    dateTo = '',
    transferType = 'all',
    packageId = 'all',
    gender = 'all',
    source = 'all',
  } = filters;

  const q = String(search || '').trim().toLowerCase();
  const fromTime = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toTime = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

  return members.filter((member) => {
    // 1. Status Filter
    if (status === 'blocked' && !member.isBlocked) return false;
    if (status !== 'all' && status !== 'blocked' && member.status !== status) return false;

    // 2. Kind / Assignee Filter
    if (kind === 'unassigned_sales') {
      if (member.assignedSales) return false;
    } else if (kind === 'unassigned_coach') {
      if (member.current_couch) return false;
    } else if (kind === 'sales') {
      if (personId) {
        const assignedId = member.assignedSales?._id || member.assignedSales;
        if (String(assignedId) !== String(personId)) return false;
      } else if (!member.assignedSales) return false;
    } else if (kind === 'coach') {
      if (personId) {
        const coachId = member.current_couch?._id || member.current_couch;
        if (String(coachId) !== String(personId)) return false;
      } else if (!member.current_couch) return false;
    }

    // 3. Gender Filter
    if (gender !== 'all' && member.gender && member.gender.toLowerCase() !== gender.toLowerCase()) {
      return false;
    }

    // 4. Source Filter
    if (source !== 'all' && member.source && member.source.toLowerCase() !== source.toLowerCase()) {
      return false;
    }

    // 5. Package Filter
    const sub = latestSubscription(member);
    if (packageId !== 'all') {
      const pkgId = sub?.package?._id || sub?.package;
      if (String(pkgId) !== String(packageId)) return false;
    }

    // 6. Transfer Filter
    const logs = getTransferLogs(member);
    if (transferType === 'transferred') {
      if (!logs.length) return false;
    } else if (transferType === 'never') {
      if (logs.length > 0) return false;
    } else if (transferType === 'bulk') {
      if (!logs.some((l) => /bulk/i.test(l.text || ''))) return false;
    } else if (transferType === 'coach') {
      if (!logs.some((l) => /coach|couch/i.test(l.text || '') || member.current_couch)) return false;
    } else if (transferType === 'sales') {
      if (!logs.some((l) => /sales|salesman|sales rep/i.test(l.text || '') || member.assignedSales)) return false;
    }

    // 7. Date Period Filter (From / To)
    if (fromTime || toTime) {
      let targetTime = null;
      if (dateField === 'joined' || dateField === 'createdAt') {
        targetTime = member.createdAt ? new Date(member.createdAt).getTime() : null;
      } else if (dateField === 'startDate') {
        targetTime = sub?.startDate ? new Date(sub.startDate).getTime() : null;
      } else if (dateField === 'transferDate') {
        const matchingLog = logs.find((l) => {
          const t = new Date(l.createdAt).getTime();
          if (fromTime && t < fromTime) return false;
          if (toTime && t > toTime) return false;
          return true;
        });
        if (!matchingLog) return false;
      } else {
        // default: endDate
        targetTime = sub?.endDate ? new Date(sub.endDate).getTime() : null;
      }

      if (dateField !== 'transferDate') {
        if (!targetTime) return false;
        if (fromTime && targetTime < fromTime) return false;
        if (toTime && targetTime > toTime) return false;
      }
    }

    // 8. Search Query
    if (q) {
      const phone = memberPhone(member);
      const name = String(member.name || '').toLowerCase();
      const sid = String(member.systemId ?? '').toLowerCase();
      const formattedSid = formatSystemId(member.systemId).toLowerCase();
      const sName = salesmanName(member).toLowerCase();
      const smName = salesName(member).toLowerCase();
      const cName = coachName(member).toLowerCase();
      const transferText = logs.map((l) => l.text).join(' ').toLowerCase();

      return (
        name.includes(q)
        || phone.includes(q)
        || sid.includes(q)
        || formattedSid.includes(q)
        || sName.includes(q)
        || smName.includes(q)
        || cName.includes(q)
        || transferText.includes(q)
      );
    }

    return true;
  });
}

export function filterCreatedTasks(tasks = [], filters = {}) {
  const {
    role = 'all',
    personId = '',
    memberSearch = '',
    status = 'all',
    transferType = 'all',
    packageId = 'all',
    memberStatus = 'all',
    dateField = 'createdAt',
    dateFrom = '',
    dateTo = '',
  } = filters;

  const mSearch = String(memberSearch || '').trim().toLowerCase();
  const fromTime = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toTime = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

  return tasks.filter((task) => {
    // Role filter
    if (role !== 'all') {
      const taskRole = task.targetRole || task.assignedTo?.role;
      if (role === 'Sales' && !['Sales', 'Sales Manager'].includes(taskRole)) return false;
      if (role === 'Coach' && !['Coach', 'Coach Manager'].includes(taskRole)) return false;
    }

    // Person picker filter (specific sales rep or coach)
    if (personId && personId !== 'all') {
      const assignedId = task.assignedTo?._id || task.assignedTo;
      if (String(assignedId) !== String(personId)) return false;
    }

    // Task status filter
    if (status !== 'all' && task.status !== status) return false;

    // Transfer type filter
    if (transferType !== 'all' && task.transferType !== transferType) return false;

    // Date range filter
    if (fromTime || toTime) {
      if (dateField === 'completedAt') {
        const hasMatchingCompletion = (task.members || []).some((m) => {
          if (!m.completedAt) return false;
          const t = new Date(m.completedAt).getTime();
          if (fromTime && t < fromTime) return false;
          if (toTime && t > toTime) return false;
          return true;
        });
        if (!hasMatchingCompletion) return false;
      } else {
        const t = task.createdAt ? new Date(task.createdAt).getTime() : null;
        if (!t) return false;
        if (fromTime && t < fromTime) return false;
        if (toTime && t > toTime) return false;
      }
    }

    // Member status filter
    if (memberStatus !== 'all') {
      const hasStatus = (task.members || []).some((m) => {
        const s = m.member?.status || m.status;
        return s === memberStatus;
      });
      if (!hasStatus) return false;
    }

    // Package filter
    if (packageId !== 'all') {
      const hasPkg = (task.members || []).some((m) => {
        const sub = latestSubscription(m.member);
        const pkg = sub?.package?._id || sub?.package;
        return String(pkg) === String(packageId);
      });
      if (!hasPkg) return false;
    }

    // Member picker / search inside task
    if (mSearch) {
      const matchMember = (task.members || []).some((m) => {
        const name = String(m.name || m.member?.name || '').toLowerCase();
        const phone = String(m.phone || m.member?.phones || '').toLowerCase();
        const sid = String(m.systemId ?? m.member?.systemId ?? '').toLowerCase();
        const formattedSid = formatSystemId(m.systemId || m.member?.systemId).toLowerCase();
        return name.includes(mSearch) || phone.includes(mSearch) || sid.includes(mSearch) || formattedSid.includes(mSearch);
      });
      const matchAssignee = String(task.assignedTo?.name || '').toLowerCase().includes(mSearch);
      const matchTitle = String(task.title || '').toLowerCase().includes(mSearch);
      if (!matchMember && !matchAssignee && !matchTitle) return false;
    }

    return true;
  });
}

export function filterAssignedHistoryAdvanced(history = [], filters = {}) {
  const {
    assignedBy = 'all',
    status = 'all',
    packageId = 'all',
    transferType = 'all',
    memberStatus = 'all',
    dateField = 'assignedAt',
    dateFrom = '',
    dateTo = '',
    search = '',
  } = filters;

  const q = String(search || '').trim().toLowerCase();
  const fromTime = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toTime = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

  return history.filter((item) => {
    // 1. Assigned By filter (who assigned these tasks)
    if (assignedBy !== 'all') {
      const byId = item.assignedBy?._id || item.assignedBy;
      if (String(byId) !== String(assignedBy)) return false;
    }

    // 2. Status filter
    if (status !== 'all' && item.status !== status) return false;

    // 3. Transfer type filter
    if (transferType !== 'all' && item.transferType !== transferType) return false;

    // 4. Member status filter
    if (memberStatus !== 'all' && item.member?.status !== memberStatus) return false;

    // 5. Package filter
    if (packageId !== 'all') {
      const pkgId = item.member?.packageId;
      const pkgName = item.member?.package;
      if (String(pkgId) !== String(packageId) && String(pkgName) !== String(packageId)) return false;
    }

    // 6. Date period filter
    if (fromTime || toTime) {
      let targetTime = null;
      if (dateField === 'completedAt') {
        targetTime = item.completedAt ? new Date(item.completedAt).getTime() : null;
      } else if (dateField === 'endDate') {
        targetTime = item.member?.endDate ? new Date(item.member.endDate).getTime() : null;
      } else {
        // default: assignedAt
        targetTime = item.assignedAt ? new Date(item.assignedAt).getTime() : null;
      }

      if (!targetTime) return false;
      if (fromTime && targetTime < fromTime) return false;
      if (toTime && targetTime > toTime) return false;
    }

    // 7. Search query
    if (q) {
      const name = String(item.member?.name || '').toLowerCase();
      const phone = String(item.member?.phone || '').toLowerCase();
      const sid = String(item.member?.systemId ?? '').toLowerCase();
      const formattedSid = formatSystemId(item.member?.systemId).toLowerCase();
      const byName = String(item.assignedBy?.name || '').toLowerCase();
      const byRole = String(item.assignedBy?.role || '').toLowerCase();
      const notes = String(item.notes || '').toLowerCase();

      return (
        name.includes(q)
        || phone.includes(q)
        || sid.includes(q)
        || formattedSid.includes(q)
        || byName.includes(q)
        || byRole.includes(q)
        || notes.includes(q)
      );
    }

    return true;
  });
}

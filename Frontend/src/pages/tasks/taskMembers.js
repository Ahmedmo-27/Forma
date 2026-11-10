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

export function toLocalDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

export function parseDateBoundary(dateStr, isEnd = false) {
  if (!dateStr) return null;
  const parts = String(dateStr).trim().split('-');
  if (parts.length !== 3) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return isEnd ? d.setHours(23, 59, 59, 999) : d.setHours(0, 0, 0, 0);
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime())) return null;
  if (isEnd) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

export function latestSubscription(member) {
  const list = member?.subscriptions;
  if (!Array.isArray(list) || !list.length) return null;
  return list.reduce((latest, current) => {
    if (!latest) return current;
    const latestTime = latest.endDate ? new Date(latest.endDate).getTime() : (latest.startDate ? new Date(latest.startDate).getTime() : 0);
    const currentTime = current.endDate ? new Date(current.endDate).getTime() : (current.startDate ? new Date(current.startDate).getTime() : 0);
    return currentTime >= latestTime ? current : latest;
  }, list[list.length - 1]);
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
  const next = selected instanceof Set ? new Set(selected) : new Set(selected || []);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function toggleIds(selected, ids) {
  const next = selected instanceof Set ? new Set(selected) : new Set(selected || []);
  const allOn = ids.length > 0 && ids.every((id) => next.has(id));
  if (allOn) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

export function formatTaskDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const TASK_PLAYER_TYPES = {
  ASSIGNING: 'assigning',
  ASSIGNED: 'assigned',
};

export const NON_RECEIVING_TASK_ROLES = ['Owner', 'General Manager', 'Sales Manager'];

export function canUserReceiveTasks(user) {
  if (!user || !user.role) return false;
  if (NON_RECEIVING_TASK_ROLES.includes(user.role)) return false;
  return ['Sales', 'Coach', 'Coach Manager'].includes(user.role);
}

export function canUserAssignTasks(user) {
  if (!user) return false;
  if (['Owner', 'General Manager', 'Sales Manager', 'Coach Manager'].includes(user.role)) return true;
  return hasAccessKey(user, 'transfer') || hasAccessKey(user, 'coach_transfer');
}

export function getTaskPlayerType(user) {
  return canUserAssignTasks(user) ? TASK_PLAYER_TYPES.ASSIGNING : TASK_PLAYER_TYPES.ASSIGNED;
}

export function filterTaskHistory(history = [], query = '', statusFilter = 'all') {
  const q = String(query || '').trim().toLowerCase();
  const sFilter = String(statusFilter || 'all').toLowerCase();
  return history.filter((item) => {
    if (sFilter !== 'all' && String(item.status || '').toLowerCase() !== sFilter) return false;
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
  const fromTime = parseDateBoundary(dateFrom);
  const toTime = parseDateBoundary(dateTo, true);

  return members.filter((member) => {
    // 1. Status Filter
    const effectiveStatus = String(status || 'all').toLowerCase();
    if (effectiveStatus === 'blocked') {
      if (!member.isBlocked) return false;
    } else if (effectiveStatus !== 'all') {
      const memberStatus = String(member.status || '').toLowerCase();
      if (memberStatus !== effectiveStatus) return false;
    }

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
    if (gender && gender !== 'all') {
      if (!member.gender || member.gender.toLowerCase() !== gender.toLowerCase()) {
        return false;
      }
    }

    // 4. Source Filter
    if (source && source !== 'all') {
      if (!member.source || member.source.toLowerCase() !== source.toLowerCase()) {
        return false;
      }
    }

    // 5. Package Filter
    if (packageId && packageId !== 'all') {
      const sub = latestSubscription(member);
      const latestPkgId = sub?.package?._id ? String(sub.package._id) : (sub?.package ? String(sub.package) : null);
      const latestPkgName = typeof sub?.package?.name === 'string' ? sub.package.name : (typeof sub?.package === 'string' ? sub.package : null);
      const matchesLatest = latestPkgId === String(packageId) || latestPkgName === String(packageId);

      const subs = Array.isArray(member.subscriptions) ? member.subscriptions : [];
      const matchesAny = subs.some((s) => {
        const pId = s?.package?._id ? String(s.package._id) : (s?.package ? String(s.package) : null);
        const pName = typeof s?.package?.name === 'string' ? s.package.name : (typeof s?.package === 'string' ? s.package : null);
        return pId === String(packageId) || pName === String(packageId);
      });
      if (!matchesLatest && !matchesAny) return false;
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
      const hasCoachLog = logs.some((l) => /coach|couch/i.test(l.text || '') || l.createdBy?.role?.toLowerCase().includes('coach'));
      const hasCoachTransfer = logs.length > 0 && (hasCoachLog || Boolean(member.current_couch));
      if (!hasCoachTransfer) return false;
    } else if (transferType === 'sales') {
      const hasSalesLog = logs.some((l) => /sales|salesman|sales rep/i.test(l.text || '') || l.createdBy?.role?.toLowerCase().includes('sales'));
      const hasSalesTransfer = logs.length > 0 && (hasSalesLog || Boolean(member.assignedSales));
      if (!hasSalesTransfer) return false;
    }

    // 7. Date Period Filter (From / To)
    if (fromTime || toTime) {
      const sub = latestSubscription(member);
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
      const mid = String(member.memberId ?? '').toLowerCase();
      const sName = salesmanName(member).toLowerCase();
      const smName = salesName(member).toLowerCase();
      const cName = coachName(member).toLowerCase();
      const transferText = logs.map((l) => l.text).join(' ').toLowerCase();

      return (
        name.includes(q)
        || phone.includes(q)
        || sid.includes(q)
        || formattedSid.includes(q)
        || mid.includes(q)
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
  const fromTime = parseDateBoundary(dateFrom);
  const toTime = parseDateBoundary(dateTo, true);

  return tasks.filter((task) => {
    // Role filter
    if (role && role !== 'all') {
      const taskRole = String(task.targetRole || task.assignedTo?.role || '');
      const assignedRole = String(task.assignedTo?.role || '');
      const isSales = ['sales', 'sales manager'].includes(taskRole.toLowerCase())
        || ['sales', 'sales manager'].includes(assignedRole.toLowerCase());
      const isCoach = ['coach', 'coach manager'].includes(taskRole.toLowerCase())
        || ['coach', 'coach manager'].includes(assignedRole.toLowerCase());
      if (role === 'Sales' && !isSales) return false;
      if (role === 'Coach' && !isCoach) return false;
    }

    // Person picker filter (specific sales rep or coach)
    if (personId && personId !== 'all') {
      const assignedId = task.assignedTo?._id || task.assignedTo;
      if (String(assignedId) !== String(personId)) return false;
    }

    // Task status filter
    if (status && status !== 'all') {
      const s = String(status).toLowerCase();
      const taskStatus = String(task.status || '').toLowerCase();
      const total = task.totalCount || task.members?.length || 0;
      const done = task.completedCount || (task.members || []).filter((m) => m.status === 'completed').length;
      const isCompleted = taskStatus === 'completed' || (total > 0 && done >= total);
      const isPending = taskStatus === 'pending' || (done === 0);
      const isInProgress = taskStatus === 'in_progress' || (done > 0 && done < total);

      if (s === 'completed' && !isCompleted) return false;
      if (s === 'pending' && !isPending) return false;
      if (s === 'in_progress' && !isInProgress) return false;
    }

    // Transfer type filter
    if (transferType && transferType !== 'all') {
      if (String(task.transferType || '').toLowerCase() !== String(transferType).toLowerCase()) return false;
    }

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
    if (memberStatus && memberStatus !== 'all') {
      const targetMemberStatus = memberStatus.toLowerCase();
      const hasStatus = (task.members || []).some((m) => {
        if (targetMemberStatus === 'blocked') {
          return Boolean(m.member?.isBlocked);
        }
        const s = String(m.member?.status || '').toLowerCase();
        return s === targetMemberStatus;
      });
      if (!hasStatus) return false;
    }

    // Package filter
    if (packageId && packageId !== 'all') {
      const hasPkg = (task.members || []).some((m) => {
        const memberObj = m.member && typeof m.member === 'object' ? m.member : null;
        const subs = Array.isArray(memberObj?.subscriptions) ? memberObj.subscriptions : [];
        return subs.some((sub) => {
          const pId = sub?.package?._id ? String(sub.package._id) : (sub?.package ? String(sub.package) : null);
          const pName = typeof sub?.package?.name === 'string' ? sub.package.name : (typeof sub?.package === 'string' ? sub.package : null);
          return pId === String(packageId) || pName === String(packageId);
        });
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
        const mid = String(m.member?.memberId ?? '').toLowerCase();
        const notes = String(m.notes || '').toLowerCase();
        return (
          name.includes(mSearch)
          || phone.includes(mSearch)
          || sid.includes(mSearch)
          || formattedSid.includes(mSearch)
          || mid.includes(mSearch)
          || notes.includes(mSearch)
        );
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
  const fromTime = parseDateBoundary(dateFrom);
  const toTime = parseDateBoundary(dateTo, true);

  return history.filter((item) => {
    // 1. Assigned By filter (who assigned these tasks)
    if (assignedBy && assignedBy !== 'all') {
      const byId = item.assignedBy?._id || item.assignedBy;
      if (String(byId) !== String(assignedBy)) return false;
    }

    // 2. Status filter
    if (status && status !== 'all') {
      if (String(item.status || '').toLowerCase() !== String(status).toLowerCase()) return false;
    }

    // 3. Transfer type filter
    if (transferType && transferType !== 'all') {
      if (String(item.transferType || '').toLowerCase() !== String(transferType).toLowerCase()) return false;
    }

    // 4. Member status filter
    if (memberStatus && memberStatus !== 'all') {
      const target = memberStatus.toLowerCase();
      if (target === 'blocked') {
        if (!item.member?.isBlocked) return false;
      } else {
        const s = String(item.member?.status || '').toLowerCase();
        if (s !== target) return false;
      }
    }

    // 5. Package filter
    if (packageId && packageId !== 'all') {
      const pkgId = item.member?.packageId ? String(item.member.packageId) : null;
      const pkgName = item.member?.package ? String(item.member.package) : null;
      if (pkgId !== String(packageId) && pkgName !== String(packageId)) return false;
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
      const mid = String(item.member?.memberId ?? '').toLowerCase();
      const byName = String(item.assignedBy?.name || '').toLowerCase();
      const byRole = String(item.assignedBy?.role || '').toLowerCase();
      const notes = String(item.notes || '').toLowerCase();
      const taskTitle = String(item.taskTitle || '').toLowerCase();

      return (
        name.includes(q)
        || phone.includes(q)
        || sid.includes(q)
        || formattedSid.includes(q)
        || mid.includes(q)
        || byName.includes(q)
        || byRole.includes(q)
        || notes.includes(q)
        || taskTitle.includes(q)
      );
    }

    return true;
  });
}

export const SELECTION_TEMPLATES = [
  // Top/First Count Templates
  { id: 'first_10', label: 'First 10 members', shortLabel: 'First 10', count: 10, group: 'First / Top' },
  { id: 'first_20', label: 'First 20 members', shortLabel: 'First 20', count: 20, group: 'First / Top' },
  { id: 'first_30', label: 'First 30 members', shortLabel: 'First 30', count: 30, group: 'First / Top' },
  { id: 'first_50', label: 'First 50 members', shortLabel: 'First 50', count: 50, group: 'First / Top' },

  // Bottom/Last Count Templates
  { id: 'last_10', label: 'Last 10 members', shortLabel: 'Last 10', count: 10, group: 'Last / Bottom' },
  { id: 'last_20', label: 'Last 20 members', shortLabel: 'Last 20', count: 20, group: 'Last / Bottom' },
  { id: 'last_30', label: 'Last 30 members', shortLabel: 'Last 30', count: 30, group: 'Last / Bottom' },
  { id: 'last_50', label: 'Last 50 members', shortLabel: 'Last 50', count: 50, group: 'Last / Bottom' },

  // Random Selection Templates
  { id: 'random_10', label: 'Random 10 members', shortLabel: 'Random 10', count: 10, group: 'Random Sample' },
  { id: 'random_20', label: 'Random 20 members', shortLabel: 'Random 20', count: 20, group: 'Random Sample' },
  { id: 'random_30', label: 'Random 30 members', shortLabel: 'Random 30', count: 30, group: 'Random Sample' },

  // Membership Status Templates
  { id: 'status_active', label: 'Active members only', shortLabel: 'Active Only', group: 'Member Status' },
  { id: 'status_expired', label: 'Expired members only', shortLabel: 'Expired Only', group: 'Member Status' },
  { id: 'status_frozen', label: 'Frozen members only', shortLabel: 'Frozen Only', group: 'Member Status' },
  { id: 'status_guest', label: 'Guest members only', shortLabel: 'Guest Only', group: 'Member Status' },

  // Assignment & Transfer Templates
  { id: 'unassigned_sales', label: 'Unassigned Sales Rep', shortLabel: 'No Sales Rep', group: 'Assignment' },
  { id: 'unassigned_coach', label: 'Unassigned Coach', shortLabel: 'No Coach', group: 'Assignment' },
  { id: 'never_transferred', label: 'Never transferred before', shortLabel: 'Never Transferred', group: 'Transfer Status' },
  { id: 'transferred_before', label: 'Previously transferred', shortLabel: 'Transferred Before', group: 'Transfer Status' },

  // General Selection
  { id: 'all_filtered', label: 'All filtered members', shortLabel: 'Select All', group: 'General' },
];

export function applySelectionTemplate(members = [], templateId, options = {}) {
  if (!Array.isArray(members) || !members.length) return [];

  const list = [...members];
  const customCount = Number(options.count);

  switch (templateId) {
    case 'first_10':
      return list.slice(0, 10).map((m) => m._id);
    case 'first_20':
      return list.slice(0, 20).map((m) => m._id);
    case 'first_30':
      return list.slice(0, 30).map((m) => m._id);
    case 'first_50':
      return list.slice(0, 50).map((m) => m._id);

    case 'last_10':
      return list.slice(Math.max(0, list.length - 10)).map((m) => m._id);
    case 'last_20':
      return list.slice(Math.max(0, list.length - 20)).map((m) => m._id);
    case 'last_30':
      return list.slice(Math.max(0, list.length - 30)).map((m) => m._id);
    case 'last_50':
      return list.slice(Math.max(0, list.length - 50)).map((m) => m._id);

    case 'custom_first': {
      const c = Number.isFinite(customCount) && customCount > 0 ? customCount : 10;
      return list.slice(0, c).map((m) => m._id);
    }

    case 'custom_last': {
      const c = Number.isFinite(customCount) && customCount > 0 ? customCount : 10;
      return list.slice(Math.max(0, list.length - c)).map((m) => m._id);
    }

    case 'random_10':
    case 'random_20':
    case 'random_30':
    case 'custom_random': {
      const targetCount = templateId === 'random_10' ? 10
        : templateId === 'random_20' ? 20
        : templateId === 'random_30' ? 30
        : (Number.isFinite(customCount) && customCount > 0 ? customCount : 10);

      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, targetCount).map((m) => m._id);
    }

    case 'status_active':
      return list.filter((m) => String(m.status || '').toLowerCase() === 'active').map((m) => m._id);

    case 'status_expired':
      return list.filter((m) => String(m.status || '').toLowerCase() === 'expired').map((m) => m._id);

    case 'status_frozen':
      return list.filter((m) => String(m.status || '').toLowerCase() === 'frozen').map((m) => m._id);

    case 'status_guest':
      return list.filter((m) => String(m.status || '').toLowerCase() === 'guest').map((m) => m._id);

    case 'unassigned_sales':
      return list.filter((m) => !m.assignedSales || (typeof m.assignedSales === 'object' && !m.assignedSales._id && !m.assignedSales.name)).map((m) => m._id);

    case 'unassigned_coach':
      return list.filter((m) => !m.current_couch || (typeof m.current_couch === 'object' && !m.current_couch._id && !m.current_couch.name)).map((m) => m._id);

    case 'never_transferred':
      return list.filter((m) => {
        const logs = getTransferLogs(m);
        const hasHistory = Array.isArray(m.transferHistory) && m.transferHistory.length > 0;
        return logs.length === 0 && !hasHistory;
      }).map((m) => m._id);

    case 'transferred_before':
      return list.filter((m) => {
        const logs = getTransferLogs(m);
        const hasHistory = Array.isArray(m.transferHistory) && m.transferHistory.length > 0;
        return logs.length > 0 || hasHistory;
      }).map((m) => m._id);

    case 'all_filtered':
      return list.map((m) => m._id);

    case 'clear':
      return [];

    default:
      return [];
  }
}

export function invertSelection(members = [], currentSelected = new Set()) {
  const currentSet = currentSelected instanceof Set ? currentSelected : new Set(currentSelected);
  const inverted = [];
  (members || []).forEach((m) => {
    if (m?._id && !currentSet.has(m._id)) {
      inverted.push(m._id);
    }
  });
  return inverted;
}


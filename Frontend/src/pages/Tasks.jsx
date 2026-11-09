import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../hooks/usePageTitle';
import Layout from '../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Textarea, Modal, Input, Tabs, FilterTabs,
} from '../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getWhatsAppTemplates, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, switchSalesRep, switchCoach, sendWhatsAppMessage,
  getCreatedTasks, getAssignedTaskHistory, completeMemberTask,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { applyWhatsAppPlaceholders, composeWhatsAppTemplateMessage, toWhatsAppUrl } from '../utils/whatsapp';
import {
  EXPORT_COLUMNS, buildExcel, columnsForExport,
  columnValue, memberPhone, taskPermissions, toggleId, toggleIds,
  canUserAssignTasks, formatTaskDateTime, filterTaskHistory, filterMembersAdvanced,
  filterCreatedTasks, filterAssignedHistoryAdvanced, packageName,
} from './tasks/taskMembers';

const DEFAULT_COLUMNS = ['name', 'systemId', 'phone', 'status', 'salesman', 'coach', 'package', 'endDate', 'transfers'];
const BULK_COOLDOWN_SECONDS = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadExcel(filename, columns, rows) {
  const blob = new Blob([buildExcel(columns, rows)], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadAssigned(scope = {}) {
  const members = [];
  let page = 1;
  for (;;) {
    const params = { page, limit: 100, sortBy: 'name', sortDir: 1, ...scope };
    const res = await getAllMembers(params);
    members.push(...(res.data.members ?? []));
    const totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
    if (page > totalPages || page > 40) break;
  }
  return members;
}

export default function Tasks() {
  usePageTitle('Tasks');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const canAssign = canUserAssignTasks(user);
  const [viewMode, setViewMode] = useState(() => (canAssign ? 'schedule' : 'my_tasks'));
  const [assigneeTab, setAssigneeTab] = useState('active'); // 'active' | 'history'

  // ── Reference Data ──
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [allPackages, setAllPackages] = useState([]);

  // ── Assigner Schedule & Filter State ──
  const [kind, setKind] = useState('all'); // 'all' | 'sales' | 'coach' | 'unassigned_sales' | 'unassigned_coach'
  const [personId, setPersonId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [transferTypeFilter, setTransferTypeFilter] = useState('all');
  const [dateField, setDateField] = useState('endDate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(DEFAULT_COLUMNS);
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [quickId, setQuickId] = useState('');
  const [busy, setBusy] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  // ── Assigner History Modal State ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createdTasks, setCreatedTasks] = useState([]);
  const [loadingCreatedTasks, setLoadingCreatedTasks] = useState(false);

  // ── Assignee State (Sales & Coaches) ──
  const [assignedHistory, setAssignedHistory] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyAssignedBy, setHistoryAssignedBy] = useState('all');
  const [historyPackageFilter, setHistoryPackageFilter] = useState('all');
  const [historyTransferType, setHistoryTransferType] = useState('all');
  const [historyMemberStatus, setHistoryMemberStatus] = useState('all');
  const [historyDateField, setHistoryDateField] = useState('assignedAt');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMoreFiltersOpen, setHistoryMoreFiltersOpen] = useState(false);
  const [completingId, setCompletingId] = useState(null);

  const { canSalesman, canCoach, canWhatsApp } = taskPermissions(user, hasFeature);

  useEffect(() => {
    getSalesUsers().then((res) => setSalesUsers(res.data.salesUsers ?? [])).catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((person) => ['Coach', 'Coach Manager'].includes(person.role)));
      })
      .catch(() => {});
    getPackages({ limit: 100 })
      .then((res) => setAllPackages(res.data.packages ?? []))
      .catch(() => {});
  }, []);

  const fetchAssignedHistory = useCallback(async () => {
    setLoadingAssigned(true);
    try {
      const res = await getAssignedTaskHistory();
      setAssignedHistory(res.data.history ?? []);
    } catch {
      toast.error('Failed to load assigned tasks');
    } finally {
      setLoadingAssigned(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'my_tasks' || !canAssign) {
      fetchAssignedHistory();
    }
  }, [viewMode, canAssign, fetchAssignedHistory]);

  const fetchCreatedTasks = useCallback(async () => {
    setLoadingCreatedTasks(true);
    try {
      const res = await getCreatedTasks();
      setCreatedTasks(res.data.tasks ?? []);
    } catch {
      toast.error('Failed to load tasks history');
    } finally {
      setLoadingCreatedTasks(false);
    }
  }, []);

  const openTasksHistoryModal = () => {
    setHistoryOpen(true);
    fetchCreatedTasks();
  };

  const handleCompleteMember = async (taskId, memberId) => {
    setCompletingId(memberId);
    try {
      await completeMemberTask(taskId, memberId);
      toast.success('Member marked as completed');
      fetchAssignedHistory();
      if (historyOpen) fetchCreatedTasks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to complete task');
    } finally {
      setCompletingId(null);
    }
  };

  const people = kind === 'sales'
    ? salesUsers.filter((person) => person.role === 'Sales')
    : coaches;

  const showMembers = useCallback(async (currentKind, currentPerson) => {
    setLoading(true);
    setLoaded(true);
    try {
      const scopeParams = {};
      if (currentKind === 'sales' && currentPerson) scopeParams.assignedSales = currentPerson;
      else if (currentKind === 'coach' && currentPerson) scopeParams.currentCouch = currentPerson;
      else if (currentKind === 'unassigned_sales') scopeParams.unassignedSales = 'true';
      else if (currentKind === 'unassigned_coach') scopeParams.unassignedCoach = 'true';

      const list = await loadAssigned(scopeParams);
      setMembers(list);
      setSelected(new Set());
    } catch {
      setMembers([]);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on initial view or when scope changes
  useEffect(() => {
    if (canAssign && viewMode === 'schedule') {
      if (kind === 'sales' || kind === 'coach') {
        if (personId) showMembers(kind, personId);
        else { setMembers([]); setLoaded(false); }
      } else {
        showMembers(kind, '');
      }
    }
  }, [canAssign, viewMode, kind, personId, showMembers]);

  // Comprehensive Client-side Filtering
  const filtered = useMemo(() => {
    return filterMembersAdvanced(members, {
      search,
      status: statusFilter,
      kind,
      personId,
      dateField,
      dateFrom,
      dateTo,
      transferType: transferTypeFilter,
      packageId: packageFilter,
      gender: genderFilter,
    });
  }, [members, search, statusFilter, kind, personId, dateField, dateFrom, dateTo, transferTypeFilter, packageFilter, genderFilter]);

  const visibleColumns = EXPORT_COLUMNS.filter((col) => visibleKeys.includes(col.key));
  const selectedMembers = members.filter((member) => selected.has(member._id));
  const person = people.find((item) => item._id === personId);

  // Count by status for quick tabs
  const statusCounts = useMemo(() => {
    const counts = { all: members.length, active: 0, expired: 0, frozen: 0, guest: 0, blocked: 0 };
    members.forEach((m) => {
      if (m.isBlocked) counts.blocked += 1;
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    });
    return counts;
  }, [members]);

  const exportSheet = () => {
    const columns = columnsForExport(visibleKeys);
    const rows = selectedMembers.length ? selectedMembers : filtered;
    if (!rows.length) {
      toast.error('Nothing to export');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    downloadExcel(`tasks-members-${day}.xls`, columns, rows);
    toast.success(`Exported ${rows.length} member(s)`);
  };

  const refresh = () => showMembers(kind, personId);

  const transferBulk = async () => {
    if (!selected.size) {
      toast.error('Select at least one member');
      return;
    }
    if (!destId) {
      toast.error('Choose who receives the members');
      return;
    }
    setBusy(true);
    try {
      if (destKind === 'coach') {
        const res = await bulkTransferCoach({
          coachId: destId,
          memberIds: [...selected],
          isTask: true,
          source: 'tasks',
        });
        toast.success(`Transferred ${res.data.transferredCount ?? selected.size} member(s) as a task`);
      } else {
        const res = await bulkTransferSalesReps({
          toSalesRepId: destId,
          memberIds: [...selected],
          isTask: true,
          source: 'tasks',
        });
        toast.success(`Transferred ${res.data.transferredCount} member(s) as a task`);
      }
      setSelected(new Set());
      setTransferOpen(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const transferQuick = async () => {
    const id = quickId.trim();
    if (!id || !destId) {
      toast.error('Enter a system id and a destination');
      return;
    }
    setBusy(true);
    try {
      if (destKind === 'coach') {
        await switchCoach(id, destId, { isTask: true, source: 'tasks' });
        toast.success('Member transferred to the coach as a task');
      } else {
        await switchSalesRep(id, destId, { isTask: true, source: 'tasks' });
        toast.success('Member transferred to the sales rep as a task');
      }
      setQuickId('');
      setTransferOpen(false);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const destPeople = destKind === 'coach'
    ? coaches
    : salesUsers.filter((item) => item.role === 'Sales' || item.role === 'Sales Manager');

  // Quick Date Range Setters
  const setQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'next7') {
      const from = new Date(now);
      const to = new Date(now);
      to.setDate(to.getDate() + 7);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(to.toISOString().slice(0, 10));
    } else if (preset === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(to.toISOString().slice(0, 10));
    } else if (preset === 'last30') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  // Select all currently filtered members
  const handleSelectAllFiltered = () => {
    const ids = filtered.map((m) => m._id);
    setSelected((prev) => toggleIds(prev, ids));
  };

  const isAllFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m._id));

  // Unique assigners list for Assignee History filter
  const uniqueAssigners = useMemo(() => {
    const map = new Map();
    assignedHistory.forEach((item) => {
      if (item.assignedBy?._id) {
        map.set(String(item.assignedBy._id), item.assignedBy);
      }
    });
    return Array.from(map.values());
  }, [assignedHistory]);

  const setHistoryQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') {
      setHistoryDateFrom('');
      setHistoryDateTo('');
      return;
    }
    if (preset === 'last7') {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      setHistoryDateFrom(from.toISOString().slice(0, 10));
      setHistoryDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setHistoryDateFrom(from.toISOString().slice(0, 10));
      setHistoryDateTo(to.toISOString().slice(0, 10));
    } else if (preset === 'last30') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      setHistoryDateFrom(from.toISOString().slice(0, 10));
      setHistoryDateTo(now.toISOString().slice(0, 10));
    }
  };

  const resetAssigneeHistoryFilters = () => {
    setHistorySearch('');
    setHistoryStatusFilter('all');
    setHistoryAssignedBy('all');
    setHistoryPackageFilter('all');
    setHistoryTransferType('all');
    setHistoryMemberStatus('all');
    setHistoryDateField('assignedAt');
    setHistoryDateFrom('');
    setHistoryDateTo('');
  };

  const hasActiveAssigneeFilters = (
    historySearch.trim() !== ''
    || historyStatusFilter !== 'all'
    || historyAssignedBy !== 'all'
    || historyPackageFilter !== 'all'
    || historyTransferType !== 'all'
    || historyMemberStatus !== 'all'
    || Boolean(historyDateFrom)
    || Boolean(historyDateTo)
  );

  // Filtered assigned members for assignees
  const activeAssignedMembers = useMemo(() => (
    assignedHistory.filter((item) => item.status === 'pending')
  ), [assignedHistory]);

  const filteredHistory = useMemo(() => (
    filterAssignedHistoryAdvanced(assignedHistory, {
      assignedBy: historyAssignedBy,
      status: historyStatusFilter,
      packageId: historyPackageFilter,
      transferType: historyTransferType,
      memberStatus: historyMemberStatus,
      dateField: historyDateField,
      dateFrom: historyDateFrom,
      dateTo: historyDateTo,
      search: historySearch,
    })
  ), [
    assignedHistory,
    historyAssignedBy,
    historyStatusFilter,
    historyPackageFilter,
    historyTransferType,
    historyMemberStatus,
    historyDateField,
    historyDateFrom,
    historyDateTo,
    historySearch,
  ]);

  return (
    <Layout>
      <PageHeader title="Tasks">
        {canAssign && (
          <Btn variant="outline" size="sm" onClick={openTasksHistoryModal}>
            📋 View Tasks History
          </Btn>
        )}
        {viewMode === 'schedule' && loaded && (
          <>
            <Btn variant="outline" size="sm" onClick={() => setColumnsOpen((open) => !open)}>Columns</Btn>
            <Btn variant="outline" size="sm" onClick={exportSheet} disabled={loading || !filtered.length}>Export Excel</Btn>
          </>
        )}
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toggle between Assign/Schedule and My Tasks if user can assign */}
        {canAssign && (
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Btn
              size="sm"
              variant={viewMode === 'schedule' ? 'primary' : 'ghost'}
              onClick={() => setViewMode('schedule')}
            >
              Assign Tasks & Member Schedule
            </Btn>
            <Btn
              size="sm"
              variant={viewMode === 'my_tasks' ? 'primary' : 'ghost'}
              onClick={() => setViewMode('my_tasks')}
            >
              My Tasks {activeAssignedMembers.length > 0 && `(${activeAssignedMembers.length})`}
            </Btn>
          </div>
        )}

        {/* ── ASSIGNEE VIEW: MY TASKS & HISTORY ── */}
        {(viewMode === 'my_tasks' || !canAssign) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Tabs
              tabs={[
                { id: 'active', label: `Active Tasks (${activeAssignedMembers.length})` },
                { id: 'history', label: `Tasks History (${assignedHistory.length})` },
              ]}
              active={assigneeTab}
              onChange={setAssigneeTab}
            />

            {assigneeTab === 'active' ? (
              <Card noPad>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Active Assigned Members</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                      Members assigned to you as tasks. Click &quot;Mark Completed&quot; once you have contacted or processed them.
                    </p>
                  </div>
                  <Btn size="xs" variant="ghost" onClick={fetchAssignedHistory} disabled={loadingAssigned}>
                    Refresh
                  </Btn>
                </div>

                {loadingAssigned ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
                ) : activeAssignedMembers.length === 0 ? (
                  <EmptyState icon="🎉" message="No pending tasks" sub="You have no members waiting to be processed." />
                ) : (
                  <div className="table-responsive-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned By</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned At</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAssignedMembers.map((item) => {
                          const sid = item.member?.systemId;
                          return (
                            <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 14px' }}>
                                <span
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: sid ? 'pointer' : 'default' }}
                                  onClick={() => sid && navigate(`/members/${sid}`)}
                                >
                                  <Avatar name={item.member?.name || 'Member'} size="sm" />
                                  <span>{item.member?.name}</span>
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                #{item.member?.systemId || '—'}
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                {item.member?.phone || '—'}
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({item.assignedBy?.role || 'Manager'})</span>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                                {formatTaskDateTime(item.assignedAt)}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <Badge status="pending" />
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                <Btn
                                  size="xs"
                                  variant="success"
                                  disabled={completingId === (item.member?._id || item._id)}
                                  onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                                >
                                  {completingId === (item.member?._id || item._id) ? <Spinner size="sm" /> : '✓ Mark Completed'}
                                </Btn>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : (
              <Card noPad>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Assigned Members History</h3>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
                        Complete history of members assigned to your account, with timestamps when marked as completed.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Btn size="xs" variant="outline" onClick={() => setHistoryMoreFiltersOpen((o) => !o)}>
                        {historyMoreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}
                      </Btn>
                      {hasActiveAssigneeFilters && (
                        <Btn size="xs" variant="ghost" onClick={resetAssigneeHistoryFilters}>
                          ✕ Reset Filters
                        </Btn>
                      )}
                      <Btn size="xs" variant="ghost" onClick={fetchAssignedHistory} disabled={loadingAssigned}>
                        Refresh
                      </Btn>
                    </div>
                  </div>

                  {/* Primary Filter Row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Search Member</label>
                      <input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search member, phone, ID, notes…"
                        aria-label="Search task history"
                        style={{
                          width: '100%', padding: '7px 11px', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                      <Select
                        label="Assigned By"
                        value={historyAssignedBy}
                        onChange={(e) => setHistoryAssignedBy(e.target.value)}
                      >
                        <option value="all">All Assigners</option>
                        {uniqueAssigners.map((assigner) => (
                          <option key={assigner._id} value={assigner._id}>
                            {assigner.name} ({assigner.role || 'Manager'})
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                      <FilterTabs
                        options={[
                          { id: 'all', label: 'All' },
                          { id: 'completed', label: 'Completed' },
                          { id: 'pending', label: 'Pending' },
                        ]}
                        active={historyStatusFilter}
                        onChange={setHistoryStatusFilter}
                      />
                    </div>
                  </div>

                  {/* Secondary Advanced Filters */}
                  {historyMoreFiltersOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                          <Select
                            label="Package"
                            value={historyPackageFilter}
                            onChange={(e) => setHistoryPackageFilter(e.target.value)}
                          >
                            <option value="all">All Packages</option>
                            {allPackages.map((pkg) => (
                              <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                            ))}
                          </Select>
                        </div>

                        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                          <Select
                            label="Transfer Type"
                            value={historyTransferType}
                            onChange={(e) => setHistoryTransferType(e.target.value)}
                          >
                            <option value="all">All Transfer Types</option>
                            <option value="bulk">Bulk Transfer</option>
                            <option value="quick">Quick Transfer</option>
                          </Select>
                        </div>

                        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                          <Select
                            label="Member Status"
                            value={historyMemberStatus}
                            onChange={(e) => setHistoryMemberStatus(e.target.value)}
                          >
                            <option value="all">All Member Statuses</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                            <option value="frozen">Frozen</option>
                            <option value="guest">Guest</option>
                          </Select>
                        </div>
                      </div>

                      {/* Period Filter */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                          <Select
                            label="Filter By Period For"
                            value={historyDateField}
                            onChange={(e) => setHistoryDateField(e.target.value)}
                          >
                            <option value="assignedAt">Assigned Date</option>
                            <option value="completedAt">Completed Date</option>
                            <option value="endDate">Subscription Expiry Date</option>
                          </Select>
                        </div>

                        <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period From</label>
                          <input
                            type="date"
                            value={historyDateFrom}
                            onChange={(e) => setHistoryDateFrom(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 10px', borderRadius: 6,
                              border: '1px solid var(--border)', background: 'var(--card)',
                              color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                            }}
                          />
                        </div>

                        <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period To</label>
                          <input
                            type="date"
                            value={historyDateTo}
                            onChange={(e) => setHistoryDateTo(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 10px', borderRadius: 6,
                              border: '1px solid var(--border)', background: 'var(--card)',
                              color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Btn size="xs" variant="outline" onClick={() => setHistoryQuickPeriod('last7')}>Last 7 Days</Btn>
                          <Btn size="xs" variant="outline" onClick={() => setHistoryQuickPeriod('thisMonth')}>This Month</Btn>
                          <Btn size="xs" variant="outline" onClick={() => setHistoryQuickPeriod('last30')}>Last 30 Days</Btn>
                          {(historyDateFrom || historyDateTo) && (
                            <Btn size="xs" variant="ghost" onClick={() => setHistoryQuickPeriod('clear')}>✕ Clear</Btn>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {hasActiveAssigneeFilters && (
                    <div style={{ fontSize: 12, color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Showing <strong>{filteredHistory.length}</strong> of <strong>{assignedHistory.length}</strong> assigned records</span>
                    </div>
                  )}
                </div>

                {loadingAssigned ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
                ) : filteredHistory.length === 0 ? (
                  <EmptyState
                    icon="📋"
                    message={assignedHistory.length === 0 ? 'No history found' : 'No records match your filters'}
                    sub={assignedHistory.length === 0 ? 'Assigned members and their completion timestamps will appear here.' : 'Try adjusting or clearing your filters to see assigned members.'}
                  />
                ) : (
                  <div className="table-responsive-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Package</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member Status</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned By</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Assigned Date</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Task Status</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Completed Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.map((item) => {
                          const sid = item.member?.systemId;
                          return (
                            <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 14px' }}>
                                <span
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: sid ? 'pointer' : 'default' }}
                                  onClick={() => sid && navigate(`/members/${sid}`)}
                                >
                                  <Avatar name={item.member?.name || 'Member'} size="sm" />
                                  <span>{item.member?.name}</span>
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                #{item.member?.systemId || '—'}
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                {item.member?.phone || '—'}
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                {item.member?.package || '—'}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <Badge status={item.member?.status || 'active'} />
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                {item.assignedBy?.name} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({item.assignedBy?.role || 'Manager'})</span>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                                {formatTaskDateTime(item.assignedAt)}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <Badge status={item.status} />
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: 12 }}>
                                {item.status === 'completed' && item.completedAt ? (
                                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                                    ✓ {formatTaskDateTime(item.completedAt)}
                                  </span>
                                ) : (
                                  <Btn
                                    size="xs"
                                    variant="outline"
                                    disabled={completingId === (item.member?._id || item._id)}
                                    onClick={() => handleCompleteMember(item.taskId, item.member?._id || item._id)}
                                  >
                                    Mark Done
                                  </Btn>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── ASSIGNER VIEW: COMPREHENSIVE FILTERING & TASK ASSIGNMENT ── */}
        {viewMode === 'schedule' && canAssign && (
          <>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Row 1: Scope / Assignee Selection */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <Select
                      label="Show members scope"
                      value={kind}
                      onChange={(e) => {
                        const next = e.target.value;
                        setKind(next);
                        setPersonId('');
                      }}
                    >
                      <option value="all">All Members in Gym</option>
                      <option value="sales">Assigned to a sales rep</option>
                      <option value="coach">Assigned to a coach</option>
                      <option value="unassigned_sales">Unassigned (No Sales Rep)</option>
                      <option value="unassigned_coach">Unassigned (No Coach)</option>
                    </Select>
                  </div>

                  {(kind === 'sales' || kind === 'coach') && (
                    <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                      <Select
                        label={kind === 'sales' ? 'Sales representative' : 'Coach'}
                        value={personId}
                        onChange={(e) => setPersonId(e.target.value)}
                      >
                        <option value="">Choose person…</option>
                        {people.map((item) => (
                          <option key={item._id} value={item._id}>{item.name} ({item.role})</option>
                        ))}
                      </Select>
                    </div>
                  )}

                  {/* Transfer Filter */}
                  <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <Select
                      label="Transfer history type"
                      value={transferTypeFilter}
                      onChange={(e) => setTransferTypeFilter(e.target.value)}
                    >
                      <option value="all">All Transfer Types</option>
                      <option value="transferred">Transferred Members Only</option>
                      <option value="never">Never Transferred</option>
                      <option value="bulk">Bulk Transferred</option>
                      <option value="sales">Transferred to Sales Rep</option>
                      <option value="coach">Transferred to Coach</option>
                    </Select>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Btn
                      size="sm"
                      variant="outline"
                      onClick={() => setMoreFiltersOpen((o) => !o)}
                    >
                      {moreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={refresh} disabled={loading}>
                      Refresh
                    </Btn>
                  </div>
                </div>

                {/* Row 2: Status Quick Filter Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase' }}>Status:</span>
                  <FilterTabs
                    options={[
                      { id: 'all', label: `All (${statusCounts.all})` },
                      { id: 'active', label: `Active (${statusCounts.active})` },
                      { id: 'expired', label: `Expired (${statusCounts.expired})` },
                      { id: 'frozen', label: `Frozen (${statusCounts.frozen})` },
                      { id: 'guest', label: `Guest (${statusCounts.guest})` },
                      { id: 'blocked', label: `Blocked (${statusCounts.blocked})` },
                    ]}
                    active={statusFilter}
                    onChange={setStatusFilter}
                  />
                </div>

                {/* Row 3: Period From / To Date Filter Controls */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', background: 'var(--bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                    <Select
                      label="Filter by period for"
                      value={dateField}
                      onChange={(e) => setDateField(e.target.value)}
                    >
                      <option value="endDate">Subscription Expiry Date</option>
                      <option value="startDate">Subscription Start Date</option>
                      <option value="createdAt">Member Joined Date</option>
                      <option value="transferDate">Transfer Log Date</option>
                    </Select>
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  {/* Date Quick Preset Buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('next7')}>Next 7 Days</Btn>
                    <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('thisMonth')}>This Month</Btn>
                    <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('last30')}>Last 30 Days</Btn>
                    {(dateFrom || dateTo) && (
                      <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('clear')}>✕ Clear Period</Btn>
                    )}
                  </div>
                </div>

                {/* Collapsible Row 4: Package, Gender, Source Filters */}
                {moreFiltersOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                      <Select
                        label="Package"
                        value={packageFilter}
                        onChange={(e) => setPackageFilter(e.target.value)}
                      >
                        <option value="all">All Packages</option>
                        {allPackages.map((pkg) => (
                          <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                        ))}
                      </Select>
                    </div>

                    <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                      <Select
                        label="Gender"
                        value={genderFilter}
                        onChange={(e) => setGenderFilter(e.target.value)}
                      >
                        <option value="all">All Genders</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </Select>
                    </div>

                    <Btn
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setPackageFilter('all');
                        setGenderFilter('all');
                        setDateFrom('');
                        setDateTo('');
                        setTransferTypeFilter('all');
                        setStatusFilter('all');
                        setSearch('');
                      }}
                    >
                      Reset All Filters
                    </Btn>
                  </div>
                )}
              </div>
            </Card>

            {columnsOpen && (
              <Card>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginTop: 0 }}>Schedule columns</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 16px' }}>
                  {EXPORT_COLUMNS.map((col) => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)' }}>
                      <input
                        type="checkbox"
                        checked={visibleKeys.includes(col.key)}
                        onChange={() => {
                          setVisibleKeys((prev) => (
                            prev.includes(col.key) ? prev.filter((key) => key !== col.key) : [...prev, col.key]
                          ));
                        }}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </Card>
            )}

            {!loaded ? (
              <Card>
                <EmptyState icon="👥" message="Choose a scope or person" sub="Their members show up here as a schedule you can filter, export, and assign as tasks." />
              </Card>
            ) : (
              <>
                <Card noPad>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '14px 14px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, phone, ID, coach, transfer note…"
                        aria-label="Search members"
                        style={{
                          width: 280, maxWidth: '100%', padding: '8px 12px', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                        }}
                      />
                      {filtered.length > 0 && (
                        <Btn
                          size="xs"
                          variant="outline"
                          onClick={handleSelectAllFiltered}
                        >
                          {isAllFilteredSelected ? 'Deselect All' : `Select All Filtered (${filtered.length})`}
                        </Btn>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {person ? `${person.name} · ` : ''}Showing <strong>{filtered.length}</strong> of {members.length} member(s)
                      {selected.size > 0 && ` (${selected.size} checked)`}
                    </span>
                  </div>

                  {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
                  ) : filtered.length === 0 ? (
                    <EmptyState message="No members match the current filter criteria" sub="Try adjusting your status, period, or transfer filters." />
                  ) : (
                    <div className="table-responsive-container">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                            <th style={{ padding: '9px 14px', width: 36 }}>
                              <input
                                type="checkbox"
                                checked={isAllFilteredSelected}
                                onChange={handleSelectAllFiltered}
                                aria-label="Select all members on this page"
                              />
                            </th>
                            {visibleColumns.map((col) => (
                              <th key={col.key} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{col.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((member) => (
                            <tr
                              key={member._id}
                              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                              onClick={() => navigate(`/members/${member.systemId}`)}
                            >
                              <td style={{ padding: '10px 14px' }} onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected.has(member._id)}
                                  onChange={() => setSelected((prev) => toggleId(prev, member._id))}
                                  aria-label={`Select ${member.name}`}
                                />
                              </td>
                              {visibleColumns.map((col) => (
                                <td key={col.key} style={{ padding: '10px 14px', color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                                  {col.key === 'name' ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)' }}>
                                      <Avatar name={member.name} size="sm" />
                                      {member.name}
                                      <Badge status={member.status} />
                                    </span>
                                  ) : col.key === 'transfers' ? (
                                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                                      {columnValue(member, col.key)}
                                    </span>
                                  ) : (columnValue(member, col.key) || '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                {/* Bottom Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 600 }}>
                    {selected.size > 0 ? (
                      <span>✓ {selected.size} member(s) selected for task assignment</span>
                    ) : (
                      <span style={{ color: 'var(--t4)' }}>Check members above to assign them as tasks</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canWhatsApp && (
                      <Btn size="sm" variant="outline" disabled={!selected.size} onClick={() => setWaOpen(true)}>Send bulk WhatsApp</Btn>
                    )}
                    {(canSalesman || canCoach) && (
                      <Btn size="sm" disabled={!selected.size} onClick={() => { setDestKind(canSalesman ? 'sales' : 'coach'); setTransferOpen(true); }}>
                        Transfer as Task ({selected.size})
                      </Btn>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── TRANSFER MODAL ── */}
      <Modal
        open={transferOpen}
        onClose={() => !busy && setTransferOpen(false)}
        title="Transfer as Task"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setTransferOpen(false)} disabled={busy}>Cancel</Btn>
            <Btn size="sm" variant="outline" onClick={transferQuick} disabled={busy}>Quick transfer</Btn>
            <Btn size="sm" onClick={transferBulk} disabled={busy}>{busy ? <Spinner size="sm" /> : `Bulk transfer (${selected.size})`}</Btn>
          </>
        )}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>
          Transfer members to a sales rep or coach as a task. The assignee will receive a task notification and see these members on their Tasks page.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Transfer to" value={destKind} onChange={(e) => { setDestKind(e.target.value); setDestId(''); }}>
            <option value="sales">A sales rep</option>
            <option value="coach">A coach</option>
          </Select>
          <Select label="Person" value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">Choose…</option>
            {destPeople.map((item) => (
              <option key={item._id} value={item._id}>{item.name} ({item.role})</option>
            ))}
          </Select>
          <Input label="Quick transfer system id" value={quickId} onChange={(e) => setQuickId(e.target.value)} placeholder="S100" />
        </div>
      </Modal>

      {/* ── ASSIGNER TASKS HISTORY MODAL ── */}
      <AssignerTasksHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        tasks={createdTasks}
        loading={loadingCreatedTasks}
        onRefresh={fetchCreatedTasks}
        salesUsers={salesUsers}
        coaches={coaches}
        allPackages={allPackages}
      />

      {waOpen && (
        <WhatsAppBulkModal members={selectedMembers} onClose={() => setWaOpen(false)} />
      )}
    </Layout>
  );
}

function AssignerTasksHistoryModal({
  open,
  onClose,
  tasks,
  loading,
  onRefresh,
  salesUsers = [],
  coaches = [],
  allPackages = [],
}) {
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'Sales' | 'Coach'
  const [personIdFilter, setPersonIdFilter] = useState('all');
  const [memberSearchFilter, setMemberSearchFilter] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [transferTypeFilter, setTransferTypeFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState('all');
  const [dateField, setDateField] = useState('createdAt');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const navigate = useNavigate();

  const toggleExpand = (id) => {
    setExpandedTaskId((curr) => (curr === id ? null : id));
  };

  const eligiblePeople = useMemo(() => {
    if (roleFilter === 'Sales') {
      return salesUsers.filter((u) => ['Sales', 'Sales Manager'].includes(u.role));
    }
    if (roleFilter === 'Coach') {
      return coaches.filter((u) => ['Coach', 'Coach Manager'].includes(u.role));
    }
    return [
      ...salesUsers.filter((u) => ['Sales', 'Sales Manager'].includes(u.role)),
      ...coaches.filter((u) => ['Coach', 'Coach Manager'].includes(u.role)),
    ];
  }, [roleFilter, salesUsers, coaches]);

  const handleRoleChange = (newRole) => {
    setRoleFilter(newRole);
    setPersonIdFilter('all');
  };

  const setQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'last7') {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(to.toISOString().slice(0, 10));
    } else if (preset === 'last30') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  const resetFilters = () => {
    setRoleFilter('all');
    setPersonIdFilter('all');
    setMemberSearchFilter('');
    setTaskStatusFilter('all');
    setTransferTypeFilter('all');
    setPackageFilter('all');
    setMemberStatusFilter('all');
    setDateField('createdAt');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = (
    roleFilter !== 'all'
    || personIdFilter !== 'all'
    || memberSearchFilter.trim() !== ''
    || taskStatusFilter !== 'all'
    || transferTypeFilter !== 'all'
    || packageFilter !== 'all'
    || memberStatusFilter !== 'all'
    || Boolean(dateFrom)
    || Boolean(dateTo)
  );

  const filteredTasks = useMemo(() => {
    return filterCreatedTasks(tasks, {
      role: roleFilter,
      personId: personIdFilter,
      memberSearch: memberSearchFilter,
      status: taskStatusFilter,
      transferType: transferTypeFilter,
      packageId: packageFilter,
      memberStatus: memberStatusFilter,
      dateField,
      dateFrom,
      dateTo,
    });
  }, [
    tasks,
    roleFilter,
    personIdFilter,
    memberSearchFilter,
    taskStatusFilter,
    transferTypeFilter,
    packageFilter,
    memberStatusFilter,
    dateField,
    dateFrom,
    dateTo,
  ]);

  const totalMembers = useMemo(() => (
    filteredTasks.reduce((sum, t) => sum + (t.totalCount || t.members?.length || 0), 0)
  ), [filteredTasks]);

  const totalCompleted = useMemo(() => (
    filteredTasks.reduce((sum, t) => sum + (t.completedCount || 0), 0)
  ), [filteredTasks]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tasks Assignment History"
      size="xl"
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
          <Btn variant="outline" size="sm" onClick={onRefresh} disabled={loading}>Refresh</Btn>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Assigner History Filters Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--card)', padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
          {/* Row 1: Role, Person Picker, Member Search, Task Status */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 150px', minWidth: 140 }}>
              <Select
                label="Role"
                value={roleFilter}
                onChange={(e) => handleRoleChange(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="Sales">Sales</option>
                <option value="Coach">Coach</option>
              </Select>
            </div>

            <div style={{ flex: '1 1 200px', minWidth: 180 }}>
              <Select
                label={roleFilter === 'Sales' ? 'Sales Representative' : roleFilter === 'Coach' ? 'Coach' : 'Assigned Staff'}
                value={personIdFilter}
                onChange={(e) => setPersonIdFilter(e.target.value)}
              >
                <option value="all">All Staff</option>
                {eligiblePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name} ({person.role})
                  </option>
                ))}
              </Select>
            </div>

            <div style={{ flex: '1 1 200px', minWidth: 180 }}>
              <Input
                label="Member Picker / Search"
                value={memberSearchFilter}
                onChange={(e) => setMemberSearchFilter(e.target.value)}
                placeholder="Search member name, phone, ID…"
              />
            </div>

            <div style={{ flex: '1 1 150px', minWidth: 140 }}>
              <Select
                label="Task Status"
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
              >
                <option value="all">All Task Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </Select>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Btn
                size="sm"
                variant="outline"
                onClick={() => setMoreFiltersOpen((o) => !o)}
              >
                {moreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}
              </Btn>
              {hasActiveFilters && (
                <Btn size="sm" variant="ghost" onClick={resetFilters}>
                  ✕ Reset
                </Btn>
              )}
            </div>
          </div>

          {/* Collapsible Row 2: Packages, Transfer Type, Member Status, Period From / To */}
          {moreFiltersOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                  <Select
                    label="Package"
                    value={packageFilter}
                    onChange={(e) => setPackageFilter(e.target.value)}
                  >
                    <option value="all">All Packages</option>
                    {allPackages.map((pkg) => (
                      <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                    ))}
                  </Select>
                </div>

                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <Select
                    label="Transfer Type"
                    value={transferTypeFilter}
                    onChange={(e) => setTransferTypeFilter(e.target.value)}
                  >
                    <option value="all">All Transfer Types</option>
                    <option value="bulk">Bulk Transfer</option>
                    <option value="quick">Quick Transfer</option>
                  </Select>
                </div>

                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <Select
                    label="Member Status"
                    value={memberStatusFilter}
                    onChange={(e) => setMemberStatusFilter(e.target.value)}
                  >
                    <option value="all">All Member Statuses</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="frozen">Frozen</option>
                    <option value="guest">Guest</option>
                  </Select>
                </div>
              </div>

              {/* Period Filter */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', background: 'var(--bg)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                  <Select
                    label="Period For"
                    value={dateField}
                    onChange={(e) => setDateField(e.target.value)}
                  >
                    <option value="createdAt">Task Created Date</option>
                    <option value="completedAt">Member Completed Date</option>
                  </Select>
                </div>

                <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Period To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('last7')}>Last 7 Days</Btn>
                  <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('thisMonth')}>This Month</Btn>
                  <Btn size="xs" variant="outline" onClick={() => setQuickPeriod('last30')}>Last 30 Days</Btn>
                  {(dateFrom || dateTo) && (
                    <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('clear')}>✕ Clear</Btn>
                  )}
                </div>
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <div style={{ fontSize: 12, color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Showing <strong>{filteredTasks.length}</strong> of <strong>{tasks.length}</strong> tasks</span>
            </div>
          )}
        </div>

        {/* KPI Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase' }}>Total Tasks</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>{filteredTasks.length}</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase' }}>Assigned Members</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)', marginTop: 2 }}>{totalMembers}</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase' }}>Completed</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>{totalCompleted}</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase' }}>Completion Rate</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>
              {totalMembers > 0 ? `${Math.round((totalCompleted / totalMembers) * 100)}%` : '0%'}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon="📋"
            message={tasks.length === 0 ? 'No tasks created yet' : 'No tasks match your filters'}
            sub={tasks.length === 0 ? 'Tasks you create via bulk or quick transfer will be tracked here.' : 'Try adjusting or clearing your filters to see tasks.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredTasks.map((task) => {
              const isExpanded = expandedTaskId === task._id;
              const count = task.totalCount || task.members?.length || 0;
              const done = task.completedCount || 0;
              return (
                <div
                  key={task._id}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      cursor: 'pointer',
                      background: isExpanded ? 'var(--bg)' : 'transparent',
                    }}
                    onClick={() => toggleExpand(task._id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14 }}>{isExpanded ? '▼' : '▶'}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                          {task.title || 'Task Transfer'}
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t4)', fontWeight: 400 }}>
                            #{task._id?.slice(-6)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                          Assigned to: <strong>{task.assignedTo?.name || 'Staff'}</strong> ({task.assignedTo?.role || task.targetRole}) · Created by {task.createdBy?.name || 'You'} · {formatTaskDateTime(task.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: done === count ? 'var(--green)' : 'var(--t2)' }}>
                          {done} / {count} completed
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase' }}>
                          {task.transferType} transfer
                        </div>
                      </div>
                      <Badge status={task.status} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', background: 'var(--card)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--t4)' }}>
                            <th style={{ padding: '6px 8px' }}>Member</th>
                            <th style={{ padding: '6px 8px' }}>System ID</th>
                            <th style={{ padding: '6px 8px' }}>Phone</th>
                            <th style={{ padding: '6px 8px' }}>Package</th>
                            <th style={{ padding: '6px 8px' }}>Member Status</th>
                            <th style={{ padding: '6px 8px' }}>Task Status</th>
                            <th style={{ padding: '6px 8px' }}>Completed At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(task.members || []).map((m) => {
                            const sid = m.systemId || m.member?.systemId;
                            const pkgName = packageName(m.member) || m.member?.package || '—';
                            const mStatus = m.member?.status || m.status || 'active';
                            return (
                              <tr key={m._id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 8px', fontWeight: 600, color: 'var(--t1)' }}>
                                  <span
                                    style={{ cursor: sid ? 'pointer' : 'default', textDecoration: sid ? 'underline' : 'none' }}
                                    onClick={() => sid && navigate(`/members/${sid}`)}
                                  >
                                    {m.name || m.member?.name || 'Member'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 8px', color: 'var(--t2)' }}>
                                  #{sid || '—'}
                                </td>
                                <td style={{ padding: '8px 8px', color: 'var(--t3)' }}>
                                  {m.phone || m.member?.phones || '—'}
                                </td>
                                <td style={{ padding: '8px 8px', color: 'var(--t2)' }}>
                                  {pkgName}
                                </td>
                                <td style={{ padding: '8px 8px' }}>
                                  <Badge status={mStatus} />
                                </td>
                                <td style={{ padding: '8px 8px' }}>
                                  <Badge status={m.status} />
                                </td>
                                <td style={{ padding: '8px 8px', color: m.status === 'completed' ? 'var(--green)' : 'var(--t4)', fontSize: 11 }}>
                                  {m.status === 'completed' && m.completedAt ? (
                                    <>✓ {formatTaskDateTime(m.completedAt)} {m.completedBy?.name && `by ${m.completedBy.name}`}</>
                                  ) : (
                                    'Pending'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function WhatsAppBulkModal({ members, onClose }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [sending, setSending] = useState(false);
  const [running, setRunning] = useState(false);
  const [waitLeft, setWaitLeft] = useState(0);
  const [needsConnect, setNeedsConnect] = useState(false);
  const stopRef = useRef(false);

  const reachable = useMemo(
    () => members.filter((member) => toWhatsAppUrl(memberPhone(member))),
    [members],
  );
  const current = reachable[cursor] || null;
  const template = templates.find((item) => item._id === templateId) || null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWhatsAppTemplates({ limit: 100 }),
      getPackages({ limit: 100 }),
    ])
      .then(([templateRes, packageRes]) => {
        if (cancelled) return;
        const list = templateRes.data.templates ?? [];
        setTemplates(list);
        setPackages(packageRes.data.packages ?? []);
        const pick = list.find((item) => item.isDefault) || list[0] || null;
        if (pick) setTemplateId(pick._id);
      })
      .catch((err) => {
        if (!cancelled && err?.normalized?.status !== 403) toast.error('Could not load WhatsApp templates');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const composed = useMemo(() => {
    if (!template) return '';
    return composeWhatsAppTemplateMessage(template, packages, { memberName: '{{name}}', language: 'en' });
  }, [template, packages]);

  const draft = dirty ? message : composed;

  useEffect(() => () => { stopRef.current = true; }, []);

  const stopRun = () => { stopRef.current = true; };
  const closeModal = () => { stopRef.current = true; onClose(); };

  const sendAll = async () => {
    if (running || !draft.trim()) return;
    const queue = reachable.slice(cursor);
    const templateText = draft;
    if (!queue.length) return;
    stopRef.current = false;
    setRunning(true);
    setNeedsConnect(false);
    let sent = 0;
    let completed = true;
    for (let i = 0; i < queue.length; i += 1) {
      if (stopRef.current) {
        completed = false;
        break;
      }
      const member = queue[i];
      const text = applyWhatsAppPlaceholders(templateText, member?.name);
      if (!toWhatsAppUrl(memberPhone(member), text)) {
        toast.error(`${member.name} has no WhatsApp number`);
        setCursor((index) => index + 1);
        continue;
      }
      setSending(true);
      let failed = false;
      try {
        await sendWhatsAppMessage({
          phone: memberPhone(member),
          text,
          memberId: member.systemId || member._id,
          memberName: member.name,
          templateId: templateId || null,
        });
        sent += 1;
        toast.success(`Sent to ${member.name}`);
        setCursor((index) => index + 1);
      } catch (err) {
        failed = true;
        const code = err?.normalized?.code;
        if (code === 'WHATSAPP_NOT_CONNECTED') setNeedsConnect(true);
        if (code === 'WHATSAPP_NOT_ON_WHATSAPP') {
          setCursor((index) => index + 1);
          failed = false;
        }
      } finally {
        setSending(false);
      }
      if (failed || stopRef.current) {
        completed = false;
        break;
      }
      if (i >= queue.length - 1) break;
      const pause = BULK_COOLDOWN_SECONDS + Math.floor(Math.random() * 9);
      for (let left = pause; left > 0; left -= 1) {
        if (stopRef.current) break;
        setWaitLeft(left);
        await sleep(1000);
      }
      setWaitLeft(0);
      if (stopRef.current) completed = false;
    }
    setRunning(false);
    setSending(false);
    setWaitLeft(0);
    if (completed && sent > 0) toast.success(`Finished. Sent ${sent} message${sent === 1 ? '' : 's'}.`);
  };

  return (
    <Modal
      open
      onClose={closeModal}
      title="Send bulk WhatsApp"
      size="lg"
      footer={(
        <>
          <Btn variant="ghost" size="sm" onClick={closeModal}>Close</Btn>
          {running && (
            <Btn variant="outline" size="sm" onClick={stopRun}>Stop</Btn>
          )}
          <Btn variant="success" size="sm" onClick={sendAll} disabled={loading || running || !current || !draft.trim()}>
            {waitLeft
              ? `Next in ${waitLeft}s`
              : sending
                ? `Sending to ${current?.name || 'member'}…`
                : current
                  ? `Send ${reachable.length - cursor} with pauses`
                  : (reachable.length ? 'All sent' : 'No numbers')}
          </Btn>
        </>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
            {reachable.length} of {members.length} selected member(s) have a phone number.
            {' '}Sent {Math.min(cursor, reachable.length)} of {reachable.length}. After each message Leap waits 20–28 seconds, then sends the next, so WhatsApp is less likely to treat the number as spam.
          </p>
          {waitLeft > 0 && (
            <p style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>
              Cooling down. Next message in {waitLeft}s.
            </p>
          )}
          {needsConnect && (
            <p style={{ fontSize: 13, margin: 0 }}>
              <Link to="/account/whatsapp">Connect WhatsApp</Link> before sending.
            </p>
          )}
          <Select label="Template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setDirty(false); }} disabled={running}>
            <option value="">Custom text</option>
            {templates.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </Select>
          <Textarea label="Message" value={draft} onChange={(e) => { setMessage(e.target.value); setDirty(true); }} rows={6} disabled={running} />
        </div>
      )}
    </Modal>
  );
}

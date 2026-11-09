import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Textarea, Modal, Input, Tabs, FilterTabs,
} from '../../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getWhatsAppTemplates, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, switchSalesRep, switchCoach, sendWhatsAppMessage,
  getAssigningCreatedTasks, getAssigningOverview, completeMemberTask,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { applyWhatsAppPlaceholders, composeWhatsAppTemplateMessage, toWhatsAppUrl } from '../../utils/whatsapp';
import {
  EXPORT_COLUMNS, buildExcel, columnsForExport,
  columnValue, memberPhone, taskPermissions, toggleId, toggleIds,
  canUserAssignTasks, formatTaskDateTime, filterTaskHistory, filterMembersAdvanced,
  filterCreatedTasks, filterAssignedHistoryAdvanced, packageName,
  toLocalDateString, parseDateBoundary,
  SELECTION_TEMPLATES, applySelectionTemplate, invertSelection, getTransferLogs,
} from './taskMembers';
import AssignedTasksPage from './AssignedTasksPage';

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

export default function AssigningTasksPage() {
  usePageTitle('Tasks Management');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'my_tasks'

  // ── Overview KPI Stats State ──
  const [overviewStats, setOverviewStats] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

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

  // Selection Templates state
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [customCountInput, setCustomCountInput] = useState('10');
  const [transferModalTemplate, setTransferModalTemplate] = useState('');
  const [lastAppliedTemplate, setLastAppliedTemplate] = useState('');
  const templateMenuRef = useRef(null);

  // ── Assigner History Modal State ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createdTasks, setCreatedTasks] = useState([]);
  const [loadingCreatedTasks, setLoadingCreatedTasks] = useState(false);
  const [inspectTaskId, setInspectTaskId] = useState(null);

  // ── Bulk Transfer Progress State ──
  const [transferProgress, setTransferProgress] = useState({ current: 0, total: 0 });
  const [transferStatus, setTransferStatus] = useState('idle');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // ── WhatsApp Modal State ──
  const [waTemplates, setWaTemplates] = useState([]);
  const [waTemplateId, setWaTemplateId] = useState('');
  const [waCustomText, setWaCustomText] = useState('');
  const [waPreviewMember, setWaPreviewMember] = useState(null);
  const [waSending, setWaSending] = useState(false);
  const [waProgress, setWaProgress] = useState({ sent: 0, total: 0 });

  const { canSalesman, canCoach, canWhatsApp } = taskPermissions(user, hasFeature);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await getAssigningOverview();
      setOverviewStats(res.data.stats ?? null);
    } catch {
      // Non-blocking
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    getSalesUsers().then((res) => setSalesUsers(res.data.salesUsers ?? [])).catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((person) => ['Coach', 'Coach Manager'].includes(person.role)));
      })
      .catch(() => {});
    getPackages({ limit: 100 })
      .then((res) => setAllPackages(res.data.packages ?? []))
      .catch(() => {});
  }, [fetchOverview]);

  const fetchCreatedTasks = useCallback(async () => {
    setLoadingCreatedTasks(true);
    try {
      const res = await getAssigningCreatedTasks();
      setCreatedTasks(res.data.tasks ?? []);
    } catch {
      toast.error('Failed to load created tasks history');
    } finally {
      setLoadingCreatedTasks(false);
    }
  }, []);

  const openTasksHistoryModal = () => {
    setHistoryOpen(true);
    fetchCreatedTasks();
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

  useEffect(() => {
    if (activeTab === 'schedule') {
      if (kind === 'sales' || kind === 'coach') {
        if (personId) showMembers(kind, personId);
        else { setMembers([]); setLoaded(false); }
      } else {
        showMembers(kind, '');
      }
    }
  }, [activeTab, kind, personId, showMembers]);

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

  const statusCounts = useMemo(() => {
    const counts = { all: members.length, active: 0, expired: 0, frozen: 0, guest: 0, blocked: 0 };
    members.forEach((m) => {
      if (m.isBlocked) counts.blocked += 1;
      else if (m.status === 'active') counts.active += 1;
      else if (m.status === 'expired') counts.expired += 1;
      else if (m.status === 'frozen') counts.frozen += 1;
      else if (m.status === 'guest') counts.guest += 1;
    });
    return counts;
  }, [members]);

  const filteredTemplateCounts = useMemo(() => {
    const counts = {
      active: 0, expired: 0, frozen: 0, guest: 0,
      unassignedSales: 0, unassignedCoach: 0,
      transferred: 0, endingSoon: 0,
    };
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 86400000);

    filtered.forEach((m) => {
      if (m.status === 'active') counts.active += 1;
      else if (m.status === 'expired') counts.expired += 1;
      else if (m.status === 'frozen') counts.frozen += 1;
      else if (m.status === 'guest') counts.guest += 1;

      if (!m.assignedSales || m.assignedSales?.role === 'Sales Manager') counts.unassignedSales += 1;
      if (!m.current_couch) counts.unassignedCoach += 1;
      if (Array.isArray(m.userlog) && m.userlog.some((l) => l.type === 'assign')) counts.transferred += 1;

      const sub = m.subscriptions?.[m.subscriptions.length - 1];
      if (sub?.endDate) {
        const end = new Date(sub.endDate);
        if (end >= now && end <= in30d) counts.endingSoon += 1;
      }
    });
    return counts;
  }, [filtered]);

  const setQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'today') {
      setDateFrom(toLocalDateString(now));
      setDateTo(toLocalDateString(now));
    } else if (preset === 'next7') {
      const to = new Date(now);
      to.setDate(to.getDate() + 7);
      setDateFrom(toLocalDateString(now));
      setDateTo(toLocalDateString(to));
    } else if (preset === 'next30') {
      const to = new Date(now);
      to.setDate(to.getDate() + 30);
      setDateFrom(toLocalDateString(now));
      setDateTo(toLocalDateString(to));
    } else if (preset === 'last30') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      setDateFrom(toLocalDateString(from));
      setDateTo(toLocalDateString(now));
    }
  };

  const handleSelectAllFiltered = () => {
    const ids = filtered.map((m) => m._id);
    setSelected((prev) => toggleIds(prev, ids));
  };

  const isAllFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m._id));

  useEffect(() => {
    function handleClickOutside(e) {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setTemplateMenuOpen(false);
      }
    }
    if (templateMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [templateMenuOpen]);

  const handleApplyTemplate = (templateId, options = {}) => {
    if (!filtered.length) {
      toast.error('No members match the current filters');
      return;
    }
    const ids = applySelectionTemplate(filtered, templateId, options);
    if (!ids.length) {
      toast.error('No members matched this template criteria');
      return;
    }
    setSelected(new Set(ids));
    setTemplateMenuOpen(false);
    const tmpl = SELECTION_TEMPLATES.find((t) => t.id === templateId);
    const label = tmpl ? tmpl.label : options.customLabel || `${ids.length} members`;
    setLastAppliedTemplate(label);
    toast.success(`Selected ${ids.length} members (${label})`);
  };

  const handleApplyCustomCount = () => {
    const count = parseInt(customCountInput, 10);
    if (!Number.isFinite(count) || count <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }
    handleApplyTemplate('custom_first', { count, customLabel: `First ${count}` });
  };

  const handleInvertSelection = () => {
    if (!filtered.length) return;
    const next = invertSelection(filtered, selected);
    setSelected(next);
    setLastAppliedTemplate('Inverted');
    toast.success(`Selection inverted (${next.size} members selected)`);
  };

  const handleClearSelection = () => {
    setSelected(new Set());
    setLastAppliedTemplate('');
  };

  const openTransferModal = (targetKind) => {
    if (!selected.size) {
      toast.error('Select at least one member to transfer');
      return;
    }
    setDestKind(targetKind);
    setDestId('');
    setTransferModalTemplate('');
    setTransferStatus('idle');
    setTransferProgress({ current: 0, total: selected.size });
    setTransferOpen(true);
  };

  const handleApplyTemplateInsideModal = (templateId) => {
    setTransferModalTemplate(templateId);
    handleApplyTemplate(templateId);
  };

  useEffect(() => {
    let timer;
    if (cooldownRemaining > 0) {
      timer = setInterval(() => {
        setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const executeBulkTransfer = async () => {
    if (!destId) {
      toast.error(destKind === 'sales' ? 'Choose a sales rep' : 'Choose a coach');
      return;
    }
    const ids = Array.from(selected);
    if (!ids.length) return;

    setBusy(true);
    setTransferStatus('transferring');
    setTransferProgress({ current: 0, total: ids.length });

    try {
      if (destKind === 'sales') {
        await bulkTransferSalesReps({
          memberIds: ids,
          newSalesRepId: destId,
          source: 'tasks',
        });
      } else {
        await bulkTransferCoach({
          memberIds: ids,
          newCoachId: destId,
          source: 'tasks',
        });
      }

      setTransferProgress({ current: ids.length, total: ids.length });
      setTransferStatus('cooling_down');
      setCooldownRemaining(BULK_COOLDOWN_SECONDS);
      toast.success(`Successfully assigned ${ids.length} members as tasks!`);

      showMembers(kind, personId);
      setSelected(new Set());
      setTransferOpen(false);
      fetchOverview();
      fetchCreatedTasks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
      setTransferStatus('idle');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickTransfer = async (e) => {
    e.preventDefault();
    const id = quickId.trim();
    if (!id) return;
    setBusy(true);
    try {
      if (destKind === 'sales') {
        await switchSalesRep(id, destId, { source: 'tasks' });
      } else {
        await switchCoach(id, destId, { source: 'tasks' });
      }
      toast.success(`Member #${id} assigned as task!`);
      setQuickId('');
      showMembers(kind, personId);
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Quick transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const exportSheet = () => {
    const cols = columnsForExport(visibleKeys);
    downloadExcel(`tasks-schedule-${toLocalDateString(new Date())}.xls`, cols, filtered);
  };

  return (
    <Layout>
      <PageHeader title="Tasks Management">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="outline" size="sm" onClick={openTasksHistoryModal}>
            📋 View Created Tasks
          </Btn>

          {activeTab === 'schedule' && loaded && (
            <>
              <Btn variant="outline" size="sm" onClick={() => setColumnsOpen((open) => !open)}>Columns</Btn>
              <Btn variant="outline" size="sm" onClick={exportSheet} disabled={loading || !filtered.length}>Export Excel</Btn>
            </>
          )}
        </div>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI Overview Bar */}
        {overviewStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Tasks Created</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{overviewStats.totalTasks}</div>
            </Card>
            <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Tasks</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{overviewStats.pendingTasks}</div>
            </Card>
            <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Members Assigned</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{overviewStats.totalMembersAssigned}</div>
            </Card>
            <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completion Rate</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{overviewStats.completionRate}%</div>
            </Card>
          </div>
        )}

        {/* Tab switcher: Schedule / Assigning vs Manager's Own Assigned Tasks */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <Btn
            size="sm"
            variant={activeTab === 'schedule' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('schedule')}
          >
            Assign Tasks & Member Schedule
          </Btn>
          <Btn
            size="sm"
            variant={activeTab === 'my_tasks' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('my_tasks')}
          >
            My Assigned Tasks
          </Btn>
        </div>

        {activeTab === 'my_tasks' ? (
          <AssignedTasksPage embedded={true} />
        ) : (
          <>
            {/* ── ASSIGNER VIEW: SCOPE & ADVANCED FILTERS ── */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Row 1: Scope / Assignee Selection */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <Select
                      label="View Scope"
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setPersonId('');
                      }}
                    >
                      <option value="all">All Gym Members</option>
                      <option value="sales">By Sales Rep</option>
                      <option value="coach">By Coach</option>
                      <option value="unassigned_sales">Unassigned Sales</option>
                      <option value="unassigned_coach">Unassigned Coach</option>
                    </Select>
                  </div>

                  {(kind === 'sales' || kind === 'coach') && (
                    <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                      <Select
                        label={kind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}
                        value={personId}
                        onChange={(e) => setPersonId(e.target.value)}
                      >
                        <option value="">Choose staff member…</option>
                        {people.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}

                  <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Search Directory</label>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, phone, System ID…"
                      style={{
                        width: '100%', padding: '7px 11px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                    <Btn size="sm" variant="outline" onClick={() => setMoreFiltersOpen((o) => !o)}>
                      {moreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}
                    </Btn>
                  </div>
                </div>

                {/* Status Quick Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <FilterTabs
                    options={[
                      { value: 'all', id: 'all', label: `All (${statusCounts.all})` },
                      { value: 'active', id: 'active', label: `Active (${statusCounts.active})` },
                      { value: 'expired', id: 'expired', label: `Expired (${statusCounts.expired})` },
                      { value: 'frozen', id: 'frozen', label: `Frozen (${statusCounts.frozen})` },
                      { value: 'guest', id: 'guest', label: `Guest (${statusCounts.guest})` },
                    ]}
                    active={statusFilter}
                    onChange={setStatusFilter}
                  />

                  {/* Selection Action Summary & Templates Trigger */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selected.size > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
                        {selected.size} member(s) selected
                      </span>
                    )}

                    <div style={{ position: 'relative' }} ref={templateMenuRef}>
                      <Btn
                        size="sm"
                        variant={selected.size > 0 ? 'primary' : 'outline'}
                        onClick={() => setTemplateMenuOpen((open) => !open)}
                      >
                        ⚡ Selection Templates ▾
                      </Btn>

                      {templateMenuOpen && (
                        <div
                          style={{
                            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 120,
                            width: 340, maxWidth: '92vw', background: 'var(--card)',
                            border: '1px solid var(--border)', borderRadius: 10,
                            boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: '12px 14px',
                            fontSize: 12, color: 'var(--t1)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700 }}>Selection Presets</div>
                            {selected.size > 0 && (
                              <Btn size="xs" variant="ghost" onClick={handleClearSelection} style={{ color: 'var(--red)' }}>
                                Clear ({selected.size})
                              </Btn>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                              {[10, 20, 30, 50].map((num) => (
                                <button
                                  key={`first_${num}`}
                                  type="button"
                                  onClick={() => handleApplyTemplate(`first_${num}`)}
                                  style={{
                                    padding: '6px 4px', borderRadius: 6,
                                    border: '1px solid var(--border)', background: 'var(--bg)',
                                    color: 'var(--t1)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  }}
                                >
                                  First {num}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleApplyTemplate('unassigned_sales')}
                              style={{
                                padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                                background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', textAlign: 'left',
                              }}
                            >
                              <span>No Sales Rep Assigned</span>
                              <span style={{ fontWeight: 700 }}>{filteredTemplateCounts.unassignedSales}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApplyTemplate('unassigned_coach')}
                              style={{
                                padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                                background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', textAlign: 'left',
                              }}
                            >
                              <span>No Coach Assigned</span>
                              <span style={{ fontWeight: 700 }}>{filteredTemplateCounts.unassignedCoach}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleInvertSelection}
                              style={{
                                padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                                background: 'var(--bg)', color: 'var(--t1)', fontSize: 12, cursor: 'pointer',
                                textAlign: 'center',
                              }}
                            >
                              Invert Selection
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Secondary Filters */}
                {moreFiltersOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
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

                      <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                        <Select
                          label="Date Field"
                          value={dateField}
                          onChange={(e) => setDateField(e.target.value)}
                        >
                          <option value="endDate">End Date</option>
                          <option value="startDate">Start Date</option>
                          <option value="createdAt">Joined Date</option>
                        </Select>
                      </div>

                      <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>From</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          style={{
                            width: '100%', padding: '6px 10px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--card)',
                            color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                          }}
                        />
                      </div>

                      <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>To</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          style={{
                            width: '100%', padding: '6px 10px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--card)',
                            color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
                        <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('next30')}>Next 30d</Btn>
                        <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('clear')}>Clear</Btn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Members Directory Table for Assignment */}
            <Card noPad>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleSelectAllFiltered}
                    />
                    <span>Select All Filtered ({filtered.length})</span>
                  </label>
                  {selected.size > 0 && (
                    <Btn size="xs" variant="ghost" onClick={handleClearSelection} style={{ color: 'var(--red)' }}>
                      Deselect All
                    </Btn>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {canSalesman && (
                    <Btn
                      size="sm"
                      variant="primary"
                      disabled={!selected.size}
                      onClick={() => openTransferModal('sales')}
                    >
                      👤 Assign Sales Rep ({selected.size})
                    </Btn>
                  )}
                  {canCoach && (
                    <Btn
                      size="sm"
                      variant="outline"
                      disabled={!selected.size}
                      onClick={() => openTransferModal('coach')}
                    >
                      🏋️ Assign Coach ({selected.size})
                    </Btn>
                  )}
                </div>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
              ) : filtered.length === 0 ? (
                <EmptyState icon="👥" message="No members found" sub="Adjust your filters or scope selection." />
              ) : (
                <div className="table-responsive-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ width: 40, padding: '10px 14px', textAlign: 'center' }}>#</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Sales Rep</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Coach</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Package</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>End Date</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((member) => {
                        const isSelected = selected.has(member._id);
                        return (
                          <tr
                            key={member._id}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              background: isSelected ? 'var(--navy-subtle, rgba(59, 130, 246, 0.05))' : 'transparent',
                            }}
                          >
                            <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => setSelected((prev) => toggleId(prev, member._id))}
                              />
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: 'pointer' }}
                                onClick={() => navigate(`/members/${member.systemId}`)}
                              >
                                <Avatar name={member.name} size="sm" />
                                <span>{member.name}</span>
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              #{member.systemId}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              {member.phones || '—'}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              {member.assignedSales?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              {member.current_couch?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              {packageName(member) || '—'}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                              {columnValue(member, 'endDate') || '—'}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <Badge status={member.status || 'active'} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Quick Single Transfer Card */}
            <Card>
              <form onSubmit={handleQuickTransfer} style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Quick Assign by System ID</label>
                  <input
                    value={quickId}
                    onChange={(e) => setQuickId(e.target.value)}
                    placeholder="Enter System ID (e.g. 104)"
                    style={{
                      width: '100%', padding: '7px 11px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <Select
                    label="Assign Destination"
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                  >
                    <option value="">Select target rep…</option>
                    {salesUsers.filter((u) => u.role === 'Sales').map((u) => (
                      <option key={u._id} value={u._id}>{u.name} (Sales)</option>
                    ))}
                    {coaches.map((c) => (
                      <option key={c._id} value={c._id}>{c.name} (Coach)</option>
                    ))}
                  </Select>
                </div>
                <Btn type="submit" variant="primary" disabled={busy || !quickId.trim() || !destId}>
                  ⚡ Quick Assign Task
                </Btn>
              </form>
            </Card>
          </>
        )}

        {/* ── BULK TRANSFER MODAL ── */}
        {transferOpen && (
          <Modal title={`Assign Tasks to ${destKind === 'sales' ? 'Sales Rep' : 'Coach'}`} onClose={() => setTransferOpen(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
                  You are assigning <strong>{selected.size} member(s)</strong> as tasks. Each assigned member will trigger a notification to the recipient and appear in their active task queue.
                </p>
              </div>

              <div>
                <Select
                  label={destKind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                >
                  <option value="">Choose recipient…</option>
                  {(destKind === 'sales' ? salesUsers.filter((u) => u.role === 'Sales') : coaches).map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </Select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Btn variant="outline" onClick={() => setTransferOpen(false)} disabled={busy}>Cancel</Btn>
                <Btn variant="primary" onClick={executeBulkTransfer} disabled={busy || !destId}>
                  {busy ? <Spinner size="sm" /> : `Confirm & Assign (${selected.size})`}
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {/* ── CREATED TASKS HISTORY MODAL ── */}
        {historyOpen && (
          <Modal title="Created Tasks History" onClose={() => setHistoryOpen(false)} maxWidth={860}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
                  All task batches created and assigned to staff members.
                </p>
                <Btn size="xs" variant="ghost" onClick={fetchCreatedTasks} disabled={loadingCreatedTasks}>
                  ↻ Refresh
                </Btn>
              </div>

              {loadingCreatedTasks ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size="lg" /></div>
              ) : createdTasks.length === 0 ? (
                <EmptyState icon="📂" message="No tasks created yet" sub="Create your first task by selecting members and transferring them." />
              ) : (
                <div className="table-responsive-container">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Task Title</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Assigned To</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Progress</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Created At</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {createdTasks.map((t) => {
                        const total = t.totalCount || t.members?.length || 0;
                        const done = t.completedCount || 0;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return (
                          <tr key={t._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--t1)' }}>
                              {t.title || 'Task Batch'}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                              {t.assignedTo?.name || 'Staff'} <span style={{ fontSize: 11, color: 'var(--t4)' }}>({t.targetRole || t.assignedTo?.role})</span>
                            </td>
                            <td style={{ padding: '12px 14px', minWidth: 160 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--primary)', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', width: 45 }}>{done}/{total}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                              {formatTaskDateTime(t.createdAt)}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <Badge status={t.status === 'completed' ? 'active' : 'pending'} label={t.status === 'completed' ? 'Completed' : 'In Progress'} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

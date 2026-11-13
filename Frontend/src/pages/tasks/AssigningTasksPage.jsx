import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Modal, FilterTabs, Pagination, Table, MenuSelect,
} from '../../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, switchSalesRep, switchCoach,
  getAssigningCreatedTasks, getAssigningOverview,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import {
  EXPORT_COLUMNS, buildExcel, columnsForExport,
  columnValue, taskPermissions, toggleId, toggleIds,
  canUserAssignTasks, canUserReceiveTasks, formatTaskDateTime,
  filterMembersAdvanced, packageName, toLocalDateString,
  SELECTION_TEMPLATES, applySelectionTemplate, invertSelection,
} from './taskMembers';
import AssignedTasksPage from './AssignedTasksPage';
import BulkWhatsAppSendModal from '../../components/BulkWhatsAppSendModal';
import {
  ChevronDown, ChevronUp, CircleDot, ClipboardList, Dumbbell, FolderOpen,
  MessageCircle, RefreshCw, Search, UserRound, Users, X, Zap,
} from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
const DEFAULT_COLUMNS = ['name', 'systemId', 'phone', 'salesman', 'coach', 'package', 'endDate', 'status'];
const BULK_COOLDOWN_SECONDS = 20;

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
  const [kind, setKind] = useState(() => (
    user?.role === 'Head Coach' ? 'unassigned_coach' : 'all'
  )); // 'all' | 'sales' | 'coach' | 'unassigned_sales' | 'unassigned_coach'
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
  const selectedSet = useMemo(() => {
    return selected instanceof Set ? selected : new Set(selected || []);
  }, [selected]);

  // ── Column Visibility State ──
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tasks_visible_columns'));
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  const handleUpdateVisibleKeys = (keysOrUpdater) => {
    setVisibleKeys((prev) => {
      const next = typeof keysOrUpdater === 'function' ? keysOrUpdater(prev) : keysOrUpdater;
      try {
        localStorage.setItem('tasks_visible_columns', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // ── Pagination State (10 members per page) ──
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('tasks_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  // ── Transfer Modal State ──
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [quickId, setQuickId] = useState('');
  const [busy, setBusy] = useState(false);

  // ── Selection Templates State ──
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [customCountInput, setCustomCountInput] = useState('10');
  const [customCountOrder, setCustomCountOrder] = useState('first');
  const [transferModalTemplate, setTransferModalTemplate] = useState('');
  const [lastAppliedTemplate, setLastAppliedTemplate] = useState('');
  const [menuAlign, setMenuAlign] = useState('left');
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

  // ── WhatsApp Bulk Send ──
  const [waOpen, setWaOpen] = useState(false);

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

  useLocationEffect(() => {
    fetchOverview();
    getSalesUsers().then((res) => setSalesUsers(res.data.salesUsers ?? [])).catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((person) => person.role === 'Coach'));
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

  useLocationEffect(() => {
    if (activeTab === 'schedule') {
      if (kind === 'sales' || kind === 'coach') {
        if (personId) showMembers(kind, personId);
        else { setMembers([]); setLoaded(false); }
      } else {
        showMembers(kind, '');
      }
    }
  }, [activeTab, kind, personId, showMembers]);

  useLocationEffect(() => { setPage(1); setSelected(new Set()); }, []);

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

  // Reset page to 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, kind, personId, dateField, dateFrom, dateTo, transferTypeFilter, packageFilter, genderFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(500, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('tasks_page_size', String(valid));
    } catch {
      // ignore
    }
  };

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (packageFilter !== 'all') count++;
    if (genderFilter !== 'all') count++;
    if (transferTypeFilter !== 'all') count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [packageFilter, genderFilter, transferTypeFilter, dateFrom, dateTo]);

  const isFiltered = Boolean(
    search.trim() ||
    statusFilter !== 'all' ||
    kind !== 'all' ||
    personId ||
    activeFilterCount > 0
  );

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setKind('all');
    setPersonId('');
    setPackageFilter('all');
    setGenderFilter('all');
    setTransferTypeFilter('all');
    setDateField('endDate');
    setDateFrom('');
    setDateTo('');
  };

  const handleSelectAllFiltered = () => {
    const ids = filtered.map((m) => m._id);
    setSelected((prev) => toggleIds(prev, ids));
  };

  const isAllFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedSet.has(m._id));

  // ── Dynamic Boundary Alignment & Click Outside for Selection Templates ──
  useEffect(() => {
    function handleClickOutside(e) {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setTemplateMenuOpen(false);
      }
    }
    if (templateMenuOpen) {
      if (templateMenuRef.current) {
        const rect = templateMenuRef.current.getBoundingClientRect();
        if (rect.left + 330 > window.innerWidth) {
          setMenuAlign('right');
        } else {
          setMenuAlign('left');
        }
      }
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
    const isLast = customCountOrder === 'last';
    const templateId = isLast ? 'custom_last' : 'custom_first';
    const label = isLast ? `Last ${count}` : `First ${count}`;
    handleApplyTemplate(templateId, { count, customLabel: label });
    if (isLast) {
      setPage(Math.max(1, Math.ceil(filtered.length / pageSize)));
    } else {
      setPage(1);
    }
  };

  const handleInvertSelection = () => {
    if (!filtered.length) return;
    const next = invertSelection(filtered, selectedSet);
    const nextSet = new Set(next);
    setSelected(nextSet);
    setLastAppliedTemplate('Inverted');
    toast.success(`Selection inverted (${nextSet.size} members selected)`);
  };

  const handleClearSelection = () => {
    setSelected(new Set());
    setLastAppliedTemplate('');
  };

  const openTransferModal = (targetKind) => {
    if (!selectedSet.size) {
      toast.error('Select at least one member to transfer');
      return;
    }
    setDestKind(targetKind);
    setDestId('');
    setTransferModalTemplate('');
    setTransferStatus('idle');
    setTransferProgress({ current: 0, total: selectedSet.size });
    setTransferOpen(true);
  };

  const openWaModal = () => {
    if (!selectedSet.size) {
      toast.error('Select at least one member');
      return;
    }
    setWaOpen(true);
  };

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedSet.has(m._id)),
    [members, selectedSet]
  );

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
    const ids = Array.from(selectedSet);
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
          coachId: destId,
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
    if (!destId) {
      toast.error('Choose a target staff member');
      return;
    }
    setBusy(true);
    try {
      const isSales = salesUsers.some((u) => u._id === destId);
      if (isSales) {
        await switchSalesRep(id, destId, { reason: 'Quick task assign' });
      } else {
        await switchCoach(id, destId, { reason: 'Quick task assign' });
      }
      toast.success(`Member #${id} assigned successfully!`);
      setQuickId('');
      setDestId('');
      showMembers(kind, personId);
      fetchOverview();
      fetchCreatedTasks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const exportSheet = () => {
    const cols = columnsForExport(visibleKeys);
    if (!filtered.length) {
      toast.error('No members to export');
      return;
    }
    downloadExcel(`tasks-schedule-${toLocalDateString(new Date())}.xls`, cols, filtered);
    toast.success(`Exported ${filtered.length} rows to Excel`);
  };

  const canReceiveTasks = canUserReceiveTasks(user);

  return (
    <Layout>
      <PageHeader walkthrough="assign-tasks-header" title="Tasks Management">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="outline" size="sm" onClick={() => navigate('/tasks/filter')}>
            <Search size={14} aria-hidden /> Filter &amp; Bulk Actions
          </Btn>

          <Btn variant="outline" size="sm" onClick={openTasksHistoryModal}>
            <ClipboardList size={14} aria-hidden /> View Created Tasks
          </Btn>

          <Btn variant="outline" size="sm" onClick={() => setColumnsOpen(true)}>
            Columns
          </Btn>

          <Btn variant="outline" size="sm" onClick={exportSheet} disabled={loading || !filtered.length}>
            Export Excel
          </Btn>
        </div>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="assign-tasks-board" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
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

        {/* Tab switcher: only when the user can both assign and receive tasks */}
        {canReceiveTasks && (
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
        )}

        {canReceiveTasks && activeTab === 'my_tasks' ? (
          <AssignedTasksPage embedded={true} />
        ) : (
          <>
            {/* ── ASSIGNER VIEW: SCOPE & ADVANCED FILTERS ── */}
            <Card style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Row 1: Search & Scope Primary Toolbar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  {/* View Scope Select */}
                  <div style={{ flex: '0 0 auto', width: 210, minWidth: 170 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      View Scope
                    </label>
                    <MenuSelect
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setPersonId('');
                      }}
                      style={{ width: '100%' }}
                      aria-label="View scope"
                    >
                      <option value="all">All Gym Members</option>
                      {canSalesman && <option value="sales">By Sales Rep</option>}
                      {canCoach && <option value="coach">By Coach</option>}
                      {canSalesman && <option value="unassigned_sales">Unassigned Sales</option>}
                      {canCoach && <option value="unassigned_coach">Unassigned Coach</option>}
                    </MenuSelect>
                  </div>

                  {/* Staff Select (when scope is by sales or by coach) */}
                  {(kind === 'sales' || kind === 'coach') && (
                    <div style={{ flex: '0 0 auto', width: 210, minWidth: 170 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                        {kind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}
                      </label>
                      <MenuSelect
                        value={personId}
                        onChange={(e) => setPersonId(e.target.value)}
                        style={{ width: '100%' }}
                        aria-label={kind === 'sales' ? 'Select sales rep' : 'Select coach'}
                      >
                        <option value="">Choose staff member…</option>
                        {people.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </MenuSelect>
                    </div>
                  )}

                  {/* Search Directory Input with Search Icon */}
                  <div style={{ flex: '1 1 240px', minWidth: 200, position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      Search Directory
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <svg
                        style={{ position: 'absolute', left: 11, color: 'var(--t4)', pointerEvents: 'none' }}
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, phone, System ID…"
                        style={{
                          width: '100%',
                          height: 38,
                          paddingLeft: 34,
                          paddingRight: search ? 30 : 12,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--t1)',
                          fontSize: 13,
                          fontFamily: 'inherit',
                          outline: 'none',
                          transition: 'all 0.15s ease',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = 'var(--navy)';
                          e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'var(--border)';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          style={{
                            position: 'absolute',
                            right: 8,
                            background: 'none',
                            border: 'none',
                            color: 'var(--t4)',
                            cursor: 'pointer',
                            padding: 4,
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Clear search"
                        >
                          <X size={12} aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Action Buttons (More Filters / Reset) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                    <button
                      type="button"
                      onClick={() => setMoreFiltersOpen((o) => !o)}
                      style={{
                        height: 38,
                        padding: '0 14px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        border: `1px solid ${moreFiltersOpen || activeFilterCount > 0 ? 'var(--navy, var(--navy))' : 'var(--border)'}`,
                        background: moreFiltersOpen || activeFilterCount > 0 ? 'var(--navy-subtle, color-mix(in srgb, var(--navy) 6%, transparent))' : 'var(--card)',
                        color: moreFiltersOpen || activeFilterCount > 0 ? 'var(--navy, var(--navy))' : 'var(--t2)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {moreFiltersOpen ? <><ChevronUp size={12} aria-hidden /> Less Filters</> : <><ChevronDown size={12} aria-hidden /> More Filters</>}
                      </span>
                      {activeFilterCount > 0 && (
                        <span
                          style={{
                            background: 'var(--navy, var(--navy))',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 10,
                            marginLeft: 2,
                          }}
                        >
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    {isFiltered && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        style={{
                          height: 38,
                          padding: '0 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          border: '1px solid transparent',
                          background: 'transparent',
                          color: 'var(--red, #dc2626)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                        title="Reset all filters"
                      >
                        ↺ Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Status Quick Tabs & Selection Templates */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                    marginTop: 2,
                  }}
                >
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
                    {selectedSet.size > 0 && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: 'var(--navy-subtle, color-mix(in srgb, var(--navy) 8%, transparent))',
                          color: 'var(--navy, var(--navy))',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CircleDot size={12} aria-hidden /> {selectedSet.size} selected</span>
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--red, #dc2626)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '0 2px',
                          }}
                        >
                          (Clear)
                        </button>
                      </div>
                    )}

                    <div style={{ position: 'relative' }} ref={templateMenuRef}>
                      <Btn
                        size="sm"
                        variant={selectedSet.size > 0 ? 'primary' : 'outline'}
                        onClick={() => {
                          if (!templateMenuOpen && templateMenuRef.current) {
                            const rect = templateMenuRef.current.getBoundingClientRect();
                            if (rect.left + 330 > window.innerWidth) {
                              setMenuAlign('right');
                            } else {
                              setMenuAlign('left');
                            }
                          }
                          setTemplateMenuOpen((open) => !open);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Zap size={14} aria-hidden /> Selection Templates <ChevronDown size={10} aria-hidden style={{ opacity: 0.7 }} />
                      </Btn>

                      {templateMenuOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 8px)',
                            ...(menuAlign === 'right' ? { right: 0 } : { left: 0 }),
                            zIndex: 1000,
                            width: 320,
                            maxWidth: 'min(320px, calc(100vw - 32px))',
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
                            padding: '14px 16px',
                            fontSize: 12,
                            color: 'var(--t1)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700 }}>Selection Presets</div>
                            {selectedSet.size > 0 && (
                              <Btn size="xs" variant="ghost" onClick={handleClearSelection} style={{ color: 'var(--red)' }}>
                                Clear ({selectedSet.size})
                              </Btn>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <input
                                type="number"
                                min="1"
                                value={customCountInput}
                                onChange={(e) => setCustomCountInput(e.target.value)}
                                placeholder="How many members?"
                                aria-label="Number of members to select"
                                className="no-spinners"
                                style={{
                                  width: '100%', height: 34, padding: '0 10px', borderRadius: 6,
                                  border: '1px solid var(--border)', background: 'var(--card)',
                                  color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit',
                                  outline: 'none', MozAppearance: 'textfield', boxSizing: 'border-box',
                                }}
                              />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomCountOrder('first');
                                    const count = parseInt(customCountInput, 10);
                                    if (!Number.isFinite(count) || count <= 0) {
                                      toast.error('Please enter a valid positive number');
                                      return;
                                    }
                                    handleApplyTemplate('custom_first', { count, customLabel: `First ${count}` });
                                    setPage(1);
                                  }}
                                  style={{
                                    height: 32, borderRadius: 6, border: '1px solid var(--border)',
                                    background: customCountOrder === 'first' ? 'var(--navy)' : 'var(--bg)',
                                    color: customCountOrder === 'first' ? '#fff' : 'var(--t1)',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  First
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomCountOrder('last');
                                    const count = parseInt(customCountInput, 10);
                                    if (!Number.isFinite(count) || count <= 0) {
                                      toast.error('Please enter a valid positive number');
                                      return;
                                    }
                                    handleApplyTemplate('custom_last', { count, customLabel: `Last ${count}` });
                                    setPage(Math.max(1, Math.ceil(filtered.length / pageSize)));
                                  }}
                                  style={{
                                    height: 32, borderRadius: 6, border: '1px solid var(--border)',
                                    background: customCountOrder === 'last' ? 'var(--navy)' : 'var(--bg)',
                                    color: customCountOrder === 'last' ? '#fff' : 'var(--t1)',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  Last
                                </button>
                              </div>
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

                {/* Row 3: Collapsible Secondary Filters Drawer */}
                {moreFiltersOpen && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: '16px 18px',
                      borderRadius: 10,
                      background: 'var(--bg, #F4F5F7)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    {/* Sub-row A: Member Attributes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          Package
                        </label>
                        <MenuSelect
                          value={packageFilter}
                          onChange={(e) => setPackageFilter(e.target.value)}
                          style={{ width: '100%' }}
                          aria-label="Package"
                        >
                          <option value="all">All Packages</option>
                          {allPackages.map((pkg) => (
                            <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                          ))}
                        </MenuSelect>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          Gender
                        </label>
                        <MenuSelect
                          value={genderFilter}
                          onChange={(e) => setGenderFilter(e.target.value)}
                          style={{ width: '100%' }}
                          aria-label="Gender"
                        >
                          <option value="all">All Genders</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </MenuSelect>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          Transfer Status
                        </label>
                        <MenuSelect
                          value={transferTypeFilter}
                          onChange={(e) => setTransferTypeFilter(e.target.value)}
                          style={{ width: '100%' }}
                          aria-label="Transfer status"
                        >
                          <option value="all">All Transfer Statuses</option>
                          <option value="transferred">Transferred Members</option>
                          <option value="never">Never Transferred</option>
                        </MenuSelect>
                      </div>
                    </div>

                    {/* Sub-row B: Date Range Filtering & Presets */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        gap: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          Date Field
                        </label>
                        <MenuSelect
                          value={dateField}
                          onChange={(e) => setDateField(e.target.value)}
                          style={{ width: '100%' }}
                          aria-label="Date field"
                        >
                          <option value="endDate">End Date</option>
                          <option value="startDate">Start Date</option>
                          <option value="createdAt">Joined Date</option>
                        </MenuSelect>
                      </div>

                      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          From Date
                        </label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          style={{
                            width: '100%',
                            height: 38,
                            padding: '0 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--t1)',
                            fontSize: 13,
                            fontFamily: 'inherit',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                          To Date
                        </label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          style={{
                            width: '100%',
                            height: 38,
                            padding: '0 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--t1)',
                            fontSize: 13,
                            fontFamily: 'inherit',
                            outline: 'none',
                          }}
                        />
                      </div>

                      {/* Date Quick Presets */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setQuickPeriod('today')}
                          style={{
                            height: 38,
                            padding: '0 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--t2)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickPeriod('next30')}
                          style={{
                            height: 38,
                            padding: '0 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--t2)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          Next 30d
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickPeriod('last30')}
                          style={{
                            height: 38,
                            padding: '0 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--t2)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          Last 30d
                        </button>
                        {(dateFrom || dateTo) && (
                          <button
                            type="button"
                            onClick={() => setQuickPeriod('clear')}
                            style={{
                              height: 38,
                              padding: '0 11px',
                              borderRadius: 7,
                              border: '1px solid var(--red-bd, #fecaca)',
                              background: 'var(--red-bg, #fef2f2)',
                              color: 'var(--red, #dc2626)',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Clear Dates
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Members Directory Table for Assignment */}
            <Card noPad>
              <div data-walkthrough="assign-select" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleSelectAllFiltered}
                    />
                    <span>Select All Filtered ({filtered.length})</span>
                  </label>
                  {selectedSet.size > 0 && (
                    <Btn size="xs" variant="ghost" onClick={handleClearSelection} style={{ color: 'var(--red)' }}>
                      Deselect All
                    </Btn>
                  )}
                </div>

                <div data-walkthrough="assign-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canSalesman && (
                    <Btn
                      size="sm"
                      variant="primary"
                      disabled={!selectedSet.size}
                      onClick={() => openTransferModal('sales')}
                    >
                      <UserRound size={14} aria-hidden /> Assign Sales Rep ({selectedSet.size})
                    </Btn>
                  )}
                  {canCoach && (
                    <Btn
                      size="sm"
                      variant="outline"
                      disabled={!selectedSet.size}
                      onClick={() => openTransferModal('coach')}
                    >
                      <Dumbbell size={14} aria-hidden /> Assign Coach ({selectedSet.size})
                    </Btn>
                  )}
                  {canWhatsApp && (
                    <Btn
                      size="sm"
                      variant="outline"
                      disabled={!selectedSet.size}
                      onClick={openWaModal}
                    >
                      <MessageCircle size={14} aria-hidden /> WhatsApp ({selectedSet.size})
                    </Btn>
                  )}
                </div>
              </div>

              {loading ? (
                <Table
                  loading
                  skeletonRows={8}
                  headers={['#', 'Member', 'System ID', 'Phone', 'Sales Rep', 'Coach', 'Status', 'Package']}
                />
              ) : filtered.length === 0 ? (
                <EmptyState icon={Users} message="No members found" sub="Adjust your filters or scope selection." />
              ) : (
                <>
                  <div className="table-responsive-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                          <th style={{ width: 40, padding: '10px 14px', textAlign: 'center' }}>#</th>
                          {visibleKeys.includes('name') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Member</th>
                          )}
                          {visibleKeys.includes('systemId') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>System ID</th>
                          )}
                          {visibleKeys.includes('phone') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Phone</th>
                          )}
                          {(visibleKeys.includes('salesman') || visibleKeys.includes('sales')) && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Sales Rep</th>
                          )}
                          {visibleKeys.includes('coach') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Coach</th>
                          )}
                          {visibleKeys.includes('package') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Package</th>
                          )}
                          {visibleKeys.includes('endDate') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>End Date</th>
                          )}
                          {visibleKeys.includes('status') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Status</th>
                          )}
                          {visibleKeys.includes('transfers') && (
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>Transfers</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMembers.map((member) => {
                          const isSelected = selectedSet.has(member._id);
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
                              {visibleKeys.includes('name') && (
                                <td style={{ padding: '12px 14px' }}>
                                  <span
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--t1)', cursor: 'pointer' }}
                                    onClick={() => navigate(`/members/${member.systemId}`)}
                                  >
                                    <Avatar name={member.name} size="sm" />
                                    <span>{member.name}</span>
                                  </span>
                                </td>
                              )}
                              {visibleKeys.includes('systemId') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                  #{member.systemId}
                                </td>
                              )}
                              {visibleKeys.includes('phone') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                  {member.phones || '—'}
                                </td>
                              )}
                              {(visibleKeys.includes('salesman') || visibleKeys.includes('sales')) && (
                                <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                  {member.assignedSales?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                                </td>
                              )}
                              {visibleKeys.includes('coach') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                  {member.current_couch?.name || <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                                </td>
                              )}
                              {visibleKeys.includes('package') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t2)' }}>
                                  {packageName(member) || '—'}
                                </td>
                              )}
                              {visibleKeys.includes('endDate') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                                  {columnValue(member, 'endDate') || '—'}
                                </td>
                              )}
                              {visibleKeys.includes('status') && (
                                <td style={{ padding: '12px 14px' }}>
                                  <Badge status={member.status || 'active'} />
                                </td>
                              )}
                              {visibleKeys.includes('transfers') && (
                                <td style={{ padding: '12px 14px', color: 'var(--t3)', fontSize: 12 }}>
                                  {columnValue(member, 'transfers') || '0'}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ── 10 Members Per Page Pagination Bar ── */}
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={filtered.length}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                  />
                </>
              )}
            </Card>

          </>
        )}

        {/* ── BULK TRANSFER MODAL ── */}
        {transferOpen && (
          <Modal open={transferOpen} title={`Assign Tasks to ${destKind === 'sales' ? 'Sales Rep' : 'Coach'}`} onClose={() => setTransferOpen(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
                  You are assigning <strong>{selectedSet.size} member(s)</strong> as tasks. Each assigned member will trigger a notification to the recipient and appear in their active task queue.
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
                  {busy ? <Spinner size="sm" /> : `Confirm & Assign (${selectedSet.size})`}
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {/* ── COLUMNS CUSTOMIZATION MODAL ── */}
        {columnsOpen && (
          <Modal open={columnsOpen} title="Customize Table Columns" onClose={() => setColumnsOpen(false)} size="md">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
                Select which columns are visible in the schedule table and exported Excel sheets.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px 14px' }}>
                {EXPORT_COLUMNS.map((col) => {
                  const checked = visibleKeys.includes(col.key);
                  return (
                    <label
                      key={col.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--t1)',
                        cursor: 'pointer',
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: checked ? 'var(--navy-subtle, color-mix(in srgb, var(--navy) 6%, transparent))' : 'var(--bg)',
                        border: `1px solid ${checked ? 'var(--navy, var(--navy))' : 'var(--border)'}`,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          handleUpdateVisibleKeys((prev) =>
                            prev.includes(col.key)
                              ? prev.filter((k) => k !== col.key)
                              : [...prev, col.key]
                          );
                        }}
                      />
                      <span>{col.label}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="xs" variant="ghost" onClick={() => handleUpdateVisibleKeys(DEFAULT_COLUMNS)}>
                    Reset Default
                  </Btn>
                  <Btn size="xs" variant="ghost" onClick={() => handleUpdateVisibleKeys(EXPORT_COLUMNS.map((c) => c.key))}>
                    Select All
                  </Btn>
                </div>

                <Btn size="sm" variant="primary" onClick={() => setColumnsOpen(false)}>
                  Apply Columns
                </Btn>
              </div>
            </div>
          </Modal>
        )}

      <BulkWhatsAppSendModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        members={selectedMembers}
      />

        {/* ── VIEW CREATED TASKS HISTORY MODAL ── */}
        {historyOpen && (
          <Modal open={historyOpen} title="Created Tasks History" onClose={() => setHistoryOpen(false)} maxWidth={860}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
                  All task batches created and assigned to staff members.
                </p>
                <Btn size="xs" variant="ghost" onClick={fetchCreatedTasks} disabled={loadingCreatedTasks}>
                  <RefreshCw size={14} aria-hidden /> Refresh
                </Btn>
              </div>

              {loadingCreatedTasks ? (
                <Table loading skeletonRows={5} headers={['Task', 'Scope', 'Members', 'Created', 'Status']} />
              ) : createdTasks.length === 0 ? (
                <EmptyState icon={FolderOpen} message="No tasks created yet" sub="Create your first task by selecting members and transferring them." />
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
                      {createdTasks.map((task) => {
                        const total = task.totalMembers || task.memberIds?.length || 0;
                        const completed = task.completedMembers || task.completedMemberIds?.length || 0;
                        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                        return (
                          <tr key={task._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t1)' }}>
                              {task.title || `Task batch for ${total} members`}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>
                              {task.assignedTo?.name || task.assignedToName || 'Staff Member'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--primary)' }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{completed}/{total} ({pct}%)</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 12 }}>
                              {formatTaskDateTime(task.createdAt)}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <Badge status={task.status === 'completed' ? 'active' : 'pending'} label={task.status || 'pending'} />
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

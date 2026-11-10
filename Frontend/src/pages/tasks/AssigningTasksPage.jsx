import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState,
  SearchInput, Avatar, fmtDate, Pagination, PageSizeFilter,
  Select, Modal, Spinner, Input,
} from '../../components/ui';
import { formatSystemId } from '../../lib/systemId';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, switchSalesRep, switchCoach,
  getAssigningCreatedTasks, getAssigningOverview,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import {
  toggleId, canUserAssignTasks, canUserReceiveTasks,
  formatTaskDateTime, packageName, toLocalDateString,
  SELECTION_TEMPLATES, applySelectionTemplate,
  EXPORT_COLUMNS, buildExcel, columnsForExport,
} from './taskMembers';
import AssignedTasksPage from './AssignedTasksPage';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
const DEFAULT_COLUMNS = ['systemId', 'name', 'phone', 'status', 'package', 'endDate', 'salesman', 'coach'];

function downloadExcel(filename, columns, rows) {
  const blob = new Blob([buildExcel(columns, rows)], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AssigningTasksPage() {
  usePageTitle('Tasks Management');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const canReceiveTasks = canUserReceiveTasks(user);
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'my_tasks'

  // ── Overview KPI Stats ──
  const [overviewStats, setOverviewStats] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // ── Reference Data ──
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [allPackages, setAllPackages] = useState([]);

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

  // ── Server Pagination & Status Filter (matching Members page) ──
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('tasks_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortNewest, setSortNewest] = useState(true);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: DEFAULT_PAGE_SIZE });
  const [stats, setStats] = useState({ total: 0, active: 0, frozen: 0, expired: 0, guest: 0, blocked: 0 });

  const debouncedSearch = useDebounce(search, 300);

  // ── Advanced Tasks Filters ──
  const [kind, setKind] = useState('all'); // 'all' | 'sales' | 'coach' | 'unassigned_sales' | 'unassigned_coach'
  const [personId, setPersonId] = useState('');
  const [transferTypeFilter, setTransferTypeFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [dateField, setDateField] = useState('endDate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // ── Multi-Member Selection for Task Assignment ──
  const [selected, setSelected] = useState(() => new Set());
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [menuAlign, setMenuAlign] = useState('left');
  const templateMenuRef = useRef(null);

  // ── Transfer Modal State ──
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [busy, setBusy] = useState(false);

  // ── Quick Single Transfer State ──
  const [quickId, setQuickId] = useState('');

  // ── Created Tasks History Modal ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createdTasks, setCreatedTasks] = useState([]);
  const [loadingCreatedTasks, setLoadingCreatedTasks] = useState(false);

  // ── Fetch Task Overview KPIs ──
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

  // ── Fetch Reference Options ──
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

  // ── Fetch Paginated Members (matching Members.jsx behavior) ──
  const fetchMembers = useCallback(async (override = {}) => {
    const pageNum = override.page ?? page;
    const currentLimit = override.limit ?? pageSize;
    const status = override.status ?? statusFilter;
    const searchQuery = override.search ?? debouncedSearch;
    const newest = override.sortNewest ?? sortNewest;

    setLoading(true);
    try {
      const params = {
        page: pageNum,
        limit: currentLimit,
        status: status !== 'all' ? status : undefined,
        search: searchQuery || undefined,
        sortBy: 'createdAt',
        sortDir: newest ? -1 : 1,
      };

      // Scope filters
      if (kind === 'sales' && personId) params.assignedSales = personId;
      else if (kind === 'coach' && personId) params.currentCouch = personId;
      else if (kind === 'unassigned_sales') params.unassignedSales = 'true';
      else if (kind === 'unassigned_coach') params.unassignedCoach = 'true';

      // Additional advanced filters
      if (packageFilter && packageFilter !== 'all') params.packageId = packageFilter;
      if (genderFilter && genderFilter !== 'all') params.gender = genderFilter;
      if (transferTypeFilter && transferTypeFilter !== 'all') params.transferType = transferTypeFilter;

      if (dateFrom || dateTo) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (dateField) params.dateField = dateField;
      }

      const res = await getAllMembers(params);
      setMembers(res.data.members ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: currentLimit });
      if (res.data.stats) setStats(res.data.stats);
    } catch {
      setMembers([]);
      toast.error('Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, debouncedSearch, sortNewest, kind, personId, packageFilter, genderFilter, transferTypeFilter, dateFrom, dateTo, dateField]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      fetchMembers();
    }
  }, [fetchMembers, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, sortNewest, kind, personId, packageFilter, genderFilter, transferTypeFilter, dateFrom, dateTo, dateField]);

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

  // ── Created Tasks History ──
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

  // ── Export Sheet ──
  const exportSheet = () => {
    const cols = columnsForExport(visibleKeys);
    const rows = selected.size > 0 ? members.filter((m) => selected.has(m._id)) : members;
    if (!rows.length) {
      toast.error('No members to export');
      return;
    }
    downloadExcel(`tasks-schedule-${toLocalDateString(new Date())}.xls`, cols, rows);
    toast.success(`Exported ${rows.length} rows to Excel`);
  };

  // ── Quick Date Presets ──
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

  const handleClearAllFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setKind('all');
    setPersonId('');
    setTransferTypeFilter('all');
    setPackageFilter('all');
    setGenderFilter('all');
    setDateField('endDate');
    setDateFrom('');
    setDateTo('');
    setSortNewest(true);
    setPage(1);
  };

  // ── Master Selection Helpers ──
  const allOnPageSelected = members.length > 0 && members.every((m) => selected.has(m._id));

  const handleToggleSelectAllPage = () => {
    if (allOnPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        members.forEach((m) => next.delete(m._id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        members.forEach((m) => next.add(m._id));
        return next;
      });
    }
  };

  // ── Click Outside & Boundary Alignment Listener for Selection Templates Dropdown ──
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

  // ── Template Counts for current members ──
  const templateCounts = useMemo(() => {
    let unassignedSales = 0;
    let unassignedCoach = 0;
    let expiringSoon = 0;
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 86400000);

    members.forEach((m) => {
      if (!m.assignedSales || m.assignedSales?.role === 'Sales Manager') unassignedSales += 1;
      if (!m.current_couch) unassignedCoach += 1;
      const sub = m.subscriptions?.at(-1);
      if (sub?.endDate) {
        const end = new Date(sub.endDate);
        if (end >= now && end <= in30d) expiringSoon += 1;
      }
    });

    return { unassignedSales, unassignedCoach, expiringSoon };
  }, [members]);

  const handleApplyTemplate = (templateId, options = {}) => {
    if (!members.length) {
      toast.error('No members on this page');
      return;
    }
    const ids = applySelectionTemplate(members, templateId, options);
    if (!ids.length) {
      toast.error('No members matched this preset');
      return;
    }
    setSelected(new Set(ids));
    setTemplateMenuOpen(false);
    const tmpl = SELECTION_TEMPLATES.find((t) => t.id === templateId);
    const label = tmpl ? tmpl.label : options.customLabel || `${ids.length} members`;
    toast.success(`Selected ${ids.length} members (${label})`);
  };

  const handleInvertSelection = () => {
    if (!members.length) return;
    const next = new Set();
    members.forEach((m) => {
      if (!selected.has(m._id)) next.add(m._id);
    });
    setSelected(next);
    setTemplateMenuOpen(false);
    toast.success(`Selection inverted (${next.size} members selected)`);
  };

  const handleClearSelection = () => {
    setSelected(new Set());
    setTemplateMenuOpen(false);
  };

  // ── Task Assignment Modal Actions ──
  const openTransferModal = (targetKind) => {
    if (!selected.size) {
      toast.error('Select at least one member to assign');
      return;
    }
    setDestKind(targetKind);
    setDestId('');
    setTransferOpen(true);
  };

  const executeBulkTransfer = async () => {
    if (!destId) {
      toast.error(destKind === 'sales' ? 'Choose a sales rep' : 'Choose a coach');
      return;
    }
    const ids = Array.from(selected);
    if (!ids.length) return;

    setBusy(true);
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

      toast.success(`Successfully assigned ${ids.length} member(s) as tasks!`);
      setSelected(new Set());
      setTransferOpen(false);
      fetchMembers();
      fetchOverview();
      fetchCreatedTasks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickTransfer = async (e) => {
    e.preventDefault();
    const id = quickId.trim();
    if (!id || !destId) {
      toast.error('Please enter a system ID and choose a destination rep');
      return;
    }
    setBusy(true);
    try {
      if (destKind === 'sales') {
        await switchSalesRep(id, destId, { source: 'tasks' });
      } else {
        await switchCoach(id, destId, { source: 'tasks' });
      }
      toast.success(`Member #${id} assigned as task!`);
      setQuickId('');
      fetchMembers();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Quick transfer failed');
    } finally {
      setBusy(false);
    }
  };

  // ── Dynamic Table Headers based on visibleKeys ──
  const tableHeaders = useMemo(() => {
    const h = [
      <input
        key="master-cb"
        type="checkbox"
        checked={allOnPageSelected}
        onChange={handleToggleSelectAllPage}
        title="Select all on this page"
        style={{ cursor: 'pointer' }}
      />,
    ];

    if (visibleKeys.includes('systemId')) h.push('ID');
    if (visibleKeys.includes('name')) h.push('Name');
    if (visibleKeys.includes('phone')) h.push('Phone');
    if (visibleKeys.includes('status')) h.push('Status');
    if (visibleKeys.includes('package')) h.push('Package');
    if (visibleKeys.includes('endDate')) h.push('Expires');
    if (visibleKeys.includes('salesman') || visibleKeys.includes('sales')) h.push('Sales Rep');
    if (visibleKeys.includes('coach')) h.push('Coach');
    if (visibleKeys.includes('gender')) h.push('Gender');
    if (visibleKeys.includes('startDate')) h.push('Start Date');
    if (visibleKeys.includes('joined')) h.push('Joined');
    if (visibleKeys.includes('transfers')) h.push('Transfers');
    h.push('Actions');
    return h;
  }, [visibleKeys, allOnPageSelected]);

  return (
    <Layout>
      <PageHeader title="Tasks Management">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Name, phone, ID…"
            width={220}
          />

          <Btn variant="outline" size="sm" onClick={openTasksHistoryModal}>
            📋 View Created Tasks
          </Btn>

          <Btn variant="outline" size="sm" onClick={() => setColumnsOpen(true)}>
            Columns
          </Btn>

          <Btn variant="outline" size="sm" onClick={exportSheet} disabled={loading || !members.length}>
            Export Excel
          </Btn>
        </div>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Task Overview KPIs */}
        {overviewStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
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

        {/* Member Status Stat Cards (matching Members.jsx) */}
        <div className="grid-stats-5">
          <StatCard label="Total"   value={loading ? '—' : stats.total}   color="brand" />
          <StatCard label="Active"  value={loading ? '—' : stats.active}  color="success" />
          <StatCard label="Frozen"  value={loading ? '—' : stats.frozen}  color="info" />
          <StatCard label="Expired" value={loading ? '—' : stats.expired} color="danger" />
          <StatCard label="Guests"  value={loading ? '—' : stats.guest} />
        </div>

        {/* Tab switcher: Only shown for users who can actually receive assigned tasks (e.g. Coach Manager) */}
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
            {/* Filter Toolbar (Status FilterTabs + Sort Toggle) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <FilterTabs
                active={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all',     label: `All (${stats.total})` },
                  { value: 'active',  label: `Active (${stats.active})` },
                  { value: 'frozen',  label: `Frozen (${stats.frozen})` },
                  { value: 'expired', label: `Expired (${stats.expired})` },
                  { value: 'guest',   label: `Guests (${stats.guest})` },
                  { value: 'blocked', label: `Blocked (${stats.blocked ?? 0})` },
                ]}
              />

              <button
                type="button"
                onClick={() => setSortNewest((s) => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${sortNewest ? '#44298C' : 'var(--border)'}`,
                  background: sortNewest ? 'rgba(68,41,140,0.08)' : 'transparent',
                  color: sortNewest ? '#44298C' : 'var(--t3)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 8l4-4 4 4M7 4v16M21 16l-4 4-4-4M17 20V4"/>
                </svg>
                {sortNewest ? 'Newest First' : 'Oldest First'}
              </button>
            </div>

            {/* Advanced Filters Card */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Row 1: Scope & Transfer Type */}
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
                      <option value="unassigned_sales">Unassigned Sales Rep</option>
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
                        <option value="">Choose {kind === 'sales' ? 'sales rep' : 'coach'}…</option>
                        {(kind === 'sales' ? salesUsers.filter((u) => u.role === 'Sales') : coaches).map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}

                  <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <Select
                      label="Transfer Status"
                      value={transferTypeFilter}
                      onChange={(e) => setTransferTypeFilter(e.target.value)}
                    >
                      <option value="all">All Transfer Statuses</option>
                      <option value="transferred">Transferred Members</option>
                      <option value="never">Never Transferred</option>
                      <option value="sales">Transferred by Sales</option>
                      <option value="coach">Transferred by Coach</option>
                    </Select>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn
                      variant={moreFiltersOpen ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setMoreFiltersOpen((v) => !v)}
                    >
                      ⚙️ {moreFiltersOpen ? 'Hide Filters' : 'More Filters'}
                    </Btn>

                    <Btn variant="ghost" size="sm" onClick={handleClearAllFilters}>
                      Reset
                    </Btn>
                  </div>
                </div>

                {/* Secondary Filters Collapsible */}
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
                          <option value="transferDate">Transfer Date</option>
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

                      <div style={{ display: 'flex', gap: 6, paddingBottom: 2, flexWrap: 'wrap' }}>
                        <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('next30')}>Next 30d</Btn>
                        <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('last30')}>Last 30d</Btn>
                        <Btn size="xs" variant="ghost" onClick={() => setQuickPeriod('clear')}>Clear Dates</Btn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Selection & Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PageSizeFilter
                  pageSize={pageSize}
                  onChange={handlePageSizeChange}
                  options={PAGE_SIZE_OPTIONS}
                />

                {selected.size > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    {selected.size} member(s) selected
                  </span>
                )}

                {selected.size > 0 && (
                  <Btn size="xs" variant="ghost" onClick={handleClearSelection} style={{ color: 'var(--red)' }}>
                    Deselect All
                  </Btn>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Selection Templates Dropdown */}
                <div style={{ position: 'relative' }} ref={templateMenuRef}>
                  <Btn
                    size="sm"
                    variant={selected.size > 0 ? 'primary' : 'outline'}
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
                    <span>⚡</span> Selection Templates <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>
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
                        boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
                        padding: '14px 16px',
                        fontSize: 12,
                        color: 'var(--t1)',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>Selection Presets</div>
                        {selected.size > 0 && (
                          <Btn
                            size="xs"
                            variant="ghost"
                            onClick={handleClearSelection}
                            style={{ color: 'var(--red)', fontSize: 11, padding: '2px 6px' }}
                          >
                            Clear ({selected.size})
                          </Btn>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Quick Count Grid */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>SELECT FIRST:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {[10, 20, 30, 50].map((num) => (
                              <button
                                key={`first_${num}`}
                                type="button"
                                onClick={() => handleApplyTemplate(`first_${num}`)}
                                style={{
                                  padding: '7px 4px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg)',
                                  color: 'var(--t1)',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--primary)';
                                  e.currentTarget.style.background = 'var(--navy-subtle, rgba(59, 130, 246, 0.08))';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--border)';
                                  e.currentTarget.style.background = 'var(--bg)';
                                }}
                              >
                                First {num}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Condition Presets */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>FILTER BY STATUS:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleApplyTemplate('unassigned_sales')}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg)',
                                color: 'var(--t1)',
                                fontSize: 12,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'var(--navy-subtle, rgba(59, 130, 246, 0.08))';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.background = 'var(--bg)';
                              }}
                            >
                              <span>No Sales Rep Assigned</span>
                              <span style={{ fontWeight: 700, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--card)', border: '1px solid var(--border)' }}>
                                {templateCounts.unassignedSales}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApplyTemplate('unassigned_coach')}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg)',
                                color: 'var(--t1)',
                                fontSize: 12,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'var(--navy-subtle, rgba(59, 130, 246, 0.08))';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.background = 'var(--bg)';
                              }}
                            >
                              <span>No Coach Assigned</span>
                              <span style={{ fontWeight: 700, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--card)', border: '1px solid var(--border)' }}>
                                {templateCounts.unassignedCoach}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={handleInvertSelection}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg)',
                                color: 'var(--t1)',
                                fontSize: 12,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                textAlign: 'left',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'var(--navy-subtle, rgba(59, 130, 246, 0.08))';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.background = 'var(--bg)';
                              }}
                            >
                              <span>Invert Selection</span>
                              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Toggle</span>
                            </button>
                          </div>
                        </div>

                        {/* Action row */}
                        <div style={{ paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              handleToggleSelectAllPage();
                              setTemplateMenuOpen(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--bg)',
                              color: 'var(--t1)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--primary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                          >
                            {allOnPageSelected ? 'Deselect Page' : 'Select All on Page'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Btn
                  size="sm"
                  variant="primary"
                  disabled={!selected.size}
                  onClick={() => openTransferModal('sales')}
                >
                  👤 Assign Sales Rep {selected.size > 0 && `(${selected.size})`}
                </Btn>

                <Btn
                  size="sm"
                  variant="outline"
                  disabled={!selected.size}
                  onClick={() => openTransferModal('coach')}
                >
                  🏋️ Assign Coach {selected.size > 0 && `(${selected.size})`}
                </Btn>
              </div>
            </div>

            {/* Member Table Card (matching Members.jsx styling, respecting visibleKeys) */}
            <Card noPad>
              <div style={{ overflowX: 'auto' }}>
                <Table
                  loading={loading}
                  skeletonRows={Math.min(pageSize, 8)}
                  headers={tableHeaders}
                >
                  {!members.length && !loading ? (
                    <tr>
                      <td colSpan={tableHeaders.length}>
                        <EmptyState message="No members match your search or filters" />
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const sub = m.subscriptions?.at(-1);
                      const pkg = sub?.package;
                      const expiring =
                        sub?.endDate &&
                        (new Date(sub.endDate) - new Date()) / 86400000 <= 7 &&
                        new Date(sub.endDate) - new Date() >= 0;
                      const isSelected = selected.has(m._id);

                      return (
                        <tr
                          key={m._id}
                          className="tbl-row"
                          onClick={() => setSelected((prev) => toggleId(prev, m._id))}
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'var(--navy-subtle, rgba(59, 130, 246, 0.08))' : undefined,
                          }}
                        >
                          <td
                            style={{ width: 40, textAlign: 'center', padding: '10px 14px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelected((prev) => toggleId(prev, m._id))}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>

                          {visibleKeys.includes('systemId') && (
                            <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                              {formatSystemId(m.systemId)}
                              {m.memberId ? ` / ${m.memberId}` : ''}
                            </td>
                          )}

                          {visibleKeys.includes('name') && (
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar name={m.name} size="sm" photo={m.photo} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                              </div>
                            </td>
                          )}

                          {visibleKeys.includes('phone') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                              {m.phones || '—'}
                            </td>
                          )}

                          {visibleKeys.includes('status') && (
                            <td style={{ padding: '10px 14px' }}>
                              <Badge status={m.status} />
                            </td>
                          )}

                          {visibleKeys.includes('package') && (
                            <td style={{ padding: '10px 14px', fontSize: 12 }}>
                              {pkg ? (
                                <span style={{ color: 'var(--t1)', fontWeight: 500 }}>
                                  {pkg.name}
                                  <br />
                                  <span style={{ color: 'var(--t4)', fontSize: 11 }}>
                                    {pkg.activityType} · {pkg.duration}
                                  </span>
                                </span>
                              ) : (
                                <span style={{ color: 'var(--t4)' }}>—</span>
                              )}
                            </td>
                          )}

                          {visibleKeys.includes('endDate') && (
                            <td
                              style={{
                                padding: '10px 14px',
                                fontSize: 12,
                                color: expiring ? 'var(--amber)' : 'var(--t3)',
                                fontWeight: expiring ? 600 : 400,
                              }}
                            >
                              {fmtDate(sub?.endDate)}
                              {expiring && (
                                <span style={{ display: 'block', fontSize: 10, color: 'var(--amber)' }}>Expiring soon</span>
                              )}
                            </td>
                          )}

                          {(visibleKeys.includes('salesman') || visibleKeys.includes('sales')) && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                              {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                            </td>
                          )}

                          {visibleKeys.includes('coach') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                              {m.current_couch?.name ?? <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                            </td>
                          )}

                          {visibleKeys.includes('gender') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)', textTransform: 'capitalize' }}>
                              {m.gender || '—'}
                            </td>
                          )}

                          {visibleKeys.includes('startDate') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>
                              {fmtDate(sub?.startDate)}
                            </td>
                          )}

                          {visibleKeys.includes('joined') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>
                              {fmtDate(m.createdAt)}
                            </td>
                          )}

                          {visibleKeys.includes('transfers') && (
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>
                              {Array.isArray(m.userlog) ? m.userlog.filter((l) => l.type === 'assign').length : 0}
                            </td>
                          )}

                          <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                            <Btn variant="outline" size="xs" onClick={() => navigate(`/members/${m.systemId}`)}>
                              View
                            </Btn>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </Table>
              </div>

              {!loading && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  total={pagination.total}
                  pageSize={pagination.limit ?? pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
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

        {/* ── CUSTOMIZE COLUMNS MODAL ── */}
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
                        color: 'var(--t1)',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: checked ? 'var(--navy-subtle, rgba(59, 130, 246, 0.08))' : 'var(--bg)',
                        border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
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
                      <span style={{ fontWeight: checked ? 600 : 400 }}>{col.label}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <Btn
                  size="xs"
                  variant="ghost"
                  onClick={() => handleUpdateVisibleKeys(DEFAULT_COLUMNS)}
                >
                  Reset to Default
                </Btn>
                <Btn size="sm" variant="primary" onClick={() => setColumnsOpen(false)}>
                  Apply Columns
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {/* ── BULK TRANSFER MODAL ── */}
        {transferOpen && (
          <Modal open={transferOpen} title={`Assign Tasks to ${destKind === 'sales' ? 'Sales Rep' : 'Coach'}`} onClose={() => setTransferOpen(false)}>
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
          <Modal open={historyOpen} title="Created Tasks History" onClose={() => setHistoryOpen(false)} maxWidth={860}>
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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, EmptyState, Badge, Avatar,
  Select, Modal, FilterTabs, Pagination,
} from '../../components/ui';
import {
  getAllMembers, getSalesUsers, getCoachTeam, getPackages,
  bulkTransferSalesReps, bulkTransferCoach, sendWhatsAppMessage,
} from '../../api/endpoints';
import {
  filterMembersAdvanced, packageName, toLocalDateString, columnValue,
  taskPermissions, toggleId, toggleIds,
} from './taskMembers';
import { formatSystemId } from '../../lib/systemId';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

async function loadAllMembers() {
  const members = [];
  let page = 1;
  for (;;) {
    const params = { page, limit: 100, sortBy: 'name', sortDir: 1 };
    const res = await getAllMembers(params);
    members.push(...(res.data.members ?? []));
    const totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
    if (page > totalPages || page > 40) break;
  }
  return members;
}

export default function TaskFilterPage() {
  usePageTitle('Filter Members');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const { canSalesman, canCoach, canWhatsApp } = taskPermissions(user, hasFeature);

  // ── Reference Data ──
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [allPackages, setAllPackages] = useState([]);

  // ── Members Data ──
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kind, setKind] = useState('all');
  const [personId, setPersonId] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [transferTypeFilter, setTransferTypeFilter] = useState('all');
  const [dateField, setDateField] = useState('endDate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // ── Selection ──
  const [selected, setSelected] = useState(() => new Set());
  const selectedSet = useMemo(() => {
    return selected instanceof Set ? selected : new Set(selected || []);
  }, [selected]);

  // ── Pagination ──
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // ── Bulk Transfer Modal ──
  const [transferOpen, setTransferOpen] = useState(false);
  const [destKind, setDestKind] = useState('sales');
  const [destId, setDestId] = useState('');
  const [busy, setBusy] = useState(false);

  // ── WhatsApp Modal ──
  const [waOpen, setWaOpen] = useState(false);
  const [waTemplate, setWaTemplate] = useState('Hi {{name}}, we wanted to reach out to you about your membership.');
  const [waSending, setWaSending] = useState(false);
  const [waSentCount, setWaSentCount] = useState(0);

  // ── Load reference data ──
  useEffect(() => {
    getSalesUsers()
      .then((res) => setSalesUsers(res.data.salesUsers ?? []))
      .catch(() => {});
    getCoachTeam()
      .then((res) => {
        setCoaches((res.data.team ?? []).filter((p) => ['Coach', 'Coach Manager'].includes(p.role)));
      })
      .catch(() => {});
    getPackages({ limit: 100 })
      .then((res) => setAllPackages(res.data.packages ?? []))
      .catch(() => {});
  }, []);

  // ── Load all members ──
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    try {
      const list = await loadAllMembers();
      setMembers(list);
      setLoaded(true);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ── Staff picker options ──
  const people = kind === 'sales'
    ? salesUsers.filter((p) => p.role === 'Sales')
    : coaches;

  // ── Filtered members ──
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

  // ── Status counts ──
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

  // ── Active filter count ──
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

  // ── Pagination ──
  useEffect(() => { setPage(1); }, [search, statusFilter, kind, personId, dateField, dateFrom, dateTo, transferTypeFilter, packageFilter, genderFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // ── Handlers ──
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

  const isAllFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedSet.has(m._id));

  const handleSelectAllFiltered = () => {
    const ids = filtered.map((m) => m._id);
    setSelected((prev) => toggleIds(prev, ids));
  };

  const setQuickPeriod = (preset) => {
    const now = new Date();
    if (preset === 'clear') { setDateFrom(''); setDateTo(''); return; }
    if (preset === 'today') {
      setDateFrom(toLocalDateString(now));
      setDateTo(toLocalDateString(now));
    } else if (preset === 'next30') {
      const to = new Date(now); to.setDate(to.getDate() + 30);
      setDateFrom(toLocalDateString(now));
      setDateTo(toLocalDateString(to));
    } else if (preset === 'last30') {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      setDateFrom(toLocalDateString(from));
      setDateTo(toLocalDateString(now));
    }
  };

  // ── Bulk Transfer ──
  const openTransferModal = (targetKind) => {
    if (!selectedSet.size) { toast.error('Select at least one member'); return; }
    setDestKind(targetKind);
    setDestId('');
    setTransferOpen(true);
  };

  const executeBulkTransfer = async () => {
    if (!destId) {
      toast.error(destKind === 'sales' ? 'Choose a sales rep' : 'Choose a coach');
      return;
    }
    const ids = Array.from(selectedSet);
    if (!ids.length) return;
    setBusy(true);
    try {
      if (destKind === 'sales') {
        await bulkTransferSalesReps({ memberIds: ids, newSalesRepId: destId, source: 'filter' });
      } else {
        await bulkTransferCoach({ memberIds: ids, newCoachId: destId, source: 'filter' });
      }
      toast.success(`Successfully assigned ${ids.length} members!`);
      setSelected(new Set());
      setTransferOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  // ── WhatsApp Bulk Send ──
  const openWaModal = () => {
    if (!selectedSet.size) { toast.error('Select at least one member'); return; }
    setWaSentCount(0);
    setWaOpen(true);
  };

  const executeWhatsApp = async () => {
    const selectedMembers = members.filter((m) => selectedSet.has(m._id));
    if (!selectedMembers.length) return;
    setWaSending(true);
    setWaSentCount(0);
    let sent = 0;
    for (const member of selectedMembers) {
      const phone = member.phones;
      if (!phone || phone === 'hidden') continue;
      const message = waTemplate.replace(/\{\{name\}\}/g, member.name || '');
      try {
        await sendWhatsAppMessage({ phone, message });
        sent += 1;
        setWaSentCount(sent);
      } catch {
        // skip failed
      }
    }
    toast.success(`Sent WhatsApp to ${sent} member(s)`);
    setWaSending(false);
    setWaOpen(false);
  };

  const selectStyle = {
    width: '100%', height: 38, padding: '0 10px',
    borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--t1)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  };

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: 'var(--t3)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 6,
  };

  return (
    <Layout>
      <PageHeader title="Filter Members">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/tasks/assign')}>
            ← Back to Tasks
          </Btn>
          <Btn variant="outline" size="sm" onClick={fetchMembers} disabled={loading}>
            {loading ? <Spinner size="sm" /> : '↻ Reload'}
          </Btn>
        </div>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── FILTERS CARD ── */}
        <Card style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Row 1: Search + Scope + Staff */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>

              {/* View Scope */}
              <div style={{ flex: '0 0 auto', width: 210, minWidth: 170 }}>
                <label style={labelStyle}>View Scope</label>
                <select
                  value={kind}
                  onChange={(e) => { setKind(e.target.value); setPersonId(''); }}
                  style={selectStyle}
                >
                  <option value="all">All Gym Members</option>
                  <option value="sales">By Sales Rep</option>
                  <option value="coach">By Coach</option>
                  <option value="unassigned_sales">Unassigned Sales</option>
                  <option value="unassigned_coach">Unassigned Coach</option>
                </select>
              </div>

              {/* Staff Picker */}
              {(kind === 'sales' || kind === 'coach') && (
                <div style={{ flex: '0 0 auto', width: 210, minWidth: 170 }}>
                  <label style={labelStyle}>{kind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}</label>
                  <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={selectStyle}>
                    <option value="">All {kind === 'sales' ? 'Sales Reps' : 'Coaches'}</option>
                    {people.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search */}
              <div style={{ flex: '1 1 240px', minWidth: 200, position: 'relative' }}>
                <label style={labelStyle}>Search Members</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <svg
                    style={{ position: 'absolute', left: 11, color: 'var(--t4)', pointerEvents: 'none' }}
                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, System ID…"
                    style={{
                      width: '100%', height: 38, paddingLeft: 34,
                      paddingRight: search ? 30 : 12, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{
                        position: 'absolute', right: 8, background: 'none',
                        border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, fontSize: 12,
                      }}
                    >✕</button>
                  )}
                </div>
              </div>

              {/* Filter toggle + Reset */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                <button
                  type="button"
                  onClick={() => setMoreFiltersOpen((o) => !o)}
                  style={{
                    height: 38, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: `1px solid ${moreFiltersOpen || activeFilterCount > 0 ? 'var(--navy, #44298C)' : 'var(--border)'}`,
                    background: moreFiltersOpen || activeFilterCount > 0 ? 'rgba(68,41,140,0.06)' : 'var(--card)',
                    color: moreFiltersOpen || activeFilterCount > 0 ? 'var(--navy, #44298C)' : 'var(--t2)',
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  <span>{moreFiltersOpen ? '▲ Less Filters' : '▼ More Filters'}</span>
                  {activeFilterCount > 0 && (
                    <span style={{
                      background: 'var(--navy, #44298C)', color: '#fff',
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 2,
                    }}>{activeFilterCount}</span>
                  )}
                </button>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    style={{
                      height: 38, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: '1px solid transparent', background: 'transparent', color: 'var(--red, #dc2626)',
                      cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >↺ Reset</button>
                )}
              </div>
            </div>

            {/* Row 2: Status tabs */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <FilterTabs
                options={[
                  { value: 'all', label: `All (${statusCounts.all})` },
                  { value: 'active', label: `Active (${statusCounts.active})` },
                  { value: 'expired', label: `Expired (${statusCounts.expired})` },
                  { value: 'frozen', label: `Frozen (${statusCounts.frozen})` },
                  { value: 'guest', label: `Guest (${statusCounts.guest})` },
                  { value: 'blocked', label: `Blocked (${statusCounts.blocked})` },
                ]}
                active={statusFilter}
                onChange={setStatusFilter}
              />
            </div>

            {/* Row 3: Collapsible secondary filters */}
            {moreFiltersOpen && (
              <div style={{
                marginTop: 4, padding: '16px 18px', borderRadius: 10,
                background: 'var(--bg, #F4F5F7)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  {/* Package */}
                  <div>
                    <label style={labelStyle}>Package</label>
                    <select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} style={selectStyle}>
                      <option value="all">All Packages</option>
                      {allPackages.map((pkg) => (
                        <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Gender */}
                  <div>
                    <label style={labelStyle}>Gender</label>
                    <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} style={selectStyle}>
                      <option value="all">All Genders</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  {/* Transfer Status */}
                  <div>
                    <label style={labelStyle}>Transfer Status</label>
                    <select value={transferTypeFilter} onChange={(e) => setTransferTypeFilter(e.target.value)} style={selectStyle}>
                      <option value="all">All</option>
                      <option value="transferred">Transferred</option>
                      <option value="never">Never Transferred</option>
                      <option value="bulk">Bulk Transferred</option>
                    </select>
                  </div>
                </div>

                {/* Date Range */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                    <label style={labelStyle}>Date Field</label>
                    <select value={dateField} onChange={(e) => setDateField(e.target.value)} style={selectStyle}>
                      <option value="endDate">End Date</option>
                      <option value="startDate">Start Date</option>
                      <option value="createdAt">Join Date</option>
                      <option value="transferDate">Transfer Date</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                    <label style={labelStyle}>From Date</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...selectStyle, cursor: 'default' }} />
                  </div>
                  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                    <label style={labelStyle}>To Date</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...selectStyle, cursor: 'default' }} />
                  </div>
                  {/* Quick presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, flexWrap: 'wrap' }}>
                    {['today', 'next30', 'last30'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setQuickPeriod(p)}
                        style={{
                          height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid var(--border)',
                          background: 'var(--card)', color: 'var(--t2)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {p === 'today' ? 'Today' : p === 'next30' ? 'Next 30d' : 'Last 30d'}
                      </button>
                    ))}
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => setQuickPeriod('clear')}
                        style={{
                          height: 38, padding: '0 11px', borderRadius: 7,
                          border: '1px solid var(--red-bd, #fecaca)', background: 'var(--red-bg, #fef2f2)',
                          color: 'var(--red, #dc2626)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >Clear Dates</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── MEMBERS TABLE ── */}
        <Card noPad>
          {/* Toolbar */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  disabled={!filtered.length}
                />
                <span>Select All Filtered ({filtered.length})</span>
              </label>
              {selectedSet.size > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  borderRadius: 6, background: 'rgba(68,41,140,0.08)', color: 'var(--navy, #44298C)',
                  fontSize: 12, fontWeight: 700,
                }}>
                  <span>● {selectedSet.size} selected</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    style={{ background: 'none', border: 'none', color: 'var(--red, #dc2626)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '0 2px' }}
                  >(Clear)</button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canSalesman && (
                <Btn size="sm" variant="primary" disabled={!selectedSet.size} onClick={() => openTransferModal('sales')}>
                  👤 Assign Sales Rep ({selectedSet.size})
                </Btn>
              )}
              {canCoach && (
                <Btn size="sm" variant="outline" disabled={!selectedSet.size} onClick={() => openTransferModal('coach')}>
                  🏋️ Assign Coach ({selectedSet.size})
                </Btn>
              )}
              {canWhatsApp && (
                <Btn size="sm" variant="outline" disabled={!selectedSet.size} onClick={openWaModal}>
                  💬 WhatsApp ({selectedSet.size})
                </Btn>
              )}
            </div>
          </div>

          {/* Table Body */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size="lg" />
            </div>
          ) : !loaded ? (
            <EmptyState icon="🔍" message="Loading members…" sub="Please wait while we fetch the data." />
          ) : filtered.length === 0 ? (
            <EmptyState icon="👥" message="No members found" sub="Adjust your filters to see results." />
          ) : (
            <>
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
                    {paginatedMembers.map((member) => {
                      const isSelected = selectedSet.has(member._id);
                      return (
                        <tr
                          key={member._id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent',
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
                              <Avatar name={member.name} size="sm" photo={member.photo} />
                              <span>{member.name}</span>
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 12 }}>
                            {formatSystemId(member.systemId)}
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
                            <Badge status={member.isBlocked ? 'blocked' : member.status || 'active'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(newSize) => { setPageSize(Math.max(1, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE)); setPage(1); }}
              />
            </>
          )}
        </Card>
      </div>

      {/* ── BULK TRANSFER MODAL ── */}
      {transferOpen && (
        <Modal
          open={transferOpen}
          title={`Assign to ${destKind === 'sales' ? 'Sales Rep' : 'Coach'}`}
          onClose={() => setTransferOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
              You are assigning <strong>{selectedSet.size} member(s)</strong> to a{' '}
              {destKind === 'sales' ? 'sales rep' : 'coach'}.
            </p>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="outline" onClick={() => setTransferOpen(false)} disabled={busy}>Cancel</Btn>
              <Btn variant="primary" onClick={executeBulkTransfer} disabled={busy || !destId}>
                {busy ? <Spinner size="sm" /> : `Confirm & Assign (${selectedSet.size})`}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── WHATSAPP MODAL ── */}
      {waOpen && (
        <Modal
          open={waOpen}
          title={`Send WhatsApp to ${selectedSet.size} Member(s)`}
          onClose={() => setWaOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
              Use <code>{'{{name}}'}</code> as a placeholder for the member's name.
            </p>
            <div>
              <label style={labelStyle}>Message Template</label>
              <textarea
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                rows={5}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                  outline: 'none', resize: 'vertical',
                }}
              />
            </div>
            {waSending && (
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                Sending… {waSentCount} / {selectedSet.size} sent
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="outline" onClick={() => setWaOpen(false)} disabled={waSending}>Cancel</Btn>
              <Btn variant="primary" onClick={executeWhatsApp} disabled={waSending || !waTemplate.trim()}>
                {waSending ? <Spinner size="sm" /> : `Send to ${selectedSet.size} Members`}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

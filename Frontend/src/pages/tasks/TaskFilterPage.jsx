import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, FilterTabs, MenuSelect,
} from '../../components/ui';
import {
  getSalesUsers, getCoachTeam, getPackages,
} from '../../api/endpoints';
import {
  toLocalDateString, taskPermissions,
} from './taskMembers';
import { ArrowRight, Search, X } from 'lucide-react';

export default function TaskFilterPage() {
  usePageTitle('Filter Members');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  taskPermissions(user, hasFeature); // validate permissions

  // ── Reference Data ──
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [refLoading, setRefLoading] = useState(true);

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
  const [selectCount, setSelectCount] = useState('');
  const [selectOrder, setSelectOrder] = useState('first');
  const [pageSize, setPageSize] = useState('20');

  // ── Restore filters from location state (coming back from results) ──
  useEffect(() => {
    const f = location.state?.filters;
    if (!f) return;
    if (f.search !== undefined) setSearch(f.search);
    if (f.statusFilter !== undefined) setStatusFilter(f.statusFilter);
    if (f.kind !== undefined) setKind(f.kind);
    if (f.personId !== undefined) setPersonId(f.personId);
    if (f.packageFilter !== undefined) setPackageFilter(f.packageFilter);
    if (f.genderFilter !== undefined) setGenderFilter(f.genderFilter);
    if (f.transferTypeFilter !== undefined) setTransferTypeFilter(f.transferTypeFilter);
    if (f.dateField !== undefined) setDateField(f.dateField);
    if (f.dateFrom !== undefined) setDateFrom(f.dateFrom);
    if (f.dateTo !== undefined) setDateTo(f.dateTo);
    if (f.selectCount !== undefined) setSelectCount(String(f.selectCount ?? ''));
    if (f.selectOrder !== undefined) setSelectOrder(f.selectOrder === 'last' ? 'last' : 'first');
    if (f.pageSize !== undefined) setPageSize(String(f.pageSize || '20'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load reference data (re-fetch when branch changes) ──
  useLocationEffect(() => {
    setRefLoading(true);
    Promise.all([
      getSalesUsers().then((res) => setSalesUsers(res.data.salesUsers ?? [])).catch(() => {}),
      getCoachTeam().then((res) => {
        setCoaches((res.data.team ?? []).filter((p) => p.role === 'Coach'));
      }).catch(() => {}),
      getPackages({ limit: 100 }).then((res) => setAllPackages(res.data.packages ?? [])).catch(() => {}),
    ]).finally(() => setRefLoading(false));
  }, []);

  // ── Staff picker options ──
  const people = kind === 'sales'
    ? salesUsers.filter((p) => p.role === 'Sales')
    : coaches;

  // ── Active filter count (for badge) ──
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (statusFilter !== 'all') count++;
    if (kind !== 'all') count++;
    if (personId) count++;
    if (packageFilter !== 'all') count++;
    if (genderFilter !== 'all') count++;
    if (transferTypeFilter !== 'all') count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [search, statusFilter, kind, personId, packageFilter, genderFilter, transferTypeFilter, dateFrom, dateTo]);

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
    setSelectCount('');
    setSelectOrder('first');
    setPageSize('20');
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

  const handleFilterMembers = () => {
    const parsedCount = parseInt(selectCount, 10);
    const parsedPageSize = parseInt(pageSize, 10);
    navigate('/tasks/filter/results', {
      state: {
        filters: {
          search, statusFilter, kind, personId,
          packageFilter, genderFilter, transferTypeFilter,
          dateField, dateFrom, dateTo,
          selectCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : '',
          selectOrder: selectOrder === 'last' ? 'last' : 'first',
          pageSize: Number.isFinite(parsedPageSize) && parsedPageSize > 0
            ? Math.min(500, Math.max(1, parsedPageSize))
            : 20,
        },
      },
    });
  };

  const inputStyle = {
    width: '100%', height: 38, padding: '0 10px',
    borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--t1)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: 'var(--t3)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 6,
  };

  const sectionDivider = {
    borderTop: '1px solid var(--border)',
    paddingTop: 20,
    marginTop: 4,
  };

  return (
    <Layout>
      <PageHeader walkthrough="task-filter-header" title="Filter Members">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/tasks/assign')}>
            ← Back to Tasks
          </Btn>
        </div>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="task-filter-board" style={{ paddingTop: 20, paddingBottom: 48, maxWidth: 820, margin: '0 auto' }}>
        <Card style={{ padding: '28px 32px' }}>
          {refLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner size="lg" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Section: Search ── */}
              <div>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>Search</p>
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
                      width: '100%', height: 42, paddingLeft: 36,
                      paddingRight: search ? 36 : 14, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{
                        position: 'absolute', right: 10, background: 'none',
                        border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, fontSize: 14,
                      }}
                    ><X size={14} aria-hidden /></button>
                  )}
                </div>
              </div>

              {/* ── Section: Status ── */}
              <div style={sectionDivider}>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>Member Status</p>
                <FilterTabs
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active' },
                    { value: 'expired', label: 'Expired' },
                    { value: 'frozen', label: 'Frozen' },
                    { value: 'guest', label: 'Guest' },
                    { value: 'blocked', label: 'Blocked' },
                  ]}
                  active={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>

              {/* ── Section: View Scope + Staff ── */}
              <div style={sectionDivider}>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>View Scope</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Scope</label>
                    <MenuSelect
                      value={kind}
                      onChange={(e) => { setKind(e.target.value); setPersonId(''); }}
                      style={{ width: '100%' }}
                      aria-label="View scope"
                    >
                      <option value="all">All Gym Members</option>
                      <option value="sales">By Sales Rep</option>
                      <option value="coach">By Coach</option>
                      <option value="unassigned_sales">Unassigned Sales</option>
                      <option value="unassigned_coach">Unassigned Coach</option>
                    </MenuSelect>
                  </div>
                  {(kind === 'sales' || kind === 'coach') && (
                    <div>
                      <label style={labelStyle}>{kind === 'sales' ? 'Select Sales Rep' : 'Select Coach'}</label>
                      <MenuSelect value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ width: '100%' }} aria-label={kind === 'sales' ? 'Select sales rep' : 'Select coach'}>
                        <option value="">All {kind === 'sales' ? 'Sales Reps' : 'Coaches'}</option>
                        {people.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </MenuSelect>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: Package / Gender / Transfer Status ── */}
              <div style={sectionDivider}>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>Additional Filters</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Package</label>
                    <MenuSelect value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} style={{ width: '100%' }} aria-label="Package">
                      <option value="all">All Packages</option>
                      {allPackages.map((pkg) => (
                        <option key={pkg._id} value={pkg._id}>{pkg.name}</option>
                      ))}
                    </MenuSelect>
                  </div>
                  <div>
                    <label style={labelStyle}>Gender</label>
                    <MenuSelect value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} style={{ width: '100%' }} aria-label="Gender">
                      <option value="all">All Genders</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </MenuSelect>
                  </div>
                  <div>
                    <label style={labelStyle}>Transfer Status</label>
                    <MenuSelect value={transferTypeFilter} onChange={(e) => setTransferTypeFilter(e.target.value)} style={{ width: '100%' }} aria-label="Transfer status">
                      <option value="all">All</option>
                      <option value="transferred">Transferred</option>
                      <option value="never">Never Transferred</option>
                      <option value="bulk">Bulk Transferred</option>
                    </MenuSelect>
                  </div>
                </div>
              </div>

              {/* ── Section: Date Range ── */}
              <div style={sectionDivider}>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>Date Range</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Date Field</label>
                    <MenuSelect value={dateField} onChange={(e) => setDateField(e.target.value)} style={{ width: '100%' }} aria-label="Date field">
                      <option value="endDate">End Date</option>
                      <option value="startDate">Start Date</option>
                      <option value="createdAt">Join Date</option>
                      <option value="transferDate">Transfer Date</option>
                    </MenuSelect>
                  </div>
                  <div>
                    <label style={labelStyle}>From Date</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>To Date</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                {/* Quick presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quick:</span>
                  {['today', 'next30', 'last30'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setQuickPeriod(p)}
                      style={{
                        height: 32, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border)',
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
                        height: 32, padding: '0 12px', borderRadius: 7,
                        border: '1px solid var(--red-bd, #fecaca)', background: 'var(--red-bg, #fef2f2)',
                        color: 'var(--red, #dc2626)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >Clear Dates</button>
                  )}
                </div>
              </div>

              {/* ── Section: Selection & Display ── */}
              <div style={sectionDivider}>
                <p style={{ ...labelStyle, marginBottom: 10, fontSize: 12 }}>Selection & Display</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>How many members to select</label>
                    <input
                      type="number"
                      min="1"
                      value={selectCount}
                      onChange={(e) => setSelectCount(e.target.value)}
                      placeholder="e.g. 25"
                      className="no-spinners"
                      style={{ ...inputStyle, MozAppearance: 'textfield' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSelectOrder('first')}
                        style={{
                          height: 34, borderRadius: 8, border: `1px solid ${selectOrder === 'first' ? 'var(--navy)' : 'var(--border)'}`,
                          background: selectOrder === 'first' ? 'var(--navy)' : 'var(--card)',
                          color: selectOrder === 'first' ? '#fff' : 'var(--t1)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        First
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectOrder('last')}
                        style={{
                          height: 34, borderRadius: 8, border: `1px solid ${selectOrder === 'last' ? 'var(--navy)' : 'var(--border)'}`,
                          background: selectOrder === 'last' ? 'var(--navy)' : 'var(--card)',
                          color: selectOrder === 'last' ? '#fff' : 'var(--t1)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Last
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Members per page</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value)}
                      placeholder="e.g. 20"
                      className="no-spinners"
                      style={{ ...inputStyle, MozAppearance: 'textfield' }}
                    />
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--t4)' }}>
                      Controls how many rows show on the results table.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Actions ── */}
              <div style={{
                ...sectionDivider,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              }}>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  disabled={activeFilterCount === 0}
                  style={{
                    height: 40, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: activeFilterCount > 0 ? 'var(--red, #dc2626)' : 'var(--t4)',
                    cursor: activeFilterCount > 0 ? 'pointer' : 'default',
                    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                    opacity: activeFilterCount === 0 ? 0.5 : 1,
                  }}
                >
                  ↺ Reset All Filters
                </button>

                <button
                  type="button"
                  onClick={handleFilterMembers}
                  style={{
                    height: 44, padding: '0 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    border: 'none', background: 'var(--navy, var(--navy))', color: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 2px 10px color-mix(in srgb, var(--navy) 30%, transparent)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Search size={16} aria-hidden /> Filter Members</span>
                  {activeFilterCount > 0 && (
                    <span style={{
                      background: 'rgba(255,255,255,0.25)', color: '#fff',
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    }}>{activeFilterCount} active</span>
                  )}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>

            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import useDebounce from '../hooks/useDebounce';
import Layout from '../components/Layout';
import { PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState, SearchInput, Avatar, fmtDate, Pagination, PageSizeFilter, Spinner } from '../components/ui';
import { getAllMembers, getSalesUsers, getCoachTeam, switchSalesRep, switchCoach } from '../api/endpoints';
import AddMemberModal from '../components/AddMemberModal';
import { formatSystemId } from '../lib/systemId';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export default function Members() {
  usePageTitle('Members');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('members_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [sortNewest, setSortNewest] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: DEFAULT_PAGE_SIZE });
  const [stats, setStats]       = useState({ total: 0, active: 0, frozen: 0, expired: 0, guest: 0 });
  const [showAdd, setShowAdd]   = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const canAdd = ['Receptionist', 'Owner', 'Sales Manager'].includes(user?.role);
  const canTransfer = ['Owner', 'General Manager', 'Sales Manager', 'Coach Manager'].includes(user?.role) ||
    user?.access?.includes('transfer') || user?.access?.includes('coach_transfer');

  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [quickId, setQuickId] = useState('');
  const [destId, setDestId] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    if (canTransfer) {
      getSalesUsers()
        .then((res) => setSalesUsers(res.data.salesUsers ?? []))
        .catch(() => {});
      getCoachTeam()
        .then((res) => {
          setCoaches((res.data.team ?? []).filter((p) => ['Coach', 'Coach Manager'].includes(p.role)));
        })
        .catch(() => {});
    }
  }, [canTransfer]);

  const handleQuickTransfer = async (e) => {
    e.preventDefault();
    const id = quickId.trim();
    if (!id) return;
    if (!destId) {
      toast.error('Choose a target staff member');
      return;
    }
    setQuickBusy(true);
    try {
      const isSales = salesUsers.some((u) => u._id === destId);
      if (isSales) {
        await switchSalesRep(id, destId, { reason: 'Quick transfer from Member Management' });
      } else {
        await switchCoach(id, destId, { reason: 'Quick transfer from Member Management' });
      }
      toast.success(`Member #${id} assigned successfully!`);
      setQuickId('');
      setDestId('');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setQuickBusy(false);
    }
  };

  const fetchMembers = useCallback(async (override = {}) => {
    const status = override.status ?? filter;
    const pageNum = override.page ?? page;
    const search = override.search ?? debouncedSearch;
    const newest = override.sortNewest ?? sortNewest;
    const currentLimit = override.limit ?? pageSize;
    setLoading(true);
    try {
      const res = await getAllMembers({
        page: pageNum,
        limit: currentLimit,
        status,
        search: search || undefined,
        sortBy: 'createdAt',
        sortDir: newest ? -1 : 1,
      });
      setMembers(res.data.members ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: currentLimit });
      if (res.data.stats) setStats(res.data.stats);
    } catch { toast.error('Failed to load members.'); }
    finally { setLoading(false); }
  }, [page, pageSize, filter, debouncedSearch, sortNewest]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch, sortNewest]);

  const handlePageSizeChange = (newSize, order) => {
    const valid = Math.max(1, Math.min(500, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    if (order === 'last') {
      setSortNewest(false);
    } else if (order === 'first') {
      setSortNewest(true);
    }
    setPage(1);
    try {
      localStorage.setItem('members_page_size', String(valid));
    } catch {
      // ignore
    }
  };

  const paginated = members;

  return (
    <Layout>
      <PageHeader walkthrough="members-header" title="Members">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={210} />
        {canAdd && <Btn size="sm" onClick={() => setShowAdd(true)}>+ Add Person</Btn>}
      </PageHeader>

      <div className="page-wrap" data-walkthrough="members-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {/* Stats */}
        <div className="grid-stats-5">
          <StatCard label="Total"   value={loading ? '—' : stats.total}   color="brand" />
          <StatCard label="Active"  value={loading ? '—' : stats.active}  color="success" />
          <StatCard label="Frozen"  value={loading ? '—' : stats.frozen}  color="info" />
          <StatCard label="Expired" value={loading ? '—' : stats.expired} color="danger" />
          <StatCard label="Guests"  value={loading ? '—' : stats.guest} />
        </div>

        {/* Toolbar row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <FilterTabs active={filter} onChange={setFilter} options={[
            { value: 'all',     label: `All (${stats.total})` },
            { value: 'active',  label: `Active (${stats.active})` },
            { value: 'frozen',  label: `Frozen (${stats.frozen})` },
            { value: 'expired', label: `Expired (${stats.expired})` },
            { value: 'guest',   label: `Guests (${stats.guest})` },
            { value: 'blocked', label: `Blocked (${stats.blocked ?? 0})` },
          ]} />
          <button
            onClick={() => setSortNewest(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${sortNewest ? 'var(--navy)' : 'var(--border)'}`,
              background: sortNewest ? 'color-mix(in srgb, var(--navy) 8%, transparent)' : 'transparent',
              color: sortNewest ? 'var(--navy)' : 'var(--t3)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M3 8l4-4 4 4M7 4v16M21 16l-4 4-4-4M17 20V4"/>
            </svg>
            {sortNewest ? 'Newest First' : 'Oldest First'}
          </button>
        </div>

        {/* Page size templates & filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 12 }}>
          <PageSizeFilter
            pageSize={pageSize}
            order={sortNewest ? 'first' : 'last'}
            onChange={handlePageSizeChange}
            options={PAGE_SIZE_OPTIONS}
          />
        </div>

        {/* Quick Single Transfer Card */}
        {canTransfer && (
          <Card style={{ padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                  Quick Transfer by System ID
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                  Directly transfer an individual member to a sales rep or coach by their System ID.
                </div>
              </div>

              <form onSubmit={handleQuickTransfer} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 auto', width: 190, minWidth: 150 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    System ID
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 12, color: 'var(--t4)', fontWeight: 700, fontSize: 13, pointerEvents: 'none' }}>
                      #
                    </span>
                    <input
                      value={quickId}
                      onChange={(e) => setQuickId(e.target.value)}
                      placeholder="e.g. 104"
                      style={{
                        width: '100%',
                        height: 38,
                        paddingLeft: 28,
                        paddingRight: 12,
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
                  </div>
                </div>

                <div style={{ flex: '1 1 260px', maxWidth: 420, minWidth: 220 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Assign Destination
                  </label>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--t1)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Select target staff member…</option>
                    <optgroup label="Sales Representatives">
                      {salesUsers.filter((u) => u.role === 'Sales').map((u) => (
                        <option key={u._id} value={u._id}>{u.name} (Sales)</option>
                      ))}
                    </optgroup>
                    <optgroup label="Coaches">
                      {coaches.map((c) => (
                        <option key={c._id} value={c._id}>{c.name} (Coach)</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={quickBusy || !quickId.trim() || !destId}
                    style={{
                      height: 38,
                      padding: '0 18px',
                      borderRadius: 8,
                      border: 'none',
                      background: !quickId.trim() || !destId || quickBusy ? 'var(--border)' : 'var(--navy, var(--navy))',
                      color: !quickId.trim() || !destId || quickBusy ? 'var(--t4)' : '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: !quickId.trim() || !destId || quickBusy ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {quickBusy ? <Spinner size="sm" /> : <><span>⚡</span> Quick Transfer</>}
                  </button>
                </div>
              </form>
            </div>
          </Card>
        )}

        {/* Table card */}
        <Card noPad>
          <Table loading={loading} skeletonRows={Math.min(pageSize, 8)}
            headers={['ID', 'Name', 'Status', 'Package', 'Expires', 'Sales Rep', '']}>
            {!paginated.length && !loading
              ? <tr><td colSpan={7}><EmptyState message="No members match your search" /></td></tr>
              : paginated.map(m => {
                  const sub = m.subscriptions?.at(-1);
                  const pkg = sub?.package;
                  const expiring = sub?.endDate && (new Date(sub.endDate) - new Date()) / 86400000 <= 7 && (new Date(sub.endDate) - new Date()) >= 0;
                  return (
                    <tr key={m._id} className="tbl-row" onClick={() => navigate(`/members/${m.systemId}`)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                        {formatSystemId(m.systemId)}{m.memberId ? ` / ${m.memberId}` : ''}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size="sm" photo={m.photo} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>
                        {pkg ? <span style={{ color: 'var(--t1)', fontWeight: 500 }}>{pkg.name}<br /><span style={{ color: 'var(--t4)', fontSize: 11 }}>{pkg.activityType} · {pkg.duration}</span></span> : <span style={{ color: 'var(--t4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: expiring ? 'var(--amber)' : 'var(--t3)', fontWeight: expiring ? 600 : 400 }}>
                        {fmtDate(sub?.endDate)}{expiring && <span style={{ display: 'block', fontSize: 10, color: 'var(--amber)' }}>Expiring soon</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                        {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <Btn variant="outline" size="xs" onClick={() => navigate(`/members/${m.systemId}`)}>View</Btn>
                      </td>
                    </tr>
                  );
                })}
          </Table>
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
      </div>

      {canAdd && (
        <AddMemberModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            setFilter('all');
            setSearch('');
            setSortNewest(true);
            setPage(1);
            fetchMembers({ status: 'all', page: 1, search: '', sortNewest: true });
          }}
        />
      )}
    </Layout>
  );
}

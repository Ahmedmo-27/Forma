import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import { PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState, SearchInput, Avatar, fmtDate, Pagination, Select, PageSizeFilter } from '../../components/ui';
import { formatSystemId } from '../../lib/systemId';
import { getAllMembers } from '../../api/endpoints';
import AddMemberModal from '../../components/AddMemberModal';
import { useTourReveal } from '../../tutorials/walkthrough-context';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export default function SalesMembers() {
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
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [sortNewest, setSortNewest] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: DEFAULT_PAGE_SIZE });
  const [stats, setStats] = useState({ total: 0, active: 0, frozen: 0, expired: 0, guest: 0 });
  const [showAdd,  setShowAdd]  = useState(false);
  useTourReveal('add-guest', () => setShowAdd(true), () => setShowAdd(false));
  const [extra, setExtra] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const fetchMembers = useCallback(async (override = {}) => {
    const status = override.status ?? filter;
    const pageNum = override.page ?? page;
    const search = override.search ?? debouncedSearch;
    const extraFilter = override.extra ?? extra;
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
        transferred: extraFilter === 'transferred' ? 'true' : undefined,
        recent: extraFilter === 'recent' ? 'true' : undefined,
        expiringSoon: extraFilter === 'expiring' ? 'true' : undefined,
        allMembers: extraFilter === 'all' ? 'true' : undefined,
      });
      setMembers(res.data.members ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: currentLimit });
      if (res.data.stats) setStats(res.data.stats);
    } catch { toast.error('Failed to load data.'); }
    finally { setLoading(false); }
  }, [page, pageSize, filter, debouncedSearch, extra, sortNewest]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch, extra, sortNewest]);

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
      <PageHeader walkthrough="sales-members-header" title="Members">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={200} />
        <span data-walkthrough="add-guest-btn">
          <Btn size="sm" onClick={() => setShowAdd(true)}>+ Add Guest</Btn>
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="sales-members-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{ maxWidth: 280, marginBottom: 12 }}>
          <Select label="More filters" value={extra} onChange={(e) => setExtra(e.target.value)}>
            <option value="">All of my members</option>
            <option value="all">Show all members</option>
            <option value="transferred">Transferred to me</option>
            <option value="recent">Added in the last 30 days</option>
            <option value="expiring">Expiring in 7 days</option>
          </Select>
        </div>

        <div className="grid-stats-5">
          <StatCard label="Total"   value={loading ? '—' : stats.total}   color="brand" />
          <StatCard label="Active"  value={loading ? '—' : stats.active}  color="success" />
          <StatCard label="Frozen"  value={loading ? '—' : stats.frozen}  color="info" />
          <StatCard label="Expired" value={loading ? '—' : stats.expired} color="danger" />
          <StatCard label="Guests"  value={loading ? '—' : stats.guest} />
        </div>

        <FilterTabs active={filter} onChange={setFilter} options={[
          { value: 'all',     label: `All (${stats.total})` },
          { value: 'active',  label: `Active (${stats.active})` },
          { value: 'frozen',  label: `Frozen (${stats.frozen})` },
          { value: 'expired', label: `Expired (${stats.expired})` },
          { value: 'guest',   label: `Guests (${stats.guest})` },
          { value: 'blocked', label: `Blocked (${stats.blocked ?? 0})` },
        ]} />

        {/* Page size templates & filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 12 }}>
          <PageSizeFilter
            pageSize={pageSize}
            order={sortNewest ? 'first' : 'last'}
            onChange={handlePageSizeChange}
            options={PAGE_SIZE_OPTIONS}
          />
        </div>

        <Card noPad>
          <Table loading={loading} skeletonRows={Math.min(pageSize, 8)} headers={['ID', 'Name', 'Status', 'Package', 'Expires', '']}>
            {!paginated.length && !loading
              ? <tr><td colSpan={6}><EmptyState message="No members found" /></td></tr>
              : paginated.map(m => {
                  const sub = m.subscriptions?.filter(s => !s.refunded && !s.cancelled && s.subscriptionStatus !== 'cancelled')?.at(-1);
                  const pkg = sub?.package;
                  return (
                    <tr key={m._id} className="tbl-row" onClick={() => navigate(`/members/${m.systemId}`)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{formatSystemId(m.systemId)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size="sm" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}><Badge status={m.isBlocked ? 'blocked' : m.status} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{pkg ? `${pkg.name} · ${pkg.duration}` : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{fmtDate(sub?.endDate)}</td>
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
        defaultSalesRep={user?._id}
      />
    </Layout>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import Layout from '../../components/Layout';
import { PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState, SearchInput, Avatar, fmtDate, Pagination, Select } from '../../components/ui';
import { formatSystemId } from '../../lib/systemId';
import { getAllMembers } from '../../api/endpoints';
import AddMemberModal from '../../components/AddMemberModal';

const PAGE_SIZE = 20;

export default function SalesMembers() {
  usePageTitle('Members');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [stats, setStats] = useState({ total: 0, active: 0, frozen: 0, expired: 0, guest: 0 });
  const [showAdd,  setShowAdd]  = useState(false);
  const [extra, setExtra] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const fetchMembers = useCallback(async (override = {}) => {
    const status = override.status ?? filter;
    const pageNum = override.page ?? page;
    const search = override.search ?? debouncedSearch;
    const extraFilter = override.extra ?? extra;
    setLoading(true);
    try {
      const res = await getAllMembers({
        page: pageNum,
        limit: PAGE_SIZE,
        status,
        search: search || undefined,
        sortBy: 'createdAt',
        sortDir: -1,
        transferred: extraFilter === 'transferred' ? 'true' : undefined,
        recent: extraFilter === 'recent' ? 'true' : undefined,
        expiringSoon: extraFilter === 'expiring' ? 'true' : undefined,
      });
      setMembers(res.data.members ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
      if (res.data.stats) setStats(res.data.stats);
    } catch { toast.error('Failed to load data.'); }
    finally { setLoading(false); }
  }, [page, filter, debouncedSearch, extra]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch, extra]);

  const paginated = members;

  return (
    <Layout>
      <PageHeader title="Members">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={200} />
        <Btn size="sm" onClick={() => setShowAdd(true)}>+ Add Guest</Btn>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{ maxWidth: 280, marginBottom: 12 }}>
          <Select label="More filters" value={extra} onChange={(e) => setExtra(e.target.value)}>
            <option value="">All of my members</option>
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
        ]} />

        <Card noPad>
          <Table loading={loading} skeletonRows={8} headers={['ID', 'Name', 'Status', 'Package', 'Expires', '']}>
            {!paginated.length && !loading
              ? <tr><td colSpan={6}><EmptyState message="No members found" /></td></tr>
              : paginated.map(m => {
                  const sub = m.subscriptions?.at(-1);
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
                      <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
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
              pageSize={pagination.limit ?? PAGE_SIZE}
              onPageChange={setPage}
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
          setPage(1);
          fetchMembers({ status: 'all', page: 1, search: '' });
        }}
        defaultSalesRep={user?._id}
      />
    </Layout>
  );
}

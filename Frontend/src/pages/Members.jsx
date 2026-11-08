import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import useDebounce from '../hooks/useDebounce';
import Layout from '../components/Layout';
import { PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState, SearchInput, Avatar, fmtDate, Pagination } from '../components/ui';
import { getAllMembers } from '../api/endpoints';
import AddMemberModal from '../components/AddMemberModal';
import { formatSystemId } from '../lib/systemId';

const PAGE_SIZE = 20;

export default function Members() {
  usePageTitle('Members');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [sortNewest, setSortNewest] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [stats, setStats]       = useState({ total: 0, active: 0, frozen: 0, expired: 0, guest: 0 });
  const [showAdd, setShowAdd]   = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const canAdd = ['Receptionist', 'Owner', 'Sales Manager'].includes(user?.role);

  const fetchMembers = useCallback(async (override = {}) => {
    const status = override.status ?? filter;
    const pageNum = override.page ?? page;
    const search = override.search ?? debouncedSearch;
    const newest = override.sortNewest ?? sortNewest;
    setLoading(true);
    try {
      const res = await getAllMembers({
        page: pageNum,
        limit: PAGE_SIZE,
        status,
        search: search || undefined,
        sortBy: 'createdAt',
        sortDir: newest ? -1 : 1,
      });
      setMembers(res.data.members ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
      if (res.data.stats) setStats(res.data.stats);
    } catch { toast.error('Failed to load members.'); }
    finally { setLoading(false); }
  }, [page, filter, debouncedSearch, sortNewest]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch, sortNewest]);

  const paginated = members;

  return (
    <Layout>
      <PageHeader title="Members">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, ID…" width={210} />
        {canAdd && <Btn size="sm" onClick={() => setShowAdd(true)}>+ Add Person</Btn>}
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
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

        {/* Table card */}
        <Card noPad>
          <Table loading={loading} skeletonRows={8}
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
              pageSize={pagination.limit ?? PAGE_SIZE}
              onPageChange={setPage}
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

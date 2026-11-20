import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import useDebounce from '../hooks/useDebounce';
import useLocationEffect from '../hooks/useLocationEffect';
import Layout from '../components/Layout';
import { PageHeader, Card, StatCard, Table, Badge, FilterTabs, Btn, EmptyState, SearchInput, Avatar, Pagination, PageSizeFilter } from '../components/ui';
import { getAllMembers } from '../api/endpoints';
import AddMemberModal from '../components/AddMemberModal';
import { formatSystemId } from '../lib/systemId';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export default function Members() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  usePageTitle(t('Members'));
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
    } catch { toast.error(t('Failed to load members.')); }
    finally { setLoading(false); }
  }, [page, pageSize, filter, debouncedSearch, sortNewest, t]);

  useLocationEffect(() => { fetchMembers(); }, [fetchMembers]);
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
      <PageHeader walkthrough="members-header" title={t('Members')}>
        <SearchInput value={search} onChange={setSearch} placeholder={t('Name, phone, ID…')} width={210} />
        {canAdd && <Btn size="sm" onClick={() => setShowAdd(true)}>+ {t('Add Person')}</Btn>}
      </PageHeader>

      <div className="page-wrap" data-walkthrough="members-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {/* Stats */}
        <div className="grid-stats-5">
          <StatCard label={t('Total')} value={loading ? '—' : stats.total}   color="brand" />
          <StatCard label={t('Active')} value={loading ? '—' : stats.active}  color="success" />
          <StatCard label={t('Frozen')} value={loading ? '—' : stats.frozen}  color="info" />
          <StatCard label={t('Expired')} value={loading ? '—' : stats.expired} color="danger" />
          <StatCard label={t('Guests')} value={loading ? '—' : stats.guest} />
        </div>

        {/* Toolbar row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <FilterTabs active={filter} onChange={setFilter} options={[
            { value: 'all',     label: t('All ({count})', { count: stats.total }) },
            { value: 'active',  label: t('Active ({count})', { count: stats.active }) },
            { value: 'frozen',  label: t('Frozen ({count})', { count: stats.frozen }) },
            { value: 'expired', label: t('Expired ({count})', { count: stats.expired }) },
            { value: 'guest',   label: t('Guests ({count})', { count: stats.guest }) },
            { value: 'blocked', label: t('Blocked ({count})', { count: stats.blocked ?? 0 }) },
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
            {sortNewest ? t('Newest First') : t('Oldest First')}
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

        {/* Table card */}
        <Card noPad>
          <Table loading={loading} skeletonRows={Math.min(pageSize, 8)}
            headers={[t('ID'), t('Name'), t('Status'), t('Package'), t('Expires'), t('Sales Rep'), '']}>
            {!paginated.length && !loading
              ? <tr><td colSpan={7}><EmptyState message={t('No members match your search')} /></td></tr>
              : paginated.map(m => {
                  const sub = m.subscriptions?.at(-1);
                  const pkg = sub?.package;
                  const expiring = sub?.endDate && (new Date(sub.endDate) - new Date()) / 86400000 <= 7 && (new Date(sub.endDate) - new Date()) >= 0;
                  return (
                    <tr key={m._id} className="tbl-row" onClick={() => navigate(`/members/${m.systemId}`)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{formatSystemId(m.systemId)}{m.memberId ? ` / ${m.memberId}` : ''}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size="sm" photo={m.photo} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>
                        {pkg ? <span style={{ color: 'var(--t1)', fontWeight: 500 }}>{pkg.name}<br /><span style={{ color: 'var(--t4)', fontSize: 11 }}>{t(pkg.activityType)} · {t(pkg.duration)}</span></span> : <span style={{ color: 'var(--t4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: expiring ? 'var(--amber)' : 'var(--t3)', fontWeight: expiring ? 600 : 400 }}>
                        {sub?.endDate ? fmtDate(sub.endDate, { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}{expiring && <span style={{ display: 'block', fontSize: 10, color: 'var(--amber)' }}>{t('Expiring soon')}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                        {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <Btn variant="outline" size="xs" onClick={() => navigate(`/members/${m.systemId}`)}>{t('View')}</Btn>
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

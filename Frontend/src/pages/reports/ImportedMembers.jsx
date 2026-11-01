import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Badge, Avatar, fmtDate, Btn, Pagination, SearchInput } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import { getAllMembers, getSalesUsers } from '../../api/endpoints';

const PAGE_SIZE = 25;
const TODAY       = new Date().toISOString().slice(0, 10);
const MONTH_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const selectStyle = {
  padding: '8px 32px 8px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

const inputStyle = {
  padding: '8px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', fontFamily: 'inherit',
};

export default function ImportedMembers() {
  usePageTitle('Imported Members');
  const navigate = useNavigate();

  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [page,       setPage]       = useState(1);

  // Filters
  const [search,      setSearch]      = useState('');
  const [salesMan,    setSalesMan]    = useState('all');
  const [status,      setStatus]      = useState('all');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [salesUsers,  setSalesUsers]  = useState([]);

  const debouncedSearch = useDebounce(search, 300);

  // Load sales users for filter
  useEffect(() => {
    getSalesUsers()
      .then(r => setSalesUsers(r.data.salesUsers ?? []))
      .catch(() => {});
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = {
        source: 'data entry',
        sortBy: 'createdAt',
        sortDir: -1,
        page,
        limit: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (salesMan !== 'all') params.assignedSales = salesMan;
      if (status !== 'all') params.status = status;

      const res = await getAllMembers(params);
      let data = res.data.members ?? [];

      // Always sort newest-first client-side as a guaranteed fallback
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Client-side date filter on createdAt
      if (dateFrom || dateTo) {
        const from = dateFrom ? new Date(dateFrom) : null;
        const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;
        data = data.filter(m => {
          const d = new Date(m.createdAt);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return true;
        });
      }

      setMembers(data);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: data.length, limit: PAGE_SIZE });
    } catch {
      toast.error('Failed to load imported members');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, salesMan, status, dateFrom, dateTo]);

  // Auto-load on mount
  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [debouncedSearch, salesMan, status, dateFrom, dateTo]);

  const hasFilters = search || salesMan !== 'all' || status !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setSalesMan('all');
    setStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <Layout>
      <PageHeader title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 13, fontFamily: 'inherit' }}>
            ← Reports
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>Imported Members</span>
        </div>
      }>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone…" width={220} />
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>

            {/* Date From */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>From Date</label>
              <input type="date" value={dateFrom} max={dateTo || TODAY}
                onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </div>

            {/* Date To */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>To Date</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} max={TODAY}
                onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </div>

            {/* Sales Rep */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sales Rep</label>
              <select value={salesMan} onChange={e => setSalesMan(e.target.value)} style={{ ...selectStyle, width: 180 }}>
                <option value="all">All Reps</option>
                <option value="unassigned">Unassigned</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...selectStyle, width: 150 }}>
                <option value="all">All</option>
                <option value="guest">Guest</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="frozen">Frozen</option>
              </select>
            </div>

            {/* Clear */}
            {hasFilters && (
              <div style={{ paddingBottom: 2 }}>
                <Btn variant="ghost" size="sm" onClick={clearFilters}>✕ Clear</Btn>
              </div>
            )}

            {/* Count */}
            <div style={{ marginLeft: 'auto', paddingBottom: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--t4)', fontWeight: 600 }}>
                {loading ? '…' : `${pagination.total} member${pagination.total !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Results table ────────────────────────────────────── */}
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              Imported Members
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'rgba(68,41,140,0.10)', color: '#44298C', padding: '2px 8px', borderRadius: 5 }}>
                source: data entry
              </span>
            </span>
            <Btn variant="outline" size="xs" onClick={() => navigate('/sales/import')}>
              + Import More
            </Btn>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spinner size="lg" />
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon="📥"
              message="No imported members found"
              sub={hasFilters ? 'Try adjusting your filters.' : 'Import an Excel file to add members.'}
            />
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Name', 'Phone', 'Status', 'Sales Rep', 'Imported On'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m._id} className="tbl-row"
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => navigate(`/members/${m.systemId}`)}>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>
                          #{m.systemId}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={m.name} size="sm" photo={m.photo} />
                            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}>
                          {m.phones || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge status={m.status} />
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                          {m.assignedSales?.name
                            ? <span>{m.assignedSales.name}</span>
                            : <span style={{ color: 'var(--t4)', fontStyle: 'italic' }}>Unassigned</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {fmtDate(m.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.limit ?? PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}

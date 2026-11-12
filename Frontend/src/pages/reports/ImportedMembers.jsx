import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Badge, Avatar, fmtDate, Btn, SearchInput, toLocalDateString, parseDateBoundary, formatSystemId } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import { getAllMembers, getSalesUsers } from '../../api/endpoints';

const PAGE_SIZE = 25;
const TODAY = toLocalDateString();

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

  // Raw data — all imported members fetched once
  const [allMembers, setAllMembers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);

  // Filters
  const [search,     setSearch]     = useState('');
  const [salesMan,   setSalesMan]   = useState('all');
  const [status,     setStatus]     = useState('all');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [salesUsers, setSalesUsers] = useState([]);

  const debouncedSearch = useDebounce(search, 300);

  // Load ALL imported members once, sort newest first
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllMembers({ source: 'data entry', limit: 5000, page: 1 });
      const data = (res.data.members ?? [])
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllMembers(data);
    } catch {
      toast.error('Failed to load imported members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    getSalesUsers()
      .then(r => setSalesUsers(r.data.salesUsers ?? []))
      .catch(() => {});
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, salesMan, status, dateFrom, dateTo]);

  // Apply all filters client-side
  const filtered = useMemo(() => {
    const from = parseDateBoundary(dateFrom, false);
    const to   = parseDateBoundary(dateTo, true);
    const q    = debouncedSearch.trim().toLowerCase();

    return allMembers.filter(m => {
      if (salesMan !== 'all') {
        if (String(m.assignedSales?._id ?? m.assignedSales) !== salesMan) return false;
      }
      if (status === 'blocked') {
        if (!m.isBlocked) return false;
      } else if (status !== 'all') {
        if (m.isBlocked) return false;
        if (String(m.status).toLowerCase() !== status.toLowerCase()) return false;
      }
      if (from && new Date(m.createdAt) < from) return false;
      if (to   && new Date(m.createdAt) > to)   return false;
      if (q) {
        const sId = String(m.systemId ?? '').toLowerCase();
        const fId = formatSystemId(m.systemId).toLowerCase();
        const mId = String(m.memberId ?? '').toLowerCase();
        const match =
          m.name?.toLowerCase().includes(q) ||
          m.phones?.toLowerCase().includes(q) ||
          sId.includes(q) ||
          fId.includes(q) ||
          mId.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allMembers, debouncedSearch, salesMan, status, dateFrom, dateTo]);

  // Paginate the filtered results
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasFilters = search || salesMan !== 'all' || status !== 'all' || dateFrom || dateTo;

  return (
    <Layout>
      <PageHeader walkthrough="imported-header" title={
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

      <div className="page-wrap" data-walkthrough="imported-board" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>From Date</label>
              <input type="date" value={dateFrom} max={dateTo || TODAY}
                onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>To Date</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} max={TODAY}
                onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 160px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sales Rep</label>
              <select value={salesMan} onChange={e => setSalesMan(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                <option value="all">All Reps</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...selectStyle, width: 140 }}>
                <option value="all">All</option>
                <option value="guest">Guest</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="frozen">Frozen</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            {hasFilters && (
              <div style={{ paddingBottom: 2 }}>
                <Btn variant="ghost" size="sm" onClick={() => { setSearch(''); setSalesMan('all'); setStatus('all'); setDateFrom(''); setDateTo(''); }}>
                  ✕ Clear
                </Btn>
              </div>
            )}

            <div style={{ marginLeft: 'auto', paddingBottom: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--t4)', fontWeight: 600 }}>
                {loading ? '…' : `${filtered.length} member${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Table ───────────────────────────────────────────── */}
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              Imported Members
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'color-mix(in srgb, var(--navy) 10%, transparent)', color: 'var(--navy)', padding: '2px 8px', borderRadius: 5 }}>
                newest first
              </span>
            </span>
            <Btn variant="outline" size="xs" onClick={() => navigate('/sales/import')}>+ Import More</Btn>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="📥" message="No imported members found"
              sub={hasFilters ? 'Try adjusting your filters.' : 'Import an Excel file to add members.'} />
          ) : (
            <>
              <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Name', 'Phone', 'Status', 'Sales Rep', 'Imported On'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(m => (
                      <tr key={m._id} className="tbl-row"
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => navigate(`/members/${m.systemId}`)}>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>#{m.systemId}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={m.name} size="sm" photo={m.photo} />
                            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}>{m.phones || '—'}</td>
                        <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                          {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t4)' }}>
                    {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="outline" size="xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
                    <span style={{ fontSize: 12, color: 'var(--t3)', padding: '0 8px', lineHeight: '28px' }}>{safePage} / {totalPages}</span>
                    <Btn variant="outline" size="xs" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}

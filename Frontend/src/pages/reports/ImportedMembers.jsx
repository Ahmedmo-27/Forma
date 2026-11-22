import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, EmptyState, Badge, Avatar, Btn, SearchInput, toLocalDateString, parseDateBoundary, formatSystemId, Table, MenuSelect } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import useDebounce from '../../hooks/useDebounce';
import useLocationEffect from '../../hooks/useLocationEffect';
import { getAllMembers, getSalesUsers } from '../../api/endpoints';
import { Download, X } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import { SHORT_DATE } from './analyticsFormat';
import { fetchAllMembersByParams } from '../../lib/memberReportFilters';

const PAGE_SIZE = 25;
const TODAY = toLocalDateString();
const HEADERS = ['#', tr('Name'), tr('Phone'), tr('Status'), tr('Sales Rep'), tr('Imported On')];

const inputStyle = {
  padding: '8px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', fontFamily: 'inherit',
};

export default function ImportedMembers() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  usePageTitle(t('Imported Members'));
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
      const data = await fetchAllMembersByParams(getAllMembers, {
        source: 'data entry',
        sortBy: 'createdAt',
        sortDir: -1,
      });
      setAllMembers(data);
    } catch {
      toast.error(t('Failed to load imported members'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLocationEffect(() => { fetchAll(); }, [fetchAll]);

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
  const headers = HEADERS.map(h => t(h));

  return (
    <Layout>
      <PageHeader walkthrough="imported-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 13, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="rtl-flip" aria-hidden>←</span> {t('Reports')}
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{t('Imported Members')}</span>
        </div>
      }>
        <SearchInput value={search} onChange={setSearch} placeholder={t('Search name or phone…')} width={220} />
      </PageHeader>

      <div className="page-wrap" data-walkthrough="imported-board" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('From Date')}</label>
              <input type="date" value={dateFrom} max={dateTo || TODAY}
                onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('To Date')}</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} max={TODAY}
                onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 160px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('Sales Rep')}</label>
              <MenuSelect value={salesMan} onChange={e => setSalesMan(e.target.value)} style={{ width: '100%' }} aria-label={t('Sales Rep')}>
                <option value="all">{t('All Reps')}</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </MenuSelect>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('Status')}</label>
              <MenuSelect value={status} onChange={e => setStatus(e.target.value)} style={{ width: 140 }} aria-label={t('Status')}>
                <option value="all">{t('All')}</option>
                <option value="guest">{t('Guest')}</option>
                <option value="active">{t('Active')}</option>
                <option value="expired">{t('Expired')}</option>
                <option value="frozen">{t('Frozen')}</option>
                <option value="blocked">{t('Blocked')}</option>
              </MenuSelect>
            </div>

            {hasFilters && (
              <div style={{ paddingBottom: 2 }}>
                {/* i18n-ignore: setStatus('all') resets a filter value */}
                <Btn variant="ghost" size="sm" onClick={() => { setSearch(''); setSalesMan('all'); setStatus('all'); setDateFrom(''); setDateTo(''); }}>
                  <X size={14} aria-hidden /> {t('Clear')}
                </Btn>
              </div>
            )}

            <div style={{ marginInlineStart: 'auto', paddingBottom: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--t4)', fontWeight: 600 }}>
                {loading ? '…' : filtered.length === 1 ? t('1 member') : t('{count} members', { count: filtered.length })}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Table ───────────────────────────────────────────── */}
        <Card noPad>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              {t('Imported Members')}
              <span style={{ marginInlineStart: 8, fontSize: 11, fontWeight: 600, background: 'color-mix(in srgb, var(--navy) 10%, transparent)', color: 'var(--navy)', padding: '2px 8px', borderRadius: 5 }}>
                {t('newest first')}
              </span>
            </span>
            <Btn variant="outline" size="xs" onClick={() => navigate('/sales/import')}>{t('+ Import More')}</Btn>
          </div>

          {loading ? (
            <Table loading skeletonRows={8} headers={headers} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Download} message={t('No imported members found')}
              sub={hasFilters ? t('Try adjusting your filters.') : t('Import a CSV file to add members.')} />
          ) : (
            <>
              <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {HEADERS.map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', whiteSpace: 'nowrap' }}>{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(m => (
                      <tr key={m._id} className="tbl-row"
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => navigate(`/members/${m.systemId}`)}>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}><span dir="ltr">#{m.systemId}</span></td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={m.name} size="sm" photo={m.photo} />
                            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}><span dir="ltr">{m.phones || '—'}</span></td>
                        <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                          {m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{m.createdAt ? fmtDate(m.createdAt, SHORT_DATE) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t4)' }}>
                    {t('{start}–{end} of {total}', {
                      start: (safePage - 1) * PAGE_SIZE + 1,
                      end: Math.min(safePage * PAGE_SIZE, filtered.length),
                      total: filtered.length,
                    })}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="outline" size="xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}><span className="rtl-flip" style={{ display: 'inline-block' }} aria-hidden>←</span> {t('Prev')}</Btn>
                    <span dir="ltr" style={{ fontSize: 12, color: 'var(--t3)', padding: '0 8px', lineHeight: '28px' }}>{safePage} / {totalPages}</span>
                    <Btn variant="outline" size="xs" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>{t('Next')} <span className="rtl-flip" style={{ display: 'inline-block' }} aria-hidden>→</span></Btn>
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

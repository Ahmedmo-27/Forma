import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, EmptyState, Pagination, Avatar, toLocalDateString, Table, MenuSelect } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { getAllMembers, getSalesUsers, getCoachTeam, getPackages } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import { SHORT_DATE } from './analyticsFormat';
import {
  buildExpiredReportApiParams,
  applyExpiredReportExtraFilters,
  fetchAllMembersByParams,
  latestSubscriptionForReport,
} from '../../lib/memberReportFilters';

const TODAY       = toLocalDateString();
const MONTH_START = `${TODAY.slice(0, 7)}-01`;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const HEADERS = ['#', tr('Name'), tr('Phone'), tr('Package'), tr('Expired'), tr('Sales Rep'), tr('Trainer'), tr('Renewal'), tr('Gender')];
const ACTIVITY_LABELS = {
  gym: tr('Gym'),
  crossfit: tr('Crossfit'),
  box: tr('Box'),
  mma: tr('MMA'),
  kickboxing: tr('Kickboxing'),
  calisthenics: tr('Calisthenics'),
};
const GENDER_LABELS = { male: tr('Male'), female: tr('Female') };

// ── Reusable filter row ───────────────────────────────────────────────────────
function FilterRow({ label, required, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <label style={{ width: 120, flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginInlineStart: 2 }}>*</span>}
      </label>
      <div style={{ flex: '1 1 220px', maxWidth: 380 }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--t1)',
  outline: 'none', fontFamily: 'inherit',
};

export default function ExpiredMembers() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  usePageTitle(t('Members'));
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── filters ───────────────────────────────────────────────────────────────
  const [fromDate,    setFromDate]    = useState(MONTH_START);
  const [toDate,      setToDate]      = useState(TODAY);
  const [salesMan,    setSalesMan]    = useState('All');
  const [trainerName, setTrainerName] = useState('All');
  const [packageId,   setPackageId]   = useState('All');
  const [type,        setType]        = useState('All');
  const [status,      setStatus]      = useState('All');
  const [categories,  setCategories]  = useState('All');
  const [gender,      setGender]      = useState('All');

  // ── dropdown data ─────────────────────────────────────────────────────────
  const [salesUsers, setSalesUsers] = useState([]);
  const [coaches,    setCoaches]    = useState([]);
  const [packages,   setPackages]   = useState([]);

  // ── results ───────────────────────────────────────────────────────────────
  const [results,   setResults]   = useState([]);
  const [searched,  setSearched]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  // ── pagination state ──────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('members_report_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedResults = useMemo(() => {
    const start = (page - 1) * pageSize;
    return results.slice(start, start + pageSize);
  }, [results, page, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('members_report_page_size', String(valid));
    } catch {}
  };

  // ── load dropdowns ────────────────────────────────────────────────────────
  useEffect(() => {
    // Sales reps only see themselves in the Sales Man dropdown
    if (user?.role === 'Sales') {
      setSalesUsers([{ _id: user._id, name: user.name }]);
      setSalesMan(user._id);
    } else {
      getSalesUsers()
        .then(r => setSalesUsers(r.data.salesUsers ?? []))
        .catch(() => {});
    }
    getCoachTeam()
      .then(r => setCoaches((r.data.team ?? []).filter(u => ['Coach', 'Head Coach'].includes(u.role))))
      .catch(() => {});
    getPackages({ limit: 200 })
      .then(r => setPackages(r.data.packages ?? []))
      .catch(() => {});
  }, [user]);

  // ── search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setPage(1);
    try {
      const params = buildExpiredReportApiParams({
        status,
        fromDate,
        toDate,
        salesMan,
        trainerName,
        packageId,
        gender,
      });

      let members = await fetchAllMembersByParams(getAllMembers, params);
      members = applyExpiredReportExtraFilters(members, { type, categories });

      setResults(members);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, salesMan, trainerName, packageId, type, status, gender, categories]);

  const ACTIVITY_TYPES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
  const headers = HEADERS.map(h => t(h));

  return (
    <Layout>
      <PageHeader walkthrough="records-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <span className="rtl-flip" aria-hidden>←</span> {t('Reports')}
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{t('Members')}</span>
        </div>
      } />

      <div className="page-wrap" data-walkthrough="records-board" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Filter card ──────────────────────────────────────── */}
        <Card>
          {/* Heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('Members')}</span>
          </div>

          <div style={{ maxWidth: 540 }}>

            {/* From Date */}
            <FilterRow label={t('From Date')} required>
              <input type="date" value={fromDate} max={toDate || TODAY}
                onChange={e => setFromDate(e.target.value)} style={inputStyle} />
            </FilterRow>

            {/* To Date */}
            <FilterRow label={t('To Date')} required>
              <input type="date" value={toDate} min={fromDate} max={TODAY}
                onChange={e => setToDate(e.target.value)} style={inputStyle} />
            </FilterRow>

            {/* Sales Man */}
            <FilterRow label={t('Sales Man')}>
              <MenuSelect value={salesMan} onChange={e => setSalesMan(e.target.value)} style={{ width: '100%' }} aria-label={t('Sales Man')}>
                <option value="All">{t('All')}</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </MenuSelect>
            </FilterRow>

            {/* Trainer Name */}
            <FilterRow label={t('Trainer Name')}>
              <MenuSelect value={trainerName} onChange={e => setTrainerName(e.target.value)} style={{ width: '100%' }} aria-label={t('Trainer Name')}>
                <option value="All">{t('All')}</option>
                {coaches.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </MenuSelect>
            </FilterRow>

            {/* Package */}
            <FilterRow label={t('Package')}>
              <MenuSelect value={packageId} onChange={e => setPackageId(e.target.value)} style={{ width: '100%' }} aria-label={t('Package')}>
                <option value="All">{t('All')}</option>
                {packages.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </MenuSelect>
            </FilterRow>

            {/* Type (activity type) */}
            <FilterRow label={t('Type')}>
              <MenuSelect value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }} aria-label={t('Type')}>
                <option value="All">{t('All')}</option>
                {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{t(ACTIVITY_LABELS[a])}</option>)}
              </MenuSelect>
            </FilterRow>

            {/* Status */}
            <FilterRow label={t('Status')}>
              <MenuSelect value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%' }} aria-label={t('Status')}>
                <option value="All">{t('All')}</option>
                <option value="expired">{t('Expired')}</option>
                <option value="active">{t('Active')}</option>
                <option value="frozen">{t('Frozen')}</option>
              </MenuSelect>
            </FilterRow>

            {/* Categories */}
            <FilterRow label={t('Categories')}>
              <MenuSelect value={categories} onChange={e => setCategories(e.target.value)} style={{ width: '100%' }} aria-label={t('Categories')}>
                <option value="All">{t('All')}</option>
                <option value="Primary Membership">{t('Primary Membership')}</option>
                <option value="PT">{t('PT Sessions')}</option>
              </MenuSelect>
            </FilterRow>

            {/* Male / Female */}
            <FilterRow label={t('Male / Female')}>
              <MenuSelect value={gender} onChange={e => setGender(e.target.value)} style={{ width: '100%' }} aria-label={t('Male or Female')}>
                <option value="All">{t('All')}</option>
                <option value="male">{t('Male')}</option>
                <option value="female">{t('Female')}</option>
              </MenuSelect>
            </FilterRow>

          </div>

          {/* Search */}
          <div style={{ marginTop: 8 }}>
            <Btn onClick={handleSearch} disabled={loading} size="md">
              {loading ? <><Spinner size="sm" /> {t('Searching…')}</> : t('Search')}
            </Btn>
          </div>
        </Card>

        {/* ── Results ─────────────────────────────────────────── */}
        {searched && (
          <Card noPad>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t('Results')}</span>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>
                {loading ? '…' : results.length === 1 ? t('1 member found') : t('{count} members found', { count: results.length })}
              </span>
            </div>

            {loading ? (
              <Table loading skeletonRows={8} headers={headers} />
            ) : results.length === 0 ? (
              <EmptyState icon={Calendar} message={t('No members found')} sub={t('Try adjusting your filters.')} />
            ) : (
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
                    {paginatedResults.map(m => {
                      const lastSub = latestSubscriptionForReport(m);
                      const pkg = lastSub?.packageSnapshot ?? lastSub?.package;
                      const genderKey = String(m.gender ?? '').toLowerCase();
                      const memberCode = `M${m.memberId}`;
                      return (
                        <tr key={m._id} className="tbl-row"
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => navigate(`/members/${m.systemId}`)}>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}><span dir="ltr">#{m.systemId}</span></td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={m.name} size="sm" photo={m.photo} />
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                                {m.memberId && <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}><span dir="ltr">{memberCode}</span></div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 12 }}><span dir="ltr">{m.phones || '—'}</span></td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{pkg?.name ?? '—'}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {lastSub?.endDate
                              ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtDate(lastSub.endDate, SHORT_DATE)}</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.current_couch?.name ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {lastSub?.isRenewal
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-bd)', padding: '2px 8px', borderRadius: 5 }}>{t('ON')}</span>
                              : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 5 }}>{t('OFF')}</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--t3)', textTransform: 'capitalize' }}>{GENDER_LABELS[genderKey] ? t(GENDER_LABELS[genderKey]) : (m.gender ?? '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && results.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={results.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </Card>
        )}

      </div>
    </Layout>
  );
}

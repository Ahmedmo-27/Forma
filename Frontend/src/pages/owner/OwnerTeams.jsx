import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Pagination } from '../../components/ui';
import { getSalesTeam, getCoachTeam } from '../../api/endpoints';
import api from '../../api/axios';
import { tr } from '../../i18n/translate';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48];

const TABS = [
  { id: 'sales',        label: tr('Sales') },
  { id: 'coach',        label: tr('Coach') },
  { id: 'accountant',   label: tr('Accountant') },
  { id: 'receptionist', label: tr('Receptionist') },
];

export default function OwnerTeams() {
  const { t } = useI18n();
  usePageTitle(t('All Teams'));
  const navigate = useNavigate();

  const [tab, setTab]               = useState('sales');
  const [salesTeam, setSalesTeam]   = useState([]);
  const [coachTeam, setCoachTeam]   = useState([]);
  const [accountants, setAccountants] = useState([]);
  const [receptionists, setReceptionists] = useState([]);
  const [loading, setLoading]       = useState(true);

  // Pagination
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('owner_teams_page_size'), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stRes, ctRes, staffRes] = await Promise.allSettled([
        getSalesTeam(),
        getCoachTeam(),
        api.get('/users/receptionists'),
      ]);

      if (stRes.status === 'fulfilled') setSalesTeam(stRes.value.data.team ?? []);
      if (ctRes.status === 'fulfilled') setCoachTeam(ctRes.value.data.team ?? []);

      if (staffRes.status === 'fulfilled') {
        const all = staffRes.value.data.receptionists ?? [];
        setReceptionists(all.filter(u => u.role === 'Receptionist'));
        setAccountants(all.filter(u => u.role === 'Accountant'));
      }
    } catch {
      toast.error(t('Failed to load team data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLocationEffect(() => { load(); }, [load]);
  useLocationEffect(() => { setPage(1); }, []);

  const currentList = useMemo(() => ({
    sales:        salesTeam,
    coach:        coachTeam,
    accountant:   accountants,
    receptionist: receptionists,
  }[tab] ?? []), [tab, salesTeam, coachTeam, accountants, receptionists]);

  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return currentList.slice(start, start + pageSize);
  }, [currentList, page, pageSize]);

  const handlePageSizeChange = (newSize) => {
    const valid = Math.max(1, Math.min(100, parseInt(newSize, 10) || DEFAULT_PAGE_SIZE));
    setPageSize(valid);
    setPage(1);
    try {
      localStorage.setItem('owner_teams_page_size', String(valid));
    } catch {}
  };

  const counts = {
    sales:        salesTeam.length,
    coach:        coachTeam.length,
    accountant:   accountants.length,
    receptionist: receptionists.length,
  };

  const tabLabel = (id) => {
    const base = TABS.find(x => x.id === id)?.label;
    return t('{label} ({count})', { label: base ? t(base) : id, count: counts[id] ?? 0 });
  };

  return (
    <Layout>
      <PageHeader walkthrough="teams-header" title={t('All Teams')} />

      <div className="page-wrap" data-walkthrough="teams-board" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Summary strip ────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 20,
        }}>
          {TABS.map(x => (
            <div key={x.id}
              onClick={() => setTab(x.id)}
              style={{
                background: tab === x.id ? 'var(--navy)' : 'var(--card)',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: tab === x.id ? 'rgba(255,255,255,0.6)' : 'var(--t4)', marginBottom: 4 }}>
                {t(x.label)}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: tab === x.id ? '#fff' : 'var(--t1)' }}>
                {loading ? '—' : counts[x.id]}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ──────────────────────────────────────── */}
        <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)} style={{
              padding: '8px 18px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === x.id ? 'var(--navy)' : 'transparent'}`,
              marginBottom: -1,
              color: tab === x.id ? 'var(--t1)' : 'var(--t3)',
              fontSize: 13, fontWeight: tab === x.id ? 700 : 400,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
              onMouseEnter={e => { if (tab !== x.id) e.currentTarget.style.color = 'var(--t2)'; }}
              onMouseLeave={e => { if (tab !== x.id) e.currentTarget.style.color = 'var(--t3)'; }}
            >
              {tabLabel(x.id)}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spinner size="lg" />
          </div>
        ) : currentList.length === 0 ? (
          <EmptyState message={t('No {label} members found', { label: t(TABS.find(x => x.id === tab)?.label ?? '') })} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
              {paginatedList.map(member => (
                <UserCard
                  key={member._id}
                  member={member}
                  tab={tab}
                  onClick={() => navigate(`/owner/teams/${member._id}`)}
                />
              ))}
            </div>

            <div style={{ marginTop: 16, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Pagination
                page={page}
                totalPages={totalPages}
                total={currentList.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ── User card ─────────────────────────────────────────────────────────────────
function UserCard({ member, tab, onClick }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const stats = member.stats;
  const pct = (tab === 'sales' && member.monthlyTarget > 0 && stats?.monthlyRevenue != null)
    ? Math.min(100, Math.round((stats.monthlyRevenue / member.monthlyTarget) * 100))
    : null;

  const getRoleStyle = (role = '') => {
    const r = role.toLowerCase();
    if (r.includes('sales')) {
      return { bg: 'rgba(68, 41, 140, 0.07)', color: 'var(--navy)', bd: 'rgba(68, 41, 140, 0.16)' };
    }
    if (r.includes('coach')) {
      return { bg: 'rgba(2, 132, 199, 0.08)', color: '#0284c7', bd: 'rgba(2, 132, 199, 0.20)' };
    }
    if (r.includes('reception')) {
      return { bg: 'var(--green-bg)', color: 'var(--green)', bd: 'var(--green-bd)' };
    }
    if (r.includes('account')) {
      return { bg: 'var(--amber-bg)', color: 'var(--amber)', bd: 'var(--amber-bd)' };
    }
    return { bg: 'var(--bg)', color: 'var(--t2)', bd: 'var(--border)' };
  };

  const roleStyle = getRoleStyle(member.role);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'rgba(68, 41, 140, 0.35)';
        e.currentTarget.style.boxShadow = '0 10px 24px -4px rgba(68, 41, 140, 0.10), 0 4px 8px -2px rgba(0, 0, 0, 0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = document.documentElement.dir === 'rtl' ? 'translateX(-2px)' : 'translateX(2px)';
          arrow.style.color = 'var(--navy)';
          arrow.style.background = 'rgba(68, 41, 140, 0.08)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
        const arrow = e.currentTarget.querySelector('.card-chevron');
        if (arrow) {
          arrow.style.transform = 'translateX(0)';
          arrow.style.color = 'var(--t4)';
          arrow.style.background = 'var(--bg)';
        }
      }}
    >
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: stats ? 12 : 6 }}>
          <Avatar name={member.name} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: 'var(--t1)',
              marginBottom: 4,
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {member.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: roleStyle.color,
                background: roleStyle.bg,
                border: `1px solid ${roleStyle.bd}`,
                padding: '2px 8px',
                borderRadius: 999,
                letterSpacing: '0.2px',
              }}>
                {t(member.role)}
              </span>
            </div>
          </div>

          <div
            className="card-chevron"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--t4)',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <svg className="rtl-flip" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>

        {/* Contact info for roles without rich stats */}
        {(!stats || (tab !== 'sales' && tab !== 'coach')) && (member.email || member.mobile_number) && (
          <div style={{
            background: 'var(--bg)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 6,
          }}>
            {member.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span dir="ltr" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email}</span>
              </div>
            )}
            {member.mobile_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--navy)', fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span dir="ltr" style={{ fontFamily: 'monospace' }}>{member.mobile_number}</span>
              </div>
            )}
          </div>
        )}

        {/* Sales stats panel */}
        {tab === 'sales' && stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            background: 'var(--bg)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {[
              { l: tr('Active'),  v: stats.active,  c: 'var(--green)' },
              { l: tr('Frozen'),  v: stats.frozen,  c: 'var(--sky)' },
              { l: tr('Expired'), v: stats.expired, c: 'var(--red)' },
              { l: tr('Guests'),  v: stats.guests,  c: 'var(--slate)' },
            ].map((s, idx) => (
              <div
                key={s.l}
                style={{
                  padding: '8px 2px',
                  textAlign: 'center',
                  borderInlineEnd: idx < 3 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  fontSize: 15.5,
                  fontWeight: 800,
                  color: s.c,
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.v ?? 0}
                </div>
                <div style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: 'var(--t4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginTop: 3,
                }}>
                  {t(s.l)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coach stats panel */}
        {tab === 'coach' && stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            background: 'var(--bg)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {[
              { l: tr('Members'),     v: stats.total,           c: 'var(--navy)' },
              { l: tr('Active'),      v: stats.active,          c: 'var(--green)' },
              { l: tr('PT Total'),    v: stats.totalPTSessions, c: 'var(--sky)' },
              { l: tr('PT Used'),     v: stats.usedPTSessions,  c: 'var(--amber)' },
            ].map((s, idx) => (
              <div
                key={s.l}
                style={{
                  padding: '8px 2px',
                  textAlign: 'center',
                  borderInlineEnd: idx < 3 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  fontSize: 15.5,
                  fontWeight: 800,
                  color: s.c,
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.v ?? 0}
                </div>
                <div style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: 'var(--t4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginTop: 3,
                }}>
                  {t(s.l)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly target progress (Sales) */}
      {pct !== null && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('Monthly Target')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>
                {t('EGP {amount}', { amount: fmtNumber(stats.monthlyRevenue) })}
                <span style={{ color: 'var(--t4)', fontWeight: 500, fontSize: 10.5 }}> / {fmtNumber(member.monthlyTarget)}</span>
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 999,
                background: pct >= 100 ? 'var(--green-bg)' : pct >= 50 ? 'color-mix(in srgb, var(--navy) 8%, transparent)' : 'var(--amber-bg)',
                color: pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--navy)' : 'var(--amber)',
                border: `1px solid ${pct >= 100 ? 'var(--green-bd)' : pct >= 50 ? 'color-mix(in srgb, var(--navy) 20%, transparent)' : 'var(--amber-bd)'}`,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {pct}%
              </span>
            </div>
          </div>

          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, pct))}%`,
              background: pct >= 100
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : pct >= 50
                  ? 'linear-gradient(90deg, #6366f1, var(--navy))'
                  : 'linear-gradient(90deg, #f59e0b, #d97706)',
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
